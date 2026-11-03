'use strict';
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const {inside}=require('./runtime-core.cjs');
const hash=data=>crypto.createHash('sha256').update(data).digest('hex');
function adaptersRoot(){const local=path.resolve(__dirname,'../adapters');return fs.existsSync(path.join(local,'unity-runtime'))?local:path.resolve(__dirname,'../../adapters');}
function prepare(root,kind,config,entry='lib/main.dart'){
 if(!['unity','flutter','winforms'].includes(kind))throw Error('No bundled source adapter for this target.');
 const base=adaptersRoot(),directory=kind==='unity'?'Assets/DepthRuntimeBridge':kind==='winforms'?'Depth.RuntimePreview':'.depth/runtime/flutter';
 const manifestFile=inside(root,'.depth/runtime-adapter-'+kind+'.json');let previous={files:{}};
 if(fs.existsSync(manifestFile))previous=JSON.parse(fs.readFileSync(manifestFile,'utf8'));
 const inputs=kind!=='flutter'?['DepthRuntimeBridge.cs']:['depth_runtime.dart','transport_io.dart','transport_web.dart'];
 const writes=inputs.map(name=>({relative:directory+'/'+name,bytes:fs.readFileSync(path.join(base,kind+'-runtime',name))}));
 if(kind==='unity'){
  const hasUGUI=['Packages/manifest.json','Packages/packages-lock.json'].some(relative=>{const file=inside(root,relative);if(!fs.existsSync(file))return false;try{return !!JSON.parse(fs.readFileSync(file,'utf8')).dependencies?.['com.unity.ugui'];}catch{return false;}});
  if(hasUGUI)writes[0].bytes=Buffer.concat([Buffer.from('#define DEPTH_RUNTIME_UGUI\n'),writes[0].bytes]);
 }
 if(kind==='flutter'){
  const original=inside(root,entry);if(!fs.existsSync(original))throw Error('Flutter entry point missing: '+entry);
  const bootstrap=directory+'/bootstrap.dart',relative=path.relative(path.dirname(inside(root,bootstrap)),original).replaceAll('\\','/');
  const literal=JSON.stringify(relative).replaceAll('$','\\$');
  writes.push({relative:bootstrap,bytes:Buffer.from(`import ${literal} as application;\nimport 'depth_runtime.dart';\nvoid main() { application.main(); DepthRuntime.start(); }\n`)});
 }
 for(const write of writes){const file=inside(root,write.relative);if(fs.existsSync(file)&&hash(fs.readFileSync(file))!==hash(write.bytes)&&hash(fs.readFileSync(file))!==previous.files?.[write.relative])throw Error('Adapter file was changed locally; preserving it: '+write.relative);}
 const files={};for(const write of writes){const file=inside(root,write.relative);fs.mkdirSync(path.dirname(file),{recursive:true});fs.writeFileSync(file,write.bytes);files[write.relative]=hash(write.bytes);}
 fs.mkdirSync(path.dirname(manifestFile),{recursive:true});fs.writeFileSync(manifestFile,JSON.stringify({schema:1,kind,files},null,2));
 const configFile=inside(root,'.depth/runtime-bridge.json');fs.writeFileSync(configFile,JSON.stringify(config,null,2));
 return {entry:kind==='flutter'?directory+'/bootstrap.dart':null,files:Object.keys(files),cleanup(){if(fs.existsSync(configFile)){let current;try{current=JSON.parse(fs.readFileSync(configFile,'utf8'));}catch{return;}if(current.session===config.session)fs.unlinkSync(configFile);}}};
}
module.exports={prepare,adaptersRoot};
