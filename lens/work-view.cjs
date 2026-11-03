'use strict';
const fs=require('node:fs'),path=require('node:path');
// Collapse real declaration relationships to file modules, retaining evidence.
function fileEdges(snapshot){
  const nodes=new Map(snapshot.nodes.map(n=>[n.id,n]));
  const owner=id=>{let n=nodes.get(id);while(n?.parentId)n=nodes.get(n.parentId);return n?.id;};
  const result=new Map();
  for(const e of snapshot.edges){const from=owner(e.from),to=owner(e.to);if(!from||!to||from===to||e.kind==='contains')continue;const id=from+'|'+to+'|'+e.kind;const old=result.get(id);if(old)old.evidenceIds=[...new Set([...old.evidenceIds,...e.evidenceIds])];else result.set(id,{...e,id,from,to});}
  return [...result.values()];
}
function workView(lens,{connectionIds=[],actionId=''}={}){
  if(!Array.isArray(connectionIds)||connectionIds.some(s=>typeof s!=='string')||connectionIds.length>100||typeof actionId!=='string')throw Error('Invalid work view selection.');
  const current=lens.require();
  const actions=lens.actions.filter(a=>!connectionIds.length||connectionIds.includes(a.connectionId));
  let action=actionId?actions.find(a=>a.id===actionId):actions.toSorted((a,b)=>Date.parse(a.updatedAt)-Date.parse(b.updatedAt)).at(-1);
  if(actionId&&!action)throw Error('Action is outside this CLI selection.');
  const reported=action?lens.events.filter(e=>e.payload.actionId===action.id).at(-1):null;
  const observed=lens.events.findLast(e=>e.kind==='graph_published'&&!e.payload.initial&&!e.payload.actionId);
  const external=!actionId&&observed&&(!reported||observed.sequence>reported.sequence)?observed:null;
  if(external)action=null;
  if(!action&&!external)return {empty:true,title:'Waiting for CLI work',message:'Source monitoring is active. Connect the CLI through MCP or the command adapter to record its purpose.'};
  const changes=action?.changes||external?.payload.changes||[];
  const baseRevision=action?.baseRevision||external.payload.beforeRevision;
  let previous={nodes:[],edges:[],evidence:[]};
  if(/^[a-f0-9]{64}$/.test(baseRevision||'')){try{previous=JSON.parse(fs.readFileSync(path.join(lens.directory,'snapshots',baseRevision+'.json'),'utf8'));}catch{}}
  const byId=new Map(changes.map(c=>[c.id,c]));
  const paths=new Set(changes.length?changes.map(c=>c.path):action?.files||[]);
  const roots=current.nodes.filter(n=>!n.parentId),oldRoots=previous.nodes.filter(n=>!n.parentId);
  const changed=new Set([...roots,...oldRoots].filter(n=>paths.has(n.path)||byId.has(n.id)).map(n=>n.id));
  const currentEdges=fileEdges(current),beforeEdges=fileEdges(previous),edgeIds=new Set(currentEdges.map(e=>e.id));
  const oldIds=new Set(beforeEdges.map(e=>e.id));
  const edges=[...currentEdges.map(e=>({...e,change:oldIds.has(e.id)?'unchanged':'added'})),...beforeEdges.filter(e=>!edgeIds.has(e.id)).map(e=>({...e,change:'removed'}))].filter(e=>changed.has(e.from)||changed.has(e.to));
  const visible=new Set([...changed,...edges.flatMap(e=>[e.from,e.to])]);
  const currentIds=new Set(roots.map(n=>n.id));
  const beforeIds=new Set(oldRoots.map(n=>n.id));
  const nodes=[...roots,...oldRoots.filter(n=>!currentIds.has(n.id))].filter(n=>visible.has(n.id)).map(n=>({...n,workRole:changed.has(n.id)?'target':'related',change:!byId.has(n.id)?'unchanged':!currentIds.has(n.id)?'removed':!beforeIds.has(n.id)?'added':byId.get(n.id).kind,removed:!currentIds.has(n.id)}));
  const key=JSON.stringify([action?.id,action?.phase,action?.updatedAt,external?.sequence,current.revision]);
  return {key,actionId:action?.id||null,connectionId:action?.connectionId||null,title:action?.intent||'Source changed · actor unknown',phase:action?.phase||'observed',attribution:action?.attribution||external.payload.attribution,changes,reportedFiles:action?.files||[],baseRevision,revision:current.revision,
    snapshot:{...current,nodes,edges,evidence:[...current.evidence,...previous.evidence.filter(e=>!current.evidence.some(c=>c.id===e.id))]},
    counts:{changed:byId.size,related:nodes.filter(n=>n.workRole==='related').length,relationships:edges.length},
    message:action&&!changes.length?(action.phase==='started'?'Reported targets · waiting for a source change.':'No source changes observed for this action.'):external?'Filesystem observation. No CLI intent is attributed to these edits.':'Reported work matched to observed source changes. This is correlation, not proof of authorship.'};
}
module.exports={workView,fileEdges};
