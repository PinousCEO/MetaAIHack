using System.Text.Json;

namespace Depth;

public static class ChangeIntelligenceTest
{
    public static void Run(string directory, Action<bool,string> check, Action<Action,string> reject)
    {
        var root=Path.Combine(directory,"project");Directory.CreateDirectory(root);var storage=Path.Combine(directory,"state");
        var path=Path.Combine(root,"Shared.cs");
        const string code="public class Shared { public double Rate=20; public double Calc(double n) { return n*(1-Rate/100); } public double A() { return Calc(100)+Calc(20); } public double B() { return Calc(200); } public int Unrelated() { return 42; } }";
        File.WriteAllText(path,code);var ws=new Workspace(storage);var graph=ws.Import(root);var view=ws.Index.Build(graph);
        string Id(string name)=>view.Cards.Single(c=>c.Name==name).Id;
        var rate=Id("Rate");var calc=Id("Calc");var a=Id("A");var b=Id("B");
        var impact=ws.Impact(new(rate,graph.Revision));
        check(impact.Items.Single(i=>i.Id==calc).Hops==1&&impact.Items.Single(i=>i.Id==a).Hops==2&&impact.Items.Single(i=>i.Id==b).Hops==2,"Reverse impact follows a shared value through both callers");
        check(!impact.Items.Any(i=>i.Id==Id("Unrelated")||i.Id==Id("Shared")),"Impact excludes unrelated declarations and containment parents");
        var shared=ws.Impact(new(calc,graph.Revision));
        check(shared.DirectUsers==2&&shared.Items.Count(i=>i.Id==a)==1,"Repeated calls remain one user of the same canonical implementation");
        check(impact.Items.Where(i=>i.Hops>0).All(i=>i.Path.Length==i.Hops&&i.Path[0].From==i.Id&&i.Path[^1].To==rate&&i.Path.All(e=>e.Site?.Path=="Shared.cs"&&e.Evidence.Kind=="static")),"Every impact route carries directed source locations and static provenance");
        var proposal=ws.Index.ProposeProperty(ws,new(rate,"25",graph.Revision));var review=ws.Preview(proposal.Id);
        check(review.Assessment.ChangedIds.SequenceEqual(new[]{rate}),"A one-line file value edit maps only to its field, not all declarations");
        check(review.Assessment.Impact.Items.Any(i=>i.Id==a)&&review.Assessment.Impact.Items.Any(i=>i.Id==b),"Change review includes both shared callers");
        check(review.Assessment.CanApply&&review.Assessment.Checks.Where(c=>c.Name is "Target build" or "Behavior tests").All(c=>c.Status=="not-run"),"Passing hash/syntax checks never claim a build or runtime test");
        var invalid=ws.Register(new("",graph.Revision,"Invalid syntax",[new("Shared.cs",graph.Files[0].Hash,"public class Broken {")],[]));
        check(!ws.Preview(invalid.Id).Assessment.CanApply,"Malformed C# is visible as a failed review check");
        reject(()=>ws.Apply(invalid.Id,true),"Apply enforces syntax validation independently of the UI");
        check(File.ReadAllText(path)==code,"Rejected syntax cannot alter source");
        var comment=ws.Register(new("",graph.Revision,"Comment only",[new("Shared.cs",graph.Files[0].Hash,code+"\n// description")],[]));
        check(ws.Preview(comment.Id).Assessment.ChangedIds.Length==0,"Comment-only edits do not invent semantic impact");
        var typeChange=ws.Register(new("",graph.Revision,"Field type",[new("Shared.cs",graph.Files[0].Hash,code.Replace("double Rate","int Rate"))],[]));
        check(ws.Preview(typeChange.Id).Assessment.ChangedIds.Contains(rate),"Changing a field type is not missed by initializer-only comparison");
        var addition=ws.Register(new("",graph.Revision,"Add member",[new("Shared.cs",graph.Files[0].Hash,code[..^1]+" public int NewMember() { return 1; } }")],[]));
        check(ws.Preview(addition.Id).Assessment.Mapping.Contains("fallback"),"New declarations disclose conservative file impact");
        var request=new ContextRequest(rate,graph.Revision);var packet=ws.Context(request);
        var tools=new ContextTools(ws);using var args=JsonDocument.Parse(JsonSerializer.Serialize(request,Wire.Json));
        var throughTool=(ContextPacket)tools.Call("modules.context",args.RootElement);
        check(packet==throughTool||packet.PacketId==throughTool.PacketId&&packet.Content==throughTool.Content,"UI and model tools receive identical revision-bound context bytes");
        check(packet.Characters==packet.Content.Length&&packet.Characters<=24000&&packet.IncludedIds.Distinct().Count()==packet.IncludedIds.Length,"Context has a real character budget and unique canonical IDs");
        check(packet.Content.Contains("runtime NOT run")&&packet.Content.Contains("SHA256")&&packet.Content.Contains("Impact path:"),"Context preserves uncertainty, source hashes and dependency evidence");
        var noCode=ws.Register(new("",graph.Revision,"No source edits",[],[]));
        check(ws.Preview(noCode.Id).Assessment.Checks.Single(c=>c.Name=="C# syntax").Status=="not-run","No C# edits never produce a fabricated syntax pass");
        ws.Apply(proposal.Id,true);var updated=ws.Require();
        check(updated.Entities.Any(e=>e.Id==rate)&&File.Exists(Path.Combine(storage,"changes",proposal.Id,"assessment.json")),"Apply preserves identity and records the reviewed impact assessment");
        reject(()=>ws.Context(request),"Old context packets cannot be reused after source changes");
        var current=ws.Context(new(rate,updated.Revision));check(current.PacketId!=packet.PacketId,"A new source revision yields a new context identity");
        File.AppendAllText(path,"\n// external change");reject(()=>ws.Context(new(rate,updated.Revision)),"Context checks detect external edits before polling refresh");

        var largeRoot=Path.Combine(directory,"large");Directory.CreateDirectory(largeRoot);
        File.WriteAllText(Path.Combine(largeRoot,"Large.cs"),"public class Large { public string Root() { return \""+new string('x',6000)+"\"; } "+string.Join(" ",Enumerable.Range(0,32).Select(i=>"public string User"+i+"() { return Root()+\""+new string('y',1500)+"\"; }"))+" }");
        var largeWs=new Workspace(Path.Combine(directory,"large-state"));var largeGraph=largeWs.Import(largeRoot);
        var bounded=largeWs.Context(new(largeGraph.Entities.Single(e=>e.Name=="Root").Id,largeGraph.Revision));
        check(bounded.Truncated&&bounded.OmittedModules>0&&bounded.Characters<=24000&&bounded.IncludedIds.Contains(bounded.RootId),"Long source and many callers retain the selected ID within a disclosed hard context budget");

        var cards=Enumerable.Range(0,140).Select(i=>new ModuleCard("n"+i,"N"+i,"Method","","","","","source","source only",[],[new("x.cs",1,1,"hash")],[])).ToArray();
        Relation Edge(string from,string to)=>new(from+to,from,to,"calls",new("static","fixture","bound"),new("x.cs",1,1,"hash"));
        var synthetic=new WorkspaceView(root,"r",cards,[],Enumerable.Range(1,139).Select(i=>Edge("n"+i,"n0")).ToArray(),null,1,[]);
        var capped=ChangeIntelligence.Impact(synthetic,["n0"]);check(capped.Truncated&&capped.Items.Length==128,"Impact node cap is strict and explicitly reports truncation");
        var cyclic=synthetic with { Relations=[Edge("n1","n0"),Edge("n0","n1"),Edge("n2","n1")] };
        check(ChangeIntelligence.Impact(cyclic,["n0"]).Items.Length==3,"Cycles terminate without duplicating the source implementation");
        var chain=synthetic with {Relations=Enumerable.Range(1,12).Select(i=>Edge("n"+i,"n"+(i-1))).ToArray()};
        check(ChangeIntelligence.Impact(chain,["n0"]).Truncated&&ChangeIntelligence.Impact(chain,["n0"]).Items.Max(i=>i.Hops)==6,"Deep paths disclose their traversal limit");
    }
}
