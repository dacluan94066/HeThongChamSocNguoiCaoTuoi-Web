import 'dart:async';

import 'package:flutter/material.dart';

import '../services/api_client.dart';

/// Làm mới dữ liệu của màn hình đang hiển thị, chỉ khi app ở foreground.
mixin ForegroundRefresh<T extends StatefulWidget> on State<T> {
  Timer? _refreshTimer;
  late final AppLifecycleListener _lifecycleListener;
  late final int _refreshSession;
  bool _refreshRunning = false;

  Duration get foregroundRefreshInterval => const Duration(seconds: 30);

  Future<void> refreshForeground();

  @override
  void initState() {
    super.initState();
    _refreshSession = ApiClient.sessionVersion;
    _lifecycleListener = AppLifecycleListener(
      onResume: () {
        _startTimer();
        unawaited(_refresh());
      },
      onInactive: _stopTimer,
      onPause: _stopTimer,
      onHide: _stopTimer,
      onDetach: _stopTimer,
    );
    _startTimer();
  }

  void _startTimer() {
    _stopTimer();
    final state = WidgetsBinding.instance.lifecycleState;
    if (state != null && state != AppLifecycleState.resumed) return;
    _refreshTimer = Timer.periodic(foregroundRefreshInterval, (_) {
      unawaited(_refresh());
    });
  }

  void _stopTimer() {
    _refreshTimer?.cancel();
    _refreshTimer = null;
  }

  Future<void> _refresh() async {
    if (!mounted ||
        _refreshRunning ||
        _refreshSession != ApiClient.sessionVersion) {
      return;
    }
    final lifecycle = WidgetsBinding.instance.lifecycleState;
    if (lifecycle != null && lifecycle != AppLifecycleState.resumed) return;
    if (ModalRoute.of(context)?.isCurrent != true) return;
    _refreshRunning = true;
    try {
      await refreshForeground();
    } catch (_) {
      // Giữ dữ liệu hiện tại; màn hình tự xử lý lỗi và nút thử lại.
    } finally {
      _refreshRunning = false;
    }
  }

  @override
  void dispose() {
    _stopTimer();
    _lifecycleListener.dispose();
    super.dispose();
  }
}
