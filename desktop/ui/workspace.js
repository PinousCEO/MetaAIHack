'use strict';
// Presentation of indexed evidence. A preview root and an inspected member are independent.
window.DepthWorkspace = class {
 constructor(product) {
  this.p=product;this.serial=0;
  const q=s=>document.querySelector(s);
  q('.top').insertBefore(q('.rail'),q('.global-search'));
  this.dock=new DepthDockWorkbench(product);
  this.measure=()=>this.dock.changed();
  this.evidence='source';
  for(const button of document.querySelectorAll('[data-evidence]')){
   button.onclick=()=>{this.showEvidence(button.dataset.evidence);this.dock.show('details');};
   button.onkeydown=e=>{if(['ArrowLeft','ArrowRight','Home','End'].includes(e.key)){e.preventDefault();const tab=e.key==='Home'?'source':e.key==='End'?'why':this.evidence==='source'?'why':'source';this.showEvidence(tab);document.querySelector('[data-evidence="'+tab+'"]').focus();}};
  }
  q('#evidence-expand').onclick=()=>this.dock.ui.maximize('details');
  this.showEvidence('source');
  q('#preview-expand').onclick=()=>{
   if(this.dock){this.dock.ui.maximize('preview');return;}
   const expanded=document.body.classList.toggle('preview-expanded');
   q('#preview-expand').setAttribute('aria-pressed',String(expanded));
   q('#preview-expand').textContent=expanded?'Restore':'Expand';
   this.splitValue(expanded?58:this.ratio);
  };
  for(const button of document.querySelectorAll('[data-layout]'))button.onclick=()=>{
   this.p.h.board.setMode(button.dataset.layout);this.modeButtons();
  };
  this.p.h.board.setMode(localStorage.getItem('depth.layout')||'guide');this.modeButtons();
 }
 showEvidence(tab){
  this.evidence=tab==='why'?'why':'source';
  document.querySelector('.selection-source').hidden=this.evidence!=='source';
  document.querySelector('#assembly-details').hidden=this.evidence!=='why';
  for(const b of document.querySelectorAll('[data-evidence]')){b.setAttribute('aria-selected',String(b.dataset.evidence===this.evidence));b.tabIndex=b.dataset.evidence===this.evidence?0:-1;}
 }
 renderCode(text,startLine=1,lineNumbers=null){
  const code=document.querySelector('#selection-code');code.replaceChildren();code.style.counterReset='source-line '+Math.max(0,startLine-1);
  const pattern=/(\/\/[^\n]*|"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'|\b(?:public|private|protected|static|class|sealed|const|return|if|else|new|void|bool|int|double|string|var|function|export|import|async|await|def|let)\b|\b\d+(?:\.\d+)?\b)/g;
  for(const [i,line] of text.split('\n').entries()){
   if(i)code.append(document.createTextNode('\n'));
   const row=document.createElement('span');row.className='source-line';row.dataset.line=String(lineNumbers?.[i]??(startLine+i));let cursor=0;
   for(const match of line.matchAll(pattern)){row.append(document.createTextNode(line.slice(cursor,match.index)));const token=document.createElement('span');token.className='token-'+(match[0].startsWith('//')?'comment':/^["']/.test(match[0])?'string':/^\d/.test(match[0])?'number':'keyword');token.textContent=match[0];row.append(token);cursor=match.index+match[0].length;}
   row.append(document.createTextNode(line.slice(cursor)));code.append(row);
  }
 }
 installSplit(){
  const stage=document.querySelector('.assembly-stage'),handle=document.querySelector('#workspace-divider');
  const stored=Number(localStorage.getItem('depth.previewRatio'));
  this.ratio=Number.isFinite(stored)&&stored>=38&&stored<=58?stored:46;
  const resize=value=>{document.body.classList.remove('preview-expanded');document.querySelector('#preview-expand').setAttribute('aria-pressed','false');document.querySelector('#preview-expand').textContent='Expand';this.ratio=this.splitValue(value);localStorage.setItem('depth.previewRatio',String(this.ratio));};
  this.splitValue(this.ratio);
  const measure=()=>{
   const top=stage.getBoundingClientRect().top,work=document.querySelector('.workspace').getBoundingClientRect(),bottom=document.querySelector('footer').getBoundingClientRect().top;
   if(work.height>0&&bottom>0)stage.style.setProperty('--preview-max-height',Math.max(300,bottom-Math.max(top,work.top+12)-16)+'px');
  };
  this.measure=measure;
  if(window.ResizeObserver){this.shellResize=new ResizeObserver(measure);for(const selector of ['.workspace','.top','.workbar','footer'])this.shellResize.observe(document.querySelector(selector));}
  document.querySelector('.workspace').addEventListener('scroll',measure,{passive:true});
  window.addEventListener('resize',measure);
  let pointer=null;
  handle.addEventListener('pointerdown',e=>{if(e.button!==0||innerWidth<1000)return;e.preventDefault();pointer=e.pointerId;handle.setPointerCapture?.(pointer);document.body.classList.add('resizing-workspace');});
  handle.addEventListener('pointermove',e=>{if(pointer!==e.pointerId)return;const bounds=stage.getBoundingClientRect();if(bounds.width>0)resize((e.clientX-bounds.left)/bounds.width*100);});
  const finish=e=>{if(pointer!==e.pointerId)return;const id=pointer;pointer=null;if(handle.hasPointerCapture?.(id))handle.releasePointerCapture(id);document.body.classList.remove('resizing-workspace');};
  for(const event of ['pointerup','pointercancel','lostpointercapture'])handle.addEventListener(event,finish);
  handle.addEventListener('keydown',e=>{const next={ArrowLeft:this.ratio-2,ArrowRight:this.ratio+2,Home:38,End:58}[e.key];if(next!==undefined){e.preventDefault();resize(next);}});
  handle.addEventListener('dblclick',()=>resize(46));
 }
 splitValue(value){
  const ratio=Math.max(38,Math.min(58,value)),stage=document.querySelector('.assembly-stage'),handle=document.querySelector('#workspace-divider');
  stage.style.setProperty('--preview-share',ratio+'fr');stage.style.setProperty('--module-share',(100-ratio)+'fr');
  handle.setAttribute('aria-valuenow',String(Math.round(ratio)));handle.setAttribute('aria-valuetext','Preview '+Math.round(ratio)+' percent');return ratio;
 }
 modeButtons(){
  const mode=this.p.h.board.mode;
  document.documentElement.dataset.layout=mode;
  for(const b of document.querySelectorAll('[data-layout]'))b.setAttribute('aria-pressed',String(b.dataset.layout===mode));
  localStorage.setItem('depth.layout',mode);
 }
 async screen(screen){
  document.body.dataset.workspaceScreen=screen;
  const q=s=>document.querySelector(s),assembly=['feature','relations'].includes(screen);
  // The same real inspector remains available in every workflow; it is not duplicated.
  q('#assembly-details').append(q('.inspector'));
  if(assembly)q('#module-key-connections').append(q('#importance-bar'));
  else q('#modules-page').parentElement.insertBefore(q('#importance-bar'),q('#modules-page'));
  q('#workspace-views').hidden=!assembly;
  this.measure();
  this.dock.screen(screen);
  if(assembly)await this.selection();else ++this.serial;
 }
 async selection(){
  const p=this.p,q=s=>document.querySelector(s),ticket=++this.serial;
  p.focus?.update();
  const selected=p.card(),root=p.card(p.s.assemblyRoot);
  q('#preview-context-name').textContent=window.depthRuntime?.mapped?.name||p.card(p.s.previewRoot)?.name||p.s.view?.preview?.title||'Select an element in the preview';
  q('#module-context-name').textContent=p.s.composition?.title||root?.name||'Choose a source element';
  q('#preview-context').classList.toggle('has-selection',root?.kind==='ViewElement');
  q('#selection-links').replaceChildren();q('#selection-code').textContent='';
  q('#selection-path').textContent='';q('#selection-source').removeAttribute('data-inspect-source');
  q('#selection-source').disabled=true;
  if(!selected||!root){q('#selection-title').textContent='Select an indexed element';q('#selection-evidence').textContent='No source selected';return;}
  q('#selection-title').textContent=root.name+' → '+selected.name;
  const relations=p.s.graph.relations.filter(r=>r.from===selected.id&&r.kind!=='contains');
  const targets=[...new Set(relations.map(r=>r.to))].map(id=>p.card(id)).filter(Boolean);
  // For a declared value, show its calculation immediately; retain its declaration as a choice.
  const primary=selected.kind==='ViewElement'?(targets.find(c=>c.kind==='Method')||selected):selected;
  for(const c of [selected,...targets].filter((c,i,a)=>a.findIndex(x=>x.id===c.id)===i)){
   const button=document.createElement('button');button.dataset.inspect=c.id;
   const relation=relations.find(r=>r.to===c.id);
   button.textContent=c.name+(relation?' · '+relation.kind:' · declaration');
   button.title=c.anchors.map(a=>a.path+':'+a.startLine).join(', ');
   q('#selection-links').append(button);
  }
  q('#selection-evidence').textContent=selected.kind==='ViewElement'?'Declared preview binding · source evidence':'Indexed source · not a runtime trace';
  q('#selection-code').textContent='Loading source…';
  try{
   const source=await p.source(primary.id);
   if(ticket!==this.serial)return;
   q('#selection-path').textContent=primary.name+' · '+source.sources.map(s=>s.anchor.path+':'+s.anchor.startLine).join(', ');
   const lineNumbers=source.sources.flatMap((s,i)=>[...(i?['']:[]),...s.content.split(/\r?\n/).slice(s.anchor.startLine-1,s.anchor.endLine).map((_,j)=>s.anchor.startLine+j)]);
   this.renderCode(p.sourceText(source)||'This resource has no textual declaration. Inspect its consumers above.',source.sources[0]?.anchor.startLine||1,lineNumbers);
   q('#selection-source').dataset.inspectSource=primary.id;q('#selection-source').disabled=false;
  }catch(error){if(ticket===this.serial)q('#selection-code').textContent='Source unavailable: '+error.message;}
 }
};
