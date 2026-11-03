using System.Text.Json;
using System.Text.Json.Nodes;

namespace Depth;

public static class ModuleDocumentationTest
{
    public static void Run(string directory,Action<bool,string> check,Action<Action,string> reject)
    {
        var root=Path.Combine(directory,"project");var state=Path.Combine(directory,"state");Directory.CreateDirectory(root);
        const string queue="from collections import deque\nclass JobQueue:\n    def __init__(self):\n        self.pending = deque()\n    def add(self, job):\n        self.pending.append(job)\n    def next(self):\n        return self.pending.popleft()\n";
        File.WriteAllText(Path.Combine(root,"jobs.py"),queue);
        File.WriteAllText(Path.Combine(root,"simple.py"),"def value():\n    return 7\n");
        var ws=new Workspace(state);var graph=ws.Import(root);
        var entity=graph.Entities.Single(e=>e.Anchors.Any(a=>a.Path=="jobs.py"));
        var module=ws.Knowledge.Catalog(graph).Modules.Single(m=>m.EntityIds.Contains(entity.Id));
        var choice=new DesignDecision("Queue · FIFO",
            "FIFO 작업 큐: 입력 순서로 꺼내기 위해 append/popleft를 사용합니다.",
            "Queue는 들어온 항목을 순서대로 보관하는 대기열입니다. FIFO는 First In, First Out의 약자로, 먼저 들어온 것이 먼저 나간다는 뜻입니다. 매표소에서 먼저 줄을 선 사람이 먼저 표를 받는 상황과 비슷합니다.",
            "add는 append로 작업을 뒤에 넣고 next는 popleft로 맨 앞의 작업을 꺼냅니다. 넣는 동작을 enqueue, 꺼내는 동작을 dequeue라고 부릅니다.",
            "이 코드에서 작업을 추가한 순서대로 꺼내도록 두 연산을 선택한 것으로 해석됩니다. 원작자의 실제 의도는 별도로 기록되어 있지 않습니다.",
            "예를 들어 A, B, C를 차례로 add하면 대기열은 [A, B, C]가 됩니다. next를 한 번 호출하면 A가 나오고 [B, C]가 남습니다. 다음에는 B가 나옵니다. 이 설명은 순서를 이해하기 위한 예시입니다.",
            ["최근 작업부터 처리하려면 stack, 중요도에 따라 꺼내려면 priority queue가 더 적합할 수 있습니다."],
            ["빈 큐에서 꺼내면 예외가 발생합니다. 병렬 실행의 완료 순서나 용량 제한은 이 코드만으로 보장되지 않습니다."],
            [new(entity.Id,"self.pending.append(job)"),new(entity.Id,"self.pending.popleft()")]);
        var note=new ModuleExplanation("작업 대기열","입력된 작업을 입력 순서로 꺼냅니다.",["작업 보관"],["추가할 작업"],["먼저 들어온 작업"],["대기열 변경"],["앞에서 꺼냄"],["실행 테스트와 원작자 의도 미확인"],[entity.Id],new(2,"작업을 잠시 보관하고 들어온 순서로 꺼내기 위한 모듈로 해석됩니다.",[choice]));
        ModuleExplanation response=note;bool schemaChecked=false;
        using var provider=new MetaFeaturesTest.Provider(body=>{
            var prompt=body["messages"]![0]!["content"]!.GetValue<string>();
            schemaChecked=prompt.Contains("first-in-first-out")&&body["response_format"]!["json_schema"]!["schema"]!["properties"]!["modules"]!["items"]!["properties"]!["explanation"]!["properties"]!["documentation"]!=null;
            return new{completion_message=new{role="assistant",content=JsonSerializer.Serialize(new SemanticPartition([new([entity.Id],response)]),Wire.Json),stop_reason="stop"}};
        });
        using var client=new HttpClient(provider);var model=new MetaModel(client);var connection=new MetaConnection("meta-fixture","fixture-only","https://api.llama.com/v1/","meta");
        var analyzed=ws.Knowledge.Analyze(new(connection,graph.ProjectId,graph.Revision,ModuleIds:[module.Id]),model).GetAwaiter().GetResult();
        check(schemaChecked&&analyzed.ModelCalls==1&&!analyzed.Complete&&analyzed.Catalog.MissingExplanations==1,"Targeted Meta annotation requires teaching fields while leaving other modules explicitly unannotated (fixture)");
        ModuleExplanationView View(string level)=>ws.Knowledge.Explain(new(module.Id,graph.ProjectId,graph.Revision,level));
        var beginner=View("beginner");var intermediate=View("intermediate");var expert=View("expert");
        string Content(ModuleExplanationView v)=>string.Join('\n',v.Sections.SelectMany(s=>s.Paragraphs));
        check(Content(beginner).Contains("First In, First Out")&&Content(beginner).Contains("[A, B, C]")&&Content(beginner).Length>Content(intermediate).Length&&Content(intermediate).Length>Content(expert).Length,"Beginner Queue explanation teaches FIFO and a worked example; intermediate and expert progressively condense it");
        check(new[]{beginner,intermediate,expert}.All(v=>v.Fingerprint==module.Fingerprint&&v.ReasonBasis=="inferred-from-source"&&Content(v).Contains("빈 큐")&&v.Sections[0].Evidence.SequenceEqual(choice.Evidence)),"Every reading level retains the same evidence, caveats and qualified source-based intent");
        check(provider.Calls==1&&beginner.GenerationReasons.Length==0,"Reading-level switches reuse stored facts with no inference calls and do not invent historical generation reasons");
        var compact=JsonSerializer.Serialize(ws.Knowledge.CompactContract(graph,module.Id),Wire.CompactJson);
        using var compactJson=JsonDocument.Parse(compact);var compactDecision=compactJson.RootElement.GetProperty("explanation").GetProperty("decisions")[0];
        check(compactDecision.GetProperty("summary").GetString()==choice.Summary&&!compactDecision.TryGetProperty("definition",out _)&&!compactDecision.TryGetProperty("example",out _),"AI contracts preserve canonical design reasons and evidence without the beginner tutorial prose");
        var tools=new ContextTools(ws);using var toolArgs=JsonDocument.Parse(JsonSerializer.Serialize(new{id=module.Id,revision=graph.Revision,level="beginner"}));
        check(JsonSerializer.Serialize(tools.Call("modules.explanation",toolArgs.RootElement),Wire.Json)==JsonSerializer.Serialize(beginner,Wire.Json),"MCP explanation tool and human presentation use an identical structured response");
        var restarted=new Workspace(state);restarted.Import(root);
        check(JsonSerializer.Serialize(restarted.Knowledge.Explain(new(module.Id,graph.ProjectId,graph.Revision,"beginner")),Wire.Json)==JsonSerializer.Serialize(beginner,Wire.Json),"Detailed explanation, exact evidence and freshness survive service restart");
        reject(()=>View("unknown"),"Unknown reading levels cannot silently select a different explanation");
        reject(()=>ws.Knowledge.Explain(new(module.Id,"other-project",graph.Revision,"beginner")),"Explanation requests cannot cross project identity");
        File.AppendAllText(Path.Combine(root,"jobs.py"),"# changed\n");
        reject(()=>View("beginner"),"An explanation request for an old revision is rejected after external edits");
        graph=ws.Refresh();check(View("expert").Status=="stale","Stored explanations remain visibly stale when their source changes");
        response=note with{Documentation=note.Documentation! with{Decisions=[choice with{Evidence=[new(entity.Id,"self.pending.pop()")]}]}};
        reject(()=>ws.Knowledge.Analyze(new(connection,graph.ProjectId,graph.Revision,ModuleIds:[module.Id]),model).GetAwaiter().GetResult(),"A plausible but absent source quote cannot substantiate the FIFO rationale");
        response=note with{Documentation=note.Documentation! with{Decisions=[choice with{Evidence=[new("foreign-entity","self.pending.popleft()")]}]}};
        reject(()=>ws.Knowledge.Analyze(new(connection,graph.ProjectId,graph.Revision,ModuleIds:[module.Id]),model).GetAwaiter().GetResult(),"Design evidence cannot cite a different module's entity");
        response=note with{Documentation=null};
        reject(()=>ws.Knowledge.Analyze(new(connection,graph.ProjectId,graph.Revision,ModuleIds:[module.Id]),model).GetAwaiter().GetResult(),"Incomplete legacy-style model output cannot pass the new documentation contract");
        check(View("beginner").Status=="stale"&&View("beginner").Sections[0].Evidence.SequenceEqual(choice.Evidence),"Rejected explanation updates preserve the last persisted rationale and its stale status");
        int repairCalls=0;bool correctionSeen=false;
        using var repairing=new MetaFeaturesTest.Provider(body=>{
            repairCalls++;correctionSeen|=body["messages"]![0]!["content"]!.GetValue<string>().Contains("previous annotation was rejected");
            var value=repairCalls%2==1?note with{EvidenceIds=["foreign-entity"]}:note;
            return new{completion_message=new{role="assistant",content=JsonSerializer.Serialize(new SemanticPartition([new([entity.Id],value)]),Wire.Json),stop_reason="stop"}};
        });
        using var repairingClient=new HttpClient(repairing);
        var corrected=ws.Knowledge.Analyze(new(connection,graph.ProjectId,graph.Revision,MaxCalls:2,ModuleIds:[module.Id]),new(repairingClient)).GetAwaiter().GetResult();
        check(corrected.ModelCalls==2&&repairCalls==2&&correctionSeen&&View("expert").Status=="source-matched","One invalid annotation is corrected by Meta within the explicit two-call budget; only source-valid evidence is stored");
        File.AppendAllText(Path.Combine(root,"jobs.py"),"# changed again\n");graph=ws.Refresh();
        reject(()=>ws.Knowledge.Analyze(new(connection,graph.ProjectId,graph.Revision,MaxCalls:1,ModuleIds:[module.Id]),new(repairingClient)).GetAwaiter().GetResult(),"A one-call analysis cannot spend an unapproved retry on invalid evidence");
        check(repairCalls==3&&View("expert").Status=="stale","An exhausted correction budget preserves the previous contract and stale status");
        int truncatedCalls=0;bool shorterSeen=false;string stopReason="length";bool recover=true;
        using var truncated=new MetaFeaturesTest.Provider(body=>{
            truncatedCalls++;shorterSeen|=body["messages"]![0]!["content"]!.GetValue<string>().Contains("previous response exhausted its output budget");
            // Even parseable JSON is unusable when the provider explicitly says it was truncated.
            return new{completion_message=new{role="assistant",content=JsonSerializer.Serialize(new SemanticPartition([new([entity.Id],note)]),Wire.Json),stop_reason=recover&&truncatedCalls%2==0?"stop":stopReason}};
        });
        using var truncatedClient=new HttpClient(truncated);
        var resumed=ws.Knowledge.Analyze(new(connection,graph.ProjectId,graph.Revision,MaxCalls:2,ModuleIds:[module.Id]),new(truncatedClient)).GetAwaiter().GetResult();
        check(resumed.ModelCalls==2&&truncatedCalls==2&&shorterSeen&&View("expert").Status=="source-matched","Truncated documentation is discarded and regenerated once with a shorter complete response inside the call budget");
        File.AppendAllText(Path.Combine(root,"jobs.py"),"# truncation checks\n");graph=ws.Refresh();recover=false;
        int beforeTruncation=truncatedCalls;
        reject(()=>ws.Knowledge.Analyze(new(connection,graph.ProjectId,graph.Revision,MaxCalls:1,ModuleIds:[module.Id]),new(truncatedClient)).GetAwaiter().GetResult(),"A one-call budget cannot retry length termination");
        check(truncatedCalls==beforeTruncation+1&&View("expert").Status=="stale","Parseable but truncated JSON is never persisted or reported fresh");
        beforeTruncation=truncatedCalls;
        reject(()=>ws.Knowledge.Analyze(new(connection,graph.ProjectId,graph.Revision,MaxCalls:12,ModuleIds:[module.Id]),new(truncatedClient)).GetAwaiter().GetResult(),"Repeated length termination fails instead of looping or accepting partial documentation");
        check(truncatedCalls==beforeTruncation+2&&View("expert").Status=="stale","Persistent truncation spends at most two calls and preserves the prior contract");
        beforeTruncation=truncatedCalls;stopReason="content_filter";
        reject(()=>ws.Knowledge.Analyze(new(connection,graph.ProjectId,graph.Revision,MaxCalls:12,ModuleIds:[module.Id]),new(truncatedClient)).GetAwaiter().GetResult(),"Content filtering is not retried as output truncation");
        check(truncatedCalls==beforeTruncation+1,"Content-filter termination makes no correction call");
        // Simulate a pre-feature contract on disk without changing its source fingerprint.
        File.WriteAllText(Path.Combine(root,"jobs.py"),queue);graph=ws.Refresh();
        response=note;ws.Knowledge.Analyze(new(connection,graph.ProjectId,graph.Revision,ModuleIds:[module.Id]),model).GetAwaiter().GetResult();
        var path=Path.Combine(state,"knowledge",graph.ProjectId,module.Id+".json");var stored=JsonNode.Parse(File.ReadAllText(path))!;
        stored["explanation"]!.AsObject().Remove("documentation");File.WriteAllText(path,stored.ToJsonString());
        check(ws.Knowledge.Get(graph,module.Id).Status=="needs-explanation-upgrade","Old cached contracts are marked for upgrade rather than falsely treated as level-aware explanations");
        response=note;var upgraded=ws.Knowledge.Analyze(new(connection,graph.ProjectId,graph.Revision,ModuleIds:[module.Id]),model).GetAwaiter().GetResult();
        check(upgraded.ModelCalls==1&&View("expert").Status=="source-matched","A targeted Meta call upgrades legacy documentation and restores freshness");
        var draft=new Proposal("",graph.Revision,"호출자에게 고정 값을 제공하는 함수를 생성합니다. 설정값이 필요해지면 매개변수로 바꿀 수 있습니다.",[new("created.py","","def value():\n    return 7\n","create")],[],graph.ProjectId);
        reject(()=>ws.Register(draft with{Generation=new("meta-llama","forged")}),"Public proposal tools cannot forge Meta generation provenance");
        int turn=0;bool levelPassed=false;
        using var agentProvider=new MetaFeaturesTest.Provider(body=>{
            levelPassed=body["messages"]![0]!["content"]!.GetValue<string>().Contains("Human explanation level: expert");
            if(turn++==0)return new{completion_message=new{role="assistant",content="",stop_reason="tool_calls",tool_calls=new[]{new{id="draft",function=new{name="changes_propose",arguments=JsonSerializer.Serialize(draft,Wire.Json)}}}}};
            return new{completion_message=new{role="assistant",content="생성 이유를 기록한 변경안을 준비했습니다.",stop_reason="stop"}};
        });
        using var agentClient=new HttpClient(agentProvider);
        var reply=new MetaAgent(ws,new(ws),new(agentClient)).Run(new("함수를 생성해 주세요.","fixture-only","meta-fixture",[],graph.Revision,graph.ProjectId,Provider:"meta-legacy",ExplanationLevel:"expert")).GetAwaiter().GetResult();
        check(levelPassed&&reply.Proposal?.Generation?.Model=="meta-fixture"&&!File.Exists(Path.Combine(root,"created.py")),"Meta chat receives the reading preference and stages generation reasons with service-assigned provenance");
        ws.Apply(reply.Proposal!.Id,true);graph=ws.Require();var created=graph.Entities.Single(e=>e.Anchors.Any(a=>a.Path=="created.py"));
        var reasons=ws.GenerationReasons([created.Id]);
        check(reasons.Length==1&&reasons[0].Reason==draft.Reason&&reasons[0].Basis=="recorded-meta-proposal"&&reasons[0].Status=="source-matched","Meta chat-generated code keeps its recorded reason alongside transformation-generated code");
    }
}
