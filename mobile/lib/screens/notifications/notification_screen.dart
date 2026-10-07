import 'package:flutter/material.dart';

import '../../services/alert_service.dart';
import '../../services/api_client.dart';

class NotificationScreen extends StatefulWidget {
  const NotificationScreen({super.key});

  @override
  State<NotificationScreen> createState() => _NotificationScreenState();
}

class _NotificationScreenState extends State<NotificationScreen> {
  List<Map<String, dynamic>> _items = const [];
  bool _loading = true;
  String? _error;

  @override
  void initState() {
    super.initState();
    _load();
  }

  bool _truthy(Object? value) =>
      value == true || value == 1 || value?.toString() == '1';

  int get _unreadCount =>
      _items.where((item) => !_truthy(item['daDoc'])).length;

  Future<void> _load({bool refresh = false}) async {
    if (!refresh && mounted) setState(() => _loading = true);
    try {
      final items = await AlertService.instance.getNotifications(
        refresh: refresh,
      );
      if (!mounted) return;
      setState(() {
        _items = items;
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
        _error = 'Không thể tải thông báo.';
        _loading = false;
      });
    }
  }

  Future<void> _openNotification(Map<String, dynamic> item) async {
    if (_truthy(item['daDoc'])) return;
    final id = int.tryParse(item['id']?.toString() ?? '');
    if (id == null) return;
    try {
      await AlertService.instance.markNotificationRead(id);
      if (!mounted) return;
      setState(() => item['daDoc'] = true);
    } on ApiException catch (error) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text(error.message), backgroundColor: Colors.red),
      );
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: const Color(0xfff4f6f5),
      appBar: AppBar(
        title: const Text(
          'Thông báo',
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
                padding: const EdgeInsets.fromLTRB(14, 10, 14, 30),
                children: [
                  Container(
                    padding: const EdgeInsets.all(16),
                    decoration: BoxDecoration(
                      color: const Color(0xffe8f7f2),
                      borderRadius: BorderRadius.circular(20),
                    ),
                    child: Row(
                      children: [
                        const Icon(
                          Icons.notifications_active_outlined,
                          color: Color(0xff07856d),
                          size: 32,
                        ),
                        const SizedBox(width: 12),
                        Text(
                          '$_unreadCount thông báo chưa đọc',
                          style: const TextStyle(
                            fontSize: 17,
                            fontWeight: FontWeight.bold,
                          ),
                        ),
                      ],
                    ),
                  ),
                  const SizedBox(height: 14),
                  if (_items.isEmpty)
                    const Padding(
                      padding: EdgeInsets.only(top: 120),
                      child: Column(
                        children: [
                          Icon(
                            Icons.notifications_none_rounded,
                            size: 68,
                            color: Colors.black26,
                          ),
                          SizedBox(height: 12),
                          Text('Chưa có thông báo nào.'),
                        ],
                      ),
                    )
                  else
                    ..._items.map(_notificationCard),
                ],
              ),
            ),
    );
  }

  Widget _notificationCard(Map<String, dynamic> item) {
    final read = _truthy(item['daDoc']);
    final type = item['loaiThongBao']?.toString();
    final emergency = type == 'KhanCap';
    final color = emergency ? const Color(0xffc62828) : const Color(0xff07856d);
    final background = read
        ? Colors.white
        : emergency
        ? const Color(0xffffe8e8)
        : const Color(0xffe9f8f4);
    return Card(
      elevation: 0,
      color: background,
      margin: const EdgeInsets.only(bottom: 9),
      child: ListTile(
        onTap: () => _openNotification(item),
        leading: CircleAvatar(
          backgroundColor: color.withValues(alpha: 0.12),
          child: Icon(_iconFor(type), color: color),
        ),
        title: Text(
          item['tieuDe']?.toString() ?? 'Thông báo',
          style: TextStyle(
            fontWeight: read ? FontWeight.w500 : FontWeight.bold,
          ),
        ),
        subtitle: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            const SizedBox(height: 4),
            Text(item['noiDung']?.toString() ?? ''),
            const SizedBox(height: 6),
            Text(
              _dateTime(item['ngayTao']),
              style: const TextStyle(fontSize: 12, color: Colors.black45),
            ),
          ],
        ),
        trailing: read ? null : Icon(Icons.circle, size: 10, color: color),
      ),
    );
  }

  static IconData _iconFor(String? type) => switch (type) {
    'NhacThuoc' => Icons.medication_rounded,
    'NhacLichKham' => Icons.calendar_month_rounded,
    'CanhBaoChiSo' => Icons.monitor_heart_rounded,
    'KhanCap' => Icons.sos_rounded,
    _ => Icons.notifications_outlined,
  };

  static String _dateTime(Object? raw) {
    final value = DateTime.tryParse(raw?.toString() ?? '')?.toLocal();
    if (value == null) return '';
    String two(int number) => number.toString().padLeft(2, '0');
    return '${two(value.hour)}:${two(value.minute)} • '
        '${two(value.day)}/${two(value.month)}/${value.year}';
  }
}

class _ErrorView extends StatelessWidget {
  const _ErrorView({required this.message, required this.onRetry});

  final String message;
  final VoidCallback onRetry;

  @override
  Widget build(BuildContext context) => Center(
    child: Column(
      mainAxisSize: MainAxisSize.min,
      children: [
        Text(message, textAlign: TextAlign.center),
        const SizedBox(height: 12),
        FilledButton(onPressed: onRetry, child: const Text('Thử lại')),
      ],
    ),
  );
}
