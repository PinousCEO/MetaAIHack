using System.Globalization;
using System.Text.Json;
using System.Xml.Linq;
using Microsoft.CodeAnalysis;
using Microsoft.CodeAnalysis.CSharp;
using Microsoft.CodeAnalysis.CSharp.Syntax;

namespace Depth;

public record NumericProperty(string Key, string Label, string Value, string Path, string ExpectedHash, bool Editable, string Kind = "number", int Line = 0, string Literal = "", string Type = "");
public record ModuleCard(string Id, string Name, string Kind, string Group, string Purpose, string CreationReason,
    string Rationale, string NoteOrigin, string NoteStatus, string[] EntityIds, Anchor[] Anchors, NumericProperty[] Properties);
public record PreviewProduct(string Name, string Detail, string Image, double Price, string AssetId);
public record PreviewBinding(string Key,string Id);
public record PreviewLabel(string Key,string Text);
public record BehaviorPreview(string Title, string Action, string EntryId, string PropertyId, double Subtotal, double Rate,
    double Total, string Expression, string Evidence, PreviewProduct[] Products, string ViewId, PreviewBinding[] Bindings, PreviewLabel[] Labels);
public record WorkspaceView(string Root, string Revision, ModuleCard[] Cards, Module[] Groups, Relation[] Relations,
    BehaviorPreview? Preview, int SourceCount, string[] Diagnostics, string ProjectId = "", string ValueEditing = "ast-literal-1");
public record Composition(string RootId, string Revision, string[] MemberIds, Relation[] Relations, int TotalRelated, string Scope);
public record ModuleNote(string Id, string Purpose, string CreationReason, string Rationale, string Author, Anchor[] Evidence);
public record PropertyValueChange(string Id, string Value, string? Key);
public record PropertyRequest(string Id, string Value, string Revision, string? Key = null, PropertyValueChange[]? Changes = null);
public record NoteRequest(string Id, string Revision, string Purpose, string CreationReason, string Rationale);

/// <summary>The same source-backed context index is used by the native UI, API agent and MCP tools.</summary>
public sealed class WorkspaceIndex(string storage)
{
    readonly Dictionary<(string Id, string Key), SourceValue> bindings = [];
    readonly Dictionary<string, string> sources = [];
    WorkspaceView? cached;
    string noteStamp = "";
    public void Invalidate() { cached = null; }
    string NotesPath(Graph g) => Path.Combine(storage, g.ProjectId + ".notes.json");

