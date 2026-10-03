import 'package:shared_preferences/shared_preferences.dart';

class AuthStorage {
  // Chi dung de xoa mat khau demo cua cac ban app cu.
  // Xac thuc hien tai dung JWT trong flutter_secure_storage.
  static Future<void> clearLegacyPlainTextPassword() async {
    final prefs = await SharedPreferences.getInstance();
    await prefs.remove('user_password');
  }
}
