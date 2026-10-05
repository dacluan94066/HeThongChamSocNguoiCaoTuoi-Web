import 'package:flutter/material.dart';

import '../../services/alert_service.dart';
import '../../services/api_client.dart';

class AlertHistoryScreen extends StatefulWidget {
  const AlertHistoryScreen({super.key});

  @override
  State<AlertHistoryScreen> createState() => _AlertHistoryScreenState();
}

class _AlertHistoryScreenState extends State<AlertHistoryScreen> {
  List<Map<String, dynamic>> alerts = [];

  bool loading = true;
  String? error;

  @override
  void initState() {
    super.initState();
    loadAlerts();
  }

  Future<void> loadAlerts() async {
    if (mounted) {
      setState(() {
        loading = true;
        error = null;
      });
    }

    try {
      final data = await AlertService.instance.getAlerts();

      if (!mounted) return;

      setState(() {
        alerts = data;
        loading = false;
      });
    } on ApiException catch (e) {
      if (!mounted) return;

      setState(() {
        error = e.message;
        loading = false;
      });
    } catch (_) {
      if (!mounted) return;

      setState(() {
        error = 'Không thể tải lịch sử cảnh báo.';
        loading = false;
      });
    }
  }

  IconData getAlertIcon(String type) {
    if (type == 'KhanCap') {
      return Icons.sos_rounded;
    }

    if (type == 'ChiSoBatThuong') {
      return Icons.monitor_heart_rounded;
    }

    if (type == 'NhacUongThuoc') {
      return Icons.medication_rounded;
    }

    if (type == 'NhacLichKham') {
      return Icons.calendar_month_rounded;
    }

    return Icons.notifications_active_rounded;
  }

  Color getAlertColor(String type) {
    if (type == 'KhanCap') {
      return const Color(0xffd84444);
    }

    if (type == 'ChiSoBatThuong') {
      return const Color(0xffff9f27);
    }

    return const Color(0xff07856d);
  }

  Color getAlertBackground(String type) {
    if (type == 'KhanCap') {
      return const Color(0xffffe9e9);
    }

    if (type == 'ChiSoBatThuong') {
      return const Color(0xfffff3df);
    }

    return const Color(0xffe8f8ee);
  }

  Color getStatusColor(String status) {
    switch (status) {
      case 'DA_XU_LY':
        return const Color(0xff07856d);

      case 'DA_XEM':
        return const Color(0xff4b6edb);

      case 'BO_QUA':
        return Colors.grey;

      default:
        return const Color(0xffd84444);
    }
  }

