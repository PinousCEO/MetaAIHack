'use strict';
(()=>{const {graph,sources}=window.DEPTH_PROJECT;
const groups=[
 {id:'analysis',name:'코드 분석',subtitle:'소스 → 구조와 근거',color:'#7cddd9',asset:'analysis-core',x:-390,z:-240},
 {id:'workspace',name:'개발 작업',subtitle:'스냅샷 · 제안 · 변경',color:'#dfb57a',asset:'workspace-core',x:0,z:-240},
 {id:'contracts',name:'공통 데이터',subtitle:'사람과 AI가 공유하는 구조',color:'#99afe9',asset:'analysis-core',x:390,z:-240},
 {id:'desktop',name:'탐색 인터페이스',subtitle:'구조를 보고 구현을 읽는 곳',color:'#b6a5e4',asset:'runtime-core',x:-390,z:280},
 {id:'runtime',name:'실행 결과 연결',subtitle:'선택한 객체 → 구성 코드',color:'#ce98ba',asset:'runtime-core',x:0,z:280},
 {id:'delivery',name:'빌드와 검증',subtitle:'Windows 배포 · 내부 검사',color:'#8cb8a5',asset:'workspace-core',x:390,z:280}
];
const byGroup=new Map(groups.map(g=>[g.id,g]));
// Authored functional partition of real indexed entities. This is a design proposal,
// not a claim that directory seeds or author intent have been verified by an AI.
const definitions=[
 ['scan','analysis','C# 구조 분석','선언·호출·상속을 분석해 소프트웨어 그래프를 만듭니다.','언어 분석을 화면과 분리해 Unity UI가 바뀌어도 동일한 구조 정보를 사용할 수 있게 합니다.','Indexer.cs',['Scan','Indexer'],'Scan'],
 ['dart','analysis','Dart 분석 연결','외부 Dart AST 어댑터 결과를 공통 심볼 구조에 연결합니다.','언어마다 다른 분석기를 같은 데이터 모델에 맞추기 위한 경계입니다.','Indexer.cs',['ReadDart','DartDeclaration'],'ReadDart'],
 ['snapshot','workspace','프로젝트 스냅샷','프로젝트를 불러오고 변경된 코드를 다시 인덱싱합니다.','코드와 모듈 정보가 어느 소스 버전을 기준으로 하는지 함께 관리합니다.','Workspace.cs',['indexer','Workspace','Current','Require','Import','Refresh','Save','Source'],'Import'],
 ['proposal','workspace','변경안 검토','CLI에 조사와 제안을 요청하고 결과·심볼 소유권을 검사합니다.','변경안을 코드 적용 전에 검토할 수 있는 독립된 상태로 보관합니다.','Workspace.cs',['proposals','Register','Propose','Preview','Schema'],'Propose'],
 ['apply','workspace','승인 변경 적용','소스 해시를 확인하고 승인된 변경을 적용·백업·재분석합니다.','오래된 제안이 최근 소스를 덮어쓰지 않도록 변경 경계를 분리합니다.','Workspace.cs',['Apply'],'Apply'],
 ['process','workspace','CLI 프로세스','외부 실행 파일의 입출력·제한 시간·종료 상태를 관리합니다.','Codex와 Dart 실행을 공통 프로세스 계층으로 다룹니다.','Workspace.cs',['Processes','Result','Run'],'Run'],
 ['observation','runtime','관찰 검증','런타임 선택이 같은 프로젝트와 소스 버전에 속하는지 확인합니다.','오래된 실행 객체가 새 코드에 잘못 연결되지 않도록 검증합니다.','Workspace.cs',['Selection','Observe'],'Observe'],
 ['access','contracts','안전한 소스 접근','분석할 소스를 찾고 프로젝트 내부 경로인지 확인합니다.','코드 조회와 수정이 같은 경로 규칙을 사용하도록 공통으로 둡니다.','Model.cs',['SourceAccess','Ignored','Files','Resolve'],'Resolve'],
 ['identity','contracts','구현 식별','해시와 결정적 ID로 소스·심볼·관계를 식별합니다.','같은 구현을 여러 기능에서 참조할 때 식별 규칙을 공유합니다.','Model.cs',['Wire','Json','Hash','Id'],'Id'],
 ['model','contracts','공통 그래프 모델','심볼·모듈·관계·소스 위치·검증 근거를 표현합니다.','사람의 탐색 화면과 AI의 코드 검색이 같은 사실을 참조하기 위한 기반입니다.','Model.cs',null,'Graph'],
 ['transport','contracts','클라이언트 계약','Unity와 분석 서비스가 교환하는 데이터 형식을 정의합니다.','엔진 화면과 분석 서비스의 통신 경계를 명시합니다.','Contracts.cs',null,'Graph'],
 ['boot','desktop','서비스 연결','로컬 분석 서비스를 시작하고 API 통신과 갱신을 관리합니다.','시각화 엔진이 분석 작업을 직접 수행하지 않도록 분리합니다.','DepthDesktop.cs',['Awake','Boot','Api','Update','OnDestroy','service','endpoint','token','storage','ready','busy','nextPoll'],'Boot'],
 ['importui','desktop','프로젝트 불러오기','가져오기 요청을 보내고 반환된 그래프를 화면 상태에 반영합니다.','외부 소스 스냅샷과 사용자의 탐색 상태를 연결하는 지점입니다.','DepthDesktop.cs',['Import','ReceiveGraph','projectPath'],'Import'],
 ['landscape','desktop','모듈 공간','표시할 모듈을 고르고 시각 객체를 다시 구성합니다.','실제 프로젝트 구조와 시각 표현을 분리해 탐색 방식을 교체할 수 있게 합니다.','DepthDesktop.cs',['Visible','Rebuild','IsObserved','positions','visuals','view','glow','page','focusOnly'],'Rebuild'],
 ['details','desktop','코드·변경 검토','선택한 구현과 변경안의 원본·수정 내용을 보여줍니다.','프로젝트를 살펴보는 과정과 변경을 검토하는 과정을 연결합니다.','DepthDesktop.cs',['DrawInspector','DrawReview','entity','selected','proposal','detail','review','showReview','detailScroll','reviewScroll'],'DrawInspector'],
 ['desktopui','desktop','화면과 선택 상태','탐색 UI·검색·선택·입력 상태를 관리합니다.','개인 시점과 선택은 공통 프로젝트 데이터에서 분리되어야 합니다.','DepthDesktop.cs',null,'OnGUI'],
 ['picker','runtime','객체 선택 입력','Game View 입력과 Hierarchy 선택을 수집합니다.','사용자가 보는 실행 객체를 소스 탐색의 시작점으로 삼습니다.','DepthRuntimeBridge.cs',['DepthGamePicker','OnGUI','Pick','Selected'],'Pick'],
 ['bridge','runtime','컴포넌트 소스 연결','선택한 객체의 컴포넌트 스크립트 경로를 서비스로 전달합니다.','컴포넌트 소속 관찰을 정적 호출·데이터 흐름의 추정과 구분합니다.','DepthRuntimeBridge.cs',null,'Report'],
 ['build','delivery','Windows 빌드','Unity 데스크톱 앱의 Windows 빌드를 생성합니다.','제품 화면 구현과 배포 절차를 별도로 관리합니다.','DepthBuild.cs',null,'Windows'],
 ['tests','delivery','서비스 검증','분석·소스 경계·변경 적용의 내부 검사를 실행합니다.','구조 분석과 변경 경계가 예상대로 동작하는지 확인합니다.','SelfTest.cs',null,'Run'],
 ['api','workspace','서비스 요청 계약','가져오기·자연어 요청·변경 승인 입력을 정의합니다.','클라이언트에서 분석 서비스로 전달하는 요청 형식을 명시합니다.','Program.cs',null,'ImportRequest']
];
const remaining=new Set(graph.entities.map(e=>e.id));
const modules=definitions.map(([id,group,name,purpose,reason,file,names,preferred])=>{
 const entities=graph.entities.filter(e=>remaining.has(e.id)&&e.anchors.some(a=>a.path.endsWith('/'+file))&&(!names||names.includes(e.name)));
 entities.forEach(e=>remaining.delete(e.id));return {id,group,name,purpose,reason,entities,preferred};
}).filter(m=>m.entities.length);
if(remaining.size){const entities=graph.entities.filter(e=>remaining.has(e.id));modules.push({id:'other',group:'contracts',name:'기타 선언',purpose:'아직 기능 구역을 검토하지 않은 실제 선언입니다.',reason:'자동으로 의미를 단정하지 않고 미분류 선언을 보존합니다.',entities,preferred:entities[0].name})}
const byModule=new Map(modules.map(m=>[m.id,m])),byEntity=new Map(graph.entities.map(e=>[e.id,e])),owner=new Map();
const shortNames={scan:'C# 분석',dart:'Dart 연결',snapshot:'스냅샷 관리',proposal:'변경안 검토',apply:'변경 적용',process:'CLI 실행',api:'요청 계약',access:'소스 접근',identity:'구현 식별',model:'그래프 모델',transport:'통신 계약',boot:'서비스 연결',importui:'프로젝트 가져오기',landscape:'모듈 공간',details:'코드 검토',desktopui:'선택 상태',observation:'관찰 검증',picker:'객체 선택',bridge:'소스 연결',build:'Windows 빌드',tests:'서비스 검증'};
modules.forEach(m=>m.entities.forEach(e=>owner.set(e.id,m.id)));
const cross=graph.relations.filter(r=>owner.get(r.from)!==owner.get(r.to)&&r.kind!=='contains');
const links=[];const linkMap=new Map();
for(const r of cross){const a=owner.get(r.from),b=owner.get(r.to);if(!a||!b)continue;const key=a+'>'+b;if(!linkMap.has(key)){const l={from:a,to:b,relations:[]};linkMap.set(key,l);links.push(l)}linkMap.get(key).relations.push(r)}
const areaLinks=new Map();for(const l of links){const a=byModule.get(l.from).group,b=byModule.get(l.to).group;if(a===b)continue;const key=[a,b].sort().join('|');const existing=areaLinks.get(key);if(existing)existing.count+=l.relations.length;else areaLinks.set(key,{from:a,to:b,count:l.relations.length})}
groups.forEach(g=>g.modules=modules.filter(m=>m.group===g.id));

window.DEPTH_MODEL={graph,sources,groups,byGroup,modules,byModule,byEntity,owner,cross,links,areaLinks,shortNames};})();
