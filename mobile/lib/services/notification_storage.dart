import 'package:dio/dio.dart';

import 'api_client.dart';

class NotificationStorage {
  static Future<List<Map<String, dynamic>>> loadNotifications() async {
    try {
      final response =
          await ApiClient.instance.dio.get('/notifications/me');

      final body = response.data;

      if (body is! Map || body['data'] is! List) {
        return [];
      }

      final notifications = (body['data'] as List)
          .whereType<Map>()
          .map((item) {
        final data = Map<String, dynamic>.from(item);

        return {
          'id': data['id']?.toString() ?? '',
          'title': data['tieuDe']?.toString() ?? 'Thông báo',
          'message': data['noiDung']?.toString() ?? '',
          'time': _formatDateTime(data['ngayTao']),
          'type': _mapType(data['loaiThongBao']),
          'read': data['daDoc'] == true,
        };
      }).toList();

      notifications.sort((a, b) {
        final aRead = a['read'] == true;
        final bRead = b['read'] == true;

        if (aRead != bRead) {
          return aRead ? 1 : -1;
        }

        return 0;
      });

      return notifications;
    } on DioException catch (e) {
      throw ApiException.fromDio(e);
    }
  }

  static Future<void> markAsRead(String id) async {
    try {
      await ApiClient.instance.dio.patch(
        '/notifications/$id/read',
      );
    } on DioException catch (e) {
      throw ApiException.fromDio(e);
    }
  }

  static Future<void> markAllAsRead() async {
    final notifications = await loadNotifications();

    for (final item in notifications) {
      if (item['read'] != true) {
        final id = item['id']?.toString();

        if (id != null && id.isNotEmpty) {
          await markAsRead(id);
        }
      }
    }
  }

  static Future<int> getUnreadCount() async {
    final notifications = await loadNotifications();

    return notifications
        .where((item) => item['read'] != true)
        .length;
  }

  static String _mapType(Object? raw) {
    final value = raw?.toString().toLowerCase() ?? '';

    if (value.contains('thuoc')) {
      return 'medicine';
    }

    if (value.contains('kham')) {
      return 'appointment';
    }

    if (value.contains('khancap') ||
        value.contains('canhbao')) {
      return 'alert';
    }

    return 'health';
  }

  static String _formatDateTime(Object? raw) {
    final date =
        DateTime.tryParse(raw?.toString() ?? '')?.toLocal();

    if (date == null) {
      return '';
    }

    return '${date.day.toString().padLeft(2, '0')}/'
        '${date.month.toString().padLeft(2, '0')}/${date.year} '
        '${date.hour.toString().padLeft(2, '0')}:'
        '${date.minute.toString().padLeft(2, '0')}';
  }
}