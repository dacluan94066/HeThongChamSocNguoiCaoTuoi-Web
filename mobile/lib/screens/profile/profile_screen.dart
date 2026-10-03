import 'package:flutter/material.dart';

import '../../services/profile_storage.dart';
import '../alerts/alert_history_screen.dart';
import '../caregiver/caregiver_screen.dart';
import 'change_password_screen.dart';
import 'edit_profile_screen.dart';

class ProfileScreen extends StatefulWidget {
  const ProfileScreen({super.key});

  @override
  State<ProfileScreen> createState() => _ProfileScreenState();
}

class _ProfileScreenState extends State<ProfileScreen> {
  Map<String, String> profile = {};

  bool loading = true;

  @override
  void initState() {
    super.initState();
    loadProfile();
  }

  Future<void> loadProfile() async {
    final data = await ProfileStorage.loadProfile();

    if (!mounted) {
      return;
    }

    setState(() {
      profile = data;
      loading = false;
    });
  }

  int calculateAge(String birthDate) {
    try {
      final parts = birthDate.split('/');

      if (parts.length != 3) {
        return 0;
      }

      final day = int.parse(parts[0]);
      final month = int.parse(parts[1]);
      final year = int.parse(parts[2]);

      final birth = DateTime(year, month, day);

      final now = DateTime.now();

      int age = now.year - birth.year;

      if (now.month < birth.month ||
          (now.month == birth.month && now.day < birth.day)) {
        age--;
      }

      return age;
    } catch (_) {
      return 0;
    }
  }

  Future<void> openEditProfile() async {
    final changed = await Navigator.push(
      context,
      MaterialPageRoute(builder: (_) => const EditProfileScreen()),
    );

    if (changed == true) {
      await loadProfile();
    }
  }

