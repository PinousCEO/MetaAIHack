'use strict';
// Static preview/source links. Containment is not a dependency; view-owner must
// never turn a shared screen into "every element is related".
(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.DepthPreviewLinks=api;})(globalThis,function(){
 function index(graph,preview){
  const entities=new Map(graph.entities.map(e=>[e.id,e])),parents=new Map(),children=new Map(),incoming=new Map();
  for(const r of graph.relations){
   if(r.kind==='contains'){if(!parents.has(r.to))parents.set(r.to,[]);parents.get(r.to).push(r.from);if(!children.has(r.from))children.set(r.from,[]);children.get(r.from).push(r.to);continue;}
   if(r.kind==='view-owner'||entities.get(r.from)?.kind==='View')continue;
   if(!incoming.has(r.to))incoming.set(r.to,[]);incoming.get(r.to).push(r);
  }
  const bindings=new Map((preview?.bindings||[]).map(b=>[b.id,b]));
  function related(id){
   if(!entities.has(id)||!preview)return {id,matches:[],scope:'unavailable'};
   if(id===preview.viewId)return {id,matches:[...bindings.values()].map(b=>({...b,via:[],screenId:preview.viewId})),scope:'screen'};
   if(bindings.has(id))return {id,matches:[{...bindings.get(id),via:[],screenId:preview.viewId}],scope:'element'};
   const found=new Map(),queue=[],visited=new Set(),owned=new Set([id]),owners=[id];
   if(entities.get(id).kind==='NamedType')while(owners.length)for(const child of children.get(owners.shift())||[])if(!owned.has(child)){owned.add(child);owners.push(child);}
   for(const member of owned){queue.push({id:member,via:[]});visited.add(member);}
   for(let i=0;i<queue.length;i++){
    const next=queue[i];
    for(const r of incoming.get(next.id)||[]){
     const via=[r.id,...next.via];
     if(bindings.has(r.from)){if(!found.has(r.from))found.set(r.from,{...bindings.get(r.from),via,screenId:preview.viewId});continue;}
     if(entities.get(r.from)?.kind==='ViewElement'||visited.has(r.from))continue;
     visited.add(r.from);queue.push({id:r.from,via});
    }
   }
   return {id,matches:[...found.values()],scope:'source'};
  }
  return {related,bindings,parents};
 }
 return {index};
});
if(typeof window!=='undefined')window.DepthPreviewFocus=class {
 constructor(product){
  this.p=product;this.enabled=false;this.key=null;this.result={matches:[]};
  const bar=document.createElement('div');bar.className='preview-focus-bar';bar.innerHTML='<span id="preview-focus-summary" role="status">Select a preview element or source module</span><button id="preview-show-all" type="button">Show all</button>';
  document.querySelector('.preview-pane').append(bar);
  this.matchList=document.createElement('nav');this.matchList.className='preview-match-list';this.matchList.setAttribute('aria-label','Related preview elements');document.querySelector('.preview-pane').append(this.matchList);
  document.querySelector('#preview-show-all').onclick=()=>this.clear();
  document.querySelector('#preview').addEventListener('click',event=>{
   if(window.depthRuntime)return;
   if(!this.p.s.view?.preview)return;
   const element=event.target.closest('[data-preview-id]'),id=element?.dataset.previewId||this.p.s.view.preview.viewId;
   event.preventDefault();event.stopPropagation();this.enabled=true;this.p.s.previewRoot=id;
   this.p.h.inspectPreview(id);
  });
  document.querySelector('#preview').addEventListener('keydown',event=>{
   if(window.depthRuntime)return;
   if((event.key==='Enter'||event.key===' ')&&event.target.matches('.preview-sheet')){
    event.preventDefault();this.p.s.previewRoot=this.p.s.view.preview.viewId;this.enabled=true;this.p.h.inspectPreview(this.p.s.previewRoot);
   }
  });
  document.addEventListener('keydown',event=>{if(event.key==='Escape'&&!document.querySelector('dialog[open]'))this.clear();});
 }
 clear(){this.enabled=false;this.update(false);}
 update(activate=true){
  if(window.depthRuntime){window.depthRuntime.highlight(activate?this.p.s.entity:null);this.p.workspace.dock?.selection();return;}
  const s=this.p.s;if(activate&&s.ready)this.enabled=true;
  const preview=document.querySelector('#preview'),p=s.view?.preview;
  const key=s.graph?.projectId+':'+s.graph?.revision;
  if(key!==this.key){this.key=key;this.links=s.graph?DepthPreviewLinks.index(s.graph,p):null;}
  this.result=this.links?.related(s.entity)||{matches:[],scope:'unavailable'};
  const matches=new Map(this.result.matches.map(b=>[b.id,b])),isolating=!!(p&&s.entity&&this.enabled&&this.result.scope!=='screen');
  preview.classList.toggle('preview-isolating',isolating);
  for(const element of preview.querySelectorAll('[data-preview-id]')){
   const related=matches.get(element.dataset.previewId);
   element.classList.toggle('preview-related',!!related&&this.enabled);
   element.classList.toggle('preview-muted',isolating&&!related);
   element.classList.toggle('selected',element.dataset.previewId===s.entity);
   element.dataset.previewState=isolating?(related?'related':'muted'):'normal';
   element.title=related?(related.via.length?'Related through indexed source dependencies':'Source-declared preview element'):'Select to inspect its source';
  }
  const card=this.p.card(),count=this.result.matches.length;
  const selectionKey=key+':'+s.entity,changed=this.lastSelection!==selectionKey;this.lastSelection=selectionKey;
  if(activate&&changed&&s.ready&&card&&card.kind!=='ViewElement')this.p.workspace.dock?.show('preview');
  const summary=document.querySelector('#preview-focus-summary');
  summary.textContent=!p?'No preview adapter for this project':!this.enabled?'All preview elements visible':this.result.scope==='screen'?p.title+' · Whole screen':count?p.title+' · '+card?.name+' · '+count+' related element'+(count===1?'':'s'):p.title+' · No declared preview relationship for '+(card?.name||'this module');
  document.querySelector('#preview-show-all').disabled=!isolating;
  this.matchList.replaceChildren();this.matchList.hidden=!isolating||!count;
  for(const match of isolating?this.result.matches:[]){
   const button=document.createElement('button'),name=this.p.card(match.id)?.name||match.key;
   button.type='button';button.dataset.previewJump=match.id;button.textContent=name;
   const path=match.via.map(id=>s.graph.relations.find(r=>r.id===id)).filter(Boolean);
   button.title=path.length?'Static source path: '+[path[0].from,...path.map(r=>r.to)].map(id=>this.p.card(id)?.name||id).join(' → '):'Source-declared preview element';
   button.onclick=()=>{const target=[...preview.querySelectorAll('[data-preview-id]')].find(e=>e.dataset.previewId===match.id);target?.scrollIntoView?.({block:'nearest',behavior:document.body.classList.contains('reduced-motion')?'instant':'auto'});target?.focus({preventScroll:true});};
   this.matchList.append(button);
  }
  document.querySelector('#preview-context-name').textContent=s.previewRoot?this.p.card(s.previewRoot)?.name||p?.title:p?.title||'Select an element in the preview';
  this.p.workspace.dock?.selection();
 }
 snapshot(){return {enabled:this.enabled,selected:this.p.s.entity,matches:this.result.matches.map(b=>({id:b.id,key:b.key,screenId:b.screenId,relationIds:b.via})),scope:this.result.scope};}
};

