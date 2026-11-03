import ts from 'typescript';
import fs from 'node:fs';
import path from 'node:path';

// Compiler API only: never import target modules, execute plugins, or emit code.
const root = path.resolve(process.argv[2]);
const relative = file => path.relative(root, file).replaceAll('\\', '/');
const ignored = new Set(['.git', '.depth', 'node_modules', 'Library', 'Temp', 'bin', 'obj', 'build', 'dist', 'artifacts', '.dart_tool', 'Packages']);
const sourcePaths = [];
function walk(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.isSymbolicLink()) continue;
    const file = path.join(dir, entry.name);
    if (entry.isDirectory()) { if (!ignored.has(entry.name)) walk(file); }
    else if (/\.(?:[cm]?[jt]s|[jt]sx)$/.test(file)) sourcePaths.push(file);
  }
}
walk(root);
const allowed = new Set(sourcePaths.map(f => path.resolve(f)));
const configs = new Set();
const readConfig = file => { configs.add(path.resolve(file)); return ts.sys.readFile(file); };
const configPath = ['tsconfig.json', 'jsconfig.json'].map(f => path.join(root, f)).find(fs.existsSync);
let parsed, errors = [];
if (configPath) {
  const config = ts.readConfigFile(configPath, readConfig);
  if (config.error) errors.push(config.error);
  parsed = ts.parseJsonConfigFileContent(config.config ?? {}, { ...ts.sys, readFile: readConfig }, root, {}, configPath);
  errors.push(...parsed.errors);
  if (parsed.projectReferences?.length) errors.push({ messageText: 'Project references require separate project roots in this adapter; referenced projects are not recursively analyzed.' });
} else parsed = { fileNames: sourcePaths, options: { allowJs: true, checkJs: true, target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext, moduleResolution: ts.ModuleResolutionKind.Bundler, jsx: ts.JsxEmit.Preserve } };
const program = ts.createProgram({ rootNames: parsed.fileNames.filter(f => allowed.has(path.resolve(f))), options: { ...parsed.options, noEmit: true } });
const checker = program.getTypeChecker();
const units = program.getSourceFiles().filter(f => allowed.has(path.resolve(f.fileName)));
const owners = new Map(), symbols = new Map(), declarations = [], relations = [], values = [];
function canonical(symbol) {
  return symbol && symbol.flags & ts.SymbolFlags.Alias ? checker.getAliasedSymbol(symbol) : symbol;
}
function locate(node) {
  const file = node.getSourceFile();
  return { path: relative(file.fileName), offset: node.getStart(),
    startLine: file.getLineAndCharacterOfPosition(node.getStart()).line + 1,
    endLine: file.getLineAndCharacterOfPosition(node.end).line + 1 };
}
function isDeclaration(node) {
  return ts.isClassDeclaration(node) || ts.isInterfaceDeclaration(node) || ts.isEnumDeclaration(node) || ts.isTypeAliasDeclaration(node) ||
    ts.isFunctionDeclaration(node) || ts.isMethodDeclaration(node) || ts.isMethodSignature(node) ||
    ts.isPropertyDeclaration(node) || ts.isPropertySignature(node) || ts.isGetAccessor(node) || ts.isSetAccessor(node) ||
    ts.isEnumMember(node) || ts.isModuleDeclaration(node) ||
    ts.isVariableDeclaration(node) && (ts.isSourceFile(node.parent?.parent?.parent) || ts.isModuleBlock(node.parent?.parent?.parent));
}
function declare(node, scope = []) {
  let next = scope;
  const anonymousDefault = (ts.isFunctionDeclaration(node) || ts.isClassDeclaration(node)) && !node.name &&
    ts.getModifiers(node)?.some(m => m.kind === ts.SyntaxKind.DefaultKeyword);
  const defaultExpression = ts.isExportAssignment(node) && !node.isExportEquals &&
    (ts.isArrowFunction(node.expression) || ts.isFunctionExpression(node.expression) || ts.isClassExpression(node.expression));
  if (anonymousDefault || defaultExpression || isDeclaration(node) && node.name && !ts.isComputedPropertyName(node.name) && !ts.isBindingPattern(node.name)) {
    const module = checker.getSymbolAtLocation(node.getSourceFile());
    const symbol = canonical(anonymousDefault || defaultExpression ? module && checker.getExportsOfModule(module).find(s => s.name === 'default') : checker.getSymbolAtLocation(node.name));
    if (symbol) {
      const name = node.name?.getText() ?? 'default';
      const qualifiedName = [...scope, name].join('.');
      const key = symbols.get(symbol) ?? relative(node.getSourceFile().fileName) + ':' + qualifiedName;
      symbols.set(symbol, key); owners.set(node, key);
      declarations.push({ key, name, qualifiedName, kind: ts.SyntaxKind[node.kind].replace('Declaration', ''), ...locate(node) });
      next = [...scope, name];
    }
  }
  ts.forEachChild(node, child => declare(child, next));
}
for (const unit of units) declare(unit);
function add(from, target, kind, site) {
  const to = symbols.get(canonical(target));
  if (from && to && from !== to) relations.push({ from, to, kind, ...locate(site) });
}
function visit(node, enclosing) {
  const owner = owners.get(node);
  if (owner && enclosing && owner !== enclosing) relations.push({ from: enclosing, to: owner, kind: 'contains', ...locate(node) });
  const from = owner ?? enclosing;
  if (from) {
    let literal=node, sign='';
    if(ts.isPrefixUnaryExpression(node)&&[ts.SyntaxKind.MinusToken,ts.SyntaxKind.PlusToken].includes(node.operator)&&ts.isNumericLiteral(node.operand)){literal=node.operand;sign=node.operator===ts.SyntaxKind.MinusToken?'-':'';}
    const signedChild=ts.isNumericLiteral(node)&&ts.isPrefixUnaryExpression(node.parent)&&[ts.SyntaxKind.MinusToken,ts.SyntaxKind.PlusToken].includes(node.parent.operator);
    const kind=ts.isNumericLiteral(literal)?'number':ts.isStringLiteral(literal)||ts.isNoSubstitutionTemplateLiteral(literal)?'string':[ts.SyntaxKind.TrueKeyword,ts.SyntaxKind.FalseKeyword].includes(literal.kind)?'boolean':null;
    if(kind&&!signedChild&&node.parent?.name!==node&&!ts.isLiteralTypeNode(node.parent)&&!ts.isImportDeclaration(node.parent)&&!ts.isExportDeclaration(node.parent)&&!ts.isTaggedTemplateExpression(node.parent)&&!ts.isJsxAttribute(node.parent)){
      let container=node.parent;
      while(container&&!ts.isVariableDeclaration(container)&&!ts.isPropertyAssignment(container)&&!ts.isCallExpression(container)&&!ts.isBinaryExpression(container)&&!owners.has(container))container=container.parent;
      const label=container?.name?.getText()||(ts.isCallExpression(container)?container.expression.getText()+' argument':null)||(ts.isBinaryExpression(container)?container.left.getText():null)||'Literal';
      const site=locate(node),value=kind==='number'?sign+String(Number(literal.text)):kind==='boolean'?literal.kind===ts.SyntaxKind.TrueKeyword?'true':'false':literal.text;
      if(kind!=='number'||Number.isFinite(Number(value)))values.push({owner:from,path:site.path,offset:site.offset,length:node.end-node.getStart(),line:site.startLine,kind,value,literal:node.getText(),label:label.slice(0,160),type:kind==='number'?'number':kind});
    }
    if (ts.isCallExpression(node) || ts.isNewExpression(node)) {
      add(from, checker.getSymbolAtLocation(node.expression), ts.isNewExpression(node) ? 'constructs' : 'calls', node);
    } else if (ts.isExpressionWithTypeArguments(node) && ts.isHeritageClause(node.parent)) {
      add(from, checker.getSymbolAtLocation(node.expression), 'inherits', node);
    } else if (ts.isJsxOpeningElement(node) || ts.isJsxSelfClosingElement(node)) {
      add(from, checker.getSymbolAtLocation(node.tagName), 'constructs', node);
    } else if (ts.isIdentifier(node) && node.parent.name !== node &&
      !(ts.isCallExpression(node.parent) && node.parent.expression === node)) {
      add(from, checker.getSymbolAtLocation(node), 'references', node);
    } else if (ts.isPropertyAccessExpression(node) &&
      !(ts.isCallExpression(node.parent) && node.parent.expression === node)) {
      add(from, checker.getSymbolAtLocation(node.name), 'references', node);
    }
  }
  ts.forEachChild(node, child => visit(child, from));
}
for (const unit of units) visit(unit, null);
const diagnostics = [...errors, ...program.getSyntacticDiagnostics(), ...program.getSemanticDiagnostics()].slice(0, 50).map(d =>
  (d.file ? relative(d.file.fileName) + ':' + (d.file.getLineAndCharacterOfPosition(d.start ?? 0).line + 1) + ': ' : '') + ts.flattenDiagnosticMessageText(d.messageText, '\n'));
const inputs = [...configs].filter(f => !relative(f).startsWith('../') && !path.isAbsolute(relative(f))).map(relative);
for (const name of ['package.json', 'package-lock.json', 'yarn.lock', 'pnpm-lock.yaml']) if (fs.existsSync(path.join(root, name))) inputs.push(name);
process.stdout.write(JSON.stringify({ schema: '1', declarations, relations, diagnostics, inputs, values,
  configuration: configPath ? relative(configPath) : 'source-only default compiler options' }));
