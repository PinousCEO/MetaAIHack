(() => {
  'use strict';
  const data=window.DEPTH_LENS_SAMPLE;
  const $=id=>document.getElementById(id);
  const state={stage:0,moduleId:'mod-save',level:'beginner',stale:false};
  let timer=null;
  const svgNS='http://www.w3.org/2000/svg';
  const text=(id,value)=>{$(id).textContent=value;};
  const selection=()=>data.modules.find(m=>m.id===state.moduleId);
  function packet(){
    const isAfter=state.stage>=2;
    const visible=data.modules.filter(m=>m.firstStage<=state.stage);
    const module=selection();
    const visibleEdges=data.edges.filter(e=>e.firstStage<=state.stage);
    const ids=new Set([module.id]);
    for(const edge of visibleEdges)if(edge.from===module.id||edge.to===module.id){ids.add(edge.from);ids.add(edge.to);}
    const picked=visible.filter(m=>ids.has(m.id));
    const fresh=state.stage>=4&&!state.stale;
    const currentRevision=data.project[isAfter?'afterRevision':'beforeRevision'];
    return {
      schemaVersion:'0.1.0',mode:'illustrative',projectId:data.project.id,
      query:{moduleIds:[module.id],task:'Understand this module before changing save behavior.'},
      snapshotRevision:currentRevision,
      freshness:state.stale?'stale_example':state.stage===1?'indexing': 'sample_revision_matched',
      useAsCurrentContext:!state.stale && state.stage!==1,
      sourceState:state.stale?'A later edit is simulated; the next source snapshot is not available.':'Illustrative source snapshot only.',
      modules:picked.map(m=>({id:m.id,name:m.name,path:m.path,
        requires:visibleEdges.filter(e=>e.from===m.id).map(e=>e.to),
        contract:fresh?{purpose:m.purpose,provides:m.provides,invariants:m.invariants,sideEffects:m.sideEffects}:null,
        explanationStatus:state.stale?'stale':fresh?'illustrative':'pending',
        evidence:fresh?data.evidence.filter(e=>m.evidenceIds.includes(e.id)):[]
      })),
      relations:visibleEdges.filter(e=>ids.has(e.from)&&ids.has(e.to)).map(({id,from,to,kind})=>({id,from,to,kind})),
      decisions:fresh&&picked.some(m=>data.decision.moduleIds.includes(m.id))?[data.decision]:[],
      validation:data.action.validation,
      selectionScope:'Selected module and direct incoming/outgoing neighbors; no task ranking in this demo.',
      omittedModuleIds:visible.filter(m=>!ids.has(m.id)).map(m=>m.id),
      nextRead:state.stale?['Reindex current source before using historical explanations.']:picked.map(m=>m.path),
      limitations:['Simulated packet; not returned by an MCP server.','No live Meta call, parser, watcher, or source execution.','A browser interaction check is not a desktop transparency test.']
    };
  }
  function stop(){if(timer!==null){window.clearInterval(timer);timer=null;}text('play','흐름 재생');}
  function render(){
    const previousFocus=document.activeElement;
    const focusedModule=previousFocus?.dataset?.moduleId;
    const focusedStep=previousFocus?.dataset?.step;
    const stage=data.stages[state.stage];
    const modules=data.modules.filter(m=>m.firstStage<=state.stage);
    if(!modules.some(m=>m.id===state.moduleId))state.moduleId='mod-save';
    $('steps').replaceChildren(...data.stages.map((s,i)=>{
      const b=document.createElement('button');b.type='button';b.textContent=`${i+1}. ${s.name}`;b.dataset.step=String(i);
      b.setAttribute('aria-pressed',String(i===state.stage));
      b.addEventListener('click',()=>{stop();state.stage=i;render();});return b;
    }));
    text('phase',state.stale?'후속 변경 · 기록 갱신 필요':stage.phase);
    text('revision','snapshot '+data.project[stage.revision==='before'?'beforeRevision':'afterRevision'].slice(0,8));
    text('activity',stage.message);
    $('nodes').replaceChildren(...modules.map(m=>{
      const b=document.createElement('button');b.type='button';b.className='node '+m.role+(m.firstStage===2&&state.stage===2?' new':'');
      b.style.left=m.x+'%';b.style.top=m.y+'%';b.dataset.moduleId=m.id;b.setAttribute('aria-pressed',String(m.id===state.moduleId));
      b.setAttribute('aria-label',m.name+' · '+m.purpose);
      const title=document.createElement('strong');title.textContent=m.name;
      const role=document.createElement('span');role.textContent=m.role+' · '+m.path.split('/').pop();b.append(title,role);
      b.addEventListener('click',()=>{state.moduleId=m.id;render();});return b;
    }));
    const edges=data.edges.filter(e=>e.firstStage<=state.stage);
    $('edges').replaceChildren(...edges.flatMap(e=>{
      const p=document.createElementNS(svgNS,'path');p.setAttribute('class','edge'+(e.firstStage===2&&state.stage===2?' new-edge':''));p.setAttribute('d',e.path);
      const label=document.createElementNS(svgNS,'text');label.setAttribute('x',e.labelX);label.setAttribute('y',e.labelY);label.setAttribute('text-anchor','middle');label.textContent=e.label;return [p,label];
    }));
    text('graph-description',edges.map(e=>`${data.modules.find(m=>m.id===e.from).name} → ${data.modules.find(m=>m.id===e.to).name}: ${e.label}`).join(' · '));
    const m=selection();text('module-name',m.name);
    text('module-purpose',state.stage>=4?m.purpose:'이 단계에서는 구조만 확인합니다. 작업 설명은 5단계에서 열립니다.');
    text('explanation-text',state.stale?'이 설명은 후속 변경을 반영하지 않았습니다. 이전 기록을 현재 설계의 근거로 보내지 않고, 재분석과 설명 갱신을 기다립니다.':state.stage<4?'설명 대기 · 그래프 갱신은 설명 생성과 독립적으로 진행됩니다.':m.explanations[state.level]);
    $('evidence').replaceChildren(...(state.stage>=4&&!state.stale?data.evidence.filter(e=>m.evidenceIds.includes(e.id)).map(e=>{
      const chip=document.createElement('span');chip.className='evidence-chip';chip.textContent=e.anchor?`${e.anchor.path}:${e.anchor.startLine}–${e.anchor.endLine} · ${e.anchor.sha256.slice(0,8)}`:e.text;return chip;
    }):[]));
    text('validation','소스 예제만 있음 · 테스트 실행 없음 · Meta 호출 없음');
    text('context-json',JSON.stringify(packet(),null,2));
    text('context-state',state.stale?'현재 소스와 불일치: 설명·결정을 제외하고 재분석 필요를 반환하는 예시입니다.':state.stage<4?'아직 설명이 없습니다. 확인 가능한 구조와 설명 대기 상태만 보여줍니다.':'사람이 읽는 설명과 같은 모듈 ID·근거·제약을 기계가 읽는 구조로 제공합니다.');
    if(focusedModule)$('nodes').querySelector(`[data-module-id="${focusedModule}"]`)?.focus({preventScroll:true});
    if(focusedStep!==undefined)$('steps').querySelector(`[data-step="${focusedStep}"]`)?.focus({preventScroll:true});
  }
  $('play').addEventListener('click',()=>{
    if(timer!==null){stop();return;}
    if(state.stage===5)state.stage=0;
    state.stale=false;$('stale').checked=false;render();text('play','일시 정지');
    timer=window.setInterval(()=>{state.stage+=1;render();if(state.stage>=5)stop();},2200);
  });
  $('reset').addEventListener('click',()=>{stop();state.stage=0;state.moduleId='mod-save';state.stale=false;$('stale').checked=false;render();});
  $('level').addEventListener('change',e=>{state.level=e.target.value;render();});
  $('stale').addEventListener('change',e=>{stop();state.stale=e.target.checked;render();});
  $('context-toggle').addEventListener('click',()=>{const open=$('context-panel').hidden;$('context-panel').hidden=!open;$('context-toggle').setAttribute('aria-expanded',String(open));});
  window.addEventListener('pagehide',stop);
  render();
})();
