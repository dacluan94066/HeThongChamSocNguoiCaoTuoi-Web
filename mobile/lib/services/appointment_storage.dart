import 'package:dio/dio.dart';

import 'api_client.dart';

class AppointmentStorage {
  static Future<List<Map<String, dynamic>>> loadAppointments() async {
    try {
      final response = await ApiClient.instance.dio.get('/appointments');

      final body = response.data;

      if (body is! Map || body['data'] is! List) {
        return [];
      }

      final items = (body['data'] as List)
          .whereType<Map>()
          .map((item) => Map<String, dynamic>.from(item))
          .map(_mapAppointment)
          .toList();

      return items;
    } on DioException catch (e) {
      throw ApiException.fromDio(e);
    }
  }

  static Map<String, dynamic> _mapAppointment(
    Map<String, dynamic> data,
  ) {
    return {
      'id': data['id']?.toString() ?? '',
      'doctor': data['bacSiTen']?.toString() ?? 'Chưa xác định',
      'specialty': data['ghiChu']?.toString() ?? '',
      'date': _formatDate(data['ngayKham']),
      'time': data['gioKham']?.toString() ?? '',
      'hospital': data['noiKham']?.toString() ?? '',
      'status': data['trangThaiLabel']?.toString() ?? '',
      'reason': data['lyDoKham']?.toString() ?? '',
      'result': data['ketQua']?.toString() ?? '',
    };
  }

  static String _formatDate(Object? raw) {
    final date = DateTime.tryParse(raw?.toString() ?? '');

    if (date == null) {
      return raw?.toString() ?? '';
    }

    return '${date.day.toString().padLeft(2, '0')}/'
        '${date.month.toString().padLeft(2, '0')}/${date.year}';
  }

  static Future<Map<String, dynamic>?> getNextAppointment() async {
    final appointments = await loadAppointments();

    final upcoming = appointments
        .where((appointment) => appointment['status'] == 'Chưa đến')
        .toList();

    if (upcoming.isEmpty) {
      return null;
    }

    return upcoming.first;
  }

  static Future<void> addAppointment({
    required String doctor,
    required String specialty,
    required String date,
    required String time,
    required String hospital,
  }) async {
    throw UnsupportedError(
      'Mobile người cao tuổi không được tạo lịch khám.',
    );
  }

  static Future<void> updateStatus({
    required String id,
    required String status,
  }) async {
    throw UnsupportedError(
      'Mobile người cao tuổi không được thay đổi trạng thái lịch khám.',
    );
  }

  static Future<void> deleteAppointment(String id) async {
    throw UnsupportedError(
      'Mobile người cao tuổi không được xóa lịch khám.',
    );
  }
}