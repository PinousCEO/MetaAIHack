// Executes the shipped renderer against the real service. This is not a pixel/EXE test.
const {JSDOM}=require('jsdom');const fs=require('node:fs'),path=require('node:path'),{spawn}=require('node:child_process'),net=require('node:net'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'..'),out=path.join(root,'artifacts','desktop-dom-'+Date.now());fs.mkdirSync(out,{recursive:true});
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
(async()=>{
 const server=net.createServer();await new Promise(r=>server.listen(0,'127.0.0.1',r));const port=server.address().port;await new Promise(r=>server.close(r));
 const project=path.join(out,'sample');fs.cpSync(path.join(root,'samples','Checkout'),project,{recursive:true,filter:p=>!['bin','obj','.depth'].includes(path.basename(p))});
 const child=spawn('dotnet',[path.join(root,'artifacts/desktop-service/Depth.Service.dll')],{cwd:root,windowsHide:true,env:{...process.env,DEPTH_PORT:String(port),DEPTH_TOKEN:'dom-test',DEPTH_STORAGE:path.join(out,'state'),DEPTH_ENV_FILE:path.join(root,'.env')},stdio:'ignore'});
 const request=require('./service-client.cjs').createClient(()=> 'http://127.0.0.1:'+port,'dom-test');
 const checks=[];const check=(v,name)=>{assert(v,name);checks.push(name);};let dom;
 try{
  for(let i=0;i<150;i++){try{await request('/health');break;}catch{await sleep(100);}}
  dom=new JSDOM(fs.readFileSync(path.join(__dirname,'ui/index.html'),'utf8'),{url:'http://depth.test/',runScripts:'outside-only'});const w=dom.window,d=w.document;
  const resizeCallbacks=new Map();w.ResizeObserver=class{constructor(callback){this.callback=callback;}observe(el){resizeCallbacks.set(el,this.callback);}disconnect(){}};
  w.HTMLDialogElement.prototype.showModal=function(){this.open=true;};w.HTMLDialogElement.prototype.close=function(){this.open=false;};
  // Only connectivity status responses are explicit fixtures; never call a model in this DOM suite.
  let picker=null,dropPath=null,probe={status:'connected',inferenceVerified:false};w.depth={request:(route,body)=>route==='/meta/check'?Promise.resolve(probe):request(route,body),initial:async()=>({project,example:true}),chooseProject:async()=>picker,projectFromDrop:async()=>require('./project-drop.cjs').resolveProjectDrop([dropPath])};
  for(const file of ['icons.js','visual-model.js','style-study/layout.js','assembly.js','dock-model.js','dock-engine.js','dock-workbench.js','preview-focus.js','workspace.js','project-drop.js','product.js'])w.eval(fs.readFileSync(path.join(__dirname,'ui',file),'utf8')); 
  w.eval(fs.readFileSync(path.join(__dirname,'ui/app.js'),'utf8'));
  const wait=async()=>{for(let i=0;i<200;i++){if(w.depthApp.state().ready&&!w.depthApp.state().busy)return;await sleep(30);}throw Error('UI timeout: '+d.querySelector('#toast').textContent);};
  const click=async s=>{if(s==='[data-page="modules"]'&&!d.querySelector(s)){await click('[data-screen="understand"]');}const el=d.querySelector(s);assert(el,'element exists: '+s+'; state='+JSON.stringify(w.depthApp.state())+'; content='+d.querySelector('#design-page').textContent.slice(0,500));el.click();await wait();if(!d.querySelector('#toast').hidden)throw Error(d.querySelector('#toast').textContent);};
  await wait();check(w.depthApp.state().screen==='feature','large source-linked preview is the default');
  check(!w.depthApp.state().previewFocus.enabled&&!d.querySelector('#preview').classList.contains('preview-isolating'),'startup preview stays readable until the user selects an element or module');
  check(!d.querySelector('.dot').classList.contains('ready')&&d.querySelector('#check-meta').dataset.connection==='unverified','configured credentials do not claim live connectivity');
  await click('#check-meta');check(!d.querySelector('.dot').classList.contains('ready'),'model listing without actual inference does not indicate verified connection');await click('#close-dialog');
  probe={status:'connected',inferenceVerified:true};await click('#check-meta');check(d.querySelector('.dot').classList.contains('ready'),'explicit successful inference status enables connection indicator (fixture)');await click('#close-dialog');
  probe={status:'connection-failed'};await click('#check-meta');check(!d.querySelector('.dot').classList.contains('ready')&&d.querySelector('#check-meta').dataset.connection==='failed','later connectivity failure clears the previous success indicator');await click('#close-dialog');
  await click('[data-page="modules"]');check(w.depthApp.state().modules>0,'catalog loaded');check(d.querySelectorAll('.card').length===(await request('/modules/catalog')).modules.length,'all actual modules rendered');
  check(d.querySelector('#content').textContent.length>40,'source read');
  const view=await request('/view'),entry=view.preview.entryId;
  const sameIds=(actual,expected)=>JSON.stringify([...actual].sort())===JSON.stringify([...expected].sort());
  const verifyComposition=async(root,label)=>{
    const expected=await request('/composition/'+root);
    check(sameIds([...d.querySelectorAll('[data-node]')].map(n=>n.dataset.node),expected.memberIds),label+' includes every related module');
    check(sameIds([...d.querySelectorAll('[data-edge]')].map(n=>n.dataset.edge),expected.relations.map(r=>r.id)),label+' includes every actual relation');
    check(w.depthApp.state().assemblyRoot===root,label+' root identity');return expected;
  };
  const initial=await verifyComposition(entry,'initial feature');
  check(d.querySelector('.top .rail')&&d.querySelector('#assembly-details .inspector'),'functional navigation and actual inspector use the shared preview shell');
  const initialPositions=[...d.querySelectorAll('[data-node]')].map(n=>n.style.left+','+n.style.top).join('|');
  for(const layout of ['routes','orbit','guide']){
    await click('[data-layout="'+layout+'"]');await verifyComposition(entry,'layout '+layout);
    check(w.localStorage.getItem('depth.layout')===layout&&d.documentElement.dataset.layout===layout,'layout preference '+layout);
    const nodes=[...d.querySelectorAll('[data-node]')].map(n=>({x:parseFloat(n.style.left),y:parseFloat(n.style.top)}));
    check(nodes.every((a,i)=>nodes.every((b,j)=>i===j||a.x+210<=b.x||b.x+210<=a.x||a.y+144<=b.y||b.y+144<=a.y)),'module bodies do not intersect in '+layout);
    if(layout!=='guide')check(nodes.map(n=>n.x+'px,'+n.y+'px').join('|')!==initialPositions,'layout actually changes geometry '+layout);
  }
  const totalBinding=view.preview.bindings.find(b=>b.key==='total');
  await click('[data-preview-key="total"]');
  check(w.depthApp.state().assemblyRoot===totalBinding.id&&d.querySelector('#selection-code').textContent.includes('subtotal * (1 - DiscountPercent / 100)'),'total selection immediately exposes the actual calculation');
  const calculation=view.cards.find(c=>c.name==='CalculateTotal');
  await click('#selection-links [data-inspect="'+calculation.id+'"]');
  check(w.depthApp.state().assemblyRoot===totalBinding.id&&w.depthApp.state().entity===calculation.id,'source link inspects a member without replacing preview composition');
  const selectedSource=await request('/source/'+calculation.id),anchor=selectedSource.sources[0].anchor;
  const exactSource=selectedSource.sources.map(s=>s.content.split(/\r?\n/).slice(s.anchor.startLine-1,s.anchor.endLine).join('\n')).join('\n\n');
  check(d.querySelector('#selection-code').textContent===exactSource,'syntax styling preserves the exact indexed source excerpt');
  check(d.querySelector('#selection-code .source-line').dataset.line===String(anchor.startLine),'source gutter starts at the real declaration line');
  check(d.querySelector('#assembly-details').hidden&&!d.querySelector('#source-evidence').hidden,'source opens separately from long design explanations');
  const evidenceIdentity=JSON.stringify(w.depthApp.state().memberIds);
  await click('[data-evidence="why"]');
  check(!d.querySelector('#assembly-details').hidden&&d.querySelector('#source-evidence').hidden&&d.querySelector('#assembly-details #open-rationale'),'design tab exposes the actual explanation and analysis controls');
  check(JSON.stringify(w.depthApp.state().memberIds)===evidenceIdentity&&w.depthApp.state().assemblyRoot===totalBinding.id,'changing evidence tabs preserves complete preview composition');
  d.querySelector('[data-evidence="why"]').dispatchEvent(new w.KeyboardEvent('keydown',{key:'Home',bubbles:true,cancelable:true}));
  check(d.querySelector('[data-evidence="source"]').tabIndex===0&&!d.querySelector('#source-evidence').hidden&&d.activeElement.dataset.evidence==='source','evidence tabs support keyboard selection and focus');
  await click('#evidence-expand');check(w.depthDock.getState().maximized===w.DepthDockModel.owner(w.depthDock.getState(),'details').id,'source reading area can expand independently');await click('#evidence-expand');
  await click('#preview-expand');check(w.depthDock.getState().maximized==='preview','preview can maximize as an independent dock');await click('#preview-expand');
  check(d.querySelector('.preview-pane').getAttribute('aria-labelledby')==='preview-region-title'&&d.querySelector('.assembly-pane').getAttribute('aria-labelledby')==='modules-region-title','preview and module workspace retain named regions');
  check(d.querySelector('#assembly-back').parentElement.classList.contains('assembly-subhead'),'composition back navigation remains in the visible module header');
  check(d.querySelector('#preview-context-name').textContent===view.cards.find(c=>c.id===totalBinding.id).name,'preview root remains identified while inspecting its calculation');
  const splitIdentity=JSON.stringify(w.depthApp.state().memberIds);
  let splitBox=d.querySelector('[data-split="workspace"]'),splitHandle=splitBox.querySelector(':scope > .separator');
  splitHandle.dispatchEvent(new w.KeyboardEvent('keydown',{key:'End',bubbles:true,cancelable:true}));
  check(w.depthDock.getState().root.ratio===.94,'docking proportions are not locked to the former 38?58 percent range');
  w.depthDock.reset();splitBox=d.querySelector('[data-split="workspace"]');splitHandle=splitBox.querySelector(':scope > .separator');
  splitBox.getBoundingClientRect=()=>({left:100,top:0,width:1000,height:700});
  splitHandle.dispatchEvent(new w.MouseEvent('pointerdown',{bubbles:true,clientX:670,clientY:100,button:0,cancelable:true}));
  d.dispatchEvent(new w.MouseEvent('pointermove',{bubbles:true,clientX:750,clientY:100}));d.dispatchEvent(new w.MouseEvent('pointerup',{bubbles:true,clientX:750,clientY:100}));
  check(w.depthDock.getState().root.ratio===.65&&JSON.parse(w.localStorage.getItem('depth.docking.v1')).root.ratio===.65,'live panel splitter persists its size');
  check(JSON.stringify(w.depthApp.state().memberIds)===splitIdentity&&w.depthApp.state().assemblyRoot===totalBinding.id,'panel resizing preserves the complete source composition');
  const cli=d.querySelector('#prompt');cli.value='Keep this source question';w.depthDock.float('chat');check(d.querySelector('.floating #prompt')===cli&&cli.value==='Keep this source question','floating uses the original connected Meta input without losing draft');
  w.depthDock.dock('chat','modules','right');check(d.querySelector('#prompt')===cli&&w.DepthDockModel.validate(w.depthDock.getState()),'live CLI redocks without duplicating IDs');cli.value='';
  w.depthDock.hide('preview');w.depthDock.show('preview');check(d.querySelectorAll('#preview').length===1,'closed preview restores as the same live panel');w.depthDock.reset();
  await click('[data-node="'+entry+'"] [data-open-composition]');
  check(d.documentElement.lang==='en'&&!/[가-힣]/.test(d.querySelector('.rail').textContent+d.querySelector('#screen-title').textContent),'English navigation is the default');
  const themeSelection=w.depthApp.state().entity;
  await click('#theme-toggle');check(d.documentElement.dataset.theme==='dark'&&w.localStorage.getItem('depth.theme')==='dark','dark theme is explicitly selected and persisted');
  await click('#theme-toggle');check(d.documentElement.dataset.theme==='light'&&w.depthApp.state().entity===themeSelection,'light theme restores without losing selection');
  check(d.querySelector('[data-node="'+entry+'"] .module-glyph svg').getAttribute('viewBox')==='-2 -2 28 28','vector icons have stroke-safe padded coordinates');
  check(d.querySelectorAll('[data-edge] circle').length===0&&[...d.querySelectorAll('[data-node]')].every(n=>n.querySelectorAll('.node-connector').length===2),'connections share at most two node ports instead of repeating a dot for each relation');
  check(d.querySelectorAll('.shape-state').length>0&&d.querySelectorAll('.shape-asset').length>0&&d.querySelector('[data-node="'+entry+'"]').classList.contains('shape-coordinator'),'source roles distinguish state, assets and coordinating operations');
  const bodies=[...d.querySelectorAll('[data-node]')],rolePaths=new Map();
  for(const node of bodies){const shape=[...node.classList].find(c=>c.startsWith('shape-')),outline=node.querySelector('.module-outline');check(Boolean(outline),'source module has an actual role silhouette '+node.querySelector('h3').textContent);rolePaths.set(shape,outline.getAttribute('d'));}
  check(new Set(rolePaths.values()).size===rolePaths.size&&rolePaths.size>=4,'different source roles have different geometry, not just recolored rectangles');
  await click('#connections-all');check(d.querySelector('#assembly-viewport').classList.contains('all-connections'),'all-link mode is available without removing source relations');
  await click('#connections-selected');check(!d.querySelector('#assembly-viewport').classList.contains('all-connections')&&d.querySelectorAll('[data-edge]').length===initial.relations.length,'selected-link mode retains the complete canonical graph');
  check(d.querySelector('#importance-bar [data-inspect]')&&d.querySelector('#design-structure .design-links button'),'importance navigation and source-backed connection explanation are available');
  await click('[data-evidence="why"]');await click('#open-rationale');check(d.querySelector('#dialog').open&&d.querySelector('#dialog-body').textContent.includes('Source structure'),'unannotated modules show structural facts rather than inventing a Meta rationale');await click('#close-dialog');await click('[data-evidence="source"]');
  const catalog=await request('/modules/catalog'),mixed=catalog.modules.find(m=>m.provides.some(e=>e.language==='asset')&&m.provides.some(e=>e.kind==='Method'));
  check(!mixed||d.querySelector('[data-module="'+mixed.id+'"] h3').textContent.includes(mixed.provides.find(e=>e.kind==='Method').name),'mixed code/asset module is named for its code rather than a PNG');
  await click('[data-screen="map"]');await click('[data-screen="relations"]');check(d.querySelector('.dock-view-details .matrix'),'mathematical evidence remains beside the relationship graph');await click('[data-page="modules"]');
  check(d.querySelector('#assembly-count').textContent===initial.memberIds.length+' modules · '+initial.relations.length+' source relationships'&&!d.querySelector('#assembly-title').textContent.includes('관계 분석'),'return from relations restores the feature title and actual counts');
  await click('[data-screen="split"]');resizeCallbacks.get(d.querySelector('#assembly-viewport'))([]);
  check(d.querySelector('#zoom-value').textContent==='100%','hidden graph resize cannot overwrite another screen zoom label');await click('[data-page="modules"]');
  for(let n=0;n<4;n++)await click('#zoom-out');
  check(d.querySelector('#assembly-viewport').classList.contains('compact-modules')&&d.querySelectorAll('[data-node]').length===initial.memberIds.length,'overview zoom switches to readable summary labels while retaining all modules');await click('#assembly-reset');
  check(initial.memberIds.length>10&&initial.relations.length>10,'complete feature instead of representative cards');
  check(d.querySelector('[data-node="'+entry+'"] .module-code').textContent.includes('CouponValidator.IsValid'),'selected function body contains actual code excerpt');
  check(d.querySelector('.library #cards')!==null,'library is separate from feature assembly');
  check(d.querySelectorAll('.preview-product img').length===view.preview.products.length,'real product images rendered');
  const image=view.preview.products[0],imageResult=await request('/project-assets/'+image.assetId);
  check(imageResult.mime==='image/png'&&Buffer.from(imageResult.base64,'base64').equals(fs.readFileSync(path.join(project,image.image))),'image bytes equal indexed project asset');
  let denied=false;try{await request('/project-assets/'+entry);}catch{denied=true;}check(denied,'image endpoint rejects code entity');
  const imagePath=path.join(project,image.image),originalImage=fs.readFileSync(imagePath);fs.appendFileSync(imagePath,'stale');
  try{denied=false;try{await request('/project-assets/'+image.assetId);}catch{denied=true;}check(denied,'stale image rejected before preview');}finally{fs.writeFileSync(imagePath,originalImage);}
  for(let pass=0;pass<3;pass++){
    const id=initial.memberIds.find(id=>id!==entry);
    await click('[data-node="'+id+'"]');
    check(w.depthApp.state().entity===id&&w.depthApp.state().assemblyRoot===entry,'inspect member retains feature root '+pass);
    check(d.querySelectorAll('[data-node]').length===initial.memberIds.length,'all siblings retained '+pass);
    const relation=initial.relations[pass%initial.relations.length],edge=d.querySelector('[data-edge="'+relation.id+'"]');
    edge.dispatchEvent(new w.MouseEvent('click',{bubbles:true}));
    check(d.querySelector('#edge-detail').textContent.includes(relation.kind)&&d.querySelectorAll('.edge-endpoint').length===(relation.from===relation.to?1:2),'edge identifies source endpoints '+pass);
    await click('[data-node="'+id+'"] [data-open-source]');
    check(d.querySelector('#source-dock').open&&w.depthApp.state().assemblyRoot===entry,'source opens without destroying composition '+pass);
    d.querySelector('#source-dock').open=false;
  }
  const bound=new Set([...d.querySelectorAll('[data-preview-key]')].map(e=>e.dataset.previewKey));
  check(view.preview.bindings.every(b=>bound.has(b.key)),'every declared preview binding is selectable');
  let previousPreviewRoot;
  for(const key of view.preview.bindings.map(b=>b.key)){
    previousPreviewRoot=w.depthApp.state().assemblyRoot;
    await click('[data-preview-key="'+key+'"]');await verifyComposition(view.preview.bindings.find(b=>b.key===key).id,'preview '+key);
    check(d.querySelector('#selection-code').textContent.length>0&&!d.querySelector('#selection-source').disabled,'immediate source is available for '+key);
  }

  const lastPreviewKey=view.preview.bindings.find(b=>b.id===w.depthApp.state().assemblyRoot).key;
  const calculate=view.cards.find(c=>c.name==='CalculateTotal'&&c.kind==='Method');
  const asset=view.cards.find(c=>c.kind==='Image'&&c.anchors.some(a=>a.path.endsWith('mug.png')));
  const unrelated=view.cards.find(c=>c.name==='Estimate'&&c.kind==='Method');
  await click('[data-tree-id="'+calculate.id+'"]');
  check(d.querySelector('[data-preview-key="total"]').classList.contains('preview-related')&&d.querySelector('[data-preview-key="product.0.image"]').classList.contains('preview-muted'),'source calculation highlights actual total and fades unrelated image');
  check(w.depthApp.state().previewFocus.matches.every(m=>m.screenId===view.preview.viewId&&m.relationIds.length>0),'reverse matches retain screen and source relationship evidence');
  check(d.querySelectorAll('[data-preview-jump]').length===w.depthApp.state().previewFocus.matches.length&&d.querySelector('[data-preview-jump]').title.includes('Static source path'),'all matched preview locations expose their source path');
  await click('[data-preview-jump="'+totalBinding.id+'"]');check(w.depthApp.state().entity===calculate.id&&d.activeElement.dataset.previewKey==='total','jumping to a related preview location preserves the selected source module');
  check(d.querySelector('[data-preview-key="total"]').disabled===false&&d.querySelector('[data-preview-key="product.0.image"]').disabled===false,'fading does not disable preview targets');
  await click('[data-tree-id="'+asset.id+'"]');
  check(d.querySelector('[data-preview-key="product.0.image"]').classList.contains('preview-related')&&d.querySelector('[data-preview-key="total"]').classList.contains('preview-muted'),'image module highlights its actual image binding rather than all preview elements');
  await click('[data-preview-key="product.0.name"]');
  check(w.depthApp.state().assemblyRoot===view.preview.bindings.find(b=>b.key==='product.0.name').id&&d.querySelector('[data-preview-key="product.0.name"]').classList.contains('preview-related'),'a faded text element remains selectable and changes the complete composition');
  await click('[data-tree-id="'+unrelated.id+'"]');
  check(w.depthApp.state().previewFocus.matches.length===0&&d.querySelector('#preview-focus-summary').textContent.includes('No declared preview relationship'),'unbound source reports no matches instead of inventing UI relationships');
  await click('#preview-show-all');check(!d.querySelector('#preview').classList.contains('preview-isolating'),'Show all restores faded elements without changing selected source');
  await click('.preview-sheet');check(w.depthApp.state().assemblyRoot===view.preview.viewId&&!d.querySelector('#preview').classList.contains('preview-isolating'),'clicking preview background opens the entire bound screen');
  d.querySelector('[data-preview-key="total"]').click();d.querySelector('[data-preview-key="product.1.name"]').click();await wait();
  check(w.depthApp.state().assemblyRoot===view.preview.bindings.find(b=>b.key==='product.1.name').id,'rapid preview selections finish on the last clicked element');
  w.depthDock.hide('preview');await click('[data-tree-id="'+calculate.id+'"]');
  check(w.depthDock.visible('preview')&&d.querySelector('[data-preview-key="total"]').classList.contains('preview-related'),'module selection reveals a closed preview and its related element');
  w.depthDock.reset();w.depthDock.hide('modules');await click('[data-preview-key="total"]');
  check(w.depthDock.visible('modules')&&w.depthApp.state().assemblyRoot===totalBinding.id,'preview selection reopens a closed module workspace with the matching composition');
  previousPreviewRoot=w.depthApp.state().assemblyRoot;w.depthDock.reset();await click('[data-preview-key="'+lastPreviewKey+'"]');

  // DOM-injected keyboard/pointer events exercise the renderer logic, not native pointer geometry.
  const node=d.querySelector('[data-node]'),viewport=d.querySelector('#assembly-viewport');
  const activeComposition=await request('/composition/'+w.depthApp.state().assemblyRoot),attached=activeComposition.relations.find(r=>r.from===node.dataset.node||r.to===node.dataset.node);
  const edgePath=d.querySelector('[data-edge="'+attached.id+'"] .edge-line');
  const beforePosition=[node.style.left,node.style.top],beforePath=edgePath.getAttribute('d');
  function pointer(target,type,x,y){const event=new w.MouseEvent(type,{bubbles:true,clientX:x,clientY:y,button:0,cancelable:true});Object.defineProperty(event,'pointerId',{value:1});target.dispatchEvent(event);}
  pointer(node,'pointerdown',80,90);pointer(viewport,'pointermove',120,130);pointer(viewport,'pointerup',120,130);viewport.dispatchEvent(new w.MouseEvent('click',{bubbles:true}));
  check(node.style.left!==beforePosition[0]&&node.style.top!==beforePosition[1],'drag moves module body');
  check(edgePath.getAttribute('d')!==beforePath,'drag reconnects actual edge endpoints');
  const transformBefore=d.querySelector('#assembly-world').style.transform;
  pointer(viewport,'pointerdown',400,300);pointer(viewport,'pointermove',450,350);pointer(viewport,'pointerup',450,350);viewport.dispatchEvent(new w.MouseEvent('click',{bubbles:true}));
  check(d.querySelector('#assembly-world').style.transform!==transformBefore,'blank-space drag pans work surface');
  const scale=d.querySelector('#zoom-value').textContent;await click('#zoom-in');check(d.querySelector('#zoom-value').textContent!==scale,'zoom changes viewport');await click('#assembly-reset');
  const rects=[...d.querySelectorAll('[data-node]')].map(n=>({x:parseFloat(n.style.left),y:parseFloat(n.style.top)}));
  check(rects.every((a,i)=>Number.isFinite(a.x)&&Number.isFinite(a.y)&&rects.every((b,j)=>i===j||Math.abs(a.x-b.x)>=210||Math.abs(a.y-b.y)>=144)),'initial layout has no overlapping module bodies');
  node.dispatchEvent(new w.KeyboardEvent('keydown',{key:'Enter',bubbles:true}));await wait();check(w.depthApp.state().entity===node.dataset.node,'keyboard selects module');
  await click('#assembly-back');check(w.depthApp.state().assemblyRoot===previousPreviewRoot,'back restores previous composition');
  await click('[data-root="'+w.depthApp.state().entity+'"]');
  fs.writeFileSync(path.join(out,'renderer-dom.html'),dom.serialize());
  for(let i=0;i<3;i++){
   await click('[data-tab="relations"]');check(d.querySelectorAll('.relation').length>0,'relations '+i);
   await click('[data-tab="context"]');check(d.querySelector('#content').textContent.length>50,'context '+i);
   await click('[data-tab="source"]');await click('[data-level="expert"]');await click('[data-level="beginner"]');check(w.localStorage.getItem('depth.level')==='beginner','level saved '+i);
  }
  const search=d.querySelector('#search');search.value='no-such-module';search.dispatchEvent(new w.Event('input'));check(d.querySelectorAll('.card').length===0,'empty search');search.value='';search.dispatchEvent(new w.Event('input'));
  for(const el of [...d.querySelectorAll('#files button')].slice(0,3)){await click('[data-file="'+el.dataset.file+'"]');check(d.querySelector('.code')!==null,'file selection '+el.dataset.file);}
  const file=path.join(project,'CouponRules.cs'),before=fs.readFileSync(file,'utf8');const graph=await request('/graph'),field=graph.entities.find(e=>e.name==='DiscountPercent');
  await click('[data-page="modules"]');
  await click('[data-file="CouponRules.cs"]');await click('[data-node="'+field.id+'"]');
  d.querySelector('#property-value').value='25';await click('#propose-property');
  check(w.depthApp.state().screen==='review'&&d.querySelectorAll('.compare-grid .file-frame').length===2,'review shows both file states');check(d.querySelectorAll('.diff .added').length>0&&d.querySelectorAll('.diff .removed').length>0,'line diff rendered');check(fs.readFileSync(file,'utf8')===before,'unapproved source untouched');
  await click('[data-apply]');check(fs.readFileSync(file,'utf8').includes('= 25'),'approval applies real change');await click('[data-undo]');await click('[data-apply]');check(fs.readFileSync(file,'utf8')===before,'undo restores source');
  await click('[data-page="modules"]');await click('#split');check(d.querySelectorAll('[name="transform-module"]:checked').length===1,'selected functional module for split');await click('#close-dialog');
  await click('[data-screen="review"]');await click('#validation-profile');await click('#save-profile');check((await request('/validation/profile')).requirePass,'validation profile saved');
  const fresh=await request('/graph');await request('/property/propose',{id:field.id,value:'30',revision:fresh.revision});await click('[data-screen="review"]');await click('[data-review]');check(d.querySelector('[data-apply]').disabled,'required validation blocks apply');await click('[data-dismiss]');
  await click('[data-page="modules"]');check((await request('/pending')).proposals.length===0,'dismiss removes proposal');
  picker=path.join(out,'second');fs.mkdirSync(picker);fs.writeFileSync(path.join(picker,'Other.cs'),'public class Other { public int Value = 4; }');
  await click('#integrate');await click('#choose-source');check(d.querySelectorAll('[name="transform-module"]').length>0,'integration loads second project modules');await click('#close-dialog');
  await click('#open');check(w.depthApp.state().projectId!==graph.projectId,'project switch clears context');check(!d.querySelector('#content').textContent.includes('CouponRules'),'old source not retained');
  check(d.querySelector('.preview-sheet')===null&&d.querySelector('.entry-list')!==null,'project without preview shows real declarations');
  check(!w.depthApp.state().memberIds.some(id=>initial.memberIds.includes(id)),'project switch clears all previous assembly IDs');
  const otherView=await request('/view');await verifyComposition(otherView.cards.find(c=>c.kind==='NamedType').id,'second project type');
  fs.writeFileSync(path.join(picker,'Other.cs'),'public class Other { public string Value = "<img src=x onerror=alert(1)>"; }');await click('#refresh');check(d.querySelector('#content img')===null,'source HTML cannot execute');
  fs.writeFileSync(path.join(picker,'Other.cs'),'public class Other { public void A() { B(); } public void B() { A(); } }');await click('#refresh');
  const cycleGraph=await request('/graph'),cycleA=cycleGraph.entities.find(e=>e.name==='A');
  await click('[data-node="'+cycleA.id+'"] [data-open-composition]');await verifyComposition(cycleA.id,'cyclic dependencies');
  check(new Set(w.depthApp.state().memberIds).size===w.depthApp.state().memberIds.length,'cycle does not duplicate nodes');
  picker=path.join(out,'empty');fs.mkdirSync(picker);await click('#open');
  check(d.querySelectorAll('[data-node]').length===0&&d.querySelectorAll('[data-edge]').length===0,'empty project clears assembly');
  check(d.querySelector('#node-detail').textContent.includes('No modules')&&!d.querySelector('#content').textContent.includes('Other'),'empty project clears source and inspector');
  check(!d.querySelector('#selection-code').textContent&&d.querySelector('#selection-source').disabled,'empty project clears immediate source evidence too');
  // DOM drag events use an explicit host-path fixture; project import and source indexing use the real HTTP service.
  const drop=async(filePath,count=1)=>{
   dropPath=filePath;d.querySelector('#toast').hidden=true;
   const event=new w.Event('drop',{bubbles:true,cancelable:true});
   Object.defineProperty(event,'dataTransfer',{value:{types:['Files'],files:Array.from({length:count},()=>new w.File([''],path.basename(filePath)))}});
   d.body.dispatchEvent(event);await sleep(30);await wait();return event;
  };
  const emptyId=w.depthApp.state().projectId;
  await drop(path.join(project,'CouponRules.cs'));
  check(w.depthApp.state().projectId===emptyId&&(await request('/graph')).projectId===emptyId&&!d.querySelector('#toast').hidden,'unsupported dropped file preserves both active projects and shows error');
  await drop(project,2);check(w.depthApp.state().projectId===emptyId,'multiple dropped folders do not replace project');
  d.querySelector('.workspace').scrollTop=300;d.querySelector('.assembly-pane').scrollTop=250;d.querySelector('#preview').scrollTop=100;d.querySelector('#source-dock').open=true;
  const dropEvent=await drop(project);
  check(dropEvent.defaultPrevented&&w.depthApp.state().projectId===graph.projectId,'dropping folder imports through the actual service');
  check(d.querySelector('.workspace').scrollTop===0&&d.querySelector('.assembly-pane').scrollTop===0&&d.querySelector('#preview').scrollTop===0&&!d.querySelector('#source-dock').open,'new project starts at its module canvas without stale scroll or source overlay');
  check(d.querySelector('.preview-sheet')&&w.depthApp.state().screen==='feature'&&d.querySelector('#sample-label').textContent==='','drop restores source-linked preview and clears example label');
  await verifyComposition((await request('/view')).preview.entryId,'dropped folder');
  const savedSelection=w.depthApp.state().entity;
  await drop(path.join(out,'deleted-folder'));
  check(w.depthApp.state().projectId===graph.projectId&&w.depthApp.state().entity===savedSelection,'unavailable dropped path preserves selection and project');
  d.querySelector('#toast').hidden=true;await click('#open-rationale');await drop(picker);
  check(w.depthApp.state().projectId===graph.projectId&&d.querySelector('#dialog').open,'drop cannot replace project while a dialog is open');
  d.querySelector('#toast').hidden=true;await click('#close-dialog');
  const manifest=path.join(picker,'package.json');fs.writeFileSync(manifest,'{"name":"empty-project"}');
  await drop(manifest);check(w.depthApp.state().projectId===emptyId&&!d.querySelector('.preview-sheet'),'manifest drop imports parent folder and clears previous preview');
  await drop(project);check(d.querySelector('#toast').hidden&&w.depthApp.state().projectId===graph.projectId,'another valid drop recovers after rejected drops');
  const result={passed:checks.length,checks,initialAssembly:{modules:initial.memberIds.length,relations:initial.relations.length},previewBindings:view.preview.bindings.length,scope:'Renderer DOM + actual .NET HTTP service; connectivity indicators use explicit response fixtures. Live Meta requests and Chromium rendering are not exercised.'};fs.writeFileSync(path.join(out,'report.json'),JSON.stringify(result,null,2));console.log(JSON.stringify({out,...result},null,2));
 }catch(e){fs.writeFileSync(path.join(out,'report.json'),JSON.stringify({checks,error:e.stack},null,2));console.error(e);process.exitCode=1;}finally{dom?.window.close();child.kill();}
})();
