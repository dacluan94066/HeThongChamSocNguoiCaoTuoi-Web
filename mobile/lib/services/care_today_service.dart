import 'package:dio/dio.dart';
import 'api_client.dart';

class CareTodayService {
  const CareTodayService();
  Future<dynamic> request(
    String path, {
    String method = 'GET',
    Map<String, dynamic>? data,
    Map<String, dynamic>? query,
  }) async {
    final version = ApiClient.sessionVersion;
    try {
      final response = await ApiClient.instance.dio
          .request<Map<String, dynamic>>(
            path,
            data: data,
            queryParameters: query,
            options: Options(method: method),
          );
      if (version != ApiClient.sessionVersion) {
        throw const ApiException('Phiên đã thay đổi. Hãy tải lại.');
      }
      final result = response.data?['data'];
      if (result == null) {
        throw const ApiException('Phản hồi chăm sóc không hợp lệ.');
      }
      return result;
    } on DioException catch (error) {
      throw ApiException.fromDio(error);
    }
  }

  Future<List<Map<String, dynamic>>> profiles() async =>
      (await request('/care-assistant/profiles') as List)
          .map((e) => Map<String, dynamic>.from(e as Map))
          .toList();
  Future<Map<String, dynamic>> today(int id) async =>
      Map<String, dynamic>.from(await request('/care/$id/today') as Map);
  Future<Map<String, dynamic>> plans(int id) async =>
      Map<String, dynamic>.from(await request('/care/$id/plans') as Map);
  Future<void> create(int id, Map<String, dynamic> data) async {
    await request('/care/$id/plans', method: 'POST', data: data);
  }

  Future<void> complete(int id, int activityId, String date) async {
    await request(
      '/care/$id/activities/$activityId/complete',
      method: 'POST',
      data: {'ngay': date},
    );
  }
}
