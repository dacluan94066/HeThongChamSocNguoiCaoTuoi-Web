import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

import 'screens/auth/register_screen.dart';
import 'screens/auth/forgot_password_screen.dart';
import 'services/local_notification_service.dart';
import 'services/auth_storage.dart';
import 'services/api_client.dart';
import 'services/auth_service.dart';
import 'screens/home/home_screen.dart';
import 'screens/caregiver/caregiver_home_screen.dart';

Future<void> main() async {
  WidgetsFlutterBinding.ensureInitialized();

  runApp(const AppBootstrap());
}

class AppBootstrap extends StatefulWidget {
  const AppBootstrap({super.key});

  @override
  State<AppBootstrap> createState() => _AppBootstrapState();
}

class _AppBootstrapState extends State<AppBootstrap> {
  late Future<void> _initialization;

  @override
  void initState() {
    super.initState();
    _initialization = _initialize();
  }

  Future<void> _initialize() async {
    await AuthStorage.clearLegacyPlainTextPassword();
    await LocalNotificationService.initialize();
  }

  void _retry() {
    setState(() {
      _initialization = _initialize();
    });
  }

  @override
  Widget build(BuildContext context) {
    return FutureBuilder<void>(
      future: _initialization,
      builder: (context, snapshot) {
        if (snapshot.connectionState == ConnectionState.done &&
            !snapshot.hasError) {
          return const ElderlyCareApp();
        }

        final failed =
            snapshot.connectionState == ConnectionState.done &&
            snapshot.hasError;
        return MaterialApp(
          debugShowCheckedModeBanner: false,
          home: Scaffold(
            backgroundColor: const Color(0xff07856d),
            body: SafeArea(
              child: Center(
                child: Padding(
                  padding: const EdgeInsets.all(28),
                  child: failed
                      ? Column(
                          mainAxisSize: MainAxisSize.min,
                          children: [
                            const Icon(
                              Icons.error_outline,
                              color: Colors.white,
                              size: 56,
                            ),
                            const SizedBox(height: 20),
                            const Text(
                              'Không thể chuẩn bị ứng dụng trên thiết bị. '
                              'Vui lòng thử lại hoặc khởi động lại ứng dụng.',
                              textAlign: TextAlign.center,
                              style: TextStyle(
                                color: Colors.white,
                                fontSize: 17,
                              ),
                            ),
                            const SizedBox(height: 24),
                            ElevatedButton.icon(
                              onPressed: _retry,
                              icon: const Icon(Icons.refresh),
                              label: const Text('Thử lại'),
                            ),
                          ],
                        )
                      : const CircularProgressIndicator(color: Colors.white),
                ),
              ),
            ),
          ),
        );
      },
    );
  }
}

class ElderlyCareApp extends StatelessWidget {
  const ElderlyCareApp({super.key});

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      navigatorKey: ApiClient.navigatorKey,
      debugShowCheckedModeBanner: false,
      title: 'Chăm sóc người cao tuổi',
      theme: ThemeData(
        useMaterial3: true,
        fontFamily: 'Arial',
        colorScheme: ColorScheme.fromSeed(seedColor: const Color(0xff07856d)),
      ),
      routes: {
        '/welcome': (_) => const WelcomeScreen(),
        '/login': (_) => const LoginScreen(),
        '/home': (_) => const HomeScreen(),
        '/caregiver-home': (_) => const CaregiverHomeScreen(),
      },
      home: const SplashScreen(),
    );
  }
}

// ======================================================
// MÀN HÌNH KHỞI ĐỘNG - KHÔI PHỤC PHIÊN ĐĂNG NHẬP
// ======================================================

class SplashScreen extends StatefulWidget {
  const SplashScreen({super.key});

  @override
  State<SplashScreen> createState() => _SplashScreenState();
}

class _SplashScreenState extends State<SplashScreen> {
  String? _connectionError;
  bool _unsupportedRole = false;
  bool _checkingSession = false;

  @override
  void initState() {
    super.initState();
    _restoreSession();
  }

