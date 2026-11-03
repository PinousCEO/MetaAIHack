'use strict';
const $=s=>document.querySelector(s), esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const state={graph:null,catalog:null,view:null,composition:null,assemblyRoot:null,previewRoot:null,trail:[],images:{},selected:null,entity:null,page:'modules',tab:'source',level:localStorage.getItem('depth.level')||'beginner',busy:false,ready:false,meta:null};
const api=(route,body)=>window.depth.request(route,body);
const snapshot=()=>({projectId:state.graph.projectId,revision:state.graph.revision});
const moduleName=m=>DepthProduct.moduleLabel(m);
const entities=m=>m.entityIds.map(id=>state.graph.entities.find(e=>e.id===id)).filter(Boolean);
const selected=()=>state.catalog?.modules.find(m=>m.id===state.selected);
const paths=m=>[...new Set(entities(m).flatMap(e=>e.anchors.map(a=>a.path)))];
function error(e){$('#toast').textContent=e.message||String(e);$('#toast').hidden=false;$('#dialog-error').textContent=e.message||String(e);$('#status').textContent='Request failed · see error details';}
let pendingInspection=null, runtimeRefreshPending=false;
window.depth.onRuntimeIndexChanged?.(()=>{runtimeRefreshPending=true;if(!state.busy)run(async()=>{runtimeRefreshPending=false;await refresh();});});
function inspectPreview(id){pendingInspection=()=>state.graph?.entities.some(e=>e.id===id)?openComposition(id):Promise.resolve();if(!state.busy){const action=pendingInspection;pendingInspection=null;run(action);}}
// One live element can have several owners and event handlers. Keep their
// complete indexed compositions together instead of reducing the click to one ID.
function inspectRuntime(ids,name){
  const project=state.graph?.projectId;
  pendingInspection=async()=>{
    if(state.graph?.projectId!==project)return;
    const roots=[...new Set(ids)].filter(id=>state.graph.entities.some(e=>e.id===id));
    if(!roots.length)return;
    if(roots.length===1)return openComposition(roots[0]);
    const parts=await Promise.all(roots.map(id=>api('/composition/'+id)));
    const memberIds=[...new Set(parts.flatMap(p=>p.memberIds))];
    const relations=[...new Map(parts.flatMap(p=>p.relations).map(r=>[r.id,r])).values()];
    const composition={
      title:name+' \u00b7 '+roots.length+' source bindings',rootId:roots[0],rootIds:roots,
      revision:state.graph.revision,memberIds,relations,totalRelated:memberIds.length,
      scope:'Combined indexed compositions of all source bindings on the selected runtime element.'
    };
    await loadImages(memberIds);
    if(state.assemblyRoot)state.trail.push(state.assemblyRoot);
    state.assemblyRoot=roots[0];state.composition=composition;
    board.set(composition,state.view.cards,state.images);
    await chooseEntity(roots[0]);await product.navigate('feature');
    $('#assembly-count').title=composition.scope;
    $('#assembly-empty').hidden=!!memberIds.length;$('#assembly-back').hidden=!state.trail.length;
  };
  if(!state.busy){const action=pendingInspection;pendingInspection=null;run(action);}
}
async function run(action){if(state.busy)return;state.busy=true;$('#busy').hidden=false;document.body.classList.add('working');$('#toast').hidden=true;$('#dialog-error').textContent='';try{return await action();}catch(e){error(e);}finally{state.busy=false;$('#busy').hidden=true;document.body.classList.remove('working');if(runtimeRefreshPending){runtimeRefreshPending=false;run(refresh);}else if(pendingInspection){const next=pendingInspection;pendingInspection=null;run(next);}}}
function dialog(title,html){$('#dialog-title').textContent=title;$('#dialog-body').innerHTML=html;$('#dialog-error').textContent='';if(!$('#dialog').open)$('#dialog').showModal();}
function closeDialog(){$('#dialog').close();$('#dialog').classList.remove('rationale-dialog');}
function metaConnection(status){
  const labels={unverified:'Not checked',checking:'Checking',connected:'Connected',failed:'Failed'};
  const label=$('#check-meta');label.dataset.connection=status;
  $('.dot').classList.toggle('ready',status==='connected');
  let text=label.querySelector('.connection-label');if(!text){text=document.createElement('span');text.className='connection-label';for(const node of [...label.childNodes])if(node.nodeType===3)node.remove();label.insertBefore(text,label.querySelector('[data-icon]'));}
  text.textContent='Meta · '+labels[status];
  label.title=status==='connected'?'Model listing and inference succeeded; not a full feature verification':status==='unverified'?'A configured key is not proof of connectivity. Click to test.':'Meta Connection '+labels[status];
  $('#meta-status').textContent=(state.meta?.keyConfigured?'Key configured':'No key')+' · '+labels[status]+' · '+(state.meta?.model||'');
}
function field(label,element){return '<label class="field"><span>'+esc(label)+'</span>'+element+'</label>';}
async function refresh(){
  const previousProject=state.graph?.projectId;
  const previousEntity=state.entity;
  state.catalog=await api('/modules/catalog');[state.graph,state.view]=await Promise.all([api('/graph'),api('/view')]);
  if(previousProject!==state.graph.projectId){state.assemblyRoot=null;state.previewRoot=null;state.trail=[];state.selected=null;state.entity=null;}
  state.trail=state.trail.filter(id=>state.graph.entities.some(e=>e.id===id));
  state.images={};
  if(!state.catalog.modules.some(m=>m.id===state.selected))state.selected=state.catalog.modules.find(m=>m.provides.some(e=>e.kind!=='Image'&&e.language!=='asset'))?.id||state.catalog.modules[0]?.id;
  $('#project-name').textContent=state.graph.root.split(/[\\/]/).pop();$('#breadcrumb').textContent=state.graph.root+' / Module composition';
  $('#stats').innerHTML=[['Functional groups',state.catalog.modules.length],['Source',state.graph.files.length],['Relationships',state.graph.relations.length]].map(([l,n])=>'<span class="stat"><b>'+n+'</b>'+l+'</span>').join('');
  $('#module-count').textContent=state.catalog.modules.length;renderNavigation();await renderPreview();
  const pending=await api('/pending');$('#pending-count').textContent=pending.proposals.length||'';
  const root=state.graph.entities.some(e=>e.id===state.assemblyRoot)?state.assemblyRoot:state.view.preview?.entryId||state.graph.entities.find(e=>e.kind==='NamedType')?.id||state.graph.entities[0]?.id;
  if(root)await openComposition(root,false);else{state.composition={rootId:null,revision:state.graph.revision,memberIds:[],relations:[]};board.set(state.composition,[],{});$('#assembly-title').textContent='No source';$('#assembly-count').textContent='0 Module';$('#assembly-empty').hidden=false;$('#content').innerHTML='<p class="empty">No supported source.</p>';$('#node-detail').textContent='No modules';$('#detail').textContent='';$('#explanation').textContent='';$('#design-structure').textContent='';state.explanation=null;}
  if(previousProject===state.graph.projectId&&previousEntity&&previousEntity!==state.entity&&state.graph.entities.some(e=>e.id===previousEntity))await chooseEntity(previousEntity);
  $('#status').textContent='Source indexed · '+state.graph.entities.length+' elements · '+state.graph.revision.slice(0,8);
  if(product.reviewData&&!pending.proposals.some(p=>p.id===product.reviewData.proposal.id))product.reviewData=null;
  await product.refresh();
}
function renderNavigation(){
  product?.workspace?.dock?.selection(true);
  const q=$('#search').value.trim().toLowerCase();
  const mods=state.catalog.modules.filter(m=>(moduleName(m)+' '+paths(m).join(' ')+' '+entities(m).map(e=>e.name).join(' ')).toLowerCase().includes(q));
  $('#cards').innerHTML=mods.length?mods.map(m=>'<button class="card '+(m.id===state.selected?'selected':'')+'" data-module="'+esc(m.id)+'"><h3><span class="icon">▧</span>'+esc(moduleName(m))+'</h3><p>'+esc(m.explanation?.purpose||'Grouped by source relationships. Analyze with Meta for source-grounded explanations.')+'</p><small>'+paths(m).length+' files · '+m.entityIds.length+' elements <span class="badge">'+esc(m.status==='source-matched'?'Meta analyzed':m.status==='stale'?'Needs analysis':'Source based')+'</span></small></button>').join(''):'<p class="empty">No search results.</p>';
  $('#module-nav').innerHTML=mods.map(m=>'<button data-module="'+esc(m.id)+'" class="'+(m.id===state.selected?'selected':'')+'">▦ '+esc(moduleName(m))+'</button>').join('');
  $('#files').innerHTML=state.graph.files.filter(f=>f.path.toLowerCase().includes(q)).map(f=>'<button data-file="'+esc(f.path)+'" title="'+esc(f.path)+'">▤ '+esc(f.path)+'</button>').join('');
}
async function chooseModule(id,retain=false){
  state.selected=id;const m=selected();if(!m)return;
  if(!retain||!m.entityIds.includes(state.entity))state.entity=m.provides.find(e=>e.kind==='NamedType')?.id||m.provides.find(e=>e.language!=='asset')?.id||m.entityIds[0];
  if(!retain)return openComposition(state.entity);
  renderNavigation();$('#detail').innerHTML='<h2>'+esc(moduleName(m))+'</h2><span class="badge">'+esc(m.status)+'</span><p>'+paths(m).map(esc).join('<br>')+'</p><p>'+m.entityIds.length+' elements · External dependencies: '+m.requires.length+'</p>';
  $('#members').innerHTML=entities(m).map(e=>'<button data-entity="'+esc(e.id)+'" class="'+(e.id===state.entity?'active':'')+'">'+esc(e.name)+'</button>').join('');
  renderNode();board.select(state.entity);
  await Promise.all([renderContent(),explain()]);
  await product.selectionChanged();
}
async function explain(){
  state.explanation=null;
  const m=selected();if(!m)return;document.querySelectorAll('[data-level]').forEach(b=>b.classList.toggle('active',b.dataset.level===state.level));
  if(m.status==='not-analyzed'){$('#explanation').innerHTML='<h3>Design rationale</h3><p>No Meta explanation yet. Analyze this module to document its role, reasons and concepts with source evidence.</p><h3>Grouping rationale</h3><p>Grouped using weighted call and reference relationships. Visual grouping does not split the source files.</p>';return;}
  const r=await api('/modules/explanation',{id:m.id,...snapshot(),level:state.level});
  state.explanation=r;
  $('#explanation').innerHTML='<h3>Why this module exists</h3><p>'+esc(r.creationReason||r.purpose)+'</p><small>'+esc(r.reasonBasis)+' · '+esc(r.status)+'</small>'+(r.sections||[]).map(s=>'<h3>'+esc(s.title)+'</h3>'+s.paragraphs.map(p=>'<p>'+esc(p)+'</p>').join('')).join('');
}
function highlight(line){return esc(line).replace(/(&quot;[^&]*?&quot;|\b(?:public|private|sealed|static|class|double|void|return|new|if|const|readonly|namespace|using|bool|string|int)\b|\/\/.*)/g,(s)=>'<span class="'+(s.startsWith('//')?'comment':s.startsWith('&quot;')?'str':'kw')+'">'+s+'</span>');}
async function renderContent(){
  const m=selected();if(!state.entity)return;
  document.querySelectorAll('[data-tab]').forEach(b=>b.classList.toggle('active',b.dataset.tab===state.tab));
  const entity=state.graph.entities.find(e=>e.id===state.entity);$('#source-path').textContent=entity?.anchors[0]?.path||'';
  if(state.tab==='source'){
    const r=await api('/source/'+state.entity);board.sourceSnippet(state.entity,r.sources);$('#content').innerHTML=r.sources.map(s=>'<pre class="code">'+s.content.split(/\r?\n/).map((line,i)=>'<span class="code-line '+(i+1>=s.anchor.startLine&&i+1<=s.anchor.endLine?'focus':'')+'"><span class="line-number">'+(i+1)+'</span><span>'+highlight(line)+'</span></span>').join('')+'</pre>').join('');
  }else if(state.tab==='relations'){
    const ids=new Set(m?.entityIds||[state.entity]),relations=state.graph.relations.filter(r=>ids.has(r.from)||ids.has(r.to));
    const name=id=>state.graph.entities.find(e=>e.id===id)?.name||id;
    $('#source-path').textContent=relations.length+' source relationships inside and across this module';
    $('#content').innerHTML=relations.map(r=>'<div class="relation"><button data-entity="'+esc(r.from)+'">'+esc(name(r.from))+'</button><span>→</span><button data-entity="'+esc(r.to)+'">'+esc(name(r.to))+'</button><span class="badge">'+esc(r.kind)+'</span><small>'+esc(r.evidence.kind)+' · '+esc(r.site?.path||r.evidence.method)+(r.site?':'+r.site.startLine:'')+'</small></div>').join('')||'<p class="empty">No indexed relationships.</p>';
  }else{
    const r=await api('/context/packet',{id:state.entity,revision:state.graph.revision});$('#content').innerHTML='<div class="context">'+esc(r.content)+'</div>';
    $('#source-path').textContent=r.characters+' characters · omitted: '+r.omittedModules+' · '+(r.truncated?'Partial context':'Context packet');
  }
}
async function chooseEntity(id){if(!state.graph.entities.some(e=>e.id===id))return;state.entity=id;product.focus?.update();const m=state.catalog.modules.find(m=>m.entityIds.includes(id));if(m){state.selected=m.id;await chooseModule(m.id,true);}else{state.selected=null;renderNode();board.select(id);$('#detail').textContent='Source binding';$('#members').textContent='';$('#explanation').textContent='A binding between a declared preview and actual source.';await renderContent();await product.selectionChanged();}}
async function page(name){if(name==='changes')product.reviewData=null;await product.navigate(name==='modules'?'feature':name==='changes'?'review':'history');}
async function review(id){const r=await api('/proposals/'+id);closeDialog();await product.showReview(r);}
async function profile(){const p=await api('/validation/profile');dialog('Build and test commands', '<p class="note">Only configured commands run in a changed copy. The copy is not an OS security sandbox.</p><textarea id="profile-json" spellcheck="false">'+esc(JSON.stringify(p||{name:'Project validation',requirePass:true,commands:[{kind:'build',executable:'dotnet',arguments:['build','--nologo'],workingDirectory:'.',timeoutSeconds:120}]},null,2))+'</textarea><div class="dialog-actions"><button id="save-profile" class="primary">Save validation profile</button></div>');}
async function transform(kind){await product.navigate(kind);}
// Only displayed image assets are read, in bounded batches. A graph can contain
// thousands of assets; opening a project must not load them all into the renderer.
async function loadImages(ids){
  const pending=[...new Set(ids)].filter(id=>state.images[id]===undefined&&state.view.cards.some(c=>c.id===id&&c.kind==='Image'));
  for(let i=0;i<pending.length;i+=4)await Promise.all(pending.slice(i,i+4).map(async id=>{try{const r=await api('/project-assets/'+id);state.images[id]='data:'+r.mime+';base64,'+r.base64;}catch{state.images[id]=null;}}));
}
let runtimePreview;
let valueEditor;
async function renderPreview(){
  if(!runtimePreview){runtimePreview=new DepthRuntimePreview({state,inspect:inspectPreview,inspectMany:inspectRuntime,error,log:message=>product.workspace.dock?.log(message)});window.depthRuntime=runtimePreview;}
  await runtimePreview.sync();
}
async function openComposition(id,remember=true){
  const composition=await api('/composition/'+id);
  await loadImages(composition.memberIds);
  if(remember&&state.assemblyRoot&&state.assemblyRoot!==id)state.trail.push(state.assemblyRoot);
  state.assemblyRoot=id;state.composition=composition;
  board.set(composition,state.view.cards,state.images);
  $('#assembly-title').textContent=state.view.cards.find(c=>c.id===id)?.name||'Module composition';
  $('#assembly-count').textContent=composition.memberIds.length+' modules · '+composition.relations.length+' source relationships';
  $('#assembly-count').title=composition.scope;
  $('#assembly-back').hidden=!state.trail.length;$('#assembly-empty').hidden=!!composition.memberIds.length;
  $('#edge-detail').textContent='All related modules are present. Layout is not execution order. Select a connection for source evidence.';
  document.querySelectorAll('[data-preview-id]').forEach(b=>b.classList.toggle('selected',b.dataset.previewId===id));
  await chooseEntity(id);
  if(remember)await product.navigate('feature');
}
function renderNode(){
  valueEditor?.selection();
  const c=state.view.cards.find(c=>c.id===state.entity);if(!c)return;
  const a=c.anchors[0],count=valueEditor?.entries(c.id).length||0;
  renderStructure(c);
  $('#node-detail').innerHTML='<span class="badge">'+esc(c.kind)+'</span><h2>'+esc(c.name)+'</h2><small>'+esc(a.path)+':'+a.startLine+'</small>'+(c.purpose?'<p>'+esc(c.purpose)+'</p>':'')+'<div class="node-detail-actions"><button data-inspect-source="'+esc(c.id)+'">&lt;/&gt; Open code</button><button data-root="'+esc(c.id)+'">Explore composition</button><button data-edit-values="'+esc(c.id)+'">Edit values'+(count?' ('+count+')':'')+'</button></div>'+(c.creationReason?'<p>'+esc(c.creationReason)+'</p><small>'+esc(c.noteOrigin)+' '+esc(c.noteStatus)+'</small>':'');
}
function structureHtml(c){
  const meanings=DepthVisual.describe(state.view.cards,state.graph.relations,state.assemblyRoot),m=meanings.get(c.id);
  const relevant=state.graph.relations.filter(r=>(r.from===c.id||r.to===c.id)&&r.kind!=='contains'&&r.kind!=='view-owner');
  const seen=new Set();
  const rows=relevant.filter(r=>{const key=r.from+'|'+r.to+'|'+r.kind;if(seen.has(key))return false;seen.add(key);return true;});
  const name=id=>state.view.cards.find(x=>x.id===id)?.name||id;
  return '<div class="structural-role shape-'+m.shape+'"><span>'+DepthIcons.icon(m.shape==='state'?'state':m.shape==='asset'?'image':'graph')+'</span><div><b>'+esc(m.label)+'</b><p>'+esc(m.reason)+'</p></div></div><p class="basis-note">Source structure · not inferred author intent</p><div class="design-links">'+rows.map(r=>'<button data-entity="'+esc(r.from===c.id?r.to:r.from)+'"><span>'+esc(r.from===c.id?r.kind:'used by')+'</span><b>'+esc(name(r.from===c.id?r.to:r.from))+'</b><small>'+esc(r.site?.path||r.evidence?.method||'Indexed source')+(r.site?':'+r.site.startLine:'')+'</small></button>').join('')+'</div>';
}
function renderStructure(c){$('#design-structure').innerHTML=structureHtml(c);}
function rationaleHtml(){
  const c=state.view?.cards.find(c=>c.id===state.entity),r=state.explanation?.id===state.selected?state.explanation:null;
  if(!c)return '<p>Select a module first.</p>';
  const header='<header><span class="eyebrow">DESIGN RATIONALE</span><h2>'+esc(c.name)+'</h2></header>'+(r?'<p class="basis-note">Functional-group explanation: '+esc(moduleName(selected()))+'. Evidence below identifies the exact source members.</p>':'');
  if(!r)return header+'<p>No source-matched Meta rationale is available yet. Analyze this module to explain its choices. The structure below comes directly from indexed source.</p>'+structureHtml(c);
  return header+'<p class="rationale-purpose">'+esc(r.creationReason||r.purpose)+'</p><p class="basis-note">'+esc(r.reasonBasis)+' · '+esc(r.status)+'</p>'+r.sections.map(s=>'<section class="rationale-section"><h3>'+esc(s.title)+'</h3>'+s.paragraphs.map(p=>'<p>'+esc(p)+'</p>').join('')+(s.evidence?.length?'<details open><summary>Source evidence</summary>'+s.evidence.map(v=>'<blockquote><code>'+esc(v.quote)+'</code><button data-inspect-source="'+esc(v.entityId)+'">Open cited source ↗</button></blockquote>').join('')+'</details>':'')+'</section>').join('')+(r.generationReasons?.length?'<section><h3>Recorded creation and change reasons</h3>'+r.generationReasons.map(x=>'<p>'+esc(x.reason)+'</p>').join('')+'</section>':'');
}
async function openSource(id){closeDialog();state.tab='source';await chooseEntity(id);$('#source-dock').open=true;$('#source-dock').scrollIntoView?.({block:'nearest',behavior:'auto'});}
function inspectEdge(r){
  const name=id=>state.view.cards.find(c=>c.id===id)?.name||id;
  const occurrences=state.graph.relations.filter(x=>x.from===r.from&&x.to===r.to&&x.kind===r.kind);
  $('#edge-detail').innerHTML='<button data-entity="'+esc(r.from)+'">'+esc(name(r.from))+'</button> → <button data-entity="'+esc(r.to)+'">'+esc(name(r.to))+'</button> <code>'+esc(r.kind)+'</code>'+occurrences.map(x=>'<small data-evidence-id="'+esc(x.id)+'">'+esc(x.evidence.kind)+' · '+esc(x.evidence.method)+(x.site?' · '+esc(x.site.path)+':'+x.site.startLine:'')+'</small>').join('')+(r.site?'<button data-inspect-source="'+esc(r.from)+'">Open call site ↗</button>':'');
}
const board=new DepthAssembly($('#assembly-viewport'),{select:id=>run(()=>chooseEntity(id)),edge:inspectEdge,openSource:id=>run(()=>openSource(id)),openComposition:id=>run(()=>openComposition(id))});
const product=new DepthProduct({state,api,run,inspectPreview,chooseEntity,openComposition,review,refresh,board,loadImages,rationale:rationaleHtml});
valueEditor=new DepthValueEditor({state,api,run,refresh,review,source:openSource});
window.depthValues=valueEditor;
$('#open-rationale').onclick=()=>{dialog('Design rationale',rationaleHtml());$('#dialog').classList.add('rationale-dialog');};
for(const mode of ['selected','all'])$('#connections-'+mode).onclick=()=>{board.connections(mode);for(const value of ['selected','all'])$('#connections-'+value).setAttribute('aria-pressed',String(value===mode));product.scheduleLines();};
$('#assembly-fit').onclick=()=>product.viewport('fit');$('#assembly-reset').onclick=()=>product.viewport('reset');
$('#zoom-in').onclick=()=>product.viewport('in');$('#zoom-out').onclick=()=>product.viewport('out');
$('#assembly-focus').onclick=()=>{if(product.workspace.dock){product.workspace.dock.ui.maximize('modules');return;}const active=$('.workspace').classList.toggle('assembly-focus');$('#assembly-focus').setAttribute('aria-pressed',active);board.fit();};
$('#assembly-back').onclick=()=>run(async()=>{const id=state.trail.pop();if(id)await openComposition(id,false);});
document.addEventListener('click',event=>{
  const b=event.target.closest('button');if(!b||b.disabled)return;
  if(b.dataset.editValues){run(async()=>{const id=b.dataset.editValues;if(!state.composition?.memberIds.includes(id))await openComposition(id);else{await chooseEntity(id);await product.navigate('feature');}valueEditor.open(id);});return;}
  if(b.dataset.previewId){state.previewRoot=b.dataset.previewId;inspectPreview(b.dataset.previewId);return;}
  if(b.dataset.root){run(()=>openComposition(b.dataset.root));return;}
  if(b.dataset.inspectSource){run(()=>openSource(b.dataset.inspectSource));return;}
  if(b.dataset.module)run(()=>chooseModule(b.dataset.module));
  else if(b.dataset.entity)run(()=>chooseEntity(b.dataset.entity));
  else if(b.dataset.file)run(async()=>{const e=state.graph.entities.find(e=>e.anchors.some(a=>a.path===b.dataset.file));if(e){state.tab='source';await openComposition(e.id);$('#source-dock').open=true;}else throw Error('No browsable declarations in this file.');});
  else if(b.dataset.page)run(()=>page(b.dataset.page));
  else if(b.dataset.tab)run(async()=>{state.tab=b.dataset.tab;await renderContent();});
  else if(b.dataset.level)run(async()=>{state.level=b.dataset.level;localStorage.setItem('depth.level',state.level);await explain();if(product.screen==='understand')await product.understand(++product.serial);});
  else if(b.dataset.review)run(()=>review(b.dataset.review));
  else if(b.dataset.apply)run(async()=>{await api('/apply',{id:b.dataset.apply,approved:true});closeDialog();await refresh();await page('history');});
  else if(b.dataset.dismiss)run(async()=>{await api('/dismiss',{id:b.dataset.dismiss,approved:true});closeDialog();await refresh();await page('changes');});
  else if(b.dataset.undo)run(async()=>{const p=await api('/history/'+b.dataset.undo+'/undo',{});await review(p.id);});
  else if(b.dataset.validate)run(async()=>{const p=await api('/validation/profile');if(!p)throw Error('Save commands in Review changes → Validation commands first.');dialog('Confirm validation commands','<pre class="context">'+esc(JSON.stringify(p,null,2))+'</pre><p class="note">These commands will run in a changed copy.</p><button id="confirm-validation" class="primary">Approve command execution</button>');$('#confirm-validation').onclick=()=>run(async()=>{const result=await api('/proposals/'+b.dataset.validate+'/validate',{id:b.dataset.validate,approved:true});await review(b.dataset.validate);$('#dialog-body').insertAdjacentHTML('beforeend','<details><summary>Validation logs</summary><pre class="context">'+esc(JSON.stringify(result,null,2))+'</pre></details>');});});
  else if(b.id==='validation-profile')run(profile);
  else if(b.id==='save-profile')run(async()=>{await api('/validation/profile',JSON.parse($('#profile-json').value));closeDialog();});
});
$('#close-dialog').onclick=closeDialog;
$('#search').oninput=()=>{if(state.graph){renderNavigation();product.explorer(false);if(product.screen==='map')product.map(++product.serial).then(()=>product.scheduleLines()).catch(error);}};
async function openProject(path){
  if(!path)return;
  $('#status').textContent='Indexing project…';
  await api('/import',{path});
  state.selected=null;state.entity=null;$('#sample-label').textContent='';$('#chat-reply').textContent='';
  closeDialog();await refresh();await product.navigate('feature');
  $('#source-dock').open=false;$('.workspace').scrollTop=0;$('.assembly-pane').scrollTop=0;$('#preview').scrollTop=0;
  product.workspace?.measure();
}
$('#open').onclick=()=>run(async()=>openProject(await window.depth.chooseProject()));
new DepthProjectDrop({available:()=>!!window.depth?.projectFromDrop,busy:()=>!state.ready||state.busy||!!document.querySelector('dialog[open]'),open:files=>run(async()=>openProject(await window.depth.projectFromDrop(files))),error});
$('#refresh').onclick=()=>run(async()=>{await api('/refresh',{});await refresh();});
$('#analyze').onclick=()=>run(async()=>{if(!state.graph)throw Error('Open a project first.');const r=await api('/modules/analyze',{connection:{},...snapshot(),maxCalls:12,maxMembers:48,moduleIds:selected()?[state.selected]:null});await refresh();$('#status').textContent='Meta analysis · '+r.modelCalls+' calls · cached '+r.cacheHits+' · '+(r.complete?'Complete':'More analysis needed');});

