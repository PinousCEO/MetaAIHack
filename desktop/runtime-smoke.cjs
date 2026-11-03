'use strict';
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
exports.run=async({win,runtimeHost,api,evidence,sleep,app})=>{
 const report={schema:'actual-project-runtime-2-values',checks:[],captures:[],errors:[]};
 const check=(value,name)=>{assert(value,name);report.checks.push(name);};
 const js=code=>win.webContents.executeJavaScript(code,true);
 const wait=async(fn,label)=>{for(let i=0;i<200;i++){if(await fn())return;await sleep(100);}throw Error('Timed out: '+label);};
 const capture=async name=>{
  await sleep(250);
  // Child WebContentsView is a separate compositor surface. Capture the actual
  // OS window rather than pretending the host renderer includes the project.
  const handle=win.getNativeWindowHandle(),id='window:'+(handle.length>=8?handle.readBigUInt64LE().toString():handle.readUInt32LE().toString())+':0';
  const size=win.getSize(),sources=await require('electron').desktopCapturer.getSources({types:['window'],thumbnailSize:{width:size[0],height:size[1]}}),source=sources.find(s=>s.id===id);
  if(!source||source.thumbnail.isEmpty())throw Error('Actual composite window capture unavailable');
  const file=name+'.png';fs.writeFileSync(path.join(evidence,file),source.thumbnail.toPNG());report.captures.push(file);
  if(runtimeHost.view){const project=await runtimeHost.view.webContents.capturePage();fs.writeFileSync(path.join(evidence,name+'-project.png'),project.toPNG());report.captures.push(name+'-project.png');}
 };
 try{
  await wait(()=>js('window.depthApp?.state().ready&&!window.depthApp.state().busy'),'workbench');
  check(!await js('!!document.querySelector(".preview-sheet")'),'hardcoded Checkout preview removed');
  await js('window.depthRuntime.command("/preview run")');
  await wait(()=>runtimeHost.runtime.state.status==='connected','actual project document');
  const page=runtimeHost.view.webContents;
  check(await page.executeJavaScript('document.title')==='Trail supply · project runtime','actual project title');
  check(await page.executeJavaScript('typeof window.depth')==='undefined','project cannot access host IPC');
  check(await page.executeJavaScript('typeof require')==='undefined','project cannot access Node');
  const pointer=async selector=>{const r=await page.executeJavaScript(`(()=>{const r=document.querySelector(${JSON.stringify(selector)}).getBoundingClientRect();return {x:Math.round(r.x+r.width/2),y:Math.round(r.y+r.height/2)}})()`);page.sendInputEvent({type:'mouseDown',button:'left',clickCount:1,...r});page.sendInputEvent({type:'mouseUp',button:'left',clickCount:1,...r});await sleep(250);};
  await pointer('#coupon');check(await page.executeJavaScript('document.querySelector("#total").textContent')==='$38.40','project JavaScript executes from real pointer click');
  const color=await page.executeJavaScript('getComputedStyle(document.documentElement).backgroundColor');await capture('01-actual-web-light');
  await js('document.querySelector("#theme-toggle").click()');await sleep(200);
  check(await page.executeJavaScript('getComputedStyle(document.documentElement).backgroundColor')===color,'host theme does not alter project colors');
  check(await page.executeJavaScript('document.querySelector("#total").textContent')==='$38.40','theme switch preserves runtime application state');await capture('02-actual-web-dark-workbench');
  await js('window.depthRuntime.command("/preview inspect")');await pointer('#total');
  await wait(()=>Promise.resolve(runtimeHost.selected?.entities.length),'runtime source location');
  check(runtimeHost.selected.entities.some(e=>e.path==='pricing.js'&&e.name==='calculate'),'runtime click resolves to indexed pricing function');
  const selected=await api('/runtime/selection');check(selected.sourcePaths.includes('pricing.js'),'runtime selection shared with analysis service');
  await wait(()=>js('!window.depthApp.state().busy'),'module inspection');await capture('03-runtime-to-source');
  const context=await js('window.depthRuntime.chatContext()');check(context.projectId===(await api('/graph')).projectId&&context.selected.entities.some(e=>e.path==='pricing.js'),'CLI context shares project and runtime selection');
  const hostPointer=async selector=>{const r=await js(`(()=>{const e=document.querySelector(${JSON.stringify(selector)});e.scrollIntoView({block:'nearest'});const r=e.getBoundingClientRect();if(!r.width||!r.height)throw Error('Value control is hidden');return {x:Math.round(r.x+r.width/2),y:Math.round(r.y+r.height/2)}})()`);win.webContents.sendInputEvent({type:'mouseDown',button:'left',clickCount:1,...r});win.webContents.sendInputEvent({type:'mouseUp',button:'left',clickCount:1,...r});};
  const card=(await api('/view')).cards.find(c=>c.name==='calculate'),price=card.properties.find(p=>p.literal==='48');
  await js(`(()=>{const e=document.querySelector('[data-value-key="${price.key}"] [name="source-value"]');e.value='60';e.dispatchEvent(new Event('input',{bubbles:true}));})()`);
  await hostPointer('#apply-module-values');await wait(()=>js('!depthApp.state().busy'),'value save');
  await wait(async()=>await page.executeJavaScript('document.querySelector("#total")?.textContent')==='$60.00','actual runtime updated by module value');
  check((await api('/view')).cards.find(c=>c.id===card.id).properties.some(p=>p.value==='60'),'module value saved in actual source');await capture('04-module-value-saved');
  await hostPointer('.value-undo');await wait(()=>js('!depthApp.state().busy'),'value undo');
  await wait(async()=>await page.executeJavaScript('document.querySelector("#total")?.textContent')==='$48.00','actual runtime value undo');
  check(true,'native module value save and undo update the actual preview');
  await js('window.depthRuntime.command("/preview reload")');await sleep(600);check(await page.executeJavaScript('document.querySelector("#total").textContent')==='$48.00','CLI reload reloads the actual application');
  await js('window.depthRuntime.command("/preview stop")');check(!runtimeHost.view&&runtimeHost.runtime.state.status==='stopped','CLI stop closes project view and local server');
  report.status='passed';
 }catch(e){report.status='failed';report.errors.push(e.stack);try{await capture('failure');}catch{}}
 fs.writeFileSync(path.join(evidence,'report.json'),JSON.stringify(report,null,2));app.exit(report.status==='passed'?0:1);
};
