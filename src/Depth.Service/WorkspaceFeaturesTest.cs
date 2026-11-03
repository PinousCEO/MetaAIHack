using System.Net;
using System.Text;
using System.Text.Json;
using Microsoft.CodeAnalysis.CSharp;

namespace Depth;

public static class WorkspaceFeaturesTest
{
    public static void Run(string testRoot, Action<bool,string> check, Action<Action,string> reject)
    {
        var root=Path.Combine(testRoot,"project");Directory.CreateDirectory(root);
        var file=Path.Combine(root,"Pricing.cs");
        var original="public class Pricing { public const double Discount=20; public double Subtotal=120; public double Calculate(double subtotal) { return subtotal*(1-Discount/100); } public double Apply() { return Calculate(Subtotal); } public double Other() { return Calculate(100); } }";
        File.WriteAllText(file,original);
        File.WriteAllText(Path.Combine(root,"image.png"),"not decoded: asset hash fixture");
        File.WriteAllText(Path.Combine(root,"depth.preview.json"),"""
        {"title":"Test cart","action":"Apply","entryPath":"Pricing.cs","entryName":"Apply","expressionPath":"Pricing.cs","expressionName":"Calculate","subtotalVariable":"subtotal","rateVariable":"Discount","values":[{"name":"subtotal","path":"Pricing.cs","entity":"Subtotal"},{"name":"Discount","path":"Pricing.cs","entity":"Discount"}],"products":[]}
        """);
        var workspace=new Workspace(Path.Combine(testRoot,"state"));var graph=workspace.Import(root);var view=workspace.Index.Build(graph);
        check(view.Preview?.Total==96,"Preview evaluates the actual indexed source expression");
        var discount=view.Cards.Single(c=>c.Name=="Discount");var entry=view.Cards.Single(c=>c.Name=="Apply");var calculate=view.Cards.Single(c=>c.Name=="Calculate");
        check(workspace.Index.Compose(graph,entry.Id).MemberIds.Contains(discount.Id),"Composition follows calls and field references to the editable pricing source");
        check(graph.Relations.Count(r=>r.To==calculate.Id&&r.Kind=="calls")==2,"Shared pricing is one implementation with two callers");
        check(view.Cards.Any(c=>c.Kind=="Image"&&c.Name=="image.png"),"Real image assets have canonical indexed identities");
        var draft=workspace.Index.DraftPreview(graph,new(discount.Id,"25",graph.Revision));
        check(draft.Total==90&&File.ReadAllText(file)==original,"Draft changes the source model without writing project code");
        workspace.Index.Record(graph,new(discount.Id,graph.Revision,"Shared discount","Keep one pricing field","Both callers use one implementation"));
        var proposal=workspace.Index.ProposeProperty(workspace,new(discount.Id,"25",graph.Revision));
        reject(()=>workspace.Apply(proposal.Id,false),"Native property edits still require explicit review approval");
        workspace.Apply(proposal.Id,true);graph=workspace.Require();view=workspace.Index.Build(graph);
        check(view.Preview?.Total==90&&view.Preview.PropertyId==discount.Id,"Approved source edit reindexes to the new value and preserves canonical ID");
        check(view.Cards.Single(c=>c.Id==discount.Id).NoteStatus=="needs review","AI notes retain source-hash staleness after source changes");
        reject(()=>workspace.Index.ProposeProperty(workspace,new(discount.Id,"NaN",graph.Revision)),"Non-finite source property values rejected");
        reject(()=>WorkspaceIndex.Arithmetic(SyntaxFactory.ParseExpression("System.IO.File.ReadAllText(\"x\")"),new Dictionary<string,double>()),"Behavior preview cannot execute arbitrary project code");
        var toolContext=new ContextTools(workspace);var expected=File.ReadAllText(file);var agentProposal=new Proposal("",graph.Revision,"Test provider proposal",[new("Pricing.cs",graph.Files.Single(f=>f.Path=="Pricing.cs").Hash,expected.Replace("Discount=25","Discount=30"))],[],graph.ProjectId);
        var expectedPacket=workspace.Context(new(discount.Id,graph.Revision));
        using var handler=new FakeProvider(discount.Id,agentProposal,expectedPacket.PacketId);using var client=new HttpClient(handler);
        var reply=new ApiAgent(workspace,toolContext,client).Run(new("Change discount","test-key-not-a-real-secret","test-model",[discount.Id],graph.Revision)).GetAwaiter().GetResult();
        check(reply.Proposal!=null&&workspace.Pending.Any(p=>p.Id==reply.Proposal.Id)&&File.ReadAllText(file)==expected,"API tool loop reads context and creates a proposal without applying it");
        check(handler.SawToolReplay&&handler.Calls==4,"Stateless Responses loop replays tool calls and results");
        check(handler.SawSharedPacket,"API agent receives the same context packet identity as the human view");
        check(!Directory.GetFiles(Path.Combine(testRoot,"state"),"*",SearchOption.AllDirectories).Any(p=>File.ReadAllText(p).Contains("test-key-not-a-real-secret")),"API credentials are not persisted in workspace records");
        var other=Path.Combine(testRoot,"other");Directory.CreateDirectory(other);
        foreach(var source in Directory.GetFiles(root))File.Copy(source,Path.Combine(other,Path.GetFileName(source)));
        using var switched=new FakeProvider(discount.Id,agentProposal,expectedPacket.PacketId,()=>workspace.Import(other));using var switchedClient=new HttpClient(switched);
        reject(()=>new ApiAgent(workspace,toolContext,switchedClient).Run(new("Wait","test-key","test-model",[],graph.Revision)).GetAwaiter().GetResult(),"API response is rejected when the project switches while awaiting the provider, even with identical revision");
        check(workspace.Pending.Length==0&&workspace.Require().Revision==graph.Revision,"A delayed provider cannot add proposals or read tools against the replacement project");
        reject(()=>workspace.Register(agentProposal,true),"Remote proposals require matching project identity in addition to file hashes");
        workspace.Import(root);
        using var changed=new FakeProvider(discount.Id,agentProposal,expectedPacket.PacketId,()=>File.AppendAllText(file,"\n// concurrent editor"));using var changedClient=new HttpClient(changed);
        reject(()=>new ApiAgent(workspace,toolContext,changedClient).Run(new("Wait","test-key","test-model",[],graph.Revision)).GetAwaiter().GetResult(),"API response is rejected when external edits change the source snapshot");
        var deepRoot=Path.Combine(testRoot,"deep-composition");Directory.CreateDirectory(deepRoot);
        File.WriteAllText(Path.Combine(deepRoot,"Chain.cs"),"public class Chain { "+string.Join(" ",Enumerable.Range(0,300).Select(i=>$"public int M{i}() => M{(i+1)%300}();"))+" public int Unused() => 0; }");
        var deepGraph=workspace.Import(deepRoot);var deepView=workspace.Index.Build(deepGraph);var deepEntry=deepView.Cards.Single(c=>c.Name=="M0");
        var all=workspace.Index.Compose(deepGraph,deepEntry.Id);
        check(all.MemberIds.Length==300&&all.MemberIds.Distinct().Count()==300,"Composition includes all 300 reachable modules beyond old hop/member caps without duplicating recursive modules");
        check(all.Relations.Any(r=>r.From==deepView.Cards.Single(c=>c.Name=="M299").Id&&r.To==deepEntry.Id),"Composition retains the closing edge of a deep recursive dependency cycle");
        check(!all.MemberIds.Contains(deepView.Cards.Single(c=>c.Name=="Unused").Id),"Composition excludes unrelated modules rather than presenting the entire project as a feature");
        var typeComposition=workspace.Index.Compose(deepGraph,deepView.Cards.Single(c=>c.Name=="Chain").Id);
        check(typeComposition.MemberIds.Length==302&&typeComposition.Relations.Count(r=>r.Kind=="contains")==301,"Selecting a type includes all declared members and their dependencies with explicit ownership edges");
    }
    sealed class FakeProvider(string id,Proposal proposal,string packetId,Action? beforeReply=null):HttpMessageHandler
    {
        public int Calls;public bool SawToolReplay,SawSharedPacket;
        protected override async Task<HttpResponseMessage> SendAsync(HttpRequestMessage request,CancellationToken cancel)
        {
            using var body=JsonDocument.Parse(await request.Content!.ReadAsStringAsync(cancel));
            SawSharedPacket|=body.RootElement.GetProperty("input")[0].GetProperty("content").GetString()!.Contains(packetId);
            if(Calls>0)SawToolReplay|=body.RootElement.GetProperty("input").EnumerateArray().Any(i=>i.TryGetProperty("type",out var t)&&t.GetString()=="function_call_output");
            object output;
            if(Calls==0)output=new[]{new{type="function_call",call_id="c1",name="modules_search",arguments=JsonSerializer.Serialize(new{query="Discount"})}};
            else if(Calls==1)output=new[]{new{type="function_call",call_id="c2",name="source_read",arguments=JsonSerializer.Serialize(new{id,wholeFile=true})}};
            else if(Calls==2)output=new[]{new{type="function_call",call_id="c3",name="changes_propose",arguments=JsonSerializer.Serialize(proposal,Wire.Json)}};
            else output=new[]{new{type="message",role="assistant",content=new[]{new{type="output_text",text="Proposal ready for review."}}}};
            Calls++;
            beforeReply?.Invoke();
            return new(HttpStatusCode.OK){Content=new StringContent(JsonSerializer.Serialize(new{status="completed",output},Wire.Json),Encoding.UTF8,"application/json")};
        }
    }
}
