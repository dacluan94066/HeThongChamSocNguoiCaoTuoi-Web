import 'package:dio/dio.dart';

import 'api_client.dart';

class AlertService {
  AlertService._();

  static final AlertService instance = AlertService._();

  Future<List<Map<String, dynamic>>> getAlerts() async {
    try {
      final response = await ApiClient.instance.dio.get('/alerts');

      final body = response.data;

      if (body is Map) {
        final data = body['data'];

        if (data is List) {
          return data
              .whereType<Map>()
              .map((item) => Map<String, dynamic>.from(item))
              .toList();
        }
      }

      return [];
    } on DioException catch (e) {
      throw ApiException.fromDio(e);
    }
  }
}
