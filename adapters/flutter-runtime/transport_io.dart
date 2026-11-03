import 'dart:io';
import 'dart:convert';
Future<String> post(String url, String token, String body) async {
  final client = HttpClient()..connectionTimeout = const Duration(seconds: 5);
  try {
    final request = await client.postUrl(Uri.parse(url));
    request.headers.set('X-Depth-Runtime', token);
    request.headers.contentType = ContentType.json;
    request.write(body);
    final response = await request.close().timeout(const Duration(seconds: 5));
    final value = await utf8.decoder.bind(response).join();
    if (response.statusCode != 200) throw const HttpException('Depth runtime disconnected');
    return value;
  } finally { client.close(force: true); }
}
