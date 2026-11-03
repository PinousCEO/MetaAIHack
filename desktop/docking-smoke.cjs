'use strict';
exports.run=async({win,js,check,layoutCheck,capture,sleep})=>{
 const ready=async()=>{for(let i=0;i<200;i++){if(await js('depthApp.state().ready&&!depthApp.state().busy'))return;await sleep(100);}throw Error('Docking UI timeout');};
 const point=async selector=>js('(()=>{const e=document.querySelector('+JSON.stringify(selector)+');if(!e||e.disabled)throw Error("Control unavailable");e.scrollIntoView({block:"nearest"});const r=e.getBoundingClientRect(),x=Math.round(r.left+r.width/2),y=Math.round(r.top+r.height/2);if(!r.width||!r.height||!e.contains(document.elementFromPoint(x,y)))throw Error("Pointer target obscured: "+'+JSON.stringify(selector)+');return {x,y};})()');
 const click=async selector=>{const p=await point(selector);win.webContents.sendInputEvent({type:'mouseMove',...p});win.webContents.sendInputEvent({type:'mouseDown',...p,button:'left',clickCount:1});win.webContents.sendInputEvent({type:'mouseUp',...p,button:'left',clickCount:1});await sleep(200);await ready();};
 await js('depthDock.reset()');await sleep(250);
 const original=await js('JSON.stringify(depthApp.state().memberIds)');
 const split=await point('[data-split="workspace"]>.separator'),before=await js('document.querySelector(".preview-pane").getBoundingClientRect().width');
 win.webContents.sendInputEvent({type:'mouseMove',...split});win.webContents.sendInputEvent({type:'mouseDown',...split,button:'left',clickCount:1});
 win.webContents.sendInputEvent({type:'mouseMove',x:split.x+55,y:split.y});win.webContents.sendInputEvent({type:'mouseUp',x:split.x+55,y:split.y,button:'left',clickCount:1});await sleep(250);
 check(await js('document.querySelector(".preview-pane").getBoundingClientRect().width')>before+30,'native pointer resizes docked preview');
 check(await js('JSON.stringify(depthApp.state().memberIds)')===original,'docking resize preserves all source IDs');
 await capture('25-dock-resize','feature');
 await js('depthDock.reset();document.querySelector("#prompt").value="Preserve this draft"');
 const tab=await point('[data-panel="chat"]'),target=await js('(()=>{const r=document.querySelector("[data-group=modules]").getBoundingClientRect();return{x:Math.round(r.right-45),y:Math.round(r.top+r.height*.45)};})()');
 win.webContents.sendInputEvent({type:'mouseMove',...tab});win.webContents.sendInputEvent({type:'mouseDown',...tab,button:'left',clickCount:1});
 for(let i=1;i<=12;i++){win.webContents.sendInputEvent({type:'mouseMove',x:Math.round(tab.x+(target.x-tab.x)*i/12),y:Math.round(tab.y+(target.y-tab.y)*i/12)});await sleep(45);}
 await sleep(200);win.webContents.sendInputEvent({type:'mouseUp',...target,button:'left',clickCount:1});await sleep(300);
 check(await js('DepthDockModel.owner(depthDock.getState(),"chat").id!=="utility"'),'native tab drag docks the real Meta CLI into another pane');
 check(await js('document.querySelector("#prompt").value')==='Preserve this draft','native docking retains real Meta draft');
 await capture('26-cli-docked','feature');
 await js('depthDock.reset();document.querySelector("#prompt").value=""');await click('[data-group="utility"] .collapse-button');
 check(await js('document.querySelector("[data-group=utility]").getBoundingClientRect().height')<40,'console collapses to its tab strip');
 await capture('27-console-collapsed','feature');await js('depthDock.reset()');
 await click('[data-preview-key="total"]');
 const calc=await js('Array.from(document.querySelectorAll("[data-node]")).find(e=>e.querySelector("h3").textContent==="CalculateTotal")?.dataset.node');
 if(!calc)throw Error('Calculation module missing');
 await click('[data-node="'+calc+'"]');await sleep(200);
 check(await js('(()=>{const related=Number(getComputedStyle(document.querySelector("[data-preview-key=total]")).opacity),muted=Number(getComputedStyle(document.querySelector("[data-preview-key=\\"product.0.image\\"]")).opacity);return related>.95&&muted>=.55&&muted<=.65;})()'),'module click keeps related total bright and unrelated image recognizable in rendered CSS');
 await capture('28-preview-reverse-focus','feature');
 await click('[data-preview-key="product.0.image"]');
 check(await js('document.querySelector("[data-preview-key=\\"product.0.image\\"]").classList.contains("preview-related")'),'real pointer selects an already-faded preview image');
 await capture('29-faded-element-selected','feature');await click('#preview-show-all');
 check(await js('!document.querySelector("#preview").classList.contains("preview-isolating")'),'Show all clears isolation with pointer input');
 const audit=async label=>{const result=await js('('+require('./surface-smoke.cjs').auditSurfaces.toString()+')()');for(const [name,ok] of Object.entries(result.checks))layoutCheck(ok,label+' / '+name);};
 await audit('default docking');await click('#theme-toggle');await capture('30-dock-theme','feature');await audit('other theme');await click('#theme-toggle');
 win.webContents.setZoomFactor(1.25);try{await sleep(300);await capture('31-dock-125','feature');await audit('125 percent');}finally{win.webContents.setZoomFactor(1);}
};

