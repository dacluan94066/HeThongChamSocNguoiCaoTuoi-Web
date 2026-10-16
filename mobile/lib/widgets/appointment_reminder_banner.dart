import 'package:flutter/material.dart';
import '../services/api_client.dart';
import '../services/appointment_service.dart';
import '../services/local_notification_service.dart';

class AppointmentReminderBanner extends StatefulWidget {
  const AppointmentReminderBanner({super.key});
  @override
  State<AppointmentReminderBanner> createState() =>
      _AppointmentReminderBannerState();
}

class _AppointmentReminderBannerState extends State<AppointmentReminderBanner> {
  bool _busy = false;

  Future<void> _enable() async {
    if (_busy) return;
    final session = ApiClient.sessionVersion;
    bool current() => mounted && session == ApiClient.sessionVersion;
    setState(() => _busy = true);
    try {
      if (!await LocalNotificationService.areNotificationsEnabled()) {
        if (!mounted || !current()) return;
        final allow = await showDialog<bool>(
          context: context,
          builder: (context) => AlertDialog(
            title: const Text('Cho phép nhắc lịch khám?'),
            content: const Text(
              'CareSenior cần quyền thông báo để nhắc bạn trước '
              'lịch khám 24 giờ và 2 giờ, kể cả khi không mở ứng dụng.',
            ),
            actions: [
              TextButton(
                onPressed: () => Navigator.pop(context, false),
                child: const Text('Để sau'),
              ),
              FilledButton(
                onPressed: () => Navigator.pop(context, true),
                child: const Text('Cho phép'),
              ),
            ],
          ),
        );
        if (!current() || allow != true) return;
        final granted =
            await LocalNotificationService.requestNotificationPermission();
        if (!mounted || !current()) return;
        if (!granted) {
          LocalNotificationService.appointmentState.value =
              AppointmentReminderState.denied;
          ScaffoldMessenger.of(context).showSnackBar(
            const SnackBar(
              content: Text(
                'Chưa có quyền thông báo. Bạn có thể bật trong Cài đặt > Ứng dụng > CareSenior > Thông báo.',
              ),
            ),
          );
          return;
        }
      }
      if (!await LocalNotificationService.canScheduleExactNotifications()) {
        if (!mounted || !current()) return;
        final exact = await showDialog<bool>(
          context: context,
          builder: (context) => AlertDialog(
            title: const Text('Nhắc đúng giờ'),
            content: const Text(
              'Cho phép Báo thức và lời nhắc để nhắc đúng mốc 24 giờ '
              'và 2 giờ. Nếu không cấp, Android có thể gửi nhắc muộn hơn.',
            ),
            actions: [
              TextButton(
                onPressed: () => Navigator.pop(context, false),
                child: const Text('Để sau'),
              ),
              FilledButton(
                onPressed: () => Navigator.pop(context, true),
                child: const Text('Mở cài đặt'),
              ),
            ],
          ),
        );
        if (!current()) return;
        if (exact == true) {
          await LocalNotificationService.requestExactAlarmPermission();
        }
      }
      if (current()) {
        await AppointmentService.instance.getAppointments(refresh: true);
      }
    } catch (_) {
      if (current()) {
        LocalNotificationService.appointmentState.value =
            AppointmentReminderState.error;
      }
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    if (!LocalNotificationService.supportsNotifications) {
      return const SizedBox.shrink();
    }
    return ValueListenableBuilder<AppointmentReminderState>(
      valueListenable: LocalNotificationService.appointmentState,
      builder: (context, state, _) {
        final ready = state == AppointmentReminderState.ready;
        final message = switch (state) {
          AppointmentReminderState.loading => 'Đang đồng bộ nhắc lịch khám…',
          AppointmentReminderState.ready =>
            'Đã bật nhắc trước 24 giờ và 2 giờ.',
          AppointmentReminderState.approximate =>
            'Đã bật nhắc; cần quyền báo thức để nhắc đúng giờ.',
          AppointmentReminderState.denied =>
            'Chưa bật thông báo nhắc lịch khám.',
          AppointmentReminderState.error =>
            'Chưa đồng bộ được lịch nhắc. Vui lòng thử lại.',
        };
        return Card(
          child: Padding(
            padding: const EdgeInsets.all(12),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  message,
                  style: TextStyle(
                    color: ready ? Colors.teal : Colors.deepOrange,
                  ),
                ),
                if (!ready && state != AppointmentReminderState.loading)
                  TextButton.icon(
                    onPressed: _busy ? null : _enable,
                    icon: const Icon(Icons.notifications_active_outlined),
                    label: Text(
                      _busy
                          ? 'Đang xử lý…'
                          : state == AppointmentReminderState.error
                          ? 'Thử lại'
                          : 'Bật nhắc lịch khám',
                    ),
                  ),
              ],
            ),
          ),
        );
      },
    );
  }
}
