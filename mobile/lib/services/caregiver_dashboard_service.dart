import 'package:dio/dio.dart';

import 'api_client.dart';

class CaregiverDashboardService {
  CaregiverDashboardService._();

  static final CaregiverDashboardService instance =
      CaregiverDashboardService._();

  final Map<String, Object> _cache = {};
  final Map<String, Future<Object>> _inFlight = {};
  final Map<String, int> _revisions = {};
  int _generation = 0;
  int _cacheSessionVersion = -1;

  void beginSession() => clearCache();

  Future<List<Map<String, dynamic>>> getMyElderlyList({bool refresh = false}) =>
      _getList('elderly', '/caregivers/me/elderly', refresh: refresh);

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
  }) =>
      _getList('metrics:$id', '/elderly/$id/health-metrics', refresh: refresh);

  Future<List<Map<String, dynamic>>> getElderlyUpcomingAppointments(
    int id, {
    bool refresh = false,
  }) => _getList(
    'appointments:$id',
    '/elderly/$id/appointments/upcoming',
    refresh: refresh,
  );

  Future<List<Map<String, dynamic>>> getElderlyAlerts(
    int id, {
    String? loai,
    String? mucDo,
    DateTime? tuNgay,
    DateTime? denNgay,
    bool refresh = false,
  }) {
    final query = <String, dynamic>{
      if (loai?.trim().isNotEmpty == true) 'loai': loai!.trim(),
      if (mucDo?.trim().isNotEmpty == true) 'mucDo': mucDo!.trim(),
      if (tuNgay != null) 'tuNgay': _date(tuNgay),
      if (denNgay != null) 'denNgay': _date(denNgay),
    };
    final queryKey = query.entries
        .map((item) => '${item.key}=${item.value}')
        .join('&');
    return _getList(
      'alerts:$id:$queryKey',
      '/elderly/$id/alerts',
      queryParameters: query,
      refresh: refresh,
    );
  }

  Future<Map<String, dynamic>> markAlertSeen(int id) =>
      _updateAlert('/alerts/$id/seen');

  Future<Map<String, dynamic>> resolveAlert(int id, String note) =>
      _updateAlert('/alerts/$id/resolve', data: {'ghiChu': note.trim()});

  Future<Map<String, dynamic>> _updateAlert(
    String path, {
    Map<String, dynamic>? data,
  }) async {
    try {
      final response = await ApiClient.instance.dio.patch<Map<String, dynamic>>(
        path,
        data: data,
      );
      final result = response.data?['data'];
      if (result is! Map) {
        throw ApiException(
          response.data?['message']?.toString() ??
              'Phản hồi cập nhật cảnh báo không hợp lệ.',
          statusCode: response.statusCode,
        );
      }
      _generation++;
      _cache.removeWhere((key, _) => key.startsWith('alerts:'));
      _inFlight.removeWhere((key, _) => key.startsWith('alerts:'));
      return Map<String, dynamic>.from(result);
    } on DioException catch (error) {
      throw ApiException.fromDio(error);
    }
  }

  Future<List<Map<String, dynamic>>> getEmergencyContacts(
    int id, {
    bool refresh = false,
  }) => _getList(
    'contacts:$id',
    '/emergency-contacts',
    queryParameters: {'nguoiCaoTuoiId': id},
    refresh: refresh,
  );

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
    if (_cacheSessionVersion != version) {
      clearCache();
      _cacheSessionVersion = version;
    }
    final generation = _generation;
    if (!refresh && _cacheSessionVersion == version && _cache[key] != null) {
      return Future.value(_copy(_cache[key]!));
    }
    final pending = _inFlight[key];
    if (!refresh && pending != null) return pending.then(_copy);

    final revision = (_revisions[key] ?? 0) + 1;
    _revisions[key] = revision;

    late final Future<Object> request;
    request = _fetch(path, queryParameters)
        .then((data) {
          if (_generation == generation &&
              ApiClient.sessionVersion == version &&
              _revisions[key] == revision) {
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

  void clearCache() {
    _generation++;
    _cache.clear();
    _inFlight.clear();
    _revisions.clear();
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