  String formatDateTime(Object? raw) {
    final date = DateTime.tryParse(raw?.toString() ?? '')?.toLocal();

    if (date == null) {
      return 'Không rõ thời gian';
    }

    final day = date.day.toString().padLeft(2, '0');
    final month = date.month.toString().padLeft(2, '0');
    final hour = date.hour.toString().padLeft(2, '0');
    final minute = date.minute.toString().padLeft(2, '0');

    return '$day/$month/${date.year} • $hour:$minute';
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: const Color(0xfff3f3f1),
      appBar: AppBar(
        backgroundColor: const Color(0xfff3f3f1),
        elevation: 0,
        centerTitle: true,
        title: const Text(
          'Lịch sử cảnh báo',
          style: TextStyle(fontWeight: FontWeight.bold),
        ),
      ),
      body: _buildBody(),
    );
  }

  Widget _buildBody() {
    if (loading) {
      return const Center(
        child: CircularProgressIndicator(color: Color(0xff07856d)),
      );
    }

    if (error != null) {
      return Center(
        child: Padding(
          padding: const EdgeInsets.all(28),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              const Icon(Icons.cloud_off_rounded, size: 58, color: Colors.grey),
              const SizedBox(height: 14),
              Text(error!, textAlign: TextAlign.center),
              const SizedBox(height: 16),
              FilledButton.icon(
                onPressed: loadAlerts,
                icon: const Icon(Icons.refresh),
                label: const Text('Thử lại'),
              ),
            ],
          ),
        ),
      );
    }

    if (alerts.isEmpty) {
      return RefreshIndicator(
        onRefresh: loadAlerts,
        color: const Color(0xff07856d),
        child: ListView(
          physics: const AlwaysScrollableScrollPhysics(),
          children: const [
            SizedBox(height: 180),
            Icon(
              Icons.notifications_none_rounded,
              size: 65,
              color: Colors.black26,
            ),
            SizedBox(height: 14),
            Center(
              child: Text(
                'Chưa có cảnh báo nào.',
                style: TextStyle(color: Colors.black54),
              ),
            ),
          ],
        ),
      );
    }

    return RefreshIndicator(
      onRefresh: loadAlerts,
      color: const Color(0xff07856d),
      child: ListView(
        physics: const AlwaysScrollableScrollPhysics(),
        padding: const EdgeInsets.fromLTRB(18, 12, 18, 30),
        children: [
          Container(
            width: double.infinity,
            padding: const EdgeInsets.all(18),
            decoration: BoxDecoration(
              gradient: const LinearGradient(
                colors: [Color(0xffffeeee), Color(0xfffff8e9)],
              ),
              borderRadius: BorderRadius.circular(26),
            ),
            child: Row(
              children: [
                const CircleAvatar(
                  radius: 30,
                  backgroundColor: Colors.white,
                  child: Icon(
                    Icons.notifications_active_rounded,
                    color: Color(0xffd84444),
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
                        style: TextStyle(fontSize: 13, color: Colors.black54),
                      ),
                      const SizedBox(height: 3),
                      Text(
                        '${alerts.length} cảnh báo',
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
          ),

          const SizedBox(height: 22),

          ...alerts.map((alert) {
            final type = alert['loaiCanhBao']?.toString() ?? 'Khac';

            final status = alert['trangThai']?.toString() ?? 'CHUA_XU_LY';

            final statusLabel =
                alert['trangThaiLabel']?.toString() ?? 'Chưa xử lý';

            final title = alert['loaiCanhBaoLabel']?.toString() ?? 'Cảnh báo';

            final message = alert['moTa']?.toString() ?? '';

            final time = formatDateTime(alert['thoiGianPhatHien']);

            return Container(
              margin: const EdgeInsets.only(bottom: 12),
              padding: const EdgeInsets.all(15),
              decoration: BoxDecoration(
                color: Colors.white,
                borderRadius: BorderRadius.circular(22),
              ),
              child: Row(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Container(
                    width: 50,
                    height: 50,
                    decoration: BoxDecoration(
                      color: getAlertBackground(type),
                      borderRadius: BorderRadius.circular(16),
                    ),
                    child: Icon(getAlertIcon(type), color: getAlertColor(type)),
                  ),

                  const SizedBox(width: 12),

                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(
                          title,
                          style: const TextStyle(
                            fontSize: 15,
                            fontWeight: FontWeight.bold,
                          ),
                        ),

                        const SizedBox(height: 5),

                        Text(
                          message,
                          style: const TextStyle(
                            fontSize: 13,
                            color: Colors.black54,
                            height: 1.4,
                          ),
                        ),

                        const SizedBox(height: 7),

                        Text(
                          time,
                          style: const TextStyle(
                            fontSize: 12,
                            color: Colors.black45,
                          ),
                        ),
                      ],
                    ),
                  ),

                  const SizedBox(width: 8),

                  Container(
                    padding: const EdgeInsets.symmetric(
                      horizontal: 9,
                      vertical: 5,
                    ),
                    decoration: BoxDecoration(
                      color: getStatusColor(status).withValues(alpha: 0.12),
                      borderRadius: BorderRadius.circular(20),
                    ),
                    child: Text(
                      statusLabel,
                      style: TextStyle(
                        fontSize: 10,
                        fontWeight: FontWeight.bold,
                        color: getStatusColor(status),
                      ),
                    ),
                  ),
                ],
              ),
            );
          }),
        ],
      ),
    );
  }
}
