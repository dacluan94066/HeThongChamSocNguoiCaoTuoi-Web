import 'dart:convert';

import 'package:shared_preferences/shared_preferences.dart';

import 'appointment_service.dart';
import 'health_storage.dart';

class NotificationStorage {
  static const String keyNotifications = 'saved_notifications';

  static Future<List<Map<String, dynamic>>> _loadRawNotifications() async {
    final prefs = await SharedPreferences.getInstance();

    final raw = prefs.getString(keyNotifications);

    if (raw == null || raw.isEmpty) {
      return [];
    }

    try {
      final decoded = jsonDecode(raw) as List<dynamic>;

      return decoded.map((item) => Map<String, dynamic>.from(item)).toList();
    } catch (_) {
      return [];
    }
  }

  static Future<void> saveNotifications(
    List<Map<String, dynamic>> notifications,
  ) async {
    final prefs = await SharedPreferences.getInstance();

    await prefs.setString(keyNotifications, jsonEncode(notifications));
  }

  // =====================================================
  // LOAD + ĐỒNG BỘ TOÀN BỘ
  // =====================================================

  static Future<List<Map<String, dynamic>>> loadNotifications() async {
    final oldNotifications = await _loadRawNotifications();

    final readStatus = <String, bool>{};

    for (final item in oldNotifications) {
      final id = item['id']?.toString() ?? '';

      readStatus[id] = item['read'] == true;
    }

    final notifications = <Map<String, dynamic>>[];

    // ==================================================
    // 1. SỨC KHỎE
    // ==================================================

    final healthData = await HealthStorage.loadHealthData();

    final updatedAt = healthData['updatedAt'] ?? 'Chưa cập nhật';

    final now = DateTime.now();

    final today =
        '${now.day.toString().padLeft(2, '0')}/'
        '${now.month.toString().padLeft(2, '0')}/'
        '${now.year}';

    final updatedToday =
        updatedAt != 'Chưa cập nhật' && updatedAt.startsWith(today);

    if (!updatedToday) {
      const id = 'health_daily_update';

      notifications.add({
        'id': id,
        'title': 'Cập nhật sức khỏe',
        'message': 'Bạn chưa cập nhật các chỉ số sức khỏe hôm nay.',
        'time': 'Hôm nay',
        'type': 'health',
        'read': readStatus[id] ?? false,
      });
    }

    // ==================================================
    // 2. LỊCH KHÁM
    // ==================================================

    Map<String, dynamic>? appointment;
    try {
      final upcoming = await AppointmentService.instance
          .getUpcomingAppointments();
      appointment = upcoming.isEmpty ? null : upcoming.first;
    } catch (_) {
      // Thong bao cu van hoat dong khi API lich kham tam thoi mat ket noi.
    }

    if (appointment != null) {
      final id = 'appointment_${appointment['id']}';

      final doctor = appointment['bacSiPhuTrach']?.toString() ?? 'Bác sĩ';

      final dateTime = DateTime.tryParse(
        appointment['thoiGianKham']?.toString() ?? '',
      );

      final date = dateTime == null
          ? ''
          : '${dateTime.day.toString().padLeft(2, '0')}/'
                '${dateTime.month.toString().padLeft(2, '0')}/${dateTime.year}';

      final time = dateTime == null
          ? ''
          : '${dateTime.hour.toString().padLeft(2, '0')}:'
                '${dateTime.minute.toString().padLeft(2, '0')}';

      final hospital = appointment['tenBenhVien']?.toString() ?? '';

      notifications.add({
        'id': id,
        'title': 'Lịch khám sắp tới',
        'message':
            'Bạn có lịch khám với $doctor vào $date lúc $time'
            '${hospital.isNotEmpty ? ' tại $hospital' : ''}.',
        'time': '$date • $time',
        'type': 'appointment',
        'read': readStatus[id] ?? false,
      });
    }

    // ==================================================
    // CHƯA ĐỌC LÊN TRƯỚC
    // ==================================================

    notifications.sort((a, b) {
      final aRead = a['read'] == true;

      final bRead = b['read'] == true;

      if (aRead != bRead) {
        return aRead ? 1 : -1;
      }

      return 0;
    });

    await saveNotifications(notifications);

    return notifications;
  }

  static Future<void> markAsRead(String id) async {
    final notifications = await loadNotifications();

    for (final item in notifications) {
      if (item['id'] == id) {
        item['read'] = true;
        break;
      }
    }

    await saveNotifications(notifications);
  }

  static Future<void> markAllAsRead() async {
    final notifications = await loadNotifications();

    for (final item in notifications) {
      item['read'] = true;
    }

    await saveNotifications(notifications);
  }

  static Future<int> getUnreadCount() async {
    final notifications = await loadNotifications();

    return notifications.where((item) => item['read'] == false).length;
  }
}
