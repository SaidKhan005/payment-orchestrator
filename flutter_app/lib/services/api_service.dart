import 'dart:convert';
import 'package:http/http.dart' as http;

class ApiService {
  final String baseUrl;
  final String apiKey;

  ApiService({
    required this.baseUrl,
    required this.apiKey,
  });

  Map<String, String> get _headers => {
        'Content-Type': 'application/json',
        'X-API-Key': apiKey,
      };

  Future<dynamic> get(String path) async {
    try {
      final url = Uri.parse('$baseUrl$path');
      final response = await http.get(url, headers: _headers);

      return _handleResponse(response);
    } catch (e) {
      throw Exception('GET request failed: $e');
    }
  }

  Future<dynamic> post(String path, Map<String, dynamic> body) async {
    try {
      final url = Uri.parse('$baseUrl$path');
      final response = await http.post(
        url,
        headers: _headers,
        body: jsonEncode(body),
      );

      return _handleResponse(response);
    } catch (e) {
      throw Exception('POST request failed: $e');
    }
  }

  Future<dynamic> put(String path, Map<String, dynamic> body) async {
    try {
      final url = Uri.parse('$baseUrl$path');
      final response = await http.put(
        url,
        headers: _headers,
        body: jsonEncode(body),
      );

      return _handleResponse(response);
    } catch (e) {
      throw Exception('PUT request failed: $e');
    }
  }

  Future<dynamic> delete(String path) async {
    try {
      final url = Uri.parse('$baseUrl$path');
      final response = await http.delete(url, headers: _headers);

      return _handleResponse(response);
    } catch (e) {
      throw Exception('DELETE request failed: $e');
    }
  }

  dynamic _handleResponse(http.Response response) {
    if (response.statusCode >= 200 && response.statusCode < 300) {
      if (response.body.isEmpty) {
        return null;
      }
      return jsonDecode(response.body);
    } else {
      final errorBody = response.body.isNotEmpty
          ? jsonDecode(response.body)
          : {'message': 'Unknown error'};
      throw Exception(
          'HTTP ${response.statusCode}: ${errorBody['message'] ?? errorBody['error'] ?? 'Request failed'}');
    }
  }
}
