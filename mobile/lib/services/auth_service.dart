import 'dart:convert';

import 'package:dio/dio.dart';

import 'api_client.dart';
import 'elderly_service.dart';

class AuthService {
  AuthService._();

  static final AuthService instance = AuthService._();

  Dio get _dio => ApiClient.instance.dio;

  Future<Map<String, dynamic>> login(String tenDangNhap, String matKhau) async {
    // Huy du lieu cua tai khoan truoc ngay khi bat dau lan dang nhap moi.
    // Response ho so dang chay cua phien cu cung bi danh dau het hieu luc.
    ElderlyService.instance.clearCache();
    await ApiClient.clearSession();

    try {
      final response = await _dio.post<Map<String, dynamic>>(
        '/auth/login',
        data: {
          'tenDangNhap': tenDangNhap,
          'matKhau': matKhau,
          'platform': 'mobile',
        },
      );
      final data = _extractData(response);
      final token = data['token']?.toString();
      final user = data['user'];

      if (token == null || token.isEmpty || user is! Map) {
        throw const ApiException('Phản hồi đăng nhập không hợp lệ.');
      }

      final userMap = Map<String, dynamic>.from(user);
      await ApiClient.storage.write(key: ApiClient.tokenKey, value: token);
      await ApiClient.storage.write(
        key: ApiClient.userKey,
        value: jsonEncode(userMap),
      );

      ElderlyService.instance.beginSession(userMap['userId']);
      // Nap dung ho so cua tai khoan moi truoc khi LoginScreen mo HomeScreen.
      await ElderlyService.instance.getMyProfile(refresh: true);

      return userMap;
    } on DioException catch (error) {
      throw ApiException.fromDio(error);
    }
  }

  Future<Map<String, dynamic>> register({
    required String tenDangNhap,
    required String matKhau,
    required String hoTen,
    required String ngaySinh,
    required String gioiTinh,
    String? email,
    String? soDienThoai,
    String? cccd,
    String? diaChi,
    String? nhomMau,
    String? benhNen,
    String? diUng,
  }) async {
    try {
      final body = <String, dynamic>{
        'tenDangNhap': tenDangNhap,
        'matKhau': matKhau,
        'hoTen': hoTen,
        'ngaySinh': ngaySinh,
        'gioiTinh': gioiTinh,
        'email': email,
        'soDienThoai': soDienThoai,
        'cccd': cccd,
        'diaChi': diaChi,
        'nhomMau': nhomMau,
        'benhNen': benhNen,
        'diUng': diUng,
      }..removeWhere((key, value) => value == null);

      final response = await _dio.post<Map<String, dynamic>>(
        '/auth/register',
        data: body,
      );
      return _extractData(response);
    } on DioException catch (error) {
      throw ApiException.fromDio(error);
    }
  }

  Future<void> logout() async {
    ElderlyService.instance.clearCache();
    await ApiClient.clearSession();
  }

  Future<String?> getToken() {
    return ApiClient.storage.read(key: ApiClient.tokenKey);
  }

  Future<Map<String, dynamic>> getMe() async {
    final user = await _get('/auth/me');
    ElderlyService.instance.beginSession(user['userId']);
    await ElderlyService.instance.getMyProfile(refresh: true);
    return user;
  }

  Future<Map<String, dynamic>> getMyElderlyProfile() async {
    return _get('/elderly/me');
  }

  Future<void> changePassword(String matKhauHienTai, String matKhauMoi) async {
    try {
      await _dio.post<Map<String, dynamic>>(
        '/auth/change-password',
        data: {'matKhauHienTai': matKhauHienTai, 'matKhauMoi': matKhauMoi},
      );
    } on DioException catch (error) {
      throw ApiException.fromDio(error);
    }
  }

  Future<Map<String, dynamic>> _get(String path) async {
    try {
      final response = await _dio.get<Map<String, dynamic>>(path);
      return _extractData(response);
    } on DioException catch (error) {
      throw ApiException.fromDio(error);
    }
  }

  Map<String, dynamic> _extractData(Response<Map<String, dynamic>> response) {
    final envelope = response.data;
    final data = envelope?['data'];
    if (data is Map) return Map<String, dynamic>.from(data);

    throw ApiException(
      envelope?['message']?.toString() ?? 'Phản hồi từ máy chủ không hợp lệ.',
      statusCode: response.statusCode,
    );
  }
}
