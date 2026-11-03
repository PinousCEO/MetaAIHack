'use strict';
// Screen composition only. Source IDs, math, proposals and validation stay service-owned.
(() => {
 const q=s=>document.querySelector(s),icon=n=>DepthIcons.icon(n);
 const e=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 const role=c=>c.kind==='Method'?'logic':['Field','Property'].includes(c.kind)?'state':c.kind==='Image'?'asset':c.kind==='NamedType'?'type':'view';
 const glyph=c=>({logic:'logic',state:'state',asset:'image',type:'layers',view:'view'}[role(c)]);
 const titles={map:['Project map','Roles and shared implementations'],feature:['Composition','All modules used by the selected feature'],understand:['Understand','Structure, behavior and design rationale'],relations:['Relationships','Direction, weights and change impact'],split:['Split modules','Separate actual source into files'],integrate:['Integrate projects','Compare contracts and reuse implementations'],assets:['Asset studio','Generate, review and import images'],review:['Review changes','Review structure and code before applying'],history:['Change history','Applied changes and reviewed undo']};
 const standard=new Set(['map','feature','understand']);
 const moduleLabel=m=>m.explanation?.name||m.provides.find(c=>c.kind==='NamedType')?.name||m.provides.find(c=>c.kind==='Method')?.name||m.provides.find(c=>c.language!=='asset')?.name||m.provides[0]?.name||m.id.slice(0,12);
 const box=(title,body)=>'<section class="box"><h3>'+e(title)+'</h3>'+body+'</section>';
 const field=(title,html)=>'<label class="field"><span>'+e(title)+'</span>'+html+'</label>';
 const empty=(title,detail,action='')=>'<div class="empty-state">'+icon('layers')+'<h2>'+e(title)+'</h2><p>'+e(detail)+'</p>'+action+'</div>';
 class DepthProduct {
  constructor(host){
   this.h=host;this.s=host.state;this.screen='feature';this.serial=0;this.sourceCache=new Map();this.relationKind='all';this.assetImages=new Map();this.assetStyle='2d';this.queue=['A','B','C'];
   this.project=null;this.sourceProject=null;this.reviewData=null;this.assetId=null;this.nextQueue=3;
   document.addEventListener('click',ev=>this.click(ev));
   q('#toggle-explorer').onclick=()=>this.explorer(!q('#explorer').hidden);
   q('#close-explorer').onclick=()=>this.explorer(true);
   q('#reduce-motion').onclick=()=>{const on=!document.body.classList.contains('reduced-motion');localStorage.setItem('depth.reduced-motion',String(on));this.motion(on);};
   this.workspace=new DepthWorkspace(this);
   this.focus=new DepthPreviewFocus(this);
   this.motion(localStorage.getItem('depth.reduced-motion')==='true');
   this.theme(localStorage.getItem('depth.theme')||'light');
   q('#theme-toggle').onclick=()=>this.theme(document.documentElement.dataset.theme==='dark'?'light':'dark');
   document.addEventListener('keydown',ev=>{if((ev.ctrlKey||ev.metaKey)&&ev.key.toLowerCase()==='k'){ev.preventDefault();q('#search').focus();}if(ev.key==='Escape'){this.explorer(true);q('#source-dock').open=false;}});
   if(window.ResizeObserver){this.resize=new ResizeObserver(()=>this.scheduleLines());this.resize.observe(q('#design-page'));}
  }
  viewport(action){
   if(['feature','relations'].includes(this.screen)){if(action==='fit')this.h.board.fit();else if(action==='reset')this.h.board.reset();else this.h.board.zoom(action==='in'?1.2:1/1.2);return;}
   const scene=q('#design-page .scene');if(!scene)return;
   this.sceneZoom=['fit','reset'].includes(action)?1:Math.max(.5,Math.min(1.5,(this.sceneZoom||1)*(action==='in'?1.1:1/1.1)));
   scene.style.zoom=String(this.sceneZoom);q('#zoom-value').textContent=Math.round(this.sceneZoom*100)+'%';this.scheduleLines();
  }
  motion(on){document.body.classList.toggle('reduced-motion',on);q('#reduce-motion').setAttribute('aria-pressed',String(on));}
  theme(value){const theme=value==='dark'?'dark':'light';document.documentElement.dataset.theme=theme;localStorage.setItem('depth.theme',theme);q('#theme-toggle').innerHTML=icon(theme==='dark'?'sun':'moon');q('#theme-toggle').setAttribute('aria-label','Switch to '+(theme==='dark'?'light':'dark')+' mode');q('#theme-toggle').title=q('#theme-toggle').getAttribute('aria-label');}
  importance(){
   const visible=['map','feature','understand','relations'].includes(this.screen);q('#importance-bar').hidden=!visible;if(!visible)return;
   const meaning=this.meanings();
   const ranked=this.cards().filter(c=>c.kind==='Method').sort((a,b)=>meaning.get(b.id).score-meaning.get(a.id).score||a.name.localeCompare(b.name)).slice(0,3);
   q('#importance-bar').innerHTML='<span title="Ranked by distinct direct consumers × 2 + direct calls; not a claim about business importance">Key connections</span>'+ranked.map(c=>'<button data-inspect="'+e(c.id)+'" class="'+(c.id===this.s.entity?'active':'')+'"><b>'+e(c.name)+'</b><small>'+meaning.get(c.id).users+' users · '+meaning.get(c.id).calls+' calls</small></button>').join('')+'<small class="importance-scope">Static source · not execution order</small>';
  }
  explorer(close){if(this.workspace?.dock){q('#explorer').hidden=false;if(!close)this.workspace.dock.show('hierarchy');return;}q('#explorer').hidden=close;q('#toggle-explorer').setAttribute('aria-expanded',String(!close));}
  cards(){return this.s.view?.cards||[];}
  meanings(){const key=this.s.graph.projectId+':'+this.s.graph.revision+':'+this.s.assemblyRoot;if(this.meaningKey!==key){this.meaningKey=key;this.meaning=DepthVisual.describe(this.cards(),this.s.graph.relations,this.s.assemblyRoot);}return this.meaning;}
  card(id=this.s.entity){return this.cards().find(c=>c.id===id);}
  contract(){return this.s.catalog?.modules.find(m=>m.id===this.s.selected);}
  stamp(){return {projectId:this.s.graph.projectId,revision:this.s.graph.revision};}
  async source(id){const key=this.s.graph.projectId+':'+this.s.graph.revision+':'+id;if(!this.sourceCache.has(key))this.sourceCache.set(key,await this.h.api('/source/'+id));return this.sourceCache.get(key);}
  sourceText(record){return record.sources.map(s=>s.content.split(/\r?\n/).slice(s.anchor.startLine-1,s.anchor.endLine).join('\n')).join('\n\n');}
  members(id){const ids=new Set(this.s.graph.relations.filter(r=>r.kind==='contains'&&r.from===id).map(r=>r.to));return this.cards().filter(c=>ids.has(c.id));}
  owner(id){return this.s.graph.relations.filter(r=>r.kind==='contains'&&r.to===id).map(r=>this.card(r.from)).find(c=>c?.kind==='NamedType');}
  tile(c,extra=''){if(!c)return '';const value=c.properties?.[0],meaning=this.meanings().get(c.id);return '<button class="module-tile shape-'+meaning.shape+' '+role(c)+(c.id===this.s.entity?' selected':'')+'" data-inspect="'+e(c.id)+'" data-surface-id="'+e(c.id)+'"><span class="port in" '+(!meaning.users?'hidden':'')+'></span><span class="port out" '+(!meaning.dependencies?'hidden':'')+'></span><span class="tile-title">'+icon(glyph(c))+'<span>'+e(c.name)+'</span></span><small class="tile-role">'+e(meaning.label)+(meaning.users>1?' · '+meaning.users+' users':'')+'</small>'+(value?'<div class="tile-value">'+e(value.value)+'</div>':'<div class="tile-sub">'+e(c.purpose||meaning.reason)+'</div>')+(role(c)==='asset'&&this.s.images[c.id]?'<img src="'+e(this.s.images[c.id])+'" alt="'+e(c.name)+'">':'')+extra+'</button>';}
  chassis(c,members=this.members(c.id),open=false){return '<article class="chassis '+(open?'open-module ':'')+(c.kind==='View'?'view-chassis ':'')+(c.id===this.s.entity?'selected':'')+'" data-surface-id="'+e(c.id)+'"><header>'+icon('layers')+'<div><h3>'+e(c.name)+'</h3><small>'+e(c.anchors[0]?.path||c.kind)+'</small></div><button data-understand="'+e(c.id)+'" title="Open all declarations">Open inside ↗</button></header><div class="inner member-stack">'+(members.length?members.map(c=>this.tile(c)).join(''):'<p class="tile-sub">No indexed declarations in this type.</p>')+'</div></article>';}
  async refresh(){
   if(this.project!==this.s.graph.projectId){this.project=this.s.graph.projectId;this.sourceProject=null;this.reviewData=null;this.assetId=null;this.transformIds={};this.sourceCache.clear();this.assetImages.clear();this.queue=['A','B','C'];}
   // Drop obsolete source snapshots after edits rather than retaining whole projects.
   for(const key of this.sourceCache.keys())if(!key.startsWith(this.s.graph.projectId+':'+this.s.graph.revision+':'))this.sourceCache.delete(key);
   await this.navigate(this.screen,true);
  }
  async navigate(screen,preserve=false){
   if(!titles[screen])return;this.screen=screen;this.s.screen=screen;this.s.page=screen==='review'?'changes':screen==='history'?'history':'modules';
   this.explorer(true);if(!preserve)q('#source-dock').open=false;
   const active={feature:'map',relations:'map',history:'review'}[screen]||screen;
   document.querySelectorAll('[data-screen]').forEach(b=>b.classList.toggle('active',b.dataset.screen===active));
   q('#screen-title').textContent=titles[screen][0];q('#screen-subtitle').textContent=this.s.graph.root.split(/[\\/]/).pop()+' · '+titles[screen][1];
   q('.workspace').classList.toggle('relations-mode',screen==='relations');
   q('#modules-page').hidden=!['feature','relations'].includes(screen);q('#design-page').hidden=['feature','relations'].includes(screen);q('#list-page').hidden=true;
   q('#inspector-standard').hidden=!standard.has(screen);q('#inspector-custom').hidden=standard.has(screen);q('#inspector-title').textContent=({review:'Change details',history:'History details',integrate:'Integration details',assets:'Generate image',relations:'Relationship details'}[screen]||'Module details');
   q('#screen-actions').innerHTML=screen==='map'||screen==='relations'?'<button data-screen="map" class="'+(screen==='map'?'active':'')+'">Project map</button><button data-screen="relations" class="'+(screen==='relations'?'active':'')+'">Relationships</button><button data-page="modules">Composition</button>':screen==='feature'||screen==='understand'?'<button data-page="modules" class="'+(screen==='feature'?'active':'')+'">Composition</button><button data-screen="understand" class="'+(screen==='understand'?'active':'')+'">Inside module</button>':'';
   this.importance();const serial=++this.serial;
   if(screen==='map')await this.map(serial);
   else if(screen==='feature'){
    if(this.h.board.composition!==this.s.composition)this.h.board.set(this.s.composition||{memberIds:[],relations:[]},this.cards(),this.s.images);
    const composition=this.s.composition;
    q('#assembly-title').textContent=composition?.title||this.card(composition?.rootId)?.name||'Composition';
    q('#assembly-count').textContent=(composition?.memberIds.length||0)+' modules · '+(composition?.relations.length||0)+' source relationships';
    q('#edge-detail').textContent='All related modules are present. Select a connection to inspect its evidence.';
    this.h.board.select(this.s.entity);this.h.board.fit();
    if(this.card()?.kind==='Method'){const source=await this.source(this.s.entity);if(serial===this.serial)this.h.board.sourceSnippet(this.s.entity,source.sources);}
   }
   else if(screen==='understand')await this.understand(serial);
   else if(screen==='relations')await this.relations(serial);
   else if(screen==='split'||screen==='integrate')this.transformation(screen);
   else if(screen==='assets')await this.assets(serial);
   else if(screen==='review')this.reviewData?this.renderReview(this.reviewData):await this.pending(serial);
   else if(screen==='history')await this.history(serial);
   if(!['feature','relations'].includes(screen)){this.sceneZoom=1;q('#zoom-value').textContent='100%';}this.contractPanel();await this.workspace.screen(screen);DepthIcons.hydrate();this.scheduleLines();
  }
  async selectionChanged(){
   await this.workspace.selection();
   this.importance();
   this.contractPanel();
   if(this.screen==='understand')await this.understand(++this.serial);
   if(this.screen==='map'){document.querySelectorAll('[data-inspect]').forEach(b=>b.classList.toggle('selected',b.dataset.inspect===this.s.entity));this.scheduleLines();}
  }
  contractPanel(){const m=this.contract();q('#module-contract').innerHTML=m?box('AI contract', '<div class="contract"><dl><div><dt>Provides</dt><dd>'+m.provides.map(c=>e(c.name)).join(', ')+'</dd></div><div><dt>Requires</dt><dd>'+(m.requires.map(c=>e(c.name)).join(', ')||'No indexed external dependencies')+'</dd></div><div><dt>Evidence</dt><dd>'+e(m.status==='source-matched'?'Meta explanation matched to current source':'Source structure · Meta explanation '+(m.status==='stale'?'Needs analysis':'not generated'))+'</dd></div><div><dt>ID</dt><dd><code>'+e(m.id)+'</code></dd></div></dl></div>'):'';}
  async map(serial){
   const assets=this.cards().filter(c=>c.kind==='Image');await this.h.loadImages(assets.map(c=>c.id));if(serial!==this.serial)return;
   const query=q('#search').value.trim().toLowerCase(),types=this.cards().filter(c=>c.kind==='NamedType'||c.kind==='View');
   const owned=new Set(types.flatMap(c=>this.members(c.id).filter(x=>x.kind!=='NamedType').map(x=>x.id)));
   const match=c=>(c.name+' '+c.anchors.map(a=>a.path).join(' ')).toLowerCase().includes(query);
   const groups=types.filter(c=>!query||match(c)||this.members(c.id).some(match)).map(c=>this.chassis(c,this.members(c.id).filter(x=>x.kind!=='NamedType')));
   const loose=this.cards().filter(c=>!owned.has(c.id)&&!['NamedType','View','Image'].includes(c.kind)&&match(c));
   const pictures=assets.filter(match);
   q('#design-page').innerHTML='<div class="scene"><div class="map-grid">'+groups.join('')+loose.map(c=>this.tile(c)).join('')+(pictures.length?'<section class="asset-group"><h3>'+icon('image')+' Project assets</h3><div class="asset-tray">'+pictures.map(c=>this.tile(c)).join('')+'</div></section>':'')+'</div>'+(!groups.length&&!loose.length&&!pictures.length?empty('No modules to display',query?'Try a different search.':'No supported source found in this folder.'): '<p class="map-note">Select to inspect. Open inside to see all members. Lines represent source relationships; boundaries represent ownership.</p>')+'</div>';
  }
  scheduleLines(){if(this.scheduled)return;this.scheduled=true;(window.requestAnimationFrame||setTimeout)(()=>{this.scheduled=false;this.lines();});}
  lines(){
   const grid=q('.map-grid');if(this.screen!=='map'||!grid)return;
   grid.querySelector('.surface-links')?.remove();const rect=grid.getBoundingClientRect();if(!rect.width)return;
   const ns='http://www.w3.org/2000/svg',svg=document.createElementNS(ns,'svg');svg.classList.add('surface-links');svg.setAttribute('aria-hidden','true');
   const defs=document.createElementNS(ns,'defs');const marker=document.createElementNS(ns,'marker');marker.id='map-arrow';marker.setAttribute('viewBox','0 0 10 10');marker.setAttribute('refX','10');marker.setAttribute('refY','5');marker.setAttribute('markerWidth','5');marker.setAttribute('markerHeight','5');marker.setAttribute('orient','auto');const arrow=document.createElementNS(ns,'polygon');arrow.setAttribute('points','0,0 10,5 0,10');arrow.setAttribute('fill','#eab8a6');marker.append(arrow);defs.append(marker);svg.append(defs);
   const nodes=new Map([...grid.querySelectorAll('[data-surface-id]')].map(el=>[el.dataset.surfaceId,el]));
   const seen=new Set();
   for(const r of this.s.graph.relations){if(r.kind==='contains'||r.kind==='view-owner')continue;if(this.h.board.connectionMode!=='all'&&r.from!==this.s.entity&&r.to!==this.s.entity)continue;const key=r.from+'|'+r.to+'|'+r.kind;if(seen.has(key))continue;seen.add(key);const a=nodes.get(r.from),b=nodes.get(r.to);if(!a||!b||a===b||a.contains(b)||b.contains(a))continue;
    const ar=a.getBoundingClientRect(),br=b.getBoundingClientRect(),scale=rect.width/(grid.offsetWidth||rect.width),forward=ar.left<br.left,sx=((forward?ar.right:ar.left)-rect.left)/scale,tx=((forward?br.left:br.right)-rect.left)/scale,sy=(ar.top+ar.height/2-rect.top)/scale,ty=(br.top+br.height/2-rect.top)/scale,curve=Math.max(30,Math.abs(tx-sx)*.48)*(forward?1:-1);
    const p=document.createElementNS(ns,'path');p.setAttribute('d','M'+sx+' '+sy+' C'+(sx+curve)+' '+sy+' '+(tx-curve)+' '+ty+' '+tx+' '+ty);p.setAttribute('class',r.kind+(r.from===this.s.entity||r.to===this.s.entity?' highlight':''));p.setAttribute('marker-end','url(#map-arrow)');p.dataset.mapEdge=r.id;svg.append(p);
   }grid.append(svg);
  }
  async understand(serial){
   const selected=this.card();if(!selected){q('#design-page').innerHTML=empty('Select a module','Select a source module from the map or search.');return;}
   const parent=selected.kind==='NamedType'?selected:this.owner(selected.id),root=parent||selected,members=parent?this.members(parent.id):[selected];
   const record=await this.source(root.id);if(serial!==this.serial)return;const text=this.sourceText(record);
   this.queueSupported=/Queue\s*</.test(text)&&/\.Enqueue\(/.test(text)&&/\.Dequeue\(/.test(text);
   q('#design-page').innerHTML='<div class="scene"><article class="chassis open-module"><header>'+icon(glyph(root))+'<div><h3>'+e(root.name)+'</h3><small>'+e(root.anchors[0]?.path)+' · '+members.length+' declarations</small></div><button data-inspect-source="'+e(root.id)+'">'+icon('code')+' Source</button></header><div class="inner">'+(this.queueSupported?this.queueHtml():'')+members.map(c=>this.tile(c)).join('')+'</div><section class="design-story">'+this.h.rationale()+'</section><div class="code-read"><strong>Selected source · '+e(root.name)+'</strong><pre>'+e(text)+'</pre></div></article><p class="canvas-note">Members belong to this container. Open Composition to include external dependencies.</p></div>';
  }
  queueHtml(){return '<section class="queue-lesson"><h3>FIFO · First in, first out</h3><div class="queue-items"><span class="queue-arrow">←</span>'+this.queue.map((x,i)=>'<span class="queue-item">'+e(x)+(i===0?'<small>front</small>':'')+'</span>').join('')+'<span class="queue-arrow">←</span></div><p>An interactive illustration of the source Queue / Enqueue / Dequeue. This is not an execution trace.</p><div class="actions"><button data-queue="add">Add · Enqueue at back</button><button data-queue="next" '+(!this.queue.length?'disabled':'')+'>Next · Dequeue from front</button><button data-queue="reset">Reset</button><span>Count '+this.queue.length+'</span></div></section>';}
  async relations(serial){
   const id=this.s.entity;if(!id){q('#inspector-custom').innerHTML=box('No relationships','<p>Select a module first.</p>');this.h.board.set({memberIds:[],relations:[]},[],{});return;}
   const impact=await this.h.api('/impact',{id,revision:this.s.graph.revision});if(serial!==this.serial)return;
   const m=this.contract(),owned=new Set(m?.entityIds||[id]);
   const rels=this.s.graph.relations.filter(r=>(owned.has(r.from)||owned.has(r.to))&&(this.relationKind==='all'||r.kind===this.relationKind));
   const ids=[...new Set([id,...rels.flatMap(r=>[r.from,r.to])])];this.h.board.set({rootId:id,revision:this.s.graph.revision+':'+this.relationKind,memberIds:ids,relations:rels},this.cards(),this.s.images);this.h.board.select(id);this.h.board.fit();
   q('#assembly-title').textContent=this.card()?.name+' · Relationships';q('#assembly-count').textContent=ids.length+' elements · '+rels.length+' source relationships';q('#edge-detail').textContent='Internal and external source relationships. Select a line to inspect its evidence.';
   const math=this.s.catalog.mathematics,mods=math.modules.slice(0,10),boundaries=math.boundaries;
   const matrix='<div class="matrix-wrap"><table class="matrix"><thead><tr><th>→</th>'+mods.map((m,i)=>'<th title="'+e(m.id)+'">M'+(i+1)+'</th>').join('')+'</tr></thead><tbody>'+mods.map((a,i)=>'<tr><th>M'+(i+1)+'</th>'+mods.map(b=>'<td>'+Number(a.id===b.id?a.internalWeight:boundaries.filter(x=>x.fromModule===a.id&&x.toModule===b.id).reduce((n,x)=>n+x.weight,0)).toFixed(1)+'</td>').join('')+'</tr>').join('')+'</tbody></table></div>';
   this.impact=impact;
   q('#inspector-custom').innerHTML=box('Relationship type','<div class="kind-filter">'+[['all','All'],['calls','Calls'],['references','References'],['contains','Contains']].map(([k,l])=>'<button data-kind="'+k+'" class="'+(this.relationKind===k?'active':'')+'">'+l+'</button>').join('')+'</div>')+box('Relationship weights','<div class="weight-row"><span>Calls</span><b>3</b></div><div class="weight-row"><span>References</span><b>2</b></div><div class="weight-row"><span>Contains</span><b>0.5</b></div><p>Engineering weights, not probabilities. Evidence type and reference counts affect the actual weights.</p>')+box('Mathematical model','<div class="math-formula">B = Pᵀ A P</div><p>Aggregated module weights. Rows: source; columns: destination.</p>'+matrix+'<small>'+math.modules.length+' total · '+mods.length+' shown · Modularity '+Number(math.modularity).toFixed(3)+'</small><details><summary>Matrix module names</summary>'+mods.map((x,i)=>'<small>M'+(i+1)+' · '+e(moduleLabel(this.s.catalog.modules.find(m=>m.id===x.id)))+'</small>').join('')+'</details>')+box('Change impact',this.impactHtml(impact))+box('Analysis scope','<p>Statically indexed relationships. Dynamic calls and unresolved dependencies may be missing.</p><small>Call cycles: '+(m?.mathematics.cycles.length||0)+' · Conductance '+Number(m?.mathematics.conductance||0).toFixed(3)+'</small>');
  }
  impactHtml(impact){const ids=new Set();const collect=x=>{if(!x)return;if(typeof x==='string'&&this.card(x))ids.add(x);else if(Array.isArray(x))x.forEach(collect);else if(typeof x==='object')Object.values(x).forEach(collect);};collect(impact);return '<p>Direct and indirect consumers of the selection</p><div class="impact-list">'+[...ids].map(id=>'<button data-inspect="'+e(id)+'">'+e(this.card(id).name)+'</button>').join('')+'</div>'+(ids.size?'':'<p>No indexed consumers.</p>');}
  transformation(kind){
   const integrating=kind==='integrate',m=this.contract(),source=this.sourceProject;
   const choices=integrating?(source?.catalog.modules||[]):this.s.catalog.modules;
   const chosen=new Set(this.transformIds?.[kind]||(!integrating&&m?[m.id]:[]));
   const targetIds=new Set(m?.entityIds||[]),targetTypes=this.cards().filter(c=>c.kind==='NamedType'&&(targetIds.has(c.id)||this.members(c.id).some(x=>targetIds.has(x.id))));
   const targetBody=targetTypes.map(c=>this.chassis(c)).join('')||this.cards().filter(c=>targetIds.has(c.id)).map(c=>this.tile(c)).join('');
   const sourceBody=source?source.catalog.modules.map(x=>'<article class="chassis"><header>'+icon('layers')+'<div><h3>'+e(moduleLabel(x))+'</h3><small>'+x.entityIds.length+' elements · source project</small></div></header><div class="inner member-stack">'+x.provides.map(c=>'<div class="module-tile '+role(c)+'"><div class="tile-title">'+icon(glyph(c))+e(c.name)+'</div><div class="tile-sub">'+e(c.anchors?.[0]?.path||c.kind)+'</div></div>').join('')+'</div></article>').join(''):empty('Choose source project','Choose the other project containing the modules to import.','<button data-choose-source class="primary">Open project B</button>');
   q('#design-page').innerHTML='<div class="scene"><div class="transform-grid"><section class="file-frame"><h3>'+icon('folder')+(integrating?'Project A · Current target':'Before · current source')+'</h3>'+(targetBody||empty('Select a module','Select modules from the map or search.'))+'</section><section class="file-frame"><h3>'+icon('folder')+(integrating?'Project B · '+e(source?.root.split(/[\\/]/).pop()||'Not selected'):'After · proposed changes')+'</h3>'+(integrating?sourceBody:'<div class="ghost-frame">'+icon('file')+'<h3>Meta proposal will appear here</h3><p>Enter a destination and instructions to review actual file changes.</p><p>Original files are unchanged</p></div>')+'</section></div><div class="mapping-note">'+icon(integrating?'layers':'split')+'<div>'+(integrating?'Name and contract similarity suggests reuse candidates, not equivalent behavior. Original files stay unchanged until validation and approval.':'Review new source files and updates to existing callers together. Visual grouping does not split source files.')+'</div></div>'+(integrating?'<section class="file-frame integration-proposal"><h3>Integration proposal</h3><div class="ghost-frame">Shared implementations and changed files appear in the Meta proposal.</div></section>':'')+'</div>';
   const candidates=integrating&&source?source.candidates.filter(c=>!chosen.size||chosen.has(c.sourceModule)):[];
   q('#inspector-custom').innerHTML=(integrating?'<button id="choose-source" class="wide">'+(source?'Choose another source project':'Choose project B')+'</button><p class="source-summary">Target: '+e(this.s.graph.root.split(/[\\/]/).pop())+'</p>':'')+field(integrating?'Source modules to import':'Groups to separate','<div class="selection-list">'+choices.map(x=>'<label class="pick-row"><input type="checkbox" name="transform-module" value="'+e(x.id)+'" '+(chosen.has(x.id)?'checked':'')+'><span>'+e(moduleLabel(x))+'<small>'+x.entityIds.length+' elements</small></span></label>').join('')+'</div>')+field('Destination folder','<input id="destination" value="'+e(this.destination||'Modules')+'">')+field(integrating?'Integration instructions':'Separation instructions','<textarea id="instruction">'+e(this.instructions?.[kind]||(integrating?'Integrate the selected modules and reuse compatible shared implementations. Explain contract differences and remaining validation in English.':'Separate into independent source files while preserving behavior and public interfaces. Explain the reasons and evidence for each change in English.'))+'</textarea>')+'<button id="create-transform" data-transform-submit="'+kind+'" class="primary wide" '+(!choices.length?'disabled':'')+'>Meta: generate proposal</button><div class="alert-box">Proposal only · not applied<br>Review and validate the source before approval.</div>'+(candidates.length?box('Reuse candidates',candidates.slice(0,8).map(c=>{const a=source.catalog.modules.find(m=>m.id===c.sourceModule),b=this.s.catalog.modules.find(m=>m.id===c.targetModule);return '<div class="candidate-row"><span>'+e(moduleLabel(a))+' → <strong>'+e(moduleLabel(b))+'</strong><small>Name/type similarity '+c.score.toFixed(2)+' · not behavioral equivalence</small></span></div>';}).join('')):'')+box('Target contract','<p>'+e(m?moduleLabel(m):'No selection')+'</p><code>'+e(m?.provides.map(c=>c.qualifiedName||c.name).join('\n')||'')+'</code>');
   document.querySelectorAll('[name="transform-module"]').forEach(input=>input.addEventListener('change',()=>{this.saveTransform(kind);}));
   q('#destination').oninput=q('#instruction').oninput=()=>this.saveTransform(kind);
  }
  saveTransform(kind){this.transformIds??={};this.instructions??={};this.transformIds[kind]=[...document.querySelectorAll('[name="transform-module"]:checked')].map(x=>x.value);this.destination=q('#destination').value;this.instructions[kind]=q('#instruction').value;}
  async chooseSource(){const folder=await window.depth.chooseProject();if(!folder)return;this.sourceProject=await this.h.api('/modules/source',{path:folder});this.transformIds??={};this.transformIds.integrate=[];await this.h.refresh();}
  async submitTransform(kind){
   this.saveTransform(kind);const ids=this.transformIds[kind];if(!ids.length)throw Error('Select modules to work on.');
   const source=kind==='integrate'?this.sourceProject:null;if(kind==='integrate'&&!source)throw Error('Choose the source project.');
   q('#status').textContent='Meta is inspecting source and contracts to prepare a proposal…';
   const proposal=await this.h.api('/modules/transform',{connection:{},...this.stamp(),kind,moduleIds:ids,instruction:this.instructions[kind],destination:this.destination,sourceRoot:source?.root||'',sourceRevision:source?.catalog.revision||'',targetModuleIds:source&&this.s.selected?[this.s.selected]:null,includeDependencies:true});
   await this.h.refresh();await this.h.review(proposal.id);
  }
  async pending(serial){
   const r=await this.h.api('/pending');if(serial!==this.serial)return;
   q('#design-page').innerHTML='<div class="scene"><div class="review-tabs"><button data-page="changes" class="active">Proposals</button><button data-page="history">Applied history</button></div><div class="review-list">'+(r.proposals.length?r.proposals.map(p=>'<article class="review-item"><h3>'+e(p.transformation?.kind==='split'?'Split modules':p.transformation?.kind==='integrate'?'Integrate projects':'Source edit')+'</h3><p>'+e(p.reason)+'</p><small>'+p.edits.length+' files · '+e(p.id.slice(-8))+'</small><button class="primary" data-review="'+e(p.id)+'">Review structure and code</button></article>').join(''):empty('No pending proposals','Create a proposal by editing a source value or asking Meta to split or integrate modules.'))+'</div></div>';
   q('#inspector-custom').innerHTML=box('Review and apply','<p>Review the source revision, file hashes, syntax, and configured build and test results.</p>')+'<button id="validation-profile" class="wide">Build and test commands</button>'+box('Current status','<p>Pending: '+r.proposals.length+'</p><p>Checks that have not run are never marked as passed.</p>');
  }
  async showReview(data){this.reviewData=data;const pending=await this.h.api('/pending');q('#pending-count').textContent=pending.proposals.length||'';await this.navigate('review');}
  renderReview(r){
   const files=which=>r.changes.map(c=>'<section class="file-frame"><h3>'+icon('file')+e(c.path)+(which==='after'?'<span class="file-operation '+e(c.operation)+'">'+e(({create:'New file',delete:'Delete',replace:'Modify'})[c.operation])+'</span>':'')+'</h3><article class="chassis"><header>'+icon('layers')+'<div><h3>'+e(c.path.split('/').pop())+'</h3><small>'+e(which==='before'?'Current source':'Proposed source · not applied')+'</small></div></header><div class="inner"><pre class="file-body">'+e(c[which]||'File does not exist at this point.')+'</pre></div></article></section>').join('');
   const checks=r.assessment.checks||[],labels={'Snapshot':'Project revision','Source hashes':'Source hashes','C# syntax':'C# Syntax','Target build':'Target build','Behavior tests':'Behavior tests'};
   q('#design-page').innerHTML='<div class="scene"><div class="review-tabs"><button data-clear-review>← All proposals</button><button data-page="history">Applied history</button></div><div class="compare-grid"><div><h3 class="scene-heading">Before</h3>'+files('before')+'</div><div><h3 class="scene-heading">After · awaiting approval</h3>'+files('after')+'</div></div>'+r.changes.map(c=>'<section class="review-diff"><h3>'+e(c.path)+' <small>+'+c.diff.added+' / −'+c.diff.removed+(c.diff.coarse?' · Coarse diff for large file diff':'')+'</small></h3><div class="diff">'+c.diff.hunks.flatMap(h=>h.lines).map(l=>'<div class="'+e(l.kind)+'">'+e((l.kind==='added'?'+ ':l.kind==='removed'?'− ':'  ')+l.text)+'</div>').join('')+'</div></section>').join('')+'<div class="timeline"><span>Propose</span><span class="current">Review</span><span>Validate</span><span>Apply</span><span>Undo</span></div></div>';
   q('#inspector-custom').innerHTML=box('Change rationale','<p>'+e(r.proposal.reason)+'</p>')+box('Validation status',checks.map(c=>'<div class="check-row" title="'+e(c.detail)+'"><span class="check-state '+e(c.status)+'">'+e(({passed:'Passed',failed:'Failed','not-run':'Not run',running:'Running'})[c.status]||c.status)+'</span><div><strong>'+e(labels[c.name]||c.name)+'</strong><small>'+e(c.detail)+'</small></div></div>').join('')+'<button data-validate="'+e(r.proposal.id)+'" class="primary wide">Run configured checks</button><button data-apply="'+e(r.proposal.id)+'" class="wide" '+(r.assessment.canApply?'':'disabled')+'>Approve and apply</button>')+box('Manage change','<button id="validation-profile" class="wide">Validation commands</button><button data-dismiss="'+e(r.proposal.id)+'" class="wide">Discard proposal</button>')+box('Affected elements',this.impactHtml(r.assessment.impact));
  }
  async history(serial){
   const r=await this.h.api('/history');if(serial!==this.serial)return;
   q('#design-page').innerHTML='<div class="scene"><div class="review-tabs"><button data-page="changes">Proposals</button><button data-page="history" class="active">Applied history</button></div>'+r.recovery.map(x=>'<article class="review-item"><h3>Interrupted apply · recovery needs review</h3><pre class="file-body">'+e(JSON.stringify(x,null,2))+'</pre></article>').join('')+(r.changes.length?r.changes.map(c=>'<article class="review-item"><h3>'+e(new Date(c.at).toLocaleString())+'</h3><p>'+e(c.reason)+'</p><small>'+e(c.paths.join(' · '))+'</small><button data-undo="'+e(c.id)+'">Propose undo</button></article>').join(''):empty('No applied changes','Approved changes record affected files and reasons here.'))+'</div>';
   q('#inspector-custom').innerHTML=box('Reviewed undo','<p>Undo creates a proposal comparing previous and current files. Review and approve it before restoration.</p>')+box('Journal', '<p>'+r.changes.length+' applied · '+r.recovery.length+' awaiting recovery</p>');
  }
  async assets(serial){
   const [list]=await Promise.all([this.h.api('/assets'),this.h.loadImages(this.cards().filter(c=>c.kind==='Image').map(c=>c.id))]);if(serial!==this.serial)return;
   this.assetRecords=list.items;const projectAssets=this.cards().filter(c=>c.kind==='Image');
   if(!this.assetId||!list.items.some(a=>a.id===this.assetId)&&!projectAssets.some(a=>a.id===this.assetId))this.assetId=list.items[0]?.id||projectAssets[0]?.id||null;
   const record=list.items.find(a=>a.id===this.assetId),asset=this.card(this.assetId);
   if(record&&!this.assetImages.has(record.id)){const content=await this.h.api('/assets/'+record.id+'/content');if(serial!==this.serial)return;this.assetImages.set(record.id,'data:'+content.mime+';base64,'+content.base64);}
   const url=record?this.assetImages.get(record.id):this.s.images[asset?.id];
   const bindings=asset?this.s.graph.relations.filter(r=>r.to===asset.id&&r.kind.startsWith('view-')).map(r=>this.card(r.from)).filter(Boolean):[];
   q('#design-page').innerHTML='<div class="scene"><section class="asset-studio"><div><h3>'+(record?'Generated image preview':'Project image')+'</h3><div class="asset-preview">'+(url?'<img src="'+e(url)+'" alt="'+e(record?'Meta Generated image':asset?.name)+'">':'<div class="empty">Enter a prompt to generate an image.</div>')+'</div></div><div><h3>Asset library</h3><div class="asset-candidates">'+list.items.map(a=>'<button class="asset-candidate '+(a.id===this.assetId?'selected':'')+'" data-asset="'+e(a.id)+'">'+(this.assetImages.get(a.id)?'<img src="'+e(this.assetImages.get(a.id))+'" alt="Generated image">':icon('image'))+'<div><strong>'+e(a.importedPath||'Generated PNG')+'</strong><small>'+e(a.model)+' · '+e(a.status==='staged'?'Awaiting approval':'Imported')+'</small></div></button>').join('')+projectAssets.map(a=>'<button class="asset-candidate '+(a.id===this.assetId?'selected':'')+'" data-asset="'+e(a.id)+'">'+(this.s.images[a.id]?'<img src="'+e(this.s.images[a.id])+'" alt="'+e(a.name)+'">':icon('image'))+'<div><strong>'+e(a.name)+'</strong><small>'+e(a.anchors[0]?.path)+'</small></div></button>').join('')+'</div></div></section>'+(asset?'<div class="usage-row">'+(bindings.length?'<div class="usage-sources">'+bindings.map(c=>this.tile(c)).join('')+'</div>'+icon('arrow'):'')+this.tile(asset)+'</div><p class="asset-source-note">'+(bindings.length?'Source-declared image consumers. Select a module to inspect its source and composition.':'No declared view consumers in the current index.')+'</p>':'<p class="asset-source-note">Review generated assets before importing. Usage relationships come from actual source declarations.</p>')+'</div>';
   q('#inspector-custom').innerHTML='<div class="segmented"><button data-asset-style="2d" class="'+(this.assetStyle==='2d'?'active':'')+'">2D Image</button><button data-asset-style="3d" class="'+(this.assetStyle==='3d'?'active':'')+'">3D style image</button></div>'+field('Image format','<input value="PNG" readonly>')+field('Prompt','<textarea id="asset-prompt" placeholder="Describe the image you need">'+e(this.assetPrompt||'')+'</textarea>')+field('Generation model (Meta)','<input readonly value="'+e(this.s.meta?.imageModel||'Meta Image')+'">')+'<button id="generate-asset" class="primary wide">Generate image</button><button class="wide" disabled>3D mesh · unsupported</button><p class="asset-log">3D style output is a PNG with depth and lighting, not a mesh.</p>'+box('Import into project',field('Destination path','<input id="asset-destination" value="'+e(this.assetDestination||'Assets/generated.png')+'">')+'<p>'+(record?e(record.status==='staged'?'Generated · awaiting approval':'Imported · '+record.importedPath):'Select a generated image.')+'</p><button id="import-asset" class="primary wide" '+(!record||record.status!=='staged'?'disabled':'')+'>Approve and import</button>')+(record?'<div class="asset-log">'+e(record.model)+'<br>'+e(record.hash)+'<br>'+record.bytes+' bytes</div>':'');
   q('#asset-prompt').oninput=()=>this.assetPrompt=q('#asset-prompt').value;q('#asset-destination').oninput=()=>this.assetDestination=q('#asset-destination').value;
  }
  async generateAsset(){const prompt=q('#asset-prompt').value.trim();if(!prompt)throw Error('Describe the image to generate.');this.assetPrompt=prompt;q('#status').textContent='Meta is generating the image…';const r=await this.h.api('/assets/generate',{connection:{},...this.stamp(),kind:'image',prompt,style:this.assetStyle});this.assetId=r.id;await this.navigate('assets');}
  async importAsset(){const record=this.assetRecords.find(a=>a.id===this.assetId);if(!record)throw Error('Select a generated image first.');const destination=q('#asset-destination').value.trim();await this.h.api('/assets/import',{id:record.id,...this.stamp(),destination,approved:true});await this.h.refresh();q('#status').textContent='Image imported · '+destination;}
  click(event){
   const b=event.target.closest('button');if(!b||b.disabled)return;
   const run=this.h.run;
   if(b.dataset.screen)run(()=>this.navigate(b.dataset.screen));
   else if(b.dataset.inspect)run(async()=>{await this.h.chooseEntity(b.dataset.inspect);if(this.screen==='relations')await this.relations(++this.serial);});
   else if(b.dataset.understand)run(async()=>{await this.h.chooseEntity(b.dataset.understand);await this.navigate('understand');});
   else if(b.dataset.kind)run(async()=>{this.relationKind=b.dataset.kind;await this.relations(++this.serial);});
   else if(b.hasAttribute('data-clear-review'))run(async()=>{this.reviewData=null;await this.navigate('review');});
   else if(b.dataset.transformSubmit)run(()=>this.submitTransform(b.dataset.transformSubmit));
   else if(b.id==='choose-source'||b.hasAttribute('data-choose-source'))run(()=>this.chooseSource());
   else if(b.dataset.asset)run(async()=>{this.assetId=b.dataset.asset;await this.navigate('assets');});
   else if(b.dataset.assetStyle)run(async()=>{this.assetStyle=b.dataset.assetStyle;await this.navigate('assets');});
   else if(b.id==='generate-asset')run(()=>this.generateAsset());
   else if(b.id==='import-asset')run(()=>this.importAsset());
   else if(b.dataset.queue&&this.queueSupported){if(b.dataset.queue==='reset'){this.queue=['A','B','C'];this.nextQueue=3;}if(b.dataset.queue==='next')this.queue.shift();if(b.dataset.queue==='add'&&this.queue.length<8)this.queue.push(String.fromCharCode(65+this.nextQueue++%26));q('.queue-lesson').outerHTML=this.queueHtml();}
  }
 }
 DepthProduct.moduleLabel=moduleLabel;
 window.DepthProduct=DepthProduct;
})();
