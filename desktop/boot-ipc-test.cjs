'use strict';
// Execute the actual main and preload entrypoints together. Electron and the
// analysis API are injected; runtime discovery and the local HTTP server are real.
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),assert=require('node:assert/strict'),{EventEmitter}=require('node:events'),{createRequire}=require('node:module');
const root=path.resolve(__dirname,'..'),packaged=process.argv.includes('--packaged'),entry=packaged?path.join(root,'artifacts/desktop/resources/app'):__dirname;
const out=path.join(root,'artifacts','boot-ipc-'+Date.now()),checks=[],handles=new Map(),events=new EventEmitter();fs.mkdirSync(out,{recursive:true});
const check=(v,n)=>{assert(v,n);checks.push(n);},sleep=ms=>new Promise(r=>setTimeout(r,ms));
let win,exposed,graph={root:path.join(root,'samples/RuntimeWeb'),projectId:'initial',revision:'r1',entities:[],files:[],relations:[]},boot;
const app=new EventEmitter();app.isPackaged=packaged;app.getPath=()=>out;app.setPath=()=>{};app.getVersion=()=>JSON.parse(fs.readFileSync(path.join(entry,'package.json'),'utf8')).version;
app.whenReady=()=>({then:fn=>boot=Promise.resolve().then(fn)});app.exit=code=>{throw Error('Unexpected app exit: '+code);};app.quit=()=>{};
class Contents extends EventEmitter{
 constructor(){super();this.mainFrame={url:'depth://app/index.html'};}
 setWindowOpenHandler(fn){this.openHandler=fn;}isDestroyed(){return !!this.closed;}close(){this.closed=true;}
 send(channel,payload){events.emit(channel,{},payload);}getZoomFactor(){return 1;}getTitle(){return 'Project fixture';}
 async loadURL(url){this.mainFrame.url=url;}reload(){}
}
class Window extends EventEmitter{
 constructor(){super();win=this;this.webContents=new Contents();this.contentView={addChildView:()=>{},removeChildView:()=>{}};}
 async loadURL(url){check(['runtime','initial','api','choose-project','project-drop-paths'].every(name=>handles.has(name)),'all IPC handlers exist before the first renderer document loads');this.webContents.mainFrame.url=url;}
 isDestroyed(){return false;}getContentSize(){return [1600,1000];}
}
const makeSession=()=>Object.assign(new EventEmitter(),{setPermissionRequestHandler(){},setPermissionCheckHandler(){},setDisplayMediaRequestHandler(){}});
const electron={app,BrowserWindow:Window,WebContentsView:class{constructor(){this.webContents=new Contents();}setVisible(){}setBounds(){}},session:{defaultSession:makeSession(),fromPartition:makeSession},protocol:{registerSchemesAsPrivileged(){},handle(){}},net:{fetch(){throw Error('Unexpected protocol fetch');}},dialog:{showOpenDialog:async()=>({canceled:false,filePaths:[graph.root]}),showErrorBox:(_title,message)=>{throw Error(message);}},desktopCapturer:{getSources:async()=>[]},ipcMain:{handle:(name,fn)=>{assert(!handles.has(name));handles.set(name,fn);},on:(name,fn)=>events.on(name,fn)},contextBridge:{exposeInMainWorld:(_name,value)=>exposed=value},webUtils:{getPathForFile:file=>file.path},ipcRenderer:{invoke:async(name,...args)=>{const fn=handles.get(name);if(!fn)throw Error("Error invoking remote method '"+name+"': Error: No handler registered for '"+name+"'");return fn({sender:win.webContents,senderFrame:win.webContents.mainFrame},...args);},on:(...a)=>events.on(...a),removeListener:(...a)=>events.removeListener(...a)}};
const api=async(route,body)=>{if(route==='/health')return {status:'ready'};if(route==='/graph')return graph;if(route==='/import'){graph={...graph,root:body.path,projectId:body.path,revision:'imported'};return {projectId:graph.projectId};}throw Error('Unexpected API route '+route);};
const modules=new Map();
function evaluate(file){
 if(modules.has(file))return modules.get(file).exports;
 const mod={exports:{}},nativeRequire=createRequire(file);modules.set(file,mod);
 const localRequire=name=>{
  if(name==='electron')return electron;
  if(name==='node:child_process'&&path.basename(file)==='main.cjs')return {spawn:()=>Object.assign(new EventEmitter(),{kill(){}})};
  if(name==='./service-client.cjs'&&path.basename(file)==='main.cjs')return {createClient:()=>api};
  if(name==='./runtime-host.cjs')return evaluate(path.join(entry,'runtime-host.cjs'));
  return nativeRequire(name);
 };
 const processFixture={env:{...process.env,DEPTH_ENV_FILE:path.join(out,'no-env')},argv:['electron',entry],pid:process.pid,execPath:process.execPath,resourcesPath:path.dirname(entry)};
 vm.runInNewContext(fs.readFileSync(file,'utf8'),{require:localRequire,module:mod,exports:mod.exports,__dirname:path.dirname(file),process:processFixture,URL,Response,Buffer,setTimeout,setInterval,clearInterval,console},{filename:file});return mod.exports;
}
async function run(){
 evaluate(path.join(entry,'main.cjs'));await boot;evaluate(path.join(entry,'preload.cjs'));
 const init=await exposed.initial();check(init.host.runtimeProtocol===2&&init.host.version===app.getVersion(),'preload receives the running host version and runtime protocol');
 let previousUrl;
 for(const name of ['RuntimeWeb','TaskRunner','Checkout','RuntimeWeb']){
  const folder=path.join(root,'samples',name);await exposed.request('/import',{path:folder});const status=await exposed.runtime('sync');
  check(status.root===folder&&status.status==='idle'&&status.targets.length>0,'main/preload runtime IPC imports and detects '+name);
  if(previousUrl){await assert.rejects(fetch(previousUrl));check(true,'switching projects closes the previous real HTTP runtime');previousUrl=null;}
  const target=status.targets.find(t=>t.kind==='static');
  if(target){const started=await exposed.runtime('start',{id:target.id});previousUrl=started.url;check((await fetch(previousUrl)).ok,'Run through the registered IPC starts the actual project HTTP server');}
 }
 const bad=path.join(out,'unreadable-runtime');fs.mkdirSync(path.join(bad,'pubspec.yaml'),{recursive:true});
 const imported=await exposed.request('/import',{path:bad});
 check(imported.projectId===bad,'runtime detection failure does not turn an imported source project into an import error');
 const failed=await exposed.runtime('status');check(failed.status==='failed'&&!failed.url&&failed.targets.length===0,'failed preview discovery clears the previous project URL and targets');
 fs.rmdirSync(path.join(bad,'pubspec.yaml'));fs.writeFileSync(path.join(bad,'pubspec.yaml'),'name: repaired_fixture\n');
 check((await exposed.runtime('sync')).status==='idle','runtime discovery can retry after its project configuration is repaired');
 await assert.rejects(async()=>handles.get('runtime')({sender:{},senderFrame:{}},'status'),/Untrusted sender/);check(true,'actual registered runtime handler rejects a project/foreign renderer');
 await exposed.runtime('stop');app.emit('before-quit');await sleep(20);
 const report={status:'passed',packaged,checks,scope:'Actual main/preload/runtime-host entrypoint wiring with Electron and analysis API fixtures; actual runtime discovery and local HTTP. No native pixels or Meta.'};
 fs.writeFileSync(path.join(out,'report.json'),JSON.stringify(report,null,2));console.log(JSON.stringify({passed:checks.length,packaged,out}));
}
run().catch(async error=>{try{await exposed?.runtime('stop');app.emit('before-quit');}catch{}fs.writeFileSync(path.join(out,'report.json'),JSON.stringify({status:'failed',checks,error:error.stack},null,2));console.error(error);process.exitCode=1;});
