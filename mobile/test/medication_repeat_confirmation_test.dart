import 'dart:async';
import 'dart:convert';
import 'dart:typed_data';
import 'package:dio/dio.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:elderly_care_app/services/api_client.dart';
import 'package:elderly_care_app/services/local_notification_service.dart';
import 'package:elderly_care_app/services/medication_schedule_service.dart';
import 'package:flutter_test/flutter_test.dart';
import 'medication_dashboard_ui_test.dart'
    show MedicationUiAdapter, MedicationUiFixture;

class _StaleMedicationAdapter extends MedicationUiAdapter {
  final captured = Completer<void>();
  final release = Completer<void>();
  @override
  Future<ResponseBody> fetch(
    RequestOptions options,
    Stream<Uint8List>? stream,
    Future<void>? cancel,
  ) async {
    final response = await super.fetch(options, stream, cancel);
    if (options.method == 'GET' &&
        options.path == '/elderly/me/medication-schedule') {
      captured.complete();
      await release.future;
    }
    return response;
  }
}

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();
  late MedicationUiAdapter adapter;
  late MedicationUiFixture fixture;
  setUp(() async {
    adapter = MedicationUiAdapter();
    fixture = MedicationUiFixture(adapter);
    await fixture.install();
    await LocalNotificationService.syncMedicationReminders(
      owner: 'fixture',
      schedule: [
        {
          'id': 2,
          'trangThai': 'ChuaDenGio',
          'tenThuoc': 'KIỂM THỬ',
          'thoiGianDuKien': DateTime.now()
              .add(const Duration(hours: 1))
              .toIso8601String(),
        },
      ],
      isCurrent: () => true,
    );
  });
  tearDown(() => fixture.dispose());
  test(
    'late pre-confirmation GET cannot restore retries after successful confirmation',
    () async {
      final stale = _StaleMedicationAdapter()
        ..custom = [
          {
            'id': 2,
            'tenThuoc': 'KIỂM THỬ',
            'trangThai': 'ChuaDenGio',
            'thoiGianDuKien': DateTime.now()
                .add(const Duration(hours: 1))
                .toIso8601String(),
          },
        ];
      ApiClient.instance.dio.httpClientAdapter = stale;
      FlutterSecureStorage.setMockInitialValues({
        ApiClient.userKey: jsonEncode({
          'userId': 'fixture',
          'tenVaiTro': 'NguoiCaoTuoi',
        }),
      });
      final refresh = MedicationScheduleService.instance.syncUpcomingReminders(
        refresh: true,
      );
      await stale.captured.future;
      stale.custom = null;
      await MedicationScheduleService.instance.confirmMedication(2, 'DaUong');
      expect(fixture.notifications.pending, isEmpty);
      stale.release.complete();
      await refresh;
      expect(fixture.notifications.pending, isEmpty);
    },
  );
  test(
    'confirmation service used by both Home and Medication cancels all 12 reminders',
    () async {
      expect(fixture.notifications.pending, hasLength(12));
      await MedicationScheduleService.instance.confirmMedication(2, 'DaUong');
      expect(adapter.confirmations, hasLength(1));
      expect(fixture.notifications.pending, isEmpty);
    },
  );
  test(
    'failed or unauthorized confirmation retains all reminder slots',
    () async {
      adapter.deniedStatus = 403;
      await expectLater(
        MedicationScheduleService.instance.confirmMedication(2, 'DaUong'),
        throwsA(isA<ApiException>()),
      );
      expect(fixture.notifications.pending, hasLength(12));
    },
  );
}
