'use strict';
// Preview identities and composition membership come from the same index as source inspection.
window.DepthPreview = (() => {
 function model(snapshot, bridge) {
  let data=snapshot,live=false;
  const excerpt=record=>record.sources.map(s=>({path:s.anchor.path,startLine:s.anchor.startLine,endLine:s.anchor.endLine,text:s.content.split(/\r?\n/).slice(s.anchor.startLine-1,s.anchor.endLine).join('\n')}));
  return {
   get data(){return data;},get live(){return live;},
   async load(project){
    if(!bridge)return data;
    if(project)await bridge.request('/import',{path:project});
    else {
     // Moving here from the product must preserve its currently imported project.
     let current;try{current=await bridge.request('/view');}catch{}
     if(!current?.root){const initial=await bridge.initial();if(initial.project)await bridge.request('/import',{path:initial.project});}
    }
    const [graph,view]=await Promise.all([bridge.request('/graph'),bridge.request('/view')]);
    const images={};
    for(const p of view.preview?.products||[])if(!images[p.assetId]){
     const a=await bridge.request('/project-assets/'+p.assetId);images[p.assetId]='data:'+a.mime+';base64,'+a.base64;
    }
    data={name:view.root.split(/[\\/]/).pop(),revision:graph.revision,preview:view.preview,allCards:view.cards,allRelations:graph.relations,allSources:{},compositions:{},images};live=true;return data;
   },
   async composition(id){
    const c=live?await bridge.request('/composition/'+id):data.compositions[id];
    if(!c)throw Error('No indexed composition for this element.');
    const scope=new Set(c.memberIds),cards=data.allCards.filter(n=>scope.has(n.id));
    if(cards.length!==scope.size)throw Error('Composition contains unavailable source elements. Refresh the project.');
    const sources={};
    for(const n of cards)sources[n.id]=live?excerpt(await bridge.request('/source/'+n.id)):(data.allSources[n.id]||[]);
    return {...data,rootId:id,compositionIds:c.memberIds,cards,relations:c.relations,sources,scope:c.scope};
   }
  };
 }
 function render(container,data,onSelect){
  container.replaceChildren();const p=data.preview;
  const el=(tag,cls,text)=>{const e=document.createElement(tag);if(cls)e.className=cls;if(text!==undefined)e.textContent=text;return e;};
  if(!p){container.append(el('h2','','No declared preview'),el('p','','This project has no preview adapter. Browse its indexed source below; a runtime screen has not been inferred.'));
   for(const c of data.allCards.filter(c=>['Class','Method','Function','Type','NamedType'].includes(c.kind))){const b=el('button','source-entry',c.name);b.onclick=()=>onSelect(c.id,null);container.append(b);}return;
  }
  const bindings=new Map(p.bindings.map(b=>[b.key,b.id]));
  function target(key,text,cls){const id=bindings.get(key),e=el(id?'button':'span','preview-target '+(cls||''),text);if(id){e.type='button';e.dataset.previewId=id;e.dataset.previewKey=key;e.setAttribute('aria-label','Inspect '+key+': '+text);e.setAttribute('aria-pressed','false');e.onclick=()=>onSelect(id,key);e.title='Show the source and complete composition of '+key;}return e;}
  const label=(key,fallback,cls)=>target('label.'+key,p.labels.find(l=>l.key===key)?.text||fallback,cls),money=n=>Number(n).toLocaleString('en-US',{minimumFractionDigits:2,maximumFractionDigits:2});
  const sheet=el('article','preview-sheet');sheet.append(label('heading','CHECKOUT','preview-eyebrow'),target('title',p.title,'preview-title'));
  p.products.forEach((product,i)=>{const row=el('section','preview-product'),picture=target('product.'+i+'.image','','preview-image'),img=el('img');img.src=data.images[product.assetId]||'';img.alt=product.name;picture.setAttribute('aria-label','Inspect image: '+product.name);picture.append(img);
   const text=el('div','preview-product-text');text.append(target('product.'+i+'.name',product.name,'preview-name'),target('product.'+i+'.detail',product.detail,'preview-detail'),target('product.'+i+'.price',money(product.price),'preview-price'));row.append(picture,text);sheet.append(row);});
  sheet.append(label('summary','Order summary','preview-summary'));
  for(const [key,fallback,value]of[['subtotal','Subtotal',p.subtotal],['discount','Discount',p.subtotal-p.total],['total','Total',p.total]]){const row=el('div','preview-line '+key);row.append(label(key,fallback),target(key,(key==='discount'?'− ':'')+money(value),'preview-amount'));sheet.append(row);}
  sheet.append(label('coupon','Coupon','preview-coupon'),target('action',p.action,'preview-action'));container.append(sheet);
 }
 return {model,render};
})();
