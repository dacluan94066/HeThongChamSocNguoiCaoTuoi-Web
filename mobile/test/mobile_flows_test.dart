import 'dart:async';
import 'dart:convert';
import 'package:dio/dio.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:flutter_local_notifications/flutter_local_notifications.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:elderly_care_app/services/api_client.dart';
import 'package:elderly_care_app/services/auth_service.dart';
import 'package:elderly_care_app/services/alert_service.dart';
import 'package:elderly_care_app/services/appointment_service.dart';
import 'package:elderly_care_app/services/caregiver_service.dart';
import 'package:elderly_care_app/screens/home/home_screen.dart';
import 'package:elderly_care_app/screens/notifications/notification_screen.dart';
import 'package:elderly_care_app/widgets/foreground_refresh.dart';

class _Adapter implements HttpClientAdapter {
  _Adapter(this.respond);
  final FutureOr<ResponseBody> Function(RequestOptions) respond;
  @override
  Future<ResponseBody> fetch(
    RequestOptions options,
    Stream<Uint8List>? requestStream,
    Future<void>? cancelFuture,
  ) async => respond(options);
  @override
  void close({bool force = false}) {}
}

ResponseBody _response(Object? data, {int status = 200, String? message}) =>
    ResponseBody.fromString(
      jsonEncode({'success': status < 400, 'data': data, 'message': message}),
      status,
      headers: {
        Headers.contentTypeHeader: ['application/json'],
      },
    );

class _RefreshPage extends StatefulWidget {
  const _RefreshPage(this.refresh);
  final Future<void> Function() refresh;
  @override
  State<_RefreshPage> createState() => _RefreshPageState();
}

class _RefreshPageState extends State<_RefreshPage>
    with ForegroundRefresh<_RefreshPage> {
  @override
  Future<void> refreshForeground() => widget.refresh();
  @override
  Widget build(BuildContext context) =>
      const Scaffold(body: Text('refresh-page'));
}

