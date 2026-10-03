import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

import 'screens/auth/register_screen.dart';
import 'screens/auth/forgot_password_screen.dart';
import 'services/local_notification_service.dart';
import 'services/auth_storage.dart';
import 'screens/home/home_screen.dart';

Future<void> main() async {
  WidgetsFlutterBinding.ensureInitialized();

  await LocalNotificationService.initialize();

  runApp(const ElderlyCareApp());
}

class ElderlyCareApp extends StatelessWidget {
  const ElderlyCareApp({super.key});

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      debugShowCheckedModeBanner: false,
      title: 'Chăm sóc người cao tuổi',
      theme: ThemeData(
        useMaterial3: true,
        fontFamily: 'Arial',
        colorScheme: ColorScheme.fromSeed(seedColor: const Color(0xff07856d)),
      ),
      home: const WelcomeScreen(),
    );
  }
}

// ======================================================
// MÀN HÌNH CHÀO
// ======================================================

class WelcomeScreen extends StatelessWidget {
  const WelcomeScreen({super.key});

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      body: Container(
        width: double.infinity,
        height: double.infinity,
        decoration: const BoxDecoration(
          gradient: LinearGradient(
            begin: Alignment.topCenter,
            end: Alignment.bottomCenter,
            colors: [Color(0xffdfe8dc), Color(0xff3bbf9b), Color(0xff049b7d)],
          ),
        ),
        child: SafeArea(
          child: Padding(
            padding: const EdgeInsets.symmetric(horizontal: 28, vertical: 24),
            child: Column(
              children: [
                const Spacer(),

                const Icon(
                  Icons.health_and_safety_rounded,
                  size: 100,
                  color: Colors.white,
                ),

                const SizedBox(height: 30),

                const Text(
                  'An Tâm Tuổi Già',
                  textAlign: TextAlign.center,
                  style: TextStyle(
                    color: Colors.white,
                    fontSize: 36,
                    fontWeight: FontWeight.bold,
                    height: 1.1,
                  ),
                ),

                const SizedBox(height: 14),

                const Text(
                  'Người bạn đồng hành sức khỏe mỗi ngày',
                  textAlign: TextAlign.center,
                  style: TextStyle(
                    color: Colors.white,
                    fontSize: 17,
                    height: 1.4,
                  ),
                ),

                const SizedBox(height: 12),

                const Text(
                  'Theo dõi sức khỏe, nhắc uống thuốc và hỗ trợ khẩn cấp khi cần.',
                  textAlign: TextAlign.center,
                  style: TextStyle(
                    color: Colors.white70,
                    fontSize: 14,
                    height: 1.5,
                  ),
                ),

                const Spacer(),

                // ==================================================
                // ĐĂNG NHẬP
                // ==================================================
                SizedBox(
                  width: double.infinity,
                  height: 56,
                  child: ElevatedButton(
                    onPressed: () {
                      Navigator.push(
                        context,
                        MaterialPageRoute(builder: (_) => const LoginScreen()),
                      );
                    },
                    style: ElevatedButton.styleFrom(
                      backgroundColor: Colors.white,
                      foregroundColor: const Color(0xff07856d),
                      elevation: 0,
                      shape: RoundedRectangleBorder(
                        borderRadius: BorderRadius.circular(28),
                      ),
                    ),
                    child: const Text(
                      'Đăng nhập',
                      style: TextStyle(
                        fontSize: 17,
                        fontWeight: FontWeight.bold,
                      ),
                    ),
                  ),
                ),

                const SizedBox(height: 14),

                // ==================================================
                // ĐĂNG KÝ
                // ==================================================
                SizedBox(
                  width: double.infinity,
                  height: 56,
                  child: OutlinedButton(
                    onPressed: () {
                      Navigator.push(
                        context,
                        MaterialPageRoute(
                          builder: (_) => const RegisterScreen(),
                        ),
                      );
                    },
                    style: OutlinedButton.styleFrom(
                      foregroundColor: Colors.white,
                      side: const BorderSide(color: Colors.white, width: 1.5),
                      shape: RoundedRectangleBorder(
                        borderRadius: BorderRadius.circular(28),
                      ),
                    ),
                    child: const Text(
                      'Đăng ký tài khoản',
                      style: TextStyle(
                        fontSize: 17,
                        fontWeight: FontWeight.w600,
                      ),
                    ),
                  ),
                ),

                const SizedBox(height: 18),

                const Text(
                  'hoặc',
                  style: TextStyle(color: Colors.white70, fontSize: 13),
                ),

                const SizedBox(height: 14),

                // ==================================================
                // GOOGLE - CHƯA NỐI THẬT
                // ==================================================
                SizedBox(
                  width: double.infinity,
                  height: 54,
                  child: ElevatedButton.icon(
                    onPressed: () {
                      ScaffoldMessenger.of(context).showSnackBar(
                        const SnackBar(
                          content: Text(
                            'Đăng nhập Google sẽ được kết nối ở bước sau.',
                          ),
                        ),
                      );
                    },
                    icon: const Text(
                      'G',
                      style: TextStyle(
                        fontWeight: FontWeight.bold,
                        fontSize: 19,
                      ),
                    ),
                    label: const Text(
                      'Tiếp tục với Google',
                      style: TextStyle(
                        fontSize: 16,
                        fontWeight: FontWeight.w600,
                      ),
                    ),
                    style: ElevatedButton.styleFrom(
                      backgroundColor: Colors.white,
                      foregroundColor: Colors.black87,
                      elevation: 0,
                      shape: RoundedRectangleBorder(
                        borderRadius: BorderRadius.circular(28),
                      ),
                    ),
                  ),
                ),

                const SizedBox(height: 20),
              ],
            ),
          ),
        ),
      ),
    );
  }
}

