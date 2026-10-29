using Microsoft.CodeAnalysis;
using Microsoft.CodeAnalysis.CSharp;
using Microsoft.CodeAnalysis.CSharp.Syntax;
using System.Text.Json;

namespace Depth;

public sealed class Indexer
{
    readonly Dictionary<string, (long Ticks, long Size, string Hash)> assetHashes = [];
    public Graph Scan(string root)
    {
        root = Path.TrimEndingDirectorySeparator(Path.GetFullPath(root));
        if (!Directory.Exists(root) || File.GetAttributes(root).HasFlag(FileAttributes.ReparsePoint)) throw new InvalidOperationException("Project directory unavailable or linked.");
        var project = Wire.Id("project", root.ToUpperInvariant());
        var paths = SourceAccess.Files(root).Take(20001).ToArray();
        if (paths.Length > 20000) throw new InvalidOperationException("Prototype supports up to 20,000 source files.");
        var sources = paths.ToDictionary(p => Path.GetRelativePath(root, p).Replace('\\', '/'), p => File.ReadAllText(p));
        var files = sources.Select(p => new SourceFile(p.Key, Wire.Hash(p.Value), p.Key.EndsWith(".cs") ? "csharp" : "dart")).ToArray();
        var entities = new Dictionary<string, Entity>();
        var relations = new List<Relation>();
        var notes = new List<string>();
        var trees = sources.Where(p => p.Key.EndsWith(".cs")).Select(p => CSharpSyntaxTree.ParseText(p.Value, path: p.Key)).ToArray();
        var refs = ((string?)AppContext.GetData("TRUSTED_PLATFORM_ASSEMBLIES") ?? "").Split(Path.PathSeparator, StringSplitOptions.RemoveEmptyEntries)
            .Select(p => MetadataReference.CreateFromFile(p));
        var compilation = CSharpCompilation.Create("DepthAnalysis", trees, refs, new CSharpCompilationOptions(OutputKind.DynamicallyLinkedLibrary));
        string? SymbolId(ISymbol? symbol) => symbol?.OriginalDefinition.GetDocumentationCommentId() is { } key ? Wire.Id("entity", project + ":" + key) : null;
        Anchor Location(SyntaxNode node) => new(node.SyntaxTree.FilePath, node.GetLocation().GetLineSpan().StartLinePosition.Line + 1,
            node.GetLocation().GetLineSpan().EndLinePosition.Line + 1, Wire.Hash(sources[node.SyntaxTree.FilePath]));
        foreach (var tree in trees)
        {
            var model = compilation.GetSemanticModel(tree);
            foreach (var node in tree.GetRoot().DescendantNodes().Where(n => n is BaseTypeDeclarationSyntax or DelegateDeclarationSyntax or BaseMethodDeclarationSyntax or PropertyDeclarationSyntax or VariableDeclaratorSyntax))
            {
                var symbol = model.GetDeclaredSymbol(node);
                if (symbol is not (INamedTypeSymbol or IMethodSymbol or IPropertySymbol or IFieldSymbol)) continue;
                if (SymbolId(symbol) is not { } id) continue;
                var anchor = Location(node);
                if (entities.TryGetValue(id, out var old)) entities[id] = old with { Anchors = old.Anchors.Append(anchor).ToArray() };
                else entities[id] = new(id, symbol.Name, symbol.Kind.ToString(), "csharp", symbol.ToDisplayString(), [anchor]);
                if (SymbolId(symbol.ContainingType) is { } parent)
                    relations.Add(new(Wire.Id("rel", parent + id), parent, id, "contains", new("static", "roslyn-declaration", "Declared member"), anchor));
            }
        }
        foreach (var tree in trees)
        {
            var model = compilation.GetSemanticModel(tree);
            foreach (var node in tree.GetRoot().DescendantNodes().Where(n => n is InvocationExpressionSyntax or ObjectCreationExpressionSyntax or ImplicitObjectCreationExpressionSyntax or BaseTypeSyntax or IdentifierNameSyntax))
            {
                var enclosing = node.Ancestors().Select(n => n is MemberDeclarationSyntax ? model.GetDeclaredSymbol(n) : null).FirstOrDefault(s => SymbolId(s) != null);
                var target = node is BaseTypeSyntax b ? model.GetTypeInfo(b.Type).Type : model.GetSymbolInfo(node).Symbol;
                if (node is IdentifierNameSyntax && target is not (IFieldSymbol or IPropertySymbol)) continue;
                if (SymbolId(enclosing) is not { } from || SymbolId(target) is not { } to || !entities.ContainsKey(to) || from == to) continue;
                var kind = node is IdentifierNameSyntax ? "references" : node is BaseTypeSyntax ? "inherits" : node is ObjectCreationExpressionSyntax or ImplicitObjectCreationExpressionSyntax ? "constructs" : "calls";
                relations.Add(new(Wire.Id("rel", from + to + kind + node.SpanStart), from, to, kind,
                    new("static", "roslyn-symbol-binding", "Bound in source-only compilation; target build configuration may differ"), Location(node)));
            }
        }
        notes.AddRange(compilation.GetDiagnostics().Where(d => d.Severity == DiagnosticSeverity.Error).Take(50).Select(d => d.ToString()));
        if (trees.Length > 0) notes.Add("C#: source-only compilation; Unity assemblies, asmdefs, defines and external packages are not loaded. Unresolved calls are omitted. This is not a target-project build.");
        if (files.Any(f => f.Language == "dart")) ReadDart(root, project, sources, entities, notes);
        var assets = SourceAccess.Assets(root).Take(1001).ToArray();
        if (assets.Length > 1000) notes.Add("Asset discovery is capped at 1,000 image/font files; use a narrower project root for complete asset coverage.");
        var assetFiles = new List<SourceFile>();
        foreach (var asset in assets.Take(1000))
        {
            var info = new FileInfo(asset); var relative = Path.GetRelativePath(root, asset).Replace('\\', '/');
            if (!assetHashes.TryGetValue(asset, out var hash) || hash.Ticks != info.LastWriteTimeUtc.Ticks || hash.Size != info.Length)
                assetHashes[asset] = hash = (info.LastWriteTimeUtc.Ticks, info.Length, SourceAccess.HashFile(asset));
            var kind = Path.GetExtension(asset).ToLowerInvariant() is ".ttf" or ".otf" ? "Font" : "Image";
            assetFiles.Add(new(relative, hash.Hash, "asset"));
            var id = Wire.Id("asset", project + relative);
            entities[id] = new(id, Path.GetFileName(asset), kind, "asset", relative, [new(relative, 0, 0, hash.Hash)]);
        }
        files = files.Concat(assetFiles).ToArray();
        foreach (var manifest in new[] { "depth.preview.json", "depth.notes.json" })
            if (File.Exists(Path.Combine(root, manifest)))
                files = files.Append(new SourceFile(manifest, Wire.Hash(File.ReadAllText(SourceAccess.Resolve(root, manifest))), "view-manifest")).ToArray();
        var moduleGroups = entities.Values.GroupBy(e => e.Language + ":" + (Path.GetDirectoryName(e.Anchors[0].Path)?.Replace('\\', '/') ?? "root"));
        var modules = moduleGroups.Select(g => new Module(Wire.Id("module", project + g.Key), g.Key,
            "Initial source region. Request AI analysis to replace this organizational grouping with evidenced functional modules.",
            g.Select(e => e.Id).ToArray(), new("inferred", "directory-seed", "Not a verified functional boundary"))).ToArray();
        var revision = Wire.Hash(string.Join("\n", files.OrderBy(f => f.Path).Select(f => f.Path + ":" + f.Hash)));
        return new("1.0", project, root, revision, DateTimeOffset.UtcNow, files, entities.Values.ToArray(),
            relations.Where(r => entities.ContainsKey(r.From) && entities.ContainsKey(r.To)).ToArray(), modules, notes.ToArray());
    }

