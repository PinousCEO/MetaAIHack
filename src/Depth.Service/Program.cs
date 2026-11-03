using Depth;
using System.Security.Cryptography;

if(args.Contains("--acceptance-agent-test")){
    int projectIndex=Array.IndexOf(args,"--project");if(projectIndex<0||projectIndex+1>=args.Length)throw new ArgumentException("Specify an isolated --project.");
    await AcceptanceScenarios.Agent(args[projectIndex+1],args.Contains("--python-https"));return;
}
if(args.Contains("--acceptance-test")){
    int index=Array.IndexOf(args,"--rounds");int rounds=index<0?3:int.Parse(args[index+1]);
    await AcceptanceScenarios.Run(args.Contains("--fixture"),rounds,args.Contains("--python-https"));return;
}
if(args.Contains("--check-meta")){
    var result=System.Text.Json.JsonSerializer.SerializeToElement(await MetaConnectivity.Check(args.Contains("--probe")),Wire.Json);
    Console.WriteLine(System.Text.Json.JsonSerializer.Serialize(result,Wire.Json));Environment.ExitCode=result.GetProperty("status").GetString()=="connected"?0:1;return;
}
if (args.Contains("--self-test")) { SelfTest.Run(); return; }
if (args.Contains("--meta-self-test")) {
    int count=0;void Check(bool value,string name){if(!value)throw new Exception("FAIL "+name);Console.WriteLine("PASS "+name);count++;}
    void Reject(Action action,string name){try{action();}catch(InvalidOperationException){Check(true,name);return;}throw new Exception("FAIL "+name);}
    var directory=Path.GetFullPath(Path.Combine("artifacts","meta-test-"+Guid.NewGuid().ToString("N")));MetaFeaturesTest.Run(directory,Check,Reject);Console.WriteLine(count+" Meta workflow assertions passed. Live model inference was not exercised.");return;
}
if (args.Length >= 3 && args[0] == "--capture-analysis")
{
    var manifest = CompilerConfiguration.Capture(args[1], args.Skip(2).ToArray());
    Console.WriteLine("Captured " + manifest.Projects.Length + " compiler project(s) into depth.analysis.json."); return;
}
if (args.Length is 3 or 7 && args[0] == "--mcp" && args[1] == "--connection")
{
    if (args.Length == 7 && (args[3] != "--project-id" || args[5] != "--revision")) throw new ArgumentException("Expected --project-id and --revision.");
    await McpBridge.Run(args[2], args.Length == 7 ? args[4] : null, args.Length == 7 ? args[6] : null); return;
}
if (args.Length == 3 && args[0] == "--export-view")
{
    var graph = new Indexer().Scan(args[1]);
    var sources = graph.Files.Where(f => SourceAccess.EditableLanguage(f.Language))
        .ToDictionary(f => f.Path, f => File.ReadAllText(SourceAccess.Resolve(graph.Root, f.Path)));
    var output = Path.GetFullPath(args[2]);
    Directory.CreateDirectory(Path.GetDirectoryName(output)!);
    File.WriteAllText(output, "window.DEPTH_PROJECT = " + System.Text.Json.JsonSerializer.Serialize(new { graph, sources }, Wire.Json) + ";", new System.Text.UTF8Encoding(false));
    Console.WriteLine($"Exported {graph.Entities.Length} entities, {graph.Relations.Length} relations, {graph.Files.Length} sources to {output}");
    return;
}
var builder = WebApplication.CreateBuilder(args);
builder.WebHost.UseUrls("http://127.0.0.1:" + (Environment.GetEnvironmentVariable("DEPTH_PORT") ?? "43821"));
builder.Services.ConfigureHttpJsonOptions(o => o.SerializerOptions.PropertyNamingPolicy = System.Text.Json.JsonNamingPolicy.CamelCase);
var app = builder.Build();
// A packaged desktop service must not survive a renderer-host crash or forced exit.
using var parentWatch = int.TryParse(Environment.GetEnvironmentVariable("DEPTH_PARENT_PID"), out var parentId) && parentId > 0
    ? new Timer(_ => {
        try { using var parent = System.Diagnostics.Process.GetProcessById(parentId); if (parent.HasExited) app.Lifetime.StopApplication(); }
        catch (ArgumentException) { app.Lifetime.StopApplication(); }
        catch (InvalidOperationException) { app.Lifetime.StopApplication(); }
        catch (System.ComponentModel.Win32Exception) { app.Lifetime.StopApplication(); }
    }, null, TimeSpan.FromSeconds(2), TimeSpan.FromSeconds(2)) : null;
