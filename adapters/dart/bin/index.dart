import 'dart:convert';
import 'dart:io';
import 'package:analyzer/dart/analysis/utilities.dart';
import 'package:analyzer/dart/ast/ast.dart';
import 'package:analyzer/dart/ast/visitor.dart';

// AST declarations are intentionally not advertised as resolved call relations.
void main(List<String> args) {
  final root = Directory(args.single).absolute.path;
  final output = <Map<String, Object>>[];
  void walk(Directory dir) {
    for (final file in dir.listSync(followLinks: false)) {
      if (file is Link) continue;
      if (file is Directory) {
        if (!['.git', '.dart_tool', 'build', 'node_modules', 'Library', 'Packages', '.depth'].contains(file.path.split(Platform.pathSeparator).last)) walk(file);
      } else if (file is File && file.path.endsWith('.dart')) {
        final parsed = parseString(content: file.readAsStringSync(), path: file.path, throwIfDiagnostics: false);
        if (parsed.errors.isNotEmpty) stderr.writeln('${file.path}: ${parsed.errors.length} parse diagnostics');
        final path = file.path.substring(root.length + 1).replaceAll('\\', '/');
        parsed.unit.accept(Declarations(path, parsed.lineInfo.getLocation, output));
      }
    }
  }
  walk(Directory(root));
  stdout.write(jsonEncode(output));
}

class Declarations extends RecursiveAstVisitor<void> {
  final String path;
  final dynamic Function(int) location;
  final List<Map<String, Object>> output;
  final List<String> scope = [];
  Declarations(this.path, this.location, this.output);
  void add(AstNode node, String name, String kind) {
    output.add({'path': path, 'name': name, 'kind': kind,
      'qualifiedName': [...scope, name].join('.'),
      'startLine': location(node.offset).lineNumber as int,
      'endLine': location(node.end).lineNumber as int});
  }
  @override
  void visitClassDeclaration(ClassDeclaration node) {
    final name = node.namePart.typeName.lexeme;
    add(node, name, 'class'); scope.add(name); super.visitClassDeclaration(node); scope.removeLast();
  }
  @override
  void visitMethodDeclaration(MethodDeclaration node) {
    add(node, node.name.lexeme + (node.isGetter ? ':get' : node.isSetter ? ':set' : ''), 'method');
  }
  @override
  void visitFunctionDeclaration(FunctionDeclaration node) { add(node, node.name.lexeme, 'function'); }
  @override
  void visitFieldDeclaration(FieldDeclaration node) {
    for (final v in node.fields.variables) { add(v, v.name.lexeme, 'field'); }
  }
}
