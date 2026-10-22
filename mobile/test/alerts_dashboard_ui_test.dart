import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:geolocator/geolocator.dart';
import 'package:elderly_care_app/screens/alerts/alerts_dashboard_ui.dart';
import 'package:elderly_care_app/services/mobile_realtime_service.dart';
import 'package:elderly_care_app/widgets/care_senior_ui.dart';
import 'support/alerts_ui_fixture.dart';

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();
  late AlertsUiAdapter adapter;
  late AlertsUiFixture fixture;
  setUp(() async {
    adapter = AlertsUiAdapter();
    fixture = AlertsUiFixture(adapter);
    await fixture.install();
  });
  tearDown(() => fixture.dispose());

  test('SOS timestamps are display-only and retain unknown server text', () {
    final date = DateTime(2026, 10, 22, 14, 35);
    expect(alertsDisplayTime(date.toIso8601String()), '14:35 • 22/10/2026');
    expect(alertsDisplayTime('GIỜ GỬI TỪ API'), 'GIỜ GỬI TỪ API');
    expect(alertsDisplayTime(null), '');
  });

  Future<void> open(
    WidgetTester tester, {
    bool sos = true,
    double scale = 1,
  }) async {
    await tester.pumpWidget(alertsUiApp(sos: sos, scale: scale));
    await settleAlertsUi(tester);
  }

  Future<void> close(WidgetTester tester) async {
    await tester.pumpWidget(const SizedBox.shrink());
    await tester.pumpAndSettle();
  }

  Future<void> send(WidgetTester tester) async {
    final hold = await beginSosHold(tester);
    await tester.pump(const Duration(seconds: 3));
    await tester.pump(const Duration(milliseconds: 100));
    await hold.up();
    await settleAlertsUi(tester);
  }

  testWidgets(
    'opening, tapping and releasing before 3 seconds never sends SOS',
    (tester) async {
      await open(tester);
      expect(adapter.posts, 0);
      expect(fixture.gps.currentCalls, 0);
      final target = find.byKey(const ValueKey('sos-hold-target'));
      await revealAlertsUi(tester, target, 'sos-list');
      await tester.tap(target);
      await tester.pumpAndSettle();
      expect(adapter.posts, 0);
      final hold = await beginSosHold(tester);
      await tester.pump(const Duration(milliseconds: 2800));
      expect(adapter.posts, 0);
      expect(
        tester.widget<SosHoldVisual>(find.byType(SosHoldVisual)).progress,
        greaterThan(.8),
      );
      await hold.up();
      await tester.pumpAndSettle();
      expect(adapter.posts, 0);
      expect(fixture.gps.currentCalls, 0);
      expect(find.text('Giữ đủ 3 giây để gửi SOS'), findsOneWidget);
      await close(tester);
    },
  );

  testWidgets(
    '3 second hold sends once; real loading, GPS and API confirmation only',
    (tester) async {
      adapter.sendGate = Completer<void>();
      fixture.gps.gate = Completer<void>();
      await open(tester);
      final hold = await beginSosHold(tester);
      await tester.pump(const Duration(seconds: 3));
      await tester.pump(const Duration(milliseconds: 100));
      expect(find.text('Đang lấy vị trí...'), findsOneWidget);
      expect(adapter.posts, 0);
      fixture.gps.gate!.complete();
      await tester.pump(const Duration(milliseconds: 100));
      await tester.runAsync(
        () => Future<void>.delayed(const Duration(milliseconds: 100)),
      );
      await tester.pump();
      expect(adapter.posts, 1);
      expect(find.text('Đang gửi cảnh báo...'), findsOneWidget);
      expect(find.text('Đã gửi cảnh báo'), findsNothing);
      await hold.up();
      await tester.tap(find.byKey(const ValueKey('sos-hold-target')));
      await tester.pump(const Duration(seconds: 4));
      expect(adapter.posts, 1);
      adapter.sendGate!.complete();
      await settleAlertsUi(tester);
      await revealAlertsUi(tester, find.text('Đã gửi cảnh báo'), 'sos-list');
      expect(
        find.text('Đã gửi cảnh báo tới 2 người chăm sóc.'),
        findsOneWidget,
      );
      final request = adapter.requests.singleWhere((r) => r.method == 'POST');
      expect(request.data, {
        'noiDung': 'Cảnh báo SOS khẩn cấp',
        'viDo': .1,
        'kinhDo': .2,
      });
      expect(find.text('Tọa độ: 0.1, 0.2'), findsOneWidget);
      expect(find.text('Giờ gửi: GIỜ GỬI KIỂM THỬ TỪ API'), findsOneWidget);
      expect(fixture.phone.urls, isEmpty);
      await close(tester);
    },
  );

  testWidgets(
    'GPS disabled, zero caregivers and duplicate response use actual API fields',
    (tester) async {
      fixture.gps.enabled = false;
      adapter.recipients = 0;
      adapter.duplicate = true;
      adapter.noCaregivers = true;
      await open(tester);
      await send(tester);
      await revealAlertsUi(tester, find.text('Đã gửi cảnh báo'), 'sos-list');
      expect(
        find.textContaining('cảnh báo đã gửi tới quản trị viên'),
        findsOneWidget,
      );
      expect(find.textContaining('không tạo cảnh báo trùng'), findsOneWidget);
      expect(find.textContaining('GPS đang tắt'), findsOneWidget);
      expect(
        (adapter.requests.singleWhere((r) => r.method == 'POST').data as Map)
            .containsKey('viDo'),
        isFalse,
      );
      await revealAlertsUi(
        tester,
        find.text('Chưa có người chăm sóc được phân công.'),
        'sos-list',
      );
      expect(fixture.phone.urls, isEmpty);
      await close(tester);
    },
  );

  for (final permission in [
    LocationPermission.denied,
    LocationPermission.deniedForever,
  ]) {
    testWidgets('permission $permission keeps existing no-location SOS path', (
      tester,
    ) async {
      fixture.gps.permission = permission;
      await open(tester);
      final hold = await beginSosHold(tester);
      await tester.pump(const Duration(seconds: 3));
      await tester.pump(const Duration(milliseconds: 100));
      await hold.up();
      await tester.pumpAndSettle();
      if (permission == LocationPermission.denied) {
        expect(adapter.posts, 0);
        await tester.tap(find.text('Gửi không vị trí'));
      }
      await settleAlertsUi(tester);
      expect(adapter.posts, 1);
      expect(fixture.gps.currentCalls, 0);
      expect(
        (adapter.requests.singleWhere((r) => r.method == 'POST').data as Map)
            .containsKey('viDo'),
        isFalse,
      );
      await close(tester);
    });
  }

  testWidgets('GPS failure uses existing cached-location fallback', (
    tester,
  ) async {
    fixture.gps.failCurrent = true;
    fixture.gps.last = fixture.gps.position;
    await open(tester);
    await send(tester);
    await revealAlertsUi(tester, find.text('Đã gửi cảnh báo'), 'sos-list');
    expect(find.textContaining('Đã dùng vị trí gần nhất'), findsOneWidget);
    expect(
      (adapter.requests.singleWhere((r) => r.method == 'POST').data
          as Map)['viDo'],
      .1,
    );
    await close(tester);
  });

  for (final malformed in [false, true]) {
    testWidgets(
      'SOS ${malformed ? 'malformed response' : 'timeout'} does not fake success; retry preserved',
      (tester) async {
        adapter.failSend = !malformed;
        adapter.malformedSend = malformed;
        await open(tester);
        await send(tester);
        await revealAlertsUi(tester, find.text('Thử lại'), 'sos-list');
        expect(find.text('Đã gửi cảnh báo'), findsNothing);
        expect(
          find.textContaining(
            malformed
                ? 'kết quả gửi SOS'
                : 'Chưa xác nhận được kết quả gửi SOS',
          ),
          findsOneWidget,
        );
        adapter.failSend = false;
        adapter.malformedSend = false;
        await tester.tap(find.text('Thử lại'));
        await settleAlertsUi(tester);
        expect(adapter.posts, 2);
        expect(find.text('Đã gửi cảnh báo'), findsOneWidget);
        await close(tester);
      },
    );
  }

  testWidgets(
    'realtime refresh keeps latest SOS status and manual calls stay manual',
    (tester) async {
      await open(tester);
      await revealAlertsUi(tester, find.text('Đã tiếp nhận'), 'sos-list');
      adapter.latestStatus = 'DA_XU_LY';
      MobileRealtimeService.instance.alertRevision.value++;
      await settleAlertsUi(tester);
      expect(find.text('Đã xử lý'), findsOneWidget);
      adapter.latestStatus = 'ChuaXuLy';
      MobileRealtimeService.instance.notificationRevision.value++;
      await settleAlertsUi(tester);
      expect(find.text('Đã gửi'), findsOneWidget);
      expect(fixture.phone.urls, isEmpty);
      await revealAlertsUi(
        tester,
        find.text('Gọi ${AlertsUiAdapter.longName}'),
        'sos-list',
      );
      await tester.tap(find.text('Gọi ${AlertsUiAdapter.longName}'));
      await tester.pumpAndSettle();
      await revealAlertsUi(tester, find.text('Gọi 115 (thủ công)'), 'sos-list');
      await tester.tap(find.text('Gọi 115 (thủ công)'));
      await tester.pumpAndSettle();
      expect(fixture.phone.urls, ['tel:0000000000', 'tel:115']);
      expect(adapter.posts, 0);
      await close(tester);
    },
  );

  testWidgets(
    'notifications preserve unread filter, detail and mark-all requests',
    (tester) async {
      await open(tester, sos: false);
      expect(adapter.patches, 0);
      expect(find.text('3 thông báo chưa đọc'), findsOneWidget);
      await tester.tap(find.text('Chưa đọc (3)'));
      await tester.pumpAndSettle();
      await revealAlertsUi(
        tester,
        find.byKey(const ValueKey('notification-800')),
        'notification-list',
      );
      await tester.tap(find.byKey(const ValueKey('notification-800')));
      await settleAlertsUi(tester);
      expect(adapter.patches, 1);
      expect(find.text('Xem lịch sử cảnh báo'), findsOneWidget);
      await tester.tap(find.text('Đóng'));
      await settleAlertsUi(tester);
      tester
          .state<ScrollableState>(alertsScroll('notification-list'))
          .position
          .jumpTo(0);
      await tester.pumpAndSettle();
      expect(find.text('2 thông báo chưa đọc'), findsOneWidget);
      await tester.tap(find.text('Đọc tất cả'));
      await settleAlertsUi(tester);
      expect(adapter.patches, 3);
      expect(find.text('Đã đọc hết thông báo'), findsOneWidget);
      expect(adapter.posts, 0);
      await close(tester);
    },
  );

  testWidgets(
    'history preserves severity, statuses, content, source and handling note',
    (tester) async {
      await open(tester, sos: false);
      await tester.tap(find.text('Lịch sử cảnh báo'));
      await settleAlertsUi(tester);
      for (var i = 0; i < 4; i++) {
        await revealAlertsUi(
          tester,
          find.byKey(ValueKey('history-alert-${900 + i}')),
          'alert-history-list',
        );
        final card = tester.widget<AlertHistoryDashboardCard>(
          find.byKey(ValueKey('history-alert-${900 + i}')),
        );
        expect(card.alert['trangThai'], adapter.history[i]['trangThai']);
        expect(card.alert['mucDo'], adapter.history[i]['mucDo']);
        await revealAlertsUi(
          tester,
          find.text('Nguồn: NGUỒN KIỂM THỬ $i'),
          'alert-history-list',
        );
      }
      expect(adapter.posts, 0);
      expect(adapter.patches, 0);
      await close(tester);
    },
  );

  testWidgets(
    'notifications and history show loading then empty without fake content',
    (tester) async {
      adapter.getGate = Completer<void>();
      adapter.empty = true;
      await tester.pumpWidget(alertsUiApp(sos: false));
      await tester.pump(const Duration(milliseconds: 100));
      expect(find.byType(CircularProgressIndicator), findsWidgets);
      adapter.getGate!.complete();
      await settleAlertsUi(tester);
      expect(find.text('Chưa có thông báo'), findsOneWidget);
      await tester.tap(find.text('Lịch sử cảnh báo'));
      await settleAlertsUi(tester);
      expect(find.text('Chưa có cảnh báo nào'), findsOneWidget);
      await close(tester);
    },
  );

  for (final status in [null, 403]) {
    testWidgets(
      'alerts ${status ?? 'offline'} errors and retry stay readable at 1.8',
      (tester) async {
        adapter.offline = status == null;
        adapter.deniedStatus = status;
        await open(tester, sos: false, scale: 1.8);
        expect(find.text('Thử lại'), findsOneWidget);
        if (status != null) {
          expect(find.textContaining('không có quyền'), findsOneWidget);
        }
        await selectAlertHistory(tester);
        expect(find.text('Thử lại'), findsOneWidget);
        adapter.offline = false;
        adapter.deniedStatus = null;
        await tester.ensureVisible(find.text('Thử lại'));
        await tester.pumpAndSettle();
        expect(find.text('Thử lại').hitTestable(), findsOneWidget);
        await tester.tap(find.text('Thử lại'));
        await settleAlertsUi(tester);
        expect(find.text('4 cảnh báo'), findsOneWidget);
        expect(tester.takeException(), isNull);
        await close(tester);
      },
    );
  }

  testWidgets('SOS remains inside Android SafeArea with 1.8 text and pill', (
    tester,
  ) async {
    tester.view.devicePixelRatio = 1;
    tester.view.physicalSize = const Size(320, 900);
    tester.view.padding = const FakeViewPadding(top: 24, bottom: 24);
    addTearDown(tester.view.resetPadding);
    addTearDown(tester.view.resetPhysicalSize);
    addTearDown(tester.view.resetDevicePixelRatio);
    await open(tester, scale: 1.8);
    final target = find.byKey(const ValueKey('sos-hold-target'));
    await revealAlertsUi(tester, target, 'sos-list');
    expect(tester.getTopLeft(target).dy, greaterThanOrEqualTo(24));
    expect(
      tester.getBottomRight(target).dy,
      lessThanOrEqualTo(tester.getTopLeft(find.byType(AppBottomNavigation)).dy),
    );
    expect(tester.takeException(), isNull);
    await close(tester);
  });

  for (final width in [320.0, 360.0, 390.0, 412.0, 768.0]) {
    for (final scale in [1.0, 1.2, 1.4, 1.6, 1.8]) {
      testWidgets(
        'SOS and alerts responsive $width dp text $scale with unchanged pill',
        (tester) async {
          tester.view.devicePixelRatio = 1;
          tester.view.physicalSize = Size(width, 900);
          addTearDown(tester.view.resetPhysicalSize);
          addTearDown(tester.view.resetDevicePixelRatio);
          await open(tester, scale: scale);
          final target = find.byKey(const ValueKey('sos-hold-target'));
          await revealAlertsUi(tester, target, 'sos-list');
          final pillTop = tester
              .getTopLeft(find.byType(AppBottomNavigation))
              .dy;
          expect(tester.getBottomRight(target).dy, lessThanOrEqualTo(pillTop));
          await revealAlertsUi(
            tester,
            find.text('Gọi 115 (thủ công)'),
            'sos-list',
          );
          expect(find.text('Gọi 115 (thủ công)').hitTestable(), findsOneWidget);
          expect(tester.takeException(), isNull);
          await close(tester);
          await open(tester, sos: false, scale: scale);
          await revealAlertsUi(
            tester,
            find.byKey(const ValueKey('notification-803')),
            'notification-list',
          );
          await selectAlertHistory(tester);
          await revealAlertsUi(
            tester,
            find.text('Nguồn: NGUỒN KIỂM THỬ 3'),
            'alert-history-list',
          );
          expect(tester.takeException(), isNull);
          expect(adapter.posts, 0);
          expect(adapter.patches, 0);
          await close(tester);
        },
      );
    }
  }
}
