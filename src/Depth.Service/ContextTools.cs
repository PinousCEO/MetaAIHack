using System.Text.Json;
using System.Text.Json.Nodes;

namespace Depth;

public record ToolRequest(string Name, string ArgumentsJson);
public record ActivityItem(string Tool, string ModuleId, string Detail, string At);
public sealed class ContextTools(Workspace workspace)
{
    readonly List<ActivityItem> activity = [];
    public ActivityItem[] Activity() { lock (workspace.Sync) return activity.TakeLast(50).ToArray(); }
    public object Call(string name, JsonElement args)
    {
        lock (workspace.Sync)
        {
            var graph = workspace.Require();
            string Text(string key) => args.GetProperty(key).GetString() ?? "";
            var id = args.TryGetProperty("id", out var identifier) ? identifier.GetString() ?? "" : "";
            var detail = name == "modules.search" ? Text("query") : id;
            object result = name switch
            {
                "modules.search" => workspace.Index.Search(graph, Text("query")),
                "modules.get" => new { module = workspace.Index.Get(graph, id), composition = workspace.Index.Compose(graph, id), revision = graph.Revision },
                "source.read" => workspace.Index.ReadSource(graph, id, args.TryGetProperty("wholeFile", out var whole) && whole.GetBoolean()),
                "modules.impact" => workspace.Impact(new(id, Text("revision"))),
                "modules.context" => workspace.Context(new(id, Text("revision"))),
                "changes.review" => workspace.Preview(id),
                "modules.record" => workspace.Index.Record(graph, JsonSerializer.Deserialize<NoteRequest>(args, Wire.Json)!),
                "changes.propose" => workspace.Register(JsonSerializer.Deserialize<Proposal>(args, Wire.Json) ?? throw new InvalidOperationException("Invalid proposal.")),
                _ => throw new InvalidOperationException("Unknown project tool.")
            };
            activity.Add(new(name, id, detail.Length > 200 ? detail[..200] : detail, DateTimeOffset.UtcNow.ToString("HH:mm:ss")));
            if (activity.Count > 200) activity.RemoveRange(0, activity.Count - 200);
            return result;
        }
    }
    static JsonObject ObjectSchema(params (string Name, string Type)[] fields)
    {
        var properties = new JsonObject(); var required = new JsonArray();
        foreach (var f in fields) { properties[f.Name] = new JsonObject { ["type"] = f.Type }; required.Add(f.Name); }
        return new JsonObject { ["type"] = "object", ["properties"] = properties, ["required"] = required, ["additionalProperties"] = false };
    }
    public static JsonArray Definitions()
    {
        JsonObject Tool(string name, string description, JsonNode schema) => new() { ["name"] = name, ["description"] = description, ["inputSchema"] = schema };
        return [
            Tool("modules.search", "Search source-backed module purpose, names and design notes. Retrieve only relevant context.", ObjectSchema(("query", "string"))),
            Tool("modules.get", "Read one canonical module record, source anchors, properties and dependency composition.", ObjectSchema(("id", "string"))),
            Tool("source.read", "Read exact indexed source, with its hash; wholeFile=true is needed for complete replacement proposals.", ObjectSchema(("id", "string"), ("wholeFile", "boolean"))),
            Tool("modules.impact", "Read potential reverse impact and one source-evidenced path per user. Excludes containment; not runtime verification.", ObjectSchema(("id", "string"), ("revision", "string"))),
            Tool("modules.context", "Get the SAME bounded context packet shown to the human: canonical IDs, source excerpts, design-note status and impact paths. Truncation is explicit; characters are not token counts.", ObjectSchema(("id", "string"), ("revision", "string"))),
            Tool("changes.review", "Read a pending proposal's source diff, changed declarations, potential impact, hash/syntax checks and unrun build/runtime checks. Does not apply.", ObjectSchema(("id", "string"))),
            Tool("modules.record", "Record a concise source-grounded purpose, creation reason and design rationale; never store hidden chain-of-thought.", ObjectSchema(("id", "string"), ("revision", "string"), ("purpose", "string"), ("creationReason", "string"), ("rationale", "string"))),
            Tool("changes.propose", "Create a reviewable source proposal only. id must be empty; edits use exact indexed hashes. Does not apply changes.", JsonNode.Parse(Workspace.ProposalJsonSchema)!)
        ];
    }
}
