'use strict';
const path=require('node:path');
function sourcePath(root,value){
 if(typeof value!=='string'||value.length>2048)return null;
 let input=value.replace(/\\/g,'/');
 if(input.startsWith('file:'))try{input=require('node:url').fileURLToPath(input).replace(/\\/g,'/');}catch{return null;}
 if(path.isAbsolute(input))input=path.relative(root,input).replace(/\\/g,'/');
 input=input.replace(/^\.\//,'');if(!input||input.startsWith('/')||input.split('/').some(p=>p==='..'||p==='.git'||p==='.depth')||input.includes(':'))return null;return input;
}
// Runtime locations must resolve to the current index. A rendered pixel alone
// is not evidence of a source relationship, so unmatched nodes stay unmatched.
function resolve(graph,locations){
 const result=[],seen=new Set();
 for(const location of (Array.isArray(locations)?locations:[]).slice(0,100)){
  const relative=sourcePath(graph.root,location?.path);if(!relative)continue;
  const line=Number.isInteger(location.line)&&location.line>0?location.line:null;
  let matches=graph.entities.filter(e=>e.anchors.some(a=>a.path.replace(/\\/g,'/')===relative&&(!line||a.startLine<=line&&a.endLine>=line)));
  if(line&&matches.length){const size=e=>Math.min(...e.anchors.filter(a=>a.path.replace(/\\/g,'/')===relative&&a.startLine<=line&&a.endLine>=line).map(a=>a.endLine-a.startLine));const min=Math.min(...matches.map(size));matches=matches.filter(e=>size(e)===min);}
  for(const entity of matches)if(!seen.has(entity.id)){seen.add(entity.id);result.push({id:entity.id,name:entity.name,path:relative,line,precision:line&&entity.kind!=='SourceFile'?'source-location':'source-file'});}
 }
 return result;
}
function upstream(graph,id){
 const ids=new Set([id]),queue=[id],incoming=new Map();
 for(const r of graph.relations)if(!['contains','view-owner'].includes(r.kind)){if(!incoming.has(r.to))incoming.set(r.to,[]);incoming.get(r.to).push(r.from);}
 for(let i=0;i<queue.length;i++)for(const source of incoming.get(queue[i])||[])if(!ids.has(source)){ids.add(source);queue.push(source);}
 return graph.entities.filter(e=>ids.has(e.id)).flatMap(e=>e.anchors.map(a=>({path:a.path,line:a.startLine,endLine:a.endLine})));
}
module.exports={sourcePath,resolve,upstream};
