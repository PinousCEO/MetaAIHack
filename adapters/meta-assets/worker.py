"""Depth's own worker API for official Meta Chameleon and SAM 3D inference.

Requires the separately installed official model environment and approved weights.
No fallback generator, downloads, shell execution, or placeholder output.
"""
import argparse
import base64
import hmac
import importlib.util
import io
import json
import os
from pathlib import Path
import sys
import threading
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

PROTOCOL = "depth-meta-assets/v1"
MAX_REQUEST = 24 * 1024 * 1024


class Generator:
    def __init__(self, config):
        self.config = config
        self.model = None

    def check(self):
        kind = self.config["kind"]
        if kind == "image":
            paths = ("model", "tokenizer", "vqganConfig", "vqganCheckpoint")
            package = "chameleon"
        elif kind == "object3d":
            paths = ("repository", "pipeline")
            package = "sam3d_objects"
            if sys.platform != "linux":
                raise RuntimeError("Use the official SAM 3D Linux CUDA environment.")
        else:
            raise ValueError("kind must be image or object3d")
        for name in paths:
            if not Path(self.config[name]).is_absolute() or not Path(self.config[name]).exists():
                raise ValueError(f"Missing absolute model path: {name}")
        if importlib.util.find_spec(package) is None:
            raise RuntimeError(f"Install the official {package} environment before starting this worker.")

    def generate(self, request):
        if request.get("protocol") != PROTOCOL or request.get("kind") != self.config["kind"]:
            raise ValueError("Request protocol or generator kind does not match this worker.")
        seed = request.get("seed", 42)
        if not isinstance(seed, int) or not 0 <= seed <= 2147483647:
            raise ValueError("seed must be a nonnegative 32-bit integer")
        from PIL import Image
        if self.config["kind"] == "image":
            prompt = request.get("prompt", "")
            if not isinstance(prompt, str) or not prompt.strip() or len(prompt) > 4000:
                raise ValueError("Supply an image prompt of 1–4000 characters.")
            from chameleon.inference.chameleon import ChameleonInferenceModel, Options
            if self.model is None:
                self.model = ChameleonInferenceModel(
                    self.config["model"], self.config["tokenizer"],
                    self.config["vqganConfig"], self.config["vqganCheckpoint"])
            tokens = self.model.generate(prompt_text=prompt, options=Options(txt=False, img=True, seed=seed))
            # An image is 1024 image tokens; never pad a truncated generation into a success.
            if tokens.ndim != 2 or tokens.shape[0] != 1 or tokens.shape[1] != 1024:
                raise RuntimeError("Chameleon did not produce one complete image token sequence.")
            images = self.model.decode_image(tokens)
            output = io.BytesIO()
            images[0].save(output, format="PNG")
            model, format_name = "chameleon", "png"
            data = output.getvalue()
        else:
            import numpy as np
            def decode(name, mode):
                data = base64.b64decode(request.get(name, ""), validate=True)
                if not data or len(data) > 8 * 1024 * 1024:
                    raise ValueError("Each image/mask must be at most 8 MiB.")
                with Image.open(io.BytesIO(data)) as image:
                    if image.width * image.height > 16777216:
                        raise ValueError("Input exceeds 16 megapixels.")
                    return np.array(image.convert(mode))
            image = decode("imageBase64", "RGB")
            mask = decode("maskBase64", "L") > 127
            if image.shape[:2] != mask.shape or not mask.any():
                raise ValueError("Provide a nonempty white foreground mask matching the image dimensions.")
            if self.model is None:
                sys.path.insert(0, str(Path(self.config["repository"]) / "notebook"))
                from inference import Inference
                self.model = Inference(self.config["pipeline"], compile=False)
            result = self.model(image, mask, seed=seed)
            if result.get("glb") is None:
                raise RuntimeError("SAM 3D returned no mesh; no placeholder will be exported.")
            data = result["glb"].export(file_type="glb")
            model, format_name = "sam-3d-objects", "glb"
        if len(data) > 64 * 1024 * 1024:
            raise RuntimeError("Generated asset exceeds 64 MiB.")
        return {"protocol": PROTOCOL, "provider": "meta", "model": model,
                "format": format_name, "contentBase64": base64.b64encode(data).decode("ascii")}


def serve(generator, host, port, token):
    lock = threading.Lock()
    class Handler(BaseHTTPRequestHandler):
        def log_message(self, *args):
            pass  # Never print bearer tokens, prompts or image contents.

        def reply(self, status, body):
            data = json.dumps(body).encode("utf-8")
            self.send_response(status)
            self.send_header("Content-Type", "application/json")
            self.send_header("Content-Length", str(len(data)))
            self.end_headers()
            self.wfile.write(data)

        def authorized(self):
            return not token or hmac.compare_digest(self.headers.get("Authorization", ""), "Bearer " + token)

        def do_GET(self):
            if not self.authorized():
                self.reply(403, {"error": "Unauthorized"})
            elif self.path == "/health":
                self.reply(200, {"protocol": PROTOCOL, "kind": generator.config["kind"],
                                 "status": "loaded" if generator.model is not None else "configured-not-loaded"})
            else:
                self.reply(404, {"error": "Unknown route"})

        def do_POST(self):
            if not self.authorized():
                self.reply(403, {"error": "Unauthorized"}); return
            if self.path != "/generate":
                self.reply(404, {"error": "Unknown route"}); return
            if not lock.acquire(blocking=False):
                self.reply(409, {"error": "Generator busy"}); return
            try:
                length = int(self.headers.get("Content-Length", "0"))
                if not 0 < length <= MAX_REQUEST:
                    raise ValueError("Invalid request length")
                self.connection.settimeout(60)
                raw = self.rfile.read(length)
                if len(raw) != length:
                    raise ValueError("Incomplete request body")
                request = json.loads(raw)
                self.reply(200, generator.generate(request))
            except Exception as error:
                # Error class is safe to expose; local stderr helps operator diagnose missing models/VRAM.
                print(f"Generation failed: {type(error).__name__}: {error}", file=sys.stderr)
                self.reply(422, {"error": type(error).__name__, "detail": "Meta generation failed; inspect worker diagnostics."})
            finally:
                lock.release()
    ThreadingHTTPServer((host, port), Handler).serve_forever()


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--config", required=True)
    parser.add_argument("--host", default="127.0.0.1")
    parser.add_argument("--port", type=int, default=43901)
    parser.add_argument("--check", action="store_true")
    args = parser.parse_args()
    config = json.loads(Path(args.config).read_text(encoding="utf-8"))
    generator = Generator(config)
    generator.check()
    if args.check:
        print(json.dumps({"status": "configured-not-loaded", "kind": config["kind"], "inferenceVerified": False})); return
    token = os.environ.get("DEPTH_META_ASSET_TOKEN", "")
    if args.host not in ("127.0.0.1", "localhost") and not token:
        parser.error("Remote binding requires DEPTH_META_ASSET_TOKEN and an HTTPS reverse proxy.")
    serve(generator, args.host, args.port, token)


if __name__ == "__main__":
    main()
