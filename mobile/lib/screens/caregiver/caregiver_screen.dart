import 'package:flutter/material.dart';

import '../../services/alert_storage.dart';

class CaregiverScreen extends StatefulWidget {
  const CaregiverScreen({super.key});

  @override
  State<CaregiverScreen> createState() => _CaregiverScreenState();
}

class _CaregiverScreenState extends State<CaregiverScreen> {
  final List<Map<String, String>> emergencyContacts = [
    {'name': 'Nguyễn Văn Bình', 'relation': 'Con trai', 'phone': '0909876543'},
    {'name': 'Nguyễn Thị Lan', 'relation': 'Con gái', 'phone': '0911222333'},
    {
      'name': 'Trần Minh Hoàng',
      'relation': 'Người chăm sóc',
      'phone': '0988777666',
    },
  ];

  String latestAlertTime = 'Chưa có';

  @override
  void initState() {
    super.initState();
    loadLatestAlert();
  }

  Future<void> loadLatestAlert() async {
    final alerts = await AlertStorage.loadAlerts();

    if (!mounted) {
      return;
    }

    setState(() {
      latestAlertTime = alerts.isEmpty
          ? 'Chưa có'
          : alerts.first['time'] ?? 'Chưa có';
    });
  }

  void showCallMessage(String name, String phone) {
    ScaffoldMessenger.of(
      context,
    ).showSnackBar(SnackBar(content: Text('Đang chuẩn bị gọi $name - $phone')));
  }

  Future<void> sendEmergencyAlert() async {
    showDialog(
      context: context,
      builder: (dialogContext) {
        return AlertDialog(
          shape: RoundedRectangleBorder(
            borderRadius: BorderRadius.circular(24),
          ),
          title: const Row(
            children: [
              Icon(Icons.warning_amber_rounded, color: Colors.red),
              SizedBox(width: 10),
              Text('Xác nhận SOS'),
            ],
          ),
          content: const Text(
            'Bạn có chắc muốn gửi cảnh báo khẩn cấp đến người chăm sóc không?',
            style: TextStyle(height: 1.4),
          ),
          actions: [
            TextButton(
              onPressed: () {
                Navigator.pop(dialogContext);
              },
              child: const Text('Hủy'),
            ),
            ElevatedButton(
              onPressed: () async {
                Navigator.pop(dialogContext);

                await AlertStorage.addEmergencyAlert();

                if (!mounted) {
                  return;
                }

                await loadLatestAlert();

                if (!mounted) {
                  return;
                }

                ScaffoldMessenger.of(context).showSnackBar(
                  const SnackBar(
                    content: Text('Đã gửi và lưu cảnh báo khẩn cấp.'),
                  ),
                );
              },
              style: ElevatedButton.styleFrom(
                backgroundColor: Colors.red,
                foregroundColor: Colors.white,
              ),
              child: const Text('GỬI SOS'),
            ),
          ],
        );
      },
    );
  }

