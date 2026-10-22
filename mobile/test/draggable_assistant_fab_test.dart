import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:elderly_care_app/widgets/draggable_assistant_fab.dart';

void main() {
  setUp(() => SharedPreferences.setMockInitialValues({}));

  Widget app({
    required VoidCallback onPressed,
    bool visible = true,
    bool keyboardOpen = false,
    Key? hostKey,
    Size size = const Size(360, 740),
    double textScale = 1,
    bool compact = false,
  }) => MaterialApp(
    home: Scaffold(
      body: MediaQuery(
        data: MediaQueryData(
          size: size,
          textScaler: TextScaler.linear(textScale),
          viewInsets: keyboardOpen
              ? const EdgeInsets.only(bottom: 300)
              : EdgeInsets.zero,
        ),
        child: DraggableAssistantFabHost(
          key: hostKey,
          onPressed: onPressed,
          visible: visible,
          compact: compact,
          child: const SizedBox.expand(),
        ),
      ),
    ),
  );

  testWidgets(
    'tap opens assistant; drag snaps to edge and remembers position',
    (tester) async {
      await tester.binding.setSurfaceSize(const Size(360, 740));
      addTearDown(() => tester.binding.setSurfaceSize(null));
      var taps = 0;
      final button = find.byKey(const ValueKey('draggable-assistant-fab'));
      await tester.pumpWidget(app(onPressed: () => taps++));
      await tester.pumpAndSettle();

      expect(find.text('Hỏi AI'), findsOneWidget);
      final original = tester.getTopLeft(button);
      expect(original.dx, greaterThan(200));
      await tester.tap(button);
      await tester.pumpAndSettle();
      expect(taps, 1);

      await tester.drag(button, const Offset(-260, -180));
      await tester.pumpAndSettle();
      final moved = tester.getTopLeft(button);
      expect(moved.dx, closeTo(12, 1));
      expect(moved.dy, lessThan(original.dy));
      expect(taps, 1);

      final preferences = await SharedPreferences.getInstance();
      expect(preferences.getBool('assistant_fab_right_edge'), false);
      expect(
        preferences.getDouble('assistant_fab_vertical_fraction'),
        isNotNull,
      );

      await tester.pumpWidget(
        app(hostKey: const ValueKey('restored-host'), onPressed: () => taps++),
      );
      await tester.pumpAndSettle();
      expect(tester.getTopLeft(button).dx, closeTo(12, 1));
    },
  );

  testWidgets('shortcut is hidden on SOS and while typing', (tester) async {
    await tester.pumpWidget(app(onPressed: () {}, visible: false));
    expect(find.byKey(const ValueKey('draggable-assistant-fab')), findsNothing);
    await tester.pumpWidget(app(onPressed: () {}, keyboardOpen: true));
    expect(find.byKey(const ValueKey('draggable-assistant-fab')), findsNothing);
  });

  testWidgets('narrow viewport and large text keep the button on screen', (
    tester,
  ) async {
    const size = Size(240, 420);
    await tester.binding.setSurfaceSize(size);
    addTearDown(() => tester.binding.setSurfaceSize(null));
    await tester.pumpWidget(app(onPressed: () {}, size: size, textScale: 1.8));
    await tester.pumpAndSettle();
    final button = find.byKey(const ValueKey('draggable-assistant-fab'));
    final rect = tester.getRect(button);
    expect(rect.left, greaterThanOrEqualTo(0));
    expect(rect.right, lessThanOrEqualTo(size.width));
    expect(tester.takeException(), isNull);
  });

  testWidgets(
    'Home compact shortcut fits scaled text and retains tap, drag and restore',
    (tester) async {
      await tester.binding.setSurfaceSize(const Size(360, 740));
      addTearDown(() => tester.binding.setSurfaceSize(null));
      var taps = 0;
      final button = find.byKey(const ValueKey('draggable-assistant-fab'));
      for (final scale in [1.0, 1.2, 1.4, 1.6, 1.8]) {
        await tester.pumpWidget(
          app(onPressed: () => taps++, compact: true, textScale: scale),
        );
        await tester.pumpAndSettle();
        final size = tester.getSize(button);
        expect(size.width, inInclusiveRange(56, 80));
        expect(size.height, size.width);
        expect(find.text('AI'), findsOneWidget);
        expect(find.byTooltip('Hỏi AI · Kéo để di chuyển'), findsOneWidget);
        expect(tester.takeException(), isNull);
      }
      await tester.tap(button);
      await tester.pumpAndSettle();
      expect(taps, 1);
      await tester.drag(button, const Offset(-280, -160));
      await tester.pumpAndSettle();
      expect(tester.getTopLeft(button).dx, closeTo(12, 1));
      expect(taps, 1);
      await tester.pumpWidget(
        app(
          hostKey: const ValueKey('compact-restored'),
          onPressed: () => taps++,
          compact: true,
          textScale: 1.8,
        ),
      );
      await tester.pumpAndSettle();
      expect(tester.getTopLeft(button).dx, closeTo(12, 1));
      expect(tester.takeException(), isNull);
    },
  );
}