  Future<void> _restoreSession() async {
    if (_checkingSession) return;

    setState(() {
      _checkingSession = true;
      _connectionError = null;
      _unsupportedRole = false;
    });

    final authService = AuthService.instance;

    try {
      final token = await authService.getToken();
      if (!mounted) return;

      if (token == null || token.isEmpty) {
        Navigator.pushReplacementNamed(context, '/welcome');
        return;
      }

      final user = await authService.getMe();
      if (!mounted) return;

      final role = user['tenVaiTro']?.toString();
      if (role == 'NguoiCaoTuoi') {
        Navigator.pushReplacementNamed(context, '/home');
      } else if (role == 'NguoiChamSoc') {
        Navigator.pushReplacementNamed(context, '/caregiver-home');
      } else {
        await authService.logout();
        if (!mounted) return;

        setState(() {
          _unsupportedRole = true;
          _connectionError =
              'Tài khoản này không hỗ trợ trên Mobile. Vui lòng dùng hệ thống Web.';
        });
      }
    } on ApiException catch (error) {
      if (!mounted) return;

      if (error.statusCode == 401) {
        // ApiClient đã xóa phiên khi nhận phản hồi 401.
        // Interceptor cũng sẽ chuyển ứng dụng về màn hình đăng nhập.
        ApiClient.redirectToLogin();
        return;
      }

      setState(() {
        _connectionError = error.isConnectionFailure
            ? 'Không thể kết nối máy chủ. Kiểm tra mạng và địa chỉ API, rồi thử lại.'
            : error.message;
      });
    } catch (_) {
      if (!mounted) return;

      setState(() {
        _connectionError =
            'Không thể khôi phục phiên đăng nhập. Vui lòng thử lại.';
      });
    } finally {
      if (mounted) {
        setState(() {
          _checkingSession = false;
        });
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: const Color(0xff07856d),
      body: Center(
        child: _connectionError == null
            ? const CircularProgressIndicator(color: Colors.white)
            : Padding(
                padding: const EdgeInsets.all(32),
                child: Column(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    const Icon(
                      Icons.cloud_off_rounded,
                      color: Colors.white,
                      size: 64,
                    ),
                    const SizedBox(height: 20),
                    Text(
                      _connectionError!,
                      textAlign: TextAlign.center,
                      style: const TextStyle(
                        color: Colors.white,
                        fontSize: 17,
                        fontWeight: FontWeight.w600,
                      ),
                    ),
                    const SizedBox(height: 24),
                    ElevatedButton.icon(
                      onPressed: _checkingSession
                          ? null
                          : _unsupportedRole
                          ? () => Navigator.pushNamedAndRemoveUntil(
                              context,
                              '/login',
                              (route) => false,
                            )
                          : _restoreSession,
                      icon: Icon(
                        _unsupportedRole
                            ? Icons.login_rounded
                            : Icons.refresh_rounded,
                      ),
                      label: Text(
                        _unsupportedRole ? 'Về đăng nhập' : 'Thử lại',
                      ),
                    ),
                  ],
                ),
              ),
      ),
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
  final TextEditingController usernameController = TextEditingController();

  final TextEditingController passwordController = TextEditingController();

  bool obscurePassword = true;

  bool loggingIn = false;

  @override
  void dispose() {
    usernameController.dispose();
    passwordController.dispose();

    super.dispose();
  }

  Future<void> login() async {
    if (loggingIn) return;
    final username = usernameController.text.trim();
    final password = passwordController.text;

    // ==================================================
    // KIỂM TRA BỎ TRỐNG
    // ==================================================
    if (username.isEmpty || password.isEmpty) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(
          content: Text('Vui lòng nhập tên đăng nhập và mật khẩu.'),
        ),
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

    FocusScope.of(context).unfocus();
    setState(() {
      loggingIn = true;
    });

    try {
      final user = await AuthService.instance.login(username, password);
      if (!mounted) return;
      final role = user['tenVaiTro']?.toString();
      TextInput.finishAutofillContext();
      if (role == 'NguoiCaoTuoi') {
        Navigator.pushNamedAndRemoveUntil(context, '/home', (route) => false);
      } else if (role == 'NguoiChamSoc') {
        Navigator.pushNamedAndRemoveUntil(
          context,
          '/caregiver-home',
          (route) => false,
        );
      } else {
        await AuthService.instance.logout();
        if (!mounted) return;
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(
            backgroundColor: Color(0xffc0392b),
            content: Text(
              'Tài khoản này không hỗ trợ trên ứng dụng Mobile, vui lòng dùng hệ thống Web',
            ),
          ),
        );
      }
    } on ApiException catch (error) {
      if (!mounted) return;
      ScaffoldMessenger.of(
        context,
      ).showSnackBar(SnackBar(content: Text(error.message)));
    } catch (_) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Không thể đăng nhập. Vui lòng thử lại.')),
      );
    } finally {
      if (mounted) {
        setState(() {
          loggingIn = false;
        });
      }
    }
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

      body: AutofillGroup(
        child: SingleChildScrollView(
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
              // TÊN ĐĂNG NHẬP
              // ==================================================
              const Text(
                'Tên đăng nhập',
                style: TextStyle(fontSize: 15, fontWeight: FontWeight.w600),
              ),

              const SizedBox(height: 8),

              TextField(
                controller: usernameController,
                enabled: !loggingIn,
                autofillHints: const [AutofillHints.username],
                enableSuggestions: false,
                keyboardType: TextInputType.text,
                textInputAction: TextInputAction.next,
                autocorrect: false,
                decoration: InputDecoration(
                  hintText: 'Nhập tên đăng nhập',
                  prefixIcon: const Icon(Icons.person_outline),
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
                enabled: !loggingIn,
                autofillHints: const [AutofillHints.password],
                textInputAction: TextInputAction.done,
                autocorrect: false,
                enableSuggestions: false,
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
                    onPressed: loggingIn
                        ? null
                        : () {
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
                  onPressed: loggingIn
                      ? null
                      : () {
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
                    child: Text(
                      'Hoặc',
                      style: TextStyle(color: Colors.black45),
                    ),
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
                        MaterialPageRoute(
                          builder: (_) => const RegisterScreen(),
                        ),
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
      ),
    );
  }
}
