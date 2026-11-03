'use strict';
// User-selected AST literals. Apply remains protected by the service's current
// revision, source hash, syntax and configured validation policy; no AI call.
window.DepthValueEditor=class {
 constructor({state,api,run,refresh,review,source}){
  Object.assign(this,{s:state,api,run,refresh,review,source});this.collapsed=false;this.drafts=new Map();
  this.root=document.createElement('section');this.root.id='module-values';this.root.className='module-values';this.root.hidden=true;
  this.root.setAttribute('aria-label','Edit selected module values');
  document.querySelector('.assembly-subhead').after(this.root);
  const tools=document.querySelector('.module-toolbar');this.toggle=document.createElement('button');this.toggle.id='edit-module-values';this.toggle.textContent='Values';this.toggle.onclick=()=>{this.collapsed=!this.collapsed;this.render(true);};tools.append(this.toggle);
 }
 entries(id){
  const owned=new Set([id]);let more=true;const relations=this.s.graph?.relations||[];
  while(more){more=false;for(const r of relations)if(r.kind==='contains'&&owned.has(r.from)&&!owned.has(r.to)){owned.add(r.to);more=true;}}
  const ids=new Set(owned);more=true;
  while(more){more=false;for(const r of relations)if((r.kind!=='contains'||owned.has(r.from))&&ids.has(r.from)&&!ids.has(r.to)){ids.add(r.to);more=true;}}
  return (this.s.view?.cards||[]).filter(c=>ids.has(c.id)).flatMap(card=>(card.properties||[]).filter(v=>v.editable).map(value=>({card,value})));
 }
 open(id){this.collapsed=false;this.id=id;this.render(true);this.root.querySelector('input,textarea,select')?.focus();}
 selection(){if(this.project!==this.s.graph?.projectId){this.project=this.s.graph?.projectId;this.undoId=null;this.result=null;}this.id=this.s.entity;this.render();}
 render(force=false){
  const draftRevision=this.s.graph?.projectId+':'+this.s.graph?.revision;
  if(this.draftRevision!==draftRevision){this.draftRevision=draftRevision;this.drafts.clear();}
  const stamp=this.s.graph?.projectId+':'+this.s.graph?.revision+':'+this.id+':'+this.collapsed;
  if(!force&&stamp===this.stamp)return;this.stamp=stamp;
  const entries=this.entries(this.id),name=this.s.view?.cards.find(c=>c.id===this.id)?.name||'Module';
  this.toggle.textContent='Values'+(entries.length?' · '+entries.length:'');this.toggle.setAttribute('aria-expanded',String(!this.collapsed));
  this.root.hidden=this.collapsed;this.root.replaceChildren();
  const node=(tag,cls,text)=>{const el=document.createElement(tag);if(cls)el.className=cls;if(text!==undefined)el.textContent=text;return el;};
  const header=node('header'),title=node('strong','',name+' · Values'),close=node('button','','Collapse');close.type='button';close.onclick=()=>{this.collapsed=true;this.render(true);};header.append(title,node('span','value-origin','Direct source edit'),close);this.root.append(header);
  const save=node('button','primary value-save','Apply edits');save.id='apply-module-values';save.type='button';save.disabled=true;header.insertBefore(save,close);
  const supported=this.s.view?.valueEditing==='ast-literal-1';
  const result=node('p','value-result',supported?(this.result||'Edit source values in this module and its dependencies. Apply edits saves all changed fields together.'):'Restart Depth AI to load the new source-value editing service. This older session is read only.');result.setAttribute('role','status');this.root.append(result);this.resultNode=result;
  if(this.undoId){const undo=node('button','value-undo','Undo last value edit');undo.type='button';undo.onclick=()=>this.run(async()=>{const p=await this.api('/history/'+this.undoId+'/undo',{}),r=await this.api('/proposals/'+p.id);if(!r.assessment.canApply){await this.review(p.id);return;}await this.api('/apply',{id:p.id,approved:true});this.undoId=null;this.result='Previous source value restored.';await this.refresh();this.render(true);});this.root.append(undo);}
  const list=node('div','value-list');this.root.append(list);
  if(!entries.length){list.append(node('p','value-empty','No supported literal values in this declaration. Computed values come from its dependencies; inspect a connected module or ask Meta for a code change.'));return;}
  const editors=[],projectId=this.s.graph.projectId,revision=this.s.graph.revision;
  const changed=()=>editors.filter(v=>v.input.value!==v.value.value);
  const updateSave=()=>{save.disabled=!supported||!changed().length;save.textContent='Apply edits'+(changed().length?' ('+changed().length+')':'');};
  save.onclick=()=>{if(save.disabled||this.s.busy)return;this.run(async()=>{
   save.disabled=true;
   try{
    if(this.s.graph.projectId!==projectId||this.s.graph.revision!==revision)throw Error('Source changed. Refresh the values before applying.');
    const edits=changed(),proposal=await this.api('/property/propose',{id:this.id,value:'',revision,changes:edits.map(v=>({id:v.card.id,key:v.value.key,value:v.input.value}))});
    const details=await this.api('/proposals/'+proposal.id);
    if(!details.assessment.canApply){const inspect=node('button','','Review required checks');inspect.type='button';inspect.onclick=()=>this.run(()=>this.review(proposal.id));result.replaceChildren(node('span','','Values have not been applied. '),inspect);return;}
    const applied=await this.api('/apply',{id:proposal.id,approved:true});this.undoId=applied.id;this.result=edits.length+' value(s) saved. Connected runtime update requested.';
    await this.refresh();this.collapsed=false;this.id=this.s.entity;this.render(true);
   }catch(e){result.textContent=e.message;save.disabled=false;}
  });};
  for(const {card,value} of entries){
   const row=node('form','value-row');row.dataset.valueOwner=card.id;row.dataset.valueKey=value.key;
   const key='value-'+card.id+'-'+value.key,label=node('label','value-label');label.htmlFor=key;label.append(node('strong','',value.label),node('small','',value.path+':'+(value.line||card.anchors[0]?.startLine)+' · '+(value.type||value.kind||'number')));
   let input;
   if(value.kind==='boolean'){input=node('select');for(const v of ['true','false']){const option=node('option','',v);option.value=v;input.append(option);}}
   else {input=node(value.kind==='string'?'textarea':'input');if(input.tagName==='TEXTAREA')input.rows=1;else{input.type='text';if(value.kind==='number')input.inputMode='decimal';}input.spellcheck=false;}
   input.id=key;input.name='source-value';input.value=this.drafts.get(key)??value.value;input.disabled=!supported;input.setAttribute('aria-label',card.name+' · '+value.label+' · line '+(value.line||card.anchors[0]?.startLine));
   const actions=node('div','value-actions'),read=node('button','','Code');read.type='button';read.onclick=()=>this.run(()=>this.source(card.id));actions.append(read);
   const before=node('code','value-before','Current: '+(value.literal||value.value)),error=node('p','value-error');error.setAttribute('role','alert');
   editors.push({card,value,input});
   const edit=()=>{if(input.value===value.value)this.drafts.delete(key);else this.drafts.set(key,input.value);updateSave();error.replaceChildren();};
   input.addEventListener('input',edit);
   input.addEventListener('change',edit);
   row.append(label,input,actions,before,error);list.append(row);
   row.onsubmit=event=>{event.preventDefault();save.click();};
  }
  updateSave();
 }
};
