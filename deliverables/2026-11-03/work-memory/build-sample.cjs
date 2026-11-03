// Generates illustrative data only. Does not scan projects, launch a CLI, or call Meta.
const fs = require('node:fs');
const path = require('node:path');
const {createHash} = require('node:crypto');
const hash = value => createHash('sha256').update(value, 'utf8').digest('hex');
const sources = [
  {path:'src/Editor.ts', before:"import { saveChanges } from './save';\nexport const submit = (write: () => Promise<void>) => saveChanges(write);\n"},
  {path:'src/save.ts', before:"export async function saveChanges(write: () => Promise<void>) {\n  await write();\n}\n", after:"import { TaskQueue } from './TaskQueue';\nconst queue = new TaskQueue();\nexport function saveChanges(write: () => Promise<void>) {\n  queue.enqueue(write);\n  return queue.drain();\n}\n"},
  {path:'src/TaskQueue.ts', before:null, after:"export class TaskQueue {\n  private jobs: Array<() => Promise<void>> = [];\n  private running = false;\n  enqueue(job: () => Promise<void>) { this.jobs.push(job); }\n  async drain() {\n    if (this.running) return;\n    this.running = true;\n    try {\n      while (this.jobs.length) {\n        await this.jobs[0]();\n        this.jobs.shift();\n      }\n    } finally { this.running = false; }\n  }\n}\n"},
  {path:'test/queue.test.ts', before:null, after:"import { TaskQueue } from '../src/TaskQueue';\nimport { strict as assert } from 'node:assert';\nexport async function fifoExample() {\n  const queue = new TaskQueue();\n  const seen: number[] = [];\n  queue.enqueue(async () => { seen.push(1); });\n  queue.enqueue(async () => { seen.push(2); });\n  await queue.drain();\n  assert.deepEqual(seen, [1, 2]);\n}\n"}
].map(s => ({...s,after:('after' in s ? s.after : s.before)})).map(s=>({...s,beforeSha256:s.before===null?null:hash(s.before),afterSha256:hash(s.after)}));
const revision = side => hash(JSON.stringify(sources.filter(s=>s[side]!==null).map(s=>({path:s.path,sha256:s[side+'Sha256']})).sort((a,b)=>a.path<b.path?-1:a.path>b.path?1:0)));
const beforeRevision=revision('before'), afterRevision=revision('after');
const anchor=(file,startLine,endLine)=>({path:file,startLine,endLine,sha256:sources.find(s=>s.path===file).afterSha256});
const evidence=[
  {id:'ev-intent',type:'cli_report',text:'Process save requests in arrival order.',provenance:'illustrative_cli_report'},
  {id:'ev-editor',type:'source',anchor:anchor('src/Editor.ts',1,2),provenance:'illustrative_source'},
  {id:'ev-save',type:'source',anchor:anchor('src/save.ts',1,5),provenance:'illustrative_source'},
  {id:'ev-queue',type:'source',anchor:anchor('src/TaskQueue.ts',4,13),provenance:'illustrative_source'},
  {id:'ev-test',type:'source',anchor:anchor('test/queue.test.ts',1,9),provenance:'illustrative_source'}
];
const modules=[
  {id:'mod-editor',name:'Editor',role:'component',path:'src/Editor.ts',firstStage:0,x:20,y:21,purpose:'사용자의 저장 요청을 서비스에 전달합니다.',requires:['mod-save'],provides:['submit(write)'],invariants:['The caller supplies the write operation.'],sideEffects:['Invokes the save service.'],evidenceIds:['ev-editor'],explanations:{beginner:'화면에서 발생한 저장 요청을 saveChanges에 전달하는 진입점입니다. Queue를 추가한 작업에서는 이 파일을 바꾸지 않았습니다. 연결된 저장 서비스의 동작이 바뀌었으므로 영향 후보로 함께 보여줍니다.',intermediate:'submit은 write 콜백을 저장 서비스에 전달합니다. 직접 수정은 없지만 서비스의 직렬 처리와 반환 Promise 의미 변화에 영향을 받을 수 있습니다.',expert:'변경 없음. saveChanges 소비자이며 반환 Promise 의미의 영향 후보입니다.'}},
  {id:'mod-save',name:'Save service',role:'service',path:'src/save.ts',firstStage:0,x:72,y:21,purpose:'저장 작업을 큐에 넣고 소비를 요청합니다.',requires:['mod-queue'],provides:['saveChanges(write)'],invariants:['One queue instance is shared in this module instance.'],sideEffects:['Runs the supplied write callback.'],evidenceIds:['ev-save'],explanations:{beginner:'이전에는 요청이 들어올 때마다 write를 바로 실행했습니다. 예제 변경 후에는 Queue에 작업을 넣고 앞의 작업부터 처리합니다. 단, 이미 처리 중일 때 drain이 바로 반환하므로 각 호출의 Promise가 해당 저장의 완료를 뜻하지는 않습니다.',intermediate:'즉시 write 실행에서 공유 큐의 enqueue/drain 호출로 변경됩니다. 작업별 완료 Promise는 제공하지 않아 호출자 계약을 추가로 설계해야 합니다.',expert:'직접 실행 → 공유 큐 enqueue/drain. 호출별 완료 보장은 없음; API 반환 계약 보완 필요.'}},
  {id:'mod-queue',name:'TaskQueue',role:'queue',path:'src/TaskQueue.ts',firstStage:2,x:72,y:70,purpose:'접수된 작업을 한 소비자가 앞에서부터 실행합니다.',requires:[],provides:['enqueue(job)','drain()'],invariants:['Dequeue occurs only after the current job resolves.','At most one drain loop runs per instance.'],sideEffects:['Executes asynchronous job callbacks.'],evidenceIds:['ev-queue'],explanations:{beginner:'Queue는 줄을 서는 것처럼 먼저 들어온 작업을 먼저 꺼내는 자료구조입니다. 이를 FIFO(First In, First Out), 즉 선입선출이라고 합니다. 이 예제는 저장 요청의 접수 순서를 유지하려고 뒤에 추가하고 앞의 작업을 기다린 다음 제거합니다. 실패한 작업은 앞에 남아 후속 작업을 막습니다. 재시도·중복 방지·앱 재시작 뒤 복구는 별도로 설계해야 합니다.',intermediate:'push로 접수하고 head 작업을 await한 뒤 shift하는 단일 소비자 큐입니다. 접수 순서의 호출을 의도하지만 실패 시 head가 남습니다. 재시도/영속성/작업별 완료 신호는 별도 정책이 필요합니다.',expert:'FIFO 단일 소비자. head 성공 후 제거; 실패 시 head 유지. 비영속, 작업별 완료 Promise·재시도/중복 방지 정책 없음.'}},
  {id:'mod-test',name:'FIFO example',role:'test',path:'test/queue.test.ts',firstStage:2,x:20,y:70,purpose:'두 작업이 등록 순서로 실행되는지 확인할 예제입니다.',requires:['mod-queue'],provides:['fifoExample()'],invariants:['Expected sequence: [1, 2].'],sideEffects:[],evidenceIds:['ev-test'],explanations:{beginner:'테스트 예제는 1번과 2번 작업을 넣고 결과가 [1, 2]인지 비교합니다. 이 함수는 동봉한 설명용 코드이며 실행하지 않았습니다. 테스트 파일이 생겼다는 사실만으로 순서 보장이 검증되었다고 표시하면 안 됩니다.',intermediate:'기본 순서를 확인할 예제 함수만 있습니다. 미실행이며 실패·동시 enqueue·중복 drain·개별 완료 의미를 추가 검증해야 합니다.',expert:'기본 FIFO 예제 미실행. 실패·동시성·완료 계약 검증 필요.'}}
];
const edges=[
  {id:'edge-editor-save',from:'mod-editor',to:'mod-save',kind:'calls',label:'calls',firstStage:0,evidenceIds:['ev-editor'],path:'M 211 80 L 358 80',labelX:282,labelY:66},
  {id:'edge-save-queue',from:'mod-save',to:'mod-queue',kind:'calls',label:'enqueue / drain',firstStage:2,evidenceIds:['ev-save'],path:'M 446 116 L 446 228',labelX:447,labelY:175},
  {id:'edge-test-queue',from:'mod-test',to:'mod-queue',kind:'tests',label:'tests · not run',firstStage:2,evidenceIds:['ev-test'],path:'M 211 266 L 358 266',labelX:282,labelY:252}
];
const sample={
  schemaVersion:'0.1.0',kind:'depth-lens-design-example',mode:'illustrative',
  project:{id:'example-save-flow',name:'Save flow example',revisionAlgorithm:'sha256 of UTF-8 JSON array of {path,sha256}, sorted by code point for these ASCII paths; fixture-only manifest without analysis config',beforeRevision,afterRevision,analysisScope:'Hand-authored expected graph of four example TypeScript source texts; no parser or runtime was invoked.'},
  action:{id:'action-add-queue',sessionId:'example-session',actor:'example-cli',attribution:'illustrative_report',intent:{text:'Process save requests in arrival order.',source:'cli_report',evidenceIds:['ev-intent']},status:'illustrative_completed_report',beforeRevision,afterRevision,changes:sources.filter(s=>s.before!==s.after).map(s=>({path:s.path,kind:s.before===null?'added':'modified',beforeSha256:s.beforeSha256,afterSha256:s.afterSha256})),validation:{status:'not_run',provenance:'none',exitCode:null,scope:'No example source was executed. Only document and simulation consistency are checked separately.'}},
  sources,evidence,modules,edges,
  decision:{id:'decision-fifo',actionId:'action-add-queue',moduleIds:['mod-save','mod-queue'],inputRevision:afterRevision,execution:'not_called',provider:'meta',model:null,author:'design-example-author',status:'illustrative',claims:[
    {id:'claim-mechanics',category:'observed_in_example',text:'Jobs are appended; the head is awaited and removed after success.',evidenceIds:['ev-queue']},
    {id:'claim-intent',category:'reported_intent',text:'The example CLI reports that arrival order should be preserved.',evidenceIds:['ev-intent']},
    {id:'claim-rationale',category:'inferred',text:'A single consumer makes invocation ordering easier to reason about than independent concurrent writes.',evidenceIds:['ev-save','ev-queue']}
  ],alternatives:[{option:'Independent concurrent writes',tradeoff:'Higher concurrency; arrival-order completion is not guaranteed.',origin:'design-example-inference'}],limitations:['No live Meta explanation was generated.','No persistence across process restarts.','Failed jobs remain at the head; retry policy is unspecified.','Concurrent callers do not receive a per-job completion promise.','Array shift can be expensive for large queues.','Server-side effects and exactly-once delivery are not established.']},
  stages:[
    {name:'작업 시작',phase:'CLI 목적 보고',revision:'before',message:'예시 CLI: “저장 요청이 접수 순서대로 처리되도록 바꾸겠습니다.” 아직 파일 변경은 없습니다.'},
    {name:'파일 변경',phase:'3개 변경 감지 · 분석 중',revision:'before',message:'save.ts 수정, TaskQueue.ts와 queue.test.ts 추가를 감지했습니다. 현재 그래프는 이전 스냅샷이며 새 관계를 분석하는 단계입니다.'},
    {name:'구조 갱신',phase:'새 모듈·호출 관계',revision:'after',message:'TaskQueue와 FIFO example이 추가되었습니다. Save service → TaskQueue 호출이 생겼고 기존 Editor는 그대로 유지됩니다.'},
    {name:'검증 상태',phase:'검증 결과 분리',revision:'after',message:'테스트 예제 소스는 있지만 실행 기록은 없습니다. “테스트 통과” 대신 “미실행”으로 남깁니다.'},
    {name:'설명 기록',phase:'근거와 설명 연결 · 예시',revision:'after',message:'Meta가 작성할 설명의 예시입니다. 목적, Queue/FIFO 의미, 대안, 실패 처리와 반환 계약의 한계를 구분합니다. 실제 API 호출은 없습니다.'},
    {name:'다음 CLI',phase:'문맥 패킷 조회 · 예시',revision:'after',message:'새 CLI는 관련 모듈의 계약과 근거·제약을 읽습니다. 부족한 부분은 근거 위치의 원본 소스로 내려가 확인합니다.'}
  ]
};
fs.writeFileSync(path.join(__dirname,'sample.json'),JSON.stringify(sample,null,2)+'\n');
fs.writeFileSync(path.join(__dirname,'sample-data.js'),'// Generated by build-sample.cjs; illustrative data, no live integrations.\nwindow.DEPTH_LENS_SAMPLE = '+JSON.stringify(sample,null,2)+';\n');
console.log('Wrote sample.json and sample-data.js from one source.');
