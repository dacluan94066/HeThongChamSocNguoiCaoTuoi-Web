import 'package:dio/dio.dart';
import 'package:flutter/material.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';

class ApiClient {
  ApiClient._() {
    dio = Dio(
      BaseOptions(
        baseUrl: baseUrl,
        connectTimeout: const Duration(seconds: 15),
        receiveTimeout: const Duration(seconds: 15),
        headers: const {'Accept': 'application/json'},
      ),
    );

    dio.interceptors.add(
      InterceptorsWrapper(
        onRequest: (options, handler) async {
          if (!_isPublicAuthPath(options.path)) {
            final token = await storage.read(key: tokenKey);
            if (token != null && token.isNotEmpty) {
              options.headers['Authorization'] = 'Bearer $token';
            }
          }
          handler.next(options);
        },
        onError: (error, handler) async {
          if (error.response?.statusCode == 401) {
            await clearSession();

            // Sai thong tin dang nhap van duoc LoginScreen hien thi tai cho.
            // Chi request da bao ve moi can day nguoi dung ve trang dang nhap.
            if (!_isPublicAuthPath(error.requestOptions.path)) {
              redirectToLogin();
            }
          }
          handler.next(error);
        },
      ),
    );
  }

  static const String baseUrl = String.fromEnvironment(
    'API_BASE_URL',
    defaultValue: 'http://10.0.2.2:5000/api',
  );
  static const String tokenKey = 'jwt_token';
  static const String userKey = 'auth_user';

  static const FlutterSecureStorage storage = FlutterSecureStorage();
  static final GlobalKey<NavigatorState> navigatorKey =
      GlobalKey<NavigatorState>();
  static final ApiClient instance = ApiClient._();

  late final Dio dio;
  static bool _redirectScheduled = false;
  static int _sessionVersion = 0;

  static int get sessionVersion => _sessionVersion;

  static bool _isPublicAuthPath(String path) {
    return path.endsWith('/auth/login') ||
        path.endsWith('/auth/register') ||
        path.endsWith('/auth/forgot-password') ||
        path.endsWith('/auth/verify-otp') ||
        path.endsWith('/auth/reset-password-with-token');
  }

  static Future<void> clearSession() async {
    // Tang version ngay lap tuc de moi request/cache cua phien cu het hieu luc.
    _sessionVersion++;
    await Future.wait([
      storage.delete(key: tokenKey),
      storage.delete(key: userKey),
    ]);
  }

  static void redirectToLogin() {
    if (_redirectScheduled) return;
    _redirectScheduled = true;

    WidgetsBinding.instance.addPostFrameCallback((_) {
      final navigator = navigatorKey.currentState;
      if (navigator != null) {
        navigator.pushNamedAndRemoveUntil('/login', (route) => false);
      }
      _redirectScheduled = false;
    });
  }
}

class ApiException implements Exception {
  const ApiException(this.message, {this.statusCode, this.dioType});

  final String message;
  final int? statusCode;
  final DioExceptionType? dioType;

  bool get isConnectionFailure =>
      dioType == DioExceptionType.connectionError ||
      dioType == DioExceptionType.connectionTimeout ||
      dioType == DioExceptionType.sendTimeout ||
      dioType == DioExceptionType.receiveTimeout;

  factory ApiException.fromDio(DioException error) {
    final responseData = error.response?.data;
    final backendMessage = responseData is Map
        ? responseData['message']?.toString().trim()
        : null;

    if (backendMessage != null && backendMessage.isNotEmpty) {
      return ApiException(
        backendMessage,
        statusCode: error.response?.statusCode,
        dioType: error.type,
      );
    }

    final message = switch (error.type) {
      DioExceptionType.connectionTimeout ||
      DioExceptionType.sendTimeout ||
      DioExceptionType.receiveTimeout =>
        'Kết nối đến máy chủ quá thời gian. Vui lòng thử lại.',
      DioExceptionType.connectionError =>
        'Không thể kết nối đến máy chủ. Hãy kiểm tra backend và địa chỉ API.',
      _ => 'Có lỗi xảy ra khi kết nối đến máy chủ.',
    };

    return ApiException(
      message,
      statusCode: error.response?.statusCode,
      dioType: error.type,
    );
  }

  @override
  String toString() => message;
}
