// Explicit --smoke-live only: shipped renderer -> IPC -> default .NET transport -> official Meta API.
// Folder picker choices are isolated samples; model/API responses are never substituted.
const fs=require('node:fs'),path=require('node:path');
exports.run=async({api,js,click,capture,check,evidence,base,pickFolder,save})=>{
  const checks=[],images=[];let stage='preflight',preflight;
  const record=(status='running',error)=>fs.writeFileSync(path.join(evidence,'live-report.json'),JSON.stringify({status,stage,transport:'default-dotnet-http',mode:'real-meta-native-renderer',preflight,checks,images,...(error?{error:String(error.stack||error)}:{})},null,2));
  const verify=(value,name)=>{check(value,'live: '+name);checks.push(name);record();save();};
  const value=(selector,text)=>js(`(()=>{const el=document.querySelector(${JSON.stringify(selector)});el.value=${JSON.stringify(text)};el.dispatchEvent(new Event('input',{bubbles:true}));})()`);
  const go=async name=>{stage=name;record();};
  const project=path.join(evidence,'live-taskrunner'),source=path.join(evidence,'live-rewards');
  try{
    record();await click('#check-meta',90000);
    preflight=JSON.parse(await js('document.querySelector("#dialog-body .context").textContent'));
    verify(preflight.status==='connected'&&preflight.inferenceVerified===true,'official model list and real inference through the application');await click('#close-dialog');
    // Preflight must succeed before creating or modifying the live sample projects.
    fs.cpSync(path.join(base,'samples','TaskRunner'),project,{recursive:true,filter:p=>!['.depth','bin','obj'].includes(path.basename(p))});fs.mkdirSync(source,{recursive:true});
    fs.writeFileSync(path.join(source,'Rewards.cs'),'public static class Rewards { public static int Points(int count, int cents) => DonorPricing.Total(count, cents) / 100; }\npublic static class DonorPricing { public static int Total(int count, int cents) => count * cents; }\n');
    const donorBefore=fs.readFileSync(path.join(source,'Rewards.cs'),'utf8'),appBefore=fs.readFileSync(path.join(project,'App.cs'),'utf8');
    const program=appBefore.slice(appBefore.indexOf('public static class Program'),appBefore.indexOf('public static class Pricing')).trim();
    pickFolder(project);await click('#open');let graph=await api('/graph');
    const queue=graph.entities.find(e=>e.name==='JobQueue'&&e.kind==='NamedType');
    await click('[data-understand="'+queue.id+'"]');await go('module-explanation');await click('#analyze',600000);
    verify(await js('depthApp.state().entity === '+JSON.stringify(queue.id)),'analysis preserves the inspected Queue entity');
    const teaching=await js('document.querySelector("#explanation").textContent');
    verify(/FIFO|선입선출/i.test(teaching),'actual Meta FIFO rationale is displayed');
    await capture('14-live-queue-beginner','understand');await click('[data-level="expert"]');
    verify((await js('document.querySelector("#explanation").textContent.length'))<teaching.length,'expert view condenses the same source-backed explanation');await capture('15-live-queue-expert','understand');await click('[data-level="beginner"]');
    await click('[data-screen="map"]');graph=await api('/graph');const pricing=graph.entities.find(e=>e.name==='Pricing'&&e.kind==='NamedType');await click('[data-understand="'+pricing.id+'"]');await click('#split');
    await value('#instruction','Extract only the Pricing class into Modules/Pricing.cs. Remove that class from App.cs. Preserve the Program class byte-for-byte; it is an independent behavior test. Preserve JobQueue and all public behavior. Do not introduce a second Pricing implementation. Explain the change in Korean.');
    await go('split-proposal');await click('#create-transform',600000);
    verify(fs.readFileSync(path.join(project,'App.cs'),'utf8')===appBefore&&!fs.existsSync(path.join(project,'Modules/Pricing.cs')),'split is staged without changing source');
    verify(await js('document.querySelector("[data-apply]").disabled'),'unvalidated Meta split cannot apply');await capture('16-live-split-review','review');
    await click('#validation-profile');await value('#profile-json',JSON.stringify({name:'Native TaskRunner behavioral checks',requirePass:true,commands:[{kind:'build',executable:'dotnet',arguments:['build','--nologo','--ignore-failed-sources','-p:NuGetAudit=false','-p:UseSharedCompilation=false','--disable-build-servers'],workingDirectory:'.',timeoutSeconds:120},{kind:'test',executable:'dotnet',arguments:['run','--no-build','--project','TaskRunner.csproj'],workingDirectory:'.',timeoutSeconds:60}]}));await click('#save-profile');
    const preserveProgram=async()=>{
      const id=await js('document.querySelector("[data-apply]").dataset.apply'),review=await api('/proposals/'+id),edit=review.proposal.edits.find(e=>e.path==='App.cs');
      verify(!edit||edit.operation!=='delete'&&edit.content.includes(program),'proposal preserves the independent Program behavior checks');
    };
    const validate=async()=>{await preserveProgram();await click('[data-validate]');await click('#confirm-validation',240000);verify(await js('!document.querySelector("[data-apply]").disabled'),'actual validation-copy build and behavior checks pass');};
    await go('split-validation');await validate();await click('[data-apply]');
    verify(fs.existsSync(path.join(project,'Modules/Pricing.cs'))&&fs.readFileSync(path.join(project,'App.cs'),'utf8').includes(program)&&!fs.readFileSync(path.join(project,'App.cs'),'utf8').includes('class Pricing'),'approved split creates the real source file without rewriting tests');
    await click('#integrate');pickFolder(source);await click('#choose-source');
    await js('document.querySelectorAll("[name=transform-module]").forEach(el=>el.checked=true)');
    await value('#instruction','Integrate only Rewards into Modules/Rewards.cs, adapting Rewards.Points to call the existing target Pricing.Total(count,cents) exactly once and divide by 100. Do not copy DonorPricing. Do not edit Program, App.cs, JobQueue, or the target Pricing implementation. Preserve existing public behavior. Explain reuse and the change in Korean.');
    await go('integration-proposal');await click('#create-transform',600000);verify(!fs.existsSync(path.join(project,'Modules/Rewards.cs')),'integration remains staged until approval');await capture('17-live-integration-review','review');
    await go('integration-validation');await validate();await click('[data-apply]');
    graph=await api('/graph');verify(graph.entities.some(e=>e.name==='Rewards'&&e.kind==='NamedType')&&!graph.entities.some(e=>e.name==='DonorPricing')&&fs.readFileSync(path.join(source,'Rewards.cs'),'utf8')===donorBefore,'integration reuses target Pricing and preserves the donor project');
    await click('[data-undo]');await go('undo-validation');await validate();await click('[data-apply]');
    verify(!fs.existsSync(path.join(project,'Modules/Rewards.cs'))&&fs.existsSync(path.join(project,'Modules/Pricing.cs')),'reviewed undo removes integration and retains the prior split');
    for(const style of ['2d','3d']){
      await click('[data-screen="assets"]');await click('[data-asset-style="'+style+'"]');await value('#asset-prompt','One matte sage green ceramic mug, white background, soft neutral studio lighting, no text or logo.');await value('#asset-destination','Assets/meta-'+style+'.png');
      await go('image-'+style);await click('#generate-asset',600000);
      const records=(await api('/assets')).items,item=records.find(x=>x.style===style&&x.status==='staged');
      verify(item?.generationMethod==='meta-model-api'&&item.format==='png'&&!fs.existsSync(path.join(project,'Assets/meta-'+style+'.png')),style+' real Meta PNG is staged before approval');
      const content=await api('/assets/'+item.id+'/content');verify((await js('document.querySelector(".asset-preview img").src'))==='data:'+content.mime+';base64,'+content.base64,style+' renderer preview uses the actual returned image bytes');
      await capture('18-live-asset-'+style,'assets');await click('#import-asset');
      verify(fs.readFileSync(path.join(project,'Assets/meta-'+style+'.png')).equals(Buffer.from(content.base64,'base64')),style+' approval imports the exact generated PNG');images.push({style,model:item.model,hash:item.hash,file:'live-taskrunner/Assets/meta-'+style+'.png'});record();
    }
    stage='complete';record('passed');
  }catch(error){record('failed',error);throw error;}
};
