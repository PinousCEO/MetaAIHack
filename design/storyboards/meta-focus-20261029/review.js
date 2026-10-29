'use strict';
const $ = id => document.getElementById(id);
const records = [
  {id:'coupon-input',name:'CouponInput',role:'입력',family:'Checkout',icon:'▤',source:'src/ui/coupon-input.ts',description:'쿠폰 코드 입력값을 검증 모듈에 전달합니다.'},
  {id:'validate-coupon',name:'ValidateCoupon',role:'검증',family:'Checkout',icon:'◇',source:'src/cart/validate.ts',description:'쿠폰 사용 조건을 확인해 계산 가능 여부를 전달합니다.'},
  {id:'apply-coupon',name:'ApplyCoupon',role:'계산',family:'Shared',icon:'%',source:'src/cart/coupon.ts',description:'할인 계산 · Cart와 Checkout에서 공유'},
  {id:'cart-state',name:'CartState',role:'상태',family:'Shared',icon:'▱',source:'src/cart/state.ts',description:'상품 합계와 쿠폰 상태를 공유합니다.'},
  {id:'totals-view',name:'TotalsView',role:'결과',family:'Checkout',icon:'▣',source:'src/ui/totals-view.ts',description:'계산된 할인과 합계를 화면에 표시합니다.'},
  {id:'product-card',name:'ProductCard',role:'상품 UI',family:'Catalog',icon:'▧'},
  {id:'product-query',name:'ProductQuery',role:'상품 조회',family:'Catalog',icon:'⌕'},
  {id:'search',name:'Search',role:'검색',family:'Catalog',icon:'⌕'},
  {id:'money-format',name:'MoneyFormat',role:'표시 형식',family:'Shared',icon:'$'},
  {id:'auth',name:'Auth',role:'인증',family:'Shared',icon:'◇'},
  {id:'image',name:'ProductImage',role:'이미지',family:'Assets',icon:'▧'},
  {id:'font',name:'Inter',role:'폰트',family:'Assets',icon:'Aa'},
  {id:'button',name:'Button',role:'버튼',family:'Assets',icon:'▰'},
  {id:'theme',name:'Theme',role:'테마',family:'Assets',icon:'◈'},
  {id:'orders',name:'Orders',role:'주문',family:'Checkout',icon:'▤'},
  {id:'storage',name:'Storage',role:'저장',family:'Shared',icon:'▱'},
  {id:'product',name:'Product',role:'상품 모델',family:'Catalog',icon:'◇'},
  {id:'icons',name:'Icons',role:'아이콘',family:'Assets',icon:'✧'}
];
const members = records.slice(0,5), stage = $('layoutStage');
let activeModule='apply-coupon', activeTab='composition', agent='api', rate=20;
const money = value=>new Intl.NumberFormat('en-US',{style:'currency',currency:'USD'}).format(value);
for (const r of records) {
  const button = document.createElement('button');button.className='project-tile';button.dataset.origin=r.id;button.dataset.family=r.family;
  const icon=document.createElement('span');icon.className='tile-icon';icon.textContent=r.icon;
  const name=document.createElement('strong');name.textContent=r.name;
  const role=document.createElement('small');role.textContent=r.role;
  button.append(icon,name,role);button.title=r.name+' · '+r.role;
  button.onclick=()=>{if(members.includes(r)){focus();selectModule(r.id)}else{$('layoutStatus').textContent=r.name+' · '+r.role+' — 배치 예시의 전체 프로젝트에서 찾은 모듈입니다.'}};
  $('projectTiles').append(button);
}
for (const r of members) {
  const button=document.createElement('button');button.className='member';button.dataset.member=r.id;
  const role=document.createElement('small');role.textContent=r.role;
  const name=document.createElement('strong');name.textContent=r.name;
  const action=document.createElement('span');action.textContent='선택해서 확인 →';button.append(role,name,action);
  button.onclick=()=>selectModule(r.id);$('featureMembers').append(button);
}
function updateCode(){
  const record=records.find(r=>r.id===activeModule);
  const code=activeModule==='apply-coupon'
    ? 'export function applyCoupon(subtotal: number, discountPercent: number) {\n  return subtotal * (1 - discountPercent / 100);\n}\n\n// 배치 확인용 예시 값\napplyCoupon(120, '+rate+'); // '+(120*(1-rate/100)).toFixed(2)
    : '// '+record.source+'\n// '+record.name+' · '+record.role+'\n// '+record.description+'\n\n// 실제 소스와 연결되지 않은 화면 배치 예시입니다.';
  $('codeView').textContent=code;
}
function selectModule(id){
  activeModule=id;const r=records.find(r=>r.id===id);$('memberTitle').textContent=r.name;$('memberRole').textContent=r.description;
  document.querySelectorAll('[data-member]').forEach(b=>{const yes=b.dataset.member===id;b.classList.toggle('active',yes);b.setAttribute('aria-pressed',String(yes))});updateCode();
}
function setTab(tab){activeTab=tab;document.querySelectorAll('[data-tab]').forEach(b=>b.classList.toggle('active',b.dataset.tab===tab));$('compositionView').hidden=tab!=='composition';$('codeView').hidden=tab!=='code';$('notesView').hidden=tab!=='notes';updateCode()}
function setRate(value){const next=Number(value);rate=Number.isFinite(next)?Math.max(0,Math.min(100,next)):20;$('discountInput').value=rate;$('previewRate').textContent=rate+'%';$('previewDiscount').textContent='−'+money(120*rate/100);$('previewTotal').textContent=money(120*(1-rate/100));$('draftLabel').textContent=rate===20?'값을 바꾸면 왼쪽 예시에 반영됩니다.':'예시 값 변경 · '+money(96)+' → '+money(120*(1-rate/100));updateCode()}
function focus(){
  if(stage.dataset.mode==='focus')return;
  document.querySelectorAll('[data-origin]').forEach(tile=>tile.hidden=false);
  document.querySelectorAll('.tree-item').forEach(b=>b.classList.toggle('active',b.dataset.family==='all'));
  const origins=new Map(members.map(r=>[r.id,document.querySelector('[data-origin="'+r.id+'"]').getBoundingClientRect()]));
  stage.dataset.mode='focus';$('featurePanel').inert=false;
  document.querySelectorAll('[data-origin]').forEach(b=>b.classList.toggle('related',members.some(r=>r.id===b.dataset.origin)));
  $('focusButton').classList.add('active');$('overviewButton').classList.remove('active');$('projectHint').textContent='프로젝트 전체 · 출처와 다른 기능';
  $('layoutStatus').textContent='선택한 기능은 오른쪽 정면, 전체 프로젝트와 하이어라키는 아래쪽입니다. 모듈·코드 탭을 누르거나 할인율을 바꿔보세요.';
  if(!matchMedia('(prefers-reduced-motion: reduce)').matches) requestAnimationFrame(()=>{
    document.querySelectorAll('[data-member]').forEach((button,i)=>{const from=origins.get(button.dataset.member),to=button.getBoundingClientRect();button.animate([{transform:'translate('+(from.left-to.left)+'px,'+(from.top-to.top)+'px) scale(.55)',opacity:0},{transform:'translate(0,0) scale(1)',opacity:1}],{duration:620,delay:i*35,easing:'cubic-bezier(.2,.8,.2,1)'})});
  });
}
function reset(){stage.dataset.mode='overview';$('featurePanel').inert=true;$('focusButton').classList.remove('active');$('overviewButton').classList.add('active');document.querySelectorAll('[data-origin]').forEach(b=>b.classList.remove('related'));$('projectHint').textContent='전체 프로젝트 · 기능별 모듈 공간';$('layoutStatus').textContent='프리뷰의 Apply를 누르세요. 선택한 기능은 오른쪽에, 프로젝트 전체는 아래쪽에 배치됩니다.'}
$('pickButton').onclick=focus;$('focusButton').onclick=focus;$('overviewButton').onclick=reset;$('closeFocus').onclick=reset;
$('discountInput').oninput=event=>setRate(event.target.value);
$('themeButton').onclick=()=>{const dark=stage.classList.toggle('dark');$('themeButton').textContent=dark?'라이트로 보기':'다크로 보기'};
document.querySelectorAll('[data-tab]').forEach(b=>b.onclick=()=>setTab(b.dataset.tab));
document.querySelectorAll('[data-agent]').forEach(b=>b.onclick=()=>{agent=b.dataset.agent;document.querySelectorAll('[data-agent]').forEach(x=>x.classList.toggle('active',x===b));$('agentExample').textContent=agent==='cli'?'Codex CLI → MCP → modules.search · source.read':'선택한 모듈과 관련 소스를 AI 작업에 연결합니다.'});
document.querySelectorAll('[data-family].tree-item').forEach(b=>b.onclick=()=>{document.querySelectorAll('.tree-item').forEach(x=>x.classList.toggle('active',x===b));document.querySelectorAll('[data-origin]').forEach(tile=>tile.hidden=b.dataset.family!=='all'&&tile.dataset.family!==b.dataset.family)});
window.depthLayoutDemo={focus,reset,setRate,getState:()=>({mode:stage.dataset.mode,rate,activeModule,activeTab,agent})};
selectModule(activeModule);

