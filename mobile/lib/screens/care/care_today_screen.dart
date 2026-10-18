import 'package:flutter/material.dart';
import '../../services/api_client.dart';
import '../../services/care_today_service.dart';
import '../../services/local_notification_service.dart';
import '../../services/care_reminder_service.dart';
import '../assistant/care_assistant_records_screen.dart';
import '../../models/care_assistant.dart';
import '../medication/medication_screen.dart';
import '../appointments/appointment_screen.dart';
import 'care_plan_screen.dart';
import 'care_lifestyle_screen.dart';
import 'care_handoff_screen.dart';
import 'care_report_screen.dart';
import '../health/health_screen.dart';

class CareTodayScreen extends StatefulWidget {
  const CareTodayScreen({
    super.key,
    this.profileId,
    this.service = const CareTodayService(),
  });
  final int? profileId;
  final CareTodayService service;
  @override
  State<CareTodayScreen> createState() => _CareTodayScreenState();
}

class _CareTodayScreenState extends State<CareTodayScreen> {
  List<Map<String, dynamic>> _profiles = [];
  Map<String, dynamic>? _data;
  int? _id;
  int _sequence = 0;
  bool _loading = true, _saving = false, _reminders = false;
  String? _error;
  BuildContext? _confirmationContext;
  final int _session = ApiClient.sessionVersion;
  @override
  void initState() {
    super.initState();
    _id = widget.profileId;
    ApiClient.sessionChanges.addListener(_sessionChanged);
    _load();
  }

  void _sessionChanged() {
    _sequence++;
    CareReminderService.clear().catchError((Object _) {});
    if (mounted) {
      final dialog = _confirmationContext;
      _confirmationContext = null;
      if (dialog != null &&
          dialog.mounted &&
          ModalRoute.of(dialog)?.isCurrent == true) {
        Navigator.of(dialog).pop();
      }
      setState(() {
        _data = null;
        _profiles = [];
        _loading = false;
        _error = 'Phiên đã thay đổi. Hãy đăng nhập lại.';
      });
    }
  }

  @override
  void dispose() {
    ApiClient.sessionChanges.removeListener(_sessionChanged);
    super.dispose();
  }

  Future<void> _load() async {
    if (_session != ApiClient.sessionVersion) return;
    final sequence = ++_sequence, id = _id;
    if (mounted) {
      setState(() {
        _loading = true;
        _error = null;
        _data = null;
      });
    }
    try {
      final profiles = await widget.service.profiles();
      final selected =
          id ??
          (profiles.isEmpty ? null : (profiles.first['id'] as num).toInt());
      if (selected != null && !profiles.any((p) => p['id'] == selected)) {
        throw const ApiException('Hồ sơ không còn được phân công.');
      }
      final data = selected == null
          ? null
          : await widget.service.today(selected);
      final enabled = await CareReminderService.enabled();
      final reminders = selected != null && data != null
          ? await _reminderItems(selected, data, enabled)
          : <Map<String, dynamic>>[];
      if (!mounted ||
          sequence != _sequence ||
          _session != ApiClient.sessionVersion) {
        return;
      }
      setState(() {
        _profiles = profiles;
        _id = selected;
        _data = data;
        _loading = false;
        _reminders = enabled;
      });
      if (selected != null && data != null) {
        await CareReminderService.sync(selected, reminders, enabled);
      }
    } catch (e) {
      if (mounted &&
          sequence == _sequence &&
          _session == ApiClient.sessionVersion) {
        setState(() {
          _loading = false;
          _error = e is ApiException
              ? e.message
              : 'Không thể tải chăm sóc hôm nay.';
        });
      }
    }
  }

  static List<Map<String, dynamic>> _items(Map<String, dynamic> data) =>
      (data['items'] as List)
          .map((e) => Map<String, dynamic>.from(e as Map))
          .toList();
  Future<List<Map<String, dynamic>>> _reminderItems(
    int id,
    Map<String, dynamic> data,
    bool enabled,
  ) async {
    if (!enabled) return _items(data);
    final week = await widget.service.plans(id);
    return (week['occurrences'] as List)
        .map((r) => Map<String, dynamic>.from(r as Map))
        .toList();
  }

