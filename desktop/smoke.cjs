const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
function navigationIconsFit(root){
  const icons=[...root.querySelectorAll('.rail>button .icon-svg')];
  return icons.length>0&&icons.every(el=>{const a=el.getBoundingClientRect(),b=el.closest('button').getBoundingClientRect();return a.width>0&&a.height>0&&a.left>=b.left&&a.top>=b.top&&a.right<=b.right&&a.bottom<=b.bottom;});
}
const navigationCheck='('+navigationIconsFit.toString()+')(document)';
exports.navigationCheck=navigationCheck;
function captureMarker(color){
  let marker=document.querySelector('#native-capture-marker');
  if(!marker){marker=document.createElement('div');marker.id='native-capture-marker';marker.title='Capture frame marker';}
  const dialog=[...document.querySelectorAll('dialog[open]')].at(-1);
  // A modal's top layer covers every body z-index, including the old corner marker.
  (dialog||document.body).append(marker);
  Object.assign(marker.style,{position:dialog?'absolute':'fixed',top:'0',left:'0',width:'8px',height:'8px',zIndex:'2147483647',pointerEvents:'none',background:'rgb('+color.join(',')+')'});
  const r=marker.getBoundingClientRect();
  return {x:r.left+4,y:r.top+4,width:innerWidth,height:innerHeight};
}
exports.captureMarker=captureMarker;
exports.run=async({win,api,evidence,sleep,app,project,base,liveMeta=false,pickFolder})=>{
  const sourceHashes=Object.fromEntries(['main.cjs','preload.cjs','project-drop.cjs','smoke.cjs','smoke-drop.cjs','surface-smoke.cjs','docking-smoke.cjs','identity-audit.cjs','ui/index.html','ui/app.js','ui/assembly.js','ui/workspace.js','ui/dock-model.js','ui/dock-engine.js','ui/dock-workbench.js','ui/preview-focus.js','ui/docking.css','ui/workspace.css','ui/surfaces.css','ui/visual-identity.css','ui/visual-model.js','ui/product.js','ui/project-drop.js','ui/project-drop.css'].map(file=>[file,require('node:crypto').createHash('sha256').update(fs.readFileSync(path.join(__dirname,file))).digest('hex')]));
  const checks=[],errors=[],captures=[],visualFailures=[];win.webContents.on('console-message',(_e,level,message)=>{if(level===3)errors.push(message);});
  const js=code=>win.webContents.executeJavaScript(code,true);
  const check=(v,name)=>{assert(v,name);checks.push(name);};
  const layoutCheck=(v,name)=>{if(v)checks.push(name);else visualFailures.push(name);};
  const wait=async(timeout=20000)=>{const until=Date.now()+timeout;while(Date.now()<until){if(await js('Boolean(window.depthApp?.state().ready && !depthApp.state().busy)'))return;await sleep(100);}throw Error('UI not ready');};
  const click=async(selector,timeout=20000)=>{if(selector==='[data-page="modules"]'&&!await js(`Boolean(document.querySelector(${JSON.stringify(selector)}))`))await click('[data-screen="understand"]');await js(`(()=>{const el=document.querySelector(${JSON.stringify(selector)});if(!el||el.disabled)throw Error('Unavailable control '+${JSON.stringify(selector)});el.click();})()`);await wait(timeout);const error=await js('document.querySelector("#toast").hidden?null:document.querySelector("#toast").textContent');if(error)throw Error(error);await sleep(100);};
  const save=(error,status='running')=>{
    const result={schema:'desktop-docking-focus-1',sourceHashes,status:error?'failed':status,passed:checks.length,checks,errors,visualFailures,captures,liveMetaRequested:liveMeta,scope:'Actual Electron renderer/local service with isolated samples. Click handlers are automated; divider dragging uses Electron pointer input. File drops use Chromium CDP with native file paths, not Windows Explorer automation. Live Meta results, when requested, are in live-report.json. An 8px marker verifies that each PNG contains a fresh painted frame.',...(error?{error:String(error.stack||error)}:{})};
    fs.writeFileSync(path.join(evidence,'report.json'),JSON.stringify(result,null,2));
    fs.writeFileSync(path.join(evidence,'index.html'),'<!doctype html><html lang="ko"><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>Depth AI · 실제 실행 캡처</title><style>body{font:16px system-ui;margin:32px;background:#faf9f6;color:#25252e}figure{margin:28px 0}img{display:block;width:100%;height:auto;border:1px solid #ccc}figcaption{padding:10px 0}a{color:#4e50ad}</style><h1>Depth AI · 실제 Electron 캡처</h1><p>동일 실행의 PNG입니다. 클릭 처리 자동화이며 OS 포인터 검사가 아닙니다. 왼쪽 위 8px 점은 새로 그려진 프레임인지 확인하는 검수 표식입니다. '+(error?'검사 중 실패했습니다.':status==='passed'?'보고서의 검사 범위만 통과했습니다.':'현재 검사 진행 중입니다. 완료 결과가 아닙니다.')+'</p><a href="report.json">검사 보고서</a>'+(liveMeta?' · <a href="live-report.json">실제 Meta 호출 보고서</a>':'<p>이 실행에는 실제 Meta 호출이 없습니다.</p>')+captures.map(c=>'<figure><figcaption>'+c.name+' · '+c.width+' × '+c.height+'</figcaption><a href="'+c.file+'"><img src="'+c.file+'"></a></figure>').join('')+'</html>');
  };
  let captureSequence=0;
  const capture=async(name,expectedScreen)=>{
    expectedScreen??=({'01-overview':'map','02-understand':'understand','03-mathematics':'relations','04-split':'split','05-integration':'integrate','06-assets':'assets','07-feature':'feature','08-selected-module':'feature','09-image-composition':'feature','10-source-relations':'feature','11-review':'review','12-small':'feature','13-focused-assembly':'feature'})[name];
    const state=await js('depthApp.state()');if(expectedScreen)check(state.screen===expectedScreen,'capture scene '+name);
    // Failure evidence must not rerun the same failed UI/image assertions.
    if(name!=='failure'){
      layoutCheck(await js(navigationCheck),'navigation icons fit their controls '+name);
      await js('document.fonts.ready.then(()=>true)');
      await js('Promise.all([...document.images].filter(img=>img.getClientRects().length).map(img=>img.decode())).then(()=>true)');
    }
    await sleep(350);
    if(name!=='failure'){const audit=await js('('+require('./identity-audit.cjs').auditIdentity.toString()+')()');for(const [label,ok] of Object.entries(audit.checks))layoutCheck(ok,name+' / '+label);}
    if(expectedScreen==='assets')check(await js('(()=>{const img=document.querySelector(".asset-preview>img");if(!img)return true;const a=img.getBoundingClientRect(),b=img.parentElement.getBoundingClientRect();return img.naturalWidth>0&&a.width>0&&a.height>0&&a.top>=b.top-1&&a.left>=b.left-1&&a.bottom<=b.bottom+1&&a.right<=b.right+1&&getComputedStyle(img).objectFit==="contain";})()'),'asset image is decoded and fits inside the actual preview bounds '+name);
    const color=[19+(++captureSequence%200),93,211];
    const marker=await js('('+captureMarker.toString()+')('+JSON.stringify(color)+')');
    let image,fresh=false;for(let i=0;i<50;i++){image=await win.webContents.capturePage(undefined,{stayAwake:true});if(!image.isEmpty()){const b=image.toBitmap({scaleFactor:1}),size=image.getSize(),x=Math.floor(marker.x*size.width/marker.width),y=Math.floor(marker.y*size.height/marker.height),p=(y*size.width+x)*4;fresh=x>=0&&y>=0&&x<size.width&&y<size.height&&b[p]===color[2]&&b[p+1]===color[1]&&b[p+2]===color[0];if(fresh)break;}await sleep(100);}
    check(fresh,'fresh painted native frame '+name);fs.writeFileSync(path.join(evidence,name+'.png'),image.toPNG());captures.push({name,file:name+'.png',screen:state.screen,entity:state.entity,root:state.assemblyRoot,frameVerified:true,...image.getSize()});save();
  };
  try{
    await wait();check((await js('depthApp.state().modules'))>0,'real catalog displayed');
    check((await js('document.querySelectorAll(".card").length'))===(await api('/modules/catalog')).modules.length,'card count equals service catalog');
    check((await js('document.querySelector("#content").textContent.length'))>30,'source loaded');check(await js('depthApp.state().screen')==='feature','preview composition is the starting screen');await capture('00-preview-start','feature');
    layoutCheck(await js('(()=>{const t=document.querySelector("[data-preview-key=total]").getBoundingClientRect(),p=document.querySelector("#preview").getBoundingClientRect(),f=document.querySelector("footer").getBoundingClientRect();return t.width>0&&t.top>=p.top&&t.bottom<=Math.min(p.bottom,f.top);})()'),'checkout total is visible inside the preview scroll area in the initial large window');
    await click('[data-screen="map"]');await capture('01-overview');
    await click('[data-screen="understand"]');check((await js('document.querySelectorAll("[data-inspect]").length'))>0,'actual members shown in understanding view');await capture('02-understand');
    await click('[data-screen="map"]');await click('[data-screen="relations"]');check(await js('Boolean(document.querySelector(".matrix"))'),'mathematical relation matrix shown');await capture('03-mathematics');
    await click('[data-screen="split"]');check(await js('Boolean(document.querySelector("#create-transform")) && !document.querySelector("#dialog").open'),'split is a dedicated view, not the retired modal');await capture('04-split');
    await click('[data-screen="integrate"]');check(await js('Boolean(document.querySelector("#choose-source"))'),'integration source selection exists');await capture('05-integration');
    await click('[data-screen="assets"]');check(await js('Boolean(document.querySelector("#generate-asset")) && document.querySelector("#import-asset").disabled'),'asset creation and unapproved import are separate');await capture('06-assets');
    await click('[data-screen="map"]');await click('[data-page="modules"]');await capture('07-feature');
    const view=await api('/view'),composition=await api('/composition/'+view.preview.entryId);
    check((await js('document.querySelectorAll("[data-node]").length'))===composition.memberIds.length,'complete module assembly visible');
    check((await js('document.querySelectorAll("[data-edge]").length'))===composition.relations.length,'all actual edges visible');
    check(await js('document.querySelector("#assembly-count").textContent === '+JSON.stringify(composition.memberIds.length+' modules · '+composition.relations.length+' source relationships')),'composition summary matches the restored graph');
    const moduleId=composition.memberIds.find(id=>id!==composition.rootId);
    await click('[data-node="'+moduleId+'"]');check((await js('depthApp.state().assemblyRoot'))===composition.rootId,'member inspection preserves feature');
    await capture('08-selected-module');
    await click('[data-preview-key="product.0.image"]');check((await js('depthApp.state().memberIds.length'))>1,'image shows its declared consumers');await capture('09-image-composition');
    await click('[data-node] [data-open-source]');
    for(let pass=0;pass<3;pass++){
      await click('[data-tab="relations"]');check((await js('document.querySelectorAll(".relation").length'))>0,'actual relations pass '+pass);
      await click('[data-tab="context"]');check((await js('document.querySelector("#content").textContent.length'))>40,'context pass '+pass);
      await click('[data-tab="source"]');await click('[data-level="expert"]');await click('[data-level="beginner"]');
    }
    await click('[data-tab="relations"]');await capture('10-source-relations');await click('[data-tab="source"]');
    await js('document.querySelector("#search").value="impossible-module-query";document.querySelector("#search").dispatchEvent(new Event("input"))');check((await js('document.querySelectorAll(".card").length'))===0,'empty search');
    await js('document.querySelector("#search").value="";document.querySelector("#search").dispatchEvent(new Event("input"))');
    const before=fs.readFileSync(path.join(project,'CouponRules.cs'),'utf8');const graph=await api('/graph');const e=graph.entities.find(e=>e.name==='DiscountPercent');
    await api('/property/propose',{id:e.id,value:'25',revision:graph.revision});
    await click('[data-screen="review"]');await click('[data-review]');check(await js('depthApp.state().screen === "review"'),'review opens');
    check(await js('document.querySelectorAll(".diff .added").length>0 && document.querySelectorAll(".diff .removed").length>0'),'real diff shown');
    check(fs.readFileSync(path.join(project,'CouponRules.cs'),'utf8')===before,'review preserves source');await capture('11-review');
    await click('[data-apply]');check(fs.readFileSync(path.join(project,'CouponRules.cs'),'utf8').includes('= 25'),'UI approval applies to isolated sample');
    await click('[data-undo]');await click('[data-apply]');check(fs.readFileSync(path.join(project,'CouponRules.cs'),'utf8')===before,'UI undo restores source');
    await click('[data-screen="map"]');await click('[data-page="modules"]');
    await js('document.querySelector("#source-dock").open=false');
    win.setSize(1120,780);await sleep(400);layoutCheck(await js('document.documentElement.scrollWidth<=innerWidth'),'small window no horizontal overflow');await capture('12-small');
    await click('#assembly-focus');check(await js('depthDock.getState().maximized===DepthDockModel.owner(depthDock.getState(),"modules").id'),'focus hides the inspector in the actual layout');await capture('13-focused-assembly');await click('#assembly-focus');win.setSize(1600,1000);
    const lightCanvas=await js('getComputedStyle(document.querySelector("main")).backgroundColor');
    await click('#theme-toggle');check(await js('document.documentElement.dataset.theme === "dark" && localStorage.getItem("depth.theme") === "dark"'),'dark theme persisted');check(await js('getComputedStyle(document.querySelector("main")).backgroundColor')!==lightCanvas,'theme changes actual canvas colors');await capture('14-dark-composition','feature');
    await click('[data-screen="map"]');await capture('15-dark-map','map');
    await click('[data-screen="assets"]');await capture('16-dark-assets','assets');
    await click('#theme-toggle');check(await js('document.documentElement.dataset.theme === "light"'),'light theme restored');await click('[data-page="modules"]');
    await click('#connections-all');await capture('17-light-all-connections','feature');await click('#connections-selected');
    await click('[data-evidence=why]');await capture('18-design-notebook','feature');await click('#open-rationale');await capture('18-light-rationale','feature');await click('#close-dialog');await click('[data-evidence=source]');
    // Product reference implementation: preserve source identities across every view.
    await click('[data-preview-key="total"]');
    const selectedComposition=await js('depthApp.state().memberIds.slice().sort().join("|")');
    check(await js('document.querySelector("#selection-code").textContent.includes("subtotal * (1 - DiscountPercent / 100)")'),'selected total exposes its source calculation immediately');
    for(const mode of ['guide','routes','orbit']){
      await click('[data-layout="'+mode+'"]');
      check(await js('depthApp.state().memberIds.slice().sort().join("|")')===selectedComposition,'complete composition retained in '+mode);
      layoutCheck(await js('(()=>{const p=document.querySelector(".preview-pane").getBoundingClientRect(),s=document.querySelector("#dock-stage").getBoundingClientRect(),a=document.querySelector(".assembly-pane").getBoundingClientRect();return p.width>=s.width*.40 && p.right<=a.left && p.width>0;})()'),'large preview and composition have separate bounds '+mode);
      await capture('19-reference-'+mode,'feature');
      layoutCheck(await js('(()=>{return [...document.querySelectorAll("#assembly-nodes .module-body")].every(node=>{const body=node.getBoundingClientRect(),title=node.querySelector("h3"),t=title.getBoundingClientRect(),g=node.querySelector(".module-glyph").getBoundingClientRect();return t.width>0&&t.left>=g.right-1&&t.left>=body.left&&t.right<=body.right+1&&t.bottom<=body.bottom&&(!g.width||(g.top>=body.top&&g.bottom<=body.bottom))&&title.scrollHeight<=title.clientHeight+1;});})()'),'actual node titles and icons fit without intersection '+mode);
    }
    await js('document.querySelector(".selection-source").scrollIntoView({block:"center"})');
    await capture('20-reference-source','feature');
    await click('#theme-toggle');await capture('21-reference-dark-source','feature');await click('#theme-toggle');
    await click('[data-layout="guide"]');
    await require('./surface-smoke.cjs').run({win,js,check,layoutCheck,capture,sleep});
    await require('./smoke-drop.cjs').run({win,api,js,wait,check,capture,sleep,evidence,base,project});
    check((await api('/health')).status==='ready','bundled service alive');check(errors.length===0,'no renderer console errors');
    if(liveMeta)await require('./smoke-live.cjs').run({api,js,click,wait,capture,check,evidence,base,pickFolder,save});
    check(visualFailures.length===0,'all collected layout checks pass: '+visualFailures.join('; '));
    save(null,'passed');app.quit();
  }catch(e){try{await capture('failure');}catch{}save(e);app.exit(1);}
};
