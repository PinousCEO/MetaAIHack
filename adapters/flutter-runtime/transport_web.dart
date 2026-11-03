import 'dart:js_interop';
@JS('fetch') external JSPromise<_Response> _fetch(JSString url, JSObject options);
extension type _Response._(JSObject _) implements JSObject {
  external bool get ok;
  external JSPromise<JSString> text();
}
Future<String> post(String url, String token, String body) async {
  final response = await _fetch(url.toJS, {'method': 'POST', 'headers': {'Content-Type': 'application/json', 'X-Depth-Runtime': token}, 'body': body}.jsify()! as JSObject).toDart.timeout(const Duration(seconds: 5));
  if (!response.ok) throw StateError('Depth runtime disconnected');
  return (await response.text().toDart).toDart;
}