    public WorkspaceView Build(Graph graph)
    {
        var notesPath = NotesPath(graph);
        var stamp = File.Exists(notesPath) ? File.GetLastWriteTimeUtc(notesPath).Ticks.ToString() : "";
        if (cached?.Revision == graph.Revision && cached.ProjectId == graph.ProjectId && stamp == noteStamp) return cached;
        bindings.Clear(); sources.Clear(); noteStamp = stamp;
        foreach (var file in graph.Files.Where(f => SourceAccess.EditableLanguage(f.Language)))
            sources[file.Path] = File.ReadAllText(SourceAccess.Resolve(graph.Root, file.Path));
        var trees = sources.Where(s => s.Key.EndsWith(".cs")).ToDictionary(s => s.Key, s => CSharpSyntaxTree.ParseText(s.Value, CompilerConfiguration.ParseOptions(graph.Root, s.Key)).GetRoot());
        var sourceValues = (graph.Values ?? []).Concat(SourceValues.CSharp(graph, sources)).ToLookup(v => v.EntityId);
        var notes = File.Exists(notesPath) ? JsonSerializer.Deserialize<ModuleNote[]>(File.ReadAllText(notesPath), Wire.Json) ?? [] : [];
        var projectNotes = SourceAccess.Resolve(graph.Root, "depth.notes.json");
        if (File.Exists(projectNotes) && new FileInfo(projectNotes).Length < 200000)
        {
            foreach (var note in JsonSerializer.Deserialize<ProjectNote[]>(File.ReadAllText(projectNotes), Wire.Json) ?? [])
            {
                var matches = graph.Entities.Where(e => e.Name == note.Entity && e.Anchors.Any(a => a.Path == note.Path)).ToArray();
                if (matches.Length != 1 || notes.Any(n => n.Id == matches[0].Id)) continue;
                var entity = matches[0];
                notes = notes.Append(new ModuleNote(entity.Id, note.Purpose, note.CreationReason, note.Rationale, note.Author,
                    entity.Anchors.Select(a => a with { ContentHash = note.ExpectedHash }).ToArray())).ToArray();
            }
        }
        var cards = new List<ModuleCard>();
        foreach (var entity in graph.Entities)
        {
            var anchor = entity.Anchors[0];
            var group = graph.Modules.FirstOrDefault(m => m.EntityIds.Contains(entity.Id))?.Name ?? "Assets";
            var properties = new List<NumericProperty>();
            SyntaxNode? syntax = null;
            if (trees.TryGetValue(anchor.Path, out var tree))
            {
                syntax = tree.DescendantNodes().FirstOrDefault(n => n.GetLocation().GetLineSpan().StartLinePosition.Line + 1 == anchor.StartLine &&
                    (n is VariableDeclaratorSyntax v && v.Identifier.Text == entity.Name || n is MethodDeclarationSyntax m && m.Identifier.Text == entity.Name || n is TypeDeclarationSyntax t && t.Identifier.Text == entity.Name));
            }
            foreach (var value in sourceValues[entity.Id].DistinctBy(v => (v.Path, v.Offset)))
            {
                if (!sources.TryGetValue(value.Path, out var content) || !SourceValues.Matches(value, content)) continue;
                var expected = graph.Files.SingleOrDefault(f => f.Path == value.Path)?.Hash;
                if (expected == null || Wire.Hash(content) != expected) continue;
                var key = SourceValues.Key(value); bindings[(entity.Id, key)] = value;
                properties.Add(new(key, value.Label, value.Value, value.Path, expected, true, value.Kind, value.Line, value.Literal, value.Type));
            }
            var documentation = Documentation(syntax);
            var note = notes.FirstOrDefault(n => n.Id == entity.Id);
            var stale = note != null && note.Evidence.Any(a => !graph.Files.Any(f => f.Path == a.Path && f.Hash == a.ContentHash));
            cards.Add(new(entity.Id, entity.Name, entity.Kind, group,
                note?.Purpose ?? documentation.Summary,
                note?.CreationReason ?? "", note?.Rationale ?? documentation.Remarks,
                note == null ? (documentation.Summary.Length > 0 ? "source documentation" : "not recorded") : "AI authored · " + note.Author,
                stale ? "needs review" : note == null ? "source only" : "source matched",
                [entity.Id], entity.Anchors, properties.ToArray()));
        }
        var diagnostics = graph.Diagnostics.ToList();
        BehaviorPreview? preview = null;
        try { preview = BuildPreview(graph, cards.ToArray(), null); }
        catch (Exception e) when (e is not OutOfMemoryException) { diagnostics.Add("Behavior preview unavailable: " + e.Message); }
        var relations = graph.Relations.ToList();
        cached = new(graph.Root, graph.Revision, cards.ToArray(), graph.Modules, relations.ToArray(), preview,
            graph.Files.Count(f => SourceAccess.EditableLanguage(f.Language)), diagnostics.ToArray(), graph.ProjectId);
        return cached;
    }
    static (string Summary, string Remarks) Documentation(SyntaxNode? syntax)
    {
        if (syntax == null) return ("", "");
        try
        {
            var doc = syntax.GetLeadingTrivia().Select(t => t.GetStructure()).OfType<DocumentationCommentTriviaSyntax>().FirstOrDefault();
            if (doc == null) return ("", "");
            var xml = XElement.Parse("<root>" + string.Join("\n", doc.Content.Select(c => c.ToString())) + "</root>");
            return (xml.Element("summary")?.Value.Trim() ?? "", xml.Element("remarks")?.Value.Trim() ?? "");
        }
        catch { return ("", ""); }
    }
    public ModuleCard Get(Graph graph, string id) => Build(graph).Cards.SingleOrDefault(c => c.Id == id) ?? throw new InvalidOperationException("Unknown module ID.");
    public ModuleCard[] Search(Graph graph, string query) => Build(graph).Cards.Where(c => (c.Name + " " + c.Purpose + " " + c.Rationale + " " + c.Group).Contains(query, StringComparison.OrdinalIgnoreCase)).Take(40).ToArray();
    public Composition Compose(Graph graph, string id)
    {
        var view=Build(graph);var ids=view.Cards.Select(c=>c.Id).ToHashSet();
        if(!ids.Contains(id))throw new InvalidOperationException("Unknown module ID.");
        // Opening a type includes its declared members. A type merely referenced
        // by a method must not pull unrelated sibling methods into that feature.
        var known=view.Relations.Where(r=>ids.Contains(r.From)&&ids.Contains(r.To)).ToArray();
        var ownership=known.Where(r=>r.Kind=="contains").ToLookup(r=>r.From);
        var owned=new HashSet<string>{id};var owners=new Queue<string>();owners.Enqueue(id);
        while(owners.TryDequeue(out var owner))foreach(var relation in ownership[owner])if(owned.Add(relation.To))owners.Enqueue(relation.To);
        var relations=known.Where(r=>r.Kind!="contains"||owned.Contains(r.From)).ToArray();
        var outgoing=relations.ToLookup(r=>r.From);
        var visited=new HashSet<string>{id};var queue=new Queue<string>();queue.Enqueue(id);
        // Assets are inputs: their meaning includes the concrete controls/functions
        // consuming them, not a misleading one-node "independent image" result.
        if(view.Cards.Single(c=>c.Id==id).Kind is "Image" or "Font" or "Model3D")
            foreach(var use in known.Where(r=>r.To==id&&r.Kind!="contains"))if(visited.Add(use.From))queue.Enqueue(use.From);
        while(queue.TryDequeue(out var next))
            foreach(var relation in outgoing[next])if(visited.Add(relation.To))queue.Enqueue(relation.To);
        var edges=relations.Where(r=>visited.Contains(r.From)&&visited.Contains(r.To)).ToArray();
        return new(id,graph.Revision,visited.ToArray(),edges,visited.Count,"Selected declaration, its owned members and complete reachable indexed dependencies; not observed execution order. Unresolved or dynamic dependencies are not inferred.");
    }
    public Proposal ProposeProperty(Workspace workspace, PropertyRequest request)
    {
        var graph = workspace.Refresh();
        if (graph.Revision != request.Revision) throw new InvalidOperationException("Source changed. Refresh before editing.");
        Get(graph, request.Id);
        var changes = request.Changes ?? [new PropertyValueChange(request.Id, request.Value, request.Key)];
        if (changes.Length is < 1 or > 100) throw new InvalidOperationException("Apply between one and 100 values at a time.");
        var replacements = new List<(SourceValue Binding, string Literal)>();
        foreach (var change in changes)
        {
            var candidates = bindings.Where(p => p.Key.Id == change.Id && (change.Key == null || p.Key.Key == change.Key)).Select(p => p.Value).ToArray();
            if (candidates.Length != 1) throw new InvalidOperationException("Select an exact editable source value in this module.");
            var binding = candidates[0]; var source = sources[binding.Path];
            if (!SourceValues.Matches(binding, source)) throw new InvalidOperationException("Source value moved; refresh before editing.");
            var literal = SourceValues.Encode(binding, change.Value, SourceAccess.Language(binding.Path));
            if (literal == binding.Literal) continue;
            replacements.Add((binding, literal));
        }
        if (replacements.Count == 0) throw new InvalidOperationException("The source values are unchanged.");
        var edits = new List<Edit>();
        foreach (var group in replacements.GroupBy(r => r.Binding.Path))
        {
            var source = sources[group.Key]; var content = source; int limit = source.Length;
            foreach (var replacement in group.OrderByDescending(r => r.Binding.Offset))
            {
                var binding = replacement.Binding;
                if (binding.Offset + binding.Length > limit) throw new InvalidOperationException("Value edits overlap or repeat a source location.");
                content = content[..binding.Offset] + replacement.Literal + content[(binding.Offset + binding.Length)..]; limit = binding.Offset;
            }
            edits.Add(new(group.Key, Wire.Hash(source), content));
        }
        var reason = "User edited source values. Exact AST literal replacement; no model inference.\n" + string.Join("\n", replacements.Select(r =>
            r.Binding.Path + ":" + r.Binding.Line + " " + r.Binding.Label + ": " + r.Binding.Literal + " -> " + r.Literal));
        return workspace.Register(new("", graph.Revision, reason, edits.ToArray(), []));
    }

