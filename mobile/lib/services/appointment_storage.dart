import 'dart:convert';

import 'package:shared_preferences/shared_preferences.dart';

class AppointmentStorage {
  static const String keyAppointments = 'saved_appointments';

  static Future<List<Map<String, dynamic>>> loadAppointments() async {
    final prefs = await SharedPreferences.getInstance();

    final raw = prefs.getString(keyAppointments);

    if (raw == null || raw.isEmpty) {
      final defaultAppointments = [
        {
          'id': 'a1',
          'doctor': 'BS. Nguyễn Minh Tuấn',
          'specialty': 'Tim mạch',
          'date': '25/09/2026',
          'time': '10:00',
          'hospital': 'Bệnh viện Đại học Y Dược',
          'status': 'Sắp tới',
        },
        {
          'id': 'a2',
          'doctor': 'BS. Trần Thu Hà',
          'specialty': 'Nội tổng quát',
          'date': '30/09/2026',
          'time': '08:30',
          'hospital': 'Bệnh viện Nhân Dân 115',
          'status': 'Sắp tới',
        },
        {
          'id': 'a3',
          'doctor': 'BS. Lê Hoàng Nam',
          'specialty': 'Tim mạch',
          'date': '12/09/2026',
          'time': '09:00',
          'hospital': 'Bệnh viện Chợ Rẫy',
          'status': 'Đã khám',
        },
        {
          'id': 'a4',
          'doctor': 'BS. Phạm Thanh Mai',
          'specialty': 'Nội tổng quát',
          'date': '28/08/2026',
          'time': '14:00',
          'hospital': 'Bệnh viện Thống Nhất',
          'status': 'Đã khám',
        },
      ];

      await saveAppointments(defaultAppointments);

      return defaultAppointments;
    }

    final decoded = jsonDecode(raw) as List<dynamic>;

    return decoded.map((item) => Map<String, dynamic>.from(item)).toList();
  }

  static Future<void> saveAppointments(
    List<Map<String, dynamic>> appointments,
  ) async {
    final prefs = await SharedPreferences.getInstance();

    await prefs.setString(keyAppointments, jsonEncode(appointments));
  }

  static Future<void> addAppointment({
    required String doctor,
    required String specialty,
    required String date,
    required String time,
    required String hospital,
  }) async {
    final appointments = await loadAppointments();

    appointments.insert(0, {
      'id': DateTime.now().millisecondsSinceEpoch.toString(),
      'doctor': doctor,
      'specialty': specialty,
      'date': date,
      'time': time,
      'hospital': hospital,
      'status': 'Sắp tới',
    });

    await saveAppointments(appointments);
  }

  static Future<void> updateStatus({
    required String id,
    required String status,
  }) async {
    final appointments = await loadAppointments();

    for (final appointment in appointments) {
      if (appointment['id'] == id) {
        appointment['status'] = status;
        break;
      }
    }

    await saveAppointments(appointments);
  }

  static Future<void> deleteAppointment(String id) async {
    final appointments = await loadAppointments();

    appointments.removeWhere((appointment) => appointment['id'] == id);

    await saveAppointments(appointments);
  }

  static Future<Map<String, dynamic>?> getNextAppointment() async {
    final appointments = await loadAppointments();

    final upcoming = appointments
        .where((appointment) => appointment['status'] == 'Sắp tới')
        .toList();

    if (upcoming.isEmpty) {
      return null;
    }

    return upcoming.first;
  }
}
