import 'package:shared_preferences/shared_preferences.dart';

class ProfileStorage {
  static const String keyName = 'profile_name';
  static const String keyBirthDate = 'profile_birth_date';
  static const String keyGender = 'profile_gender';
  static const String keyPhone = 'profile_phone';
  static const String keyAddress = 'profile_address';
  static const String keyBloodType = 'profile_blood_type';
  static const String keyHeight = 'profile_height';
  static const String keyWeight = 'profile_weight';

  static Future<Map<String, String>> loadProfile() async {
    final prefs = await SharedPreferences.getInstance();

    return {
      'name': prefs.getString(keyName) ?? 'Nguyễn Văn An',
      'birthDate': prefs.getString(keyBirthDate) ?? '10/06/1948',
      'gender': prefs.getString(keyGender) ?? 'Nam',
      'phone': prefs.getString(keyPhone) ?? '0912345678',
      'address': prefs.getString(keyAddress) ?? 'TP. Hồ Chí Minh',
      'bloodType': prefs.getString(keyBloodType) ?? 'O+',
      'height': prefs.getString(keyHeight) ?? '165',
      'weight': prefs.getString(keyWeight) ?? '60',
    };
  }

  static Future<void> saveProfile({
    required String name,
    required String birthDate,
    required String gender,
    required String phone,
    required String address,
    required String bloodType,
    required String height,
    required String weight,
  }) async {
    final prefs = await SharedPreferences.getInstance();

    await prefs.setString(keyName, name);
    await prefs.setString(keyBirthDate, birthDate);
    await prefs.setString(keyGender, gender);
    await prefs.setString(keyPhone, phone);
    await prefs.setString(keyAddress, address);
    await prefs.setString(keyBloodType, bloodType);
    await prefs.setString(keyHeight, height);
    await prefs.setString(keyWeight, weight);
  }
}
