import 'package:dio/dio.dart';

import 'api_client.dart';

class ElderlyService {
  ElderlyService._();

  static final ElderlyService instance = ElderlyService._();

  Map<String, dynamic>? _cachedProfile;
  Future<Map<String, dynamic>>? _inFlight;
  String? _ownerUserId;
  int _generation = 0;
  int _cacheSessionVersion = -1;
  int _inFlightSessionVersion = -1;
  int _inFlightGeneration = -1;

  Map<String, dynamic>? get cachedProfile {
    if (_cachedProfile == null ||
        _cacheSessionVersion != ApiClient.sessionVersion) {
      return null;
    }
    return Map<String, dynamic>.from(_cachedProfile!);
  }

  int? get myElderlyId {
    final profile = cachedProfile;
    return profile?['id'] is int
        ? profile!['id'] as int
        : int.tryParse(profile?['id']?.toString() ?? '');
  }

  void beginSession(Object? userId) {
    clearCache();
    _ownerUserId = userId?.toString();
  }

  Future<Map<String, dynamic>> getMyProfile({bool refresh = false}) {
    final sessionVersion = ApiClient.sessionVersion;
    final generation = _generation;

    if (!refresh &&
        _cachedProfile != null &&
        _cacheSessionVersion == sessionVersion) {
      return Future.value(Map<String, dynamic>.from(_cachedProfile!));
    }
    if (_inFlight != null &&
        _inFlightSessionVersion == sessionVersion &&
        _inFlightGeneration == generation) {
      return _inFlight!;
    }

    late final Future<Map<String, dynamic>> request;
    request =
        _getProfile(
          generation: generation,
          sessionVersion: sessionVersion,
          ownerUserId: _ownerUserId,
        ).whenComplete(() {
          if (identical(_inFlight, request)) {
            _inFlight = null;
            _inFlightSessionVersion = -1;
            _inFlightGeneration = -1;
          }
        });
    _inFlight = request;
    _inFlightSessionVersion = sessionVersion;
    _inFlightGeneration = generation;
    return request;
  }

  Future<Map<String, dynamic>> _getProfile({
    required int generation,
    required int sessionVersion,
    required String? ownerUserId,
  }) async {
    try {
      final response = await ApiClient.instance.dio.get<Map<String, dynamic>>(
        '/elderly/me',
      );
      return _remember(
        response,
        generation: generation,
        sessionVersion: sessionVersion,
        ownerUserId: ownerUserId,
      );
    } on DioException catch (error) {
      throw ApiException.fromDio(error);
    }
  }

  Future<Map<String, dynamic>> updateMyProfile(
    Map<String, dynamic> data,
  ) async {
    final generation = _generation;
    final sessionVersion = ApiClient.sessionVersion;
    final ownerUserId = _ownerUserId;
    try {
      final response = await ApiClient.instance.dio.put<Map<String, dynamic>>(
        '/elderly/me',
        data: data,
      );
      return _remember(
        response,
        generation: generation,
        sessionVersion: sessionVersion,
        ownerUserId: ownerUserId,
      );
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

  Map<String, dynamic> _remember(
    Response<Map<String, dynamic>> response, {
    required int generation,
    required int sessionVersion,
    required String? ownerUserId,
  }) {
    final data = response.data?['data'];
    if (data is! Map) {
      throw ApiException(
        response.data?['message']?.toString() ?? 'Dữ liệu hồ sơ không hợp lệ.',
        statusCode: response.statusCode,
      );
    }
    final profile = Map<String, dynamic>.from(data);
    if (_generation == generation &&
        ApiClient.sessionVersion == sessionVersion &&
        _ownerUserId == ownerUserId) {
      _cachedProfile = profile;
      _cacheSessionVersion = sessionVersion;
    }
    return Map<String, dynamic>.from(profile);
  }

  void clearCache() {
    _generation++;
    _cachedProfile = null;
    _inFlight = null;
    _ownerUserId = null;
    _cacheSessionVersion = -1;
    _inFlightSessionVersion = -1;
    _inFlightGeneration = -1;
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
