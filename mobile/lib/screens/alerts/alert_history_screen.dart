import 'package:flutter/material.dart';
import '../../theme/care_senior_theme.dart';
import '../../widgets/care_senior_ui.dart';

import '../../services/alert_service.dart';
import '../../services/api_client.dart';
import '../../widgets/foreground_refresh.dart';
import '../../widgets/alert_card.dart';

class AlertHistoryScreen extends StatefulWidget {
  const AlertHistoryScreen({super.key, this.embedded = false});

  final bool embedded;

  @override
  State<AlertHistoryScreen> createState() => _AlertHistoryScreenState();
}

class _AlertHistoryScreenState extends State<AlertHistoryScreen>
    with ForegroundRefresh<AlertHistoryScreen> {
  @override
  Future<void> refreshForeground() => _load(refresh: true);
  List<Map<String, dynamic>> _alerts = const [];
  bool _loading = true;
  String? _error;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load({bool refresh = false}) async {
    if (!refresh && mounted) setState(() => _loading = true);
    try {
      final alerts = await AlertService.instance.getMyAlerts(refresh: refresh);
      if (!mounted) return;
      setState(() {
        _alerts = alerts;
        _error = null;
        _loading = false;
      });
    } on ApiException catch (error) {
      if (!mounted) return;
      setState(() {
        _error = error.message;
        _loading = false;
      });
    } catch (_) {
      if (!mounted) return;
      setState(() {
        _error = 'Không thể tải lịch sử cảnh báo.';
        _loading = false;
      });
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: CareSeniorColors.background,
      appBar: widget.embedded
          ? null
          : AppBar(
              backgroundColor: CareSeniorColors.background,
              centerTitle: true,
              title: const Text(
                'Lịch sử cảnh báo',
                style: TextStyle(fontWeight: FontWeight.bold),
              ),
            ),
      body: _loading
          ? const Center(child: CircularProgressIndicator())
          : _error != null
          ? _ErrorView(message: _error!, onRetry: _load)
          : RefreshIndicator(
              onRefresh: () => _load(refresh: true),
              child: ListView(
                physics: const AlwaysScrollableScrollPhysics(),
                padding: const EdgeInsets.fromLTRB(18, 12, 18, 30),
                children: [
                  _Summary(count: _alerts.length),
                  const SizedBox(height: 20),
                  if (_alerts.isEmpty)
                    const AppEmptyState(
                      icon: Icons.notifications_off_outlined,
                      title: 'Chưa có cảnh báo nào',
                      message: 'Các cảnh báo đã gửi sẽ được lưu tại đây.',
                    )
                  else
                    ..._alerts.map((alert) => AlertCard(alert: alert)),
                ],
              ),
            ),
    );
  }
}

class _Summary extends StatelessWidget {
  const _Summary({required this.count});

  final int count;

  @override
  Widget build(BuildContext context) => AppCard(
    color: CareSeniorColors.dangerSurface,
    child: Row(
      children: [
        const CircleAvatar(
          radius: 30,
          backgroundColor: Colors.white,
          child: Icon(
            Icons.notifications_active_rounded,
            color: CareSeniorColors.danger,
            size: 30,
          ),
        ),
        const SizedBox(width: 14),
        Expanded(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              const Text(
                'Cảnh báo đã ghi nhận',
                style: TextStyle(
                  fontSize: 16,
                  color: CareSeniorColors.secondaryText,
                ),
              ),
              Text(
                '$count cảnh báo',
                style: const TextStyle(
                  fontSize: 21,
                  fontWeight: FontWeight.bold,
                ),
              ),
            ],
          ),
        ),
      ],
    ),
  );
}

class _ErrorView extends StatelessWidget {
  const _ErrorView({required this.message, required this.onRetry});

  final String message;
  final VoidCallback onRetry;

  @override
  Widget build(BuildContext context) => Center(
    child: Padding(
      padding: const EdgeInsets.all(24),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          const Icon(Icons.cloud_off_rounded, size: 52, color: Colors.black38),
          const SizedBox(height: 12),
          Text(message, textAlign: TextAlign.center),
          const SizedBox(height: 14),
          FilledButton(onPressed: onRetry, child: const Text('Thử lại')),
        ],
      ),
    ),
  );
}
