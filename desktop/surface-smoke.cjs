'use strict';
function auditSurfaces(){
 if(document.body?.classList?.contains('docking')){
  const checks={},geometry={},visible=e=>!!e&&e.getBoundingClientRect().width>0&&e.getBoundingClientRect().height>0;
  checks['browser has measured layout']=document.documentElement.clientWidth>0&&document.documentElement.clientHeight>0;
  checks['workspace has no horizontal overflow']=document.documentElement.scrollWidth<=innerWidth;
  for(const e of document.querySelectorAll('#dock-stage .group')){
   if(!visible(e))continue;const r=e.getBoundingClientRect(),bar=e.querySelector('.dock-toolbar').getBoundingClientRect(),id=e.dataset.group;
   geometry[id]={x:r.x,y:r.y,width:r.width,height:r.height};
   checks[id+' / panel is inside the workspace viewport']=r.left>=-1&&r.right<=innerWidth+1&&r.top>=0&&r.bottom<=innerHeight+1;
   checks[id+' / draggable header fits']=bar.width>0&&bar.right<=r.right+1&&bar.bottom<=r.bottom+1;
   for(const button of e.querySelectorAll(':scope > .dock-toolbar .panel-ops button'))if(visible(button)){const b=button.getBoundingClientRect();checks[id+' / '+button.getAttribute('aria-label')+' fits']=b.left>=bar.left-1&&b.right<=bar.right+1&&b.top>=bar.top-1&&b.bottom<=bar.bottom+1;}
  }
  return {checks,geometry,theme:document.documentElement.dataset.theme,scope:'Measured, user-arrangeable dock panes'};
 }
 const q=s=>document.querySelector(s),rect=s=>{const r=q(s).getBoundingClientRect();return {left:r.left,top:r.top,right:r.right,bottom:r.bottom,width:r.width,height:r.height};};
 const preview=rect('.preview-pane'),modules=rect('.assembly-pane'),divider=rect('#workspace-divider');
 const rgb=s=>(getComputedStyle(q(s)).backgroundColor.match(/[\d.]+/g)||[]).slice(0,3).map(Number);
 const p=rgb('.preview-sheet'),g=rgb('#assembly-viewport');
 const checks={
  'preview and graph have a visible divider':divider.width>=16&&preview.right<=divider.left+1&&divider.right<=modules.left+1,
  'both working areas retain usable width':preview.width>=300&&modules.width>=320,
  'preview document and module canvas have distinct colors':p.length===3&&g.length===3&&Math.hypot(...p.map((v,i)=>v-g[i]))>=50,
  'workspace has no horizontal overflow':document.documentElement.scrollWidth<=innerWidth,
 };
 for(const [header,title,actions] of [['.preview-heading-bar','#preview-region-title','.preview-heading-actions'],['.module-heading-bar','#modules-region-title','#assembly-back']]){
  const h=rect(header),t=rect(title),a=rect(actions);
  checks[title+' fits its own region']=t.width>0&&t.left>=h.left&&t.right<=h.right&&t.top>=h.top&&t.bottom<=h.bottom;
  checks[title+' does not overlap its controls']=!a.width||t.right<=a.left||t.bottom<=a.top;
 }
 return {checks,geometry:{preview,modules,divider},colors:{preview:p,graph:g},theme:document.documentElement.dataset.theme};
}
exports.auditSurfaces=auditSurfaces;
exports.run=async({win,js,check,layoutCheck,capture,sleep})=>{
 if(await js('document.body.classList.contains("docking")'))return require('./docking-smoke.cjs').run({win,js,check,layoutCheck,capture,sleep});
 await js('document.querySelector(".workspace").scrollTop=0;document.querySelector(".assembly-pane").scrollTop=0');await sleep(200);
 const original=await js('JSON.stringify({ids:depthApp.state().memberIds,root:depthApp.state().assemblyRoot})');
 const position=await js('(()=>{const e=document.querySelector("#workspace-divider"),r=e.getBoundingClientRect(),x=Math.round(r.left+r.width/2),y=Math.round(Math.min(r.top+230,innerHeight-100));return {x,y,hit:e.contains(document.elementFromPoint(x,y)),preview:document.querySelector(".preview-pane").getBoundingClientRect().width};})()');
 check(position.hit,'resize divider receives the real pointer at its displayed location');
 win.webContents.sendInputEvent({type:'mouseMove',x:position.x,y:position.y});
 win.webContents.sendInputEvent({type:'mouseDown',x:position.x,y:position.y,button:'left',clickCount:1});
 win.webContents.sendInputEvent({type:'mouseMove',x:position.x+70,y:position.y});
 win.webContents.sendInputEvent({type:'mouseUp',x:position.x+70,y:position.y,button:'left',clickCount:1});
 await sleep(300);
 check(await js('document.querySelector(".preview-pane").getBoundingClientRect().width')>position.preview+35,'Electron pointer input resizes the actual preview');
 check(await js('JSON.stringify({ids:depthApp.state().memberIds,root:depthApp.state().assemblyRoot})')===original,'pointer resizing retains all source identities');
 await capture('25-surface-resize','feature');
 const audit=async label=>{const result=await js('('+auditSurfaces.toString()+')()');for(const [name,ok] of Object.entries(result.checks))layoutCheck(ok,label+' / '+name);return result;};
 await audit('resized');
 await js('document.querySelector("#workspace-divider").dispatchEvent(new MouseEvent("dblclick",{bubbles:true}))');
 await js('document.querySelector("#theme-toggle").click()');await sleep(300);await capture('26-surface-dark','feature');await audit('dark');
 await js('document.querySelector("#theme-toggle").click()');
 win.webContents.setZoomFactor(1.25);
 try{await sleep(400);await capture('27-surface-125','feature');await audit('125 percent zoom');}
 finally{win.webContents.setZoomFactor(1);await sleep(250);}
};
