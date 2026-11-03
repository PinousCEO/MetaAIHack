// Analyze SDK adapter sources in-process; no analysis-server subprocess and no
// Flutter SDK mutation. Uses the same installed analyzer as source indexing.
import 'dart:convert';
import 'dart:io';
import 'package:analyzer/dart/analysis/analysis_context_collection.dart';
import 'package:analyzer/dart/analysis/results.dart';

Future<void> main(List<String> args) async {
  final root = Directory(args.single).resolveSymbolicLinksSync();
  final contexts = AnalysisContextCollection(includedPaths: [root]);
  final diagnostics = <Map<String, Object?>>[];
  for (final file in Directory(root).listSync().whereType<File>().where((f) => f.path.endsWith('.dart'))) {
    final result = await contexts.contextFor(file.path).currentSession.getResolvedUnit(file.path);
    if (result is! ResolvedUnitResult) throw StateError('Cannot resolve ${file.path}');
    for (final error in result.diagnostics) {
      diagnostics.add({'path': file.path, 'severity': error.diagnosticCode.severity.name, 'code': error.diagnosticCode.name, 'message': error.message, 'line': result.lineInfo.getLocation(error.offset).lineNumber});
    }
  }
  stdout.writeln(jsonEncode({'diagnostics': diagnostics}));
  if (diagnostics.any((d) => d['severity'] == 'ERROR')) exitCode = 1;
  await contexts.dispose();
}
