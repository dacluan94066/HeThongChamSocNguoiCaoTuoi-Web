// Opt-in: native print preview uses only a guarded synthetic SQL report.
import 'package:dio/dio.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:integration_test/integration_test.dart';
import 'package:elderly_care_app/services/api_client.dart';
import 'package:elderly_care_app/services/auth_service.dart';
import 'package:elderly_care_app/services/care_report_export_service.dart';
import 'package:elderly_care_app/services/local_notification_service.dart';
import 'package:elderly_care_app/screens/care/care_report_screen.dart';

void main() {
  IntegrationTestWidgetsFlutterBinding.ensureInitialized();
  testWidgets('Android native PDF preview from real synthetic report', (
    t,
  ) async {
    expect(ApiClient.baseUrl, 'http://127.0.0.1:5059/api');
    await LocalNotificationService.initialize();
    final bootstrap = Dio();
    final credentials = (await bootstrap.get<Map<String, dynamic>>(
      'http://127.0.0.1:15060/session',
    )).data!;
    expect(credentials['username'], 'test.caregiver');
    try {
      await AuthService.instance.login(
        credentials['username'],
        credentials['password'],
      );
      await t.pumpWidget(
        const MaterialApp(home: CareReportScreen(profileId: 1)),
      );
      for (var i = 0; i < 30; i++) {
        await t.pump(const Duration(seconds: 1));
        if (find.byType(CircularProgressIndicator).evaluate().isEmpty) break;
      }
      expect(find.text('Thử lại'), findsNothing);
      final r = (await ApiClient.instance.dio.get(
        '/care/1/report',
      )).data['data'];
      expect(r['profile']['hoTen'].toString(), startsWith('TEST ONLY'));
      // The test operator must use the Android preview; no automatic file save/share.
      await CareReportExportService.printReport(
        Map<String, dynamic>.from(r),
        ApiClient.sessionVersion,
      );
      debugPrint('ANDROID_PDF_NATIVE_PREVIEW_READY');
      await Future<void>.delayed(const Duration(seconds: 90));
    } finally {
      credentials.clear();
      bootstrap.close();
      await ApiClient.clearSession();
    }
  });
}
