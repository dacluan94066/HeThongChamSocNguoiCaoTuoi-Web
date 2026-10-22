import 'dart:async';
import 'package:flutter/foundation.dart';
import '../models/care_assistant.dart';
import '../models/assistant_conversation.dart';
import 'api_client.dart';
import 'care_assistant_history_store.dart';
import 'care_assistant_service.dart';

class CareAssistantController extends ChangeNotifier {
  CareAssistantController({
    CareAssistantService? service,
    ValueListenable<int>? session,
    CareAssistantHistoryStore? historyStore,
  }) : _service = service ?? CareAssistantService(),
       _historyStore = historyStore ?? CareAssistantHistoryStore(),
       _session = session ?? ApiClient.sessionChanges {
    _session.addListener(_sessionChanged);
  }
  final CareAssistantService _service;
  final ValueListenable<int> _session;
  final CareAssistantHistoryStore _historyStore;
  final List<AssistantConversation> _conversations = [];
  String? _accountId;
  String? _storageScope;
  String? _activeConversationId;
  DateTime? _tokenSavedAt;
  bool _storageReady = false;
  String? storageNotice;
  String? get activeConversationId => _activeConversationId;
  List<AssistantConversation> get conversations => List.unmodifiable(
    [..._conversations]..sort((a, b) => b.updatedAt.compareTo(a.updatedAt)),
  );
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
    _tokenSavedAt = null;
    _conversations.clear();
    _activeConversationId = null;
    _storageScope = null;
    _accountId = null;
    _storageReady = false;
    storageNotice = null;
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
      _accountId = context.accountId;
      await _restoreConversations(generation, version);
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
    _tokenSavedAt = null;
    _conversations.clear();
    _activeConversationId = null;
    _storageScope = null;
    _storageReady = false;
    storageNotice = null;
    latestReply = null;
    error = null;
    if (_accountId != null) {
      final generation = _generation;
      initializing = true;
      unawaited(
        _restoreConversations(generation, _session.value).whenComplete(() {
          if (!_disposed && !sessionExpired && generation == _generation) {
            initializing = false;
            notifyListeners();
          }
        }),
      );
    }
    notifyListeners();
  }

  Future<void> _restoreConversations(int generation, int version) async {
    final account = _accountId;
    if (account == null) {
      return; // Injected/legacy contexts have no persistent identity.
    }
    final scope = CareAssistantHistoryStore.scope(account, selected?.id);
    _storageScope = scope;
    try {
      final archive = await _historyStore.load(scope);
      if (_disposed || generation != _generation || version != _session.value) {
        return;
      }
      _conversations
        ..clear()
        ..addAll(archive.conversations);
      _activeConversationId = archive.activeId;
      _storageReady = true;
      for (final conversation in _conversations) {
        if (conversation.id == archive.activeId) {
          _showConversation(conversation);
        }
      }
    } catch (_) {
      if (_disposed || generation != _generation || version != _session.value) {
        return;
      }
      _storageReady = false; // Do not overwrite an unreadable archive.
      storageNotice =
          'Không đọc được lịch sử trên điện thoại. Chat tạm thời chưa được lưu; lịch sử cũ không bị ghi đè.';
    }
  }

  void _showConversation(AssistantConversation conversation) {
    _messages
      ..clear()
      ..addAll(conversation.messages);
    _history
      ..clear()
      ..addAll(conversation.history);
    _conversationToken = null;
    _tokenSavedAt = null;
    final savedAt = conversation.tokenSavedAt;
    // Server-signed context expires after 30 minutes. Never replay an old token.
    if (savedAt != null &&
        !savedAt.isAfter(DateTime.now()) &&
        DateTime.now().difference(savedAt) < const Duration(minutes: 25)) {
      _conversationToken = conversation.conversationToken;
      _tokenSavedAt = savedAt;
    }
    latestReply = null;
    for (final message in _messages.reversed) {
      if (message.reply != null) {
        latestReply = message.reply;
        break;
      }
    }
    if (_messages.isNotEmpty && _messages.last.fromUser) {
      _messages.add(
        AssistantMessage(
          text: 'Lượt trả lời trước bị gián đoạn. Bạn có thể nhấn thử lại.',
          fromUser: false,
          isError: true,
          retryQuestion: _messages.last.text,
        ),
      );
      _trimMessages();
    }
  }

  void _trimMessages() {
    if (_messages.length > AssistantConversation.maxMessages) {
      _messages.removeRange(
        0,
        _messages.length - AssistantConversation.maxMessages,
      );
    }
  }

  Future<void> _persist() async {
    if (_disposed || sessionExpired) return;
    if (_messages.isNotEmpty) {
      _activeConversationId ??= AssistantConversation.newId();
      final existing = _conversations.indexWhere(
        (item) => item.id == _activeConversationId,
      );
      final title = existing >= 0
          ? _conversations[existing].title
          : String.fromCharCodes(
              _messages
                  .firstWhere(
                    (message) => message.fromUser,
                    orElse: () => _messages.first,
                  )
                  .text
                  .replaceAll(RegExp(r'\s+'), ' ')
                  .runes
                  .take(60),
            );
      final conversation = AssistantConversation(
        id: _activeConversationId!,
        title: title,
        updatedAt: _messages.last.time,
        messages: List.of(_messages),
        history: List.of(_history),
        conversationToken: _conversationToken,
        tokenSavedAt: _tokenSavedAt,
      );
      if (existing < 0) {
        _conversations.add(conversation);
      } else {
        _conversations[existing] = conversation;
      }
    }
    final scope = _storageScope;
    if (!_storageReady || scope == null) return;
    final generation = _generation, version = _session.value;
    try {
      await _historyStore.save(
        scope,
        AssistantArchive(
          activeId: _activeConversationId,
          conversations: List.of(_conversations),
        ),
      );
      if (!_disposed &&
          generation == _generation &&
          version == _session.value) {
        storageNotice = null;
      }
    } catch (_) {
      if (!_disposed &&
          generation == _generation &&
          version == _session.value) {
        storageNotice =
            'Không lưu được lịch sử trên điện thoại. Đừng đóng chat; hãy thử lưu lại.';
      }
    }
    if (!_disposed && generation == _generation && version == _session.value) {
      notifyListeners();
    }
  }

  Future<void> retrySave() => _persist();

  void newConversation() {
    if (busy || initializing || sessionExpired || _disposed || error != null) {
      return;
    }
    if (_messages.isEmpty) return;
    _generation++;
    _activeConversationId = null;
    _messages.clear();
    _history.clear();
    _conversationToken = null;
    _tokenSavedAt = null;
    latestReply = null;
    unawaited(_persist());
    notifyListeners();
  }

  void openConversation(String id) {
    if (busy || initializing || sessionExpired || _disposed) return;
    for (final conversation in _conversations) {
      if (conversation.id != id) continue;
      _generation++;
      _activeConversationId = id;
      _showConversation(conversation);
      unawaited(_persist());
      notifyListeners();
      break;
    }
  }

  void clearConversation() {
    if (busy || initializing || sessionExpired || _disposed) return;
    _generation++;
    _conversations.removeWhere((item) => item.id == _activeConversationId);
    _activeConversationId = null;
    _messages.clear();
    _history.clear();
    _conversationToken = null;
    _tokenSavedAt = null;
    latestReply = null;
    unawaited(_persist());
    notifyListeners();
  }

  Future<void> send(String question) async {
    if (busy || initializing || sessionExpired || _disposed || error != null) {
      return;
    }
    if (question.trim().isEmpty || question.length > 500) return;
    if (_activeConversationId == null &&
        _conversations.length >= AssistantArchive.maxConversations) {
      storageNotice =
          'Đã có ${AssistantArchive.maxConversations} cuộc trò chuyện. Hãy xóa một cuộc cũ trước khi tạo thêm.';
      notifyListeners();
      return;
    }
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
    _trimMessages();
    unawaited(_persist());
    notifyListeners();
    try {
      final reply = await _service.chat(
        question,
        elderlyId: selected?.id,
        history: List.unmodifiable(_history),
        conversationToken:
            _tokenSavedAt != null &&
                DateTime.now().difference(_tokenSavedAt!) <
                    const Duration(minutes: 25)
            ? _conversationToken
            : null,
      );
      if (_disposed || generation != _generation || version != _session.value) {
        return;
      }
      _messages.add(
        AssistantMessage(text: reply.text, fromUser: false, reply: reply),
      );
      latestReply = reply;
      if (reply.conversationToken != null) {
        _conversationToken = reply.conversationToken;
        _tokenSavedAt = DateTime.now();
      }
      // Keep the visible conversation bounded as well as the model history.
      _trimMessages();
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
      _trimMessages();
    } finally {
      if (!_disposed &&
          generation == _generation &&
          version == _session.value) {
        await _persist();
        if (!_disposed &&
            generation == _generation &&
            version == _session.value) {
          busy = false;
          notifyListeners();
        }
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
    _tokenSavedAt = null;
    _conversations.clear();
    _accountId = null;
    _activeConversationId = null;
    _storageScope = null;
    latestReply = null;
    profiles = const [];
    selected = null;
    _session.removeListener(_sessionChanged);
    super.dispose();
  }
}