  @override
  Widget build(BuildContext context) {
    if (loading) {
      return const Scaffold(
        backgroundColor: Color(0xfff3f3f1),
        body: Center(
          child: CircularProgressIndicator(color: Color(0xff07856d)),
        ),
      );
    }

    final name = profile['name'] ?? 'Nguyễn Văn An';

    final birthDate = profile['birthDate'] ?? '10/06/1948';

    final gender = profile['gender'] ?? 'Nam';

    final phone = profile['phone'] ?? '0912345678';

    final address = profile['address'] ?? 'TP. Hồ Chí Minh';

    final bloodType = profile['bloodType'] ?? 'O+';

    final height = profile['height'] ?? '165';

    final weight = profile['weight'] ?? '60';

    final age = calculateAge(birthDate);

    return Scaffold(
      backgroundColor: const Color(0xfff3f3f1),
      appBar: AppBar(
        backgroundColor: const Color(0xfff3f3f1),
        elevation: 0,
        centerTitle: true,
        title: const Text(
          'Hồ sơ cá nhân',
          style: TextStyle(fontWeight: FontWeight.bold),
        ),
      ),
      body: SingleChildScrollView(
        padding: const EdgeInsets.fromLTRB(18, 10, 18, 30),
        child: Column(
          children: [
            Container(
              width: double.infinity,
              padding: const EdgeInsets.all(20),
              decoration: BoxDecoration(
                gradient: const LinearGradient(
                  colors: [Color(0xffe9fff6), Color(0xffffffe8)],
                  begin: Alignment.topLeft,
                  end: Alignment.bottomRight,
                ),
                borderRadius: BorderRadius.circular(28),
              ),
              child: Column(
                children: [
                  const CircleAvatar(
                    radius: 46,
                    backgroundColor: Colors.white,
                    child: Icon(
                      Icons.person_rounded,
                      size: 52,
                      color: Color(0xff07856d),
                    ),
                  ),

                  const SizedBox(height: 14),

                  Text(
                    name,
                    style: const TextStyle(
                      fontSize: 22,
                      fontWeight: FontWeight.bold,
                    ),
                  ),

                  const SizedBox(height: 5),

                  Text(
                    '$age tuổi • $gender',
                    style: const TextStyle(fontSize: 14, color: Colors.black54),
                  ),
                ],
              ),
            ),

            const SizedBox(height: 22),

            const Align(
              alignment: Alignment.centerLeft,
              child: Text(
                'Thông tin cá nhân',
                style: TextStyle(fontSize: 18, fontWeight: FontWeight.bold),
              ),
            ),

            const SizedBox(height: 12),

            Container(
              padding: const EdgeInsets.all(16),
              decoration: BoxDecoration(
                color: Colors.white,
                borderRadius: BorderRadius.circular(24),
              ),
              child: Column(
                children: [
                  ProfileItem(
                    icon: Icons.badge_outlined,
                    title: 'Họ và tên',
                    value: name,
                  ),

                  const Divider(height: 24),

                  ProfileItem(
                    icon: Icons.cake_outlined,
                    title: 'Ngày sinh',
                    value: birthDate,
                  ),

                  const Divider(height: 24),

                  ProfileItem(
                    icon: Icons.people_outline_rounded,
                    title: 'Giới tính',
                    value: gender,
                  ),

                  const Divider(height: 24),

                  ProfileItem(
                    icon: Icons.phone_outlined,
                    title: 'Số điện thoại',
                    value: phone,
                  ),

                  const Divider(height: 24),

                  ProfileItem(
                    icon: Icons.location_on_outlined,
                    title: 'Địa chỉ',
                    value: address,
                  ),
                ],
              ),
            ),

            const SizedBox(height: 22),

            const Align(
              alignment: Alignment.centerLeft,
              child: Text(
                'Thông tin sức khỏe',
                style: TextStyle(fontSize: 18, fontWeight: FontWeight.bold),
              ),
            ),

            const SizedBox(height: 12),

            Container(
              padding: const EdgeInsets.all(16),
              decoration: BoxDecoration(
                color: Colors.white,
                borderRadius: BorderRadius.circular(24),
              ),
              child: Column(
                children: [
                  ProfileItem(
                    icon: Icons.bloodtype_outlined,
                    title: 'Nhóm máu',
                    value: bloodType,
                  ),

                  const Divider(height: 24),

                  ProfileItem(
                    icon: Icons.height_rounded,
                    title: 'Chiều cao',
                    value: '$height cm',
                  ),

                  const Divider(height: 24),

                  ProfileItem(
                    icon: Icons.monitor_weight_outlined,
                    title: 'Cân nặng',
                    value: '$weight kg',
                  ),
                ],
              ),
            ),

            const SizedBox(height: 22),

            const Align(
              alignment: Alignment.centerLeft,
              child: Text(
                'Người chăm sóc',
                style: TextStyle(fontSize: 18, fontWeight: FontWeight.bold),
              ),
            ),

            const SizedBox(height: 12),

            InkWell(
              onTap: () {
                Navigator.push(
                  context,
                  MaterialPageRoute(builder: (_) => const CaregiverScreen()),
                );
              },
              borderRadius: BorderRadius.circular(24),
              child: Container(
                padding: const EdgeInsets.all(16),
                decoration: BoxDecoration(
                  color: Colors.white,
                  borderRadius: BorderRadius.circular(24),
                ),
                child: const Row(
                  children: [
                    CircleAvatar(
                      radius: 28,
                      backgroundColor: Color(0xffe9efff),
                      child: Icon(
                        Icons.support_agent_rounded,
                        color: Color(0xff4b6edb),
                        size: 30,
                      ),
                    ),

                    SizedBox(width: 12),

                    Expanded(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text(
                            'Nguyễn Văn Bình',
                            style: TextStyle(
                              fontSize: 15,
                              fontWeight: FontWeight.bold,
                            ),
                          ),
                          SizedBox(height: 4),
                          Text(
                            'Con trai',
                            style: TextStyle(
                              fontSize: 13,
                              color: Colors.black54,
                            ),
                          ),
                          SizedBox(height: 4),
                          Text(
                            '0909876543',
                            style: TextStyle(
                              fontSize: 13,
                              color: Colors.black54,
                            ),
                          ),
                        ],
                      ),
                    ),

                    Icon(Icons.chevron_right_rounded, color: Colors.black38),
                  ],
                ),
              ),
            ),

            const SizedBox(height: 22),

            const Align(
              alignment: Alignment.centerLeft,
              child: Text(
                'Tiện ích',
                style: TextStyle(fontSize: 18, fontWeight: FontWeight.bold),
              ),
            ),

            const SizedBox(height: 12),

            Container(
              decoration: BoxDecoration(
                color: Colors.white,
                borderRadius: BorderRadius.circular(24),
              ),
              child: Column(
                children: [
                  MenuItem(
                    icon: Icons.support_agent_rounded,
                    iconColor: const Color(0xff4b6edb),
                    iconBackground: const Color(0xffe9efff),
                    title: 'Người chăm sóc',
                    subtitle: 'Liên hệ và gửi cảnh báo SOS',
                    onTap: () {
                      Navigator.push(
                        context,
                        MaterialPageRoute(
                          builder: (_) => const CaregiverScreen(),
                        ),
                      );
                    },
                  ),

                  const Divider(height: 1, indent: 72),

                  MenuItem(
                    icon: Icons.history_rounded,
                    iconColor: const Color(0xffd84444),
                    iconBackground: const Color(0xffffe9e9),
                    title: 'Lịch sử cảnh báo',
                    subtitle: 'Xem các cảnh báo đã gửi và xử lý',
                    onTap: () {
                      Navigator.push(
                        context,
                        MaterialPageRoute(
                          builder: (_) => const AlertHistoryScreen(),
                        ),
                      );
                    },
                  ),

                  const Divider(height: 1, indent: 72),

                  MenuItem(
                    icon: Icons.edit_outlined,
                    iconColor: const Color(0xff07856d),
                    iconBackground: const Color(0xffe9f8ef),
                    title: 'Chỉnh sửa hồ sơ',
                    subtitle: 'Cập nhật thông tin cá nhân',
                    onTap: openEditProfile,
                  ),

                  const Divider(height: 1, indent: 72),

                  MenuItem(
                    icon: Icons.lock_outline_rounded,
                    iconColor: const Color(0xff4b6edb),
                    iconBackground: const Color(0xffe9efff),
                    title: 'Đổi mật khẩu',
                    subtitle: 'Thay đổi mật khẩu đăng nhập',
                    onTap: () {
                      Navigator.push(
                        context,
                        MaterialPageRoute(
                          builder: (_) => const ChangePasswordScreen(),
                        ),
                      );
                    },
                  ),
                ],
              ),
            ),

            const SizedBox(height: 24),

            SizedBox(
              width: double.infinity,
              height: 54,
              child: OutlinedButton.icon(
                onPressed: () {
                  showDialog(
                    context: context,
                    builder: (dialogContext) {
                      return AlertDialog(
                        shape: RoundedRectangleBorder(
                          borderRadius: BorderRadius.circular(22),
                        ),
                        title: const Text(
                          'Đăng xuất',
                          style: TextStyle(fontWeight: FontWeight.bold),
                        ),
                        content: const Text(
                          'Bạn có chắc muốn đăng xuất khỏi tài khoản?',
                        ),
                        actions: [
                          TextButton(
                            onPressed: () {
                              Navigator.pop(dialogContext);
                            },
                            child: const Text('Hủy'),
                          ),
                          ElevatedButton(
                            onPressed: () {
                              Navigator.pop(dialogContext);

                              Navigator.of(
                                context,
                              ).popUntil((route) => route.isFirst);
                            },
                            style: ElevatedButton.styleFrom(
                              backgroundColor: const Color(0xffd84444),
                              foregroundColor: Colors.white,
                            ),
                            child: const Text('ĐĂNG XUẤT'),
                          ),
                        ],
                      );
                    },
                  );
                },
                icon: const Icon(Icons.logout_rounded),
                label: const Text(
                  'ĐĂNG XUẤT',
                  style: TextStyle(fontWeight: FontWeight.bold),
                ),
                style: OutlinedButton.styleFrom(
                  foregroundColor: const Color(0xffd84444),
                  side: const BorderSide(color: Color(0xffd84444)),
                  shape: RoundedRectangleBorder(
                    borderRadius: BorderRadius.circular(18),
                  ),
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class ProfileItem extends StatelessWidget {
  final IconData icon;
  final String title;
  final String value;

  const ProfileItem({
    super.key,
    required this.icon,
    required this.title,
    required this.value,
  });

  @override
  Widget build(BuildContext context) {
    return Row(
      children: [
        Container(
          width: 42,
          height: 42,
          decoration: const BoxDecoration(
            color: Color(0xffeef7f4),
            shape: BoxShape.circle,
          ),
          child: Icon(icon, size: 22, color: const Color(0xff07856d)),
        ),

        const SizedBox(width: 12),

        Expanded(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(
                title,
                style: const TextStyle(fontSize: 12, color: Colors.black54),
              ),
              const SizedBox(height: 3),
              Text(
                value,
                style: const TextStyle(
                  fontSize: 14,
                  fontWeight: FontWeight.w600,
                ),
              ),
            ],
          ),
        ),
      ],
    );
  }
}

class MenuItem extends StatelessWidget {
  final IconData icon;
  final Color iconColor;
  final Color iconBackground;
  final String title;
  final String subtitle;
  final VoidCallback onTap;

  const MenuItem({
    super.key,
    required this.icon,
    required this.iconColor,
    required this.iconBackground,
    required this.title,
    required this.subtitle,
    required this.onTap,
  });

  @override
  Widget build(BuildContext context) {
    return InkWell(
      onTap: onTap,
      borderRadius: BorderRadius.circular(20),
      child: Padding(
        padding: const EdgeInsets.all(14),
        child: Row(
          children: [
            Container(
              width: 46,
              height: 46,
              decoration: BoxDecoration(
                color: iconBackground,
                borderRadius: BorderRadius.circular(15),
              ),
              child: Icon(icon, color: iconColor, size: 24),
            ),

            const SizedBox(width: 12),

            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    title,
                    style: const TextStyle(
                      fontSize: 14,
                      fontWeight: FontWeight.bold,
                    ),
                  ),
                  const SizedBox(height: 3),
                  Text(
                    subtitle,
                    style: const TextStyle(fontSize: 12, color: Colors.black54),
                  ),
                ],
              ),
            ),

            const Icon(Icons.chevron_right_rounded, color: Colors.black38),
          ],
        ),
      ),
    );
  }
}
