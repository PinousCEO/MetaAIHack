// Runs the shipped HTML/CSS/renderer in an isolated Firefox profile against the real service.
// This is browser pixel evidence, never an Electron/EXE execution claim.
const fs=require('node:fs'),path=require('node:path'),http=require('node:http'),net=require('node:net'),crypto=require('node:crypto'),{spawn}=require('node:child_process');
const root=path.resolve(__dirname,'..'),out=path.join(root,'artifacts','cohesion-browser-'+Date.now());
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
async function port(){const s=net.createServer();await new Promise(r=>s.listen(0,'127.0.0.1',r));const p=s.address().port;await new Promise(r=>s.close(r));return p;}
async function main(){
 fs.mkdirSync(out,{recursive:true});const project=path.join(out,'Checkout'),source=path.join(out,'Rewards');
 fs.cpSync(path.join(root,'samples/Checkout'),project,{recursive:true,filter:p=>!['.depth','bin','obj'].includes(path.basename(p))});fs.mkdirSync(source);
 fs.writeFileSync(path.join(source,'Rewards.cs'),'public static class Rewards { public static int Points(int count, int cents) => Pricing.Total(count, cents) / 100; }\npublic static class Pricing { public static int Total(int count, int cents) => count * cents; }');
 const servicePort=await port(),token=crypto.randomBytes(24).toString('hex'),nonce=crypto.randomBytes(24).toString('hex');
 const service=spawn('dotnet',[path.join(root,'artifacts/desktop-service/Depth.Service.dll')],{cwd:root,windowsHide:true,stdio:'ignore',env:{...process.env,DEPTH_PORT:String(servicePort),DEPTH_TOKEN:token,DEPTH_STORAGE:path.join(out,'state'),DEPTH_ENV_FILE:path.join(root,'.env'),DOTNET_gcServer:'0'}});
 const api=require('./service-client.cjs').createClient(()=> 'http://127.0.0.1:'+servicePort,token);
 let server,browser,held,report,activeScreen;const results=[];
 const bootstrap=()=>`'use strict';
 const prefix=${JSON.stringify('/'+nonce+'/')};
 window.depth={initial:async()=>(${JSON.stringify({project,example:true})}),chooseProject:async()=>${JSON.stringify(source)},request:async(route,body)=>{const r=await fetch(prefix+'api',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({route,body})});const v=await r.json();if(!r.ok)throw Error(v.error);return v;}};
 window.addEventListener('error',ev=>{window.rendererErrors??=[];window.rendererErrors.push(ev.message);});
 (async()=>{
 const sleep=ms=>new Promise(r=>setTimeout(r,ms));
 const wait=async()=>{for(let i=0;i<600;i++){if(window.depthApp?.state().ready&&!depthApp.state().busy)return;await sleep(50);}throw Error('Renderer timeout');};
 const click=async s=>{const el=document.querySelector(s);if(!el)throw Error('Missing control '+s);el.click();await wait();if(!document.querySelector('#toast').hidden)throw Error(document.querySelector('#toast').textContent);await sleep(80);};
 try{
 await wait();const scene=new URL(location.href).searchParams.get('screen')||'map';
 if(scene==='feature'){if(depthApp.state().screen!=='feature')await click('[data-screen="understand"]');if(depthApp.state().screen!=='feature')await click('[data-page="modules"]');}
 else if(scene==='understand'){const g=await depth.request('/graph');const type=g.entities.find(c=>c.kind==='NamedType'&&c.name==='CouponRules')||g.entities.find(c=>c.kind==='NamedType');await click('[data-understand="'+type.id+'"]');}
 else if(scene==='review'){const g=await depth.request('/graph'),field=g.entities.find(c=>c.name==='DiscountPercent');await depth.request('/property/propose',{id:field.id,value:'25',revision:g.revision});await click('[data-screen="review"]');await click('[data-review]');}
 else if(scene!=='map')await click('[data-screen="'+scene+'"]');
 if(scene==='integrate')await click('#choose-source');
 await document.fonts.ready;await Promise.all([...document.images].map(img=>img.complete?Promise.resolve():new Promise(r=>{img.onload=img.onerror=r;})));await sleep(450);
 const selectors=['.top','.rail','main','.inspector','footer'];const geometry=Object.fromEntries(selectors.map(s=>{const r=document.querySelector(s).getBoundingClientRect();return[s,{x:r.x,y:r.y,width:r.width,height:r.height}];}));
 const payload={screen:scene,width:innerWidth,height:innerHeight,state:depthApp.state(),geometry,checks:{noHorizontalOverflow:document.documentElement.scrollWidth<=innerWidth,mainHasSpace:geometry.main.width>=450&&geometry.main.height>=500,inspectorSeparate:scene==='feature'?document.querySelector('.preview-pane').getBoundingClientRect().right<=document.querySelector('.assembly-pane').getBoundingClientRect().left:geometry['.inspector'].x>=geometry.main.x+geometry.main.width-1,distinctSurfaces:scene!=='feature'||getComputedStyle(document.querySelector('.preview-sheet')).backgroundColor!==getComputedStyle(document.querySelector('#assembly-viewport')).backgroundColor,allNavItems:document.querySelectorAll('.rail>[data-screen]').length===6},errors:window.rendererErrors||[]};
 await fetch(prefix+'ready',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload)});
 }catch(err){await fetch(prefix+'ready',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({error:String(err.stack)})});}
 })();`;
 try{
  for(let i=0;i<200;i++){try{await api('/health');break;}catch{if(i===199)throw Error('Service startup failed');await sleep(100);}}
  server=http.createServer(async(req,res)=>{try{
   const url=new URL(req.url,'http://127.0.0.1');if(!url.pathname.startsWith('/'+nonce+'/')){res.writeHead(404).end();return;}
   const route=url.pathname.slice(nonce.length+2);
   const body=async()=>{let s='';for await(const chunk of req){s+=chunk;if(s.length>1024*1024)throw Error('Request too large');}return JSON.parse(s||'{}');};
   if(route==='api'){const b=await body();if(typeof b.route!=='string'||!/^\/[\w/-]+$/.test(b.route))throw Error('Invalid route');const v=await api(b.route,b.body);res.setHeader('Content-Type','application/json');res.end(JSON.stringify(v));return;}
   if(route==='ready'){report=await body();res.end('ok');if(held){held.end('// Renderer settled');held=null;}return;}
   if(route==='hold.js'){res.setHeader('Content-Type','text/javascript');if(report)res.end('// Renderer settled');else held=res;return;}
   if(route==='preview-bootstrap.js'){res.setHeader('Content-Type','text/javascript');res.end(bootstrap());return;}
   let file=path.resolve(__dirname,'ui',route||'index.html');if(!file.startsWith(path.resolve(__dirname,'ui')+path.sep)){res.writeHead(403).end();return;}
   if(file.endsWith('index.html')){const html=fs.readFileSync(file,'utf8').replace("connect-src 'none'","connect-src 'self'").replace(/<script src="icons\.js(?:\?[^"]*)?">/,match=>'<script src="preview-bootstrap.js"></script>'+match).replace('</body>','<script src="hold.js"></script></body>');res.setHeader('Content-Type','text/html;charset=utf-8');res.end(html);return;}
   const types={'.js':'text/javascript','.css':'text/css','.png':'image/png','.svg':'image/svg+xml'};res.setHeader('Content-Type',types[path.extname(file)]||'application/octet-stream');res.end(fs.readFileSync(file));
  }catch(err){res.writeHead(500,{'Content-Type':'application/json'});res.end(JSON.stringify({error:err.message}));}});
  await new Promise(r=>server.listen(0,'127.0.0.1',r));
  const screens=process.argv.slice(2).filter(s=>!s.startsWith('--'));const set=screens.length?screens:['map','feature','understand','relations','split','integrate','assets','review','feature-small'];
  for(const [i,name] of set.entries()){
   activeScreen=name;held=null;report=null;const scene=name.replace('-small',''),size=name.endsWith('-small')?'1120,780':'1586,992',file=path.join(out,String(i+1).padStart(2,'0')+'-'+name+'.png');
   const profile=path.join(out,'profile-'+i);fs.mkdirSync(profile);const url='http://127.0.0.1:'+server.address().port+'/'+nonce+'/index.html?screen='+scene;
   const stderr=[];browser=spawn('C:/Program Files/Mozilla Firefox/firefox.exe',['--headless','--new-instance','--profile',profile,'--screenshot',file,'--window-size',size,url],{windowsHide:true,stdio:['ignore','ignore','pipe']});browser.stderr.on('data',b=>stderr.push(b));
   let timer;const code=await new Promise((resolve,reject)=>{browser.once('error',reject);browser.once('exit',resolve);timer=setTimeout(()=>{browser.kill();reject(Error('Browser capture timeout: '+name));},45000);}).finally(()=>clearTimeout(timer));
   fs.writeFileSync(path.join(out,name+'-stderr.log'),Buffer.concat(stderr));
   const item={name,code,file,report,captured:fs.existsSync(file)};results.push(item);fs.writeFileSync(path.join(out,'report.json'),JSON.stringify({scope:'Firefox renders shipped UI against actual HTTP service; no Electron/EXE or OS pointer claim. No live Meta inference.',results},null,2));console.log(JSON.stringify({name,code,captured:item.captured,report}));
   if(!item.captured||!report||report.error||report.errors.length||Object.values(report.checks).some(v=>!v))throw Error('Browser verification failed: '+name);
  }
  console.log('BROWSER_EVIDENCE '+out);
 }catch(err){fs.writeFileSync(path.join(out,'failure.json'),JSON.stringify({screen:activeScreen,error:err.stack,results},null,2));throw err;}
 finally{browser?.kill();if(held)held.end();server?.closeAllConnections();server?.close();service.kill();}
}
main().catch(e=>{console.error(e);process.exitCode=1;});
