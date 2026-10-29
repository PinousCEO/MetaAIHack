import copy, importlib.util, json, tempfile, unittest
from pathlib import Path

ROOT=Path(__file__).resolve().parent.parent
spec=importlib.util.spec_from_file_location('workbench',ROOT/'scripts/module_workbench.py')
wb=importlib.util.module_from_spec(spec);spec.loader.exec_module(wb)

class WorkbenchTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        # Use a source snapshot only as input; all edit/apply operations target an isolated copy.
        raw=(ROOT/'design/atlas/project-data.js').read_text(encoding='utf-8')
        cls.exported=json.loads(raw.split('=',1)[1].strip().rstrip(';'))
    def setUp(self):
        (ROOT/'.depth').mkdir(exist_ok=True)
        self.temp=tempfile.TemporaryDirectory(dir=ROOT/'.depth',prefix='workbench-test-')
        self.root=Path(self.temp.name)
        for relative in [wb.CS,'unity/Depth.Desktop/Assets/Resources/DepthGlow.mat']:
            target=self.root/relative;target.parent.mkdir(parents=True,exist_ok=True);target.write_bytes((ROOT/relative).read_bytes())
        self.bench=wb.Workbench(self.root,self.root/'metadata',copy.deepcopy(self.exported))
    def tearDown(self):
        assert self.root.resolve().is_relative_to((ROOT/'.depth').resolve())
        self.temp.cleanup()
    def test_ui_style_font_and_ai_evidence_are_shared(self):
        b=self.bench
        self.assertEqual(len([n for n in b.nodes.values() if n['kind']=='FONT']),1)
        buttons=[n for n in b.nodes.values() if n['kind']=='BUTTON']
        self.assertGreater(len(buttons),1)
        self.assertTrue(all(any(e['source']==n['id'] and e['target']=='style:button' for e in b.edges) for n in buttons))
        self.assertTrue(b.nodes['style:button']['ai']['evidence'])
        self.assertIn('font:unity-skin',[r['id'] for r in b.search('폰트')])
        self.assertIn('moduleCreationReason',b.context('ui:button:0')['module']['ai'])
    def test_proposal_does_not_write_and_conflicts_fail_closed(self):
        b=self.bench;path=self.root/wb.CS;before=path.read_bytes()
        p=b.propose('ui:button:0','label','프로젝트 가져오기',b.revision)
        self.assertEqual(path.read_bytes(),before)
        with self.assertRaises(ValueError):b.apply(p['id'],False)
        path.write_bytes(before+b'\n// external edit\n')
        with self.assertRaises(ValueError):b.apply(p['id'],True)
        self.assertTrue(path.read_bytes().endswith(b'// external edit\n'))
    def test_batch_style_apply_updates_real_source_and_reindexes(self):
        b=self.bench;old=b.revision
        p=b.propose_batch('style:button',[dict(property='fontSize',value=17),dict(property='normalColor',value='#245678')],b.revision)
        self.assertIn('fontSize = 17',p['after']);self.assertIn('0.141176f',p['after'])
        result=b.apply(p['id'],True)
        self.assertNotEqual(old,b.revision)
        self.assertEqual(next(p['value'] for p in b.nodes['style:button']['properties'] if p['key']=='fontSize'),17)
        self.assertIn('fontSize = 17',(self.root/wb.CS).read_text(encoding='utf-8'))
        self.assertTrue((b.storage/'changes'/p['id']/'before.source').exists())
        self.assertEqual(result['revision'],b.revision)
    def test_invalid_bindings_and_ranges_are_rejected(self):
        b=self.bench
        with self.assertRaises(ValueError):b.propose('font:unity-skin','family','FakeFont',b.revision)
        with self.assertRaises(ValueError):b.propose('style:button','fontSize',999,b.revision)
        with self.assertRaises(ValueError):b.resolve('../outside.cs')
    def test_agent_records_are_searchable_persistent_and_invalidated(self):
        b=self.bench
        note=dict(purpose='Shared widget typography memory',moduleCreationReason='Keep shared widget settings in one implementation',designRationale=['All literal buttons reference this style.'])
        b.record('style:button',note,b.revision)
        self.assertIn('style:button',[n['id'] for n in b.search('typography')])
        self.assertEqual(b.context('style:button')['module']['ai']['origin'],'agent-authored')
        path=self.root/wb.CS;path.write_text(wb.read(path)+'\n// external change\n',encoding='utf-8',newline='')
        with self.assertRaises(ValueError):b.record('style:button',note,b.revision)
        b.exported['sources'][wb.CS]=wb.read(path);b.refresh(export=False)
        self.assertEqual(b.context('style:button')['module']['ai']['validation']['source'],'needs-review')
    def test_preview_composition_preserves_identities_and_marks_route_mapping(self):
        b=self.bench;c=b.composition('ui:button:0')
        self.assertEqual(len(c['moduleIds']),len(set(c['moduleIds'])))
        self.assertIn('style:button',c['moduleIds']);self.assertIn('font:unity-skin',c['moduleIds'])
        self.assertTrue(any(f['id']=='function:snapshot' for f in c['functions']))
        self.assertTrue(any(e['kind']=='api-route' and e['evidence']=='inferred' for e in c['relationships']))
        self.assertEqual(b.composition('ui:button:1')['revision'],c['revision'])

if __name__=='__main__':unittest.main()
