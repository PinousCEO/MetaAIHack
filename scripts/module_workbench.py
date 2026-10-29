"""Local source-backed module workbench and read-only MCP context adapter. Stdlib only."""
from __future__ import annotations
import argparse, copy, hashlib, json, os, re, secrets, subprocess, sys, threading, time
from datetime import datetime, timezone
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import urlparse, parse_qs
from urllib.request import Request, urlopen

ROOT = Path(__file__).resolve().parent.parent
WEB = ROOT / 'design' / 'workbench'
STORE = ROOT / '.depth' / 'workbench'
CS = 'unity/Depth.Desktop/Assets/Scripts/DepthDesktop.cs'

def digest(text): return hashlib.sha256(text.encode('utf-8')).hexdigest()
def uid(prefix, value): return prefix + ':' + digest(value)[:18]
def now(): return datetime.now(timezone.utc).isoformat()
def read(path):
    with path.open('r',encoding='utf-8-sig',newline='') as stream:return stream.read()
def json_bytes(value): return json.dumps(value, ensure_ascii=False).encode('utf-8')

class Workbench:
    def __init__(self, root=ROOT, storage=STORE, exported=None):
        self.root, self.storage = Path(root).resolve(), Path(storage)
        self.storage.mkdir(parents=True, exist_ok=True)
        self.lock = threading.RLock()
        self.pending = {}
        self.exported = exported
        self.nodes, self.edges, self.bindings = {}, [], {}
        self.refresh(export=exported is None)

    def resolve(self, relative):
        path = (self.root / relative).resolve()
        if not path.is_relative_to(self.root) or any(p.is_symlink() for p in [self.root / relative, *list((self.root / relative).parents)[:len(Path(relative).parts)]]):
            raise ValueError('프로젝트 밖의 경로 또는 링크는 사용할 수 없습니다.')
        return path

    def refresh(self, export=True):
        with self.lock:
            if export:
                output = self.storage / 'source-export.js'
                result = subprocess.run(['dotnet', 'run', '--project', str(ROOT / 'src/Depth.Service'), '--', '--export-view', str(self.root), str(output)], cwd=ROOT, capture_output=True, text=True, encoding='utf-8', timeout=90)
                if result.returncode: raise ValueError('소스 재분석 실패: ' + result.stderr[-1500:])
                self.exported = json.loads(read(output).split('=', 1)[1].strip().rstrip(';'))
            self.graph = self.exported['graph']
            self.sources = self.exported['sources']
            self.nodes, self.edges, self.bindings = {}, [], {}
            material=self.root/'unity/Depth.Desktop/Assets/Resources/DepthGlow.mat'
            self.revision = digest(self.graph['revision']+(digest(read(material)) if material.is_file() else ''))
            self.build_nodes()
            self.merge_records()
            self.persist_index()
            return self.snapshot()

    def anchor(self, path, start=0, end=None):
        text = self.sources.get(path)
        if text is None: text = read(self.resolve(path))
        end = len(text) if end is None else end
        return dict(path=path, startLine=text.count('\n', 0, start)+1, endLine=text.count('\n', 0, end)+1, contentHash=digest(text))

    def node(self, id, name, kind, group, purpose, reason, anchor=None, properties=None, entity=None):
        evidence = [dict(kind='static', method='source-anchor', **anchor)] if anchor else []
        note = dict(origin='ai-authored-template', author='Codex', purpose=purpose,
                    moduleCreationReason=reason,
                    implementationIntent='기존 구현의 최초 생성 의도는 기록되지 않았습니다.',
                    designRationale=[], inputs=[], outputs=[], effects=[], evidence=evidence,
                    validation=dict(source='anchored' if anchor else 'external-unresolved', runtime='not-observed', build='not-run'),
                    limitations=[], revision=self.revision)
        n = dict(id=id, name=name, kind=kind, group=group, properties=properties or [], anchors=[anchor] if anchor else [], ai=note, entityId=entity)
        self.nodes[id] = n
        return n

    def edge(self, a, b, relation, label, evidence='static', detail='소스에 명시된 관계입니다.'):
        if a in self.nodes and b in self.nodes:
            self.edges.append(dict(id=uid('edge', a+b+relation), source=a, target=b, kind=relation, label=label, evidence=evidence, detail=detail))

    def prop(self, node, key, label, value, kind='text', spans=None, path=CS, minimum=None, maximum=None):
        p = dict(key=key, label=label, value=value, type=kind, editable=spans is not None)
        if minimum is not None: p['min'] = minimum
        if maximum is not None: p['max'] = maximum
        node['properties'].append(p)
        if spans is not None:
            self.bindings[(node['id'], key)] = dict(path=path, spans=spans, hash=digest(self.sources.get(path) or read(self.resolve(path))), type=kind, min=minimum, max=maximum)

    def build_nodes(self):
        # Preserve every actual indexed declaration; high-level UI views may collapse these.
        for e in self.graph['entities']:
            a = e['anchors'][0]
            path = a['path']
            group = 'code' if path.startswith('src/') else 'runtime' if 'Bridge' in path else 'ui'
            n = self.node(e['id'], e['name'], 'CODE', group,
                f"{e['qualifiedName']}를 구현하는 실제 {e['kind']} 선언입니다.",
                'AI와 사용자가 이 구현을 이름·소스 위치·관계로 다시 찾을 수 있도록 독립 모듈로 인덱싱했습니다.', a, entity=e['id'])
            n['qualifiedName'] = e['qualifiedName']
            n['ai']['designRationale'] = ['이 기본 설명은 선언 정보로 작성되었습니다. 기능적 설계 의도에 대한 추가 AI 검토가 필요합니다.']
            n['ai']['limitations'].append('선언 단위 인덱스입니다. 기능 모듈 경계가 검증되었다는 뜻은 아닙니다.')
        for r in self.graph['relations']:
            self.edge(r['from'], r['to'], r['kind'], {'calls':'호출','contains':'포함','constructs':'생성','inherits':'상속'}.get(r['kind'],r['kind']), r['evidence']['kind'], r['evidence']['detail'])
        catalog=WEB/'ai-records.json'
        if catalog.is_file():
            for record in json.loads(read(catalog))['records']:
                entities=[nid for nid in record['entityIds'] if nid in self.nodes]
                if not entities:continue
                functional_id='function:'+record['id']
                n=self.node(functional_id,record['name'],'FUNCTION','code',record['purpose'],record['moduleCreationReason'])
                n['ai']['origin']='ai-authored'
                n['ai']['evidence']=record.get('evidence',[])
                stale=any(a['path'] not in self.sources or digest(self.sources[a['path']])!=a['contentHash'] for a in record.get('evidence',[]))
                n['ai']['validation']['source']='needs-review' if stale else 'anchored'
                if stale:n['ai']['limitations'].append('설명 작성 이후 소스가 변경되었습니다. AI가 근거를 다시 읽고 기록을 검토해야 합니다.')
                for nid in entities:
                    self.nodes[nid]['ai']['purpose']=record['purpose']+' 연결된 구현: '+self.nodes[nid]['name']
                    self.nodes[nid]['ai']['moduleCreationReason']=record['moduleCreationReason']
                    self.nodes[nid]['ai']['functionalModule']=record['name']
                    self.nodes[nid]['ai']['validation']['rationale']='needs-review' if stale else 'source-matched'
                    self.edge(functional_id,nid,'contains','구성 구현')
        if CS not in self.sources: return
        text = self.sources[CS]
        find_entity = lambda name: next((e['id'] for e in self.graph['entities'] if e['name']==name and e['anchors'][0]['path']==CS), None)
        # An external inherited font is a first-class module, not a fabricated local font asset.
        font = self.node('font:unity-skin', '기본 스킨 폰트', 'FONT', 'assets',
            '버튼과 텍스트 스타일이 상속하는 Unity 기본 스킨의 폰트 참조입니다.',
            '여러 UI가 공유하는 글꼴 의존성을 하나의 모듈로 검색하고 영향 범위를 추적하기 위해 분리했습니다.')
        font['ai']['designRationale'] = ['GUIStyle 생성 시 별도 font 속성이 지정되지 않아 스킨의 글꼴을 상속하는 것으로 추정합니다.']
        font['ai']['limitations'] = ['실제 런타임 폰트 이름은 관찰하지 않았습니다.', '이 프로젝트에는 명시적인 로컬 폰트 에셋이 없습니다.']
        font['ai']['validation']['source'] = 'inferred-inheritance'
        self.prop(font, 'source', '참조', 'GUI.skin / GUIStyle 상속')
        self.prop(font, 'family', '실제 폰트', '런타임 확인 필요')
        styles = {}
        for match in re.finditer(r'(?P<name>title|heading|body|tiny|button|textArea)\s*=\s*new GUIStyle\((?P<base>[^)]+)\)\s*\{(?P<body>[^}]+)\}', text):
            name = match['name']; sid = 'style:'+name; styles[name] = sid
            n = self.node(sid, {'button':'공유 버튼 스타일','title':'제목 스타일','heading':'섹션 제목 스타일','body':'본문 스타일','tiny':'보조 텍스트 스타일','textArea':'입력 영역 스타일'}[name], 'STYLE', 'ui',
                f'{name} GUIStyle의 글자 크기와 표시 속성을 관리합니다.',
                '여러 컨트롤이 공유하는 표시 규칙을 개별 버튼 코드와 분리하여, 스타일 변경의 영향 범위를 한 곳에서 확인하도록 모듈화했습니다.', self.anchor(CS, match.start(), match.end()))
            size = re.search(r'fontSize\s*=\s*(\d+)', match['body'])
            if size:
                start = match.start('body')+size.start(1)
                self.prop(n,'fontSize','글자 크기',int(size[1]),'number',[(start,start+len(size[1]))],minimum=8,maximum=72)
            self.prop(n,'base','상속 스타일',match['base'].strip())
            n['ai']['designRationale'] = [f"원본 Styles()에서 new GUIStyle({match['base'].strip()})로 구성합니다.", '글자 크기를 바꾸면 같은 스타일을 사용하는 컨트롤들이 함께 영향을 받습니다.']
            n['ai']['effects'] = ['이 스타일로 연결된 모든 UI 컨트롤의 표시']
            self.edge(sid,'font:unity-skin','uses-font','폰트 상속','inferred','명시적인 font 지정이 없어 스킨 상속으로 추정합니다. 실제 폰트는 미관찰 상태입니다.')
            if find_entity('Styles'): self.edge(sid,find_entity('Styles'),'implemented-by','정의 코드')
        for name, sid in styles.items():
            node = self.nodes[sid]
            base = next((p['value'] for p in node['properties'] if p['key']=='base'), '')
            if base in styles: self.edge(sid,styles[base],'inherits-style','스타일 복제')
        for state in ['normal','hover','active']:
            pat = r'button\.'+state+r'\.background\s*=\s*Flat\(new Color\(([^)]+)\)\)'
            m = re.search(pat,text)
            if m and 'button' in styles:
                numbers=list(re.finditer(r'\.?\d+(?:\.\d+)?f?',m[1]))[:3]
                values=[float(n[0].rstrip('f')) for n in numbers]
                spans=[(m.start(1)+n.start(),m.start(1)+n.end()) for n in numbers]
                self.prop(self.nodes[styles['button']],state+'Color',{'normal':'배경색','hover':'호버 색','active':'누른 색'}[state], '#'+''.join(f'{round(v*255):02x}' for v in values), 'color', spans)
        controls=[]
        pattern=r'Button\(new Rect\((?P<rect>[-\d.f, ]+)\),\s*(?P<label>"(?:[^"\\]|\\.)*")\)'
        for ordinal,m in enumerate(re.finditer(pattern,text)):
            label=json.loads(m['label']);nid=f'ui:button:{ordinal}'
            n=self.node(nid,label,'BUTTON','ui', f'화면에 “{label}” 컨트롤을 표시하고 사용자의 클릭을 받습니다.',
                '동작·스타일·폰트와 실제 화면의 연결을 개별적으로 조회하고 수정하기 위한 UI 모듈입니다. 이 모듈 경계는 이번 인덱싱에서 생성했습니다.', self.anchor(CS,m.start(),m.end()))
            self.prop(n,'label','버튼 문구',label,'text',[(m.start('label'),m.end('label'))])
            coords=list(re.finditer(r'-?\d+(?:\.\d+)?f?',m['rect']))
            for key,entry in zip(['x','y','width','height'],coords):
                self.prop(n,key,{'x':'X','y':'Y','width':'너비','height':'높이'}[key],float(entry[0].rstrip('f')),'number',[(m.start('rect')+entry.start(),m.start('rect')+entry.end())],minimum=0,maximum=2500)
            n['ai']['inputs']=['마우스 또는 UI 클릭 입력'];n['ai']['outputs']=['GUI.Button의 클릭 결과']
            n['ai']['designRationale']=['Button(Rect, string) 헬퍼를 사용하며, 헬퍼가 GUI.Button(r, label, button)으로 공유 스타일을 전달합니다.']
            n['ai']['effects']=['버튼 문구·배치·크기와 클릭 후 연결된 처리 흐름']
            self.edge(nid,'style:button','uses-style','스타일 사용')
            if find_entity('Button'): self.edge(nid,find_entity('Button'),'implemented-by','렌더링 코드')
            # Only bind a concrete handler when it is present immediately after this control.
            tail=text[m.end():m.end()+110]
            handler=re.match(r'\)\s*(Import|Rebuild)\(\)',tail)
            if handler and find_entity(handler[1]):
                self.edge(nid,find_entity(handler[1]),'on-click','클릭 시 호출')
                n['ai']['outputs'].append(handler[1]+'() 호출')
            route='/import' if handler and handler[1]=='Import' else '/refresh' if '"/refresh"' in tail else None
            if route:
                method='Import' if route=='/import' else 'Refresh'
                target=next((e['id'] for e in self.graph['entities'] if e['name']==method and e['anchors'][0]['path']=='src/Depth.Service/Workspace.cs'),None)
                program=self.sources.get('src/Depth.Service/Program.cs','')
                if target and '"'+route+'"' in program:
                    self.edge(nid,target,'api-route','HTTP '+route,'inferred','UI 요청 문자열과 서비스 경로를 연결한 설계상 매핑입니다. 런타임 호출을 관찰한 기록이 아닙니다.')
            controls.append(nid)
        material='unity/Depth.Desktop/Assets/Resources/DepthGlow.mat'
        if self.resolve(material).is_file():
            mt=read(self.resolve(material));self.sources[material]=mt
            n=self.node('asset:depth-glow','DepthGlow 머티리얼','MATERIAL','assets','Unity 모듈과 연결선에 사용되는 발광 머티리얼 에셋입니다.','실제 표시를 구성하는 에셋도 코드와 같은 모듈 공간에서 의존성과 수정 근거를 추적하도록 분리했습니다.',self.anchor(material))
            self.prop(n,'path','에셋 경로',material)
            m=re.search(r'_Color:\s*\{r:\s*([\d.]+),\s*g:\s*([\d.]+),\s*b:\s*([\d.]+),\s*a:\s*([\d.]+)',mt)
            if m:self.prop(n,'tint','기본 색상','#'+''.join(f'{round(float(m[i])*255):02x}' for i in [1,2,3]),'color',[m.span(i) for i in [1,2,3]],path=material)
            if find_entity('Awake'): self.edge(find_entity('Awake'),'asset:depth-glow','loads-asset','Resources.Load')
            if find_entity('Rebuild'): self.edge(find_entity('Rebuild'),'asset:depth-glow','uses-asset','표시 머티리얼')
            n['ai']['limitations'].append('Awake()에서 복제한 런타임 머티리얼의 색을 다시 지정하므로 에셋 기본 색 변경이 최종 색을 직접 결정하지 않을 수 있습니다.')
        self.controls=controls

    def persist_index(self):
        self.search_index={n['id']:' '.join([n['name'],n['kind'],json.dumps(n['ai'],ensure_ascii=False),json.dumps(n['properties'],ensure_ascii=False)]).casefold() for n in self.nodes.values()}
        index=dict(schemaVersion='0.2', revision=self.revision, root=str(self.root), nodes=list(self.nodes.values()),edges=self.edges)
        path=self.storage/'module-index.json';temp=path.with_suffix('.tmp');temp.write_bytes(json_bytes(index));temp.replace(path)

    def merge_records(self):
        file=self.storage/'ai-records.json'
        if not file.is_file():return
        for nid,note in json.loads(read(file)).items():
            if nid not in self.nodes:continue
            note=copy.deepcopy(note)
            stale=any(a['path'] not in self.sources or digest(self.sources[a['path']])!=a['contentHash'] for a in note['evidence'])
            if stale:
                note['validation']['source']='needs-review'
                note['limitations'].append('AI 기록 이후 소스가 변경되었습니다. 근거를 다시 검토해야 합니다.')
            self.nodes[nid]['ai']=note

    def record(self,nid,record,revision):
        with self.lock:
            if revision!=self.revision:raise ValueError('스냅샷이 달라졌습니다. 먼저 모듈을 다시 조회하세요.')
            node=self.nodes[nid]
            for field in ['purpose','moduleCreationReason']:
                if not isinstance(record.get(field),str) or not 1<=len(record[field])<=4000:raise ValueError('목적과 모듈 생성 이유를 간결하게 기록하세요.')
            evidence=record.get('evidence') or node['anchors'] or node['ai']['evidence']
            for a in evidence:
                if a['path'] not in self.sources:raise ValueError('인덱스에 없는 소스를 근거로 사용할 수 없습니다.')
                current=read(self.resolve(a['path']))
                if digest(current)!=a['contentHash']:raise ValueError('AI가 읽은 근거 소스가 변경되었습니다.')
                if not (1<=a['startLine']<=a['endLine']<=len(current.splitlines())+1):raise ValueError('근거의 소스 범위가 잘못되었습니다.')
            note=copy.deepcopy(node['ai'])
            for field in ['purpose','moduleCreationReason','designRationale','inputs','outputs','effects','limitations']:
                if field not in record:continue
                v=record[field]
                if field not in ['purpose','moduleCreationReason'] and (not isinstance(v,list) or len(v)>30 or any(not isinstance(x,str) or len(x)>4000 for x in v)):raise ValueError('설명 목록의 형식을 확인하세요.')
                note[field]=v
            note.update(origin='agent-authored',author=record.get('author','CLI coding agent'),recordedAt=now(),revision=revision,evidence=evidence)
            note['validation']=dict(source='anchored' if evidence else 'external-unresolved',runtime='not-observed',build='not-run')
            file=self.storage/'ai-records.json';records=json.loads(read(file)) if file.is_file() else {};records[nid]=note
            temp=file.with_suffix('.tmp');temp.write_bytes(json_bytes(records));temp.replace(file)
            self.nodes[nid]['ai']=note;self.persist_index()
            return dict(id=nid,revision=revision,recordedAt=note['recordedAt'],source=note['validation']['source'])

    def snapshot(self):
        return dict(revision=self.revision,root=str(self.root),indexedAt=now(),nodes=list(self.nodes.values()),edges=self.edges,controls=self.controls,
                    stats=dict(symbols=len(self.graph['entities']),modules=len(self.nodes),relationships=len(self.edges),sourceFiles=len(self.graph['files'])))

    def search(self, query, limit=30):
        aliases={'폰트':['폰트','font'],'버튼':['버튼','button'],'클릭':['클릭','on-click'],'생성':['생성','CreationReason']}
        terms=query.casefold().split();scored=[]
        for nid,haystack in self.search_index.items():
            score=sum(any(t.casefold() in haystack for t in aliases.get(term,[term])) for term in terms)
            if score or not terms:scored.append((score,nid))
        scored.sort(key=lambda pair:(-pair[0],self.nodes[pair[1]]['kind']=='CODE',self.nodes[pair[1]]['name']))
        return [dict(id=nid,name=self.nodes[nid]['name'],kind=self.nodes[nid]['kind'],purpose=self.nodes[nid]['ai']['purpose'],anchors=self.nodes[nid]['anchors']) for _,nid in scored[:min(limit,100)]]

    def context(self,nid):
        return dict(module=self.nodes[nid],relationships=[e for e in self.edges if nid in [e['source'],e['target']]],revision=self.revision)

    def composition(self,nid):
        # Traverse the indexed dependency closure; grouping only changes the view, never ownership.
        allowed={'calls','constructs','uses-style','uses-font','inherits-style','implemented-by','on-click','api-route','loads-asset','uses-asset'}
        outgoing={}
        for edge in self.edges:
            if edge['kind'] in allowed:outgoing.setdefault(edge['source'],[]).append(edge)
        found={nid};queue=[nid]
        while queue and len(found)<500:
            for e in outgoing.get(queue.pop(0),[]):
                if e['target'] not in found:found.add(e['target']);queue.append(e['target'])
        functions={}
        for e in self.edges:
            if e['kind']=='contains' and e['target'] in found and self.nodes[e['source']]['kind']=='FUNCTION':functions.setdefault(e['source'],[]).append(e['target'])
        return dict(root=nid,moduleIds=sorted(found),functions=[dict(id=id,usedEntityIds=ids) for id,ids in functions.items()],relationships=[e for e in self.edges if e['source'] in found and e['target'] in found],revision=self.revision,coverage='indexed-dependencies-only',runtime='not-observed')

    def source(self,nid):
        n=self.nodes[nid]
        return [dict(anchor=a,content='\n'.join(self.sources[a['path']].splitlines()[max(0,a['startLine']-2):a['endLine']+1])) for a in n['anchors']]

    def propose(self,nid,key,value,revision):
        with self.lock:
            if revision!=self.revision:raise ValueError('스냅샷이 달라졌습니다. 다시 분석하세요.')
            binding=self.bindings.get((nid,key))
            if not binding:raise ValueError('이 속성은 직접 수정 가능한 소스에 연결되어 있지 않습니다.')
            path=self.resolve(binding['path']);before=read(path)
            if digest(before)!=binding['hash']:raise ValueError('원본이 외부에서 변경되었습니다. 재분석 후 수정하세요.')
            kind=binding['type']
            if kind=='text':
                if not isinstance(value,str) or len(value)>160 or any(ord(c)<32 for c in value):raise ValueError('문구는 제어 문자 없이 160자 이내여야 합니다.')
                replacements=[json.dumps(value,ensure_ascii=True)]
            elif kind=='number':
                if isinstance(value,bool):raise ValueError('숫자가 필요합니다.')
                value=float(value)
                if not (binding['min']<=value<=binding['max']):raise ValueError('속성 범위를 벗어났습니다.')
                if key=='fontSize' and not value.is_integer():raise ValueError('글자 크기는 정수여야 합니다.')
                replacements=[str(int(value)) if value.is_integer() else format(value,'.6g')+'f']
            elif kind=='color':
                if not re.fullmatch(r'#[0-9a-fA-F]{6}',str(value)):raise ValueError('색상 형식이 올바르지 않습니다.')
                suffix='f' if binding['path'].endswith('.cs') else ''
                replacements=[format(int(value[i:i+2],16)/255,'.6f')+suffix for i in [1,3,5]]
            else:raise ValueError('지원하지 않는 속성입니다.')
            after=before
            for (start,end),replacement in sorted(zip(binding['spans'],replacements),reverse=True):after=after[:start]+replacement+after[end:]
            id=secrets.token_hex(12)
            proposal=dict(id=id,moduleId=nid,property=key,value=value,path=binding['path'],expectedHash=binding['hash'],before=before,after=after,reason=f"{self.nodes[nid]['name']}의 {key} 속성 변경",revision=revision,edits=[dict(start=a,end=b,text=t) for (a,b),t in zip(binding['spans'],replacements)])
            self.pending[id]=proposal
            return proposal

    def propose_batch(self,nid,changes,revision):
        with self.lock:
            if not 1<=len(changes)<=20 or len({c['property'] for c in changes})!=len(changes):raise ValueError('변경 속성 수 또는 중복을 확인하세요.')
            parts=[]
            try:
                for c in changes:parts.append(self.propose(nid,c['property'],c['value'],revision))
                if len({p['path'] for p in parts})!=1:raise ValueError('한 번에 하나의 소스 파일을 검토하세요.')
                first=parts[0];edits=[e for p in parts for e in p['edits']];after=first['before']
                for e in sorted(edits,key=lambda e:e['start'],reverse=True):after=after[:e['start']]+e['text']+after[e['end']:]
                combined={**first,'id':secrets.token_hex(12),'after':after,'edits':edits,'reason':self.nodes[nid]['name']+'의 '+str(len(changes))+'개 속성 변경'}
                self.pending[combined['id']]=combined
                return combined
            finally:
                for p in parts:self.pending.pop(p['id'],None)

    def apply(self,pid,approved):
        with self.lock:
            if approved is not True:raise ValueError('검토한 변경안의 명시적 적용이 필요합니다.')
            p=self.pending[pid];path=self.resolve(p['path']);before=read(path)
            if digest(before)!=p['expectedHash']:raise ValueError('원본이 변경되어 적용하지 않았습니다.')
            history=self.storage/'changes'/pid;history.mkdir(parents=True,exist_ok=True)
            (history/'proposal.json').write_bytes(json_bytes(p));(history/'before.source').write_bytes(path.read_bytes())
            path.write_text(p['after'],encoding='utf-8',newline='')
            try:
                self.refresh(export=True)
            except Exception:
                if digest(read(path))==digest(p['after']):path.write_bytes((history/'before.source').read_bytes())
                raise
            result=dict(id=pid,path=p['path'],reason=p['reason'],revision=self.revision,validation='소스 재분석 완료. Unity 빌드·실행 검증은 수행하지 않았습니다.')
            (history/'result.json').write_bytes(json_bytes(result));del self.pending[pid]
            return result