  Future<void> _open(Map<String, dynamic> item) async {
    if (_saving || _id == null || _session != ApiClient.sessionVersion) return;
    if (item['kind'] == 'care') {
      if (_data?['canWrite'] != true || item['trangThai'] == 'completed') {
        return;
      }
      final accepted = await showDialog<bool>(
        context: context,
        builder: (c) {
          _confirmationContext = c;
          return AlertDialog(
            title: const Text('Xác nhận hoàn thành?'),
            content: Text(
              '${item['ten']}\n${item['thoiGian']}\nChỉ xác nhận khi hoạt động đã thực hiện.',
            ),
            actions: [
              TextButton(
                onPressed: () => Navigator.pop(c, false),
                child: const Text('Hủy'),
              ),
              FilledButton(
                onPressed: () => Navigator.pop(c, true),
                child: const Text('Đã thực hiện'),
              ),
            ],
          );
        },
      );
      if (accepted != true ||
          !mounted ||
          _session != ApiClient.sessionVersion) {
        return;
      }
      setState(() => _saving = true);
      try {
        await widget.service.complete(
          _id!,
          (item['hoatDongId'] as num).toInt(),
          item['ngay'] as String,
        );
        await _load();
      } catch (e) {
        _notice(
          e is ApiException
              ? e.message
              : 'Chưa lưu được xác nhận. Hãy tải lại trước khi thử tiếp.',
        );
      } finally {
        if (mounted) setState(() => _saving = false);
      }
    } else {
      final own = _data?['canWrite'] != true;
      final action = item['kind'] == 'medication'
          ? AssistantAction.medications
          : AssistantAction.appointments;
      await Navigator.push(
        context,
        MaterialPageRoute(
          builder: (_) => own
              ? (action == AssistantAction.medications
                    ? const MedicationScreen()
                    : const AppointmentScreen())
              : CareAssistantRecordsScreen(
                  action: action,
                  profile: AssistantProfile(
                    _id!,
                    _data?['profile']?['hoTen']?.toString() ?? 'Hồ sơ',
                  ),
                ),
        ),
      );
      await _load();
    }
  }

