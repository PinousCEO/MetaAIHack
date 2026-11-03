'use strict';
window.DepthRuntimePreview=class {
 constructor({state,inspect,inspectMany,error,log}){
  this.s=state;this.inspectSource=inspect;this.inspectMany=inspectMany;this.error=error;this.log=log;this.current={status:'idle'};this.hostReady=false;
  this.root=document.querySelector('#preview');this.root.className='runtime-preview';
  this.root.innerHTML='<div class="runtime-controls"><select id="runtime-target" aria-label="Project runtime"></select><button id="runtime-run">Run</button><button id="runtime-stop">Stop</button><button id="runtime-reload" title="Reload actual project page">↻</button><button id="runtime-inspect" aria-pressed="false">Inspect</button><button id="runtime-connect">Connect…</button></div><div class="runtime-address"><span id="runtime-status" role="status">No running application connected</span><span id="runtime-address"></span></div><div id="runtime-viewport"><div id="runtime-empty"><h3>Connect the actual application</h3><p>Run the project, connect its local development URL, or choose its running application window.</p><p>Depth AI themes apply to the workbench. Your application keeps its own design.</p></div><video id="runtime-video" autoplay muted playsinline hidden></video></div><div id="runtime-mapping" role="status"></div>';
  const q=id=>document.getElementById(id);
  this.viewport=q('runtime-viewport');this.video=q('runtime-video');
  this.frameSurface=document.createElement('div');this.frameSurface.id='runtime-engine-frame';this.frameSurface.hidden=true;this.frameSurface.tabIndex=0;this.frameSurface.setAttribute('aria-label','Actual engine frame. Inspect to find source, or interact with application controls.');
  this.frameImage=document.createElement('img');this.frameImage.alt='Actual application frame';this.frameImage.draggable=false;this.frameOverlay=document.createElementNS('http://www.w3.org/2000/svg','svg');this.frameSurface.append(this.frameImage,this.frameOverlay);this.viewport.append(this.frameSurface);
  const pointer=(type,event)=>{if(!this.frame)return;const p=DepthRuntimeFrame.point(this.frameSurface.getBoundingClientRect(),this.frame.width,this.frame.height,event.clientX,event.clientY);if(!p)return;event.preventDefault();if(this.inspecting){if(type==='pointerUp')this.call('engine-pick',p).catch(error=>this.error(error));}else this.call('engine-input',{type,...p,delta:event.deltaY||0}).catch(error=>this.error(error));};
  this.frameSurface.addEventListener('pointerdown',e=>{this.frameSurface.focus();this.frameSurface.setPointerCapture(e.pointerId);pointer('pointerDown',e);});this.frameSurface.addEventListener('pointerup',e=>pointer('pointerUp',e));this.frameSurface.addEventListener('wheel',e=>pointer('scroll',e),{passive:false});
  this.frameSurface.addEventListener('keydown',e=>{if(!this.inspecting&&this.frame?.capabilities.text&&e.key.length===1&&!e.ctrlKey&&!e.metaKey){e.preventDefault();this.call('engine-input',{type:'text',text:e.key}).catch(error=>this.error(error));}});
  const call=(action,payload)=>this.call(action,payload).catch(e=>this.error(e));
  q('runtime-run').onclick=()=>call('start',{id:q('runtime-target').value});
  q('runtime-stop').onclick=()=>this.stop();q('runtime-reload').onclick=()=>call('reload');
  q('runtime-inspect').onclick=async()=>{this.inspecting=!this.inspecting;q('runtime-inspect').setAttribute('aria-pressed',String(this.inspecting));await call('inspect',{enabled:this.inspecting});};
  q('runtime-connect').onclick=()=>this.connectDialog();
  document.querySelector('.preview-frame-bar').hidden=true;
  document.querySelector('.preview-workspace-link').hidden=true;
  document.querySelector('.preview-help').textContent='Actual project runtime · Interact normally, or enable Inspect to find source';
  for(const selector of ['.preview-focus-bar','.preview-match-list']){const el=document.querySelector(selector);if(el)el.hidden=true;}
  if(window.depth.runtime){window.depth.onRuntime?.(s=>{if(!this.unavailable)this.update(s);});window.depth.onRuntimeSelection?.(s=>this.picked(s));}
  window.depth.onRuntimeFrame?.(frame=>{this.frame=frame;this.frameSurface.hidden=!frame;if(frame){this.frameImage.src='data:image/png;base64,'+frame.png;this.drawFrame();}else{this.drawStamp=null;this.frameSources=[];this.lastHighlight=null;this.frameImage.removeAttribute('src');this.frameOverlay.replaceChildren();}});
  window.depth.onRuntimeHighlight?.(sources=>{this.frameSources=sources;this.drawFrame();});
  const measure=()=>this.measure();if(typeof ResizeObserver!=='undefined')new ResizeObserver(measure).observe(this.viewport);
  window.addEventListener('resize',measure);document.addEventListener('scroll',measure,true);
  document.addEventListener('dragstart',()=>{this.dragging=true;this.measure();},true);
  for(const type of ['dragend','drop'])document.addEventListener(type,()=>{this.dragging=false;this.measure();},true);
  this.layoutObserver=new MutationObserver(()=>{if(!this.measuring){this.measuring=true;requestAnimationFrame(()=>{this.measuring=false;this.measure();});}});
  this.layoutObserver.observe(document.body,{attributes:true,subtree:true,attributeFilter:['hidden','class','open','style']});
 }
 missingHost(error){return /No handler registered.*['"]runtime['"]|['"]runtime['"].*No handler registered/i.test(error?.message||String(error));}
 failed(error){
  this.hostReady=false;
  this.frame=null;this.frameSurface.hidden=true;this.frameImage.removeAttribute('src');this.frameOverlay.replaceChildren();this.mapped=null;this.lastHighlight=null;document.querySelector('#runtime-mapping').replaceChildren();
  if(this.unavailable||!window.depth.runtime||this.missingHost(error)){this.unavailable=true;this.update({status:'restart-required',error:'The running app has no preview host. Close Depth AI and reopen the updated EXE. Project source remains available.',targets:[]});}
  else this.update({status:'failed',error:'Preview connection failed: '+(error?.message||String(error)),targets:[]});
 }
 async invoke(action,payload){
  if(!window.depth.runtime||this.unavailable)throw Error('Close Depth AI and reopen the updated EXE to connect the preview. You can still open and edit project source.');
  try{return await window.depth.runtime(action,payload);}catch(e){if(this.missingHost(e)){this.failed(e);throw Error(this.current.error);}throw e;}
 }
 async call(action,payload){const r=await this.invoke(action,payload);if(['start','stop','connect','reload'].includes(action))this.update(r);this.measure();return r;}
 async sync(){
  this.hostReady=false;
  if(this.project!==this.s.graph.projectId||this.revision!==this.s.graph.revision){if(this.project!==this.s.graph.projectId)this.stopVideo();this.project=this.s.graph.projectId;this.revision=this.s.graph.revision;this.mapped=null;this.lastHighlight=null;this.frame=null;this.frameSurface.hidden=true;this.frameImage.removeAttribute('src');this.frameOverlay.replaceChildren();document.querySelector('#runtime-mapping').replaceChildren();document.querySelector('#preview-context-name').textContent='Select an element in the running application';}
  if(!window.depth.runtime||this.unavailable){this.failed(Error("No handler registered for 'runtime'"));return;}
  try{const current=await this.invoke('sync');this.hostReady=current.runtimeProtocol===2;this.lastBounds=null;this.update(current);}catch(e){if(!this.unavailable)this.failed(e);}
 }
 update(state){
  if(window.depth.runtime&&state.root&&state.runtimeProtocol!==2)state={...state,status:'restart-required',error:'Restart Depth AI to load the updated project runtime host.'};
  this.current=state;const q=id=>document.getElementById(id),select=q('runtime-target'),previous=select.value;
  const targets=state.targets||[];if(JSON.stringify(targets)!==this.targetStamp){this.targetStamp=JSON.stringify(targets);select.replaceChildren(...targets.map(t=>{const o=document.createElement('option');o.value=t.id;o.textContent=t.label;return o;}));if(targets.some(t=>t.id===previous))select.value=previous;}
  q('runtime-status').textContent=state.error||state.status.replaceAll('-',' ');q('runtime-status').dataset.status=state.status;q('runtime-address').textContent=state.url||'';
  const connected=['connected','connected-window','connected-engine'].includes(state.status);q('runtime-empty').hidden=connected;
  q('runtime-inspect').disabled=state.status!=='connected'&&!(state.status==='connected-engine'&&state.capabilities?.inspect);q('runtime-reload').disabled=!['connected','connected-engine'].includes(state.status);
  q('runtime-stop').disabled=['idle','stopped','disconnected','restart-required'].includes(state.status);q('runtime-run').disabled=!targets.length||['starting','server-ready'].includes(state.status);
  q('runtime-connect').disabled=!this.hostReady||this.unavailable===true;
  if(state.status==='restart-required')for(const id of ['runtime-run','runtime-stop','runtime-reload','runtime-inspect','runtime-connect'])q(id).disabled=true;
  const message=q('runtime-empty');message.querySelector('h3').textContent=state.status==='restart-required'?'Update the running application':state.status==='failed'?'Project source is open; preview is unavailable':'Connect the actual application';
  message.querySelector('p').textContent=state.status==='restart-required'||state.status==='failed'?state.error:'Run the project, connect its local development URL, or choose its running application window.';
  if(!['connected-window','connecting-window'].includes(state.status))this.stopVideo();
  const line=state.logs?.at(-1);if(line&&line!==this.lastLog){this.lastLog=line;this.log?.(line);}
  if(state.status==='waiting-window')this.connectDialog(true);
  if(state.status==='waiting-engine')q('runtime-status').textContent='Waiting for the project engine to send its first frame';
  this.measure();this.context();
 }
 measure(){
  this.drawFrame();
  if(!window.depth.runtime||this.unavailable||!this.hostReady)return;const r=this.viewport.getBoundingClientRect(),uncovered=typeof document.elementFromPoint!=='function'||[[.1,.1],[.5,.5],[.9,.9],[.1,.9],[.9,.1]].every(([x,y])=>this.viewport.contains(document.elementFromPoint(r.x+r.width*x,r.y+r.height*y))),visible=r.width>1&&r.height>1&&!!this.viewport.getClientRects().length&&!document.querySelector('dialog[open]')&&!this.dragging&&uncovered;
  const bounds={visible,x:Math.max(0,r.x),y:Math.max(0,r.y),width:Math.min(r.width,innerWidth-r.x),height:Math.min(r.height,innerHeight-r.y)},key=JSON.stringify(bounds);if(key===this.lastBounds)return;this.lastBounds=key;this.invoke('bounds',bounds).catch(e=>{this.lastBounds=null;if(!this.unavailable)this.failed(e);});
 }
 drawFrame(){
  if(!this.frame)return;const r=DepthRuntimeFrame.fit(this.frameSurface.getBoundingClientRect(),this.frame.width,this.frame.height);if(!r)return;
  const stamp=JSON.stringify([this.frame.sequence,r,this.frameSources]);if(stamp===this.drawStamp)return;this.drawStamp=stamp;
  this.frameOverlay.setAttribute('viewBox','0 0 1000 1000');Object.assign(this.frameOverlay.style,{width:r.width+'px',height:r.height+'px',left:(r.x-this.frameSurface.getBoundingClientRect().left)+'px',top:(r.y-this.frameSurface.getBoundingClientRect().top)+'px'});this.frameOverlay.setAttribute('preserveAspectRatio','none');this.frameOverlay.replaceChildren();
  const related=DepthRuntimeFrame.related(this.frame.regions,this.frameSources||[]);if(!related.length)return;
  const ns='http://www.w3.org/2000/svg',make=(tag,attrs)=>{const e=document.createElementNS(ns,tag);for(const [k,v] of Object.entries(attrs))e.setAttribute(k,String(v));return e;},defs=make('defs',{}),mask=make('mask',{id:'depth-engine-focus'});mask.append(make('rect',{width:1000,height:1000,fill:'white'}));
  for(const r of related)mask.append(make('rect',{x:r.x*1000,y:r.y*1000,width:r.width*1000,height:r.height*1000,fill:'black'}));defs.append(mask);this.frameOverlay.append(defs,make('rect',{width:1000,height:1000,fill:'#101826',opacity:.16,mask:'url(#depth-engine-focus)'}));
  for(const r of related)this.frameOverlay.append(make('rect',{x:r.x*1000,y:r.y*1000,width:r.width*1000,height:r.height*1000,fill:'none',stroke:'#f59e0b','stroke-width':2,'vector-effect':'non-scaling-stroke'}));
 }
 async connectDialog(windowsOnly=false){
  if(document.querySelector('#runtime-connect-dialog'))return;
  const dialog=document.createElement('dialog');dialog.id='runtime-connect-dialog';dialog.className='runtime-connect-dialog';
  dialog.innerHTML='<form method="dialog"><header><h2>Connect your application</h2><button aria-label="Close">×</button></header></form><form id="runtime-url-form"><label>Local development URL<input id="runtime-url" type="url" placeholder="http://localhost:5173" required></label><button>Connect URL</button></form><p>Or select the running Unity, Flutter, native app or emulator window. Window capture displays the actual pixels; source inspection requires runtime bindings.</p><button id="runtime-list-windows">Show application windows</button><p id="runtime-connect-error" role="alert"></p><div id="runtime-window-list"></div>';
  document.body.append(dialog);dialog.addEventListener('close',()=>{dialog.remove();this.measure();});dialog.showModal();this.measure();
  const problem=e=>dialog.querySelector('#runtime-connect-error').textContent=e.message;
  dialog.querySelector('#runtime-url-form').onsubmit=async e=>{e.preventDefault();try{await this.call('connect',{url:dialog.querySelector('#runtime-url').value});dialog.close();}catch(error){problem(error);}};
  dialog.querySelector('#runtime-list-windows').onclick=async()=>{try{const sources=await this.call('windows');const list=dialog.querySelector('#runtime-window-list');list.replaceChildren();for(const source of sources){const button=document.createElement('button'),img=document.createElement('img'),name=document.createElement('span');img.src=source.thumbnail;img.alt='';name.textContent=source.name;button.append(img,name);button.onclick=async()=>{try{await this.capture(source.id);dialog.close();}catch(e){problem(e);}};list.append(button);}}catch(e){problem(e);}};
  if(windowsOnly)dialog.querySelector('#runtime-list-windows').click();
 }
 async capture(id){
  this.stopVideo();await this.call('window',{id});
  try{this.stream=await navigator.mediaDevices.getDisplayMedia({video:true,audio:false});this.video.srcObject=this.stream;this.video.hidden=false;this.stream.getVideoTracks()[0].addEventListener('ended',()=>this.stop());await this.video.play();this.update(await this.call('window-ready'));document.querySelector('#runtime-mapping').textContent='Live application window · source picking is unavailable without a runtime source adapter.';}
  catch(e){await this.call('stop');throw e;}
 }
 stopVideo(){if(this.stream){const s=this.stream;this.stream=null;for(const track of s.getTracks())track.stop();}this.video.srcObject=null;this.video.hidden=true;}
 async stop(){this.stopVideo();await this.call('stop').catch(e=>this.error(e));}
 picked(pick){
  if(pick.projectId!==this.s.graph?.projectId||pick.revision!==this.s.graph?.revision)return;
  this.mapped=pick;const out=document.querySelector('#runtime-mapping');out.replaceChildren();
  const label=document.createElement('span');label.textContent=pick.entities.length?pick.name+' · '+pick.entities.length+' source match'+(pick.entities.length===1?'':'es'):pick.name+' · No source binding found for this runtime element';out.append(label);
  for(const entity of pick.entities){const button=document.createElement('button');button.textContent=entity.name+' · '+entity.path+(entity.line?':'+entity.line:' (file)');button.onclick=()=>this.inspectSource(entity.id);out.append(button);}
  document.querySelector('#preview-context-name').textContent=pick.name;this.s.previewRoot=null;
  if(pick.entities.length){if(this.inspectMany)this.inspectMany(pick.entities.map(e=>e.id),pick.name);else this.inspectSource(pick.entities[0].id);}this.context();
 }
 highlight(id){if(window.depth.runtime&&this.hostReady&&!this.unavailable&&this.lastHighlight!==id){this.lastHighlight=id;this.invoke('highlight',{id}).catch(e=>{if(!this.unavailable)this.failed(e);});}}
 context(){const el=document.querySelector('#dock-chat-context');if(el){let status=document.querySelector('#runtime-chat-context');if(!status){status=document.createElement('div');status.id='runtime-chat-context';el.after(status);}status.textContent='Preview: '+this.current.status+(this.mapped?' · Selected: '+this.mapped.name:'');}}
 async command(text){
  const [command,...args]=text.trim().split(/\s+/);if(command!=='/preview')return false;
  const action=args.shift()||'status';if(action==='run')await this.call('start',{id:args[0]||document.querySelector('#runtime-target').value});
  else if(action==='connect'){if(args[0])await this.call('connect',{url:args[0]});else await this.connectDialog();}
  else if(action==='stop')await this.stop();else if(action==='reload')await this.call('reload');
  else if(action==='inspect'){this.inspecting=args[0]!=='off';await this.call('inspect',{enabled:this.inspecting});document.querySelector('#runtime-inspect').setAttribute('aria-pressed',String(this.inspecting));}
  else if(action==='status'){const s=await this.call('status');this.log?.('Preview: '+s.status+' '+(s.url||''));}
  else throw Error('Use /preview run | connect [URL] | stop | reload | inspect [off] | status');return true;
 }
 async chatContext(){if(!window.depth.runtime||this.unavailable||!this.hostReady)return null;try{return await this.call('context');}catch(e){this.failed(e);return null;}}
};
