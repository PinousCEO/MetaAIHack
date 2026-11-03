'use strict';
// Runs in Chromium after layout. No DOM-only success fallback.
function auditIdentity(){
 const checks={},problems=[],q=s=>document.querySelector(s);
 const visible=e=>Boolean(e&&e.getClientRects().length&&e.getBoundingClientRect().width&&e.getBoundingClientRect().height);
 const record=(ok,name)=>{checks[name]=Boolean(ok);if(!ok)problems.push(name);};
 record(document.documentElement.clientWidth>0&&document.documentElement.clientHeight>0,'browser has a measured viewport');
 record(document.documentElement.scrollWidth<=innerWidth+1,'page has no horizontal overflow');
 for(const node of document.querySelectorAll('.module-body')){
  if(!visible(node))continue;
  const title=node.querySelector('h3'),icon=node.querySelector('.module-glyph'),label=node.querySelector('header small'),value=node.querySelector('.module-value');
  const a=title.getBoundingClientRect(),name=title.textContent;
  record(title.scrollHeight<=title.clientHeight+1,name+' / full title fits');
  if(visible(icon)){const b=icon.getBoundingClientRect();record(a.left>=b.right-1||a.top>=b.bottom-1,name+' / title and icon do not overlap');}
  if(visible(label)){const b=label.getBoundingClientRect();record(a.top>=b.bottom-1,name+' / role label stays above title');}
  if(visible(value)){const b=value.getBoundingClientRect();record(a.bottom<=b.top+1,name+' / value stays below title');}
  const outline=node.querySelector('.module-outline'),svg=node.querySelector('.module-silhouette'),r=svg?.getBoundingClientRect();
  if(r?.width&&typeof outline?.isPointInFill==='function'){
   const inside=[[a.left+1,a.top+1],[a.right-1,a.top+1],[a.left+1,a.bottom-1],[a.right-1,a.bottom-1]].every(([x,y])=>outline.isPointInFill(new DOMPoint((x-r.left)*210/r.width,(y-r.top)*144/r.height)));
   record(inside,name+' / title fits inside actual role silhouette');
  }else record(false,name+' / silhouette geometry is measurable');
 }
 for(const row of document.querySelectorAll('.chassis>header,.selection-source>header,.asset-studio')){
  if(!visible(row))continue;const bounds=row.getBoundingClientRect();
  for(const child of row.children){if(!visible(child))continue;const r=child.getBoundingClientRect();record(r.left>=bounds.left-1&&r.right<=bounds.right+1,(child.textContent||child.tagName).slice(0,60)+' / fits containing row');}
 }
 if(document.body.dataset.workspaceScreen==='feature'&&!q('.workspace').classList.contains('assembly-focus')&&(!document.body.classList.contains('docking')||window.depthDock?.visible('details'))){
  const source=q('#source-evidence'),why=q('#assembly-details');
  record(visible(source)!==visible(why),'source and rationale occupy separate active tabs');
  if(innerWidth>=1400&&innerHeight>=850&&!q('.workspace').classList.contains('assembly-focus')){
   const dock=q('.evidence-dock').getBoundingClientRect(),pane=(document.body.classList.contains('docking')?q('.evidence-dock').closest('.group'):q('.assembly-pane')).getBoundingClientRect();
   record(dock.top>=pane.top&&dock.bottom<=pane.bottom+1,'evidence remains inside its active pane');
  }
 }
 return {checks,problems,passed:problems.length===0,scope:'Rendered geometry and DOM text bounds; visual design still requires inspection of the captured PNG.'};
}
exports.auditIdentity=auditIdentity;
