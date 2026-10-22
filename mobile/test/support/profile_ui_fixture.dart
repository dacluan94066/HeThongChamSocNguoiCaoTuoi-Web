import 'dart:async';
import 'dart:convert';
import 'dart:typed_data';

import 'package:dio/dio.dart';
import 'package:flutter/material.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:elderly_care_app/screens/profile/profile_screen.dart';
import 'package:elderly_care_app/services/api_client.dart';
import 'package:elderly_care_app/services/elderly_service.dart';
import 'package:elderly_care_app/services/alert_service.dart';
import 'package:elderly_care_app/theme/care_senior_theme.dart';
import 'package:elderly_care_app/widgets/care_senior_ui.dart';
import 'notification_platform_fake.dart';

/// Synthetic transport only. No request can reach a real server.
class ProfileUiAdapter implements HttpClientAdapter {
  final requests = <RequestOptions>[];
  static const name = 'HỒ SƠ KIỂM THỬ CÓ HỌ VÀ TÊN RẤT DÀI';
  static const address =
      'ĐỊA CHỈ KIỂM THỬ: căn hộ nhiều tầng, đường dài, phường và quận có tên rất dài để kiểm tra khả năng xuống dòng.';
  final profile = <String, dynamic>{
    'id': 9876,
    'hoTen': name,
    'ngaySinh': '${DateTime.now().year - 78}-01-15',
    'gioiTinh': 'Khác',
    'email': 'profile.fixture@example.invalid',
    'soDienThoai': '0000000000',
    'diaChi': address,
    'nhomMau': 'AB+',
    'benhNen': 'BỆNH NỀN TỪ API KIỂM THỬ, nội dung dài cần được đọc đầy đủ.',
    'diUng': 'DỊ ỨNG TỪ API KIỂM THỬ, không phải khuyến cáo y tế.',
    'nguoiChamSocTen': 'NGƯỜI CHĂM SÓC TỪ API KIỂM THỬ',
    'cccd': 'SECRET-NOT-FOR-DISPLAY',
  };
  final account = <String, dynamic>{
    'userId': 9876,
    'hoTen': name,
    'tenDangNhap': 'profile.fixture',
    'tenVaiTro': 'NguoiChamSoc',
    'email': 'profile.fixture@example.invalid',
    'soDienThoai': '0000000000',
  };
  bool empty = false, offline = false;
  int? getStatus, putStatus;
  Completer<void>? getGate, putGate;
  List<RequestOptions> get writes =>
      requests.where((r) => r.method != 'GET').toList();
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
      if (getStatus != null) {
        return response({
          'message': 'LỖI TẢI HỒ SƠ KIỂM THỬ $getStatus',
        }, getStatus!);
      }
      final Object data = switch (options.path) {
        '/elderly/me' => empty ? <String, dynamic>{} : profile,
        '/auth/me' => empty ? <String, dynamic>{} : account,
        '/elderly/me/alerts' => <Map<String, dynamic>>[],
        _ => throw StateError('Unexpected GET: ${options.path}'),
      };
      return response({'data': data});
    }
    if (options.method == 'PUT' &&
        const [
          '/elderly/me',
          '/auth/me',
          '/users/me/password',
        ].contains(options.path)) {
      await putGate?.future;
      if (putStatus != null) {
        return response({'message': 'LỖI LƯU KIỂM THỬ $putStatus'}, putStatus!);
      }
      final target = options.path == '/auth/me' ? account : profile;
      if (options.path != '/users/me/password') {
        target.addAll(Map<String, dynamic>.from(options.data as Map));
      }
      return response({'data': target});
    }
    throw StateError(
      'Forbidden fixture request: ${options.method} ${options.path}',
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

class ProfileUiFixture {
  ProfileUiFixture(this.adapter);
  final ProfileUiAdapter adapter;
  late HttpClientAdapter original;
  late List<Interceptor> interceptors;
  Future<void> install() async {
    SharedPreferences.setMockInitialValues({});
    FlutterSecureStorage.setMockInitialValues({});
    NotificationPlatformFake().install();
    await ApiClient.clearSession();
    await ApiClient.saveSession(
      token: 'SYNTHETIC-PROFILE-SESSION',
      encodedUser: jsonEncode(adapter.account),
      expectedVersion: ApiClient.sessionVersion,
    );
    ElderlyService.instance.clearCache();
    AlertService.instance.clearCache();
    final dio = ApiClient.instance.dio;
    original = dio.httpClientAdapter;
    interceptors = List<Interceptor>.from(dio.interceptors);
    dio.interceptors.clear(keepImplyContentTypeInterceptor: false);
    dio.httpClientAdapter = adapter;
  }

  void dispose() {
    ElderlyService.instance.clearCache();
    AlertService.instance.clearCache();
    final dio = ApiClient.instance.dio;
    dio.httpClientAdapter = original;
    dio.interceptors.clear(keepImplyContentTypeInterceptor: false);
    dio.interceptors.addAll(interceptors);
  }
}

Widget profileUiApp({
  bool accountOnly = false,
  double scale = 1,
  Widget? screen,
}) => MaterialApp(
  theme: CareSeniorTheme.data,
  builder: (context, child) => MediaQuery(
    data: MediaQuery.of(context).copyWith(textScaler: TextScaler.linear(scale)),
    child: child!,
  ),
  routes: {'/login': (_) => const Scaffold(body: Text('FIXTURE LOGIN'))},
  home: Scaffold(
    body: screen ?? ProfileScreen(accountOnly: accountOnly),
    bottomNavigationBar: AppBottomNavigation(
      selectedIndex: 5,
      onSelected: (_) {},
    ),
  ),
);

Future<void> settleProfileUi(WidgetTester tester) async {
  for (var i = 0; i < 3; i++) {
    await tester.pump(const Duration(milliseconds: 100));
    await Future<void>.delayed(const Duration(milliseconds: 30));
  }
  await tester.pumpAndSettle();
}

Finder profileField(String label) =>
    find.byKey(ValueKey('profile-field-$label'));
Finder passwordField(String label) =>
    find.byKey(ValueKey('password-field-$label'));
Future<void> revealProfileUi(
  WidgetTester tester,
  Finder target, {
  String scroll = 'profile-list',
}) async {
  final scrollable = find
      .descendant(
        of: find.byKey(ValueKey(scroll)),
        matching: find.byType(Scrollable),
      )
      .first;
  await tester.scrollUntilVisible(
    target,
    260,
    scrollable: scrollable,
    maxScrolls: 100,
  );
  await tester.pumpAndSettle();
}

Future<void> tapProfileUi(
  WidgetTester tester,
  String text, {
  String scroll = 'profile-list',
}) async {
  final target = find.text(text);
  await revealProfileUi(tester, target, scroll: scroll);
  await tester.tap(target);
  await settleProfileUi(tester);
}

Future<void> enterProfileUi(
  WidgetTester tester,
  Finder field,
  String value,
) async {
  await tester.ensureVisible(field);
  await tester.enterText(field, value);
  await tester.pumpAndSettle();
}
