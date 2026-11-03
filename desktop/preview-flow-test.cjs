// Actual service + shipped renderer. No model responses, browser pixels or runtime UI inference.
const fs=require('node:fs'),path=require('node:path'),net=require('node:net'),crypto=require('node:crypto'),assert=require('node:assert/strict'),{spawn}=require('node:child_process'),{JSDOM}=require('jsdom');
const root=path.resolve(__dirname,'..'),dir=path.join(__dirname,'ui/style-study'),out=path.join(root,'artifacts/preview-flow-'+Date.now()),checks=[];
const sleep=ms=>new Promise(r=>setTimeout(r,ms)),check=(v,n)=>{assert(v,n);checks.push(n);},same=(a,b)=>JSON.stringify([...a].sort())===JSON.stringify([...b].sort());
fs.mkdirSync(out,{recursive:true});
function renderer(bridge){const dom=new JSDOM(fs.readFileSync(path.join(dir,'index.html'),'utf8'),{url:'http://depth.test/style-study/',runScripts:'outside-only'}),w=dom.window;w.depth=bridge;
 w.HTMLDialogElement.prototype.showModal=function(){this.open=true;};w.HTMLDialogElement.prototype.close=function(){this.open=false;};
 w.eval(fs.readFileSync(path.join(__dirname,'ui/icons.js'),'utf8'));w.eval(fs.readFileSync(path.join(__dirname,'ui/project-drop.js'),'utf8'));for(const file of['data.js','layout.js','preview.js','study.js','layout-audit.js'])w.eval(fs.readFileSync(path.join(dir,file),'utf8'));return dom;
}
async function settled(w){for(let i=0;i<500;i++){if(!w.DepthStudy.state().busy)return;await sleep(10);}throw Error('Preview selection timeout');}
async function exercise(dom,view,composition,source,label){const w=dom.window,d=w.document,api=w.DepthStudy;await api.ready;
 check(api.state().ready,label+' ready');check(d.querySelectorAll('[data-preview-id]').length===view.preview.bindings.length,label+' every declared target is clickable');
 for(const [i,b]of view.preview.bindings.entries()){
  d.querySelector('[data-preview-key="'+b.key+'"]').click();await settled(w);const expected=await composition(b.id),state=api.state();
  check(!state.error&&state.rootId===b.id&&state.selected===b.id,label+' click selects canonical root '+b.key);
  check(same(state.nodeIds,expected.memberIds)&&same([...d.querySelectorAll('[data-node]')].map(e=>e.dataset.node),expected.memberIds),label+' complete composition '+b.key);
  check(same(state.relationIds,expected.relations.map(r=>r.id)),label+' exact source relationships '+b.key);
  check(d.querySelector('[data-preview-key="'+b.key+'"]').getAttribute('aria-pressed')==='true'&&d.querySelectorAll('[data-preview-id][aria-pressed=true]').length===1,label+' one selected preview target '+b.key);
  const records=await source(b.id);check(records.every(s=>d.querySelector('#source-code').textContent.includes(s.text))&&records.length>0,label+' exact declaration source '+b.key);
  check(records.every(s=>d.querySelector('#trace-code').textContent.includes(s.text)),label+' clicked source immediately visible beside preview '+b.key);
  const target=expected.relations.find(r=>r.from===b.id&&r.to!==view.preview.viewId)?.to||view.preview.entryId;
  const button=d.querySelector('#trace-targets [data-select="'+target+'"]')||d.querySelector('[data-node="'+target+'"]');
  if(button){button.dispatchEvent(new w.MouseEvent('click',{bubbles:true}));check(api.state().selected===target&&api.state().rootId===b.id&&same(api.state().nodeIds,expected.memberIds),label+' source navigation retains preview and full scope '+b.key);}
  const selected=api.state().selected;api.mode(['guide','routes','orbit'][i%3]);check(api.state().selected===selected&&api.state().rootId===b.id,label+' style keeps preview selection '+b.key);
  const root=d.querySelector('[data-node="'+b.id+'"]');check(root?.querySelector('.node-title').textContent===view.cards.find(c=>c.id===b.id).name,label+' preview root exists in module canvas '+b.key);
 }
 const total=view.preview.bindings.find(b=>b.key==='total'),expected=await composition(total.id);await api.openPreview(total.id,total.key);
 check(expected.memberIds.some(id=>view.cards.find(c=>c.id===id)?.name==='CalculateTotal'),label+' total includes actual calculation');
 check(expected.memberIds.some(id=>view.cards.find(c=>c.id===id)?.name==='DiscountPercent'),label+' total includes referenced discount');
 check(d.querySelector('#trace-code').textContent.includes('subtotal * (1 - DiscountPercent / 100)'),label+' total immediately exposes actual calculation body');
 d.querySelector('#preview-size').click();check(d.body.classList.contains('preview-expanded'),label+' preview enlarges');d.querySelector('#preview-size').click();
 check(!w.DepthStudyLayoutAudit().available,label+' DOM cannot claim rendered geometry');
}
(async()=>{
 const snapshot=renderer();const data=snapshot.window.DepthStudyData;
 await exercise(snapshot,{cards:data.allCards,preview:data.preview},async id=>data.compositions[id],async id=>data.allSources[id],'snapshot');snapshot.window.close();
 const listener=net.createServer();await new Promise(r=>listener.listen(0,'127.0.0.1',r));const port=listener.address().port;await new Promise(r=>listener.close(r));const token=crypto.randomBytes(20).toString('hex');
 const child=spawn('dotnet',[path.join(root,'artifacts/desktop-service/Depth.Service.dll')],{cwd:root,windowsHide:true,stdio:'ignore',env:{...process.env,DEPTH_PORT:String(port),DEPTH_TOKEN:token,DEPTH_STORAGE:path.join(out,'state'),DOTNET_gcServer:'0'}});let fault;child.on('error',e=>fault=e);
 const request=require('./service-client.cjs').createClient(()=>'http://127.0.0.1:'+port,token);let dom;
 try{
  for(let i=0;i<200;i++){if(fault)throw fault;try{await request('/health');break;}catch{if(i===199)throw Error('Service unavailable');await sleep(50);}}
  const project=path.join(out,'current-project');fs.cpSync(path.join(root,'samples/Checkout'),project,{recursive:true,filter:p=>!['bin','obj','.depth'].includes(path.basename(p))});await request('/import',{path:project});
  const view=await request('/view');let rejectId=null,delayId=null,imports=0;
  const bridge={initial:async()=>({project:path.join(root,'samples/Checkout')}),request:async(route,body)=>{if(route==='/import')imports++;if(route==='/composition/'+rejectId)throw Error('Deliberate transport failure');if(route==='/composition/'+delayId)await sleep(90);return request(route,body);}};
  dom=renderer(bridge);await dom.window.DepthStudy.ready;
  check(imports===0&&(await request('/view')).root===project,'opening preview workspace preserves currently imported project');
  check(dom.window.DepthStudy.state().live,'EXE bridge uses live index');
  await exercise(dom,view,id=>request('/composition/'+id),async id=>(await request('/source/'+id)).sources.map(s=>({text:s.content.split(/\r?\n/).slice(s.anchor.startLine-1,s.anchor.endLine).join('\n')})),'live service');
  const w=dom.window,b=view.preview.bindings,total=b.find(x=>x.key==='total'),image=b.find(x=>x.key==='product.0.image');
  const before=w.DepthStudy.state();rejectId=image.id;await w.DepthStudy.openPreview(image.id,image.key);
  check(w.DepthStudy.state().error?.includes('Deliberate')&&w.DepthStudy.state().rootId===before.rootId,'failed request leaves prior composition and selection intact');rejectId=null;
  await w.DepthStudy.openPreview(image.id,image.key);check(!w.DepthStudy.state().error&&w.DepthStudy.state().rootId===image.id,'retry recovers actual image composition');
  delayId=total.id;await Promise.all([w.DepthStudy.openPreview(total.id,total.key),w.DepthStudy.openPreview(image.id,image.key)]);check(w.DepthStudy.state().rootId===image.id&&w.DepthStudy.state().previewKey===image.key,'slow earlier click cannot replace latest selection');delayId=null;
  fs.writeFileSync(path.join(out,'renderer.html'),dom.serialize());dom.window.close();
  const noPreview=path.join(out,'source-only');fs.mkdirSync(noPreview);fs.writeFileSync(path.join(noPreview,'Worker.cs'),'class Worker { public int Twice(int value) => value * 2; }');await request('/import',{path:noPreview});dom=renderer(bridge);await dom.window.DepthStudy.ready;
  check(dom.window.DepthStudy.state().ready&&dom.window.document.querySelectorAll('[data-preview-id]').length===0,'project without adapter does not show sample controls');
  check(dom.window.document.querySelector('#preview-surface').textContent.includes('No declared preview'),'missing preview explained honestly');dom.window.close();
  const empty=path.join(out,'empty');fs.mkdirSync(empty);await request('/import',{path:empty});dom=renderer(bridge);await dom.window.DepthStudy.ready;
  check(dom.window.DepthStudy.state().nodeIds.length===0&&dom.window.document.querySelectorAll('[data-node]').length===0,'empty project has no stale snapshot modules');
  fs.writeFileSync(path.join(out,'report.json'),JSON.stringify({status:'passed',passed:checks.length,checks,scope:'Real HTTP index and shipped DOM; snapshot fallback, all preview bindings, evidence, recovery and race tests. No native pixels or Meta inference.'},null,2));console.log(checks.length+' preview flow checks passed. '+out);
 }finally{dom?.window.close();child.kill();}
})().catch(error=>{fs.writeFileSync(path.join(out,'failure.json'),JSON.stringify({passed:checks.length,checks,error:String(error.stack)},null,2));console.error(error);process.exitCode=1;});
