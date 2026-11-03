const {spawn}=require('node:child_process'),net=require('node:net'),path=require('node:path'),fs=require('node:fs'),assert=require('node:assert/strict');
(async()=>{
 const root=path.resolve(__dirname,'..'),out=path.join(root,'artifacts','desktop-lifecycle');fs.mkdirSync(out,{recursive:true});
 const probe=net.createServer();await new Promise(r=>probe.listen(0,'127.0.0.1',r));const port=probe.address().port;await new Promise(r=>probe.close(r));
 const child=spawn('dotnet',[path.join(root,'artifacts/desktop-service/Depth.Service.dll')],{windowsHide:true,stdio:'ignore',cwd:root,env:{...process.env,DEPTH_PARENT_PID:'2147483000',DEPTH_STORAGE:out,DEPTH_PORT:String(port),DEPTH_TOKEN:'lifecycle'}});
 let timeout;try{const code=await new Promise((resolve,reject)=>{child.once('exit',resolve);child.once('error',reject);timeout=setTimeout(()=>reject(Error('Orphan service did not stop')),10000);});assert.equal(code,0);fs.writeFileSync(path.join(out,'report.json'),JSON.stringify({passed:true,check:'Service exits cleanly when desktop parent no longer exists.'},null,2));console.log('PASS orphan service shuts down');}finally{clearTimeout(timeout);child.kill();}
})().catch(e=>{console.error(e);process.exitCode=1;});
