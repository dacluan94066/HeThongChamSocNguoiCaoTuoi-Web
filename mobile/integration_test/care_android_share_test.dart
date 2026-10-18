// Explicit opt-in: guarded fake SQL API; operator selects an already exported
// TEST ONLY PDF and dismisses the Android Sharesheet without sending it.
import 'package:dio/dio.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:integration_test/integration_test.dart';
import 'package:elderly_care_app/services/api_client.dart';
import 'package:elderly_care_app/services/auth_service.dart';
import 'package:elderly_care_app/screens/care/care_report_screen.dart';

void main() {
  IntegrationTestWidgetsFlutterBinding.ensureInitialized();
  testWidgets('Native existing PDF selection and sharesheet cancellation', (
    t,
  ) async {
    expect(ApiClient.baseUrl, 'http://127.0.0.1:5059/api');
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
        MaterialApp(
          builder: (context, child) => MediaQuery(
            data: MediaQuery.of(
              context,
            ).copyWith(textScaler: const TextScaler.linear(2)),
            child: child!,
          ),
          home: const CareReportScreen(profileId: 1),
        ),
      );
      for (var i = 0; i < 30; i++) {
        await t.pump(const Duration(seconds: 1));
        if (find.byType(CircularProgressIndicator).evaluate().isEmpty) break;
      }
      expect(find.text('Thử lại'), findsNothing);
      expect(t.takeException(), isNull);
      debugPrint('ANDROID_REPORT_LARGE_TEXT_PASS');
      await t.tap(find.byTooltip('Chia sẻ PDF đã xuất'));
      await t.pumpAndSettle();
      await t.tap(find.text('Chọn file'));
      await t.pumpAndSettle();
      debugPrint('ANDROID_EXISTING_PDF_PICKER_READY');
      // Do not finish merely because a timer elapsed while DocumentsUI is open.
      // Wait for native cancellation/chooser return to release the share button.
      var closed = false;
      for (var i = 0; i < 240; i++) {
        await Future<void>.delayed(const Duration(seconds: 1));
        await t.pump();
        final button = t.widget<IconButton>(
          find
              .ancestor(
                of: find.byTooltip('Chia sẻ PDF đã xuất'),
                matching: find.byType(IconButton),
              )
              .first,
        );
        if (button.onPressed != null) {
          closed = true;
          break;
        }
      }
      expect(closed, isTrue, reason: 'Native share flow must actually return');
      await t.pumpAndSettle();
      expect(find.byType(SnackBar), findsNothing);
      expect(t.takeException(), isNull);
      debugPrint('ANDROID_SHARE_DISMISS_NO_FALSE_SUCCESS_PASS');
    } finally {
      credentials.clear();
      bootstrap.close();
      await ApiClient.clearSession();
      await t.pumpWidget(const SizedBox.shrink());
      await t.pumpAndSettle();
    }
  });
}
