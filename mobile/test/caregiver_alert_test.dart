import 'dart:convert';
import 'dart:typed_data';
import 'package:dio/dio.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:elderly_care_app/services/api_client.dart';
import 'package:elderly_care_app/services/caregiver_dashboard_service.dart';
import 'package:elderly_care_app/screens/caregiver/caregiver_elderly_detail_screen.dart';
import 'mobile_flows_test.dart' show FlowAdapter;

class AlertAdapter extends FlowAdapter {
  String status = 'DA_XEM';
  int writes = 0;
  bool failWrite = true, failReload = false;
  @override
  Future<ResponseBody> fetch(
    RequestOptions options,
    Stream<Uint8List>? stream,
    Future<void>? cancel,
  ) async {
    if (options.method == 'PATCH') {
      writes++;
      if (!failWrite) {
        return ResponseBody.fromString(
          jsonEncode({
            'data': {'id': 1},
          }),
          200,
          headers: {
            Headers.contentTypeHeader: [Headers.jsonContentType],
          },
        );
      }
      throw DioException(
        requestOptions: options,
        type: DioExceptionType.connectionError,
      );
    }
    if (options.path == '/elderly/1/alerts') {
      if (failReload && writes > 0) {
        throw DioException(
          requestOptions: options,
          type: DioExceptionType.connectionError,
        );
      }
      return ResponseBody.fromString(
        jsonEncode({
          'data': [
            {
              'id': 1,
              'nguoiCaoTuoiId': 1,
              'trangThai': status,
              'mucDo': 'THAP',
              'moTa': 'TEST ONLY ALERT',
            },
          ],
        }),
        200,
        headers: {
          Headers.contentTypeHeader: [Headers.jsonContentType],
        },
      );
    }
    return super.fetch(options, stream, cancel);
  }
}

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();
  late HttpClientAdapter previous;
  late List<Interceptor> interceptors;
  late AlertAdapter adapter;
  setUp(() async {
    FlutterSecureStorage.setMockInitialValues({});
    await ApiClient.clearSession();
    previous = ApiClient.instance.dio.httpClientAdapter;
    interceptors = List.of(ApiClient.instance.dio.interceptors);
    ApiClient.instance.dio.interceptors.clear(
      keepImplyContentTypeInterceptor: false,
    );
    adapter = AlertAdapter();
    ApiClient.instance.dio.httpClientAdapter = adapter;
    CaregiverDashboardService.instance.clearCache();
  });
  tearDown(() {
    ApiClient.instance.dio.httpClientAdapter = previous;
    ApiClient.instance.dio.interceptors.clear(
      keepImplyContentTypeInterceptor: false,
    );
    ApiClient.instance.dio.interceptors.addAll(interceptors);
  });
  Future<void> open(WidgetTester tester, String label) async {
    await tester.pumpWidget(
      const MaterialApp(
        home: CaregiverElderlyDetailScreen(
          elderly: {'id': 1, 'hoTen': 'TEST ONLY'},
        ),
      ),
    );
    await tester.pumpAndSettle();
    await tester.scrollUntilVisible(find.text(label), 350);
    await tester.ensureVisible(find.text(label));
    await tester.pumpAndSettle();
    await tester.tap(find.text(label));
    await tester.pumpAndSettle();
  }

  testWidgets('Failed alert resolution retains note for reopening and retry', (
    tester,
  ) async {
    await open(tester, 'ĐÁNH DẤU ĐÃ XỬ LÝ');
    await tester.enterText(
      find.byType(TextFormField),
      'TEST DRAFT MUST SURVIVE',
    );
    await tester.tap(find.text('Xác nhận đã xử lý'));
    await tester.pumpAndSettle();
    expect(adapter.writes, 1);
    expect(tester.takeException(), isNull);
    await tester.ensureVisible(find.text('ĐÁNH DẤU ĐÃ XỬ LÝ'));
    await tester.pumpAndSettle();
    await tester.tap(find.text('ĐÁNH DẤU ĐÃ XỬ LÝ'));
    await tester.pumpAndSettle();
    expect(find.text('TEST DRAFT MUST SURVIVE'), findsOneWidget);
  });
  testWidgets(
    'Failed accept displays feedback without an uncaught second reload',
    (tester) async {
      adapter.status = 'CHUA_XU_LY';
      await open(tester, 'TIẾP NHẬN CẢNH BÁO');
      expect(adapter.writes, 1);
      expect(tester.takeException(), isNull);
      expect(find.textContaining('Không thể kết nối'), findsOneWidget);
    },
  );
  testWidgets(
    'Successful write keeps accepted status when the following reload fails',
    (tester) async {
      adapter.status = 'CHUA_XU_LY';
      adapter.failWrite = false;
      adapter.failReload = true;
      await open(tester, 'TIẾP NHẬN CẢNH BÁO');
      expect(adapter.writes, 1);
      expect(find.text('ĐÁNH DẤU ĐÃ XỬ LÝ'), findsOneWidget);
      expect(
        find.textContaining('Đã tiếp nhận cảnh báo, nhưng chưa tải lại'),
        findsOneWidget,
      );
      expect(tester.takeException(), isNull);
    },
  );
}
