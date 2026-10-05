import 'package:flutter/material.dart';

import '../../services/api_client.dart';
import '../../services/caregiver_service.dart';
import '../../services/emergency_alert_service.dart';
import '../../services/alert_service.dart';

class CaregiverScreen extends StatefulWidget {
  const CaregiverScreen({super.key});

  @override
  State<CaregiverScreen> createState() => _CaregiverScreenState();
}

class _CaregiverScreenState extends State<CaregiverScreen> {
  List<Map<String, dynamic>> caregivers = [];
  List<Map<String, dynamic>> emergencyContacts = [];

  bool loading = true;
  bool sendingSOS = false;
  String? error;

  String latestAlertTime = 'Chưa có';

  @override
  void initState() {
    super.initState();
    loadData();
  }

  Future<void> loadData() async {
    if (mounted) {
      setState(() {
        loading = true;
        error = null;
      });
    }

    try {
      final results = await Future.wait([
        CaregiverService.instance.getCaregivers(),
        CaregiverService.instance.getEmergencyContacts(),
        AlertService.instance.getAlerts(),
      ]);

      if (!mounted) return;

      final alertList = results[2];

      setState(() {
        caregivers = results[0];
        emergencyContacts = results[1];
        if (alertList.isNotEmpty) {
          latestAlertTime = formatDateTime(alertList.first['thoiGianPhatHien']);
        } else {
          latestAlertTime = 'Chưa có';
        }

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
        error = 'Không thể tải thông tin người chăm sóc.';
        loading = false;
      });
    }
  }

