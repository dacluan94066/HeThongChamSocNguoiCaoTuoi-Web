import 'package:flutter/material.dart';

import '../../services/api_client.dart';
import '../../services/elderly_service.dart';

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
          content: Column(
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
                  color: Color(0xff07856d),
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
                style: TextStyle(color: Colors.black54, fontSize: 13),
              ),

              const SizedBox(height: 20),

              SizedBox(
                width: double.infinity,
                height: 48,
                child: ElevatedButton(
                  onPressed: () {
                    Navigator.pop(dialogContext);
                  },
                  style: ElevatedButton.styleFrom(
                    backgroundColor: const Color(0xff07856d),
                    foregroundColor: Colors.white,
                    elevation: 0,
                    shape: RoundedRectangleBorder(
                      borderRadius: BorderRadius.circular(16),
                    ),
                  ),
                  child: const Text(
                    'HOÀN TẤT',
                    style: TextStyle(fontWeight: FontWeight.bold),
                  ),
                ),
              ),
            ],
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
          style: const TextStyle(fontSize: 14, fontWeight: FontWeight.w600),
        ),

        const SizedBox(height: 8),

        TextField(
          controller: controller,
          obscureText: !visible,
          decoration: InputDecoration(
            hintText: hint,
            prefixIcon: const Icon(Icons.lock_outline_rounded),
            suffixIcon: IconButton(
              onPressed: onToggle,
              icon: Icon(
                visible
                    ? Icons.visibility_off_outlined
                    : Icons.visibility_outlined,
              ),
            ),
            filled: true,
            fillColor: Colors.white,
            border: OutlineInputBorder(
              borderRadius: BorderRadius.circular(18),
              borderSide: BorderSide.none,
            ),
            enabledBorder: OutlineInputBorder(
              borderRadius: BorderRadius.circular(18),
              borderSide: BorderSide.none,
            ),
            focusedBorder: OutlineInputBorder(
              borderRadius: BorderRadius.circular(18),
              borderSide: const BorderSide(
                color: Color(0xff07856d),
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
    return Scaffold(
      backgroundColor: const Color(0xfff3f3f1),

      appBar: AppBar(
        backgroundColor: const Color(0xfff3f3f1),
        elevation: 0,
        centerTitle: true,
        title: const Text(
          'Đổi mật khẩu',
          style: TextStyle(fontWeight: FontWeight.bold),
        ),
      ),

      body: SingleChildScrollView(
        padding: const EdgeInsets.fromLTRB(20, 18, 20, 30),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Container(
              width: double.infinity,
              padding: const EdgeInsets.all(20),
              decoration: BoxDecoration(
                gradient: const LinearGradient(
                  colors: [Color(0xffe9fff6), Color(0xffffffe8)],
                ),
                borderRadius: BorderRadius.circular(26),
              ),
              child: const Column(
                children: [
                  CircleAvatar(
                    radius: 31,
                    backgroundColor: Colors.white,
                    child: Icon(
                      Icons.security_rounded,
                      size: 32,
                      color: Color(0xff07856d),
                    ),
                  ),

                  SizedBox(height: 12),

                  Text(
                    'Bảo mật tài khoản',
                    style: TextStyle(fontSize: 19, fontWeight: FontWeight.bold),
                  ),

                  SizedBox(height: 5),

                  Text(
                    'Đặt mật khẩu mới có ít nhất 6 ký tự.',
                    textAlign: TextAlign.center,
                    style: TextStyle(fontSize: 13, color: Colors.black54),
                  ),
                ],
              ),
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

            SizedBox(
              width: double.infinity,
              height: 54,
              child: ElevatedButton(
                onPressed: saving ? null : changePassword,
                style: ElevatedButton.styleFrom(
                  backgroundColor: const Color(0xff07856d),
                  foregroundColor: Colors.white,
                  disabledBackgroundColor: Colors.black12,
                  elevation: 0,
                  shape: RoundedRectangleBorder(
                    borderRadius: BorderRadius.circular(18),
                  ),
                ),
                child: saving
                    ? const SizedBox(
                        width: 22,
                        height: 22,
                        child: CircularProgressIndicator(
                          strokeWidth: 2,
                          color: Colors.white,
                        ),
                      )
                    : const Text(
                        'ĐỔI MẬT KHẨU',
                        style: TextStyle(fontWeight: FontWeight.bold),
                      ),
              ),
            ),

            const SizedBox(height: 16),

            const Row(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Icon(
                  Icons.info_outline_rounded,
                  size: 18,
                  color: Colors.black45,
                ),
                SizedBox(width: 8),
                Expanded(
                  child: Text(
                    'Mật khẩu được cập nhật trực tiếp trên tài khoản của bạn.',
                    style: TextStyle(
                      fontSize: 12,
                      color: Colors.black54,
                      height: 1.4,
                    ),
                  ),
                ),
              ],
            ),
          ],
        ),
      ),
    );
  }
}
