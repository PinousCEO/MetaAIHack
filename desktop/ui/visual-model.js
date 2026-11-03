'use strict';
// Structural meaning, never an invented runtime sequence or model-authored rationale.
(() => {
  function describe(cards, relations, root) {
    const incoming=new Map(),outgoing=new Map(),called=new Map();
    const meaningful=r=>r.kind!=='contains'&&r.kind!=='view-owner';
    for(const r of relations.filter(meaningful)){
      if(!incoming.has(r.to))incoming.set(r.to,new Set());incoming.get(r.to).add(r.from);
      if(!outgoing.has(r.from))outgoing.set(r.from,new Set());outgoing.get(r.from).add(r.to);
      if(r.kind==='calls'){if(!called.has(r.from))called.set(r.from,new Set());called.get(r.from).add(r.to);}
    }
    return new Map(cards.map(c=>{
      const users=incoming.get(c.id)?.size||0,dependencies=outgoing.get(c.id)?.size||0;
      const calls=called.get(c.id)?.size||0;
      const shape=c.kind==='Image'?'asset':c.kind==='NamedType'?'container':['Field','Property'].includes(c.kind)?'state':c.kind==='Method'?(calls>=2?'coordinator':'operation'):'interface';
      const label={asset:'Asset',container:'Container',state:'State',coordinator:'Coordinator',operation:'Operation',interface:'Interface'}[shape];
      const reason=shape==='coordinator'?`Coordinates ${calls} directly called operations.`:users>1?`Shared by ${users} distinct source elements.`:shape==='state'?'Holds a value used by the surrounding implementation.':shape==='asset'?'A project resource with source-declared consumers.':shape==='container'?'Owns the declarations shown inside its boundary.':shape==='interface'?'Connects a declared view element to source.':calls?`Delegates to ${calls} directly called operation.`:'A source operation; inspect its contract and implementation.';
      return [c.id,{shape,label,users,dependencies,calls,root:c.id===root,score:users*2+calls,reason}];
    }));
  }
  const outlines={
    coordinator:'M18 3H192L207 18V126L192 141H18L3 126V18Z',
    operation:'M18 3H192L207 72L192 141H18L3 72Z',
    state:'M3 18C3-2 207-2 207 18V126C207 146 3 146 3 126Z',
    asset:'M3 3H207V141H3Z',
    container:'M3 26V14Q3 7 10 7H75L90 20H200Q207 20 207 27V135Q207 141 200 141H10Q3 141 3 134Z',
    interface:'M12 3H198Q207 3 207 12V132Q207 141 198 141H12Q3 141 3 132V12Q3 3 12 3Z'
  };
  const details={coordinator:'M12 25H28M182 25H198M12 119H28M182 119H198M28 8V18M182 8V18M28 126V136M182 126V136',operation:'M14 72H25M185 72H196',state:'M3 18C3 38 207 38 207 18M3 115C3 135 207 135 207 115',asset:'M12 12H198V108H12ZM15 125H58M15 132H88',container:'M14 32H196M14 36H196',interface:'M3 24H207M15 13H19M27 13H31M39 13H43'};
  function skin(shape){const key=outlines[shape]?shape:'operation';return '<svg class="module-silhouette" viewBox="0 0 210 144" aria-hidden="true" focusable="false"><path class="module-outline" d="'+outlines[key]+'"/><path class="module-engraving" d="'+details[key]+'"/></svg>';}
  window.DepthVisual={describe,skin};
})();
