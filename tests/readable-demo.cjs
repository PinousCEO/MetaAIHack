const fs = require('node:fs');
const path = require('node:path');
const {spawn} = require('node:child_process');
const {pathToFileURL} = require('node:url');
const assert = require('node:assert/strict');
const root = path.resolve(__dirname, '..');
const pageFile = 'readable.html';
const out = path.join(root, 'artifacts', 'readable');
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
  const targets=await (await fetch('http://127.0.0.1:'+port+'/json')).json();
  socket=new WebSocket(targets.find(x=>x.type==='page').webSocketDebuggerUrl);
  await new Promise((resolve,reject)=>{socket.addEventListener('open',resolve,{once:true});socket.addEventListener('error',reject,{once:true})});
  const requests=new Map();let sequence=0;const errors=[];
  socket.addEventListener('message',event=>{const m=JSON.parse(event.data);if(m.id){const p=requests.get(m.id);if(p){requests.delete(m.id);m.error?p.reject(Error(JSON.stringify(m.error))):p.resolve(m.result)}}if(m.method==='Runtime.exceptionThrown')errors.push(m.params.exceptionDetails)});
  function send(method,params={}){return new Promise((resolve,reject)=>{const id=++sequence;requests.set(id,{resolve,reject});socket.send(JSON.stringify({id,method,params}))})}
  async function evaluate(expression){const r=await send('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true});if(r.exceptionDetails)throw Error(JSON.stringify(r.exceptionDetails));return r.result.value}
  await send('Runtime.enable');await send('Page.enable');
  await send('Emulation.setDeviceMetricsOverride',{width:1600,height:1000,deviceScaleFactor:1,mobile:false});
  await send('Page.navigate',{url:pathToFileURL(path.join(root,'design/interaction',pageFile)).href});
  for(let i=0;i<50;i++){if(await evaluate('!!window.readableDemo'))break;await delay(100)}
  async function capture(name){await delay(150);const s=await send('Page.captureScreenshot',{format:'png'});fs.writeFileSync(path.join(out,name+'.png'),Buffer.from(s.data,'base64'))}
  assert.equal((await evaluate('readableDemo.getState()')).step,0);
  await capture('initial');
  await evaluate('for(let i=0;i<3;i++)document.getElementById("next").click()');
  let state=await evaluate('readableDemo.getState()');assert.equal(state.wallet,1350);assert.equal(state.balance,1250);
  await capture('step-three');
  await evaluate('document.getElementById("next").click()');assert.equal((await evaluate('readableDemo.getState()')).balance,1350);
  await evaluate('document.querySelector("[data-module=reward]").click()');
  assert((await evaluate('document.getElementById("codeText").textContent')).includes('wallet.Add(100)'));
  await capture('source');
  await evaluate('document.querySelector("[data-target=wallet]").click()');
  assert((await evaluate('document.getElementById("codeText").textContent')).includes('TrySpend'));
  await evaluate('document.getElementById("closeDetail").click()');
  const spot=await evaluate('(()=>{const r=document.getElementById("preview").getBoundingClientRect();return {x:r.left+r.width*450/600,y:r.top+r.height*50/430}})()');
  await send('Input.dispatchMouseEvent',{type:'mousePressed',...spot,button:'left',clickCount:1});
  await send('Input.dispatchMouseEvent',{type:'mouseReleased',...spot,button:'left',clickCount:1});
  assert.equal((await evaluate('readableDemo.getState()')).selection,'coin');
  assert.equal(await evaluate('document.querySelectorAll(".flow .related").length'),2);
  await evaluate('document.getElementById("overviewTab").click()');
  assert(await evaluate('document.getElementById("overviewView").classList.contains("show")'));
  await evaluate('document.getElementById("returnFlow").click();readableDemo.reset()');
  await send('Emulation.setDeviceMetricsOverride',{width:1366,height:900,deviceScaleFactor:1,mobile:false});
  await capture('laptop');
  assert.equal(errors.length,0,JSON.stringify(errors));
  console.log('PASS: four-step data propagation, source navigation, preview object picking, related modules, overview, no runtime exceptions');
  await send('Browser.close').catch(()=>{});
})().catch(error=>{console.error(error);process.exitCode=1}).finally(()=>{socket?.close();child.kill()});
