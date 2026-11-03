'use strict';
const fs=require('node:fs'),path=require('node:path');
const {findExecutable}=require('./runtime-core.cjs');
function executable(env=process.env){
 const entry=env.DEPTH_DART_EXECUTABLE||findExecutable('dart',env)||findExecutable('flutter',env);
 if(!entry)return null;
 if(path.basename(entry).toLowerCase()==='dart.exe'||path.basename(entry)==='dart')return fs.existsSync(entry)?entry:null;
 const native=path.join(path.dirname(entry),'cache','dart-sdk','bin',process.platform==='win32'?'dart.exe':'dart');
 return fs.existsSync(native)?native:null;
}
function configure(base,env){
 const adapter=path.join(base,'adapters','dart','bin','index.dart'),dart=executable(env);
 if(!env.DEPTH_DART_ADAPTER&&dart&&fs.existsSync(adapter)){env.DEPTH_DART_ADAPTER=adapter;env.DEPTH_DART_EXECUTABLE=dart;}
 return env;
}
module.exports={executable,configure};
