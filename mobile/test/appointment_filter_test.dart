import 'package:elderly_care_app/services/appointment_service.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  test('all appointment tabs filter from the same latest list', () {
    final latest = <Map<String, dynamic>>[
      {'id': 10, 'trangThai': 'DaKham', 'ketQuaKham': 'Ổn định'},
      {'id': 11, 'trangThai': 'ChuaDen'},
      {'id': 12, 'trangThai': 'Huy'},
      {'id': 13, 'trangThai': 'DaDoiLich'},
    ];

    final all = AppointmentService.filterByStatus(latest, null);
    final upcoming = AppointmentService.filterByStatus(latest, 'ChuaDen');
    final completed = AppointmentService.filterByStatus(latest, 'DaKham');
    final cancelled = AppointmentService.filterByStatus(latest, 'Huy');
    final rescheduled = AppointmentService.filterByStatus(latest, 'DaDoiLich');

    expect(all.singleWhere((item) => item['id'] == 10)['trangThai'], 'DaKham');
    expect(upcoming.any((item) => item['id'] == 10), isFalse);
    expect(completed.single['id'], 10);
    expect(completed.single['ketQuaKham'], 'Ổn định');
    expect(cancelled.single['id'], 12);
    expect(rescheduled.single['id'], 13);
  });

  test('all tabs immediately reflect a refreshed shared list', () {
    final beforeRefresh = <Map<String, dynamic>>[
      {'id': 20, 'trangThai': 'ChuaDen'},
    ];
    final afterRefresh = <Map<String, dynamic>>[
      {'id': 20, 'trangThai': 'DaKham', 'ketQuaKham': 'Đã tái khám'},
    ];

    expect(
      AppointmentService.filterByStatus(beforeRefresh, 'ChuaDen'),
      hasLength(1),
    );
    expect(AppointmentService.filterByStatus(afterRefresh, 'ChuaDen'), isEmpty);
    expect(
      AppointmentService.filterByStatus(afterRefresh, 'DaKham').single['id'],
      20,
    );
  });
}
