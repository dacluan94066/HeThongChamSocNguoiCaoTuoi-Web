import 'dart:async';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:elderly_care_app/screens/appointments/appointment_screen.dart';
import 'package:elderly_care_app/screens/medication/medication_screen.dart';
import 'package:elderly_care_app/screens/schedule/schedule_screen.dart';
import 'package:elderly_care_app/screens/alerts/sos_screen.dart';
import 'package:elderly_care_app/screens/assistant/care_assistant_screen.dart';
import 'package:elderly_care_app/screens/assistant/care_assistant_records_screen.dart';
import 'package:elderly_care_app/models/care_assistant.dart';
import 'package:elderly_care_app/services/mobile_realtime_service.dart';
import 'home_dashboard_ui_test.dart' show HomeUiFixture;
import 'support/stitch_navigation_fixture.dart';

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();
  late StitchNavigationAdapter api;
  late HomeUiFixture fixture;
  setUp(() async {
    api = StitchNavigationAdapter();
    fixture = HomeUiFixture(api);
    await fixture.install();
  });
  tearDown(() => fixture.dispose());
  Future<void> start(
    WidgetTester tester, {
    double width = 390,
    double scale = 1,
  }) async {
    tester.view.devicePixelRatio = 1;
    tester.view.physicalSize = Size(width, 844);
    addTearDown(tester.view.resetPhysicalSize);
    addTearDown(tester.view.resetDevicePixelRatio);
    await tester.pumpWidget(stitchNavigationApp(scale: scale));
    await settleStitchNavigation(tester);
  }

  Finder medicationScroll() => find
      .descendant(
        of: find.byKey(const ValueKey('medication-list')),
        matching: find.byType(Scrollable),
      )
      .first;

  testWidgets(
    'lazy schedule defaults to medication; repeated selection reuses states and cache',
    (tester) async {
      await start(tester);
      expect(find.byType(ScheduleScreen, skipOffstage: false), findsNothing);
      await selectStitchNav(tester, 1);
      expect(find.byType(MedicationScreen), findsOneWidget);
      expect(find.byType(AppointmentScreen, skipOffstage: false), findsNothing);
      final med = tester.state(find.byType(MedicationScreen));
      final reads = api.requests.length;
      await selectStitchNav(tester, 1);
      expect(tester.state(find.byType(MedicationScreen)), same(med));
      expect(api.requests.length, reads);
      await selectScheduleTab(tester, 1);
      final appointment = tester.state(find.byType(AppointmentScreen));
      await selectScheduleTab(tester, 0);
      expect(tester.state(find.byType(MedicationScreen)), same(med));
      await selectScheduleTab(tester, 1);
      expect(tester.state(find.byType(AppointmentScreen)), same(appointment));
      expect(api.requests.every((r) => r.method == 'GET'), isTrue);
    },
  );
  testWidgets(
    'selected medicine day and scroll survive tab switches and leaving schedule',
    (tester) async {
      await start(tester);
      await selectStitchNav(tester, 1);
      await tester.ensureVisible(
        find.byKey(const ValueKey('medication-day-4')),
      );
      await tester.tap(find.byKey(const ValueKey('medication-day-4')));
      await settleStitchNavigation(tester);
      final lastDay = api.requests
          .lastWhere(
            (r) =>
                r.path == '/elderly/me/medication-schedule' &&
                r.queryParameters['tuNgay'] == r.queryParameters['denNgay'],
          )
          .queryParameters['tuNgay'];
      await tester.drag(
        find.byKey(const ValueKey('medication-list')),
        const Offset(0, -260),
      );
      await tester.pumpAndSettle();
      final scroll = tester
          .state<ScrollableState>(medicationScroll())
          .position
          .pixels;
      final state = tester.state(find.byType(MedicationScreen));
      await selectScheduleTab(tester, 1);
      await selectStitchNav(tester, 0);
      await selectStitchNav(tester, 1);
      expect(
        find.byType(AppointmentScreen),
        findsOneWidget,
      ); // Remember last tab.
      await selectScheduleTab(tester, 0);
      expect(tester.state(find.byType(MedicationScreen)), same(state));
      expect(
        tester.state<ScrollableState>(medicationScroll()).position.pixels,
        closeTo(scroll, .1),
      );
      expect(
        api.requests
            .lastWhere(
              (r) =>
                  r.path == '/elderly/me/medication-schedule' &&
                  r.queryParameters['tuNgay'] == r.queryParameters['denNgay'],
            )
            .queryParameters['tuNgay'],
        lastDay,
      );
      expect(
        find.text('Ngày khác chỉ dùng để xem lịch thuốc.'),
        findsOneWidget,
      );
    },
  );
  testWidgets(
    'appointment filter survives switches, home and realtime refresh',
    (tester) async {
      await start(tester);
      await selectStitchNav(tester, 1);
      await selectScheduleTab(tester, 1);
      final filter = find.byKey(const ValueKey('appointment-filter-2'));
      await tester.ensureVisible(filter);
      await tester.pumpAndSettle();
      await tester.tap(filter);
      await tester.pumpAndSettle();
      expect(tester.widget<ChoiceChip>(filter).selected, isTrue);
      final state = tester.state(find.byType(AppointmentScreen));
      await selectScheduleTab(tester, 0);
      await selectStitchNav(tester, 0);
      await selectStitchNav(tester, 1);
      await selectScheduleTab(tester, 1);
      expect(tester.state(find.byType(AppointmentScreen)), same(state));
      expect(tester.widget<ChoiceChip>(filter).selected, isTrue);
      api.appointmentRevision++;
      MobileRealtimeService.instance.appointmentRevision.value++;
      await settleStitchNavigation(tester);
      expect(tester.widget<ChoiceChip>(filter).selected, isTrue);
      expect(api.requests.every((r) => r.method == 'GET'), isTrue);
    },
  );
  testWidgets(
    'Home medication shortcut targets medication even if schedule last used appointments',
    (tester) async {
      await start(tester);
      await selectStitchNav(tester, 1);
      await selectScheduleTab(tester, 1);
      await selectStitchNav(tester, 0);
      await tester.tap(find.byKey(const ValueKey('home-quick-Lịch thuốc')));
      await settleStitchNavigation(tester);
      expect(find.byType(MedicationScreen), findsOneWidget);
    },
  );
  testWidgets(
    'Home appointment card still pushes original screen and back restores selected tab',
    (tester) async {
      await start(tester);
      final action = find.text('Xem tất cả lịch khám');
      await tester.scrollUntilVisible(
        action,
        240,
        scrollable: find.byType(Scrollable).first,
      );
      await tester.pumpAndSettle();
      await tester.tap(action);
      await settleStitchNavigation(tester);
      expect(find.byType(AppointmentScreen), findsOneWidget);
      expect(find.byType(ScheduleScreen), findsNothing);
      Navigator.of(tester.element(find.byType(AppointmentScreen))).pop();
      await settleStitchNavigation(tester);
      expect(find.byKey(const ValueKey('home-nav-0')), findsOneWidget);
    },
  );
  for (final route in ['/medications', '/appointments']) {
    testWidgets(
      'production named route $route opens old screen and back retains schedule state',
      (tester) async {
        await start(tester);
        await selectStitchNav(tester, 1);
        await selectScheduleTab(tester, 1);
        final state = tester.state(find.byType(AppointmentScreen));
        unawaited(
          Navigator.of(
            tester.element(find.byType(ScheduleScreen)),
          ).pushNamed(route),
        );
        await settleStitchNavigation(tester);
        expect(
          find.byType(
            route == '/medications' ? MedicationScreen : AppointmentScreen,
          ),
          findsOneWidget,
        );
        Navigator.of(
          tester.element(
            find.byType(
              route == '/medications' ? MedicationScreen : AppointmentScreen,
            ),
          ),
        ).pop();
        await settleStitchNavigation(tester);
        expect(tester.state(find.byType(AppointmentScreen)), same(state));
        expect(api.requests.every((r) => r.method == 'GET'), isTrue);
      },
    );
  }
  for (final i in [0, 1]) {
    testWidgets(
      'notification $i related action opens original medication/appointment screen',
      (tester) async {
        await start(tester);
        await selectStitchNav(tester, 3);
        final notification = find.byKey(ValueKey('notification-${801 + i}'));
        await tester.scrollUntilVisible(
          notification,
          240,
          scrollable: find
              .descendant(
                of: find.byKey(const ValueKey('notification-list')),
                matching: find.byType(Scrollable),
              )
              .first,
        );
        await tester.pumpAndSettle();
        await tester.tap(notification);
        // Existing notification reading spinner animates underneath its modal.
        for (var j = 0; j < 6; j++) {
          await tester.pump(const Duration(milliseconds: 200));
          await tester.runAsync(
            () => Future<void>.delayed(const Duration(milliseconds: 30)),
          );
        }
        await tester.tap(
          find.text(i == 0 ? 'Xem lịch uống thuốc' : 'Xem lịch khám'),
        );
        await settleStitchNavigation(tester);
        expect(
          find.byType(i == 0 ? MedicationScreen : AppointmentScreen),
          findsOneWidget,
        );
        Navigator.of(
          tester.element(
            find.byType(i == 0 ? MedicationScreen : AppointmentScreen),
          ),
        ).pop();
        await settleStitchNavigation(tester);
        expect(find.byKey(const ValueKey('notification-list')), findsOneWidget);
        expect(api.requests.every((r) => r.method == 'GET'), isTrue);
      },
    );
  }
  testWidgets(
    'AI existing medication and appointment actions keep original records navigation',
    (tester) async {
      await start(tester);
      await tester.tap(find.byKey(const ValueKey('draggable-assistant-fab')));
      await settleStitchNavigation(tester);
      expect(find.byType(CareAssistantScreen), findsOneWidget);
      await tester.enterText(find.byType(TextField), 'Lịch của tôi');
      await tester.tap(find.byTooltip('Gửi câu hỏi'));
      await settleStitchNavigation(tester);
      for (final action in [
        AssistantAction.medications,
        AssistantAction.appointments,
      ]) {
        final button = find.widgetWithText(OutlinedButton, action.label);
        for (
          var attempt = 0;
          attempt < 6 && button.evaluate().isEmpty;
          attempt++
        ) {
          await tester.drag(find.byType(ListView).last, const Offset(0, -300));
          await settleStitchNavigation(tester);
        }
        await tester.ensureVisible(button);
        await tester.pumpAndSettle();
        await tester.tap(button);
        await settleStitchNavigation(tester);
        expect(
          tester
              .widget<CareAssistantRecordsScreen>(
                find.byType(CareAssistantRecordsScreen),
              )
              .action,
          action,
        );
        Navigator.of(
          tester.element(find.byType(CareAssistantRecordsScreen)),
        ).pop();
        await settleStitchNavigation(tester);
      }
      expect(
        api.requests
            .where((r) => r.method != 'GET')
            .every((r) => r.path.startsWith('/care-assistant/')),
        isTrue,
      );
    },
  );
  testWidgets(
    'center SOS only navigates; short hold never sends, AI stays hidden',
    (tester) async {
      await start(tester);
      await selectStitchNav(tester, 2);
      expect(find.byType(SosScreen), findsOneWidget);
      expect(
        find.byKey(const ValueKey('draggable-assistant-fab')),
        findsNothing,
      );
      final target = find.byKey(const ValueKey('sos-hold-target'));
      await tester.scrollUntilVisible(
        target,
        220,
        scrollable: find
            .descendant(
              of: find.byKey(const ValueKey('sos-list')),
              matching: find.byType(Scrollable),
            )
            .first,
      );
      final gesture = await tester.startGesture(tester.getCenter(target));
      await tester.pump(const Duration(milliseconds: 500));
      await gesture.up();
      await tester.pumpAndSettle();
      expect(api.requests.every((r) => r.method == 'GET'), isTrue);
    },
  );
  testWidgets(
    'existing foreground refresh pauses in background, resumes and disposes normally',
    (tester) async {
      await start(tester);
      await selectStitchNav(tester, 1);
      await selectScheduleTab(tester, 1);
      tester.binding.handleAppLifecycleStateChanged(AppLifecycleState.inactive);
      tester.binding.handleAppLifecycleStateChanged(AppLifecycleState.hidden);
      tester.binding.handleAppLifecycleStateChanged(AppLifecycleState.paused);
      final before = api.requests.length;
      await tester.pump(const Duration(seconds: 31));
      expect(api.requests.length, before);
      tester.binding.handleAppLifecycleStateChanged(AppLifecycleState.hidden);
      tester.binding.handleAppLifecycleStateChanged(AppLifecycleState.inactive);
      tester.binding.handleAppLifecycleStateChanged(AppLifecycleState.resumed);
      await settleStitchNavigation(tester);
      expect(api.requests.length, greaterThan(before));
      await tester.pumpWidget(const SizedBox.shrink());
      await tester.pumpAndSettle();
      final disposed = api.requests.length;
      await tester.pump(const Duration(seconds: 31));
      MobileRealtimeService.instance.appointmentRevision.value++;
      MobileRealtimeService.instance.medicationRevision.value++;
      await tester.pump();
      expect(api.requests.length, disposed);
    },
  );
  for (final width in [320.0, 360.0, 390.0, 412.0, 768.0]) {
    for (final scale in [1.0, 1.2, 1.4, 1.6, 1.8]) {
      testWidgets(
        'both schedule tabs and independent AI fit ${width}dp ${scale}x',
        (tester) async {
          await start(tester, width: width, scale: scale);
          await selectStitchNav(tester, 1);
          for (final tab in [0, 1]) {
            await selectScheduleTab(tester, tab);
            expect(
              find.byKey(ValueKey('schedule-tab-$tab')).hitTestable(),
              findsOneWidget,
            );
            final pill = tester.getRect(
              find.byKey(const ValueKey('floating-pill-navigation')),
            );
            final fab = tester.getRect(
              find.byKey(const ValueKey('draggable-assistant-fab')),
            );
            expect(pill.overlaps(fab), isFalse);
            expect(fab.bottom, lessThan(pill.top));
            expect(tester.takeException(), isNull);
          }
          expect(api.requests.every((r) => r.method == 'GET'), isTrue);
        },
      );
    }
  }
}
