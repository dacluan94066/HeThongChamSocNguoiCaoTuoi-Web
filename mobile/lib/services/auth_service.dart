import 'dart:convert';

import 'package:dio/dio.dart';

import 'api_client.dart';
import 'alert_service.dart';
import 'appointment_service.dart';
import 'caregiver_service.dart';
import 'caregiver_dashboard_service.dart';
import 'elderly_service.dart';
import 'health_metric_service.dart';
import 'local_notification_service.dart';
import 'medication_schedule_service.dart';

class AuthService {
  AuthService._();

  static final AuthService instance = AuthService._();

  Dio get _dio => ApiClient.instance.dio;

  Future<Map<String, dynamic>> login(String tenDangNhap, String matKhau) async {
    // Huy du lieu cua tai khoan truoc ngay khi bat dau lan dang nhap moi.
    // Response ho so dang chay cua phien cu cung bi danh dau het hieu luc.
    ElderlyService.instance.clearCache();
    AlertService.instance.clearCache();
    AppointmentService.instance.clearCache();
    CaregiverService.instance.clearCache();
    CaregiverDashboardService.instance.clearCache();
    HealthMetricService.instance.clearCache();
    MedicationScheduleService.instance.clearCache();
    await LocalNotificationService.cancelMedicationReminders();
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
      AlertService.instance.beginSession();
      AppointmentService.instance.beginSession();
      CaregiverService.instance.beginSession();
      CaregiverDashboardService.instance.beginSession();
      HealthMetricService.instance.beginSession();
      MedicationScheduleService.instance.beginSession();
      // Chi tai khoan NguoiCaoTuoi moi co HoSoNguoiCaoTuoi gan truc tiep.
      if (userMap['tenVaiTro'] == 'NguoiCaoTuoi') {
        await ElderlyService.instance.getMyProfile(refresh: true);
      }

      return userMap;
    } on DioException catch (error) {
      throw ApiException.fromDio(error);
    }
  }

  Future<Map<String, dynamic>> register({
    required String tenDangNhap,
    required String matKhau,
    required String hoTen,
    required String loaiTaiKhoan,
    String? ngaySinh,
    String? gioiTinh,
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
        'loaiTaiKhoan': loaiTaiKhoan,
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

  Future<void> forgotPassword({String? email, String? tenDangNhap}) async {
    try {
      await _dio.post<Map<String, dynamic>>(
        '/auth/forgot-password',
        data: {
          if (email != null && email.trim().isNotEmpty) 'email': email.trim(),
          if (tenDangNhap != null && tenDangNhap.trim().isNotEmpty)
            'tenDangNhap': tenDangNhap.trim(),
        },
      );
    } on DioException catch (error) {
      throw ApiException.fromDio(error);
    }
  }

  Future<String> verifyOtp({required String email, required String otp}) async {
    try {
      final response = await _dio.post<Map<String, dynamic>>(
        '/auth/verify-otp',
        data: {'email': email.trim(), 'otp': otp.trim()},
      );
      final data = _extractData(response);
      final resetToken = data['resetToken']?.toString();
      if (resetToken == null || resetToken.isEmpty) {
        throw const ApiException(
          'Máy chủ không trả về phiên đặt lại mật khẩu.',
        );
      }
      return resetToken;
    } on DioException catch (error) {
      throw ApiException.fromDio(error);
    }
  }

  Future<void> resetPasswordWithToken({
    required String resetToken,
    required String matKhauMoi,
  }) async {
    try {
      await _dio.post<Map<String, dynamic>>(
        '/auth/reset-password-with-token',
        data: {'resetToken': resetToken, 'matKhauMoi': matKhauMoi},
      );
    } on DioException catch (error) {
      throw ApiException.fromDio(error);
    }
  }

  Future<void> logout() async {
    ElderlyService.instance.clearCache();
    AlertService.instance.clearCache();
    AppointmentService.instance.clearCache();
    CaregiverService.instance.clearCache();
    CaregiverDashboardService.instance.clearCache();
    HealthMetricService.instance.clearCache();
    MedicationScheduleService.instance.clearCache();
    await LocalNotificationService.cancelMedicationReminders();
    await ApiClient.clearSession();
  }

  Future<String?> getToken() {
    return ApiClient.storage.read(key: ApiClient.tokenKey);
  }

  Future<Map<String, dynamic>> getMe() async {
    final user = await _get('/auth/me');
    ElderlyService.instance.beginSession(user['userId']);
    AlertService.instance.beginSession();
    AppointmentService.instance.beginSession();
    CaregiverService.instance.beginSession();
    CaregiverDashboardService.instance.beginSession();
    HealthMetricService.instance.beginSession();
    MedicationScheduleService.instance.beginSession();
    if (user['tenVaiTro'] == 'NguoiCaoTuoi') {
      await ElderlyService.instance.getMyProfile(refresh: true);
    }
    return user;
  }

  Future<Map<String, dynamic>> updateMe({
    required String hoTen,
    String? email,
    String? soDienThoai,
  }) async {
    try {
      final response = await _dio.put<Map<String, dynamic>>(
        '/auth/me',
        data: {'hoTen': hoTen, 'email': email, 'soDienThoai': soDienThoai},
      );
      final user = _extractData(response);
      await ApiClient.storage.write(
        key: ApiClient.userKey,
        value: jsonEncode(user),
      );
      return user;
    } on DioException catch (error) {
      throw ApiException.fromDio(error);
    }
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
