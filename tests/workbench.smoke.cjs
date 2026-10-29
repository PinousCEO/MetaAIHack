const fs = require('node:fs');
const path = require('node:path');
const {spawn} = require('node:child_process');
const {pathToFileURL} = require('node:url');
const assert = require('node:assert/strict');
const root = path.resolve(__dirname, '..');
const pageFile = 'index.html';
const out = path.join(root, 'artifacts', 'workbench');
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
  await send('Page.navigate',{url:'http://127.0.0.1:4182/'});
  for(let i=0;i<80;i++){if(await evaluate('!!window.depthWorkbench&&depthWorkbench.state().modules>0'))break;await delay(100)}
  async function capture(name){await delay(250);const s=await send('Page.captureScreenshot',{format:'png'});fs.writeFileSync(path.join(out,name+'.png'),Buffer.from(s.data,'base64'))}
  let state=await evaluate('depthWorkbench.state()');assert(state.modules>230);assert(state.visible.includes('font:unity-skin'));
  assert((await evaluate('document.querySelectorAll(".wire").length'))>3);
  await capture('modules');
  await evaluate('(()=>{const c=[...document.querySelectorAll(".module")].find(e=>e.dataset.node==="style:button");const i=c.querySelector("input[data-property=fontSize]");i.value="19";i.dispatchEvent(new Event("input",{bubbles:true}))})()');
  assert.equal(await evaluate('document.getElementById("previewImport").style.fontSize'),'19px');
  assert.equal(await evaluate('document.getElementById("previewRefresh").style.fontSize'),'19px');
  await evaluate('[...document.querySelectorAll(".review-node")].find(e=>e.dataset.review==="style:button").click()');
  for(let i=0;i<30;i++){if(await evaluate('document.getElementById("review").open'))break;await delay(100)}
  assert((await evaluate('document.getElementById("after").textContent')).includes('fontSize = 19'));
  await capture('review');
  await evaluate('document.getElementById("cancelReview").click();[...document.querySelectorAll(".ai-record")].find(e=>e.dataset.aiRecord==="ui:button:0").querySelector("summary").click()');
  assert((await evaluate('[...document.querySelectorAll(".ai-record")].find(e=>e.dataset.aiRecord==="ui:button:0").textContent')).includes('Codex'));
  await capture('ai-record');
  await evaluate('document.getElementById("search").value="font";document.getElementById("search").dispatchEvent(new Event("input"))');await delay(500);
  assert((await evaluate('document.querySelectorAll(".result").length'))>0);
  await evaluate('document.getElementById("closeSearch").click();depthWorkbench.source("style:button")');await delay(350);
  assert((await evaluate('document.getElementById("sourceText").textContent')).includes('fontSize = 13'));
  await evaluate('document.getElementById("closeSource").click();document.getElementById("overview").click()');
  assert.equal(await evaluate('document.querySelectorAll(".group-card").length'),6);await capture('overview');
  await evaluate('depthWorkbench.choose("ui:button:0")');
  await send('Emulation.setDeviceMetricsOverride',{width:1366,height:900,deviceScaleFactor:1,mobile:false});await delay(100);await evaluate('depthWorkbench.fit()');await capture('laptop');
  assert.equal(errors.length,0,JSON.stringify(errors));
  fs.writeFileSync(path.join(out,'result.json'),JSON.stringify({passed:true,checks:['real module and asset graph','inline shared-style preview','reviewable source changes without writing','read-only AI records','AI record search','real source anchors','overview groups','no runtime exceptions']},null,2));
  console.log('PASS: module graph, inline property editing, shared preview, source proposal, AI records, search, source anchors, overview');
  await send('Browser.close').catch(()=>{});
})().catch(error=>{console.error(error);process.exitCode=1}).finally(()=>{socket?.close();child.kill()});
