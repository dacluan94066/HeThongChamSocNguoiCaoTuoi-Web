import 'dart:async';
import 'dart:convert';
import 'dart:typed_data';
import 'package:dio/dio.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';

import 'package:elderly_care_app/models/care_assistant.dart';
import 'package:elderly_care_app/services/api_client.dart';
import 'package:elderly_care_app/services/care_assistant_controller.dart';
import 'package:elderly_care_app/services/care_assistant_service.dart';
import 'package:elderly_care_app/screens/assistant/care_assistant_screen.dart';
import 'package:elderly_care_app/screens/caregiver/caregiver_home_screen.dart';

class FakeService extends CareAssistantService {
  FakeService({
    this.role = 'NguoiCaoTuoi',
    this.profiles = const [AssistantProfile(7, 'Bà An')],
    this.aiConfigured = false,
  });
  final String role;
  final List<AssistantProfile> profiles;
  final bool aiConfigured;
  int calls = 0;
  int? target;
  Object? failure;
  Completer<AssistantReply>? pending;
  List<AssistantHistoryTurn> receivedHistory = const [];
  AssistantReply reply = const AssistantReply(
    text: 'Dữ liệu thật đã lưu',
    intent: 'health',
    actions: [AssistantAction.health],
  );
  @override
  Future<AssistantContext> loadContext() async =>
      AssistantContext(role, profiles, aiConfigured: aiConfigured);
  @override
  Future<AssistantReply> ask(String question, {int? elderlyId}) async {
    calls++;
    target = elderlyId;
    if (failure != null) throw failure!;
    return pending == null ? reply : pending!.future;
  }

  @override
  Future<AssistantReply> chat(
    String question, {
    int? elderlyId,
    List<AssistantHistoryTurn> history = const [],
  }) {
    receivedHistory = List.of(history);
    return ask(question, elderlyId: elderlyId);
  }
}

class RecordingAdapter implements HttpClientAdapter {
  final List<RequestOptions> requests = [];
  int status = 200;
  bool offline = false;
  String mode = 'functional';
  String? modeReason;
  Completer<ResponseBody>? heldResponse;
  @override
  void close({bool force = false}) {}
  @override
  Future<ResponseBody> fetch(
    RequestOptions options,
    Stream<Uint8List>? requestStream,
    Future<void>? cancelFuture,
  ) async {
    requests.add(options);
    if (heldResponse != null) return heldResponse!.future;
    if (offline) {
      throw DioException(
        requestOptions: options,
        type: DioExceptionType.connectionError,
      );
    }
    final Object data = options.path == '/auth/me'
        ? {'tenVaiTro': 'NguoiChamSoc'}
        : options.path.endsWith('/status')
        ? {'aiConfigured': false}
        : options.path.endsWith('/profiles')
        ? [
            {'id': 7, 'hoTen': 'Bà An'},
            {'id': 8, 'hoTen': 'Ông Bình'},
          ]
        : {
            'mode': mode,
            'modeReason': modeReason,
            'intent': 'emergency',
            'text': 'Hãy tìm hỗ trợ ngay.',
            'actions': ['caregivers', 'sos', 'https://evil.example'],
            'rows': [],
          };
    return ResponseBody.fromString(
      jsonEncode({'data': data, 'message': 'Không có quyền truy cập'}),
      status,
      headers: {
        Headers.contentTypeHeader: [Headers.jsonContentType],
      },
    );
  }
}

