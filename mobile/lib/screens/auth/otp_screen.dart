import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

import '../../services/api_client.dart';
import '../../services/auth_service.dart';
import 'reset_password_screen.dart';

class OtpScreen extends StatefulWidget {
  const OtpScreen({super.key, required this.email});

  final String email;

  @override
  State<OtpScreen> createState() => _OtpScreenState();
}

class _OtpScreenState extends State<OtpScreen> {
  final otpController = TextEditingController();
  bool verifying = false;
  bool resending = false;

  @override
  void dispose() {
    otpController.dispose();
    super.dispose();
  }

  Future<void> verify() async {
    final otp = otpController.text.trim();
    if (!RegExp(r'^\d{6}$').hasMatch(otp)) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Mã OTP phải gồm đúng 6 chữ số.')),
      );
      return;
    }

    setState(() => verifying = true);
    try {
      final resetToken = await AuthService.instance.verifyOtp(
        email: widget.email,
        otp: otp,
      );
      if (!mounted) return;
      Navigator.pushReplacement(
        context,
        MaterialPageRoute(
          builder: (_) => ResetPasswordScreen(resetToken: resetToken),
        ),
      );
    } on ApiException catch (error) {
      if (!mounted) return;
      ScaffoldMessenger.of(
        context,
      ).showSnackBar(SnackBar(content: Text(error.message)));
    } finally {
      if (mounted) setState(() => verifying = false);
    }
  }

  Future<void> resend() async {
    setState(() => resending = true);
    try {
      await AuthService.instance.forgotPassword(email: widget.email);
      if (!mounted) return;
      otpController.clear();
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(
          content: Text('Đã gửi lại mã OTP. Vui lòng kiểm tra email.'),
        ),
      );
    } on ApiException catch (error) {
      if (!mounted) return;
      ScaffoldMessenger.of(
        context,
      ).showSnackBar(SnackBar(content: Text(error.message)));
    } finally {
      if (mounted) setState(() => resending = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: const Color(0xfff6f7f5),
      appBar: AppBar(
        backgroundColor: const Color(0xfff6f7f5),
        centerTitle: true,
        title: const Text(
          'Xác nhận OTP',
          style: TextStyle(fontWeight: FontWeight.bold),
        ),
      ),
      body: SafeArea(
        child: ListView(
          padding: const EdgeInsets.all(24),
          children: [
            const SizedBox(height: 38),
            const Icon(
              Icons.password_rounded,
              size: 74,
              color: Color(0xff07856d),
            ),
            const SizedBox(height: 22),
            const Text(
              'Nhập mã gồm 6 chữ số',
              textAlign: TextAlign.center,
              style: TextStyle(fontSize: 24, fontWeight: FontWeight.bold),
            ),
            const SizedBox(height: 10),
            Text(
              'Mã xác nhận đã được gửi tới ${widget.email}. Mã sẽ hết hạn sau 10 phút.',
              textAlign: TextAlign.center,
              style: const TextStyle(color: Colors.black54, height: 1.45),
            ),
            const SizedBox(height: 30),
            TextField(
              controller: otpController,
              keyboardType: TextInputType.number,
              textAlign: TextAlign.center,
              maxLength: 6,
              inputFormatters: [FilteringTextInputFormatter.digitsOnly],
              onSubmitted: (_) {
                if (!verifying) verify();
              },
              style: const TextStyle(
                fontSize: 28,
                fontWeight: FontWeight.bold,
                letterSpacing: 10,
              ),
              decoration: InputDecoration(
                counterText: '',
                hintText: '000000',
                filled: true,
                fillColor: Colors.white,
                border: OutlineInputBorder(
                  borderRadius: BorderRadius.circular(18),
                  borderSide: BorderSide.none,
                ),
              ),
            ),
            const SizedBox(height: 22),
            SizedBox(
              height: 54,
              child: FilledButton(
                onPressed: verifying ? null : verify,
                style: FilledButton.styleFrom(
                  backgroundColor: const Color(0xff07856d),
                  shape: RoundedRectangleBorder(
                    borderRadius: BorderRadius.circular(18),
                  ),
                ),
                child: verifying
                    ? const CircularProgressIndicator(color: Colors.white)
                    : const Text(
                        'XÁC NHẬN',
                        style: TextStyle(fontWeight: FontWeight.bold),
                      ),
              ),
            ),
            TextButton(
              onPressed: verifying || resending ? null : resend,
              child: Text(resending ? 'Đang gửi lại...' : 'Gửi lại mã'),
            ),
          ],
        ),
      ),
    );
  }
}