var token = Environment.GetEnvironmentVariable("DEPTH_TOKEN") ?? Convert.ToHexString(RandomNumberGenerator.GetBytes(32));
var store = Path.GetFullPath(Environment.GetEnvironmentVariable("DEPTH_STORAGE") ?? ".depth");
Directory.CreateDirectory(store);
File.WriteAllText(Path.Combine(store, "service.token"), token);
var workspace = new Workspace(store);
var gate = workspace.Sync;
var contextTools = new ContextTools(workspace);
var apiAgent = new ApiAgent(workspace, contextTools);
var metaConfiguration=MetaConfiguration.Load();
var metaModel = new MetaModel(configuration:metaConfiguration);
var metaAgent = new MetaAgent(workspace, contextTools, metaModel);
var transformations = new ModuleTransformations(workspace,metaModel);
var assets = new MetaAssets(store,workspace,configuration:metaConfiguration);
File.WriteAllText(Path.Combine(store, "connection.json"), System.Text.Json.JsonSerializer.Serialize(new { endpoint = "http://127.0.0.1:" + (Environment.GetEnvironmentVariable("DEPTH_PORT") ?? "43821"), token }, Wire.Json));
app.Use(async (context, next) =>
{
    if (context.Request.Headers.ContainsKey("Origin") || context.Request.Headers["X-Depth-Token"] != token)
    { context.Response.StatusCode = 403; return; }
    try { await next(context); }
    catch (Exception error) when (error is not OutOfMemoryException)
    { context.Response.StatusCode = 400; await context.Response.WriteAsJsonAsync(new { error = error.Message }); }
});
app.MapGet("/health", () => new { status = "ready", version = "0.2.0" });
app.MapGet("/meta/config",()=>metaConfiguration.Public());
app.MapPost("/meta/check",()=>MetaConnectivity.Check(probe:true));
app.MapPost("/import", (ImportRequest r) => { lock (gate) return workspace.Import(r.Path); });
app.MapPost("/refresh", () => { lock (gate) return workspace.Refresh(); });
app.MapGet("/graph", () => { lock (gate) return workspace.Require(); });
app.MapGet("/modules/catalog", () => { lock(gate) return workspace.Knowledge.Catalog(workspace.Refresh()); });
app.MapPost("/modules/analyze", (ModuleAnalysisRequest r,CancellationToken cancel)=>workspace.Knowledge.Analyze(r,metaModel,cancel));
app.MapPost("/modules/explanation", (ExplanationRequest r)=>workspace.Knowledge.Explain(r));
app.MapPost("/modules/source", (ImportRequest r)=> { lock(gate) return transformations.Inspect(r.Path); });
app.MapPost("/modules/transform", (ModuleTransformRequest r,CancellationToken cancel)=>transformations.Propose(r,cancel));
app.MapGet("/assets",()=>new{items=assets.List()});
app.MapPost("/assets/generate",(MetaAssetRequest r,CancellationToken cancel)=>assets.Generate(r,cancel));
app.MapPost("/assets/import",(MetaAssetImport r)=>assets.Import(r));
app.MapGet("/assets/{id}/content",(string id)=>{var content=assets.Content(id);return Results.Bytes(content.Bytes,content.Type);});
app.MapGet("/search", (string? q) => { lock (gate) return workspace.Require().Entities.Where(e => e.QualifiedName.Contains(q ?? "", StringComparison.OrdinalIgnoreCase)).Take(100).ToArray(); });
app.MapGet("/source/{id}", (string id) => { lock (gate) return workspace.Source(id); });
app.MapGet("/project-assets/{id}", (string id) => { lock (gate) return workspace.AssetImage(id); });
app.MapPost("/propose", async (PromptRequest r) => await Task.Run(() => workspace.Propose(r.Prompt, r.ModuleIds, r.Revision, r.ProjectId)));
app.MapGet("/view", () => { lock (gate) return workspace.Index.Build(workspace.Require()); });
app.MapGet("/composition/{id}", (string id) => { lock (gate) return workspace.Index.Compose(workspace.Require(), id); });
app.MapPost("/impact", (ContextRequest r) => { lock (gate) return workspace.Impact(r); });
app.MapPost("/context/packet", (ContextRequest r) => { lock (gate) return workspace.Context(r); });
app.MapPost("/property/draft", (PropertyRequest r) => { lock (gate) return workspace.Index.DraftPreview(workspace.Require(), r); });
app.MapPost("/property/propose", (PropertyRequest r) => { lock (gate) return workspace.Index.ProposeProperty(workspace, r); });
app.MapPost("/context/call", (ToolRequest r) => {
    lock (gate) {
        if (r.ProjectId != null || r.Revision != null) workspace.RequireSnapshot(r.ProjectId ?? "", r.Revision ?? "");
        using var arguments = System.Text.Json.JsonDocument.Parse(r.ArgumentsJson); return contextTools.Call(r.Name, arguments.RootElement);
    }
});
app.MapGet("/activity", () => new { items = contextTools.Activity() });
app.MapGet("/pending", () => { lock (gate) return new { proposals = workspace.Pending }; });
app.MapPost("/agent", (AgentRequest r, CancellationToken cancel) => r.Provider is "meta" or "meta-local" or "meta-legacy" ? metaAgent.Run(r,cancel)
    : r.Provider=="openai-legacy" ? apiAgent.Run(r,cancel) : throw new InvalidOperationException("Unknown explicitly selected provider."));
