import 'package:flutter/material.dart';
import '../../theme/care_senior_theme.dart';
import '../../widgets/care_senior_ui.dart';

import '../../services/auth_service.dart';
import '../../services/api_client.dart';
import '../../services/elderly_service.dart';
import '../alerts/alert_history_screen.dart';
import 'change_password_screen.dart';
import 'edit_profile_screen.dart';
import 'profile_dashboard_ui.dart';

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
    if (loading) return const ProfileStatePage(loading: true);
    if (loadError != null) {
      return ProfileStatePage(message: loadError!, onRetry: loadProfile);
    }
    if (widget.accountOnly) return _buildAccountProfile();

    final name = ElderlyService.text(profile, 'hoTen');
    final birthDate = ElderlyService.displayBirthDate(profile);
    final gender = ElderlyService.text(profile, 'gioiTinh');
    final phone = ElderlyService.text(profile, 'soDienThoai');
    final email = ElderlyService.text(profile, 'email');
    final address = ElderlyService.text(profile, 'diaChi');
    final bloodType = ElderlyService.text(profile, 'nhomMau');
    final benhNen = ElderlyService.text(profile, 'benhNen');
    final diUng = ElderlyService.text(profile, 'diUng');
    final caregiver = ElderlyService.text(profile, 'nguoiChamSocTen');
    final age = ElderlyService.displayAge(profile);

    return Scaffold(
      backgroundColor: CareSeniorColors.background,
      body: SafeArea(
        bottom: false,
        child: ListView(
          key: const ValueKey('profile-list'),
          padding: const EdgeInsets.only(bottom: 32),
          children: [
            ProfileIdentityHeader(
              name: name,
              role: 'Người cao tuổi',
              subtitle: '$age • $gender',
            ),
            Padding(
              padding: const EdgeInsets.fromLTRB(20, 20, 20, 0),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  if (profile.isEmpty)
                    const AppEmptyState(
                      icon: Icons.person_outline,
                      title: 'Chưa có dữ liệu hồ sơ',
                      message:
                          'Các thông tin chưa có sẽ hiển thị là chưa cập nhật.',
                    ),
                  const _SectionTitle('Thông tin cá nhân'),
                  AppCard(
                    child: Column(
                      children: [
                        ProfileItem(
                          icon: Icons.badge_outlined,
                          title: 'Họ và tên',
                          value: name,
                        ),
                        const Divider(height: 28),
                        ProfileItem(
                          icon: Icons.cake_outlined,
                          title: 'Ngày sinh',
                          value: birthDate,
                        ),
                        const Divider(height: 28),
                        ProfileItem(
                          icon: Icons.people_outline_rounded,
                          title: 'Giới tính',
                          value: gender,
                        ),
                        const Divider(height: 28),
                        ProfileItem(
                          icon: Icons.phone_outlined,
                          title: 'Số điện thoại',
                          value: phone,
                        ),
                        const Divider(height: 28),
                        ProfileItem(
                          icon: Icons.email_outlined,
                          title: 'Email',
                          value: email,
                        ),
                        const Divider(height: 28),
                        ProfileItem(
                          icon: Icons.location_on_outlined,
                          title: 'Địa chỉ',
                          value: address,
                        ),
                      ],
                    ),
                  ),
                  const SizedBox(height: 16),
                  FilledButton(
                    onPressed: openEditProfile,
                    style: FilledButton.styleFrom(
                      backgroundColor: const Color(0xff21966f),
                    ),
                    child: const ProfileButtonLabel(
                      label: 'Chỉnh sửa hồ sơ',
                      icon: Icons.edit_outlined,
                    ),
                  ),
                  const SizedBox(height: 24),
                  const _SectionTitle('Thông tin sức khỏe'),
                  AppCard(
                    child: Column(
                      children: [
                        ProfileItem(
                          icon: Icons.bloodtype_outlined,
                          title: 'Nhóm máu',
                          value: bloodType,
                        ),
                        const Divider(height: 28),
                        ProfileItem(
                          icon: Icons.medical_information_outlined,
                          title: 'Bệnh nền',
                          value: benhNen,
                        ),
                        const Divider(height: 28),
                        ProfileItem(
                          icon: Icons.healing_outlined,
                          title: 'Dị ứng',
                          value: diUng,
                        ),
                      ],
                    ),
                  ),
                  const SizedBox(height: 24),
                  const _SectionTitle('Người chăm sóc'),
                  AppCard(
                    child: ProfileItem(
                      icon: Icons.support_agent_rounded,
                      title: 'Người chăm sóc',
                      value: caregiver,
                    ),
                  ),
                  const SizedBox(height: 24),
                  const _SectionTitle('Tiện ích'),
                  AppCard(
                    padding: EdgeInsets.zero,
                    child: Column(
                      children: [
                        MenuItem(
                          icon: Icons.history_rounded,
                          iconColor: CareSeniorColors.danger,
                          iconBackground: CareSeniorColors.dangerSurface,
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
                        const Divider(height: 1, indent: 20, endIndent: 20),
                        MenuItem(
                          icon: Icons.lock_outline_rounded,
                          iconColor: CareSeniorColors.deepGreen,
                          iconBackground: CareSeniorColors.mint,
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
                  OutlinedButton(
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
                                  backgroundColor: CareSeniorColors.danger,
                                  foregroundColor: Colors.white,
                                ),
                                child: const Text('ĐĂNG XUẤT'),
                              ),
                            ],
                          );
                        },
                      );
                    },
                    style: OutlinedButton.styleFrom(
                      foregroundColor: CareSeniorColors.danger,
                      side: const BorderSide(color: CareSeniorColors.danger),
                      minimumSize: const Size.fromHeight(56),
                    ),
                    child: const ProfileButtonLabel(
                      icon: Icons.logout_rounded,
                      label: 'ĐĂNG XUẤT',
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

  Widget _buildAccountProfile() {
    final name = profile['hoTen']?.toString() ?? 'Chưa cập nhật';
    final username = profile['tenDangNhap']?.toString() ?? 'Chưa cập nhật';
    final email = profile['email']?.toString().trim();
    final phone = profile['soDienThoai']?.toString().trim();
    final role = switch (profile['tenVaiTro']?.toString()) {
      'Admin' => 'Quản trị viên',
      'NguoiChamSoc' => 'Người chăm sóc',
      'NguoiCaoTuoi' => 'Người cao tuổi',
      _ => 'Tài khoản',
    };
    return Scaffold(
      backgroundColor: CareSeniorColors.background,
      body: SafeArea(
        bottom: false,
        child: ListView(
          key: const ValueKey('profile-list'),
          padding: const EdgeInsets.only(bottom: 32),
          children: [
            ProfileIdentityHeader(name: name, role: role),
            Padding(
              padding: const EdgeInsets.fromLTRB(20, 20, 20, 0),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  if (profile.isEmpty)
                    const AppEmptyState(
                      icon: Icons.person_outline,
                      title: 'Chưa có dữ liệu hồ sơ',
                      message:
                          'Các thông tin chưa có sẽ hiển thị là chưa cập nhật.',
                    ),
                  const _SectionTitle('Thông tin tài khoản'),
                  AppCard(
                    child: Column(
                      children: [
                        ProfileItem(
                          icon: Icons.account_circle_outlined,
                          title: 'Tên đăng nhập',
                          value: username,
                        ),
                        const Divider(height: 28),
                        ProfileItem(
                          icon: Icons.email_outlined,
                          title: 'Email',
                          value: email?.isNotEmpty == true
                              ? email!
                              : 'Chưa cập nhật',
                        ),
                        const Divider(height: 28),
                        ProfileItem(
                          icon: Icons.phone_outlined,
                          title: 'Số điện thoại',
                          value: phone?.isNotEmpty == true
                              ? phone!
                              : 'Chưa cập nhật',
                        ),
                      ],
                    ),
                  ),
                  const SizedBox(height: 16),
                  FilledButton(
                    onPressed: openEditProfile,
                    style: FilledButton.styleFrom(
                      backgroundColor: const Color(0xff21966f),
                    ),
                    child: const ProfileButtonLabel(
                      label: 'Chỉnh sửa hồ sơ',
                      icon: Icons.edit_outlined,
                    ),
                  ),
                  const SizedBox(height: 24),
                  AppCard(
                    padding: EdgeInsets.zero,
                    child: MenuItem(
                      icon: Icons.lock_outline_rounded,
                      iconColor: CareSeniorColors.deepGreen,
                      iconBackground: CareSeniorColors.mint,
                      title: 'Đổi mật khẩu',
                      subtitle: 'Thay đổi mật khẩu đăng nhập',
                      onTap: () => Navigator.push(
                        context,
                        MaterialPageRoute(
                          builder: (_) => const ChangePasswordScreen(),
                        ),
                      ),
                    ),
                  ),
                  const SizedBox(height: 24),
                  OutlinedButton(
                    onPressed: () async {
                      await AuthService.instance.logout();
                      if (!mounted) return;
                      Navigator.pushNamedAndRemoveUntil(
                        context,
                        '/login',
                        (route) => false,
                      );
                    },
                    style: OutlinedButton.styleFrom(
                      foregroundColor: CareSeniorColors.danger,
                      side: const BorderSide(color: CareSeniorColors.danger),
                      minimumSize: const Size.fromHeight(56),
                    ),
                    child: const ProfileButtonLabel(
                      icon: Icons.logout_rounded,
                      label: 'ĐĂNG XUẤT',
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

class _SectionTitle extends StatelessWidget {
  const _SectionTitle(this.label);
  final String label;
  @override
  Widget build(BuildContext context) => Padding(
    padding: const EdgeInsets.only(bottom: 14),
    child: Text(
      label,
      style: const TextStyle(fontSize: 22, fontWeight: FontWeight.w800),
    ),
  );
}

class ProfileItem extends StatelessWidget {
  const ProfileItem({
    super.key,
    required this.icon,
    required this.title,
    required this.value,
  });
  final IconData icon;
  final String title, value;
  @override
  Widget build(BuildContext context) => LayoutBuilder(
    builder: (context, constraints) {
      final symbol = Container(
        width: 48,
        height: 48,
        decoration: BoxDecoration(
          color: CareSeniorColors.mint,
          borderRadius: BorderRadius.circular(16),
        ),
        child: Icon(icon, size: 24, color: const Color(0xff21966f)),
      );
      final label = Text(
        title,
        style: const TextStyle(
          fontSize: 16,
          color: CareSeniorColors.secondaryText,
        ),
      );
      final text = Text(
        value,
        style: const TextStyle(
          fontSize: 18,
          height: 1.4,
          fontWeight: FontWeight.w600,
        ),
      );
      if (constraints.maxWidth < 300 &&
          MediaQuery.textScalerOf(context).scale(1) > 1.3) {
        return Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Row(
              children: [
                symbol,
                const SizedBox(width: 14),
                Expanded(child: label),
              ],
            ),
            const SizedBox(height: 10),
            text,
          ],
        );
      }
      return Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          symbol,
          const SizedBox(width: 14),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [label, const SizedBox(height: 4), text],
            ),
          ),
        ],
      );
    },
  );
}

class MenuItem extends StatelessWidget {
  const MenuItem({
    super.key,
    required this.icon,
    required this.iconColor,
    required this.iconBackground,
    required this.title,
    required this.subtitle,
    required this.onTap,
  });
  final IconData icon;
  final Color iconColor, iconBackground;
  final String title, subtitle;
  final VoidCallback onTap;
  @override
  Widget build(BuildContext context) => InkWell(
    onTap: onTap,
    borderRadius: BorderRadius.circular(22),
    child: Padding(
      padding: const EdgeInsets.all(16),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Container(
            width: 48,
            height: 48,
            decoration: BoxDecoration(
              color: iconBackground,
              borderRadius: BorderRadius.circular(16),
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
                    fontSize: 18,
                    fontWeight: FontWeight.w700,
                  ),
                ),
                const SizedBox(height: 6),
                Text(
                  subtitle,
                  style: const TextStyle(
                    fontSize: 16,
                    height: 1.4,
                    color: CareSeniorColors.secondaryText,
                  ),
                ),
              ],
            ),
          ),
          const Icon(
            Icons.chevron_right_rounded,
            color: CareSeniorColors.secondaryText,
          ),
        ],
      ),
    ),
  );
}
