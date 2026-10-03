import 'package:dio/dio.dart';

import 'api_client.dart';

class HealthMetricService {
  HealthMetricService._();

  static final HealthMetricService instance = HealthMetricService._();

  List<Map<String, dynamic>>? _cachedTypes;
  List<Map<String, dynamic>>? _cachedMetrics;
  Future<List<Map<String, dynamic>>>? _typesInFlight;
  Future<List<Map<String, dynamic>>>? _metricsInFlight;
  int _generation = 0;
  int _cacheSessionVersion = -1;
  int _typesInFlightVersion = -1;
  int _metricsInFlightVersion = -1;
  int _typesInFlightGeneration = -1;
  int _metricsInFlightGeneration = -1;

  void beginSession() => clearCache();

  Future<List<Map<String, dynamic>>> getMetricTypes({bool refresh = false}) {
    final version = ApiClient.sessionVersion;
    final generation = _generation;
    if (!refresh && _cachedTypes != null && _cacheSessionVersion == version) {
      return Future.value(_copyList(_cachedTypes!));
    }
    if (_typesInFlight != null &&
        _typesInFlightVersion == version &&
        _typesInFlightGeneration == generation) {
      return _typesInFlight!;
    }

    late final Future<List<Map<String, dynamic>>> request;
    request = _getList('/health-metric-types')
        .then((items) {
          if (_generation == generation &&
              ApiClient.sessionVersion == version) {
            _cachedTypes = _copyList(items);
            _cacheSessionVersion = version;
          }
          return items;
        })
        .whenComplete(() {
          if (identical(_typesInFlight, request)) {
            _typesInFlight = null;
            _typesInFlightVersion = -1;
            _typesInFlightGeneration = -1;
          }
        });
    _typesInFlight = request;
    _typesInFlightVersion = version;
    _typesInFlightGeneration = generation;
    return request;
  }

  Future<List<Map<String, dynamic>>> getMyHealthMetrics({
    int? loaiChiSoId,
    DateTime? tuNgay,
    DateTime? denNgay,
    bool refresh = false,
  }) {
    final cacheable = loaiChiSoId == null && tuNgay == null && denNgay == null;
    final version = ApiClient.sessionVersion;
    final generation = _generation;
    if (cacheable &&
        !refresh &&
        _cachedMetrics != null &&
        _cacheSessionVersion == version) {
      return Future.value(_copyList(_cachedMetrics!));
    }
    if (cacheable &&
        _metricsInFlight != null &&
        _metricsInFlightVersion == version &&
        _metricsInFlightGeneration == generation) {
      return _metricsInFlight!;
    }

    final query = <String, dynamic>{};
    if (loaiChiSoId != null) query['loaiChiSoId'] = loaiChiSoId;
    if (tuNgay != null) query['tuNgay'] = _date(tuNgay);
    if (denNgay != null) query['denNgay'] = _date(denNgay);
    final future = _getList(
      '/elderly/me/health-metrics',
      queryParameters: query,
    );
    if (!cacheable) return future;

    late final Future<List<Map<String, dynamic>>> request;
    request = future
        .then((items) {
          if (_generation == generation &&
              ApiClient.sessionVersion == version) {
            _cachedMetrics = _copyList(items);
            _cacheSessionVersion = version;
          }
          return items;
        })
        .whenComplete(() {
          if (identical(_metricsInFlight, request)) {
            _metricsInFlight = null;
            _metricsInFlightVersion = -1;
            _metricsInFlightGeneration = -1;
          }
        });
    _metricsInFlight = request;
    _metricsInFlightVersion = version;
    _metricsInFlightGeneration = generation;
    return request;
  }

  Future<Map<String, dynamic>> addHealthMetric({
    required int loaiChiSoId,
    required double giaTri,
    double? giaTriPhu,
    String? ghiChu,
  }) async {
    final version = ApiClient.sessionVersion;
    final generation = _generation;
    try {
      final body = <String, dynamic>{
        'loaiChiSoId': loaiChiSoId,
        'giaTri': giaTri,
      };
      if (giaTriPhu != null) body['giaTriPhu'] = giaTriPhu;
      if (ghiChu != null && ghiChu.trim().isNotEmpty) {
        body['ghiChu'] = ghiChu.trim();
      }
      final response = await ApiClient.instance.dio.post<Map<String, dynamic>>(
        '/elderly/me/health-metrics',
        data: body,
      );
      final data = _extractMap(response);
      if (_generation == generation && ApiClient.sessionVersion == version) {
        _invalidateMetrics();
      }
      return data;
    } on DioException catch (error) {
      throw ApiException.fromDio(error);
    }
  }

  void clearCache() {
    _generation++;
    _cachedTypes = null;
    _cachedMetrics = null;
    _typesInFlight = null;
    _metricsInFlight = null;
    _cacheSessionVersion = -1;
    _typesInFlightVersion = -1;
    _metricsInFlightVersion = -1;
    _typesInFlightGeneration = -1;
    _metricsInFlightGeneration = -1;
  }

  void _invalidateMetrics() {
    _generation++;
    _cachedMetrics = null;
    _metricsInFlight = null;
    _metricsInFlightVersion = -1;
    _metricsInFlightGeneration = -1;
  }

  Future<List<Map<String, dynamic>>> _getList(
    String path, {
    Map<String, dynamic>? queryParameters,
  }) async {
    try {
      final response = await ApiClient.instance.dio.get<Map<String, dynamic>>(
        path,
        queryParameters: queryParameters,
      );
      final data = response.data?['data'];
      if (data is! List) {
        throw ApiException(
          response.data?['message']?.toString() ??
              'Dữ liệu chỉ số sức khỏe không hợp lệ.',
          statusCode: response.statusCode,
        );
      }
      return data
          .whereType<Map>()
          .map((item) => Map<String, dynamic>.from(item))
          .toList();
    } on DioException catch (error) {
      throw ApiException.fromDio(error);
    }
  }

  Map<String, dynamic> _extractMap(Response<Map<String, dynamic>> response) {
    final data = response.data?['data'];
    if (data is Map) return Map<String, dynamic>.from(data);
    throw ApiException(
      response.data?['message']?.toString() ??
          'Phản hồi ghi chỉ số không hợp lệ.',
      statusCode: response.statusCode,
    );
  }

  static List<Map<String, dynamic>> _copyList(
    List<Map<String, dynamic>> items,
  ) => items.map((item) => Map<String, dynamic>.from(item)).toList();

  static String _date(DateTime value) =>
      '${value.year.toString().padLeft(4, '0')}-'
      '${value.month.toString().padLeft(2, '0')}-'
      '${value.day.toString().padLeft(2, '0')}';
}
