import 'package:dio/dio.dart';
import 'package:flutter/foundation.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:elderly_care_app/services/api_client.dart';

void main() {
  test(
    'API_BASE_URL override wins; Web defaults to localhost, native to emulator',
    () {
      const configured = String.fromEnvironment('API_BASE_URL');
      expect(
        ApiClient.baseUrl,
        configured.isNotEmpty
            ? configured
            : kIsWeb
            ? 'http://localhost:5000/api'
            : 'http://10.0.2.2:5000/api',
      );
      for (final route in ['/auth/login', '/auth/register']) {
        final request = RequestOptions(baseUrl: ApiClient.baseUrl, path: route);
        expect(request.uri.path, '/api$route');
      }
    },
  );
  test('Network failure has no HTTP status and does not expose raw errors', () {
    final error = ApiException.fromDio(
      DioException(
        requestOptions: RequestOptions(path: '/auth/login'),
        type: DioExceptionType.connectionError,
        error: 'raw sensitive transport detail',
      ),
    );
    expect(error.isConnectionFailure, isTrue);
    expect(error.statusCode, isNull);
    expect(error.message, contains('Không thể kết nối'));
    expect(error.message, isNot(contains('sensitive')));
  });
  for (final status in [400, 401, 403, 404, 409, 429, 500]) {
    test('HTTP $status remains an HTTP error, not a network failure', () {
      final options = RequestOptions(path: '/auth/register');
      final error = ApiException.fromDio(
        DioException(
          requestOptions: options,
          type: DioExceptionType.badResponse,
          response: Response(
            requestOptions: options,
            statusCode: status,
            data: {},
          ),
        ),
      );
      expect(error.statusCode, status);
      expect(error.isConnectionFailure, isFalse);
      expect(error.message, isNot(contains('Không thể kết nối')));
    });
  }
  test('Backend validation message is preserved', () {
    final options = RequestOptions(path: '/auth/register');
    final error = ApiException.fromDio(
      DioException(
        requestOptions: options,
        type: DioExceptionType.badResponse,
        response: Response(
          requestOptions: options,
          statusCode: 400,
          data: {'message': 'Thiếu thông tin bắt buộc.'},
        ),
      ),
    );
    expect(error.message, 'Thiếu thông tin bắt buộc.');
  });
}
