// Development-only bridge. Reads a per-project capability, never a Meta key.
// Frames are the actual Game view; sources come from attached MonoScripts.
#if UNITY_EDITOR
using System;
using System.Collections;
using System.Collections.Generic;
using System.IO;
using System.Net.Http;
using System.Text;
using System.Threading.Tasks;
using UnityEditor;
using UnityEngine;
using UnityEngine.SceneManagement;
#if DEPTH_RUNTIME_UGUI
using UnityEngine.EventSystems;
#endif

namespace Depth.RuntimePreview
{
    [Serializable] public sealed class Config { public string protocol, url, token, session, root; public int parentPid; }
    [InitializeOnLoad] public static class EditorEntry
    {
        static double nextCheck;
        static readonly string StateKey = "Depth.RuntimePreview.session";
        static EditorEntry() { EditorApplication.update += Poll; }
        public static void Play() { EditorApplication.delayCall += Poll; }
        static void Poll()
        {
            if (EditorApplication.timeSinceStartup < nextCheck || EditorApplication.isCompiling || EditorApplication.isUpdating) return;
            nextCheck = EditorApplication.timeSinceStartup + 1;
            string file = Path.GetFullPath(Path.Combine(Application.dataPath, "..", ".depth", "runtime-bridge.json"));
            string previous = SessionState.GetString(StateKey, "");
            if (!File.Exists(file)) { if (previous.Length > 0) { SessionState.EraseString(StateKey); if (EditorApplication.isPlaying) EditorApplication.isPlaying = false; } return; }
            try
            {
                Config cfg = JsonUtility.FromJson<Config>(File.ReadAllText(file));
                if (cfg == null || cfg.protocol != "depth-runtime/1" || cfg.parentPid <= 0 || cfg.token == null || cfg.token.Length != 64) return;
                using (var parent = System.Diagnostics.Process.GetProcessById(cfg.parentPid)) { if (parent.HasExited) return; }
                if (cfg.session != previous)
                {
                    if (EditorApplication.isPlaying) { EditorApplication.isPlaying = false; return; }
                    SessionState.SetString(StateKey, cfg.session);
                    AssetDatabase.Refresh();
                    EditorApplication.isPlaying = true;
                }
            }
            catch { /* A disconnected host never changes or saves scene assets. */ }
        }
    }
    [Serializable] public sealed class Source { public string path; public int line; }
    [Serializable] public sealed class Region { public string id, name; public float x, y, width, height; public int depth; public Source[] sources; }
    [Serializable] public sealed class Capabilities {
#if DEPTH_RUNTIME_UGUI
        public bool pointer = true, scroll = true;
#else
        public bool pointer = false, scroll = false;
#endif
        public bool text = false, inspect = true;
    }
    [Serializable] public sealed class Selection { public string requestId, name; public Source[] sources; }
    [Serializable] public sealed class Frame { public string protocol = "depth-runtime/1", engine = "unity", session, png; public int sequence, width, height; public Region[] regions; public Selection selection; public Capabilities capabilities = new Capabilities(); }
    [Serializable] public sealed class InputCommand { public string type, text, requestId; public float x, y, delta; }
    [Serializable] public sealed class Reply { public string session; public InputCommand[] commands; }

