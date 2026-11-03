// Document/data and DOM interaction checks; no native rendering or live services.
const fs=require('node:fs');
const path=require('node:path');
const assert=require('node:assert/strict');
const {createHash}=require('node:crypto');
const {JSDOM}=require('../../../desktop/node_modules/jsdom');
const root=path.resolve(__dirname,'..');
const read=file=>fs.readFileSync(path.join(__dirname,file),'utf8');
const hash=text=>createHash('sha256').update(text,'utf8').digest('hex');
const checks=[];
const test=(name,fn)=>{fn();checks.push(name);};
const sample=JSON.parse(read('sample.json'));
const contract=JSON.parse(read('contract.json'));
test('Every illustrative source and action delta has a matching content hash',()=>{
  for(const source of sample.sources){assert.equal(hash(source.after),source.afterSha256);assert.equal(source.before===null?null:hash(source.before),source.beforeSha256);}
  const changed=sample.sources.filter(s=>s.before!==s.after).map(s=>s.path).sort();
  assert.deepEqual(sample.action.changes.map(c=>c.path).sort(),changed);
  for(const change of sample.action.changes){const source=sample.sources.find(s=>s.path===change.path);assert.equal(change.beforeSha256,source.beforeSha256);assert.equal(change.afterSha256,source.afterSha256);}
});
test('Before and after snapshots match their own manifests',()=>{
  for(const side of ['before','after']){
    const manifest=sample.sources.filter(s=>s[side]!==null).map(s=>({path:s.path,sha256:s[side+'Sha256']})).sort((a,b)=>a.path<b.path?-1:a.path>b.path?1:0);
    assert.equal(hash(JSON.stringify(manifest)),sample.project[side+'Revision']);
  }
  assert.notEqual(sample.project.beforeRevision,sample.project.afterRevision);
});
test('Evidence references, edge endpoints and source ranges resolve',()=>{
  const ids=new Set(sample.evidence.map(e=>e.id));
  for(const entry of [...sample.modules,...sample.edges,...sample.decision.claims])for(const id of entry.evidenceIds)assert.ok(ids.has(id),id);
  for(const edge of sample.edges){assert.ok(sample.modules.some(m=>m.id===edge.from));assert.ok(sample.modules.some(m=>m.id===edge.to));}
  for(const evidence of sample.evidence.filter(e=>e.anchor)){
    const source=sample.sources.find(s=>s.path===evidence.anchor.path);assert.equal(evidence.anchor.sha256,source.afterSha256);
    assert.ok(evidence.anchor.startLine>0&&evidence.anchor.endLine>=evidence.anchor.startLine&&evidence.anchor.endLine<=source.after.split('\n').length);
  }
});
test('Specimen never claims live Meta or source-test success',()=>{
  assert.equal(sample.mode,'illustrative');assert.equal(sample.decision.execution,'not_called');assert.equal(sample.decision.model,null);
  assert.equal(sample.action.validation.status,'not_run');assert.equal(sample.action.validation.exitCode,null);
  assert.ok(contract.acceptance.every(a=>['not_run','not_measured'].includes(a.status)));
});
const dom=new JSDOM(read('index.html'),{url:'file:///'+path.join(__dirname,'index.html').replaceAll('\\','/'),runScripts:'outside-only'});
const w=dom.window,d=w.document;
const timers=new Map();let nextTimer=1;
w.setInterval=fn=>{const id=nextTimer++;timers.set(id,fn);return id;};w.clearInterval=id=>timers.delete(id);
w.eval(read('sample-data.js'));w.eval(read('flow.js'));
const packet=()=>JSON.parse(d.getElementById('context-json').textContent);
const step=index=>d.querySelectorAll('#steps button')[index].click();
const node=id=>d.querySelector('[data-module-id="'+id+'"]');
test('Offline browser data is identical to downloadable canonical example',()=>assert.deepEqual(JSON.parse(JSON.stringify(w.DEPTH_LENS_SAMPLE)),sample));
test('New queue is absent until analysis completes; old snapshot stays marked during indexing',()=>{
  step(0);assert.equal(d.querySelectorAll('.node').length,2);assert.equal(packet().snapshotRevision,sample.project.beforeRevision);
  step(1);assert.equal(d.querySelectorAll('.node').length,2);assert.equal(packet().freshness,'indexing');assert.equal(packet().useAsCurrentContext,false);
  step(2);assert.equal(d.querySelectorAll('.node').length,4);assert.equal(d.querySelectorAll('path.edge').length,3);assert.equal(packet().snapshotRevision,sample.project.afterRevision);
  assert.equal(packet().decisions.length,0);assert.ok(packet().modules.every(m=>m.contract===null));
});
test('Queue selection has the right neighbors, evidence and omitted module',()=>{
  step(4);node('mod-queue').focus();node('mod-queue').click();
  assert.equal(d.activeElement.dataset.moduleId,'mod-queue');assert.match(d.getElementById('module-name').textContent,/TaskQueue/);
  assert.deepEqual(packet().modules.map(m=>m.id).sort(),['mod-queue','mod-save','mod-test']);
  assert.deepEqual(packet().omittedModuleIds,['mod-editor']);
  assert.equal(packet().decisions.length,1);assert.match(d.getElementById('evidence').textContent,/src\/TaskQueue.ts:4/);
});
test('Difficulty changes explanation length without changing machine facts',()=>{
  const snapshots=[],lengths=[];
  for(const value of ['beginner','intermediate','expert']){d.getElementById('level').value=value;d.getElementById('level').dispatchEvent(new w.Event('change'));lengths.push(d.getElementById('explanation-text').textContent.length);snapshots.push(JSON.stringify(packet()));}
  assert.ok(lengths[0]>lengths[1]&&lengths[1]>lengths[2]);assert.equal(new Set(snapshots).size,1);
});
test('Stale explanation is withheld from the next context packet',()=>{
  const toggle=d.getElementById('stale');toggle.checked=true;toggle.dispatchEvent(new w.Event('change'));
  assert.equal(packet().useAsCurrentContext,false);assert.equal(packet().freshness,'stale_example');assert.equal(packet().decisions.length,0);
  assert.ok(packet().modules.every(m=>m.contract===null&&m.evidence.length===0));assert.match(d.getElementById('explanation-text').textContent,/후속 변경/);
  toggle.checked=false;toggle.dispatchEvent(new w.Event('change'));assert.equal(packet().decisions.length,1);
});
test('Context disclosure and reset remain usable with keyboard focus',()=>{
  d.getElementById('context-toggle').click();assert.equal(d.getElementById('context-panel').hidden,false);
  assert.equal(d.getElementById('context-toggle').getAttribute('aria-expanded'),'true');
  d.getElementById('reset').click();assert.equal(d.querySelectorAll('.node').length,2);assert.equal(packet().decisions.length,0);
  const button=d.querySelectorAll('#steps button')[4];button.focus();button.click();assert.equal(d.activeElement.dataset.step,'4');
});
test('Playback pauses and finishes without leaving a timer or inventing test success',()=>{
  d.getElementById('reset').click();d.getElementById('play').click();assert.equal(timers.size,1);
  [...timers.values()][0]();d.getElementById('play').click();assert.equal(timers.size,0);
  d.getElementById('play').click();for(let i=0;i<5&&timers.size;i++)[...timers.values()][0]();
  assert.equal(timers.size,0);assert.equal(d.querySelector('#steps [aria-pressed=true]').dataset.step,'5');assert.equal(packet().validation.status,'not_run');
});
w.close();
const pages=['index.html','portfolio/index.html','references/index.html','references/brief.html','work-memory/index.html'];
let refs=0,images=0;
test('All five local pages resolve links, scripts, images and fragment targets',()=>{
  for(const file of pages){
    const pagePath=path.join(root,file);const doc=new JSDOM(fs.readFileSync(pagePath,'utf8')).window.document;
    assert.ok(doc.querySelector('title')?.textContent);const ids=[...doc.querySelectorAll('[id]')].map(e=>e.id);assert.equal(new Set(ids).size,ids.length);
    for(const img of doc.images){images++;assert.ok(img.hasAttribute('alt'));}
    for(const element of doc.querySelectorAll('[href],[src]')){
      const url=element.getAttribute('href')||element.getAttribute('src');if(!url||/^(https?:|data:|mailto:)/.test(url))continue;
      const [filepart,fragment]=url.split('#');const target=path.resolve(path.dirname(pagePath),decodeURIComponent(filepart||path.basename(pagePath)).split('?')[0]);
      assert.ok(target.startsWith(root+path.sep),url);
      if(!target.endsWith('verification.json'))assert.ok(fs.existsSync(target),file+' -> '+url);
      if(fragment&&target.endsWith('.html')){const t=new JSDOM(fs.readFileSync(target,'utf8')).window.document;assert.ok(t.getElementById(decodeURIComponent(fragment)),url);}
      refs++;
    }
  }
});
const verification={status:'passed',checks,checksPassed:checks.length,scope:'Source-text hash and record consistency, local links and jsdom interaction only.',notTested:['browser pixels/layout','OS transparency','live MCP transport or CLI integration','filesystem events','Meta API','execution of the illustrative TypeScript sources'],files:Object.fromEntries(['index.html','flow.css','flow.js','contract.json','sample.json','sample-data.js','build-sample.cjs','verify.cjs'].map(file=>[file,hash(read(file))]))};
fs.writeFileSync(path.join(__dirname,'verification.json'),JSON.stringify(verification,null,2)+'\n');
const galleryDom=new JSDOM(fs.readFileSync(path.join(root,'references/index.html'),'utf8'),{runScripts:'dangerously'});
const toggle=galleryDom.window.document.querySelector('.toggle');
const grid=galleryDom.window.document.querySelector('.grid');
const before=grid.className;toggle.click();assert.notEqual(grid.className,before);toggle.click();assert.equal(grid.className,before);galleryDom.window.close();
fs.writeFileSync(path.join(root,'verification.json'),JSON.stringify({status:'passed',pages:pages.length,localReferences:refs,images,referenceScenes:12,actualArchiveCaptures:8,galleryToggle:true,workMemoryChecks:checks.length,scope:'Local HTML links, image labels, example hashes and DOM interaction. Not a browser pixel/layout audit or live MCP/Meta test.'},null,2)+'\n');
console.log(JSON.stringify({status:'passed',checks:checks.length,pages:pages.length,localReferences:refs,images}));
