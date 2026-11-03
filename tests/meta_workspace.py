"""Actual HTTP + MCP Meta workflows with an explicitly simulated model/asset server.
No live model quality claim. All writes remain in isolated artifacts fixtures.
"""
import base64
import json
import os
from pathlib import Path
import socket
import struct
import subprocess
import threading
import time
import urllib.error
import urllib.request
import uuid
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

ROOT = Path(__file__).resolve().parents[1]
RUN = ROOT / "artifacts" / ("meta-http-" + uuid.uuid4().hex[:10])
RUN.mkdir(parents=True)
PROJECT = RUN / "project"
PROJECT.mkdir()
(PROJECT / "Tool.py").write_text("def value():\n    return 7\n", encoding="utf-8")
PNG = base64.b64decode("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR4nGNwaPj/HwAFggK/465+UQAAAABJRU5ErkJggg==")
(PROJECT / "input.png").write_bytes(PNG)
(PROJECT / "mask.png").write_bytes(PNG)
# Valid GLB 2 triangle with embedded vertex/index buffers.
geometry = struct.pack("<9f3H", 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 1, 2) + b"\0\0"
mesh = {"asset": {"version": "2.0"}, "scene": 0, "scenes": [{"nodes": [0]}], "nodes": [{"mesh": 0}],
        "meshes": [{"primitives": [{"attributes": {"POSITION": 0}, "indices": 1}]}],
        "buffers": [{"byteLength": len(geometry)}],
        "bufferViews": [{"buffer": 0, "byteOffset": 0, "byteLength": 36}, {"buffer": 0, "byteOffset": 36, "byteLength": 6}],
        "accessors": [{"bufferView": 0, "componentType": 5126, "count": 3, "type": "VEC3", "min": [0, 0, 0], "max": [1, 1, 0]},
                      {"bufferView": 1, "componentType": 5123, "count": 3, "type": "SCALAR"}]}
mesh_json = json.dumps(mesh).encode()
mesh_json += b" " * (-len(mesh_json) % 4)
GLB = struct.pack("<4sII", b"glTF", 2, 28 + len(mesh_json) + len(geometry)) + struct.pack("<I4s", len(mesh_json), b"JSON") + mesh_json + struct.pack("<I4s", len(geometry), b"BIN\0") + geometry
requests = []


class Model(BaseHTTPRequestHandler):
    def log_message(self, *args):
        pass

    def do_POST(self):
        payload = json.loads(self.rfile.read(int(self.headers["Content-Length"])))
        requests.append(self.path)
        if self.path == "/generate":
            assert payload["protocol"] == "depth-meta-assets/v1"
            object3d = payload["kind"] == "object3d"
            if object3d:
                assert base64.b64decode(payload["imageBase64"]) == PNG
                assert base64.b64decode(payload["maskBase64"]) == PNG
            result = {"protocol": "depth-meta-assets/v1", "provider": "meta", "model": "sam-3d-objects" if object3d else "chameleon",
                      "format": "glb" if object3d else "png", "contentBase64": base64.b64encode(GLB if object3d else PNG).decode()}
        else:
            assert self.path == "/v1/chat/completions"
            prompt = payload["messages"][1]["content"]
            if "organizing actual code" in payload["messages"][0]["content"]:
                packet = json.loads(prompt.split("\nSOURCE ")[0])
                ids = packet["entityIds"]
                note = {"name": "기능 모듈", "purpose": "테스트용 소스 설명", "responsibilities": ["계산"], "inputs": [], "outputs": ["값"], "sideEffects": [], "invariants": [], "assumptions": ["실제 모델 추론 아님"], "evidenceIds": ids[:1]}
                note["documentation"] = {"version": 2, "creationReason": "소스의 역할을 이해하기 위한 fixture 설명", "decisions": []}
                if "return 7" in prompt:
                    note["documentation"]["decisions"] = [{"concept": "함수 반환값", "summary": "value는 상수 7을 반환합니다.",
                        "definition": "함수는 호출하면 정해진 작업을 수행하고 호출한 곳에 결과를 돌려줄 수 있습니다.",
                        "mechanism": "return 7이 함수의 결과로 숫자 7을 전달합니다.", "whyHere": "호출자에게 고정된 값을 제공하는 코드로 해석됩니다.",
                        "example": "value()를 호출하는 예시에서 결과는 7입니다. 실행 검증은 아닙니다.", "alternatives": [],
                        "tradeoffs": ["원작자의 생성 의도는 미기록입니다."], "evidence": [{"entityId": ids[0], "quote": "return 7"}]}]
                content = json.dumps({"modules": [{"entityIds": ids, "explanation": note}]})
            elif "implementing source module refactoring" in payload["messages"][0]["content"]:
                packet = json.loads(prompt)
                content = json.dumps({"id": "", "projectId": packet["projectId"], "revision": packet["revision"], "reason": "Simulated Meta extraction", "modules": [],
                                      "edits": [{"path": "Modules/value.py", "expectedHash": "", "content": "def value():\n    return 7\n", "operation": "create"},
                                                {"path": "Tool.py", "expectedHash": next(f["expectedHash"] for f in packet["target"]["files"] if f["path"] == "Tool.py"), "content": "from Modules.value import value\n", "operation": "replace"}]})
            else:
                content = "Meta compatible transport reached."
            result = {"choices": [{"message": {"role": "assistant", "content": content}, "finish_reason": "stop"}]}
        data = json.dumps(result).encode()
        self.send_response(200)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(data)))
        self.end_headers()
        self.wfile.write(data)


server = ThreadingHTTPServer(("127.0.0.1", 0), Model)
threading.Thread(target=server.serve_forever, daemon=True).start()
with socket.socket() as sock:
    sock.bind(("127.0.0.1", 0))
    port = sock.getsockname()[1]
