"""Real HTTP + Dart AST integration. No AI calls or API credentials required."""
import json
import os
from pathlib import Path
import socket
import subprocess
import tempfile
import time
import urllib.request
import urllib.error

REPO = Path(__file__).resolve().parents[1]
with tempfile.TemporaryDirectory(prefix="depth-http-") as temp:
    base = Path(temp)
    root = base / "project"
    root.mkdir()
    (root / "wallet.dart").write_text("class Wallet { int coins = 0; void add(int amount) { coins += amount; } }\n", encoding="utf-8")
    (root / "Game.cs").write_text("public class Game { public int Score() => 1; }", encoding="utf-8")
    with socket.socket() as sock:
        sock.bind(("127.0.0.1", 0))
        port = sock.getsockname()[1]
    env = dict(os.environ, DEPTH_PORT=str(port), DEPTH_TOKEN="integration-test-token", DEPTH_STORAGE=str(base / "state"))
    if env.get("DEPTH_DART_EXECUTABLE"):
        env["DEPTH_DART_ADAPTER"] = str(REPO / "adapters/dart/bin/index.dart")
    process = subprocess.Popen(["dotnet", str(REPO / "src/Depth.Service/bin/Release/net8.0/Depth.Service.dll")], env=env, stdout=subprocess.DEVNULL, stderr=subprocess.PIPE)
    def call(path, body=None, token="integration-test-token", origin=None):
        headers = {"X-Depth-Token": token, "Content-Type": "application/json"}
        if origin:
            headers["Origin"] = origin
        req = urllib.request.Request(f"http://127.0.0.1:{port}" + path, data=None if body is None else json.dumps(body).encode(), headers=headers)
        with urllib.request.urlopen(req, timeout=150) as response:
            return json.load(response)
    try:
        for _ in range(100):
            try:
                call("/health")
                break
            except OSError:
                time.sleep(.1)
        else:
            raise RuntimeError("Service did not start")
        for token, origin in [("wrong", None), ("integration-test-token", "https://example.org")]:
            try:
                call("/health", token=token, origin=origin)
                raise AssertionError("Unauthorized request accepted")
            except urllib.error.HTTPError as error:
                assert error.code == 403
        print("PASS token and browser-origin rejection")
        graph = call("/import", {"path": str(root)})
        assert len(graph["files"]) == 2
        assert any(e["name"] == "Score" for e in graph["entities"])
        if env.get("DEPTH_DART_EXECUTABLE"):
            assert {e["name"] for e in graph["entities"] if e["language"] == "dart"} == {"Wallet", "coins", "add"}, graph["diagnostics"]
            print("PASS real Dart AST declarations through service adapter")
        entity = call("/search?q=Score")[0]
        source = call("/source/" + entity["id"])
        assert "Score() => 1" in source["sources"][0]["content"]
        print("PASS real import, indexed search and source retrieval")
        call("/runtime/select", {"projectId": graph["projectId"], "revision": graph["revision"], "sessionId": "test", "objectId": "player", "name": "Player", "sourcePaths": ["Game.cs"]})
        assert call("/runtime/selection")["name"] == "Player"
        (root / "Game.cs").write_text("public class Game { public int Score() => 2; }", encoding="utf-8")
        updated = call("/refresh", {})
        assert updated["revision"] != graph["revision"]
        assert call("/search?q=Score")[0]["id"] == entity["id"]
        assert call("/runtime/selection") is None
        print("PASS external edit refresh, stable identity and observation invalidation")
        (REPO / "artifacts").mkdir(exist_ok=True)
        (REPO / "artifacts/integration-result.json").write_text(json.dumps({"result": "passed", "dartAstTested": bool(env.get("DEPTH_DART_EXECUTABLE")), "files": len(graph["files"]), "entities": len(graph["entities"])}, indent=2))
    finally:
        process.terminate()
        try:
            process.wait(timeout=10)
        except subprocess.TimeoutExpired:
            process.kill()
            process.wait()
