'use strict';
window.DepthDockWorkbench=class{
 constructor(product){
  this.p=product;this.s=product.s;this.recent=[];this.stamp=null;
  const q=s=>document.querySelector(s),node=(tag,cls,html)=>{const e=document.createElement(tag);e.className=cls||'';if(html)e.innerHTML=html;return e;};
  document.body.classList.add('docking');
  const controls=node('div','dock-controls','<select id="panel-picker" aria-label="Open panel"><option value="">Panels…</option></select><select id="layout-picker" aria-label="Workspace layout"><option value="">Layout: Custom</option><option value="default">Default</option><option value="cli">CLI at right</option><option value="preview">Preview focus</option><option value="saved">Saved layout</option></select><button id="save-layout" title="Save workspace layout">Save layout</button><button id="reset-layout" title="Restore default layout">Reset</button>');
  q('.top').append(controls);
  const main=q('main'),views={};
  const parking=node('div','dock-parking');parking.id='dock-parking';parking.hidden=true;main.append(parking);
  const view=(key,...elements)=>{const v=node('section','dock-panel-view dock-view-'+key);v.dataset.dockView=key;v.setAttribute('aria-label',DepthDockModel.panels[key]);v.append(...elements.filter(Boolean));parking.append(v);views[key]=v;return v;};
  const preview=q('.preview-pane'),assembly=q('#modules-page'),design=q('#design-page'),list=q('#list-page'),source=q('#source-dock'),inspector=q('.inspector'),evidence=q('.evidence-dock'),explorer=q('#explorer'),chat=q('.chat');
  view('preview',preview);
  view('modules',q('.workbar'),q('#stats'),q('#importance-bar'),assembly,design,list);
  q('.assembly-subhead').append(q('#assembly-back'));
  q('#assembly-details').append(inspector);view('details',evidence);view('source',source);
  explorer.hidden=false;view('hierarchy',explorer);
  this.search=node('input','dock-hierarchy-search');this.search.placeholder='Find a module…';this.search.setAttribute('aria-label','Find a module in hierarchy');
  this.tree=node('div','dock-tree');this.recentView=node('div','dock-recent');
  explorer.prepend(this.search,this.tree,this.recentView);this.search.oninput=()=>this.selection(true);
  const library=node('details','dock-library'),summary=node('summary','','Functional groups');library.append(summary,q('.library'));explorer.append(library);
  view('chat',chat);chat.querySelector('h3').textContent='Meta CLI';
  const context=node('div','dock-chat-context');context.id='dock-chat-context';chat.prepend(context);
  view('console',node('div','dock-console','<pre id="dock-console-output" aria-label="Application events"></pre><form id="dock-console-form"><span>&gt;</span><input id="dock-console-input" placeholder="/help · /inspect name · /refresh" aria-label="Console command"><button>↵</button></form>'));
  const stage=node('div','dock-stage');stage.id='dock-stage';stage.innerHTML='<div id="dock-root"></div><div id="float-layer"></div>';
  parking.append(...Object.values(views));
  main.append(stage,parking);
  const indicator=node('div','','<span></span>');indicator.id='drop-indicator';indicator.hidden=true;document.body.append(indicator);
  const dialog=node('dialog','dock-move-dialog','<form method="dialog"><h2>Move panel</h2><p id="move-panel-name"></p><label>Destination<select id="move-destination"></select></label><label>Placement<select id="move-placement"><option value="center">Group as tab</option><option value="left">Dock left</option><option value="right">Dock right</option><option value="top">Dock above</option><option value="bottom">Dock below</option></select></label><div class="dialog-actions"><button value="cancel">Cancel</button><button id="apply-move" type="button">Move</button><button id="float-panel" type="button">Float</button></div></form>');
  dialog.id='move-dialog';document.body.append(dialog);
  const status=node('span');status.id='dock-status';status.setAttribute('role','status');q('footer').prepend(status);
  this.ui=new DepthDock(views,{changed:()=>this.changed()});
  this.sourceObserver=new MutationObserver(()=>{if(source.open)this.ui.show('source');else if(this.ui.visible('source'))this.ui.show('hierarchy');});
  this.sourceObserver.observe(source,{attributes:true,attributeFilter:['open']});
  this.consoleObserver=new MutationObserver(()=>this.log(q('#status').textContent));
  this.consoleObserver.observe(q('#status'),{childList:true,subtree:true,characterData:true});
  q('#dock-console-form').onsubmit=e=>{e.preventDefault();const input=q('#dock-console-input'),command=input.value.trim();if(!command)return;input.value='';this.command(command);};
  q('#preview-expand').onclick=()=>this.ui.maximize('preview');
  q('#assembly-focus').onclick=()=>this.ui.maximize('modules');
  window.depthDock=this.ui;
 }
 changed(){
  if(this.ui){const state=this.ui.getState(),owner=DepthDockModel.owner(state,'details'),expanded=state.maximized===owner?.id;document.querySelector('#evidence-expand').setAttribute('aria-pressed',String(expanded));document.querySelector('#evidence-expand').textContent=expanded?'Restore':'Expand';}
  if(this.ui?.visible('source'))document.querySelector('#source-dock').open=true;
  if(this.p.screen==='feature'||this.p.screen==='relations')(window.requestAnimationFrame||setTimeout)(()=>{const r=document.querySelector('#assembly-viewport').getBoundingClientRect();if(r.width>0&&r.height>0)this.p.h.board.fit();});
  this.p.scheduleLines();
 }
 log(message){if(!message||message===this.lastLog)return;this.lastLog=message;const output=document.querySelector('#dock-console-output');const lines=output.textContent.split('\n').filter(Boolean);lines.push(new Date().toLocaleTimeString('en-GB')+'  '+message);output.textContent=lines.slice(-100).join('\n');output.scrollTop=output.scrollHeight;}
 command(command){
  if(command.startsWith('/preview')){window.depthRuntime?.command(command).catch(e=>this.log(e.message));return;}
  const output=document.querySelector('#dock-console-output');if(command==='/clear'){output.textContent='';return;}
  this.log('> '+command);
  if(command==='/help'){this.log('/preview run | connect [URL] | stop | reload | inspect | status · /inspect <name> · /refresh · /clear · /layout reset. Meta CLI shares this project and runtime selection.');return;}
  if(command==='/layout reset'){this.ui.reset();return;}
  if(command==='/refresh'){document.querySelector('#refresh').click();return;}
  if(command.startsWith('/inspect ')){
   const query=command.slice(9).trim().toLowerCase(),hits=this.p.cards().filter(c=>c.name.toLowerCase()===query||c.id===query);
   if(hits.length===1)this.p.h.run(()=>this.p.h.openComposition(hits[0].id));
   else this.log(hits.length?'More than one source member has that name; select it in Hierarchy.':'No source member found.');
   return;
  }
  this.log('Unknown application command. Use /help or ask Meta in its panel.');
 }
 show(panel){this.ui.show(panel);}
 screen(screen){
  this.ui.show('modules');
  if(['split','integrate','assets','review','history','relations'].includes(screen)){
   this.p.workspace.showEvidence('why');this.ui.show('details');
  }
  document.querySelector('#evidence-why-tab').textContent=['feature','map','understand'].includes(screen)?'Why this design':'Details';
 }
 selection(force=false){
  if(!this.s.graph)return;
  const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const cards=this.p.cards(),selected=this.p.card(),query=(this.search.value||document.querySelector('#search').value).trim().toLowerCase(),stamp=this.s.graph.projectId+':'+this.s.graph.revision+':'+query;
  if(force||stamp!==this.stamp){
   this.stamp=stamp;this.recent=this.recent.filter(id=>cards.some(c=>c.id===id));const parents=new Map();
   for(const r of this.s.graph.relations)if(r.kind==='contains'&&!parents.has(r.to))parents.set(r.to,r.from);
   const files=new Map();for(const card of cards){const path=card.anchors[0]?.path||'Other';if(!files.has(path))files.set(path,[]);files.get(path).push(card);}
   this.tree.innerHTML=[...files].sort(([a],[b])=>a.localeCompare(b)).map(([path,entries])=>{
    const visible=entries.filter(c=>(c.name+' '+path+' '+c.kind).toLowerCase().includes(query));
    if(!visible.length)return '';
    const entryIds=new Set(visible.map(c=>c.id)),draw=(c,seen=new Set())=>{
     if(seen.has(c.id))return '';const next=new Set(seen);next.add(c.id);
     const children=visible.filter(v=>parents.get(v.id)===c.id);
     const button='<button data-root="'+esc(c.id)+'" data-tree-id="'+esc(c.id)+'" title="'+esc(c.name+' · '+c.kind)+'"><span class="tree-role">'+esc(c.kind==='Method'?'ƒ':c.kind==='NamedType'?'◇':c.kind==='Image'?'▧':'▱')+'</span><span>'+esc(c.name)+'</span></button>';
     return children.length?'<details open><summary>'+button+'</summary><div class="tree-members">'+children.map(x=>draw(x,next)).join('')+'</div></details>':button;
    };
    return '<details class="tree-file" '+(query||selected?.anchors.some(a=>a.path===path)?'open':'')+'><summary>'+esc(path)+'</summary>'+visible.filter(c=>!entryIds.has(parents.get(c.id))).map(c=>draw(c)).join('')+'</details>';
   }).join('')||'<p class="muted">No matching declarations.</p>';
  }
  for(const b of this.tree.querySelectorAll('[data-tree-id]')){const active=b.dataset.treeId===this.s.entity;b.classList.toggle('selected',active);b.setAttribute('aria-current',String(active));if(active)for(let parent=b.parentElement;parent&&parent!==this.tree;parent=parent.parentElement)if(parent.tagName==='DETAILS')parent.open=true;}
  if(selected){this.recent=[selected.id,...this.recent.filter(id=>id!==selected.id)].slice(0,6);}
  this.recentView.innerHTML='<small>Recent modules</small>'+this.recent.map(id=>'<button data-root="'+esc(id)+'">'+esc(this.p.card(id)?.name||id)+'</button>').join('');
  document.querySelector('#dock-chat-context').textContent=selected?'Context: '+selected.name+' · '+(selected.anchors[0]?.path||''):'Select a module for Meta context';
 }
};

