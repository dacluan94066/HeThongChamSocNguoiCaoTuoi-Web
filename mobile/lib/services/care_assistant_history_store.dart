import 'dart:convert';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import '../models/assistant_conversation.dart';
import 'api_client.dart';

/// Uses Android encrypted storage / iOS device-only Keychain, not preferences.
/// Keys are scoped by API server, authenticated account and selected profile.
class CareAssistantHistoryStore {
  CareAssistantHistoryStore({FlutterSecureStorage? storage})
    : _storage =
          storage ??
          const FlutterSecureStorage(
            aOptions: AndroidOptions(
              storageNamespace: 'care_senior_assistant_history',
              resetOnError: false,
            ),
            iOptions: IOSOptions(
              accessibility: KeychainAccessibility.unlocked_this_device,
              accountName: 'care_senior_assistant_history',
            ),
          );
  final FlutterSecureStorage _storage;
  // A newly opened screen waits for writes enqueued by the screen just closed.
  static Future<void> _queue = Future<void>.value();
  static String scope(String accountId, int? profileId) =>
      'care_assistant_v1_${Uri.encodeComponent(ApiClient.baseUrl)}_'
      '${Uri.encodeComponent(accountId)}_${profileId ?? 'general'}';

  Future<T> _enqueue<T>(Future<T> Function() action) {
    final result = _queue.then((_) => action());
    _queue = result.then<void>((_) {}, onError: (Object _) {});
    return result;
  }

  Future<AssistantArchive> load(String scope) => _enqueue(() async {
    final raw = await _storage.read(key: scope);
    if (raw == null) return AssistantArchive();
    if (raw.length > 8000000) throw const FormatException('Oversized archive');
    return AssistantArchive.fromJson(
      Map<String, dynamic>.from(jsonDecode(raw) as Map),
    );
  });

  Future<void> save(String scope, AssistantArchive archive) {
    // Capture immutable JSON before queueing; later UI changes cannot alter it.
    final encoded = jsonEncode(archive.toJson());
    return _enqueue(() => _storage.write(key: scope, value: encoded));
  }
}
