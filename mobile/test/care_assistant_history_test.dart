import 'dart:async';
import 'dart:convert';
import 'package:flutter/material.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:elderly_care_app/models/assistant_conversation.dart';
import 'package:elderly_care_app/models/care_assistant.dart';
import 'package:elderly_care_app/screens/assistant/care_assistant_screen.dart';
import 'package:elderly_care_app/services/care_assistant_controller.dart';
import 'package:elderly_care_app/services/care_assistant_history_store.dart';
import 'care_assistant_test.dart' show FakeService;

// Widget tests use a synchronous in-memory boundary; secure-storage plugin and
// its cross-screen async queue are exercised separately by the tests below.
class MemoryStore extends CareAssistantHistoryStore {
  final data = <String, String>{};
  @override
  Future<AssistantArchive> load(String scope) async => data[scope] == null
      ? AssistantArchive()
      : AssistantArchive.fromJson(
          jsonDecode(data[scope]!) as Map<String, dynamic>,
        );
  @override
  Future<void> save(String scope, AssistantArchive archive) async {
    data[scope] = jsonEncode(archive.toJson());
  }
}

class FailingStore extends CareAssistantHistoryStore {
  bool fail = true;
  @override
  Future<void> save(String scope, AssistantArchive archive) {
    if (fail) return Future.error(StateError('device locked'));
    return super.save(scope, archive);
  }
}

class HeldLoadStore extends CareAssistantHistoryStore {
  final pending = <String, Completer<AssistantArchive>>{};
  @override
  Future<AssistantArchive> load(String scope) =>
      (pending[scope] = Completer<AssistantArchive>()).future;
}

class HeldStorage extends FlutterSecureStorage {
  final gate = Completer<void>();
  @override
  Future<void> write({
    required String key,
    required String? value,
    AppleOptions? iOptions,
    AndroidOptions? aOptions,
    LinuxOptions? lOptions,
    WebOptions? webOptions,
    AppleOptions? mOptions,
    WindowsOptions? wOptions,
  }) async {
    await gate.future;
    await super.write(
      key: key,
      value: value,
      iOptions: iOptions,
      aOptions: aOptions,
      lOptions: lOptions,
      webOptions: webOptions,
      mOptions: mOptions,
      wOptions: wOptions,
    );
  }
}

