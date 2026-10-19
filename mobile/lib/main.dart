import 'package:flutter/material.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'theme/care_senior_theme.dart';

import 'screens/auth/register_screen.dart';
import 'screens/auth/forgot_password_screen.dart';
import 'screens/auth/google_registration_screen.dart';
import 'services/local_notification_service.dart';
import 'services/auth_storage.dart';
import 'services/api_client.dart';
import 'services/auth_service.dart';
import 'services/google_sign_in_service.dart';
import 'screens/home/elderly_home_screen.dart';
import 'screens/appointments/appointment_screen.dart';
import 'screens/medication/medication_screen.dart';
import 'widgets/appointment_reminder_scope.dart';

Future<void> main() async {
  WidgetsFlutterBinding.ensureInitialized();

  await AuthStorage.clearLegacyPlainTextPassword();
  await LocalNotificationService.initialize();

  runApp(const ElderlyCareApp());
}

class ElderlyCareApp extends StatelessWidget {
  const ElderlyCareApp({super.key});

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      navigatorKey: ApiClient.navigatorKey,
      debugShowCheckedModeBanner: false,
      title: 'Chăm sóc người cao tuổi',
      theme: CareSeniorTheme.data,
      routes: {
        '/welcome': (_) => const WelcomeScreen(),
        '/login': (_) => const LoginScreen(),
        '/home': (_) => const SessionHomeScreen(),
        '/appointments': (_) => const AppointmentScreen(),
        '/medications': (_) => const MedicationScreen(),
      },
      home: const SplashScreen(),
    );
  }
}

Widget homeForRole(String? role) => switch (role) {
  'NguoiCaoTuoi' => const AppointmentReminderScope(child: HomeScreen()),
  _ => const LoginScreen(),
};

class SessionHomeScreen extends StatefulWidget {
  const SessionHomeScreen({super.key});
  @override
  State<SessionHomeScreen> createState() => _SessionHomeScreenState();
}

class _SessionHomeScreenState extends State<SessionHomeScreen> {
  late Future<Map<String, dynamic>?> _user;
  @override
  void initState() {
    super.initState();
    _user = AuthService.instance.getStoredUser();
  }

  @override
  Widget build(BuildContext context) => FutureBuilder<Map<String, dynamic>?>(
    future: _user,
    builder: (context, snapshot) {
      if (snapshot.connectionState != ConnectionState.done) {
        return const Scaffold(body: Center(child: CircularProgressIndicator()));
      }
      if (snapshot.hasError) {
        return Scaffold(
          body: Center(
            child: TextButton(
              onPressed: () => setState(() {
                _user = AuthService.instance.getStoredUser();
              }),
              child: const Text('Không thể đọc phiên đăng nhập. Thử lại'),
            ),
          ),
        );
      }
      return homeForRole(snapshot.data?['tenVaiTro']?.toString());
    },
  );
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

