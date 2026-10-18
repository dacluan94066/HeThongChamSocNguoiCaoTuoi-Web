// Opt-in physical/emulator checks. Only synthetic SQL profiles and explicitly
// labelled local test notifications; no SOS or external delivery.
import 'package:dio/dio.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:integration_test/integration_test.dart';
import 'package:elderly_care_app/services/api_client.dart';
import 'package:elderly_care_app/services/auth_service.dart';
import 'package:elderly_care_app/services/local_notification_service.dart';
import 'package:elderly_care_app/screens/care/care_lifestyle_screen.dart';
import 'package:elderly_care_app/screens/care/care_report_screen.dart';
import 'package:flutter_local_notifications/flutter_local_notifications.dart';

void main() {
  IntegrationTestWidgetsFlutterBinding.ensureInitialized();
  testWidgets('Large text, keyboard, profile change and local notifications', (
    t,
  ) async {
    expect(ApiClient.baseUrl, 'http://127.0.0.1:5059/api');
    final bootstrap = Dio();
    final credentials = (await bootstrap.get<Map<String, dynamic>>(
      'http://127.0.0.1:15060/session',
    )).data!;
    expect(credentials['username'], 'test.caregiver');
    final plugin = FlutterLocalNotificationsPlugin();
    try {
      await AuthService.instance.login(
        credentials['username'],
        credentials['password'],
      );
      Widget app(Widget child) => MaterialApp(
        builder: (context, widget) => MediaQuery(
          data: MediaQuery.of(
            context,
          ).copyWith(textScaler: const TextScaler.linear(2)),
          child: widget!,
        ),
        home: child,
      );
      Future<void> settle() async {
        for (var i = 0; i < 30; i++) {
          await t.pump(const Duration(seconds: 1));
          if (find.byType(CircularProgressIndicator).evaluate().isEmpty) break;
        }
        expect(find.text('Thử lại'), findsNothing);
        expect(t.takeException(), isNull);
      }

      await t.pumpWidget(app(const CareReportScreen(profileId: 1)));
      await settle();
      await t.pumpWidget(app(const CareReportScreen(profileId: 2)));
      await settle();
      debugPrint('ANDROID_DEVICE_LARGE_TEXT_PROFILE_RELOAD_PASS');
      await t.pumpWidget(
        app(const CareLifestyleScreen(profileId: 1)),
      );
      await settle();
      await t.tap(find.text('Ghi sinh hoạt'));
      await t.pumpAndSettle();
      await t.tap(find.byType(TextFormField).first);
      await t.pumpAndSettle();
      debugPrint('ANDROID_DEVICE_KEYBOARD_INSPECT_READY');
      await Future<void>.delayed(const Duration(seconds: 15));
      await t.pumpAndSettle();
      expect(t.takeException(), isNull);
      // No save: do not create a lifestyle record for a keyboard check.
      await t.pumpWidget(app(const CareReportScreen(profileId: 1)));
      await settle();
      await LocalNotificationService.initialize();
      debugPrint('ANDROID_DEVICE_NOTIFICATION_PERMISSION_READY');
      final allowed =
          await LocalNotificationService.requestNotificationPermission();
      if (allowed) {
        await LocalNotificationService.showTestNotification();
        expect(
          (await plugin.getActiveNotifications()).any(
            (n) => n.id == 2147483647,
          ),
          isTrue,
        );
        debugPrint('ANDROID_DEVICE_FOREGROUND_LOCAL_NOTIFICATION_PASS');
        await LocalNotificationService.scheduleCareActivity(
          id: 1900000999,
          profileId: 1,
          time: DateTime.now().add(const Duration(seconds: 30)),
          title: 'TEST ONLY BACKGROUND REMINDER',
        );
        debugPrint('ANDROID_DEVICE_BACKGROUND_REMINDER_SCHEDULED');
        await Future<void>.delayed(const Duration(seconds: 90));
        final delivered = (await plugin.getActiveNotifications()).any(
          (n) => n.id == 1900000999,
        );
        debugPrint(
          delivered
              ? 'ANDROID_DEVICE_BACKGROUND_LOCAL_NOTIFICATION_PASS'
              : 'ANDROID_DEVICE_BACKGROUND_DELIVERY_NOT_OBSERVED',
        );
      } else {
        debugPrint('ANDROID_DEVICE_NOTIFICATION_PERMISSION_NOT_GRANTED');
      }
    } finally {
      await LocalNotificationService.cancelNotification(2147483647);
      await LocalNotificationService.cancelNotification(1900000999);
      credentials.clear();
      bootstrap.close();
      await ApiClient.clearSession();
    }
  });
}
