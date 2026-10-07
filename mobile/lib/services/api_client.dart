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
          final version = sessionVersion;
          options.extra['sessionVersion'] = version;
          try {
            if (!_isPublicAuthPath(options.path)) {
              await _storageQueue;
              final token = await storage.read(key: tokenKey);
              if (version != sessionVersion) {
                handler.reject(_staleRequest(options));
                return;
              }
              if (token != null && token.isNotEmpty) {
                options.headers['Authorization'] = 'Bearer $token';
              }
            }
            handler.next(options);
          } catch (_) {
            handler.reject(
              DioException(
                requestOptions: options,
                type: DioExceptionType.unknown,
                error: const ApiException(
                  'Không thể đọc phiên đăng nhập trên thiết bị. Vui lòng thử lại.',
                ),
              ),
            );
          }
        },
        onResponse: (response, handler) {
          final options = response.requestOptions;
          if (!_isPublicAuthPath(options.path) &&
              options.extra['sessionVersion'] != sessionVersion) {
            handler.reject(_staleRequest(options));
            return;
          }
          handler.next(response);
        },
        onError: (error, handler) async {
          final options = error.requestOptions;
          final isProtected = !_isPublicAuthPath(options.path);
          if (isProtected &&
              options.extra['sessionVersion'] != sessionVersion) {
            handler.reject(_staleRequest(options));
            return;
          }

          if (isProtected && error.response?.statusCode == 401) {
            final expiredVersion = sessionVersion;
            try {
              await clearSession();
            } catch (_) {
              // Phiên trong bộ nhớ vẫn đã bị vô hiệu hóa.
            }
            if (sessionVersion == expiredVersion + 1) {
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
  static Future<void> _storageQueue = Future<void>.value();

  static int get sessionVersion => _sessionVersion;

  static bool _isPublicAuthPath(String path) {
    final normalized = Uri.parse(path).path.replaceAll(RegExp(r'/+$'), '');

    return normalized.endsWith('/auth/login') ||
        normalized.endsWith('/auth/register') ||
        normalized.endsWith('/auth/forgot-password') ||
        normalized.endsWith('/auth/verify-otp') ||
        normalized.endsWith('/auth/reset-password-with-token');
  }

  static DioException _staleRequest(RequestOptions options) {
    return DioException(
      requestOptions: options,
      type: DioExceptionType.cancel,
      message: 'Phiên đăng nhập đã thay đổi.',
    );
  }

  static Future<void> _enqueueStorage(Future<void> Function() action) {
    final operation = _storageQueue.then((_) => action());
    _storageQueue = operation.then<void>((_) {}, onError: (Object _) {});
    return operation;
  }

  static void _checkVersion(int expectedVersion) {
    if (sessionVersion != expectedVersion) {
      throw const ApiException(
        'Phiên đăng nhập đã thay đổi. Vui lòng đăng nhập lại.',
        dioType: DioExceptionType.cancel,
      );
    }
  }

  static Future<void> clearSession() {
    _sessionVersion++;
    return _enqueueStorage(() async {
      await Future.wait([
        storage.delete(key: tokenKey),
        storage.delete(key: userKey),
      ]);
    });
  }

  static Future<void> saveSession({
    required String token,
    required String encodedUser,
    required int expectedVersion,
  }) {
    return _enqueueStorage(() async {
      _checkVersion(expectedVersion);
      try {
        await storage.write(key: tokenKey, value: token);
        await storage.write(key: userKey, value: encodedUser);
        _checkVersion(expectedVersion);
      } catch (error) {
        // Không giữ token khi chỉ lưu được một phần phiên đăng nhập.
        try {
          await Future.wait([
            storage.delete(key: tokenKey),
            storage.delete(key: userKey),
          ]);
        } catch (_) {
          // Giữ lỗi gốc để giao diện hiển thị đúng nguyên nhân.
        }
        if (error is ApiException) rethrow;
        throw const ApiException(
          'Không thể lưu phiên đăng nhập trên thiết bị. Vui lòng thử lại.',
        );
      }
    });
  }

  static Future<void> updateStoredUser({
    required String encodedUser,
    required int expectedVersion,
  }) {
    return _enqueueStorage(() async {
      _checkVersion(expectedVersion);
      await storage.write(key: userKey, value: encodedUser);
      _checkVersion(expectedVersion);
    });
  }

  static void redirectToLogin() {
    if (_redirectScheduled) return;
    _redirectScheduled = true;
    final scheduledVersion = sessionVersion;
    WidgetsBinding.instance.addPostFrameCallback((_) {
      try {
        if (sessionVersion != scheduledVersion) return;
        navigatorKey.currentState?.pushNamedAndRemoveUntil(
          '/login',
          (route) => false,
        );
      } finally {
        _redirectScheduled = false;
      }
    });
    WidgetsBinding.instance.ensureVisualUpdate();
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
    if (error.error is ApiException) {
      return error.error as ApiException;
    }

    final responseData = error.response?.data;
    final backendMessage = responseData is Map
        ? responseData['message']?.toString().trim()
        : null;
    // Không hiển thị message của response cũ cho tài khoản mới.
    final message = error.type == DioExceptionType.cancel
        ? 'Yêu cầu đã bị hủy hoặc phiên đăng nhập đã thay đổi.'
        : backendMessage != null && backendMessage.isNotEmpty
        ? backendMessage
        : switch (error.type) {
            DioExceptionType.connectionTimeout ||
            DioExceptionType.sendTimeout ||
            DioExceptionType.receiveTimeout =>
              'Kết nối đến máy chủ quá thời gian. Vui lòng thử lại.',
            DioExceptionType.connectionError =>
              'Không thể kết nối đến máy chủ. Kiểm tra backend và địa chỉ API.',
            DioExceptionType.badCertificate =>
              'Không thể xác minh chứng chỉ bảo mật của máy chủ.',
            _ => switch (error.response?.statusCode) {
              401 => 'Phiên đăng nhập đã hết hạn hoặc thông tin đăng nhập sai.',
              403 => 'Bạn không có quyền thực hiện thao tác này.',
              404 => 'Không tìm thấy dữ liệu yêu cầu.',
              429 => 'Có quá nhiều yêu cầu. Vui lòng chờ rồi thử lại.',
              final int status when status >= 500 =>
                'Máy chủ đang gặp lỗi. Vui lòng thử lại sau.',
              _ => 'Có lỗi xảy ra khi kết nối đến máy chủ.',
            },
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
