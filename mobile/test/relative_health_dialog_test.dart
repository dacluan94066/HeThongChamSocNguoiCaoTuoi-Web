import 'dart:convert';
import 'dart:typed_data';

import 'package:dio/dio.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:elderly_care_app/screens/relative/relative_health_metric_dialog.dart';
import 'package:elderly_care_app/services/api_client.dart';
import 'package:elderly_care_app/services/relative_service.dart';
import 'package:elderly_care_app/theme/care_senior_theme.dart';

class MockDialogAdapter implements HttpClientAdapter {
  final List<RequestOptions> requests = [];
  bool shouldFailCreate = false;

  @override
  void close({bool force = false}) {}

  @override
  Future<ResponseBody> fetch(
    RequestOptions options,
    Stream<Uint8List>? stream,
    Future<void>? cancel,
  ) async {
    requests.add(options);

    if (options.path == '/health-metric-types') {
      final body = jsonEncode({
        'status': 'success',
        'data': [
          {'id': 1, 'tenChiSo': 'Huyết áp', 'donVi': 'mmHg'},
          {'id': 2, 'tenChiSo': 'Nhịp tim', 'donVi': 'nhịp/phút'},
          {'id': 3, 'tenChiSo': 'Đường huyết', 'donVi': 'mg/dL'},
        ],
      });
      return ResponseBody.fromString(body, 200, headers: {
        Headers.contentTypeHeader: [Headers.jsonContentType],
      });
    }

    if (options.path.endsWith('/health-metrics') && options.method == 'POST') {
      if (shouldFailCreate) {
        final errBody = jsonEncode({
          'status': 'fail',
          'message': 'Giá trị chỉ số vượt ngoài khoảng cho phép.',
        });
        return ResponseBody.fromString(errBody, 422, headers: {
          Headers.contentTypeHeader: [Headers.jsonContentType],
        });
      }

      final body = jsonEncode({
        'status': 'success',
        'message': 'Ghi nhận chỉ số sức khỏe thành công.',
        'data': {'id': 999, 'alertCreated': false},
      });
      return ResponseBody.fromString(body, 200, headers: {
        Headers.contentTypeHeader: [Headers.jsonContentType],
      });
    }

    return ResponseBody.fromString(
      jsonEncode({'status': 'success', 'data': <dynamic>[]}),
      200,
      headers: {Headers.contentTypeHeader: [Headers.jsonContentType]},
    );
  }
}

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();

  late MockDialogAdapter adapter;
  late HttpClientAdapter originalAdapter;
  late List<Interceptor> interceptors;

  setUp(() {
    FlutterSecureStorage.setMockInitialValues({
      ApiClient.tokenKey: 'mock-relative-token',
      ApiClient.userKey: jsonEncode({
        'userId': 12,
        'tenDangNhap': 'huong123',
        'hoTen': 'Trần Thị Lan Hương',
        'tenVaiTro': 'NguoiThan',
        'vaiTroId': 4,
      }),
    });
    adapter = MockDialogAdapter();
    final dio = ApiClient.instance.dio;
    originalAdapter = dio.httpClientAdapter;
    interceptors = List<Interceptor>.from(dio.interceptors);
    dio.interceptors.clear(keepImplyContentTypeInterceptor: false);
    dio.httpClientAdapter = adapter;
    RelativeService.instance.clearCache();
  });

  tearDown(() {
    final dio = ApiClient.instance.dio;
    dio.httpClientAdapter = originalAdapter;
    dio.interceptors.clear(keepImplyContentTypeInterceptor: false);
    dio.interceptors.addAll(interceptors);
    RelativeService.instance.clearCache();
  });

  testWidgets('RelativeHealthMetricDialog loads types and renders form controls', (tester) async {
    tester.view.physicalSize = const Size(800, 1600);
    tester.view.devicePixelRatio = 1.0;
    addTearDown(tester.view.resetPhysicalSize);
    addTearDown(tester.view.resetDevicePixelRatio);

    await tester.pumpWidget(
      MaterialApp(
        theme: CareSeniorTheme.data,
        home: const Scaffold(
          body: RelativeHealthMetricDialog(
            elderlyId: 6,
            elderlyName: 'Võ Huỳnh Duy',
          ),
        ),
      ),
    );
    await tester.pumpAndSettle();

    expect(find.text('Thêm chỉ số sức khỏe'), findsOneWidget);
    expect(find.text('Dành cho: Võ Huỳnh Duy'), findsOneWidget);
    expect(find.text('Loại chỉ số sức khỏe *'), findsOneWidget);
    expect(find.text('Huyết áp (mmHg)'), findsOneWidget);
    expect(find.text('Giá trị đo *'), findsOneWidget);
    expect(find.text('Lưu chỉ số sức khỏe'), findsOneWidget);
  });

  testWidgets('Submitting empty value triggers validation error', (tester) async {
    tester.view.physicalSize = const Size(800, 1600);
    tester.view.devicePixelRatio = 1.0;
    addTearDown(tester.view.resetPhysicalSize);
    addTearDown(tester.view.resetDevicePixelRatio);

    await tester.pumpWidget(
      MaterialApp(
        theme: CareSeniorTheme.data,
        home: const Scaffold(
          body: RelativeHealthMetricDialog(
            elderlyId: 6,
            elderlyName: 'Võ Huỳnh Duy',
          ),
        ),
      ),
    );
    await tester.pumpAndSettle();

    // Tap submit without typing
    await tester.tap(find.text('Lưu chỉ số sức khỏe'));
    await tester.pumpAndSettle();

    expect(find.text('Vui lòng nhập giá trị đo.'), findsOneWidget);
  });

  testWidgets('Submitting valid metric calls API and closes dialog', (tester) async {
    tester.view.physicalSize = const Size(800, 1600);
    tester.view.devicePixelRatio = 1.0;
    addTearDown(tester.view.resetPhysicalSize);
    addTearDown(tester.view.resetDevicePixelRatio);

    bool? dialogResult;

    await tester.pumpWidget(
      MaterialApp(
        theme: CareSeniorTheme.data,
        home: Scaffold(
          body: Builder(
            builder: (ctx) => ElevatedButton(
              onPressed: () async {
                dialogResult = await RelativeHealthMetricDialog.show(
                  ctx,
                  elderlyId: 6,
                  elderlyName: 'Võ Huỳnh Duy',
                );
              },
              child: const Text('Mở dialog'),
            ),
          ),
        ),
      ),
    );
    await tester.pumpAndSettle();

    // Open bottom sheet
    await tester.tap(find.text('Mở dialog'));
    await tester.pumpAndSettle();

    expect(find.text('Thêm chỉ số sức khỏe'), findsOneWidget);

    // Enter blood pressure value
    final textField = find.byType(TextFormField).first;
    await tester.enterText(textField, '120/80');

    // Tap submit
    await tester.tap(find.text('Lưu chỉ số sức khỏe'));
    await tester.pumpAndSettle();

    expect(dialogResult, true);
    final postReq = adapter.requests.firstWhere(
      (r) => r.method == 'POST' && r.path.endsWith('/health-metrics'),
    );
    expect(postReq.data['loaiChiSoId'], 1);
    expect(postReq.data['giaTri'], '120/80');
  });

  testWidgets('API error displays error banner in dialog', (tester) async {
    tester.view.physicalSize = const Size(800, 1600);
    tester.view.devicePixelRatio = 1.0;
    addTearDown(tester.view.resetPhysicalSize);
    addTearDown(tester.view.resetDevicePixelRatio);

    adapter.shouldFailCreate = true;

    await tester.pumpWidget(
      MaterialApp(
        theme: CareSeniorTheme.data,
        home: const Scaffold(
          body: RelativeHealthMetricDialog(
            elderlyId: 6,
            elderlyName: 'Võ Huỳnh Duy',
          ),
        ),
      ),
    );
    await tester.pumpAndSettle();

    final textField = find.byType(TextFormField).first;
    await tester.enterText(textField, '999/999');

    await tester.tap(find.text('Lưu chỉ số sức khỏe'));
    await tester.pumpAndSettle();

    expect(find.text('Giá trị chỉ số vượt ngoài khoảng cho phép.'), findsOneWidget);
  });
}

