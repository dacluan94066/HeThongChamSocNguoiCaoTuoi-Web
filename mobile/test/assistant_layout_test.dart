import 'dart:async';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:flutter_markdown_plus/flutter_markdown_plus.dart';
import 'package:elderly_care_app/models/care_assistant.dart';
import 'package:elderly_care_app/services/care_assistant_controller.dart';
import 'package:elderly_care_app/screens/assistant/care_assistant_screen.dart';
import 'package:elderly_care_app/widgets/assistant_message_bubble.dart';
import 'care_assistant_test.dart' show FakeService;

void main() {
  testWidgets(
    'Composer respects navigation inset and keyboard without double padding',
    (tester) async {
      tester.view.physicalSize = const Size(320, 568);
      tester.view.devicePixelRatio = 1;
      addTearDown(tester.view.resetPhysicalSize);
      addTearDown(tester.view.resetDevicePixelRatio);
      final keyboard = ValueNotifier(0.0);
      final session = ValueNotifier(0);
      final chat = CareAssistantController(
        service: FakeService(),
        session: session,
      );
      await tester.pumpWidget(
        MaterialApp(
          builder: (context, child) => ValueListenableBuilder<double>(
            valueListenable: keyboard,
            builder: (context, inset, _) => MediaQuery(
              data: MediaQuery.of(context).copyWith(
                textScaler: TextScaler.linear(1.8),
                padding: EdgeInsets.only(bottom: inset == 0 ? 24 : 0),
                viewPadding: const EdgeInsets.only(bottom: 24),
                viewInsets: EdgeInsets.only(bottom: inset),
              ),
              child: child!,
            ),
          ),
          home: CareAssistantScreen(controller: chat),
        ),
      );
      await tester.pumpAndSettle();
      final input = find.byKey(const ValueKey('assistant-input'));
      final send = find.byTooltip('Gửi câu hỏi');
      for (final inset in [0.0, 240.0, 0.0]) {
        keyboard.value = inset;
        await tester.pumpAndSettle();
        await tester.enterText(
          input,
          'Dòng một\nDòng hai\nDòng ba\nDòng bốn\nDòng năm',
        );
        await tester.pumpAndSettle();
        final bottom = 568 - inset;
        expect(tester.getRect(send).bottom, lessThanOrEqualTo(bottom));
        expect(
          bottom - tester.getRect(send).bottom,
          lessThanOrEqualTo(inset == 0 ? 32 : 8),
        );
        expect(tester.getRect(input).height, lessThanOrEqualTo(160));
        final list = tester.getRect(
          find.byKey(const ValueKey('assistant-messages')),
        );
        expect(list.height, greaterThan(0));
        expect(list.bottom, lessThanOrEqualTo(tester.getRect(input).top + 1));
        expect(tester.takeException(), isNull);
      }
      await tester.pumpWidget(const SizedBox());
      chat.dispose();
      session.dispose();
      keyboard.dispose();
    },
  );

  testWidgets(
    'A long incoming reply stays at bottom; reading old messages is preserved',
    (tester) async {
      final service = FakeService();
      final session = ValueNotifier(0);
      final chat = CareAssistantController(service: service, session: session);
      await tester.pumpWidget(
        MaterialApp(home: CareAssistantScreen(controller: chat)),
      );
      await tester.pumpAndSettle();
      for (var i = 0; i < 12; i++) {
        await chat.send('Câu hỏi $i');
        await tester.pumpAndSettle();
      }
      final list = find.byKey(const ValueKey('assistant-messages'));
      final scroll = tester.widget<ListView>(list).controller!;
      expect(scroll.position.extentAfter, lessThan(1));
      await tester.drag(list, const Offset(0, 500));
      await tester.pumpAndSettle();
      final readingOffset = scroll.offset;
      expect(scroll.position.extentAfter, greaterThan(100));
      await chat.send('Tiếp tục');
      await tester.pumpAndSettle();
      expect(scroll.offset, closeTo(readingOffset, 1));
      await tester.drag(list, const Offset(0, -10000));
      await tester.pumpAndSettle();
      service.pending = Completer<AssistantReply>();
      final pending = chat.send('Một câu trả lời dài');
      await tester.pump();
      await tester.pump(const Duration(milliseconds: 100));
      service.pending!.complete(
        AssistantReply(
          text: List.filled(30, 'Một dòng thông tin đã lưu.').join('\n'),
          intent: 'help',
        ),
      );
      await pending;
      await tester.pumpAndSettle();
      expect(scroll.position.extentAfter, lessThan(1));
      expect(tester.takeException(), isNull);
      await tester.pumpWidget(const SizedBox());
      chat.dispose();
      session.dispose();
    },
  );

  testWidgets(
    'Markdown renders formatting without loading images or opening links',
    (tester) async {
      await tester.pumpWidget(
        MaterialApp(
          home: Scaffold(
            body: AssistantMessageBubble(
              message: AssistantMessage(
                text:
                    '**Chuẩn bị**\n\n- Giấy tờ/BHYT\n- Hồ sơ cũ\n\n![không tải](https://example.invalid/image.png)\n[Nhấn](https://example.invalid)',
                fromUser: false,
              ),
              onAction: (_) => fail('No arbitrary action'),
              onRetry: () {},
            ),
          ),
        ),
      );
      await tester.pumpAndSettle();
      expect(find.byType(MarkdownBody), findsOneWidget);
      expect(find.byType(Image), findsNothing);
      final content = tester
          .widgetList<SelectableText>(find.byType(SelectableText))
          .map((w) => w.textSpan?.toPlainText() ?? w.data ?? '')
          .join(' ');
      expect(content, contains('Chuẩn bị'));
      expect(content, isNot(contains('**')));
      expect(tester.takeException(), isNull);
    },
  );
}
