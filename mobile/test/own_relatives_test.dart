import 'dart:async';
import 'dart:typed_data';
import 'package:dio/dio.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:elderly_care_app/services/api_client.dart';
import 'package:elderly_care_app/services/own_relatives_service.dart';
import 'package:elderly_care_app/screens/profile/own_relatives_section.dart';
import 'support/profile_ui_fixture.dart';

class RelativesAdapter extends ProfileUiAdapter {
  int status = 200;
  Completer<void>? held;
  final started = Completer<void>();
  List<Map<String, dynamic>> rows = [
    {
      'id': 71,
      'nguoiCaoTuoiId': 9876,
      'hoTen': 'NGƯỜI THÂN KIỂM THỬ CÓ HỌ VÀ TÊN DÀI',
      'moiQuanHe': 'Con gái',
      'soDienThoai': '0000000001',
      'phamViChiaSe': {
        for (final key in relativeScopeLabels.keys)
          key: !['diUng', 'ketQuaKham'].contains(key),
      },
    },
    {
      'id': 72,
      'nguoiCaoTuoiId': 9876,
      'hoTen': 'Người thân chưa có SĐT',
      'moiQuanHe': 'Cháu',
      'soDienThoai': null,
      'phamViChiaSe': {for (final key in relativeScopeLabels.keys) key: false},
    },
  ];
  @override
  Future<ResponseBody> fetch(
    RequestOptions options,
    Stream<Uint8List>? stream,
    Future<void>? cancel,
  ) async {
    if (options.path != '/elderly/me/relatives') {
      return super.fetch(options, stream, cancel);
    }
    if (options.method != 'GET' || options.queryParameters.isNotEmpty) {
      throw StateError('Only self-read is allowed');
    }
    requests.add(options);
    if (!started.isCompleted) started.complete();
    final reply = rows.map((row) => Map<String, dynamic>.from(row)).toList();
    await held?.future;
    return response(
      status == 200
          ? {'data': reply}
          : {'message': 'LỖI NGƯỜI THÂN FIXTURE $status'},
      status,
    );
  }
}

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();
  late RelativesAdapter api;
  late ProfileUiFixture fixture;
  setUp(() async {
    api = RelativesAdapter();
    fixture = ProfileUiFixture(api);
    await fixture.install();
  });
  tearDown(() => fixture.dispose());
  void uiTest(String name, Future<void> Function(WidgetTester) body) {
    testWidgets(name, (tester) async {
      await tester.runAsync(() => body(tester));
      expect(tester.takeException(), isNull);
    });
  }

  Future<void> start(
    WidgetTester tester, {
    double width = 390,
    double scale = 1,
  }) async {
    tester.view.devicePixelRatio = 1;
    tester.view.physicalSize = Size(width, 1000);
    addTearDown(tester.view.resetPhysicalSize);
    addTearDown(tester.view.resetDevicePixelRatio);
    await tester.pumpWidget(
      profileUiApp(
        scale: scale,
        screen: ListView(
          key: const ValueKey('profile-list'),
          children: const [OwnRelativesSection(elderlyId: 9876)],
        ),
      ),
    );
    await settleProfileUi(tester);
  }

  uiTest(
    'Profile integrates own family list without contact or permission mutations',
    (tester) async {
      await tester.pumpWidget(profileUiApp());
      await settleProfileUi(tester);
      await revealProfileUi(tester, find.text('Người thân được phép theo dõi'));
      expect(find.byType(OwnRelativesSection), findsOneWidget);
      expect(find.text('NGƯỜI THÂN KIỂM THỬ CÓ HỌ VÀ TÊN DÀI'), findsOneWidget);
      expect(api.writes, isEmpty);
    },
  );
  for (final width in [320.0, 390.0, 768.0]) {
    for (final scale in [1.0, 1.8]) {
      uiTest('Read-only family scope $width dp at text $scale', (tester) async {
        await start(tester, width: width, scale: scale);
        expect(find.text('Con gái · Đang liên kết'), findsOneWidget);
        expect(find.text('Số điện thoại: 0000000001'), findsOneWidget);
        expect(find.text('Số điện thoại: Chưa cập nhật'), findsOneWidget);
        expect(
          find.text('Không chia sẻ: Dị ứng, Kết quả khám.'),
          findsOneWidget,
        );
        expect(
          find.textContaining('Hiện chưa có quyền xem dữ liệu'),
          findsOneWidget,
        );
        expect(find.byType(TextField), findsNothing);
        expect(api.writes, isEmpty);
      });
    }
  }
  uiTest('Explicit reload reflects revocation and shows an empty state', (
    tester,
  ) async {
    await start(tester);
    api.rows = [];
    await tapProfileUi(tester, 'Tải lại Người thân');
    expect(
      find.textContaining('Chưa có Người thân được liên kết'),
      findsOneWidget,
    );
    expect(find.text('Con gái · Đang liên kết'), findsNothing);
    expect(api.requests.every((r) => r.method == 'GET'), isTrue);
  });
  for (final status in [403, 503]) {
    uiTest(
      'Failed refresh $status erases private rows and allows explicit retry',
      (tester) async {
        await start(tester);
        api.status = status;
        await tapProfileUi(tester, 'Tải lại Người thân');
        expect(find.text('LỖI NGƯỜI THÂN FIXTURE $status'), findsOneWidget);
        expect(find.text('Con gái · Đang liên kết'), findsNothing);
        api.status = 200;
        await tapProfileUi(tester, 'Tải lại Người thân');
        expect(find.text('Con gái · Đang liên kết'), findsOneWidget);
        expect(api.writes, isEmpty);
      },
    );
  }
  uiTest('Foreign profile payload fails closed', (tester) async {
    api.rows.first['nguoiCaoTuoiId'] = 999;
    await start(tester);
    expect(
      find.text('Dữ liệu Người thân không khớp hồ sơ đang đăng nhập.'),
      findsOneWidget,
    );
    expect(find.text('Con gái · Đang liên kết'), findsNothing);
  });
  uiTest(
    'Session change erases visible rows immediately and blocks late old responses',
    (tester) async {
      await start(tester);
      api.held = Completer<void>();
      await revealProfileUi(tester, find.text('Tải lại Người thân'));
      final before = api.requests.length;
      await tester.tap(find.text('Tải lại Người thân').hitTestable());
      await tester.pump();
      for (var i = 0; i < 10 && api.requests.length == before; i++) {
        await Future<void>.delayed(const Duration(milliseconds: 20));
        await tester.pump();
      }
      expect(api.requests.length, before + 1);
      await ApiClient.clearSession();
      await tester.pump();
      api.held!.complete();
      await settleProfileUi(tester);
      expect(find.text('Phiên đăng nhập đã thay đổi.'), findsOneWidget);
      expect(find.text('Con gái · Đang liên kết'), findsNothing);
    },
  );
  uiTest('Logout removes an already visible family list immediately', (
    tester,
  ) async {
    await start(tester);
    expect(find.text('Con gái · Đang liên kết'), findsOneWidget);
    await ApiClient.clearSession();
    await tester.pump();
    expect(find.text('Con gái · Đang liên kết'), findsNothing);
    expect(find.text('Phiên đăng nhập đã thay đổi.'), findsOneWidget);
  });
  test(
    'Service rejects a delayed previous-session reply even without widget cancellation',
    () async {
      api.held = Completer<void>();
      final future = getMyRelatives(elderlyId: 9876);
      final checked = expectLater(
        future,
        throwsA(
          isA<ApiException>().having(
            (e) => e.message,
            'message',
            contains('Phiên đăng nhập đã thay đổi'),
          ),
        ),
      );
      await api.started.future;
      await ApiClient.clearSession();
      api.held!.complete();
      await checked;
      expect(api.writes, isEmpty);
    },
  );
  uiTest(
    'Resume reloads current permission state and disposal cancels old work',
    (tester) async {
      await start(tester);
      api.rows = [];
      tester.binding.handleAppLifecycleStateChanged(AppLifecycleState.paused);
      tester.binding.handleAppLifecycleStateChanged(AppLifecycleState.resumed);
      await settleProfileUi(tester);
      expect(
        find.textContaining('Chưa có Người thân được liên kết'),
        findsOneWidget,
      );
      await tester.pumpWidget(const SizedBox.shrink());
      await tester.pump();
    },
  );
}
