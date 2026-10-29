"""Real native-workspace HTTP/MCP roundtrip; writes only isolated workspace fixtures."""
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
ART = ROOT / 'artifacts'
ART.mkdir(exist_ok=True)
run = ART / ('native-http-' + uuid.uuid4().hex[:10])
run.mkdir()
project = run / 'project'
shutil.copytree(ROOT / 'samples/Checkout', project, ignore=shutil.ignore_patterns('bin', 'obj'))
with socket.socket() as sock:
    sock.bind(('127.0.0.1', 0))
    port = sock.getsockname()[1]
token = 'native-test-' + uuid.uuid4().hex
env = dict(os.environ, DEPTH_PORT=str(port), DEPTH_TOKEN=token, DEPTH_STORAGE=str(run / 'state'))
executable = ROOT / 'src/Depth.Service/bin/Release/net8.0/Depth.Service.dll'
process = subprocess.Popen(['dotnet', str(executable)], env=env, stdout=subprocess.DEVNULL, stderr=subprocess.PIPE)

def call(path, body=None):
    request = urllib.request.Request(f'http://127.0.0.1:{port}' + path, data=None if body is None else json.dumps(body).encode(), headers={'X-Depth-Token':token,'Content-Type':'application/json'})
    with urllib.request.urlopen(request, timeout=90) as response:
        return json.load(response)

try:
    for _ in range(100):
        try:
            call('/health')
            break
        except OSError:
            time.sleep(.1)
    else:
        raise RuntimeError('Service did not start')
    graph = call('/import', {'path':str(project)})
    view = call('/view')
    assert view['preview']['total'] == 96
    assert len([c for c in view['cards'] if c['kind'] == 'Image']) == 2
    root_id, field_id = view['preview']['entryId'], view['preview']['propertyId']
    closure = call('/composition/' + root_id)
    assert field_id in closure['memberIds']
    assert any(r['kind'] == 'view-asset' and r['evidence']['method'] == 'declared-preview-adapter' for r in closure['relations'])
    pricing = project / 'CouponRules.cs'
    before = pricing.read_bytes()
    draft = call('/property/draft', {'id':field_id, 'value':'25', 'revision':view['revision']})
    assert draft['total'] == 90 and pricing.read_bytes() == before
    proposal = call('/property/propose', {'id':field_id,'value':'25','revision':view['revision']})
    reviewed = call('/proposals/' + proposal['id'])
    assert 'DiscountPercent = 20' in reviewed['changes'][0]['before']
    assert 'DiscountPercent = 25' in reviewed['changes'][0]['after']
    try:
        call('/apply', {'id':proposal['id'],'approved':False})
        raise AssertionError('Unapproved change applied')
    except urllib.error.HTTPError as error:
        assert error.code == 400
    call('/apply', {'id':proposal['id'],'approved':True})
    updated = call('/view')
    assert updated['preview']['total'] == 90 and updated['preview']['propertyId'] == field_id
    calculation = next(c for c in updated['cards'] if c['name'] == 'CalculateTotal')
    assert calculation['noteStatus'] == 'needs review'
    messages = [
        {'jsonrpc':'2.0','id':1,'method':'initialize','params':{'protocolVersion':'2025-06-18','capabilities':{},'clientInfo':{'name':'native-test','version':'1'}}},
        {'jsonrpc':'2.0','method':'notifications/initialized'},
        {'jsonrpc':'2.0','id':2,'method':'tools/list','params':{}},
        {'jsonrpc':'2.0','id':3,'method':'tools/call','params':{'name':'modules.get','arguments':{'id':root_id}}},
        {'jsonrpc':'2.0','id':4,'method':'tools/call','params':{'name':'source.read','arguments':{'id':field_id,'wholeFile':True}}},
        {'jsonrpc':'2.0','id':5,'method':'tools/call','params':{'name':'modules.record','arguments':{'id':calculation['id'],'revision':updated['revision'],'purpose':'Shared coupon arithmetic','creationReason':'One calculation used by checkout and cart summary','rationale':'Two source callers refer to one implementation; runtime behavior was not observed.'}}}
    ]
    bridge = subprocess.run(['dotnet',str(executable),'--mcp','--connection',str(run/'state/connection.json')], input='\n'.join(json.dumps(m) for m in messages)+'\n', text=True, encoding='utf-8', capture_output=True, timeout=30)
    assert bridge.returncode == 0, bridge.stderr
    replies = [json.loads(line) for line in bridge.stdout.splitlines() if line.strip()]
    assert [r['id'] for r in replies] == [1,2,3,4,5], replies
    assert len(replies[1]['result']['tools']) == 5
    assert all(not r['result'].get('isError',False) for r in replies[2:]), replies
    assert 'DiscountPercent = 25' in replies[3]['result']['content'][0]['text']
    assert next(c for c in call('/view')['cards'] if c['id']==calculation['id'])['noteStatus'] == 'source matched'
    assert len(call('/activity')['items']) >= 3
    try:
        call('/agent', {'prompt':'Explain','apiKey':'','model':'','moduleIds':[root_id],'revision':updated['revision']})
        raise AssertionError('Missing credentials accepted')
    except urllib.error.HTTPError as error:
        assert error.code == 400
    print('PASS real HTTP import, source model, asset links, draft/review/apply/reindex and stale notes.')
    print('PASS stdio MCP initialize/list/get/read/record use the SAME running workspace; no model API calls.')
finally:
    process.terminate()
    try:
        process.wait(timeout=10)
    except subprocess.TimeoutExpired:
        process.kill()
        process.wait()

# The native EXE smoke test receives a different untouched source fixture.
fixture = ART / ('native-smoke-' + uuid.uuid4().hex[:10])
shutil.copytree(ROOT/'samples/Checkout', fixture, ignore=shutil.ignore_patterns('bin','obj'))
(fixture/'.allow-smoke-apply').write_text('isolated test fixture only\n',encoding='utf-8')
(ART/'native-workbench-fixture.json').write_text(json.dumps({'project':str(fixture)},indent=2),encoding='utf-8')
(ART/'native-workspace-result.json').write_text(json.dumps({'result':'passed','http':True,'mcp':True,'liveApi':False,'fixture':str(fixture)},indent=2),encoding='utf-8')
