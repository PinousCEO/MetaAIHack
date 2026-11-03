/* Layout state only. Panel content and project operations remain host-owned. */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.DepthDockModel = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';
  const panels = Object.freeze({preview:'Project preview',modules:'Modules',hierarchy:'Hierarchy',console:'Console',chat:'Meta CLI',details:'Details',source:'Source'});
  const copy = s => JSON.parse(JSON.stringify(s));
  const group = (id, tabs, active = tabs[0]) => ({kind:'group',id,tabs,active,collapsed:false});
  const split = (id, axis, ratio, a, b) => ({kind:'split',id,axis,ratio,a,b});
  function initial() {
    return {version:1,seq:20,theme:'dark',maximized:null,hidden:[],floats:[],
      root:split('workspace','x',.57,
        split('left','y',.86,group('preview',['preview']),group('utility',['console','chat'])),
        split('right','y',.73,group('modules',['modules']),group('hierarchy',['hierarchy','details','source'])))};
  }
  function walk(n, fn) { if (!n) return; fn(n); if(n.kind==='split'){walk(n.a,fn);walk(n.b,fn);} }
  function nodes(s) {const out=[];walk(s.root,n=>out.push(n));s.floats.forEach(f=>walk(f.node,n=>out.push(n)));return out;}
  function find(s,id) {return nodes(s).find(n=>n.id===id);}
  function owner(s,panel) {return nodes(s).find(n=>n.kind==='group' && n.tabs.includes(panel));}
  function id(s,prefix) { let value; do { value=prefix+'-'+(++s.seq); } while(nodes(s).some(n=>n.id===value)||s.floats.some(f=>f.id===value)); return value; }
  function mapNode(n,target,fn) {
    if(!n)return null;
    if(n.id===target)return fn(n);
    if(n.kind==='split'){n.a=mapNode(n.a,target,fn);n.b=mapNode(n.b,target,fn);}
    return n;
  }
  function replace(s,target,fn) {
    s.root=mapNode(s.root,target,fn);
    s.floats.forEach(f=>{f.node=mapNode(f.node,target,fn);});
  }
  function removeNode(n,panel) {
    if(!n)return null;
    if(n.kind==='group'){
      n.tabs=n.tabs.filter(p=>p!==panel);
      if(!n.tabs.length)return null;
      if(!n.tabs.includes(n.active))n.active=n.tabs[0];
      return n;
    }
    n.a=removeNode(n.a,panel);n.b=removeNode(n.b,panel);
    return n.a && n.b ? n : n.a || n.b;
  }
  function remove(s,panel) {
    s.root=removeNode(s.root,panel);
    s.floats=s.floats.map(f=>({...f,node:removeNode(f.node,panel)})).filter(f=>f.node);
    s.hidden=s.hidden.filter(p=>p!==panel);s.maximized=null;
  }
  function validPanel(p) {if(!Object.hasOwn(panels,p))throw Error('Unknown panel');}
  function dock(state,panel,target,zone='center') {
    validPanel(panel);
    if(!['center','left','right','top','bottom'].includes(zone))throw Error('Invalid dock zone');
    const s=copy(state);
    const dst=find(s,target);
    if(!dst || dst.kind!=='group')throw Error('Dock destination missing');
    if(dst.tabs.includes(panel) && (zone==='center' || dst.tabs.length===1)){
      dst.active=panel;dst.collapsed=false;return s;
    }
    remove(s,panel);
    replace(s,target,n=>{
      if(zone==='center'){n.tabs.push(panel);n.active=panel;n.collapsed=false;return n;}
      const g=group(id(s,'group'),[panel]);
      const before=zone==='left'||zone==='top';
      return split(id(s,'split'),['left','right'].includes(zone)?'x':'y',before?.28:.72,before?g:n,before?n:g);
    });
    return s;
  }
  function float(state,panel,rect={x:70,y:70,w:380,h:300}){
    validPanel(panel);const s=copy(state);remove(s,panel);
    s.floats.push({id:id(s,'float'),node:group(id(s,'group'),[panel]),rect:{...rect}});
    return s;
  }
  function dockWorkspace(state,panel,zone){
    validPanel(panel);if(!['left','right','top','bottom'].includes(zone))throw Error('Invalid workspace edge');
    const s=copy(state);remove(s,panel);const g=group(id(s,'group'),[panel]);
    if(!s.root)s.root=g;
    else {const before=zone==='left'||zone==='top';s.root=split(id(s,'split'),['left','right'].includes(zone)?'x':'y',before?.22:.78,before?g:s.root,before?s.root:g);}
    return s;
  }
  function hide(state,panel){validPanel(panel);const s=copy(state);remove(s,panel);s.hidden.push(panel);return s;}
  function show(state,panel){
    validPanel(panel);const s=copy(state);const g=owner(s,panel);
    if(g){g.active=panel;g.collapsed=false;s.maximized=null;return s;}
    remove(s,panel);
    if(!s.root)s.root=group(id(s,'group'),[panel]);
    else {
      const target=nodes(s).find(n=>n.kind==='group');
      target.tabs.push(panel);target.active=panel;target.collapsed=false;
    }
    return s;
  }
  function activate(state,groupId,panel){const s=copy(state),g=find(s,groupId);if(!g||g.kind!=='group'||!g.tabs.includes(panel))throw Error('Tab missing');g.active=panel;g.collapsed=false;return s;}
  function collapse(state,groupId){const s=copy(state),g=find(s,groupId);if(!g||g.kind!=='group')throw Error('Group missing');g.collapsed=!g.collapsed;return s;}
  function maximize(state,groupId){const s=copy(state);if(!find(s,groupId))throw Error('Group missing');s.maximized=s.maximized===groupId?null:groupId;return s;}
  function resize(state,splitId,ratio){const s=copy(state),n=find(s,splitId);if(!n||n.kind!=='split'||!Number.isFinite(ratio))throw Error('Invalid splitter');n.ratio=Math.max(.06,Math.min(.94,ratio));return s;}
  function validate(s) {
    if(!s||s.version!==1||!Array.isArray(s.hidden)||!Array.isArray(s.floats)||!Number.isSafeInteger(s.seq)||s.seq<20||s.seq>1e8||!['light','dark'].includes(s.theme))return false;
    let count=0;const ids=new Set(),seen=[];
    function check(n,depth=0){
      if(!n||depth>15||++count>50||typeof n.id!=='string'||!n.id||ids.has(n.id))return false;
      ids.add(n.id);
      if(n.kind==='group'){
        if(!Array.isArray(n.tabs)||!n.tabs.length||!n.tabs.includes(n.active)||typeof n.collapsed!=='boolean')return false;
        seen.push(...n.tabs);return true;
      }
      return n.kind==='split'&&['x','y'].includes(n.axis)&&Number.isFinite(n.ratio)&&n.ratio>=.06&&n.ratio<=.94&&check(n.a,depth+1)&&check(n.b,depth+1);
    }
    if(s.root&&!check(s.root))return false;
    for(const f of s.floats){
      if(typeof f.id!=='string'||ids.has(f.id))return false;ids.add(f.id);
      if(!f.rect||!['x','y','w','h'].every(k=>Number.isFinite(f.rect[k]))||f.rect.w<100||f.rect.h<60||f.rect.w>10000||f.rect.h>10000||!check(f.node))return false;
    }
    seen.push(...s.hidden);
    if(seen.length!==Object.keys(panels).length||new Set(seen).size!==Object.keys(panels).length||!seen.every(p=>Object.hasOwn(panels,p)))return false;
    return s.maximized===null || nodes(s).some(n=>n.kind==='group'&&n.id===s.maximized);
  }
  function preset(name){
    let s=initial();
    if(name==='cli'){
      s=dockWorkspace(s,'chat','right');
      s.root.a.ratio=.65;
      s=collapse(s,'utility');
    }
    if(name==='preview')s.maximized='preview';
    return s;
  }
  return {panels,initial,copy,nodes,find,owner,dock,dockWorkspace,float,hide,show,activate,collapse,maximize,resize,validate,preset};
});

