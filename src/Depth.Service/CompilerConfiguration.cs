using System.Text.Json;
using Microsoft.CodeAnalysis;
using Microsoft.CodeAnalysis.CSharp;

namespace Depth;

public record CompilerInput(string Path, string Hash);
public record CompilerReference(string Path, string Hash, string[] Aliases);
public record CompilerProject(string Name, string[] Sources, string[] Defines, string LanguageVersion,
    string OutputKind, bool AllowUnsafe, bool CheckOverflow, string Nullable, CompilerReference[] References);
public record CompilerManifest(string Schema, string Inventory, string ConfigurationInventory, CompilerInput[] Inputs, CompilerProject[] Projects);

public static class CompilerConfiguration
{
    public const string FileName = "depth.analysis.json";
    public static CSharpParseOptions ParseOptions(string root, string source)
    {
        var path = SourceAccess.Resolve(root, FileName);
        if (!File.Exists(path)) return CSharpParseOptions.Default;
        var manifest = JsonSerializer.Deserialize<CompilerManifest>(File.ReadAllText(path), Wire.Json)!;
        var project = manifest.Projects.FirstOrDefault(p => p.Sources.Contains(source));
        if (project == null) return CSharpParseOptions.Default;
        LanguageVersionFacts.TryParse(project.LanguageVersion, out var language);
        return new CSharpParseOptions(language, preprocessorSymbols: project.Defines);
    }
    public static string Inventory(string root) => Wire.Hash(string.Join("\n", SourceAccess.Files(root)
        .Where(p => p.EndsWith(".cs", StringComparison.OrdinalIgnoreCase)).Select(p => Path.GetRelativePath(root, p).Replace('\\', '/')).Order(StringComparer.Ordinal)));
    static string Portable(string root, string path)
    {
        var relative = Path.GetRelativePath(root, Path.GetFullPath(path));
        return !relative.StartsWith(".." + Path.DirectorySeparatorChar) && !Path.IsPathRooted(relative) ? relative.Replace('\\', '/') : Path.GetFullPath(path);
    }
    static string Resolve(string root, string path) => Path.IsPathRooted(path) ? path : SourceAccess.Resolve(root, path);
    // Explicit CLI operation. MSBuild evaluation/targets may execute project code. Never
    // invoked by Scan or import; the user chooses the projects and runs this command.
    public static CompilerManifest Capture(string root, string[] projects)
    {
        root = Path.GetFullPath(root); var result = new List<CompilerProject>(); var inputs = new Dictionary<string, CompilerInput>();
        foreach (var project in projects)
        {
            var path = SourceAccess.Resolve(root, project); var cwd = Path.GetDirectoryName(path)!;
            var process = Processes.Run(Environment.GetEnvironmentVariable("DOTNET_HOST_PATH") ?? "dotnet",
                ["msbuild", path, "-nologo", "-v:quiet", "-target:Compile", "-property:SkipCompilerExecution=true", "-property:ProvideCommandLineArgs=true", "-property:BuildProjectReferences=false",
                 "-property:NonExistentFile=" + Path.Combine(cwd, "obj", "depth-capture-" + Guid.NewGuid().ToString("N")),
                 "-getItem:CscCommandLineArgs", "-getProperty:MSBuildAllProjects,AssemblyName"], cwd, "", 120);
            if (process.ExitCode != 0) throw new InvalidOperationException("Compiler configuration capture failed. Restore/build the selected target first. " + process.Error + process.Output);
            using var json = JsonDocument.Parse(process.Output);
            var args = json.RootElement.GetProperty("Items").GetProperty("CscCommandLineArgs").EnumerateArray().Select(x => x.GetProperty("Identity").GetString()!).ToArray();
            if (args.Length == 0) throw new InvalidOperationException("The selected target did not expose C# compiler arguments.");
            var parsed = CSharpCommandLineParser.Default.Parse(args, cwd, null);
            if (parsed.Errors.Any(e => e.Severity == DiagnosticSeverity.Error)) throw new InvalidOperationException(string.Join("\n", parsed.Errors));
            var references = parsed.MetadataReferences.Select(r => {
                var full = Path.GetFullPath(r.Reference, cwd);
                return new CompilerReference(Portable(root, full), SourceAccess.HashFile(full), r.Properties.Aliases.ToArray());
            }).ToArray();
            var sources = parsed.SourceFiles.Select(s => Portable(root, s.Path)).ToArray();
            if (sources.Any(Path.IsPathRooted)) throw new InvalidOperationException("Choose a common project root containing all linked source files.");
            var properties = json.RootElement.GetProperty("Properties");
            result.Add(new(properties.GetProperty("AssemblyName").GetString()!, sources, parsed.ParseOptions.PreprocessorSymbolNames.ToArray(),
                parsed.ParseOptions.LanguageVersion.ToDisplayString(), parsed.CompilationOptions.OutputKind.ToString(), parsed.CompilationOptions.AllowUnsafe,
                parsed.CompilationOptions.CheckOverflow, parsed.CompilationOptions.NullableContextOptions.ToString(), references));
            foreach (var input in properties.GetProperty("MSBuildAllProjects").GetString()!.Split(';', StringSplitOptions.RemoveEmptyEntries).Append(path))
                if (File.Exists(input)) { var key = Portable(root, input); inputs[key] = new(key, SourceAccess.HashFile(input)); }
            foreach (var input in new[]{Path.Combine(cwd,"obj","project.assets.json"),Path.Combine(cwd,"obj",Path.GetFileName(path)+".nuget.g.props")})
                if (File.Exists(input)) { var key = Portable(root, input); inputs[key] = new(key, SourceAccess.HashFile(input)); }
        }
        // Include local project/props/targets files even when MSBuild's import list omits them.
        foreach (var path in ConfigFiles(root)) { var key = Portable(root, path); inputs[key] = new(key, SourceAccess.HashFile(path)); }
        if (result.Select(p => p.Name).Distinct().Count() != result.Count) throw new InvalidOperationException("Select one configuration per distinct assembly name.");
        var manifest = new CompilerManifest("1", Inventory(root), ConfigInventory(root), inputs.Values.OrderBy(i => i.Path).ToArray(), result.ToArray());
        AtomicJson.Write(Path.Combine(root, FileName), manifest); return manifest;
    }
    static IEnumerable<string> ConfigFiles(string root)
    {
        foreach (var path in Directory.EnumerateFileSystemEntries(root))
        {
            var attr = File.GetAttributes(path); if (attr.HasFlag(FileAttributes.ReparsePoint)) continue;
            if (attr.HasFlag(FileAttributes.Directory))
            { if (!new[] { ".git", ".depth", "bin", "obj", "Library", "Temp", "artifacts", "node_modules" }.Contains(Path.GetFileName(path))) foreach (var child in ConfigFiles(path)) yield return child; }
            else if (Path.GetExtension(path) is ".csproj" or ".props" or ".targets" || Path.GetFileName(path) is "global.json" or "NuGet.Config") yield return path;
        }
    }
    static string ConfigInventory(string root) => Wire.Hash(string.Join("\n", ConfigFiles(root).Select(p => Portable(root,p)).Order(StringComparer.Ordinal)));
    public static (CSharpCompilation Compilation, string[] EditableSources)[] Build(string root, Dictionary<string, string> sources, List<SourceFile> files, List<string> notes)
    {
        var path = SourceAccess.Resolve(root, FileName);
        if (!File.Exists(path))
        {
            if (!sources.Keys.Any(p => SourceAccess.Language(p) == "csharp")) return [];
            var trees = sources.Where(s => s.Key.EndsWith(".cs")).Select(s => CSharpSyntaxTree.ParseText(s.Value, path: s.Key));
            var references = ((string?)AppContext.GetData("TRUSTED_PLATFORM_ASSEMBLIES") ?? "").Split(Path.PathSeparator, StringSplitOptions.RemoveEmptyEntries).Select(p => MetadataReference.CreateFromFile(p));
            notes.Add("C#: source-only compilation; target build configuration is not loaded. Use --capture-analysis explicitly to connect resolved compiler inputs.");
            return [(CSharpCompilation.Create("DepthAnalysis", trees, references, new CSharpCompilationOptions(OutputKind.DynamicallyLinkedLibrary)), sources.Keys.ToArray())];
        }
        var manifest = JsonSerializer.Deserialize<CompilerManifest>(File.ReadAllText(path), Wire.Json) ?? throw new InvalidOperationException("Invalid compiler manifest.");
        if (manifest.Schema != "1" || manifest.Inventory != Inventory(root) || manifest.ConfigurationInventory != ConfigInventory(root)) throw new InvalidOperationException("Compiler source/configuration inventory changed. Recapture depth.analysis.json.");
        if (manifest.Projects.SelectMany(p => p.Sources).GroupBy(s => s).Any(g => g.Count() > 1))
            throw new InvalidOperationException("Linked sources compiled into multiple captured assemblies need separate analysis roots in this version.");
        files.Add(new(FileName, Wire.Hash(File.ReadAllText(path)), "analysis-config"));
        foreach (var input in manifest.Inputs)
        {
            var full = Resolve(root, input.Path);
            if (!File.Exists(full) || SourceAccess.HashFile(full) != input.Hash) throw new InvalidOperationException("Compiler configuration changed: " + input.Path + ". Recapture analysis.");
            if (!Path.IsPathRooted(input.Path) && files.All(f => f.Path != input.Path)) files.Add(new(input.Path, Wire.Hash(File.ReadAllText(full)), "analysis-config"));
        }
        var units = new List<(CSharpCompilation, string[])>();
        foreach (var project in manifest.Projects)
        {
            if (!LanguageVersionFacts.TryParse(project.LanguageVersion, out var language)) throw new InvalidOperationException("Unsupported C# language version.");
            var options = new CSharpParseOptions(language, preprocessorSymbols: project.Defines);
            var editable = project.Sources.Where(s => sources.ContainsKey(s)).ToArray();
            foreach (var source in project.Sources)
                if (!sources.ContainsKey(source))
                {
                    sources[source] = File.ReadAllText(SourceAccess.Resolve(root, source));
                    files.Add(new(source, Wire.Hash(sources[source]), "generated-csharp"));
                }
            var refs = project.References.Select(r => {
                var full = Resolve(root, r.Path);
                if (!File.Exists(full) || SourceAccess.HashFile(full) != r.Hash) throw new InvalidOperationException("Compiler reference changed: " + r.Path + ". Recapture analysis.");
                if (!Path.IsPathRooted(r.Path) && files.All(f => f.Path != r.Path)) files.Add(new(r.Path, r.Hash, "compiler-reference"));
                return MetadataReference.CreateFromFile(full, MetadataReferenceProperties.Assembly.WithAliases(r.Aliases));
            }).ToArray();
            var trees = project.Sources.Select(s => CSharpSyntaxTree.ParseText(sources[s], options, s));
            var compilationOptions = new CSharpCompilationOptions(Enum.Parse<OutputKind>(project.OutputKind), allowUnsafe: project.AllowUnsafe,
                checkOverflow: project.CheckOverflow, nullableContextOptions: Enum.Parse<NullableContextOptions>(project.Nullable));
            units.Add((CSharpCompilation.Create(project.Name, trees, refs, compilationOptions), editable));
        }
        // Bind captured project references to the current source compilations,
        // not the stale DLL left over from the capture build.
        var initial = units.ToDictionary(u => u.Item1.AssemblyName!, u => u.Item1);
        var linked = new Dictionary<string,CSharpCompilation>(); var visiting = new HashSet<string>();
        CSharpCompilation Link(string name)
        {
            if (linked.TryGetValue(name, out var existing)) return existing;
            if (!visiting.Add(name)) throw new InvalidOperationException("Cyclic captured project references are unsupported.");
            var original = initial[name]; var updated = original;
            foreach (var reference in original.References)
                if (original.GetAssemblyOrModuleSymbol(reference) is IAssemblySymbol assembly && initial.ContainsKey(assembly.Name))
                    updated = updated.ReplaceReference(reference, Link(assembly.Name).ToMetadataReference(reference.Properties.Aliases, reference.Properties.EmbedInteropTypes));
            visiting.Remove(name); return linked[name] = updated;
        }
        notes.Add("C#: captured compiler sources, defines, language options and hashed references loaded for " + string.Join(", ", manifest.Projects.Select(p => p.Name))
            + ". Analysis does not run source generators/analyzers or prove runtime behavior; refresh capture after build configuration changes.");
        return units.Select(u => (Link(u.Item1.AssemblyName!), u.Item2)).ToArray();
    }
}
