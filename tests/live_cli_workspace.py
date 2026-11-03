"""Explicit live-account smoke: run manually with DEPTH_CODEX_EXECUTABLE set.

Uses installed CLI authentication without reading/copying credential files.
Only an isolated Checkout fixture can be changed. Not part of offline tests.
"""
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
assert os.environ.get('DEPTH_CODEX_EXECUTABLE'), 'Set DEPTH_CODEX_EXECUTABLE to the native executable.'
run = ROOT/'artifacts'/('live-cli-'+uuid.uuid4().hex[:10])
project = run/'project'
shutil.copytree(ROOT/'samples/Checkout',project,ignore=shutil.ignore_patterns('bin','obj'))
with socket.socket() as sock:
    sock.bind(('127.0.0.1',0))
    port = sock.getsockname()[1]
token = 'live-fixture-'+uuid.uuid4().hex
env = dict(os.environ,DEPTH_PORT=str(port),DEPTH_TOKEN=token,DEPTH_STORAGE=str(run/'state'))
process = subprocess.Popen(['dotnet',str(ROOT/'src/Depth.Service/bin/Release/net8.0/Depth.Service.dll')],env=env,stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL)
def call(route, body=None):
    req = urllib.request.Request(f'http://127.0.0.1:{port}'+route,data=None if body is None else json.dumps(body).encode(),headers={'X-Depth-Token':token,'Content-Type':'application/json'})
    with urllib.request.urlopen(req,timeout=270) as response:
        return json.load(response)
try:
    for _ in range(100):
        try:
            call('/health')
            break
        except OSError:
            time.sleep(.1)
    graph=call('/import',{'path':str(project)})
    card=next(c for c in call('/view')['cards'] if c['name']=='DiscountPercent')
    original=(project/'CouponRules.cs').read_bytes()
    proposal=call('/propose',{'prompt':'Use the Depth MCP source tools to change DiscountPercent from 20 to 25. Return one reviewable proposal with that existing file edit. Do not write project files or run any build or shell commands. Keep modules empty.','moduleIds':[card['id']],'revision':graph['revision'],'projectId':graph['projectId']})
    assert (project/'CouponRules.cs').read_bytes()==original
    review=call('/proposals/'+proposal['id'])
    assert review['assessment']['canApply'] and len(review['changes'])==1
    assert review['changes'][0]['path']=='CouponRules.cs' and 'DiscountPercent = 25' in review['changes'][0]['after']
    assert any(i['tool']=='source.read' for i in call('/activity')['items']), 'Live provider must use the shared source tools.'
    call('/apply',{'id':proposal['id'],'approved':True})
    assert call('/view')['preview']['total']==90
    (run/'result.json').write_text(json.dumps({'passed':True,'fixture':str(project),'liveCli':True,'modelNotPinned':True}),encoding='utf-8')
    print('PASS live authenticated CLI -> shared MCP -> proposal -> review -> isolated fixture apply/reindex. No performance claim.')
except urllib.error.HTTPError as error:
    (run/'failure.json').write_bytes(error.read())
    print('Live CLI request failed. Diagnostic record: '+str(run/'failure.json'))
    raise SystemExit(1)
finally:
    process.terminate()
    try: process.wait(timeout=10)
    except subprocess.TimeoutExpired:
        process.kill()
        process.wait()
