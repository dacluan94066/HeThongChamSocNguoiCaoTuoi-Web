import 'package:shared_preferences/shared_preferences.dart';

class HealthStorage {
  static const String keyHeartRate = 'health_heart_rate';
  static const String keySystolic = 'health_systolic';
  static const String keyDiastolic = 'health_diastolic';
  static const String keyTemperature = 'health_temperature';
  static const String keyBloodSugar = 'health_blood_sugar';
  static const String keyWeight = 'health_weight';
  static const String keyUpdatedAt = 'health_updated_at';

  static Future<Map<String, String>> loadHealthData() async {
    final prefs = await SharedPreferences.getInstance();

    return {
      'heartRate': prefs.getString(keyHeartRate) ?? '72',
      'systolic': prefs.getString(keySystolic) ?? '125',
      'diastolic': prefs.getString(keyDiastolic) ?? '80',
      'temperature': prefs.getString(keyTemperature) ?? '36.9',
      'bloodSugar': prefs.getString(keyBloodSugar) ?? '6.2',
      'weight': prefs.getString(keyWeight) ?? '60',
      'updatedAt': prefs.getString(keyUpdatedAt) ?? 'Chưa cập nhật',
    };
  }

  static Future<void> saveHealthData({
    required String heartRate,
    required String systolic,
    required String diastolic,
    required String temperature,
    required String bloodSugar,
    required String weight,
  }) async {
    final prefs = await SharedPreferences.getInstance();

    await prefs.setString(keyHeartRate, heartRate);

    await prefs.setString(keySystolic, systolic);

    await prefs.setString(keyDiastolic, diastolic);

    await prefs.setString(keyTemperature, temperature);

    await prefs.setString(keyBloodSugar, bloodSugar);

    await prefs.setString(keyWeight, weight);

    final now = DateTime.now();

    final day = now.day.toString().padLeft(2, '0');

    final month = now.month.toString().padLeft(2, '0');

    final hour = now.hour.toString().padLeft(2, '0');

    final minute = now.minute.toString().padLeft(2, '0');

    final formattedTime = '$day/$month/${now.year} • $hour:$minute';

    await prefs.setString(keyUpdatedAt, formattedTime);
  }
}
