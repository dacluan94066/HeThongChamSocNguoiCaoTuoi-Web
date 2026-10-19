import 'dart:convert';
import 'package:dio/dio.dart';

import 'api_client.dart';
import 'local_notification_service.dart';

class AppointmentService {
  AppointmentService._();

  static final AppointmentService instance = AppointmentService._();

  final Map<String, List<Map<String, dynamic>>> _cache = {};
  final Map<String, Future<List<Map<String, dynamic>>>> _inFlight = {};
  final Map<String, int> _revisions = {};
  int _generation = 0;
  int _cacheSessionVersion = -1;

  void beginSession() => clearCache();

  Future<List<Map<String, dynamic>>> getAppointments({bool refresh = false}) =>
      _getCached('all', '/elderly/me/appointments', refresh: refresh);

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
        .where((appointment) => appointment['trangThai'] == status
            || (status == 'ChuaDen' && appointment['trangThai'] == 'DaDoiLich'))
        .toList(growable: false);
  }

  Future<List<Map<String, dynamic>>> _getCached(
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
    if (!refresh &&
        _cacheSessionVersion == version &&
        _cache.containsKey(key)) {
      return Future.value(_copyList(_cache[key]!));
    }
    final existing = _inFlight[key];
    if (!refresh && existing != null) return existing.then(_copyList);

    final revision = (_revisions[key] ?? 0) + 1;
    _revisions[key] = revision;

    late final Future<List<Map<String, dynamic>>> request;
    request = _fetch(path, queryParameters)
        .then((items) async {
          if (_generation == generation &&
              ApiClient.sessionVersion == version &&
              _revisions[key] == revision) {
            if (_cacheSessionVersion != version) _cache.clear();
            _cacheSessionVersion = version;
            _cache[key] = _copyList(items);
            if (key == 'all') {
              bool current() =>
                  _generation == generation &&
                  ApiClient.sessionVersion == version &&
                  _revisions[key] == revision;
              try {
                final raw = await ApiClient.storage.read(
                  key: ApiClient.userKey,
                );
                final user = raw == null ? null : jsonDecode(raw);
                if (current() &&
                    user is Map &&
                    user['tenVaiTro'] == 'NguoiCaoTuoi' &&
                    user['userId'] != null) {
                  await LocalNotificationService.syncAppointmentReminders(
                    owner: user['userId'].toString(),
                    appointments: items,
                    isCurrent: current,
                  );
                }
              } catch (_) {
                if (current()) {
                  LocalNotificationService.appointmentState.value =
                      AppointmentReminderState.error;
                }
              }
            }
          }
          return _copyList(items);
        })
        .catchError((Object error, StackTrace stack) {
          if (key == 'all' &&
              _generation == generation &&
              ApiClient.sessionVersion == version &&
              _revisions[key] == revision) {
            LocalNotificationService.appointmentState.value =
                AppointmentReminderState.error;
          }
          Error.throwWithStackTrace(error, stack);
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
    _revisions.clear();
    _cacheSessionVersion = -1;
  }

  static List<Map<String, dynamic>> _copyList(
    List<Map<String, dynamic>> items,
  ) => items.map((item) => Map<String, dynamic>.from(item)).toList();
}
