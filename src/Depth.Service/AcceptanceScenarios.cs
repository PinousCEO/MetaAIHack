using System.Net;
using System.Text;
using System.Text.Json;
using System.Text.RegularExpressions;

namespace Depth;

/// <summary>Repeatable acceptance experiments. Live and simulated results are never combined or substituted.</summary>
public static class AcceptanceScenarios
{
    public static async Task Agent(string project,bool pythonHttps)
    {
        project=Path.GetFullPath(project);var artifacts=Path.GetFullPath("artifacts")+Path.DirectorySeparatorChar;
        if(!project.StartsWith(artifacts,StringComparison.OrdinalIgnoreCase))throw new InvalidOperationException("Live agent checks require an isolated project under artifacts.");
        var directory=Path.Combine(artifacts,"agent-live-"+DateTime.UtcNow.ToString("yyyyMMdd-HHmmss"));Directory.CreateDirectory(directory);
        using var http=pythonHttps?new HttpClient(new LiveHttpsTransport()){Timeout=TimeSpan.FromMinutes(10)}:null;
        var connectivity=await MetaConnectivity.Check(true,http);
        if(JsonSerializer.SerializeToElement(connectivity,Wire.Json).GetProperty("status").GetString()!="connected")throw new InvalidOperationException("Actual Meta preflight failed.");
        var workspace=new Workspace(Path.Combine(directory,"state"));var graph=workspace.Import(project);var model=new MetaModel(http,MetaConfiguration.Load());
        var queue=graph.Entities.Single(e=>e.Name=="JobQueue"&&e.Kind=="NamedType");
        var before=graph.Files.Where(f=>f.Language=="csharp").ToDictionary(f=>f.Path,f=>SourceAccess.HashFile(SourceAccess.Resolve(project,f.Path)));
        var results=new List<object>();
        var annotation=await workspace.Knowledge.Analyze(new(new(),graph.ProjectId,graph.Revision,MaxCalls:4,ModuleIds:[workspace.Knowledge.Get(graph,queue.Id).Id]),model);
        var annotatedQueue=annotation.Catalog.Modules.FirstOrDefault(m=>m.Explanation?.Documentation?.Decisions.Any(d=>d.Concept.Contains("FIFO",StringComparison.OrdinalIgnoreCase)||d.Definition.Contains("선입선출"))==true);
        if(annotatedQueue==null)throw new InvalidOperationException("No source-backed Queue teaching note was returned.");
        var notes=new List<ModuleExplanationView>();
        foreach(var level in new[]{"beginner","expert"}){
            var note=workspace.Knowledge.Explain(new(annotatedQueue.Id,graph.ProjectId,graph.Revision,level));notes.Add(note);
            AtomicJson.Write(Path.Combine(directory,"notes-"+level+".json"),note);
        }
        // This fixture's source and identifiers are English. Kana in Korean tutorial
        // prose caught a real mixed-language output; this is not a universal language detector.
        var prose=string.Join("\n",notes.SelectMany(n=>n.Sections).SelectMany(s=>s.Paragraphs));
        bool readable=!Regex.IsMatch(prose,@"[\u3040-\u30ff]")&&notes[0].Sections.Sum(s=>string.Join("",s.Paragraphs).Length)>notes[1].Sections.Sum(s=>string.Join("",s.Paragraphs).Length);
        results.Add(new{scope="structured-Queue-notes",status=readable?"passed":"failed",annotation.ModelCalls,check="beginner expands expert facts; no stray kana in this English-source Korean tutorial"});
        Console.WriteLine((readable?"PASS ":"FAIL ")+"actual Meta structured Queue teaching note quality checks");if(!readable)Environment.ExitCode=1;
        foreach(var level in new[]{"beginner","expert"}){
            var context=new ContextTools(workspace);var agent=new MetaAgent(workspace,context,model);
            var reply=await agent.Run(new("Use the project tools to inspect JobQueue's module contract/neighborhood and the exact relevant source. Explain in Korean why this code uses Queue and FIFO, how Add/Next behave and the empty-queue limitation. Do not edit or propose changes. Clearly distinguish source-based intent from recorded author intent.","","",[queue.Id],graph.Revision,graph.ProjectId,ExplanationLevel:level));
            AtomicJson.Write(Path.Combine(directory,level+".json"),reply);
            bool passed=reply.Proposal==null&&reply.Message.Contains("FIFO",StringComparison.OrdinalIgnoreCase)&&context.Activity().Any(a=>a.Tool=="source.read")&&context.Activity().Any(a=>a.Tool is "modules.contract" or "modules.neighborhood")&&before.All(f=>SourceAccess.HashFile(SourceAccess.Resolve(project,f.Key))==f.Value);
            results.Add(new{level,status=passed?"passed":"failed",tools=context.Activity().Select(a=>a.Tool).Distinct().ToArray()});Console.WriteLine((passed?"PASS ":"FAIL ")+"actual Meta "+level+" tool conversation with unchanged source");
            if(!passed)Environment.ExitCode=1;
        }
        AtomicJson.Write(Path.Combine(directory,"report.json"),new{status=Environment.ExitCode==0?"passed":"failed",mode="real-meta",transport=pythonHttps?"python-verified-https":"dotnet-http",results});Console.WriteLine("Agent report: "+directory);
    }
    const string Project="<Project Sdk=\"Microsoft.NET.Sdk\"><PropertyGroup><OutputType>Exe</OutputType><TargetFramework>net8.0</TargetFramework></PropertyGroup></Project>";
    const string Queue="""
    public class JobQueue {
        private readonly System.Collections.Generic.Queue<string> pending = new();
        public void Add(string item) => pending.Enqueue(item);
        public string Next() => pending.Dequeue();
        public int Count => pending.Count;
    }
    """;
    static string App(int divisor)=>"""
    public class Program {
        public static void Main(string[] args) {
            if (args[0] == "queue") {
                var jobs = new JobQueue();
                for (int i=1; i<args.Length; i++) jobs.Add(args[i]);
                var output = new System.Collections.Generic.List<string>();
                while(jobs.Count>0) output.Add(jobs.Next());
                System.Console.WriteLine(string.Join("|", output));
            } else if (args[0] == "price") {
                System.Console.WriteLine(Pricing.Total(int.Parse(args[1]), int.Parse(args[2])));
            } else if (args[0] == "empty") {
                try { new JobQueue().Next(); System.Console.WriteLine("wrong"); }
                catch (System.InvalidOperationException) { System.Console.WriteLine("empty"); }
            }
        }
    }
    """+"\npublic class Pricing { public static int Total(int count,int cents) { int subtotal=count*cents; return subtotal-subtotal/"+divisor+"; } }\n";
    static string Integrated(string app)=>app.Replace("} else if (args[0] == \"price\") {","} else if (args[0] == \"rewards\") { System.Console.WriteLine(Rewards.Points(int.Parse(args[1]),int.Parse(args[2]))); } else if (args[0] == \"price\") {");
    const string Rewards="public class Rewards { public static int Points(int count,int cents)=>Pricing.Total(count,cents)/100; }";
    const string Oracle="""
    import json, random, subprocess, sys
    dll, mode, divisor, seed = sys.argv[1], sys.argv[2], int(sys.argv[3]), int(sys.argv[4])
    rng = random.Random(seed)
    cases = [(['queue'], ''), (['queue','A','B','C'], 'A|B|C'), (['queue','A','A','B'], 'A|A|B'), (['empty'], 'empty')]
    for _ in range(12):
        values = [str(rng.randrange(8)) for _ in range(rng.randrange(1,16))]
        cases.append((['queue']+values, '|'.join(values)))
    for _ in range(16):
        count, cents = rng.randrange(0,25), rng.randrange(0,10001)
        total = count*cents-count*cents//divisor
        cases.append((['price',str(count),str(cents)], str(total)))
        if mode == 'integrated': cases.append((['rewards',str(count),str(cents)], str(total//100)))
    for args, expected in cases:
        result = subprocess.run(['dotnet',dll]+args, text=True, encoding='utf-8', capture_output=True, timeout=10)
        if result.returncode != 0 or result.stdout.strip() != expected:
            print(json.dumps({'case':args,'expected':expected,'actual':result.stdout.strip(),'exitCode':result.returncode}))
            sys.exit(1)
    print(json.dumps({'passedCases':len(cases),'seed':seed,'mode':mode}))
    """;
    record Checkpoint(string Name,string Status,string Detail);
    public static async Task Run(bool fixture,int rounds,bool pythonHttps=false)
    {
        if(rounds is <1 or >5)throw new InvalidOperationException("Choose 1–5 acceptance rounds.");
        var directory=Path.GetFullPath(Path.Combine("artifacts",$"acceptance-{(fixture?"fixture":"live")}-{DateTime.UtcNow:yyyyMMdd-HHmmss}-{Guid.NewGuid():N}"));Directory.CreateDirectory(directory);
        if(fixture&&pythonHttps)throw new InvalidOperationException("A simulated model cannot use the live HTTPS transport.");
        using var liveHttp=pythonHttps?new HttpClient(new LiveHttpsTransport()){Timeout=TimeSpan.FromMinutes(10)}:null;
        var checks=new List<Checkpoint>();var results=new List<object>();int completedRounds=0;object? connectivity=null;bool connected=fixture;
        if(!fixture){connectivity=await MetaConnectivity.Check(probe:true,client:liveHttp);connected=JsonSerializer.SerializeToElement(connectivity,Wire.Json).GetProperty("status").GetString()=="connected";Console.WriteLine("Actual Meta preflight: "+(connected?"passed":"failed"));}
        var config=fixture?new MetaConfiguration{ApiKey="acceptance-fixture-only"}:MetaConfiguration.Load();
        void Check(bool value,string name,string detail=""){
            checks.Add(new(name,value?"passed":"failed",detail));Console.WriteLine((value?"PASS ":"FAIL ")+name);
            if(!value)throw new InvalidOperationException(name);
        }
        try{
            // Live checks must establish authentication and a real inference before creating any sample project.
            if(!connected)return;
            for(int round=1;round<=rounds;round++){
                checks=[];var run=Path.Combine(directory,"round-"+round);Directory.CreateDirectory(run);var root=Path.Combine(run,"queue-shop");Directory.CreateDirectory(root);
                var donor=Path.Combine(run,"reward-plugin");Directory.CreateDirectory(donor);int divisor=round+8;var app=App(divisor);var original=app+Queue;
                File.WriteAllText(Path.Combine(root,"App.csproj"),Project);File.WriteAllText(Path.Combine(root,"App.cs"),original);
                File.WriteAllText(Path.Combine(donor,"Rewards.csproj"),Project.Replace("<OutputType>Exe</OutputType>",""));
                File.WriteAllText(Path.Combine(donor,"Rewards.cs"),Rewards.Replace("Pricing.Total","DonorPricing.Total")+"\npublic class DonorPricing { public static int Total(int count,int cents) { int subtotal=count*cents; return subtotal-subtotal/"+divisor+"; } }");
                var oracle=Path.Combine(run,"oracle.py");File.WriteAllText(oracle,Oracle);var oracleHash=SourceAccess.HashFile(oracle);
                var buildArgs=new[]{"build","--nologo","--ignore-failed-sources","-p:NuGetAudit=false","-p:UseSharedCompilation=false","--disable-build-servers"};
                var baseline=Processes.Run("dotnet",buildArgs,root,"",90);File.WriteAllText(Path.Combine(run,"baseline-build.log"),baseline.Output+baseline.Error);
                Check(baseline.ExitCode==0,$"round {round}: sample project builds");
                var donorBuild=Processes.Run("dotnet",buildArgs,donor,"",90);File.WriteAllText(Path.Combine(run,"donor-build.log"),donorBuild.Output+donorBuild.Error);Check(donorBuild.ExitCode==0,"second project builds independently");
                var baselineTests=Processes.Run("python",[oracle,"bin/Debug/net8.0/App.dll","base",divisor.ToString(),round.ToString()],root,"",90);
                File.WriteAllText(Path.Combine(run,"baseline-tests.json"),baselineTests.Output);Check(baselineTests.ExitCode==0,"baseline FIFO/duplicates/empty queue/pricing",baselineTests.Output.Trim());
                using var handler=fixture?new Fixture(app):null;using var http=handler==null?null:new HttpClient(handler);
                var model=new MetaModel(http??liveHttp,config);var state=Path.Combine(run,"state");var ws=new Workspace(state);var graph=ws.Import(root);
                var analyzed=await ws.Knowledge.Analyze(new(new(),graph.ProjectId,graph.Revision,MaxCalls:12),model);
                Check(analyzed.Complete,"module analysis completed within the explicit call budget");AtomicJson.Write(Path.Combine(run,"catalog.json"),analyzed.Catalog);
                var ids=analyzed.Catalog.Modules.SelectMany(m=>m.EntityIds).ToArray();Check(ids.Distinct().Count()==ids.Length&&ids.ToHashSet().SetEquals(graph.Entities.Select(e=>e.Id)),"mathematical partition owns every source entity exactly once");
                var queueModule=analyzed.Catalog.Modules.FirstOrDefault(m=>m.Explanation?.Documentation?.Decisions.Any(d=>(d.Concept+" "+d.Definition).Contains("FIFO",StringComparison.OrdinalIgnoreCase)||(d.Concept+" "+d.Definition).Contains("선입선출"))==true);
                Check(queueModule!=null,"actual Queue source has an explicit FIFO explanation");
                var beginner=ws.Knowledge.Explain(new(queueModule!.Id,graph.ProjectId,graph.Revision,"beginner"));var expert=ws.Knowledge.Explain(new(queueModule.Id,graph.ProjectId,graph.Revision,"expert"));
                AtomicJson.Write(Path.Combine(run,"beginner.json"),beginner);AtomicJson.Write(Path.Combine(run,"expert.json"),expert);
                Check(beginner.Sections.Sum(s=>string.Join("",s.Paragraphs).Length)>expert.Sections.Sum(s=>string.Join("",s.Paragraphs).Length)&&beginner.Sections.SelectMany(s=>s.Evidence).SequenceEqual(expert.Sections.SelectMany(s=>s.Evidence)),"beginner explanation expands teaching while preserving expert source evidence");
                var cached=await ws.Knowledge.Analyze(new(new(),graph.ProjectId,graph.Revision),model);Check(cached.ModelCalls==0,"unchanged contracts avoid inference calls");
                ws=new Workspace(state);graph=ws.Import(root);Check(ws.Knowledge.Catalog(graph).MissingExplanations==0,"contracts survive workspace restart");
                var transformations=new ModuleTransformations(ws,model);
                var split=await transformations.Propose(new(new(),graph.ProjectId,graph.Revision,"split",[queueModule.Id],"Extract only JobQueue into Modules/JobQueue.cs. Preserve every existing CLI operation and public API. Leave Program and Pricing in App.cs."));
                AtomicJson.Write(Path.Combine(run,"split.json"),split);
                Check(File.ReadAllText(Path.Combine(root,"App.cs"))==original&&!ws.Preview(split.Id).Assessment.CanApply,"split leaves original unchanged and blocks unvalidated Apply");
                void Profile(string mode)=>ws.Validation.SaveProfile(new("Acceptance oracle outside edited source",true,[new("build","dotnet",buildArgs,".",90),new("test","python",[oracle,"bin/Debug/net8.0/App.dll",mode,divisor.ToString(),round.ToString()],".",90)]));
                void Applied(string phase,string mode){
                    var build=Processes.Run("dotnet",buildArgs,root,"",90);File.WriteAllText(Path.Combine(run,phase+"-applied-build.log"),build.Output+build.Error);
                    Check(build.ExitCode==0,phase+" applied project builds");
                    var test=Processes.Run("python",[oracle,"bin/Debug/net8.0/App.dll",mode,divisor.ToString(),round.ToString()],root,"",90);
                    File.WriteAllText(Path.Combine(run,phase+"-applied-tests.json"),test.Output+test.Error);
                    Check(test.ExitCode==0,phase+" applied project passes independent execution tests",test.Output.Trim());
                }
                Profile("base");
                var mutation=ws.Register(new("",graph.Revision,"Negative control: reverse FIFO output",[new("App.cs",graph.Files.Single(f=>f.Path=="App.cs").Hash,original.Replace("string.Join(\"|\", output)","string.Join(\"|\", System.Linq.Enumerable.Reverse(output))"))],[],graph.ProjectId));
                var rejectedRun=await ws.Validation.Run(mutation.Id,true);AtomicJson.Write(Path.Combine(run,"negative-control.json"),rejectedRun);
                Check(rejectedRun.Commands[0].Status=="passed"&&rejectedRun.Commands[1].Status=="failed"&&!ws.Preview(mutation.Id).Assessment.CanApply,"compilable FIFO regression fails independent tests and blocks Apply");ws.Dismiss(mutation.Id);
                var splitRun=await ws.Validation.Run(split.Id,true);AtomicJson.Write(Path.Combine(run,"split-validation.json"),splitRun);
                Check(splitRun.Commands.All(c=>c.Status=="passed"),"split compiles and passes independent behavioral oracle",string.Join(";",splitRun.Commands.Select(c=>c.Status+" "+c.Output.Trim())));
                ws.Apply(split.Id,true);graph=ws.Require();Check(graph.Entities.Count(e=>e.Name=="JobQueue"&&e.Kind=="NamedType")==1,"split retains one queue implementation");
                Applied("split","base");
                var splitBytes=Directory.GetFiles(root,"*.cs",SearchOption.AllDirectories).Where(p=>!p.Contains(Path.DirectorySeparatorChar+"obj"+Path.DirectorySeparatorChar)).ToDictionary(p=>Path.GetRelativePath(root,p),File.ReadAllBytes);
                var source=transformations.Inspect(donor);var target=ws.Knowledge.Catalog(graph);
                var integrated=await transformations.Propose(new(new(),graph.ProjectId,graph.Revision,"integrate",source.Catalog.Modules.Select(m=>m.Id).ToArray(),"Adapt Rewards.Points to reuse the target Pricing.Total exactly once. Do not copy DonorPricing. Add a rewards CLI branch that parses count and cents and prints Rewards.Points. Preserve queue, empty and price CLI behavior.",SourceRoot:donor,SourceRevision:source.Catalog.Revision,TargetModuleIds:target.Modules.Select(m=>m.Id).ToArray()));
                AtomicJson.Write(Path.Combine(run,"integration.json"),integrated);Profile("integrated");var integratedRun=await ws.Validation.Run(integrated.Id,true);AtomicJson.Write(Path.Combine(run,"integration-validation.json"),integratedRun);
                Check(integratedRun.Commands.All(c=>c.Status=="passed"),"integrated project compiles and passes old + new behavioral cases",string.Join(";",integratedRun.Commands.Select(c=>c.Status+" "+c.Output.Trim())));
                var donorPath=Path.Combine(donor,"Rewards.cs");var donorText=File.ReadAllText(donorPath);File.AppendAllText(donorPath,"\n// edited externally");
                Check(!ws.Preview(integrated.Id).Assessment.CanApply,"changed donor invalidates an otherwise passing integration");File.WriteAllText(donorPath,donorText);
                ws.Apply(integrated.Id,true);graph=ws.Require();Check(!graph.Entities.Any(e=>e.Name=="DonorPricing")&&graph.Entities.Count(e=>e.Name=="Pricing"&&e.Kind=="NamedType")==1,"integration reuses the target pricing implementation");
                Applied("integration","integrated");
                var undo=ws.ProposeUndo(integrated.Id);Profile("base");var undoRun=await ws.Validation.Run(undo.Id,true);AtomicJson.Write(Path.Combine(run,"undo-validation.json"),undoRun);Check(undoRun.Commands.All(c=>c.Status=="passed"),"undo builds and passes the pre-integration behavior oracle");ws.Apply(undo.Id,true);graph=ws.Require();
                Check(splitBytes.All(pair=>File.ReadAllBytes(Path.Combine(root,pair.Key)).SequenceEqual(pair.Value))&&!graph.Entities.Any(e=>e.Name=="Rewards"),"undo restores previous source bytes and removes integrated code");
                Applied("undo","base");
                var assets=new MetaAssets(state,ws,http??liveHttp,config);
                foreach(var style in new[]{"2d","3d"}){var image=await assets.Generate(new(new(),graph.ProjectId,graph.Revision,"image","A blue pearl cube icon on a white background",Style:style));
                    var destination="Assets/"+style+".png";Check(image.Format=="png"&&image.Style==style&&!File.Exists(Path.Combine(root,destination)),style+" image remains staged before approval");
                    assets.Import(new(image.Id,graph.ProjectId,graph.Revision,destination,true));graph=ws.Require();Check(graph.Entities.Any(e=>e.Kind=="Image"&&e.Anchors.Any(a=>a.Path==destination)),style+" image imports as a source-backed asset");}
                Check(SourceAccess.HashFile(oracle)==oracleHash,"model proposals did not change the independent acceptance oracle");
                results.Add(new{round,checks=checks.ToArray()});completedRounds++;
            }
        }catch(Exception e){checks.Add(new("scenario aborted","failed",e.GetType().Name+": "+e.Message));results.Add(new{round=results.Count+1,checks=checks.ToArray()});Environment.ExitCode=1;}
        finally{
            var report=new{status=!connected?"blocked":Environment.ExitCode!=0?"failed":"passed",mode=fixture?"simulated-model-real-builds":"real-meta",transport=pythonHttps?"python-verified-https":"dotnet-http",roundsRequested=rounds,roundsFinished=completedRounds,roundsAttempted=results.Count,connectivity,results,
                limitations=new[]{"No universal behavior-preservation proof.","Model quality is unverified in fixture mode.","Visual quality requires human review of real generated images.","Unity player rendering, MR runtime and GLB mesh generation are not tested here."}};
            AtomicJson.Write(Path.Combine(directory,"report.json"),report);Console.WriteLine("Acceptance report: "+Path.Combine(directory,"report.json"));
            if(!connected)Environment.ExitCode=2;
        }
    }
    sealed class Fixture(string app):HttpMessageHandler
    {
        protected override async Task<HttpResponseMessage> SendAsync(HttpRequestMessage request,CancellationToken cancel)
        {
            using var body=JsonDocument.Parse(await request.Content!.ReadAsStringAsync(cancel));object answer;
            if(request.RequestUri!.AbsolutePath.EndsWith("images/generations"))answer=new{data=new[]{new{b64_json="iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR4nGNwaPj/HwAFggK/465+UQAAAABJRU5ErkJggg=="}},output_format="png"};
            else{
                var prompt=body.RootElement.GetProperty("messages")[1].GetProperty("content").GetString()!;object result;
                if(body.RootElement.GetProperty("messages")[0].GetProperty("content").GetString()!.Contains("organizing actual code")){
                    using var metadata=JsonDocument.Parse(prompt.Split("\nSOURCE ")[0]);var ids=metadata.RootElement.GetProperty("entityIds").EnumerateArray().Select(e=>e.GetString()!).ToArray();
                    var excerpt=Regex.Matches(prompt,@"\nSOURCE (\S+) [^\n]+\n([\s\S]*?)(?=\nSOURCE |\z)").Cast<Match>().FirstOrDefault(m=>m.Groups[2].Value.Contains("pending.Enqueue(item)")||m.Groups[2].Value.Contains("pending.Dequeue()"));
                    DesignDecision[] decisions=excerpt==null?[]:[new("Queue / FIFO","FIFO로 입력 순서를 유지합니다.","Queue는 대기열입니다. FIFO는 First In First Out, 먼저 들어온 항목이 먼저 나가는 선입선출입니다.","Enqueue는 뒤에 넣고 Dequeue는 앞에서 꺼냅니다.","작업을 입력 순서대로 꺼내기 위해 선택한 것으로 해석됩니다.","A, B, C를 넣으면 A부터 나옵니다. 실행 검증이 아닌 이해용 예시입니다.",["최근 작업 우선이면 stack"],["빈 큐는 예외이며 동시 작업 완료 순서는 보장하지 않습니다."],[new(excerpt.Groups[1].Value,excerpt.Groups[2].Value.Contains("pending.Enqueue(item)")?"pending.Enqueue(item)":"pending.Dequeue()")])];
                    result=new SemanticPartition([new(ids,new("기능 모듈","소스 계약을 설명합니다.",["입력 처리"],["입력"],["결과"],[],[],["모의 모델 설명; 실제 모델 품질 검증 아님"],ids.Take(1).ToArray(),new(2,"소스의 역할에 따른 모의 설명입니다.",decisions)))]);
                }else{
                    using var packet=JsonDocument.Parse(prompt);var p=packet.RootElement;bool split=p.GetProperty("kind").GetString()=="split";
                    var files=p.GetProperty("target").GetProperty("files");var current=files.EnumerateArray().Single(f=>f.GetProperty("path").GetString()=="App.cs");
                    result=new Proposal("",p.GetProperty("revision").GetString()!,"명시적 fixture 변환: 공유 구현과 CLI 동작 유지.",[new("App.cs",current.GetProperty("expectedHash").GetString()!,split?app:Integrated(app)),new(split?"Modules/JobQueue.cs":"Modules/Rewards.cs","",split?Queue:Rewards,"create")],[],p.GetProperty("projectId").GetString()!);
                }
                answer=new{choices=new[]{new{message=new{role="assistant",content=JsonSerializer.Serialize(result,Wire.Json)},finish_reason="stop"}}};
            }
            return new(HttpStatusCode.OK){Content=new StringContent(JsonSerializer.Serialize(answer,Wire.Json),Encoding.UTF8,"application/json")};
        }
    }
}
