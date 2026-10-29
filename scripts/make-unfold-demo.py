from pathlib import Path

root = Path(__file__).resolve().parents[1]
source = (root / 'design/interaction/index.html').read_text(encoding='utf-8')
source = source.replace('Depth AI — 연결된 개발 흐름', 'Depth AI — 펼쳐지는 코드 모듈')
source = source.replace('작은 입체 하나가 기능 모듈입니다. 선택하면 코멘트와 구현을 확인합니다.', '모듈을 누르면 안의 코드가 펼쳐집니다. 연결된 함수를 눌러 다음 모듈로 이동하세요.')
source = source.replace('height:218px', 'height:170px')
source = source.replace('</style>', '''
.code-leaf{position:absolute;z-index:5;left:18px;right:18px;top:37%;bottom:85px;background:#101e2ef5;border:1px solid #8fcfc5;border-radius:10px;box-shadow:0 15px 45px #0009,0 0 28px #73c7b71a;display:flex;flex-direction:column;transform-origin:50% 0;animation:unfold .36s ease-out;overflow:hidden}
.code-leaf[hidden]{display:none}.leaf-head{display:flex;align-items:center;gap:10px;padding:12px 16px;background:#203d46;border-bottom:1px solid #365762}.leaf-head strong{font-size:17px;color:#c2fff1}.leaf-head span{color:#a1c1ca;font-size:11px;flex:1}.leaf-head button{padding:5px 10px;font-size:11px}.leaf-body{display:grid;grid-template-columns:minmax(230px,1fr) 205px;flex:1;min-height:0}.leaf-code{overflow:auto;background:#0b1420;padding:12px 0}.code-line{display:flex;min-height:24px;font:12px/24px Consolas,monospace;white-space:pre}.code-line .num{width:40px;flex-shrink:0;text-align:right;padding-right:13px;color:#556e87;user-select:none}.code-line .txt{padding-right:15px;color:#d8e8f8}.code-line .comment{color:#81b5a3}.code-line .keyword{color:#c5a4f4}.code-line .literal{color:#f1c581}.code-line.changed{background:#25523d55;border-left:2px solid #85dfaa}.leaf-meta{border-left:1px solid #2c4159;padding:12px;overflow:auto;font-size:12px}.leaf-meta h4{margin:0 0 6px;color:#8ed9cf;font-size:11px}.leaf-meta p{margin:0 0 17px}.leaf-links{padding:10px 14px;border-top:1px solid #334960;background:#142537;display:flex;align-items:center;gap:6px;flex-wrap:wrap}.leaf-links span{font-size:11px;color:#97b2cb;margin-right:6px}.leaf-links button{font-size:11px;padding:5px 9px}.maptop h1{font-size:17px}.leaf-anchor{position:absolute;top:33%;left:49%;height:4%;border-left:2px solid #99e5ce;z-index:4;pointer-events:none}.leaf-anchor[hidden]{display:none}.center.code-open .banner{display:none}.leaf-path{font:11px Consolas,monospace;color:#98b4cc;padding:7px 16px;border-bottom:1px solid #243b51;background:#101c2b}.crumb-back{color:#98dccf!important}.leaf-empty{padding:25px;color:#acc1d5}.leaf-body a{color:#a2e4d3}
@keyframes unfold{from{opacity:0;transform:perspective(900px) rotateX(-15deg) scaleY(.65)}to{opacity:1;transform:perspective(900px) rotateX(0) scaleY(1)}}
@media(max-height:800px){.code-leaf{top:35%;bottom:60px}.leaf-head{padding:7px 12px}.code-line{min-height:21px;line-height:21px;font-size:11px}}
</style>''')
source = source.replace('<div class="banner" id="banner">', '''<div id="leafAnchor" class="leaf-anchor" hidden></div>
<div id="codeLeaf" class="code-leaf" hidden>
  <div class="leaf-head"><strong id="leafName"></strong><span>모듈 내부 · 실제 구현 위치에 연결하는 화면</span><button id="leafBack" class="crumb-back">← 이전 모듈</button><button id="leafClose">접기 ×</button></div>
  <div class="leaf-path" id="leafPath"></div>
  <div class="leaf-body"><div class="leaf-code" id="leafCode"></div><div class="leaf-meta" id="leafMeta"></div></div>
  <div class="leaf-links" id="leafLinks"></div>
</div>
<div class="banner" id="banner">''')
source = source.replace("function selectModule(id){selected=id;", "function selectModule(id){if(leafOpen&&selected!==id)leafHistory.push(selected);selected=id;")
source = source.replace("function renderInspector(){const m=", "function renderInspector(){if(leafOpen)renderLeaf();const m=")
source = source.replace("if(p)selectModule(p.id)", "if(p){leafOpen=true;selectModule(p.id)}")
source = source.replace("b.onclick=()=>selectModule(b.dataset.node)", "b.onclick=()=>{leafOpen=true;selectModule(b.dataset.node)}")
source = source.replace("function overview(){stop();", "function overview(){closeLeaf();stop();")
source = source.replace("function reset(){stop();", "function reset(){closeLeaf();leafHistory=[];stop();")
source = source.replace("function selectObject(id){stop();", "function selectObject(id){closeLeaf();stop();")
source = source.replace("if(step===6)selected='reward';", "if(step===6){selected='reward';leafOpen=true;}")
# When open, the selected module is a header-volume feeding the opened source surface.
source = source.replace("function project(p){const t=transform(p)", "function project(p){const t=transform(p)")
source = source.replace("y:h*.52-t[1]*base*persp", "y:(leafOpen?h*.255:h*.52)-t[1]*base*persp*(leafOpen?.46:1)")
source = source.replace("x:w*.5+t[0]*base*persp", "x:w*.5+t[0]*base*persp*(leafOpen?.46:1)")
source = source.replace("s:base*persp}", "s:base*persp*(leafOpen?.46:1)}")
source = source.replace("lastTime=now;requestAnimationFrame(draw)", "if(leafOpen){const a=project(position(moduleById(selected)));const top=a.y+22;const line=$('leafAnchor');line.style.left=a.x+'px';line.style.top=top+'px';line.style.height=Math.max(0,$('codeLeaf').offsetTop-top)+'px';}lastTime=now;requestAnimationFrame(draw)")
source = source.replace("const [x,y,z]=center,[a,b,c]=size.map(v=>v/2)", "const [x,y,z]=center,[a,b,c]=size.map(v=>v/2)")
source = source.replace("ctx.globalAlpha=dim?.16:1", "ctx.globalAlpha=dim?.16:leafOpen&&!sel?.55:1")
source = source.replace("ctx.fillText(g.name+' / '+visibleModules().filter(m=>m.group===g.id).length,p.x,p.y)", "if(!leafOpen)ctx.fillText(g.name+' / '+visibleModules().filter(m=>m.group===g.id).length,p.x,p.y)")
source = source.replace("const $=id=>document.getElementById(id);", "const $=id=>document.getElementById(id);\nlet leafOpen=false,leafHistory=[];")
addition = r'''
function closeLeaf(){leafOpen=false;$('codeLeaf').hidden=true;$('leafAnchor').hidden=true;document.querySelector('.center').classList.remove('code-open')}
function renderLeaf(){
 const m=moduleById(selected);$('codeLeaf').hidden=false;$('leafAnchor').hidden=false;document.querySelector('.center').classList.add('code-open');
 $('leafName').textContent=m.name+' / 코드';$('leafPath').textContent='프로젝트 > '+groups.find(g=>g.id===m.group).name+' > '+m.source;
 $('leafBack').disabled=!leafHistory.length;
 const content='// '+m.comment+'\n'+'// 생성 이유: '+m.reason+'\n\n'+m.code;
 const normalized=content.replaceAll('\\n','\n');
 const lines=normalized.split('\n');
 $('leafCode').replaceChildren();
 for(let i=0;i<lines.length;i++){
  const row=document.createElement('div');row.className='code-line'+(m.added&&step>=6?' changed':'');
  const no=document.createElement('span');no.className='num';no.textContent=i+1;
  const txt=document.createElement('span');txt.className='txt';
  const line=lines[i];
  if(line.trim().startsWith('//')){txt.classList.add('comment');txt.textContent=line}
  else{for(const token of line.split(/(\b(?:public|private|void|bool|int|return|if|var|float|event|true|false|new)\b|\b\d+\b)/g)){const t=document.createElement('span');if(/^(public|private|void|bool|int|return|if|var|float|event|true|false|new)$/.test(token))t.className='keyword';else if(/^\d+$/.test(token))t.className='literal';t.textContent=token;txt.append(t)}}
  row.append(no,txt);$('leafCode').append(row);
 }
 $('leafMeta').replaceChildren();
 for(const [title,text] of [['왜 생겼나',m.reason],['왜 이렇게 구현했나',m.decision],['근거 / 상태',m.added?'변경 요청에 연결한 예제 기록 · 새 구현':'기존 모듈의 설계 설명 예제'],['검증',step>=7?'예제 테스트 결과 수신 · 실제 실행 아님':'아직 실제 검증하지 않음']]){const h=document.createElement('h4');h.textContent=title;const p=document.createElement('p');p.textContent=text;$('leafMeta').append(h,p)}
 const label=document.createElement('span');label.textContent='연결된 구현으로 이동 →';$('leafLinks').replaceChildren(label);
 for(const e of currentEdges().filter(e=>e[0]===m.id||e[1]===m.id)){const target=e[0]===m.id?e[1]:e[0];const b=document.createElement('button');b.dataset.codeTarget=target;b.textContent=moduleById(target).name+' · '+e[2];b.onclick=()=>selectModule(target);$('leafLinks').append(b)}
}
$('leafClose').onclick=closeLeaf;
$('leafBack').onclick=()=>{const id=leafHistory.pop();if(id){selected=id;renderInspector()}};
window.depthUnfold={open:id=>{leafOpen=true;selectModule(id)},close:closeLeaf,get isOpen(){return leafOpen}};
'''
# The source above is a raw Python string: JS escapes should be single backslashes.
addition = addition.replace('\\\\', '\\')
source = source.replace('reset();requestAnimationFrame(draw);', addition+'\nreset();leafOpen=true;selectModule("wallet");requestAnimationFrame(draw);')
(root/'design/interaction/unfold.html').write_text(source,encoding='utf-8')
print('Created design/interaction/unfold.html')
