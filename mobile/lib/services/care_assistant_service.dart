import 'package:dio/dio.dart';
import '../models/care_assistant.dart';
import 'api_client.dart';

class AssistantContext {
  const AssistantContext(this.role, this.profiles, {this.aiConfigured = false});
  final String role;
  final List<AssistantProfile> profiles;
  final bool aiConfigured;
}

class CareAssistantService {
  CareAssistantService({Dio? dio}) : _dio = dio ?? ApiClient.instance.dio;
  final Dio _dio;
  CancelToken? _pendingChat;
  void cancelPending() {
    _pendingChat?.cancel('Conversation changed');
    _pendingChat = null;
  }

  Future<AssistantContext> loadContext() async {
    try {
      final auth = await _dio.get<Map<String, dynamic>>('/auth/me');
      final role = (auth.data?['data'] as Map?)?['tenVaiTro']?.toString();
      if (!['NguoiCaoTuoi', 'NguoiChamSoc'].contains(role)) {
        throw const ApiException(
          'Trợ lý chỉ hỗ trợ tài khoản Người cao tuổi và Người chăm sóc.',
          statusCode: 403,
        );
      }
      final result = await _dio.get<Map<String, dynamic>>(
        '/care-assistant/profiles',
      );
      final data = result.data?['data'];
      if (data is! List) {
        throw const ApiException('Dữ liệu hồ sơ không hợp lệ.');
      }
      final status = await _dio.get<Map<String, dynamic>>(
        '/care-assistant/status',
      );
      return AssistantContext(
        role!,
        data
            .whereType<Map>()
            .map((r) => AssistantProfile.fromJson(Map<String, dynamic>.from(r)))
            .toList(),
        aiConfigured: (status.data?['data'] as Map?)?['aiConfigured'] == true,
      );
    } on DioException catch (error) {
      throw ApiException.fromDio(error);
    }
  }

  Future<AssistantReply> ask(String question, {int? elderlyId}) async {
    return _request(question, elderlyId: elderlyId);
  }

  Future<AssistantReply> chat(
    String question, {
    int? elderlyId,
    List<AssistantHistoryTurn> history = const [],
    String? conversationToken,
  }) async => _request(
    question,
    elderlyId: elderlyId,
    history: history,
    conversationToken: conversationToken,
  );

  Future<AssistantReply> _request(
    String question, {
    int? elderlyId,
    List<AssistantHistoryTurn>? history,
    String? conversationToken,
  }) async {
    if (question.trim().isEmpty || question.length > 500) {
      throw const ApiException(
        'Câu hỏi cần từ 1 đến 500 ký tự.',
        statusCode: 400,
      );
    }
    try {
      final cancellation = history == null ? null : CancelToken();
      if (cancellation != null) {
        cancelPending();
        _pendingChat = cancellation;
      }
      final response = await _dio.post<Map<String, dynamic>>(
        history == null ? '/care-assistant/query' : '/care-assistant/chat',
        data: {
          'question': question.trim(),
          'elderlyId': ?elderlyId,
          if (history != null)
            'history': history.map((turn) => turn.toJson()).toList(),
          'conversationToken': ?conversationToken,
        },
        options: history == null
            ? null
            : Options(receiveTimeout: const Duration(seconds: 45)),
        cancelToken: cancellation,
      );
      final data = response.data?['data'];
      if (data is! Map ||
          !['functional', 'ai'].contains(data['mode']) ||
          data['text'] is! String) {
        throw const ApiException('Phản hồi trợ lý không hợp lệ.');
      }
      if (elderlyId != null && (data['profile'] as Map?)?['id'] != elderlyId) {
        throw const ApiException(
          'Hồ sơ của câu trả lời đã thay đổi. Vui lòng hỏi lại.',
        );
      }
      return AssistantReply.fromJson(Map<String, dynamic>.from(data));
    } on DioException catch (error) {
      throw ApiException.fromDio(error);
    }
  }
}