  Widget infoRow({
    required IconData icon,
    required String label,
    required String value,
  }) {
    return Row(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Container(
          width: 42,
          height: 42,
          decoration: const BoxDecoration(
            color: Color(0xffeef7f4),
            shape: BoxShape.circle,
          ),
          child: Icon(icon, color: const Color(0xff07856d), size: 21),
        ),

        const SizedBox(width: 12),

        Expanded(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(
                label,
                style: const TextStyle(fontSize: 12, color: Colors.black54),
              ),

              const SizedBox(height: 3),

              Text(
                value,
                style: const TextStyle(
                  fontSize: 15,
                  fontWeight: FontWeight.w600,
                ),
              ),
            ],
          ),
        ),
      ],
    );
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
          'Người chăm sóc',
          style: TextStyle(fontWeight: FontWeight.bold),
        ),
      ),

      body: SingleChildScrollView(
        padding: const EdgeInsets.fromLTRB(18, 10, 18, 30),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Container(
              width: double.infinity,
              padding: const EdgeInsets.all(20),
              decoration: BoxDecoration(
                gradient: const LinearGradient(
                  colors: [Color(0xffe8fff5), Color(0xfffffce8)],
                  begin: Alignment.topLeft,
                  end: Alignment.bottomRight,
                ),
                borderRadius: BorderRadius.circular(28),
              ),
              child: const Column(
                children: [
                  CircleAvatar(
                    radius: 42,
                    backgroundColor: Colors.white,
                    child: Icon(
                      Icons.person_rounded,
                      size: 48,
                      color: Color(0xff07856d),
                    ),
                  ),

                  SizedBox(height: 14),

                  Text(
                    'Nguyễn Văn Bình',
                    style: TextStyle(fontSize: 22, fontWeight: FontWeight.bold),
                  ),

                  SizedBox(height: 4),

                  Text(
                    'Người chăm sóc chính',
                    style: TextStyle(fontSize: 14, color: Colors.black54),
                  ),
                ],
              ),
            ),

            const SizedBox(height: 22),

            Container(
              width: double.infinity,
              padding: const EdgeInsets.all(18),
              decoration: BoxDecoration(
                color: Colors.white,
                borderRadius: BorderRadius.circular(24),
              ),
              child: Column(
                children: [
                  infoRow(
                    icon: Icons.family_restroom_rounded,
                    label: 'Mối quan hệ',
                    value: 'Con trai',
                  ),

                  const SizedBox(height: 18),

                  infoRow(
                    icon: Icons.phone_outlined,
                    label: 'Số điện thoại',
                    value: '0909876543',
                  ),

                  const SizedBox(height: 18),

                  infoRow(
                    icon: Icons.location_on_outlined,
                    label: 'Địa chỉ',
                    value: 'TP. Hồ Chí Minh',
                  ),
                ],
              ),
            ),

            const SizedBox(height: 16),

            SizedBox(
              width: double.infinity,
              height: 54,
              child: ElevatedButton.icon(
                onPressed: () {
                  showCallMessage('Nguyễn Văn Bình', '0909876543');
                },
                icon: const Icon(Icons.phone_rounded),
                label: const Text(
                  'GỌI NGƯỜI CHĂM SÓC',
                  style: TextStyle(fontWeight: FontWeight.bold),
                ),
                style: ElevatedButton.styleFrom(
                  backgroundColor: const Color(0xff07856d),
                  foregroundColor: Colors.white,
                  elevation: 0,
                  shape: RoundedRectangleBorder(
                    borderRadius: BorderRadius.circular(18),
                  ),
                ),
              ),
            ),

            const SizedBox(height: 28),

            const Text(
              'Liên hệ khẩn cấp',
              style: TextStyle(fontSize: 18, fontWeight: FontWeight.bold),
            ),

            const SizedBox(height: 12),

            ...emergencyContacts.map((contact) {
              return Container(
                margin: const EdgeInsets.only(bottom: 12),
                padding: const EdgeInsets.all(14),
                decoration: BoxDecoration(
                  color: Colors.white,
                  borderRadius: BorderRadius.circular(22),
                ),
                child: Row(
                  children: [
                    Container(
                      width: 50,
                      height: 50,
                      decoration: const BoxDecoration(
                        color: Color(0xffeef7f4),
                        shape: BoxShape.circle,
                      ),
                      child: const Icon(
                        Icons.person_outline_rounded,
                        color: Color(0xff07856d),
                      ),
                    ),

                    const SizedBox(width: 12),

                    Expanded(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text(
                            contact['name']!,
                            style: const TextStyle(
                              fontSize: 15,
                              fontWeight: FontWeight.bold,
                            ),
                          ),

                          const SizedBox(height: 3),

                          Text(
                            contact['relation']!,
                            style: const TextStyle(
                              fontSize: 12,
                              color: Colors.black54,
                            ),
                          ),

                          const SizedBox(height: 3),

                          Text(
                            contact['phone']!,
                            style: const TextStyle(
                              fontSize: 12,
                              color: Colors.black54,
                            ),
                          ),
                        ],
                      ),
                    ),

                    IconButton(
                      onPressed: () {
                        showCallMessage(contact['name']!, contact['phone']!);
                      },
                      icon: const Icon(
                        Icons.phone_rounded,
                        color: Color(0xff07856d),
                      ),
                    ),
                  ],
                ),
              );
            }),

            const SizedBox(height: 18),

            Container(
              width: double.infinity,
              padding: const EdgeInsets.all(18),
              decoration: BoxDecoration(
                color: const Color(0xffffeeee),
                borderRadius: BorderRadius.circular(24),
              ),
              child: Column(
                children: [
                  const Row(
                    children: [
                      CircleAvatar(
                        radius: 26,
                        backgroundColor: Colors.white,
                        child: Icon(
                          Icons.sos_rounded,
                          color: Colors.red,
                          size: 30,
                        ),
                      ),

                      SizedBox(width: 12),

                      Expanded(
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Text(
                              'Cần trợ giúp khẩn cấp?',
                              style: TextStyle(
                                fontSize: 17,
                                fontWeight: FontWeight.bold,
                              ),
                            ),

                            SizedBox(height: 4),

                            Text(
                              'Gửi cảnh báo ngay đến người chăm sóc.',
                              style: TextStyle(
                                fontSize: 13,
                                color: Colors.black54,
                              ),
                            ),
                          ],
                        ),
                      ),
                    ],
                  ),

                  const SizedBox(height: 16),

                  SizedBox(
                    width: double.infinity,
                    height: 52,
                    child: ElevatedButton.icon(
                      onPressed: sendEmergencyAlert,
                      icon: const Icon(Icons.warning_rounded),
                      label: const Text(
                        'GỬI CẢNH BÁO SOS',
                        style: TextStyle(fontWeight: FontWeight.bold),
                      ),
                      style: ElevatedButton.styleFrom(
                        backgroundColor: Colors.red,
                        foregroundColor: Colors.white,
                        elevation: 0,
                        shape: RoundedRectangleBorder(
                          borderRadius: BorderRadius.circular(17),
                        ),
                      ),
                    ),
                  ),
                ],
              ),
            ),

            const SizedBox(height: 22),

            Container(
              width: double.infinity,
              padding: const EdgeInsets.all(16),
              decoration: BoxDecoration(
                color: Colors.white,
                borderRadius: BorderRadius.circular(22),
              ),
              child: Row(
                children: [
                  const CircleAvatar(
                    backgroundColor: Color(0xffe8f8ee),
                    child: Icon(
                      Icons.check_circle_outline_rounded,
                      color: Color(0xff07856d),
                    ),
                  ),

                  const SizedBox(width: 12),

                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        const Text(
                          'Cảnh báo gần nhất',
                          style: TextStyle(fontWeight: FontWeight.bold),
                        ),

                        const SizedBox(height: 4),

                        Text(
                          latestAlertTime,
                          style: const TextStyle(
                            fontSize: 12,
                            color: Colors.black54,
                          ),
                        ),
                      ],
                    ),
                  ),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }
}
