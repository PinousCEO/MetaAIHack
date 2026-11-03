'use strict';
// Bundle analyzer libraries with relative package URIs. The target's installed
// Dart/Flutter SDK runs them; no SDK cache or user's pub cache is modified.
const fs=require('node:fs'),path=require('node:path'),{fileURLToPath,pathToFileURL}=require('node:url');
function bundle(source,destination){
 const configFile=path.join(source,'.dart_tool','package_config.json'),config=JSON.parse(fs.readFileSync(configFile,'utf8'));
 fs.mkdirSync(path.join(destination,'bin'),{recursive:true});fs.copyFileSync(path.join(source,'bin','index.dart'),path.join(destination,'bin','index.dart'));
 const packages=config.packages.map(pkg=>{
  const root=fileURLToPath(new URL(pkg.rootUri,pathToFileURL(configFile)));
  if(path.resolve(root)===path.resolve(source))return {...pkg,rootUri:'../'};
  if(!/^[_a-zA-Z0-9]+$/.test(pkg.name))throw Error('Invalid Dart package name');
  const dest=path.join(destination,'packages',pkg.name);fs.mkdirSync(dest,{recursive:true});
  fs.cpSync(path.join(root,'lib'),path.join(dest,'lib'),{recursive:true});
  for(const file of ['LICENSE','LICENSE.md','pubspec.yaml'])if(fs.existsSync(path.join(root,file)))fs.copyFileSync(path.join(root,file),path.join(dest,file));
  return {...pkg,rootUri:'../packages/'+pkg.name};
 });
 fs.mkdirSync(path.join(destination,'.dart_tool'),{recursive:true});fs.writeFileSync(path.join(destination,'.dart_tool','package_config.json'),JSON.stringify({configVersion:2,packages},null,2));return packages.length;
}
module.exports={bundle};
