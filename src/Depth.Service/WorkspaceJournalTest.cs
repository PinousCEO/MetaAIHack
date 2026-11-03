using System.Text;

namespace Depth;

public static class WorkspaceJournalTest
{
    public static void Run(string directory, Action<bool,string> check, Action<Action,string> reject)
    {
        var root=Path.Combine(directory,"project"); var state=Path.Combine(directory,"state"); Directory.CreateDirectory(root);
        var a=Path.Combine(root,"A.cs");var b=Path.Combine(root,"B.cs");
        File.WriteAllText(a,"class A { int Value=1; }",new UTF8Encoding(true));File.WriteAllText(b,"class B { int Value=2; }");
        var originalA=File.ReadAllBytes(a);var originalB=File.ReadAllBytes(b);
        var ws=new Workspace(state);var graph=ws.Import(root);
        var p=ws.Register(new("",graph.Revision,"Two file edit",[new("A.cs",graph.Files.Single(f=>f.Path=="A.cs").Hash,"class A { int Value=3; }"),new("B.cs",graph.Files.Single(f=>f.Path=="B.cs").Hash,"class B { int Value=4; }")],[]));
        var reopened=new Workspace(state);reopened.Import(root);
        check(reopened.Pending.Single().Id==p.Id&&reopened.Preview(p.Id).Proposal==reopened.Pending.Single(),"Pending proposal identity and full review survive workspace restart");
        new WorkspaceJournal(state).Prepare(graph,p,new(){["A.cs"]=originalA,["B.cs"]=originalB});
        File.WriteAllText(a,p.Edits[0].Content,new UTF8Encoding(false)); // Simulated process death after only the first write.
        reopened=new Workspace(state);reopened.Import(root);
        check(reopened.Recovery().Single().CanRestore,"Partial multi-file apply is detected after process restart");
        reject(()=>reopened.Apply(p.Id,true),"Another apply cannot bypass unresolved recovery");
        reject(()=>reopened.Restore(p.Id,false),"Recovery requires approval of restoring originals");
        File.WriteAllText(b,"// concurrent editor");
        check(!reopened.Recovery().Single().CanRestore,"External edits turn recovery into a visible conflict");
        reject(()=>reopened.Restore(p.Id,true),"Recovery refuses to overwrite an external editor");
        check(File.ReadAllText(a)==p.Edits[0].Content,"Conflicting recovery does not partially restore other files");
        File.WriteAllBytes(b,originalB);reopened.Restore(p.Id,true);
        check(File.ReadAllBytes(a).SequenceEqual(originalA)&&File.ReadAllBytes(b).SequenceEqual(originalB)&&reopened.Recovery().Length==0,"Approved recovery restores original bytes including BOM and clears the interrupted transaction");
        reopened.Apply(p.Id,true);var applied=new Workspace(state);applied.Import(root);
        check(applied.Pending.Length==0&&applied.Recovery().Length==0,"Committed changes never return as pending or interrupted after restart");
        check(applied.History().Single().Id==p.Id,"Applied history survives restart and remains scoped to its project");
        var undo=applied.ProposeUndo(p.Id);
        check(File.ReadAllText(a)==p.Edits[0].Content&&applied.Preview(undo.Id).Changes.Length==2,"Undo first creates a reviewable multi-file proposal without modifying source");
        applied.Apply(undo.Id,true);
        check(File.ReadAllText(a)=="class A { int Value=1; }"&&File.ReadAllText(b)=="class B { int Value=2; }","Reviewed undo passes through normal apply and reindex");
        reject(()=>applied.ProposeUndo(p.Id),"Undo refuses an obsolete change after a later revision");
        var g=applied.Require();var dismissed=applied.Register(new("",g.Revision,"Dismiss",[],[]));applied.Dismiss(dismissed.Id);
        var dismissedRestart=new Workspace(state);dismissedRestart.Import(root);
        check(dismissedRestart.Pending.Length==0,"Dismissal persists across restart");
        var group=applied.Register(new("",g.Revision,"Organize one",[],[new("First","First purpose",g.Entities.Select(e=>e.Id).ToArray())]));applied.Apply(group.Id,true);
        var later=applied.Register(new("",g.Revision,"Organize two",[],[new("Second","Later purpose",g.Entities.Select(e=>e.Id).ToArray())]));applied.Apply(later.Id,true);
        reject(()=>applied.ProposeUndo(group.Id),"Undo cannot overwrite a later module organization with an identical source revision");
    }
}
