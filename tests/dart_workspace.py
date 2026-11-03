"""Real Dart resolution and service graph contract, using an isolated fixture."""
import json
import os
from pathlib import Path
import shutil
import subprocess
import uuid

ROOT = Path(__file__).resolve().parents[1]
run = ROOT / 'artifacts' / ('dart-graph-' + uuid.uuid4().hex[:10])
run.mkdir(parents=True)
project = run / 'project'
project.mkdir()
(project / 'shared.dart').write_text('''class Rules {
  static const discount = 20;
  static double total(double value) => value * (1 - discount / 100);
}
class Product { final double price; Product(this.price); }
''', encoding='utf-8')
(project / 'checkout.dart').write_text('''import 'shared.dart';
double checkout() => Rules.total(Product(120).price);
double cart() => Rules.total(100);
void unresolved(dynamic value) { value.total(); }
''', encoding='utf-8')
(project / 'unrelated.dart').write_text('class Unrelated { double total() => 0; }', encoding='utf-8')
dart = os.environ.get('DEPTH_DART_EXECUTABLE') or shutil.which('dart')
assert dart, 'Set DEPTH_DART_EXECUTABLE to the native Dart executable.'
if os.name == 'nt' and Path(dart).suffix.lower() in ('.bat', '.cmd'):
    native = Path(dart).parent / 'cache/dart-sdk/bin/dart.exe'
    assert native.is_file(), 'Set DEPTH_DART_EXECUTABLE to dart.exe; Flutter batch wrappers may run setup or wait on a global lock.'
    dart = str(native)
adapter = Path(os.environ.get('DEPTH_DART_ADAPTER') or ROOT / 'adapters/dart/bin/index.dart')
result = subprocess.run([dart, str(adapter), str(project)], capture_output=True, text=True, encoding='utf-8', timeout=120)
assert result.returncode == 0, result.stderr
graph = json.loads(result.stdout)
assert graph['schema'] == '2'
decls = graph['declarations']
total = next(d for d in decls if d['qualifiedName'] == 'Rules.total')
users = [r for r in graph['relations'] if r['to'] == total['key'] and r['kind'] == 'calls']
assert len(users) == 2
assert {r['from'].split(':')[-1] for r in users} == {'checkout', 'cart'}
assert any(r['kind'] == 'references' and r['to'].endswith(':Rules.discount') for r in graph['relations'])
assert any(r['kind'] == 'constructs' and r['from'].endswith(':checkout') for r in graph['relations'])
assert not any(r['from'].endswith(':unresolved') and r['kind'] == 'calls' for r in graph['relations'])
assert not any(r['to'].endswith(':Unrelated.total') and r['kind'] == 'calls' for r in graph['relations'])
env = dict(os.environ, DEPTH_DART_EXECUTABLE=dart, DEPTH_DART_ADAPTER=str(adapter))
export = run / 'graph.js'
service = ROOT / 'src/Depth.Service/bin/Release/net8.0/Depth.Service.dll'
subprocess.run(['dotnet', str(service), '--export-view', str(project), str(export)], env=env, check=True, timeout=120)
service_graph = json.loads(export.read_text(encoding='utf-8').removeprefix('window.DEPTH_PROJECT = ').removesuffix(';'))['graph']
target = next(e for e in service_graph['entities'] if e['qualifiedName'] == 'Rules.total')
assert len([r for r in service_graph['relations'] if r['to'] == target['id'] and r['kind'] == 'calls']) == 2
assert all(r['evidence']['method'] == 'dart-resolved-element' for r in service_graph['relations'])
assert not graph['diagnostics'], graph['diagnostics']
print('PASS resolved Dart cross-file calls, field references, constructors and shared canonical IDs.')
print('PASS dynamic and same-name unrelated calls do not produce guessed source relationships.')
