import 'package:timezone/timezone.dart' as tz;

/// The API returns SQL wall-clock times in Vietnam, without an offset.
class AppointmentReminderPlan {
  const AppointmentReminderPlan({
    required this.appointmentId,
    required this.hoursBefore,
    required this.appointmentTime,
    required this.fireAt,
    required this.hospital,
  });

  final String appointmentId;
  final int hoursBefore;
  final tz.TZDateTime appointmentTime;
  final tz.TZDateTime fireAt;
  final String hospital;

  String payload(String owner, bool exact) =>
      'appointment:$owner:$appointmentId:$hoursBefore:'
      '${fireAt.millisecondsSinceEpoch}:${Uri.encodeComponent(hospital)}:$exact';

  String get body {
    String two(int n) => n.toString().padLeft(2, '0');
    final d = appointmentTime;
    return 'Bạn có lịch khám tại $hospital lúc ${two(d.hour)}:${two(d.minute)} '
        'ngày ${two(d.day)}/${two(d.month)}/${d.year} (còn $hoursBefore giờ).';
  }

  static List<AppointmentReminderPlan> build(
    List<Map<String, dynamic>> appointments, {
    required DateTime now,
  }) {
    final location = tz.getLocation('Asia/Ho_Chi_Minh');
    final plans = <AppointmentReminderPlan>[];
    final seen = <String>{};
    for (final item in appointments) {
      if (item['trangThai'] != 'ChuaDen') continue;
      final id = item['id']?.toString();
      if (id == null || int.tryParse(id) == null || int.parse(id) <= 0) {
        continue;
      }
      final parsed = DateTime.tryParse(item['thoiGianKham']?.toString() ?? '');
      if (parsed == null) continue;
      final time = parsed.isUtc
          ? tz.TZDateTime.from(parsed, location)
          : tz.TZDateTime(
              location,
              parsed.year,
              parsed.month,
              parsed.day,
              parsed.hour,
              parsed.minute,
              parsed.second,
            );
      for (final hours in [24, 2]) {
        final fireAt = time.subtract(Duration(hours: hours));
        // Never turn a missed reminder into an immediate or daily notification.
        if (!fireAt.isAfter(now) || !seen.add('$id:$hours')) continue;
        plans.add(
          AppointmentReminderPlan(
            appointmentId: id,
            hoursBefore: hours,
            appointmentTime: time,
            fireAt: fireAt,
            hospital: item['tenBenhVien']?.toString().trim().isNotEmpty == true
                ? item['tenBenhVien'].toString().trim()
                : 'cơ sở y tế',
          ),
        );
      }
    }
    plans.sort((a, b) => a.fireAt.compareTo(b.fireAt));
    return plans;
  }
}
