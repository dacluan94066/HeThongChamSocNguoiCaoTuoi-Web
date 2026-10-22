import 'package:flutter/material.dart';
import '../../theme/care_senior_theme.dart';

import '../../services/api_client.dart';
import '../../services/elderly_service.dart';
import 'profile_dashboard_ui.dart';

class ChangePasswordScreen extends StatefulWidget {
  const ChangePasswordScreen({super.key});

  @override
  State<ChangePasswordScreen> createState() => _ChangePasswordScreenState();
}

class _ChangePasswordScreenState extends State<ChangePasswordScreen> {
  final currentPasswordController = TextEditingController();

  final newPasswordController = TextEditingController();

  final confirmPasswordController = TextEditingController();

  bool showCurrentPassword = false;
  bool showNewPassword = false;
  bool showConfirmPassword = false;

  bool saving = false;

  @override
  void dispose() {
    currentPasswordController.dispose();
    newPasswordController.dispose();
    confirmPasswordController.dispose();

    super.dispose();
  }

  Future<void> changePassword() async {
    final currentPassword = currentPasswordController.text;

    final newPassword = newPasswordController.text;

    final confirmPassword = confirmPasswordController.text;

    if (currentPassword.isEmpty ||
        newPassword.isEmpty ||
        confirmPassword.isEmpty) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Vui lòng nhập đầy đủ thông tin.')),
      );

