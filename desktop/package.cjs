const fs=require('node:fs'),path=require('node:path');
const root=path.resolve(__dirname,'..'),out=path.join(root,'artifacts','desktop');
fs.mkdirSync(out,{recursive:true});
if(!process.argv.includes('--resources-only')){
 fs.cpSync(path.dirname(require('electron')),out,{recursive:true});
 fs.renameSync(path.join(out,'electron.exe'),path.join(out,'Depth AI.exe'));
 if(fs.existsSync(path.join(out,'electron_wer.dll')))fs.renameSync(path.join(out,'electron_wer.dll'),path.join(out,'Depth AI_wer.dll'));
}
const app=path.join(out,'resources','app');fs.mkdirSync(app,{recursive:true});
for(const file of ['package.json','main.cjs','preload.cjs','project-drop.cjs','service-client.cjs','dart-runtime.cjs','runtime-core.cjs','runtime-host.cjs','runtime-bridge.cjs','runtime-adapters.cjs','runtime-preload.cjs','runtime-links.cjs','runtime-html.cjs','runtime-smoke.cjs','smoke.cjs','smoke-drop.cjs','surface-smoke.cjs','docking-smoke.cjs','identity-audit.cjs','visual-review.cjs','smoke-live.cjs','style-study-smoke.cjs','ui'])fs.cpSync(path.join(__dirname,file),path.join(app,file),{recursive:true});
// A new service version lives beside the old one, preserving an open session.
const serviceDirectory=require('./package.json').depthServiceDirectory||'service';
fs.cpSync(path.join(root,'artifacts','desktop-service'),path.join(out,'resources',serviceDirectory),{recursive:true});
for(const sample of ['Checkout','TaskRunner','RuntimeWeb','RuntimeWinForms','RuntimeUnity'])fs.cpSync(path.join(root,'samples',sample),path.join(out,'resources','samples',sample),{recursive:true,filter:s=>!['bin','obj','.depth'].includes(path.basename(s))});
for(const adapter of ['web','unity-runtime','flutter-runtime','winforms-runtime'])fs.cpSync(path.join(root,'adapters',adapter),path.join(out,'resources','adapters',adapter),{recursive:true});
require('./package-dart.cjs').bundle(path.join(root,'adapters','dart'),path.join(out,'resources','adapters','dart'));
if(!process.argv.includes('--resources-only'))fs.copyFileSync(process.execPath,path.join(out,'resources','runtime','node.exe'));
console.log(path.join(out,'Depth AI.exe'));
