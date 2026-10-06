import 'dart:convert';

import 'package:shared_preferences/shared_preferences.dart';

class AlertStorage {
  static const String keyAlerts = 'alert_history';

  static Future<List<Map<String, dynamic>>> loadAlerts() async {
    final prefs = await SharedPreferences.getInstance();
    final raw = prefs.getString(keyAlerts);
    if (raw == null || raw.isEmpty) return [];

    final decoded = jsonDecode(raw) as List<dynamic>;
    return decoded.map((item) => Map<String, dynamic>.from(item)).toList();
  }

  static Future<void> saveAlerts(List<Map<String, dynamic>> alerts) async {
    final prefs = await SharedPreferences.getInstance();
    await prefs.setString(keyAlerts, jsonEncode(alerts));
  }

  // Luu ban sao cuc bo chi sau khi backend da xac nhan gui SOS thanh cong.
  static Future<void> addEmergencyAlert({
    String? message,
    Object? backendId,
  }) async {
    final alerts = await loadAlerts();
    final now = DateTime.now();
    final day = now.day.toString().padLeft(2, '0');
    final month = now.month.toString().padLeft(2, '0');
    final hour = now.hour.toString().padLeft(2, '0');
    final minute = now.minute.toString().padLeft(2, '0');
    final formattedTime = '$day/$month/${now.year} • $hour:$minute';

    alerts.insert(0, {
      'id': backendId,
      'title': 'Cảnh báo khẩn cấp',
      'message': message?.trim().isNotEmpty == true
          ? message!.trim()
          : 'Đã gửi cảnh báo SOS đến người chăm sóc.',
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
    if (index < 0 || index >= alerts.length) return;
    alerts[index]['status'] = status;
    await saveAlerts(alerts);
  }
}
