import 'dart:async';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:geolocator/geolocator.dart';
import 'package:elderly_care_app/services/api_client.dart';
import 'package:elderly_care_app/utils/sos_location_policy.dart';
import 'support/alerts_ui_fixture.dart';

Position fix(
  DateTime time, {
  double accuracy = 5,
  double latitude = 10,
  double longitude = 106,
}) => Position(
  latitude: latitude,
  longitude: longitude,
  timestamp: time,
  accuracy: accuracy,
  altitude: 0,
  altitudeAccuracy: 0,
  heading: 0,
  headingAccuracy: 0,
  speed: 0,
  speedAccuracy: 0,
  isMocked: true,
);

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
  Future<void> open(WidgetTester tester) async {
    tester.binding.handleAppLifecycleStateChanged(AppLifecycleState.resumed);
    await tester.pumpWidget(alertsUiApp());
    await settleAlertsUi(tester);
  }

  Future<void> send(WidgetTester tester) async {
    final hold = await beginSosHold(tester);
    await tester.pump(const Duration(seconds: 3));
    await settleAlertsUi(tester);
    await hold.up();
  }

  Map body() =>
      adapter.requests.singleWhere((r) => r.method == 'POST').data as Map;

  test(
    'approved GPS policy uses fixed clock, inclusive 2min/100m, rejects future and unreliable fixes',
    () {
      final now = DateTime.utc(2026, 10, 28, 6);
      expect(isUsableSosPosition(fix(now), now: now), isTrue);
      expect(
        isUsableSosPosition(
          fix(now.subtract(const Duration(minutes: 2)), accuracy: 100),
          now: now,
        ),
        isTrue,
      );
      for (final position in [
        fix(now.subtract(const Duration(minutes: 2, microseconds: 1))),
        fix(now.add(const Duration(microseconds: 1))),
        fix(DateTime.fromMillisecondsSinceEpoch(0)),
        fix(now, accuracy: 100.1),
        fix(now, accuracy: 0),
        fix(now, accuracy: -1),
        fix(now, accuracy: double.nan),
        fix(now, latitude: 91),
        fix(now, longitude: 181),
        fix(now, latitude: double.nan),
      ]) {
        expect(isUsableSosPosition(position, now: now), isFalse);
      }
    },
  );

  for (final scenario in [
    'old',
    'inaccurate',
    'future',
    'invalid-coordinates',
  ]) {
    testWidgets(
      'SOS still sends without coordinates when cached GPS is $scenario',
      (tester) async {
        fixture.gps.failCurrent = true;
        fixture.gps.last = switch (scenario) {
          'old' => fix(
            DateTime.now().subtract(const Duration(days: 30)),
            accuracy: 8000,
          ),
          'inaccurate' => fix(DateTime.now(), accuracy: 8000),
          'future' => fix(DateTime.now().add(const Duration(minutes: 1))),
          _ => fix(DateTime.now(), latitude: 95),
        };
        await open(tester);
        await send(tester);
        expect(adapter.posts, 1);
        expect(body().containsKey('viDo'), isFalse);
        expect(body().containsKey('kinhDo'), isFalse);
        await revealAlertsUi(tester, find.text('Đã gửi cảnh báo'), 'sos-list');
        expect(
          find.textContaining('quá cũ hoặc chưa đủ tin cậy'),
          findsOneWidget,
        );
      },
    );
  }

  testWidgets(
    'recent accurate cache includes recording time; current fix retains the same payload',
    (tester) async {
      fixture.gps.failCurrent = true;
      fixture.gps.last = fix(
        DateTime.now().subtract(const Duration(seconds: 30)),
      );
      await open(tester);
      await send(tester);
      expect(body()['viDo'], 10);
      expect(body()['kinhDo'], 106);
      expect(body().keys.toSet(), {'noiDung', 'viDo', 'kinhDo'});
      await revealAlertsUi(tester, find.text('Đã gửi cảnh báo'), 'sos-list');
      expect(find.textContaining('ghi nhận lúc'), findsOneWidget);
    },
  );

  for (final state in [
    AppLifecycleState.inactive,
    AppLifecycleState.paused,
    AppLifecycleState.hidden,
    AppLifecycleState.detached,
  ]) {
    testWidgets(
      '$state cancels partial hold; resume needs a fresh uninterrupted three seconds',
      (tester) async {
        fixture.gps.enabled = false;
        await open(tester);
        final hold = await beginSosHold(tester);
        await tester.pump(const Duration(seconds: 1));
        tester.binding.handleAppLifecycleStateChanged(state);
        await tester.pump(const Duration(seconds: 1));
        tester.binding.handleAppLifecycleStateChanged(
          AppLifecycleState.resumed,
        );
        await tester.pump(const Duration(seconds: 4));
        await settleAlertsUi(tester);
        await hold.up();
        expect(adapter.posts, 0);
        await send(tester);
        expect(adapter.posts, 1);
      },
    );
  }

  testWidgets(
    'background while GPS is pending invalidates the unsent intent and ignores its late position',
    (tester) async {
      fixture.gps.gate = Completer<void>();
      await open(tester);
      final hold = await beginSosHold(tester);
      await tester.pump(const Duration(seconds: 3));
      await settleAlertsUi(tester);
      expect(fixture.gps.currentCalls, 1);
      tester.binding.handleAppLifecycleStateChanged(AppLifecycleState.inactive);
      tester.binding.handleAppLifecycleStateChanged(AppLifecycleState.resumed);
      fixture.gps.gate!.complete();
      await settleAlertsUi(tester);
      await hold.up();
      expect(adapter.posts, 0);
      await send(tester);
      expect(adapter.posts, 1);
    },
  );

  testWidgets(
    'an already posted request keeps its real backend confirmation across backgrounding',
    (tester) async {
      fixture.gps.enabled = false;
      adapter.sendGate = Completer<void>();
      await open(tester);
      final hold = await beginSosHold(tester);
      await tester.pump(const Duration(seconds: 3));
      await settleAlertsUi(tester);
      expect(adapter.posts, 1);
      tester.binding.handleAppLifecycleStateChanged(AppLifecycleState.inactive);
      tester.binding.handleAppLifecycleStateChanged(AppLifecycleState.resumed);
      adapter.sendGate!.complete();
      await settleAlertsUi(tester);
      await hold.up();
      await revealAlertsUi(tester, find.text('Đã gửi cảnh báo'), 'sos-list');
      expect(adapter.posts, 1);
    },
  );

  testWidgets(
    'session change during hold cannot send SOS as the next account',
    (tester) async {
      fixture.gps.enabled = false;
      await open(tester);
      final hold = await beginSosHold(tester);
      await tester.pump(const Duration(seconds: 1));
      await tester.runAsync(ApiClient.clearSession);
      await tester.pump(const Duration(seconds: 4));
      await settleAlertsUi(tester);
      await hold.up();
      expect(adapter.posts, 0);
    },
  );

  testWidgets('leaving the route cancels hold without a POST', (tester) async {
    fixture.gps.enabled = false;
    await open(tester);
    final hold = await beginSosHold(tester);
    await tester.pump(const Duration(seconds: 1));
    final navigator = tester.state<NavigatorState>(
      find.byType(Navigator).first,
    );
    unawaited(
      navigator.push(
        MaterialPageRoute<void>(
          builder: (_) => const Scaffold(body: Text('Other route')),
        ),
      ),
    );
    await tester.pumpAndSettle();
    await tester.pump(const Duration(seconds: 4));
    await hold.up();
    expect(adapter.posts, 0);
    navigator.pop();
    await tester.pumpAndSettle();
    expect(adapter.posts, 0);
  });

  testWidgets(
    'permission revoked while GPS is pending sends no cached or current coordinates',
    (tester) async {
      fixture.gps.gate = Completer<void>();
      fixture.gps.last = fixture.gps.position;
      await open(tester);
      final hold = await beginSosHold(tester);
      await tester.pump(const Duration(seconds: 3));
      await settleAlertsUi(tester);
      fixture.gps.permission = LocationPermission.deniedForever;
      fixture.gps.gate!.complete();
      await settleAlertsUi(tester);
      await hold.up();
      expect(adapter.posts, 1);
      expect(body().containsKey('viDo'), isFalse);
      expect(body().containsKey('kinhDo'), isFalse);
    },
  );

  testWidgets(
    'GPS denial and network timeout neither invent coordinates nor retry automatically',
    (tester) async {
      fixture.gps.permission = LocationPermission.deniedForever;
      adapter.failSend = true;
      await open(tester);
      await send(tester);
      expect(adapter.posts, 1);
      expect(body().containsKey('viDo'), isFalse);
      await tester.pump(const Duration(seconds: 20));
      await settleAlertsUi(tester);
      expect(adapter.posts, 1);
      expect(find.text('Đã gửi cảnh báo'), findsNothing);
    },
  );
}
