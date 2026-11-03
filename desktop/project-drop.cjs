'use strict';
const fs=require('node:fs'),path=require('node:path');
const manifests=new Set(['package.json','pubspec.yaml','cargo.toml','pyproject.toml','go.mod','pom.xml','build.gradle','build.gradle.kts','cmakelists.txt']);
// Resolve only the user-dropped project boundary; never scan up to an unrelated parent.
exports.resolveProjectDrop=paths=>{
 if(!Array.isArray(paths)||paths.length!==1)throw Error('Drop one project at a time. Use Merge to combine projects.');
 const file=paths[0];
 if(typeof file!=='string'||!file||file.includes('\0')||!path.isAbsolute(file))throw Error('Drop a local project folder from File Explorer.');
 let stat;try{stat=fs.lstatSync(file);}catch{throw Error('The dropped item is no longer available.');}
 if(stat.isSymbolicLink())throw Error('Drop the original project folder instead of a link.');
 if(stat.isDirectory())return fs.realpathSync(file);
 if(stat.isFile()&&(manifests.has(path.basename(file).toLowerCase())||/\.(slnx?|[cfv]sproj|vbproj)$/i.test(file)))return fs.realpathSync(path.dirname(file));
 if(/\.(zip|7z|rar|tar|gz)$/i.test(file))throw Error('Extract the archive, then drop its project folder.');
 throw Error('Drop a project folder or a project file such as .sln, .csproj or package.json.');
};
