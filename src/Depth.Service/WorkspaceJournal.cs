using System.Text;
using System.Text.Json;

namespace Depth;

public static class AtomicJson
{
    public static void Write<T>(string path, T value)
    {
        Directory.CreateDirectory(Path.GetDirectoryName(Path.GetFullPath(path))!);
        var temp = path + ".tmp-" + Guid.NewGuid().ToString("N");
        try
        {
            using (var stream = new FileStream(temp, FileMode.CreateNew, FileAccess.Write, FileShare.None))
            {
                JsonSerializer.Serialize(stream, value, Wire.Json); stream.Flush(true);
            }
            File.Move(temp, path, true);
        }
        finally { if (File.Exists(temp)) File.Delete(temp); }
    }
}
public record ApplyJournal(string Id, string ProjectId, string Root, Proposal Proposal, Dictionary<string, byte[]> Before, Module[] Groups, string State);
public record RecoveryCase(string Id, string[] Paths, bool CanRestore, string Detail);

public sealed class WorkspaceJournal(string storage)
{
    public static string GroupsHash(Graph graph) => Wire.Hash(JsonSerializer.Serialize(graph.Modules.OrderBy(m => m.Id)
        .Select(m => new { m.Id, m.Name, m.Purpose, entities = m.EntityIds.OrderBy(id => id), m.Evidence }), Wire.Json));
    string PendingPath(Graph g) => Path.Combine(storage, "pending", g.ProjectId + ".json");
    string JournalPath(string id)
    {
        if (!Guid.TryParseExact(id, "N", out _)) throw new InvalidOperationException("Invalid change ID.");
        return Path.Combine(storage, "changes", id, "journal.json");
    }
    public void SavePending(Graph g, IEnumerable<Proposal> proposals) => AtomicJson.Write(PendingPath(g), proposals.ToArray());
    public Proposal[] LoadPending(Graph g)
    {
        if (!File.Exists(PendingPath(g))) return [];
        var items = JsonSerializer.Deserialize<Proposal[]>(File.ReadAllText(PendingPath(g)), Wire.Json) ?? [];
        foreach (var p in items)
        {
            JournalPath(p.Id);
            if (p.ProjectId != g.ProjectId) throw new InvalidOperationException("Pending proposal does not match its stored project identity.");
            foreach (var edit in p.Edits) SourceAccess.Resolve(g.Root, edit.Path);
        }
        // A crash after recording a successful apply must never resurrect its proposal.
        return items.Where(p => !File.Exists(Path.Combine(storage, "changes", p.Id, "result.json"))).ToArray();
    }
    public void Prepare(Graph g, Proposal p, Dictionary<string, byte[]> before) =>
        AtomicJson.Write(JournalPath(p.Id), new ApplyJournal(p.Id, g.ProjectId, g.Root, p, before, g.Modules, "applying"));
    public void Complete(string id, string state)
    {
        var journal = Read(id); AtomicJson.Write(JournalPath(id), journal with { State = state });
    }
    ApplyJournal Read(string id) => JsonSerializer.Deserialize<ApplyJournal>(File.ReadAllText(JournalPath(id)), Wire.Json)
        ?? throw new InvalidOperationException("Invalid apply journal.");
    public ChangeRecord[] History(Graph graph)
    {
        var root=Path.Combine(storage,"changes");if(!Directory.Exists(root))return [];
        return Directory.EnumerateDirectories(root).Where(d=>File.Exists(Path.Combine(d,"journal.json"))&&File.Exists(Path.Combine(d,"result.json")))
            .Where(d=>Read(Path.GetFileName(d)).ProjectId==graph.ProjectId)
            .Select(d=>JsonSerializer.Deserialize<ChangeRecord>(File.ReadAllText(Path.Combine(d,"result.json")),Wire.Json)!)
            .OrderByDescending(r=>r.At).Take(100).ToArray();
    }
    public GenerationReason[] GenerationReasons(Graph graph,string[] entityIds)
    {
        var paths=graph.Entities.Where(e=>entityIds.Contains(e.Id)).SelectMany(e=>e.Anchors.Select(a=>a.Path)).ToHashSet();
        var reasons=new List<GenerationReason>();
        foreach(var result in History(graph)){
            if(!result.Paths.Any(paths.Contains))continue;
            var journal=Read(result.Id);var model=journal.Proposal.Transformation?.Model??(journal.Proposal.Generation?.Provider is "meta" or "meta-llama"?journal.Proposal.Generation.Model:null);
            if(model==null)continue; // Do not label manual/unknown-origin changes as Meta-authored.
            var edits=journal.Proposal.Edits.Where(e=>e.Operation!="delete"&&paths.Contains(e.Path)).ToArray();
            if(edits.Length==0)continue;
            bool matched=edits.All(e=>graph.Files.Any(f=>f.Path==e.Path&&f.Hash==Wire.Hash(e.Content)));
            reasons.Add(new(result.Id,journal.Proposal.Reason,model,edits.Select(e=>e.Path).ToArray(),
                matched?"source-matched":"historical","recorded-meta-proposal"));
            if(reasons.Count==8)break;
        }
        return reasons.ToArray();
    }
    public Proposal UndoDraft(Graph graph,string id)
    {
        var journal=Read(id);var resultPath=Path.Combine(storage,"changes",id,"result.json");
        if(journal.ProjectId!=graph.ProjectId||!File.Exists(resultPath))throw new InvalidOperationException("Unknown applied change for this project.");
        var result=JsonSerializer.Deserialize<ChangeRecord>(File.ReadAllText(resultPath),Wire.Json)!;
        if(result.AfterRevision!=graph.Revision)throw new InvalidOperationException("Source changed after this change. An automatic undo proposal would overwrite later work.");
        if(result.GroupsHash.Length>0&&result.GroupsHash!=GroupsHash(graph))throw new InvalidOperationException("Module organization changed after this change. Review the later changes before undoing.");
        string Text(byte[] bytes){using var reader=new StreamReader(new MemoryStream(bytes),Encoding.UTF8,true);return reader.ReadToEnd();}
        var edits=journal.Proposal.Edits.Select(edit=>{
            if(!SourceEdits.AfterMatches(graph.Root,edit))throw new InvalidOperationException("An edited file no longer matches this change.");
            return edit.Operation switch {
                "create" => new Edit(edit.Path,Wire.Hash(edit.Content),"","delete"),
                "delete" => new Edit(edit.Path,"",Text(journal.Before[edit.Path]),"create"),
                _ => new Edit(edit.Path,Wire.Hash(edit.Content),Text(journal.Before[edit.Path]))
            };
        }).ToArray();
        return new("",graph.Revision,"Undo: "+result.Reason,edits,journal.Proposal.Modules.Length==0?[]:journal.Groups.Select(m=>new ModuleDraft(m.Name,m.Purpose,m.EntityIds)).ToArray());
    }
    public RecoveryCase[] Inspect(Graph graph)
    {
        var directory = Path.Combine(storage, "changes"); if (!Directory.Exists(directory)) return [];
        var cases = new List<RecoveryCase>();
        foreach (var dir in Directory.EnumerateDirectories(directory))
        {
            var path = Path.Combine(dir, "journal.json"); if (!File.Exists(path)) continue;
            var journal = Read(Path.GetFileName(dir));
            if (journal.ProjectId != graph.ProjectId || journal.State != "applying" || File.Exists(Path.Combine(dir, "result.json"))) continue;
            var conflicts = Conflicts(graph, journal);
            cases.Add(new(journal.Id, journal.Before.Keys.ToArray(), conflicts.Length == 0,
                conflicts.Length == 0 ? "Interrupted apply. Restore the saved original bytes before making another change."
                    : "External edits or missing files prevent restoration: " + string.Join(", ", conflicts)));
        }
        return cases.ToArray();
    }
    static string[] Conflicts(Graph g, ApplyJournal journal)
    {
        if (journal.ProjectId != g.ProjectId || !string.Equals(journal.Root, g.Root, StringComparison.Ordinal))
            throw new InvalidOperationException("Recovery belongs to another project.");
        var conflicts = new List<string>();
        foreach (var edit in journal.Proposal.Edits)
        {
            if (!journal.Before.TryGetValue(edit.Path, out var before) ||
                !SourceEdits.OriginalMatches(g.Root,edit,before)&&!SourceEdits.AfterMatches(g.Root,edit)) conflicts.Add(edit.Path);
        }
        return conflicts.ToArray();
    }
    public void Restore(Graph graph, string id, bool approved)
    {
        if (!approved) throw new InvalidOperationException("Review and approve restoring the saved originals.");
        var journal = Read(id);
        if (journal.State != "applying" || File.Exists(Path.Combine(storage, "changes", id, "result.json")))
            throw new InvalidOperationException("This change has no interrupted apply to restore.");
        var conflicts = Conflicts(graph, journal);
        if (conflicts.Length > 0) throw new InvalidOperationException("Restore refused; external changes in " + string.Join(", ", conflicts));
        foreach (var edit in journal.Proposal.Edits)
        {
            // Recheck immediately before each write as editors are outside the service lock.
            if (Conflicts(graph, journal).Length > 0) throw new InvalidOperationException("A file changed during restoration. Remaining backups are retained.");
            SourceEdits.Restore(graph.Root,edit,journal.Before[edit.Path]);
        }
        AtomicJson.Write(Path.Combine(storage, graph.ProjectId + ".groups.json"), new { revision = journal.Proposal.Revision, modules = journal.Groups });
        Complete(id, "restored");
    }
}
