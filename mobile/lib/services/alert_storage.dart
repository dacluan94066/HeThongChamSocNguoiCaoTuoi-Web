import 'dart:convert';

import 'package:shared_preferences/shared_preferences.dart';

class AlertStorage {
  static const String keyAlerts = 'alert_history';

  static Future<List<Map<String, dynamic>>> loadAlerts() async {
    final prefs = await SharedPreferences.getInstance();

    final raw = prefs.getString(keyAlerts);

    if (raw == null || raw.isEmpty) {
      return [
        {
          'title': 'Cảnh báo khẩn cấp',
          'message': 'Đã gửi cảnh báo đến người chăm sóc.',
          'time': '22/09/2026 • 20:15',
          'status': 'Đã gửi',
          'type': 'sos',
        },
        {
          'title': 'Huyết áp bất thường',
          'message': 'Chỉ số huyết áp ghi nhận 165/100 mmHg.',
          'time': '21/09/2026 • 07:40',
          'status': 'Đã xử lý',
          'type': 'health',
        },
        {
          'title': 'Đường huyết cao',
          'message': 'Chỉ số đường huyết ghi nhận 8.5 mmol/L.',
          'time': '20/09/2026 • 20:05',
          'status': 'Đã xem',
          'type': 'health',
        },
      ];
    }

    final decoded = jsonDecode(raw) as List<dynamic>;

    return decoded.map((item) => Map<String, dynamic>.from(item)).toList();
  }

  static Future<void> saveAlerts(List<Map<String, dynamic>> alerts) async {
    final prefs = await SharedPreferences.getInstance();

    await prefs.setString(keyAlerts, jsonEncode(alerts));
  }

  static Future<void> addEmergencyAlert() async {
    final alerts = await loadAlerts();

    final now = DateTime.now();

    final day = now.day.toString().padLeft(2, '0');

    final month = now.month.toString().padLeft(2, '0');

    final hour = now.hour.toString().padLeft(2, '0');

    final minute = now.minute.toString().padLeft(2, '0');

    final formattedTime = '$day/$month/${now.year} • $hour:$minute';

    alerts.insert(0, {
      'title': 'Cảnh báo khẩn cấp',
      'message': 'Đã gửi cảnh báo SOS đến người chăm sóc.',
      'time': formattedTime,
      'status': 'Đã gửi',
      'type': 'sos',
    });

    await saveAlerts(alerts);
  }

  static Future<void> updateAlertStatus({
    required int index,
    required String status,
  }) async {
    final alerts = await loadAlerts();

    if (index < 0 || index >= alerts.length) {
      return;
    }

    alerts[index]['status'] = status;

    await saveAlerts(alerts);
  }
}
