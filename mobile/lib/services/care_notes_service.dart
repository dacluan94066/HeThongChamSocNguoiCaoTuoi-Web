import 'package:dio/dio.dart';
import 'api_client.dart';

class CareNotesService {
  CareNotesService({Dio? dio}) : _dio = dio ?? ApiClient.instance.dio;
  final Dio _dio;
  Future<List<Map<String, dynamic>>> list(int elderlyId) async {
    try {
      final response = await _dio.get<Map<String, dynamic>>(
        '/care-notes',
        queryParameters: {'nguoiCaoTuoiId': elderlyId},
      );
      final rows = response.data?['data'];
      if (rows is! List) {
        throw const ApiException('Phản hồi nhật ký không hợp lệ.');
      }
      return rows
          .whereType<Map>()
          .map((row) => Map<String, dynamic>.from(row))
          .toList();
    } on DioException catch (error) {
      throw ApiException.fromDio(error);
    }
  }

  Future<void> create(int elderlyId, String title, String content) async {
    try {
      await _dio.post<Map<String, dynamic>>(
        '/care-notes',
        data: {
          'nguoiCaoTuoiId': elderlyId,
          'tieuDe': title.trim(),
          'noiDung': content.trim(),
        },
      );
    } on DioException catch (error) {
      throw ApiException.fromDio(error);
    }
  }

  Future<void> update(
    Map<String, dynamic> note,
    String title,
    String content,
  ) async {
    try {
      await _dio.patch(
        '/care-notes/${note['id']}',
        data: {
          'version': note['version'],
          'tieuDe': title.trim(),
          'noiDung': content.trim(),
        },
      );
    } on DioException catch (error) {
      throw ApiException.fromDio(error);
    }
  }

  Future<void> remove(Map<String, dynamic> note) async {
    try {
      await _dio.delete(
        '/care-notes/${note['id']}',
        data: {'version': note['version']},
      );
    } on DioException catch (error) {
      throw ApiException.fromDio(error);
    }
  }
}
