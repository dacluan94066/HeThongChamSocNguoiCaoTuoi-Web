import 'package:dio/dio.dart';
import 'api_client.dart';

class EmergencyAlertService {
  EmergencyAlertService._();

  static final EmergencyAlertService instance = EmergencyAlertService._();

  Future<Map<String, dynamic>> sendSOS({
    String? noiDung,
    double? viDo,
    double? kinhDo,
  }) async {
    try {
      final response = await ApiClient.instance.dio.post(
        '/emergency-alerts',
        data: {
          if (noiDung != null && noiDung.trim().isNotEmpty)
            'noiDung': noiDung.trim(),
          'viDo': ?viDo,
          'kinhDo': ?kinhDo,
        },
      );

      final data = response.data;

      if (data is Map<String, dynamic>) {
        final result = data['data'];
        if (result is Map<String, dynamic>) {
          return result;
        }
        return data;
      }

      return {};
    } on DioException catch (e) {
      throw ApiException.fromDio(e);
    }
  }
}
