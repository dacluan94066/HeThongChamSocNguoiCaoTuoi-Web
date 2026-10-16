import 'dart:async';
import 'dart:convert';
import 'package:flutter/material.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:timezone/data/latest.dart' as tzdata;
import 'package:timezone/timezone.dart' as tz;
import 'package:elderly_care_app/services/api_client.dart';
import 'package:elderly_care_app/services/appointment_reminder_plan.dart';
import 'package:elderly_care_app/services/local_notification_service.dart';
import 'package:elderly_care_app/widgets/appointment_reminder_scope.dart';
import 'package:elderly_care_app/widgets/appointment_reminder_banner.dart';
import 'support/notification_platform_fake.dart';

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();
  tzdata.initializeTimeZones();
  final vn = tz.getLocation('Asia/Ho_Chi_Minh');
  late NotificationPlatformFake platform;

  Map<String, dynamic> appointment({
    String status = 'ChuaDen',
    DateTime? time,
  }) => {
    'id': 42,
    'tenBenhVien': 'Bệnh viện kiểm thử',
    'trangThai': status,
    'thoiGianKham':
        (time ?? DateTime.now().toUtc().add(const Duration(days: 3)))
            .toIso8601String(),
  };

  setUp(() async {
    platform = NotificationPlatformFake()..install();
    FlutterSecureStorage.setMockInitialValues({});
    await ApiClient.clearSession();
  });

  test('Vietnam wall time: exactly 24h and 2h, no daily repeat', () {
    final plans = AppointmentReminderPlan.build([
      {...appointment(), 'thoiGianKham': '2026-10-20T15:00:00'},
    ], now: tz.TZDateTime(vn, 2026, 10, 18));
    expect(plans.map((p) => p.hoursBefore), [24, 2]);
    expect(plans[0].fireAt, tz.TZDateTime(vn, 2026, 10, 19, 15));
    expect(plans[1].fireAt, tz.TZDateTime(vn, 2026, 10, 20, 13));
    expect(plans[0].body, contains('15:00 ngày 20/10/2026'));
  });

  test('Explicit UTC and offset timestamps map to the same Vietnam time', () {
    for (final stamp in ['2026-10-20T08:00:00Z', '2026-10-20T15:00:00+07:00']) {
      final plans = AppointmentReminderPlan.build([
        {...appointment(), 'thoiGianKham': stamp},
      ], now: tz.TZDateTime(vn, 2026, 10, 18));
      expect(plans.first.appointmentTime.hour, 15);
    }
  });

  test('Skip elapsed reminders and all non-upcoming statuses', () {
    final now = DateTime.now().toUtc();
    expect(
      AppointmentReminderPlan.build([
        appointment(time: now.add(const Duration(hours: 3))),
      ], now: now).map((p) => p.hoursBefore),
      [2],
    );
    expect(
      AppointmentReminderPlan.build([
        appointment(time: now.add(const Duration(hours: 2))),
        for (final status in ['Huy', 'DaKham', 'DaDoiLich'])
          appointment(status: status),
        {...appointment(), 'thoiGianKham': 'invalid'},
      ], now: now),
      isEmpty,
    );
  });

  Future<void> sync(List<Map<String, dynamic>> data, {String owner = '1'}) =>
      LocalNotificationService.syncAppointmentReminders(
        owner: owner,
        appointments: data,
        isCurrent: () => true,
      );

  test(
    'Repeated refresh does not duplicate; change/cancel reconciles only appointment alarms',
    () async {
      platform.pending[100001] = {'id': 100001, 'payload': 'medication:100001'};
      final data = [appointment()];
      await sync(data);
      expect(platform.scheduled, hasLength(2));
      expect(
        platform.scheduled.every(
          (p) => !p.containsKey('matchDateTimeComponents'),
        ),
        isTrue,
      );
      expect(platform.scheduled.every((p) => (p['id'] as int) < 0), isTrue);
      await sync(data);
      expect(platform.scheduled, hasLength(2));
      await sync([
        appointment(time: DateTime.now().toUtc().add(const Duration(days: 4))),
      ]);
      expect(platform.scheduled, hasLength(4));
      expect(platform.cancelled, hasLength(2));
      await sync([appointment(status: 'Huy')]);
      expect(platform.pending.keys, [100001]);
    },
  );

  test(
    'Empty full schedule removes reminders, another owner never retains old payload',
    () async {
      final data = [appointment()];
      await sync(data);
      await sync(data, owner: '2');
      expect(
        platform.pending.values.every(
          (p) => p['payload'].toString().startsWith('appointment:2:'),
        ),
        isTrue,
      );
      await sync([]);
      expect(platform.pending, isEmpty);
    },
  );

  test(
    'Permission denied cancels alarms; no exact permission uses inexact mode',
    () async {
      await sync([appointment()]);
      platform.enabled = false;
      await sync([appointment()]);
      expect(platform.pending, isEmpty);
      expect(
        LocalNotificationService.appointmentState.value,
        AppointmentReminderState.denied,
      );
      platform.enabled = true;
      platform.exact = false;
      await sync([appointment()]);
      expect(
        LocalNotificationService.appointmentState.value,
        AppointmentReminderState.approximate,
      );
      expect(
        platform.scheduled.last['platformSpecifics']['scheduleMode'],
        'inexactAllowWhileIdle',
      );
    },
  );

  test(
    'Logout during native scheduling cancels the late alarm and blocks queued stale work',
    () async {
      platform.holdSchedule = Completer<void>();
      platform.scheduleStarted = Completer<void>();
      final first = sync([appointment()]);
      await platform.scheduleStarted!.future;
      final queued = sync([appointment()]);
      final logout = ApiClient.clearSession();
      platform.holdSchedule!.complete();
      await Future.wait([first, queued, logout]);
      expect(platform.pending, isEmpty);
      expect(platform.scheduled, hasLength(1));
    },
  );

  for (final cold in [true, false]) {
    testWidgets(
      'Notification tap opens appointments (cold=$cold) only for matching owner',
      (tester) async {
        FlutterSecureStorage.setMockInitialValues({
          ApiClient.userKey: jsonEncode({
            'userId': 1,
            'tenVaiTro': 'NguoiCaoTuoi',
          }),
        });
        if (cold) {
          LocalNotificationService.pendingPayload.value =
              'appointment:1:42:2:test';
        }
        await tester.pumpWidget(
          MaterialApp(
            navigatorKey: ApiClient.navigatorKey,
            home: const AppointmentReminderScope(
              child: Scaffold(body: Text('Home')),
            ),
            routes: {
              '/appointments': (_) =>
                  const Scaffold(body: Text('Appointment destination')),
            },
          ),
        );
        if (!cold) {
          LocalNotificationService.pendingPayload.value =
              'appointment:1:42:2:test';
        }
        await tester.pumpAndSettle();
        expect(find.text('Appointment destination'), findsOneWidget);
        expect(LocalNotificationService.pendingPayload.value, isNull);
        ApiClient.navigatorKey.currentState!.pop();
        await tester.pumpAndSettle();
        LocalNotificationService.pendingPayload.value =
            'appointment:2:42:2:test';
        await tester.pumpAndSettle();
        expect(find.text('Appointment destination'), findsNothing);
        await tester.pumpWidget(const SizedBox.shrink());
      },
    );
  }

  testWidgets(
    'Android notification permission has explanation and supports denial',
    (tester) async {
      platform.enabled = false;
      LocalNotificationService.appointmentState.value =
          AppointmentReminderState.denied;
      await tester.pumpWidget(
        const MaterialApp(home: Scaffold(body: AppointmentReminderBanner())),
      );
      await tester.tap(find.text('Bật nhắc lịch khám'));
      await tester.pumpAndSettle();
      expect(find.text('Cho phép nhắc lịch khám?'), findsOneWidget);
      await tester.tap(find.text('Cho phép'));
      await tester.pumpAndSettle();
      expect(
        LocalNotificationService.appointmentState.value,
        AppointmentReminderState.denied,
      );
      expect(tester.takeException(), isNull);
      await tester.pumpWidget(const SizedBox.shrink());
    },
  );
}
