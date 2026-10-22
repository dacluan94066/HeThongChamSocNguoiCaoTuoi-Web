import 'dart:async';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:elderly_care_app/screens/medication/medication_dashboard_ui.dart';
import 'package:elderly_care_app/services/mobile_realtime_service.dart';
import 'medication_dashboard_ui_test.dart'
    show
        MedicationUiAdapter,
        MedicationUiFixture,
        medicationUiApp,
        settleMedicationUi,
        revealMedication;

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();
  late MedicationUiAdapter api;
  late MedicationUiFixture fixture;
  setUp(() async {
    api = MedicationUiAdapter();
    fixture = MedicationUiFixture(api);
    await fixture.install();
  });
  tearDown(() => fixture.dispose());
  Finder getLateButton() => find.text('Xác nhận đã uống muộn');
  MedicationDoseCard missedCard(WidgetTester tester) =>
      tester.widget<MedicationDoseCard>(
        find.byKey(const ValueKey('medication-dose-3')),
      );
  Future<void> start(WidgetTester tester) async {
    await tester.pumpWidget(medicationUiApp());
    await settleMedicationUi(tester);
  }

  Future<void> open(WidgetTester tester) async {
    await revealMedication(tester, getLateButton());
    await tester.tap(getLateButton());
    await tester.pumpAndSettle();
    expect(find.byType(MedicationLateConfirmationDialog), findsOneWidget);
  }

  testWidgets(
    'only today BoLo gets late action; other statuses keep existing behavior',
    (tester) async {
      await start(tester);
      final cards = tester
          .widgetList<MedicationDoseCard>(find.byType(MedicationDoseCard))
          .toList();
      expect(cards[0].onConfirm, isNull); // DaUong
      expect(cards[1].onConfirm, isNotNull); // Original status sheet
      expect(cards[2].onConfirm, isNotNull); // BoLo, today only
      expect(cards[3].onConfirm, isNull); // TuChoi is not silently enabled
      await open(tester);
      expect(
        find.text('THUỐC KIỂM THỬ 3 / ${DateTime.now().day}'),
        findsWidgets,
      );
      expect(find.text('15:00 • LIỀU API 3'), findsOneWidget);
      expect(
        find.textContaining('không phải hướng dẫn uống thêm thuốc'),
        findsOneWidget,
      );
      expect(find.byType(MedicationStatusSheet), findsNothing);
      expect(api.confirmations, isEmpty);
    },
  );
  testWidgets('cancel never changes a missed dose or progress', (tester) async {
    await start(tester);
    await open(tester);
    await tester.tap(find.text('Hủy'));
    await tester.pumpAndSettle();
    expect(api.confirmations, isEmpty);
    expect(missedCard(tester).status, 'BoLo');
    expect(find.text('Đã uống 1/4 liều'), findsOneWidget);
  });
  testWidgets('back dismiss never writes', (tester) async {
    await start(tester);
    await open(tester);
    Navigator.of(
      tester.element(find.byType(MedicationLateConfirmationDialog)),
    ).pop();
    await tester.pumpAndSettle();
    expect(api.confirmations, isEmpty);
    expect(missedCard(tester).status, 'BoLo');
  });
  testWidgets(
    'explicit confirmation sends one existing PATCH and uses returned state/progress',
    (tester) async {
      await start(tester);
      await open(tester);
      await tester.tap(find.text('Tôi đã uống liều này'));
      await settleMedicationUi(tester);
      expect(api.confirmations, hasLength(1));
      expect(api.confirmations.single.path, '/medication-schedule/3/confirm');
      expect(api.confirmations.single.data, {'trangThai': 'DaUong'});
      expect(missedCard(tester).status, 'DaUong');
      expect(missedCard(tester).onConfirm, isNull);
      expect(find.text('Đã uống 2/4 liều'), findsOneWidget);
      expect(getLateButton(), findsNothing);
      expect(find.text('Đã xác nhận uống thuốc.'), findsOneWidget);
      expect(fixture.notifications.cancelled, contains(100003));
    },
  );
  for (final dayIndex in [2, 4]) {
    testWidgets(
      'missed dose on ${dayIndex == 2 ? 'past' : 'future'} date stays read-only',
      (tester) async {
        await start(tester);
        final day = find.byKey(ValueKey('medication-day-$dayIndex'));
        await tester.ensureVisible(day);
        await tester.tap(day);
        await settleMedicationUi(tester);
        expect(
          tester
              .widgetList<MedicationDoseCard>(find.byType(MedicationDoseCard))
              .every((c) => c.onConfirm == null),
          isTrue,
        );
        expect(getLateButton(), findsNothing);
        expect(api.confirmations, isEmpty);
      },
    );
  }
  for (final status in [403, 422, 500]) {
    testWidgets(
      'API $status preserves missed status, error text, progress and retry',
      (tester) async {
        await start(tester);
        await open(tester);
        api.deniedStatus = status;
        await tester.tap(find.text('Tôi đã uống liều này'));
        await settleMedicationUi(tester);
        expect(
          find.text('Bạn không có quyền xác nhận cữ thuốc này.'),
          findsOneWidget,
        );
        expect(missedCard(tester).status, 'BoLo');
        expect(missedCard(tester).onConfirm, isNotNull);
        expect(missedCard(tester).updating, isFalse);
        expect(find.text('Đã uống 1/4 liều'), findsOneWidget);
        expect(fixture.notifications.cancelled, isNot(contains(100003)));
        api.deniedStatus = null;
        await open(tester);
        await tester.tap(find.text('Tôi đã uống liều này'));
        await settleMedicationUi(tester);
        expect(missedCard(tester).status, 'DaUong');
        expect(api.confirmations, hasLength(2));
      },
    );
  }
  for (final offset in [-1, 1]) {
    testWidgets(
      'cross-day API row $offset is never eligible even under today filter',
      (tester) async {
        final now = DateTime.now();
        api.custom = [
          {
            'id': 3,
            'tenThuoc': 'WRONG-DAY FIXTURE',
            'trangThai': 'BoLo',
            'thoiGianDuKien': DateTime(
              now.year,
              now.month,
              now.day + offset,
              8,
            ).toIso8601String(),
          },
        ];
        await start(tester);
        expect(missedCard(tester).onConfirm, isNull);
        expect(getLateButton(), findsNothing);
        expect(api.confirmations, isEmpty);
      },
    );
  }
  testWidgets(
    'in-flight late confirmation disables action and never optimistically marks taken',
    (tester) async {
      await start(tester);
      await open(tester);
      api.confirmGate = Completer<void>();
      await tester.tap(find.text('Tôi đã uống liều này'));
      for (var i = 0; i < 4; i++) {
        await tester.pump(const Duration(milliseconds: 200));
        await tester.runAsync(
          () => Future<void>.delayed(const Duration(milliseconds: 30)),
        );
      }
      expect(api.confirmations, hasLength(1));
      expect(missedCard(tester).status, 'BoLo');
      expect(missedCard(tester).updating, isTrue);
      expect(missedCard(tester).onConfirm, isNull);
      expect(getLateButton(), findsNothing);
      api.confirmGate!.complete();
      await settleMedicationUi(tester);
      expect(api.confirmations, hasLength(1));
      expect(missedCard(tester).status, 'DaUong');
    },
  );
  testWidgets(
    'realtime status change while dialog open blocks stale late confirmation',
    (tester) async {
      await start(tester);
      await open(tester);
      api.changed[3] = 'DaUong';
      MobileRealtimeService.instance.medicationRevision.value++;
      await settleMedicationUi(tester);
      await tester.tap(find.text('Tôi đã uống liều này'));
      await settleMedicationUi(tester);
      expect(api.confirmations, isEmpty);
      expect(missedCard(tester).status, 'DaUong');
      expect(
        find.text('Liều thuốc đã thay đổi. Vui lòng kiểm tra lại lịch.'),
        findsOneWidget,
      );
    },
  );
  for (final width in [320.0, 390.0, 768.0]) {
    for (final scale in [1.0, 1.8]) {
      testWidgets('late button and long dialog fit ${width}dp ${scale}x', (
        tester,
      ) async {
        tester.view.physicalSize = Size(width, 820);
        tester.view.devicePixelRatio = 1;
        addTearDown(tester.view.resetPhysicalSize);
        addTearDown(tester.view.resetDevicePixelRatio);
        await tester.pumpWidget(
          medicationUiApp(scale: scale, withNavigation: true),
        );
        await settleMedicationUi(tester);
        await revealMedication(tester, getLateButton());
        expect(getLateButton().hitTestable(), findsOneWidget);
        expect(
          tester
              .getRect(
                find.widgetWithText(FilledButton, 'Xác nhận đã uống muộn'),
              )
              .bottom,
          lessThanOrEqualTo(
            tester
                .getRect(find.byKey(const ValueKey('floating-pill-navigation')))
                .top,
          ),
        );
        await tester.tap(getLateButton());
        await tester.pumpAndSettle();
        expect(find.text('Tôi đã uống liều này').hitTestable(), findsOneWidget);
        expect(find.text('Hủy').hitTestable(), findsOneWidget);
        expect(tester.takeException(), isNull);
        await tester.tap(find.text('Hủy'));
        await tester.pumpAndSettle();
        // The longest API text must wrap inside the same dialog, too.
        await tester.pumpWidget(const SizedBox.shrink());
        await tester.pumpAndSettle();
        await tester.pumpWidget(
          MaterialApp(
            builder: (context, child) => MediaQuery(
              data: MediaQuery.of(
                context,
              ).copyWith(textScaler: TextScaler.linear(scale)),
              child: child!,
            ),
            home: Scaffold(
              body: MedicationLateConfirmationDialog(
                name: MedicationUiAdapter.longName,
                detail: MedicationUiAdapter.longInstructions,
                onCancel: () {},
                onConfirm: () {},
              ),
            ),
          ),
        );
        await tester.pumpAndSettle();
        expect(find.text('Tôi đã uống liều này').hitTestable(), findsOneWidget);
        expect(tester.takeException(), isNull);
        expect(api.confirmations, isEmpty);
      });
    }
  }
}
