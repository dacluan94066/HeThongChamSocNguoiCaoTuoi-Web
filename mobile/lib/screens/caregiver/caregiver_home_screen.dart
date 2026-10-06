import 'package:flutter/material.dart';

import '../../services/api_client.dart';
import '../../services/alert_service.dart';
import '../../services/auth_service.dart';
import '../../services/caregiver_dashboard_service.dart';
import '../../widgets/alert_card.dart';
import '../notifications/notification_screen.dart';
import '../profile/profile_screen.dart';
import 'caregiver_elderly_detail_screen.dart';

class CaregiverHomeScreen extends StatefulWidget {
  const CaregiverHomeScreen({super.key});

  @override
  State<CaregiverHomeScreen> createState() => _CaregiverHomeScreenState();
}

class _CaregiverHomeScreenState extends State<CaregiverHomeScreen> {
  List<Map<String, dynamic>> _elderly = const [];
  List<Map<String, dynamic>> _notifications = const [];
  bool _loading = true;
  String? _error;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load({bool refresh = false}) async {
    if (!refresh) setState(() => _loading = true);
    try {
      final results = await Future.wait([
        CaregiverDashboardService.instance.getMyElderlyList(refresh: refresh),
        AlertService.instance.getNotifications(refresh: refresh),
      ]);
      if (!mounted) return;
      setState(() {
        _elderly = results[0];
        _notifications = results[1];
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
        _error = 'Không thể tải dữ liệu người chăm sóc. Vui lòng thử lại.';
        _loading = false;
      });
    }
  }

  Future<void> _logout() async {
    final accepted = await showDialog<bool>(
      context: context,
      builder: (context) => AlertDialog(
        title: const Text('Đăng xuất'),
        content: const Text('Bạn có chắc muốn đăng xuất khỏi tài khoản?'),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(context, false),
            child: const Text('Hủy'),
          ),
          FilledButton(
            onPressed: () => Navigator.pop(context, true),
            style: FilledButton.styleFrom(backgroundColor: Colors.red),
            child: const Text('Đăng xuất'),
          ),
        ],
      ),
    );
    if (accepted != true) return;
    await AuthService.instance.logout();
    if (!mounted) return;
    Navigator.pushNamedAndRemoveUntil(context, '/login', (route) => false);
  }

  Future<void> _openElderly(Map<String, dynamic> person) async {
    await Navigator.push(
      context,
      MaterialPageRoute(
        builder: (_) => CaregiverElderlyDetailScreen(elderly: person),
      ),
    );
    if (mounted) await _load(refresh: true);
  }

  bool _truthy(dynamic value) => value == true || value == 1 || value == '1';

  @override
  Widget build(BuildContext context) {
    final emergencies = _elderly
        .where((person) => _truthy(person['coCanhBaoKhanCap']))
        .toList();
    final unread = _notifications
        .where((item) => !_truthy(item['daDoc']))
        .length;
    final emergencyStyle = AlertVisuals.styleForSeverity('KhanCap');

    return Scaffold(
      backgroundColor: const Color(0xfff4f6f5),
      appBar: AppBar(
        title: const Text(
          'Người tôi chăm sóc',
          style: TextStyle(fontWeight: FontWeight.bold),
        ),
        actions: [
          IconButton(
            tooltip: 'Hồ sơ cá nhân',
            onPressed: () => Navigator.push(
              context,
              MaterialPageRoute(
                builder: (_) => const ProfileScreen(accountOnly: true),
              ),
            ),
            icon: const Icon(Icons.account_circle_outlined),
          ),
          IconButton(
            tooltip: 'Đăng xuất',
            onPressed: _logout,
            icon: const Icon(Icons.logout_rounded),
          ),
        ],
      ),
      body: _loading
          ? const Center(child: CircularProgressIndicator())
          : _error != null
          ? _ErrorView(message: _error!, onRetry: _load)
          : RefreshIndicator(
              onRefresh: () => _load(refresh: true),
              child: ListView(
                padding: const EdgeInsets.fromLTRB(16, 12, 16, 30),
                children: [
                  for (final emergency in emergencies)
                    Padding(
                      padding: const EdgeInsets.only(bottom: 10),
                      child: Material(
                        color: emergencyStyle.background,
                        borderRadius: BorderRadius.circular(18),
                        child: InkWell(
                          borderRadius: BorderRadius.circular(18),
                          onTap: () => _openElderly(emergency),
                          child: Padding(
                            padding: const EdgeInsets.all(15),
                            child: Row(
                              children: [
                                Icon(
                                  emergencyStyle.icon,
                                  color: emergencyStyle.color,
                                  size: 30,
                                ),
                                const SizedBox(width: 12),
                                Expanded(
                                  child: Text(
                                    '${emergency['hoTen'] ?? 'Người cao tuổi'} vừa gửi cảnh báo khẩn cấp - Bấm để xem',
                                    style: TextStyle(
                                      color: emergencyStyle.color,
                                      fontWeight: FontWeight.bold,
                                    ),
                                  ),
                                ),
                                Icon(
                                  Icons.chevron_right_rounded,
                                  color: emergencyStyle.color,
                                ),
                              ],
                            ),
                          ),
                        ),
                      ),
                    ),
                  Material(
                    color: Colors.white,
                    borderRadius: BorderRadius.circular(20),
                    child: InkWell(
                      borderRadius: BorderRadius.circular(20),
                      onTap: () async {
                        await Navigator.push(
                          context,
                          MaterialPageRoute(
                            builder: (_) => const NotificationScreen(),
                          ),
                        );
                        await _load(refresh: true);
                      },
                      child: Padding(
                        padding: const EdgeInsets.all(16),
                        child: Row(
                          children: [
                            Badge(
                              isLabelVisible: unread > 0,
                              label: Text(unread > 99 ? '99+' : '$unread'),
                              child: const CircleAvatar(
                                backgroundColor: Color(0xffe6f7f2),
                                child: Icon(
                                  Icons.notifications_outlined,
                                  color: Color(0xff07856d),
                                ),
                              ),
                            ),
                            const SizedBox(width: 14),
                            const Expanded(
                              child: Column(
                                crossAxisAlignment: CrossAxisAlignment.start,
                                children: [
                                  Text(
                                    'Thông báo',
                                    style: TextStyle(
                                      fontWeight: FontWeight.bold,
                                      fontSize: 16,
                                    ),
                                  ),
                                  Text('Xem cảnh báo và cập nhật mới nhất'),
                                ],
                              ),
                            ),
                            const Icon(Icons.chevron_right_rounded),
                          ],
                        ),
                      ),
                    ),
                  ),
                  const SizedBox(height: 22),
                  Text(
                    '${_elderly.length} người cao tuổi đang phụ trách',
                    style: const TextStyle(
                      fontSize: 18,
                      fontWeight: FontWeight.bold,
                    ),
                  ),
                  const SizedBox(height: 12),
                  if (_elderly.isEmpty)
                    const _EmptyView()
                  else
                    for (final person in _elderly)
                      _ElderlyCard(
                        person: person,
                        hasEmergency: _truthy(person['coCanhBaoKhanCap']),
                        onTap: () => _openElderly(person),
                      ),
                ],
              ),
            ),
    );
  }
}