    static void ReadDart(string root, string project, Dictionary<string, string> sources, Dictionary<string, Entity> entities, List<string> notes)
    {
        var adapter = Environment.GetEnvironmentVariable("DEPTH_DART_ADAPTER");
        if (string.IsNullOrEmpty(adapter)) { notes.Add("Dart files hashed; set DEPTH_DART_ADAPTER to adapters/dart/bin/index.dart for AST declarations. No regex-based semantic claims."); return; }
        var dart = Environment.GetEnvironmentVariable("DEPTH_DART_EXECUTABLE") ?? "dart";
        var result = Processes.Run(dart, [adapter, root], root, "", 120);
        if (result.ExitCode != 0) { notes.Add("Dart adapter failed: " + result.Error); return; }
        if (!string.IsNullOrWhiteSpace(result.Error)) notes.Add("Dart parse diagnostics: " + result.Error);
        var declarations = JsonSerializer.Deserialize<DartDeclaration[]>(result.Output, Wire.Json) ?? [];
        foreach (var d in declarations)
        {
            if (!sources.TryGetValue(d.Path, out var source)) continue;
            var id = Wire.Id("entity", project + ":dart:" + d.Path + ":" + d.QualifiedName);
            entities[id] = new(id, d.Name, d.Kind, "dart", d.QualifiedName, [new(d.Path, d.StartLine, d.EndLine, Wire.Hash(source))]);
        }
        notes.Add("Dart: parsed AST declarations only; semantic call resolution and widget runtime mappings pending.");
    }
    record DartDeclaration(string Path, string Name, string Kind, string QualifiedName, int StartLine, int EndLine);
}
