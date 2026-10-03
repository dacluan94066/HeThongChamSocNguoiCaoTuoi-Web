import 'dart:convert';

import 'package:shared_preferences/shared_preferences.dart';

class MedicationStorage {
  static const String _statusKey = 'medication_status_v2';

  static const String _reminderStatusKey = 'medication_reminder_status_v2';

  static const String _reminderTimesKey = 'medication_reminder_times_v2';

  // =====================================================
  // THUỐC MẶC ĐỊNH
  // =====================================================

  static const List<String> medicines = [
    'Metformin 500mg',
    'Lisinopril 10mg',
    'Aspirin 81mg',
    'Vitamin D3',
  ];

  static Map<String, bool> get defaultMedicationStatus => {
    'Metformin 500mg': true,
    'Lisinopril 10mg': true,
    'Aspirin 81mg': false,
    'Vitamin D3': false,
  };

  static Map<String, bool> get defaultReminderStatus => {
    'Metformin 500mg': true,
    'Lisinopril 10mg': true,
    'Aspirin 81mg': true,
    'Vitamin D3': true,
  };

  static Map<String, String> get defaultReminderTimes => {
    'Metformin 500mg': '08:00',
    'Lisinopril 10mg': '08:00',
    'Aspirin 81mg': '13:00',
    'Vitamin D3': '20:00',
  };

  // =====================================================
  // LOAD TRẠNG THÁI ĐÃ UỐNG
  // =====================================================

  static Future<Map<String, bool>> loadMedicationStatus() async {
    final prefs = await SharedPreferences.getInstance();

    final raw = prefs.getString(_statusKey);

    if (raw != null && raw.isNotEmpty) {
      try {
        final decoded = Map<String, dynamic>.from(jsonDecode(raw));

        final result = defaultMedicationStatus;

        for (final medicine in medicines) {
          if (decoded.containsKey(medicine)) {
            result[medicine] = decoded[medicine] == true;
          }
        }

        return result;
      } catch (_) {}
    }

    // Hỗ trợ dữ liệu cũ đã lưu trước đây.
    final result = defaultMedicationStatus;

    result['Metformin 500mg'] =
        prefs.getBool('med_metformin_done') ?? result['Metformin 500mg']!;

    result['Lisinopril 10mg'] =
        prefs.getBool('med_lisinopril_done') ?? result['Lisinopril 10mg']!;

    result['Aspirin 81mg'] =
        prefs.getBool('med_aspirin_done') ?? result['Aspirin 81mg']!;

    result['Vitamin D3'] =
        prefs.getBool('med_vitamin_d3_done') ?? result['Vitamin D3']!;

    await _saveMedicationStatusMap(result);

    return result;
  }

  // =====================================================
  // SAVE ĐÃ UỐNG / CHƯA UỐNG
  // =====================================================

  static Future<void> saveMedicationStatus({
    required String medicineName,
    required bool done,
  }) async {
    final data = await loadMedicationStatus();

    data[medicineName] = done;

    await _saveMedicationStatusMap(data);
  }

  static Future<void> _saveMedicationStatusMap(Map<String, bool> data) async {
    final prefs = await SharedPreferences.getInstance();

    await prefs.setString(_statusKey, jsonEncode(data));

    // Đồng thời lưu key cũ để tương thích code trước đây.
    await prefs.setBool('med_metformin_done', data['Metformin 500mg'] ?? false);

    await prefs.setBool(
      'med_lisinopril_done',
      data['Lisinopril 10mg'] ?? false,
    );

    await prefs.setBool('med_aspirin_done', data['Aspirin 81mg'] ?? false);

    await prefs.setBool('med_vitamin_d3_done', data['Vitamin D3'] ?? false);
  }

  // =====================================================
  // LOAD BẬT / TẮT NHẮC THUỐC
  // =====================================================

  static Future<Map<String, bool>> loadReminderStatus() async {
    final prefs = await SharedPreferences.getInstance();

    final raw = prefs.getString(_reminderStatusKey);

    if (raw != null && raw.isNotEmpty) {
      try {
        final decoded = Map<String, dynamic>.from(jsonDecode(raw));

        final result = defaultReminderStatus;

        for (final medicine in medicines) {
          if (decoded.containsKey(medicine)) {
            result[medicine] = decoded[medicine] == true;
          }
        }

        return result;
      } catch (_) {}
    }

    final result = defaultReminderStatus;

    await _saveReminderStatusMap(result);

    return result;
  }

