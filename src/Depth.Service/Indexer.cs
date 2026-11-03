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
        var files = sources.Select(p => new SourceFile(p.Key, Wire.Hash(p.Value), SourceAccess.Language(p.Key))).ToArray();
        var entities = new Dictionary<string, Entity>();
        var relations = new List<Relation>();
        var notes = new List<string>();
        var values = new List<SourceValue>();
        var configuredFiles = files.ToList();
        var units = CompilerConfiguration.Build(root, sources, configuredFiles, notes); files = configuredFiles.ToArray();
        var models = units.SelectMany(u => u.Compilation.SyntaxTrees.Where(t => u.EditableSources.Contains(t.FilePath)).Select(t => u.Compilation.GetSemanticModel(t))).ToArray();
        var assemblyNames = units.Select(u => u.Compilation.AssemblyName).ToHashSet();
        string? SymbolId(ISymbol? symbol) => symbol != null && assemblyNames.Contains(symbol.ContainingAssembly?.Name) && symbol.OriginalDefinition.GetDocumentationCommentId() is { } key
            ? Wire.Id("entity", project + ":" + (units.Length > 1 ? symbol.ContainingAssembly?.Name + ":" : "") + key) : null;
        Anchor Location(SyntaxNode node) => new(node.SyntaxTree.FilePath, node.GetLocation().GetLineSpan().StartLinePosition.Line + 1,
            node.GetLocation().GetLineSpan().EndLinePosition.Line + 1, Wire.Hash(sources[node.SyntaxTree.FilePath]));
        foreach (var model in models)
        {
            var tree = model.SyntaxTree;
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
        foreach (var model in models)
        {
            var tree = model.SyntaxTree;
            foreach (var node in tree.GetRoot().DescendantNodes().Where(n => n is InvocationExpressionSyntax or ObjectCreationExpressionSyntax or ImplicitObjectCreationExpressionSyntax or BaseTypeSyntax or IdentifierNameSyntax))
            {
                var enclosing = node.Ancestors().Select(n => n is MemberDeclarationSyntax ? model.GetDeclaredSymbol(n) : null).FirstOrDefault(s => SymbolId(s) != null);
                var target = node is BaseTypeSyntax b ? model.GetTypeInfo(b.Type).Type : model.GetSymbolInfo(node).Symbol;
                if (node is IdentifierNameSyntax && target is not (IFieldSymbol or IPropertySymbol)) continue;
                if (SymbolId(enclosing) is not { } from || SymbolId(target) is not { } to || !entities.ContainsKey(to) || from == to) continue;
                var kind = node is IdentifierNameSyntax ? "references" : node is BaseTypeSyntax ? "inherits" : node is ObjectCreationExpressionSyntax or ImplicitObjectCreationExpressionSyntax ? "constructs" : "calls";
                relations.Add(new(Wire.Id("rel", from + to + kind + node.SpanStart), from, to, kind,
                    new("static", "roslyn-symbol-binding", File.Exists(Path.Combine(root, CompilerConfiguration.FileName)) ? "Bound using captured compiler inputs; runtime not observed" : "Bound in source-only compilation; target build configuration may differ"), Location(node)));
            }
        }
        notes.AddRange(units.SelectMany(u => u.Compilation.GetDiagnostics()).Where(d => d.Severity == DiagnosticSeverity.Error).Take(50).Select(d => d.ToString()));
        if (files.Any(f => f.Language == "dart"))
        {
            ReadDart(root, project, sources, entities, relations, notes, values);
            var configuration = new HashSet<string>();
            foreach (var dartPath in files.Where(f => f.Language == "dart").Select(f => f.Path))
                for (var directory = Path.GetDirectoryName(SourceAccess.Resolve(root, dartPath)); directory != null && directory.Length >= root.Length; directory = Path.GetDirectoryName(directory))
                    foreach (var name in new[] { "pubspec.yaml", "pubspec.lock", "analysis_options.yaml", ".dart_tool/package_config.json" })
                    {
                        var candidate = Path.Combine(directory, name);
                        if (File.Exists(candidate)) configuration.Add(Path.GetRelativePath(root, candidate).Replace('\\', '/'));
                    }
            files = files.Concat(configuration.Select(p => new SourceFile(p, Wire.Hash(File.ReadAllText(SourceAccess.Resolve(root, p))), "analysis-config"))).ToArray();
        }
        if (files.Any(f => f.Language is "javascript" or "typescript"))
        {
            var withWeb = files.ToList(); WebAnalysis.Read(root, project, sources, entities, relations, withWeb, notes, values); files = withWeb.ToArray();
        }
        // Explicit file-level fallback: no fabricated declarations/call edges for missing language adapters.
        var covered=entities.Values.SelectMany(e=>e.Anchors.Select(a=>a.Path)).ToHashSet();
        var fallback=files.Where(f=>SourceAccess.EditableLanguage(f.Language)&&f.Language is not ("csharp" or "dart" or "typescript" or "javascript")&&!covered.Contains(f.Path)).ToArray();
        foreach(var file in fallback){var id=Wire.Id("source-file",project+":"+file.Path);entities[id]=new(id,Path.GetFileName(file.Path),"SourceFile",file.Language,file.Path,
            [new(file.Path,1,sources[file.Path].Count(c=>c=='\n')+1,file.Hash)]);}
        if(fallback.Length>0)notes.Add($"File-level fallback covers {fallback.Length} files without resolved declarations. Meta may explain/refactor their source, but semantic dependencies are unknown; do not interpret absent edges as independence. Unsupported extensions are not indexed.");
        var assets = SourceAccess.Assets(root).Take(1001).ToArray();
        if (assets.Length > 1000) notes.Add("Asset discovery is capped at 1,000 image/font/GLB files; use a narrower project root for complete asset coverage.");
        var assetFiles = new List<SourceFile>();
        foreach (var asset in assets.Take(1000))
        {
            var info = new FileInfo(asset); var relative = Path.GetRelativePath(root, asset).Replace('\\', '/');
            if (!assetHashes.TryGetValue(asset, out var hash) || hash.Ticks != info.LastWriteTimeUtc.Ticks || hash.Size != info.Length)
                assetHashes[asset] = hash = (info.LastWriteTimeUtc.Ticks, info.Length, SourceAccess.HashFile(asset));
            var kind = Path.GetExtension(asset).ToLowerInvariant() switch { ".ttf" or ".otf"=>"Font", ".glb"=>"Model3D", _=>"Image" };
            assetFiles.Add(new(relative, hash.Hash, "asset"));
            var id = Wire.Id("asset", project + relative);
            entities[id] = new(id, Path.GetFileName(asset), kind, "asset", relative, [new(relative, 0, 0, hash.Hash)]);
        }
        files = files.Concat(assetFiles).ToArray();
        foreach (var manifest in new[] { "depth.preview.json", "depth.notes.json" })
            if (File.Exists(Path.Combine(root, manifest)))
                files = files.Append(new SourceFile(manifest, Wire.Hash(File.ReadAllText(SourceAccess.Resolve(root, manifest))), "view-manifest")).ToArray();
        PreviewSources.Index(root,project,entities,relations,notes);
        var moduleGroups = entities.Values.GroupBy(e => e.Language + ":" + (Path.GetDirectoryName(e.Anchors[0].Path)?.Replace('\\', '/') ?? "root"));
        var modules = moduleGroups.Select(g => new Module(Wire.Id("module", project + g.Key), g.Key,
            "Initial source region. Request AI analysis to replace this organizational grouping with evidenced functional modules.",
            g.Select(e => e.Id).ToArray(), new("inferred", "directory-seed", "Not a verified functional boundary"))).ToArray();
        var revision = Wire.Hash(string.Join("\n", files.OrderBy(f => f.Path).Select(f => f.Path + ":" + f.Hash)));
        return new("1.0", project, root, revision, DateTimeOffset.UtcNow, files, entities.Values.ToArray(),
            relations.Where(r => entities.ContainsKey(r.From) && entities.ContainsKey(r.To)).ToArray(), modules, notes.ToArray(), values.ToArray());
    }

    static void ReadDart(string root, string project, Dictionary<string, string> sources, Dictionary<string, Entity> entities, List<Relation> relations, List<string> notes, List<SourceValue> values)
    {
        var adapter = Environment.GetEnvironmentVariable("DEPTH_DART_ADAPTER");
        if (string.IsNullOrEmpty(adapter)) { notes.Add("Dart files hashed; set DEPTH_DART_ADAPTER to adapters/dart/bin/index.dart for resolved source analysis. No regex-based semantic claims."); return; }
        var dart = Environment.GetEnvironmentVariable("DEPTH_DART_EXECUTABLE") ?? "dart";
        var result = Processes.Run(dart, [adapter, root], root, "", 120);
        if (result.ExitCode != 0) { notes.Add("Dart adapter failed: " + result.Error); return; }
        if (!string.IsNullOrWhiteSpace(result.Error)) notes.Add("Dart adapter diagnostics: " + result.Error);
        using var payload = JsonDocument.Parse(result.Output);
        var legacy = payload.RootElement.ValueKind == JsonValueKind.Array;
        var graph = legacy ? null : JsonSerializer.Deserialize<DartGraph>(result.Output, Wire.Json);
        if (!legacy && graph?.Schema != "2") throw new InvalidOperationException("Unsupported Dart adapter schema.");
        var declarations = legacy ? JsonSerializer.Deserialize<DartDeclaration[]>(result.Output, Wire.Json) ?? [] : graph!.Declarations;
        string Id(string key) => Wire.Id("entity", project + ":dart:" + key);
        foreach (var d in declarations)
        {
            if (!sources.TryGetValue(d.Path, out var source)) continue;
            if (File.ReadAllText(SourceAccess.Resolve(root, d.Path)) != source) throw new InvalidOperationException("Dart source changed during analysis; refresh again.");
            var id = Id(d.Key ?? d.Path + ":" + d.QualifiedName);
            entities[id] = new(id, d.Name, d.Kind, "dart", d.QualifiedName, [new(d.Path, d.StartLine, d.EndLine, Wire.Hash(source))]);
        }
        if (graph != null)
        {
            foreach (var v in graph.Values ?? [])
                if (entities.ContainsKey(Id(v.Owner))) values.Add(new(Id(v.Owner), v.Path, v.Offset, v.Length, v.Line, v.Kind, v.Value, v.Literal, v.Label, v.Type));
            foreach (var r in graph.Relations)
                if (sources.TryGetValue(r.Path, out var source) && entities.ContainsKey(Id(r.From)) && entities.ContainsKey(Id(r.To)))
                    relations.Add(new(Wire.Id("rel", project + ":dart:" + r.From + ":" + r.To + ":" + r.Kind + ":" + r.Offset), Id(r.From), Id(r.To), r.Kind,
                        new("static", "dart-resolved-element", "Resolved with target package context; dynamic dispatch and runtime behavior not observed"), new(r.Path, r.StartLine, r.EndLine, Wire.Hash(source))));
            notes.AddRange(graph.Diagnostics);
        }
        notes.Add(legacy ? "Dart: legacy adapter supplies AST declarations only. Update the adapter for resolved source relations."
            : "Dart: resolved declarations, calls, constructors, inheritance and references. Dynamic calls, runtime widgets and behavior are not inferred.");
    }
    record DartDeclaration(string Path, string Name, string Kind, string QualifiedName, int StartLine, int EndLine, string? Key);
    record DartRelation(string From, string To, string Kind, string Path, int Offset, int StartLine, int EndLine);
    record DartGraph(string Schema, DartDeclaration[] Declarations, DartRelation[] Relations, string[] Diagnostics, AdapterValue[]? Values = null);
}
