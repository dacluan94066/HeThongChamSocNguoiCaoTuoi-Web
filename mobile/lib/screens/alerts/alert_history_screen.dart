import 'package:flutter/material.dart';

import '../../services/alert_storage.dart';

class AlertHistoryScreen extends StatefulWidget {
  const AlertHistoryScreen({super.key});

  @override
  State<AlertHistoryScreen> createState() => _AlertHistoryScreenState();
}

class _AlertHistoryScreenState extends State<AlertHistoryScreen> {
  List<Map<String, dynamic>> alerts = [];

  bool loading = true;

  @override
  void initState() {
    super.initState();
    loadAlerts();
  }

  Future<void> loadAlerts() async {
    final data = await AlertStorage.loadAlerts();

    if (!mounted) {
      return;
    }

    setState(() {
      alerts = data;
      loading = false;
    });
  }

  Future<void> markAsHandled(int index) async {
    await AlertStorage.updateAlertStatus(index: index, status: 'Đã xử lý');

    await loadAlerts();

    if (!mounted) {
      return;
    }

    ScaffoldMessenger.of(context).showSnackBar(
      const SnackBar(content: Text('Đã cập nhật trạng thái cảnh báo.')),
    );
  }

  IconData getAlertIcon(String type) {
    if (type == 'sos') {
      return Icons.sos_rounded;
    }

    return Icons.monitor_heart_rounded;
  }

  Color getAlertColor(String type) {
    if (type == 'sos') {
      return const Color(0xffd84444);
    }

    return const Color(0xffff9f27);
  }

  Color getAlertBackground(String type) {
    if (type == 'sos') {
      return const Color(0xffffe9e9);
    }

    return const Color(0xfffff3df);
  }

  Color getStatusColor(String status) {
    if (status == 'Đã xử lý') {
      return const Color(0xff07856d);
    }

    if (status == 'Đã xem') {
      return const Color(0xff4b6edb);
    }

    return const Color(0xffd84444);
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

      body: loading
          ? const Center(
              child: CircularProgressIndicator(color: Color(0xff07856d)),
            )
          : alerts.isEmpty
          ? const Center(
              child: Text(
                'Chưa có cảnh báo nào.',
                style: TextStyle(color: Colors.black54),
              ),
            )
          : RefreshIndicator(
              onRefresh: loadAlerts,
              color: const Color(0xff07856d),
              child: ListView(
                padding: const EdgeInsets.fromLTRB(18, 12, 18, 30),
                children: [
                  Container(
                    width: double.infinity,
                    padding: const EdgeInsets.all(18),
                    decoration: BoxDecoration(
                      gradient: const LinearGradient(
                        colors: [Color(0xffffeeee), Color(0xfffff8e9)],
                        begin: Alignment.topLeft,
                        end: Alignment.bottomRight,
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
                                style: TextStyle(
                                  fontSize: 13,
                                  color: Colors.black54,
                                ),
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

                  ...List.generate(alerts.length, (index) {
                    final alert = alerts[index];

                    final type = alert['type'] ?? 'health';

                    final status = alert['status'] ?? 'Đã gửi';

                    return Container(
                      margin: const EdgeInsets.only(bottom: 12),
                      padding: const EdgeInsets.all(15),
                      decoration: BoxDecoration(
                        color: Colors.white,
                        borderRadius: BorderRadius.circular(22),
                      ),
                      child: Column(
                        children: [
                          Row(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              Container(
                                width: 50,
                                height: 50,
                                decoration: BoxDecoration(
                                  color: getAlertBackground(type),
                                  borderRadius: BorderRadius.circular(16),
                                ),
                                child: Icon(
                                  getAlertIcon(type),
                                  color: getAlertColor(type),
                                ),
                              ),

                              const SizedBox(width: 12),

                              Expanded(
                                child: Column(
                                  crossAxisAlignment: CrossAxisAlignment.start,
                                  children: [
                                    Text(
                                      alert['title'] ?? 'Cảnh báo',
                                      style: const TextStyle(
                                        fontSize: 15,
                                        fontWeight: FontWeight.bold,
                                      ),
                                    ),

                                    const SizedBox(height: 5),

                                    Text(
                                      alert['message'] ?? '',
                                      style: const TextStyle(
                                        fontSize: 13,
                                        color: Colors.black54,
                                        height: 1.4,
                                      ),
                                    ),

                                    const SizedBox(height: 7),

                                    Text(
                                      alert['time'] ?? '',
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
                                  color: getStatusColor(
                                    status,
                                  ).withOpacity(0.12),
                                  borderRadius: BorderRadius.circular(20),
                                ),
                                child: Text(
                                  status,
                                  style: TextStyle(
                                    fontSize: 10,
                                    fontWeight: FontWeight.bold,
                                    color: getStatusColor(status),
                                  ),
                                ),
                              ),
                            ],
                          ),

                          if (status != 'Đã xử lý') ...[
                            const SizedBox(height: 14),

                            SizedBox(
                              width: double.infinity,
                              height: 44,
                              child: OutlinedButton.icon(
                                onPressed: () {
                                  markAsHandled(index);
                                },
                                icon: const Icon(
                                  Icons.check_circle_outline_rounded,
                                ),
                                label: const Text(
                                  'ĐÁNH DẤU ĐÃ XỬ LÝ',
                                  style: TextStyle(fontWeight: FontWeight.bold),
                                ),
                                style: OutlinedButton.styleFrom(
                                  foregroundColor: const Color(0xff07856d),
                                  side: const BorderSide(
                                    color: Color(0xff07856d),
                                  ),
                                  shape: RoundedRectangleBorder(
                                    borderRadius: BorderRadius.circular(14),
                                  ),
                                ),
                              ),
                            ),
                          ],
                        ],
                      ),
                    );
                  }),
                ],
              ),
            ),
    );
  }
}