class Handler(BaseHTTPRequestHandler):
    def log_message(self,*args):pass
    def respond(self,data,status=200,kind='application/json; charset=utf-8',cookie=False):
        payload=data if isinstance(data,bytes) else json_bytes(data)
        self.send_response(status);self.send_header('Content-Type',kind);self.send_header('Content-Length',str(len(payload)));self.send_header('Cache-Control','no-store');self.send_header('X-Content-Type-Options','nosniff')
        if cookie:self.send_header('Set-Cookie','depth-session='+self.server.token+'; HttpOnly; SameSite=Strict; Path=/')
        self.end_headers();self.wfile.write(payload)
    def authorized(self):
        cookie='depth-session='+self.server.token
        return self.headers.get('X-Depth-Context')==self.server.token or cookie in self.headers.get('Cookie','').split('; ')
    def do_GET(self):
        try:
            p=urlparse(self.path)
            if self.headers.get('Host') not in [f'127.0.0.1:{self.server.server_port}',f'localhost:{self.server.server_port}']:return self.respond(dict(error='Host rejected'),403)
            if p.path.startswith('/api/'):
                if not self.authorized():return self.respond(dict(error='Local session required'),403)
                bench=self.server.bench;q=parse_qs(p.query)
                if p.path=='/api/snapshot':return self.respond(bench.snapshot())
                if p.path=='/api/search':return self.respond(bench.search(q.get('q',[''])[0]))
                if p.path=='/api/module':return self.respond(bench.context(q['id'][0]))
                if p.path=='/api/composition':return self.respond(bench.composition(q['id'][0]))
                if p.path=='/api/source':return self.respond(bench.source(q['id'][0]))
                return self.respond(dict(error='Not found'),404)
            relative='index.html' if p.path=='/' else p.path.lstrip('/')
            file=(WEB/relative).resolve()
            if not file.is_relative_to(WEB.resolve()) or not file.is_file():return self.respond(dict(error='Not found'),404)
            mime={'.html':'text/html; charset=utf-8','.css':'text/css; charset=utf-8','.js':'text/javascript; charset=utf-8','.png':'image/png','.svg':'image/svg+xml'}.get(file.suffix,'application/octet-stream')
            self.respond(file.read_bytes(),kind=mime,cookie=p.path=='/')
        except Exception as error:self.respond(dict(error=str(error)),400)
    def do_POST(self):
        try:
            origin=self.headers.get('Origin');expected='http://'+self.headers.get('Host','')
            agent_record=self.path=='/api/record' and self.headers.get('X-Depth-Context')==self.server.token and origin is None
            if not agent_record and (origin!=expected or not self.authorized()):return self.respond(dict(error='Local origin/session required'),403)
            size=int(self.headers.get('Content-Length','0'))
            if size>64000:return self.respond(dict(error='Request too large'),413)
            body=json.loads(self.rfile.read(size));bench=self.server.bench
            if self.path=='/api/record':
                if not agent_record:return self.respond(dict(error='Agent context token required'),403)
                return self.respond(bench.record(body['id'],body['record'],body['revision']))
            if self.path=='/api/propose':return self.respond(bench.propose_batch(body['id'],body['changes'],body['revision']) if 'changes' in body else bench.propose(body['id'],body['property'],body['value'],body['revision']))
            if self.path=='/api/apply':return self.respond(bench.apply(body['id'],body.get('approved')))
            if self.path=='/api/refresh':return self.respond(bench.refresh())
            self.respond(dict(error='Not found'),404)
        except Exception as error:self.respond(dict(error=str(error)),400)

