using System.Globalization;
using System.Text.Json;
using System.Xml.Linq;
using Microsoft.CodeAnalysis;
using Microsoft.CodeAnalysis.CSharp;
using Microsoft.CodeAnalysis.CSharp.Syntax;

namespace Depth;

public record NumericProperty(string Key, string Label, string Value, string Path, string ExpectedHash, bool Editable);
public record ModuleCard(string Id, string Name, string Kind, string Group, string Purpose, string CreationReason,
    string Rationale, string NoteOrigin, string NoteStatus, string[] EntityIds, Anchor[] Anchors, NumericProperty[] Properties);
public record PreviewProduct(string Name, string Detail, string Image, double Price, string AssetId);
public record BehaviorPreview(string Title, string Action, string EntryId, string PropertyId, double Subtotal, double Rate,
    double Total, string Expression, string Evidence, PreviewProduct[] Products);
public record WorkspaceView(string Root, string Revision, ModuleCard[] Cards, Module[] Groups, Relation[] Relations,
    BehaviorPreview? Preview, int SourceCount, string[] Diagnostics);
public record Composition(string RootId, string Revision, string[] MemberIds, Relation[] Relations, int TotalRelated, string Scope);
public record ModuleNote(string Id, string Purpose, string CreationReason, string Rationale, string Author, Anchor[] Evidence);
public record PropertyRequest(string Id, string Value, string Revision);
public record NoteRequest(string Id, string Revision, string Purpose, string CreationReason, string Rationale);

/// <summary>The same source-backed context index is used by the native UI, API agent and MCP tools.</summary>
public sealed class WorkspaceIndex(string storage)
{
    readonly Dictionary<string, (string Source, VariableDeclaratorSyntax Variable, string Suffix)> bindings = [];
    readonly Dictionary<string, string> sources = [];
    WorkspaceView? cached;
    string noteStamp = "";
    public void Invalidate() { cached = null; }
    string NotesPath(Graph g) => Path.Combine(storage, g.ProjectId + ".notes.json");

    public WorkspaceView Build(Graph graph)
    {
        var notesPath = NotesPath(graph);
        var stamp = File.Exists(notesPath) ? File.GetLastWriteTimeUtc(notesPath).Ticks.ToString() : "";
        if (cached?.Revision == graph.Revision && stamp == noteStamp) return cached;
        bindings.Clear(); sources.Clear(); noteStamp = stamp;
        foreach (var file in graph.Files.Where(f => f.Language is "csharp" or "dart"))
            sources[file.Path] = File.ReadAllText(SourceAccess.Resolve(graph.Root, file.Path));
        var trees = sources.Where(s => s.Key.EndsWith(".cs")).ToDictionary(s => s.Key, s => CSharpSyntaxTree.ParseText(s.Value).GetRoot());
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
                if (syntax is VariableDeclaratorSyntax variable && variable.Parent?.Parent is FieldDeclarationSyntax && variable.Initializer != null)
                {
                    var text = variable.Initializer.Value.ToString();
                    var suffix = text.Length > 0 && "fFdDmM".Contains(text[^1]) ? text[^1..] : "";
                    if (double.TryParse(suffix.Length == 0 ? text : text[..^1], NumberStyles.Float, CultureInfo.InvariantCulture, out var number) && double.IsFinite(number))
                    {
                        bindings[entity.Id] = (sources[anchor.Path], variable, suffix);
                        properties.Add(new("value", entity.Name, number.ToString(CultureInfo.InvariantCulture), anchor.Path, anchor.ContentHash, true));
                    }
                }
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
        if (preview != null) foreach (var product in preview.Products)
            if (cards.Any(c => c.Id == product.AssetId)) relations.Add(new(Wire.Id("rel", preview.EntryId + product.AssetId), preview.EntryId, product.AssetId,
                "view-asset", new("static", "declared-preview-adapter", "Image usage declared by depth.preview.json, not inferred from runtime"), new("depth.preview.json", 1, 1, Wire.Hash(File.ReadAllText(Path.Combine(graph.Root, "depth.preview.json"))))));
        cached = new(graph.Root, graph.Revision, cards.ToArray(), graph.Modules, relations.ToArray(), preview,
            graph.Files.Count(f => f.Language is "csharp" or "dart"), diagnostics.ToArray());
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
        Get(graph, id);
        var visited = new HashSet<string> { id }; var queue = new Queue<(string Id, int Depth)>(); queue.Enqueue((id, 0));
        while (queue.TryDequeue(out var next) && visited.Count < 256)
        {
            if (next.Depth >= 5) continue;
            foreach (var relation in Build(graph).Relations.Where(r => r.From == next.Id && r.Kind != "contains"))
                if (visited.Add(relation.To)) queue.Enqueue((relation.To, next.Depth + 1));
        }
        var edges = Build(graph).Relations.Where(r => visited.Contains(r.From) && visited.Contains(r.To) && r.Kind != "contains").ToArray();
        return new(id, graph.Revision, visited.ToArray(), edges, visited.Count, "Source dependency closure, up to 5 hops / 256 members; not observed execution order.");
    }
    public Proposal ProposeProperty(Workspace workspace, PropertyRequest request)
    {
        var graph = workspace.Refresh();
        if (graph.Revision != request.Revision) throw new InvalidOperationException("Source changed. Refresh before editing.");
        Get(graph, request.Id);
        if (!bindings.TryGetValue(request.Id, out var binding)) throw new InvalidOperationException("This module has no editable numeric source literal.");
        if (!double.TryParse(request.Value, NumberStyles.Float, CultureInfo.InvariantCulture, out var value) || !double.IsFinite(value) || Math.Abs(value) > 1e12)
            throw new InvalidOperationException("Expected a finite numeric value.");
        var declaredType = ((VariableDeclarationSyntax)binding.Variable.Parent!).Type.ToString();
        if (declaredType is "int" or "long" or "short" or "byte" or "uint" or "ulong" && Math.Truncate(value) != value)
            throw new InvalidOperationException("This source field requires an integer.");
        var span = binding.Variable.Initializer!.Value.Span;
        var anchor = graph.Entities.Single(e => e.Id == request.Id).Anchors[0];
        var literal = value.ToString("R", CultureInfo.InvariantCulture) + binding.Suffix;
        var content = binding.Source[..span.Start] + literal + binding.Source[span.End..];
        return workspace.Register(new("", graph.Revision, "Change source-bound " + binding.Variable.Identifier.Text + " from " + binding.Variable.Initializer.Value + " to " + literal,
            [new(anchor.Path, anchor.ContentHash, content)], []));
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
        return new(descriptor.Title, descriptor.Action, entry.Id, ids[descriptor.RateVariable], environment[descriptor.SubtotalVariable], environment[descriptor.RateVariable], total,
            expression.ToString(), "Source arithmetic expression + declared view mapping; validation branch and runtime behavior not executed.", products);
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
