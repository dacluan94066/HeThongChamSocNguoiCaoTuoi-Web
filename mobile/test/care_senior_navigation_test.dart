import 'package:flutter/material.dart';
import 'package:flutter/rendering.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:elderly_care_app/theme/care_senior_theme.dart';
import 'package:elderly_care_app/widgets/care_senior_ui.dart';
import 'package:elderly_care_app/widgets/draggable_assistant_fab.dart';
import 'home_dashboard_ui_test.dart'
    show HomeUiAdapter, HomeUiFixture, homeUiApp, settleHomeUi;

void main() {
  testWidgets(
    'Large text can use two rows while retaining all six destinations',
    (tester) async {
      await tester.binding.setSurfaceSize(const Size(320, 820));
      addTearDown(() => tester.binding.setSurfaceSize(null));
      await tester.pumpWidget(
        MaterialApp(
          theme: CareSeniorTheme.data,
          builder: (context, child) => MediaQuery(
            data: MediaQuery.of(
              context,
            ).copyWith(textScaler: const TextScaler.linear(1.8)),
            child: child!,
          ),
          home: Scaffold(
            bottomNavigationBar: AppBottomNavigation(
              selectedIndex: 0,
              onSelected: (_) {},
            ),
          ),
        ),
      );
      final first = tester.getCenter(
        find.byKey(const ValueKey('home-nav-circle-0')),
      );
      final third = tester.getCenter(
        find.byKey(const ValueKey('home-nav-circle-2')),
      );
      final fourth = tester.getCenter(
        find.byKey(const ValueKey('home-nav-circle-3')),
      );
      expect(first.dy, closeTo(third.dy, 0.1));
      expect(fourth.dy, greaterThan(first.dy));
      expect(find.byType(Icon), findsNWidgets(6));
      expect(tester.takeException(), isNull);
    },
  );
  testWidgets(
    'Floating pill reserves body space and respects Android safe insets',
    (tester) async {
      await tester.binding.setSurfaceSize(const Size(360, 820));
      addTearDown(() => tester.binding.setSurfaceSize(null));
      await tester.pumpWidget(
        MaterialApp(
          theme: CareSeniorTheme.data,
          builder: (context, child) => MediaQuery(
            data: MediaQuery.of(
              context,
            ).copyWith(padding: const EdgeInsets.only(bottom: 34)),
            child: child!,
          ),
          home: Scaffold(
            body: const SizedBox.expand(key: ValueKey('navigation-test-body')),
            bottomNavigationBar: AppBottomNavigation(
              selectedIndex: 0,
              onSelected: (_) {},
            ),
          ),
        ),
      );
      final pill = find.byKey(const ValueKey('floating-pill-navigation'));
      final box = tester.widget<Container>(pill).decoration! as BoxDecoration;
      expect(box.color, Colors.white);
      expect(box.borderRadius, BorderRadius.circular(40));
      expect(box.boxShadow, isNotEmpty);
      final bounds = tester.getRect(pill);
      expect(bounds.left, greaterThanOrEqualTo(10));
      expect(bounds.right, lessThanOrEqualTo(350));
      expect(bounds.bottom, lessThanOrEqualTo(820 - 34));
      expect(
        tester
            .getBottomRight(find.byKey(const ValueKey('navigation-test-body')))
            .dy,
        lessThan(bounds.top),
      );
      expect(tester.takeException(), isNull);
    },
  );

  testWidgets(
    'All six selection callbacks remain exact; SOS icon always remains red',
    (tester) async {
      var selected = 0;
      final events = <int>[];
      await tester.pumpWidget(
        MaterialApp(
          theme: CareSeniorTheme.data,
          home: StatefulBuilder(
            builder: (context, update) => Scaffold(
              bottomNavigationBar: AppBottomNavigation(
                selectedIndex: selected,
                onSelected: (index) => update(() {
                  selected = index;
                  events.add(index);
                }),
              ),
            ),
          ),
        ),
      );
      final originalHeight = tester
          .getSize(find.byKey(const ValueKey('floating-pill-navigation')))
          .height;
      for (var selectedIndex = 0; selectedIndex < 6; selectedIndex++) {
        await tester.tap(find.byKey(ValueKey('home-nav-$selectedIndex')));
        await tester.pump();
        await tester.pump(const Duration(milliseconds: 90));
        expect(tester.takeException(), isNull);
        await tester.pumpAndSettle();
        expect(
          tester
              .getSize(find.byKey(const ValueKey('floating-pill-navigation')))
              .height,
          originalHeight,
        );
        for (var index = 0; index < 6; index++) {
          final circle = tester.widget<AnimatedContainer>(
            find.byKey(ValueKey('home-nav-circle-$index')),
          );
          final decoration = circle.decoration! as BoxDecoration;
          expect(decoration.shape, BoxShape.circle);
          expect(
            decoration.color,
            index == selectedIndex
                ? const Color(0xff21966f)
                : const Color(0xfff0f3f1),
          );
          final icon = tester.widget<Icon>(
            find.byKey(ValueKey('home-nav-icon-$index')),
          );
          expect(
            icon.color,
            index == 3
                ? CareSeniorColors.danger
                : index == selectedIndex
                ? Colors.white
                : const Color(0xff5f6c65),
          );
          expect(circle.duration, const Duration(milliseconds: 180));
        }
      }
      expect(events, [0, 1, 2, 3, 4, 5]);
    },
  );

  testWidgets(
    'Pill hides for keyboard and restores without firing navigation callbacks',
    (tester) async {
      tester.view.physicalSize = const Size(360, 820);
      tester.view.devicePixelRatio = 1;
      addTearDown(tester.view.resetPhysicalSize);
      addTearDown(tester.view.resetDevicePixelRatio);
      addTearDown(tester.view.resetViewInsets);
      final selected = <int>[];
      await tester.pumpWidget(
        MaterialApp(
          home: Scaffold(
            body: const TextField(),
            bottomNavigationBar: AppBottomNavigation(
              selectedIndex: 2,
              onSelected: selected.add,
            ),
          ),
        ),
      );
      expect(
        find.byKey(const ValueKey('floating-pill-navigation')),
        findsOneWidget,
      );
      tester.view.viewInsets = const FakeViewPadding(bottom: 300);
      await tester.pumpAndSettle();
      expect(
        find.byKey(const ValueKey('floating-pill-navigation')),
        findsNothing,
      );
      expect(find.byType(TextField), findsOneWidget);
      tester.view.resetViewInsets();
      await tester.pumpAndSettle();
      expect(
        find.byKey(const ValueKey('floating-pill-navigation')),
        findsOneWidget,
      );
      expect(selected, isEmpty);
      expect(tester.takeException(), isNull);
    },
  );

  testWidgets('Reduced motion uses no selection animation', (tester) async {
    await tester.pumpWidget(
      MaterialApp(
        builder: (context, child) => MediaQuery(
          data: MediaQuery.of(context).copyWith(disableAnimations: true),
          child: child!,
        ),
        home: Scaffold(
          bottomNavigationBar: AppBottomNavigation(
            selectedIndex: 0,
            onSelected: (_) {},
          ),
        ),
      ),
    );
    expect(
      tester
          .widgetList<AnimatedContainer>(find.byType(AnimatedContainer))
          .every((widget) => widget.duration == Duration.zero),
      true,
    );
    expect(tester.takeException(), isNull);
  });

  testWidgets(
    'Actual Home AI shortcut is above the pill at normal and enlarged text',
    (tester) async {
      final adapter = HomeUiAdapter();
      final fixture = HomeUiFixture(adapter);
      await fixture.install();
      addTearDown(fixture.dispose);
      tester.view.physicalSize = const Size(320, 820);
      tester.view.devicePixelRatio = 1;
      addTearDown(tester.view.resetPhysicalSize);
      addTearDown(tester.view.resetDevicePixelRatio);
      for (final scale in [1.0, 1.8]) {
        await tester.pumpWidget(homeUiApp(scale: scale));
        await settleHomeUi(tester);
        final pill = tester.getRect(
          find.byKey(const ValueKey('floating-pill-navigation')),
        );
        final fab = tester.getRect(
          find.byKey(const ValueKey('draggable-assistant-fab')),
        );
        final body = tester.getRect(find.byType(DraggableAssistantFabHost));
        expect(fab.bottom, lessThan(pill.top));
        expect(body.bottom, lessThan(pill.top));
        expect(pill.overlaps(fab), false);
        expect(tester.takeException(), isNull);
      }
      expect(adapter.requests.every((r) => r.method == 'GET'), true);
    },
  );

  for (final size in [const Size(360, 740), const Size(412, 915)]) {
    testWidgets('bottom navigation fits ${size.width} logical pixels', (
      tester,
    ) async {
      await tester.binding.setSurfaceSize(size);
      addTearDown(() => tester.binding.setSurfaceSize(null));
      var selected = -1;
      await tester.pumpWidget(
        MaterialApp(
          theme: CareSeniorTheme.data,
          home: MediaQuery(
            data: MediaQueryData(
              size: size,
              textScaler: const TextScaler.linear(1.8),
            ),
            child: Scaffold(
              bottomNavigationBar: AppBottomNavigation(
                selectedIndex: 0,
                onSelected: (index) => selected = index,
              ),
            ),
          ),
        ),
      );
      expect(find.text('Trang chủ'), findsOneWidget);
      expect(find.text('Lịch thuốc'), findsOneWidget);
      expect(find.text('Lịch khám'), findsOneWidget);
      expect(find.text('SOS'), findsOneWidget);
      expect(find.text('Cảnh báo'), findsOneWidget);
      expect(find.text('Hồ sơ'), findsOneWidget);
      expect(tester.takeException(), isNull);
      await tester.tap(find.text('SOS'));
      expect(selected, 3);
    });
  }

  for (final width in [320.0, 360.0, 390.0, 412.0, 768.0]) {
    for (final scale in [1.0, 1.2, 1.4, 1.6, 1.8]) {
      testWidgets('six full navigation labels fit width=$width scale=$scale', (
        tester,
      ) async {
        await tester.binding.setSurfaceSize(Size(width, 820));
        addTearDown(() => tester.binding.setSurfaceSize(null));
        var selected = -1;
        await tester.pumpWidget(
          MaterialApp(
            theme: CareSeniorTheme.data,
            builder: (context, child) => MediaQuery(
              data: MediaQuery.of(
                context,
              ).copyWith(textScaler: TextScaler.linear(scale)),
              child: child!,
            ),
            home: Scaffold(
              bottomNavigationBar: AppBottomNavigation(
                selectedIndex: 0,
                onSelected: (index) => selected = index,
              ),
            ),
          ),
        );
        final bar = tester.getRect(find.byType(AppBottomNavigation));
        for (var index = 0; index < 6; index++) {
          final label = find.byKey(ValueKey('home-nav-label-$index'));
          final text = tester.widget<Text>(label);
          final paragraph = tester.renderObject<RenderParagraph>(
            find.descendant(of: label, matching: find.byType(RichText)),
          );
          expect(text.maxLines, isNull);
          expect(text.overflow, isNull);
          expect(paragraph.didExceedMaxLines, false);
          final bounds = tester.getRect(label);
          expect(bar.contains(bounds.topLeft), true);
          expect(bar.contains(bounds.bottomRight), true);
          // Wrapped trailing spaces have selection boxes beyond the line;
          // inspect visible glyphs, not invisible selection whitespace.
          for (final word in RegExp(r'\S+').allMatches(text.data!)) {
            for (final box in paragraph.getBoxesForSelection(
              TextSelection(baseOffset: word.start, extentOffset: word.end),
            )) {
              expect(box.left, greaterThanOrEqualTo(-1));
              expect(box.right, lessThanOrEqualTo(paragraph.size.width + 1));
              expect(box.bottom, lessThanOrEqualTo(paragraph.size.height + 1));
            }
          }
          await tester.tap(label);
          expect(selected, index);
        }
        expect(tester.takeException(), isNull);
      });
    }
  }
}