    public BehaviorPreview DraftPreview(Graph graph, PropertyRequest request)
    {
        if (graph.Revision != request.Revision) throw new InvalidOperationException("Preview revision is stale.");
        var view = Build(graph); var card = Get(graph, request.Id);
        if (card.Properties.Length == 0 || !double.TryParse(request.Value, NumberStyles.Float, CultureInfo.InvariantCulture, out var value) || !double.IsFinite(value)) throw new InvalidOperationException("Invalid numeric draft.");
        return BuildPreview(graph, view.Cards, new(request.Id, value)) ?? throw new InvalidOperationException("This project has no behavior preview adapter.");
    }
    public ModuleNote Record(Graph graph, NoteRequest request)
    {
        if (request.Revision != graph.Revision) throw new InvalidOperationException("AI note revision is stale.");
        var card = Get(graph, request.Id);
        foreach (var anchor in card.Anchors)
            if ((card.Kind is "Image" or "Font" ? SourceAccess.HashFile(SourceAccess.Resolve(graph.Root, anchor.Path)) : Wire.Hash(File.ReadAllText(SourceAccess.Resolve(graph.Root, anchor.Path)))) != anchor.ContentHash) throw new InvalidOperationException("Source changed before note recording.");
        if (request.Purpose.Length + request.CreationReason.Length + request.Rationale.Length > 16000) throw new InvalidOperationException("AI note too large.");
        var path = NotesPath(graph);
        var old = File.Exists(path) ? JsonSerializer.Deserialize<ModuleNote[]>(File.ReadAllText(path), Wire.Json) ?? [] : [];
        var note = new ModuleNote(request.Id, request.Purpose, request.CreationReason, request.Rationale, "agent", card.Anchors);
        File.WriteAllText(path, JsonSerializer.Serialize(old.Where(n => n.Id != request.Id).Append(note), Wire.Json));
        Invalidate(); return note;
    }
    public object ReadSource(Graph graph, string id, bool wholeFile)
    {
        var card = Get(graph, id);
        if (card.Kind is "Image" or "Font") return new { id, revision = graph.Revision, sources = card.Anchors.Select(a => new { anchor = a, startLine = 0, content = "Asset: " + a.Path + "\nSHA-256: " + a.ContentHash }).ToArray() };
        return new { id, revision = graph.Revision, sources = card.Anchors.Select(a =>
        {
            var text = File.ReadAllText(SourceAccess.Resolve(graph.Root, a.Path));
            if (Wire.Hash(text) != a.ContentHash) throw new InvalidOperationException("Source changed; refresh before reading.");
            var lines = text.Replace("\r\n", "\n").Split('\n');
            var start = wholeFile ? 1 : Math.Max(1, a.StartLine - 2); var end = wholeFile ? lines.Length : Math.Min(lines.Length, a.EndLine + 2);
            if (text.Length > 500000) throw new InvalidOperationException("Source file exceeds prototype reading limit.");
            return new { anchor = a, startLine = start, content = wholeFile ? text : string.Join("\n", lines.Skip(start - 1).Take(end - start + 1)) };
        }).ToArray() };
    }
    BehaviorPreview? BuildPreview(Graph graph, ModuleCard[] cards, KeyValuePair<string, double>? draft)
    {
        var path = Path.Combine(graph.Root, "depth.preview.json"); if (!File.Exists(path)) return null;
        if (new FileInfo(path).Length > 100000) throw new InvalidOperationException("Preview descriptor too large.");
        var descriptor = JsonSerializer.Deserialize<PreviewDescriptor>(File.ReadAllText(SourceAccess.Resolve(graph.Root, "depth.preview.json")), Wire.Json) ?? throw new InvalidOperationException("Invalid preview descriptor.");
        ModuleCard Resolve(string relative, string name) => cards.Single(c => c.Name == name && c.Anchors.Any(a => a.Path == relative));
        var entry = Resolve(descriptor.EntryPath, descriptor.EntryName);
        var environment = new Dictionary<string, double>(); var ids = new Dictionary<string, string>();
        foreach (var value in descriptor.Values)
        {
            var card = Resolve(value.Path, value.Entity); var property = card.Properties.Single();
            environment.Add(value.Name, draft?.Key == card.Id ? draft.Value.Value : double.Parse(property.Value, CultureInfo.InvariantCulture)); ids[value.Name] = card.Id;
        }
        var expressionCard = Resolve(descriptor.ExpressionPath, descriptor.ExpressionName);
        var anchor = expressionCard.Anchors[0];
        var method = CSharpSyntaxTree.ParseText(sources[anchor.Path]).GetRoot().DescendantNodes().OfType<MethodDeclarationSyntax>()
            .Single(m => m.Identifier.Text == descriptor.ExpressionName && m.GetLocation().GetLineSpan().StartLinePosition.Line + 1 == anchor.StartLine);
        var expression = method.ExpressionBody?.Expression ?? method.Body?.Statements.OfType<ReturnStatementSyntax>().Single().Expression ?? throw new InvalidOperationException("Expected one return expression.");
        var total = Arithmetic(expression, environment);
        var products = descriptor.Products.Take(12).Select(p =>
        {
            var asset = SourceAccess.Resolve(graph.Root, p.Image);
            if (!File.Exists(asset) || !new[] { ".png", ".jpg", ".jpeg" }.Contains(Path.GetExtension(asset).ToLowerInvariant())) throw new InvalidOperationException("Preview image unavailable.");
            var price = Resolve(p.PricePath, p.PriceEntity).Properties.Single().Value;
            return new PreviewProduct(p.Name, p.Detail, p.Image, double.Parse(price, CultureInfo.InvariantCulture), Wire.Id("asset", graph.ProjectId + p.Image));
        }).ToArray();
        using var json=JsonDocument.Parse(File.ReadAllText(path));
        var keys=new[]{"title","action","subtotal","discount","total"}.Concat(Enumerable.Range(0,products.Length).SelectMany(i=>new[]{"name","detail","image","price"}.Select(k=>"product."+i+"."+k))).ToList();
        var labels=json.RootElement.TryGetProperty("labels",out var labelValues)?labelValues.EnumerateObject().Select(p=>new PreviewLabel(p.Name,p.Value.GetString()??"")).ToArray():[];
        keys.AddRange(labels.Select(l=>"label."+l.Key));
        return new(descriptor.Title, descriptor.Action, entry.Id, ids[descriptor.RateVariable], environment[descriptor.SubtotalVariable], environment[descriptor.RateVariable], total,
            expression.ToString(), "Source arithmetic expression + declared view mapping; validation branch and runtime behavior not executed.", products,PreviewSources.Id(graph.ProjectId,"view"),keys.Select(k=>new PreviewBinding(k,PreviewSources.Id(graph.ProjectId,k))).Where(b=>cards.Any(c=>c.Id==b.Id)).ToArray(),labels);
    }
    public static double Arithmetic(ExpressionSyntax expression, IReadOnlyDictionary<string, double> values)
    {
        var result = expression switch
        {
            LiteralExpressionSyntax l when l.IsKind(SyntaxKind.NumericLiteralExpression) => Convert.ToDouble(l.Token.Value, CultureInfo.InvariantCulture),
            IdentifierNameSyntax i when values.TryGetValue(i.Identifier.Text, out var n) => n,
            ParenthesizedExpressionSyntax p => Arithmetic(p.Expression, values),
            PrefixUnaryExpressionSyntax u when u.IsKind(SyntaxKind.UnaryMinusExpression) => -Arithmetic(u.Operand, values),
            PrefixUnaryExpressionSyntax u when u.IsKind(SyntaxKind.UnaryPlusExpression) => Arithmetic(u.Operand, values),
            BinaryExpressionSyntax b when b.IsKind(SyntaxKind.AddExpression) => Arithmetic(b.Left, values) + Arithmetic(b.Right, values),
            BinaryExpressionSyntax b when b.IsKind(SyntaxKind.SubtractExpression) => Arithmetic(b.Left, values) - Arithmetic(b.Right, values),
            BinaryExpressionSyntax b when b.IsKind(SyntaxKind.MultiplyExpression) => Arithmetic(b.Left, values) * Arithmetic(b.Right, values),
            BinaryExpressionSyntax b when b.IsKind(SyntaxKind.DivideExpression) => Arithmetic(b.Left, values) / Arithmetic(b.Right, values),
            _ => throw new InvalidOperationException("Preview supports numeric source expressions only; no project code is executed.")
        };
        if (!double.IsFinite(result)) throw new InvalidOperationException("Preview expression produced a non-finite value.");
        return result;
    }
    sealed record PreviewValue(string Name, string Path, string Entity);
    sealed record ProjectNote(string Path, string Entity, string ExpectedHash, string Purpose, string CreationReason, string Rationale, string Author);
    sealed record ProductDescriptor(string Name, string Detail, string Image, string PricePath, string PriceEntity);
    sealed record PreviewDescriptor(string Title, string Action, string EntryPath, string EntryName, string ExpressionPath, string ExpressionName,
        string SubtotalVariable, string RateVariable, PreviewValue[] Values, ProductDescriptor[] Products);
}
