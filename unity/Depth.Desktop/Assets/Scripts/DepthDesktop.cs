using System;
using System.Collections;
using System.Collections.Generic;
using System.Diagnostics;
using System.IO;
using System.Linq;
using System.Text;
using DepthClient;
using UnityEngine;
using UnityEngine.Networking;
using Debug = UnityEngine.Debug;

public sealed class DepthDesktop : MonoBehaviour
{
    const float W = 1600, H = 900;
    readonly Color ink = new Color(.035f, .045f, .075f), panel = new Color(.065f, .08f, .12f), mint = new Color(.35f, .95f, .83f);
    Graph graph;
    Module selected;
    Entity entity;
    Proposal proposal;
    RuntimeSelection observation;
    Process service;
    Camera view;
    readonly List<GameObject> visuals = new List<GameObject>();
    readonly Dictionary<string, Vector3> positions = new Dictionary<string, Vector3>();
    string token, projectPath = "", query = "", request = "Explain the selected functionality and propose a small improvement.", status = "Starting local analysis service...", detail = "", review = "";
    string storage, endpoint = "http://127.0.0.1:43821";
    bool busy, ready, focusOnly, showReview;
    int page;
    Vector2 moduleScroll, detailScroll, reviewScroll;
    GUIStyle title, body, tiny, heading, button, textArea;
    Material glow;
    readonly List<Texture2D> skinTextures = new List<Texture2D>();
    float nextPoll;

