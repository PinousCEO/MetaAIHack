'use strict';
// Runs in the project's isolated world. No host bridge, service key, filesystem
// or general IPC is exposed to project JavaScript.
const {ipcRenderer}=require('electron');
let inspecting=false,bindings=[],selection=[],nodes=[],overlay,shadow,scheduled=false,basePath='';
const own=new WeakSet();
function locations(el){
 const result=[];
 for(let node=el;node&&node!==document;node=node.parentElement){
  const p=node.getAttribute?.('data-depth-source');if(p){result.push({path:p,line:Number(node.getAttribute('data-depth-line'))||null});break;}
 }
 for(const binding of bindings)try{if(el.closest(binding.selector))result.push({path:binding.path,line:binding.line});}catch{}
 if(el.tagName==='IMG'){try{const u=new URL(el.currentSrc,location.href);if(u.origin===location.origin)result.unshift({path:basePath+decodeURIComponent(u.pathname).replace(/^\//,''),line:null});}catch{}}
 return result;
}
function refreshNodes(){nodes=[...document.querySelectorAll('[data-depth-source]')];for(const b of bindings)try{nodes.push(...document.querySelectorAll(b.selector));}catch{}nodes=[...new Set(nodes)];draw();}
function ensureOverlay(){if(overlay?.isConnected)return;overlay=document.createElement('div');overlay.setAttribute('data-depth-overlay','');own.add(overlay);Object.assign(overlay.style,{all:'initial',position:'fixed',inset:'0',pointerEvents:'none',zIndex:'2147483647'});document.documentElement.append(overlay);shadow=overlay.attachShadow({mode:'closed'});}
// SVG overlay, not opacity on nested project elements: nested ancestors never
// multiply the dimming and project CSS/controls retain their authored styles.
function draw(){
 ensureOverlay();
 // Overlay uses its own inline-only SVG; no project selectors are modified.
 const related=nodes.filter(node=>locations(node).some(a=>selection.some(b=>a.path===b.path&&(!a.line||a.line>=b.line&&a.line<=(b.endLine||b.line)))));
 shadow.replaceChildren();if(!selection.length||!related.length)return;
 const ns='http://www.w3.org/2000/svg',svg=document.createElementNS(ns,'svg');svg.setAttribute('width','100%');svg.setAttribute('height','100%');
 // Keep a single mask. It fades the unused space by 16%, leaving text readable.
 const defs=document.createElementNS(ns,'defs'),mask=document.createElementNS(ns,'mask');mask.id='depth-preview-mask';
 const rect=(x,y,w,h,color)=>{const e=document.createElementNS(ns,'rect');for(const [k,v] of Object.entries({x,y,width:w,height:h,fill:color}))e.setAttribute(k,String(v));return e;};
 mask.append(rect(0,0,innerWidth,innerHeight,'white'));
 const boxes=related.map(n=>n.getBoundingClientRect()).filter(r=>r.width&&r.height);
 for(const r of boxes)mask.append(rect(r.x-2,r.y-2,r.width+4,r.height+4,'black'));defs.append(mask);svg.append(defs);
 const shade=rect(0,0,innerWidth,innerHeight,'#101826');shade.setAttribute('opacity','.16');shade.setAttribute('mask','url(#depth-preview-mask)');svg.append(shade);
 for(const r of boxes){const outline=rect(r.x-2,r.y-2,r.width+4,r.height+4,'none');outline.setAttribute('stroke','#f59e0b');outline.setAttribute('stroke-width','2');svg.append(outline);}shadow.append(svg);
}
function schedule(){if(scheduled)return;scheduled=true;requestAnimationFrame(()=>{scheduled=false;refreshNodes();});}
ipcRenderer.on('runtime-inspector',(_e,config)=>{inspecting=!!config.inspect;basePath=typeof config.basePath==='string'?config.basePath:'';bindings=Array.isArray(config.bindings)?config.bindings:[];selection=Array.isArray(config.selection)?config.selection:[];schedule();});
window.addEventListener('click',event=>{
 if(!inspecting)return;const el=event.composedPath().find(n=>n instanceof Element&&!own.has(n));if(!el)return;
 event.preventDefault();event.stopImmediatePropagation();
 ipcRenderer.send('runtime-picked',{name:(el.getAttribute('aria-label')||el.textContent||el.tagName).trim().slice(0,160),locations:locations(el),page:location.pathname,tag:el.tagName});
},true);
window.addEventListener('DOMContentLoaded',()=>{new MutationObserver(records=>{if(records.some(r=>r.target!==overlay&&!overlay?.contains(r.target)&&!(r.type==='childList'&&r.addedNodes.length>0&&[...r.addedNodes].every(n=>n===overlay)&&!r.removedNodes.length)))schedule();}).observe(document.documentElement,{childList:true,subtree:true,attributes:true,attributeFilter:['class','style','hidden','data-depth-source','data-depth-line']});ipcRenderer.send('runtime-document-ready');schedule();});
window.addEventListener('resize',schedule);window.addEventListener('scroll',schedule,true);
