import 'dart:async';
import 'dart:convert';
import 'dart:typed_data';

import 'package:dio/dio.dart';
import 'package:flutter/material.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:geolocator/geolocator.dart';
// ignore: depend_on_referenced_packages
import 'package:geolocator_platform_interface/geolocator_platform_interface.dart';
import 'package:shared_preferences/shared_preferences.dart';
// ignore: depend_on_referenced_packages
import 'package:url_launcher_platform_interface/url_launcher_platform_interface.dart';

import 'package:elderly_care_app/screens/alerts/alerts_hub_screen.dart';
import 'package:elderly_care_app/screens/alerts/sos_screen.dart';
import 'package:elderly_care_app/services/alert_service.dart';
import 'package:elderly_care_app/services/api_client.dart';
import 'package:elderly_care_app/services/caregiver_service.dart';
import 'package:elderly_care_app/theme/care_senior_theme.dart';
import 'package:elderly_care_app/widgets/care_senior_ui.dart';
import 'notification_platform_fake.dart';

/// Entire transport replaced: no request can reach the network or real data.
class AlertsUiAdapter implements HttpClientAdapter {
  final requests = <RequestOptions>[];
  bool empty = false, offline = false, failSend = false, malformedSend = false;
  bool duplicate = false, noCaregivers = false;
  int? deniedStatus;
  int recipients = 2;
  String latestStatus = 'DA_XEM';
  Completer<void>? getGate, sendGate;
  int get posts => requests.where((r) => r.method == 'POST').length;
  int get patches => requests.where((r) => r.method == 'PATCH').length;
  static const longName = 'NGƯỜI CHĂM SÓC KIỂM THỬ CÓ HỌ VÀ TÊN RẤT DÀI';
  static const longContent =
      'NỘI DUNG TỪ API KIỂM THỬ: lịch thuốc, lịch khám và cảnh báo cần được đọc đầy đủ, không bị cắt khi phóng to chữ.';

  List<Map<String, dynamic>> get notifications => [
    for (var i = 0; i < 4; i++)
      {
        'id': 800 + i,
        'tieuDe': 'THÔNG BÁO KIỂM THỬ $i CÓ TIÊU ĐỀ DÀI',
        'noiDung': longContent,
        'ngayTao': DateTime.now()
            .subtract(Duration(minutes: i))
            .toIso8601String(),
        'daDoc': i == 3,
        'loaiThongBao': [
          'KhanCap',
          'NhacThuoc',
          'NhacLichKham',
          'CanhBaoChiSo',
        ][i],
        'lienKetBang': i == 0 ? 'CanhBaoKhanCap' : null,
      },
  ];
  List<Map<String, dynamic>> get history => [
    for (var i = 0; i < 4; i++)
      {
        'id': 900 + i,
        'loaiCanhBao': [
          'KhanCap',
          'NhacUongThuoc',
          'NhacLichKham',
          'ChiSoBatThuong',
        ][i],
        'mucDo': ['KhanCap', 'Cao', 'TrungBinh', 'Thap'][i],
        'trangThai': ['ChuaXuLy', 'DaXem', 'DaXuLy', 'BoQua'][i],
        'noiDung': longContent,
        'nguonBang': 'NGUỒN KIỂM THỬ $i',
        'ghiChuXuLy': i == 2 ? 'KẾT QUẢ KIỂM THỬ TỪ API' : null,
        'ngayTao': DateTime.now().toIso8601String(),
      },
  ];

  @override
  void close({bool force = false}) {}

  @override
  Future<ResponseBody> fetch(
    RequestOptions options,
    Stream<Uint8List>? stream,
    Future<void>? cancel,
  ) async {
    requests.add(options);
    if (options.method == 'GET') {
      await getGate?.future;
      if (offline) {
        throw DioException(
          requestOptions: options,
          type: DioExceptionType.connectionError,
        );
      }
      if (deniedStatus != null) {
        return response({
          'message': 'Bạn không có quyền xem dữ liệu này.',
        }, deniedStatus!);
      }
      final rows = switch (options.path) {
        '/elderly/me/caregivers' =>
          noCaregivers
              ? <Map<String, dynamic>>[]
              : [
                  {'hoTen': longName, 'soDienThoai': '0000000000'},
                ],
        '/emergency-alerts' => [
          {
            'id': 100,
            'trangThai': latestStatus,
            'ngayGui': DateTime.now().toIso8601String(),
          },
        ],
        '/notifications/me' => notifications,
        '/elderly/me/alerts' => history,
        _ => throw StateError('Unexpected GET: ${options.path}'),
      };
      return response({'data': empty ? [] : rows});
    }
    if (options.method == 'POST' && options.path == '/emergency-alerts') {
      await sendGate?.future;
      if (failSend) {
        throw DioException(
          requestOptions: options,
          type: DioExceptionType.receiveTimeout,
        );
      }
      if (malformedSend) return response({'data': null});
      final body = options.data as Map;
      return response({
        'data': {
          'id': 101,
          'soNguoiChamSocNhan': recipients,
          'trungLap': duplicate,
          'viDo': body['viDo'],
          'kinhDo': body['kinhDo'],
          'ngayGui': 'GIỜ GỬI KIỂM THỬ TỪ API',
        },
      });
    }
    if (options.method == 'PATCH' &&
        RegExp(r'^/notifications/\d+/read$').hasMatch(options.path)) {
      return response({
        'data': {'ok': true},
      });
    }
    throw StateError(
      'Forbidden fixture mutation: ${options.method} ${options.path}',
    );
  }

  ResponseBody response(Object data, [int status = 200]) =>
      ResponseBody.fromString(
        jsonEncode(data),
        status,
        headers: {
          Headers.contentTypeHeader: [Headers.jsonContentType],
        },
      );
}

