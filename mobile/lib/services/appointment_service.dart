import 'package:dio/dio.dart';

import 'api_client.dart';

class AppointmentService {
  AppointmentService._();

  static final AppointmentService instance = AppointmentService._();

  final Map<String, List<Map<String, dynamic>>> _cache = {};
  final Map<String, Future<List<Map<String, dynamic>>>> _inFlight = {};
  int _generation = 0;
  int _cacheSessionVersion = -1;

  void beginSession() => clearCache();

  Future<List<Map<String, dynamic>>> getAppointments({bool refresh = false}) =>
      _getCached('all', '/elderly/me/appointments', refresh: refresh);

  Future<List<Map<String, dynamic>>> getForElderly(
    int elderlyId, {
    bool refresh = false,
  }) async {
    if (elderlyId < 1) throw const ApiException('Hồ sơ không hợp lệ.');
    final items = await _getCached(
      'elderly:$elderlyId',
      '/appointments',
      queryParameters: {'nguoiCaoTuoiId': elderlyId},
      refresh: refresh,
    );
    return items.map(fromWebAppointment).toList(growable: false);
  }

  static Map<String, dynamic> fromWebAppointment(Map<String, dynamic> item) {
    const statuses = {
      'CHUA_DEN': 'ChuaDen',
      'DA_KHAM': 'DaKham',
      'HUY': 'Huy',
      'DA_DOI_LICH': 'DaDoiLich',
    };
    return {
      ...item,
      'tenBenhVien': item['noiKham'],
      'bacSiPhuTrach': item['bacSiTen'],
      'chuyenKhoa': item['ghiChu'],
      'ketQuaKham': item['ketQua'],
      'trangThai': statuses[item['trangThai']] ?? item['trangThai'],
      'thoiGianKham': '${item['ngayKham']}T${item['gioKham']}:00',
    };
  }

  Future<List<Map<String, dynamic>>> getUpcomingAppointments({
    bool refresh = false,
  }) => _getCached(
    'upcoming',
    '/elderly/me/appointments/upcoming',
    refresh: refresh,
  );

  static List<Map<String, dynamic>> filterByStatus(
    List<Map<String, dynamic>> appointments,
    String? status,
  ) {
    if (status == null) return List.unmodifiable(appointments);
    return appointments
        .where((appointment) => appointment['trangThai'] == status)
        .toList(growable: false);
  }

  Future<List<Map<String, dynamic>>> _getCached(
    String key,
    String path, {
    Map<String, dynamic>? queryParameters,
    bool refresh = false,
  }) {
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
    request = _fetch(path, queryParameters)
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
              'Dữ liệu lịch khám không hợp lệ.',
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

  void clearCache() {
    _generation++;
    _cache.clear();
    _inFlight.clear();
    _cacheSessionVersion = -1;
  }

  static List<Map<String, dynamic>> _copyList(
    List<Map<String, dynamic>> items,
  ) => items.map((item) => Map<String, dynamic>.from(item)).toList();
}
