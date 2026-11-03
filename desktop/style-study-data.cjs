// Export a real indexed sample for a read-only visual study; no model calls or product edits.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),net=require('node:net'),{spawn}=require('node:child_process');
const root=path.resolve(__dirname,'..'),out=path.join(root,'artifacts','style-study-'+Date.now());
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
(async()=>{
 fs.mkdirSync(out,{recursive:true});const project=path.join(out,'sample');
 fs.cpSync(path.join(root,'samples','Checkout'),project,{recursive:true,filter:p=>!['bin','obj','.depth'].includes(path.basename(p))});
 const listener=net.createServer();await new Promise(r=>listener.listen(0,'127.0.0.1',r));const port=listener.address().port;await new Promise(r=>listener.close(r));
 const token=crypto.randomBytes(24).toString('hex');
 const child=spawn('dotnet',[path.join(root,'artifacts/desktop-service/Depth.Service.dll')],{cwd:root,windowsHide:true,stdio:'ignore',env:{...process.env,DEPTH_PORT:String(port),DEPTH_TOKEN:token,DEPTH_STORAGE:path.join(out,'state'),DOTNET_gcServer:'0'}});
 const api=require('./service-client.cjs').createClient(()=>'http://127.0.0.1:'+port,token);let fault;child.on('error',e=>fault=e);
 try{
  for(let i=0;i<200;i++){if(fault)throw fault;try{await api('/health');break;}catch{if(i===199)throw Error('Service unavailable');await sleep(100);}}
  await api('/import',{path:project});const [graph,view]=await Promise.all([api('/graph'),api('/view')]);
  const composition=await api('/composition/'+view.preview.entryId),scope=new Set(composition.memberIds);
  // Include direct outside consumers so the shared implementation can be understood.
  for(const r of graph.relations)if(r.kind==='calls'&&scope.has(r.to))scope.add(r.from);
  const cards=view.cards.filter(c=>scope.has(c.id)),relations=graph.relations.filter(r=>scope.has(r.from)&&scope.has(r.to));
  const sources=Object.fromEntries(await Promise.all(cards.map(async c=>{const record=await api('/source/'+c.id);return [c.id,record.sources.map(s=>({path:s.anchor.path,startLine:s.anchor.startLine,endLine:s.anchor.endLine,text:s.content.split(/\r?\n/).slice(s.anchor.startLine-1,s.anchor.endLine).join('\n')}))];})));
  const compositions=Object.fromEntries(await Promise.all(view.preview.bindings.map(async b=>[b.id,await api('/composition/'+b.id)])));
  compositions[composition.rootId]=composition;
  const allSources=Object.fromEntries(await Promise.all(view.cards.map(async c=>{const record=await api('/source/'+c.id);return [c.id,record.sources.map(s=>({path:s.anchor.path,startLine:s.anchor.startLine,endLine:s.anchor.endLine,text:s.content.split(/\r?\n/).slice(s.anchor.startLine-1,s.anchor.endLine).join('\n')}))];})));
  const images=Object.fromEntries(await Promise.all(view.cards.filter(c=>c.kind==='Image').map(async c=>{const image=await api('/project-assets/'+c.id);return [c.id,'data:'+image.mime+';base64,'+image.base64];})));
  const data={name:'Checkout',scope:'Complete ApplyCoupon composition plus direct external consumers',origin:'Actual .NET index of the bundled Checkout sample; read-only snapshot, no live Meta response',revision:graph.revision,rootId:composition.rootId,compositionIds:composition.memberIds,cards,relations,sources,preview:view.preview,allCards:view.cards,allRelations:graph.relations,allSources,compositions,images};
  const destination=path.join(__dirname,'ui','style-study');fs.mkdirSync(destination,{recursive:true});
  fs.writeFileSync(path.join(destination,'data.js'),'window.DepthStudyData='+JSON.stringify(data,null,2)+';\n');
  fs.writeFileSync(path.join(out,'export.json'),JSON.stringify({cards:cards.length,relations:relations.length,composition:composition.memberIds.length,root:cards.find(c=>c.id===data.rootId)?.name,files:[...new Set(cards.flatMap(c=>c.anchors.map(a=>a.path)))]},null,2));
  console.log(fs.readFileSync(path.join(out,'export.json'),'utf8'));console.log('EVIDENCE '+out);
 }finally{child.kill();}
})().catch(e=>{console.error(e);process.exitCode=1;});