  // =====================================================
  // SAVE BẬT / TẮT NHẮC THUỐC
  // =====================================================

  static Future<void> saveReminderStatus({
    required String medicineName,
    required bool enabled,
  }) async {
    final data = await loadReminderStatus();

    data[medicineName] = enabled;

    await _saveReminderStatusMap(data);
  }

  static Future<void> _saveReminderStatusMap(Map<String, bool> data) async {
    final prefs = await SharedPreferences.getInstance();

    await prefs.setString(_reminderStatusKey, jsonEncode(data));
  }

  // =====================================================
  // LOAD GIỜ NHẮC THUỐC
  // =====================================================

  static Future<Map<String, String>> loadReminderTimes() async {
    final prefs = await SharedPreferences.getInstance();

    final raw = prefs.getString(_reminderTimesKey);

    if (raw != null && raw.isNotEmpty) {
      try {
        final decoded = Map<String, dynamic>.from(jsonDecode(raw));

        final result = defaultReminderTimes;

        for (final medicine in medicines) {
          final value = decoded[medicine]?.toString();

          if (value != null && value.trim().isNotEmpty) {
            result[medicine] = value.trim();
          }
        }

        return result;
      } catch (_) {}
    }

    // ===================================================
    // MIGRATE DỮ LIỆU GIỜ CŨ NẾU CÓ
    // ===================================================

    final result = defaultReminderTimes;

    final oldMetformin = prefs.getString('reminder_time_metformin');

    final oldLisinopril = prefs.getString('reminder_time_lisinopril');

    final oldAspirin = prefs.getString('reminder_time_aspirin');

    final oldVitamin = prefs.getString('reminder_time_vitamin_d3');

    if (oldMetformin != null && oldMetformin.isNotEmpty) {
      result['Metformin 500mg'] = oldMetformin;
    }

    if (oldLisinopril != null && oldLisinopril.isNotEmpty) {
      result['Lisinopril 10mg'] = oldLisinopril;
    }

    if (oldAspirin != null && oldAspirin.isNotEmpty) {
      result['Aspirin 81mg'] = oldAspirin;
    }

    if (oldVitamin != null && oldVitamin.isNotEmpty) {
      result['Vitamin D3'] = oldVitamin;
    }

    await _saveReminderTimesMap(result);

    return result;
  }

  // =====================================================
  // SAVE GIỜ NHẮC
  // =====================================================

  static Future<void> saveReminderTime({
    required String medicineName,
    required String time,
  }) async {
    final data = await loadReminderTimes();

    data[medicineName] = time;

    await _saveReminderTimesMap(data);
  }

  // Hàm này để tương thích nếu màn Thuốc đang gọi tên khác.
  static Future<void> saveMedicationReminderTime({
    required String medicineName,
    required String time,
  }) async {
    await saveReminderTime(medicineName: medicineName, time: time);
  }

  static Future<void> _saveReminderTimesMap(Map<String, String> data) async {
    final prefs = await SharedPreferences.getInstance();

    await prefs.setString(_reminderTimesKey, jsonEncode(data));

    // Lưu thêm key cũ để code cũ vẫn đọc được.
    await prefs.setString(
      'reminder_time_metformin',
      data['Metformin 500mg'] ?? '08:00',
    );

    await prefs.setString(
      'reminder_time_lisinopril',
      data['Lisinopril 10mg'] ?? '08:00',
    );

    await prefs.setString(
      'reminder_time_aspirin',
      data['Aspirin 81mg'] ?? '13:00',
    );

    await prefs.setString(
      'reminder_time_vitamin_d3',
      data['Vitamin D3'] ?? '20:00',
    );
  }

  // =====================================================
  // RESET TRẠNG THÁI UỐNG THUỐC
  // =====================================================

  static Future<void> resetAll() async {
    final data = <String, bool>{
      for (final medicine in medicines) medicine: false,
    };

    await _saveMedicationStatusMap(data);
  }
}
