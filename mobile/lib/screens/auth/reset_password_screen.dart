import 'package:flutter/material.dart';

class ResetPasswordScreen extends StatefulWidget {
  const ResetPasswordScreen({super.key});

  @override
  State<ResetPasswordScreen> createState() => _ResetPasswordScreenState();
}

class _ResetPasswordScreenState extends State<ResetPasswordScreen> {
  final newPasswordController = TextEditingController();

  final confirmPasswordController = TextEditingController();

  bool showNewPassword = false;
  bool showConfirmPassword = false;

  @override
  void dispose() {
    newPasswordController.dispose();
    confirmPasswordController.dispose();

    super.dispose();
  }

  Future<void> resetPassword() async {
    final newPassword = newPasswordController.text.trim();

    final confirmPassword = confirmPasswordController.text.trim();

    if (newPassword.isEmpty || confirmPassword.isEmpty) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Vui lòng nhập đầy đủ mật khẩu mới.')),
      );

      return;
    }

    if (newPassword.length < 6) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Mật khẩu mới phải có ít nhất 6 ký tự.')),
      );

      return;
    }

    if (newPassword != confirmPassword) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Xác nhận mật khẩu không khớp.')),
      );

      return;
    }

    ScaffoldMessenger.of(context).showSnackBar(
      const SnackBar(
        content: Text('Đặt lại mật khẩu qua OTP chưa được máy chủ hỗ trợ.'),
      ),
    );
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
                width: 1.4,
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
          'Đặt lại mật khẩu',
          style: TextStyle(fontWeight: FontWeight.bold),
        ),
      ),

      body: SingleChildScrollView(
        padding: const EdgeInsets.fromLTRB(20, 20, 20, 30),
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
                    radius: 32,
                    backgroundColor: Colors.white,
                    child: Icon(
                      Icons.lock_reset_rounded,
                      size: 34,
                      color: Color(0xff07856d),
                    ),
                  ),

                  SizedBox(height: 12),

                  Text(
                    'Tạo mật khẩu mới',
                    style: TextStyle(fontSize: 20, fontWeight: FontWeight.bold),
                  ),

                  SizedBox(height: 6),

                  Text(
                    'Mật khẩu mới cần có ít nhất 6 ký tự.',
                    textAlign: TextAlign.center,
                    style: TextStyle(fontSize: 13, color: Colors.black54),
                  ),
                ],
              ),
            ),

            const SizedBox(height: 26),

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

            const SizedBox(height: 28),

            SizedBox(
              width: double.infinity,
              height: 54,
              child: ElevatedButton(
                onPressed: resetPassword,
                style: ElevatedButton.styleFrom(
                  backgroundColor: const Color(0xff07856d),
                  foregroundColor: Colors.white,
                  disabledBackgroundColor: Colors.black12,
                  elevation: 0,
                  shape: RoundedRectangleBorder(
                    borderRadius: BorderRadius.circular(18),
                  ),
                ),
                child: const Text(
                  'LƯU MẬT KHẨU MỚI',
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