void main() {
  final binding = TestWidgetsFlutterBinding.ensureInitialized();
  late HttpClientAdapter originalAdapter;
  final requests = <RequestOptions>[];
  setUp(() async {
    AndroidFlutterLocalNotificationsPlugin.registerWith();
    FlutterSecureStorage.setMockInitialValues({});
    await ApiClient.clearSession();
    AlertService.instance.clearCache();
    AppointmentService.instance.clearCache();
    requests.clear();
    originalAdapter = ApiClient.instance.dio.httpClientAdapter;
    binding.defaultBinaryMessenger.setMockMethodCallHandler(
      const MethodChannel('dexterous.com/flutter/local_notifications'),
      (call) async => call.method == 'pendingNotificationRequests' ? [] : true,
    );
  });
  tearDown(() {
    ApiClient.instance.dio.httpClientAdapter = originalAdapter;
    binding.defaultBinaryMessenger.setMockMethodCallHandler(
      const MethodChannel('dexterous.com/flutter/local_notifications'),
      null,
    );
  });

  for (final role in ['NguoiCaoTuoi', 'NguoiChamSoc']) {
    test('Login $role succeeds without fetching a profile', () async {
      ApiClient.instance.dio.httpClientAdapter = _Adapter((options) {
        requests.add(options);
        expect(options.path, '/auth/login');
        expect(options.data['platform'], 'mobile');
        return _response({
          'token': 'jwt-test',
          'user': {'userId': 42, 'tenVaiTro': role},
        });
      });
      final user = await AuthService.instance.login(
        'existing-user',
        'password',
      );
      expect(user['tenVaiTro'], role);
      expect(await AuthService.instance.getToken(), 'jwt-test');
      expect(requests.length, 1);
    });
  }

  test('Unsupported role is rejected before saving token', () async {
    ApiClient.instance.dio.httpClientAdapter = _Adapter(
      (_) => _response({
        'token': 'jwt-test',
        'user': {'userId': 1, 'tenVaiTro': 'BacSi'},
      }),
    );
    await expectLater(
      AuthService.instance.login('doctor', 'password'),
      throwsA(isA<ApiException>().having((e) => e.statusCode, 'status', 403)),
    );
    expect(await AuthService.instance.getToken(), isNull);
  });

  test(
    'Restoring elderly session does not depend on profile endpoint',
    () async {
      await ApiClient.storage.write(key: ApiClient.tokenKey, value: 'jwt-test');
      ApiClient.instance.dio.httpClientAdapter = _Adapter((options) {
        expect(options.path, '/auth/me');
        expect(options.headers['Authorization'], 'Bearer jwt-test');
        return _response({'userId': 42, 'tenVaiTro': 'NguoiCaoTuoi'});
      });
      await AuthService.instance.getMe();
      expect((await AuthService.instance.getStoredUser())?['userId'], 42);
    },
  );

  test('Old 401 does not erase a newer session', () async {
    final started = Completer<void>();
    final pending = Completer<ResponseBody>();
    ApiClient.instance.dio.httpClientAdapter = _Adapter((_) {
      started.complete();
      return pending.future;
    });
    final request = ApiClient.instance.dio.get('/notifications/me');
    final assertion = expectLater(request, throwsA(isA<DioException>()));
    await started.future;
    await ApiClient.clearSession();
    await ApiClient.storage.write(key: ApiClient.tokenKey, value: 'new-token');
    pending.complete(_response(null, status: 401));
    await assertion;
    expect(await AuthService.instance.getToken(), 'new-token');
  });

  test('Old successful response is rejected after session changes', () async {
    final started = Completer<void>();
    final pending = Completer<ResponseBody>();
    ApiClient.instance.dio.httpClientAdapter = _Adapter((_) {
      started.complete();
      return pending.future;
    });
    final assertion = expectLater(
      ApiClient.instance.dio.get('/notifications/me'),
      throwsA(
        isA<DioException>().having(
          (e) => e.type,
          'type',
          DioExceptionType.cancel,
        ),
      ),
    );
    await started.future;
    await ApiClient.clearSession();
    pending.complete(
      _response([
        {'id': 1},
      ]),
    );
    await assertion;
  });

  test(
    'Caregiver appointments use scoped API and normalize statuses',
    () async {
      ApiClient.instance.dio.httpClientAdapter = _Adapter((options) {
        expect(options.path, '/appointments');
        expect(options.queryParameters['nguoiCaoTuoiId'], 7);
        return _response([
          {
            'id': 12,
            'nguoiCaoTuoiId': 7,
            'ngayKham': '2026-10-10',
            'gioKham': '09:30',
            'noiKham': 'Bệnh viện',
            'bacSiTen': 'Bác sĩ A',
            'trangThai': 'DA_KHAM',
            'ketQua': 'Kết quả',
          },
        ]);
      });
      final rows = await AppointmentService.instance.getForElderly(7);
      expect(rows.single['thoiGianKham'], '2026-10-10T09:30:00');
      expect(rows.single['tenBenhVien'], 'Bệnh viện');
      expect(rows.single['ketQuaKham'], 'Kết quả');
      expect(AppointmentService.filterByStatus(rows, 'DaKham'), hasLength(1));
    },
  );

  test('SOS zero recipients does not claim caregiver delivery', () {
    expect(
      sosDeliveryMessage({'soNguoiChamSocDaThongBao': 0}),
      contains('chưa có tài khoản'),
    );
    expect(
      sosDeliveryMessage({'soNguoiChamSocDaThongBao': 2}),
      contains('2 người chăm sóc'),
    );
    expect(sosDeliveryMessage({}), contains('Chưa xác định'));
  });

  test('SOS sends only content and uses backend recipient count', () async {
    ApiClient.instance.dio.httpClientAdapter = _Adapter((options) {
      expect(options.path, '/emergency-alerts');
      expect(options.method, 'POST');
      expect(options.data, {'noiDung': 'Cần hỗ trợ'});
      return _response({'id': 1, 'soNguoiChamSocDaThongBao': 0}, status: 201);
    });
    final result = await CaregiverService.instance.sendEmergencyAlert(
      noiDung: ' Cần hỗ trợ ',
    );
    expect(result['soNguoiChamSocDaThongBao'], 0);
  });

  test(
    'Notification resolves an emergency only within returned scope',
    () async {
      ApiClient.instance.dio.httpClientAdapter = _Adapter((options) {
        expect(options.path, '/emergency-alerts');
        return _response([
          {'id': 9, 'nguoiCaoTuoiId': 7},
        ]);
      });
      expect(
        await AlertService.instance.getNotificationElderlyId({
          'lienKetBang': 'CanhBaoKhanCap',
          'lienKetId': 9,
        }),
        7,
      );
      expect(
        await AlertService.instance.getNotificationElderlyId({
          'lienKetBang': 'CanhBaoKhanCap',
          'lienKetId': 99,
        }),
        isNull,
      );
    },
  );

  testWidgets('Unlinked elderly can retry, view account and logout', (
    tester,
  ) async {
    ApiClient.instance.dio.httpClientAdapter = _Adapter(
      (_) => _response(
        null,
        status: 404,
        message: 'Tài khoản chưa có hồ sơ liên kết',
      ),
    );
    await tester.pumpWidget(const MaterialApp(home: HomeScreen()));
    await tester.pumpAndSettle();
    expect(find.text('Tài khoản chưa có hồ sơ liên kết'), findsOneWidget);
    expect(find.text('Thử lại'), findsOneWidget);
    expect(find.text('Thông tin tài khoản'), findsOneWidget);
    expect(find.text('Đăng xuất'), findsOneWidget);
    await tester.pumpWidget(const SizedBox.shrink());
  });

  testWidgets('A read notification still opens its content without PATCH', (
    tester,
  ) async {
    await ApiClient.storage.write(
      key: ApiClient.userKey,
      value: jsonEncode({'tenVaiTro': 'NguoiCaoTuoi'}),
    );
    ApiClient.instance.dio.httpClientAdapter = _Adapter((options) {
      requests.add(options);
      return _response([
        {
          'id': 1,
          'daDoc': true,
          'tieuDe': 'Lịch khám mới',
          'noiDung': 'Nội dung chi tiết',
          'loaiThongBao': 'NhacLichKham',
        },
      ]);
    });
    await tester.pumpWidget(const MaterialApp(home: NotificationScreen()));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Lịch khám mới'));
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 500));
    expect(find.text('Xem lịch khám'), findsOneWidget);
    expect(requests.where((request) => request.method == 'PATCH'), isEmpty);
    await tester.tap(find.text('Đóng'));
    await tester.pumpAndSettle();
    await tester.pumpWidget(const SizedBox.shrink());
  });

  testWidgets('Foreground polling pauses, resumes and stops on dispose', (
    tester,
  ) async {
    var count = 0;
    tester.binding.handleAppLifecycleStateChanged(AppLifecycleState.resumed);
    await tester.pumpWidget(
      MaterialApp(
        home: _RefreshPage(() async {
          count++;
        }),
      ),
    );
    await tester.pump(const Duration(seconds: 30));
    expect(count, 1);
    tester.binding.handleAppLifecycleStateChanged(AppLifecycleState.paused);
    await tester.pump(const Duration(seconds: 30));
    expect(count, 1);
    tester.binding.handleAppLifecycleStateChanged(AppLifecycleState.resumed);
    await tester.pump();
    expect(count, 2);
    await tester.pumpWidget(const SizedBox.shrink());
    await tester.pump(const Duration(seconds: 30));
    expect(count, 2);
  });
}
