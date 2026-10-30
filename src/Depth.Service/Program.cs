using Depth;
using System.Security.Cryptography;

if (args.Contains("--self-test")) { SelfTest.Run(); return; }
if (args.Length == 3 && args[0] == "--mcp" && args[1] == "--connection") { await McpBridge.Run(args[2]); return; }
if (args.Length == 3 && args[0] == "--export-view")
{
    var graph = new Indexer().Scan(args[1]);
    var sources = graph.Files.ToDictionary(f => f.Path, f => File.ReadAllText(SourceAccess.Resolve(graph.Root, f.Path)));
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
var token = Environment.GetEnvironmentVariable("DEPTH_TOKEN") ?? Convert.ToHexString(RandomNumberGenerator.GetBytes(32));
var store = Path.GetFullPath(Environment.GetEnvironmentVariable("DEPTH_STORAGE") ?? ".depth");
Directory.CreateDirectory(store);
File.WriteAllText(Path.Combine(store, "service.token"), token);
var workspace = new Workspace(store);
var gate = workspace.Sync;
var contextTools = new ContextTools(workspace);
var apiAgent = new ApiAgent(workspace, contextTools);
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
app.MapPost("/import", (ImportRequest r) => { lock (gate) return workspace.Import(r.Path); });
app.MapPost("/refresh", () => { lock (gate) return workspace.Refresh(); });
app.MapGet("/graph", () => { lock (gate) return workspace.Require(); });
app.MapGet("/search", (string? q) => { lock (gate) return workspace.Require().Entities.Where(e => e.QualifiedName.Contains(q ?? "", StringComparison.OrdinalIgnoreCase)).Take(100).ToArray(); });
app.MapGet("/source/{id}", (string id) => { lock (gate) return workspace.Source(id); });
app.MapPost("/propose", async (PromptRequest r) => await Task.Run(() => workspace.Propose(r.Prompt, r.ModuleIds, r.Revision)));
app.MapGet("/view", () => { lock (gate) return workspace.Index.Build(workspace.Require()); });
app.MapGet("/composition/{id}", (string id) => { lock (gate) return workspace.Index.Compose(workspace.Require(), id); });
app.MapPost("/impact", (ContextRequest r) => { lock (gate) return workspace.Impact(r); });
app.MapPost("/context/packet", (ContextRequest r) => { lock (gate) return workspace.Context(r); });
app.MapPost("/property/draft", (PropertyRequest r) => { lock (gate) return workspace.Index.DraftPreview(workspace.Require(), r); });
app.MapPost("/property/propose", (PropertyRequest r) => { lock (gate) return workspace.Index.ProposeProperty(workspace, r); });
app.MapPost("/context/call", (ToolRequest r) => { using var arguments = System.Text.Json.JsonDocument.Parse(r.ArgumentsJson); return contextTools.Call(r.Name, arguments.RootElement); });
app.MapGet("/activity", () => new { items = contextTools.Activity() });
app.MapGet("/pending", () => { lock (gate) return new { proposals = workspace.Pending }; });
app.MapPost("/agent", (AgentRequest r, CancellationToken cancel) => apiAgent.Run(r, cancel));
app.MapGet("/proposals/{id}", (string id) => { lock (gate) return workspace.Preview(id); });
app.MapPost("/apply", (ApplyRequest r) => { lock (gate) return workspace.Apply(r.Id, r.Approved); });
app.MapPost("/dismiss", (ApplyRequest r) => { lock (gate) { workspace.Dismiss(r.Id); return new { dismissed = true }; } });
app.MapPost("/runtime/select", (RuntimeSelection r) => { lock (gate) { workspace.Observe(r); return new { accepted = true }; } });
app.MapGet("/runtime/selection", () => { lock (gate) return Results.Text(System.Text.Json.JsonSerializer.Serialize(workspace.Selection, Wire.Json), "application/json"); });
app.Run();
record ImportRequest(string Path);
record PromptRequest(string Prompt, string[]? ModuleIds, string? Revision);
record ApplyRequest(string Id, bool Approved);
