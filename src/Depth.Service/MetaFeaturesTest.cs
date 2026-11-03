using System.Net;
using System.Text;
using System.Text.Json;
using System.Text.Json.Nodes;

namespace Depth;

public static class MetaFeaturesTest
{
    internal sealed class Provider(Func<JsonObject,object> answer):HttpMessageHandler
    {
        public int Calls;public JsonObject? Last;public Uri? Uri;
        protected override async Task<HttpResponseMessage> SendAsync(HttpRequestMessage request,CancellationToken cancel)
        {
            Uri=request.RequestUri;Last=JsonNode.Parse(await request.Content!.ReadAsStringAsync(cancel))!.AsObject();Calls++;
            return new(HttpStatusCode.OK){Content=new StringContent(JsonSerializer.Serialize(answer(Last),Wire.Json),Encoding.UTF8,"application/json")};
        }
    }
    static object Completion(object result)=>new{completion_message=new{role="assistant",content=new{type="text",text=JsonSerializer.Serialize(result,Wire.Json)},stop_reason="stop"}};
    static MetaConnection Connection=>new("meta-test-fixture","not-a-real-meta-key","https://api.llama.com/v1/","meta");
    static ModuleExplanation Note(string[] ids)=>new("계산 모듈","공유 계산을 한 구현으로 유지",["계산"],["입력 값"],["계산 결과"],[],["공유 구현 ID 유지"],["실행 결과는 미검증"],ids.Take(1).ToArray(),new(2,"공유 계산을 호출자에게 제공하는 역할로 해석됩니다.",[]));
    public static void Run(string directory,Action<bool,string> check,Action<Action,string> reject)
    {
        ModuleDocumentationTest.Run(Path.Combine(directory,"documentation"),check,reject);
        MetaApiTest.Run(Path.Combine(directory,"model-api"),check,reject);
        var root=Path.Combine(directory,"project");var state=Path.Combine(directory,"state");Directory.CreateDirectory(root);
        File.WriteAllText(Path.Combine(root,"App.csproj"),"<Project Sdk=\"Microsoft.NET.Sdk\"><PropertyGroup><OutputType>Exe</OutputType><TargetFramework>net8.0</TargetFramework></PropertyGroup></Project>");
        const string original="public class App { public static int Main() => Pricing.Value()==7 ? 0 : 9; } public class Pricing { public static int Value() => 7; }";
        File.WriteAllText(Path.Combine(root,"App.cs"),original);
        var ws=new Workspace(state);var graph=ws.Import(root);
        var math=ModuleMath.Partition(graph);var mathAgain=ModuleMath.Partition(graph);
        check(math.Modules.SelectMany(m=>m.EntityIds).ToHashSet().SetEquals(graph.Entities.Select(e=>e.Id))&&math.Modules.SelectMany(m=>m.EntityIds).Count()==graph.Entities.Length,"Mathematical partition covers canonical source entities exactly once");
        check(math.Modules.Select(m=>m.Id).SequenceEqual(mathAgain.Modules.Select(m=>m.Id))&&math.Modules.All(m=>double.IsFinite(m.Conductance)&&m.Conductance is >=0 and <=1),"Weighted partition is deterministic with finite bounded conductance");
        var cycleRoot=Path.Combine(directory,"cycles");Directory.CreateDirectory(cycleRoot);File.WriteAllText(Path.Combine(cycleRoot,"Cycle.cs"),"class Cycle { int A()=>B(); int B()=>A(); } class Other { int C()=>1; }");
        var cycles=new Indexer().Scan(cycleRoot);var a=cycles.Entities.Single(e=>e.Name=="A");var b=cycles.Entities.Single(e=>e.Name=="B");var partition=ModuleMath.Partition(cycles,2);
        check(partition.Modules.Any(m=>m.EntityIds.Contains(a.Id)&&m.EntityIds.Contains(b.Id)),"Mutually recursive declarations remain in one module even under a size cap");
        reject(()=>ModuleMath.Describe(cycles,cycles.Entities.Select(e=>new[]{e.Id}).ToArray()),"A semantic partition cannot split a call SCC without refactoring source");
        var ranks=ModuleMath.Rank(math,math.Modules[0].Id,64);
        check(Math.Abs(ranks.Sum(r=>r.Score)-1)<1e-8&&ranks.All(r=>r.Score>=0),"Personalized dependency diffusion conserves probability mass including dangling modules");
        using var provider=new Provider(body=>{
            var packet=body["messages"]![1]!["content"]!.GetValue<string>();var end=packet.IndexOf("\nSOURCE ",StringComparison.Ordinal);using var metadata=JsonDocument.Parse(end<0?packet:packet[..end]);
            var ids=metadata.RootElement.GetProperty("entityIds").EnumerateArray().Select(v=>v.GetString()!).ToArray();return Completion(new SemanticPartition([new(ids,Note(ids))]));});
        using var client=new HttpClient(provider);var model=new MetaModel(client);
        var analyzed=ws.Knowledge.Analyze(new(Connection,graph.ProjectId,graph.Revision),model).GetAwaiter().GetResult();
        check(analyzed.Complete&&analyzed.Catalog.Modules.All(m=>m.Status=="source-matched"&&m.Provider=="meta-llama"),"Native Meta response schema creates hash-bound structured module contracts (simulated provider)");
        var owner=analyzed.Catalog.Modules.First();var selectedEntity=owner.EntityIds.First();
        check(ws.Knowledge.Get(graph,selectedEntity).Id==owner.Id&&JsonSerializer.Serialize(ws.Knowledge.Neighborhood(graph,selectedEntity),Wire.Json)==JsonSerializer.Serialize(ws.Knowledge.Neighborhood(graph,owner.Id),Wire.Json),"A UI-selected entity resolves to the same canonical contract and mathematical neighborhood as its owning module");
        reject(()=>ws.Knowledge.Get(graph,"invented-selection"),"Unknown selection cannot resolve to an arbitrary functional module");
        check(provider.Uri?.AbsoluteUri=="https://api.llama.com/v1/chat/completions"&&provider.Last!.ContainsKey("max_completion_tokens")&&!provider.Last.ContainsKey("max_tokens"),"Native Meta transport uses the official endpoint and completion-token parameter");
        int calls=provider.Calls;var cached=ws.Knowledge.Analyze(new(Connection,graph.ProjectId,graph.Revision),model).GetAwaiter().GetResult();
        check(provider.Calls==calls&&cached.ModelCalls==0&&cached.CacheHits==math.Modules.Length,"Unchanged modules reuse persisted explanations without a model call");
        var reopened=new Workspace(state);reopened.Import(root);check(reopened.Knowledge.Catalog(reopened.Require()).MissingExplanations==0,"Module contracts and semantic partition survive process restart");
        check(!Directory.GetFiles(state,"*",SearchOption.AllDirectories).Any(p=>File.ReadAllText(p).Contains(Connection.ApiKey)),"Meta credentials are not persisted with contracts or graph state");
        File.AppendAllText(Path.Combine(root,"App.cs"),"\n// changed source");var changed=ws.Refresh();
        check(ws.Knowledge.Catalog(changed).Modules.Any(m=>m.Status=="stale"),"Source edits explicitly invalidate derived Meta module explanations");
        using var invalid=new Provider(body=>Completion(new SemanticPartition([new(["invented-entity"],Note(["invented-entity"]))])));using var invalidClient=new HttpClient(invalid);
        reject(()=>ws.Knowledge.Analyze(new(Connection,changed.ProjectId,changed.Revision),new(invalidClient)).GetAwaiter().GetResult(),"Invented Meta membership IDs cannot alter module organization");
        using var delayed=new Provider(body=>{File.AppendAllText(Path.Combine(root,"App.cs"),"\n// concurrent editor");var ids=ws.Knowledge.Catalog(changed).Modules[0].EntityIds;return Completion(new SemanticPartition([new(ids,Note(ids))]));});using var delayedClient=new HttpClient(delayed);
        reject(()=>ws.Knowledge.Analyze(new(Connection,changed.ProjectId,changed.Revision,1),new(delayedClient)).GetAwaiter().GetResult(),"A delayed annotation cannot be committed over changed source");
        File.WriteAllText(Path.Combine(root,"App.cs"),original);graph=ws.Refresh();
        var context=new ContextTools(ws);int turn=0;bool replay=false;
        using var agentProvider=new Provider(body=>{
            if(turn++==0)return new{completion_message=new{role="assistant",content=new{type="text",text="Reading contracts"},stop_reason="tool_calls",tool_calls=new[]{new{id="c1",function=new{name="modules_catalog",arguments="{\"query\":\"\"}"}}}}};
            replay=body["messages"]!.AsArray().Any(m=>m?["role"]?.GetValue<string>()=="tool")&&!body["messages"]!.AsArray().Any(m=>m?.AsObject().ContainsKey("stop_reason")==true)&&body["messages"]!.AsArray().Single(m=>m?["role"]?.GetValue<string>()=="assistant")!["content"]!.GetValue<string>()=="Reading contracts";
            return new{completion_message=new{role="assistant",content="Module contracts retrieved.",stop_reason="stop"}};});using var agentClient=new HttpClient(agentProvider);
        var agent=new MetaAgent(ws,context,new(agentClient)).Run(new("Explain the modules",Connection.ApiKey,Connection.Model,[],graph.Revision,graph.ProjectId,Provider:"meta-legacy")).GetAwaiter().GetResult();
        check(replay&&agent.Message=="Module contracts retrieved."&&context.Activity().Any(a=>a.Tool=="modules.catalog"),"Native Meta tool loop retrieves the same compact contract catalog and replays tool results");
        reject(()=>MetaModel.Endpoint(Connection with{Endpoint="https://example.com/v1/"}),"Native Meta provider cannot silently route to another provider host");
        reject(()=>MetaModel.Endpoint(Connection with{Endpoint="http://remote.invalid/v1/",Protocol="llama-compatible"}),"Remote inference refuses cleartext credential transport");
        Transformations(directory,ws,check,reject);
        Assets(directory,ws,check,reject);
        var python=Path.Combine(directory,"python");Directory.CreateDirectory(python);File.WriteAllText(Path.Combine(python,"calc.py"),"def price(x):\n    return x * 2\n");var fallback=new Indexer().Scan(python);
        check(fallback.Entities.Single().Kind=="SourceFile"&&fallback.Relations.Length==0&&fallback.Diagnostics.Any(d=>d.Contains("dependencies are unknown")),"Other supported text languages remain usable with an explicitly limited file-level fallback and no invented call edges");
    }
    static void Transformations(string directory,Workspace ws,Action<bool,string> check,Action<Action,string> reject)
    {
        var graph=ws.Require();var sourceFile=graph.Files.Single(f=>f.Path=="App.cs");var catalog=ws.Knowledge.Catalog(graph);
        var draft=new Proposal("",graph.Revision,"Extract pricing into one shared source file",[new("App.cs",sourceFile.Hash,"public class App { public static int Main() => Pricing.Value()==7 ? 0 : 9; }"),new("Modules/Pricing.cs","","public class Pricing { public static int Value() => 7; }","create")],[],graph.ProjectId);
        using var provider=new Provider(_=>Completion(draft));using var client=new HttpClient(provider);var service=new ModuleTransformations(ws,new(client));
        var split=service.Propose(new(Connection,graph.ProjectId,graph.Revision,"split",catalog.Modules.Select(m=>m.Id).ToArray(),"Extract shared pricing")).GetAwaiter().GetResult();
        check(!ws.Preview(split.Id).Assessment.CanApply&&!File.Exists(Path.Combine(graph.Root,"Modules/Pricing.cs")),"A Meta source split stages real edits and requires build plus behavior tests before apply");
        var host=Environment.GetEnvironmentVariable("DOTNET_HOST_PATH")??"dotnet";
        ws.Validation.SaveProfile(new("Meta transformation fixture",false,[new("build",host,["build","--nologo","--ignore-failed-sources","-p:NuGetAudit=false","--disable-build-servers"],".",60),new("test",host,["bin/Debug/net8.0/App.dll"],".",10)]));
        reject(()=>ws.Apply(split.Id,true),"Transformation gating cannot be bypassed by an optional validation profile");
        var run=ws.Validation.Run(split.Id,true).GetAwaiter().GetResult();check(run.Commands.All(c=>c.Status=="passed")&&ws.Preview(split.Id).Assessment.CanApply,"Generated split proposal builds and executes its behavioral fixture in a copied target");
        ws.Apply(split.Id,true);graph=ws.Require();check(graph.Entities.Count(e=>e.Name=="Value")==1&&graph.Relations.Any(r=>r.Kind=="calls"&&r.To==graph.Entities.Single(e=>e.Name=="Value").Id),"Applying the split leaves one pricing implementation and source-bound call references");
        var generated=ws.GenerationReasons([graph.Entities.Single(e=>e.Name=="Value").Id]);
        check(generated.Length==1&&generated[0].Reason==split.Reason&&generated[0].Basis=="recorded-meta-proposal"&&generated[0].Status=="source-matched","Applied Meta creation reasons are retrieved from the journal with file hashes, separate from inferred module intent");
        var donor=Path.Combine(directory,"donor");Directory.CreateDirectory(donor);File.WriteAllText(Path.Combine(donor,"Rewards.cs"),"public class DonorPricing { public static int Value()=>7; } public class Rewards { public static int Total()=>DonorPricing.Value()+3; }");
        var inspected=service.Inspect(donor);var targetCatalog=ws.Knowledge.Catalog(graph);
        draft=new("",graph.Revision,"Adapt Rewards to the existing canonical Pricing implementation; do not copy DonorPricing",[new("Modules/Rewards.cs","","public class Rewards { public static int Total()=>Pricing.Value()+3; }","create"),new("App.cs",graph.Files.Single(f=>f.Path=="App.cs").Hash,"public class App { public static int Main() => Pricing.Value()==7 && Rewards.Total()==10 ? 0 : 9; }")],[],graph.ProjectId);
        var merged=service.Propose(new(Connection,graph.ProjectId,graph.Revision,"integrate",inspected.Catalog.Modules.Select(m=>m.Id).ToArray(),"Reuse Pricing",SourceRoot:donor,SourceRevision:inspected.Catalog.Revision,TargetModuleIds:targetCatalog.Modules.Select(m=>m.Id).ToArray())).GetAwaiter().GetResult();
        check(ws.Require().ProjectId==graph.ProjectId&&merged.Transformation?.SourceRoot==donor&&!File.Exists(Path.Combine(graph.Root,"Modules/Rewards.cs")),"Two-project integration retains the destination workspace and persists donor provenance without applying");
        var mergeRun=ws.Validation.Run(merged.Id,true).GetAwaiter().GetResult();check(mergeRun.Commands.All(c=>c.Status=="passed"),"Cross-project adapted module compiles and passes real reuse assertions against target code");
        var configuration=Path.Combine(donor,"config.json");File.WriteAllText(configuration,"{\"changed\":true}");
        check(!ws.Preview(merged.Id).Assessment.CanApply,"Donor configuration changes invalidate an integration even when indexed code hashes are unchanged");
        reject(()=>ws.Apply(merged.Id,true),"Stale donor input cannot be integrated after target validation passed");
        File.Delete(configuration);ws.Apply(merged.Id,true);graph=ws.Require();
        check(graph.Entities.Count(e=>e.Name=="Value")==1&&graph.Entities.Any(e=>e.Name=="Rewards")&&!graph.Entities.Any(e=>e.Name=="DonorPricing"),"Reviewed integration actually reuses the target implementation instead of duplicating donor pricing");
        check(ws.GenerationReasons([graph.Entities.Single(e=>e.Name=="App").Id]).Any(r=>r.ChangeId==split.Id&&r.Status=="historical"),"An earlier generated reason is marked historical after later source changes");
    }
    static void Assets(string directory,Workspace ws,Action<bool,string> check,Action<Action,string> reject)
    {
        var png=Convert.FromBase64String("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR4nGNwaPj/HwAFggK/465+UQAAAABJRU5ErkJggg==");
        using var provider=new Provider(_=>new{protocol="depth-meta-assets/v1",provider="meta",model="chameleon",format="png",contentBase64=Convert.ToBase64String(png)});using var client=new HttpClient(provider);
        var assets=new MetaAssets(Path.Combine(directory,"assets-state"),ws,client);var graph=ws.Require();
        var item=assets.Generate(new(new("http://127.0.0.1:43901/",Protocol:"worker"),graph.ProjectId,graph.Revision,"image","A pearl module icon")).GetAwaiter().GetResult();
        check(provider.Uri?.AbsolutePath=="/generate"&&item.Status=="staged"&&assets.Content(item.Id).Bytes.SequenceEqual(png),"Meta asset protocol stores verified-format output separately for review (simulated worker)");
        reject(()=>assets.Import(new(item.Id,graph.ProjectId,graph.Revision,"Assets/Icon.png",false)),"Generated assets require explicit import approval");
        reject(()=>assets.Import(new(item.Id,graph.ProjectId,graph.Revision,"../Icon.png",true)),"Generated asset import cannot escape the destination project");
        var imported=assets.Import(new(item.Id,graph.ProjectId,graph.Revision,"Assets/Icon.png",true));
        check(imported.Status=="imported"&&ws.Require().Entities.Any(e=>e.Kind=="Image"&&e.Anchors[0].Path=="Assets/Icon.png"),"Reviewed generated image becomes a real indexed project asset");
        reject(()=>assets.Import(new(item.Id,ws.Require().ProjectId,ws.Require().Revision,"Assets/Other.png",true)),"A completed asset job cannot be imported twice accidentally");
        using var wrong=new Provider(_=>new{protocol="depth-meta-assets/v1",provider="other-model",model="chameleon",format="png",contentBase64=Convert.ToBase64String(png)});using var wrongClient=new HttpClient(wrong);
        graph=ws.Require();reject(()=>new MetaAssets(Path.Combine(directory,"assets-state"),ws,wrongClient).Generate(new(new("http://localhost:43901/",Protocol:"worker"),graph.ProjectId,graph.Revision,"image","icon")).GetAwaiter().GetResult(),"A non-Meta worker result cannot be mislabeled as Meta generation");
        reject(()=>MetaAssets.Validate(Encoding.UTF8.GetBytes("this is not actually a PNG image"),"png"),"Invalid generated binary formats are rejected before staging");
    }
}