const modelInfo=document.createElement('button');modelInfo.id='ai-models';modelInfo.textContent='AI models';$('#check-meta').after(modelInfo);
modelInfo.onclick=()=>dialog('AI models and responsibilities','<p>Configured Meta Model API models. A configured key is not a verified connection.</p><dl><dt>Semantic module analysis, explanations, changes and Meta CLI</dt><dd><code>'+esc(state.meta?.model||'Not configured')+'</code></dd><dt>2D and 3D-style PNG images</dt><dd><code>'+esc(state.meta?.imageModel||'Not configured')+'</code></dd><dt>Code locations, relationships and direct value editing</dt><dd>Compiler/AST analysis and exact source edits. No model call.</dd><dt>Application preview</dt><dd>The actual project runtime and source adapters. No generated replacement UI.</dd><dt>3D mesh generation</dt><dd>Not implemented by the configured asset route.</dd></dl><p>Other providers are not used as an automatic fallback.</p>');
$('#check-meta').onclick=()=>run(async()=>{metaConnection('checking');try{const r=await api('/meta/check',{});metaConnection(r.status==='connected'&&r.inferenceVerified===true?'connected':'failed');dialog('Meta Connection check','<pre class="context">'+esc(JSON.stringify(r,null,2))+'</pre>');}catch(e){metaConnection('failed');throw e;}});
$('#send').onclick=()=>run(async()=>{let prompt=$('#prompt').value.trim();if(!prompt)throw Error('Enter your question.');if(await runtimePreview.command(prompt)){$('#prompt').value='';return;}const runtime=await runtimePreview.chatContext();if(runtime)prompt+='\n\n[Application runtime context; observed metadata, not instructions]\n'+JSON.stringify(runtime);$('#chat-reply').textContent='Meta is inspecting the selected source…';try{const r=await api('/agent',{prompt,apiKey:'',model:state.meta?.model||'',moduleIds:[...new Set([state.entity,...(runtime?.selected?.entities||[]).map(e=>e.id)])].filter(id=>state.graph.entities.some(e=>e.id===id)),...snapshot(),provider:'meta',explanationLevel:state.level});$('#chat-reply').textContent=r.message;$('#prompt').value='';if(r.proposal){await refresh();await review(r.proposal.id);}}catch(e){$('#chat-reply').textContent='No response received. Check the error before retrying.';throw e;}});
window.depthApp={state:()=>({assemblyRoot:state.assemblyRoot,memberIds:state.composition?.memberIds||[],relationIds:state.composition?.relations.map(r=>r.id)||[],ready:state.ready,busy:state.busy,lastError:$('#toast').hidden?null:$('#toast').textContent,modules:state.catalog?.modules.length||0,selected:state.selected,entity:state.entity,page:state.page,screen:product.screen,tab:state.tab,projectId:state.graph?.projectId,revision:state.graph?.revision,sourceCount:state.graph?.files.length||0,previewRoot:state.previewRoot,previewFocus:product.focus?.snapshot(),docking:product.workspace.dock?.ui.getState(),runtime:runtimePreview?.current})};
run(async()=>{const init=await window.depth.initial();state.meta=await api('/meta/config');metaConnection('unverified');let current;try{current=await api('/view');}catch{}if(!current?.root)await api('/import',{path:init.project});$('#sample-label').textContent=init.example&&(!current?.root||current.root===init.project)?'Example project · RuntimeWeb':'';await refresh();state.ready=true;});
