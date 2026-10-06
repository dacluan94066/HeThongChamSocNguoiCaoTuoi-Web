import 'package:dio/dio.dart';

import 'api_client.dart';

class CaregiverDashboardService {
  CaregiverDashboardService._();

  static final CaregiverDashboardService instance =
      CaregiverDashboardService._();

  final Map<String, Object> _cache = {};
  final Map<String, Future<Object>> _inFlight = {};
  int _generation = 0;
  int _cacheSessionVersion = -1;

  void beginSession() => clearCache();

  Future<List<Map<String, dynamic>>> getMyElderlyList({
    bool refresh = false,
  }) => _getList('elderly', '/caregivers/me/elderly', refresh: refresh);

  Future<Map<String, dynamic>> getElderlyDetail(
    int id, {
    bool refresh = false,
  }) => _getMap('detail:$id', '/elderly/$id', refresh: refresh);

  Future<List<Map<String, dynamic>>> getElderlyMedicationToday(
    int id, {
    bool refresh = false,
  }) {
    final today = _date(DateTime.now());
    return _getList(
      'medication:$id:$today',
      '/elderly/$id/medication-schedule',
      queryParameters: {'tuNgay': today, 'denNgay': today},
      refresh: refresh,
    );
  }

  Future<List<Map<String, dynamic>>> getElderlyHealthMetrics(
    int id, {
    bool refresh = false,
  }) => _getList(
    'metrics:$id',
    '/elderly/$id/health-metrics',
    refresh: refresh,
  );

  Future<List<Map<String, dynamic>>> getElderlyUpcomingAppointments(
    int id, {
    bool refresh = false,
  }) => _getList(
    'appointments:$id',
    '/elderly/$id/appointments/upcoming',
    refresh: refresh,
  );

  Future<List<Map<String, dynamic>>> getEmergencyContacts(
    int id, {
    bool refresh = false,
  }) => _getList(
    'contacts:$id',
    '/emergency-contacts',
    queryParameters: {'nguoiCaoTuoiId': id},
    refresh: refresh,
  );

  Future<List<Map<String, dynamic>>> getNotifications({
    bool refresh = false,
  }) => _getList(
    'notifications',
    '/notifications/me',
    refresh: refresh,
  );

  Future<void> markNotificationRead(int id) async {
    try {
      await ApiClient.instance.dio.patch<Map<String, dynamic>>(
        '/notifications/$id/read',
      );
      _invalidateKey('notifications');
    } on DioException catch (error) {
      throw ApiException.fromDio(error);
    }
  }

  Future<List<Map<String, dynamic>>> _getList(
    String key,
    String path, {
    Map<String, dynamic>? queryParameters,
    bool refresh = false,
  }) async {
    final value = await _get(
      key,
      path,
      queryParameters: queryParameters,
      refresh: refresh,
    );
    if (value is! List) {
      throw const ApiException('Dữ liệu từ máy chủ không đúng định dạng.');
    }
    return value
        .whereType<Map>()
        .map((item) => Map<String, dynamic>.from(item))
        .toList(growable: false);
  }

  Future<Map<String, dynamic>> _getMap(
    String key,
    String path, {
    bool refresh = false,
  }) async {
    final value = await _get(key, path, refresh: refresh);
    if (value is! Map) {
      throw const ApiException('Dữ liệu từ máy chủ không đúng định dạng.');
    }
    return Map<String, dynamic>.from(value);
  }

  Future<Object> _get(
    String key,
    String path, {
    Map<String, dynamic>? queryParameters,
    bool refresh = false,
  }) {
    final version = ApiClient.sessionVersion;
    final generation = _generation;
    if (!refresh && _cacheSessionVersion == version && _cache[key] != null) {
      return Future.value(_copy(_cache[key]!));
    }
    final pending = _inFlight[key];
    if (!refresh && pending != null) return pending.then(_copy);

    late final Future<Object> request;
    request = _fetch(path, queryParameters)
        .then((data) {
          if (_generation == generation &&
              ApiClient.sessionVersion == version) {
            if (_cacheSessionVersion != version) _cache.clear();
            _cacheSessionVersion = version;
            _cache[key] = _copy(data);
          }
          return _copy(data);
        })
        .whenComplete(() {
          if (identical(_inFlight[key], request)) _inFlight.remove(key);
        });
    _inFlight[key] = request;
    return request;
  }

  Future<Object> _fetch(
    String path,
    Map<String, dynamic>? queryParameters,
  ) async {
    try {
      final response = await ApiClient.instance.dio.get<Map<String, dynamic>>(
        path,
        queryParameters: queryParameters,
      );
      final data = response.data?['data'];
      if (data is List || data is Map) return data as Object;
      throw ApiException(
        response.data?['message']?.toString() ??
            'Phản hồi từ máy chủ không hợp lệ.',
        statusCode: response.statusCode,
      );
    } on DioException catch (error) {
      throw ApiException.fromDio(error);
    }
  }

  void _invalidateKey(String key) {
    _cache.remove(key);
    _inFlight.remove(key);
  }

  void clearCache() {
    _generation++;
    _cache.clear();
    _inFlight.clear();
    _cacheSessionVersion = -1;
  }

  static Object _copy(Object value) {
    if (value is List) {
      return value
          .whereType<Map>()
          .map((item) => Map<String, dynamic>.from(item))
          .toList();
    }
    if (value is Map) return Map<String, dynamic>.from(value);
    return value;
  }

  static String _date(DateTime value) =>
      '${value.year.toString().padLeft(4, '0')}-'
      '${value.month.toString().padLeft(2, '0')}-'
      '${value.day.toString().padLeft(2, '0')}';
}