const screens=JSON.parse($('screenData').textContent);let selected=0;
function show(i){selected=(i+screens.length)%screens.length;const s=screens[selected];$('large').src=s.file;$('large').alt=s.title;$('viewerTitle').textContent=String(s.n).padStart(2,'0')+' · '+s.title;$('viewerDescription').textContent=s.description;$('counter').textContent=s.n+' / '+screens.length;$('openFile').href=s.file;$('viewer').classList.remove('original');$('original').textContent='원본 크기';if(!$('viewerDialog').open)$('viewerDialog').showModal()}
document.querySelectorAll('[data-index]').forEach(b=>b.onclick=()=>show(Number(b.dataset.index)));
document.querySelectorAll('[data-filter]').forEach(b=>b.onclick=()=>{document.querySelectorAll('[data-filter]').forEach(x=>x.classList.toggle('active',x===b));document.querySelectorAll('article').forEach(card=>card.hidden=b.dataset.filter!=='all'&&card.dataset.theme!==b.dataset.filter)});
$('density').onclick=()=>{const yes=$('gallery').classList.toggle('compact');$('density').textContent=yes?'2열로 보기':'3열로 보기'};
$('close').onclick=()=>$('viewerDialog').close();$('next').onclick=()=>show(selected+1);$('prev').onclick=()=>show(selected-1);$('original').onclick=()=>{const yes=$('viewer').classList.toggle('original');$('original').textContent=yes?'화면 맞춤':'원본 크기'};
document.addEventListener('keydown',event=>{if($('viewerDialog').open){if(event.key==='ArrowRight'){event.preventDefault();show(selected+1)}if(event.key==='ArrowLeft'){event.preventDefault();show(selected-1)}}else if(event.key==='Escape')reset()});
window.depthDesignGallery={count:screens.length,show};
