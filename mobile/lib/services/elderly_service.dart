import 'package:dio/dio.dart';

import 'api_client.dart';

class ElderlyService {
  ElderlyService._();

  static final ElderlyService instance = ElderlyService._();

  Map<String, dynamic>? _cachedProfile;
  Future<Map<String, dynamic>>? _inFlight;

  Map<String, dynamic>? get cachedProfile => _cachedProfile == null
      ? null
      : Map<String, dynamic>.from(_cachedProfile!);

  int? get myElderlyId => _cachedProfile?['id'] is int
      ? _cachedProfile!['id'] as int
      : int.tryParse(_cachedProfile?['id']?.toString() ?? '');

  Future<Map<String, dynamic>> getMyProfile({bool refresh = false}) {
    if (!refresh && _cachedProfile != null) {
      return Future.value(Map<String, dynamic>.from(_cachedProfile!));
    }
    return _inFlight ??= _getProfile().whenComplete(() => _inFlight = null);
  }

  Future<Map<String, dynamic>> _getProfile() async {
    try {
      final response = await ApiClient.instance.dio.get<Map<String, dynamic>>(
        '/elderly/me',
      );
      return _remember(response);
    } on DioException catch (error) {
      throw ApiException.fromDio(error);
    }
  }

  Future<Map<String, dynamic>> updateMyProfile(
    Map<String, dynamic> data,
  ) async {
    try {
      final response = await ApiClient.instance.dio.put<Map<String, dynamic>>(
        '/elderly/me',
        data: data,
      );
      return _remember(response);
    } on DioException catch (error) {
      throw ApiException.fromDio(error);
    }
  }

  Future<void> changePassword(String matKhauCu, String matKhauMoi) async {
    try {
      await ApiClient.instance.dio.put<Map<String, dynamic>>(
        '/users/me/password',
        data: {'matKhauCu': matKhauCu, 'matKhauMoi': matKhauMoi},
      );
    } on DioException catch (error) {
      throw ApiException.fromDio(error);
    }
  }

  Map<String, dynamic> _remember(Response<Map<String, dynamic>> response) {
    final data = response.data?['data'];
    if (data is! Map) {
      throw ApiException(
        response.data?['message']?.toString() ?? 'Dữ liệu hồ sơ không hợp lệ.',
        statusCode: response.statusCode,
      );
    }
    _cachedProfile = Map<String, dynamic>.from(data);
    return Map<String, dynamic>.from(_cachedProfile!);
  }

  void clearCache() {
    _cachedProfile = null;
    _inFlight = null;
  }

  static String text(Map<String, dynamic> profile, String key) {
    final value = profile[key]?.toString().trim();
    return value == null || value.isEmpty ? 'Chưa cập nhật' : value;
  }

  static DateTime? birthDate(Map<String, dynamic> profile) {
    final raw = profile['ngaySinh']?.toString();
    return raw == null ? null : DateTime.tryParse(raw);
  }

  static String displayBirthDate(Map<String, dynamic> profile) {
    final date = birthDate(profile);
    if (date == null) return 'Chưa cập nhật';
    return '${date.day.toString().padLeft(2, '0')}/'
        '${date.month.toString().padLeft(2, '0')}/${date.year}';
  }

  static String displayAge(Map<String, dynamic> profile) {
    final birth = birthDate(profile);
    if (birth == null) return 'Chưa rõ tuổi';
    final now = DateTime.now();
    var age = now.year - birth.year;
    if (now.month < birth.month ||
        (now.month == birth.month && now.day < birth.day)) {
      age--;
    }
    return '$age tuổi';
  }
}