app.MapGet("/proposals/{id}", (string id) => { lock (gate) return workspace.Preview(id); });
app.MapGet("/validation/profile", () => Results.Text(System.Text.Json.JsonSerializer.Serialize(workspace.Validation.Profile(), Wire.Json), "application/json"));
app.MapPost("/validation/profile", (ValidationProfile profile) => workspace.Validation.SaveProfile(profile));
app.MapPost("/proposals/{id}/validate", (string id, ApplyRequest r, CancellationToken cancel) => workspace.Validation.Run(id, r.Approved, cancel));
app.MapGet("/proposals/{id}/validation", (string id) => Results.Text(System.Text.Json.JsonSerializer.Serialize(workspace.Validation.Latest(id), Wire.Json), "application/json"));
app.MapPost("/proposals/{id}/validation/cancel", (string id) => new { canceled = workspace.Validation.Cancel(id) });
app.MapPost("/apply", (ApplyRequest r) => { lock (gate) return workspace.Apply(r.Id, r.Approved); });
app.MapPost("/dismiss", (ApplyRequest r) => { lock (gate) { workspace.Dismiss(r.Id); return new { dismissed = true }; } });
app.MapGet("/recovery", () => { lock (gate) return new { items = workspace.Recovery() }; });
app.MapGet("/history", () => { lock (gate) return new { changes = workspace.History(), recovery = workspace.Recovery() }; });
app.MapPost("/history/{id}/undo", (string id) => { lock (gate) return workspace.ProposeUndo(id); });
app.MapPost("/recovery/restore", (ApplyRequest r) => { lock (gate) return workspace.Restore(r.Id, r.Approved); });
app.MapPost("/runtime/select", (RuntimeSelection r) => { lock (gate) { workspace.Observe(r); return new { accepted = true }; } });
app.MapGet("/runtime/selection", () => { lock (gate) return Results.Text(System.Text.Json.JsonSerializer.Serialize(workspace.Selection, Wire.Json), "application/json"); });
app.Run();
record ImportRequest(string Path);
record PromptRequest(string Prompt, string[]? ModuleIds, string? Revision, string? ProjectId);
record ApplyRequest(string Id, bool Approved);
