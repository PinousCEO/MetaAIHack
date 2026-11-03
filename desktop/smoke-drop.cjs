'use strict';
const fs=require('node:fs'),path=require('node:path');
// Chromium-backed files travel through the real preload and IPC. This is CDP input,
// not a claim that Windows File Explorer was operated by a person or OS automation.
exports.run=async({win,api,js,wait,check,capture,sleep,evidence,base,project})=>{
 const folder=path.join(evidence,'dropped project');
 fs.cpSync(path.join(base,'samples','TaskRunner'),folder,{recursive:true,filter:p=>!['bin','obj','.depth'].includes(path.basename(p))});
 const unsupported=path.join(evidence,'not-a-project.txt');fs.writeFileSync(unsupported,'Drop rejection probe');
 const manifest=fs.readdirSync(folder).find(name=>name.endsWith('.csproj'));
 if(!manifest)throw Error('Native drop fixture is missing its project file');
 const until=async(predicate,label)=>{for(let i=0;i<300;i++){if(await predicate())return;await sleep(100);}throw Error('Timed out: '+label);};
 const currentRoot=async()=>path.resolve((await api('/view')).root).toLowerCase();
 const sameRoot=async root=>(await currentRoot())===path.resolve(root).toLowerCase();
 const originalId=await js('depthApp.state().projectId');
 win.webContents.debugger.attach('1.3');
 try{
  const drop=async(files,screenshot)=>{
   await js('document.querySelector("#toast").hidden=true');
   const point=await js('({x:Math.round(innerWidth/2),y:Math.round(innerHeight/2)})');
   const data={items:[],files,dragOperationsMask:1};
   const send=type=>win.webContents.debugger.sendCommand('Input.dispatchDragEvent',{type,...point,data});
   await send('dragEnter');await send('dragOver');
   check(await js('!document.querySelector("#project-drop-zone").hidden'),'native file drag displays drop target');
   if(screenshot)await capture(screenshot,'feature');
   await send('drop');
  };
  await drop([folder],'22-drop-target');
  await until(()=>sameRoot(folder),'folder import');await wait();
  check(await js('depthApp.state().projectId')!==originalId,'native folder drop replaces active project');
  check(await js('depthApp.state().modules>0 && !document.querySelector(".preview-sheet")'),'dropped project has real source modules and no stale example preview');
  await capture('23-dropped-project','feature');
  const importedId=await js('depthApp.state().projectId');
  for(const files of [[unsupported],[folder,project]]){
   await drop(files);await until(()=>js('!document.querySelector("#toast").hidden'),'drop rejection feedback');
   check(await sameRoot(folder)&&await js('depthApp.state().projectId')===importedId,'invalid native drop preserves active project');
  }
  await capture('24-drop-rejected','feature');
  await drop([project]);await until(()=>sameRoot(project),'original project restore');await wait();
  check(await js('depthApp.state().projectId')===originalId,'native folder drop restores original source identity');
  await drop([path.join(folder,manifest)]);await until(()=>sameRoot(folder),'project-file import');await wait();
  check(await js('depthApp.state().projectId')===importedId,'native project-file drop resolves its parent folder');
  await drop([project]);await until(()=>sameRoot(project),'final original project restore');await wait();
  check(await js('!!document.querySelector(".preview-sheet") && document.querySelector("#project-drop-zone").hidden'),'returning project restores its preview and clears drop overlay');
 }finally{win.webContents.debugger.detach();}
};
