import 'package:flutter/foundation.dart';
import 'package:flutter_local_notifications/flutter_local_notifications.dart';
import 'package:timezone/data/latest.dart' as tz;
import 'package:timezone/timezone.dart' as tz;

class LocalNotificationService {
  static final FlutterLocalNotificationsPlugin _notificationsPlugin =
      FlutterLocalNotificationsPlugin();

  static const AndroidNotificationChannel medicationChannel =
      AndroidNotificationChannel(
        'medication_reminder_channel',
        'Nhắc uống thuốc',
        description: 'Thông báo nhắc người dùng uống thuốc đúng giờ',
        importance: Importance.high,
      );

  static Future<void> initialize() async {
    tz.initializeTimeZones();

    tz.setLocalLocation(tz.getLocation('Asia/Ho_Chi_Minh'));

    const androidSettings = AndroidInitializationSettings(
      '@mipmap/ic_launcher',
    );

    const initializationSettings = InitializationSettings(
      android: androidSettings,
    );

    await _notificationsPlugin.initialize(
      settings: initializationSettings,
      onDidReceiveNotificationResponse: (NotificationResponse response) {
        if (kDebugMode) {
          print('Notification clicked: ${response.payload}');
        }
      },
    );

    final androidPlugin = _notificationsPlugin
        .resolvePlatformSpecificImplementation<
          AndroidFlutterLocalNotificationsPlugin
        >();

    await androidPlugin?.createNotificationChannel(medicationChannel);
  }

  static Future<bool> areNotificationsEnabled() async {
    if (kIsWeb || defaultTargetPlatform != TargetPlatform.android) return true;
    final androidPlugin = _notificationsPlugin
        .resolvePlatformSpecificImplementation<
          AndroidFlutterLocalNotificationsPlugin
        >();
    return await androidPlugin?.areNotificationsEnabled() ?? false;
  }

  static Future<bool> requestNotificationPermission() async {
    if (kIsWeb || defaultTargetPlatform != TargetPlatform.android) return true;
    final androidPlugin = _notificationsPlugin
        .resolvePlatformSpecificImplementation<
          AndroidFlutterLocalNotificationsPlugin
        >();
    return await androidPlugin?.requestNotificationsPermission() ?? false;
  }

  static Future<bool> requestExactAlarmPermission() async {
    if (kIsWeb || defaultTargetPlatform != TargetPlatform.android) return true;
    final androidPlugin = _notificationsPlugin
        .resolvePlatformSpecificImplementation<
          AndroidFlutterLocalNotificationsPlugin
        >();
    return await androidPlugin?.requestExactAlarmsPermission() ?? false;
  }

  static Future<bool> canScheduleExactNotifications() async {
    if (kIsWeb || defaultTargetPlatform != TargetPlatform.android) return true;
    final androidPlugin = _notificationsPlugin
        .resolvePlatformSpecificImplementation<
          AndroidFlutterLocalNotificationsPlugin
        >();
    return await androidPlugin?.canScheduleExactNotifications() ?? false;
  }

  static Future<void> showTestNotification() async {
    const androidDetails = AndroidNotificationDetails(
      'medication_reminder_channel',
      'Nhắc uống thuốc',
      channelDescription: 'Thông báo nhắc người dùng uống thuốc đúng giờ',
      importance: Importance.high,
      priority: Priority.high,
      icon: '@mipmap/ic_launcher',
    );

    const details = NotificationDetails(android: androidDetails);

    await _notificationsPlugin.show(
      id: 999,
      title: 'Nhắc uống thuốc',
      body: 'Đây là thông báo kiểm tra từ An Tâm Tuổi Già.',
      notificationDetails: details,
      payload: 'medication:test',
    );
  }

  static Future<void> scheduleDailyMedication({
    required int id,
    required String medicineName,
    required int hour,
    required int minute,
  }) async {
    final now = tz.TZDateTime.now(tz.local);

    var scheduledDate = tz.TZDateTime(
      tz.local,
      now.year,
      now.month,
      now.day,
      hour,
      minute,
    );

    if (scheduledDate.isBefore(now)) {
      scheduledDate = scheduledDate.add(const Duration(days: 1));
    }

    const androidDetails = AndroidNotificationDetails(
      'medication_reminder_channel',
      'Nhắc uống thuốc',
      channelDescription: 'Thông báo nhắc người dùng uống thuốc đúng giờ',
      importance: Importance.high,
      priority: Priority.high,
      icon: '@mipmap/ic_launcher',
    );

    const details = NotificationDetails(android: androidDetails);

    await _notificationsPlugin.zonedSchedule(
      id: id,
      title: 'Đến giờ uống thuốc',
      body: 'Đã đến giờ uống $medicineName.',
      scheduledDate: scheduledDate,
      notificationDetails: details,
      androidScheduleMode: AndroidScheduleMode.exactAllowWhileIdle,
      matchDateTimeComponents: DateTimeComponents.time,
      payload: 'medication:$id',
    );
  }

  static Future<void> cancelMedicationReminders() async {
    final pending = await _notificationsPlugin.pendingNotificationRequests();
    for (final request in pending) {
      if (request.payload?.startsWith('medication:') == true &&
          request.id != 999) {
        await _notificationsPlugin.cancel(id: request.id);
      }
    }
  }

  static Future<void> cancelNotification(int id) async {
    await _notificationsPlugin.cancel(id: id);
  }

  static Future<void> cancelAll() async {
    await _notificationsPlugin.cancelAll();
  }
}
