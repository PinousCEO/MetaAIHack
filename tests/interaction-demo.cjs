const fs = require('node:fs');
const path = require('node:path');
const {spawn} = require('node:child_process');
const {pathToFileURL} = require('node:url');
const assert = require('node:assert/strict');
const root = path.resolve(__dirname, '..');
const pageFile = process.env.DEPTH_DEMO_PAGE || 'index.html';
const out = path.join(root, 'artifacts', pageFile === 'unfold.html' ? 'unfold' : 'interaction');
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
  for(let i=0;i<50;i++){if(await evaluate('!!window.depthDemo'))break;await delay(100)}
  let state=await evaluate('depthDemo.getState()');assert.equal(state.moduleCount,18);assert.equal(state.walletCount,1);
  if(pageFile==='unfold.html'){
    assert(await evaluate('depthUnfold.isOpen'));
    assert((await evaluate('document.getElementById("leafCode").textContent')).includes('TrySpend'));
    assert((await evaluate('document.querySelectorAll(".code-line").length'))>5);
    await evaluate('document.querySelector("[data-code-target=shop]").click()');
    assert.equal((await evaluate('depthDemo.getState()')).selected,'shop');
    assert((await evaluate('document.getElementById("leafCode").textContent')).includes('wallet.TrySpend'));
    await evaluate('document.getElementById("leafBack").click()');
    assert.equal((await evaluate('depthDemo.getState()')).selected,'wallet');
    await evaluate('document.getElementById("leafClose").click()');
    assert.equal(await evaluate('depthUnfold.isOpen'),false);
  }
  await evaluate('for(let i=0;i<5;i++) document.getElementById("next").click()');
  state=await evaluate('depthDemo.getState()');assert.equal(state.step,5);assert.equal(state.moduleCount,18);
  await evaluate('document.getElementById("next").click()');state=await evaluate('depthDemo.getState()');assert.equal(state.moduleCount,20);assert.equal(state.revision,2);assert.equal(state.selected,'reward');
  await evaluate('document.getElementById("next").click(); document.getElementById("next").click()');
  state=await evaluate('depthDemo.getState()');assert.equal(state.step,8);assert.equal(state.walletCount,1);
  await evaluate('document.querySelector("[data-object=puzzle]").click()');
  state=await evaluate('depthDemo.getState()');assert(state.active.includes('reward'));assert(state.active.includes('wallet'));assert(!state.active.includes('move'));
  // Click the actual preview canvas at the character's location.
  const spot=await evaluate('(()=>{const r=document.getElementById("game").getBoundingClientRect();return {x:r.left+r.width*150/600,y:r.top+r.height*245/420}})()');
  await send('Input.dispatchMouseEvent',{type:'mousePressed',x:spot.x,y:spot.y,button:'left',clickCount:1});
  await send('Input.dispatchMouseEvent',{type:'mouseReleased',x:spot.x,y:spot.y,button:'left',clickCount:1});
  state=await evaluate('depthDemo.getState()');assert.equal(state.selectedObject,'player');assert(state.active.includes('move'));assert(!state.active.includes('reward'));
  await evaluate('document.querySelector("[data-object=shop]").click()');state=await evaluate('depthDemo.getState()');assert(state.active.includes('wallet'));assert(state.active.includes('shop'));assert(!state.active.includes('animation'));
  await evaluate('depthDemo.selectModule("reward");document.getElementById("openSource").click()');assert(await evaluate('document.getElementById("sourceDialog").open'));assert((await evaluate('document.getElementById("sourceCode").textContent')).includes('wallet.Add(100)'));
  await evaluate('document.getElementById("closeSource").click();document.querySelector("[data-object=puzzle]").click();document.getElementById("comments").click();depthDemo.selectModule("reward")');
  if(pageFile==='unfold.html') await evaluate('depthUnfold.open("reward")');
  await delay(350);
  const capture=await send('Page.captureScreenshot',{format:'png'});fs.writeFileSync(path.join(out,'puzzle-selected.png'),Buffer.from(capture.data,'base64'));
  await evaluate('document.getElementById("all").click()');state=await evaluate('depthDemo.getState()');assert.equal(state.active.length,0);assert.equal(state.moduleCount,20);
  await delay(150);const overview=await send('Page.captureScreenshot',{format:'png'});fs.writeFileSync(path.join(out,'overview.png'),Buffer.from(overview.data,'base64'));
  await evaluate('document.getElementById("reset").click()');state=await evaluate('depthDemo.getState()');assert.equal(state.moduleCount,18);assert.equal(state.revision,1);
  assert.equal(errors.length,0,JSON.stringify(errors));
  fs.writeFileSync(path.join(out,'result.json'),JSON.stringify({passed:true,checks:['CLI stages','new module publication after analysis','shared implementation identity','preview canvas picking','object related module filters','source inspection','overview restoration','reset','no browser exceptions']},null,2));
  console.log('PASS: CLI stages, module generation, shared Wallet, actual preview click, object filters, source view, overview and reset.');
  await send('Browser.close').catch(()=>{});
})().catch(error=>{console.error(error);process.exitCode=1}).finally(()=>{socket?.close();child.kill()});
