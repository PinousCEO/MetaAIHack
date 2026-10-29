// Copy this file to the TARGET Unity project's Assets/Editor directory.
// Opt-in editor Play Mode bridge. No instrumentation is added to shipping builds.
using System;
using System.Linq;
using System.Text;
using UnityEditor;
using UnityEngine;
using UnityEngine.Networking;

public sealed class DepthRuntimeBridge : EditorWindow
{
    string token = "", status = "Connect while the same target project is imported in Depth.";
    static DepthRuntimeBridge active;
    Snapshot snapshot;
    readonly string session = Guid.NewGuid().ToString("N");
    [Serializable] class Snapshot { public string projectId, revision, root; }
    [Serializable] class SelectionMessage { public string projectId, revision, sessionId, objectId, name; public string[] sourcePaths; }
    [MenuItem("Depth/Runtime source bridge")]
    static void Open() { GetWindow<DepthRuntimeBridge>("Depth runtime bridge").Show(); }
    void OnEnable() { active = this; EditorApplication.playModeStateChanged += PlayMode; Selection.selectionChanged += Selected; }
    void OnDisable() { if (active == this) active = null; EditorApplication.playModeStateChanged -= PlayMode; Selection.selectionChanged -= Selected; }
    void OnGUI()
    {
        GUILayout.Label("Depth AI · runtime observation", EditorStyles.boldLabel);
        GUILayout.Label("Paste service.token from the Depth app's service storage.");
        token = EditorGUILayout.PasswordField("Local token", token);
        if (GUILayout.Button("Connect to imported snapshot"))
        {
            var request = UnityWebRequest.Get("http://127.0.0.1:43821/graph");
            request.SetRequestHeader("X-Depth-Token", token);
            request.SendWebRequest().completed += _ =>
            {
                if (request.result == UnityWebRequest.Result.Success)
                {
                    var next = JsonUtility.FromJson<Snapshot>(request.downloadHandler.text);
                    var localRoot = System.IO.Path.GetFullPath(Application.dataPath + "/..").TrimEnd('/', '\\');
                    if (!string.Equals(localRoot, next.root.TrimEnd('/', '\\'), StringComparison.OrdinalIgnoreCase)) status = "Depth has imported a different project.";
                    else { snapshot = next; status = "Connected. Enter Play Mode and click a collider in the Game view, or select a hierarchy object."; EnsurePicker(); }
                }
                else status = request.error;
                request.Dispose(); Repaint();
            };
        }
        GUILayout.Label(status, EditorStyles.wordWrappedLabel);
    }
    void PlayMode(PlayModeStateChange state) { if (state == PlayModeStateChange.EnteredPlayMode) EnsurePicker(); }
    void EnsurePicker()
    {
        if (!EditorApplication.isPlaying || snapshot == null || UnityEngine.Object.FindFirstObjectByType<DepthGamePicker>() != null) return;
        new GameObject("Depth editor picker") { hideFlags = HideFlags.HideAndDontSave }.AddComponent<DepthGamePicker>();
    }
    void Selected() { if (EditorApplication.isPlaying && Selection.activeGameObject != null) Report(Selection.activeGameObject); }
    public static void Pick(GameObject target) { if (active != null) active.Report(target); }
    void Report(GameObject target)
    {
        if (snapshot == null) return;
        var paths = target.GetComponentsInChildren<MonoBehaviour>(true).Concat(target.GetComponentsInParent<MonoBehaviour>(true))
            .Where(c => c != null && !(c is DepthGamePicker)).Select(MonoScript.FromMonoBehaviour)
            .Where(s => s != null).Select(AssetDatabase.GetAssetPath).Where(p => p.StartsWith("Assets/")).Distinct().ToArray();
        var message = new SelectionMessage { projectId = snapshot.projectId, revision = snapshot.revision, sessionId = session,
            objectId = GlobalObjectId.GetGlobalObjectIdSlow(target).ToString() + ":instance:" + target.GetInstanceID(), name = target.name, sourcePaths = paths };
        var request = new UnityWebRequest("http://127.0.0.1:43821/runtime/select", "POST") {
            uploadHandler = new UploadHandlerRaw(Encoding.UTF8.GetBytes(JsonUtility.ToJson(message))), downloadHandler = new DownloadHandlerBuffer() };
        request.SetRequestHeader("Content-Type", "application/json"); request.SetRequestHeader("X-Depth-Token", token);
        request.SendWebRequest().completed += _ => { status = request.result == UnityWebRequest.Result.Success ? "Observed component ownership: " + target.name : request.downloadHandler.text; request.Dispose(); Repaint(); };
    }
}

public sealed class DepthGamePicker : MonoBehaviour
{
    void OnGUI()
    {
        if (Event.current.type != EventType.MouseDown || Event.current.button != 0 || Camera.main == null) return;
        var pixel = new Vector3(Event.current.mousePosition.x, Screen.height - Event.current.mousePosition.y);
        if (Physics.Raycast(Camera.main.ScreenPointToRay(pixel), out var hit)) DepthRuntimeBridge.Pick(hit.collider.gameObject);
    }
}
