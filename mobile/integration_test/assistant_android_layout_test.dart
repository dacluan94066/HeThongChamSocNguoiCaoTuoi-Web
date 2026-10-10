import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:integration_test/integration_test.dart';
import 'package:elderly_care_app/models/care_assistant.dart';
import 'package:elderly_care_app/services/care_assistant_controller.dart';
import 'package:elderly_care_app/screens/assistant/care_assistant_screen.dart';
import '../test/care_assistant_test.dart' show FakeService;

void main() {
  IntegrationTestWidgetsFlutterBinding.ensureInitialized();
  testWidgets(
    'Android native keyboard, navigation inset, large text and chat scrolling',
    (tester) async {
      // Synthetic UI only: no backend, credentials, health records or AI requests.
      final service = FakeService()
        ..reply = const AssistantReply(
          text:
              '**Chuẩn bị trước khi khám**\n\n- Giấy tờ và BHYT.\n- Hồ sơ/kết quả cũ.\n- Danh sách thuốc, triệu chứng và câu hỏi.\n\nKhông tự ngừng thuốc hoặc nhịn ăn; làm theo hướng dẫn cơ sở khám.',
          intent: 'visit_preparation',
        );
      final session = ValueNotifier(0);
      final chat = CareAssistantController(service: service, session: session);
      await tester.pumpWidget(
        MaterialApp(
          builder: (context, child) => MediaQuery(
            data: MediaQuery.of(
              context,
            ).copyWith(textScaler: TextScaler.linear(1.6)),
            child: child!,
          ),
          home: CareAssistantScreen(controller: chat),
        ),
      );
      await tester.pumpAndSettle();
      debugPrint('ANDROID_CHAT_LAYOUT: START_SYNTHETIC_UI');
      for (var i = 0; i < 3; i++) {
        await chat.send('Hướng dẫn chung $i');
        await tester.pumpAndSettle();
      }
      final list = find.byKey(const ValueKey('assistant-messages'));
      final input = find.byKey(const ValueKey('assistant-input'));
      final send = find.byTooltip('Gửi câu hỏi');
      final scroll = tester.widget<ListView>(list).controller!;
      expect(scroll.position.extentAfter, lessThan(1));
      await tester.drag(list, const Offset(0, 400));
      await tester.pumpAndSettle();
      final readingOffset = scroll.offset;
      await chat.send('Một câu hỏi mới');
      await tester.pumpAndSettle();
      expect(scroll.offset, closeTo(readingOffset, 1));
      debugPrint('ANDROID_CHAT_LAYOUT: OLD_MESSAGE_POSITION_PRESERVED');
      await tester.drag(list, const Offset(0, -10000));
      await tester.pumpAndSettle();
      final closedListHeight = tester.getRect(list).height;
      await tester.tap(input);
      await tester.showKeyboard(input);
      await SystemChannels.textInput.invokeMethod<void>('TextInput.show');
      await tester.pumpAndSettle();
      for (
        var i = 0;
        i < 20 && MediaQuery.of(tester.element(input)).viewInsets.bottom == 0;
        i++
      ) {
        await tester.pump(const Duration(milliseconds: 100));
      }
      final media = MediaQuery.of(tester.element(input));
      debugPrint(
        'ANDROID_CHAT_LAYOUT: NATIVE_IME_INSET=${media.viewInsets.bottom}',
      );
      expect(
        media.viewInsets.bottom,
        greaterThan(0),
        reason: 'Must exercise the real Android IME',
      );
      final screenHeight =
          tester.view.physicalSize.height / tester.view.devicePixelRatio;
      final keyboardTop = screenHeight - media.viewInsets.bottom;
      expect(tester.getRect(send).bottom, lessThanOrEqualTo(keyboardTop + 1));
      expect(keyboardTop - tester.getRect(send).bottom, lessThanOrEqualTo(10));
      expect(tester.getRect(list).height, lessThan(closedListHeight));
      expect(tester.getRect(list).height, greaterThan(0));
      tester.widget<TextField>(input).controller!.text =
          'Dòng một\nDòng hai\nDòng ba\nDòng bốn\nDòng năm';
      await tester.pumpAndSettle();
      expect(tester.getRect(input).height, lessThanOrEqualTo(160));
      expect(tester.getRect(send).bottom, lessThanOrEqualTo(keyboardTop + 1));
      await tester.tap(send);
      await tester.pumpAndSettle();
      expect(scroll.position.extentAfter, lessThan(1));
      FocusManager.instance.primaryFocus?.unfocus();
      await SystemChannels.textInput.invokeMethod<void>('TextInput.hide');
      await tester.pumpAndSettle();
      await tester.pump(const Duration(seconds: 1));
      final closedMedia = MediaQuery.of(tester.element(input));
      expect(closedMedia.viewInsets.bottom, 0);
      expect(
        screenHeight - tester.getRect(send).bottom,
        lessThanOrEqualTo(closedMedia.viewPadding.bottom + 10),
      );
      expect(tester.takeException(), isNull);
      debugPrint(
        'ANDROID_CHAT_LAYOUT: PASS_NATIVE_IME_LARGE_TEXT_SCROLL_NAVIGATION',
      );
      await tester.pumpWidget(const SizedBox());
      chat.dispose();
      session.dispose();
    },
  );
}
