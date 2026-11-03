// The audit itself must reject known layout faults. These are explicit rectangle fixtures, not pixels.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),{JSDOM}=require('jsdom');
const dom=new JSDOM('<!doctype html><svg id="graph"></svg><div data-node="sample"><div class="node-content-box"><div class="node-content"><div class="node-heading"><span class="node-glyph"></span><div class="node-title">DiscountPercent</div></div><div class="node-meta"><span class="role"></span><span class="value"></span></div></div></div></div><div class="workspace"><main></main><aside class="inspector"></aside></div>',{runScripts:'outside-only'}),w=dom.window,d=w.document;
const boxes=new Map(),box=(s,x,y,width,height)=>{const e=d.querySelector(s);boxes.set(e,{x,y,width,height});e.getBoundingClientRect=()=>{const r=boxes.get(e);return {...r,left:r.x,top:r.y,right:r.x+r.width,bottom:r.y+r.height};};return e;};
box('#graph',0,0,800,500);box('.node-content-box',10,10,180,110);box('.node-content',10,10,180,110);box('.node-heading',20,20,150,35);box('.node-glyph',20,20,24,24);box('.node-title',60,20,110,35);box('.node-meta',20,70,150,24);box('.role',20,70,90,24);box('.value',130,70,40,24);box('main',0,150,500,400);box('.inspector',500,150,260,400);
w.eval(fs.readFileSync(path.join(__dirname,'ui/style-study/layout-audit.js'),'utf8'));
const audit=()=>w.DepthStudyLayoutAudit();assert.equal(audit().available,true);assert.deepEqual([...audit().failures],[]);
boxes.get(d.querySelector('.node-glyph')).x=55;assert(audit().failures.some(x=>x.includes('Icon and title overlap')));boxes.get(d.querySelector('.node-glyph')).x=20;
Object.defineProperty(d.querySelector('.node-title'),'scrollHeight',{configurable:true,value:60});Object.defineProperty(d.querySelector('.node-title'),'clientHeight',{configurable:true,value:35});assert(audit().failures.some(x=>x.includes('title clipped')));Object.defineProperty(d.querySelector('.node-title'),'scrollHeight',{configurable:true,value:35});
boxes.get(d.querySelector('.value')).x=90;assert(audit().failures.some(x=>x.includes('Role and value overlap')));boxes.get(d.querySelector('.value')).x=130;
boxes.get(d.querySelector('.inspector')).x=450;assert(audit().failures.some(x=>x.includes('Workspace panes overlap')));boxes.get(d.querySelector('.inspector')).x=500;
boxes.get(d.querySelector('#graph')).width=0;assert.equal(audit().available,false);
console.log('6 layout-audit rectangle fixtures passed; not native/pixel verification.');dom.window.close();
