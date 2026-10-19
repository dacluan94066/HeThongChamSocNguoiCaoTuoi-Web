import 'dart:async';
import 'dart:convert';
import 'package:flutter/material.dart';
import '../services/api_client.dart';
import '../services/local_notification_service.dart';
import '../services/mobile_realtime_service.dart';

/// Mounted only for an authenticated elderly account. Data refresh is owned by
/// the visible Home/Appointment screen; this scope handles notification taps.
class AppointmentReminderScope extends StatefulWidget {
  const AppointmentReminderScope({super.key, required this.child});
  final Widget child;
  @override
  State<AppointmentReminderScope> createState() =>
      _AppointmentReminderScopeState();
}

class _AppointmentReminderScopeState extends State<AppointmentReminderScope> {
  late final int _session;
  late final AppLifecycleListener _lifecycle;
  bool _opening = false;

  bool get _current => mounted && _session == ApiClient.sessionVersion;

  @override
  void initState() {
    super.initState();
    _session = ApiClient.sessionVersion;
    _lifecycle = AppLifecycleListener(
      onResume: () => unawaited(MobileRealtimeService.instance.connect()),
      onInactive: MobileRealtimeService.instance.disconnect,
      onPause: MobileRealtimeService.instance.disconnect,
      onHide: MobileRealtimeService.instance.disconnect,
      onDetach: MobileRealtimeService.instance.disconnect,
    );
    LocalNotificationService.pendingPayload.addListener(_onPayload);
    unawaited(MobileRealtimeService.instance.connect());
    WidgetsBinding.instance.addPostFrameCallback((_) => _onPayload());
  }

  void _onPayload() {
    if (!_current || _opening) return;
    final payload = LocalNotificationService.pendingPayload.value;
    if (payload?.startsWith('appointment:') != true &&
        payload?.startsWith('medication:') != true) {
      return;
    }
    unawaited(_open(payload!));
  }

  Future<void> _open(String payload) async {
    _opening = true;
    try {
      final raw = await ApiClient.storage.read(key: ApiClient.userKey);
      if (!_current) return;
      final user = raw == null ? null : jsonDecode(raw);
      if (LocalNotificationService.pendingPayload.value == payload) {
        LocalNotificationService.takePendingPayload();
      }
      if (user is! Map ||
          user['tenVaiTro'] != 'NguoiCaoTuoi' ||
          payload.split(':').elementAtOrNull(1) != user['userId']?.toString()) {
        return;
      }
      await ApiClient.navigatorKey.currentState?.pushNamed(
        payload.startsWith('medication:') ? '/medications' : '/appointments',
      );
    } catch (_) {
      // Never navigate into an unauthenticated or another account's schedule.
    } finally {
      if (LocalNotificationService.pendingPayload.value == payload) {
        LocalNotificationService.takePendingPayload();
      }
      _opening = false;
      if (_current) _onPayload();
    }
  }

  @override
  void dispose() {
    _lifecycle.dispose();
    MobileRealtimeService.instance.disconnect();
    LocalNotificationService.pendingPayload.removeListener(_onPayload);
    super.dispose();
  }

  @override
  Widget build(BuildContext context) => widget.child;
}
