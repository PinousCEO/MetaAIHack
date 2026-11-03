namespace Depth;

public static class SelfTest
{
    public static void Run()
    {
        var temp = Path.Combine(Path.GetTempPath(), "depth-test-" + Guid.NewGuid().ToString("N"));
        var root = Path.Combine(temp, "project"); Directory.CreateDirectory(root);
        var assertions = 0;
        void Check(bool value, string name) { if (!value) throw new Exception("FAIL: " + name); Console.WriteLine("PASS " + name); assertions++; }
        void Reject(Action action, string name) { try { action(); } catch (InvalidOperationException) { Check(true, name); return; } throw new Exception("FAIL: " + name); }
        try
        {
            var code = "namespace Game; public partial class Wallet { public int Coins; public void Add(int n) { Coins += n; } } public class Puzzle { public void Win(Wallet w) { w.Add(10); } }";
            File.WriteAllText(Path.Combine(root, "Game.cs"), code);
            File.WriteAllText(Path.Combine(root, "Other.cs"), "namespace Game; public partial class Wallet { public void Reset() { Coins=0; } } public class Store { public void Buy(Wallet w) { w.Add(-1); } }");
            var ws = new Workspace(Path.Combine(temp, "state")); var graph = ws.Import(root);
            var add = graph.Entities.Single(e => e.Name == "Add");
            Check(graph.Relations.Count(r => r.To == add.Id && r.Kind == "calls") == 2, "Two callers reference one implementation");
            Check(graph.Entities.Single(e => e.Name == "Wallet").Anchors.Length == 2, "Partial type retains both source anchors");
            Check(graph.Relations.All(r => r.Evidence.Kind == "static"), "Bound relations carry static provenance");
            var p = ws.Register(new("", graph.Revision, "Increase reward", [new("Game.cs", graph.Files.Single(f => f.Path == "Game.cs").Hash, code.Replace("Add(10)", "Add(20)"))], []));
            Reject(() => ws.Apply(p.Id, false), "Unapproved edit rejected");
            Reject(() => ws.Register(new("", graph.Revision, "escape", [new("../escape.cs", "", "")], [])), "Path traversal rejected");
            File.AppendAllText(Path.Combine(root, "Other.cs"), "\n// external edit");
            Reject(() => ws.Apply(p.Id, true), "Any changed source invalidates proposal");
            graph = ws.Refresh();
            p = ws.Register(new("", graph.Revision, "Increase reward", [new("Game.cs", graph.Files.Single(f => f.Path == "Game.cs").Hash, code.Replace("Add(10)", "Add(20)"))], []));
            var change = ws.Apply(p.Id, true);
            Check(File.ReadAllText(Path.Combine(root, "Game.cs")).Contains("Add(20)"), "Approved code applied");
            Check(change.BeforeRevision != change.AfterRevision, "Code change creates a new snapshot");
            Check(ws.Require().Entities.Single(e => e.Name == "Add").Id == add.Id, "Body edits preserve symbol identity");
            graph = ws.Require();
            var grouping = ws.Register(new("", graph.Revision, "Reviewed test grouping", [], [new("Economy", "Balances and reward callers", graph.Entities.Select(e => e.Id).ToArray())]));
            ws.Index.Build(ws.Require()); // Populate the view before same-revision grouping changes.
            ws.Apply(grouping.Id, true);
            Check(ws.Index.Build(ws.Require()).Groups.Single().Name == "Economy", "Grouping apply invalidates the same-revision workspace view cache");
            var reopened = new Workspace(Path.Combine(temp, "state"));
            Check(reopened.Import(root).Modules.Single().Name == "Economy", "Reviewed functional grouping survives workspace restart and reimport");
            Check(ws.Refresh().Modules.Single().Name == "Economy", "Unchanged refresh preserves functional grouping");
            ws.Observe(new(graph.ProjectId, graph.Revision, "test", "character", "Player", ["Game.cs"]));
            Check(ws.Selection?.Name == "Player", "Runtime observation binds to snapshot");
            Reject(() => ws.Observe(new(graph.ProjectId, "stale", "test", "character", "Player", ["Game.cs"])), "Stale runtime mapping rejected");
            File.AppendAllText(Path.Combine(root, "Game.cs"), "\n// shift");
            Check(ws.Refresh().Modules.All(m => m.Evidence.Method == "directory-seed"), "Source edits invalidate AI inferences");
            Check(reopened.Import(root).Modules.All(m => m.Evidence.Method == "directory-seed"), "Restart never restores reviewed grouping over a changed source revision");
            Check(ws.Selection == null, "Source edits invalidate runtime selection");
            File.Move(Path.Combine(root, "Game.cs"), Path.Combine(root, "Renamed.cs"));
            Check(ws.Refresh().Entities.Single(e => e.Name == "Add").Id == add.Id, "C# file move preserves documented symbol identity");
            SourceDiffTest.Run(Check);
            WorkspaceFeaturesTest.Run(Path.Combine(temp, "native-features"), Check, Reject);
            PreviewSourcesTest.Run(Path.Combine(temp,"preview-sources"),Check);
            ChangeIntelligenceTest.Run(Path.Combine(temp, "change-intelligence"), Check, Reject);
            ProjectValidationTest.Run(Path.Combine(temp, "project-validation"), Check, Reject);
            WorkspaceJournalTest.Run(Path.Combine(temp, "journal"), Check, Reject);
            SourceOperationsTest.Run(Path.Combine(temp, "source-operations"), Check, Reject);
            SourceValuesTest.Run(Path.Combine(temp, "source-values"), Check, Reject);
            CompilerConfigurationTest.Run(Path.Combine(temp, "compiler"), Check, Reject);
            MetaFeaturesTest.Run(Path.Combine(temp,"meta-features"),Check,Reject);
            var first = Path.Combine(temp, "first-copy"); var second = Path.Combine(temp, "second-copy");
            Directory.CreateDirectory(first); Directory.CreateDirectory(second);
            File.WriteAllText(Path.Combine(first, "Copy.cs"), "class Copy { int Value=1; }");
            File.Copy(Path.Combine(first, "Copy.cs"), Path.Combine(second, "Copy.cs"));
            var scoped = new Workspace(Path.Combine(temp, "scoped-state")); var firstGraph = scoped.Import(first);
            var scopedProposal = scoped.Register(new("", firstGraph.Revision, "First copy only", [new("Copy.cs", firstGraph.Files.Single().Hash, "class Copy { int Value=2; }")], []));
            var secondGraph = scoped.Import(second);
            Check(firstGraph.Revision == secondGraph.Revision && scoped.Pending.Length == 0, "Switching between identical project copies clears proposals from the previous project identity");
            Reject(() => scoped.Apply(scopedProposal.Id, true), "A proposal cannot apply to a different project with an identical source revision");
            Console.WriteLine($"{assertions} assertions passed.");
        }
        finally { Directory.Delete(temp, true); }
    }
}
