// Development runtime adapter. The actual Flutter render tree supplies pixels,
// hit testing, creation locations and input. No replacement UI is constructed.
// WidgetInspectorService's protected tooling APIs are version-sensitive and
// are intentionally confined to this adapter (validated against installed SDK).
// ignore_for_file: invalid_use_of_protected_member
import 'dart:async';
import 'dart:convert';
import 'dart:ui' as ui;
import 'package:flutter/foundation.dart';
import 'package:flutter/gestures.dart';
import 'package:flutter/rendering.dart';
import 'package:flutter/widgets.dart';
import 'transport_io.dart' if (dart.library.js_interop) 'transport_web.dart' as transport;

class DepthRuntime {
  static bool _started = false;
  static void start() {
    if (_started || !kDebugMode) return;
    const url = String.fromEnvironment('DEPTH_RUNTIME_URL');
    const token = String.fromEnvironment('DEPTH_RUNTIME_TOKEN');
    const session = String.fromEnvironment('DEPTH_RUNTIME_SESSION');
    const root = String.fromEnvironment('DEPTH_RUNTIME_ROOT');
    if (url.isEmpty || token.length != 64 || session.isEmpty || root.isEmpty) return;
    _started = true;
    _DepthSession(url, token, session, root).start();
  }
}

class _DepthSession {
  _DepthSession(this.url, this.token, this.session, String projectRoot)
      : root = projectRoot.replaceAll('\\', '/').replaceFirst(RegExp(r'/$'), '');
  final String url, token, session, root;
  final inspector = WidgetInspectorService.instance;
  int sequence = 0;
  bool busy = false;
  Map<String, Object?>? selected;
  String get group => 'depth-runtime-$session';
  void start() {
    WidgetsFlutterBinding.ensureInitialized();
    inspector.addPubRootDirectories([Uri.directory(root).toString()]);
    Timer.periodic(const Duration(milliseconds: 250), (_) => frame());
  }
  String? relative(Object? file) {
    if (file is! String) return null;
    String source = file.startsWith('file:') ? Uri.parse(file).toFilePath(windows: root.contains(':')) : file;
    source = source.replaceAll('\\', '/');
    if (!source.toLowerCase().startsWith('${root.toLowerCase()}/')) return null;
    return source.substring(root.length + 1);
  }
  Map<String, Object?>? location(Map<String, dynamic> node) {
    final value = node['creationLocation'];
    if (value is! Map) return null;
    final path = relative(value['file']);
    return path == null ? null : {'path': path, 'line': value['line']};
  }
  Future<void> frame() async {
    if (busy || WidgetsBinding.instance.rootElement == null || RendererBinding.instance.renderViews.isEmpty) return;
    busy = true;
    try {
      final view = RendererBinding.instance.renderViews.first;
      if (view.size.isEmpty) return;
      final rootNode = jsonDecode(inspector.getRootWidgetSummaryTree(group));
      final regions = <Map<String, Object?>>[];
      void collect(dynamic value, int depth, List<Map<String, Object?>> inherited) {
        if (value is! Map<String, dynamic> || regions.length >= 10000) return;
        final source = location(value);
        final sources = source == null ? inherited : [source, ...inherited].take(100).toList();
        final object = inspector.toObject(value['valueId'] as String?);
        if (object is Element && object.mounted) {
          final render = object.findRenderObject();
          if (render is RenderBox && render.hasSize && render.attached) {
            final rect = MatrixUtils.transformRect(render.getTransformTo(view), Offset.zero & render.size).intersect(Offset.zero & view.size);
            if (!rect.isEmpty && rect.left.isFinite && rect.top.isFinite) {
              regions.add({'id': value['valueId'], 'name': value['description']?.toString() ?? object.widget.runtimeType.toString(), 'x': (rect.left / view.size.width).clamp(0, 1), 'y': (rect.top / view.size.height).clamp(0, 1), 'width': (rect.width / view.size.width).clamp(0, 1), 'height': (rect.height / view.size.height).clamp(0, 1), 'depth': depth, 'sources': sources});
            }
          }
        }
        for (final child in value['children'] as List? ?? []) { collect(child, depth + 1, sources); }
      }
      collect(rootNode, 0, []);
      final image = await inspector.screenshot(view, width: 1600, height: 1200, maxPixelRatio: 1);
      if (image == null) return;
      final bytes = await image.toByteData(format: ui.ImageByteFormat.png);
      final width = image.width, height = image.height;
      image.dispose();
      if (bytes == null) return;
      final reply = await transport.post('$url/frame', token, jsonEncode({'protocol': 'depth-runtime/1', 'engine': 'flutter', 'session': session, 'sequence': ++sequence, 'width': width, 'height': height, 'png': base64Encode(bytes.buffer.asUint8List(bytes.offsetInBytes, bytes.lengthInBytes)), 'regions': regions, 'selection': selected, 'capabilities': {'pointer': true, 'scroll': true, 'text': true, 'inspect': true}}));
      selected = null;
      final response = jsonDecode(reply) as Map<String, dynamic>;
      if (response['session'] == session) for (final command in response['commands'] as List? ?? []) { input(command as Map<String, dynamic>, view); }
    } catch (error) {
      // Disconnection never stops the target application or logs the capability.
      debugPrint('Depth preview frame unavailable: ${error.runtimeType}');
    } finally {
      inspector.disposeGroup(group);
      busy = false;
    }
  }
  void input(Map<String, dynamic> command, RenderView view) {
    final position = Offset((command['x'] as num? ?? 0).toDouble() * view.size.width, (command['y'] as num? ?? 0).toDouble() * view.size.height);
    final viewId = view.flutterView.viewId;
    switch (command['type']) {
      case 'pick':
        final hit = HitTestResult();
        GestureBinding.instance.hitTestInView(hit, position, viewId);
        final sources = <Map<String, Object?>>[];
        String name = 'Flutter element';
        for (final entry in hit.path) {
          final target = entry.target;
          if (target is! RenderObject || target.debugCreator is! DebugCreator) continue;
          Element? element = (target.debugCreator as DebugCreator).element;
          name = element.widget.runtimeType.toString();
          final ancestors = <Element>[element];
          element.visitAncestorElements((ancestor) { ancestors.add(ancestor); return ancestors.length < 100; });
          for (final ancestor in ancestors) {
            inspector.selection.currentElement = ancestor;
            final data = jsonDecode(inspector.getSelectedWidget(null, group));
            if (data is Map<String, dynamic>) { final source = location(data); if (source != null && !sources.any((s) => s['path'] == source['path'] && s['line'] == source['line'])) sources.add(source); }
          }
          break;
        }
        selected = {'requestId': command['requestId'], 'id': 'flutter-hit', 'name': name, 'sources': sources};
      case 'pointerDown':
        GestureBinding.instance.handlePointerEvent(PointerDownEvent(viewId: viewId, pointer: 9871, position: position, kind: ui.PointerDeviceKind.mouse, buttons: kPrimaryMouseButton));
      case 'pointerMove':
        GestureBinding.instance.handlePointerEvent(PointerHoverEvent(viewId: viewId, pointer: 9871, position: position, kind: ui.PointerDeviceKind.mouse));
      case 'pointerUp':
        GestureBinding.instance.handlePointerEvent(PointerUpEvent(viewId: viewId, pointer: 9871, position: position, kind: ui.PointerDeviceKind.mouse));
      case 'scroll':
        GestureBinding.instance.handlePointerEvent(PointerScrollEvent(viewId: viewId, position: position, scrollDelta: Offset(0, (command['delta'] as num).toDouble())));
      case 'text':
        final context = FocusManager.instance.primaryFocus?.context;
        final state = context?.findAncestorStateOfType<EditableTextState>();
        if (state != null) {
          final old = state.widget.controller.value, replacement = command['text'] as String;
          final start = old.selection.isValid ? old.selection.start : old.text.length;
          final end = old.selection.isValid ? old.selection.end : old.text.length;
          state.userUpdateTextEditingValue(old.copyWith(text: old.text.replaceRange(start, end, replacement), selection: TextSelection.collapsed(offset: start + replacement.length)), SelectionChangedCause.keyboard);
        }
    }
  }
}
