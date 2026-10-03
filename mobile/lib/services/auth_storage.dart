import 'package:shared_preferences/shared_preferences.dart';

class AuthStorage {
  static const String keyPassword = 'user_password';

  // Mật khẩu mặc định cho bản demo lần đầu.
  static const String defaultPassword = '123456';

  static Future<String> getPassword() async {
    final prefs = await SharedPreferences.getInstance();

    return prefs.getString(keyPassword) ?? defaultPassword;
  }

  static Future<bool> checkPassword(String password) async {
    final savedPassword = await getPassword();

    return password == savedPassword;
  }

  static Future<void> changePassword(String newPassword) async {
    final prefs = await SharedPreferences.getInstance();

    await prefs.setString(keyPassword, newPassword);
  }

  static Future<void> resetPassword() async {
    final prefs = await SharedPreferences.getInstance();

    await prefs.setString(keyPassword, defaultPassword);
  }
}