  @override
  Widget build(BuildContext context) {
    final data = _data, progress = data?['progress'];
    return Scaffold(
      backgroundColor: const Color(0xfff4f6f5),
      appBar: AppBar(
        title: const Text('Chăm sóc hôm nay'),
        actions: [
          IconButton(
            onPressed: _loading ? null : _load,
            icon: const Icon(Icons.refresh),
            tooltip: 'Tải lại',
          ),
        ],
      ),
      body: SafeArea(
        child: RefreshIndicator(
          onRefresh: _load,
          child: ListView(
            physics: const AlwaysScrollableScrollPhysics(),
            padding: const EdgeInsets.all(16),
            children: [
              if (_profiles.isNotEmpty)
                DropdownButtonFormField<int>(
                  key: ValueKey(_id),
                  initialValue: _id,
                  isExpanded: true,
                  decoration: const InputDecoration(
                    labelText: 'Hồ sơ đang xem',
                  ),
                  items: _profiles
                      .map(
                        (p) => DropdownMenuItem(
                          value: (p['id'] as num).toInt(),
                          child: Text(
                            p['hoTen']?.toString() ?? 'Hồ sơ',
                            overflow: TextOverflow.ellipsis,
                          ),
                        ),
                      )
                      .toList(),
                  onChanged: _saving || _loading
                      ? null
                      : (id) async {
                          await CareReminderService.clear();
                          if (!mounted) return;
                          setState(() => _id = id);
                          await _load();
                        },
                ),
              const SizedBox(height: 12),
              if (_loading)
                const Center(child: CircularProgressIndicator())
              else if (_error != null)
                Column(
                  children: [
                    Text(_error!),
                    TextButton(
                      onPressed: _session == ApiClient.sessionVersion
                          ? _load
                          : null,
                      child: const Text('Thử lại'),
                    ),
                  ],
                )
              else if (data == null)
                const Text('Chưa có hồ sơ liên kết hoặc được phân công.')
              else ...[
                Text(
                  '${_greeting()}! ${data['profile']?['hoTen'] ?? ''}',
                  style: const TextStyle(
                    fontSize: 21,
                    fontWeight: FontWeight.bold,
                  ),
                ),
                Text('${data['date']} • Giờ Việt Nam'),
                const SizedBox(height: 12),
                Text(
                  'Đã xác nhận ${progress['completed']}/${progress['total']} việc theo lịch',
                ),
                Wrap(
                  spacing: 8,
                  children: [
                    OutlinedButton.icon(
                      onPressed: _saving
                          ? null
                          : () async {
                              await Navigator.push(
                                context,
                                MaterialPageRoute(
                                  builder: (_) => CareReportScreen(
                                    profileId: _id!,
                                    service: widget.service,
                                  ),
                                ),
                              );
                              await _load();
                            },
                      icon: const Icon(Icons.assessment_outlined),
                      label: const Text('Báo cáo 7/30 ngày'),
                    ),
                    OutlinedButton.icon(
                      onPressed: _saving
                          ? null
                          : () async {
                              await Navigator.push(
                                context,
                                MaterialPageRoute(
                                  builder: (_) => HealthScreen(
                                    profileId: data['canWrite'] == true
                                        ? _id
                                        : null,
                                  ),
                                ),
                              );
                              await _load();
                            },
                      icon: const Icon(Icons.monitor_heart_outlined),
                      label: const Text('Biểu đồ sức khỏe'),
                    ),
                  ],
                ),
                if (data['canWrite'] == true)
                  OutlinedButton.icon(
                    onPressed: _saving
                        ? null
                        : () async {
                            await Navigator.push(
                              context,
                              MaterialPageRoute(
                                builder: (_) => CareHandoffScreen(
                                  profileId: _id!,
                                  profileName:
                                      data['profile']?['hoTen']?.toString() ??
                                      '',
                                  service: widget.service,
                                ),
                              ),
                            );
                            await _load();
                          },
                    icon: const Icon(Icons.swap_horiz),
                    label: const Text('Bàn giao chăm sóc'),
                  ),
                OutlinedButton.icon(
                  onPressed: _saving
                      ? null
                      : () async {
                          await Navigator.push(
                            context,
                            MaterialPageRoute(
                              builder: (_) => CareLifestyleScreen(
                                profileId: _id!,
                                profileName:
                                    data['profile']?['hoTen']?.toString() ?? '',
                                service: widget.service,
                              ),
                            ),
                          );
                          await _load();
                        },
                  icon: const Icon(Icons.local_drink_outlined),
                  label: const Text('Sinh hoạt hằng ngày'),
                ),
                if ((progress['total'] as num) > 0)
                  LinearProgressIndicator(
                    value:
                        (progress['completed'] as num) /
                        (progress['total'] as num),
                    color: const Color(0xff07856d),
                  ),
                if (data['truncated'] == true)
                  const Text(
                    'Danh sách thuốc/lịch khám có giới hạn; xem màn hình chi tiết.',
                  ),
                FilledButton.icon(
                  onPressed: _saving
                      ? null
                      : () async {
                          await Navigator.push(
                            context,
                            MaterialPageRoute(
                              builder: (_) => CarePlanScreen(
                                profileId: _id!,
                                canWrite: data['canWrite'] == true,
                                service: widget.service,
                              ),
                            ),
                          );
                          await _load();
                        },
                  icon: const Icon(Icons.event_note),
                  label: const Text('Kế hoạch chăm sóc'),
                ),
                SwitchListTile(
                  contentPadding: EdgeInsets.zero,
                  title: const Text('Nhắc hoạt động trên điện thoại'),
                  subtitle: Text(
                    LocalNotificationService.supportsNotifications
                        ? 'Nhắc cục bộ trong 7 ngày tới, tối đa 200 lần. Không phải push; không dùng thay SOS.'
                        : 'Thiết bị này không hỗ trợ nhắc cục bộ Android.',
                  ),
                  value: _reminders,
                  onChanged:
                      !LocalNotificationService.supportsNotifications || _saving
                      ? null
                      : (enabled) async {
                          setState(() => _saving = true);
                          try {
                            if (enabled &&
                                !await LocalNotificationService.requestNotificationPermission()) {
                              throw const ApiException(
                                'Chưa được cấp quyền thông báo.',
                              );
                            }
                            final reminders = await _reminderItems(
                              _id!,
                              data,
                              enabled,
                            );
                            if (_session != ApiClient.sessionVersion) return;
                            await CareReminderService.sync(
                              _id!,
                              reminders,
                              enabled,
                            );
                            if (_session != ApiClient.sessionVersion) return;
                            await CareReminderService.setEnabled(enabled);
                            if (mounted &&
                                _session == ApiClient.sessionVersion) {
                              setState(() => _reminders = enabled);
                            }
                          } catch (e) {
                            if (context.mounted) {
                              ScaffoldMessenger.of(context).showSnackBar(
                                SnackBar(
                                  content: Text(
                                    e is ApiException
                                        ? e.message
                                        : 'Không thể đặt nhắc việc.',
                                  ),
                                ),
                              );
                            }
                          } finally {
                            if (mounted) setState(() => _saving = false);
                          }
                        },
                ),
                if (_items(data).isEmpty)
                  const Padding(
                    padding: EdgeInsets.all(20),
                    child: Text(
                      'Chưa có lịch thuốc, lịch khám hoặc hoạt động chăm sóc hôm nay.',
                    ),
                  ),
                ..._items(data).map(
                  (item) => Card(
                    elevation: 0,
                    child: ListTile(
                      isThreeLine: true,
                      leading: Icon(
                        item['kind'] == 'medication'
                            ? Icons.medication_outlined
                            : item['kind'] == 'appointment'
                            ? Icons.calendar_month
                            : Icons.checklist,
                        color: const Color(0xff07856d),
                      ),
                      title: Text(item['ten'].toString()),
                      subtitle: Text(
                        '${item['thoiGian'].toString().substring(11, 16)} • ${_status(item['trangThai'])}\n${item['kind'] == 'care' ? item['keHoachTen'] : 'Mở chi tiết'}',
                      ),
                      trailing: item['trangThai'] == 'completed'
                          ? const Icon(
                              Icons.check_circle,
                              color: Color(0xff07856d),
                            )
                          : const Icon(Icons.chevron_right),
                      onTap: _saving ? null : () => _open(item),
                    ),
                  ),
                ),
              ],
            ],
          ),
        ),
      ),
    );
  }

