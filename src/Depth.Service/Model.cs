using System.Security.Cryptography;
using System.Text;
using System.Text.Json;

namespace Depth;

public static class Wire
{
    public static readonly JsonSerializerOptions Json = new(JsonSerializerDefaults.Web) { WriteIndented = true };
    public static readonly JsonSerializerOptions CompactJson = new(JsonSerializerDefaults.Web);
    public static string Hash(string text) => Convert.ToHexString(SHA256.HashData(Encoding.UTF8.GetBytes(text))).ToLowerInvariant();
    public static string Id(string kind, string value) => kind + "_" + Hash(value)[..24];
}
public record Anchor(string Path, int StartLine, int EndLine, string ContentHash);
public record Evidence(string Kind, string Method, string Detail); // static | observed | inferred
public record Entity(string Id, string Name, string Kind, string Language, string QualifiedName, Anchor[] Anchors);
public record Relation(string Id, string From, string To, string Kind, Evidence Evidence, Anchor? Site);
public record Module(string Id, string Name, string Purpose, string[] EntityIds, Evidence Evidence);
public record SourceFile(string Path, string Hash, string Language);
public record Graph(string SchemaVersion, string ProjectId, string Root, string Revision, DateTimeOffset IndexedAt,
    SourceFile[] Files, Entity[] Entities, Relation[] Relations, Module[] Modules, string[] Diagnostics);
public record Edit(string Path, string ExpectedHash, string Content);
public record ModuleDraft(string Name, string Purpose, string[] EntityIds);
public record Proposal(string Id, string Revision, string Reason, Edit[] Edits, ModuleDraft[] Modules);
public record ChangeRecord(string Id, string BeforeRevision, string AfterRevision, string Reason, string[] Paths,
    string[] ModuleIds, string Validation, DateTimeOffset At);
public record RuntimeSelection(string ProjectId, string Revision, string SessionId, string ObjectId, string Name, string[] SourcePaths);

public static class SourceAccess
{
    static readonly HashSet<string> Ignored = new(StringComparer.OrdinalIgnoreCase)
        { ".git", ".depth", "Library", "Temp", "obj", "bin", "build", "artifacts", "node_modules", ".dart_tool", "Packages" };
    public static IEnumerable<string> Assets(string root)
    {
        foreach (var path in Directory.EnumerateFileSystemEntries(root).Order())
        {
            var attr = File.GetAttributes(path);
            if (attr.HasFlag(FileAttributes.ReparsePoint)) continue;
            if (attr.HasFlag(FileAttributes.Directory))
            { if (!Ignored.Contains(Path.GetFileName(path))) foreach (var child in Assets(path)) yield return child; }
            else if (Path.GetExtension(path).ToLowerInvariant() is ".png" or ".jpg" or ".jpeg" or ".ttf" or ".otf") yield return path;
        }
    }
    public static string HashFile(string path) { using var file = File.OpenRead(path); return Convert.ToHexString(SHA256.HashData(file)).ToLowerInvariant(); }
    public static IEnumerable<string> Files(string root)
    {
        foreach (var path in Directory.EnumerateFileSystemEntries(root).Order())
        {
            var attr = File.GetAttributes(path);
            if (attr.HasFlag(FileAttributes.ReparsePoint)) continue;
            if (attr.HasFlag(FileAttributes.Directory))
            { if (!Ignored.Contains(Path.GetFileName(path))) foreach (var child in Files(path)) yield return child; }
            else if (Path.GetExtension(path) is ".cs" or ".dart") yield return path;
        }
    }
    public static string Resolve(string root, string relative)
    {
        if (Path.IsPathRooted(relative)) throw new InvalidOperationException("Expected a relative source path.");
        var full = Path.GetFullPath(Path.Combine(root, relative));
        if (!full.StartsWith(Path.TrimEndingDirectorySeparator(root) + Path.DirectorySeparatorChar, StringComparison.OrdinalIgnoreCase))
            throw new InvalidOperationException("Path escapes project.");
        for (var p = full; p != null && p.Length >= root.Length; p = Path.GetDirectoryName(p))
            if ((File.Exists(p) || Directory.Exists(p)) && File.GetAttributes(p).HasFlag(FileAttributes.ReparsePoint))
                throw new InvalidOperationException("Linked source paths are not supported.");
        return full;
    }
}
