import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:elderly_care_app/services/api_client.dart';
import 'package:elderly_care_app/services/care_report_export_service.dart';
import 'package:elderly_care_app/screens/care/care_report_screen.dart';
import 'care_report_test.dart' show ReportApi;

void main() {
  const channel = MethodChannel('elderly_care/report_print');
  final calls = <MethodCall>[];
  setUp(() async {
    FlutterSecureStorage.setMockInitialValues({});
    await ApiClient.clearSession();
    calls.clear();
    TestDefaultBinaryMessengerBinding.instance.defaultBinaryMessenger
        .setMockMethodCallHandler(channel, (call) async {
          calls.add(call);
          return null;
        });
  });
  tearDown(() {
    TestDefaultBinaryMessengerBinding.instance.defaultBinaryMessenger
        .setMockMethodCallHandler(channel, null);
  });
  testWidgets(
    'Switching profile cancels native document selection',
    (t) async {
      await t.pumpWidget(
        MaterialApp(home: CareReportScreen(profileId: 1, service: ReportApi())),
      );
      await t.pumpAndSettle();
      await t.tap(find.byTooltip('Chia sẻ PDF đã xuất'));
      await t.pumpAndSettle();
      await t.tap(find.text('Chọn file'));
      await t.pumpAndSettle();
      await t.pumpWidget(
        MaterialApp(home: CareReportScreen(profileId: 2, service: ReportApi())),
      );
      await t.pumpAndSettle();
      expect(calls.map((c) => c.method), ['share', 'cancel']);
    },
    variant: TargetPlatformVariant.only(TargetPlatform.android),
  );
  testWidgets(
    'Share needs explicit tap, cancellation is quiet and file error is readable',
    (t) async {
      await t.pumpWidget(
        MaterialApp(home: CareReportScreen(profileId: 1, service: ReportApi())),
      );
      await t.pumpAndSettle();
      await t.tap(find.byTooltip('Chia sẻ PDF đã xuất'));
      await t.pumpAndSettle();
      await t.tap(find.text('Hủy'));
      await t.pumpAndSettle();
      expect(calls, isEmpty);
      await t.tap(find.byTooltip('Chia sẻ PDF đã xuất'));
      await t.pumpAndSettle();
      await t.tap(find.text('Chọn file'));
      await t.pumpAndSettle();
      expect(calls.single.method, 'share');
      expect(calls.where((c) => c.method == 'print'), isEmpty);
      expect(find.byType(SnackBar), findsNothing);
      TestDefaultBinaryMessengerBinding.instance.defaultBinaryMessenger
          .setMockMethodCallHandler(channel, (_) async {
            throw PlatformException(code: 'FILE_UNAVAILABLE');
          });
      await t.tap(find.byTooltip('Chia sẻ PDF đã xuất'));
      await t.pumpAndSettle();
      await t.tap(find.text('Chọn file'));
      await t.pumpAndSettle();
      expect(
        find.textContaining('Chưa đọc hoặc chia sẻ được file PDF'),
        findsOneWidget,
      );
    },
    variant: TargetPlatformVariant.only(TargetPlatform.android),
  );
  test(
    'Document preserves source values, escapes profile and distinguishes missing from zero',
    () async {
      final r = Map<String, dynamic>.from(
        await ReportApi().request('/care/1/report'),
      );
      (r['profile'] as Map)['hoTen'] = 'TEST ONLY <img src="https://invalid">';
      (r['lifestyle'] as Map)['totals'] = <String, dynamic>{
        ...r['lifestyle']['totals'] as Map,
        'waterMl': 0,
      };
      final html = CareReportExportService.document(r);
      expect(html, contains('&lt;img'));
      expect(html, isNot(contains('<img')));
      expect(html, contains('Nước (ml): 0'));
      expect(html, contains('Ngủ (phút): Chưa ghi nhận'));
      expect(html, contains('2026-10-05 – 2026-10-11'));
      expect(html, contains('Thiếu xác nhận không đồng nghĩa'));
    },
  );
  testWidgets(
    'Export requires explicit confirmation and cancels native preview on account change',
    (t) async {
      await t.pumpWidget(
        MaterialApp(home: CareReportScreen(profileId: 1, service: ReportApi())),
      );
      await t.pumpAndSettle();
      expect(calls, isEmpty);
      await t.tap(find.byTooltip('Xuất PDF'));
      await t.pumpAndSettle();
      await t.tap(find.text('Hủy'));
      await t.pumpAndSettle();
      expect(calls, isEmpty);
      await t.tap(find.byTooltip('Xuất PDF'));
      await t.pumpAndSettle();
      await t.tap(find.text('Tiếp tục'));
      await t.pumpAndSettle();
      expect(calls.single.method, 'print');
      expect(calls.single.arguments['html'], contains('TEST ONLY A'));
      await t.runAsync(() => ApiClient.clearSession());
      await t.pumpAndSettle();
      expect(calls.last.method, 'cancel');
      expect(
        t
            .widget<IconButton>(
              find
                  .ancestor(
                    of: find.byTooltip('Xuất PDF'),
                    matching: find.byType(IconButton),
                  )
                  .first,
            )
            .onPressed,
        isNull,
      );
    },
    variant: TargetPlatformVariant.only(TargetPlatform.android),
  );
  testWidgets(
    'Changing session while confirmation is open prevents export',
    (t) async {
      await t.pumpWidget(
        MaterialApp(home: CareReportScreen(profileId: 1, service: ReportApi())),
      );
      await t.pumpAndSettle();
      await t.tap(find.byTooltip('Xuất PDF'));
      await t.pumpAndSettle();
      await t.runAsync(() => ApiClient.clearSession());
      await t.pumpAndSettle();
      await t.tap(find.text('Tiếp tục'));
      await t.pumpAndSettle();
      expect(calls.where((c) => c.method == 'print'), isEmpty);
    },
    variant: TargetPlatformVariant.only(TargetPlatform.android),
  );
}
