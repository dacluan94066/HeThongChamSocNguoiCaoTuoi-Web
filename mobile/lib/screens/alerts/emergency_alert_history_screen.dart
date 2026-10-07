import 'package:flutter/material.dart';

import '../../services/alert_service.dart';
import '../../services/api_client.dart';

class EmergencyAlertHistoryScreen extends StatefulWidget {
  const EmergencyAlertHistoryScreen({super.key});

  @override
  State<EmergencyAlertHistoryScreen> createState() =>
      _EmergencyAlertHistoryScreenState();
}

class _EmergencyAlertHistoryScreenState
    extends State<EmergencyAlertHistoryScreen> {
  List<Map<String, dynamic>> _items = [];
  bool _loading = true;
  String? _error;
  int _sequence = 0;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    final sequence = ++_sequence;
    final version = ApiClient.sessionVersion;
    try {
      // Dùng endpoint đã có, phạm vi truy cập do backend kiểm tra.
      final items = await AlertService.instance.getMyEmergencyAlerts(
        refresh: true,
      );
      if (!mounted ||
          version != ApiClient.sessionVersion ||
          sequence != _sequence)
        return;
      items.sort((a, b) {
        final first = DateTime.tryParse(a['ngayGui']?.toString() ?? '');
        final second = DateTime.tryParse(b['ngayGui']?.toString() ?? '');
        if (first == null) return second == null ? 0 : 1;
        if (second == null) return -1;
        return second.compareTo(first);
      });
      setState(() {
        _items = items;
        _loading = false;
        _error = null;
      });
    } catch (error) {
      if (!mounted ||
          version != ApiClient.sessionVersion ||
          sequence != _sequence)
        return;
      setState(() {
        _loading = false;
        _error = error is ApiException
            ? error.message
            : 'Không thể tải lịch sử SOS.';
      });
    }
  }

  @override
  Widget build(BuildContext context) => Scaffold(
    appBar: AppBar(
      title: const Text('Lịch sử SOS'),
      actions: [
        IconButton(
          tooltip: 'Làm mới',
          onPressed: _load,
          icon: const Icon(Icons.refresh),
        ),
      ],
    ),
    body: _loading
        ? const Center(child: CircularProgressIndicator())
        : RefreshIndicator(
            onRefresh: _load,
            child: ListView(
              physics: const AlwaysScrollableScrollPhysics(),
              padding: const EdgeInsets.all(16),
              children: [
                const Text(
                  'Kiểm tra các cảnh báo gần nhất trước khi gửi lại một SOS '
                  'chưa xác nhận được kết quả.',
                ),
                const SizedBox(height: 16),
                if (_error != null)
                  Card(
                    child: Padding(
                      padding: const EdgeInsets.all(16),
                      child: Column(
                        children: [
                          Text(_error!, textAlign: TextAlign.center),
                          TextButton(
                            onPressed: _load,
                            child: const Text('Thử lại'),
                          ),
                        ],
                      ),
                    ),
                  ),
                if (_items.isEmpty && _error == null)
                  const Padding(
                    padding: EdgeInsets.symmetric(vertical: 60),
                    child: Text(
                      'Chưa có cảnh báo SOS.',
                      textAlign: TextAlign.center,
                    ),
                  ),
                ..._items.map(
                  (item) => Card(
                    child: ListTile(
                      leading: const Icon(Icons.sos, color: Colors.red),
                      title: Text(
                        item['noiDung']?.toString() ?? 'Cảnh báo khẩn cấp',
                      ),
                      subtitle: Text(_formatTime(item['ngayGui'])),
                    ),
                  ),
                ),
              ],
            ),
          ),
  );

  static String _formatTime(Object? raw) {
    final date = DateTime.tryParse(raw?.toString() ?? '')?.toLocal();
    if (date == null) return 'Chưa cập nhật thời gian';
    String two(int number) => number.toString().padLeft(2, '0');
    return '${two(date.hour)}:${two(date.minute)} • '
        '${two(date.day)}/${two(date.month)}/${date.year}';
  }
}
