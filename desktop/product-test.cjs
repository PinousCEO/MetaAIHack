// UI integration: real service/files/builds, explicitly simulated Meta transport.
// Never a live Meta or pixel test. Nothing in the shipped renderer enables this fixture.
const {JSDOM}=require('jsdom'),fs=require('node:fs'),path=require('node:path'),http=require('node:http'),net=require('node:net'),assert=require('node:assert/strict'),{spawn}=require('node:child_process');
const root=path.resolve(__dirname,'..'),out=path.join(root,'artifacts','cohesion-contract-'+Date.now()),sleep=ms=>new Promise(r=>setTimeout(r,ms));
async function port(){const s=net.createServer();await new Promise(r=>s.listen(0,'127.0.0.1',r));const p=s.address().port;await new Promise(r=>s.close(r));return p;}
async function main(){
 fs.mkdirSync(out,{recursive:true});const project=path.join(out,'TaskRunner'),other=path.join(out,'Rewards');fs.cpSync(path.join(root,'samples/TaskRunner'),project,{recursive:true,filter:p=>!['bin','obj','.depth'].includes(path.basename(p))});fs.mkdirSync(other);
 const reward='public static class Rewards { public static int Points(int count, int cents) => Pricing.Total(count, cents) / 100; }\n';
 fs.writeFileSync(path.join(other,'Rewards.cs'),reward+'public static class Pricing { public static int Total(int count, int cents) => count * cents; }');
 const png=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR4nGNwaPj/HwAFggK/465+UQAAAABJRU5ErkJggg==','base64');
 const modelCalls=[],rendererCalls=[],checks=[];const check=(v,name)=>{assert(v,name);checks.push(name);};let dom,service;let failImage=false;
 const fixture=http.createServer(async(req,res)=>{try{let text='';for await(const b of req)text+=b;const body=JSON.parse(text);modelCalls.push(req.url);let result;
  if(req.url==='/generate'){if(failImage){res.writeHead(503).end('{}');return;}result={protocol:'depth-meta-assets/v1',provider:'meta',model:'chameleon',format:'png',contentBase64:png.toString('base64')};}
  else{const system=body.messages[0].content,prompt=body.messages[1].content;let answer;
   if(system.includes('organizing actual code')){
    const packet=JSON.parse(prompt.split('\nSOURCE ')[0]),ids=packet.entityIds,blocks=prompt.split('\nSOURCE ').slice(1);const evidence=blocks.find(b=>b.includes('pending.Enqueue(item)'));
    const note={name:'Queue source fixture',purpose:'FIFO source evidence fixture',responsibilities:['Preserve arrival order'],inputs:['string'],outputs:['string'],sideEffects:[],invariants:['FIFO'],assumptions:['Explicit fixture, not live Meta'],evidenceIds:ids.slice(0,1),documentation:{version:2,creationReason:'소스의 입력 순서를 유지하기 위한 테스트 설명입니다.',decisions:[]}};
    if(evidence){const id=evidence.split(' ')[0];note.evidenceIds=[id];note.documentation.decisions=[{concept:'Queue / FIFO',summary:'먼저 들어온 작업을 먼저 꺼냅니다.',definition:'FIFO는 먼저 들어온 항목부터 처리하는 선입선출 순서입니다. 줄을 서서 기다리는 순서와 같습니다.',mechanism:'Add는 뒤에 넣고 Next는 앞에서 꺼냅니다.',whyHere:'요청 순서를 유지하는 코드로 해석됩니다.',example:'A 다음 B를 추가하면 A를 먼저 꺼냅니다.',alternatives:['Stack은 역순 처리에 적합합니다.'],tradeoffs:['빈 큐에서 Next를 호출하면 예외가 발생합니다.'],evidence:[{entityId:id,quote:'pending.Enqueue(item)'}]}];}
    answer={modules:[{entityIds:ids,explanation:note}]};
   }else{
    const packet=JSON.parse(prompt);let edits;
    if(packet.kind==='split'){
     const input=packet.target.files.find(f=>f.path==='App.cs');assert(input,'fixture receives full App.cs');const at=input.content.indexOf('public static class Pricing');assert(at>0);edits=[{path:'App.cs',operation:'replace',expectedHash:input.expectedHash,content:input.content.slice(0,at).trimEnd()+'\n'},{path:'Modules/Pricing.cs',operation:'create',expectedHash:'',content:input.content.slice(at)}];
    }else{edits=[{path:'Modules/Rewards.cs',operation:'create',expectedHash:'',content:reward}];}
    answer={id:'',projectId:packet.projectId,revision:packet.revision,reason:'Explicit fixture: '+packet.kind+' with source-preserving declarations.',modules:[],edits};
   }result={choices:[{message:{role:'assistant',content:JSON.stringify(answer)},finish_reason:'stop'}]};
  }res.setHeader('Content-Type','application/json');res.end(JSON.stringify(result));
 }catch(error){res.writeHead(500,{'Content-Type':'application/json'});res.end(JSON.stringify({error:error.message}));}});
 await new Promise(r=>fixture.listen(0,'127.0.0.1',r));
 const modelPort=fixture.address().port,servicePort=await port(),envFile=path.join(out,'fixture.env');fs.writeFileSync(envFile,'MODEL_API_KEY=fixture-only\n');
 service=spawn('dotnet',[path.join(root,'artifacts/desktop-service/Depth.Service.dll')],{cwd:root,windowsHide:true,stdio:'ignore',env:{...process.env,DEPTH_PORT:String(servicePort),DEPTH_TOKEN:'product-test',DEPTH_STORAGE:path.join(out,'state'),DEPTH_ENV_FILE:envFile,DOTNET_gcServer:'0'}});
 const api=require('./service-client.cjs').createClient(()=> 'http://127.0.0.1:'+servicePort,'product-test');
 try{
  for(let i=0;i<160;i++){try{await api('/health');break;}catch{await sleep(100);}}
  let rejected=false;try{await api('/assets/../../.env');}catch{rejected=true;}check(rejected,'host transport rejects arbitrary asset paths');
  dom=new JSDOM(fs.readFileSync(path.join(__dirname,'ui/index.html'),'utf8'),{url:'http://depth.test/',runScripts:'outside-only',pretendToBeVisual:true});const w=dom.window,d=w.document;
  w.HTMLDialogElement.prototype.showModal=function(){this.open=true;};w.HTMLDialogElement.prototype.close=function(){this.open=false;};
  w.depth={initial:async()=>({project,example:false}),chooseProject:async()=>other,request:async(route,body)=>{
   rendererCalls.push({route,body:body?structuredClone(body):null});
   if(['/modules/analyze','/modules/transform'].includes(route))body={...body,connection:{model:'explicit-ui-fixture',protocol:'llama-compatible',endpoint:'http://127.0.0.1:'+modelPort+'/v1/',apiKey:''}};
   if(route==='/assets/generate')body={...body,connection:{protocol:'worker',endpoint:'http://127.0.0.1:'+modelPort+'/',apiKey:''}};
   return api(route,body);
  }};
  for(const file of ['icons.js','visual-model.js','style-study/layout.js','assembly.js','dock-model.js','dock-engine.js','dock-workbench.js','preview-focus.js','workspace.js','project-drop.js','product.js','runtime-frame.js','runtime-preview.js','value-editor.js','app.js'])w.eval(fs.readFileSync(path.join(__dirname,'ui',file),'utf8'));
  const wait=async()=>{for(let i=0;i<2000;i++){if(w.depthApp.state().ready&&!w.depthApp.state().busy)return;await sleep(50);}throw Error('UI timed out: '+d.querySelector('#toast').textContent);};
  const click=async(s,allowError=false)=>{const el=d.querySelector(s);assert(el,'control exists '+s);el.click();await wait();if(!allowError&&!d.querySelector('#toast').hidden)throw Error(d.querySelector('#toast').textContent);};
  await wait();const graph=await api('/graph'),queue=graph.entities.find(c=>c.name==='JobQueue'&&c.kind==='NamedType');
  check(w.depthApp.state().screen==='feature','opens indexed project workspace (runtime host unavailable in DOM fixture)');await click('[data-screen="map"]');
  check(d.querySelectorAll('.rail>[data-screen]').length===6,'six stable navigation controls');
  check(d.querySelector('.brand').textContent==='DEPTH AI','single wordmark across views');
  const mapIds=[...d.querySelectorAll('.map-grid [data-surface-id]')].map(x=>x.dataset.surfaceId);check(new Set(mapIds).size===mapIds.length,'map does not duplicate shared implementations');
  check(graph.entities.filter(c=>c.kind==='NamedType').every(c=>mapIds.includes(c.id)),'map displays every source class');
  await click('[data-understand="'+queue.id+'"]');
  const children=graph.relations.filter(r=>r.kind==='contains'&&r.from===queue.id).map(r=>r.to);check(children.every(id=>d.querySelector('[data-inspect="'+id+'"]')),'open chassis displays every queue member');
  check(d.querySelector('.queue-lesson')&&d.querySelectorAll('.queue-item').length===3,'FIFO diagram appears only from actual queue source');
  await click('[data-queue="next"]');check(d.querySelector('.queue-item').textContent.startsWith('B'),'FIFO removes front A');await click('[data-queue="add"]');check(d.querySelectorAll('.queue-item')[2].textContent==='D','FIFO enqueues at the back');await click('[data-queue="reset"]');
  const beforeCalls=modelCalls.length;await click('#analyze');check(modelCalls.length>beforeCalls,'Meta analyze button reaches explicit model fixture');
  check(d.querySelector('#explanation').textContent.includes('Queue / FIFO'),'source-grounded structured explanation rendered');
  await click('#open-rationale');check(d.querySelector('#dialog').open&&d.querySelector('#dialog-body blockquote code').textContent==='pending.Enqueue(item)'&&d.querySelector('#dialog-body [data-inspect-source]'),'full rationale exposes exact source quotation and source navigation');await click('#close-dialog');
  check(d.querySelector('.design-story').textContent.includes('Queue / FIFO'),'expanded module includes the detailed design rationale in its main reading area');
  const long=d.querySelector('#explanation').textContent.length,calls=modelCalls.length;await click('[data-level="expert"]');check(d.querySelector('#explanation').textContent.length<long,'expert explanation is shorter');await click('[data-level="beginner"]');check(modelCalls.length===calls,'level changes use existing explanation without inference');
  await click('[data-screen="map"]');await click('[data-screen="relations"]');const catalog=await api('/modules/catalog');
  check(d.querySelector('.matrix')&&d.querySelector('.math-formula').textContent.includes('Pᵀ'),'real quotient matrix rendered');
  const matrixRows=[...d.querySelectorAll('.matrix tbody tr')];check(matrixRows.length===Math.min(10,catalog.mathematics.modules.length),'matrix dimensions derive from the service');
  await click('[data-kind="calls"]');const canonical=new Map(graph.relations.map(r=>[r.id,r]));check([...d.querySelectorAll('[data-edge]')].every(el=>canonical.get(el.dataset.edge).kind==='calls'),'relation filter preserves canonical source IDs');
  await click('[data-screen="understand"]');await click('[data-page="modules"]');check(d.querySelectorAll('[data-node]').length===w.depthApp.state().memberIds.length,'return from relation view restores full composition');
  await click('#reduce-motion');check(w.localStorage.getItem('depth.reduced-motion')==='true'&&d.body.classList.contains('reduced-motion'),'motion preference is persisted');
  await click('[data-screen="map"]');const pricing=(await api('/graph')).entities.find(c=>c.name==='Pricing'&&c.kind==='NamedType');await click('[data-understand="'+pricing.id+'"]');await click('#split');
  check(d.querySelector('.ghost-frame').textContent.includes('Meta'),'no fabricated post-split files before proposal');
  const original=fs.readFileSync(path.join(project,'App.cs'),'utf8');await click('#create-transform');
  check(w.depthApp.state().screen==='review'&&d.querySelectorAll('.review-diff').length===2,'split proposal renders actual two-file diff');
  check(d.querySelector('[data-apply]').disabled&&!fs.existsSync(path.join(project,'Modules/Pricing.cs'))&&fs.readFileSync(path.join(project,'App.cs'),'utf8')===original,'unvalidated split cannot apply and leaves original intact');
  await click('#validation-profile');d.querySelector('#profile-json').value=JSON.stringify({name:'Isolated TaskRunner',requirePass:true,commands:[{kind:'build',executable:'dotnet',arguments:['build','--nologo','--ignore-failed-sources','-p:NuGetAudit=false','-p:UseSharedCompilation=false'],workingDirectory:'.',timeoutSeconds:120},{kind:'test',executable:'dotnet',arguments:['run','--no-build','--project','TaskRunner.csproj'],workingDirectory:'.',timeoutSeconds:60}]});await click('#save-profile');
  await click('[data-validate]');check(d.querySelector('#dialog').open,'validation shows exact command confirmation');await click('#confirm-validation');
  check(!d.querySelector('[data-apply]').disabled,'real copy build and FIFO/Pricing execution enable split apply');
  await click('[data-apply]');check(fs.existsSync(path.join(project,'Modules/Pricing.cs'))&&!fs.readFileSync(path.join(project,'App.cs'),'utf8').includes('class Pricing'),'UI approval extracts actual Pricing file');
  await click('#integrate');await click('#choose-source');const sourceBefore=fs.readFileSync(path.join(other,'Rewards.cs'),'utf8');
  const choices=[...d.querySelectorAll('[name="transform-module"]')];check(choices.length>0,'integration offers real source project modules');choices[0].checked=true;
  await click('#create-transform');check(d.querySelectorAll('.review-diff').length===1&&!fs.existsSync(path.join(project,'Modules/Rewards.cs')),'integration remains a one-file proposal before approval');
  await click('[data-validate]');await click('#confirm-validation');check(!d.querySelector('[data-apply]').disabled,'integrated Rewards compiles and executes against shared Pricing');await click('[data-apply]');
  check(fs.readFileSync(path.join(other,'Rewards.cs'),'utf8')===sourceBefore&&fs.existsSync(path.join(project,'Modules/Rewards.cs')),'integration writes target and preserves original source project');
  await click('[data-screen="assets"]');check(!d.querySelector('#generate-asset').disabled&&d.querySelector('#import-asset').disabled,'asset page separates generation from approved import');
  await click('[data-asset-style="3d"]');d.querySelector('#asset-prompt').value='Explicit fixture: sage mug';await click('#generate-asset');
  const request=rendererCalls.filter(c=>c.route==='/assets/generate').at(-1);check(request.body.kind==='image'&&request.body.style==='3d'&&Object.keys(request.body.connection).length===0,'production UI requests Meta 3D-style PNG without a worker or mesh');
  check(d.querySelector('.asset-preview img').src==='data:image/png;base64,'+png.toString('base64'),'generated image preview uses service-validated bytes through host client');
  check(!fs.existsSync(path.join(project,'Assets/generated.png')),'staged asset is not imported automatically');await click('#import-asset');check(fs.readFileSync(path.join(project,'Assets/generated.png')).equals(png),'explicit UI approval imports exact image bytes');
  check(d.querySelector('#import-asset').disabled,'already imported image cannot be imported twice');
  const prior=d.querySelector('.asset-preview img').src;failImage=true;d.querySelector('#asset-prompt').value='Fail deliberately';await click('#generate-asset',true);check(!d.querySelector('#toast').hidden&&d.querySelector('.asset-preview img').src===prior,'generation failure is visible and cannot fabricate a new result');d.querySelector('#toast').hidden=true;
  check(!d.querySelector('.inspector').textContent.includes('fixture-only'),'configured key never reaches renderer');
  fs.writeFileSync(path.join(out,'renderer-dom.html'),dom.serialize());
  const result={passed:checks.length,checks,modelCalls:modelCalls.length,scope:'Actual service, source operations, validation-copy dotnet build/run and renderer DOM. Explicit loopback Meta/asset fixtures. No live Meta, native rendering or general behavior-preservation claim.'};fs.writeFileSync(path.join(out,'report.json'),JSON.stringify(result,null,2));console.log(JSON.stringify({out,...result},null,2));
 }catch(error){fs.writeFileSync(path.join(out,'report.json'),JSON.stringify({checks,error:error.stack,modelCalls:modelCalls.length},null,2));console.error(error);process.exitCode=1;}
 finally{dom?.window.close();service?.kill();fixture.closeAllConnections();fixture.close();}
}
main().catch(e=>{console.error(e);process.exitCode=1;});
