'use strict';
// Project runtimes are separate from the analysis service. Import never executes
// project code. Only Run (including the explicit CLI command) starts a process.
const fs=require('node:fs'),path=require('node:path'),http=require('node:http');
const {spawn}=require('node:child_process');
const blocked=/(^|\/)(?:\.[^/]+|node_modules|Library|Temp)(?:\/|$)|\.(?:pem|key|pfx|p12)$/i;
function inside(root,relative){
 if(typeof relative!=='string'||path.isAbsolute(relative))throw Error('Expected a project-relative path.');
 const base=fs.realpathSync(root),file=path.resolve(base,relative);
 if(file!==base&&!file.startsWith(base+path.sep))throw Error('Path escapes the project.');
 let current=file;while(!fs.existsSync(current)&&current!==base)current=path.dirname(current);
 const real=fs.realpathSync(current);if(real!==base&&!real.startsWith(base+path.sep))throw Error('Linked path escapes the project.');
 return file;
}
function localUrl(value){
 const u=new URL(value);if(!['http:','https:'].includes(u.protocol)||!['localhost','127.0.0.1','[::1]'].includes(u.hostname)||u.username||u.password)throw Error('Use a localhost development server URL without credentials.');
 return u.href;
}
function readJson(file){return JSON.parse(fs.readFileSync(file,'utf8').replace(/^\uFEFF/,''));}
function detect(root){
 root=fs.realpathSync(root);const candidates=[],has=file=>fs.existsSync(path.join(root,file));let diagnostics=[];
 if(has('depth.runtime.json')){
  try{const cfg=readJson(path.join(root,'depth.runtime.json'));for(const t of cfg.targets||[]){
   if(!t||typeof t.id!=='string'||!/^[-\w]{1,60}$/.test(t.id)||candidates.some(c=>c.id===t.id))throw Error('Runtime target IDs must be unique.');
   if(!['web','static','flutter','native','unity'].includes(t.kind))throw Error('Unknown runtime kind.');
   const target={id:t.id,label:String(t.label||t.id).slice(0,160),kind:t.kind};
   if(t.framework==='winforms'){target.framework='winforms';if(typeof t.project!=='string'||!t.project.endsWith('.csproj'))throw Error('WinForms target needs a project file.');inside(root,t.project);target.dotnetProject=t.project;}
   if(t.device){if(typeof t.device!=='string'||!/^\w[\w.:-]{0,119}$/.test(t.device))throw Error('Invalid Flutter device.');target.device=t.device;}
   if(t.url)target.url=localUrl(t.url);
   if(t.directory!==undefined){inside(root,t.directory);target.directory=t.directory;}
   if(t.entry){inside(root,t.entry);target.entry=t.entry;}
   if(t.command){if(typeof t.command!=='string'||/[\r\n\0]/.test(t.command)||!Array.isArray(t.args)||t.args.some(a=>typeof a!=='string'||/[\r\n\0]/.test(a)))throw Error('Commands require an executable and an argument array.');target.command=t.command;target.args=t.args;}
   if(t.bindings){if(!Array.isArray(t.bindings)||t.bindings.length>10000)throw Error('Invalid runtime bindings.');target.bindings=t.bindings.map(b=>{inside(root,b.path);if(typeof b.selector!=='string'||b.selector.length>1000)throw Error('Invalid binding selector.');return {selector:b.selector,path:b.path,line:Number.isInteger(b.line)&&b.line>0?b.line:null};});}
   candidates.push(target);
  }}catch(e){diagnostics.push('depth.runtime.json: '+e.message);candidates.length=0;}
 }
 if(!candidates.length){
  if(has('pubspec.yaml')&&/\bflutter\s*:/.test(fs.readFileSync(path.join(root,'pubspec.yaml'),'utf8'))){candidates.push({id:'flutter-web',label:'Flutter · Web + widget inspection',kind:'flutter',device:'web-server'});if(has('windows'))candidates.push({id:'flutter-windows',label:'Flutter · Windows + widget inspection',kind:'flutter',device:'windows'});}
  if(has('ProjectSettings/ProjectVersion.txt'))candidates.push({id:'unity',label:'Unity · Game view + source inspection',kind:'unity'});
  for(const file of fs.readdirSync(root).filter(f=>f.endsWith('.csproj'))){const xml=fs.readFileSync(path.join(root,file),'utf8');if(/<UseWindowsForms>\s*true\s*<\/UseWindowsForms>/i.test(xml)&&/<TargetFramework>\s*net(?:[89]|[1-9][0-9])\.\d+-windows/i.test(xml)&&!/<EnableDefaultCompileItems>\s*false/i.test(xml))candidates.push({id:'winforms-'+candidates.length,label:'WinForms · '+file+' + source inspection',kind:'native',framework:'winforms',dotnetProject:file});}
  if(has('package.json'))try{const pkg=readJson(path.join(root,'package.json'));for(const name of ['dev','start'])if(typeof pkg.scripts?.[name]==='string')candidates.push({id:'npm-'+name,label:'npm run '+name,kind:'web',script:name});}catch(e){diagnostics.push('package.json: '+e.message);}
  for(const directory of ['dist','build/web','public','.'])if(has(path.join(directory,'index.html'))){candidates.push({id:'static-'+candidates.length,label:'Serve '+(directory==='.'?'index.html':directory+'/index.html'),kind:'static',directory,entry:'index.html'});break;}
  candidates.push({id:'window',label:'Connect a running application window',kind:'native'});
 }
 return {root,targets:candidates,diagnostics};
}
const mime={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.mjs':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.json':'application/json','.png':'image/png','.jpg':'image/jpeg','.svg':'image/svg+xml','.wasm':'application/wasm','.woff2':'font/woff2','.ico':'image/x-icon','.map':'application/json'};
async function serve(root,directory='.',entry='index.html'){
 const base=inside(root,directory);inside(base,entry);
 const server=http.createServer((req,res)=>{try{
  if(!['GET','HEAD'].includes(req.method)){res.writeHead(405).end();return;}
  if(!/^127\.0\.0\.1:\d+$/.test(req.headers.host||'')){res.writeHead(403).end();return;}
  const relative=decodeURIComponent(new URL(req.url,'http://localhost').pathname).replace(/^\//,'')||entry;
  if(relative.includes('\\')||relative.includes('\0')||blocked.test(relative)){res.writeHead(403).end();return;}
  const file=inside(base,relative),stat=fs.statSync(file);if(!stat.isFile()){res.writeHead(404).end();return;}
  if(/\.html?$/i.test(file)&&stat.size<5*1024*1024){const html=require('./runtime-html.cjs').instrument(fs.readFileSync(file,'utf8'),path.relative(root,file).replaceAll('\\','/'));res.writeHead(200,{'Content-Type':'text/html; charset=utf-8','Content-Length':Buffer.byteLength(html),'Cache-Control':'no-store'});res.end(req.method==='HEAD'?undefined:html);return;}
  res.writeHead(200,{'Content-Type':mime[path.extname(file)]||'application/octet-stream','Content-Length':stat.size,'Cache-Control':'no-store','X-Content-Type-Options':'nosniff'});
  if(req.method==='HEAD')res.end();else fs.createReadStream(file).on('error',()=>res.destroy()).pipe(res);
 }catch{res.writeHead(404).end();}});
 await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(0,'127.0.0.1',resolve);});
 return {url:'http://127.0.0.1:'+server.address().port+'/',close:()=>new Promise(resolve=>{server.closeAllConnections();server.close(resolve);})};
}
function findExecutable(name,env=process.env){
 const names=process.platform==='win32'&&!path.extname(name)?[name+'.exe',name+'.bat',name+'.cmd',name]:[name];
 for(const dir of (env.PATH||env.Path||'').split(path.delimiter))for(const n of names){const file=path.join(dir.replace(/^"|"$/g,''),n);if(fs.existsSync(file))return file;}
 return null;
}
function commandFor(target,root,port,env=process.env){
 if(target.command){const command=path.isAbsolute(target.command)?target.command:target.command.includes('/')||target.command.includes('\\')?inside(root,target.command):findExecutable(target.command,env);if(!command)throw Error('Executable not found: '+target.command);if(/\.(bat|cmd|ps1)$/i.test(command))throw Error('Use the executable directly with an argument array, not a shell script.');return {command,args:target.args};}
 if(target.framework==='winforms'){const command=findExecutable('dotnet',env);if(!command)throw Error('.NET SDK was not found.');return {command,args:['run','--project',inside(root,target.dotnetProject),'--no-restore']};}
 if(target.kind==='flutter'){
  const flutter=findExecutable('flutter',env);if(!flutter)throw Error('Flutter SDK was not found on PATH. Connect an already running server or install the project SDK.');
  const bin=path.dirname(flutter),dart=path.join(bin,'cache','dart-sdk','bin',process.platform==='win32'?'dart.exe':'dart'),snapshot=path.join(bin,'cache','flutter_tools.snapshot');
  if(!fs.existsSync(dart)||!fs.existsSync(snapshot))throw Error('Flutter SDK cache is not initialized. Run flutter doctor in your environment.');
  const device=target.device||'web-server',args=[snapshot,'run','-d',device,'--no-pub','--track-widget-creation'];
  if(device==='web-server')args.push('--web-hostname','127.0.0.1','--web-port',String(port));
  if(target.runtimeEntry)args.push('--target',target.runtimeEntry);
  if(target.bridge)for(const [key,value] of Object.entries({URL:target.bridge.url,TOKEN:target.bridge.token,SESSION:target.bridge.session,ROOT:root}))args.push('--dart-define=DEPTH_RUNTIME_'+key+'='+value);
  return {command:dart,args,url:device==='web-server'?'http://127.0.0.1:'+port+'/':undefined};
 }
 if(target.kind==='unity'){
  if(fs.existsSync(path.join(root,'Temp','UnityLockfile')))return null;
  const text=fs.readFileSync(path.join(root,'ProjectSettings','ProjectVersion.txt'),'utf8'),version=text.match(/m_EditorVersion:\s*([\w.]+)/)?.[1];
  const candidates=[env.UNITY_EDITOR_PATH,version&&path.join(env.ProgramFiles||'C:/Program Files','Unity','Hub','Editor',version,'Editor','Unity.exe')].filter(Boolean),command=candidates.find(fs.existsSync);
  if(!command)throw Error('Unity '+(version||'Editor')+' was not found. Open this project in its Editor, then run preview again.');
  return {command,args:['-projectPath',root,'-executeMethod','Depth.RuntimePreview.EditorEntry.Play']};
 }
 if(target.script){const node=findExecutable('node',env);const npm=node&&path.join(path.dirname(node),'node_modules','npm','bin','npm-cli.js');if(!npm||!fs.existsSync(npm))throw Error('Node.js with npm was not found on PATH.');return {command:node,args:[npm,'run',target.script]};}
 return null;
}
function childEnvironment(env=process.env){const clean={};for(const [k,v] of Object.entries(env))if(!/(?:TOKEN|API.?KEY|SECRET|PASSWORD|CREDENTIAL)/i.test(k)&&!/^DEPTH_/i.test(k))clean[k]=v;return clean;}
async function freePort(){const s=http.createServer();await new Promise(r=>s.listen(0,'127.0.0.1',r));const port=s.address().port;await new Promise(r=>s.close(r));return port;}
function observedUrl(line){const clean=line.replace(/\x1b\[[0-9;]*m/g,'');const match=clean.match(/https?:\/\/(?:localhost|127\.0\.0\.1|\[::1\]):\d+(?:\/[^\s]*)?/);if(!match)return null;try{return localUrl(match[0].replace(/[),;]+$/,''));}catch{return null;}}
class Runtime {
 constructor({publish=()=>{},launch=spawn}={}){this.publish=publish;this.launch=launch;this.state={status:'disconnected',logs:[]};this.generation=0;}
 async project(root){if(this.root===root&&this.plan)return this.snapshot();await this.stop();this.root=root;this.plan=null;this.state={status:'idle',root,logs:[]};try{this.plan=detect(root);}catch(error){this.state.status='failed';this.state.error=error.message;this.emit();throw error;}return this.emit();}
 snapshot(){return {...this.state,runtimeProtocol:2,targets:(this.plan?.targets||[]).map(({bridge,runtimeEntry,...publicTarget})=>publicTarget),diagnostics:this.plan?.diagnostics||[]};}
 emit(){const state=this.snapshot();this.publish(state);return state;}
 log(text){text=String(text).replace(/\x1b\[[0-9;]*m/g,'');for(const value of this.redactions||[])text=text.replaceAll(value,'[runtime capability]');text=text.slice(0,6000);this.state.logs=[...(this.state.logs||[]),text].slice(-150);this.emit();}
 async start(id,options={}){
  const target=this.plan?.targets.find(t=>t.id===id);if(!target)throw Error('Select a detected runtime target.');
  await this.stop();this.redactions=options.bridge?[options.bridge.token]:[];const generation=++this.generation;this.state={status:'starting',root:this.root,target:target.id,kind:target.kind,logs:[],startedAt:new Date().toISOString()};this.emit();
  try{
   if(target.kind==='static'){this.server=await serve(this.root,target.directory,target.entry);this.state.url=this.server.url;this.state.status='server-ready';return this.emit();}
   const spec=commandFor({...target,...options},this.root,await freePort());
   if(generation!==this.generation)return this.snapshot();
   if(!spec){this.state.status=target.url?'server-ready':target.kind==='unity'?'waiting-engine':'waiting-window';this.state.url=target.url;return this.emit();}
   // Never invoke a shell. npm scripts are started only by an explicit Run.
   const env=childEnvironment();if(options.bridge)env.DEPTH_RUNTIME_CONFIG=path.join(this.root,'.depth','runtime-bridge.json');
   const child=this.launch(spec.command,spec.args,{cwd:this.root,env,shell:false,windowsHide:true,stdio:['pipe','pipe','pipe']});this.child=child;this.keepEditor=target.kind==='unity';this.state.pid=child.pid;
   let lineBuffer='';const consume=chunk=>{if(generation!==this.generation)return;const text=chunk.toString();this.log(text);lineBuffer=(lineBuffer+text).slice(-16000);const lines=lineBuffer.split(/\r?\n/);lineBuffer=lines.pop();const url=target.url||spec.url||lines.map(observedUrl).find(Boolean);if(url&&!this.state.url){this.state.url=url;this.state.status='server-ready';this.emit();}};
   child.stdout?.on('data',consume);child.stderr?.on('data',consume);
   child.on('error',e=>{if(generation!==this.generation)return;this.state.status='failed';this.state.error=e.message;this.emit();});
   child.on('exit',(code,signal)=>{if(generation!==this.generation)return;this.child=null;this.state.status='exited';this.state.exitCode=code;this.state.signal=signal;this.emit();});
   if(target.url||spec.url){this.state.url=target.url||spec.url;this.state.status='server-ready';}else this.state.status='running';
   return this.emit();
  }catch(e){this.state.status='failed';this.state.error=e.message;this.emit();throw e;}
 }
 attach(url){this.state={...this.state,url:localUrl(url),status:'server-ready',kind:'web'};return this.emit();}
 async stop(){++this.generation;if(this.child){const child=this.child;this.child=null;if(this.keepEditor){child.stdout?.destroy();child.stderr?.destroy();child.stdin?.destroy();child.unref?.();}else if(process.platform==='win32'&&child.pid){await new Promise(resolve=>{const killer=spawn('taskkill.exe',['/PID',String(child.pid),'/T','/F'],{windowsHide:true,stdio:'ignore',shell:false});killer.once('error',resolve);killer.once('exit',resolve);});}else child.kill();}if(this.server){await this.server.close();this.server=null;}this.state={status:'stopped',root:this.root,logs:this.state.logs||[]};return this.emit();}
}
module.exports={Runtime,detect,serve,inside,localUrl,commandFor,observedUrl,childEnvironment,findExecutable};
