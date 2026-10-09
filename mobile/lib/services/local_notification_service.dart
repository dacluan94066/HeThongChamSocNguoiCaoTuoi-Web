import 'package:flutter/foundation.dart';
import 'package:flutter_local_notifications/flutter_local_notifications.dart';
import 'package:timezone/data/latest.dart' as tz;
import 'package:timezone/timezone.dart' as tz;

class LocalNotificationService {
  static final ValueNotifier<String?> pendingPayload = ValueNotifier(null);
  static Future<void>? _initializing;
  static bool _initialized = false;
  static const int _testNotificationId = 2147483647;

  static bool get _supportsNotifications =>
      !kIsWeb && defaultTargetPlatform == TargetPlatform.android;
  static bool get supportsNotifications => _supportsNotifications;

  static String? takePendingPayload() {
    final payload = pendingPayload.value;
    pendingPayload.value = null;
    return payload;
  }

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
    if (_initialized) return;
    if (_initializing != null) return _initializing!;
    final future = _initialize();
    _initializing = future;
    try {
      await future;
      _initialized = true;
    } finally {
      _initializing = null;
    }
  }

  static Future<void> _initialize() async {
    tz.initializeTimeZones();

    tz.setLocalLocation(tz.getLocation('Asia/Ho_Chi_Minh'));
    if (!_supportsNotifications) return;

    const androidSettings = AndroidInitializationSettings(
      '@mipmap/ic_launcher',
    );

    const initializationSettings = InitializationSettings(
      android: androidSettings,
    );

    await _notificationsPlugin.initialize(
      settings: initializationSettings,
      onDidReceiveNotificationResponse: (NotificationResponse response) {
        pendingPayload.value = response.payload;
      },
    );

    final androidPlugin = _notificationsPlugin
        .resolvePlatformSpecificImplementation<
          AndroidFlutterLocalNotificationsPlugin
        >();

    await androidPlugin?.createNotificationChannel(medicationChannel);
    final launch = await _notificationsPlugin.getNotificationAppLaunchDetails();
    if (launch?.didNotificationLaunchApp == true) {
      pendingPayload.value = launch?.notificationResponse?.payload;
    }
  }

  static Future<bool> areNotificationsEnabled() async {
    if (!_supportsNotifications) return false;
    await initialize();
    final androidPlugin = _notificationsPlugin
        .resolvePlatformSpecificImplementation<
          AndroidFlutterLocalNotificationsPlugin
        >();
    return await androidPlugin?.areNotificationsEnabled() ?? false;
  }

  static Future<bool> requestNotificationPermission() async {
    if (!_supportsNotifications) return false;
    await initialize();
    final androidPlugin = _notificationsPlugin
        .resolvePlatformSpecificImplementation<
          AndroidFlutterLocalNotificationsPlugin
        >();
    return await androidPlugin?.requestNotificationsPermission() ?? false;
  }

  static Future<bool> requestExactAlarmPermission() async {
    if (!_supportsNotifications) return false;
    await initialize();
    final androidPlugin = _notificationsPlugin
        .resolvePlatformSpecificImplementation<
          AndroidFlutterLocalNotificationsPlugin
        >();
    return await androidPlugin?.requestExactAlarmsPermission() ?? false;
  }

  static Future<bool> canScheduleExactNotifications() async {
    if (!_supportsNotifications) return false;
    await initialize();
    final androidPlugin = _notificationsPlugin
        .resolvePlatformSpecificImplementation<
          AndroidFlutterLocalNotificationsPlugin
        >();
    return await androidPlugin?.canScheduleExactNotifications() ?? false;
  }

  static Future<void> showTestNotification() async {
    if (!_supportsNotifications) {
      throw UnsupportedError('Thông báo cục bộ hiện chỉ hỗ trợ Android.');
    }
    await initialize();
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
      id: _testNotificationId,
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
    if (id < 0 || id > 2147483647 || id == _testNotificationId) {
      throw ArgumentError.value(
        id,
        'id',
        'ID không hợp lệ hoặc dành cho kiểm tra.',
      );
    }
    if (hour < 0 || hour > 23 || minute < 0 || minute > 59) {
      throw ArgumentError('Giờ nhắc phải nằm trong 00:00–23:59.');
    }
    if (medicineName.trim().isEmpty) {
      throw ArgumentError('Tên thuốc không được để trống.');
    }
    if (!_supportsNotifications) {
      throw UnsupportedError('Nhắc thuốc cục bộ hiện chỉ hỗ trợ Android.');
    }
    await initialize();
    if (!await areNotificationsEnabled()) {
      throw StateError('Hãy cấp quyền thông báo trước khi bật nhắc thuốc.');
    }
    final exact = await canScheduleExactNotifications();
    final now = tz.TZDateTime.now(tz.local);

    var scheduledDate = tz.TZDateTime(
      tz.local,
      now.year,
      now.month,
      now.day,
      hour,
      minute,
    );

    if (!scheduledDate.isAfter(now)) {
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
      androidScheduleMode: exact
          ? AndroidScheduleMode.exactAllowWhileIdle
          : AndroidScheduleMode.inexactAllowWhileIdle,
      matchDateTimeComponents: DateTimeComponents.time,
      payload: 'medication:$id',
    );
  }

  static Future<void> cancelMedicationReminders() async {
    if (pendingPayload.value?.startsWith('medication:') == true) {
      pendingPayload.value = null;
    }
    if (!_supportsNotifications) return;
    await initialize();
    final pending = await _notificationsPlugin.pendingNotificationRequests();
    for (final request in pending) {
      if (request.payload?.startsWith('medication:') == true &&
          request.payload != 'medication:test') {
        await _notificationsPlugin.cancel(id: request.id);
      }
    }
  }

  static Future<void> cancelNotification(int id) async {
    if (!_supportsNotifications) return;
    await initialize();
    await _notificationsPlugin.cancel(id: id);
  }

  static Future<void> cancelAll() async {
    pendingPayload.value = null;
    if (!_supportsNotifications) return;
    await initialize();
    await _notificationsPlugin.cancelAll();
  }
}
