import 'dart:math';
import 'care_assistant.dart';

/// Local display history, never a source of authorization or current API facts.
class AssistantConversation {
  AssistantConversation({
    required this.id,
    required this.title,
    required this.updatedAt,
    required this.messages,
    required this.history,
    this.conversationToken,
    this.tokenSavedAt,
  });

  static const maxMessages = 60;
  static String newId() =>
      '${DateTime.now().microsecondsSinceEpoch}-'
      '${Random.secure().nextInt(1 << 32).toRadixString(16)}';
  final String id;
  final String title;
  final DateTime updatedAt;
  final List<AssistantMessage> messages;
  final List<AssistantHistoryTurn> history;
  final String? conversationToken;
  final DateTime? tokenSavedAt;

  Map<String, dynamic> toJson() => {
    'id': id,
    'title': title,
    'updatedAt': updatedAt.toIso8601String(),
    'messages': messages
        .map(
          (message) => {
            'text': message.text,
            'fromUser': message.fromUser,
            'time': message.time.toIso8601String(),
            'isError': message.isError,
            'retryQuestion': message.retryQuestion,
            if (message.reply case final reply?)
              'reply': {
                'text': reply.text,
                'intent': reply.intent,
                'domain': reply.domain,
                'actions': reply.actions.map((action) => action.name).toList(),
                'fetchedAt': reply.fetchedAt?.toIso8601String(),
                'truncated': reply.truncated, 'mode': reply.mode,
                'modeReason': reply.modeReason,
                'aiFailureCode': reply.aiFailureCode,
                // Raw API rows and per-reply tokens are not needed to display history.
              },
          },
        )
        .toList(),
    'history': history.map((turn) => turn.toJson()).toList(),
    'conversationToken': conversationToken,
    'tokenSavedAt': tokenSavedAt?.toIso8601String(),
  };

  factory AssistantConversation.fromJson(Map<String, dynamic> data) {
    final rawMessages = data['messages'] as List;
    final rawHistory = data['history'] as List;
    if (data['id'] is! String ||
        (data['id'] as String).length > 100 ||
        data['title'] is! String ||
        (data['title'] as String).length > 160 ||
        rawMessages.length > maxMessages ||
        rawHistory.length > 8) {
      throw const FormatException('Invalid saved conversation');
    }
    final messages = rawMessages.map((raw) {
      final message = Map<String, dynamic>.from(raw as Map);
      if (message['text'] is! String ||
          (message['text'] as String).length > 6000 ||
          message['fromUser'] is! bool) {
        throw const FormatException('Invalid saved message');
      }
      return AssistantMessage(
        text: message['text'] as String,
        fromUser: message['fromUser'] as bool,
        time: DateTime.parse(message['time'] as String),
        isError: message['isError'] == true,
        retryQuestion: message['retryQuestion'] as String?,
        reply: message['reply'] is Map
            ? AssistantReply.fromJson(
                Map<String, dynamic>.from(message['reply'] as Map),
              )
            : null,
      );
    }).toList();
    final history = rawHistory.map((raw) {
      final turn = Map<String, dynamic>.from(raw as Map);
      final role = turn['role'], content = turn['content'];
      if (!['user', 'assistant'].contains(role) ||
          content is! String ||
          content.length > (role == 'user' ? 500 : 2200)) {
        throw const FormatException('Invalid saved context');
      }
      return AssistantHistoryTurn(role as String, content);
    }).toList();
    if (history.fold<int>(0, (sum, turn) => sum + turn.content.length) > 6000 ||
        history.length.isOdd ||
        ((data['conversationToken'] as String?)?.length ?? 0) > 4000) {
      throw const FormatException('Oversized saved context');
    }
    return AssistantConversation(
      id: data['id'] as String,
      title: data['title'] as String,
      updatedAt: DateTime.parse(data['updatedAt'] as String),
      messages: messages,
      history: history,
      conversationToken: data['conversationToken'] as String?,
      tokenSavedAt: DateTime.tryParse(data['tokenSavedAt']?.toString() ?? ''),
    );
  }
}

class AssistantArchive {
  AssistantArchive({this.activeId, this.conversations = const []});
  static const maxConversations = 30;
  final String? activeId;
  final List<AssistantConversation> conversations;
  Map<String, dynamic> toJson() => {
    'version': 1,
    'activeId': activeId,
    'conversations': conversations
        .map((conversation) => conversation.toJson())
        .toList(),
  };
  factory AssistantArchive.fromJson(Map<String, dynamic> data) {
    final raw = data['conversations'] as List;
    if (data['version'] != 1 || raw.length > maxConversations) {
      throw const FormatException('Invalid saved archive');
    }
    final conversations = raw
        .map(
          (item) => AssistantConversation.fromJson(
            Map<String, dynamic>.from(item as Map),
          ),
        )
        .toList();
    final ids = conversations.map((item) => item.id).toSet();
    final active = data['activeId'] as String?;
    if (ids.length != conversations.length ||
        active != null && !ids.contains(active)) {
      throw const FormatException('Invalid saved selection');
    }
    return AssistantArchive(activeId: active, conversations: conversations);
  }
}
