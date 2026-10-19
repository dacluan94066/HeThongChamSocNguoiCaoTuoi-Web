import 'dart:convert';

import 'package:elderly_care_app/services/api_client.dart';
import 'package:elderly_care_app/services/local_notification_service.dart';
import 'package:elderly_care_app/widgets/appointment_reminder_scope.dart';
import 'package:flutter/material.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:flutter_test/flutter_test.dart';

import 'support/notification_platform_fake.dart';

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();
  late NotificationPlatformFake platform;

  Map<String, dynamic> dose({DateTime? at, String status = 'ChuaDenGio'}) => {
    'id': 42,
    'trangThai': status,
    'tenThuoc': 'Thuốc kiểm thử',
    'lieuDung': '1 viên',
    'thoiGianDuKien': (at ?? DateTime.now().add(const Duration(days: 1)))
        .toIso8601String(),
  };

  Future<void> sync(List<Map<String, dynamic>> items, {String owner = '1'}) =>
      LocalNotificationService.syncMedicationReminders(
        owner: owner,
        schedule: items,
        isCurrent: () => true,
      );

  setUp(() async {
    platform = NotificationPlatformFake()..install();
    FlutterSecureStorage.setMockInitialValues({});
    await ApiClient.clearSession();
  });

  test(
    'Each dose is one-shot; refresh, status change, and reschedule reconcile alarms',
    () async {
      final first = dose();
      await sync([first]);
      expect(platform.scheduled, hasLength(1));
      expect(
        platform.scheduled.single.containsKey('matchDateTimeComponents'),
        isFalse,
      );
      expect(platform.scheduled.single['id'], 100042);
      await sync([first]);
      expect(platform.scheduled, hasLength(1));

      await sync([dose(at: DateTime.now().add(const Duration(days: 2)))]);
      expect(platform.scheduled, hasLength(2));
      expect(platform.cancelled, contains(100042));

      await sync([dose(status: 'DaUong')]);
      expect(platform.pending, isEmpty);
    },
  );

  test(
    'Another account cannot retain old alarms; denied permission clears them',
    () async {
      final data = [dose()];
      await sync(data);
      await sync(data, owner: '2');
      expect(
        platform.pending.values.single['payload'].toString(),
        startsWith('medication:2:'),
      );
      platform.enabled = false;
      await sync(data, owner: '2');
      expect(platform.pending, isEmpty);
    },
  );

  testWidgets('Tapping a medication reminder opens only its owner schedule', (
    tester,
  ) async {
    FlutterSecureStorage.setMockInitialValues({
      ApiClient.userKey: jsonEncode({'userId': 1, 'tenVaiTro': 'NguoiCaoTuoi'}),
    });
    LocalNotificationService.pendingPayload.value =
        'medication:1:42:2026-10-20T09:00:00';
    await tester.pumpWidget(
      MaterialApp(
        navigatorKey: ApiClient.navigatorKey,
        home: const AppointmentReminderScope(
          child: Scaffold(body: Text('Home')),
        ),
        routes: {
          '/medications': (_) =>
              const Scaffold(body: Text('Medication destination')),
        },
      ),
    );
    await tester.pumpAndSettle();
    expect(find.text('Medication destination'), findsOneWidget);
    ApiClient.navigatorKey.currentState!.pop();
    await tester.pumpAndSettle();
    LocalNotificationService.pendingPayload.value =
        'medication:2:42:2026-10-20T09:00:00';
    await tester.pumpAndSettle();
    expect(find.text('Medication destination'), findsNothing);
    await tester.pumpWidget(const SizedBox.shrink());
  });
}
