'use strict';
// Actual renderer and analysis service + actual local project HTTP server.
// Electron IPC/view mounting and Meta response are explicit fixtures here.
const fs=require('node:fs'),path=require('node:path'),net=require('node:net'),assert=require('node:assert/strict'),{spawn}=require('node:child_process'),{JSDOM}=require('jsdom');
const {Runtime}=require('./runtime-core.cjs'),links=require('./runtime-links.cjs');
const root=path.resolve(__dirname,'..'),out=path.join(root,'artifacts','runtime-dom-'+Date.now()),checks=[],sleep=ms=>new Promise(r=>setTimeout(r,ms));
const missingRuntime=process.argv.includes('--missing-runtime');
fs.mkdirSync(out,{recursive:true});let service,dom,runtime;
const check=(condition,name)=>{assert(condition,name);checks.push(name);};
async function main(){
 const socket=net.createServer();await new Promise(r=>socket.listen(0,'127.0.0.1',r));const port=socket.address().port;await new Promise(r=>socket.close(r));
 const project=path.join(out,'project');fs.cpSync(path.join(root,'samples/RuntimeWeb'),project,{recursive:true});
 service=spawn('dotnet',[path.join(root,'artifacts/desktop-service/Depth.Service.dll')],{cwd:root,windowsHide:true,stdio:'ignore',env:{...process.env,DEPTH_PORT:String(port),DEPTH_TOKEN:'runtime-dom-fixture',DEPTH_STORAGE:path.join(out,'state'),DEPTH_ENV_FILE:path.join(out,'no-env'),DEPTH_WEB_ADAPTER:path.join(root,'adapters/web/index.mjs'),DEPTH_NODE_EXECUTABLE:process.execPath}});
 const api=require('./service-client.cjs').createClient(()=>'http://127.0.0.1:'+port,'runtime-dom-fixture');
 for(let i=0;i<180;i++){try{await api('/health');break;}catch{await sleep(100);}}
 dom=new JSDOM(fs.readFileSync(path.join(__dirname,'ui/index.html'),'utf8'),{url:'http://depth.test/',runScripts:'outside-only',pretendToBeVisual:true});const w=dom.window,d=w.document;
 w.ResizeObserver=class{constructor(callback){this.callback=callback;}observe(){this.callback();}disconnect(){}};w.HTMLDialogElement.prototype.showModal=function(){this.open=true;};w.HTMLDialogElement.prototype.close=function(){this.open=false;this.dispatchEvent(new w.Event('close'));};
 let listener=()=>{},selectionListener=()=>{},graph,selection,agentRequest,highlight,commands=[],picker,appliedValues=0;
 runtime=new Runtime({publish:s=>listener(s)});
 w.depth={initial:async()=>({project,example:true}),chooseProject:async()=>picker,projectFromDrop:async()=>picker,request:async(route,body)=>{if(route==='/agent'){agentRequest=body;return {message:'Explicit Meta transport fixture.',proposal:null};}const result=await api(route,body);if(route==='/apply')appliedValues++;return result;},onRuntime:f=>listener=f,onRuntimeSelection:f=>selectionListener=f,runtime:async(action,payload={})=>{
  if(missingRuntime){commands.push(action);await sleep(20);throw Error("Error invoking remote method 'runtime': Error: No handler registered for 'runtime'");}
  commands.push(action);if(action==='sync'){graph=await api('/graph');return runtime.project(graph.root);}
  if(action==='start')return runtime.start(payload.id);if(action==='stop')return runtime.stop();if(action==='status')return runtime.snapshot();if(action==='bounds'||action==='inspect')return true;
  if(action==='highlight'){highlight=payload.id;return true;}if(action==='context')return {projectId:graph.projectId,revision:graph.revision,status:runtime.state.status,url:runtime.state.url,selected:selection};
  if(action==='connect')return runtime.attach(payload.url);throw Error('Fixture does not implement '+action);
 }};
 for(const script of d.querySelectorAll('script[src]'))w.eval(fs.readFileSync(path.join(__dirname,'ui',script.getAttribute('src').split('?')[0]),'utf8'));
 const wait=async(fn=()=>w.depthApp?.state().ready&&!w.depthApp.state().busy)=>{for(let i=0;i<240;i++){if(fn())return;await sleep(30);}throw Error('Renderer timeout: '+d.querySelector('#toast').textContent);};
 if(missingRuntime){
  await wait();check(w.depthApp.state().sourceCount>=4&&w.depthApp.state().memberIds.length>0,'source and complete module composition load when the very first runtime IPC is absent');
  check(!w.depthApp.state().lastError&&w.depthRuntime.current.status==='restart-required','absent main-process handler is scoped to preview without raw IPC error');
  check(commands.length===1&&commands[0]==='sync','startup layout and selection wait for runtime registration before calling IPC');
  check(d.querySelector('#runtime-connect').disabled&&d.querySelector('#runtime-run').disabled,'unavailable preview controls do not send failing commands');
  for(const name of ['TaskRunner','Checkout','RuntimeWeb']){
   picker=path.join(root,'samples',name);d.querySelector('#open').click();await wait();
   const indexed=await api('/graph');check(indexed.root===picker&&w.depthApp.state().projectId===indexed.projectId&&w.depthApp.state().memberIds.length>0,'folder picker loads actual '+name+' source and modules without runtime IPC');
   check(!w.depthApp.state().lastError,'project '+name+' opens without a runtime error toast');
  }
  picker=path.join(root,'samples/TaskRunner');const drop=new w.Event('drop',{bubbles:true,cancelable:true});Object.defineProperty(drop,'dataTransfer',{value:{types:['Files'],files:[{name:'TaskRunner'}]}});d.dispatchEvent(drop);await wait();
  check((await api('/graph')).root===picker&&w.depthApp.state().ready,'project drag and drop remains usable after missing runtime startup');
  d.querySelector('#prompt').value='Explain this project';d.querySelector('#send').click();await wait();
  check(agentRequest?.projectId===w.depthApp.state().projectId,'Meta CLI can inspect imported source with preview unavailable');
  w.dispatchEvent(new w.Event('resize'));w.depthRuntime.measure();w.depthRuntime.highlight(w.depthApp.state().entity);await sleep(30);
  check(commands.length===1&&!w.depthApp.state().lastError,'subsequent resize, selection and chat do not repeat missing-handler calls');
  fs.writeFileSync(path.join(out,'report.json'),JSON.stringify({status:'passed',checks,scope:'Cold renderer start with absent runtime IPC; actual .NET project imports and source/graph. IPC/Meta fixtures, no native pixels.'},null,2));console.log(JSON.stringify({passed:checks.length,out,mode:'missing-runtime'}));return;
 }
 await wait();check(!d.querySelector('.preview-sheet'),'hardcoded preview not rendered');check(!!d.querySelector('#runtime-viewport'),'actual runtime viewport replaces projected cart');
 check(d.querySelector('#runtime-target').value==='web','detected project target appears');check(d.querySelector('#runtime-status').textContent==='idle','idle preview does not claim a connected runtime');
 check(!w.depthApp.state().runtime.url,'import does not auto-run application');check(w.depthApp.state().sourceCount>=4,'actual web project source indexed');
 const click=async selector=>{const e=d.querySelector(selector);assert(e,selector);e.click();await wait();if(!d.querySelector('#toast').hidden)throw Error(d.querySelector('#toast').textContent);};
 await w.depthRuntime.command('/preview run');const url=runtime.state.url;check((await fetch(url)).ok,'CLI run starts real project HTTP server');
 check(d.querySelector('#runtime-address').textContent===url,'preview and CLI share the same server URL');
 const pricing=graph.entities.find(e=>e.name==='calculate');check(!!pricing,'actual TypeScript compiler indexes pricing function');
 const htmlFile=links.resolve(graph,[{path:'index.html',line:3}]);check(htmlFile.length===1&&htmlFile[0].precision==='source-file','static text uses honest HTML file-level binding');
 selection={name:'Total',entities:links.resolve(graph,[{path:'pricing.js',line:2}]),page:'/',projectId:graph.projectId,revision:graph.revision};
 await api('/runtime/select',{projectId:graph.projectId,revision:graph.revision,sessionId:'fixture',objectId:'total',name:'Total',sourcePaths:['pricing.js']});selectionListener(selection);await wait();
 check(w.depthApp.state().assemblyRoot===pricing.id,'runtime-selected source opens its actual composition');
 const expected=await api('/composition/'+pricing.id);check(JSON.stringify([...w.depthApp.state().memberIds].sort())===JSON.stringify([...expected.memberIds].sort()),'all composition modules retained');
 check(d.querySelector('#selection-code').textContent.includes('quantity'),'selected module displays actual source');
 d.querySelector('#prompt').value='Explain the selected total';await click('#send');
 check(agentRequest.projectId===graph.projectId&&agentRequest.revision===graph.revision,'Meta CLI uses current indexed project snapshot');
 check(agentRequest.prompt.includes(url)&&agentRequest.prompt.includes('pricing.js'),'Meta CLI receives actual session URL and selected runtime source');
 check(agentRequest.moduleIds.includes(pricing.id),'Meta CLI receives selected module IDs');
 d.querySelector('#prompt').value='/preview status';const previous=agentRequest;await click('#send');check(agentRequest===previous,'explicit preview commands do not call Meta');
 const earlier=w.depthApp.state().assemblyRoot;selectionListener({...selection,projectId:'stale-project'});await wait();check(w.depthApp.state().assemblyRoot===earlier,'stale project selection ignored');
 selectionListener({...selection,name:'Unmapped element',entities:[]});await wait();check(d.querySelector('#runtime-mapping').textContent.includes('No source binding'),'unmapped UI element is not assigned fabricated code');
 check(w.depthApp.state().assemblyRoot===earlier,'unmapped UI click preserves valid source selection');
 const cart=graph.entities.find(e=>e.name==='applyCoupon');check(!!cart,'second runtime source is indexed');
 selectionListener({...selection,name:'Composite runtime element',entities:[...selection.entities,{id:cart.id,name:cart.name,path:'cart.js',line:10}]});await wait();
 check(d.querySelector('#toast').hidden,'multi-source selection succeeds: '+d.querySelector('#toast').textContent);
 const allParts=await Promise.all([pricing.id,cart.id].map(id=>api('/composition/'+id))),allIds=[...new Set(allParts.flatMap(p=>p.memberIds))].sort();
 check(JSON.stringify([...w.depthApp.state().memberIds].sort())===JSON.stringify(allIds),'all source compositions on a runtime element are shown together');
 check(d.querySelector('#assembly-title').textContent.includes('2 source bindings'),'multiple source roots explicitly displayed: '+d.querySelector('#assembly-title').textContent);
 check(d.querySelector('#preview-context-name').textContent==='Composite runtime element','runtime element name survives module inspection');
 selection={...selection,name:'Composite runtime element',entities:[...selection.entities,{id:cart.id,name:cart.name,path:'cart.js',line:10}]};
 d.querySelector('#prompt').value='Explain both sources';await click('#send');check(agentRequest.moduleIds.includes(pricing.id)&&agentRequest.moduleIds.includes(cart.id),'CLI keeps every source binding on the selected runtime element');
 await click('#theme-toggle');check(runtime.state.url===url,'theme toggle does not replace runtime session');
 for(const screen of ['map','feature','understand','relations','split','integrate','assets','review','history']){const button=d.querySelector('[data-screen="'+screen+'"]');if(button){await click('[data-screen="'+screen+'"]');check(w.depthApp.state().screen===screen,'existing '+screen+' screen remains reachable');}}
 await click('[data-screen="understand"]');await click('[data-page="modules"]');
 const originalPricing=fs.readFileSync(path.join(project,'pricing.js'),'utf8');
 await click('[data-edit-values="'+pricing.id+'"]');
 check(!d.querySelector('#module-values').hidden,'values editor is directly inside module workspace');
 const valueInput=async literal=>{const view=await api('/view'),property=view.cards.find(c=>c.id===pricing.id).properties.find(p=>p.literal===literal);assert(property,'literal '+literal);return d.querySelector('[data-value-owner="'+pricing.id+'"][data-value-key="'+property.key+'"] [name="source-value"]');};
 const set=(input,value)=>{assert(input);input.value=value;input.dispatchEvent(new w.Event('input',{bubbles:true}));};
 set(await valueInput('48'),'60');set(await valueInput('0.2'),'0.25');const metaBeforeValues=agentRequest;
 await click('#edit-module-values');await click('#edit-module-values');
 check((await valueInput('48')).value==='60'&&(await valueInput('0.2')).value==='0.25','collapsing values preserves both unsaved fields');
 w.depthValues.open(cart.id);w.depthValues.open(pricing.id);
 check((await valueInput('48')).value==='60'&&!d.querySelector('#apply-module-values').disabled,'returning to a module preserves its draft within the same source revision');
 await click('#apply-module-values');
 const newPricing=fs.readFileSync(path.join(project,'pricing.js'),'utf8');
 check(newPricing===originalPricing.replace(' * 48;',' * 60;').replace('subtotal * 0.2','subtotal * 0.25'),'two module inputs replace only their exact real AST source spans');
 check(appliedValues===1&&agentRequest===metaBeforeValues,'one Apply saves both values without an AI request');
 check((await(await fetch(new URL('pricing.js',url))).text())===newPricing,'real running project server serves the changed source');
 const actual=new JSDOM(await(await fetch(url)).text(),{url,runScripts:'outside-only'});
 actual.window.eval(newPricing.replace('export function','function')+'\n'+fs.readFileSync(path.join(project,'cart.js'),'utf8').replace("import { calculate } from './pricing.js';",''));
 actual.window.document.querySelector('#coupon').click();check(actual.window.document.querySelector('#total').textContent==='$45.00','actual project code computes the new total after module value edits');actual.window.close();
 check(d.querySelector('#module-values').textContent.includes('2 value(s) saved'),'module editor reports the committed source change');
 await click('.value-undo');check(fs.readFileSync(path.join(project,'pricing.js'),'utf8')===originalPricing&&appliedValues===2,'one-click value undo restores the original real source');
 set(await valueInput('48'),'not-a-number');await click('#apply-module-values');check(fs.readFileSync(path.join(project,'pricing.js'),'utf8')===originalPricing&&d.querySelector('.value-result').textContent.includes('finite number'),'invalid module input reports error and leaves source untouched');
 set(await valueInput('48'),'60');
 await api('/validation/profile',{name:'Required project checks',requirePass:true,commands:[{kind:'test',executable:process.execPath,arguments:['-e','process.exit(0)'],workingDirectory:'.',timeoutSeconds:30}]});
 await click('#apply-module-values');check(fs.readFileSync(path.join(project,'pricing.js'),'utf8')===originalPricing&&d.querySelector('.value-result').textContent.includes('Review required checks'),'inline Apply preserves required project validation policy');
 await click('#ai-models');check(d.querySelector('#dialog-body').textContent.includes('muse-spark-1.3')&&d.querySelector('#dialog-body').textContent.includes('muse-image-1.0')&&agentRequest===metaBeforeValues,'model information exposes configured roles without making an inference call');await click('#close-dialog');
 await w.depthRuntime.command('/preview stop');check(runtime.state.status==='stopped','CLI stop releases runtime');
 picker=path.join(root,'samples/TaskRunner');await click('#open');check(w.depthApp.state().projectId!==graph.projectId||graph.root===picker,'new project indexed');
 check(w.depthApp.state().runtime.root===picker&&!w.depthApp.state().runtime.url,'project change cannot retain previous runtime URL');
 check(d.querySelector('#runtime-mapping').textContent===''||!w.depthRuntime.mapped,'project change clears runtime selection');
 check(d.querySelector('#runtime-target').textContent.includes('application window'),'non-web project offers actual window connection');
 check(!d.querySelector('.preview-sheet'),'non-web project is not replaced by fake checkout UI');
 w.depthRuntime.frameSurface.hidden=false;w.depthRuntime.frameImage.src='data:image/png;base64,fixture';
 const workingRuntime=w.depth.runtime;w.depth.runtime=async()=>{throw Error('Fixture: preview transport disconnected');};picker=path.join(root,'samples/Checkout');await click('#open');
 check((await api('/graph')).root===picker&&w.depthApp.state().memberIds.length>0&&w.depthRuntime.current.status==='failed','other preview transport failures do not block project import or module composition');
 check(!w.depthApp.state().lastError&&d.querySelector('#runtime-status').textContent.includes('preview transport disconnected'),'preview failure remains visible in the preview without a source import error');
 check(w.depthRuntime.frameSurface.hidden&&!w.depthRuntime.frameImage.hasAttribute('src'),'disconnected preview cannot keep displaying a stale engine image');
 w.depth.runtime=workingRuntime;await click('#refresh');check(w.depthRuntime.hostReady&&w.depthRuntime.current.status==='idle','refresh recovers a restored runtime transport without reopening the project');
 w.depth.runtime=async()=>{throw Error("Error invoking remote method 'runtime': No handler registered for 'runtime'");};await w.depthRuntime.sync();
 check(w.depthRuntime.current.status==='restart-required'&&w.depthApp.state().ready,'reloaded UI on an older main process reports restart without blocking source workspace');
 fs.writeFileSync(path.join(out,'report.json'),JSON.stringify({status:'passed',checks,scope:'Actual renderer/service/HTTP with IPC and Meta fixtures. No native pixels or actual model call.'},null,2));console.log(JSON.stringify({passed:checks.length,out}));
}
main().catch(e=>{fs.writeFileSync(path.join(out,'report.json'),JSON.stringify({status:'failed',checks,error:e.stack},null,2));console.error(e);process.exitCode=1;}).finally(async()=>{dom?.window.close();await runtime?.stop();service?.kill();});
