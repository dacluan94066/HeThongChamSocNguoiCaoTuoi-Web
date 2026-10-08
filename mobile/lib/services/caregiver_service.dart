import 'package:dio/dio.dart';

import 'api_client.dart';

String sosDeliveryMessage(Map<String, dynamic> response) {
  final count = int.tryParse(
    response['soNguoiChamSocDaThongBao']?.toString() ?? '',
  );
  if (count == null || count < 0) {
    return 'Đã lưu SOS tại hệ thống. Chưa xác định số người nhận thông báo.';
  }
  if (count == 0) {
    return 'Đã lưu SOS nhưng chưa có tài khoản người chăm sóc nhận thông báo. '
        'Hãy gọi người thân để được hỗ trợ.';
  }
  return 'Đã lưu SOS và tạo thông báo cho $count người chăm sóc. '
      'Chưa xác nhận người chăm sóc đã đọc.';
}

class CaregiverService {
  CaregiverService._();
  static final CaregiverService instance = CaregiverService._();

  List<Map<String, dynamic>>? _cachedCaregivers;
  Future<List<Map<String, dynamic>>>? _inFlight;
  int _generation = 0;
  int _revision = 0;
  int _cacheSessionVersion = -1;
  int _inFlightGeneration = -1;
  int _inFlightSessionVersion = -1;
  Future<Map<String, dynamic>>? _sendingAlert;
  int _sendingSessionVersion = -1;

  void beginSession() => clearCache();

  Future<List<Map<String, dynamic>>> getMyCaregivers({bool refresh = false}) {
    final version = ApiClient.sessionVersion;
    final generation = _generation;
    if (!refresh &&
        _cachedCaregivers != null &&
        _cacheSessionVersion == version) {
      return Future.value(_copyList(_cachedCaregivers!));
    }
    if (!refresh &&
        _inFlight != null &&
        _inFlightGeneration == generation &&
        _inFlightSessionVersion == version) {
      return _inFlight!.then(_copyList);
    }
    final revision = ++_revision;
    late final Future<List<Map<String, dynamic>>> request;
    request = _fetchCaregivers()
        .then((items) {
          if (_generation == generation &&
              ApiClient.sessionVersion == version &&
              revision == _revision) {
            _cachedCaregivers = _copyList(items);
            _cacheSessionVersion = version;
          }
          return _copyList(items);
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
    _inFlightSessionVersion = version;
    return request;
  }

  Future<Map<String, dynamic>> sendEmergencyAlert({
    required String noiDung,
    double? viDo,
    double? kinhDo,
  }) async {
    final version = ApiClient.sessionVersion;
    if (_sendingAlert != null && _sendingSessionVersion == version) {
      throw const ApiException('Đang gửi SOS. Vui lòng chờ kết quả.');
    }
    final content = noiDung.trim();
    if (content.isEmpty || content.length > 500) {
      throw const ApiException('Nội dung SOS cần từ 1 đến 500 ký tự.');
    }
    if ((viDo == null) != (kinhDo == null)) {
      throw const ApiException('Vĩ độ và kinh độ phải được gửi cùng nhau.');
    }
    if (viDo != null &&
        kinhDo != null &&
        (!viDo.isFinite ||
            !kinhDo.isFinite ||
            viDo < -90 ||
            viDo > 90 ||
            kinhDo < -180 ||
            kinhDo > 180)) {
      throw const ApiException('Vị trí gửi SOS không hợp lệ.');
    }
    late final Future<Map<String, dynamic>> request;
    request = _send({'noiDung': content, 'viDo': ?viDo, 'kinhDo': ?kinhDo})
        .whenComplete(() {
          if (identical(_sendingAlert, request)) {
            _sendingAlert = null;
            _sendingSessionVersion = -1;
          }
        });
    _sendingAlert = request;
    _sendingSessionVersion = version;
    return request;
  }

  Future<Map<String, dynamic>> _send(Map<String, dynamic> body) async {
    try {
      final response = await ApiClient.instance.dio.post<Map<String, dynamic>>(
        '/emergency-alerts',
        data: body,
      );
      final data = response.data?['data'];
      if (data is! Map) {
        throw ApiException(
          'Chưa xác nhận được kết quả gửi SOS. '
          'Kiểm tra lịch sử cảnh báo trước khi gửi lại.',
          statusCode: response.statusCode,
        );
      }
      return Map<String, dynamic>.from(data);
    } on DioException catch (error) {
      final uncertain =
          error.type == DioExceptionType.receiveTimeout ||
          error.type == DioExceptionType.sendTimeout ||
          error.type == DioExceptionType.connectionError ||
          error.type == DioExceptionType.unknown ||
          (error.response?.statusCode ?? 0) >= 500;
      if (uncertain) {
        throw ApiException(
          'Chưa xác nhận được kết quả gửi SOS. Máy chủ có thể đã nhận yêu cầu. '
          'Kiểm tra lịch sử cảnh báo hoặc gọi người chăm sóc trước khi gửi lại.',
          statusCode: error.response?.statusCode,
          dioType: error.type,
        );
      }
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
          'Dữ liệu người chăm sóc không hợp lệ.',
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
    _revision++;
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
