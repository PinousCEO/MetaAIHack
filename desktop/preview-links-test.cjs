'use strict';
const assert=require('node:assert/strict'),Links=require('./ui/preview-focus.js'),M=require('./ui/dock-model.js');
const entities=[['view','View'],['total','ViewElement'],['photo','ViewElement'],['title','ViewElement'],['label','ViewElement'],['calc','Method'],['rate','Field'],['image','Image'],['type','NamedType'],['idle','Method']].map(([id,kind])=>({id,kind}));
let seq=0;const r=(from,to,kind)=>({id:'r'+(++seq),from,to,kind});
const relations=[r('view','total','contains'),r('view','photo','contains'),r('view','title','contains'),r('view','label','contains'),r('total','view','view-owner'),r('photo','view','view-owner'),r('title','view','view-owner'),r('view','calc','view-action'),r('total','calc','view-binding'),r('label','calc','view-binding'),r('photo','image','view-binding'),r('calc','rate','references'),r('type','calc','contains'),r('type','rate','contains')];
const p={viewId:'view',bindings:['total','photo','title','label'].map(key=>({id:key,key}))},graph={entities,relations};
const index=Links.index(graph,p),keys=id=>index.related(id).matches.map(m=>m.key).sort(),checks=[];
function check(name,fn){fn();checks.push(name);}
check('Reverse source mapping selects computed displays and excludes unrelated images/text',()=>assert.deepEqual(keys('calc'),['label','total']));
check('Transitive dependencies resolve without following shared screen ownership',()=>assert.deepEqual(keys('rate'),['label','total']));
check('Assets map back to exact declared image consumers',()=>assert.deepEqual(keys('image'),['photo']));
check('Selecting a literal element preserves its own identity rather than the whole view',()=>assert.deepEqual(keys('title'),['title']));
check('Background maps to the screen and all declared elements',()=>assert.deepEqual(keys('view'),['label','photo','title','total']));
check('Unrelated source returns no fabricated preview hit',()=>assert.deepEqual(keys('idle'),[]));
check('A type can resolve bindings through its owned members',()=>assert.deepEqual(keys('type'),['label','total']));
check('Dependency cycles terminate with canonical evidence IDs',()=>{
 const cycle=Links.index({...graph,relations:[...relations,r('rate','calc','references')]},p).related('rate');
 assert.deepEqual(cycle.matches.map(m=>m.id).sort(),['label','total']);assert(cycle.matches.every(m=>m.via.length&&m.via.every(id=>relations.some(r=>r.id===id))));
});
check('Missing adapters and missing IDs fail closed',()=>{assert.equal(Links.index(graph,null).related('calc').scope,'unavailable');assert.deepEqual(keys('missing'),[]);});
check('Production layout keeps all seven real panels once through repeated docking',()=>{
 let s=M.initial();assert.equal(Object.keys(M.panels).length,7);
 for(const name of Object.keys(M.panels)){s=M.float(s,name);assert(M.validate(s));}
 for(const name of Object.keys(M.panels)){s=M.show(s,name);s=M.dockWorkspace(s,name,'right');assert(M.validate(s));}
 s=M.preset('cli');assert(M.validate(s));assert.deepEqual(s.root.b.tabs,['chat']);assert(M.find(s,'utility').collapsed);
});
console.log(JSON.stringify({passed:checks.length,scope:'Pure source relationship and production docking model fixtures',checks}));

