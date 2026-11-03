'use strict';
// A new, isolated project only. Never changes a user's open Unity project.
const fs=require('node:fs'),path=require('node:path'),{spawn}=require('node:child_process');
const {FrameBridge}=require('./runtime-bridge.cjs'),{prepare}=require('./runtime-adapters.cjs');
const {commandFor}=require('./runtime-core.cjs');
const out=path.resolve(__dirname,'../artifacts/runtime-unity-'+Date.now()),project=path.join(out,'project');
fs.mkdirSync(out,{recursive:true});fs.cpSync(path.resolve(__dirname,'../samples/RuntimeUnity'),project,{recursive:true});
const report={scope:'Real isolated Unity project launch; not another open project or Electron pixels.',checks:[]};let bridge,installed,child;
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
async function main(){
 bridge=new FrameBridge(project);await bridge.start();installed=prepare(project,'unity',bridge.config());
 const spec=commandFor({kind:'unity'},project);const fd=fs.openSync(path.join(out,'stdio.log'),'a');
 child=spawn(spec.command,[...spec.args,'-logFile',path.join(out,'editor.log')],{cwd:project,windowsHide:true,stdio:['ignore',fd,fd]});fs.closeSync(fd);report.pid=child.pid;
 child.on('error',e=>{report.launchError=e.message;});let exited=false;child.on('exit',code=>{exited=true;report.exitCode=code;});
 for(let i=0;i<450&&!bridge.frame&&!exited&&!report.launchError;i++)await sleep(100);
 if(!bridge.frame)throw Error('No actual Unity frame received. See editor.log and stdio.log.');
 report.checks.push('actual Unity editor sends Game view frame');fs.writeFileSync(path.join(out,'01-game-view.png'),Buffer.from(bridge.frame.png,'base64'));
 bridge.input({type:'pick',x:.5,y:.5,requestId:'cube-source'});
 for(let i=0;i<100&&bridge.frame?.selection?.requestId!=='cube-source';i++)await sleep(100);
 if(!bridge.frame.selection?.sources.some(s=>s.path==='Assets/CounterCube.cs'))throw Error('Actual cube did not resolve its attached source.');
 report.checks.push('Game view center hit resolves actual attached MonoScript');report.status='passed';
}
main().catch(e=>{report.status='failed';report.error=e.message;process.exitCode=1;}).finally(async()=>{installed?.cleanup();if(child&&!child.killed)child.kill();await bridge?.close();fs.writeFileSync(path.join(out,'report.json'),JSON.stringify(report,null,2));console.log(JSON.stringify({status:report.status,pid:report.pid,out,error:report.error}));});