  Future<void> sendEmergencyAlert() async {
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (dialogContext) {
        return AlertDialog(
          title: const Row(
            children: [
              Icon(Icons.warning_amber_rounded, color: Colors.red),
              SizedBox(width: 10),
              Text('Xác nhận SOS'),
            ],
          ),
          content: const Text('Bạn có chắc muốn gửi cảnh báo khẩn cấp không?'),
          actions: [
            TextButton(
              onPressed: () => Navigator.pop(dialogContext, false),
              child: const Text('Hủy'),
            ),
            ElevatedButton(
              onPressed: () => Navigator.pop(dialogContext, true),
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

    if (confirmed != true) return;

    setState(() {
      sendingSOS = true;
    });

    try {
      await EmergencyAlertService.instance.sendSOS(
        noiDung: 'Người cao tuổi yêu cầu trợ giúp khẩn cấp.',
      );

      if (!mounted) return;

      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Đã gửi cảnh báo SOS đến hệ thống.')),
      );

      await loadData();
    } on ApiException catch (e) {
      if (!mounted) return;

      ScaffoldMessenger.of(
        context,
      ).showSnackBar(SnackBar(content: Text(e.message)));
    } finally {
      if (mounted) {
        setState(() {
          sendingSOS = false;
        });
      }
    }
  }

  String formatDateTime(Object? raw) {
    final date = DateTime.tryParse(raw?.toString() ?? '')?.toLocal();

    if (date == null) return 'Chưa có';

    return '${date.day.toString().padLeft(2, '0')}/'
        '${date.month.toString().padLeft(2, '0')}/${date.year} '
        '${date.hour.toString().padLeft(2, '0')}:'
        '${date.minute.toString().padLeft(2, '0')}';
  }

  void showPhone(String name, String phone) {
    ScaffoldMessenger.of(
      context,
    ).showSnackBar(SnackBar(content: Text('$name - $phone')));
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: const Color(0xfff3f3f1),
      appBar: AppBar(
        backgroundColor: const Color(0xfff3f3f1),
        centerTitle: true,
        title: const Text(
          'Người chăm sóc',
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
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Text(error!),
            const SizedBox(height: 15),
            ElevatedButton(onPressed: loadData, child: const Text('Thử lại')),
          ],
        ),
      );
    }

    final mainCaregiver = caregivers.isNotEmpty ? caregivers.first : null;

    return RefreshIndicator(
      onRefresh: loadData,
      child: ListView(
        padding: const EdgeInsets.fromLTRB(18, 10, 18, 30),
        children: [
          if (mainCaregiver != null)
            Container(
              padding: const EdgeInsets.all(20),
              decoration: BoxDecoration(
                gradient: const LinearGradient(
                  colors: [Color(0xffe8fff5), Color(0xfffffce8)],
                ),
                borderRadius: BorderRadius.circular(28),
              ),
              child: Column(
                children: [
                  const CircleAvatar(
                    radius: 42,
                    backgroundColor: Colors.white,
                    child: Icon(
                      Icons.person_rounded,
                      size: 48,
                      color: Color(0xff07856d),
                    ),
                  ),
                  const SizedBox(height: 14),
                  Text(
                    mainCaregiver['hoTen']?.toString() ?? 'Người chăm sóc',
                    style: const TextStyle(
                      fontSize: 22,
                      fontWeight: FontWeight.bold,
                    ),
                  ),
                  const SizedBox(height: 4),
                  Text(
                    mainCaregiver['trinhDoChuyenMon']?.toString() ??
                        'Người chăm sóc',
                    style: const TextStyle(color: Colors.black54),
                  ),
                  const SizedBox(height: 8),
                  Text(
                    mainCaregiver['soDienThoai']?.toString() ?? '',
                    style: const TextStyle(fontWeight: FontWeight.w600),
                  ),
                ],
              ),
            )
          else
            const Center(child: Text('Chưa có người chăm sóc được phân công.')),

          const SizedBox(height: 28),

          const Text(
            'Liên hệ khẩn cấp',
            style: TextStyle(fontSize: 18, fontWeight: FontWeight.bold),
          ),

          const SizedBox(height: 12),

          if (emergencyContacts.isEmpty)
            const Text(
              'Chưa có liên hệ khẩn cấp.',
              style: TextStyle(color: Colors.black54),
            ),

          ...emergencyContacts.map((contact) {
            final name = contact['hoTen']?.toString() ?? '';
            final relation = contact['moiQuanHe']?.toString() ?? '';
            final phone = contact['soDienThoai']?.toString() ?? '';

            return Container(
              margin: const EdgeInsets.only(bottom: 12),
              padding: const EdgeInsets.all(14),
              decoration: BoxDecoration(
                color: Colors.white,
                borderRadius: BorderRadius.circular(22),
              ),
              child: Row(
                children: [
                  const CircleAvatar(
                    backgroundColor: Color(0xffeef7f4),
                    child: Icon(
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
                          name,
                          style: const TextStyle(fontWeight: FontWeight.bold),
                        ),
                        Text(
                          relation,
                          style: const TextStyle(color: Colors.black54),
                        ),
                        Text(phone),
                      ],
                    ),
                  ),
                  IconButton(
                    onPressed: () => showPhone(name, phone),
                    icon: const Icon(
                      Icons.phone_rounded,
                      color: Color(0xff07856d),
                    ),
                  ),
                ],
              ),
            );
          }),

          const SizedBox(height: 20),

          Container(
            padding: const EdgeInsets.all(18),
            decoration: BoxDecoration(
              color: const Color(0xffffeeee),
              borderRadius: BorderRadius.circular(24),
            ),
            child: Column(
              children: [
                const Text(
                  'Cần trợ giúp khẩn cấp?',
                  style: TextStyle(fontSize: 17, fontWeight: FontWeight.bold),
                ),
                const SizedBox(height: 12),
                SizedBox(
                  width: double.infinity,
                  height: 52,
                  child: ElevatedButton.icon(
                    onPressed: sendingSOS ? null : sendEmergencyAlert,
                    icon: sendingSOS
                        ? const SizedBox(
                            width: 20,
                            height: 20,
                            child: CircularProgressIndicator(
                              strokeWidth: 2,
                              color: Colors.white,
                            ),
                          )
                        : const Icon(Icons.sos_rounded),
                    label: Text(
                      sendingSOS ? 'ĐANG GỬI...' : 'GỬI CẢNH BÁO SOS',
                    ),
                    style: ElevatedButton.styleFrom(
                      backgroundColor: Colors.red,
                      foregroundColor: Colors.white,
                    ),
                  ),
                ),
              ],
            ),
          ),

          const SizedBox(height: 20),

          Text(
            'Cảnh báo gần nhất: $latestAlertTime',
            style: const TextStyle(color: Colors.black54),
          ),
        ],
      ),
    );
  }
}
