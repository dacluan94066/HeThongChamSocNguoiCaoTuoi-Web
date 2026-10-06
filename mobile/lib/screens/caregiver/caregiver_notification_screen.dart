import 'package:flutter/material.dart';

import '../../services/api_client.dart';
import '../../services/caregiver_dashboard_service.dart';

class CaregiverNotificationScreen extends StatefulWidget {
  const CaregiverNotificationScreen({super.key});

  @override
  State<CaregiverNotificationScreen> createState() =>
      _CaregiverNotificationScreenState();
}

class _CaregiverNotificationScreenState
    extends State<CaregiverNotificationScreen> {
  List<Map<String, dynamic>> _items = const [];
  bool _loading = true;
  String? _error;

  @override
  void initState() {
    super.initState();
    _load();
  }

  bool _truthy(dynamic value) => value == true || value == 1 || value == '1';

  Future<void> _load({bool refresh = false}) async {
    try {
      final items = await CaregiverDashboardService.instance.getNotifications(
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

  Future<void> _markRead(Map<String, dynamic> item) async {
    if (_truthy(item['daDoc'])) return;
    final id = int.tryParse(item['id']?.toString() ?? '');
    if (id == null) return;
    try {
      await CaregiverDashboardService.instance.markNotificationRead(id);
      if (!mounted) return;
      setState(() => item['daDoc'] = true);
    } on ApiException catch (error) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text(error.message)),
      );
    }
  }

  String _date(dynamic value) {
    final date = DateTime.tryParse(value?.toString() ?? '')?.toLocal();
    if (date == null) return '';
    String two(int number) => number.toString().padLeft(2, '0');
    return '${two(date.hour)}:${two(date.minute)} ${two(date.day)}/${two(date.month)}/${date.year}';
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: const Text(
          'Thông báo',
          style: TextStyle(fontWeight: FontWeight.bold),
        ),
      ),
      body: _loading
          ? const Center(child: CircularProgressIndicator())
          : _error != null
          ? Center(
              child: Column(
                mainAxisSize: MainAxisSize.min,
                children: [
                  Text(_error!),
                  const SizedBox(height: 12),
                  FilledButton(
                    onPressed: _load,
                    child: const Text('Thử lại'),
                  ),
                ],
              ),
            )
          : RefreshIndicator(
              onRefresh: () => _load(refresh: true),
              child: _items.isEmpty
                  ? ListView(
                      children: const [
                        SizedBox(height: 180),
                        Icon(
                          Icons.notifications_none_rounded,
                          size: 68,
                          color: Colors.grey,
                        ),
                        SizedBox(height: 12),
                        Center(child: Text('Chưa có thông báo nào.')),
                      ],
                    )
                  : ListView.separated(
                      padding: const EdgeInsets.all(14),
                      itemCount: _items.length,
                      separatorBuilder: (_, _) => const SizedBox(height: 8),
                      itemBuilder: (context, index) {
                        final item = _items[index];
                        final read = _truthy(item['daDoc']);
                        final emergency =
                            item['loaiThongBao']?.toString() == 'KhanCap';
                        return Card(
                          elevation: 0,
                          color: read
                              ? Colors.white
                              : emergency
                              ? const Color(0xffffe8e8)
                              : const Color(0xffe9f8f4),
                          child: ListTile(
                            onTap: () => _markRead(item),
                            leading: Icon(
                              emergency
                                  ? Icons.warning_amber_rounded
                                  : Icons.notifications_outlined,
                              color: emergency
                                  ? Colors.red
                                  : const Color(0xff07856d),
                            ),
                            title: Text(
                              item['tieuDe']?.toString() ?? 'Thông báo',
                              style: TextStyle(
                                fontWeight: read
                                    ? FontWeight.w500
                                    : FontWeight.bold,
                              ),
                            ),
                            subtitle: Column(
                              crossAxisAlignment: CrossAxisAlignment.start,
                              children: [
                                const SizedBox(height: 4),
                                Text(item['noiDung']?.toString() ?? ''),
                                const SizedBox(height: 5),
                                Text(
                                  _date(item['ngayTao']),
                                  style: const TextStyle(fontSize: 12),
                                ),
                              ],
                            ),
                            trailing: read
                                ? null
                                : const Icon(
                                    Icons.circle,
                                    size: 10,
                                    color: Color(0xff07856d),
                                  ),
                          ),
                        );
                      },
                    ),
            ),
    );
  }
}
