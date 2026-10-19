import 'package:flutter/foundation.dart';
import 'package:flutter_local_notifications/flutter_local_notifications.dart';
import 'package:timezone/data/latest.dart' as tz;
import 'package:timezone/timezone.dart' as tz;
import 'appointment_reminder_plan.dart';

enum AppointmentReminderState { loading, ready, approximate, denied, error }

class LocalNotificationService {
  static final appointmentState = ValueNotifier(
    AppointmentReminderState.loading,
  );
  static Future<void> _appointmentQueue = Future.value();
  static int _appointmentEpoch = 0;
  static Future<void> _medicationQueue = Future.value();
  static int _medicationEpoch = 0;
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

  static const appointmentChannel = AndroidNotificationChannel(
    'appointment_reminder_channel',
    'Nhắc lịch khám',
    description: 'Nhắc trước lịch khám 24 giờ và 2 giờ',
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
    await androidPlugin?.createNotificationChannel(appointmentChannel);
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

  static Future<void> _queueMedications(Future<void> Function() action) {
    final operation = _medicationQueue.then((_) => action());
    _medicationQueue = operation.then<void>((_) {}, onError: (Object _) {});
    return operation;
  }

  /// Reconcile individual doses, not a repeating daily alarm. This prevents
  /// reminders from continuing after a prescription ends or a dose is taken.
  static Future<void> syncMedicationReminders({
    required String owner,
    required List<Map<String, dynamic>> schedule,
    required bool Function() isCurrent,
  }) {
    final epoch = ++_medicationEpoch;
    bool valid() => epoch == _medicationEpoch && isCurrent();
    return _queueMedications(() async {
      if (!_supportsNotifications || !valid()) return;
      await initialize();
      final enabled = await areNotificationsEnabled();
      final exact = enabled && await canScheduleExactNotifications();
      if (!valid()) return;

      final now = DateTime.now();
      final wanted = <String, ({int id, DateTime at, String name})>{};
      if (enabled) {
        for (final item in schedule) {
          if (item['trangThai'] != 'ChuaDenGio') continue;
          final rawId = int.tryParse(item['id']?.toString() ?? '');
          final parsed = DateTime.tryParse(
            item['thoiGianDuKien']?.toString() ?? '',
          );
          if (rawId == null || parsed == null) continue;
          // SQL timestamps without an offset are Vietnam wall-clock time.
          final at = parsed.isUtc
              ? tz.TZDateTime.from(parsed, tz.local)
              : tz.TZDateTime(
                  tz.local, parsed.year, parsed.month, parsed.day,
                  parsed.hour, parsed.minute, parsed.second,
                );
          if (!at.isAfter(now)) continue;
          final id = 100000 + rawId;
          if (id < 0 || id >= _testNotificationId) continue;
          final name = [item['tenThuoc'], item['lieuDung']]
              .map((value) => value?.toString().trim() ?? '')
              .where((value) => value.isNotEmpty)
              .join(' - ');
          final payload = 'medication:$owner:$rawId:${at.toIso8601String()}';
          wanted[payload] = (
            id: id,
            at: at,
            name: name.isEmpty ? 'thuốc của bạn' : name,
          );
        }
      }

      final pending = await _notificationsPlugin.pendingNotificationRequests();
      final retained = <String>{};
      for (final request in pending) {
        if (!valid()) return;
        final payload = request.payload;
        if (payload?.startsWith('medication:') != true ||
            payload == 'medication:test') {
          continue;
        }
        if (wanted.containsKey(payload) && retained.add(payload!)) continue;
        await _notificationsPlugin.cancel(id: request.id);
      }
      for (final entry in wanted.entries) {
        if (!valid()) return;
        if (retained.contains(entry.key) ||
            !entry.value.at.isAfter(DateTime.now())) {
          continue;
        }
        await _notificationsPlugin.zonedSchedule(
          id: entry.value.id,
          title: 'Đến giờ uống thuốc',
          body: 'Đã đến giờ uống ${entry.value.name}.',
          scheduledDate: tz.TZDateTime.from(entry.value.at, tz.local),
          notificationDetails: const NotificationDetails(
            android: AndroidNotificationDetails(
              'medication_reminder_channel',
              'Nhắc uống thuốc',
              channelDescription:
                  'Thông báo nhắc người dùng uống thuốc đúng giờ',
              importance: Importance.high,
              priority: Priority.high,
              icon: '@mipmap/ic_launcher',
            ),
          ),
          androidScheduleMode: exact
              ? AndroidScheduleMode.exactAllowWhileIdle
              : AndroidScheduleMode.inexactAllowWhileIdle,
          payload: entry.key,
        );
      }
    });
  }

  static Future<void> cancelMedicationReminders() {
    _medicationEpoch++;
    if (pendingPayload.value?.startsWith('medication:') == true) {
      pendingPayload.value = null;
    }
    return _queueMedications(() async {
      if (!_supportsNotifications) return;
      await initialize();
      final pending = await _notificationsPlugin.pendingNotificationRequests();
      for (final request in pending) {
        if (request.payload?.startsWith('medication:') == true &&
            request.payload != 'medication:test') {
          await _notificationsPlugin.cancel(id: request.id);
        }
      }
    });
  }

  static Future<void> cancelNotification(int id) async {
    if (!_supportsNotifications) return;
    await initialize();
    await _notificationsPlugin.cancel(id: id);
  }

  static Future<void> _queueAppointments(Future<void> Function() action) {
    final operation = _appointmentQueue.then((_) => action());
    _appointmentQueue = operation.then<void>((_) {}, onError: (Object _) {});
    return operation;
  }

  /// Serialized with logout so a late API response cannot restore old alarms.
  static Future<void> syncAppointmentReminders({
    required String owner,
    required List<Map<String, dynamic>> appointments,
    required bool Function() isCurrent,
  }) {
    final epoch = _appointmentEpoch;
    bool valid() => epoch == _appointmentEpoch && isCurrent();
    return _queueAppointments(() async {
      if (!supportsNotifications || !valid()) return;
      await initialize();
      final enabled = await areNotificationsEnabled();
      final exact = await canScheduleExactNotifications();
      if (!valid()) return;
      final plans = enabled
          ? AppointmentReminderPlan.build(appointments, now: DateTime.now())
          : <AppointmentReminderPlan>[];
      final wanted = {
        for (final plan in plans) plan.payload(owner, exact): plan,
      };
      final pending = await _notificationsPlugin.pendingNotificationRequests();
      final retained = <String>{};
      final usedIds = pending.map((p) => p.id).toSet();
      for (final request in pending) {
        if (!valid()) return;
        final payload = request.payload;
        if (payload?.startsWith('appointment:') != true) continue;
        if (wanted.containsKey(payload) && retained.add(payload!)) continue;
        await _notificationsPlugin.cancel(id: request.id);
      }
      var id = -1; // Medication notifications use non-negative IDs.
      for (final entry in wanted.entries) {
        if (!valid()) return;
        if (retained.contains(entry.key)) continue;
        if (!entry.value.fireAt.isAfter(DateTime.now())) continue;
        while (usedIds.contains(id)) {
          id--;
        }
        usedIds.add(id);
        await _notificationsPlugin.zonedSchedule(
          id: id--,
          title: 'Nhắc lịch khám — trước ${entry.value.hoursBefore} giờ',
          body: entry.value.body,
          scheduledDate: entry.value.fireAt,
          notificationDetails: const NotificationDetails(
            android: AndroidNotificationDetails(
              'appointment_reminder_channel',
              'Nhắc lịch khám',
              channelDescription: 'Nhắc trước lịch khám 24 giờ và 2 giờ',
              importance: Importance.high,
              priority: Priority.high,
            ),
          ),
          androidScheduleMode: exact
              ? AndroidScheduleMode.exactAllowWhileIdle
              : AndroidScheduleMode.inexactAllowWhileIdle,
          payload: entry.key,
        );
      }
      if (valid()) {
        appointmentState.value = !enabled
            ? AppointmentReminderState.denied
            : exact
            ? AppointmentReminderState.ready
            : AppointmentReminderState.approximate;
      }
    });
  }

  static Future<void> cancelAppointmentReminders() {
    _appointmentEpoch++;
    appointmentState.value = AppointmentReminderState.loading;
    if (pendingPayload.value?.startsWith('appointment:') == true) {
      pendingPayload.value = null;
    }
    return _queueAppointments(() async {
      if (!supportsNotifications) return;
      await initialize();
      final pending = await _notificationsPlugin.pendingNotificationRequests();
      for (final request in pending) {
        if (request.payload?.startsWith('appointment:') == true) {
          await _notificationsPlugin.cancel(id: request.id);
        }
      }
      // Also remove already-delivered personal reminders from the tray on logout.
      final active = await _notificationsPlugin.getActiveNotifications();
      for (final notification in active) {
        if (notification.channelId == appointmentChannel.id &&
            notification.id != null) {
          await _notificationsPlugin.cancel(id: notification.id!);
        }
      }
    });
  }

  static Future<void> cancelAll() async {
    pendingPayload.value = null;
    if (!_supportsNotifications) return;
    await initialize();
    await _notificationsPlugin.cancelAll();
  }
}
