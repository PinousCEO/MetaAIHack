'use strict';
// Geometry belongs to the view; IDs and directed relations always come from the service.
// Opening a new composition and inspecting one of its members are separate operations.
(() => {
  const W=210,H=144,GX=46,GY=48,PAD=42,NS='http://www.w3.org/2000/svg';
  const escape=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const identifier=v=>escape(v).replace(/([a-z0-9])([A-Z])/g,'$1<wbr>$2');
  const kind=k=>k==='Method'?'logic':k==='Field'||k==='Property'?'state':k==='Image'?'asset':k==='NamedType'?'type':'view';
  const icons={logic:'ƒ',state:'≡',asset:'▧',type:'▦',view:'▤'};
  const edgeKind=k=>k==='calls'?'call':k==='contains'?'contains':k.startsWith('view-')?'binding':'ref';
  const labels={logic:'FUNCTION',state:'STATE',asset:'ASSET',type:'TYPE',view:'VIEW'};
  function layout(ids,relations,root,width=720,height=560,mode='guide'){
    const known=new Set(ids),visited=new Set(),order=[],queue=known.has(root)?[root]:[],outgoing=new Map();
    for(const r of relations){if(!outgoing.has(r.from))outgoing.set(r.from,[]);outgoing.get(r.from).push(r.to);}
    let cursor=0;
    const visit=()=>{while(cursor<queue.length){const id=queue[cursor++];if(visited.has(id))continue;visited.add(id);order.push(id);for(const to of outgoing.get(id)||[])if(known.has(to)&&!visited.has(to))queue.push(to);}};
    visit();for(const id of ids)if(!visited.has(id)){queue.push(id);visit();}
    // Choose columns for the actual viewport instead of shrinking a wide square grid.
    let cols=1,best=0;
    for(let c=1;c<=Math.max(1,order.length);c++){
      const rows=Math.ceil(order.length/c),scale=Math.min(width/(PAD*2+c*W+(c-1)*GX),height/(PAD*2+rows*H+Math.max(0,rows-1)*GY));
      if(scale>best){best=scale;cols=c;}
    }
    const positions=new Map();
    if(mode==='orbit'&&order.length>1){
      const step=Math.hypot(W,H)+76,rest=order.slice(1),rings=[];
      for(let i=0;i<rest.length;i+=8)rings.push(rest.slice(i,i+8));
      const radius=rings.length*step,center=radius+PAD;
      positions.set(order[0],{x:center,y:center});
      rings.forEach((ring,k)=>ring.forEach((id,i)=>{
        const angle=-Math.PI/2+i*2*Math.PI/ring.length;
        positions.set(id,{x:center+Math.cos(angle)*(k+1)*step,y:center+Math.sin(angle)*(k+1)*step});
      }));return positions;
    }
    if(mode==='routes'&&order.length){
      // Shortest directed dependency distance; cycles are visited once, never unrolled.
      const depth=new Map([[order[0],0]]),pending=[order[0]];
      for(let i=0;i<pending.length;i++)for(const id of outgoing.get(pending[i])||[]){
        if(known.has(id)&&!depth.has(id)){depth.set(id,depth.get(pending[i])+1);pending.push(id);}
      }
      const layers=new Map();for(const id of order){const d=depth.get(id)??0;if(!layers.has(d))layers.set(d,[]);layers.get(d).push(id);}
      const maxRows=Math.max(...[...layers.values()].map(a=>a.length));
      for(const [d,layer] of layers)layer.forEach((id,i)=>positions.set(id,{x:PAD+d*(W+GX),y:PAD+((maxRows-layer.length)/2+i)*(H+GY)}));
      return positions;
    }
    order.forEach((id,i)=>positions.set(id,{x:PAD+(i%cols)*(W+GX),y:PAD+Math.floor(i/cols)*(H+GY)}));
    return positions;
  }
  function svg(tag,attrs){const e=document.createElementNS(NS,tag);for(const [k,v] of Object.entries(attrs))e.setAttribute(k,v);return e;}
  class DepthAssembly {
    setMode(mode){this.mode=['guide','routes','orbit'].includes(mode)?mode:'guide';this.automaticLayout=true;if(this.composition)this.fit();}
    constructor(viewport,{select,edge,openSource,openComposition}){
      this.viewport=viewport;this.world=viewport.querySelector('#assembly-world');this.nodes=viewport.querySelector('#assembly-nodes');this.svg=viewport.querySelector('svg');this.callbacks={select,edge,openSource,openComposition};this.positions=new Map();this.scale=1;this.x=0;this.y=0;this.suppressClick=false;
      viewport.addEventListener('pointerdown',e=>this.down(e));viewport.addEventListener('pointermove',e=>this.move(e));
      for(const name of ['pointerup','pointercancel','lostpointercapture'])viewport.addEventListener(name,e=>this.up(e));
      viewport.addEventListener('click',e=>{
        if(this.suppressClick){this.suppressClick=false;return;}
        if(e.target.closest('[data-edit-values]'))return;
        const edge=e.target.closest('[data-edge]');if(edge){this.selectEdge(edge.dataset.edge);return;}
        const node=e.target.closest('[data-node]');if(!node)return;
        if(e.target.closest('[data-open-source]'))openSource(node.dataset.node);
        else if(e.target.closest('[data-open-composition]'))openComposition(node.dataset.node);
        else select(node.dataset.node);
      });
      viewport.addEventListener('keydown',e=>{
        if(e.target.closest('button'))return;
        const edge=e.target.closest('[data-edge]'),node=e.target.closest('[data-node]');
        if((e.key==='Enter'||e.key===' ')&&(edge||node)){e.preventDefault();edge?this.selectEdge(edge.dataset.edge):select(node.dataset.node);return;}
        if(e.target!==viewport)return;
        if(['ArrowLeft','ArrowRight','ArrowUp','ArrowDown'].includes(e.key)){e.preventDefault();this.x+=e.key==='ArrowLeft'?40:e.key==='ArrowRight'?-40:0;this.y+=e.key==='ArrowUp'?40:e.key==='ArrowDown'?-40:0;this.transform();}
      });
      viewport.addEventListener('wheel',e=>{if(e.ctrlKey||e.metaKey){e.preventDefault();const r=viewport.getBoundingClientRect();this.zoom(e.deltaY<0?1.12:1/1.12,e.clientX-r.left,e.clientY-r.top);}}, {passive:false});
      if(window.ResizeObserver){this.resize=new ResizeObserver(()=>{if(this.fitted)this.fit();});this.resize.observe(viewport);}
    }
    set(composition,cards,images){
      const same=this.composition?.rootId===composition.rootId&&this.composition?.revision===composition.revision&&JSON.stringify(this.composition?.memberIds)===JSON.stringify(composition.memberIds)&&JSON.stringify(this.composition?.relations.map(r=>r.id))===JSON.stringify(composition.relations.map(r=>r.id));
      this.composition=composition;this.cards=new Map(cards.map(c=>[c.id,c]));this.images=images;
      this.meaning=DepthVisual.describe(cards,composition.relations,composition.rootId);
      for(const id of composition.rootIds||[]){const meaning=this.meaning.get(id);if(meaning)meaning.root=true;}
      this.viewport.classList.toggle('all-connections',this.connectionMode==='all');
      this.incoming=new Map();this.outgoing=new Map();
      for(const r of composition.relations){if(!this.incoming.has(r.to))this.incoming.set(r.to,[]);if(!this.outgoing.has(r.from))this.outgoing.set(r.from,[]);this.incoming.get(r.to).push(r.id);this.outgoing.get(r.from).push(r.id);}
      if(!same){this.automaticLayout=true;this.positions=layout(composition.memberIds,composition.relations,composition.rootId,this.viewport.clientWidth||720,this.viewport.clientHeight||560,this.mode);}
      this.nodes.innerHTML=composition.memberIds.map(id=>{
        const c=this.cards.get(id),role=kind(c.kind),ins=this.incoming.get(id)?.length||0,outs=this.outgoing.get(id)?.length||0;
        const meaning=this.meaning.get(id);
        const value=c.properties?.[0];const body=role==='asset'&&images[id]?'<img src="'+escape(images[id])+'" alt="'+escape(c.name)+'">':value?'<button type="button" class="module-value" data-edit-values="'+escape(c.id)+'" title="Edit actual source values">'+escape(c.properties.length===1?value.value:c.properties.length+' values')+'<small>Edit source values</small></button>':'<p>'+escape(c.purpose||({logic:'Source operation · inspect calls and references',state:'Source-declared state',type:'Inspect declarations and members',view:'Source-declared preview binding',asset:'Project assets'}[role]))+'</p>';
        return '<article class="module-body '+role+' shape-'+meaning.shape+(meaning.root?' entry-module':'')+(meaning.users>1?' shared-module':'')+'" data-node="'+escape(id)+'" tabindex="0" aria-label="'+escape(c.name)+' module"><span class="node-connector input" title="'+ins+' incoming relations" '+(!ins?'hidden':'')+'></span><span class="node-connector output" title="'+outs+' outgoing relations" '+(!outs?'hidden':'')+'></span><header><span class="module-glyph">'+DepthIcons.icon(({logic:'logic',state:'state',asset:'image',type:'layers',view:'view'})[role])+'</span><div><small>'+meaning.label+(meaning.root?' · ENTRY':'')+'</small><h3 title="'+escape(c.name)+'">'+identifier(c.name)+'</h3></div></header><div class="module-body-content">'+body+'</div><div class="module-file" title="'+escape(c.anchors[0]?.path)+'">'+escape(c.anchors[0]?.path)+'</div><div class="module-ports"><span>'+meaning.users+' users</span><span>'+meaning.dependencies+' dependencies</span></div><div class="module-actions"><button data-open-source title="Open source">&lt;/&gt; Code</button><button data-open-composition title="Open full composition">Explore ↗</button></div></article>';
      }).join('');
      for(const node of this.nodes.children)node.insertAdjacentHTML('afterbegin',DepthVisual.skin(this.meaning.get(node.dataset.node).shape));
      this.edgeElements=new Map();this.svg.replaceChildren();
      const defs=svg('defs',{});for(const k of ['call','ref','binding','contains']){const marker=svg('marker',{id:'arrow-'+k,viewBox:'0 0 10 10',refX:9,refY:5,markerWidth:5,markerHeight:5,orient:'auto-start-reverse'});marker.append(svg('path',{d:'M 0 0 L 10 5 L 0 10 z',class:k}));defs.append(marker);}this.svg.append(defs);
      const seen=new Set();
      for(const r of composition.relations){const key=r.from+'|'+r.to+'|'+r.kind,duplicate=seen.has(key);seen.add(key);const k=edgeKind(r.kind),g=svg('g',{'data-edge':r.id,class:'edge '+k+(duplicate?' duplicate':''),tabindex:0,role:'button','aria-label':(this.cards.get(r.from)?.name||r.from)+' → '+(this.cards.get(r.to)?.name||r.to)+' · '+r.kind});
        const title=svg('title',{});title.textContent=g.getAttribute('aria-label');g.append(title,svg('path',{class:'edge-hit'}),svg('path',{class:'edge-line','marker-end':'url(#arrow-'+k+')'}));this.svg.append(g);this.edgeElements.set(r.id,g);}
      this.geometry();if(!same)this.fit();this.select(this.selected);
    }
    geometry(){
      for(const el of this.nodes.children){const p=this.positions.get(el.dataset.node);el.style.left=p.x+'px';el.style.top=p.y+'px';}
      const rels=this.composition.relations,bounds=this.bounds(),obstacles=[...this.positions.values()].map(p=>({...p,w:W,h:H})),routed=new Map();
      for(const [index,r] of rels.entries()){
        const a=this.positions.get(r.from),b=this.positions.get(r.to);
        const key=r.from+'|'+r.to;
        if(!routed.has(key)){
          const ports={start:{x:a.x+W,y:a.y+H/2},end:{x:b.x,y:b.y+H/2},from:{x:a.x+W+22,y:a.y+H/2},to:{x:b.x-22,y:b.y+H/2}};
          const route=DepthStudyLayout.route({...a,w:W,h:H},{...b,w:W,h:H},obstacles,bounds.width,bounds.height,ports);
          routed.set(key,DepthStudyLayout.path(route.points,this.mode!=='routes'));
        }
        const d=routed.get(key);
        const g=this.edgeElements.get(r.id);g.querySelectorAll('path').forEach(p=>p.setAttribute('d',d));
      }
    }
    bounds(){const p=[...this.positions.values()];return {width:Math.max(0,...p.map(p=>p.x+W))+PAD,height:Math.max(0,...p.map(p=>p.y+H))+PAD};}
    fit(){const w=this.viewport.clientWidth||720,h=this.viewport.clientHeight||560;if(this.automaticLayout&&this.composition){this.positions=layout(this.composition.memberIds,this.composition.relations,this.composition.rootId,w,h,this.mode);this.geometry();}const b=this.bounds();this.scale=Math.min(1.15,w/b.width,h/b.height);this.x=(w-b.width*this.scale)/2;this.y=(h-b.height*this.scale)/2;this.fitted=true;this.transform();}
    zoom(factor,cx=(this.viewport.clientWidth||720)/2,cy=(this.viewport.clientHeight||560)/2){const next=Math.min(2,Math.max(.12,this.scale*factor));this.x=cx-(cx-this.x)*next/this.scale;this.y=cy-(cy-this.y)*next/this.scale;this.scale=next;this.fitted=false;this.transform();}
    transform(){this.world.style.transform='translate('+this.x+'px,'+this.y+'px) scale('+this.scale+')';
      this.viewport.classList.toggle('compact-modules',this.scale<.7);this.viewport.style.setProperty('--label-scale',String(Math.min(2.5,Math.max(1,1/this.scale))));
      if(!this.viewport.closest('[hidden]'))document.querySelector('#zoom-value').textContent=Math.round(this.scale*100)+'%';
    }
    select(id){this.selected=id;this.edgeSelected=null;for(const el of this.nodes.children){el.classList.toggle('selected',el.dataset.node===id);el.classList.remove('edge-endpoint');el.setAttribute('aria-current',String(el.dataset.node===id));}
      for(const r of this.composition?.relations||[]){const el=this.edgeElements.get(r.id);el.classList.toggle('connected',r.from===id||r.to===id);el.classList.remove('selected');}
      const adjacent=new Set([id,...(this.composition?.relations||[]).filter(r=>r.from===id||r.to===id).flatMap(r=>[r.from,r.to])]);
      for(const el of this.nodes.children)el.classList.toggle('peripheral',!!id&&!adjacent.has(el.dataset.node));
    }
    connections(mode){this.connectionMode=mode;this.viewport.classList.toggle('all-connections',mode==='all');}
    selectEdge(id){const r=this.composition.relations.find(r=>r.id===id);if(!r)return;this.edgeSelected=id;for(const [rid,el] of this.edgeElements)el.classList.toggle('selected',rid===id);for(const el of this.nodes.children)el.classList.toggle('edge-endpoint',el.dataset.node===r.from||el.dataset.node===r.to);this.callbacks.edge(r);}
    sourceSnippet(id,sources){
      if(this.cards.get(id)?.kind!=='Method')return;
      const node=[...this.nodes.children].find(n=>n.dataset.node===id);if(!node)return;
      const lines=sources.flatMap(s=>s.content.split(/\r?\n/).slice(s.anchor.startLine-1,s.anchor.endLine)).map(l=>l.trim()).filter(l=>l&&l!=='{'&&l!=='}');
      const excerpt=lines.slice(lines.length>2?1:0,lines.length>2?4:3).join('\n');
      const pre=document.createElement('pre');pre.className='module-code';pre.textContent=excerpt;pre.title=excerpt;node.querySelector('.module-body-content').replaceChildren(pre);
    }
    reset(){this.automaticLayout=true;this.fit();}
    down(e){if(e.button!==0||e.target.closest('button,[data-edge]'))return;const node=e.target.closest('[data-node]');this.suppressClick=false;this.drag={pointer:e.pointerId,id:node?.dataset.node,x:e.clientX,y:e.clientY,ox:this.x,oy:this.y,position:node?{...this.positions.get(node.dataset.node)}:null,moved:false};}
    move(e){const d=this.drag;if(!d||d.pointer!==e.pointerId)return;const dx=e.clientX-d.x,dy=e.clientY-d.y;if(!d.moved&&Math.hypot(dx,dy)<4)return;if(!d.moved){d.moved=true;this.viewport.setPointerCapture?.(e.pointerId);}e.preventDefault();this.fitted=false;
      if(d.id){this.automaticLayout=false;this.positions.set(d.id,{x:Math.max(PAD,d.position.x+dx/this.scale),y:Math.max(PAD,d.position.y+dy/this.scale)});this.geometry();}else{this.x=d.ox+dx;this.y=d.oy+dy;this.transform();}this.viewport.classList.add('dragging');}
    up(e){if(!this.drag||this.drag.pointer!==e.pointerId)return;this.suppressClick=this.drag.moved;this.drag=null;this.viewport.classList.remove('dragging');if(this.viewport.hasPointerCapture?.(e.pointerId))this.viewport.releasePointerCapture(e.pointerId);}
  }
  window.DepthAssembly=DepthAssembly;
})();
