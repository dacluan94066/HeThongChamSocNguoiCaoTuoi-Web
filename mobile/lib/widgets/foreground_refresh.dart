import 'dart:async';
import 'package:flutter/material.dart';

/// Refresh only while this route is visible and the app is in the foreground.
/// This does not provide background push notifications.
mixin ForegroundRefresh<T extends StatefulWidget> on State<T> {
  late final _RefreshObserver _observer;
  Timer? _refreshTimer;
  bool _refreshing = false;
  bool _foreground = true;

  Future<void> refreshForeground();

  @override
  void initState() {
    super.initState();
    _foreground =
        WidgetsBinding.instance.lifecycleState == null ||
        WidgetsBinding.instance.lifecycleState == AppLifecycleState.resumed;
    _observer = _RefreshObserver((state) {
      _foreground = state == AppLifecycleState.resumed;
      if (_foreground) _refresh();
    });
    WidgetsBinding.instance.addObserver(_observer);
    _refreshTimer = Timer.periodic(
      const Duration(seconds: 30),
      (_) => _refresh(),
    );
  }

  Future<void> _refresh() async {
    if (!mounted ||
        !_foreground ||
        _refreshing ||
        ModalRoute.of(context)?.isCurrent != true) {
      return;
    }
    _refreshing = true;
    try {
      await refreshForeground();
    } catch (_) {
      // Screens keep their last data; manual refresh exposes the error.
    } finally {
      _refreshing = false;
    }
  }

  @override
  void dispose() {
    _refreshTimer?.cancel();
    WidgetsBinding.instance.removeObserver(_observer);
    super.dispose();
  }
}

class _RefreshObserver extends WidgetsBindingObserver {
  _RefreshObserver(this.onChanged);
  final void Function(AppLifecycleState) onChanged;
  @override
  void didChangeAppLifecycleState(AppLifecycleState state) => onChanged(state);
}
