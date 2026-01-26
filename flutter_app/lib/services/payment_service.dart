import 'api_service.dart';
import '../models/payment_intent.dart';
import '../models/payment_exception.dart';

class PaymentService {
  final ApiService _apiService;

  PaymentService(this._apiService);

  Future<List<PaymentIntent>> getPayments({String? state, int limit = 50}) async {
    String path = '/api/payments?limit=$limit';
    if (state != null && state.isNotEmpty) {
      path += '&state=$state';
    }

    final response = await _apiService.get(path);
    final List<dynamic> data = response['data'];

    return data.map((json) => PaymentIntent.fromJson(json)).toList();
  }

  Future<PaymentIntent> getPaymentById(String intentId) async {
    final response = await _apiService.get('/api/payments/$intentId');
    return PaymentIntent.fromJson(response['data']);
  }

  Future<Map<String, dynamic>> recoverPayment(String intentId) async {
    final response = await _apiService.post('/api/payments/recover', {
      'intentId': intentId,
    });
    return response['data'];
  }

  Future<List<PaymentException>> getExceptions({
    bool resolved = false,
    int limit = 50,
  }) async {
    final response = await _apiService.get(
        '/api/exceptions?resolved=$resolved&limit=$limit');
    final List<dynamic> data = response['data'];

    return data.map((json) => PaymentException.fromJson(json)).toList();
  }
}
