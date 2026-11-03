using System.Text.Json;
using System.Text.Json.Nodes;

namespace Depth;

public record ToolRequest(string Name, string ArgumentsJson, string? ProjectId = null, string? Revision = null);
public record ActivityItem(string Tool, string ModuleId, string Detail, string At);
public sealed class ContextTools(Workspace workspace)
{
    readonly List<ActivityItem> activity = [];
    public ActivityItem[] Activity() { lock (workspace.Sync) return activity.TakeLast(50).ToArray(); }
    public object Call(string name, JsonElement args)=>CallCore(name,args,null);
    internal object CallFromMeta(string name,JsonElement args,string model)=>CallCore(name,args,model);
    object CallCore(string name, JsonElement args,string? metaModel)
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
                "modules.catalog" => workspace.Knowledge.Search(graph,Text("query")),
                "modules.contract" => workspace.Knowledge.CompactContract(graph,id),
                "modules.explanation" => workspace.Knowledge.Explain(new(id,graph.ProjectId,Text("revision"),Text("level"))),
                "modules.neighborhood" => workspace.Knowledge.Neighborhood(graph,id),
                "modules.get" => new { module = workspace.Index.Get(graph, id), composition = workspace.Index.Compose(graph, id), graph.Revision, graph.ProjectId },
                "source.read" => workspace.Index.ReadSource(graph, id, args.TryGetProperty("wholeFile", out var whole) && whole.GetBoolean()),
                "modules.impact" => workspace.Impact(new(id, Text("revision"))),
                "modules.context" => workspace.Context(new(id, Text("revision"))),
                "changes.review" => workspace.Preview(id),
                "modules.record" => workspace.Index.Record(graph, JsonSerializer.Deserialize<NoteRequest>(args, Wire.Json)!),
                "changes.propose" => Propose(args,metaModel),
                _ => throw new InvalidOperationException("Unknown project tool.")
            };
            activity.Add(new(name, id, detail.Length > 200 ? detail[..200] : detail, DateTimeOffset.UtcNow.ToString("HH:mm:ss")));
            if (activity.Count > 200) activity.RemoveRange(0, activity.Count - 200);
            return result;
        }
    }
    object Propose(JsonElement args,string? metaModel)
    {
        var proposal=JsonSerializer.Deserialize<Proposal>(args,Wire.Json)??throw new InvalidOperationException("Invalid proposal.");
        return metaModel==null?workspace.Register(proposal,true):workspace.RegisterMetaProposal(proposal,metaModel);
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
            Tool("modules.catalog", "Search compact functional modules: source-bound Meta explanations and weighted graph partitions. Start here before reading code.",ObjectSchema(("query","string"))),
            Tool("modules.contract", "Read a compact functional module contract. Accepts the canonical functional module ID or a selected source entity ID, resolved to its owning module. Returns the canonical ID, purpose, decisions, constraints, source quotes and freshness. Beginner tutorials are omitted. Inferred intent is not author testimony.",ObjectSchema(("id","string"))),
            Tool("modules.explanation", "Read the SAME source-grounded explanation shown to the human, with level beginner, intermediate or expert. All levels share facts; beginner adds definitions and illustrative examples. No inference call. Includes recorded Meta change reasons separately from inferred intent.",ObjectSchema(("id","string"),("revision","string"),("level","string"))),
            Tool("modules.neighborhood", "Retrieve functional context ranked by personalized PageRank over typed module dependencies, without rereading the whole repository.",ObjectSchema(("id","string"))),
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