TOOLS=[dict(name='modules.search',description='AI가 남긴 목적·생성 이유·설계 근거와 실제 코드/에셋을 검색합니다.',inputSchema=dict(type='object',properties=dict(query=dict(type='string')),required=['query'])),dict(name='modules.get',description='모듈의 AI 설명, 소스 근거, 속성과 연결을 읽습니다.',inputSchema=dict(type='object',properties=dict(id=dict(type='string')),required=['id'])),dict(name='source.read',description='모듈에 연결된 원본 소스 범위를 읽습니다.',inputSchema=dict(type='object',properties=dict(id=dict(type='string')),required=['id']))]
TOOLS.append(dict(name='modules.record',description='AI가 모듈 목적·생성 이유·설계 근거를 소스 근거와 함께 기록합니다. 내부 추론 원문 대신 검증 가능한 요약을 남기세요. 소스 해시가 달라지면 거부합니다.',inputSchema=dict(type='object',properties=dict(id=dict(type='string'),revision=dict(type='string'),record=dict(type='object',properties=dict(purpose=dict(type='string'),moduleCreationReason=dict(type='string'),designRationale=dict(type='array',items=dict(type='string')),inputs=dict(type='array',items=dict(type='string')),outputs=dict(type='array',items=dict(type='string')),effects=dict(type='array',items=dict(type='string')),limitations=dict(type='array',items=dict(type='string'))),required=['purpose','moduleCreationReason'])),required=['id','revision','record'])))
def mcp():
    sys.stdin.reconfigure(encoding='utf-8');sys.stdout.reconfigure(encoding='utf-8')
    connection=json.loads(read(STORE/'connection.json'))
    def get(route):
        with urlopen(Request(connection['url']+route,headers={'X-Depth-Context':connection['token']}),timeout=15) as r:return json.load(r)
    from urllib.parse import urlencode
    for line in sys.stdin:
        request={}
        try:
            request=json.loads(line)
            if 'id' not in request:continue
            method=request['method'];params=request.get('params',{})
            if method=='initialize':result=dict(protocolVersion='2024-11-05',capabilities=dict(tools={}),serverInfo=dict(name='depth-module-context',version='0.2.0'))
            elif method=='ping':result={}
            elif method=='tools/list':result=dict(tools=TOOLS)
            elif method=='tools/call':
                name=params['name'];args=params.get('arguments',{})
                if name=='modules.record':
                    with urlopen(Request(connection['url']+'/api/record',data=json_bytes(args),headers={'X-Depth-Context':connection['token'],'Content-Type':'application/json'}),timeout=15) as r:value=json.load(r)
                    result=dict(content=[dict(type='text',text=json.dumps(value,ensure_ascii=False))])
                    print(json.dumps(dict(jsonrpc='2.0',id=request['id'],result=result),ensure_ascii=False),flush=True);continue
                route={'modules.search':'/api/search?'+urlencode(dict(q=args.get('query',''))),'modules.get':'/api/module?'+urlencode(dict(id=args.get('id',''))),'source.read':'/api/source?'+urlencode(dict(id=args.get('id','')))}.get(name)
                if route is None:raise ValueError('Unknown tool')
                result=dict(content=[dict(type='text',text=json.dumps(get(route),ensure_ascii=False))])
            else:
                print(json.dumps(dict(jsonrpc='2.0',id=request['id'],error=dict(code=-32601,message='Method not found'))),flush=True);continue
            print(json.dumps(dict(jsonrpc='2.0',id=request['id'],result=result),ensure_ascii=False),flush=True)
        except Exception as error:
            print(json.dumps(dict(jsonrpc='2.0',id=request.get('id'),error=dict(code=-32603,message=str(error)))),flush=True)

def main():
    parser=argparse.ArgumentParser();parser.add_argument('--port',type=int,default=4182);parser.add_argument('--mcp',action='store_true');parser.add_argument('--build',action='store_true');args=parser.parse_args()
    if args.mcp:return mcp()
    bench=Workbench()
    if args.build:print(json.dumps(bench.snapshot()['stats']));return
    server=ThreadingHTTPServer(('127.0.0.1',args.port),Handler);server.bench=bench;server.token=secrets.token_hex(32)
    (STORE/'connection.json').write_bytes(json_bytes(dict(url=f'http://127.0.0.1:{args.port}',token=server.token)))
    print(f'Depth module workbench: http://127.0.0.1:{args.port}',flush=True)
    server.serve_forever()
if __name__=='__main__':main()