token = "meta-test-" + uuid.uuid4().hex
env_file = RUN / "local.env"
env_file.write_text("MODEL_API_KEY=fixture-config-only\nMETA_MODEL=muse-spark-1.3\n", encoding="utf-8")
env = dict(os.environ, DEPTH_PORT=str(port), DEPTH_TOKEN=token, DEPTH_STORAGE=str(RUN / "state"), DEPTH_ENV_FILE=str(env_file))
dll = ROOT / "src/Depth.Service/bin/Release/net8.0/Depth.Service.dll"
process = subprocess.Popen(["dotnet", str(dll)], env=env, stdout=subprocess.DEVNULL, stderr=subprocess.PIPE)


def call(path, body=None, binary=False):
    request = urllib.request.Request(f"http://127.0.0.1:{port}" + path, data=None if body is None else json.dumps(body).encode(), headers={"X-Depth-Token": token, "Content-Type": "application/json"})
    with urllib.request.urlopen(request, timeout=90) as response:
        return response.read() if binary else json.load(response)


try:
    for _ in range(100):
        try:
            call("/health"); break
        except OSError:
            time.sleep(.1)
    else:
        raise RuntimeError("Service did not start")
    graph = call("/import", {"path": str(PROJECT)})
    configuration = call("/meta/config")
    assert configuration["keyConfigured"] and configuration["endpoint"] == "https://api.meta.ai/v1/"
    assert "fixture-config-only" not in json.dumps(configuration)
    connection = {"model": "meta-simulated", "protocol": "llama-compatible", "endpoint": f"http://127.0.0.1:{server.server_port}/v1/"}
    analyzed = call("/modules/analyze", {"connection": connection, "projectId": graph["projectId"], "revision": graph["revision"]})
    assert analyzed["complete"] and analyzed["modelCalls"] == 3
    catalog = call("/modules/catalog")
    assert catalog["missingExplanations"] == 0
    source = next(m for m in catalog["modules"] if any(p["language"] == "python" for p in m["provides"]))
    messages = [{"jsonrpc": "2.0", "id": 1, "method": "tools/call", "params": {"name": "modules.contract", "arguments": {"id": source["id"]}}},
                {"jsonrpc": "2.0", "id": 2, "method": "tools/call", "params": {"name": "modules.neighborhood", "arguments": {"id": source["id"]}}},
                {"jsonrpc": "2.0", "id": 3, "method": "tools/call", "params": {"name": "modules.explanation", "arguments": {"id": source["id"], "revision": graph["revision"], "level": "beginner"}}}]
    bridge = subprocess.run(["dotnet", str(dll), "--mcp", "--connection", str(RUN / "state/connection.json")], input="\n".join(json.dumps(m) for m in messages) + "\n", text=True, encoding="utf-8", capture_output=True, timeout=30)
    replies = [json.loads(line) for line in bridge.stdout.splitlines() if line.startswith("{")]
    assert len(replies) == 3 and all(not reply["result"].get("isError", False) for reply in replies)
    contract = json.loads(replies[0]["result"]["content"][0]["text"])
    assert contract["schema"] == "depth-module-contract/v2" and contract["fingerprint"] == source["fingerprint"]
    assert contract["explanation"]["decisions"][0]["evidence"] == source["explanation"]["documentation"]["decisions"][0]["evidence"]
    assert "definition" not in contract["explanation"]["decisions"][0]
    calls_before = len(requests)
    beginner = call("/modules/explanation", {"id": source["id"], "projectId": graph["projectId"], "revision": graph["revision"], "level": "beginner"})
    expert = call("/modules/explanation", {"id": source["id"], "projectId": graph["projectId"], "revision": graph["revision"], "level": "expert"})
    assert beginner == json.loads(replies[2]["result"]["content"][0]["text"])
    assert beginner["reasonBasis"] == expert["reasonBasis"] == "inferred-from-source" and len(requests) == calls_before
    assert len("".join(beginner["sections"][0]["paragraphs"])) > len("".join(expert["sections"][0]["paragraphs"]))
    proposal = call("/modules/transform", {"connection": connection, "projectId": graph["projectId"], "revision": graph["revision"], "kind": "split", "moduleIds": [source["id"]], "instruction": "Extract value"})
    assert not call("/proposals/" + proposal["id"])["assessment"]["canApply"]
    assert not (PROJECT / "Modules/value.py").exists()
    asset_connection = {"endpoint": f"http://127.0.0.1:{server.server_port}/", "protocol": "worker"}
    item = call("/assets/generate", {"connection": asset_connection, "projectId": graph["projectId"], "revision": graph["revision"], "kind": "object3d", "prompt": "", "imagePath": "input.png", "maskPath": "mask.png"})
    assert item["status"] == "staged" and call("/assets/" + item["id"] + "/content", binary=True) == GLB
    imported = call("/assets/import", {"id": item["id"], "projectId": graph["projectId"], "revision": graph["revision"], "destination": "Assets/object.glb", "approved": True})
    assert imported["status"] == "imported" and any(e["kind"] == "Model3D" for e in call("/graph")["entities"])
    assert (PROJECT / "Assets/object.glb").read_bytes() == GLB
    assert len(call("/assets")["items"]) == 1
    result = {"result": "passed", "http": True, "mcpExplanationMatchesUi": True, "readingLevelsWithoutInference": True, "sourceTransformationStaged": True, "glbImported": True, "liveMeta": False}
    (RUN / "result.json").write_text(json.dumps(result, indent=2), encoding="utf-8")
    print(json.dumps(result))
finally:
    process.terminate()
    try:
        process.wait(timeout=10)
    except subprocess.TimeoutExpired:
        process.kill(); process.wait()
    server.shutdown()
