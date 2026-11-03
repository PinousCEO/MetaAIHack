'use strict';
// A per-project capability accepts actual engine frames and source locations.
// It cannot run shell commands, edit files, call Meta, or access another project.
const http=require('node:http'),crypto=require('node:crypto');
const {sourcePath}=require('./runtime-links.cjs');
function finite(v,min,max){return typeof v==='number'&&Number.isFinite(v)&&v>=min&&v<=max;}
function validateFrame(value,root){
 if(!value||value.protocol!=='depth-runtime/1'||!['unity','flutter','native'].includes(value.engine))throw Error('Invalid runtime protocol.');
 if(!Number.isSafeInteger(value.sequence)||value.sequence<0)throw Error('Invalid frame sequence.');
 if(!Number.isInteger(value.width)||!Number.isInteger(value.height)||!finite(value.width,1,8192)||!finite(value.height,1,8192)||value.width*value.height>16000000)throw Error('Invalid frame dimensions.');
 if(typeof value.png!=='string'||value.png.length>16*1024*1024||!/^[A-Za-z0-9+/]+={0,2}$/.test(value.png))throw Error('Invalid PNG payload.');
 const bytes=Buffer.from(value.png,'base64');if(bytes.length<24||bytes.subarray(0,8).toString('hex')!=='89504e470d0a1a0a'||bytes.readUInt32BE(16)!==value.width||bytes.readUInt32BE(20)!==value.height)throw Error('PNG dimensions do not match the frame.');
 if(!Array.isArray(value.regions)||value.regions.length>10000)throw Error('Invalid runtime regions.');
 const ids=new Set();const regions=value.regions.map(r=>{
  if(!r||typeof r.id!=='string'||r.id.length>160||ids.has(r.id)||typeof r.name!=='string'||r.name.length>250)throw Error('Invalid runtime region identity.');ids.add(r.id);
  if(![r.x,r.y,r.width,r.height].every(n=>finite(n,0,1))||r.x+r.width>1.001||r.y+r.height>1.001)throw Error('Invalid normalized region.');
  if(!Array.isArray(r.sources)||r.sources.length>100)throw Error('Invalid source locations.');
  const sources=r.sources.map(s=>({path:sourcePath(root,s?.path),line:Number.isSafeInteger(s?.line)&&s.line>0?s.line:null})).filter(s=>s.path);
  return {id:r.id,name:r.name,x:r.x,y:r.y,width:r.width,height:r.height,sources,depth:finite(r.depth,0,1000)?r.depth:0};
 });
 let selection=null;if(value.selection){const s=value.selection;if(typeof s.requestId!=='string'||s.requestId.length>80||typeof s.name!=='string'||s.name.length>250||!Array.isArray(s.sources)||s.sources.length>100)throw Error('Invalid picked source.');selection={requestId:s.requestId,name:s.name,sources:s.sources.map(v=>({path:sourcePath(root,v?.path),line:Number.isInteger(v?.line)&&v.line>0?v.line:null})).filter(v=>v.path)};}
 return {protocol:value.protocol,engine:value.engine,sequence:value.sequence,width:value.width,height:value.height,png:value.png,regions,selection,captureMode:['window-client','live-control-render'].includes(value.captureMode)?value.captureMode:'engine-render',capabilities:{pointer:value.capabilities?.pointer===true,scroll:value.capabilities?.scroll===true,text:value.capabilities?.text===true,inspect:value.capabilities?.inspect===true},capturedAt:Date.now()};
}
function hitTest(frame,x,y){return frame?.regions.filter(r=>r.width>0&&r.height>0&&x>=r.x&&y>=r.y&&x<=r.x+r.width&&y<=r.y+r.height).sort((a,b)=>b.depth-a.depth||a.width*a.height-b.width*b.height)||[];}
class FrameBridge {
 constructor(root,onFrame=()=>{}){this.root=root;this.onFrame=onFrame;this.token=crypto.randomBytes(32).toString('hex');this.commands=[];this.sequence=-1;this.origins=new Set();this.session=crypto.randomUUID();this.closed=false;}
 async start(){
  this.server=http.createServer(async(req,res)=>{
   const origin=req.headers.origin;if(origin&&!this.origins.has(origin)){res.writeHead(403).end();return;}
   if(origin){res.setHeader('Access-Control-Allow-Origin',origin);res.setHeader('Vary','Origin');}
   if(req.method==='OPTIONS'){res.writeHead(204,{'Access-Control-Allow-Headers':'Content-Type, X-Depth-Runtime','Access-Control-Allow-Methods':'POST'}).end();return;}
   const authorization=req.headers['x-depth-runtime'];if(typeof authorization!=='string'||authorization.length!==this.token.length||!crypto.timingSafeEqual(Buffer.from(authorization),Buffer.from(this.token))){res.writeHead(403).end();return;}
   if(req.url!=='/frame'||req.method!=='POST'){res.writeHead(404).end();return;}
   try{let count=0;const chunks=[];for await(const chunk of req){count+=chunk.length;if(count>18*1024*1024)throw Error('Frame too large.');chunks.push(chunk);}
    const value=JSON.parse(Buffer.concat(chunks).toString('utf8'));if(value.session!==this.session)throw Error('Stale runtime session.');
    const frame=validateFrame(value,this.root);if(frame.sequence<=this.sequence)throw Error('Stale runtime frame.');this.sequence=frame.sequence;this.frame=frame;this.onFrame(frame);
    const commands=this.commands.splice(0);res.writeHead(200,{'Content-Type':'application/json','Cache-Control':'no-store'}).end(JSON.stringify({session:this.session,commands}));
   }catch(e){res.writeHead(400,{'Content-Type':'application/json'}).end(JSON.stringify({error:e.message}));}
  });
  await new Promise((resolve,reject)=>{this.server.once('error',reject);this.server.listen(0,'127.0.0.1',resolve);});this.url='http://127.0.0.1:'+this.server.address().port;return this.config();
 }
 config(){return {protocol:'depth-runtime/1',url:this.url,token:this.token,session:this.session,root:this.root,parentPid:process.pid};}
 origin(url){this.origins.add(new URL(url).origin);}
 input(value){
  if(!this.frame||Date.now()-this.frame.capturedAt>3000)throw Error('Runtime frame is stale. Wait for a fresh frame.');
  if(!value||!['pointerDown','pointerUp','pointerMove','scroll','text','pick'].includes(value.type))throw Error('Unsupported runtime input.');
  if(value.type==='pick'){if(!this.frame.capabilities.inspect||!finite(value.x,0,1)||!finite(value.y,0,1)||typeof value.requestId!=='string'||value.requestId.length>80)throw Error('Runtime picking unavailable.');this.commands.push({type:'pick',x:value.x,y:value.y,requestId:value.requestId});return true;}
  if(value.type==='text'){if(!this.frame.capabilities.text||typeof value.text!=='string'||value.text.length>1000)throw Error('Text input is unavailable.');this.commands.push({type:'text',text:value.text});}
  else{if(!finite(value.x,0,1)||!finite(value.y,0,1))throw Error('Invalid pointer coordinates.');if(value.type==='scroll'?!this.frame.capabilities.scroll:!this.frame.capabilities.pointer)throw Error('This runtime does not support that input.');this.commands.push({type:value.type,x:value.x,y:value.y,delta:finite(value.delta,-2000,2000)?value.delta:0});}
  this.commands=this.commands.slice(-100);return true;
 }
 async close(){this.closed=true;this.commands=[];this.frame=null;if(this.server){this.server.closeAllConnections();await new Promise(r=>this.server.close(r));this.server=null;}}
}
module.exports={FrameBridge,validateFrame,hitTest};
