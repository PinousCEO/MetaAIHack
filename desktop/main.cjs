const {app, BrowserWindow, ipcMain, dialog, protocol, net, session} = require('electron');
const {spawn} = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const tcp = require('node:net');
const {pathToFileURL} = require('node:url');
const liveMeta = process.argv.includes('--smoke-live');
const runtimeSmoke = process.argv.includes('--runtime-smoke') || process.argv.includes('--smoke');
const visualReview = process.argv.includes('--visual-review');
const studySmoke = process.argv.includes('--style-study-smoke');
const styleStudy = process.argv.includes('--style-study') || studySmoke;
const smoke = process.argv.includes('--smoke') || liveMeta || studySmoke || visualReview || runtimeSmoke;
const base = app.isPackaged ? process.resourcesPath : path.resolve(__dirname, '..');
const evidence = process.env.DEPTH_SMOKE_OUTPUT || path.join(base, 'artifacts', (visualReview?'visual-review-':styleStudy?'style-study-native-':'desktop-smoke-')+new Date().toISOString().replace(/[:.]/g,'-'));
if (smoke) app.setPath('userData', path.join(evidence, 'profile'));
protocol.registerSchemesAsPrivileged([{scheme:'depth', privileges:{standard:true, secure:true, supportFetchAPI:true}}]);
let win, service, endpoint, startup, runtimeHost, quitting=false;
const smokeFolders=[];
const token=crypto.randomBytes(32).toString('hex');
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const api=require('./service-client.cjs').createClient(()=>endpoint,token);
function trusted(event) {if(!win||event.sender!==win.webContents||event.senderFrame!==win.webContents.mainFrame||!event.senderFrame.url.startsWith('depth://app/'))throw Error('Untrusted sender');}
async function freePort(){return new Promise((resolve,reject)=>{const s=tcp.createServer();s.on('error',reject);s.listen(0,'127.0.0.1',()=>{const port=s.address().port;s.close(()=>resolve(port));});});}
async function startService(){
  const port=await freePort();endpoint='http://127.0.0.1:'+port;
  const bundled=path.join(base,'runtime','dotnet.exe');
  const executable=fs.existsSync(bundled)?bundled:'dotnet';
  const dll=path.join(base,app.isPackaged?(require('./package.json').depthServiceDirectory||'service'):'artifacts/desktop-service','Depth.Service.dll');
  if(!fs.existsSync(dll))throw Error('Service missing. Run scripts/build.ps1.');
  const storage=path.join(app.getPath('userData'),'workspace');
  const beside=path.join(path.dirname(process.execPath),'.env'),repositoryEnv=path.resolve(path.dirname(process.execPath),'../..','.env');
  const configFile=app.isPackaged?(fs.existsSync(beside)?beside:repositoryEnv):path.join(base,'.env');
  const env={...process.env,DEPTH_PORT:String(port),DEPTH_TOKEN:token,DEPTH_STORAGE:storage,DEPTH_PARENT_PID:String(process.pid),DEPTH_ENV_FILE:process.env.DEPTH_ENV_FILE||configFile,DOTNET_gcServer:'0'};
  require('./dart-runtime.cjs').configure(base,env);
  if(fs.existsSync(bundled)){env.DOTNET_ROOT=path.dirname(bundled);env.DOTNET_MULTILEVEL_LOOKUP='0';}
  const webAdapter=path.join(base,'adapters','web','index.mjs');
  if(fs.existsSync(webAdapter)){env.DEPTH_WEB_ADAPTER=webAdapter;env.DEPTH_NODE_EXECUTABLE=app.isPackaged?path.join(base,'runtime','node.exe'):process.env.DEPTH_NODE_EXECUTABLE||'node';}
  service=spawn(executable,[dll],{cwd:base,env,windowsHide:true,stdio:'ignore'});
  let fault;service.on('error',e=>fault=e);service.on('exit',code=>{fault=Error('Analysis service stopped ('+code+').');if(win&&!quitting)win.webContents.send('service-stopped');});
  for(let i=0;i<160;i++){if(fault)throw fault;try{await api('/health');return;}catch{}await sleep(100);}
  throw Error('Analysis service startup timed out.');
}
app.on('before-quit',()=>{quitting=true;runtimeHost?.dispose().catch(()=>{});if(service)service.kill();});
app.on('window-all-closed',()=>app.quit());
app.whenReady().then(async()=>{
  await startService();
  session.defaultSession.setPermissionRequestHandler((_w,_p,done)=>done(false));
  protocol.handle('depth',request=>{
    const url=new URL(request.url); const relative=decodeURIComponent(url.pathname).replace(/^\/+/, '')||'index.html';
    const file=path.resolve(__dirname,'ui',relative),root=path.resolve(__dirname,'ui')+path.sep;
    if(url.host!=='app'||!file.startsWith(root))return new Response('Forbidden',{status:403});
    return net.fetch(pathToFileURL(file).href);
  });
  const configPath=path.join(app.getPath('userData'),'preferences.json');
  let saved={};try{saved=JSON.parse(fs.readFileSync(configPath,'utf8'));}catch{}
  let project=process.env.DEPTH_PROJECT||saved.project||path.join(base,'samples','RuntimeWeb');
  const explicit=process.argv.indexOf('--project');if(explicit>=0&&process.argv[explicit+1])project=path.resolve(process.argv[explicit+1]);
  if(smoke){project=path.join(evidence,'sample');fs.mkdirSync(evidence,{recursive:true});fs.cpSync(path.join(base,'samples',runtimeSmoke?'RuntimeWeb':'Checkout'),project,{recursive:true,filter:s=>!['bin','obj','.depth'].includes(path.basename(s))});}
  startup={project,example:project===path.join(base,'samples','RuntimeWeb')||smoke,host:{version:app.getVersion(),runtimeProtocol:2}};
  win=new BrowserWindow({width:1600,height:1000,minWidth:1050,minHeight:700,backgroundColor:'#faf9f6',title:'Depth AI',autoHideMenuBar:true,webPreferences:{preload:path.join(__dirname,'preload.cjs'),contextIsolation:true,nodeIntegration:false,sandbox:true,backgroundThrottling:!smoke}});
  win.webContents.setWindowOpenHandler(()=>({action:'deny'}));
  win.webContents.on('will-navigate',(e,url)=>{if(!url.startsWith('depth://app/'))e.preventDefault();});
  runtimeHost=new (require('./runtime-host.cjs').RuntimeHost)({win,api,trusted});
  ipcMain.handle('initial',e=>{trusted(e);return startup;});
  ipcMain.handle('project-drop-paths',(e,paths)=>{trusted(e);return require('./project-drop.cjs').resolveProjectDrop(paths);});
  ipcMain.handle('choose-project',async e=>{trusted(e);if(smoke&&smokeFolders.length)return smokeFolders.shift();const r=await dialog.showOpenDialog(win,{properties:['openDirectory'],title:'Open project folder'});return r.canceled?null:r.filePaths[0];});
  ipcMain.handle('window',(e,action)=>{trusted(e);if(action==='minimize')win.minimize();else if(action==='maximize')win.isMaximized()?win.unmaximize():win.maximize();else if(action==='close')win.close();});
  ipcMain.handle('api',async(e,route,body)=>{trusted(e);const r=await api(route,body);if(route==='/import'&&!smoke){fs.mkdirSync(path.dirname(configPath),{recursive:true});fs.writeFileSync(configPath,JSON.stringify({project:body.path}));}if(['/import','/refresh'].includes(route)){try{await runtimeHost.sync();}catch(error){runtimeHost.failure(error);}}if(route==='/apply')await runtimeHost.applied();return r;});
  await win.loadURL(styleStudy?'depth://app/style-study/index.html':'depth://app/index.html');
  if(runtimeSmoke)await require('./runtime-smoke.cjs').run({win,runtimeHost,api,evidence,sleep,app});
  else if(visualReview)await require('./visual-review.cjs').run({win,evidence,sleep});
  else if(studySmoke)await require('./style-study-smoke.cjs').run({win,evidence,sleep,app});
  else if(smoke)await require('./smoke.cjs').run({win,api,evidence,sleep,app,project,base,liveMeta,pickFolder:folder=>smokeFolders.push(folder)});
}).catch(error=>{if(smoke){fs.mkdirSync(evidence,{recursive:true});fs.writeFileSync(path.join(evidence,'error.txt'),String(error.stack));}else dialog.showErrorBox('Depth AI',error.message);app.exit(1);});
