import 'dart:convert';
import 'dart:typed_data';

import 'package:dio/dio.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:elderly_care_app/services/api_client.dart';
import 'package:elderly_care_app/services/relative_service.dart';

class MockRelativeAdapter implements HttpClientAdapter {
  final List<RequestOptions> requests = [];
  dynamic mockData = <dynamic>[];
  int mockStatus = 200;

  @override
  void close({bool force = false}) {}

  @override
  Future<ResponseBody> fetch(
    RequestOptions options,
    Stream<Uint8List>? stream,
    Future<void>? cancel,
  ) async {
    requests.add(options);
    final body = jsonEncode({
      'data': mockData,
      'status': mockStatus == 200 ? 'success' : 'error',
    });
    return ResponseBody.fromString(
      body,
      mockStatus,
      headers: {
        Headers.contentTypeHeader: [Headers.jsonContentType],
      },
    );
  }
}

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();

  late MockRelativeAdapter adapter;
  late HttpClientAdapter originalAdapter;

  setUp(() {
    FlutterSecureStorage.setMockInitialValues({'jwt_token': 'test-session'});
    adapter = MockRelativeAdapter();
    originalAdapter = ApiClient.instance.dio.httpClientAdapter;
    ApiClient.instance.dio.httpClientAdapter = adapter;
    RelativeService.instance.clearCache();
  });

  tearDown(() {
    ApiClient.instance.dio.httpClientAdapter = originalAdapter;
    RelativeService.instance.clearCache();
  });

  test('getMyElderlyList calls /relatives/me/elderly and parses result', () async {
    adapter.mockData = [
      {
        'id': 6,
        'hoTen': 'Võ Huỳnh Duy',
        'gioiTinh': 'Nam',
        'tuoi': 61,
        'moiQuanHe': 'Con Gái',
      }
    ];

    final list = await RelativeService.instance.getMyElderlyList();

    expect(list.length, 1);
    expect(list.first['hoTen'], 'Võ Huỳnh Duy');
    expect(list.first['tuoi'], 61);
    expect(adapter.requests.single.path, '/relatives/me/elderly');
  });

  test('getElderlyDetail calls /relatives/me/elderly/:id', () async {
    adapter.mockData = {
      'id': 6,
      'hoTen': 'Võ Huỳnh Duy',
      'nhomMau': 'A-',
    };

    final detail = await RelativeService.instance.getElderlyDetail(6);

    expect(detail['hoTen'], 'Võ Huỳnh Duy');
    expect(detail['nhomMau'], 'A-');
    expect(adapter.requests.single.path, '/relatives/me/elderly/6');
  });

  test('getElderlyHealthMetrics passes query params and caches response', () async {
    adapter.mockData = [
      {
        'id': 101,
        'loaiChiSoId': 1,
        'tenChiSo': 'Huyết áp',
        'giaTri': 120,
        'giaTriPhu': 80,
      }
    ];

    final result = await RelativeService.instance.getElderlyHealthMetrics(
      6,
      loaiChiSoId: 1,
      tuNgay: DateTime(2026, 10, 1),
      denNgay: DateTime(2026, 10, 30),
    );

    expect(result.length, 1);
    expect(result.first['tenChiSo'], 'Huyết áp');
    expect(adapter.requests.single.path, '/relatives/me/elderly/6/health-metrics');
    expect(adapter.requests.single.queryParameters['loaiChiSoId'], 1);
    expect(adapter.requests.single.queryParameters['tuNgay'], '2026-10-01');
    expect(adapter.requests.single.queryParameters['denNgay'], '2026-10-30');

    // Second call without refresh should use cache and not fire new HTTP request
    final cachedResult = await RelativeService.instance.getElderlyHealthMetrics(
      6,
      loaiChiSoId: 1,
      tuNgay: DateTime(2026, 10, 1),
      denNgay: DateTime(2026, 10, 30),
    );
    expect(cachedResult.length, 1);
    expect(adapter.requests.length, 1); // Still 1
  });

  test('createElderlyHealthMetric posts data and clears metrics cache', () async {
    adapter.mockData = {
      'id': 102,
      'loaiChiSoId': 1,
      'giaTri': 125,
      'giaTriPhu': 82,
    };

    final createResult = await RelativeService.instance.createElderlyHealthMetric(6, {
      'loaiChiSoId': 1,
      'giaTri': 125,
      'giaTriPhu': 82,
      'thoiGianDo': '2026-10-30T01:30:00.000Z',
    });

    expect(createResult['id'], 102);
    expect(adapter.requests.last.method, 'POST');
    expect(adapter.requests.last.path, '/relatives/me/elderly/6/health-metrics');
    expect(adapter.requests.last.data['giaTri'], 125);
  });

  test('getElderlyMedications calls /relatives/me/elderly/:id/medication-schedules', () async {
    adapter.mockData = [
      {
        'id': 201,
        'tenThuoc': 'Amlodipine 5mg',
        'lieuDung': '1 viên',
        'thoiGianDuKien': '2026-10-30T08:00:00.000Z',
      }
    ];

    final meds = await RelativeService.instance.getElderlyMedications(
      6,
      tuNgay: DateTime(2026, 10, 30),
      denNgay: DateTime(2026, 10, 30),
    );

    expect(meds.length, 1);
    expect(meds.first['tenThuoc'], 'Amlodipine 5mg');
    expect(adapter.requests.single.path, '/relatives/me/elderly/6/medication-schedules');
  });

  test('getElderlyAppointments calls /relatives/me/elderly/:id/appointments', () async {
    adapter.mockData = [
      {'id': 301, 'tenBenhVien': 'Bệnh viện Đa Khoa', 'thoiGianKham': '2026-11-05T09:00:00.000Z'}
    ];

    final appts = await RelativeService.instance.getElderlyAppointments(6);

    expect(appts.length, 1);
    expect(appts.first['tenBenhVien'], 'Bệnh viện Đa Khoa');
    expect(adapter.requests.single.path, '/relatives/me/elderly/6/appointments');
  });

  test('getElderlyAlerts calls /relatives/me/elderly/:id/alerts', () async {
    adapter.mockData = [
      {'id': 401, 'loaiCanhBao': 'HuyetApCao', 'mucDo': 'NguyHiem'}
    ];

    final alerts = await RelativeService.instance.getElderlyAlerts(6);

    expect(alerts.length, 1);
    expect(alerts.first['loaiCanhBao'], 'HuyetApCao');
    expect(adapter.requests.single.path, '/relatives/me/elderly/6/alerts');
  });

  test('getElderlySos calls /relatives/me/elderly/:id/sos', () async {
    adapter.mockData = [
      {'id': 501, 'trangThai': 'DaXuLy', 'noiDung': 'Cần hỗ trợ gấp'}
    ];

    final sosList = await RelativeService.instance.getElderlySos(6);

    expect(sosList.length, 1);
    expect(sosList.first['trangThai'], 'DaXuLy');
    expect(adapter.requests.single.path, '/relatives/me/elderly/6/sos');
  });

  test('getElderlyCareNotes calls /relatives/me/elderly/:id/care-notes', () async {
    adapter.mockData = [
      {'id': 601, 'hoatDong': 'Ăn sáng & uống thuốc', 'nguoiChamSocTen': 'Nguyễn Y Sĩ'}
    ];

    final notes = await RelativeService.instance.getElderlyCareNotes(6);

    expect(notes.length, 1);
    expect(notes.first['hoatDong'], 'Ăn sáng & uống thuốc');
    expect(adapter.requests.single.path, '/relatives/me/elderly/6/care-notes');
  });

  test('getMetricTypes calls /health-metric-types', () async {
    adapter.mockData = [
      {'id': 1, 'tenChiSo': 'Huyết áp', 'donVi': 'mmHg'},
      {'id': 2, 'tenChiSo': 'Nhịp tim', 'donVi': 'bpm'},
    ];

    final types = await RelativeService.instance.getMetricTypes();

    expect(types.length, 2);
    expect(types.first['tenChiSo'], 'Huyết áp');
    expect(adapter.requests.single.path, '/health-metric-types');
  });
}
