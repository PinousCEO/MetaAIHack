'use strict';
// Explicit local review mode. No socket, arbitrary script, shell command or source mutation protocol.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const enumFields={view:['feature','map','understand','relations','split','integrate','assets','review','history'],theme:['light','dark'],layout:['guide','routes','orbit'],evidence:['source','why'],workspace:['default','cli','preview'],panel:['preview','modules','hierarchy','console','chat','details','source']};
function validate(request){
 if(!request||typeof request!=='object'||Array.isArray(request))throw Error('Request must be an object');
 const allowed=new Set(['id','reload','view','theme','layout','evidence','workspace','panel','previewKey','moduleName','width','height','zoom']);
 if(Object.keys(request).some(k=>!allowed.has(k)))throw Error('Unknown review command');
 if(typeof request.id!=='string'||!/^[a-z0-9][a-z0-9-]{0,63}$/.test(request.id))throw Error('Invalid capture ID');
 for(const [key,values] of Object.entries(enumFields))if(request[key]!==undefined&&!values.includes(request[key]))throw Error('Invalid '+key);
 for(const key of ['previewKey','moduleName'])if(request[key]!==undefined&&(typeof request[key]!=='string'||request[key].length>160||!request[key].length))throw Error('Invalid '+key);
 if(request.reload!==undefined&&typeof request.reload!=='boolean')throw Error('Invalid reload');
 for(const [key,min,max] of [['width',1050,2200],['height',700,1500],['zoom',.8,1.5]])if(request[key]!==undefined&&(!Number.isFinite(request[key])||request[key]<min||request[key]>max))throw Error('Invalid '+key);
 if((request.width===undefined)!==(request.height===undefined))throw Error('Width and height must be supplied together');
 return request;
}
exports.validate=validate;
exports.run=async({win,evidence,sleep})=>{
 const {captureMarker}=require('./smoke.cjs'),{auditSurfaces}=require('./surface-smoke.cjs'),{auditIdentity}=require('./identity-audit.cjs');
 const js=code=>win.webContents.executeJavaScript(code,true),seen=new Set();let sequence=0;
 const wait=async()=>{for(let i=0;i<200;i++){if(win.isDestroyed())throw Error('Review window closed');if(await js('Boolean(window.depthApp?.state().ready&&!depthApp.state().busy)'))return;await sleep(100);}throw Error('UI not ready');};
 const click=async selector=>{
  const p=await js(`(()=>{const e=document.querySelector(${JSON.stringify(selector)});if(!e||e.disabled)throw Error('Control unavailable');e.scrollIntoView({block:'nearest'});const r=e.getBoundingClientRect(),x=Math.round(r.left+r.width/2),y=Math.round(r.top+r.height/2);if(!r.width||!r.height||!e.contains(document.elementFromPoint(x,y)))throw Error('Control is not exposed to pointer');return {x,y};})()`);
  win.webContents.sendInputEvent({type:'mouseMove',...p});win.webContents.sendInputEvent({type:'mouseDown',...p,button:'left',clickCount:1});win.webContents.sendInputEvent({type:'mouseUp',...p,button:'left',clickCount:1});await sleep(150);await wait();
 };
 const go=async view=>{
  if(view==='feature'){if(!await js('Boolean(document.querySelector("[data-page=modules]"))'))await click('[data-screen="understand"]');await click('[data-page="modules"]');}
  else if(view==='relations'){await click('[data-screen="map"]');await click('[data-screen="relations"]');}
  else if(view==='history'){await click('[data-screen="review"]');await click('[data-page="history"]');}
  else await click('[data-screen="'+view+'"]');
 };
 await wait();win.setTitle('Depth AI · Visual review · isolated sample');
 fs.writeFileSync(path.join(evidence,'ready.json'),JSON.stringify({schema:'visual-review-1',pid:process.pid,startedAt:new Date().toISOString(),scope:'Explicit local visual review; isolated Checkout copy; no live Meta requests or code changes from this protocol.'},null,2));
 if(!fs.existsSync(path.join(evidence,'request.json')))fs.writeFileSync(path.join(evidence,'request.json'),JSON.stringify({id:'00-initial',view:'feature',theme:'light',evidence:'source'}));
 while(!win.isDestroyed()){
  await sleep(250);let request;
  try{const file=path.join(evidence,'request.json');if(!fs.existsSync(file))continue;if(fs.statSync(file).size>16384)throw Error('Request too large');request=validate(JSON.parse(fs.readFileSync(file,'utf8')));}catch(error){fs.writeFileSync(path.join(evidence,'request-error.json'),JSON.stringify({error:error.message}));continue;}
  if(seen.has(request.id))continue;seen.add(request.id);
  const result={schema:'visual-review-1',request,startedAt:new Date().toISOString()};
  try{
   if(request.reload){await win.loadURL('depth://app/index.html');await wait();}
   if(request.width)win.setSize(Math.round(request.width),Math.round(request.height));
   if(request.zoom)win.webContents.setZoomFactor(request.zoom);
   if(request.workspace)await js('depthDock.preset('+JSON.stringify(request.workspace)+')');
   if(request.panel)await js('depthDock.show('+JSON.stringify(request.panel)+')');
   if(request.view)await js('depthDock.show("modules")');
   if(request.view)await go(request.view);
   if(request.theme&&await js('document.documentElement.dataset.theme')!==request.theme)await click('#theme-toggle');
   if(request.layout)await click('[data-layout="'+request.layout+'"]');
   if(request.previewKey)await js('depthDock.show("preview")');
   if(request.previewKey){const index=await js(`Array.from(document.querySelectorAll('[data-preview-key]')).findIndex(e=>e.dataset.previewKey===${JSON.stringify(request.previewKey)})`);if(index<0)throw Error('Preview binding absent');const key=await js(`document.querySelectorAll('[data-preview-key]')[${index}].dataset.previewKey`);await click('[data-preview-key="'+key.replace(/["\\]/g,'\\$&')+'"]');}
   if(request.moduleName){await js('depthDock.show("modules")');const index=await js(`Array.from(document.querySelectorAll('[data-node]')).findIndex(e=>e.querySelector('h3').textContent===${JSON.stringify(request.moduleName)})`);if(index<0)throw Error('Module absent');await click('#assembly-nodes>article:nth-child('+(index+1)+')');}
   if(request.evidence){await js('depthDock.show("details")');await click('[data-evidence="'+request.evidence+'"]');}
   await js('document.fonts.ready.then(()=>true)');await js('Promise.all([...document.images].filter(e=>e.getClientRects().length).map(e=>e.decode())).then(()=>true)');await sleep(350);
   result.state=await js('depthApp.state()');result.theme=await js('document.documentElement.dataset.theme');
   if(result.state.screen==='feature')result.layout=await js('('+auditSurfaces.toString()+')()');
   result.visualAudit=await js('('+auditIdentity.toString()+')()');
   const color=[19+(++sequence%200),93,211],marker=await js('('+captureMarker.toString()+')('+JSON.stringify(color)+')');
   let image,fresh=false;
   for(let i=0;i<50;i++){image=await win.webContents.capturePage(undefined,{stayAwake:true});if(!image.isEmpty()){const size=image.getSize(),b=image.toBitmap({scaleFactor:1}),x=Math.floor(marker.x*size.width/marker.width),y=Math.floor(marker.y*size.height/marker.height),offset=(y*size.width+x)*4;fresh=x>=0&&y>=0&&x<size.width&&y<size.height&&b[offset]===color[2]&&b[offset+1]===color[1]&&b[offset+2]===color[0];if(fresh)break;}await sleep(100);}
   if(!fresh)throw Error('A fresh painted frame was not captured');
   const png=image.toPNG();fs.writeFileSync(path.join(evidence,request.id+'.png'),png);
   result.image={file:request.id+'.png',...image.getSize(),sha256:crypto.createHash('sha256').update(png).digest('hex'),freshFrame:true};
   result.sourceHashes=Object.fromEntries(['ui/index.html','ui/visual-identity.css','ui/workspace.js','ui/app.js','ui/dock-model.js','ui/dock-engine.js','ui/dock-workbench.js','ui/preview-focus.js','ui/docking.css','ui/assembly.js','ui/visual-model.js','ui/product.js','visual-review.cjs'].map(file=>[file,crypto.createHash('sha256').update(fs.readFileSync(path.join(__dirname,file))).digest('hex')]));
   result.status='captured';
  }catch(error){result.status='failed';result.error=String(error.stack||error);}
  fs.writeFileSync(path.join(evidence,request.id+'.json'),JSON.stringify(result,null,2));
 }
};