    public sealed class DepthRuntimeBridge : MonoBehaviour
    {
        Config config; HttpClient client; int sequence; bool stopped; Selection selected;
#if DEPTH_RUNTIME_UGUI
        GameObject pressed;
        readonly List<RaycastResult> hits = new List<RaycastResult>();
#endif
        [RuntimeInitializeOnLoadMethod(RuntimeInitializeLoadType.AfterSceneLoad)]
        static void StartConfigured()
        {
            string root = Path.GetFullPath(Path.Combine(Application.dataPath, ".."));
            string file = Path.Combine(root, ".depth", "runtime-bridge.json");
            if (!File.Exists(file)) return;
            Config cfg;
            try { cfg = JsonUtility.FromJson<Config>(File.ReadAllText(file)); }
            catch { return; }
            Uri uri;
            if (cfg == null || cfg.protocol != "depth-runtime/1" || cfg.token == null || cfg.token.Length != 64 || !Uri.TryCreate(cfg.url, UriKind.Absolute, out uri) || uri.Scheme != "http" || uri.Host != "127.0.0.1" || !String.Equals(Path.GetFullPath(cfg.root), root, StringComparison.OrdinalIgnoreCase)) return;
            GameObject host = new GameObject("Depth runtime preview (development)");
            host.hideFlags = HideFlags.HideAndDontSave;
            DontDestroyOnLoad(host);
            var bridge = host.AddComponent<DepthRuntimeBridge>(); bridge.config = cfg;
            bridge.client = new HttpClient { Timeout = TimeSpan.FromSeconds(5) };
            bridge.client.DefaultRequestHeaders.Add("X-Depth-Runtime", cfg.token);
            bridge.StartCoroutine(bridge.Stream());
        }
        IEnumerator Stream()
        {
            while (!stopped)
            {
                yield return new WaitForEndOfFrame();
                Texture2D image = ScreenCapture.CaptureScreenshotAsTexture();
                if (image == null) { yield return new WaitForSecondsRealtime(.5f); continue; }
                var frame = new Frame { session = config.session, sequence = ++sequence, width = image.width, height = image.height, png = Convert.ToBase64String(image.EncodeToPNG()), regions = Regions(), selection = selected }; selected = null;
                Destroy(image);
                Task<string> request = Send(JsonUtility.ToJson(frame));
                while (!request.IsCompleted && !stopped) yield return null;
                if (!request.IsFaulted && !request.IsCanceled && !stopped)
                {
                    Reply reply = JsonUtility.FromJson<Reply>(request.Result);
                    if (reply != null && reply.session == config.session && reply.commands != null)
                        foreach (var command in reply.commands) Input(command);
                }
                yield return new WaitForSecondsRealtime(.2f);
            }
        }
        async Task<string> Send(string json)
        {
            using (var body = new StringContent(json, Encoding.UTF8, "application/json"))
            using (var response = await client.PostAsync(config.url + "/frame", body))
            { response.EnsureSuccessStatusCode(); return await response.Content.ReadAsStringAsync(); }
        }
        static Source[] Sources(Transform transform)
        {
            var list = new List<Source>(); var unique = new HashSet<string>();
            for (Transform current = transform; current != null; current = current.parent)
                foreach (var component in current.GetComponents<MonoBehaviour>())
                {
                    if (component == null || component is DepthRuntimeBridge) continue;
                    var script = MonoScript.FromMonoBehaviour(component); string source = script == null ? "" : AssetDatabase.GetAssetPath(script);
                    if (source.StartsWith("Assets/", StringComparison.Ordinal) && unique.Add(source)) list.Add(new Source { path = source });
                }
            return list.ToArray();
        }
        static Region Make(Transform transform, Vector2 min, Vector2 max, int depth)
        {
            float x = Mathf.Clamp01(min.x / Screen.width), y = Mathf.Clamp01(1 - max.y / Screen.height);
            return new Region { id = transform.GetInstanceID().ToString(), name = transform.name, x = x, y = y, width = Mathf.Max(0, Mathf.Clamp01(max.x / Screen.width) - x), height = Mathf.Max(0, Mathf.Clamp01(1 - min.y / Screen.height) - y), depth = depth, sources = Sources(transform) };
        }
        static Region[] Regions()
        {
            var result = new List<Region>(); var ids = new HashSet<int>();
            // Traverse loaded scene roots once per transmitted frame; no global
            // Find calls or repeated name lookups. Dynamic objects are included.
            var cameras = Camera.allCameras; var corners = new Vector3[4];
            for (int sceneIndex = 0; sceneIndex < SceneManager.sceneCount; sceneIndex++)
            {
                var scene = SceneManager.GetSceneAt(sceneIndex); if (!scene.isLoaded) continue;
                foreach (var root in scene.GetRootGameObjects())
                {
                    foreach (var rect in root.GetComponentsInChildren<RectTransform>(false))
                    {
                        var canvas = rect.GetComponentInParent<Canvas>(); if (canvas == null || !canvas.enabled || !ids.Add(rect.GetInstanceID())) continue;
                        Camera camera = canvas.renderMode == RenderMode.ScreenSpaceOverlay ? null : canvas.worldCamera;
                        rect.GetWorldCorners(corners); Vector2 min = new Vector2(float.MaxValue, float.MaxValue), max = new Vector2(float.MinValue, float.MinValue);
                        foreach (var corner in corners) { Vector2 point = RectTransformUtility.WorldToScreenPoint(camera, corner); min = Vector2.Min(min, point); max = Vector2.Max(max, point); }
                        int depth = 1; for (Transform t = rect.parent; t != null; t = t.parent) depth++;
                        result.Add(Make(rect, min, max, depth + 100));
                    }
                    foreach (var renderer in root.GetComponentsInChildren<Renderer>(false))
                    {
                        if (!renderer.enabled || !ids.Add(renderer.transform.GetInstanceID())) continue;
                        foreach (var camera in cameras)
                        {
                            if (!camera.enabled || (camera.cullingMask & (1 << renderer.gameObject.layer)) == 0 || !GeometryUtility.TestPlanesAABB(GeometryUtility.CalculateFrustumPlanes(camera), renderer.bounds)) continue;
                            var bounds = renderer.bounds; Vector2 min = new Vector2(float.MaxValue, float.MaxValue), max = new Vector2(float.MinValue, float.MinValue); bool inFront = false;
                            for (int n = 0; n < 8; n++) { Vector3 point = camera.WorldToScreenPoint(bounds.center + Vector3.Scale(bounds.extents, new Vector3((n & 1) == 0 ? -1 : 1, (n & 2) == 0 ? -1 : 1, (n & 4) == 0 ? -1 : 1))); if (point.z <= 0) continue; inFront = true; min = Vector2.Min(min, point); max = Vector2.Max(max, point); }
                            if (inFront) result.Add(Make(renderer.transform, min, max, 1)); break;
                        }
                    }
                }
            }
            return result.ToArray();
        }
        void Input(InputCommand command)
        {
            if (command.type == "pick")
            {
                Vector2 point = new Vector2(command.x * Screen.width, (1 - command.y) * Screen.height);
                GameObject picked = null;
#if DEPTH_RUNTIME_UGUI
                if (EventSystem.current != null) { hits.Clear(); EventSystem.current.RaycastAll(new PointerEventData(EventSystem.current) { position = point }, hits); if (hits.Count > 0) picked = hits[0].gameObject; }
#endif
                if (picked == null) foreach (var camera in Camera.allCameras)
                {
                    if (!camera.enabled || !camera.pixelRect.Contains(point)) continue;
                    Ray ray = camera.ScreenPointToRay(point); RaycastHit hit;
                    if (Physics.Raycast(ray, out hit, camera.farClipPlane, camera.cullingMask)) { picked = hit.collider.gameObject; break; }
                    RaycastHit2D hit2 = Physics2D.GetRayIntersection(ray, camera.farClipPlane, camera.cullingMask); if (hit2.collider != null) { picked = hit2.collider.gameObject; break; }
                }
                selected = new Selection { requestId = command.requestId, name = picked == null ? "No runtime object at this point" : picked.name, sources = picked == null ? new Source[0] : Sources(picked.transform) };
                return;
            }
#if DEPTH_RUNTIME_UGUI
            var system = EventSystem.current; if (system == null) return;
            var data = new PointerEventData(system) { position = new Vector2(command.x * Screen.width, (1 - command.y) * Screen.height), button = PointerEventData.InputButton.Left };
            hits.Clear(); system.RaycastAll(data, hits); GameObject target = hits.Count > 0 ? hits[0].gameObject : null;
            if (command.type == "pointerDown") { pressed = target; if (target != null) ExecuteEvents.ExecuteHierarchy(target, data, ExecuteEvents.pointerDownHandler); }
            if (command.type == "pointerUp") { if (pressed != null) { ExecuteEvents.ExecuteHierarchy(pressed, data, ExecuteEvents.pointerUpHandler); if (target != null && (target == pressed || target.transform.IsChildOf(pressed.transform) || pressed.transform.IsChildOf(target.transform))) ExecuteEvents.ExecuteHierarchy(pressed, data, ExecuteEvents.pointerClickHandler); } pressed = null; }
            if (command.type == "scroll" && target != null) { data.scrollDelta = new Vector2(0, -command.delta / 100); ExecuteEvents.ExecuteHierarchy(target, data, ExecuteEvents.scrollHandler); }
#endif
        }
        void OnDestroy() { stopped = true; if (client != null) client.Dispose(); }
    }
}
#endif
