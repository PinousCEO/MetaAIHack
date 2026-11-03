const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {JSDOM}=require('../../../desktop/node_modules/jsdom');
const M=require('./dock-model.js');
const checks=[],check=(name,fn)=>{fn();checks.push(name);};
check('Default workspace gives preview most left height and puts Console/CLI in one short dock',()=>{
 const s=M.initial();assert(M.validate(s));assert.equal(s.root.a.ratio,.86);assert.deepEqual(M.find(s,'utility').tabs,['console','chat']);assert.notEqual(s.root.a.ratio,s.root.b.ratio);
});
check('All four edge placements preserve panels once and can merge back into tabs',()=>{
 for(const zone of ['left','right','top','bottom']){let s=M.dock(M.initial(),'chat','modules',zone);assert(M.validate(s));assert.equal(M.owner(s,'chat').tabs.length,1);s=M.dock(s,'chat','utility','center');assert(M.validate(s));assert.deepEqual(M.owner(s,'chat').tabs,['console','chat']);}
});
check('Moving a last panel prunes empty splits, self-drop does not remove it',()=>{
 let s=M.dock(M.initial(),'hierarchy','modules','center');assert(M.validate(s));assert.equal(s.root.b.kind,'group');s=M.dock(s,'preview','preview','left');assert(M.validate(s));assert(M.owner(s,'preview'));
});
check('Workspace edge docking makes a full-height independent CLI column',()=>{
 const s=M.preset('cli');assert(M.validate(s));assert.equal(s.root.axis,'x');assert.deepEqual(s.root.b.tabs,['chat']);assert(M.find(s,'utility').collapsed);assert(M.owner(s,'preview'));assert(M.owner(s,'hierarchy'));
 for(const edge of ['left','right','top','bottom'])assert(M.validate(M.dockWorkspace(M.initial(),'chat',edge)));
});
check('Floating groups can split, merge, close and reopen without losing panels',()=>{
 let s=M.float(M.initial(),'chat');assert.equal(s.floats.length,1);s=M.dock(s,'console',M.owner(s,'chat').id,'bottom');assert(M.validate(s));assert.equal(s.floats[0].node.kind,'split');s=M.hide(s,'chat');assert(M.validate(s));s=M.show(s,'chat');assert(M.validate(s));assert.equal(s.hidden.length,0);
});
check('Closing all panels remains recoverable',()=>{
 let s=M.initial();for(const p of Object.keys(M.panels))s=M.hide(s,p);assert(M.validate(s));assert.equal(s.root,null);for(const p of Object.keys(M.panels))s=M.show(s,p);assert(M.validate(s));assert.equal(s.hidden.length,0);
});
check('Invalid and duplicate saved states are rejected',()=>{
 const s=M.initial();s.root.b.a.tabs.push('chat');assert(!M.validate(s));assert(!M.validate({}));const x=M.initial();x.root.ratio=NaN;assert(!M.validate(x));assert.throws(()=>M.dock(M.initial(),'chat','missing','center'));assert.throws(()=>M.dock(M.initial(),'other','modules','center'));
});
check('Repeated moves remain valid across floating/docking and serialize faithfully',()=>{
 let s=M.initial();const names=Object.keys(M.panels),zones=['left','right','top','bottom','center'];
 for(let i=0;i<100;i++){const p=names[i%names.length];if(i%7===0)s=M.float(s,p);else{const dst=M.nodes(s).filter(n=>n.kind==='group'&&!n.tabs.includes(p))[0];if(dst)s=M.dock(s,p,dst.id,zones[i%5]);}assert(M.validate(s));}
 assert(M.validate(JSON.parse(JSON.stringify(s))));
});
const html=fs.readFileSync(path.join(__dirname,'prototype.html'),'utf8');
function make(saved){
 const dom=new JSDOM(html,{url:'http://dock.local/',runScripts:'outside-only',pretendToBeVisual:true}),w=dom.window;
 w.HTMLDialogElement.prototype.showModal=function(){this.open=true;};w.HTMLDialogElement.prototype.close=function(){this.open=false;};
 if(saved)w.localStorage.setItem('depth-dock-concept-v1',saved);
 w.eval(fs.readFileSync(path.join(__dirname,'dock-model.js'),'utf8'));w.eval(fs.readFileSync(path.join(__dirname,'prototype.js'),'utf8'));
 return dom;
}
const dom=make(),w=dom.window,d=w.document,D=w.DockDemo;
const event=(type,props)=>{const e=new w.Event(type,{bubbles:true,cancelable:true});for(const [k,v]of Object.entries(props||{}))Object.defineProperty(e,k,{value:v});return e;};
const rect={left:400,top:100,width:500,height:400,right:900,bottom:500};
check('Renderer starts with four unequal dock groups and five movable tabs',()=>{
 assert.equal(d.querySelectorAll('.group').length,4);assert.equal(d.querySelectorAll('.dock-tab').length,5);assert.equal(d.querySelector('#dock-root > .split').style.gridTemplateColumns,'minmax(0,0.57fr) 6px minmax(0,0.43000000000000005fr)');
});
check('Native drag event route docks a tab at the right edge and shows a drop guide',()=>{
 const dt={setData(){},effectAllowed:'',dropEffect:''};const tab=d.querySelector('[data-panel=chat]'),target=d.querySelector('[data-group=modules]');
 target.getBoundingClientRect=()=>rect;
 tab.dispatchEvent(event('dragstart',{dataTransfer:dt}));
 target.dispatchEvent(event('dragover',{dataTransfer:dt,clientX:895,clientY:250}));
 assert.equal(d.querySelector('#drop-indicator').hidden,false);assert.match(d.querySelector('#drop-indicator').textContent,/right/);
 target.dispatchEvent(event('drop',{dataTransfer:dt,clientX:895,clientY:250}));
 assert(M.validate(D.getState()));assert.notEqual(M.owner(D.getState(),'chat').id,'utility');assert.equal(M.owner(D.getState(),'chat').tabs.length,1);
});
check('Draft and graph selection survive docking, floating, close and reopen',()=>{
 const text=d.querySelector('[aria-label="Draft message"]');text.value='Keep this draft';D.select('Estimate');D.float('chat');assert.equal(d.querySelector('textarea').value,'Keep this draft');D.hide('chat');D.show('chat');assert.equal(d.querySelector('textarea').value,'Keep this draft');assert.equal(D.getSelection(),'Estimate');
});
check('Pointer drop at the outer workspace edge splits the whole workspace',()=>{
 D.reset();const dt={setData(){},effectAllowed:'',dropEffect:''};d.querySelector('[data-panel=chat]').dispatchEvent(event('dragstart',{dataTransfer:dt}));
 d.querySelector('#stage').dispatchEvent(event('drop',{dataTransfer:dt,clientX:1197,clientY:250}));const s=D.getState();assert(M.validate(s));assert.deepEqual(Array.from(s.root.b.tabs),['chat']);
});
check('Floating move and resize respond to pointer events',()=>{
 D.float('chat');let f=D.getState().floats.find(x=>x.node.tabs.includes('chat'));let box=d.querySelector('[data-float="'+f.id+'"]');const move=box.querySelector('.float-move'),before={...f.rect};
 move.dispatchEvent(event('pointerdown',{button:0,clientX:100,clientY:100}));d.dispatchEvent(event('pointermove',{clientX:150,clientY:125}));d.dispatchEvent(event('pointerup',{clientX:150,clientY:125}));
 f=D.getState().floats.find(x=>x.id===f.id);assert.equal(f.rect.x,before.x+50);assert.equal(f.rect.y,before.y+25);
 const grip=box.querySelector('.float-resize'),width=f.rect.w;grip.dispatchEvent(event('pointerdown',{button:0,clientX:400,clientY:350}));d.dispatchEvent(event('pointermove',{clientX:455,clientY:380}));d.dispatchEvent(event('pointerup',{}));assert.equal(D.getState().floats.find(x=>x.id===f.id).rect.w,width+55);
});
check('Splitter pointer and keyboard updates are persisted',()=>{
 D.reset();const box=d.querySelector('[data-split=workspace]'),sep=box.querySelector(':scope > .separator');box.getBoundingClientRect=()=>({left:0,top:0,width:1000,height:700});
 sep.dispatchEvent(event('pointerdown',{button:0,clientX:570,clientY:100}));d.dispatchEvent(event('pointermove',{clientX:650,clientY:100}));d.dispatchEvent(event('pointerup',{}));assert.equal(D.getState().root.ratio,.65);
 sep.dispatchEvent(new w.KeyboardEvent('keydown',{key:'ArrowLeft',bubbles:true}));assert.equal(D.getState().root.ratio,.625);assert.equal(JSON.parse(w.localStorage.getItem('depth-dock-concept-v1')).root.ratio,.625);
});
check('Collapse, double-click maximize and Escape restore preserve arrangement',()=>{
 D.collapse('utility');assert(d.querySelector('[data-group=utility]').classList.contains('collapsed'));
 d.querySelector('[data-panel=preview]').dispatchEvent(new w.MouseEvent('dblclick',{bubbles:true}));assert.equal(d.querySelectorAll('.group').length,1);assert.equal(D.getState().maximized,'preview');
 d.dispatchEvent(new w.KeyboardEvent('keydown',{key:'Escape',bubbles:true}));assert.equal(d.querySelectorAll('.group').length,4);assert(M.find(D.getState(),'utility').collapsed);
});
check('Keyboard-accessible move dialog rearranges without drag',()=>{
 const menu=d.querySelector('[data-group=modules] [aria-label="Move or float Modules"]');menu.click();assert(d.querySelector('#move-dialog').open);
 d.querySelector('#move-destination').value='preview';d.querySelector('#move-placement').value='center';d.querySelector('#apply-move').click();assert.equal(M.owner(D.getState(),'modules').id,'preview');assert(!d.querySelector('#move-dialog').open);
});
check('Saved layout and reload restore structure; malformed storage resets safely',()=>{
 D.preset('cli');d.querySelector('#save-layout').click();const saved=w.localStorage.getItem('depth-dock-concept-v1-saved');D.reset();
 const picker=d.querySelector('#layout-picker');picker.value='saved';picker.dispatchEvent(new w.Event('change'));assert.equal(JSON.stringify(D.getState()),saved);
 const reload=make(saved);assert.deepEqual(JSON.parse(JSON.stringify(reload.window.DockDemo.getState())),JSON.parse(saved));reload.window.close();
 const invalid=make('{"version":1}');assert(M.validate(invalid.window.DockDemo.getState()));invalid.window.close();
});
check('Search and explicit sample chat input work without sending any request',()=>{
 D.show('hierarchy');const input=d.querySelector('[aria-label="Find module"]');input.value='DiscountPercent';input.dispatchEvent(new w.Event('input'));
 const visible=[...d.querySelectorAll('.tree button')].filter(b=>!b.hidden);assert.equal(visible.length,1);assert.match(visible[0].textContent,/DiscountPercent/);
 D.show('chat');const chat=d.querySelector('textarea');chat.value='<script>not executable</script>';chat.form.dispatchEvent(new w.Event('submit',{bubbles:true,cancelable:true}));assert.match(d.querySelector('.messages').textContent,/DRAFT · NOT SENT/);assert.equal(d.querySelectorAll('.messages script').length,0);
});
const report={schema:'dock-concept-checks-1',passed:checks.length,scope:'Layout model and injected DOM input events; no browser pixels, OS drag or EXE/Meta validation',checks};
fs.writeFileSync(path.join(__dirname,'interaction-checks.json'),JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify({passed:checks.length,scope:report.scope}));
dom.window.close();