    void Awake()
    {
        Application.runInBackground = true;
        view = new GameObject("Spatial camera").AddComponent<Camera>();
        view.transform.position = new Vector3(0, 0, -24);
        view.orthographic = true; view.orthographicSize = 9;
        view.clearFlags = CameraClearFlags.SolidColor; view.backgroundColor = ink;
        view.rect = new Rect(.205f, .14f, .51f, .72f);
        var template = Resources.Load<Material>("DepthGlow");
        glow = template != null ? new Material(template) : new Material(Shader.Find("Unlit/Color")); glow.color = mint;
        var args = Environment.GetCommandLineArgs();
        for (int i = 0; i < args.Length - 1; i++) if (args[i] == "--depth-project") projectPath = args[i + 1];
        StartCoroutine(Boot());
    }
    IEnumerator Boot()
    {
        storage = Path.Combine(Application.persistentDataPath, "service");
        Directory.CreateDirectory(storage);
        token = Guid.NewGuid().ToString("N") + Guid.NewGuid().ToString("N");
        var executable = Path.GetFullPath(Path.Combine(Application.dataPath, "../service/Depth.Service.exe"));
        if (Application.isEditor) executable = Path.GetFullPath(Path.Combine(Application.dataPath, "../../../src/Depth.Service/bin/Debug/net8.0/Depth.Service.exe"));
        try
        {
            var start = new ProcessStartInfo(executable) { WorkingDirectory = Path.GetDirectoryName(executable), UseShellExecute = false, CreateNoWindow = true };
            start.EnvironmentVariables["DEPTH_TOKEN"] = token;
            start.EnvironmentVariables["DEPTH_STORAGE"] = storage;
            service = Process.Start(start);
        }
        catch (Exception e) { status = "Service unavailable: " + e.Message; yield break; }
        for (int i = 0; i < 40; i++)
        {
            using (var web = UnityWebRequest.Get(endpoint + "/health"))
            {
                web.SetRequestHeader("X-Depth-Token", token); web.timeout = 1;
                yield return web.SendWebRequest();
                if (web.result == UnityWebRequest.Result.Success) { ready = true; break; }
            }
            yield return new WaitForSeconds(.25f);
        }
        status = ready ? "Ready. Import a Unity, Flutter or C# project directory." : "Service did not start. Check .NET 8 runtime and port 43821.";
        if (ready && projectPath.Length > 0) Import();
    }
    IEnumerator Api(string path, string json, Action<string> done)
    {
        busy = true;
        using (var web = new UnityWebRequest(endpoint + path, json == null ? "GET" : "POST"))
        {
            web.downloadHandler = new DownloadHandlerBuffer(); web.timeout = 260;
            web.SetRequestHeader("X-Depth-Token", token);
            if (json != null) { web.uploadHandler = new UploadHandlerRaw(Encoding.UTF8.GetBytes(json)); web.SetRequestHeader("Content-Type", "application/json"); }
            yield return web.SendWebRequest();
            busy = false;
            if (web.result == UnityWebRequest.Result.Success) done(web.downloadHandler.text);
            else status = "Request failed: " + (web.downloadHandler.text.Length > 0 ? web.downloadHandler.text : web.error);
        }
    }
    void Import()
    {
        status = "Analyzing actual source..."; proposal = null;
        StartCoroutine(Api("/import", JsonUtility.ToJson(new ImportRequest { path = projectPath }), ReceiveGraph));
    }
    void ReceiveGraph(string json)
    {
        var previous = graph == null ? "" : graph.revision;
        graph = JsonUtility.FromJson<Graph>(json);
        selected = selected == null ? graph.modules.FirstOrDefault() : graph.modules.FirstOrDefault(m => m.id == selected.id) ?? graph.modules.FirstOrDefault();
        if (previous != graph.revision) { proposal = null; entity = null; observation = null; detail = ""; page = 0; }
        status = graph.files.Length + " source files / " + graph.entities.Length + " entities / " + graph.relations.Length + " evidenced relations. Snapshot " + graph.revision.Substring(0, 10);
        Rebuild(); nextPoll = Time.realtimeSinceStartup + 5;
        if (Environment.GetCommandLineArgs().Contains("--depth-smoke")) StartCoroutine(Smoke());
    }
    IEnumerator Smoke()
    {
        yield return new WaitForSeconds(2);
        yield return new WaitForEndOfFrame();
        ScreenCapture.CaptureScreenshot(Path.Combine(Application.dataPath, "../smoke.png"));
        File.WriteAllText(Path.Combine(Application.dataPath, "../smoke.json"), JsonUtility.ToJson(graph, true));
        yield return new WaitForSeconds(2);
        Application.Quit(0);
    }
    void Update()
    {
        if (!ready || busy || graph == null || Time.realtimeSinceStartup < nextPoll) return;
        nextPoll = Time.realtimeSinceStartup + 5;
        StartCoroutine(Api("/refresh", "{}", json =>
        {
            var incoming = JsonUtility.FromJson<Graph>(json);
            if (incoming.revision != graph.revision) ReceiveGraph(json);
            StartCoroutine(Api("/runtime/selection", null, s =>
            {
                if (s == "null" || s.Length == 0) return;
                observation = JsonUtility.FromJson<RuntimeSelection>(s);
                var match = graph.modules.FirstOrDefault(m => graph.entities.Any(e => m.entityIds.Contains(e.id) && e.anchors.Any(a => observation.sourcePaths.Contains(a.path))));
                if (match != null) { selected = match; Rebuild(); }
            }));
        }));
    }
    Module[] Visible()
    {
        if (graph == null) return new Module[0];
        return graph.modules.Where(m => m.name.IndexOf(query, StringComparison.OrdinalIgnoreCase) >= 0 || m.purpose.IndexOf(query, StringComparison.OrdinalIgnoreCase) >= 0 ||
            graph.entities.Any(e => m.entityIds.Contains(e.id) && e.qualifiedName.IndexOf(query, StringComparison.OrdinalIgnoreCase) >= 0))
            .Where(m => !focusOnly || selected == null || m.id == selected.id || graph.relations.Any(r => (selected.entityIds.Contains(r.from) && m.entityIds.Contains(r.to)) || (selected.entityIds.Contains(r.to) && m.entityIds.Contains(r.from))))
            .ToArray();
    }
    void Rebuild()
    {
        foreach (var item in visuals) Destroy(item); visuals.Clear(); positions.Clear();
        var modules = Visible().Skip(page * 18).Take(18).ToArray();
        for (int i = 0; i < modules.Length; i++)
        {
            float angle = i * 2.39996f, radius = i == 0 ? 0 : 2 + Mathf.Sqrt(i) * 1.15f;
            var position = new Vector3(Mathf.Cos(angle) * radius, Mathf.Sin(angle) * radius * .76f, i % 3 * .6f);
            positions[modules[i].id] = position;
            var orb = GameObject.CreatePrimitive(PrimitiveType.Sphere); orb.transform.position = position;
            orb.transform.localScale = Vector3.one * (modules[i].id == selected?.id ? .58f : .28f);
            var renderer = orb.GetComponent<Renderer>(); renderer.sharedMaterial = glow;
            var properties = new MaterialPropertyBlock();
            properties.SetColor("_Color", IsObserved(modules[i]) ? new Color(1f, .68f, .35f) : modules[i].id == selected?.id ? mint : new Color(.4f, .58f, .85f));
            renderer.SetPropertyBlock(properties); visuals.Add(orb);
        }
        if (selected == null || !positions.ContainsKey(selected.id)) return;
        foreach (var m in modules.Where(m => m.id != selected.id))
        {
            if (!graph.relations.Any(r => (selected.entityIds.Contains(r.from) && m.entityIds.Contains(r.to)) || (selected.entityIds.Contains(r.to) && m.entityIds.Contains(r.from)))) continue;
            var line = new GameObject("Selected relation"); var renderer = line.AddComponent<LineRenderer>();
            renderer.sharedMaterial = glow; renderer.startWidth = renderer.endWidth = .015f;
            renderer.positionCount = 2; renderer.SetPositions(new[] { positions[selected.id], positions[m.id] }); visuals.Add(line);
        }
    }
    void Styles()
    {
        if (title != null) return;
        title = new GUIStyle(GUI.skin.label) { fontSize = 30, fontStyle = FontStyle.Bold };
        heading = new GUIStyle(GUI.skin.label) { fontSize = 18, fontStyle = FontStyle.Bold, wordWrap = true };
        body = new GUIStyle(GUI.skin.label) { fontSize = 14, wordWrap = true };
        tiny = new GUIStyle(body) { fontSize = 12 };
        button = new GUIStyle(GUI.skin.button) { fontSize = 13, alignment = TextAnchor.MiddleLeft, padding = new RectOffset(12, 10, 8, 8), wordWrap = true };
        button.normal.background = Flat(new Color(.10f, .13f, .18f));
        button.hover.background = Flat(new Color(.15f, .21f, .27f));
        button.active.background = Flat(new Color(.18f, .29f, .32f));
        button.normal.textColor = new Color(.84f, .9f, .95f);
        button.border = new RectOffset();
        textArea = new GUIStyle(GUI.skin.textArea) { fontSize = 13, wordWrap = true };
        foreach (var s in new[] { title, heading, body, tiny }) s.normal.textColor = new Color(.82f, .87f, .94f);
    }
    void Fill(Rect r, Color c) { var old = GUI.color; GUI.color = c; GUI.DrawTexture(r, Texture2D.whiteTexture); GUI.color = old; }
    Texture2D Flat(Color color) { var texture = new Texture2D(1, 1); texture.SetPixel(0, 0, color); texture.Apply(); skinTextures.Add(texture); return texture; }
    string ShortName(Module m)
    {
        var name = m.name.Split('/').Last();
        return name.Length > 28 ? name.Substring(0, 25) + "..." : name;
    }
    bool IsObserved(Module m) => observation != null && graph.entities.Any(e => m.entityIds.Contains(e.id) && e.anchors.Any(a => observation.sourcePaths.Contains(a.path)));
    bool Button(Rect r, string label) => GUI.Button(r, label, button);
    void OnGUI()
    {
        GUI.matrix = Matrix4x4.Scale(new Vector3(Screen.width / W, Screen.height / H, 1)); Styles();
        Fill(new Rect(0, 0, W, 115), ink); Fill(new Rect(0, 115, 320, H - 115), panel);
        Fill(new Rect(1140, 115, 460, H - 115), panel); Fill(new Rect(320, 775, 820, 125), ink);
        GUI.Label(new Rect(26, 18, 240, 45), "DEPTH / AI", title);
        GUI.Label(new Rect(280, 26, 800, 30), "SOFTWARE AT EVERY SCALE     /     LOCAL WORKSPACE", tiny);
        GUI.Label(new Rect(26, 72, 60, 25), "PROJECT", tiny);
        projectPath = GUI.TextField(new Rect(95, 68, 1040, 30), projectPath);
        GUI.enabled = ready && !busy;
        if (Button(new Rect(1155, 66, 160, 34), "Import project")) Import();
        GUI.enabled = ready && !busy && graph != null;
        if (Button(new Rect(1325, 66, 245, 34), "Refresh source snapshot")) StartCoroutine(Api("/refresh", "{}", ReceiveGraph));
        GUI.enabled = true;
        GUI.Label(new Rect(22, 136, 260, 30), "01 / SOURCE REGIONS", heading);
        var newQuery = GUI.TextField(new Rect(22, 180, 276, 32), query);
        if (newQuery != query) { query = newQuery; page = 0; Rebuild(); }
        var nextFocus = GUI.Toggle(new Rect(22, 222, 270, 26), focusOnly, "Focus selected neighborhood");
        if (nextFocus != focusOnly) { focusOnly = nextFocus; page = 0; Rebuild(); }
        var visible = Visible();
        moduleScroll = GUI.BeginScrollView(new Rect(14, 264, 294, 472), moduleScroll, new Rect(0, 0, 272, Mathf.Max(470, visible.Length * 56)));
        for (int i = 0; i < visible.Length; i++)
            if (Button(new Rect(5, i * 56, 260, 50), (visible[i].id == selected?.id ? ">  " : "   ") + ShortName(visible[i]) + "\n" + visible[i].entityIds.Length + " entities / " + visible[i].evidence.kind))
            { selected = visible[i]; entity = null; detail = ""; page = i / 18; Rebuild(); }
        GUI.EndScrollView();
        GUI.Label(new Rect(22, 756, 272, 110), "STATIC  /  source evidence\nOBSERVED  /  runtime adapter\nINFERRED  /  interpretation\n\nOnly selected relations are drawn.", tiny);
        GUI.Label(new Rect(350, 135, 720, 36), "02 / FUNCTIONAL LANDSCAPE", heading);
        GUI.Label(new Rect(350, 176, 700, 35), "Select to inspect source  /  Scroll to zoom  /  AI grouping requires review", tiny);
        if (Event.current.type == EventType.ScrollWheel && new Rect(330, 220, 800, 500).Contains(Event.current.mousePosition))
        { view.orthographicSize = Mathf.Clamp(view.orthographicSize + Event.current.delta.y * .3f, 4, 16); Event.current.Use(); }
        for (int gx = 350; gx < 1130; gx += 40) Fill(new Rect(gx, 220, 1, 490), new Color(.2f, .45f, .6f, .07f));
        for (int gy = 220; gy < 720; gy += 40) Fill(new Rect(350, gy, 760, 1), new Color(.2f, .45f, .6f, .07f));
        foreach (var m in visible.Skip(page * 18).Take(18))
        {
            if (!positions.TryGetValue(m.id, out var pos)) continue;
            var pixel = view.WorldToScreenPoint(pos); float x = pixel.x * W / Screen.width, y = H - pixel.y * H / Screen.height;
            if (Button(new Rect(x - 92, y + 18, 184, 50), ShortName(m) + "\n" + m.entityIds.Length + (IsObserved(m) ? " entities / observed" : " entities"))) { selected = m; entity = null; detail = ""; Rebuild(); }
        }
        if (Button(new Rect(350, 733, 90, 30), "Previous") && page > 0) { page--; Rebuild(); }
        GUI.Label(new Rect(455, 736, 470, 25), "Page " + (page + 1) + " / " + Mathf.Max(1, Mathf.CeilToInt(visible.Length / 18f)) + "  /  18 visible regions maximum", tiny);
        if (Button(new Rect(1020, 733, 90, 30), "Next") && (page + 1) * 18 < visible.Length) { page++; Rebuild(); }
        GUI.Label(new Rect(350, 800, 760, 68), (busy ? "WORKING / " : "") + status, body);
        DrawInspector();
        if (showReview) DrawReview();
    }
    void DrawInspector()
    {
        GUI.Label(new Rect(1162, 136, 400, 32), "03 / INSPECT & DEVELOP", heading);
        if (selected == null) { GUI.Label(new Rect(1162, 190, 410, 110), "Import an actual project to begin. No synthetic graph is loaded.", body); return; }
        float codeHeight = Mathf.Max(350, body.CalcHeight(new GUIContent(detail), 385));
        detailScroll = GUI.BeginScrollView(new Rect(1157, 184, 430, 420), detailScroll, new Rect(0, 0, 402, 650 + codeHeight + selected.entityIds.Length * 34));
        GUI.Label(new Rect(8, 0, 390, 45), selected.name, heading);
        GUI.Label(new Rect(8, 50, 390, 110), selected.purpose, body);
        GUI.Label(new Rect(8, 166, 390, 65), selected.evidence.kind.ToUpperInvariant() + " / " + selected.evidence.method + "\n" + selected.evidence.detail, tiny);
        int y = 240;
        if (observation != null) { GUI.Label(new Rect(8, y, 390, 65), "OBSERVED SELECTION / " + observation.name + "\nSource component mapping; not proof of behavioral causality.", tiny); y += 70; }
        foreach (var e in graph.entities.Where(e => selected.entityIds.Contains(e.id)))
        {
            if (Button(new Rect(8, y, 383, 30), e.kind + " / " + e.name))
            {
                entity = e;
                detail = e.qualifiedName + "\n" + string.Join("\n", e.anchors.Select(a => a.path + ":" + a.startLine + "-" + a.endLine)) + "\n\n" +
                    string.Join("\n", graph.relations.Where(r => r.from == e.id || r.to == e.id).Select(r => r.kind + " / " + graph.entities.First(t => t.id == r.from).name + " -> " + graph.entities.First(t => t.id == r.to).name + " [" + r.evidence.kind + "]"));
                if (!busy) StartCoroutine(Api("/source/" + e.id, null, json =>
                {
                    if (entity != e) return;
                    var source = JsonUtility.FromJson<SourceResponse>(json);
                    detail += "\n\nSOURCE / " + string.Join("\n\n", source.sources.Select(s => s.anchor.path + "\n" + s.content));
                }));
            }
            y += 34;
        }
        GUI.Label(new Rect(8, y + 14, 385, codeHeight), detail, body);
        GUI.Label(new Rect(8, y + codeHeight + 40, 385, 340), "ANALYSIS DIAGNOSTICS\n" + string.Join("\n", graph.diagnostics.Take(8)), tiny);
        GUI.EndScrollView();
        GUI.Label(new Rect(1162, 621, 410, 25), "AI / REVIEWABLE CHANGE", heading);
        request = GUI.TextArea(new Rect(1162, 658, 410, 98), request, textArea);
        GUI.enabled = !busy;
        if (Button(new Rect(1162, 769, 410, 36), "Ask Codex for a proposal"))
        {
            status = "Codex is reading source and preparing a proposal...";
            StartCoroutine(Api("/propose", JsonUtility.ToJson(new PromptRequest { prompt = request + "\nSelected module: " + selected.id }), json =>
            {
                proposal = JsonUtility.FromJson<Proposal>(json);
                StartCoroutine(Api("/proposals/" + proposal.id, null, preview => { review = preview; showReview = true; status = "Proposal ready for review."; }));
            }));
        }
        if (proposal != null && Button(new Rect(1162, 815, 410, 34), "Review pending proposal")) showReview = true;
        GUI.enabled = true;
        GUI.Label(new Rect(1162, 861, 410, 30), "CLI credentials stay with your local Codex installation.", tiny);
    }
    void DrawReview()
    {
        Fill(new Rect(100, 100, 1400, 700), new Color(.09f, .11f, .16f));
        GUI.Label(new Rect(125, 116, 1300, 45), "REVIEW / BEFORE & AFTER", heading);
        reviewScroll = GUI.BeginScrollView(new Rect(125, 170, 1350, 520), reviewScroll, new Rect(0, 0, 1310, Mathf.Max(520, textArea.CalcHeight(new GUIContent(review), 1300))));
        GUI.TextArea(new Rect(0, 0, 1300, Mathf.Max(520, textArea.CalcHeight(new GUIContent(review), 1300))), review, textArea);
        GUI.EndScrollView();
        GUI.enabled = !busy && proposal != null;
        if (Button(new Rect(125, 720, 360, 44), "Approve and apply this proposal"))
            StartCoroutine(Api("/apply", JsonUtility.ToJson(new ApplyRequest { id = proposal.id, approved = true }), _ => { proposal = null; showReview = false; StartCoroutine(Api("/graph", null, ReceiveGraph)); }));
        GUI.enabled = true;
        if (Button(new Rect(510, 720, 180, 44), "Close review")) showReview = false;
        GUI.Label(new Rect(720, 720, 710, 50), "Source is re-indexed after application. Compilation and behavioral validation are separate, pending steps.", tiny);
    }
    void OnDestroy()
    {
        if (service != null) { try { if (!service.HasExited) service.Kill(); } catch { } service.Dispose(); }
        if (glow != null) Destroy(glow);
        foreach (var texture in skinTextures) Destroy(texture);
    }
}