class AlertsGpsFake extends GeolocatorPlatform {
  bool enabled = true, failCurrent = false;
  LocationPermission permission = LocationPermission.whileInUse;
  Completer<void>? gate;
  int currentCalls = 0;
  Position? last;
  final position = Position(
    longitude: 0.2,
    latitude: 0.1,
    timestamp: DateTime.now(),
    accuracy: 5,
    altitude: 0,
    altitudeAccuracy: 0,
    heading: 0,
    headingAccuracy: 0,
    speed: 0,
    speedAccuracy: 0,
    isMocked: true,
  );
  @override
  Future<bool> isLocationServiceEnabled() async => enabled;
  @override
  Future<LocationPermission> checkPermission() async => permission;
  @override
  Future<LocationPermission> requestPermission() async => permission;
  @override
  Future<Position> getCurrentPosition({
    LocationSettings? locationSettings,
  }) async {
    currentCalls++;
    await gate?.future;
    if (failCurrent) throw StateError('Synthetic GPS unavailable');
    return position;
  }

  @override
  Future<Position?> getLastKnownPosition({
    bool forceLocationManager = false,
  }) async => last;
}

class AlertsPhoneFake extends UrlLauncherPlatform {
  final urls = <String>[];
  @override
  get linkDelegate => null;
  @override
  Future<bool> launchUrl(String url, LaunchOptions options) async {
    urls.add(url); // Never opens a dialler.
    return true;
  }
}

class AlertsUiFixture {
  AlertsUiFixture(this.adapter);
  final AlertsUiAdapter adapter;
  final gps = AlertsGpsFake();
  final phone = AlertsPhoneFake();
  late HttpClientAdapter original;
  late List<Interceptor> interceptors;
  late GeolocatorPlatform originalGps;
  late UrlLauncherPlatform originalPhone;
  Future<void> install() async {
    SharedPreferences.setMockInitialValues({'assistant_fab_hint_seen': true});
    FlutterSecureStorage.setMockInitialValues({});
    NotificationPlatformFake().install();
    await ApiClient.clearSession();
    AlertService.instance.clearCache();
    CaregiverService.instance.clearCache();
    final dio = ApiClient.instance.dio;
    original = dio.httpClientAdapter;
    interceptors = List<Interceptor>.from(dio.interceptors);
    dio.interceptors.clear(keepImplyContentTypeInterceptor: false);
    dio.httpClientAdapter = adapter;
    originalGps = GeolocatorPlatform.instance;
    originalPhone = UrlLauncherPlatform.instance;
    GeolocatorPlatform.instance = gps;
    UrlLauncherPlatform.instance = phone;
  }

  void dispose() {
    AlertService.instance.clearCache();
    CaregiverService.instance.clearCache();
    final dio = ApiClient.instance.dio;
    dio.httpClientAdapter = original;
    dio.interceptors.clear(keepImplyContentTypeInterceptor: false);
    dio.interceptors.addAll(interceptors);
    GeolocatorPlatform.instance = originalGps;
    UrlLauncherPlatform.instance = originalPhone;
  }
}

Widget alertsUiApp({
  bool sos = true,
  double scale = 1,
  bool navigation = true,
}) => MaterialApp(
  theme: CareSeniorTheme.data,
  builder: (context, child) => MediaQuery(
    data: MediaQuery.of(context).copyWith(textScaler: TextScaler.linear(scale)),
    child: child!,
  ),
  home: Scaffold(
    body: sos ? const SosScreen() : const AlertsHubScreen(),
    bottomNavigationBar: navigation
        ? AppBottomNavigation(selectedIndex: sos ? 3 : 4, onSelected: (_) {})
        : null,
  ),
);

Future<void> settleAlertsUi(WidgetTester tester) async {
  for (var i = 0; i < 3; i++) {
    await tester.pump(const Duration(milliseconds: 100));
    await tester.runAsync(
      () => Future<void>.delayed(const Duration(milliseconds: 30)),
    );
  }
  await tester.pumpAndSettle();
}

Finder alertsScroll(String key) => find
    .descendant(
      of: find.byKey(ValueKey(key)),
      matching: find.byType(Scrollable),
    )
    .first;

Future<void> revealAlertsUi(
  WidgetTester tester,
  Finder target,
  String key,
) async {
  // At extreme text sizes, scroll the header before the nested body is built.
  for (var i = 0; i < 8 && find.byKey(ValueKey(key)).evaluate().isEmpty; i++) {
    await tester.drag(find.byType(NestedScrollView), const Offset(0, -160));
    await settleAlertsUi(tester);
  }
  await tester.scrollUntilVisible(
    target,
    240,
    maxScrolls: 100,
    scrollable: alertsScroll(key),
  );
  await tester.pumpAndSettle();
}

Future<TestGesture> beginSosHold(WidgetTester tester) async {
  final target = find.byKey(const ValueKey('sos-hold-target'));
  await revealAlertsUi(tester, target, 'sos-list');
  final gesture = await tester.startGesture(tester.getCenter(target));
  await tester.pump(const Duration(milliseconds: 150));
  await tester.pump();
  return gesture;
}

Future<void> selectAlertHistory(WidgetTester tester) async {
  tester
      .state<NestedScrollViewState>(find.byType(NestedScrollView))
      .outerController
      .jumpTo(0);
  await tester.pumpAndSettle();
  await tester.ensureVisible(find.text('Lịch sử cảnh báo'));
  await tester.pumpAndSettle();
  expect(find.text('Lịch sử cảnh báo').hitTestable(), findsOneWidget);
  await tester.tap(find.text('Lịch sử cảnh báo'));
  await settleAlertsUi(tester);
}
