'use strict';
(() => {
 let d=window.DepthStudyData; const model=DepthPreview.model(d,window.depth); const L=window.DepthStudyLayout,q=s=>document.querySelector(s),NS='http://www.w3.org/2000/svg',XHTML='http://www.w3.org/1999/xhtml';
 let cards=new Map(d.cards.map(c=>[c.id,c])),meaning=L.describe(d),groups=L.grouped(d.relations); const modes=['guide','routes','orbit'],names={guide:'Field Guide',routes:'Route Atlas',orbit:'Orbit'},numbers={guide:'02',routes:'04',orbit:'05'};
 const state={mode:'guide',selected:d.rootId,level:'beginner',all:false,zoom:1,pan:{x:0,y:0},edge:null,rootId:d.rootId,previewKey:null,ready:false,busy:false,error:null};let generation=0;let geometry,nodeLayer,edgeLayer,world,drag;
 function svg(tag,attrs={},text){const e=document.createElementNS(NS,tag);for(const[k,v]of Object.entries(attrs))e.setAttribute(k,String(v));if(text!==undefined)e.textContent=text;return e;}
 function html(tag,cls,text){const el=document.createElementNS(XHTML,tag);el.className=cls;if(text!==undefined)el.textContent=text;return el;}
 function nodeContent(c,p,m,entry,context){
  const b=L.contentBox(p,m,state.mode,entry,context),box=svg('foreignObject',{x:b.x,y:b.y,width:b.w,height:b.h,class:'node-content-box'}),content=html('div','node-content '+b.kind),heading=html('div','node-heading'),name=html('div','node-title');
  name.title=c.name;
  // Browser layout wraps identifiers at word boundaries while preserving the exact text/ID.
  for(let i=0;i<c.name.length;i++){if(i&&/[a-z0-9_]/.test(c.name[i-1])&&/[A-Z]/.test(c.name[i]))name.append(document.createElementNS(XHTML,'wbr'));name.append(document.createTextNode(c.name[i]));}
  if(!context){const glyph=html('span','node-glyph');glyph.innerHTML=DepthIcons.icon(m.icon);heading.append(glyph);}heading.append(name);content.append(heading);
  const meta=html('div','node-meta'),role=entry?'Coordinator · entry':m.users>1?'Shared · '+m.users+' callers':c.kind==='Image'?'Declared asset':m.role;
  meta.append(html('span','node-role-label',role));const value=c.properties?.[0]?.value;
  if(value&&(context||m.constant))meta.append(html('span','node-number',value));content.append(meta);
  if(state.mode==='guide'&&b.kind==='regular'&&!m.constant&&p.h>=170){const purpose=html('p','node-summary',c.purpose||'Inspect its source and relationships.');purpose.title=purpose.textContent;content.append(purpose);}
  box.append(content);return box;
 }
 function outline(p,m,entry,context){const{w,h}=p;if(context)return svg('rect',{x:0,y:0,width:w,height:h,rx:7});
  if(state.mode==='guide'){
   if(m.gate)return svg('path',{d:`M ${w/2} 0 L ${w} ${h/2} L ${w/2} ${h} L 0 ${h/2} Z`});
   if(m.constant)return svg('rect',{width:w,height:h,rx:5});
   return svg('path',{d:`M 0 26 L 13 12 L 60 12 L 74 25 L ${w-15} 25 L ${w} 40 L ${w} ${h-14} L ${w-14} ${h} L 0 ${h} Z`});
  }
  if(m.gate)return svg('path',{d:`M ${w/2} 0 L ${w} ${h/2} L ${w/2} ${h} L 0 ${h/2} Z`});
  if((state.mode==='orbit'&&entry)||(state.mode==='routes'&&m.users>1))return svg('ellipse',{cx:w/2,cy:h/2,rx:w/2,ry:h/2});
  return svg('rect',{width:w,height:h,rx:state.mode==='orbit'?26:m.constant?40:entry?8:12});
 }
 function buildNode(c){const p=geometry.positions.get(c.id),m=meaning.get(c.id),entry=c.id===d.rootId,context=geometry.contextIds.includes(c.id),g=svg('g',{'data-node':c.id,transform:`translate(${p.x} ${p.y})`,class:'module'+(entry?' entry':'')+(m.users>1?' shared':'')+(m.constant?' constant':'')+(context?' context-module':''),role:'button',tabindex:0,'aria-label':c.name+' · '+m.role});
  g.append(svg('title',{},c.name+' · '+m.role+' · '+(c.anchors[0]?.path||'')));
  if(state.mode==='guide'&&!context){for(const n of[8,4]){const layer=outline(p,m,entry,context);layer.setAttribute('class','node-layer');layer.setAttribute('transform',`translate(${n} ${n})`);g.append(layer);}}
  const border=outline(p,m,entry,context);border.setAttribute('class','node-outline');g.append(border);
  if(state.mode==='guide'&&!context){const inset=outline(p,m,entry,context);inset.setAttribute('class','node-inset');inset.setAttribute('transform',`translate(5 5) scale(${(p.w-10)/p.w} ${(p.h-10)/p.h})`);g.append(inset);}
  if(state.mode==='routes'&&m.users>1&&!context)g.append(svg('ellipse',{cx:p.w/2,cy:p.h/2,rx:p.w/2-7,ry:p.h/2-7,class:'node-inset'}));
  g.append(nodeContent(c,p,m,entry,context));
  return g;
 }
 function renderGraph(){
  geometry=L.layout(d,state.mode,meaning);const graph=q('#graph');graph.replaceChildren();graph.setAttribute('viewBox',`0 0 ${geometry.width} ${geometry.height}`);
  const defs=svg('defs');for(const kind of['call','references','binding']){const marker=svg('marker',{id:'study-arrow-'+kind,viewBox:'0 0 10 10',refX:9,refY:5,markerWidth:5,markerHeight:5,orient:'auto',markerUnits:'strokeWidth'});marker.append(svg('path',{d:'M 0 0 L 10 5 L 0 10 Z',class:'direction-arrow '+kind}));defs.append(marker);}
  const gradient=svg('linearGradient',{id:'orbit-module',x1:0,y1:0,x2:0,y2:1});gradient.append(svg('stop',{offset:0,'stop-color':document.documentElement.dataset.theme==='dark'?'#6857aa':'#e6ddff'}),svg('stop',{offset:1,'stop-color':document.documentElement.dataset.theme==='dark'?'#302b67':'#cbbced'}));defs.append(gradient);graph.append(defs);world=svg('g',{id:'study-world'});graph.append(world);
  if(state.mode==='orbit'){for(const radius of[160,295,430])world.append(svg('ellipse',{cx:467,cy:307,rx:radius,ry:radius*.77,class:'orbit-guide'}));world.append(svg('text',{x:25,y:20,class:'layout-note'},'Radial layout · distance has no metric meaning'));}
  edgeLayer=svg('g');nodeLayer=svg('g');world.append(edgeLayer,nodeLayer);
  const obstacles=[...geometry.positions.values()];
  for(const r of groups){const a=geometry.positions.get(r.from),b=geometry.positions.get(r.to),route=L.route(a,b,obstacles,geometry.width,geometry.height),kind=r.kind==='calls'?'call':r.kind==='references'?'references':'binding',g=svg('g',{'data-edge':r.id,'data-source-ids':JSON.stringify(r.ids),class:'relationship '+kind,tabindex:0,role:'button','aria-label':cards.get(r.from).name+' '+r.kind+' '+cards.get(r.to).name,'data-from':r.from,'data-to':r.to});
   const path=L.path(route.points,true);g.append(svg('title',{},g.getAttribute('aria-label')+' · '+r.ids.length+' source occurrence(s)'),svg('path',{d:path,class:'route-hit'}),svg('path',{d:path,class:'route-line','marker-end':'url(#study-arrow-'+kind+')'}));
   // Relationship text lives in a dedicated reading strip, so shared routes cannot stack labels.
   edgeLayer.append(g);
  }
  if(geometry.contextIds.length&&!geometry.generic){world.append(svg('line',{x1:25,y1:699,x2:1070,y2:699,class:'context-rule'}),svg('text',{x:25,y:721,class:'context-title'},'SUPPORTING SOURCE & DECLARED ASSETS · '+geometry.contextIds.length+' ELEMENTS'));}
  for(const c of d.cards)nodeLayer.append(buildNode(c));fit();selection();
 }
 function selection(){
  const adjacent=new Set([state.selected]);for(const r of groups)if(r.from===state.selected||r.to===state.selected){adjacent.add(r.from);adjacent.add(r.to);}
  for(const el of nodeLayer.children){el.classList.toggle('selected',el.dataset.node===state.selected);el.classList.toggle('peripheral',!adjacent.has(el.dataset.node)&&!state.all);el.setAttribute('aria-current',String(el.dataset.node===state.selected));}
  for(const el of edgeLayer.children){el.classList.toggle('active',el.dataset.from===state.selected||el.dataset.to===state.selected);el.classList.toggle('selected',el.dataset.edge===state.edge);}
  q('#graph').classList.toggle('all-links',state.all);for(const [id,on]of[['selected-links',!state.all],['all-links',state.all]])q('#'+id).setAttribute('aria-pressed',String(on));search();
 }
 function select(id){if(!cards.has(id))return;state.selected=id;state.edge=null;selection();inspector();edgeCaption();q('#status').textContent='Selected '+cards.get(id).name+' · source identity preserved';}
 function inspector(){
  if(!cards.has(state.selected))return;
  const c=cards.get(state.selected),m=meaning.get(c.id),calls=groups.filter(r=>r.from===c.id&&r.kind==='calls'),consumers=groups.filter(r=>r.to===c.id&&r.kind==='calls'),refs=groups.filter(r=>r.from===c.id&&r.kind==='references'),anchor=c.anchors[0];
  q('#selected-title').textContent=c.name;q('#role-description').textContent=m.role+' · '+c.kind;q('#rationale').replaceChildren();
  const add=text=>{const p=document.createElement('p');p.textContent=text;q('#rationale').append(p);};
  if(c.purpose)add(c.purpose);
  if(state.level==='beginner'){
   if(calls.length)add(c.name+' directly calls '+calls.length+' operation'+(calls.length===1?'':'s')+': '+calls.map(r=>cards.get(r.to).name).join(', ')+'. The arrows point from the caller to the operation it uses; they do not represent execution order.');
   if(consumers.length)add(consumers.map(r=>cards.get(r.from).name).join(' and ')+' call this same implementation. Keeping one implementation lets those callers share its behavior; a change here can affect each caller.');
   if(refs.length)add('This module references '+refs.map(r=>cards.get(r.to).name).join(', ')+'. References identify values or objects used by the source. They are different from function calls.');
   if(m.constant)add('The source declares this value with const. It is a constant used by other source elements, not a mutable UI setting in this preview.');
   if(!calls.length&&!refs.length&&!consumers.length)add(c.kind==='Image'?'This asset is part of the declared feature composition. Its connection comes from the preview source declaration.':'This source element is part of the selected feature. Its inbound relationships show where it is used.');
  }else add([calls.length+' direct calls',refs.length+' referenced elements',consumers.length+' callers'].join(' · ')+'. See the exact source below.');
  const shared=consumers.length>1?c:calls.map(r=>cards.get(r.to)).find(x=>meaning.get(x.id).users>1);
  q('#shared-reason').textContent=shared?shared.name+' is shared by '+groups.filter(r=>r.kind==='calls'&&r.to===shared.id).map(r=>cards.get(r.from).name).join(' and ')+'.':'';
  q('#source-location').textContent=anchor.path+(anchor.startLine?':'+anchor.startLine:'');q('#source-code').textContent=c.kind==='Image'?'Asset: '+anchor.path:(d.sources[c.id]||[]).map(s=>s.text).join('\n\n');
  q('#trace-selected').textContent=c.name+' / source excerpt';
  const sourceIds=[c.id,...(c.id===d.rootId?d.relations.filter(r=>r.from===c.id&&r.kind==='view-binding').map(r=>r.to):[])];
  q('#trace-code').textContent=[...new Set(sourceIds)].flatMap(id=>{const n=cards.get(id);return n.kind==='Image'?['Asset: '+n.anchors[0].path]:(d.sources[id]||[]).map(s=>s.path+':'+s.startLine+'\n'+s.text);}).join('\n\n');
  q('#connections').replaceChildren();for(const r of groups.filter(r=>r.from===c.id||r.to===c.id)){const b=document.createElement('button');b.dataset.select=r.from===c.id?r.to:r.from;const type=document.createElement('span'),name=document.createElement('b'),site=document.createElement('small');type.textContent=r.from===c.id?r.kind:'used by';name.textContent=cards.get(b.dataset.select).name;site.textContent=r.sites.map(s=>s.path+':'+s.startLine).join(', ')+(r.ids.length>1?' · '+r.ids.length+' occurrences':'');b.append(type,name,site);q('#connections').append(b);}
  for(const b of document.querySelectorAll('[data-file]'))b.classList.toggle('active',b.dataset.file===anchor.path);
 }
 function edgeCaption(id=state.edge){const r=groups.find(r=>r.id===id);q('#edge-caption').textContent=r?cards.get(r.from).name+' → '+cards.get(r.to).name+' · '+r.kind+' · '+r.ids.length+' source occurrence(s) · '+r.sites.map(s=>s.path+':'+s.startLine).join(', '):'Point to or select a connection to read its type and source evidence here.';}
 function inspectEdge(id){const r=groups.find(r=>r.id===id);if(!r)return;state.edge=id;selection();edgeCaption(id);}
 function search(){const query=q('#search').value.trim().toLowerCase();for(const el of nodeLayer.children){const c=cards.get(el.dataset.node),match=(c.name+' '+c.anchors.map(a=>a.path).join(' ')).toLowerCase().includes(query);el.classList.toggle('no-match',!!query&&!match);el.classList.toggle('match',!!query&&match);}}
 function fit(){state.zoom=1;state.pan={x:0,y:0};transform();}
 function transform(){world.setAttribute('transform',`translate(${state.pan.x} ${state.pan.y}) scale(${state.zoom})`);q('#zoom').textContent=Math.round(state.zoom*100)+'%';}
 function zoom(factor){const next=Math.min(2.5,Math.max(.6,state.zoom*factor)),cx=geometry.width/2,cy=geometry.height/2;state.pan.x=cx-(cx-state.pan.x)*next/state.zoom;state.pan.y=cy-(cy-state.pan.y)*next/state.zoom;state.zoom=next;transform();}
 function theme(value){document.documentElement.dataset.theme=value;q('#theme').innerHTML=DepthIcons.icon(value==='dark'?'sun':'moon')+'<span>'+(value==='dark'?'Light':'Dark')+'</span>';q('#theme').setAttribute('aria-label','Switch to '+(value==='dark'?'light':'dark')+' mode');}
 function mode(value){if(!modes.includes(value))return;state.mode=value;document.documentElement.dataset.mode=value;theme(value==='orbit'?'dark':'light');for(const b of document.querySelectorAll('[data-mode]'))if(b.tagName==='BUTTON')b.setAttribute('aria-pressed',String(b.dataset.mode===value));q('#view-number').textContent=numbers[value];q('#view-title').textContent=({guide:'Source relationships',routes:'Source route atlas',orbit:'Architecture lens'})[value];renderGraph();q('#status').textContent=names[value]+' · same '+d.cards.length+' indexed elements';}
 document.addEventListener('click',e=>{
  const node=e.target.closest('[data-node]'),edge=e.target.closest('[data-edge]'),style=e.target.closest('button[data-mode]'),choice=e.target.closest('[data-select]'),level=e.target.closest('[data-level]'),file=e.target.closest('[data-file]');
  if(drag?.moved)return;if(node)select(node.dataset.node);else if(edge)inspectEdge(edge.dataset.edge);else if(style)mode(style.dataset.mode);else if(choice)select(choice.dataset.select);else if(level){state.level=level.dataset.level;for(const b of document.querySelectorAll('[data-level]'))b.setAttribute('aria-pressed',String(b.dataset.level===state.level));inspector();}else if(file){const found=d.cards.find(c=>c.id===d.rootId&&c.anchors.some(a=>a.path===file.dataset.file))||d.cards.find(c=>c.anchors.some(a=>a.path===file.dataset.file));if(found)select(found.id);else{const next=model.data.allCards.find(c=>c.anchors.some(a=>a.path===file.dataset.file));if(next)openPreview(next.id,null);}}
 });
 q('#graph').addEventListener('keydown',e=>{const node=e.target.closest('[data-node]'),edge=e.target.closest('[data-edge]');if((e.key==='Enter'||e.key===' ')&&(node||edge)){e.preventDefault();node?select(node.dataset.node):inspectEdge(edge.dataset.edge);}});
 for(const event of ['pointerover','focusin'])q('#graph').addEventListener(event,e=>{const edge=e.target.closest('[data-edge]');if(edge)edgeCaption(edge.dataset.edge);});
 for(const event of ['pointerout','focusout'])q('#graph').addEventListener(event,e=>{const edge=e.target.closest('[data-edge]');if(edge&&!edge.contains(e.relatedTarget))edgeCaption();});
 q('#search').addEventListener('input',search);q('#theme').onclick=()=>{theme(document.documentElement.dataset.theme==='dark'?'light':'dark');const selectionId=state.selected;renderGraph();select(selectionId);};
 q('#selected-links').onclick=()=>{state.all=false;selection();};q('#all-links').onclick=()=>{state.all=true;selection();};q('#fit').onclick=fit;q('#zoom-in').onclick=()=>zoom(1.15);q('#zoom-out').onclick=()=>zoom(1/1.15);
 q('#source-expand').onclick=()=>{const on=q('.source').classList.toggle('expanded');q('#source-expand').setAttribute('aria-expanded',String(on));q('#source-expand').textContent=on?'Collapse':'Expand ↗';};
 q('#explain').onclick=()=>{document.body.classList.add('source-focused');q('.inspector').scrollIntoView?.({behavior:'smooth',block:'start'});q('#source-expand').focus();};q('#explore').onclick=()=>{document.body.classList.remove('source-focused');q('#viewport').focus();};
 q('#reference').onclick=()=>{q('#reference-title').textContent=numbers[state.mode]+' · '+names[state.mode]+' reference';q('#reference-image').src='references/'+({guide:'02-fieldguide',routes:'04-routeatlas',orbit:'05-orbit'})[state.mode]+'.png';q('#reference-dialog').showModal();};q('#close-reference').onclick=()=>q('#reference-dialog').close();
 q('#viewport').addEventListener('pointerdown',e=>{if(e.button!==0||e.target.closest('[data-node],[data-edge]'))return;drag={id:e.pointerId,x:e.clientX,y:e.clientY,pan:{...state.pan},moved:false};q('#viewport').setPointerCapture?.(e.pointerId);});
 q('#viewport').addEventListener('pointermove',e=>{if(!drag||drag.id!==e.pointerId)return;const dx=e.clientX-drag.x,dy=e.clientY-drag.y;if(Math.hypot(dx,dy)>4)drag.moved=true;if(!drag.moved)return;const r=q('#graph').getBoundingClientRect(),factor=Math.max(geometry.width/(r.width||1100),geometry.height/(r.height||835));state.pan.x=drag.pan.x+dx*factor;state.pan.y=drag.pan.y+dy*factor;transform();q('#viewport').classList.add('panning');});
 for(const name of['pointerup','pointercancel'])q('#viewport').addEventListener(name,()=>{q('#viewport').classList.remove('panning');setTimeout(()=>drag=null,0);});
 q('#viewport').addEventListener('wheel',e=>{if(e.ctrlKey||e.metaKey){e.preventDefault();zoom(e.deltaY<0?1.1:1/1.1);}}, {passive:false});
 q('#viewport').addEventListener('keydown',e=>{if(e.target!==q('#viewport'))return;if(['ArrowLeft','ArrowRight','ArrowUp','ArrowDown'].includes(e.key)){e.preventDefault();state.pan.x+=e.key==='ArrowLeft'?30:e.key==='ArrowRight'?-30:0;state.pan.y+=e.key==='ArrowUp'?30:e.key==='ArrowDown'?-30:0;transform();}});
 q('#scope-title').textContent=cards.get(d.rootId).name;q('#scope-count').textContent=d.compositionIds.length+' composition elements + '+(d.cards.length-d.compositionIds.length)+' external consumer · '+d.relations.length+' source occurrences';
 for(const file of [...new Set((d.allCards||d.cards).flatMap(c=>c.anchors.map(a=>a.path)))]){const b=document.createElement('button');b.className='file';b.dataset.file=file;b.innerHTML=DepthIcons.icon(file.endsWith('.png')?'image':'file');b.append(html('span','file-name',file));q('#files').append(b);}
 DepthIcons.hydrate();mode('guide');inspector();edgeCaption();
 function trace(){
  const root=cards.get(d.rootId);q('#trace-title').textContent=(state.previewKey?'Selected '+state.previewKey+' / ':'')+root.name;
  q('#trace-location').textContent=root.anchors.map(a=>a.path+':'+a.startLine).join(', ');q('#trace-targets').replaceChildren();
  const targets=[...new Set(d.relations.filter(r=>r.from===d.rootId).map(r=>r.to))];
  for(const id of targets){const c=cards.get(id);if(!c)continue;const b=document.createElement('button');b.dataset.select=id;b.textContent=c.name+' / '+c.anchors.map(a=>a.path+':'+a.startLine).join(', ');q('#trace-targets').append(b);}
 }
 function install(next){d=next;cards=new Map(d.cards.map(c=>[c.id,c]));meaning=L.describe(d);groups=L.grouped(d.relations);state.rootId=d.rootId;state.selected=d.rootId;state.edge=null;
  q('#scope-title').textContent=cards.get(d.rootId).name;q('#scope-count').textContent=d.compositionIds.length+' composition elements / '+d.relations.length+' source occurrences';
  q('#search').value='';renderGraph();inspector();edgeCaption();trace();
 }
 function markPreview(){for(const b of document.querySelectorAll('[data-preview-id]'))b.setAttribute('aria-pressed',String(b.dataset.previewId===state.rootId));}
 function fail(error){state.error=String(error.message||error);q('#status').textContent='Unable to load source: '+state.error;q('#status').setAttribute('role','alert');}
 async function openPreview(id,key){
  const ticket=++generation;state.busy=true;state.error=null;q('#status').setAttribute('role','status');q('main').setAttribute('aria-busy','true');q('#status').textContent='Loading complete source composition...';
  try{const next=await model.composition(id);if(ticket!==generation)return;state.previewKey=key;install(next);markPreview();q('#status').textContent='Showing all '+d.cards.length+' indexed elements for '+(key||cards.get(id).name);}
  catch(error){if(ticket===generation)fail(error);}finally{if(ticket===generation){state.busy=false;q('main').setAttribute('aria-busy','false');}}
 }
 function showPreview(){const data=model.data;DepthPreview.render(q('#preview-surface'),data,openPreview);q('.project-name').textContent=data.name;
  q('.product-return').hidden=!window.depth;
  q('#preview-provenance').textContent=data.preview?data.preview.evidence:'Source index only / preview unavailable';
  q('#connection-status').textContent=model.live?'Live project index / read-only':'Bundled sample snapshot / read-only';
 }
 q('#preview-size').onclick=()=>{const on=document.body.classList.toggle('preview-expanded');q('#preview-size').setAttribute('aria-pressed',String(on));q('#preview-size').textContent=on?'Restore':'Enlarge';};
 q('#read-source').onclick=()=>{q('.inspector').scrollIntoView?.({behavior:'smooth',block:'start'});q('#source-code').focus();};
 if(!window.depth){showPreview();trace();}else{q('#preview-surface').textContent='Loading current project...';q('main').hidden=true;q('.inspector').hidden=true;}
 const ready=(async()=>{try{if(window.depth){const data=await model.load();showPreview();const id=data.preview?.entryId||data.allCards[0]?.id;
   q('#files').replaceChildren();for(const file of [...new Set(data.allCards.flatMap(c=>c.anchors.map(a=>a.path)))]){const b=document.createElement('button');b.className='file';b.dataset.file=file;b.textContent=file;q('#files').append(b);}
   if(id){await openPreview(id,null);q('main').hidden=false;q('.inspector').hidden=false;}else{d={...data,cards:[],relations:[],sources:{},compositionIds:[]};cards=new Map();meaning=new Map();groups=[];state.selected=null;state.rootId=null;renderGraph();q('main').hidden=false;q('#scope-count').textContent='No indexed source elements';q('#source-code').textContent='';q('#trace-title').textContent='No indexed source elements';q('#trace-targets').replaceChildren();q('#trace-location').textContent='';q('#scope-title').textContent='';q('#trace-code').textContent='';q('#trace-selected').textContent='';}
  }state.ready=!state.error;}catch(error){fail(error);}return state.ready;})();
 window.DepthStudy={ready,state:()=>({...state,live:model.live,pan:{...state.pan},nodeIds:d.cards.map(c=>c.id),relationIds:d.relations.map(r=>r.id),groupedEdges:groups.length}),select,mode,openPreview};
 new DepthProjectDrop({available:()=>!!window.depth?.projectFromDrop,busy:()=>!state.ready||state.busy||!!document.querySelector('dialog[open]'),error:fail,open:async files=>{
  state.busy=true;
  try{const path=await window.depth.projectFromDrop(files);q('#status').textContent='Indexing dropped project…';await window.depth.request('/import',{path});window.location.assign('../index.html');}
  finally{state.busy=false;}
 }});
})();
