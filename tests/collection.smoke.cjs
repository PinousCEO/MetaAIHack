const fs = require('node:fs');
const path = require('node:path');
const {spawn} = require('node:child_process');
const {pathToFileURL} = require('node:url');
const assert = require('node:assert/strict');
const root = path.resolve(__dirname, '..');
const pageFile = 'index.html';
const out = path.join(root, 'artifacts', 'collection');
fs.mkdirSync(out, {recursive: true});
const profile = fs.mkdtempSync(path.join(out, 'edge-profile-'));
const exe = process.env.DEPTH_BROWSER || 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
const child = spawn(exe, ['--headless=new', '--disable-gpu', '--no-first-run', '--no-default-browser-check', '--remote-debugging-port=0', '--remote-allow-origins=*', '--user-data-dir='+profile, '--window-size=1600,1000', 'about:blank'], {windowsHide:true, stdio:'ignore'});
const delay = ms => new Promise(r=>setTimeout(r,ms));
let socket;
(async()=>{
  const portFile=path.join(profile,'DevToolsActivePort');
  for(let i=0;i<100&&!fs.existsSync(portFile);i++) await delay(100);
  assert(fs.existsSync(portFile),'Browser started');
  const port=fs.readFileSync(portFile,'utf8').split('\n')[0];
  const targets=await (await fetch('http://127.0.0.1:'+port+'/json',{signal:AbortSignal.timeout(10000)})).json();
  socket=new WebSocket(targets.find(x=>x.type==='page').webSocketDebuggerUrl);
  await new Promise((resolve,reject)=>{socket.addEventListener('open',resolve,{once:true});socket.addEventListener('error',reject,{once:true})});
  const requests=new Map();let sequence=0;const errors=[];
  socket.addEventListener('message',event=>{const m=JSON.parse(event.data);if(m.id){const p=requests.get(m.id);if(p){requests.delete(m.id);m.error?p.reject(Error(JSON.stringify(m.error))):p.resolve(m.result)}}if(m.method==='Runtime.exceptionThrown')errors.push(m.params.exceptionDetails)});
  function send(method,params={}){return new Promise((resolve,reject)=>{const id=++sequence;const timeout=setTimeout(()=>{requests.delete(id);reject(Error('CDP timeout: '+method))},15000);requests.set(id,{resolve:value=>{clearTimeout(timeout);resolve(value)},reject:error=>{clearTimeout(timeout);reject(error)}});socket.send(JSON.stringify({id,method,params}))})}
  async function evaluate(expression){const r=await send('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true});if(r.exceptionDetails)throw Error(JSON.stringify(r.exceptionDetails));return r.result.value}
  await send('Runtime.enable');await send('Page.enable');
  await send('Emulation.setDeviceMetricsOverride',{width:1600,height:1000,deviceScaleFactor:1,mobile:false});
  await send('Page.navigate',{url:'http://127.0.0.1:4182/?view=collect'});
  for(let i=0;i<80;i++){if(await evaluate('!!window.depthCollector'))break;await delay(100)}
  async function capture(name){await delay(100);const s=await send('Page.captureScreenshot',{format:'png'});fs.writeFileSync(path.join(out,name+'.png'),Buffer.from(s.data,'base64'))}
  assert.equal((await evaluate('depthCollector.state()')).hasSelection,false);
  await capture('before-selection');
  const spot=await evaluate('(()=>{const r=document.getElementById("previewImport").getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2}})()');
  await send('Input.dispatchMouseEvent',{type:'mousePressed',...spot,button:'left',clickCount:1});await send('Input.dispatchMouseEvent',{type:'mouseReleased',...spot,button:'left',clickCount:1});
  for(let i=0;i<60;i++){if((await evaluate('depthCollector.state()')).hasSelection)break;await delay(50)}
  await capture('gathering');await delay(1400);await capture('gathered');
  let state=await evaluate('depthCollector.state()');assert.equal(state.current,'ui:button:0');assert(state.compositionIds.length>10);assert(state.functions.includes('function:snapshot'));assert(state.flights>=5);
  assert.equal(new Set(state.compositionIds).size,state.compositionIds.length);
  const getStyle='[...document.querySelectorAll(".module")].find(e=>e.dataset.node==="style:button")';
  await evaluate('(()=>{const i='+getStyle+'.querySelector("input[data-property=fontSize]");i.value="20";i.dispatchEvent(new Event("input",{bubbles:true}))})()');
  assert.equal(await evaluate('document.getElementById("previewImport").style.fontSize'),'20px');
  assert.equal(await evaluate('document.getElementById("previewRefresh").style.fontSize'),'20px');
  await evaluate('document.getElementById("previewRefresh").click()');await delay(1400);
  state=await evaluate('depthCollector.state()');assert.equal(state.current,'ui:button:1');assert.equal(await evaluate('document.querySelectorAll(".kind-STYLE").length'),1);assert.equal(await evaluate('document.querySelectorAll(".kind-FONT").length'),1);
  assert.equal(await evaluate('document.getElementById("previewImport").style.fontSize'),'20px');
  await capture('shared-style');
  await evaluate('document.getElementById("foldCollection").click()');assert((await evaluate('depthCollector.state()')).folded);assert((await evaluate('document.getElementById("preview").getBoundingClientRect().width'))>200);
  await capture('folded');await evaluate('document.getElementById("foldCollection").click()');await delay(1300);
  await evaluate('depthCollector.collect("ui:button:0")');await delay(1400);
  await send('Emulation.setDeviceMetricsOverride',{width:1366,height:900,deviceScaleFactor:1,mobile:false});await delay(200);await capture('laptop');
  assert.equal(errors.length,0,JSON.stringify(errors));
  fs.writeFileSync(path.join(out,'result.json'),JSON.stringify({passed:true,compositionCount:state.compositionIds.length,checks:['preview always visible','actual preview click','spatial gathering animation','dependency closure','stable implementation identities','shared live property preview','fold and expand composition','no runtime exceptions']},null,2));
  console.log('PASS: preview click, module gathering, dependency closure, shared identities, live values, fold/unfold, no runtime exceptions');
  await send('Browser.close').catch(()=>{});
})().catch(error=>{console.error(error);process.exitCode=1}).finally(()=>{socket?.close();child.kill()});
