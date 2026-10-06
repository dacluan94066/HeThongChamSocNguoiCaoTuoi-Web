import 'package:flutter/material.dart';

import '../../services/auth_service.dart';
import '../../services/api_client.dart';
import '../../services/elderly_service.dart';
import '../alerts/alert_history_screen.dart';
import '../caregiver/caregiver_screen.dart';
import 'change_password_screen.dart';
import 'edit_profile_screen.dart';

class ProfileScreen extends StatefulWidget {
  const ProfileScreen({super.key, this.accountOnly = false});

  final bool accountOnly;

  @override
  State<ProfileScreen> createState() => _ProfileScreenState();
}

class _ProfileScreenState extends State<ProfileScreen> {
  Map<String, dynamic> profile = {};

  bool loading = true;
  String? loadError;

  @override
  void initState() {
    super.initState();
    loadProfile();
  }

  Future<void> loadProfile() async {
    setState(() {
      loading = true;
      loadError = null;
    });
    try {
      final data = widget.accountOnly
          ? await AuthService.instance.getMe()
          : await ElderlyService.instance.getMyProfile();
      if (!mounted) return;
      setState(() {
        profile = data;
        loading = false;
      });
    } on ApiException catch (error) {
      if (!mounted) return;
      setState(() {
        loadError = error.message;
        loading = false;
      });
    } catch (_) {
      if (!mounted) return;
      setState(() {
        loadError = 'Không thể tải hồ sơ. Vui lòng thử lại.';
        loading = false;
      });
    }
  }

