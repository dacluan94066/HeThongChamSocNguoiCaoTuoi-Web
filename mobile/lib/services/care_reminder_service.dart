import 'dart:convert';
import 'package:shared_preferences/shared_preferences.dart';
import 'api_client.dart';
import 'local_notification_service.dart';

class CareReminderService {
  static int _generation = 0;
  static String? _signature;
  static Future<void> _queue = Future.value();
  static bool _initialized = false;
  static void initialize() {
    if (_initialized) return;
    _initialized = true;
    ApiClient.sessionChanges.addListener(() {
      clear().catchError((Object _) {});
    });
  }

  static Future<bool> enabled() async =>
      (await SharedPreferences.getInstance()).getBool('care_local_reminders') ??
      false;
  static Future<void> setEnabled(bool value) async {
    await (await SharedPreferences.getInstance()).setBool(
      'care_local_reminders',
      value,
    );
  }

  static Future<void> clear() {
    _generation++;
    _signature = null;
    final work = _queue
        .catchError((Object _) {})
        .then((_) => LocalNotificationService.cancelCareReminders());
    _queue = work;
    return work;
  }

  static List<Map<String, dynamic>> pending(
    List<Map<String, dynamic>> items,
    DateTime now,
  ) => items
      .where(
        (i) =>
            i['kind'] == 'care' &&
            i['trangThai'] != 'completed' &&
            DateTime.tryParse('${i['thoiGian']}+07:00')?.isAfter(now) == true,
      )
      .toList();
  static Future<void> sync(
    int profileId,
    List<Map<String, dynamic>> items,
    bool enabled,
  ) {
    final generation = _generation, session = ApiClient.sessionVersion;
    final signature = '$session:$profileId:$enabled:${jsonEncode(items)}';
    final work = _queue.catchError((Object _) {}).then((_) async {
      if (generation != _generation ||
          session != ApiClient.sessionVersion ||
          signature == _signature) {
        return;
      }
      await LocalNotificationService.cancelCareReminders();
      if (!enabled) {
        _signature = signature;
        return;
      }
      final upcoming = pending(items, DateTime.now());
      for (final item in upcoming.take(200)) {
        if (generation != _generation || session != ApiClient.sessionVersion) {
          return;
        }
        // IDs are allocated within a separate range; schedules are one-shot, not daily repeats.
        await LocalNotificationService.scheduleCareActivity(
          id: 1900000000 + upcoming.indexOf(item),
          profileId: profileId,
          time: DateTime.parse('${item['thoiGian']}+07:00'),
          title: item['ten'].toString(),
        );
      }
      if (generation == _generation && session == ApiClient.sessionVersion) {
        _signature = signature;
      }
    });
    _queue = work;
    return work;
  }
}
