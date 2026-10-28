import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:elderly_care_app/screens/health/health_dashboard_ui.dart';
import 'package:elderly_care_app/screens/health/health_screen.dart';
import 'package:elderly_care_app/services/api_client.dart';
import 'package:elderly_care_app/services/health_metric_service.dart';
import 'health_dashboard_ui_test.dart' as health;
import 'home_dashboard_ui_test.dart' show HomeUiFixture, settleHomeUi;

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();
  late health.HealthUiAdapter adapter;
  late HomeUiFixture fixture;
  setUp(() async {
    adapter = health.HealthUiAdapter();
    fixture = HomeUiFixture(adapter);
    await fixture.install();
    HealthMetricService.instance.clearCache();
  });
  tearDown(() {
    HealthMetricService.instance.clearCache();
    fixture.dispose();
  });
  String value(WidgetTester tester) => tester
      .widget<TextField>(find.byKey(const ValueKey('health-value-field')))
      .controller!
      .text;

  testWidgets('HR 85 is not carried into a new SpO2 or a reopened form', (
    tester,
  ) async {
    await tester.pumpWidget(health.healthUiApp());
    await settleHomeUi(tester);
    await health.chooseHealthType(tester, 'Nhịp tim');
    await health.openHealthSheet(tester);
    await tester.enterText(
      find.byKey(const ValueKey('health-value-field')),
      '85',
    );
    await tester.tap(find.byKey(const ValueKey('health-close-sheet')));
    await tester.pumpAndSettle();
    await health.chooseHealthType(tester, 'SpO2');
    await health.openHealthSheet(tester);
    expect(value(tester), '');
    await health.tapHealthSave(tester);
    expect(adapter.writes, isEmpty);
  });

  testWidgets(
    'success clears the current fields and a new form, preventing a repeat of the old value',
    (tester) async {
      await tester.pumpWidget(health.healthUiApp());
      await settleHomeUi(tester);
      await health.openHealthSheet(tester);
      await health.enterHealthPressure(tester);
      await health.tapHealthSave(tester);
      expect(adapter.writes.length, 1);
      for (final key in ['health-field-Tâm thu', 'health-field-Tâm trương']) {
        expect(
          tester.widget<TextField>(find.byKey(ValueKey(key))).controller!.text,
          '',
        );
      }
      await tester.pump(const Duration(seconds: 5));
      await settleHomeUi(tester);
      await tester.tap(find.byKey(const ValueKey('health-close-sheet')));
      await tester.pumpAndSettle();
      await health.openHealthSheet(tester);
      expect(
        tester
            .widget<TextField>(
              find.byKey(const ValueKey('health-field-Tâm thu')),
            )
            .controller!
            .text,
        '',
      );
      await health.tapHealthSave(tester);
      expect(adapter.writes.length, 1);
    },
  );

  testWidgets(
    'failed save preserves the same-type draft and never retries automatically',
    (tester) async {
      adapter.rejectType = 2;
      await tester.pumpWidget(health.healthUiApp());
      await settleHomeUi(tester);
      await health.chooseHealthType(tester, 'Nhịp tim');
      await health.openHealthSheet(tester);
      await tester.enterText(
        find.byKey(const ValueKey('health-value-field')),
        '85',
      );
      await health.tapHealthSave(tester);
      expect(value(tester), '85');
      await tester.pump(const Duration(seconds: 20));
      expect(adapter.writes.length, 1);
      expect(adapter.readings.where((row) => row['id'] != null), isEmpty);
    },
  );

  testWidgets(
    'session change closes the draft and discards a late save response from the old account',
    (tester) async {
      adapter.heldSave = Completer<void>();
      await tester.pumpWidget(health.healthUiApp());
      await settleHomeUi(tester);
      await health.chooseHealthType(tester, 'Nhịp tim');
      await health.openHealthSheet(tester);
      await tester.enterText(
        find.byKey(const ValueKey('health-value-field')),
        '85',
      );
      await health.tapHealthSave(tester);
      expect(adapter.writes.length, 1);
      await tester.runAsync(ApiClient.clearSession);
      await tester.pumpAndSettle();
      expect(find.byType(HealthMeasurementSheet), findsNothing);
      adapter.heldSave!.complete();
      await settleHomeUi(tester);
      expect(find.text('Đã lưu chỉ số sức khỏe.'), findsNothing);
      expect(
        find.textContaining('Phiên đăng nhập đã thay đổi'),
        findsOneWidget,
      );
      expect(tester.takeException(), isNull);
    },
  );

  testWidgets(
    'legacy form resets both displayed text and payload state when changing type',
    (tester) async {
      await tester.pumpWidget(const MaterialApp(home: HealthScreen()));
      await settleHomeUi(tester);
      await tester.tap(find.text('CẬP NHẬT'));
      await tester.pumpAndSettle();
      await tester.enterText(
        find.byKey(const ValueKey('health-primary-1')),
        '139',
      );
      await tester.enterText(
        find.byKey(const ValueKey('health-secondary-1')),
        '81',
      );
      await tester.enterText(
        find.byKey(const ValueKey('health-note-1')),
        'Bản nháp BP',
      );
      await tester.ensureVisible(find.byType(DropdownButton<int>));
      await tester.tap(find.byType(DropdownButton<int>));
      await tester.pumpAndSettle();
      await tester.tap(find.text('Nhịp tim').last);
      await tester.pumpAndSettle();
      final primary = find.byKey(const ValueKey('health-primary-2'));
      final editable = tester.widget<EditableText>(
        find.descendant(of: primary, matching: find.byType(EditableText)),
      );
      expect(editable.controller.text, '');
      expect(find.byKey(const ValueKey('health-secondary-1')), findsNothing);
      final note = find.byKey(const ValueKey('health-note-2'));
      expect(
        tester
            .widget<EditableText>(
              find.descendant(of: note, matching: find.byType(EditableText)),
            )
            .controller
            .text,
        '',
      );
      await tester.ensureVisible(find.text('LƯU CHỈ SỐ'));
      await tester.tap(find.text('LƯU CHỈ SỐ'));
      await settleHomeUi(tester);
      expect(adapter.writes, isEmpty);
      await tester.runAsync(ApiClient.clearSession);
      await tester.pumpAndSettle();
      expect(find.byType(DropdownButton<int>), findsNothing);
      expect(tester.takeException(), isNull);
    },
  );
}