  void _notice(String text) {
    if (mounted && _session == ApiClient.sessionVersion) {
      ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(text)));
    }
  }

  static String _status(dynamic s) => s == 'completed'
      ? 'Đã hoàn thành'
      : s == 'upcoming'
      ? 'Sắp tới'
      : 'Chưa có xác nhận';
  static String _greeting() {
    final hour = DateTime.now().toUtc().add(const Duration(hours: 7)).hour;
    return hour < 12
        ? 'Chào buổi sáng'
        : hour < 18
        ? 'Chào buổi chiều'
        : 'Chào buổi tối';
  }
}

class CareTodayEntry extends StatelessWidget {
  const CareTodayEntry({super.key, this.profileId});
  final int? profileId;
  @override
  Widget build(BuildContext context) => Card(
    elevation: 0,
    child: ListTile(
      leading: const Icon(Icons.today, color: Color(0xff07856d)),
      title: const Text('Chăm sóc hôm nay'),
      subtitle: const Text('Thuốc, lịch khám và hoạt động theo thời gian'),
      trailing: const Icon(Icons.chevron_right),
      onTap: () => Navigator.push(
        context,
        MaterialPageRoute(
          builder: (_) => CareTodayScreen(profileId: profileId),
        ),
      ),
    ),
  );
}
