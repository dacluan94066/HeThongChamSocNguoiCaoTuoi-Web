import 'package:flutter/material.dart';

import '../../services/api_client.dart';
import '../../services/auth_service.dart';

class ResetPasswordScreen extends StatefulWidget {
  const ResetPasswordScreen({super.key, required this.resetToken});

  final String resetToken;

  @override
  State<ResetPasswordScreen> createState() => _ResetPasswordScreenState();
}

class _ResetPasswordScreenState extends State<ResetPasswordScreen> {
  final passwordController = TextEditingController();
  final confirmController = TextEditingController();
  bool obscurePassword = true;
  bool obscureConfirm = true;
  bool saving = false;

  @override
  void dispose() {
    passwordController.dispose();
    confirmController.dispose();
    super.dispose();
  }

  Future<void> resetPassword() async {
    final password = passwordController.text;
    final confirmation = confirmController.text;
    if (password.length < 6) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Mật khẩu mới phải có ít nhất 6 ký tự.')),
      );
      return;
    }
    if (password != confirmation) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Xác nhận mật khẩu không khớp.')),
      );
      return;
    }

    setState(() => saving = true);
    try {
      await AuthService.instance.resetPasswordWithToken(
        resetToken: widget.resetToken,
        matKhauMoi: password,
      );
      if (!mounted) return;
      Navigator.pushNamedAndRemoveUntil(context, '/login', (route) => false);
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(
          content: Text('Đặt lại mật khẩu thành công. Vui lòng đăng nhập.'),
          backgroundColor: Color(0xff07856d),
        ),
      );
    } on ApiException catch (error) {
      if (!mounted) return;
      ScaffoldMessenger.of(
        context,
      ).showSnackBar(SnackBar(content: Text(error.message)));
    } finally {
      if (mounted) setState(() => saving = false);
    }
  }

  Widget passwordField({
    required String label,
    required TextEditingController controller,
    required bool obscure,
    required VoidCallback toggle,
    TextInputAction? textInputAction,
    VoidCallback? onSubmitted,
  }) {
    return TextField(
      controller: controller,
      obscureText: obscure,
      textInputAction: textInputAction,
      onSubmitted: (_) => onSubmitted?.call(),
      decoration: InputDecoration(
        labelText: label,
        prefixIcon: const Icon(Icons.lock_outline_rounded),
        suffixIcon: IconButton(
          onPressed: toggle,
          icon: Icon(obscure ? Icons.visibility_off : Icons.visibility),
        ),
        filled: true,
        fillColor: Colors.white,
        border: OutlineInputBorder(
          borderRadius: BorderRadius.circular(18),
          borderSide: BorderSide.none,
        ),
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: const Color(0xfff6f7f5),
      appBar: AppBar(
        backgroundColor: const Color(0xfff6f7f5),
        centerTitle: true,
        title: const Text(
          'Đặt mật khẩu mới',
          style: TextStyle(fontWeight: FontWeight.bold),
        ),
      ),
      body: SafeArea(
        child: ListView(
          padding: const EdgeInsets.all(24),
          children: [
            const SizedBox(height: 32),
            const CircleAvatar(
              radius: 46,
              backgroundColor: Color(0xffe2f4ee),
              child: Icon(
                Icons.lock_reset_rounded,
                size: 48,
                color: Color(0xff07856d),
              ),
            ),
            const SizedBox(height: 28),
            passwordField(
              label: 'Mật khẩu mới',
              controller: passwordController,
              obscure: obscurePassword,
              toggle: () => setState(() => obscurePassword = !obscurePassword),
              textInputAction: TextInputAction.next,
            ),
            const SizedBox(height: 18),
            passwordField(
              label: 'Xác nhận mật khẩu mới',
              controller: confirmController,
              obscure: obscureConfirm,
              toggle: () => setState(() => obscureConfirm = !obscureConfirm),
              textInputAction: TextInputAction.done,
              onSubmitted: saving ? null : resetPassword,
            ),
            const SizedBox(height: 24),
            SizedBox(
              height: 54,
              child: FilledButton(
                onPressed: saving ? null : resetPassword,
                style: FilledButton.styleFrom(
                  backgroundColor: const Color(0xff07856d),
                  shape: RoundedRectangleBorder(
                    borderRadius: BorderRadius.circular(18),
                  ),
                ),
                child: saving
                    ? const CircularProgressIndicator(color: Colors.white)
                    : const Text(
                        'ĐỔI MẬT KHẨU',
                        style: TextStyle(fontWeight: FontWeight.bold),
                      ),
              ),
            ),
          ],
        ),
      ),
    );
  }
}
