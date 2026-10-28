import 'dart:io';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:geolocator/geolocator.dart';
import 'package:integration_test/integration_test.dart';
import 'package:elderly_care_app/utils/sos_location_policy.dart';
import '../test/support/alerts_ui_fixture.dart';

// Test target only. Never calls the app's main(), a real API, SMS or phone.
class _NoNetwork extends HttpOverrides {
  @override
  HttpClient createHttpClient(SecurityContext? context) =>
      throw StateError('Live network forbidden in Phase2 Android fixture');
}

class _LifecycleProbe with WidgetsBindingObserver {
  int interruptions = 0;
  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    if (state == AppLifecycleState.inactive || state == AppLifecycleState.paused) interruptions++;
  }
}

void main() {
  IntegrationTestWidgetsFlutterBinding.ensureInitialized();
  testWidgets('Android emulator: native GPS + safe SOS partial hold/lifecycle with RAM transport', (tester) async {
    HttpOverrides.global = _NoNetwork();
    addTearDown(() => HttpOverrides.global = null);
    await tester.pumpWidget(const MaterialApp(home: Scaffold(body: Text('Android GPS fixture'))));
    await tester.pumpAndSettle();
    debugPrint('PHASE2_ANDROID_START_NATIVE_GPS');
    await tester.runAsync(() async {
      expect(await Geolocator.checkPermission(), isIn([LocationPermission.always, LocationPermission.whileInUse]));
      final position = await Geolocator.getCurrentPosition(
        locationSettings: const LocationSettings(accuracy: LocationAccuracy.high, timeLimit: Duration(seconds: 20)),
      ).timeout(const Duration(seconds: 25));
      expect(position.latitude, closeTo(10, .001));
      expect(position.longitude, closeTo(106, .001));
      expect(isUsableSosPosition(position), isTrue);
      debugPrint('PHASE2_ANDROID_NATIVE_GPS_PASS accuracy=${position.accuracy}');
    });
    final api = AlertsUiAdapter();
    final probe = _LifecycleProbe();
    WidgetsBinding.instance.addObserver(probe);
    addTearDown(() => WidgetsBinding.instance.removeObserver(probe));
    // Install a single RAM transport, fake telephony and fake GPS for all SOS
    // interactions, so an accidental completed hold cannot escape the test.
    final safetyFixture = AlertsUiFixture(api);
    await safetyFixture.install();
    addTearDown(safetyFixture.dispose);
    safetyFixture.gps.enabled = false;
    await tester.pumpWidget(alertsUiApp());
    await settleAlertsUi(tester);
    var hold = await beginSosHold(tester);
    await tester.pump(const Duration(milliseconds: 500));
    await hold.up();
    await tester.pump(const Duration(seconds: 3));
    expect(api.posts, 0);

    hold = await beginSosHold(tester);
    debugPrint('PHASE2_ANDROID_WAIT_HOME');
    // Host presses Android HOME, then resumes this same test activity.
    await tester.pump(const Duration(seconds: 6));
    await hold.up();
    await settleAlertsUi(tester);
    expect(probe.interruptions, greaterThan(0), reason: 'Must observe actual Android HOME lifecycle');
    expect(api.posts, 0, reason: 'Native backgrounding must cancel the hold');
    debugPrint('PHASE2_ANDROID_PARTIAL_HOLD_PASS');
    expect(tester.takeException(), isNull);
  });
}
