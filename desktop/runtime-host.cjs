'use strict';
const {WebContentsView,session,ipcMain,desktopCapturer}=require('electron');
const crypto=require('node:crypto'),path=require('node:path');
const {Runtime,localUrl}=require('./runtime-core.cjs'),links=require('./runtime-links.cjs');
const {FrameBridge}=require('./runtime-bridge.cjs');
const adapters=require('./runtime-adapters.cjs');
class RuntimeHost {
 constructor({win,api,trusted}){
  this.win=win;this.api=api;this.trusted=trusted;this.graph=null;this.inspect=false;this.selection=[];this.bounds=null;this.sequence=0;this.pickSerial=0;this.sessionId=crypto.randomUUID();
  this.runtime=new Runtime({publish:state=>{this.send('runtime-state',state);if(['stopped','exited','failed'].includes(state.status)){this.closeView();if(state.status!=='stopped')this.closeEngine().catch(e=>this.runtime.log(e.message));return;}if(state.url&&state.url!==this.loadingUrl&&state.status!=='connected-engine'){this.engine?.origin(state.url);this.load(state.url).catch(e=>this.failure(e));}}});
  this.heartbeat=setInterval(()=>{if(this.engine?.frame&&this.runtime.state.status==='connected-engine'&&Date.now()-this.engine.frame.capturedAt>3000){this.runtime.state.status='waiting-engine';this.runtime.emit();}},1000);this.heartbeat.unref?.();
  ipcMain.handle('runtime',(e,action,payload)=>{trusted(e);return this.action(action,payload);});
  ipcMain.on('runtime-document-ready',e=>{if(this.isPreview(e))this.configure();});
  ipcMain.on('runtime-picked',(e,payload)=>{if(this.isPreview(e)){const serial=++this.pickSerial;this.pickQueue=(this.pickQueue||Promise.resolve()).catch(()=>{}).then(()=>serial===this.pickSerial?this.picked(payload):null);this.pickQueue.catch(error=>this.runtime.log('Source selection: '+error.message));}});
  session.defaultSession.setDisplayMediaRequestHandler(async(request,callback)=>{
   const selected=this.captureChoice;this.captureChoice=null;
   if(!selected||request.frame!==win.webContents.mainFrame||!request.frame.url.startsWith('depth://app/')||request.audioRequested){callback({});return;}
   try{const sources=await desktopCapturer.getSources({types:['window']});const source=sources.find(s=>s.id===selected);callback(source?{video:source}:{});}catch{callback({});}
  });
  const mayCapture=(wc,permission)=>wc===win.webContents&&permission==='display-capture'&&(!!this.captureChoice||this.runtime.state.status==='connecting-window');
  session.defaultSession.setPermissionCheckHandler((wc,permission)=>mayCapture(wc,permission));
  session.defaultSession.setPermissionRequestHandler((wc,permission,done)=>done(mayCapture(wc,permission)));
  win.on('closed',()=>this.dispose());
 }
 send(channel,data){if(!this.win.isDestroyed())this.win.webContents.send(channel,data);}
 isPreview(event){return !!this.view&&!this.view.webContents.isDestroyed()&&event.sender===this.view.webContents&&event.senderFrame===this.view.webContents.mainFrame;}
 failure(e){this.runtime.state.error=e.message;this.runtime.state.status='failed';this.runtime.emit();}
 async sync(){const graph=await this.api('/graph');if(graph.projectId!==this.graph?.projectId){++this.pickSerial;await this.closeEngine();this.closeView();this.sessionId=crypto.randomUUID();this.selected=null;this.selection=[];this.captureChoice=null;this.graph=graph;await this.runtime.project(graph.root);}else{const changed=graph.revision!==this.graph.revision;this.graph=graph;if(!this.runtime.plan)await this.runtime.project(graph.root);if(changed){this.selected=null;this.selection=[];this.configure();}}return this.runtime.snapshot();}
 async closeEngine(){this.pendingPick=null;const engine=this.engine;this.engine=null;if(engine)await engine.close();this.adapterInstallation?.cleanup();this.adapterInstallation=null;this.send('runtime-frame',null);}
 async startEngine(target){
  await this.closeEngine();
  const engine=new FrameBridge(this.graph.root,frame=>{
   if(this.engine!==engine)return;
   this.runtime.state.status='connected-engine';this.runtime.state.engine=frame.engine;this.runtime.state.capabilities=frame.capabilities;this.runtime.state.lastFrameAt=frame.capturedAt;this.runtime.state.frameSequence=frame.sequence;
   this.runtime.emit();this.send('runtime-frame',frame);this.applyBounds();
   if(frame.selection&&frame.selection.requestId===this.pendingPick){this.pendingPick=null;this.picked({name:frame.selection.name,locations:frame.selection.sources,page:frame.engine+' runtime'}).catch(e=>this.runtime.log('Source selection: '+e.message));}
  });this.engine=engine;
  try{const config=await engine.start();this.adapterInstallation=adapters.prepare(this.graph.root,target.framework||target.kind,config,target.entry||'lib/main.dart');await this.api('/refresh',{});this.graph=await this.api('/graph');this.send('runtime-index-changed',{projectId:this.graph.projectId,revision:this.graph.revision});return {bridge:config,runtimeEntry:this.adapterInstallation.entry};}
  catch(e){await this.closeEngine();throw e;}
 }
 async applied(){try{await this.sync();if(this.engine){await this.action('reload');this.runtime.log('Applied source changes: runtime update requested.');}else if(this.runtime.state.kind==='static'&&this.view){this.view.webContents.reload();this.runtime.log('Applied source changes: actual project page reloaded.');}else if(this.view)this.runtime.log('Applied source changes: connected development server handles rebuild / hot reload.');else this.runtime.log('Applied source changes: rebuild the native target to update its running window.');}catch(e){this.runtime.log('Source changes were applied, but the preview update failed: '+e.message);}}
 closeView(){++this.sequence;if(this.view){if(!this.win.isDestroyed())this.win.contentView.removeChildView(this.view);if(!this.view.webContents.isDestroyed())this.view.webContents.close();this.view=null;}this.loadingUrl=null;}
 async load(url){
  url=localUrl(url);this.closeView();const serial=this.sequence;this.loadingUrl=url;const origin=new URL(url).origin;
  const isolated=session.fromPartition('depth-runtime-'+crypto.randomUUID());
  isolated.setPermissionRequestHandler((_wc,_permission,done)=>done(false));isolated.setPermissionCheckHandler(()=>false);isolated.on('will-download',event=>event.preventDefault());
  // A separate WebContents isolates project CSS, theme and JavaScript from the
  // workbench. Host APIs are absent from this preload and sandbox stays enabled.
  const view=new WebContentsView({webPreferences:{session:isolated,preload:path.join(__dirname,'runtime-preload.cjs'),sandbox:true,contextIsolation:true,nodeIntegration:false,webSecurity:true,backgroundThrottling:false}});
  this.view=view;this.win.contentView.addChildView(view);this.applyBounds();
  const wc=view.webContents;wc.setWindowOpenHandler(()=>({action:'deny'}));
  const navigate=(event,target)=>{try{if(new URL(target).origin!==origin)event.preventDefault();}catch{event.preventDefault();}};
  wc.on('will-navigate',navigate);wc.on('will-redirect',navigate);
  wc.on('did-navigate-in-page',()=>this.configure());
  wc.on('render-process-gone',(_event,details)=>this.failure(Error('Project renderer stopped: '+details.reason)));
  wc.on('console-message',(_event,details)=>{if(details&&typeof details.message==='string')this.runtime.log('[browser] '+details.message);});
  // SDK servers often print their address before the first compilation ends.
  for(let attempt=0;attempt<120;attempt++){
   if(serial!==this.sequence)return;
   try{await wc.loadURL(url);if(serial!==this.sequence)return;this.runtime.state.status=this.engine?.frame?'connected-engine':'connected';this.runtime.state.error=null;this.runtime.state.document=wc.getTitle();this.runtime.emit();this.configure();return;}
   catch(e){if(attempt===119)throw e;await new Promise(r=>setTimeout(r,500));}
  }
 }
 configure(){if(this.view&&!this.view.webContents.isDestroyed()){const target=this.runtime.plan?.targets.find(t=>t.id===this.runtime.state.target),directory=target?.kind==='static'?String(target.directory||'').replaceAll('\\','/').replace(/\/$/,''):'';this.view.webContents.send('runtime-inspector',{inspect:this.inspect,basePath:directory&&directory!=='.'?directory+'/':'',bindings:target?.bindings||[],selection:this.selection});}}
 applyBounds(){if(!this.view)return;const b=this.bounds;this.view.setVisible(!!b?.visible&&!(this.engine?.frame&&this.inspect));if(b?.visible)this.view.setBounds({x:b.x,y:b.y,width:b.width,height:b.height});}
 async picked(payload){
  if(!payload||typeof payload.name!=='string'||!Array.isArray(payload.locations))return;
  const graph=this.graph,sessionId=this.sessionId,entities=links.resolve(graph,payload.locations),selected={name:payload.name.slice(0,160),entities,page:typeof payload.page==='string'?payload.page.slice(0,1000):'',precision:entities.length?'indexed-source':'unmapped'};
  await this.api('/runtime/select',{projectId:graph.projectId,revision:graph.revision,sessionId,objectId:crypto.randomUUID(),name:selected.name,sourcePaths:[...new Set(entities.map(e=>e.path))]});
  if(this.sessionId!==sessionId||this.graph.revision!==graph.revision)return;
  this.selected=selected;this.send('runtime-selection',{...selected,projectId:graph.projectId,revision:graph.revision});
 }
 async action(action,payload={}){
  if(action==='sync')return this.sync();
  if(!this.graph)throw Error('Open and index a project first.');
  if(action==='status')return {...this.runtime.snapshot(),selected:this.selected};
  if(action==='start'){const target=this.runtime.plan.targets.find(t=>t.id===payload.id);if(!target)throw Error('Unknown target');await this.closeEngine();this.closeView();await this.runtime.stop();const options=['unity','flutter'].includes(target.kind)||target.framework==='winforms'?await this.startEngine(target):{};try{return await this.runtime.start(payload.id,options);}catch(e){await this.closeEngine();throw e;}}
  if(action==='connect'){await this.closeEngine();await this.runtime.stop();return this.runtime.attach(payload.url);}
  if(action==='stop'){this.captureChoice=null;await this.closeEngine();this.closeView();return this.runtime.stop();}
  if(action==='reload'){
   if(this.engine){
    if(this.runtime.state.kind==='flutter'&&this.runtime.child?.stdin?.writable){this.runtime.child.stdin.write('r');this.runtime.log('Flutter hot reload requested; waiting for the runtime response.');return this.runtime.snapshot();}
    return this.action('start',{id:this.runtime.state.target});
   }
   if(this.view){await this.view.webContents.reload();return this.runtime.snapshot();}throw Error('No connected runtime can be reloaded.');
  }
  if(action==='bounds'){
   if(!payload.visible){this.bounds={visible:false};this.applyBounds();return true;}
   const size=this.win.getContentSize(),zoom=this.win.webContents.getZoomFactor();
   const b=Object.fromEntries(['x','y','width','height'].map(k=>[k,Math.round(payload[k]*zoom)]));
   if(Object.values(b).some(v=>!Number.isFinite(v))||b.x<0||b.y<0||b.width<1||b.height<1||b.x+b.width>size[0]+2||b.y+b.height>size[1]+2)throw Error('Invalid preview viewport.');
   this.bounds={...b,visible:true};this.applyBounds();return true;
  }
  if(action==='inspect'){this.inspect=payload.enabled===true;this.configure();this.applyBounds();return {inspect:this.inspect};}
  if(action==='engine-input'){if(!this.engine)throw Error('No engine source bridge connected.');return this.engine.input(payload);}
  if(action==='engine-pick'){if(!this.engine)throw Error('No engine source bridge connected.');this.pendingPick=crypto.randomUUID();return this.engine.input({type:'pick',x:payload.x,y:payload.y,requestId:this.pendingPick});}
  if(action==='highlight'){this.selection=payload.id?links.upstream(this.graph,payload.id):[];this.configure();this.send('runtime-highlight',this.selection);return true;}
  if(action==='windows'){const sources=await desktopCapturer.getSources({types:['window'],thumbnailSize:{width:240,height:150}});this.windowIds=new Set(sources.filter(s=>s.name!=='Depth AI').map(s=>s.id));return sources.filter(s=>this.windowIds.has(s.id)).map(s=>({id:s.id,name:s.name,thumbnail:s.thumbnail.toDataURL()}));}
  if(action==='window'){
   if(!this.windowIds?.has(payload.id))throw Error('Choose one of the available application windows.');
   await this.closeEngine();await this.runtime.stop();this.closeView();this.captureChoice=payload.id;this.runtime.state={...this.runtime.state,status:'connecting-window',kind:'native',windowId:payload.id};return this.runtime.emit();
  }
  if(action==='window-ready'){if(this.runtime.state.status!=='connecting-window')throw Error('No window connection pending.');this.runtime.state.status='connected-window';return this.runtime.emit();}
  if(action==='context')return {sessionId:this.sessionId,projectId:this.graph.projectId,revision:this.graph.revision,status:this.runtime.state.status,url:this.runtime.state.url,kind:this.runtime.state.kind,selected:this.selected};
  throw Error('Unsupported runtime operation.');
 }
 async dispose(){clearInterval(this.heartbeat);this.captureChoice=null;await this.closeEngine();this.closeView();await this.runtime.stop();}
}
module.exports={RuntimeHost};
