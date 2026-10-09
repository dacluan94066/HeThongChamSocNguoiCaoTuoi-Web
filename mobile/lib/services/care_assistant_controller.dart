import 'package:flutter/foundation.dart';
import '../models/care_assistant.dart';
import 'api_client.dart';
import 'care_assistant_service.dart';

class CareAssistantController extends ChangeNotifier {
  CareAssistantController({
    CareAssistantService? service,
    ValueListenable<int>? session,
  }) : _service = service ?? CareAssistantService(),
       _session = session ?? ApiClient.sessionChanges {
    _session.addListener(_sessionChanged);
  }
  final CareAssistantService _service;
  final ValueListenable<int> _session;
  final List<AssistantMessage> _messages = [];
  final List<AssistantHistoryTurn> _history = [];
  String? _conversationToken;
  bool aiConfigured = false;
  AssistantReply? latestReply;
  String get modeLabel =>
      latestReply?.modeLabel ??
      (aiConfigured
          ? 'AI đã cấu hình • Chưa có phản hồi'
          : 'Trợ lý theo chức năng');
  List<AssistantMessage> get messages => List.unmodifiable(_messages);
  List<AssistantProfile> profiles = const [];
  AssistantProfile? selected;
  String? role;
  String? error;
  bool initializing = true;
  bool busy = false;
  bool sessionExpired = false;
  bool _disposed = false;
  int _generation = 0;
  bool get caregiver => role == 'NguoiChamSoc';
  void _sessionChanged() {
    _service.cancelPending();
    _generation++;
    _messages.clear();
    _history.clear();
    _conversationToken = null;
    latestReply = null;
    aiConfigured = false;
    profiles = const [];
    selected = null;
    role = null;
    busy = false;
    initializing = false;
    sessionExpired = true;
    error = 'Phiên đăng nhập đã thay đổi. Hãy đóng trợ lý rồi mở lại.';
    if (!_disposed) notifyListeners();
  }

  Future<void> initialize() async {
    if (sessionExpired || _disposed) return;
    final generation = ++_generation;
    final version = _session.value;
    initializing = true;
    error = null;
    notifyListeners();
    try {
      final context = await _service.loadContext();
      if (_disposed || generation != _generation || version != _session.value) {
        return;
      }
      role = context.role;
      aiConfigured = context.aiConfigured;
      profiles = context.profiles;
      selected = profiles.length == 1 ? profiles.first : null;
    } catch (e) {
      if (_disposed || generation != _generation || version != _session.value) {
        return;
      }
      error = _errorText(e);
    } finally {
      if (!_disposed &&
          generation == _generation &&
          version == _session.value) {
        initializing = false;
        notifyListeners();
      }
    }
  }

  void selectProfile(AssistantProfile profile) {
    if (sessionExpired || !profiles.any((p) => p.id == profile.id)) {
      return;
    }
    _generation++;
    _service.cancelPending();
    selected = profile;
    busy = false;
    _messages.clear();
    _history.clear();
    _conversationToken = null;
    latestReply = null;
    error = null;
    notifyListeners();
  }

  void clearConversation() {
    if (busy || sessionExpired) return;
    _generation++;
    _messages.clear();
    _history.clear();
    _conversationToken = null;
    latestReply = null;
    notifyListeners();
  }

  Future<void> send(String question) async {
    if (busy || initializing || sessionExpired || _disposed || error != null) {
      return;
    }
    if (question.trim().isEmpty || question.length > 500) return;
    final generation = _generation;
    final version = _session.value;
    busy = true;
    final retry =
        _messages.isNotEmpty &&
        _messages.last.isError &&
        _messages.last.retryQuestion?.trim() == question.trim();
    if (retry) {
      _messages.removeLast();
    } else {
      _messages.add(AssistantMessage(text: question.trim(), fromUser: true));
    }
    notifyListeners();
    try {
      final reply = await _service.chat(
        question,
        elderlyId: selected?.id,
        history: List.unmodifiable(_history),
        conversationToken: _conversationToken,
      );
      if (_disposed || generation != _generation || version != _session.value) {
        return;
      }
      _messages.add(
        AssistantMessage(text: reply.text, fromUser: false, reply: reply),
      );
      latestReply = reply;
      _conversationToken = reply.conversationToken ?? _conversationToken;
      // Keep the visible conversation bounded as well as the model history.
      if (_messages.length > 60) {
        _messages.removeRange(0, _messages.length - 60);
      }
      _history.addAll([
        AssistantHistoryTurn('user', question.trim()),
        AssistantHistoryTurn(
          'assistant',
          reply.text.length > 2200 ? reply.text.substring(0, 2200) : reply.text,
        ),
      ]);
      while (_history.length > 8 ||
          _history.fold<int>(0, (n, turn) => n + turn.content.length) > 6000) {
        _history.removeRange(0, 2);
      }
    } catch (e) {
      if (_disposed || generation != _generation || version != _session.value) {
        return;
      }
      _messages.add(
        AssistantMessage(
          text: _errorText(e),
          fromUser: false,
          isError: true,
          retryQuestion: question,
        ),
      );
    } finally {
      if (!_disposed &&
          generation == _generation &&
          version == _session.value) {
        busy = false;
        notifyListeners();
      }
    }
  }

  String _errorText(Object e) {
    if (e is ApiException) {
      return switch (e.statusCode) {
        401 => 'Bạn cần đăng nhập lại để sử dụng trợ lý.',
        403 =>
          'Bạn không có quyền truy cập hồ sơ này hoặc tài khoản đã thay đổi quyền.',
        404 => 'Chưa có hồ sơ liên kết hoặc hồ sơ không còn tồn tại.',
        429 => 'Bạn hỏi quá nhanh. Hãy chờ một phút rồi thử lại.',
        _ => e.message,
      };
    }
    return 'Không tải được dữ liệu. Vui lòng thử lại.';
  }

  @override
  void dispose() {
    _service.cancelPending();
    _disposed = true;
    _generation++;
    _messages.clear();
    _history.clear();
    _conversationToken = null;
    latestReply = null;
    profiles = const [];
    selected = null;
    _session.removeListener(_sessionChanged);
    super.dispose();
  }
}
