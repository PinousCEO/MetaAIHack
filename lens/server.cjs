'use strict';
const http=require('node:http'),fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const {Lens,write,redact}=require('./core.cjs');const {rpc,call}=require('./protocol.cjs');
async function start({state,connection,folder,autoExplain=true,meta,pollMs}={}){
  state=path.resolve(state||path.join(__dirname,'../artifacts/lens-runtime'));connection=path.resolve(connection||path.join(state,'connection.json'));
  const lens=new Lens(state,{autoExplain,meta,pollMs});const token=crypto.randomBytes(32).toString('hex');
  const clients=new Set();
  const server=http.createServer(async(req,res)=>{
    const authorized=req.headers.authorization==='Bearer '+token;
    if(!authorized||req.headers.origin){res.writeHead(403);res.end('Forbidden');return;}
    const url=new URL(req.url,'http://127.0.0.1');
    if(url.pathname==='/events'&&req.method==='GET'){res.writeHead(200,{'Content-Type':'text/event-stream','Cache-Control':'no-cache'});res.write('data: '+JSON.stringify({kind:'connected',sequence:lens.seq})+'\n\n');clients.add(res);req.on('close',()=>clients.delete(res));return;}
    try{
      let body={};if(req.method==='POST'){const chunks=[];let size=0;for await(const chunk of req){size+=chunk.length;if(size>1000000)throw Error('Request too large.');chunks.push(chunk);}body=JSON.parse(Buffer.concat(chunks).toString('utf8')||'{}');}
      let result;
      if(url.pathname==='/health')result={ok:true,version:'0.2.0',pid:process.pid};
      else if(url.pathname==='/state'&&req.method==='GET')result=lens.publicState();
      else if(url.pathname==='/work'&&req.method==='POST')result=require('./work-view.cjs').workView(lens,body);
      else if(url.pathname==='/open'&&req.method==='POST')result=await lens.open(body.folder);
      else if(url.pathname==='/session'&&req.method==='POST')result=lens.sessions.update(body);
      else if(url.pathname==='/rpc'&&req.method==='POST')result=await rpc(lens,body,req.headers['x-depth-session']||'');
      else if(url.pathname==='/call'&&req.method==='POST')result=await call(lens,body.name,body.arguments||{},req.headers['x-depth-session']||'');
      else if(url.pathname==='/settings'&&req.method==='POST'){if(typeof body.autoExplain!=='boolean')throw Error('Invalid setting.');lens.autoExplain=body.autoExplain;lens.preferences.autoExplain=body.autoExplain;write(path.join(lens.state,'preferences.json'),{...lens.preferences,lastFolder:lens.project?.root});result={autoExplain:lens.autoExplain};}
      else if(url.pathname==='/export'&&req.method==='POST')result=lens.exportToProject();
      else if(url.pathname==='/history'&&req.method==='POST'){lens.require();if(!/^[a-f0-9]{64}$/.test(body.revision))throw Error('Invalid revision.');result=JSON.parse(fs.readFileSync(path.join(lens.directory,'snapshots',body.revision+'.json'),'utf8'));}
      else throw Error('Unknown endpoint.');
      res.writeHead(200,{'Content-Type':'application/json; charset=utf-8'});res.end(JSON.stringify(result??{}));
    }catch(e){res.writeHead(400,{'Content-Type':'application/json'});res.end(JSON.stringify({error:redact(e.message)}));}
  });
  const broadcast=event=>{for(const client of clients)client.write('data: '+JSON.stringify(event)+'\n\n');};lens.on('update',broadcast);lens.on('status',broadcast);
  await new Promise((resolve,reject)=>{server.on('error',reject);server.listen(0,'127.0.0.1',resolve);});
  const info={endpoint:'http://127.0.0.1:'+server.address().port,token,pid:process.pid,version:'0.2.0'};write(connection,info);
  const bridge=path.join(__dirname,'bridge.cjs');write(path.join(state,'mcp-config.json'),{mcpServers:{'depth-lens':{command:process.execPath,args:[bridge,'--connection',connection]}}});
  const heartbeat=setInterval(()=>{for(const client of clients)client.write(': heartbeat\n\n');},12000);
  const close=()=>{clearInterval(heartbeat);for(const client of clients)client.end();lens.close();server.close();if(fs.existsSync(connection)){try{if(JSON.parse(fs.readFileSync(connection)).pid===process.pid)fs.unlinkSync(connection);}catch{}}};
  if(folder)await lens.open(folder);return{lens,server,info,close,connection};
}
module.exports={start};
if(require.main===module){const args=process.argv.slice(2),get=(name,fallback)=>{const index=args.indexOf(name);return index<0?fallback:args[index+1];};start({state:get('--state'),connection:get('--connection'),folder:get('--folder'),autoExplain:!args.includes('--no-auto')}).then(service=>{process.stderr.write('Depth Lens service ready.\n');let closing=false;const done=()=>{if(closing)return;closing=true;service.close();};process.on('SIGINT',done);process.on('SIGTERM',done);const parent=Number(get('--parent','0'));if(parent){const timer=setInterval(()=>{try{process.kill(parent,0);}catch{clearInterval(timer);done();}},2000);timer.unref();}}).catch(e=>{process.stderr.write(redact(e.message)+'\n');process.exitCode=1;});}
