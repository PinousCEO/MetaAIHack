'use strict';
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),assert=require('node:assert/strict'),{JSDOM}=require('jsdom');
const {resolveProjectDrop}=require('./project-drop.cjs');
const root=path.resolve(__dirname,'..'),out=path.join(root,'artifacts','project-drop-'+Date.now());fs.mkdirSync(out,{recursive:true});
const checks=[],check=(condition,name)=>{assert(condition,name);checks.push(name);};
const folder=path.join(out,'프로젝트 with spaces');fs.mkdirSync(folder);const manifest=path.join(folder,'package.json');fs.writeFileSync(manifest,'{}');
(async()=>{
 check(resolveProjectDrop([folder])===fs.realpathSync(folder),'local folder including spaces and Unicode');
 check(resolveProjectDrop([manifest])===fs.realpathSync(folder),'project manifest resolves exactly its containing folder');
 const solution=path.join(folder,'Example.sln');fs.writeFileSync(solution,'');check(resolveProjectDrop([solution])===fs.realpathSync(folder),'solution resolves project folder');
 for(const [input,label] of [[[],'empty drop'],[[folder,folder],'multiple projects'],[['relative/path'],'relative path'],[[''],'empty native path'],[[path.join(out,'missing')],'missing item']]){
  assert.throws(()=>resolveProjectDrop(input));checks.push('reject '+label);
 }
 for(const name of ['file.zip','notes.txt','.env']){const p=path.join(folder,name);fs.writeFileSync(p,'not executable');assert.throws(()=>resolveProjectDrop([p]));checks.push('reject '+name);}
 let bridge,calls=[],nativeFile={native:true};
 vm.runInNewContext(fs.readFileSync(path.join(__dirname,'preload.cjs'),'utf8'),{require:()=>({contextBridge:{exposeInMainWorld:(_name,value)=>bridge=value},ipcRenderer:{invoke:async(route,paths)=>{calls.push({route,paths});return folder;}},webUtils:{getPathForFile:file=>{if(file!==nativeFile)return '';return folder;}}})});
 await bridge.projectFromDrop([nativeFile]);check(calls[0].route==='project-drop-paths'&&calls[0].paths[0]===folder,'preload obtains paths via webUtils and dedicated IPC');
 await assert.rejects(bridge.projectFromDrop([{}]));check(calls.length===1,'synthetic File without native backing cannot reach host');
 const dom=new JSDOM('<body><div id="child"></div></body>',{runScripts:'outside-only'}),w=dom.window,d=w.document;
 w.eval(fs.readFileSync(path.join(__dirname,'ui/project-drop.js'),'utf8'));
 let opened=[],errors=[],busy=false,available=true,release;
 new w.DepthProjectDrop({available:()=>available,busy:()=>busy,open:async files=>{opened.push(files);if(release===true)await new Promise(r=>release=r);},error:e=>errors.push(e.message)});
 const emit=(type,files=[],target=d.body,types=['Files'])=>{const e=new w.Event(type,{bubbles:true,cancelable:true});Object.defineProperty(e,'dataTransfer',{value:{types,files,dropEffect:'none'}});target.dispatchEvent(e);return e;};
 const settle=()=>new Promise(r=>setTimeout(r,0)),file=new w.File([''],'project');
 emit('dragenter');emit('dragenter',[],d.querySelector('#child'));check(!d.querySelector('#project-drop-zone').hidden,'external drag shows overlay');
 emit('dragleave',[],d.querySelector('#child'));check(!d.querySelector('#project-drop-zone').hidden,'crossing child controls does not flicker the drop overlay');
 w.dispatchEvent(new w.Event('blur'));check(d.querySelector('#project-drop-zone').hidden,'leaving app clears overlay');
 const dropped=emit('drop',[file]);await settle();check(dropped.defaultPrevented&&opened.length===1&&opened[0][0]===file,'drop forwards original File exactly once');
 emit('drop',[file,file]);await settle();check(opened.length===1&&errors.at(-1).includes('one project'),'multiple folders do not import');
 busy=true;emit('drop',[file]);await settle();check(opened.length===1&&errors.at(-1).includes('current operation'),'busy workspace keeps current project');busy=false;
 release=true;emit('drop',[file]);await settle();emit('drop',[file]);await settle();check(opened.length===2,'in-flight drop cannot start a second import');release();await settle();
 available=false;emit('drop',[file]);await settle();check(opened.length===2&&errors.at(-1).includes('desktop app'),'standalone page explains missing host');
 check(!emit('drop',[],d.body,['text/plain']).defaultPrevented,'internal text dragging is untouched');
 emit('dragenter');d.dispatchEvent(new w.KeyboardEvent('keydown',{key:'Escape',bubbles:true}));check(d.querySelector('#project-drop-zone').hidden,'Escape clears overlay');
 dom.window.close();fs.writeFileSync(path.join(out,'report.json'),JSON.stringify({passed:checks.length,checks,scope:'Filesystem resolver, explicit Electron preload fixture and DOM drag events. Not native OS drag-and-drop.'},null,2));
 console.log(JSON.stringify({out,passed:checks.length}));
})().catch(e=>{console.error(e);process.exitCode=1;});
