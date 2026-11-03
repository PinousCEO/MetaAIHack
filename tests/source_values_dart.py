"""Real Dart AST -> service value edit -> actual Dart program execution."""
import json
import os
from pathlib import Path
import shutil
import socket
import subprocess
import time
import urllib.request
import uuid

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / 'artifacts' / ('source-values-dart-' + uuid.uuid4().hex[:10])
PROJECT = OUT / 'project'
PROJECT.mkdir(parents=True)
DART = os.environ.get('DEPTH_DART_EXECUTABLE') or shutil.which('dart')
assert DART, 'An installed Dart SDK is required.'
if Path(DART).suffix in ('.bat', '.cmd'):
    DART = str(Path(DART).parent / 'cache/dart-sdk/bin/dart.exe')
SOURCE = '''// Ticket in this comment must remain unchanged.
const price = 48.0;
const enabled = true;
const caption = "Ticket";
double total(int quantity) => price * quantity;
void main() { print('$caption|${total(2)}|$enabled'); }
'''
(PROJECT / 'main.dart').write_text(SOURCE, encoding='utf-8')
report = {'checks': [], 'scope': 'Actual Dart analyzer, .NET API, file edits and Dart execution. No Meta or Flutter engine.'}
def check(value, name):
    assert value, name
    report['checks'].append(name)

with socket.socket() as sock:
    sock.bind(('127.0.0.1', 0))
    port = sock.getsockname()[1]
env = dict(os.environ, DEPTH_PORT=str(port), DEPTH_TOKEN='dart-values-fixture',
           DEPTH_STORAGE=str(OUT / 'state'), DEPTH_ENV_FILE=str(OUT / 'no.env'),
           DEPTH_DART_EXECUTABLE=DART, DEPTH_DART_ADAPTER=str(ROOT / 'adapters/dart/bin/index.dart'))
log = (OUT / 'service.log').open('w', encoding='utf-8')
service = subprocess.Popen(['dotnet', str(ROOT / 'artifacts/desktop-service/Depth.Service.dll')],
                           cwd=ROOT, env=env, stdout=log, stderr=log)
def api(route, body=None):
    request = urllib.request.Request('http://127.0.0.1:' + str(port) + route,
        data=json.dumps(body).encode() if body is not None else None,
        headers={'Content-Type': 'application/json', 'X-Depth-Token': 'dart-values-fixture'})
    with urllib.request.urlopen(request, timeout=180) as response:
        return json.load(response)
try:
    for _ in range(120):
        try:
            api('/health')
            break
        except OSError:
            time.sleep(.1)
    graph = api('/import', {'path': str(PROJECT)})
    graph = api('/graph')
    view = api('/view')
    cards = {c['name']: c for c in view['cards']}
    check(cards['price']['properties'][0]['kind'] == 'number', 'Dart numeric literal discovered through analyzer AST')
    check(cards['enabled']['properties'][0]['kind'] == 'boolean', 'Dart boolean literal discovered')
    check(cards['caption']['properties'][0]['kind'] == 'string', 'Dart string literal discovered')
    caption = 'Tickets $each "new"\nnext'
    changes = [{'id': cards[name]['id'], 'key': cards[name]['properties'][0]['key'], 'value': value}
               for name, value in [('price', '60.5'), ('enabled', 'false'), ('caption', caption)]]
    proposal = api('/property/propose', {'id': cards['price']['id'], 'value': '', 'revision': graph['revision'], 'changes': changes})
    check((PROJECT / 'main.dart').read_text(encoding='utf-8') == SOURCE, 'Draft leaves Dart source unchanged')
    review = api('/proposals/' + proposal['id'])
    check(review['assessment']['canApply'], 'Exact literal change passes current source checks')
    applied = api('/apply', {'id': proposal['id'], 'approved': True})
    actual = subprocess.run([DART, str(PROJECT / 'main.dart')], cwd=PROJECT, capture_output=True, text=True, encoding='utf-8', timeout=30)
    check(actual.returncode == 0, 'Modified Dart application compiles and runs: ' + actual.stderr[:300])
    check(actual.stdout.strip() == caption + '|121.0|false', 'Actual Dart output uses all edited values and keeps dollar text literal')
    check((PROJECT / 'main.dart').read_text(encoding='utf-8').startswith('// Ticket in this comment'), 'Same text in comments is not edited')
    undo = api('/history/' + applied['id'] + '/undo', {})
    api('/apply', {'id': undo['id'], 'approved': True})
    check((PROJECT / 'main.dart').read_text(encoding='utf-8') == SOURCE, 'Dart value undo restores exact original source')
    report['status'] = 'passed'
except Exception as error:
    report.update(status='failed', error=str(error))
    raise
finally:
    service.terminate()
    service.wait(timeout=10)
    log.close()
    (OUT / 'report.json').write_text(json.dumps(report, indent=2), encoding='utf-8')
    print(json.dumps({'status': report['status'], 'checks': len(report['checks']), 'out': str(OUT)}))
