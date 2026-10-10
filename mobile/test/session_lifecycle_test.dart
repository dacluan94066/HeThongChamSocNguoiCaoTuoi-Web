import 'dart:async';
import 'dart:convert';
import 'dart:typed_data';
import 'package:dio/dio.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:elderly_care_app/services/api_client.dart';

class SessionAdapter implements HttpClientAdapter {
  final started = Completer<void>();
  final reply = Completer<int>();
  @override
  void close({bool force = false}) {}
  @override
  Future<ResponseBody> fetch(
    RequestOptions options,
    Stream<Uint8List>? stream,
    Future<void>? cancel,
  ) async {
    started.complete();
    return ResponseBody.fromString(
      jsonEncode({
        'data': {'id': 1},
      }),
      await reply.future,
      headers: {
        Headers.contentTypeHeader: [Headers.jsonContentType],
      },
    );
  }
}

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();
  late HttpClientAdapter previous;
  setUp(() async {
    FlutterSecureStorage.setMockInitialValues({});
    await ApiClient.clearSession();
    await ApiClient.saveSession(
      token: 'synthetic-old',
      encodedUser: '{}',
      expectedVersion: ApiClient.sessionVersion,
    );
    previous = ApiClient.instance.dio.httpClientAdapter;
  });
  tearDown(() {
    ApiClient.instance.dio.httpClientAdapter = previous;
  });
  test('Protected HTTP 401 invalidates token and stored user', () async {
    final adapter = SessionAdapter();
    ApiClient.instance.dio.httpClientAdapter = adapter;
    final before = ApiClient.sessionVersion;
    final future = ApiClient.instance.dio.get('/auth/me');
    final checked = expectLater(
      future,
      throwsA(
        isA<DioException>().having(
          (e) => e.response?.statusCode,
          'status',
          401,
        ),
      ),
    );
    await adapter.started.future;
    adapter.reply.complete(401);
    await checked;
    expect(ApiClient.sessionVersion, before + 1);
    expect(await ApiClient.storage.read(key: ApiClient.tokenKey), isNull);
    expect(await ApiClient.storage.read(key: ApiClient.userKey), isNull);
  });
  for (final status in [200, 401]) {
    test(
      'Late HTTP $status from old account cannot affect new session',
      () async {
        final adapter = SessionAdapter();
        ApiClient.instance.dio.httpClientAdapter = adapter;
        final future = ApiClient.instance.dio.get('/elderly/me');
        final checked = expectLater(
          future,
          throwsA(
            isA<DioException>().having(
              (e) => e.type,
              'type',
              DioExceptionType.cancel,
            ),
          ),
        );
        await adapter.started.future;
        await ApiClient.clearSession();
        final version = ApiClient.sessionVersion;
        await ApiClient.saveSession(
          token: 'synthetic-new',
          encodedUser: '{"userId":2}',
          expectedVersion: version,
        );
        adapter.reply.complete(status);
        await checked;
        expect(ApiClient.sessionVersion, version);
        expect(
          await ApiClient.storage.read(key: ApiClient.tokenKey),
          'synthetic-new',
        );
      },
    );
  }
}
