import 'dart:convert';
import 'dart:io';
import 'package:analyzer/dart/analysis/analysis_context_collection.dart';
import 'package:analyzer/dart/analysis/results.dart';
import 'package:analyzer/dart/ast/ast.dart';
import 'package:analyzer/dart/ast/visitor.dart';
import 'package:analyzer/dart/element/element.dart';

// Resolve static source only. No target execution or dynamic-dispatch claim.
Future<void> main(List<String> args) async {
  final root = Directory(args.single).resolveSymbolicLinksSync();
  final paths = <String>[];
  void walk(Directory dir) {
    for (final file in dir.listSync(followLinks: false)) {
      if (file is Link) continue;
      if (file is Directory) {
        if (!['.git', '.dart_tool', 'build', 'bin', 'obj', 'artifacts',
          'node_modules', 'Library', 'Temp', 'Packages', '.depth']
            .contains(file.path.split(Platform.pathSeparator).last)) walk(file);
      } else if (file is File && file.path.endsWith('.dart')) {
        paths.add(file.absolute.path);
      }
    }
  }
  walk(Directory(root)); paths.sort();
  final context = AnalysisContextCollection(includedPaths: paths);
  final graph = DartGraph(root);
  final units = <ResolvedUnitResult>[];
  try {
    for (final path in paths) {
      final unit = await context.contextFor(path).currentSession.getResolvedUnit(path);
      if (unit is! ResolvedUnitResult) {
        graph.diagnostics.add('${graph.relative(path)}: resolution unavailable');
        continue;
      }
      units.add(unit);
      for (final error in unit.diagnostics.take(20)) {
        graph.diagnostics.add('${graph.relative(path)}:${unit.lineInfo.getLocation(error.offset).lineNumber}: ${error.message}');
      }
      unit.unit.accept(Declarations(graph, unit));
    }
    for (final unit in units) { unit.unit.accept(References(graph, unit)); }
    stdout.write(jsonEncode({'schema': '2', 'declarations': graph.declarations.values.toList(),
      'relations': graph.relations, 'values': graph.values, 'diagnostics': graph.diagnostics.take(50).toList()}));
  } finally { await context.dispose(); }
}

class DartGraph {
  final String root;
  final declarations = <String, Map<String, Object>>{};
  final owners = <AstNode, String>{};
  final relations = <Map<String, Object>>[];
  final values = <Map<String, Object>>[];
  final diagnostics = <String>[];
  DartGraph(this.root);
  String relative(String path) => path.substring(root.length + 1).replaceAll('\\', '/');
  String qualified(Element element) {
    final names = <String>[];
    for (Element? current = element; current != null && current is! LibraryElement; current = current.enclosingElement) {
      if (current.name != null) names.insert(0, current.name! + (current is GetterElement ? ':get' : current is SetterElement ? ':set' : ''));
    }
    return names.join('.');
  }
  String? key(Element? element) {
    if (element == null) return null;
    element = element.baseElement;
    if (element is PropertyAccessorElement && element.isSynthetic) element = element.variable;
    if (element is ConstructorElement && element.isSynthetic) element = element.enclosingElement;
    final path = element.firstFragment.libraryFragment?.source.fullName;
    if (path == null || !path.startsWith(root + Platform.pathSeparator)) return null;
    return '${relative(path)}:${qualified(element)}';
  }
  void relation(String from, Element? target, String kind, AstNode site, ResolvedUnitResult unit) {
    final to = key(target);
    if (to == null || from == to || !declarations.containsKey(to)) return;
    relations.add({'from': from, 'to': to, 'kind': kind, 'path': relative(unit.path),
      'offset': site.offset, 'startLine': unit.lineInfo.getLocation(site.offset).lineNumber,
      'endLine': unit.lineInfo.getLocation(site.end).lineNumber});
  }
}

