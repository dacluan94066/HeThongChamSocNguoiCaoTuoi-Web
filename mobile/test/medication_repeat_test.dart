import 'dart:async';
import 'package:elderly_care_app/services/api_client.dart';
import 'package:elderly_care_app/services/local_notification_service.dart';
import 'package:elderly_care_app/utils/medication_status_display.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:flutter_test/flutter_test.dart';
import 'support/notification_platform_fake.dart';

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();
  late NotificationPlatformFake platform;
  setUp(() async {
    platform = NotificationPlatformFake()..install();
    FlutterSecureStorage.setMockInitialValues({});
    await ApiClient.clearSession();
  });
  Map<String, dynamic> dose({
    int id = 42,
    DateTime? at,
    String status = 'ChuaDenGio',
  }) => {
    'id': id,
    'tenThuoc': 'THUỐC KIỂM THỬ',
    'lieuDung': 'LIỀU KIỂM THỬ',
    'trangThai': status,
    'thoiGianDuKien': (at ?? DateTime.now().add(const Duration(days: 1)))
        .toIso8601String(),
  };
  Future<void> sync(
    List<Map<String, dynamic>> rows, {
    bool Function()? current,
  }) => LocalNotificationService.syncMedicationReminders(
    owner: '1',
    schedule: rows,
    isCurrent: current ?? () => true,
  );

  test(
    '12 unique one-shots at due, +5 ... +55; never endless or automatic confirmation',
    () async {
      await sync([dose()]);
      expect(platform.scheduled, hasLength(12));
      final ids = platform.scheduled.map((r) => r['id']).toSet();
      expect(ids, hasLength(12));
      final times = platform.scheduled
          .map((r) => DateTime.parse(r['scheduledDateTime'] as String))
          .toList();
      for (var i = 1; i < times.length; i++) {
        expect(times[i].difference(times[i - 1]), const Duration(minutes: 5));
        expect(
          platform.scheduled[i]['payload'].toString(),
          endsWith(':repeat:${i * 5}'),
        );
        expect(platform.scheduled[i]['body'], contains('không uống thêm'));
      }
      expect(times.last.difference(times.first), const Duration(minutes: 55));
      expect(
        platform.scheduled.every(
          (r) => !r.containsKey('matchDateTimeComponents'),
        ),
        isTrue,
      );
    },
  );

  test(
    'late synchronization schedules only remaining future five-minute slots',
    () async {
      await sync([
        dose(at: DateTime.now().subtract(const Duration(minutes: 12))),
      ]);
      expect(platform.scheduled, hasLength(9)); // +15,20,...55
      expect(
        platform.scheduled.first['payload'].toString(),
        endsWith(':repeat:15'),
      );
      expect(
        platform.scheduled.last['payload'].toString(),
        endsWith(':repeat:55'),
      );
    },
  );

  test(
    'no reminders after cutoff; do not infer BoLo or send a past reminder burst',
    () async {
      await sync([
        dose(at: DateTime.now().subtract(const Duration(minutes: 61))),
      ]);
      expect(platform.scheduled, isEmpty);
      final now = DateTime.now();
      expect(
        medicationStatusLabel(
          'ChuaDenGio',
          now.subtract(const Duration(hours: 2)),
          now: now,
        ),
        'Chưa xác nhận uống',
      );
    },
  );

  for (final status in ['DaUong', 'BoLo', 'TuChoi']) {
    test(
      '$status from API removes all retries including already displayed reminders',
      () async {
        final first = dose();
        await sync([first]);
        final retry = Map<String, dynamic>.from(platform.scheduled[1]);
        final payload = retry['payload'] as String;
        final tag = payload.split(':repeat:').first;
        platform.active[retry['id'] as int] = {
          'id': retry['id'],
          'tag': tag,
          'channelId': LocalNotificationService.medicationChannel.id,
        };
        platform.pending.remove(
          retry['id'],
        ); // Android already delivered this one.
        await sync([
          {...first, 'trangThai': status},
        ]);
        expect(platform.pending, isEmpty);
        expect(platform.active, isEmpty);
        expect(
          platform.cancelledRequests.any(
            (r) => r['id'] == retry['id'] && r['tag'] == tag,
          ),
          isTrue,
        );
      },
    );
  }

  test(
    'confirmation cancels only its dose, not another dose or appointment',
    () async {
      await sync([dose(id: 42), dose(id: 43)]);
      platform.pending[-1] = {'id': -1, 'payload': 'appointment:1:9'};
      await LocalNotificationService.cancelMedicationDoseReminders(
        42,
        isCurrent: () => true,
      );
      expect(
        platform.pending.values.where(
          (r) => r['payload'].toString().startsWith('medication:1:42:'),
        ),
        isEmpty,
      );
      expect(
        platform.pending.values.where(
          (r) => r['payload'].toString().startsWith('medication:1:43:'),
        ),
        hasLength(12),
      );
      expect(platform.pending[-1], isNotNull);
    },
  );

  test(
    'refresh is idempotent and retry IDs cannot overwrite other scheduled IDs',
    () async {
      final rows = [dose(id: 42), dose(id: 43)];
      platform.pending[2147483646] = {
        'id': 2147483646,
        'payload': 'appointment:1:9',
      };
      await sync(rows);
      expect(platform.scheduled.map((r) => r['id']).toSet(), hasLength(24));
      expect(platform.scheduled.any((r) => r['id'] == 2147483646), isFalse);
      await sync(rows);
      expect(platform.scheduled, hasLength(24));
      expect(platform.pending[2147483646]?['payload'], 'appointment:1:9');
    },
  );

  test(
    'logout and stale-session callbacks cannot restore or cancel new-session reminders',
    () async {
      final first = dose();
      await sync([first]);
      await LocalNotificationService.cancelMedicationDoseReminders(
        42,
        isCurrent: () => false,
      );
      expect(platform.pending, hasLength(12));
      await LocalNotificationService.cancelMedicationReminders();
      expect(platform.pending, isEmpty);
      await sync([first], current: () => false);
      expect(platform.pending, isEmpty);
    },
  );

  test(
    'logout during scheduling serializes cleanup and stops the remaining slots',
    () async {
      platform.holdSchedule = Completer<void>();
      platform.scheduleStarted = Completer<void>();
      final pending = sync([dose()]);
      await platform.scheduleStarted!.future;
      final logout = LocalNotificationService.cancelMedicationReminders();
      platform.holdSchedule!.complete();
      await Future.wait([pending, logout]);
      expect(platform.pending, isEmpty);
      expect(platform.scheduled, hasLength(1));
    },
  );

  test(
    'permission denied clears retries; inexact fallback keeps finite five-minute plans',
    () async {
      platform.exact = false;
      final first = dose();
      await sync([first]);
      expect(platform.scheduled, hasLength(12));
      platform.enabled = false;
      await sync([first]);
      expect(platform.pending, isEmpty);
    },
  );

  test(
    'labels change at due time, but only API terminal states may say Bỏ lỡ',
    () {
      final now = DateTime(2026, 10, 22, 22, 36);
      expect(
        medicationStatusLabel(
          'ChuaDenGio',
          now.add(const Duration(minutes: 1)),
          now: now,
        ),
        'Chưa đến giờ',
      );
      expect(
        medicationStatusLabel('ChuaDenGio', now, now: now),
        'Chưa xác nhận uống',
      );
      expect(
        medicationStatusLabel(
          'ChuaDenGio',
          now.subtract(const Duration(minutes: 56)),
          now: now,
        ),
        'Chưa xác nhận uống',
      );
      expect(
        medicationStatusLabel('ChuaDenGio', 'invalid', now: now),
        'Chưa xác nhận uống',
      );
      expect(medicationStatusLabel('BoLo', now, now: now), 'Bỏ lỡ');
      expect(medicationStatusLabel('DaUong', now, now: now), 'Đã uống');
      expect(medicationStatusLabel('TuChoi', now, now: now), 'Từ chối');
    },
  );
}
