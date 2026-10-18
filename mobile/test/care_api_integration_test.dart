// Opt-in only: invoked by verify_care_mobile_dio.js against its guarded fake SQL API.
import 'dart:convert';
import 'dart:io';
import 'package:flutter_test/flutter_test.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:elderly_care_app/services/api_client.dart';
import 'package:elderly_care_app/services/care_today_service.dart';
import 'package:elderly_care_app/services/health_metric_service.dart';
import 'package:elderly_care_app/screens/care/care_lifestyle_screen.dart';

const enabled = bool.fromEnvironment('CARE_SQL_API_TEST');
void main() {
  TestWidgetsFlutterBinding.ensureInitialized();
  test(
    'Real mobile Dio services: today plan lifestyle handoff report health chat scope and session',
    () async {
      final uri = Uri.parse(ApiClient.baseUrl);
      expect(uri.host, '127.0.0.1');
      expect(uri.port, greaterThan(1024));
      final password = Platform.environment['MOBILE_TEST_PASSWORD'];
      expect(password?.isNotEmpty, true);
      final previous = HttpOverrides.current;
      HttpOverrides.global = null;
      FlutterSecureStorage.setMockInitialValues({});
      try {
        await ApiClient.clearSession();
        Future<void> login(String name) async {
          await ApiClient.clearSession();
          final d =
              (await ApiClient.instance.dio.post<Map<String, dynamic>>(
                    '/auth/login',
                    data: {
                      'tenDangNhap': name,
                      'matKhau': password,
                      'platform': 'mobile',
                    },
                  )).data!['data']
                  as Map;
          await ApiClient.saveSession(
            token: d['token'] as String,
            encodedUser: jsonEncode(d['user']),
            expectedVersion: ApiClient.sessionVersion,
          );
        }

        await login('test.caregiver');
        const service = CareTodayService();
        final profiles = await service.profiles();
        expect(profiles.length, 2);
        expect(
          profiles.every((p) => p['hoTen'].toString().startsWith('TEST ONLY')),
          true,
        );
        final a = (profiles.first['id'] as num).toInt(),
            b = (profiles.last['id'] as num).toInt(),
            now = careNow(),
            date = careDay(now),
            key = careRequestId();
        await service.create(a, {
          'ten': 'TEST ONLY DIO $key',
          'mucTieu': 'Sinh hoạt đều đặn',
          'ngayBatDau': date,
          'ngayKetThuc': careDay(now.add(const Duration(days: 2))),
          'hoatDong': [
            {
              'loai': 'water',
              'ten': 'TEST ONLY DIO WATER',
              'gio': '10:00',
              'thu': [1, 2, 3, 4, 5, 6, 7],
            },
          ],
        });
        final plans = await service.plans(a);
        final plan = (plans['plans'] as List).singleWhere(
          (p) => p['ten'] == 'TEST ONLY DIO $key',
        );
        final aid = (plan['hoatDong'][0]['id'] as num).toInt();
        await service.complete(a, aid, date);
        final today = await service.today(a);
        expect(
          (today['items'] as List).singleWhere(
            (r) => r['hoatDongId'] == aid,
          )['trangThai'],
          'completed',
        );
        expect(
          today['progress']['completed'],
          (today['items'] as List)
              .where((r) => r['trangThai'] == 'completed')
              .length,
        );
        final body = {
          'loai': 'water',
          'thoiGian': careTime(now.subtract(const Duration(minutes: 1))),
          'noiDung': 'TEST ONLY DIO WATER',
          'ghiChu': 'SYNTHETIC',
          'luong': 123.5,
          'requestId': careRequestId(),
        };
        final created = await service.request(
          '/care/$a/lifestyle',
          method: 'POST',
          data: body,
        );
        final duplicate = await service.request(
          '/care/$a/lifestyle',
          method: 'POST',
          data: body,
        );
        expect(duplicate['id'], created['id']);
        final life = await service.request('/care/$a/lifestyle');
        expect(
          (life['rows'] as List).singleWhere(
            (r) => r['id'] == created['id'],
          )['luong'],
          123.5,
        );
        final handoff = await service.request(
          '/care/$a/handoffs',
          method: 'POST',
          data: {
            'daLam': 'TEST ONLY DIO INTERNAL',
            'conCho': 'TEST ONLY PENDING',
            'luuY': 'SYNTHETIC',
            'requestId': careRequestId(),
          },
        );
        final list = await service.request('/care/$a/handoffs');
        expect(
          (list['rows'] as List).any((r) => r['id'] == handoff['id']),
          true,
        );
        final end = careDay(now),
            start = careDay(now.subtract(const Duration(days: 6)));
        final report = await service.request(
          '/care/$a/report',
          query: {'days': 7},
        );
        final reportLife = await service.request(
          '/care/$a/lifestyle',
          query: {'from': start, 'to': end},
        );
        final reportPlans = await service.request(
          '/care/$a/plans',
          query: {'from': start, 'to': end},
        );
        expect(report['lifestyle']['totals'], reportLife['totals']);
        expect(
          report['activities']['scheduled'],
          (reportPlans['occurrences'] as List).length,
        );
        final second = await service.today(b);
        expect(second['profile']['id'], b);
        expect(
          (second['items'] as List).any((r) => r['hoatDongId'] == aid),
          false,
        );
        final healthA = await HealthMetricService.instance.getProfileMetrics(a),
            healthB = await HealthMetricService.instance.getProfileMetrics(b);
        expect(healthA.every((r) => r['nguoiCaoTuoiId'] == a), true);
        expect(healthB.every((r) => r['nguoiCaoTuoiId'] == b), true);
        final chat =
            (await ApiClient.instance.dio.post<Map<String, dynamic>>(
                  '/care-assistant/chat',
                  data: {'question': 'báo cáo chăm sóc 7 ngày', 'elderlyId': a},
                )).data!['data']
                as Map;
        expect(chat['intent'], 'report');
        expect(chat['actions'], ['report']);
        expect(
          chat['rows'][0]['soXacNhanUong'],
          report['medication']['confirmed'],
        );
        await login('test.elder.a');
        await expectLater(
          service.request('/care/$a/handoffs'),
          throwsA(
            isA<ApiException>().having((e) => e.statusCode, 'forbidden', 403),
          ),
        );
        await expectLater(
          service.request('/care/$b/today'),
          throwsA(
            isA<ApiException>().having((e) => e.statusCode, 'forbidden', 403),
          ),
        );
        final pending = service.today(a),
            checked = expectLater(pending, throwsA(isA<ApiException>()));
        await ApiClient.clearSession();
        await checked;
      } finally {
        await ApiClient.clearSession();
        HttpOverrides.global = previous;
      }
    },
    skip: !enabled,
    timeout: const Timeout(Duration(minutes: 3)),
  );
}
