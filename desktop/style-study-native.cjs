const fs=require('node:fs'),path=require('node:path'),{spawn}=require('node:child_process');
const root=path.resolve(__dirname,'..'),out=path.join(root,'artifacts','style-study-launch-'+Date.now());fs.mkdirSync(out,{recursive:true});
let child;try{child=spawn(path.join(root,'artifacts','desktop','Depth AI.exe'),['--style-study-smoke'],{cwd:root,windowsHide:true,env:{...process.env,DEPTH_SMOKE_OUTPUT:out},stdio:['ignore','ignore','pipe']});}catch(e){fs.writeFileSync(path.join(out,'launch-error.txt'),String(e));fs.writeFileSync(path.join(out,'launch.json'),JSON.stringify({status:'launch-denied',error:e.code,reportExists:false},null,2));console.error(String(e));process.exit(1);}
const logs=[];child.stderr.on('data',b=>logs.push(b));let timeout=false;
const timer=setTimeout(()=>{timeout=true;child.kill();},45000);
child.on('error',e=>{clearTimeout(timer);fs.writeFileSync(path.join(out,'launch-error.txt'),String(e));process.exitCode=1;});
child.on('exit',code=>{clearTimeout(timer);fs.writeFileSync(path.join(out,'stderr.log'),Buffer.concat(logs));fs.writeFileSync(path.join(out,'launch.json'),JSON.stringify({code,timeout,reportExists:fs.existsSync(path.join(out,'report.json')),scope:'Native study launch under the agent environment; see report and PNGs before claiming success.'},null,2));console.log(JSON.stringify({code,timeout,out}));if(code!==0||timeout)process.exitCode=1;});
