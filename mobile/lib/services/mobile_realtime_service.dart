import 'dart:async';

import 'package:flutter/foundation.dart';
import 'package:socket_io_client/socket_io_client.dart' as io;

import 'api_client.dart';
import 'appointment_service.dart';
import 'medication_schedule_service.dart';

class MobileRealtimeService {
  MobileRealtimeService._() {
    ApiClient.sessionChanges.addListener(_onSessionChanged);
  }

  static final MobileRealtimeService instance = MobileRealtimeService._();

  final ValueNotifier<bool> connected = ValueNotifier(false);
  final ValueNotifier<int> appointmentRevision = ValueNotifier(0);
  final ValueNotifier<int> medicationRevision = ValueNotifier(0);
  final ValueNotifier<int> notificationRevision = ValueNotifier(0);

  io.Socket? _socket;
  int _session = -1;
  int _generation = 0;
  final Set<int> _refreshingGenerations = <int>{};
  final Set<int> _pendingRefreshGenerations = <int>{};

  static bool get supportsRealtime =>
      !kIsWeb &&
      (defaultTargetPlatform == TargetPlatform.android ||
          defaultTargetPlatform == TargetPlatform.iOS);

  static String socketUrlFromApiBase(String apiBaseUrl) {
    final uri = Uri.parse(apiBaseUrl);
    final segments = [...uri.pathSegments];
    while (segments.isNotEmpty && segments.last.isEmpty) {
      segments.removeLast();
    }
    if (segments.isNotEmpty && segments.last.toLowerCase() == 'api') {
      segments.removeLast();
    }
    return uri
        .replace(pathSegments: segments, query: null, fragment: null)
        .toString()
        .replaceFirst(RegExp(r'/$'), '');
  }

  static bool isAppointmentEvent(Object? data) {
    if (data is! Map) return false;
    final id = int.tryParse(data['id']?.toString() ?? '');
    const actions = {'created', 'updated', 'cancelled', 'result-recorded'};
    return id != null && id > 0 && actions.contains(data['action']);
  }

  Future<void> connect() async {
    if (!supportsRealtime) return;
    final version = ApiClient.sessionVersion;
    if (_session == version && (_socket?.connected == true)) return;

    final generation = ++_generation;
    _disposeSocket();
    final token = await ApiClient.storage.read(key: ApiClient.tokenKey);
    if (generation != _generation ||
        version != ApiClient.sessionVersion ||
        token == null ||
        token.isEmpty) {
      return;
    }

    final socket = io.io(
      socketUrlFromApiBase(ApiClient.baseUrl),
      io.OptionBuilder()
          .setTransports(['websocket'])
          .setAuth({'token': token})
          .enableReconnection()
          .setReconnectionDelay(1000)
          .setReconnectionDelayMax(5000)
          .disableAutoConnect()
          .enableForceNewConnection()
          .build(),
    );
    _socket = socket;
    _session = version;

    bool current() =>
        generation == _generation &&
        identical(_socket, socket) &&
        version == ApiClient.sessionVersion;

    socket.onConnect((_) {
      if (!current()) return;
      connected.value = true;
      unawaited(_refreshAppointments(version, generation));
      unawaited(_refreshMedications(version, generation));
    });
    socket.onDisconnect((_) {
      if (current()) connected.value = false;
    });
    socket.onConnectError((_) {
      if (current()) connected.value = false;
    });
    socket.onError((_) {
      if (current()) connected.value = false;
    });
    socket.on('lichkham:updated', (data) {
      if (!current() || !isAppointmentEvent(data)) return;
      unawaited(_refreshAppointments(version, generation));
    });
    socket.on('lichuongthuoc:updated', (_) {
      if (current()) unawaited(_refreshMedications(version, generation));
    });
    socket.on('donthuoc:created', (_) {
      if (current()) unawaited(_refreshMedications(version, generation));
    });
    socket.on('thongbao:new', (_) {
      if (current()) notificationRevision.value++;
    });
    socket.connect();
  }

  Future<void> _refreshAppointments(int version, int generation) async {
    if (!_refreshingGenerations.add(generation)) {
      _pendingRefreshGenerations.add(generation);
      return;
    }
    try {
      do {
        _pendingRefreshGenerations.remove(generation);
        try {
          await Future.wait([
            AppointmentService.instance.getAppointments(refresh: true),
            AppointmentService.instance.getUpcomingAppointments(refresh: true),
          ]);
          if (version != ApiClient.sessionVersion ||
              generation != _generation) {
            return;
          }
          appointmentRevision.value++;
        } catch (_) {
          // Foreground polling and resume refresh remain the fallback.
        }
      } while (_pendingRefreshGenerations.contains(generation) &&
          version == ApiClient.sessionVersion &&
          generation == _generation);
    } finally {
      _pendingRefreshGenerations.remove(generation);
      _refreshingGenerations.remove(generation);
    }
  }

  Future<void> _refreshMedications(int version, int generation) async {
    try {
      await Future.wait([
        MedicationScheduleService.instance.getTodaySchedule(refresh: true),
        MedicationScheduleService.instance.syncUpcomingReminders(refresh: true),
      ]);
      if (version == ApiClient.sessionVersion && generation == _generation) {
        medicationRevision.value++;
      }
    } catch (_) {
      // Home refresh on resume is the fallback if this socket refresh fails.
    }
  }

  void disconnect() {
    _generation++;
    _session = -1;
    connected.value = false;
    _disposeSocket();
  }

  void _disposeSocket() {
    final socket = _socket;
    _socket = null;
    socket?.dispose();
  }

  void _onSessionChanged() {
    if (_session >= 0 && _session != ApiClient.sessionVersion) disconnect();
  }
}