      return;
    }

    if (newPassword.length < 6) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Mật khẩu mới phải có ít nhất 6 ký tự.')),
      );

      return;
    }

    if (newPassword == currentPassword) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(
          content: Text('Mật khẩu mới phải khác mật khẩu hiện tại.'),
        ),
      );

      return;
    }

    if (newPassword != confirmPassword) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Xác nhận mật khẩu không khớp.')),
      );

      return;
    }

    setState(() {
      saving = true;
    });

    try {
      await ElderlyService.instance.changePassword(
        currentPassword,
        newPassword,
      );
    } on ApiException catch (error) {
      if (!mounted) return;
      setState(() {
        saving = false;
      });
      ScaffoldMessenger.of(
        context,
      ).showSnackBar(SnackBar(content: Text(error.message)));
      return;
    } catch (_) {
      if (!mounted) return;
      setState(() {
        saving = false;
      });
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(
          content: Text('Không thể đổi mật khẩu. Vui lòng thử lại.'),
        ),
      );
      return;
    }

    if (!mounted) return;
    setState(() {
      saving = false;
    });

    await showDialog(
      context: context,
      barrierDismissible: false,
      builder: (dialogContext) {
        return AlertDialog(
          shape: RoundedRectangleBorder(
            borderRadius: BorderRadius.circular(24),
          ),
          content: SingleChildScrollView(
            child: Column(
              mainAxisSize: MainAxisSize.min,
              children: [
                Container(
                  width: 64,
                  height: 64,
                  decoration: const BoxDecoration(
                    color: Color(0xffe8f8ee),
                    shape: BoxShape.circle,
                  ),
                  child: const Icon(
                    Icons.check_rounded,
                    color: CareSeniorColors.deepGreen,
                    size: 36,
                  ),
                ),

                const SizedBox(height: 16),

                const Text(
                  'Đổi mật khẩu thành công',
                  textAlign: TextAlign.center,
                  style: TextStyle(fontSize: 19, fontWeight: FontWeight.bold),
                ),

                const SizedBox(height: 8),

                const Text(
                  'Mật khẩu mới đã được lưu.',
                  textAlign: TextAlign.center,
                  style: TextStyle(color: Colors.black54, fontSize: 16),
                ),

                const SizedBox(height: 20),

                ConstrainedBox(
                  constraints: const BoxConstraints(
                    minWidth: double.infinity,
                    minHeight: 56,
                  ),
                  child: ElevatedButton(
                    onPressed: () {
                      Navigator.pop(dialogContext);
                    },
                    style: ElevatedButton.styleFrom(
                      backgroundColor: CareSeniorColors.deepGreen,
                      foregroundColor: Colors.white,
                      elevation: 0,
                      shape: RoundedRectangleBorder(
                        borderRadius: BorderRadius.circular(16),
                      ),
                    ),
                    child: const ProfileButtonLabel(label: 'HOÀN TẤT'),
                  ),
                ),
              ],
            ),
          ),
        );
      },
    );

    if (!mounted) {
      return;
    }

    Navigator.pop(context, true);
  }

  Widget buildPasswordField({
    required String label,
    required String hint,
    required TextEditingController controller,
    required bool visible,
    required VoidCallback onToggle,
  }) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(
          label,
          style: const TextStyle(fontSize: 16, fontWeight: FontWeight.w600),
        ),

        const SizedBox(height: 8),

        TextField(
          key: ValueKey('password-field-$label'),
          style: const TextStyle(fontSize: 18),
          scrollPadding: const EdgeInsets.all(28),
          controller: controller,
          obscureText: !visible,
          decoration: InputDecoration(
            hintText: hint,
            prefixIcon: const Icon(Icons.lock_outline_rounded),
            suffixIcon: IconButton(
              constraints: const BoxConstraints(minWidth: 56, minHeight: 56),
              tooltip: visible ? 'Ẩn mật khẩu' : 'Hiện mật khẩu',
              onPressed: onToggle,
              icon: Icon(
                visible
                    ? Icons.visibility_off_outlined
                    : Icons.visibility_outlined,
              ),
            ),
            filled: true,
            fillColor: const Color(0xfff7faf8),
            border: OutlineInputBorder(
              borderRadius: BorderRadius.circular(18),
              borderSide: const BorderSide(color: CareSeniorColors.border),
            ),
            enabledBorder: OutlineInputBorder(
              borderRadius: BorderRadius.circular(18),
              borderSide: const BorderSide(color: CareSeniorColors.border),
            ),
            focusedBorder: OutlineInputBorder(
              borderRadius: BorderRadius.circular(18),
              borderSide: const BorderSide(
                color: CareSeniorColors.deepGreen,
                width: 1.3,
              ),
            ),
          ),
        ),
      ],
    );
  }

  @override
  Widget build(BuildContext context) {
    return ProfileFormPage(
      title: 'Đổi mật khẩu',
      subtitle: 'Bảo mật tài khoản của bạn',
      scrollKey: const ValueKey('profile-password-scroll'),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          const Icon(
            Icons.security_rounded,
            size: 44,
            color: CareSeniorColors.deepGreen,
          ),
          const SizedBox(height: 14),
          const Text(
            'Đặt mật khẩu mới có ít nhất 6 ký tự.',
            textAlign: TextAlign.center,
            style: TextStyle(fontSize: 17, height: 1.4),
          ),
          const SizedBox(height: 24),
          buildPasswordField(
            label: 'Mật khẩu hiện tại',
            hint: 'Nhập mật khẩu hiện tại',
            controller: currentPasswordController,
            visible: showCurrentPassword,
            onToggle: () {
              setState(() {
                showCurrentPassword = !showCurrentPassword;
              });
            },
          ),
          const SizedBox(height: 18),
          buildPasswordField(
            label: 'Mật khẩu mới',
            hint: 'Nhập mật khẩu mới',
            controller: newPasswordController,
            visible: showNewPassword,
            onToggle: () {
              setState(() {
                showNewPassword = !showNewPassword;
              });
            },
          ),
          const SizedBox(height: 18),
          buildPasswordField(
            label: 'Xác nhận mật khẩu mới',
            hint: 'Nhập lại mật khẩu mới',
            controller: confirmPasswordController,
            visible: showConfirmPassword,
            onToggle: () {
              setState(() {
                showConfirmPassword = !showConfirmPassword;
              });
            },
          ),
          const SizedBox(height: 26),
          FilledButton(
            onPressed: saving ? null : changePassword,
            style: FilledButton.styleFrom(
              backgroundColor: const Color(0xff21966f),
            ),
            child: ProfileButtonLabel(
              label: 'ĐỔI MẬT KHẨU',
              icon: Icons.lock_outline_rounded,
              busy: saving,
            ),
          ),
          const SizedBox(height: 16),
          OutlinedButton(
            onPressed: () => Navigator.maybePop(context),
            child: const ProfileButtonLabel(label: 'Hủy'),
          ),
          const SizedBox(height: 16),
          const Text(
            'Mật khẩu được cập nhật trực tiếp trên tài khoản của bạn.',
            style: TextStyle(
              fontSize: 16,
              height: 1.4,
              color: CareSeniorColors.secondaryText,
            ),
          ),
        ],
      ),
    );
  }
}
