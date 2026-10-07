import 'package:dio/dio.dart';

import 'api_client.dart';

class AlertService {
  AlertService._();

  static final AlertService instance = AlertService._();

  final Map<String, List<Map<String, dynamic>>> _cache = {};
  final Map<String, Future<List<Map<String, dynamic>>>> _inFlight = {};
  int _generation = 0;
  int _cacheSessionVersion = -1;

  void beginSession() => clearCache();

  Future<List<Map<String, dynamic>>> getMyAlerts({
    String? loai,
    String? mucDo,
    DateTime? tuNgay,
    DateTime? denNgay,
    bool refresh = false,
  }) {
    final query = _alertQuery(
      loai: loai,
      mucDo: mucDo,
      tuNgay: tuNgay,
      denNgay: denNgay,
    );
    return _getList(
      'my-alerts:${_queryKey(query)}',
      '/elderly/me/alerts',
      queryParameters: query,
      refresh: refresh,
    );
  }

  Future<List<Map<String, dynamic>>> getNotifications({bool refresh = false}) =>
      _getList('notifications', '/notifications/me', refresh: refresh);

  Future<void> markNotificationRead(int id) async {
    try {
      await ApiClient.instance.dio.patch<Map<String, dynamic>>(
        '/notifications/$id/read',
      );
      _generation++;
      _cache.remove('notifications');
      _inFlight.remove('notifications');
    } on DioException catch (error) {
      throw ApiException.fromDio(error);
    }
  }

  void invalidateAlerts() {
    _generation++;
    _cache.removeWhere((key, _) => key.startsWith('my-alerts:'));
    _inFlight.removeWhere((key, _) => key.startsWith('my-alerts:'));
  }

  Future<List<Map<String, dynamic>>> _getList(
    String key,
    String path, {
    Map<String, dynamic>? queryParameters,
    bool refresh = false,
  }) {
    final version = ApiClient.sessionVersion;
    final generation = _generation;
    if (!refresh && _cacheSessionVersion == version && _cache[key] != null) {
      return Future.value(_copyList(_cache[key]!));
    }
    final pending = _inFlight[key];
    if (!refresh && pending != null) return pending;

    late final Future<List<Map<String, dynamic>>> request;
    request = _fetch(path, queryParameters)
        .then((items) {
          if (_generation == generation &&
              ApiClient.sessionVersion == version) {
            if (_cacheSessionVersion != version) _cache.clear();
            _cacheSessionVersion = version;
            _cache[key] = _copyList(items);
          }
          return _copyList(items);
        })
        .whenComplete(() {
          if (identical(_inFlight[key], request)) _inFlight.remove(key);
        });
    _inFlight[key] = request;
    return request;
  }

  Future<List<Map<String, dynamic>>> _fetch(
    String path,
    Map<String, dynamic>? queryParameters,
  ) async {
    try {
      final response = await ApiClient.instance.dio.get<Map<String, dynamic>>(
        path,
        queryParameters: queryParameters,
      );
      final data = response.data?['data'];
      if (data is! List) {
        throw ApiException(
          response.data?['message']?.toString() ??
              'Dữ liệu từ máy chủ không đúng định dạng.',
          statusCode: response.statusCode,
        );
      }
      return data
          .whereType<Map>()
          .map((item) => Map<String, dynamic>.from(item))
          .toList(growable: false);
    } on DioException catch (error) {
      throw ApiException.fromDio(error);
    }
  }

  void clearCache() {
    _generation++;
    _cache.clear();
    _inFlight.clear();
    _cacheSessionVersion = -1;
  }

  static Map<String, dynamic> _alertQuery({
    String? loai,
    String? mucDo,
    DateTime? tuNgay,
    DateTime? denNgay,
  }) => <String, dynamic>{
    if (loai?.trim().isNotEmpty == true) 'loai': loai!.trim(),
    if (mucDo?.trim().isNotEmpty == true) 'mucDo': mucDo!.trim(),
    if (tuNgay != null) 'tuNgay': _date(tuNgay),
    if (denNgay != null) 'denNgay': _date(denNgay),
  };

  static String _queryKey(Map<String, dynamic> query) {
    final keys = query.keys.toList()..sort();
    return keys.map((key) => '$key=${query[key]}').join('&');
  }

  static List<Map<String, dynamic>> _copyList(
    List<Map<String, dynamic>> items,
  ) => items.map((item) => Map<String, dynamic>.from(item)).toList();

  static String _date(DateTime value) =>
      '${value.year.toString().padLeft(4, '0')}-'
      '${value.month.toString().padLeft(2, '0')}-'
      '${value.day.toString().padLeft(2, '0')}';
}