AssistantConversation savedConversation(
  String id,
  String title, {
  DateTime? tokenSavedAt,
}) => AssistantConversation(
  id: id,
  title: title,
  updatedAt: DateTime.now(),
  messages: [
    AssistantMessage(text: title, fromUser: true),
    AssistantMessage(
      text: 'Trả lời đã lưu',
      fromUser: false,
      reply: const AssistantReply(
        text: 'Trả lời đã lưu',
        intent: 'health_general',
        mode: 'ai',
      ),
    ),
  ],
  history: [
    AssistantHistoryTurn('user', title),
    const AssistantHistoryTurn('assistant', 'Trả lời đã lưu'),
  ],
  conversationToken: 'signed-context-test',
  tokenSavedAt: tokenSavedAt ?? DateTime.now(),
);

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();
  const secure = FlutterSecureStorage();
  final scope = CareAssistantHistoryStore.scope('1', 7);
  setUp(() => FlutterSecureStorage.setMockInitialValues({}));

  test(
    'Closing and reopening restores messages, timestamps, actions and bounded context',
    () async {
      final service = FakeService(accountId: '1')
        ..reply = const AssistantReply(
          text: 'Thông tin thuốc',
          intent: 'health_general',
          mode: 'ai',
          domain: 'HEALTH',
          conversationToken: 'signed-context-test',
          actions: [AssistantAction.health],
          rows: [
            {'secret': 'RAW_API_ROWS_NOT_SAVED'},
          ],
        );
      var chat = CareAssistantController(service: service);
      await chat.initialize();
      await chat.send('Tìm hiểu về thuốc');
      final firstTime = chat.messages.first.time;
      final id = chat.activeConversationId;
      chat.dispose();
      final raw = await secure.read(key: scope);
      expect(raw, isNotNull);
      expect(raw, isNot(contains('RAW_API_ROWS_NOT_SAVED')));
      final reopenedService = FakeService(accountId: '1');
      chat = CareAssistantController(service: reopenedService);
      await chat.initialize();
      expect(chat.activeConversationId, id);
      expect(chat.messages.length, 2);
      expect(chat.messages.first.time, firstTime);
      expect(chat.messages.last.reply!.actions, [AssistantAction.health]);
      expect(chat.messages.last.reply!.mode, 'ai');
      expect(
        reopenedService.calls,
        0,
      ); // Restoration never re-sends old requests.
      await chat.send('Thuốc đó thì sao?');
      expect(reopenedService.receivedHistory.length, 2);
      expect(reopenedService.receivedConversationToken, 'signed-context-test');
      chat.dispose();
    },
  );

  test(
    'New conversation preserves the old one, resets context, and deletion removes only the selected chat',
    () async {
      final service = FakeService(accountId: '1')
        ..reply = const AssistantReply(
          text: 'Trả lời',
          intent: 'health_general',
          conversationToken: 'old-token',
        );
      var chat = CareAssistantController(service: service);
      await chat.initialize();
      await chat.send('Cuộc thứ nhất');
      final firstId = chat.activeConversationId!;
      chat.newConversation();
      expect(chat.messages, isEmpty);
      expect(chat.conversations.length, 1);
      await chat.send('Cuộc thứ hai');
      expect(service.receivedHistory, isEmpty);
      expect(service.receivedConversationToken, isNull);
      final secondId = chat.activeConversationId!;
      expect(secondId, isNot(firstId));
      chat.openConversation(firstId);
      expect(chat.messages.first.text, 'Cuộc thứ nhất');
      chat.clearConversation();
      expect(chat.conversations.single.id, secondId);
      expect(chat.messages, isEmpty);
      chat.dispose();
      chat = CareAssistantController(service: FakeService(accountId: '1'));
      await chat.initialize();
      expect(
        chat.activeConversationId,
        isNull,
      ); // Preserve the new-chat screen too.
      expect(chat.messages, isEmpty);
      expect(chat.conversations.single.id, secondId);
      chat.openConversation(secondId);
      expect(chat.messages.first.text, 'Cuộc thứ hai');
      chat.dispose();
    },
  );

  test(
    'Logout clears visible content; accounts never see each other and late replies are discarded',
    () async {
      final session = ValueNotifier(0);
      final service = FakeService(accountId: '1');
      final first = CareAssistantController(service: service, session: session);
      await first.initialize();
      await first.send('Riêng của tài khoản một');
      service.pending = Completer<AssistantReply>();
      final oldRequest = first.send('Đang chờ AI');
      session.value++;
      expect(first.messages, isEmpty);
      expect(first.conversations, isEmpty);
      service.pending!.complete(
        const AssistantReply(text: 'LATE_PRIVATE_REPLY', intent: 'health'),
      );
      await oldRequest;
      first.dispose();
      final other = CareAssistantController(
        service: FakeService(accountId: '2'),
        session: session,
      );
      await other.initialize();
      expect(other.messages, isEmpty);
      expect(other.conversations, isEmpty);
      await other.send('Riêng của tài khoản hai');
      other.dispose();
      final original = CareAssistantController(
        service: FakeService(accountId: '1'),
        session: session,
      );
      await original.initialize();
      expect(original.messages.first.text, 'Riêng của tài khoản một');
      expect(
        original.messages.map((m) => m.text).join(),
        isNot(contains('LATE_PRIVATE_REPLY')),
      );
      expect(
        original.messages.map((m) => m.text).join(),
        isNot(contains('tài khoản hai')),
      );
      original.dispose();
      session.dispose();
    },
  );

  test(
    'Selected elderly profiles have separate archives and a slow restore cannot cross profile boundaries',
    () async {
      final store = CareAssistantHistoryStore();
      final a = savedConversation('a', 'Hồ sơ A');
      final b = savedConversation('b', 'Hồ sơ B');
      await store.save(
        scope,
        AssistantArchive(activeId: 'a', conversations: [a]),
      );
      final scopeB = CareAssistantHistoryStore.scope('1', 8);
      await store.save(
        scopeB,
        AssistantArchive(activeId: 'b', conversations: [b]),
      );
      final chat = CareAssistantController(
        service: FakeService(
          accountId: '1',
          role: 'NguoiChamSoc',
          profiles: const [AssistantProfile(7, 'A'), AssistantProfile(8, 'B')],
        ),
      );
      await chat.initialize();
      expect(chat.messages, isEmpty);
      chat.selectProfile(chat.profiles.first);
      await Future<void>.delayed(Duration.zero);
      expect(chat.messages.first.text, 'Hồ sơ A');
      chat.selectProfile(chat.profiles.last);
      expect(chat.messages, isEmpty);
      await Future<void>.delayed(Duration.zero);
      expect(chat.messages.first.text, 'Hồ sơ B');
      chat.dispose();

      final held = HeldLoadStore();
      final racing = CareAssistantController(
        historyStore: held,
        service: FakeService(
          accountId: '1',
          role: 'NguoiChamSoc',
          profiles: const [AssistantProfile(7, 'A'), AssistantProfile(8, 'B')],
        ),
      );
      final initial = racing.initialize();
      await Future<void>.delayed(Duration.zero);
      held.pending[CareAssistantHistoryStore.scope('1', null)]!.complete(
        AssistantArchive(),
      );
      await initial;
      racing.selectProfile(racing.profiles.first);
      racing.selectProfile(racing.profiles.last);
      held.pending[scope]!.complete(
        AssistantArchive(activeId: 'a', conversations: [a]),
      );
      await Future<void>.delayed(Duration.zero);
      expect(racing.initializing, isTrue);
      expect(racing.messages, isEmpty);
      held.pending[scopeB]!.complete(
        AssistantArchive(activeId: 'b', conversations: [b]),
      );
      await Future<void>.delayed(Duration.zero);
      expect(racing.messages.first.text, 'Hồ sơ B');
      racing.dispose();
    },
  );

  test(
    'Expired signed context is not replayed; readable history is retained',
    () async {
      final conversation = savedConversation(
        'a',
        'Paracetamol',
        tokenSavedAt: DateTime.now().subtract(const Duration(hours: 1)),
      );
      await CareAssistantHistoryStore().save(
        scope,
        AssistantArchive(activeId: 'a', conversations: [conversation]),
      );
      final service = FakeService(accountId: '1');
      final chat = CareAssistantController(service: service);
      await chat.initialize();
      expect(chat.messages.length, 2);
      await chat.send('Thuốc này là gì?');
      expect(service.receivedConversationToken, isNull);
      expect(service.receivedHistory.first.content, 'Paracetamol');
      chat.dispose();
    },
  );

  test(
    'Leaving during a request persists the question and allows explicit retry without duplicate questions',
    () async {
      final service = FakeService(accountId: '1')
        ..pending = Completer<AssistantReply>();
      final first = CareAssistantController(service: service);
      await first.initialize();
      final inFlight = first.send('Câu hỏi bị gián đoạn');
      first.dispose();
      service.pending!.complete(service.reply);
      await inFlight;
      final nextService = FakeService(accountId: '1');
      final next = CareAssistantController(service: nextService);
      await next.initialize();
      expect(nextService.calls, 0);
      expect(next.messages.last.isError, isTrue);
      expect(next.messages.last.retryQuestion, 'Câu hỏi bị gián đoạn');
      await next.send(next.messages.last.retryQuestion!);
      expect(next.messages.where((m) => m.fromUser).length, 1);
      expect(next.messages.last.isError, isFalse);
      next.dispose();
    },
  );

  test(
    'Unreadable storage is not overwritten, and write errors can be retried without losing the chat',
    () async {
      const corrupt = '{broken data';
      await secure.write(key: scope, value: corrupt);
      var chat = CareAssistantController(service: FakeService(accountId: '1'));
      await chat.initialize();
      expect(chat.storageNotice, contains('không bị ghi đè'));
      await chat.send('Câu mới');
      expect(await secure.read(key: scope), corrupt);
      chat.dispose();
      await secure.delete(key: scope);
      final failing = FailingStore();
      chat = CareAssistantController(
        service: FakeService(accountId: '1'),
        historyStore: failing,
      );
      await chat.initialize();
      await chat.send('Đừng làm mất câu này');
      expect(chat.storageNotice, contains('Không lưu được'));
      expect(chat.messages.length, 2);
      failing.fail = false;
      await chat.retrySave();
      expect(chat.storageNotice, isNull);
      expect(await secure.read(key: scope), contains('Đừng làm mất câu này'));
      chat.dispose();
    },
  );

  test(
    'A new screen waits for an enqueued secure write even after the old screen is disposed',
    () async {
      final storage = HeldStorage();
      final store = CareAssistantHistoryStore(storage: storage);
      final conversation = savedConversation('a', 'Không bị mất');
      final saving = store.save(
        scope,
        AssistantArchive(activeId: 'a', conversations: [conversation]),
      );
      final chat = CareAssistantController(
        service: FakeService(accountId: '1'),
      );
      final loading = chat.initialize();
      await Future<void>.delayed(Duration.zero);
      expect(chat.initializing, isTrue);
      expect(chat.messages, isEmpty);
      storage.gate.complete();
      await saving;
      await loading;
      expect(chat.messages.first.text, 'Không bị mất');
      chat.dispose();
    },
  );

  test(
    'Logout while archive load is pending never restores private content into the next session',
    () async {
      final store = HeldLoadStore();
      final session = ValueNotifier(0);
      final chat = CareAssistantController(
        service: FakeService(accountId: '1'),
        session: session,
        historyStore: store,
      );
      final loading = chat.initialize();
      await Future<void>.delayed(Duration.zero);
      session.value++;
      store.pending[scope]!.complete(
        AssistantArchive(
          activeId: 'a',
          conversations: [savedConversation('a', 'Riêng tư')],
        ),
      );
      await loading;
      expect(chat.messages, isEmpty);
      expect(chat.conversations, isEmpty);
      expect(chat.sessionExpired, isTrue);
      chat.dispose();
      session.dispose();
    },
  );

  test(
    'Storage limits are explicit: never silently evict an older conversation',
    () async {
      final conversations = List.generate(
        30,
        (index) => savedConversation('$index', 'Cuộc $index'),
      );
      await CareAssistantHistoryStore().save(
        scope,
        AssistantArchive(conversations: conversations),
      );
      final service = FakeService(accountId: '1');
      final chat = CareAssistantController(service: service);
      await chat.initialize();
      await chat.send('Cuộc 31');
      expect(service.calls, 0);
      expect(chat.conversations.length, 30);
      expect(chat.storageNotice, contains('xóa một cuộc cũ'));
      chat.openConversation('0');
      chat.clearConversation();
      await chat.send('Cuộc thay thế');
      expect(service.calls, 1);
      expect(chat.conversations.length, 30);
      chat.dispose();
    },
  );

  test(
    'Long conversations retain their original title and keep API context within its limits',
    () async {
      final service = FakeService(accountId: '1');
      final chat = CareAssistantController(service: service);
      await chat.initialize();
      await chat.send('Tiêu đề đầu tiên');
      for (var index = 0; index < 35; index++) {
        await chat.send('Câu hỏi $index');
      }
      expect(chat.messages.length, 60);
      expect(chat.conversations.single.title, 'Tiêu đề đầu tiên');
      chat.dispose();
      final next = CareAssistantController(
        service: FakeService(accountId: '1'),
      );
      await next.initialize();
      expect(next.messages.length, 60);
      expect(next.error, isNull);
      next.dispose();
      final archive = jsonDecode((await secure.read(key: scope))!) as Map;
      final history =
          (archive['conversations'] as List).single['history'] as List;
      expect(history.length, lessThanOrEqualTo(8));
    },
  );

  testWidgets(
    'New chat, reopen history and confirmed deletion work without deleting the other thread',
    (tester) async {
      final service = FakeService(accountId: '1');
      final store = MemoryStore();
      final chat = CareAssistantController(
        service: service,
        historyStore: store,
      );
      await tester.pumpWidget(
        MaterialApp(home: CareAssistantScreen(controller: chat)),
      );
      await tester.pumpAndSettle();
      await tester.enterText(
        find.byKey(const ValueKey('assistant-input')),
        'Cuộc đầu tiên',
      );
      await tester.tap(find.byTooltip('Gửi câu hỏi'));
      await tester.pumpAndSettle();
      final firstId = chat.activeConversationId;
      await tester.tap(
        find.byKey(const ValueKey('assistant-new-conversation')),
      );
      await tester.pumpAndSettle();
      expect(chat.messages, isEmpty);
      await tester.enterText(
        find.byKey(const ValueKey('assistant-input')),
        'Cuộc thứ hai',
      );
      await tester.tap(find.byTooltip('Gửi câu hỏi'));
      await tester.pumpAndSettle();
      final secondId = chat.activeConversationId;
      await tester.tap(find.byTooltip('Lịch sử trò chuyện'));
      await tester.pumpAndSettle();
      expect(find.text('Cuộc đầu tiên'), findsOneWidget);
      await tester.tap(find.byKey(ValueKey('conversation-$firstId')));
      await tester.pumpAndSettle();
      expect(chat.activeConversationId, firstId);
      await tester.tap(find.byTooltip('Xóa cuộc trò chuyện'));
      await tester.pumpAndSettle();
      await tester.tap(find.text('Hủy'));
      await tester.pumpAndSettle();
      expect(chat.conversations.length, 2);
      await tester.tap(find.byTooltip('Xóa cuộc trò chuyện'));
      await tester.pumpAndSettle();
      await tester.tap(find.text('Xóa'));
      await tester.pumpAndSettle();
      expect(chat.conversations.single.id, secondId);
      await tester.pumpWidget(const SizedBox());
      chat.dispose();
      final next = CareAssistantController(
        service: FakeService(accountId: '1'),
        historyStore: store,
      );
      await next.initialize();
      expect(next.conversations.single.id, secondId);
      next.dispose();
    },
  );

  testWidgets('History picker fits a narrow phone with large text', (
    tester,
  ) async {
    tester.view.physicalSize = const Size(320, 568);
    tester.view.devicePixelRatio = 1;
    addTearDown(tester.view.resetPhysicalSize);
    addTearDown(tester.view.resetDevicePixelRatio);
    final chat = CareAssistantController(
      service: FakeService(accountId: '1'),
      historyStore: MemoryStore(),
    );
    await tester.pumpWidget(
      MaterialApp(
        builder: (context, child) => MediaQuery(
          data: MediaQuery.of(
            context,
          ).copyWith(textScaler: TextScaler.linear(1.8)),
          child: child!,
        ),
        home: CareAssistantScreen(controller: chat),
      ),
    );
    await tester.pumpAndSettle();
    await chat.send(
      'Một tiêu đề dài để kiểm tra lịch sử hội thoại trên màn hình nhỏ',
    );
    await tester.pumpAndSettle();
    await tester.tap(find.byTooltip('Lịch sử trò chuyện'));
    await tester.pumpAndSettle();
    expect(tester.takeException(), isNull);
    await tester.pumpWidget(const SizedBox());
    chat.dispose();
  });
}