    try {
      final authService = AuthService.instance;
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
      } else {
        await authService.logout();
        if (!mounted) return;
        setState(() {
          _checkingSession = false;
          _unsupportedRole = true;
          _connectionError =
              'Tài khoản này không hỗ trợ trên ứng dụng Mobile, vui lòng dùng hệ thống Web';
        });
      }
    } on ApiException catch (error) {
      if (error.statusCode == 401) {
        await AuthService.instance.logout();
        if (!mounted) return;
        ApiClient.redirectToLogin();
        return;
      }

      if (!mounted) return;
      setState(() {
        _checkingSession = false;
        _connectionError = error.isConnectionFailure
            ? 'Không thể kết nối máy chủ, kiểm tra lại mạng'
            : error.message;
      });
    } catch (_) {
      if (!mounted) return;
      setState(() {
        _checkingSession = false;
        _connectionError =
            'Không thể khôi phục phiên. Kiểm tra kết nối và thử lại.';
      });
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: CareSeniorColors.deepGreen,
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
  Widget build(BuildContext context) => Scaffold(
    backgroundColor: CareSeniorColors.background,
    body: SafeArea(
      child: ListView(
        padding: const EdgeInsets.fromLTRB(20, 24, 20, 28),
        children: [
          ClipRRect(
            borderRadius: BorderRadius.circular(26),
            child: Image.asset(
              'assets/login_hero.png',
              height: 300,
              width: double.infinity,
              fit: BoxFit.cover,
            ),
          ),
          const SizedBox(height: 24),
          const Text(
            'CareSenior',
            textAlign: TextAlign.center,
            style: TextStyle(
              fontSize: 32,
              fontWeight: FontWeight.w800,
              color: CareSeniorColors.deepGreen,
            ),
          ),
          const SizedBox(height: 8),
          const Text(
            'Đồng hành chăm sóc sức khỏe người cao tuổi',
            textAlign: TextAlign.center,
            style: TextStyle(
              fontSize: 19,
              fontWeight: FontWeight.w700,
              color: CareSeniorColors.text,
            ),
          ),
          const SizedBox(height: 8),
          const Text(
            'Theo dõi sức khỏe, nhắc uống thuốc và hỗ trợ khẩn cấp khi cần.',
            textAlign: TextAlign.center,
            style: TextStyle(
              fontSize: 16,
              height: 1.4,
              color: CareSeniorColors.secondaryText,
            ),
          ),
          const SizedBox(height: 30),
          FilledButton(
            onPressed: () => Navigator.push(
              context,
              MaterialPageRoute(builder: (_) => const LoginScreen()),
            ),
            child: const Text('Đăng nhập'),
          ),
          const SizedBox(height: 12),
          OutlinedButton(
            onPressed: () => Navigator.push(
              context,
              MaterialPageRoute(builder: (_) => const RegisterScreen()),
            ),
            child: const Text('Đăng ký tài khoản'),
          ),
          const SizedBox(height: 12),
          OutlinedButton.icon(
            onPressed: () {
              ScaffoldMessenger.of(context).showSnackBar(
                const SnackBar(
                  content: Text('Đăng nhập Google sẽ được kết nối ở bước sau.'),
                ),
              );
            },
            icon: const Text(
              'G',
              style: TextStyle(fontSize: 19, fontWeight: FontWeight.bold),
            ),
            label: const Text('Tiếp tục với Google'),
          ),
        ],
      ),
    ),
  );
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
  static const _deepGreen = Color(0xff185a49);
  static const _fieldGreen = Color(0xfff1f8f3);
  final TextEditingController usernameController = TextEditingController();

  final TextEditingController passwordController = TextEditingController();

  bool obscurePassword = true;

  bool loggingIn = false;
  bool rememberUsername = false;

  @override
  void initState() {
    super.initState();
    _loadRememberedUsername();
  }

  Future<void> _loadRememberedUsername() async {
    try {
      final preferences = await SharedPreferences.getInstance();
      if (!mounted) return;
      final remembered =
          preferences.getBool('login_remember_username') ?? false;
      setState(() => rememberUsername = remembered);
      if (remembered && usernameController.text.isEmpty) {
        usernameController.text = preferences.getString('login_username') ?? '';
      }
    } catch (_) {
      // Ghi nhớ tên đăng nhập là tiện ích tùy chọn, không chặn đăng nhập.
    }
  }

  Future<void> _saveRememberedUsername(String username) async {
    try {
      final preferences = await SharedPreferences.getInstance();
      await preferences.setBool('login_remember_username', rememberUsername);
      if (rememberUsername) {
        await preferences.setString('login_username', username);
      } else {
        await preferences.remove('login_username');
      }
    } catch (_) {
      // Không lưu mật khẩu và không làm thất bại phiên đăng nhập.
    }
  }

  @override
  void dispose() {
    usernameController.dispose();
    passwordController.dispose();

    super.dispose();
  }

  Future<void> login() async {
    final username = usernameController.text.trim();
    final password = passwordController.text;

    // ==================================================
    // KIỂM TRA BỎ TRỐNG
    // ==================================================
    if (username.isEmpty || password.isEmpty) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(
          content: Text('Vui lòng nhập tên đăng nhập, email hoặc số điện thoại và mật khẩu.'),
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

    setState(() {
      loggingIn = true;
    });

    try {
      final user = await AuthService.instance.login(username, password);
      if (!mounted) return;
      final role = user['tenVaiTro']?.toString();
      if (role == 'NguoiCaoTuoi') {
        await _saveRememberedUsername(username);
        if (!mounted) return;
        Navigator.pushNamedAndRemoveUntil(context, '/home', (route) => false);
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

  Future<void> loginWithGoogle() async {
    setState(() => loggingIn = true);
    try {
      final identity = await GoogleSignInService.instance.authenticate();
      final result = await AuthService.instance.loginWithGoogle(
        identity.idToken,
      );
      if (!mounted) return;

      if (result.requiresRegistration) {
        final profile = result.googleProfile;
        final completed = await Navigator.push<bool>(
          context,
          MaterialPageRoute(
            builder: (_) => GoogleRegistrationScreen(
              idToken: identity.idToken,
              email: profile['email']?.toString() ?? identity.email,
              displayName: profile['hoTen']?.toString() ?? identity.displayName,
            ),
          ),
        );
        if (!mounted) return;
        if (completed == true) {
          Navigator.pushNamedAndRemoveUntil(context, '/home', (route) => false);
        } else {
          await GoogleSignInService.instance.signOut();
        }
        return;
      }
      Navigator.pushNamedAndRemoveUntil(context, '/home', (route) => false);
    } on ApiException catch (error) {
      await GoogleSignInService.instance.signOut();
      if (!mounted) return;
      ScaffoldMessenger.of(
        context,
      ).showSnackBar(SnackBar(content: Text(error.message)));
    } catch (_) {
      await GoogleSignInService.instance.signOut();
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(
          content: Text('Không thể đăng nhập Google. Vui lòng thử lại.'),
        ),
      );
    } finally {
      if (mounted) setState(() => loggingIn = false);
    }
  }

  InputDecoration _inputDecoration(
    String hint,
    IconData icon, {
    Widget? suffixIcon,
  }) {
    final border = OutlineInputBorder(
      borderRadius: BorderRadius.circular(15),
      borderSide: const BorderSide(color: Color(0xffd8e8dc)),
    );
    return InputDecoration(
      hintText: hint,
      hintStyle: const TextStyle(color: Color(0xff688078), fontSize: 16),
      prefixIcon: Icon(icon, color: _deepGreen),
      suffixIcon: suffixIcon,
      filled: true,
      fillColor: _fieldGreen,
      contentPadding: const EdgeInsets.symmetric(horizontal: 16, vertical: 18),
      border: border,
      enabledBorder: border,
      focusedBorder: border.copyWith(
        borderSide: const BorderSide(color: Color(0xff278d63), width: 2),
      ),
    );
  }

  Widget _hero(BuildContext context) => SizedBox(
    width: double.infinity,
    height: 244,
    child: Stack(
      fit: StackFit.expand,
      children: [
        Image.asset(
          'assets/login_hero.png',
          fit: BoxFit.cover,
          alignment: Alignment.centerRight,
        ),
        const DecoratedBox(
          decoration: BoxDecoration(
            gradient: LinearGradient(
              begin: Alignment.centerLeft,
              end: Alignment.centerRight,
              colors: [Color(0xeafffff7), Color(0xaafffff7), Color(0x00ffffff)],
              stops: [0, 0.40, 0.72],
            ),
          ),
        ),
        Padding(
          padding: const EdgeInsets.fromLTRB(22, 22, 18, 22),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              const Icon(
                Icons.favorite_rounded,
                color: Color(0xff278d63),
                size: 43,
              ),
              const SizedBox(height: 8),
              const Text(
                'CareSenior',
                style: TextStyle(
                  fontSize: 25,
                  fontWeight: FontWeight.w800,
                  color: _deepGreen,
                ),
              ),
              if (MediaQuery.textScalerOf(context).scale(1) <= 1.4) ...[
                const Text(
                  'Đồng hành chăm sóc',
                  style: TextStyle(
                    fontSize: 16,
                    fontWeight: FontWeight.w700,
                    color: _deepGreen,
                  ),
                ),
                const Text(
                  'sức khỏe người cao tuổi',
                  style: TextStyle(
                    fontSize: 16,
                    fontWeight: FontWeight.w700,
                    color: _deepGreen,
                  ),
                ),
              ],
              const Spacer(),
              if (MediaQuery.textScalerOf(context).scale(1) <= 1.4)
                const Text(
                  'Sống khỏe hơn\nmỗi ngày ♡',
                  style: TextStyle(
                    fontSize: 17,
                    fontStyle: FontStyle.italic,
                    fontWeight: FontWeight.w600,
                    color: _deepGreen,
                  ),
                ),
            ],
          ),
        ),
        if (Navigator.canPop(context))
          Positioned(
            top: 10,
            right: 10,
            child: IconButton.filledTonal(
              tooltip: 'Quay lại',
              constraints: const BoxConstraints(minWidth: 56, minHeight: 56),
              onPressed: () => Navigator.pop(context),
              icon: const Icon(Icons.arrow_back),
            ),
          ),
      ],
    ),
  );

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: const Color(0xffedf7ee),
      body: SafeArea(
        child: LayoutBuilder(
          builder: (context, constraints) => SingleChildScrollView(
            keyboardDismissBehavior: ScrollViewKeyboardDismissBehavior.onDrag,
            child: ConstrainedBox(
              constraints: BoxConstraints(minHeight: constraints.maxHeight),
              child: Column(
                children: [
                  _hero(context),
                  Transform.translate(
                    offset: const Offset(0, -22),
                    child: Padding(
                      padding: const EdgeInsets.symmetric(horizontal: 16),
                      child: Container(
                        width: double.infinity,
                        padding: const EdgeInsets.fromLTRB(22, 24, 22, 26),
                        decoration: BoxDecoration(
                          color: Colors.white,
                          borderRadius: BorderRadius.circular(30),
                          boxShadow: const [
                            BoxShadow(
                              color: Color(0x190e5b47),
                              blurRadius: 24,
                              offset: Offset(0, 10),
                            ),
                          ],
                        ),
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.stretch,
                          children: [
                            const Text(
                              'Đăng nhập',
                              textAlign: TextAlign.center,
                              style: TextStyle(
                                fontSize: 27,
                                fontWeight: FontWeight.w800,
                                color: _deepGreen,
                              ),
                            ),
                            const SizedBox(height: 6),
                            const Text(
                              'Chào mừng bạn quay trở lại!',
                              textAlign: TextAlign.center,
                              style: TextStyle(
                                fontSize: 18,
                                fontWeight: FontWeight.w700,
                                color: _deepGreen,
                              ),
                            ),
                            const SizedBox(height: 4),
                            const Text(
                              'Vui lòng đăng nhập để tiếp tục sử dụng.',
                              textAlign: TextAlign.center,
                              style: TextStyle(
                                fontSize: 16,
                                color: Color(0xff5c746b),
                              ),
                            ),
                            const SizedBox(height: 25),
                            const Text(
                              'Tên đăng nhập, email hoặc số điện thoại',
                              style: TextStyle(
                                fontSize: 16,
                                fontWeight: FontWeight.w700,
                                color: _deepGreen,
                              ),
                            ),
                            const SizedBox(height: 8),
                            TextField(
                              controller: usernameController,
                              keyboardType: TextInputType.text,
                              textInputAction: TextInputAction.next,
                              autofillHints: const [AutofillHints.username],
                              autocorrect: false,
                              style: const TextStyle(fontSize: 17),
                              decoration: _inputDecoration(
                                'Nhập tên đăng nhập, email hoặc số điện thoại',
                                Icons.person_outline,
                              ),
                            ),
                            const SizedBox(height: 18),
                            const Text(
                              'Mật khẩu',
                              style: TextStyle(
                                fontSize: 16,
                                fontWeight: FontWeight.w700,
                                color: _deepGreen,
                              ),
                            ),
                            const SizedBox(height: 8),
                            TextField(
                              controller: passwordController,
                              obscureText: obscurePassword,
                              textInputAction: TextInputAction.done,
                              autofillHints: const [AutofillHints.password],
                              style: const TextStyle(fontSize: 17),
                              onSubmitted: (_) {
                                if (!loggingIn) login();
                              },
                              decoration: _inputDecoration(
                                'Nhập mật khẩu',
                                Icons.lock_outline,
                                suffixIcon: IconButton(
                                  tooltip: obscurePassword
                                      ? 'Hiện mật khẩu'
                                      : 'Ẩn mật khẩu',
                                  constraints: const BoxConstraints(
                                    minWidth: 56,
                                    minHeight: 56,
                                  ),
                                  onPressed: () => setState(
                                    () => obscurePassword = !obscurePassword,
                                  ),
                                  icon: Icon(
                                    obscurePassword
                                        ? Icons.visibility_off_outlined
                                        : Icons.visibility_outlined,
                                  ),
                                ),
                              ),
                            ),
                            const SizedBox(height: 10),
                            Material(
                              type: MaterialType.transparency,
                              child: CheckboxListTile(
                                value: rememberUsername,
                                onChanged: (value) => setState(
                                  () => rememberUsername = value ?? false,
                                ),
                                activeColor: const Color(0xff278d63),
                                controlAffinity:
                                    ListTileControlAffinity.leading,
                                contentPadding: EdgeInsets.zero,
                                title: const Text(
                                  'Ghi nhớ tên đăng nhập',
                                  style: TextStyle(
                                    fontSize: 16,
                                    color: _deepGreen,
                                    fontWeight: FontWeight.w600,
                                  ),
                                ),
                              ),
                            ),
                            Align(
                              alignment: Alignment.centerRight,
                              child: TextButton(
                                onPressed: () => Navigator.push(
                                  context,
                                  MaterialPageRoute(
                                    builder: (_) =>
                                        const ForgotPasswordScreen(),
                                  ),
                                ),
                                child: const Text(
                                  'Quên mật khẩu?',
                                  style: TextStyle(
                                    fontSize: 16,
                                    color: Color(0xff278d63),
                                    fontWeight: FontWeight.w700,
                                  ),
                                ),
                              ),
                            ),
                            const SizedBox(height: 14),
                            SizedBox(
                              height: 58,
                              child: DecoratedBox(
                                decoration: BoxDecoration(
                                  gradient: const LinearGradient(
                                    colors: [
                                      Color(0xff5caf6d),
                                      Color(0xff16875c),
                                    ],
                                  ),
                                  borderRadius: BorderRadius.circular(30),
                                ),
                                child: ElevatedButton.icon(
                                  onPressed: loggingIn ? null : login,
                                  style: ElevatedButton.styleFrom(
                                    backgroundColor: Colors.transparent,
                                    foregroundColor: Colors.white,
                                    disabledBackgroundColor: Colors.transparent,
                                    shadowColor: Colors.transparent,
                                    elevation: 0,
                                    shape: RoundedRectangleBorder(
                                      borderRadius: BorderRadius.circular(30),
                                    ),
                                  ),
                                  icon: loggingIn
                                      ? const SizedBox(
                                          width: 22,
                                          height: 22,
                                          child: CircularProgressIndicator(
                                            strokeWidth: 2,
                                            color: Colors.white,
                                          ),
                                        )
                                      : const Icon(Icons.arrow_forward),
                                  label: Text(
                                    loggingIn
                                        ? 'Đang đăng nhập...'
                                        : 'Đăng nhập',
                                    style: const TextStyle(
                                      fontSize: 18,
                                      fontWeight: FontWeight.w800,
                                    ),
                                  ),
                                ),
                              ),
                            ),
                            const SizedBox(height: 21),
                            const Row(
                              children: [
                                Expanded(
                                  child: Divider(color: Color(0xffdce8df)),
                                ),
                                Padding(
                                  padding: EdgeInsets.symmetric(horizontal: 14),
                                  child: Text(
                                    'hoặc',
                                    style: TextStyle(
                                      fontSize: 16,
                                      color: Color(0xff6b8279),
                                    ),
                                  ),
                                ),
                                Expanded(
                                  child: Divider(color: Color(0xffdce8df)),
                                ),
                              ],
                            ),
                            const SizedBox(height: 18),
                            SizedBox(
                              height: 56,
                              child: OutlinedButton.icon(
                                onPressed: loggingIn ? null : loginWithGoogle,
                                icon: const Text(
                                  'G',
                                  style: TextStyle(
                                    fontSize: 21,
                                    fontWeight: FontWeight.w800,
                                    color: Color(0xff4285f4),
                                  ),
                                ),
                                label: const Text(
                                  'Tiếp tục với Google',
                                  style: TextStyle(
                                    fontSize: 16,
                                    fontWeight: FontWeight.w700,
                                  ),
                                ),
                                style: OutlinedButton.styleFrom(
                                  foregroundColor: _deepGreen,
                                  side: const BorderSide(
                                    color: Color(0xffd8e8dc),
                                  ),
                                  shape: RoundedRectangleBorder(
                                    borderRadius: BorderRadius.circular(15),
                                  ),
                                ),
                              ),
                            ),
                            const SizedBox(height: 15),
                            Wrap(
                              alignment: WrapAlignment.center,
                              crossAxisAlignment: WrapCrossAlignment.center,
                              children: [
                                const Text(
                                  'Chưa có tài khoản?',
                                  style: TextStyle(fontSize: 16),
                                ),
                                TextButton(
                                  onPressed: () => Navigator.push(
                                    context,
                                    MaterialPageRoute(
                                      builder: (_) => const RegisterScreen(),
                                    ),
                                  ),
                                  child: const Text(
                                    'Đăng ký ngay',
                                    style: TextStyle(
                                      fontSize: 16,
                                      fontWeight: FontWeight.w700,
                                      color: Color(0xff278d63),
                                    ),
                                  ),
                                ),
                              ],
                            ),
                          ],
                        ),
                      ),
                    ),
                  ),
                ],
              ),
            ),
          ),
        ),
      ),
    );
  }
}