// ======================================================
// MÀN HÌNH ĐĂNG NHẬP
// ======================================================

class LoginScreen extends StatefulWidget {
  const LoginScreen({super.key});

  @override
  State<LoginScreen> createState() => _LoginScreenState();
}

class _LoginScreenState extends State<LoginScreen> {
  final TextEditingController phoneController = TextEditingController();

  final TextEditingController passwordController = TextEditingController();

  bool obscurePassword = true;

  bool loggingIn = false;

  @override
  void dispose() {
    phoneController.dispose();
    passwordController.dispose();

    super.dispose();
  }

  Future<void> login() async {
    final phone = phoneController.text.trim();
    final password = passwordController.text.trim();

    // ==================================================
    // KIỂM TRA BỎ TRỐNG
    // ==================================================
    if (phone.isEmpty || password.isEmpty) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(
          content: Text('Vui lòng nhập số điện thoại và mật khẩu.'),
        ),
      );

      return;
    }

    // ==================================================
    // KIỂM TRA SỐ ĐIỆN THOẠI
    // ==================================================
    if (phone.length != 10 || !phone.startsWith('0')) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Số điện thoại không hợp lệ.')),
      );

      return;
    }

    // ==================================================
    // KIỂM TRA ĐỘ DÀI MẬT KHẨU
    // ==================================================
    if (password.length < 6) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Mật khẩu phải có ít nhất 6 ký tự.')),
      );

      return;
    }

    setState(() {
      loggingIn = true;
    });

    // ==================================================
    // KIỂM TRA MẬT KHẨU ĐÃ LƯU
    // ==================================================
    final passwordCorrect = await AuthStorage.checkPassword(password);

    if (!mounted) {
      return;
    }

    if (!passwordCorrect) {
      setState(() {
        loggingIn = false;
      });

      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Mật khẩu không chính xác.')),
      );

      return;
    }

    setState(() {
      loggingIn = false;
    });

    // ==================================================
    // ĐĂNG NHẬP THÀNH CÔNG
    // ==================================================
    Navigator.pushReplacement(
      context,
      MaterialPageRoute(builder: (_) => const HomeScreen()),
    );
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: const Color(0xfff6f7f5),

      appBar: AppBar(
        backgroundColor: const Color(0xfff6f7f5),
        elevation: 0,
        centerTitle: true,
        title: const Text(
          'Đăng nhập',
          style: TextStyle(fontWeight: FontWeight.bold),
        ),
      ),

      body: SingleChildScrollView(
        padding: const EdgeInsets.all(24),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            const SizedBox(height: 10),

            const Text(
              'Chào mừng bạn trở lại',
              style: TextStyle(fontSize: 27, fontWeight: FontWeight.bold),
            ),

            const SizedBox(height: 8),

            const Text(
              'Đăng nhập để tiếp tục theo dõi sức khỏe của bạn.',
              style: TextStyle(
                fontSize: 15,
                color: Colors.black54,
                height: 1.4,
              ),
            ),

            const SizedBox(height: 35),

            // ==================================================
            // SỐ ĐIỆN THOẠI
            // ==================================================
            const Text(
              'Số điện thoại',
              style: TextStyle(fontSize: 15, fontWeight: FontWeight.w600),
            ),

            const SizedBox(height: 8),

            TextField(
              controller: phoneController,
              keyboardType: TextInputType.phone,
              inputFormatters: [
                FilteringTextInputFormatter.digitsOnly,
                LengthLimitingTextInputFormatter(10),
              ],
              decoration: InputDecoration(
                hintText: 'VD: 0912345678',
                prefixIcon: const Icon(Icons.phone_outlined),
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
                    width: 1.5,
                  ),
                ),
              ),
            ),

            const SizedBox(height: 20),

            // ==================================================
            // MẬT KHẨU
            // ==================================================
            const Text(
              'Mật khẩu',
              style: TextStyle(fontSize: 15, fontWeight: FontWeight.w600),
            ),

            const SizedBox(height: 8),

            TextField(
              controller: passwordController,
              obscureText: obscurePassword,
              onSubmitted: (_) {
                if (!loggingIn) {
                  login();
                }
              },
              decoration: InputDecoration(
                hintText: 'Nhập mật khẩu',
                prefixIcon: const Icon(Icons.lock_outline),
                suffixIcon: IconButton(
                  onPressed: () {
                    setState(() {
                      obscurePassword = !obscurePassword;
                    });
                  },
                  icon: Icon(
                    obscurePassword
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
                    width: 1.5,
                  ),
                ),
              ),
            ),

            const SizedBox(height: 10),

            // ==================================================
            // QUÊN MẬT KHẨU
            // ==================================================
            Align(
              alignment: Alignment.centerRight,
              child: TextButton(
                onPressed: () {
                  Navigator.push(
                    context,
                    MaterialPageRoute(
                      builder: (_) => const ForgotPasswordScreen(),
                    ),
                  );
                },
                child: const Text(
                  'Quên mật khẩu?',
                  style: TextStyle(
                    color: Color(0xff07856d),
                    fontWeight: FontWeight.w600,
                  ),
                ),
              ),
            ),

            const SizedBox(height: 12),

            // ==================================================
            // NÚT ĐĂNG NHẬP
            // ==================================================
            SizedBox(
              width: double.infinity,
              height: 56,
              child: ElevatedButton(
                onPressed: loggingIn ? null : login,
                style: ElevatedButton.styleFrom(
                  backgroundColor: const Color(0xff07856d),
                  foregroundColor: Colors.white,
                  disabledBackgroundColor: const Color(0xff8dbeb3),
                  elevation: 0,
                  shape: RoundedRectangleBorder(
                    borderRadius: BorderRadius.circular(18),
                  ),
                ),
                child: loggingIn
                    ? const SizedBox(
                        width: 22,
                        height: 22,
                        child: CircularProgressIndicator(
                          strokeWidth: 2,
                          color: Colors.white,
                        ),
                      )
                    : const Text(
                        'ĐĂNG NHẬP',
                        style: TextStyle(
                          fontSize: 16,
                          fontWeight: FontWeight.bold,
                        ),
                      ),
              ),
            ),

            const SizedBox(height: 25),

            const Row(
              children: [
                Expanded(child: Divider()),
                Padding(
                  padding: EdgeInsets.symmetric(horizontal: 12),
                  child: Text('Hoặc', style: TextStyle(color: Colors.black45)),
                ),
                Expanded(child: Divider()),
              ],
            ),

            const SizedBox(height: 22),

            // ==================================================
            // GOOGLE
            // ==================================================
            SizedBox(
              width: double.infinity,
              height: 54,
              child: OutlinedButton.icon(
                onPressed: () {
                  ScaffoldMessenger.of(context).showSnackBar(
                    const SnackBar(
                      content: Text(
                        'Đăng nhập Google sẽ được kết nối ở bước sau.',
                      ),
                    ),
                  );
                },
                icon: const Text(
                  'G',
                  style: TextStyle(fontWeight: FontWeight.bold, fontSize: 18),
                ),
                label: const Text('Tiếp tục với Google'),
                style: OutlinedButton.styleFrom(
                  foregroundColor: Colors.black87,
                  backgroundColor: Colors.white,
                  side: BorderSide.none,
                  shape: RoundedRectangleBorder(
                    borderRadius: BorderRadius.circular(18),
                  ),
                ),
              ),
            ),

            const SizedBox(height: 25),

            // ==================================================
            // ĐĂNG KÝ NGAY
            // ==================================================
            Row(
              mainAxisAlignment: MainAxisAlignment.center,
              children: [
                const Text(
                  'Chưa có tài khoản? ',
                  style: TextStyle(color: Colors.black54),
                ),

                TextButton(
                  onPressed: () {
                    Navigator.push(
                      context,
                      MaterialPageRoute(builder: (_) => const RegisterScreen()),
                    );
                  },
                  child: const Text(
                    'Đăng ký ngay',
                    style: TextStyle(
                      color: Color(0xff07856d),
                      fontWeight: FontWeight.bold,
                    ),
                  ),
                ),
              ],
            ),

            const SizedBox(height: 20),
          ],
        ),
      ),
    );
  }
}
