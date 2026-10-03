import 'package:dio/dio.dart';

import 'api_client.dart';

class MedicationScheduleService {
  MedicationScheduleService._();

  static final MedicationScheduleService instance =
      MedicationScheduleService._();

  final Map<String, List<Map<String, dynamic>>> _cache = {};
  final Map<String, Future<List<Map<String, dynamic>>>> _inFlight = {};
  int _generation = 0;
  int _cacheSessionVersion = -1;

  void beginSession() => clearCache();

  Future<List<Map<String, dynamic>>> getTodaySchedule({bool refresh = false}) {
    final now = DateTime.now();
    return getScheduleByDateRange(now, now, refresh: refresh);
  }

  Future<List<Map<String, dynamic>>> getScheduleByDateRange(
    DateTime tuNgay,
    DateTime denNgay, {
    bool refresh = false,
  }) {
    final from = DateTime(tuNgay.year, tuNgay.month, tuNgay.day);
    final to = DateTime(denNgay.year, denNgay.month, denNgay.day);
    if (from.isAfter(to)) {
      throw const ApiException('Ngày bắt đầu không được sau ngày kết thúc.');
    }

    final key = '${_date(from)}|${_date(to)}';
    final version = ApiClient.sessionVersion;
    final generation = _generation;
    if (!refresh &&
        _cacheSessionVersion == version &&
        _cache.containsKey(key)) {
      return Future.value(_copyList(_cache[key]!));
    }
    final existing = _inFlight[key];
    if (!refresh && existing != null) return existing;

    late final Future<List<Map<String, dynamic>>> request;
    request = _fetch(from, to)
        .then((items) {
          if (_generation == generation &&
              ApiClient.sessionVersion == version) {
            if (_cacheSessionVersion != version) _cache.clear();
            _cacheSessionVersion = version;
            _cache[key] = _copyList(items);
          }
          return items;
        })
        .whenComplete(() {
          if (identical(_inFlight[key], request)) _inFlight.remove(key);
        });
    _inFlight[key] = request;
    return request;
  }

  Future<Map<String, dynamic>> confirmMedication(
    int id,
    String trangThai,
  ) async {
    if (!const {'DaUong', 'BoLo'}.contains(trangThai)) {
      throw const ApiException('Trạng thái uống thuốc không hợp lệ.');
    }
    try {
      final response = await ApiClient.instance.dio.patch<Map<String, dynamic>>(
        '/medication-schedule/$id/confirm',
        data: {'trangThai': trangThai},
      );
      final data = response.data?['data'];
      if (data is! Map) {
        throw ApiException(
          response.data?['message']?.toString() ??
              'Phản hồi cập nhật lịch uống thuốc không hợp lệ.',
          statusCode: response.statusCode,
        );
      }
      _invalidate();
      return Map<String, dynamic>.from(data);
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

  void _invalidate() {
    _generation++;
    _cache.clear();
    _inFlight.clear();
    _cacheSessionVersion = -1;
  }

  Future<List<Map<String, dynamic>>> _fetch(
    DateTime tuNgay,
    DateTime denNgay,
  ) async {
    try {
      final response = await ApiClient.instance.dio.get<Map<String, dynamic>>(
        '/elderly/me/medication-schedule',
        queryParameters: {'tuNgay': _date(tuNgay), 'denNgay': _date(denNgay)},
      );
      final data = response.data?['data'];
      if (data is! List) {
        throw ApiException(
          response.data?['message']?.toString() ??
              'Dữ liệu lịch uống thuốc không hợp lệ.',
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

  static List<Map<String, dynamic>> _copyList(
    List<Map<String, dynamic>> items,
  ) => items.map((item) => Map<String, dynamic>.from(item)).toList();

  static String _date(DateTime value) =>
      '${value.year.toString().padLeft(4, '0')}-'
      '${value.month.toString().padLeft(2, '0')}-'
      '${value.day.toString().padLeft(2, '0')}';
}
