import 'package:flutter/material.dart';

import 'forgot_password_screen.dart';

/// Tạm giữ class để không làm hỏng code cũ từng tham chiếu màn đặt lại mật khẩu.
/// Không còn thao tác đổi mật khẩu giả ở phía Mobile.
@Deprecated('Password recovery is not available yet')
class ResetPasswordScreen extends StatelessWidget {
  const ResetPasswordScreen({super.key});

  @override
  Widget build(BuildContext context) => const ForgotPasswordScreen();
}