void main() {
  test(
    'Fallback diagnostics explain quota and timeout without changing the real mode label',
    () {
      for (final entry in {
        'AI_RATE_LIMITED': 'hạn mức',
        'AI_TIMEOUT': 'thời gian',
        'AI_TOOL_GENERATION_FAILED': 'chưa xử lý',
        'AI_HTTP_401': 'từ chối truy cập',
      }.entries) {
        final reply = AssistantReply.fromJson({
          'mode': 'functional',
          'modeReason': 'ai_unavailable',
          'aiFailureCode': entry.key,
          'text': 'Tra cứu dự phòng',
          'intent': 'help',
        });
        expect(reply.modeLabel, 'Trợ lý theo chức năng');
        expect(reply.modeNotice, contains(entry.value));
      }
      final reply = AssistantReply.fromJson({
        'mode': 'functional',
        'modeReason': 'ai_unavailable',
        'aiFailureCode': 'unknown upstream value',
        'text': 'Dự phòng',
        'intent': 'help',
      });
      expect(reply.modeNotice, isNot(contains('unknown upstream')));
      expect(reply.modeLabel, 'Trợ lý theo chức năng');
    },
  );
  test(
    'AI transport sends bounded conversation to chat endpoint and preserves real mode',
    () async {
      final adapter = RecordingAdapter()..mode = 'ai';
      final service = CareAssistantService(
        dio: Dio()..httpClientAdapter = adapter,
      );
      final reply = await service.chat(
        'Còn mấy ngày nữa?',
        elderlyId: 7,
        history: const [
          AssistantHistoryTurn('user', 'Lịch khám tiếp theo?'),
          AssistantHistoryTurn('assistant', 'Lịch đã lưu'),
        ],
      );
      expect(adapter.requests.single.path, '/care-assistant/chat');
      expect(adapter.requests.single.data['history'].length, 2);
      expect(reply.modeLabel, 'AI');
      expect(
        adapter.requests.single.receiveTimeout,
        const Duration(seconds: 45),
      );
      adapter.mode = 'functional';
      adapter.modeReason = 'ai_unavailable';
      final fallback = await service.chat('Lịch khám?');
      expect(fallback.modeLabel, 'Trợ lý theo chức năng');
      expect(fallback.modeNotice, contains('dự phòng'));
    },
  );
  test(
    'Conversation history is bounded and contains only completed turns',
    () async {
      final service = FakeService()
        ..reply = AssistantReply(
          text: 'a' * 2200,
          intent: 'general',
          mode: 'ai',
        );
      final session = ValueNotifier(0);
      final chat = CareAssistantController(service: service, session: session);
      await chat.initialize();
      await chat.send('Lịch khám tiếp theo?');
      await chat.send('Còn mấy ngày nữa?');
      expect(service.receivedHistory.first.content, 'Lịch khám tiếp theo?');
      expect(service.receivedHistory.length, 2);
      for (var i = 0; i < 10; i++) {
        await chat.send('a' * 500);
        expect(service.receivedHistory.length, lessThanOrEqualTo(8));
        expect(
          service.receivedHistory.fold<int>(
            0,
            (n, turn) => n + turn.content.length,
          ),
          lessThanOrEqualTo(6000),
        );
      }
      chat.clearConversation();
      await chat.send('Xin chào');
      expect(service.receivedHistory, isEmpty);
      chat.dispose();
      session.dispose();
    },
  );
  test(
    'Changing profile during an AI request clears context and discards old reply',
    () async {
      final pending = Completer<AssistantReply>();
      final service = FakeService(
        role: 'NguoiChamSoc',
        profiles: const [
          AssistantProfile(7, 'An'),
          AssistantProfile(8, 'Bình'),
        ],
      )..pending = pending;
      final session = ValueNotifier(0);
      final chat = CareAssistantController(service: service, session: session);
      await chat.initialize();
      chat.selectProfile(chat.profiles.first);
      final oldRequest = chat.send('Sức khỏe?');
      chat.selectProfile(chat.profiles.last);
      expect(chat.messages, isEmpty);
      expect(chat.busy, isFalse);
      pending.complete(
        const AssistantReply(
          text: 'Dữ liệu cũ của An',
          intent: 'health',
          mode: 'ai',
        ),
      );
      await oldRequest;
      expect(chat.messages, isEmpty);
      service.pending = null;
      await chat.send('Lịch khám?');
      expect(service.target, 8);
      expect(service.receivedHistory, isEmpty);
      chat.dispose();
      session.dispose();
    },
  );
  testWidgets(
    'AI badge and disclosure are visible, fallback has an explicit explanation',
    (tester) async {
      final service = FakeService(aiConfigured: true)
        ..reply = const AssistantReply(
          text: 'Câu trả lời AI',
          intent: 'general',
          mode: 'ai',
        );
      final session = ValueNotifier(0);
      final chat = CareAssistantController(service: service, session: session);
      await tester.pumpWidget(
        MaterialApp(home: CareAssistantScreen(controller: chat)),
      );
      await tester.pumpAndSettle();
      expect(find.textContaining('được gửi tới dịch vụ Groq'), findsOneWidget);
      await chat.send('Xin chào');
      await tester.pumpAndSettle();
      expect(find.text('AI'), findsOneWidget);
      expect(find.text('Trợ lý chăm sóc • AI'), findsOneWidget);
      service.reply = const AssistantReply(
        text: 'Kết quả tra cứu dự phòng',
        intent: 'general',
        modeReason: 'ai_unavailable',
      );
      await chat.send('Lịch khám?');
      await tester.pumpAndSettle();
      expect(find.textContaining('AI tạm thời không khả dụng'), findsOneWidget);
      await tester.pumpWidget(const SizedBox());
      chat.dispose();
      session.dispose();
    },
  );
  testWidgets(
    'Caregiver home has a direct assistant entry outside logout dialog',
    (tester) async {
      FlutterSecureStorage.setMockInitialValues({});
      final dio = ApiClient.instance.dio;
      final original = dio.httpClientAdapter;
      dio.httpClientAdapter = RecordingAdapter();
      try {
        await tester.pumpWidget(const MaterialApp(home: CaregiverHomeScreen()));
        await tester.pumpAndSettle();
        expect(find.byTooltip('Trợ lý chăm sóc'), findsOneWidget);
        expect(find.byType(AlertDialog), findsNothing);
        await tester.tap(find.byTooltip('Trợ lý chăm sóc'));
        await tester.pumpAndSettle();
        expect(find.byType(CareAssistantScreen), findsOneWidget);
        expect(find.byType(DropdownButtonFormField<int>), findsOneWidget);
        await tester.pumpWidget(const SizedBox());
      } finally {
        dio.httpClientAdapter = original;
      }
    },
  );
  test(
    'Transport uses real scoped routes; emergency never posts SOS',
    () async {
      final adapter = RecordingAdapter();
      final service = CareAssistantService(
        dio: Dio(BaseOptions(baseUrl: 'http://localhost/api'))
          ..httpClientAdapter = adapter,
      );
      final context = await service.loadContext();
      expect(context.profiles.length, 2);
      final reply = await service.ask('Tôi khó thở', elderlyId: 8);
      expect(reply.actions, [AssistantAction.caregivers, AssistantAction.sos]);
      expect(adapter.requests.map((r) => '${r.method} ${r.path}'), [
        'GET /auth/me',
        'GET /care-assistant/profiles',
        'GET /care-assistant/status',
        'POST /care-assistant/query',
      ]);
      expect(adapter.requests.last.data, {
        'question': 'Tôi khó thở',
        'elderlyId': 8,
      });
    },
  );
  test(
    'Network and forbidden errors remain errors, never empty medical answers',
    () async {
      final adapter = RecordingAdapter();
      final service = CareAssistantService(
        dio: Dio()..httpClientAdapter = adapter,
      );
      adapter.offline = true;
      await expectLater(service.ask('thuốc'), throwsA(isA<ApiException>()));
      adapter.offline = false;
      adapter.status = 403;
      await expectLater(
        service.ask('thuốc'),
        throwsA(isA<ApiException>().having((e) => e.statusCode, 'status', 403)),
      );
    },
  );
  test('Input length enforced before request', () async {
    final adapter = RecordingAdapter();
    final service = CareAssistantService(
      dio: Dio()..httpClientAdapter = adapter,
    );
    await expectLater(service.ask(' '), throwsA(isA<ApiException>()));
    await expectLater(service.ask('a' * 501), throwsA(isA<ApiException>()));
    expect(adapter.requests, isEmpty);
  });
  test(
    'Multiple caregiver profiles require selection and clearing on switch',
    () async {
      final service = FakeService(
        role: 'NguoiChamSoc',
        profiles: const [
          AssistantProfile(7, 'An'),
          AssistantProfile(8, 'Bình'),
        ],
      );
      final session = ValueNotifier(0);
      final chat = CareAssistantController(service: service, session: session);
      await chat.initialize();
      expect(chat.selected, isNull);
      chat.selectProfile(chat.profiles[1]);
      await chat.send('sức khỏe');
      expect(service.target, 8);
      expect(chat.messages.length, 2);
      chat.selectProfile(chat.profiles[0]);
      expect(chat.messages, isEmpty);
      chat.selectProfile(const AssistantProfile(99, 'Ngoài phân công'));
      expect(chat.selected!.id, 7);
      chat.dispose();
      session.dispose();
    },
  );
  test(
    'Logout while request pending clears state and discards late reply',
    () async {
      final service = FakeService()..pending = Completer<AssistantReply>();
      final session = ValueNotifier(0);
      final chat = CareAssistantController(service: service, session: session);
      await chat.initialize();
      final request = chat.send('sức khỏe');
      session.value++;
      expect(chat.messages, isEmpty);
      expect(chat.selected, isNull);
      expect(chat.profiles, isEmpty);
      service.pending!.complete(service.reply);
      await request;
      expect(chat.messages, isEmpty);
      expect(chat.sessionExpired, isTrue);
      chat.dispose();
      session.dispose();
    },
  );
  test(
    'Busy prevents duplicate requests; failed reads can be retried manually',
    () async {
      final service = FakeService()..pending = Completer<AssistantReply>();
      final session = ValueNotifier(0);
      final chat = CareAssistantController(service: service, session: session);
      await chat.initialize();
      final request = chat.send('SOS');
      await chat.send('SOS');
      expect(service.calls, 1);
      service.pending!.completeError(
        const ApiException('Không tải được dữ liệu', statusCode: 503),
      );
      await request;
      expect(chat.messages.last.isError, isTrue);
      expect(chat.messages.last.retryQuestion, 'SOS');
      service.pending = null;
      await chat.send(chat.messages.last.retryQuestion!);
      expect(service.calls, 2);
      expect(chat.messages.where((m) => m.fromUser).length, 1);
      chat.dispose();
      session.dispose();
    },
  );
  testWidgets(
    'Suggestions, fixed navigation, clear confirmation and session draft removal',
    (tester) async {
      final service = FakeService();
      final session = ValueNotifier(0);
      final chat = CareAssistantController(service: service, session: session);
      final actions = <AssistantAction>[];
      await tester.pumpWidget(
        MaterialApp(
          home: CareAssistantScreen(
            controller: chat,
            onNavigate: (a, p) async {
              actions.add(a);
              expect(p!.id, 7);
            },
          ),
        ),
      );
      await tester.pumpAndSettle();
      expect(find.text('Trợ lý chăm sóc'), findsOneWidget);
      await tester.drag(find.byType(ListView), const Offset(0, -400));
      await tester.pumpAndSettle();
      expect(find.text('Hôm nay tôi uống thuốc gì?'), findsOneWidget);
      expect(find.text('Hướng dẫn dùng ứng dụng.'), findsOneWidget);
      await tester.enterText(find.byType(TextField), 'Chỉ số sức khỏe');
      await tester.tap(find.byTooltip('Gửi câu hỏi'));
      await tester.pumpAndSettle();
      expect(find.text('Dữ liệu thật đã lưu'), findsOneWidget);
      expect(actions, isEmpty);
      await tester.tap(find.widgetWithText(OutlinedButton, 'Chỉ số sức khỏe'));
      await tester.pumpAndSettle();
      expect(actions, [AssistantAction.health]);
      await tester.tap(find.byTooltip('Xóa cuộc trò chuyện'));
      await tester.pumpAndSettle();
      expect(chat.messages.length, 2);
      await tester.tap(find.text('Xóa'));
      await tester.pumpAndSettle();
      expect(chat.messages, isEmpty);
      await tester.enterText(
        find.byType(TextField),
        'Bản nháp sức khỏe bí mật',
      );
      final input = tester
          .widget<TextField>(find.byType(TextField))
          .controller!;
      session.value++;
      await tester.pumpAndSettle();
      expect(input.text, isEmpty);
      expect(find.byType(TextField), findsNothing);
      await tester.pumpWidget(const SizedBox());
      chat.dispose();
      session.dispose();
    },
  );
  testWidgets('Small screen, large text and keyboard do not overflow', (
    tester,
  ) async {
    tester.view.physicalSize = const Size(320, 740);
    tester.view.devicePixelRatio = 1;
    addTearDown(tester.view.resetPhysicalSize);
    addTearDown(tester.view.resetDevicePixelRatio);
    final session = ValueNotifier(0);
    final chat = CareAssistantController(
      service: FakeService(),
      session: session,
    );
    await tester.pumpWidget(
      MaterialApp(
        builder: (context, child) => MediaQuery(
          data: MediaQuery.of(context).copyWith(
            textScaler: TextScaler.linear(2),
            viewInsets: const EdgeInsets.only(bottom: 240),
          ),
          child: child!,
        ),
        home: CareAssistantScreen(controller: chat),
      ),
    );
    await tester.pumpAndSettle();
    expect(tester.takeException(), isNull);
    await tester.pumpWidget(const SizedBox());
    chat.dispose();
    session.dispose();
  });
}