  Future<void> openEditProfile() async {
    final changed = await Navigator.push(
      context,
      MaterialPageRoute(
        builder: (_) => EditProfileScreen(accountOnly: widget.accountOnly),
      ),
    );

    if (changed == true) {
      await loadProfile();
      if (mounted && loadError == null) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text('Đã cập nhật hồ sơ thành công.')),
        );
      }
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

    if (loadError != null) {
      return Scaffold(
        appBar: AppBar(title: const Text('Hồ sơ cá nhân')),
        body: Center(
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              Text(loadError!, textAlign: TextAlign.center),
              const SizedBox(height: 16),
              ElevatedButton(
                onPressed: loadProfile,
                child: const Text('Thử lại'),
              ),
            ],
          ),
        ),
      );
    }

    if (widget.accountOnly) return _buildAccountProfile();

    final name = ElderlyService.text(profile, 'hoTen');
    final birthDate = ElderlyService.displayBirthDate(profile);
    final gender = ElderlyService.text(profile, 'gioiTinh');
    final phone = ElderlyService.text(profile, 'soDienThoai');
    final address = ElderlyService.text(profile, 'diaChi');
    final bloodType = ElderlyService.text(profile, 'nhomMau');
    final benhNen = ElderlyService.text(profile, 'benhNen');
    final diUng = ElderlyService.text(profile, 'diUng');
    final caregiver = ElderlyService.text(profile, 'nguoiChamSocTen');
    final age = ElderlyService.displayAge(profile);

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
                    '$age • $gender',
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
                    icon: Icons.medical_information_outlined,
                    title: 'Bệnh nền',
                    value: benhNen,
                  ),

                  const Divider(height: 24),

                  ProfileItem(
                    icon: Icons.healing_outlined,
                    title: 'Dị ứng',
                    value: diUng,
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
                child: Row(
                  children: [
                    const CircleAvatar(
                      radius: 28,
                      backgroundColor: Color(0xffe9efff),
                      child: Icon(
                        Icons.support_agent_rounded,
                        color: Color(0xff4b6edb),
                        size: 30,
                      ),
                    ),

                    const SizedBox(width: 12),

                    Expanded(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text(
                            caregiver,
                            style: const TextStyle(
                              fontSize: 15,
                              fontWeight: FontWeight.bold,
                            ),
                          ),
                        ],
                      ),
                    ),

                    const Icon(
                      Icons.chevron_right_rounded,
                      color: Colors.black38,
                    ),
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
                            onPressed: () async {
                              await AuthService.instance.logout();

                              if (!context.mounted) return;

                              Navigator.of(context).pushNamedAndRemoveUntil(
                                '/login',
                                (route) => false,
                              );
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

  Widget _buildAccountProfile() {
    final name = profile['hoTen']?.toString() ?? 'Chưa cập nhật';
    final username = profile['tenDangNhap']?.toString() ?? 'Chưa cập nhật';
    final email = profile['email']?.toString().trim();
    final phone = profile['soDienThoai']?.toString().trim();
    return Scaffold(
      backgroundColor: const Color(0xfff3f3f1),
      appBar: AppBar(
        title: const Text(
          'Hồ sơ cá nhân',
          style: TextStyle(fontWeight: FontWeight.bold),
        ),
      ),
      body: ListView(
        padding: const EdgeInsets.all(18),
        children: [
          Container(
            padding: const EdgeInsets.all(22),
            decoration: BoxDecoration(
              gradient: const LinearGradient(
                colors: [Color(0xffe7fff5), Color(0xffffffe8)],
              ),
              borderRadius: BorderRadius.circular(24),
            ),
            child: Column(
              children: [
                const CircleAvatar(
                  radius: 45,
                  backgroundColor: Colors.white,
                  child: Icon(
                    Icons.support_agent_rounded,
                    size: 48,
                    color: Color(0xff07856d),
                  ),
                ),
                const SizedBox(height: 12),
                Text(
                  name,
                  textAlign: TextAlign.center,
                  style: const TextStyle(
                    fontSize: 21,
                    fontWeight: FontWeight.bold,
                  ),
                ),
                const Text('Người chăm sóc'),
              ],
            ),
          ),
          const SizedBox(height: 16),
          Card(
            elevation: 0,
            child: Padding(
              padding: const EdgeInsets.all(16),
              child: Column(
                children: [
                  ProfileItem(
                    icon: Icons.account_circle_outlined,
                    title: 'Tên đăng nhập',
                    value: username,
                  ),
                  const Divider(height: 24),
                  ProfileItem(
                    icon: Icons.email_outlined,
                    title: 'Email',
                    value: email?.isNotEmpty == true ? email! : 'Chưa cập nhật',
                  ),
                  const Divider(height: 24),
                  ProfileItem(
                    icon: Icons.phone_outlined,
                    title: 'Số điện thoại',
                    value: phone?.isNotEmpty == true ? phone! : 'Chưa cập nhật',
                  ),
                ],
              ),
            ),
          ),
          const SizedBox(height: 14),
          Card(
            elevation: 0,
            child: Column(
              children: [
                MenuItem(
                  icon: Icons.edit_outlined,
                  iconColor: const Color(0xff07856d),
                  iconBackground: const Color(0xffe9f8ef),
                  title: 'Chỉnh sửa hồ sơ',
                  subtitle: 'Cập nhật thông tin tài khoản',
                  onTap: openEditProfile,
                ),
                const Divider(height: 1, indent: 72),
                MenuItem(
                  icon: Icons.lock_outline_rounded,
                  iconColor: const Color(0xff4b6edb),
                  iconBackground: const Color(0xffe9efff),
                  title: 'Đổi mật khẩu',
                  subtitle: 'Thay đổi mật khẩu đăng nhập',
                  onTap: () => Navigator.push(
                    context,
                    MaterialPageRoute(
                      builder: (_) => const ChangePasswordScreen(),
                    ),
                  ),
                ),
              ],
            ),
          ),
          const SizedBox(height: 20),
          OutlinedButton.icon(
            style: OutlinedButton.styleFrom(
              foregroundColor: Colors.red,
              side: const BorderSide(color: Colors.red),
              minimumSize: const Size.fromHeight(52),
            ),
            onPressed: () async {
              await AuthService.instance.logout();
              if (!mounted) return;
              Navigator.pushNamedAndRemoveUntil(
                context,
                '/login',
                (route) => false,
              );
            },
            icon: const Icon(Icons.logout_rounded),
            label: const Text('ĐĂNG XUẤT'),
          ),
        ],
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
