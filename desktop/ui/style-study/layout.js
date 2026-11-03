'use strict';
// View geometry is separate from source identity and evidence. No synthetic edges.
(() => {
 const SIZE={width:1100,height:835};
 function describe(data){
  const incoming=new Map(),outgoing=new Map();
  for(const r of data.relations){if(r.kind!=='calls')continue;if(!incoming.has(r.to))incoming.set(r.to,new Set());incoming.get(r.to).add(r.from);if(!outgoing.has(r.from))outgoing.set(r.from,new Set());outgoing.get(r.from).add(r.to);}
  return new Map(data.cards.map(c=>{const source=(data.sources[c.id]||[]).map(x=>x.text).join('\n'),constant=c.kind==='Field'&&/\bconst\b/.test(source),gate=c.kind==='Method'&&/\bbool\s+\w+\s*\(/.test(source),writer=c.kind==='Method'&&/\bvoid\s+\w+\s*\(/.test(source),users=incoming.get(c.id)?.size||0,calls=outgoing.get(c.id)?.size||0;
   const role=c.kind==='ViewElement'?'Preview element':c.kind==='View'?'View declaration':c.id===data.rootId?'Coordinator':constant?'Constant':gate?'Validation':writer?'State writer':users>1?'Shared operation':c.kind==='Image'?'Asset':c.kind==='Field'?'State':calls?'Consumer':'Operation';
   return [c.id,{role,constant,gate,writer,users,calls,core:c.kind==='Method'||constant,icon:constant?'state':gate?'check':writer?'state':c.kind==='Image'?'image':calls>1?'layers':'code'}];
  }));
 }
 function layout(data,mode,meaning){
  const byId=new Map(data.cards.map(c=>[c.id,c])),layoutRoot=byId.has(data.preview?.entryId)?data.preview.entryId:data.rootId,direct=[...new Set(data.relations.filter(r=>r.kind==='calls'&&r.from===layoutRoot).map(r=>r.to))];
  const shared=[...direct].sort((a,b)=>meaning.get(b).users-meaning.get(a).users)[0];
  const others=direct.filter(id=>id!==shared).sort((a,b)=>Number(meaning.get(b).gate)-Number(meaning.get(a).gate)||Number(meaning.get(b).writer)-Number(meaning.get(a).writer));
  const consumer=data.relations.find(r=>r.kind==='calls'&&r.to===shared&&r.from!==layoutRoot)?.from;
  const constant=data.relations.find(r=>r.from===shared&&meaning.get(r.to)?.constant)?.to;
  const placements=new Map(),put=(id,x,y,w,h)=>{if(id&&byId.has(id)&&!placements.has(id))placements.set(id,{x,y,w,h});};
  if(mode==='orbit'){
   put(layoutRoot,365,205,205,205);put(shared,680,245,225,155);put(others[0],55,30,185,155);put(others[1],495,485,195,150);put(others[2],80,490,205,140);put(consumer,800,35,215,145);put(constant,900,485,165,140);
  }else{
   put(layoutRoot,45,215,235,180);put(shared,430,265,235,175);put(others[0],445,35,205,160);put(others[1],430,515,220,135);put(others[2],80,520,225,135);put(consumer,800,520,225,135);put(constant,810,280,215,145);
  }
  // A preview selection is its own canonical node, beside the code entry it declares.
  if(data.rootId!==layoutRoot)put(data.rootId,800,25,255,185);
  const rest=data.cards.filter(c=>!placements.has(c.id));rest.forEach((c,i)=>put(c.id,25+(i%7)*151,740+Math.floor(i/7)*105,138,75));
  const height=Math.max(SIZE.height,...[...placements.values()].map(p=>p.y+p.h+22));
  return {positions:placements,width:SIZE.width,height,contextIds:rest.map(c=>c.id)};
 }
 function grouped(relations){
  const groups=new Map();for(const r of relations){const key=[r.from,r.to,r.kind].join('|');if(!groups.has(key))groups.set(key,{...r,ids:[],sites:[]});const g=groups.get(key);g.ids.push(r.id);if(r.site&&!g.sites.some(s=>s.path===r.site.path&&s.startLine===r.site.startLine))g.sites.push(r.site);}
  return [...groups.values()];
 }
 function contentBox(p,m,mode,entry,context){
  // Inscribed text areas keep the full HTML layout inside diamonds and ellipses.
  if(context)return {x:12,y:12,w:p.w-24,h:p.h-24,kind:'compact'};
  if(m.gate)return {x:p.w*.26,y:p.h*.255,w:p.w*.48,h:p.h*.49,kind:'centered'};
  if((mode==='routes'&&m.users>1)||(mode==='orbit'&&entry))return {x:p.w*.14,y:p.h*.19,w:p.w*.72,h:p.h*.62,kind:'centered'};
  const y=mode==='guide'?36:22;return {x:18,y,w:p.w-36,h:p.h-y-15,kind:'regular'};
 }
 function ports(a,b){
  const ax=a.x+a.w/2,ay=a.y+a.h/2,bx=b.x+b.w/2,by=b.y+b.h/2,dx=bx-ax,dy=by-ay;
  // Compact context bodies are tightly spaced horizontally; their ports face the open lane above.
  if(b.h<90&&a.y+a.h<b.y)return {start:{x:ax,y:a.y+a.h},end:{x:bx,y:b.y},from:{x:ax,y:a.y+a.h+25},to:{x:bx,y:b.y-25}};
  if(Math.abs(dx)>Math.abs(dy)*.8){const sign=dx>=0?1:-1;return {start:{x:ax+sign*a.w/2,y:ay},end:{x:bx-sign*b.w/2,y:by},from:{x:ax+sign*(a.w/2+25),y:ay},to:{x:bx-sign*(b.w/2+25),y:by}};}
  const sign=dy>=0?1:-1;return {start:{x:ax,y:ay+sign*a.h/2},end:{x:bx,y:by-sign*b.h/2},from:{x:ax,y:ay+sign*(a.h/2+25)},to:{x:bx,y:by-sign*(b.h/2+25)}};
 }
 function route(a,b,obstacles,width,height,explicitPorts){
  const p=explicitPorts||ports(a,b),step=15,cols=Math.ceil(width/step),rows=Math.ceil(height/step),cell=v=>({x:Math.max(0,Math.min(cols,Math.round(v.x/step))),y:Math.max(0,Math.min(rows,Math.round(v.y/step)))}),s=cell(p.from),t=cell(p.to),key=v=>v.x+','+v.y;
  const blocked=v=>obstacles.some(o=>v.x*step>o.x-7&&v.x*step<o.x+o.w+7&&v.y*step>o.y-7&&v.y*step<o.y+o.h+7),distance=v=>Math.abs(v.x-t.x)+Math.abs(v.y-t.y);
  const queue=[s],scores=new Map([[key(s),0]]),previous=new Map(),closed=new Set();let found=false;
  while(queue.length){queue.sort((a,b)=>(scores.get(key(a))+distance(a))-(scores.get(key(b))+distance(b)));const v=queue.shift(),k=key(v);if(closed.has(k))continue;closed.add(k);if(k===key(t)){found=true;break;}
   for(const [dx,dy] of [[1,0],[-1,0],[0,1],[0,-1]]){const n={x:v.x+dx,y:v.y+dy},nk=key(n);if(n.x<0||n.y<0||n.x>cols||n.y>rows||closed.has(nk)||(blocked(n)&&nk!==key(t)))continue;const cost=scores.get(k)+1;if(cost<(scores.get(nk)??Infinity)){scores.set(nk,cost);previous.set(nk,v);queue.push(n);}}
  }
  const points=[];if(found){let v=t;while(v){points.push({x:v.x*step,y:v.y*step});v=previous.get(key(v));}points.reverse();}else{points.push(p.from,{x:p.from.x,y:Math.max(a.y+a.h,b.y+b.h)+25},p.to);}
  const full=[p.start,p.from,...points,p.to,p.end],simple=[];
  for(const v of full){if(simple.length&&simple.at(-1).x===v.x&&simple.at(-1).y===v.y)continue;if(simple.length>1){const a=simple.at(-2),b=simple.at(-1);if((a.x===b.x&&b.x===v.x)||(a.y===b.y&&b.y===v.y))simple.pop();}simple.push(v);}
  return {points:simple,found};
 }
 function path(points,rounded){
  if(points.length<2)return '';let d='M '+points[0].x+' '+points[0].y;
  for(let i=1;i<points.length-1;i++){const a=points[i-1],b=points[i],c=points[i+1],l1=Math.hypot(b.x-a.x,b.y-a.y),l2=Math.hypot(c.x-b.x,c.y-b.y),r=rounded?Math.min(13,l1/2,l2/2):0;
   if(!r){d+=' L '+b.x+' '+b.y;continue;}const before={x:b.x-(b.x-a.x)*r/l1,y:b.y-(b.y-a.y)*r/l1},after={x:b.x+(c.x-b.x)*r/l2,y:b.y+(c.y-b.y)*r/l2};d+=' L '+before.x+' '+before.y+' Q '+b.x+' '+b.y+' '+after.x+' '+after.y;
  }return d+' L '+points.at(-1).x+' '+points.at(-1).y;
 }
 window.DepthStudyLayout={describe,layout,grouped,contentBox,route,path};
})();
