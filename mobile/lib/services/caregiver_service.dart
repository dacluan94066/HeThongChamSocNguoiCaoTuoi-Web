import 'package:dio/dio.dart';

import 'api_client.dart';

class CaregiverService {
  CaregiverService._();

  static final CaregiverService instance = CaregiverService._();

  List<Map<String, dynamic>>? _cachedCaregivers;
  Future<List<Map<String, dynamic>>>? _inFlight;
  int _generation = 0;
  int _cacheSessionVersion = -1;
  int _inFlightGeneration = -1;
  int _inFlightSessionVersion = -1;

  void beginSession() => clearCache();

  Future<List<Map<String, dynamic>>> getMyCaregivers({bool refresh = false}) {
    final sessionVersion = ApiClient.sessionVersion;
    final generation = _generation;
    if (!refresh &&
        _cachedCaregivers != null &&
        _cacheSessionVersion == sessionVersion) {
      return Future.value(_copyList(_cachedCaregivers!));
    }
    if (!refresh &&
        _inFlight != null &&
        _inFlightGeneration == generation &&
        _inFlightSessionVersion == sessionVersion) {
      return _inFlight!;
    }

    late final Future<List<Map<String, dynamic>>> request;
    request = _fetchCaregivers()
        .then((items) {
          if (_generation == generation &&
              ApiClient.sessionVersion == sessionVersion) {
            _cachedCaregivers = _copyList(items);
            _cacheSessionVersion = sessionVersion;
          }
          return items;
        })
        .whenComplete(() {
          if (identical(_inFlight, request)) {
            _inFlight = null;
            _inFlightGeneration = -1;
            _inFlightSessionVersion = -1;
          }
        });
    _inFlight = request;
    _inFlightGeneration = generation;
    _inFlightSessionVersion = sessionVersion;
    return request;
  }

  Future<Map<String, dynamic>> sendEmergencyAlert({
    required String noiDung,
    double? viDo,
    double? kinhDo,
  }) async {
    if ((viDo == null) != (kinhDo == null)) {
      throw const ApiException('Vĩ độ và kinh độ phải được gửi cùng nhau.');
    }

    final body = <String, dynamic>{'noiDung': noiDung.trim()};
    if (viDo != null && kinhDo != null) {
      body['viDo'] = viDo;
      body['kinhDo'] = kinhDo;
    }

    try {
      final response = await ApiClient.instance.dio.post<Map<String, dynamic>>(
        '/emergency-alerts',
        data: body,
      );
      final data = response.data?['data'];
      if (data is! Map) {
        throw ApiException(
          response.data?['message']?.toString() ??
              'Phản hồi gửi cảnh báo SOS không hợp lệ.',
          statusCode: response.statusCode,
        );
      }
      return Map<String, dynamic>.from(data);
    } on DioException catch (error) {
      throw ApiException.fromDio(error);
    }
  }

  Future<List<Map<String, dynamic>>> _fetchCaregivers() async {
    try {
      final response = await ApiClient.instance.dio.get<Map<String, dynamic>>(
        '/elderly/me/caregivers',
      );
      final data = response.data?['data'];
      if (data is! List) {
        throw ApiException(
          response.data?['message']?.toString() ??
              'Dữ liệu người chăm sóc không hợp lệ.',
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
    _cachedCaregivers = null;
    _inFlight = null;
    _cacheSessionVersion = -1;
    _inFlightGeneration = -1;
    _inFlightSessionVersion = -1;
  }

  static List<Map<String, dynamic>> _copyList(
    List<Map<String, dynamic>> items,
  ) => items.map((item) => Map<String, dynamic>.from(item)).toList();
}
