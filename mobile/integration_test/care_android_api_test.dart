// Opt-in physical-device test. Only the guarded synthetic SQL API is used.
import 'package:dio/dio.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:integration_test/integration_test.dart';
import 'package:elderly_care_app/services/api_client.dart';
import 'package:elderly_care_app/services/auth_service.dart';
import 'package:elderly_care_app/services/care_today_service.dart';
import 'package:elderly_care_app/services/local_notification_service.dart';
import 'package:elderly_care_app/services/care_reminder_service.dart';
import 'package:elderly_care_app/screens/care/care_today_screen.dart';
import 'package:elderly_care_app/screens/care/care_plan_screen.dart';
import 'package:elderly_care_app/screens/care/care_lifestyle_screen.dart';
import 'package:flutter/services.dart';
import 'package:flutter_local_notifications/flutter_local_notifications.dart';
import 'package:elderly_care_app/screens/care/care_handoff_screen.dart';
import 'package:elderly_care_app/screens/care/care_report_screen.dart';

void main() {
  IntegrationTestWidgetsFlutterBinding.ensureInitialized();
  testWidgets('Android real API: A-D screens, profiles and account isolation', (
    t,
  ) async {
    expect(ApiClient.baseUrl, 'http://127.0.0.1:5059/api');
    CareReminderService.initialize();
    await LocalNotificationService.initialize();
    final bootstrap = Dio(
      BaseOptions(
        connectTimeout: const Duration(seconds: 5),
        receiveTimeout: const Duration(seconds: 5),
      ),
    );
    final credentials = (await bootstrap.get<Map<String, dynamic>>(
      'http://127.0.0.1:15060/session',
    )).data!;
    expect(credentials['username'], 'test.caregiver');
    try {
      await AuthService.instance.login(
        credentials['username'],
        credentials['password'],
      );
      const service = CareTodayService();
      final a =
          await service.request('/care/1/report', query: {'days': 7}) as Map;
      final b =
          await service.request('/care/2/report', query: {'days': 7}) as Map;
      expect(a['profile']['hoTen'].toString(), startsWith('TEST ONLY'));
      expect(b['profile']['hoTen'].toString(), startsWith('TEST ONLY'));
      Future<void> show(Widget screen, String marker) async {
        await t.pumpWidget(MaterialApp(home: screen));
        for (var i = 0; i < 30; i++) {
          await t.pump(const Duration(seconds: 1));
          if (find.byType(CircularProgressIndicator).evaluate().isEmpty) break;
        }
        expect(find.byType(CircularProgressIndicator), findsNothing);
        expect(find.text('Thử lại'), findsNothing);
        expect(t.takeException(), isNull);
        debugPrint('ANDROID_CARE_PASS_$marker');
      }

      await show(const CareTodayScreen(profileId: 1), 'TODAY_A');
      await show(const CarePlanScreen(profileId: 1, canWrite: true), 'PLANS_A');
      final marker =
          'TEST ONLY ANDROID ${DateTime.now().millisecondsSinceEpoch}';
      await t.tap(find.text('Tạo kế hoạch'));
      await t.pumpAndSettle();
      await t.enterText(find.byType(TextFormField).first, '$marker PLAN');
      await t.enterText(
        find.byType(TextFormField).last,
        'TEST ONLY DAILY ROUTINE',
      );
      await SystemChannels.textInput.invokeMethod<void>('TextInput.hide');
      await t.scrollUntilVisible(
        find.text('Thêm hoạt động (tối đa 20)'),
        150,
        scrollable: find.byType(Scrollable).first,
      );
      await t.pumpAndSettle();
      await t.tap(find.text('Thêm hoạt động (tối đa 20)'));
      await t.pumpAndSettle();
      await t.enterText(find.byType(TextField).last, '$marker ACTIVITY');
      await SystemChannels.textInput.invokeMethod<void>('TextInput.hide');
      await t.tap(find.widgetWithText(FilledButton, 'Thêm'));
      await t.pumpAndSettle();
      await t.scrollUntilVisible(
        find.text('Lưu kế hoạch'),
        150,
        scrollable: find.byType(Scrollable).first,
      );
      await t.pumpAndSettle();
      await t.tap(find.text('Lưu kế hoạch'));
      for (
        var i = 0;
        i < 30 && find.text('Tạo kế hoạch').evaluate().isNotEmpty;
        i++
      ) {
        await t.pump(const Duration(seconds: 1));
      }
      final plans = await service.plans(1);
      expect(
        (plans['plans'] as List)
            .where((r) => r['ten'] == '$marker PLAN')
            .length,
        1,
      );
      debugPrint('ANDROID_CARE_PASS_PLAN_UI_WRITE_SOURCE_API');
      await show(const CareTodayScreen(profileId: 1), 'TODAY_NEW_PLAN');
      await t.scrollUntilVisible(
        find.text('$marker ACTIVITY'),
        200,
        maxScrolls: 100,
        scrollable: find.byType(Scrollable).first,
      );
      await t.pumpAndSettle();
      await t.tap(find.text('$marker ACTIVITY'));
      await t.pumpAndSettle();
      expect(find.byType(AlertDialog), findsOneWidget);
      await ApiClient.clearSession();
      await t.pumpAndSettle();
      expect(find.byType(AlertDialog), findsNothing);
      await AuthService.instance.login(
        credentials['username'],
        credentials['password'],
      );
      await show(
        const CareTodayScreen(profileId: 1, key: ValueKey('resumed')),
        'SESSION_CONFIRMATION_CLEARED',
      );
      final beforeConfirm = await service.plans(1);
      expect(
        (beforeConfirm['occurrences'] as List).firstWhere(
          (r) => r['ten'] == '$marker ACTIVITY',
        )['trangThai'],
        isNot('completed'),
      );
      await t.scrollUntilVisible(
        find.text('$marker ACTIVITY'),
        200,
        maxScrolls: 100,
        scrollable: find.byType(Scrollable).first,
      );
      await t.pumpAndSettle();
      await t.tap(find.text('$marker ACTIVITY'));
      await t.pumpAndSettle();
      await t.tap(find.text('Đã thực hiện'));
      for (var i = 0; i < 5; i++) {
        await t.pump(const Duration(seconds: 1));
      }
      final updated = await service.plans(1);
      final occurrence = (updated['occurrences'] as List).firstWhere(
        (r) => r['ten'] == '$marker ACTIVITY',
      );
      expect(occurrence['trangThai'], 'completed');
      debugPrint('ANDROID_CARE_PASS_COMPLETE_UI_SOURCE_API');
      await show(const CareLifestyleScreen(profileId: 1), 'LIFESTYLE_A');
      expect(find.text('Ghi sinh hoạt'), findsOneWidget);
      await t.tap(find.text('Ghi sinh hoạt'));
      await t.pumpAndSettle();
      await t.tap(find.byType(DropdownButtonFormField<String>));
      await t.pumpAndSettle();
      await t.tap(find.text('Uống nước').last);
      await t.pumpAndSettle();
      await t.enterText(find.byType(TextFormField).first, '$marker WATER');
      await t.enterText(find.byType(TextFormField).at(1), '17.25');
      await SystemChannels.textInput.invokeMethod<void>('TextInput.hide');
      await t.scrollUntilVisible(
        find.text('Lưu bản ghi'),
        150,
        scrollable: find.byType(Scrollable).first,
      );
      await t.pumpAndSettle();
      await t.tap(find.text('Lưu bản ghi'));
      for (var i = 0; i < 30; i++) {
        await t.pump(const Duration(seconds: 1));
        if (find.text('Lưu bản ghi').evaluate().isEmpty &&
            find.text('Đang lưu…').evaluate().isEmpty) {
          break;
        }
      }
      final life = await service.request('/care/1/lifestyle') as Map;
      final savedWater = (life['rows'] as List)
          .where((r) => r['noiDung'] == '$marker WATER')
          .toList();
      expect(savedWater.length, 1);
      expect(savedWater.single['luong'], 17.25);
      debugPrint('ANDROID_CARE_PASS_LIFESTYLE_UI_WRITE_SOURCE_API');
      await show(const CareHandoffScreen(profileId: 1), 'HANDOFF_A');
      await t.tap(find.text('Tạo bàn giao'));
      await t.pumpAndSettle();
      await t.enterText(find.byType(TextFormField).first, '$marker HANDOFF');
      await SystemChannels.textInput.invokeMethod<void>('TextInput.hide');
      await t.scrollUntilVisible(
        find.text('Lưu bàn giao'),
        150,
        scrollable: find.byType(Scrollable).first,
      );
      await t.pumpAndSettle();
      await t.tap(find.text('Lưu bàn giao'));
      for (var i = 0; i < 30; i++) {
        await t.pump(const Duration(seconds: 1));
        if (find.text('Lưu bàn giao').evaluate().isEmpty &&
            find.text('Đang lưu…').evaluate().isEmpty) {
          break;
        }
      }
      final handoffs = await service.request('/care/1/handoffs') as Map;
      expect(
        (handoffs['rows'] as List)
            .where((r) => r['daLam'] == '$marker HANDOFF')
            .length,
        1,
      );
      debugPrint('ANDROID_CARE_PASS_HANDOFF_UI_WRITE_SOURCE_API');
      await show(const CareReportScreen(profileId: 1), 'REPORT_7_A');
      await show(
        const CareReportScreen(
          profileId: 1,
          initialDays: 30,
          key: ValueKey('30'),
        ),
        'REPORT_30_A',
      );
      await show(const CareTodayScreen(profileId: 2), 'TODAY_B');
      await show(const CareReportScreen(profileId: 2), 'REPORT_B');
      expect(await LocalNotificationService.areNotificationsEnabled(), true);
      final planSource = await service.plans(1);
      final reminderItems = (planSource['occurrences'] as List)
          .map((r) => Map<String, dynamic>.from(r as Map))
          .toList();
      await CareReminderService.sync(1, reminderItems, true);
      final plugin = FlutterLocalNotificationsPlugin();
      final first = (await plugin.pendingNotificationRequests())
          .where((r) => r.payload == 'care:1')
          .toList();
      expect(
        first.length,
        CareReminderService.pending(
          reminderItems,
          DateTime.now(),
        ).take(200).length,
      );
      expect(first, isNotEmpty);
      await CareReminderService.sync(1, reminderItems, true);
      final again = (await plugin.pendingNotificationRequests())
          .where((r) => r.payload == 'care:1')
          .toList();
      expect(again.map((r) => r.id).toSet(), first.map((r) => r.id).toSet());
      final bPlans = await service.plans(2);
      await CareReminderService.sync(
        2,
        (bPlans['occurrences'] as List)
            .map((r) => Map<String, dynamic>.from(r as Map))
            .toList(),
        true,
      );
      expect(
        (await plugin.pendingNotificationRequests()).where(
          (r) => r.payload?.startsWith('care:') == true,
        ),
        isEmpty,
      );
      debugPrint(
        'ANDROID_CARE_PASS_NATIVE_PENDING_REMINDERS_DEDUP_PROFILE_SWITCH',
      );
      await AuthService.instance.login('test.elder.a', credentials['password']);
      await show(const CareLifestyleScreen(profileId: 1), 'ELDER_READ_ONLY');
      expect(find.text('Ghi sinh hoạt'), findsNothing);
      try {
        await service.request('/care/1/handoffs');
        fail('Internal handoff exposed');
      } on ApiException catch (e) {
        expect(e.statusCode, 403);
      }
      try {
        await service.request('/care/2/report');
        fail('Other profile exposed');
      } on ApiException catch (e) {
        expect(e.statusCode, 403);
      }
      debugPrint('ANDROID_CARE_PASS_BACKEND_PERMISSIONS');
    } finally {
      credentials.clear();
      bootstrap.close();
      await ApiClient.clearSession();
      await t.pumpWidget(const MaterialApp(home: SizedBox()));
    }
  });
}
