const fs = require('node:fs');
const path = require('node:path');
const {spawn} = require('node:child_process');
const {pathToFileURL} = require('node:url');
const assert = require('node:assert/strict');
const root = path.resolve(__dirname, '..');
const pageFile = 'index.html';
const out = path.join(root, 'artifacts', 'assembly');
fs.mkdirSync(out, {recursive: true});
const profile = fs.mkdtempSync(path.join(out, 'edge-profile-'));
const exe = process.env.DEPTH_BROWSER || 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
const child = spawn(exe, ['--headless=new', '--enable-unsafe-swiftshader', '--no-first-run', '--no-default-browser-check', '--remote-debugging-port=0', '--remote-allow-origins=*', '--user-data-dir='+profile, '--window-size=1600,1000', 'about:blank'], {windowsHide:true, stdio:'ignore'});
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
  await send('Page.navigate',{url:pathToFileURL(path.join(root,'design/assembly',pageFile)).href});
  for(let i=0;i<80;i++){if(await evaluate('!!window.depthAssembly'))break;await delay(100)}
  async function capture(name){await delay(250);const s=await send('Page.captureScreenshot',{format:'png'});fs.writeFileSync(path.join(out,name+'.png'),Buffer.from(s.data,'base64'))}
  let state=await evaluate('depthAssembly.state()');assert.equal(state.entities,214);assert.equal(state.renderer,'WebGL');assert(state.frame>1);
  await capture('exploded');
  await evaluate('document.getElementById("assembled").click()');await delay(1200);assert((await evaluate('depthAssembly.state()')).exploded<.12);
  await capture('assembled');
  await evaluate('document.getElementById("exploded").click()');await delay(1200);assert((await evaluate('depthAssembly.state()')).exploded>.88);
  await evaluate('depthAssembly.chooseModule("snapshot")');
  assert((await evaluate('document.getElementById("sourceCode").textContent')).includes('indexer.Scan(root)'));
  await capture('source');
  await evaluate('document.getElementById("closeSource").click();document.querySelector("[data-lens=runtime]").click();document.querySelector("[data-pick=landscape]").click()');
  state=await evaluate('depthAssembly.state()');assert(state.highlight.includes('desktop'));assert(state.highlight.includes('contracts'));assert(!state.highlight.includes('analysis'));
  await capture('output-selected');
  await evaluate('document.querySelector("[data-lens=all]").click();depthAssembly.chooseGroup("analysis")');
  const spot=await evaluate('depthAssembly.screenPosition("contracts")');
  const cr=await evaluate('(()=>{const r=document.getElementById("world").getBoundingClientRect();return {x:r.x,y:r.y}})()');
  await send('Input.dispatchMouseEvent',{type:'mousePressed',x:cr.x+spot.x,y:cr.y+spot.y,button:'left',clickCount:1});
  await send('Input.dispatchMouseEvent',{type:'mouseReleased',x:cr.x+spot.x,y:cr.y+spot.y,button:'left',clickCount:1});
  assert.equal((await evaluate('depthAssembly.state()')).selectedGroup,'contracts');
  await evaluate('depthAssembly.chooseGroup("analysis")');
  await send('Emulation.setDeviceMetricsOverride',{width:1366,height:900,deviceScaleFactor:1,mobile:false});
  await capture('laptop');
  assert.equal(errors.length,0,JSON.stringify(errors));
  fs.writeFileSync(path.join(out,'result.json'),JSON.stringify({passed:true,checks:['actual WebGL rendering','assembled and exploded transitions','real source anchors','output related group selection','3D mesh raycast picking','no runtime exceptions']},null,2));
  console.log('PASS: WebGL rendering, assembly transitions, source anchors, output selection, actual mesh picking, no runtime exceptions');
  await send('Browser.close').catch(()=>{});
})().catch(error=>{console.error(error);process.exitCode=1}).finally(()=>{socket?.close();child.kill()});
