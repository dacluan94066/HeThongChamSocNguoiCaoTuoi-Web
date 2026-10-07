import 'package:flutter/material.dart';

import 'forgot_password_screen.dart';

/// Tạm giữ class để không làm hỏng code cũ từng tham chiếu màn OTP.
/// Luồng OTP giả đã bị vô hiệu hóa cho tới khi backend hỗ trợ OTP thật.
@Deprecated('OTP recovery is not available yet')
class OtpScreen extends StatelessWidget {
  const OtpScreen({super.key, required this.phoneNumber});

  final String phoneNumber;

  @override
  Widget build(BuildContext context) => const ForgotPasswordScreen();
}
