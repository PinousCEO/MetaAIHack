const {spawn}=require('node:child_process');
const readline=require('node:readline');
const path=require('node:path');
const assert=require('node:assert/strict');
const root=path.resolve(__dirname,'..');
const child=spawn('python',['scripts/module_workbench.py','--mcp'],{cwd:root,windowsHide:true,stdio:['pipe','pipe','pipe']});
const waiting=new Map();let id=0,stderr='';child.stderr.on('data',b=>stderr+=b.toString());
readline.createInterface({input:child.stdout}).on('line',line=>{const m=JSON.parse(line),p=waiting.get(m.id);if(p){waiting.delete(m.id);clearTimeout(p.timer);m.error?p.reject(Error(JSON.stringify(m.error))):p.resolve(m.result)}});
function call(method,params={}){return new Promise((resolve,reject)=>{const n=++id,timer=setTimeout(()=>{waiting.delete(n);reject(Error('MCP timeout '+method+' '+stderr))},10000);waiting.set(n,{resolve,reject,timer});child.stdin.write(JSON.stringify({jsonrpc:'2.0',id:n,method,params})+'\n')})}
(async()=>{
 const response=await fetch('http://127.0.0.1:4182/api/snapshot');assert.equal(response.status,403);
 const init=await call('initialize',{protocolVersion:'2024-11-05',capabilities:{},clientInfo:{name:'depth-context-test',version:'1'}});assert(init.capabilities.tools);
 child.stdin.write(JSON.stringify({jsonrpc:'2.0',method:'notifications/initialized'})+'\n');
 const list=await call('tools/list');assert.equal(list.tools.length,4);assert(list.tools.some(t=>t.name==='modules.record'));
 const found=await call('tools/call',{name:'modules.search',arguments:{query:'폰트'}});const matches=JSON.parse(found.content[0].text);assert(matches.some(n=>n.id==='font:unity-skin'));
 const record=await call('tools/call',{name:'modules.get',arguments:{id:'style:button'}});const context=JSON.parse(record.content[0].text);assert(context.module.ai.moduleCreationReason);assert(context.module.ai.evidence.length);assert(context.relationships.some(e=>e.target==='font:unity-skin'));
 const source=await call('tools/call',{name:'source.read',arguments:{id:'style:button'}});assert(JSON.parse(source.content[0].text)[0].content.includes('fontSize = 13'));
 const note={author:'Codex',purpose:'Button 헬퍼를 사용하는 컨트롤의 글자 크기·배경·정렬을 한 GUIStyle에서 공유합니다.',moduleCreationReason:'버튼마다 표시 규칙을 복제하지 않고 공유 스타일을 하나의 모듈로 추적하여, 스타일 변경의 파급 범위를 AI와 사용자가 쉽게 찾도록 분리했습니다.',designRationale:['Styles()에서 GUI.skin.button을 복제하여 button GUIStyle을 구성합니다.','Button(Rect, string) 헬퍼는 GUI.Button(r, label, button)으로 이 스타일을 전달합니다.','공유 스타일의 변경은 이를 사용하는 버튼에 함께 영향을 줍니다.'],inputs:['GUI.skin.button의 기본 표시 규칙','fontSize 및 상태별 배경색'],outputs:['버튼 렌더링에 전달되는 GUIStyle'],effects:['같은 Button 헬퍼를 사용하는 가져오기·새로 고침·검토 버튼의 표시'],limitations:['실제 폰트 이름은 런타임에서 확인하지 않았습니다.','원 작성자의 최초 구현 의도는 기록되지 않아 단정하지 않습니다.']};
 const written=await call('tools/call',{name:'modules.record',arguments:{id:'style:button',revision:context.revision,record:note}});assert.equal(JSON.parse(written.content[0].text).id,'style:button');
 const reread=await call('tools/call',{name:'modules.get',arguments:{id:'style:button'}});assert.equal(JSON.parse(reread.content[0].text).module.ai.purpose,note.purpose);
 const remembered=await call('tools/call',{name:'modules.search',arguments:{query:'파급 범위'}});assert(JSON.parse(remembered.content[0].text).some(n=>n.id==='style:button'));
 console.log('PASS: MCP initialize, tool discovery, Korean AI-record search, shared module context, source range, unauthenticated HTTP rejection');
})().catch(error=>{console.error(error);process.exitCode=1}).finally(()=>{child.stdin.end();child.kill()});