class Declarations extends GeneralizingAstVisitor<void> {
  final DartGraph graph;
  final ResolvedUnitResult unit;
  Declarations(this.graph, this.unit);
  @override
  void visitNode(AstNode node) {
    final Element? element = switch (node) {
      ClassDeclaration n => n.declaredFragment?.element,
      EnumDeclaration n => n.declaredFragment?.element,
      MixinDeclaration n => n.declaredFragment?.element,
      ExtensionDeclaration n => n.declaredFragment?.element,
      ExtensionTypeDeclaration n => n.declaredFragment?.element,
      ConstructorDeclaration n => n.declaredFragment?.element,
      MethodDeclaration n => n.declaredFragment?.element,
      FunctionDeclaration n when n.parent is CompilationUnit => n.declaredFragment?.element,
      VariableDeclaration n when n.parent?.parent is FieldDeclaration || n.parent?.parent is TopLevelVariableDeclaration => n.declaredFragment?.element,
      EnumConstantDeclaration n => n.declaredFragment?.element,
      _ => null
    };
    final key = graph.key(element);
    if (key != null && element != null) {
      graph.owners[node] = key;
      graph.declarations[key] = {'key': key, 'path': graph.relative(unit.path),
        'name': element.displayName, 'kind': element.kind.displayName,
        'qualifiedName': graph.qualified(element),
        'startLine': unit.lineInfo.getLocation(node.offset).lineNumber,
        'endLine': unit.lineInfo.getLocation(node.end).lineNumber};
    }
    super.visitNode(node);
  }
}

class References extends GeneralizingAstVisitor<void> {
  final DartGraph graph;
  final ResolvedUnitResult unit;
  final scope = <String>[];
  References(this.graph, this.unit);
  @override
  void visitNode(AstNode node) {
    final owner = graph.owners[node];
    if (owner != null) {
      if (scope.isNotEmpty) graph.relations.add({'from': scope.last, 'to': owner,
        'kind': 'contains', 'path': graph.relative(unit.path), 'offset': node.offset,
        'startLine': unit.lineInfo.getLocation(node.offset).lineNumber,
        'endLine': unit.lineInfo.getLocation(node.end).lineNumber});
      scope.add(owner);
    }
    if (scope.isNotEmpty) {
      final from = scope.last;
      AstNode literal = node;
      String sign = '';
      if (node is PrefixExpression && (node.operator.lexeme == '-' || node.operator.lexeme == '+') && (node.operand is IntegerLiteral || node.operand is DoubleLiteral)) { literal = node.operand; if (node.operator.lexeme == '-') sign = '-'; }
      final signedChild = (node is IntegerLiteral || node is DoubleLiteral) && node.parent is PrefixExpression && ['-', '+'].contains((node.parent as PrefixExpression).operator.lexeme);
      final kind = literal is IntegerLiteral || literal is DoubleLiteral ? 'number' : literal is BooleanLiteral ? 'boolean' : literal is SimpleStringLiteral ? 'string' : null;
      if (kind != null && !signedChild && node.parent is! Directive) {
        final value = switch (literal) { IntegerLiteral n => '$sign${n.value}', DoubleLiteral n => '$sign${n.value}', BooleanLiteral n => '${n.value}', SimpleStringLiteral n => n.value, _ => '' };
        AstNode? context = node.parent;
        while (context != null && context is! VariableDeclaration && context is! NamedExpression && context is! AssignmentExpression && !graph.owners.containsKey(context)) { context = context.parent; }
        final label = switch (context) { VariableDeclaration n => n.name.lexeme, NamedExpression n => n.name.label.name, AssignmentExpression n => n.leftHandSide.toSource(), _ => 'Literal' };
        graph.values.add({'owner': from, 'path': graph.relative(unit.path), 'offset': node.offset, 'length': node.length, 'line': unit.lineInfo.getLocation(node.offset).lineNumber,
          'kind': kind, 'value': value, 'literal': node.toSource(), 'label': label, 'type': kind == 'number' && node is Expression ? node.staticType?.getDisplayString() ?? (literal is IntegerLiteral ? 'int' : 'double') : kind});
      }
      if (node is MethodInvocation) graph.relation(from, node.methodName.element, 'calls', node, unit);
      if (node is FunctionExpressionInvocation) graph.relation(from, node.element, 'calls', node, unit);
      if (node is InstanceCreationExpression) graph.relation(from, node.constructorName.element, 'constructs', node, unit);
      if (node is SimpleIdentifier && !node.inDeclarationContext() &&
          !(node.parent is MethodInvocation && (node.parent as MethodInvocation).methodName == node)) {
        graph.relation(from, node.element, 'references', node, unit);
      }
      if (node is NamedType && node.parent is! ConstructorName) {
        graph.relation(from, node.element,
          node.parent is ExtendsClause || node.parent is ImplementsClause || node.parent is WithClause ? 'inherits' : 'references', node, unit);
      }
    }
    super.visitNode(node);
    if (owner != null) scope.removeLast();
  }
}
