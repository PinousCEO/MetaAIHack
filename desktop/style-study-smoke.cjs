const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),crypto=require('node:crypto');
exports.run=async({win,evidence,sleep,app})=>{
 const checks=[],captures=[],errors=[],layoutAudits=[],js=code=>win.webContents.executeJavaScript(code,true),check=(value,name)=>{assert(value,name);checks.push(name);};
 win.webContents.on('console-message',(_e,level,message)=>{if(level===3)errors.push(message);});fs.mkdirSync(evidence,{recursive:true});
 const hash=file=>crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex'),sourceHashes=Object.fromEntries(['index.html','study.js','study.css','preview.js','layout.js','layout-audit.js','data.js'].map(f=>[f,hash(path.join(__dirname,'ui/style-study',f))]));
 const escape=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 const save=(status,error)=>{
  fs.writeFileSync(path.join(evidence,'report.json'),JSON.stringify({schema:'preview-visual-2',status,passed:checks.length,checks,captures,errors,layoutAudits,sourceHashes,error:error?String(error.stack||error):undefined,scope:'Live index, actual Electron frames and browser-coordinate mouse input. Scroll coverage of preview, canvas and source. No physical OS pointer, Meta inference or human visual approval claim.'},null,2));
  fs.writeFileSync(path.join(evidence,'index.html'),'<!doctype html><html lang="en"><meta charset="utf-8"><title>Depth AI actual screen review</title><style>body{font:16px/1.5 system-ui;background:#17202b;color:#eef2fa;margin:28px}a{color:#acd3ff}article{border-top:1px solid #5a6577;padding:18px 0}img{width:100%;height:auto}.fail{color:#ffb4aa}pre{white-space:pre-wrap}</style><h1>Actual Electron frames</h1><p>Status: '+escape(status)+' / human visual review pending</p>'+captures.map(c=>{const audit=layoutAudits.find(a=>a.name===c.name);return '<article><h2>'+escape(c.name)+'</h2><p>'+escape(c.state.mode)+' / '+escape(c.state.previewKey||'entry')+'</p><pre class="fail">'+escape(audit?.failures.join('\n')||'No measured layout failures')+'</pre><a href="'+escape(c.file)+'"><img loading="lazy" src="'+escape(c.file)+'" alt="'+escape(c.name)+' actual frame"></a></article>';}).join('')+'</html>');
 };
 async function overview(){await js('window.scrollTo(0,0);document.querySelector(".preview-panel").scrollTop=0');await sleep(100);}
 async function at(selector){await js('document.querySelector('+JSON.stringify(selector)+').scrollIntoView({block:"center",inline:"nearest",behavior:"instant"})');await sleep(120);}
 async function pointerClick(selector){
  await at(selector);const point=await js('(()=>{const el=document.querySelector('+JSON.stringify(selector)+'),r=el.getBoundingClientRect(),x=r.left+r.width/2,y=r.top+r.height/2;return {x:Math.round(x),y:Math.round(y),hit:x>=0&&y>=0&&x<innerWidth&&y<innerHeight&&el.contains(document.elementFromPoint(x,y))};})()');
  check(point.hit,'visible unobstructed click target '+selector);win.focus();
  win.webContents.sendInputEvent({type:'mouseMove',x:point.x,y:point.y});
  win.webContents.sendInputEvent({type:'mouseDown',x:point.x,y:point.y,button:'left',clickCount:1});
  win.webContents.sendInputEvent({type:'mouseUp',x:point.x,y:point.y,button:'left',clickCount:1});
 }
 async function capture(name){await js('document.fonts.ready.then(()=>true)');await js('Promise.all([...document.images].filter(i=>i.getClientRects().length).map(i=>i.decode())).then(()=>true)');const color=[31+captures.length,97,217];
  await js(`(()=>{let e=document.querySelector('#study-marker');if(!e){e=document.createElement('div');e.id='study-marker';document.body.append(e);}Object.assign(e.style,{position:'fixed',top:'0',left:'0',width:'8px',height:'8px',zIndex:'2147483647',background:'rgb('+${JSON.stringify(color)}.join(',')+')',pointerEvents:'none'});})()`);
  let image,fresh=false;for(let i=0;i<50;i++){image=await win.webContents.capturePage(undefined,{stayAwake:true});if(!image.isEmpty()){const b=image.toBitmap({scaleFactor:1}),size=image.getSize(),p=(2*size.width+2)*4;fresh=b[p]===color[2]&&b[p+1]===color[1]&&b[p+2]===color[0];if(fresh)break;}await sleep(100);}
  check(fresh,'fresh native frame '+name);const file=path.join(evidence,name+'.png');fs.writeFileSync(file,image.toPNG());captures.push({name,file:name+'.png',sha256:hash(file),...image.getSize(),state:await js('DepthStudy.state()'),scroll:await js('({page:scrollY,preview:document.querySelector(".preview-panel").scrollTop})'),frameVerified:true});save('running');
  if(name!=='failure'){const audit=await js('DepthStudyLayoutAudit()');layoutAudits.push({name,...audit});save('running');check(audit.available,'actual rendered layout exists '+name);if(!audit.failures.length)check(true,'glyph, text and UI spacing '+name);}
 }
 try{
  check(await js('Boolean(window.DepthStudy)'),'study loaded');check(await js('DepthStudy.ready'),'current project loaded');const selected=await js('DepthStudy.state().selected');
  for(const mode of['guide','routes','orbit']){
   await js('DepthStudy.mode('+JSON.stringify(mode)+')');await overview();check(await js('DepthStudy.state().selected')===selected,'selection preserved '+mode);
   check(await js('document.querySelectorAll("[data-node]").length===DepthStudy.state().nodeIds.length'),'all canonical nodes '+mode);
   check(await js('document.documentElement.scrollWidth<=innerWidth'),'no document horizontal overflow '+mode);
   check(await js('(()=>{const bounds=document.querySelector("#graph").getBoundingClientRect();return [...document.querySelectorAll("[data-node]")].every(n=>{const r=n.getBoundingClientRect();return r.width>0&&r.height>0&&r.left>=bounds.left-1&&r.right<=bounds.right+1&&r.top>=bounds.top-1&&r.bottom<=bounds.bottom+1;});})()'),'all module bodies fit the native viewport '+mode);
   await capture(mode);await at('#viewport');await capture(mode+'-canvas');await at('#source-code');await capture(mode+'-source');
   await js('document.querySelector("#theme").click()');await overview();await capture(mode+'-alternate-theme');await at('#viewport');await capture(mode+'-alternate-canvas');
  }
  const bindings=await js('window.depth.request("/view").then(v=>v.preview.bindings)');
  for(const binding of bindings){
   await pointerClick('[data-preview-key="'+binding.key+'"]');
   for(let i=0;i<200;i++){if(await js('!DepthStudy.state().busy&&DepthStudy.state().rootId==='+JSON.stringify(binding.id)))break;await sleep(50);}
   check(await js('DepthStudy.state().rootId')===binding.id,'native preview click root '+binding.key);
   check(await js('(async()=>{const c=await depth.request("/composition/'+binding.id+'");const s=DepthStudy.state();const same=(a,b)=>JSON.stringify([...a].sort())===JSON.stringify([...b].sort());return !s.error&&same(s.nodeIds,c.memberIds)&&same(s.relationIds,c.relations.map(r=>r.id));})()'),'native complete source scope '+binding.key);
   check(await js('(async()=>{const record=await depth.request("/source/'+binding.id+'");const excerpts=record.sources.map(s=>s.content.split(/\\r?\\n/).slice(s.anchor.startLine-1,s.anchor.endLine).join("\\n"));return excerpts.length>0&&["#source-code","#trace-code"].every(selector=>excerpts.every(text=>document.querySelector(selector).textContent.includes(text)));})()'),'native exact declaration and immediate source '+binding.key);
   if(['title','total','product.0.image','action'].includes(binding.key)){const name='preview-'+binding.key.replace(/\./g,'-');await capture(name);await at('#trace-code');await capture(name+'-source');}
  }
  win.setSize(1120,780);await sleep(300);
  for(const mode of['guide','routes','orbit']){await js('DepthStudy.mode('+JSON.stringify(mode)+')');await overview();await capture(mode+'-small');await at('#viewport');await capture(mode+'-small-canvas');}
  win.webContents.setZoomFactor(1.25);await sleep(300);
  for(const mode of['guide','routes','orbit']){await js('DepthStudy.mode('+JSON.stringify(mode)+')');await overview();await capture(mode+'-small-125pct');await at('#viewport');await capture(mode+'-small-125pct-canvas');}
  check(errors.length===0,'no renderer console errors');check(layoutAudits.every(a=>a.failures.length===0),'all measured screens have no layout failures; see individual audits');save('passed');app.quit();
 }catch(e){try{await capture('failure');}catch{}save('failed',e);app.exit(1);}
};
