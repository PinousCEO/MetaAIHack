'use strict';
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
let ts;try{ts=require('typescript');}catch{ts=require('../adapters/web/node_modules/typescript');}
const ignored=new Set(['.git','.depth','.depth-lens','.codex','.agents','node_modules','bin','obj','Library','Temp','build','dist','artifacts','.dart_tool','.next','coverage','vendor']);
const sourcePattern=/\.(?:[cm]?[jt]s|[jt]sx)$/i;
const dataPattern=/\.(?:json|css|html)$/i;
const hash=s=>crypto.createHash('sha256').update(s).digest('hex');
const normalize=p=>p.replaceAll('\\','/');
const inside=(root,file)=>file===root||file.startsWith(root+path.sep);
function allowed(relative){return !normalize(relative).split('/').some(p=>ignored.has(p)||p.startsWith('.env')||/^(?:credentials|secrets|package-lock|yarn\.lock|pnpm-lock)/i.test(p));}
function scan(root){
  root=fs.realpathSync(root);const files=[],warnings=[];let total=0;
  function walk(dir){
    let entries;try{entries=fs.readdirSync(dir,{withFileTypes:true});}catch{warnings.push('Cannot read '+normalize(path.relative(root,dir)));return;}
    for(const entry of entries){
      const abs=path.join(dir,entry.name),relative=normalize(path.relative(root,abs));
      if(!allowed(relative)||entry.isSymbolicLink())continue;
      if(entry.isDirectory()){walk(abs);continue;}
      if(!entry.isFile()||(!sourcePattern.test(entry.name)&&!dataPattern.test(entry.name)))continue;
      if(files.length>=1600){warnings.push('File limit reached (1600). Narrow the selected folder.');return;}
      const stat=fs.statSync(abs);if(stat.size>1024*1024||total+stat.size>24*1024*1024){warnings.push('Size limit: '+relative);continue;}
      const bytes=fs.readFileSync(abs);if(bytes.includes(0)){warnings.push('Binary source skipped: '+relative);continue;}
      const after=fs.statSync(abs);if(stat.size!==after.size||stat.mtimeMs!==after.mtimeMs)throw Error('Files are changing; retrying analysis.');
      total+=bytes.length;files.push({path:relative,absolute:abs,text:bytes.toString('utf8'),sha256:hash(bytes),source:sourcePattern.test(entry.name)});
    }
  }
  walk(root);files.sort((a,b)=>a.path<b.path?-1:a.path>b.path?1:0);return{root,files,warnings:[...new Set(warnings)]};
}
function analyze(root,previous=null){
  const scanned=scan(root),files=scanned.files,byAbsolute=new Map(files.map(f=>[path.resolve(f.absolute),f])),byPath=new Map(files.map(f=>[f.path,f]));root=scanned.root;
  const prior=new Map((previous?.files||[]).map(f=>[f.path,f]));
  const lost=(previous?.files||[]).filter(f=>!byPath.has(f.path));const claimed=new Set();
  for(const f of files){
    f.id=prior.get(f.path)?.id;
    if(!f.id){const matches=lost.filter(p=>p.sha256===f.sha256&&!claimed.has(p.id));if(matches.length===1&&files.filter(n=>!prior.has(n.path)&&n.sha256===f.sha256).length===1){f.id=matches[0].id;f.renamedFrom=matches[0].path;claimed.add(f.id);}}
    f.id ||= 'file-'+hash(f.path).slice(0,20);
  }
  if(previous?.analysisVersion===2&&previous?.revision&&JSON.stringify(previous.files)===JSON.stringify(files.map(({id,path,sha256})=>({id,path,sha256}))))return previous;
  const configuration=files.find(f=>['tsconfig.json','jsconfig.json'].includes(f.path));
  let options={allowJs:true,checkJs:false,noLib:true,noEmit:true,target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ESNext,moduleResolution:ts.ModuleResolutionKind.Bundler,jsx:ts.JsxEmit.Preserve,resolveJsonModule:true};
  const warnings=[...scanned.warnings];
  if(configuration){const parsed=ts.parseConfigFileTextToJson(configuration.path,configuration.text);if(parsed.error)warnings.push('Invalid '+configuration.path);else{const configured=ts.convertCompilerOptionsFromJson(parsed.config?.compilerOptions||{},root).options;options={...options,baseUrl:configured.baseUrl,paths:configured.paths};if(parsed.config?.extends)warnings.push('Extended tsconfig is not loaded; local compilerOptions only.');}}
  const host={getSourceFile:(name,version)=>{const f=byAbsolute.get(path.resolve(name));return f?ts.createSourceFile(name,f.text,version,true):undefined;},writeFile:()=>{},getCurrentDirectory:()=>root,getDirectories:()=>[],directoryExists:dir=>inside(root,path.resolve(dir))&&files.some(f=>f.absolute.startsWith(path.resolve(dir)+path.sep)),getCanonicalFileName:f=>f,useCaseSensitiveFileNames:()=>true,getNewLine:()=> '\n',getDefaultLibFileName:()=>'',fileExists:f=>byAbsolute.has(path.resolve(f)),readFile:f=>byAbsolute.get(path.resolve(f))?.text,realpath:f=>f};
  const program=ts.createProgram(files.filter(f=>f.source).map(f=>f.absolute),options,host),checker=program.getTypeChecker();
  const nodes=[],edges=[],unresolved=[],evidence=[],symbols=new Map(),owners=new Map();
  const locate=(node)=>{const sf=node.getSourceFile(),f=byAbsolute.get(path.resolve(sf.fileName));return {path:f.path,startLine:sf.getLineAndCharacterOfPosition(node.getStart()).line+1,endLine:sf.getLineAndCharacterOfPosition(node.end).line+1,sha256:f.sha256};};
  const canonical=s=>s&&(s.flags&ts.SymbolFlags.Alias)?checker.getAliasedSymbol(s):s;
  const role=f=>/\.(test|spec)\.|(^|\/)(test|tests)\//i.test(f.path)?'test':/\.tsx$|\.jsx$/i.test(f.path)?'component':/\.(json|css|html)$/i.test(f.path)?'data':'module';
  for(const f of files)nodes.push({id:f.id,name:path.basename(f.path),qualifiedName:f.path,kind:role(f),path:f.path,parentId:null,startLine:1,endLine:f.text.split('\n').length,sha256:f.sha256,signature:'',members:[]});
  function evidenceFor(site,kind='source'){const id='ev-'+hash(JSON.stringify(site)).slice(0,20);if(!evidence.some(e=>e.id===id))evidence.push({id,kind,...site});return id;}
  function edge(from,to,kind,site){if(!from||!to||from===to)return;const id='edge-'+hash(from+'|'+to+'|'+kind+'|'+site.path+'|'+site.startLine).slice(0,20);if(!edges.some(e=>e.id===id))edges.push({id,from,to,kind,evidenceIds:[evidenceFor(site)]});}
  function declare(node,parentId,scope=[],counts=new Map()){
    let owner=parentId,nextScope=scope;
    const isDecl=ts.isFunctionDeclaration(node)||ts.isClassDeclaration(node)||ts.isInterfaceDeclaration(node)||ts.isTypeAliasDeclaration(node)||ts.isEnumDeclaration(node)||ts.isMethodDeclaration(node)||ts.isPropertyDeclaration(node)||ts.isGetAccessorDeclaration(node)||ts.isSetAccessorDeclaration(node)||(ts.isVariableDeclaration(node)&&ts.isSourceFile(node.parent?.parent?.parent));
    if(isDecl&&node.name&&!ts.isBindingPattern(node.name)){
      const name=node.name.getText(),qualifiedName=[...scope,name].join('.'),site=locate(node),file=byPath.get(site.path);
      const count=counts.get(qualifiedName)||0;counts.set(qualifiedName,count+1);
      const id=file.id+'-'+hash(qualifiedName+'|'+count).slice(0,12);
      const kind=ts.isClassDeclaration(node)?'class':ts.isInterfaceDeclaration(node)||ts.isTypeAliasDeclaration(node)?'type':ts.isPropertyDeclaration(node)||ts.isVariableDeclaration(node)?((node.initializer&&(ts.isArrowFunction(node.initializer)||ts.isFunctionExpression(node.initializer)))?'function':'state'):'function';
      nodes.push({id,name,qualifiedName,kind,...site,parentId,signature:node.getText().split(/\r?\n/)[0].slice(0,200),members:[]});
      const symbol=canonical(checker.getSymbolAtLocation(node.name));if(symbol)symbols.set(symbol,id);owners.set(node,id);edge(parentId,id,'contains',site);owner=id;nextScope=[...scope,name];
    }
    ts.forEachChild(node,child=>declare(child,owner,nextScope,counts));
  }
  const units=program.getSourceFiles().filter(sf=>byAbsolute.get(path.resolve(sf.fileName))?.source);
  for(const unit of units){declare(unit,byAbsolute.get(path.resolve(unit.fileName)).id);for(const d of unit.parseDiagnostics||[])warnings.push(normalize(path.relative(root,unit.fileName))+': '+ts.flattenDiagnosticMessageText(d.messageText,' '));}
  function inspect(node,owner,file){
    owner=owners.get(node)||owner;
    if(ts.isImportDeclaration(node)||ts.isExportDeclaration(node)){
      if(node.moduleSpecifier&&ts.isStringLiteralLike(node.moduleSpecifier))importLink(node.moduleSpecifier.text,node,file);
    }
    if(ts.isCallExpression(node)||ts.isNewExpression(node)){
      const exp=node.expression,symbol=canonical(checker.getSymbolAtLocation(exp)),target=symbols.get(symbol);
      if(target)edge(owner,target,ts.isNewExpression(node)?'constructs':'calls',locate(node));
      if(exp.kind===ts.SyntaxKind.ImportKeyword||ts.isIdentifier(exp)&&exp.text==='require'){
        const arg=node.arguments?.[0];if(arg&&ts.isStringLiteralLike(arg))importLink(arg.text,node,file);else unresolved.push({from:owner,kind:'dynamic_import',...locate(node),reason:'Target is computed at runtime.'});
      }
    }else if(ts.isIdentifier(node)&&node.parent?.name!==node){const target=symbols.get(canonical(checker.getSymbolAtLocation(node)));if(target)edge(owner,target,'references',locate(node));}
    ts.forEachChild(node,child=>inspect(child,owner,file));
  }
  function importLink(specifier,node,file){
    const resolved=ts.resolveModuleName(specifier,file.absolute,options,host).resolvedModule;
    let target=resolved&&byAbsolute.get(path.resolve(resolved.resolvedFileName));
    if(!target&&specifier.startsWith('.'))target=byAbsolute.get(path.resolve(path.dirname(file.absolute),specifier));
    if(target)edge(file.id,target.id,'imports',locate(node));else unresolved.push({from:file.id,kind:specifier.startsWith('.')?'unresolved_import':'external_import',specifier,...locate(node),reason:'No indexed local target.'});
  }
  for(const unit of units){const file=byAbsolute.get(path.resolve(unit.fileName));inspect(unit,file.id,file);}
  for(const node of nodes){node.members=nodes.filter(n=>n.parentId===node.id).map(n=>n.id);node.evidenceIds=[evidenceFor({path:node.path,startLine:node.startLine,endLine:node.endLine,sha256:node.sha256})];if(!node.parentId&&node.kind==='module'){const members=nodes.filter(n=>n.parentId===node.id);node.kind=members.some(n=>n.kind==='class')?'class':members.some(n=>n.kind==='function')?'function':members.some(n=>n.kind==='state')?'state':'module';}}
  const manifest=files.map(({id,path,sha256})=>({id,path,sha256}));
  const revision=hash(JSON.stringify({analysisVersion:2,files:manifest}));
  for(const n of nodes){n.fanIn=edges.filter(e=>e.to===n.id&&e.kind!=='contains').length;n.fanOut=edges.filter(e=>e.from===n.id&&e.kind!=='contains').length;}
  return {analysisVersion:2,revision,generatedAt:new Date().toISOString(),files:manifest,nodes,edges,evidence,unresolved,warnings:[...new Set(warnings)],scope:'JS/TS compiler declarations, imports and statically resolved symbol calls/references. JSON/CSS/HTML are file nodes. No runtime execution; dynamic targets remain unresolved.',sourceTexts:Object.fromEntries(files.map(f=>[f.path,f.text])),renames:files.filter(f=>f.renamedFrom).map(f=>({id:f.id,from:f.renamedFrom,to:f.path}))};
}
module.exports={analyze,scan,hash,allowed,inside,normalize};
if(require('node:worker_threads').parentPort){const {parentPort,workerData}=require('node:worker_threads');try{parentPort.postMessage({ok:true,snapshot:analyze(workerData.root,workerData.previous)});}catch(e){parentPort.postMessage({ok:false,error:e.message});}}
