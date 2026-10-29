import 'package:dio/dio.dart';

import 'api_client.dart';

/// Dịch vụ kết nối API dành riêng cho Người thân (NguoiThan) trên Mobile.
class RelativeService {
  RelativeService._();

  static final RelativeService instance = RelativeService._();

  final Map<String, Object> _cache = {};
  final Map<String, Future<Object>> _inFlight = {};
  final Map<String, int> _revisions = {};
  int _generation = 0;
  int _cacheSessionVersion = -1;

  void beginSession() => clearCache();

  void clearCache() {
    _generation++;
    _cache.clear();
    _inFlight.clear();
    _revisions.clear();
    _cacheSessionVersion = -1;
  }

  /// Lấy danh sách Người cao tuổi mà Người thân này được cấp quyền theo dõi
  Future<List<Map<String, dynamic>>> getMyElderlyList({bool refresh = false}) =>
      _getList('relatives:elderly', '/relatives/me/elderly', refresh: refresh);

  /// Lấy chi tiết hồ sơ Người cao tuổi (theo quyền và phạm vi chia sẻ được cấp)
  Future<Map<String, dynamic>> getElderlyDetail(
    int elderlyId, {
    bool refresh = false,
  }) => _getMap(
    'relatives:elderly:$elderlyId',
    '/relatives/me/elderly/$elderlyId',
    refresh: refresh,
  );

  /// Lấy danh sách chỉ số sức khỏe của người cao tuổi
  Future<List<Map<String, dynamic>>> getElderlyHealthMetrics(
    int elderlyId, {
    int? loaiChiSoId,
    DateTime? tuNgay,
    DateTime? denNgay,
    bool refresh = false,
  }) {
    final query = <String, dynamic>{
      if (loaiChiSoId != null) 'loaiChiSoId': loaiChiSoId,
      if (tuNgay != null) 'tuNgay': _date(tuNgay),
      if (denNgay != null) 'denNgay': _date(denNgay),
    };
    final queryKey = query.entries
        .map((entry) => '${entry.key}=${entry.value}')
        .join('&');
    return _getList(
      'relatives:metrics:$elderlyId:$queryKey',
      '/relatives/me/elderly/$elderlyId/health-metrics',
      queryParameters: query.isEmpty ? null : query,
      refresh: refresh,
    );
  }

  /// Thêm chỉ số sức khỏe mới cho người cao tuổi
  Future<Map<String, dynamic>> createElderlyHealthMetric(
    int elderlyId,
    Map<String, dynamic> payload,
  ) async {
    try {
      final response = await ApiClient.instance.dio.post<Map<String, dynamic>>(
        '/relatives/me/elderly/$elderlyId/health-metrics',
        data: payload,
      );
      final envelope = response.data;
      final data = envelope?['data'];

      // Xóa cache metrics để lần sau tải lại sẽ có chỉ số mới
      _generation++;
      _cache.removeWhere((key, _) => key.startsWith('relatives:metrics:$elderlyId'));
      _inFlight.removeWhere((key, _) => key.startsWith('relatives:metrics:$elderlyId'));

      if (data is Map) return Map<String, dynamic>.from(data);
      return <String, dynamic>{'message': envelope?['message'] ?? 'Thành công'};
    } on DioException catch (error) {
      throw ApiException.fromDio(error);
    }
  }

  /// Lấy lịch uống thuốc của người cao tuổi
  Future<List<Map<String, dynamic>>> getElderlyMedications(
    int elderlyId, {
    DateTime? tuNgay,
    DateTime? denNgay,
    bool refresh = false,
  }) {
    final query = <String, dynamic>{
      if (tuNgay != null) 'tuNgay': _date(tuNgay),
      if (denNgay != null) 'denNgay': _date(denNgay),
    };
    final queryKey = query.entries
        .map((entry) => '${entry.key}=${entry.value}')
        .join('&');
    return _getList(
      'relatives:medications:$elderlyId:$queryKey',
      '/relatives/me/elderly/$elderlyId/medication-schedules',
      queryParameters: query.isEmpty ? null : query,
      refresh: refresh,
    );
  }

  /// Lấy lịch khám của người cao tuổi
  Future<List<Map<String, dynamic>>> getElderlyAppointments(
    int elderlyId, {
    bool refresh = false,
  }) => _getList(
    'relatives:appointments:$elderlyId',
    '/relatives/me/elderly/$elderlyId/appointments',
    refresh: refresh,
  );

  /// Lấy danh sách cảnh báo của người cao tuổi
  Future<List<Map<String, dynamic>>> getElderlyAlerts(
    int elderlyId, {
    bool refresh = false,
  }) => _getList(
    'relatives:alerts:$elderlyId',
    '/relatives/me/elderly/$elderlyId/alerts',
    refresh: refresh,
  );

  /// Lấy danh sách tín hiệu SOS của người cao tuổi
  Future<List<Map<String, dynamic>>> getElderlySos(
    int elderlyId, {
    bool refresh = false,
  }) => _getList(
    'relatives:sos:$elderlyId',
    '/relatives/me/elderly/$elderlyId/sos',
    refresh: refresh,
  );

  /// Lấy nhật ký chăm sóc của người cao tuổi
  Future<List<Map<String, dynamic>>> getElderlyCareNotes(
    int elderlyId, {
    bool refresh = false,
  }) => _getList(
    'relatives:careNotes:$elderlyId',
    '/relatives/me/elderly/$elderlyId/care-notes',
    refresh: refresh,
  );

  /// Lấy danh mục các loại chỉ số sức khỏe từ hệ thống
  Future<List<Map<String, dynamic>>> getMetricTypes({bool refresh = false}) =>
      _getList('relatives:metric-types', '/health-metric-types', refresh: refresh);

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

