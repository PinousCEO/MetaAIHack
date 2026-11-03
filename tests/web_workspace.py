"""Real TypeScript compiler analysis and the same service review/apply contracts."""
import json
import os
from pathlib import Path
import shutil
import socket
import subprocess
import time
import urllib.request
import urllib.error
import uuid

ROOT = Path(__file__).resolve().parents[1]
run = ROOT / 'artifacts' / ('web-graph-' + uuid.uuid4().hex[:10])
project = run / 'project'
project.mkdir(parents=True)
(project / 'base.json').write_text(json.dumps({'compilerOptions':{'target':'ES2022','module':'ESNext','moduleResolution':'Bundler','jsx':'preserve','allowJs':True,'baseUrl':'.','paths':{'@rules':['rules.ts']}}}), encoding='utf-8')
(project / 'tsconfig.json').write_text(json.dumps({'extends':'./base.json','include':['*.ts','*.tsx','*.js'],'exclude':['excluded.js']}), encoding='utf-8')
(project / 'rules.ts').write_text('export const discount = 20;\nexport function total(value:number) { return value * (1 - discount / 100); }\n', encoding='utf-8')
(project / 'default.tsx').write_text('export default () => <button>Default</button>;', encoding='utf-8')
(project / 'checkout.tsx').write_text('''import { total as shared } from '@rules';
import DefaultButton from './default';
export function checkout() { return shared(120); }
export function cart() { return shared(100); }
export function Button() { return <button>Apply</button>; }
export function Screen() { return <div><Button /><DefaultButton /></div>; }
export function unresolved(value:any) { return value.total(); }
''', encoding='utf-8')
(project / 'unrelated.ts').write_text('export function total() { return 0; }', encoding='utf-8')
(project / 'excluded.js').write_text('function excluded() { invalid syntax !!! }', encoding='utf-8')
(project / 'jsconsumer.js').write_text("import {total} from './rules'; export function legacy() { return total(50); }", encoding='utf-8')
node = os.environ.get('DEPTH_NODE_EXECUTABLE') or shutil.which('node')
assert node, 'Node.js is required.'
adapter = ROOT / 'adapters/web/index.mjs'
result = subprocess.run([node, str(adapter), str(project)], text=True, encoding='utf-8', capture_output=True, timeout=90)
assert result.returncode == 0, result.stderr
graph = json.loads(result.stdout)
assert not graph['diagnostics'], graph['diagnostics']
assert graph['configuration'] == 'tsconfig.json' and {'base.json','tsconfig.json'} <= set(graph['inputs'])
decls = graph['declarations']
total = next(d for d in decls if d['path'] == 'rules.ts' and d['name'] == 'total')
assert len([r for r in graph['relations'] if r['to'] == total['key'] and r['kind'] == 'calls']) == 3
assert not any(d['path'] == 'excluded.js' for d in decls)
assert any(r['kind'] == 'constructs' and r['from'].endswith(':Screen') and r['to'].endswith(':Button') for r in graph['relations'])
assert any(r['kind'] == 'constructs' and r['from'].endswith(':Screen') and r['to']=='default.tsx:default' for r in graph['relations'])
assert not any(r['kind'] == 'calls' and r['from'].endswith(':unresolved') for r in graph['relations'])
with socket.socket() as sock:
    sock.bind(('127.0.0.1',0))
    port = sock.getsockname()[1]
token = 'web-test-' + uuid.uuid4().hex
env = dict(os.environ, DEPTH_WEB_ADAPTER=str(adapter), DEPTH_NODE_EXECUTABLE=node,
           DEPTH_PORT=str(port), DEPTH_TOKEN=token, DEPTH_STORAGE=str(run/'state'))
service = ROOT / 'src/Depth.Service/bin/Release/net8.0/Depth.Service.dll'
process = subprocess.Popen(['dotnet',str(service)], env=env, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
def call(route, body=None):
    request = urllib.request.Request(f'http://127.0.0.1:{port}'+route, data=None if body is None else json.dumps(body).encode(), headers={'X-Depth-Token':token,'Content-Type':'application/json'})
    with urllib.request.urlopen(request, timeout=120) as response:
        return json.load(response)
try:
    for _ in range(100):
        try:
            call('/health')
            break
        except (OSError, urllib.error.URLError):
            time.sleep(.1)
    indexed = call('/import', {'path':str(project)})
    target = next(e for e in indexed['entities'] if e['name']=='total' and e['anchors'][0]['path']=='rules.ts')
    impact = call('/impact', {'id':target['id'],'revision':indexed['revision']})
    assert impact['directUsers'] == 3
    view = call('/view')
    assert any(c['id']==target['id'] for c in view['cards'])
    source = call('/context/call', {'name':'source.read','argumentsJson':json.dumps({'id':target['id'],'wholeFile':True})})
    assert 'discount = 20' in source['sources'][0]['content']
    edited = "import {rate} from './shared-rate';\n" + (project/'rules.ts').read_text(encoding='utf-8').replace('discount = 20','discount = rate')
    obsolete = next(f for f in indexed['files'] if f['path']=='unrelated.ts')
    proposal = call('/context/call', {'name':'changes.propose','argumentsJson':json.dumps({'id':'','projectId':indexed['projectId'],'revision':indexed['revision'],'reason':'Adjust shared rate','edits':[
        {'path':'rules.ts','expectedHash':target['anchors'][0]['contentHash'],'content':edited,'operation':'replace'},
        {'path':'shared-rate.ts','expectedHash':'','content':'export const rate = 25;','operation':'create'},
        {'path':'unrelated.ts','expectedHash':obsolete['hash'],'content':'','operation':'delete'}],'modules':[]})})
    review = call('/proposals/'+proposal['id'])
    assert {c['operation'] for c in review['changes']}=={'replace','create','delete'}
    assert next(c for c in review['assessment']['checks'] if c['name']=='Other-language syntax')['status']=='not-run'
    profile = {'name':'TypeScript target check','requirePass':True,'commands':[{'kind':'build','executable':node,'arguments':[str(ROOT/'adapters/web/node_modules/typescript/bin/tsc'),'--noEmit','-p','tsconfig.json'],'workingDirectory':'.','timeoutSeconds':60}]}
    call('/validation/profile',profile)
    assert not call('/proposals/'+proposal['id'])['assessment']['canApply']
    validation = call('/proposals/'+proposal['id']+'/validate', {'approved':True})
    assert validation['commands'][0]['status']=='passed', validation
    call('/apply',{'id':proposal['id'],'approved':True})
    assert (project/'rules.ts').read_text(encoding='utf-8')==edited
    assert (project/'shared-rate.ts').exists() and not (project/'unrelated.ts').exists()
    assert next(e for e in call('/graph')['entities'] if e['name']=='total' and e['anchors'][0]['path']=='rules.ts')['id']==target['id']
    print('PASS web compiler config/aliases/exclusions, JS calls, JSX construction and no guessed dynamic calls.')
    print('PASS web HTTP source/context/impact and reviewed proposal validated by actual tsc in a copy before apply.')
finally:
    process.terminate()
    try: process.wait(timeout=10)
    except subprocess.TimeoutExpired:
        process.kill()
        process.wait()