class _ElderlyCard extends StatelessWidget {
  const _ElderlyCard({
    required this.person,
    required this.hasEmergency,
    required this.onTap,
  });

  final Map<String, dynamic> person;
  final bool hasEmergency;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final active = person['trangThai']?.toString() == 'DangTheoDoi';
    return Card(
      elevation: 0,
      margin: const EdgeInsets.only(bottom: 10),
      color: Colors.white,
      child: InkWell(
        borderRadius: BorderRadius.circular(16),
        onTap: onTap,
        child: Padding(
          padding: const EdgeInsets.all(16),
          child: Row(
            children: [
              CircleAvatar(
                radius: 27,
                backgroundColor: hasEmergency
                    ? const Color(0xffffe5e5)
                    : const Color(0xffe6f7f2),
                child: Icon(
                  hasEmergency ? Icons.sos_rounded : Icons.elderly_rounded,
                  color: hasEmergency ? Colors.red : const Color(0xff07856d),
                ),
              ),
              const SizedBox(width: 14),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      person['hoTen']?.toString() ?? 'Chưa có tên',
                      style: const TextStyle(
                        fontSize: 16,
                        fontWeight: FontWeight.bold,
                      ),
                    ),
                    const SizedBox(height: 4),
                    Text(
                      '${person['tuoi'] ?? '--'} tuổi • ${active ? 'Đang theo dõi' : 'Ngừng theo dõi'}',
                      style: TextStyle(
                        color: active ? const Color(0xff07856d) : Colors.grey,
                      ),
                    ),
                  ],
                ),
              ),
              const Icon(Icons.chevron_right_rounded),
            ],
          ),
        ),
      ),
    );
  }
}

class _EmptyView extends StatelessWidget {
  const _EmptyView();

  @override
  Widget build(BuildContext context) => const Padding(
    padding: EdgeInsets.symmetric(vertical: 60),
    child: Column(
      children: [
        Icon(Icons.people_outline_rounded, size: 64, color: Colors.grey),
        SizedBox(height: 12),
        Padding(
          padding: EdgeInsets.symmetric(horizontal: 24),
          child: Text(
            'Bạn chưa được phân công chăm sóc người cao tuổi nào, vui lòng liên hệ quản trị viên',
            textAlign: TextAlign.center,
          ),
        ),
      ],
    ),
  );
}

class _ErrorView extends StatelessWidget {
  const _ErrorView({required this.message, required this.onRetry});

  final String message;
  final Future<void> Function({bool refresh}) onRetry;

  @override
  Widget build(BuildContext context) => Center(
    child: Padding(
      padding: const EdgeInsets.all(30),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          const Icon(Icons.cloud_off_rounded, size: 56, color: Colors.grey),
          const SizedBox(height: 12),
          Text(message, textAlign: TextAlign.center),
          const SizedBox(height: 16),
          FilledButton(
            onPressed: () => onRetry(),
            child: const Text('Thử lại'),
          ),
        ],
      ),
    ),
  );
}
