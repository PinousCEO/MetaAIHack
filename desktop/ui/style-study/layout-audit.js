'use strict';
// Read the browser's rendered boxes. DOM emulators without layout must never pass this audit.
(() => {
 function audit(root=document){
  const failures=[],measurements=[],rect=el=>{const r=el.getBoundingClientRect();return {x:r.left,y:r.top,width:r.width,height:r.height,right:r.right,bottom:r.bottom};};
  const graph=root.querySelector('#graph');if(!graph||!graph.getBoundingClientRect().width)return {available:false,failures:['No rendered layout available'],measurements:[]};
  const visible=el=>{const r=el.getBoundingClientRect();return r.width>0&&r.height>0;};
  const overlap=(a,b)=>Math.min(a.right,b.right)-Math.max(a.x,b.x)>.5&&Math.min(a.bottom,b.bottom)-Math.max(a.y,b.y)>.5;
  const within=(a,b)=>a.x>=b.x-1&&a.y>=b.y-1&&a.right<=b.right+1&&a.bottom<=b.bottom+1;
  const separated=(elements,label)=>{const boxes=[...elements].filter(visible).map(rect);for(let i=0;i<boxes.length;i++)for(let j=i+1;j<boxes.length;j++)if(overlap(boxes[i],boxes[j]))failures.push(label+' ['+i+','+j+']');};
  for(const node of root.querySelectorAll('[data-node]')){
   const content=node.querySelector('.node-content'),box=node.querySelector('.node-content-box'),title=node.querySelector('.node-title');
   if(!content||!box||!title){failures.push('Missing content layout: '+node.dataset.node);continue;}
   const bounds=rect(box),parts=[...content.children].filter(visible);
   for(const part of parts)if(!within(rect(part),bounds))failures.push('Module content escapes its area: '+node.dataset.node+' '+part.className);
   for(const part of node.querySelectorAll('.node-glyph,.node-title,.node-meta>*'))if(!within(rect(part),bounds))failures.push('Module detail escapes its area: '+node.dataset.node+' '+part.className);
   separated(parts,'Module rows overlap: '+node.dataset.node);
   separated(node.querySelectorAll('.node-glyph,.node-title'),'Icon and title overlap: '+node.dataset.node);
   separated(node.querySelectorAll('.node-meta>*'),'Role and value overlap: '+node.dataset.node);
   if(content.scrollHeight>content.clientHeight+1||content.scrollWidth>content.clientWidth+1)failures.push('Module content overflow: '+node.dataset.node);
   if(title.scrollHeight>title.clientHeight+1||title.scrollWidth>title.clientWidth+1)failures.push('Module title clipped: '+node.dataset.node);
   measurements.push({id:node.dataset.node,area:bounds,title:rect(title),icon:node.querySelector('.node-glyph')?rect(node.querySelector('.node-glyph')):null});
  }
  const groups=[['.top>.wordmark,.top>.project-name,.top>nav,.top>#theme','Header sections'],['.top nav>button,.top nav>.future','Navigation'],['.study-bar>*','Style controls'],['.mode-switch>button','Style buttons'],['.canvas-heading>*','Canvas heading'],['.scope-summary>*','Scope summary'],['.canvas-toolbar>div,.canvas-toolbar>.legend','Canvas tools'],['.workspace>.project,.workspace>main,.workspace>.inspector','Workspace panes'],['footer>*','Footer']];
  for(const [selector,label]of groups)separated(root.querySelectorAll(selector),label+' overlap');
  for(const file of root.querySelectorAll('.file'))separated(file.querySelectorAll('.icon-svg,.file-name'),'File icon and name overlap');
  for(const row of root.querySelectorAll('.source>div'))separated(row.children,'Source heading controls overlap');
  const preview=root.querySelector('#preview-surface');
  if(preview){
   const targets=preview.querySelectorAll('[data-preview-id]');separated(targets,'Preview click targets overlap');
   for(const target of targets){const r=rect(target);if(r.width<24||r.height<24)failures.push('Preview target too small: '+target.dataset.previewKey);if(!within(r,rect(preview)))failures.push('Preview target escapes surface: '+target.dataset.previewKey);}
   for(const img of preview.querySelectorAll('img'))if(!within(rect(img),rect(img.parentElement)))failures.push('Preview image escapes target: '+img.alt);
   const panel=root.querySelector('.preview-panel'),workspace=root.querySelector('.workspace');
   if(panel&&workspace&&rect(panel).width<Math.min(400,rect(workspace).width*.8))failures.push('Primary preview is too narrow');
   measurements.push({preview:rect(preview),targets:targets.length});
  }
  if(root.documentElement.scrollWidth>root.defaultView.innerWidth+1)failures.push('Document horizontal overflow');
  return {available:true,failures,measurements};
 }
 window.DepthStudyLayoutAudit=audit;
})();
