import 'package:dio/dio.dart';

import 'api_client.dart';

class CaregiverService {
  CaregiverService._();

  static final CaregiverService instance = CaregiverService._();

  Future<List<Map<String, dynamic>>> getCaregivers() async {
    try {
      final response = await ApiClient.instance.dio.get('/caregivers');

      final body = response.data;

      if (body is Map && body['data'] is List) {
        return (body['data'] as List)
            .whereType<Map>()
            .map((e) => Map<String, dynamic>.from(e))
            .toList();
      }

      return [];
    } on DioException catch (e) {
      throw ApiException.fromDio(e);
    }
  }

  Future<List<Map<String, dynamic>>> getEmergencyContacts() async {
    try {
      final response = await ApiClient.instance.dio.get('/emergency-contacts');

      final body = response.data;

      if (body is Map && body['data'] is List) {
        return (body['data'] as List)
            .whereType<Map>()
            .map((e) => Map<String, dynamic>.from(e))
            .toList();
      }

      return [];
    } on DioException catch (e) {
      throw ApiException.fromDio(e);
    }
  }
}
