'use strict';
// Runs a separate real WinForms project, captures its actual client pixels and
// verifies pointer input + portable-PDB handler locations through the bridge.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),{spawn}=require('node:child_process');
const {FrameBridge}=require('./runtime-bridge.cjs'),{prepare}=require('./runtime-adapters.cjs');
const root=path.resolve(__dirname,'..'),out=path.join(root,'artifacts','runtime-winforms-'+Date.now());fs.mkdirSync(out,{recursive:true});
const project=path.join(out,'project');fs.cpSync(path.join(root,'samples/RuntimeWinForms'),project,{recursive:true,filter:p=>!['bin','obj','.depth'].includes(path.basename(p))});
const report={schema:'native-winforms-runtime-1',checks:[],captures:[],scope:'Actual target WinForms window/engine bridge, not Electron host pixels or other frameworks.'};let bridge,installed,child;
const check=(v,n)=>{assert(v,n);report.checks.push(n);};const sleep=ms=>new Promise(r=>setTimeout(r,ms));
async function command(args){return new Promise((resolve,reject)=>{const fd=fs.openSync(path.join(out,'build.log'),'a');const p=spawn('dotnet',args,{cwd:project,windowsHide:true,stdio:['ignore',fd,fd]});fs.closeSync(fd);p.on('error',reject);p.on('exit',code=>code===0?resolve():reject(Error('Build failed; see build.log')));});}
async function wait(predicate,seconds=15){for(let i=0;i<seconds*10;i++){if(predicate())return;await sleep(100);}throw Error('Timed out waiting for real engine frame/input.');}
async function main(){
 bridge=new FrameBridge(project);await bridge.start();installed=prepare(project,'winforms',bridge.config());
 await command(['restore','--ignore-failed-sources','-p:NuGetAudit=false','--nologo']);await command(['build','--no-restore','-p:UseSharedCompilation=false','--nologo']);check(true,'native adapter builds against actual .NET 8 Windows Forms SDK');
 const dll=path.join(project,'bin/Debug/net8.0-windows/RuntimeWinForms.dll');
 const fd=fs.openSync(path.join(out,'app.log'),'a');child=spawn('dotnet',[dll],{cwd:project,windowsHide:true,env:{...process.env,DEPTH_RUNTIME_CONFIG:path.join(project,'.depth/runtime-bridge.json'),DEPTH_RUNTIME_TEST:'1'},stdio:['ignore',fd,fd]});fs.closeSync(fd);
 child.on('error',e=>{report.launchError=e.message;});
 await wait(()=>!!bridge.frame);check(bridge.frame.engine==='native','real running WinForms app sends actual PNG and control geometry');
 const capture=name=>{fs.writeFileSync(path.join(out,name+'.png'),Buffer.from(bridge.frame.png,'base64'));report.captures.push(name+'.png');report.captureMode=bridge.frame.captureMode;};capture('01-initial');
 const button=bridge.frame.regions.find(r=>r.name==='Increment');check(!!button,'actual named button discovered without a manual source binding');
 const p={x:button.x+button.width/2,y:button.y+button.height/2};bridge.input({type:'pick',...p,requestId:'button-source'});await wait(()=>bridge.frame.selection?.requestId==='button-source');
 const picked=bridge.frame.selection;check(picked.sources.some(s=>s.path==='Program.cs'&&s.line>=26),'portable PDB resolves actual Increment handler source');report.picked=picked;
 const state=()=>{try{return JSON.parse(fs.readFileSync(path.join(project,'.depth/test-state.json'),'utf8'));}catch{return {};}};
 for(let count=1;count<=3;count++){bridge.input({type:'pointerDown',...p});bridge.input({type:'pointerUp',...p});await wait(()=>state().count===count);check(true,'real forwarded pointer invokes application handler exactly once: '+count);}
 const sequence=bridge.frame.sequence;await wait(()=>bridge.frame.sequence>sequence+1);capture('02-after-pointer');
 bridge.input({type:'pick',x:.1,y:.75,requestId:'text-source'});await wait(()=>bridge.frame.selection?.requestId==='text-source');check(bridge.frame.selection.name==='Note','normalized point identifies actual text input');
 bridge.input({type:'pointerDown',x:.2,y:.75});bridge.input({type:'pointerUp',x:.2,y:.75});bridge.input({type:'text',text:'BRIDGE_INPUT'});await wait(()=>state().text?.includes('BRIDGE_INPUT'));check(true,'forwarded text changes the real TextBox value');
 const original=fs.readFileSync(path.join(project,'Program.cs'),'utf8');fs.appendFileSync(path.join(project,'Program.cs'),'\n// change after compilation\n');
 bridge.input({type:'pick',...p,requestId:'stale-source'});await wait(()=>bridge.frame.selection?.requestId==='stale-source');check(!bridge.frame.selection.sources.some(s=>s.path==='Program.cs'),'changed source checksum cannot be mistaken for compiled code');fs.writeFileSync(path.join(project,'Program.cs'),original);
 report.status='passed';
}
main().catch(e=>{report.status='failed';report.error=e.stack;process.exitCode=1;}).finally(async()=>{if(child&&!child.killed)child.kill();installed?.cleanup();await bridge?.close();fs.writeFileSync(path.join(out,'report.json'),JSON.stringify(report,null,2));console.log(JSON.stringify({status:report.status,checks:report.checks.length,out,error:report.error?.split('\n')[0]}));});
