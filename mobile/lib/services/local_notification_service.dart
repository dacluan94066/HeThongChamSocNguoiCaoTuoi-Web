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
  static Future<void>? _medicationQueue;
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
    final previous = _medicationQueue;
    final operation = previous == null
        ? Future<void>.sync(action)
        : previous.then((_) => action());
    late final Future<void> tail;
    void clearIdleQueue() {
      if (identical(_medicationQueue, tail)) _medicationQueue = null;
    }

    tail = operation.then<void>(
      (_) => clearIdleQueue(),
      onError: (Object _) => clearIdleQueue(),
    );
    _medicationQueue = tail;
    return operation;
  }

  /// Finite one-shot alarms: due time, then every five minutes within the
  /// existing 60-minute missed-dose window. Never an endless daily alarm.
  /// Terminal API statuses always stop the entire dose's remaining reminders.
  static const medicationRetryInterval = Duration(minutes: 5);
  static const medicationRetryWindow = Duration(minutes: 60);

  static String? _medicationRetryTag(String? payload) {
    final marker = payload?.indexOf(':repeat:') ?? -1;
    return marker < 0 ? null : payload!.substring(0, marker);
  }

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
      final wanted =
          <
            String,
            ({int id, DateTime at, String name, String? tag, bool repeat})
          >{};
      final keepDoseTags = <String>{};
      final keepOriginalIds = <int>{};
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
                  tz.local,
                  parsed.year,
                  parsed.month,
                  parsed.day,
                  parsed.hour,
                  parsed.minute,
                  parsed.second,
                );
          if (!at.add(medicationRetryWindow).isAfter(now)) continue;
          final id = 100000 + rawId;
          if (id < 0 || id >= _testNotificationId) continue;
          final name = [item['tenThuoc'], item['lieuDung']]
              .map((value) => value?.toString().trim() ?? '')
              .where((value) => value.isNotEmpty)
              .join(' - ');
          final doseTag = 'medication:$owner:$rawId:${at.toIso8601String()}';
          keepDoseTags.add(doseTag);
          keepOriginalIds.add(id);
          for (
            var minute = 0;
            minute < medicationRetryWindow.inMinutes;
            minute += medicationRetryInterval.inMinutes
          ) {
            final fireAt = at.add(Duration(minutes: minute));
            if (!fireAt.isAfter(now)) continue; // No burst of past reminders.
            final repeat = minute > 0;
            final payload = repeat ? '$doseTag:repeat:$minute' : doseTag;
            wanted[payload] = (
              id: repeat ? 0 : id,
              at: fireAt,
              name: name.isEmpty ? 'thuốc của bạn' : name,
              tag: repeat ? doseTag : null,
              repeat: repeat,
            );
          }
        }
      }

      final pending = await _notificationsPlugin.pendingNotificationRequests();
      final active = await _notificationsPlugin.getActiveNotifications();
      final usedIds = <int>{
        _testNotificationId,
        ...pending.map((p) => p.id),
        ...active.map((p) => p.id).whereType<int>(),
        ...keepOriginalIds,
      };
      var nextRetryId = _testNotificationId - 1;
      int allocateRetryId() {
        while (usedIds.contains(nextRetryId)) {
          nextRetryId--;
        }
        if (nextRetryId <= 0) {
          throw StateError('Không còn mã thông báo khả dụng.');
        }
        final id = nextRetryId--;
        usedIds.add(id);
        return id;
      }

      final retained = <String>{};
      for (final request in pending) {
        if (!valid()) return;
        final payload = request.payload;
        if (payload?.startsWith('medication:') != true ||
            payload == 'medication:test') {
          continue;
        }
        if (wanted.containsKey(payload) &&
            !(wanted[payload]!.repeat &&
                keepOriginalIds.contains(request.id)) &&
            retained.add(payload!)) {
          continue;
        }
        await _notificationsPlugin.cancel(
          id: request.id,
          tag: _medicationRetryTag(payload),
        );
      }
      // Also clear already displayed reminders for completed/cancelled/old doses.
      for (final notification in active) {
        if (!valid()) return;
        if (notification.channelId != medicationChannel.id ||
            notification.id == null ||
            notification.id == _testNotificationId) {
          continue;
        }
        final keep = notification.tag?.startsWith('medication:') == true
            ? keepDoseTags.contains(notification.tag)
            : keepOriginalIds.contains(notification.id);
        if (!keep) {
          await _notificationsPlugin.cancel(
            id: notification.id!,
            tag: notification.tag,
          );
        }
      }
      for (final entry in wanted.entries) {
        if (!valid()) return;
        if (retained.contains(entry.key) ||
            !entry.value.at.isAfter(DateTime.now())) {
          continue;
        }
        await _notificationsPlugin.zonedSchedule(
          id: entry.value.repeat ? allocateRetryId() : entry.value.id,
          title: entry.value.repeat
              ? 'Nhắc lại uống thuốc'
              : 'Đến giờ uống thuốc',
          body: entry.value.repeat
              ? 'Chưa có xác nhận uống ${entry.value.name}. Nếu đã uống, hãy xác nhận trong ứng dụng; không uống thêm chỉ vì lời nhắc.'
              : 'Đã đến giờ uống ${entry.value.name}.',
          scheduledDate: tz.TZDateTime.from(entry.value.at, tz.local),
          notificationDetails: NotificationDetails(
            android: AndroidNotificationDetails(
              'medication_reminder_channel',
              'Nhắc uống thuốc',
              channelDescription:
                  'Thông báo nhắc người dùng uống thuốc đúng giờ',
              tag: entry.value.tag,
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
          await _notificationsPlugin.cancel(
            id: request.id,
            tag: _medicationRetryTag(request.payload),
          );
        }
      }
      for (final notification
          in await _notificationsPlugin.getActiveNotifications()) {
        if (notification.id != null &&
            notification.id != _testNotificationId &&
            notification.channelId == medicationChannel.id) {
          await _notificationsPlugin.cancel(
            id: notification.id!,
            tag: notification.tag,
          );
        }
      }
    });
  }

  /// Cancel every pending retry and visible notification after API confirmation.
  static Future<void> cancelMedicationDoseReminders(
    int doseId, {
    required bool Function() isCurrent,
  }) {
    if (!isCurrent()) return Future.value();
    final epoch = ++_medicationEpoch;
    bool valid() => epoch == _medicationEpoch && isCurrent();
    bool matches(String? payload) =>
        payload?.startsWith('medication:') == true &&
        payload?.split(':').elementAtOrNull(2) == doseId.toString();
    return _queueMedications(() async {
      if (!_supportsNotifications || !valid()) return;
      await initialize();
      if (!valid()) return;
      await _notificationsPlugin.cancel(id: 100000 + doseId);
      for (final request
          in await _notificationsPlugin.pendingNotificationRequests()) {
        if (!valid()) return;
        if (matches(request.payload)) {
          await _notificationsPlugin.cancel(
            id: request.id,
            tag: _medicationRetryTag(request.payload),
          );
        }
      }
      for (final notification
          in await _notificationsPlugin.getActiveNotifications()) {
        if (!valid()) return;
        if (notification.id != null && matches(notification.tag)) {
          await _notificationsPlugin.cancel(
            id: notification.id!,
            tag: notification.tag,
          );
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
