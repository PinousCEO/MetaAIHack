using System.Text.Json;

namespace Depth;

public static class WebAnalysis
{
    record Declaration(string Key, string Name, string QualifiedName, string Kind, string Path, int StartLine, int EndLine);
    record Edge(string From, string To, string Kind, string Path, int Offset, int StartLine, int EndLine);
    record Output(string Schema, Declaration[] Declarations, Edge[] Relations, string[] Diagnostics, string[] Inputs, string Configuration, AdapterValue[]? Values = null);
    public static void Read(string root, string project, Dictionary<string,string> sources, Dictionary<string,Entity> entities,
        List<Relation> relations, List<SourceFile> files, List<string> notes, List<SourceValue>? values = null)
    {
        var adapter = Environment.GetEnvironmentVariable("DEPTH_WEB_ADAPTER");
        if (string.IsNullOrEmpty(adapter)) { notes.Add("Web sources hashed. Set DEPTH_WEB_ADAPTER to adapters/web/index.mjs for TypeScript/JavaScript/JSX source analysis."); return; }
        var result = Processes.Run(Environment.GetEnvironmentVariable("DEPTH_NODE_EXECUTABLE") ?? "node", [adapter, root], root, "", 120);
        if (result.ExitCode != 0) { notes.Add("Web adapter failed: " + result.Error); return; }
        var output = JsonSerializer.Deserialize<Output>(result.Output, Wire.Json) ?? throw new InvalidOperationException("Invalid web adapter response.");
        if (output.Schema != "1") throw new InvalidOperationException("Unsupported web adapter schema.");
        string Id(string key) => Wire.Id("entity", project + ":web:" + key);
        foreach (var d in output.Declarations)
        {
            if (!sources.TryGetValue(d.Path, out var source)) continue;
            if (File.ReadAllText(SourceAccess.Resolve(root, d.Path)) != source) throw new InvalidOperationException("Web source changed during analysis; refresh again.");
            var id = Id(d.Key); var anchor = new Anchor(d.Path, d.StartLine, d.EndLine, Wire.Hash(source));
            if (entities.TryGetValue(id, out var old)) entities[id] = old with { Anchors = old.Anchors.Append(anchor).ToArray() };
            else entities[id] = new(id, d.Name, d.Kind, SourceAccess.Language(d.Path), d.QualifiedName, [anchor]);
        }
        foreach (var v in output.Values ?? [])
            if (entities.ContainsKey(Id(v.Owner))) values?.Add(new(Id(v.Owner), v.Path, v.Offset, v.Length, v.Line, v.Kind, v.Value, v.Literal, v.Label, v.Type));
        foreach (var edge in output.Relations)
            if (sources.TryGetValue(edge.Path, out var source) && entities.ContainsKey(Id(edge.From)) && entities.ContainsKey(Id(edge.To)))
                relations.Add(new(Wire.Id("rel", project + ":web:" + edge.From + ":" + edge.To + ":" + edge.Kind + ":" + edge.Offset), Id(edge.From), Id(edge.To), edge.Kind,
                    new("static", "typescript-symbol-binding", "Resolved using " + output.Configuration + "; dynamic dispatch and DOM runtime not observed"), new(edge.Path, edge.StartLine, edge.EndLine, Wire.Hash(source))));
        foreach (var input in output.Inputs.Distinct())
            if (files.All(f => f.Path != input)) files.Add(new(input, Wire.Hash(File.ReadAllText(SourceAccess.Resolve(root, input))), "analysis-config"));
        notes.AddRange(output.Diagnostics);
        notes.Add("Web: TypeScript compiler declarations and bound references using " + output.Configuration + ". DOM/React runtime selection, Vue/Svelte templates, dynamic calls and external dependency fingerprinting are not covered.");
    }
}
