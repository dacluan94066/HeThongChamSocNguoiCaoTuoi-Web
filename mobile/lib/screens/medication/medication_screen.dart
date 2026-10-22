import 'package:flutter/material.dart';
import '../../utils/medication_status_display.dart';
import '../../widgets/foreground_refresh.dart';
import '../../services/mobile_realtime_service.dart';
import '../../theme/care_senior_theme.dart';
import '../../widgets/care_senior_ui.dart';

import '../../services/api_client.dart';
import '../../services/local_notification_service.dart';
import '../../services/medication_schedule_service.dart';
import '../appointments/appointment_screen.dart';
import 'medication_dashboard_ui.dart';
import 'medication_supplement_dialog.dart';

class MedicationScreen extends StatefulWidget {
  const MedicationScreen({super.key});

  @override
  State<MedicationScreen> createState() => _MedicationScreenState();
}

class _MedicationScreenState extends State<MedicationScreen>
    with ForegroundRefresh<MedicationScreen> {
  @override
  Future<void> refreshForeground() => _loadSchedule(refresh: true);
  static const _teal = CareSeniorColors.deepGreen;
  DateTime _selectedDay = DateTime.now();
  List<Map<String, dynamic>> _schedule = [];
  final Set<int> _updatingIds = {};
  bool _loading = true;
  bool _permissionExplanationShown = false;
  String? _error;
  int _loadSequence = 0;

  int get _completedCount =>
      _schedule.where((item) => item['trangThai'] == 'DaUong').length;

  @override
  void initState() {
    super.initState();
    MobileRealtimeService.instance.medicationRevision.addListener(
      _scheduleUpdated,
    );
    _loadSchedule();
  }

  void _scheduleUpdated() => _loadSchedule(refresh: true);

  @override
  void dispose() {
    MobileRealtimeService.instance.medicationRevision.removeListener(
      _scheduleUpdated,
    );
    super.dispose();
  }

  Future<void> _loadSchedule({bool refresh = false}) async {
    final sequence = ++_loadSequence;
    final version = ApiClient.sessionVersion;
    if (mounted && (_schedule.isEmpty || _error != null)) {
      setState(() {
        _loading = true;
        _error = null;
      });
    }
    try {
      final items = await MedicationScheduleService.instance
          .getScheduleByDateRange(_selectedDay, _selectedDay, refresh: refresh);
      if (!mounted ||
          version != ApiClient.sessionVersion ||
          sequence != _loadSequence) {
        return;
      }
      setState(() {
        _schedule = items;
        _loading = false;
        _error = null;
      });
      try {
        await _syncReminders();
      } catch (_) {
        if (mounted) {
          _showMessage(
            'Chưa đồng bộ được giờ nhắc thuốc; hãy thử tải lại khi có mạng.',
          );
        }
      }
    } catch (error) {
      if (!mounted ||
          version != ApiClient.sessionVersion ||
          sequence != _loadSequence) {
        return;
      }
      setState(() {
        _loading = false;
        _error = error is ApiException
            ? error.message
            : 'Không thể tải lịch uống thuốc hôm nay.';
      });
    }
  }

  Future<bool> _ensureNotificationPermission() async {
    if (!LocalNotificationService.supportsNotifications) return false;
    var enabled = await LocalNotificationService.areNotificationsEnabled();
    var exactAlarmAllowed =
        await LocalNotificationService.canScheduleExactNotifications();
    if (!mounted) return false;
    if (!enabled || !exactAlarmAllowed) {
      if (_permissionExplanationShown) return false;
      _permissionExplanationShown = true;
      final accepted = await showDialog<bool>(
        context: context,
        barrierDismissible: false,
        builder: (context) => AlertDialog(
          icon: const Icon(
            Icons.notifications_active_outlined,
            color: CareSeniorColors.primary,
            size: 44,
          ),
          title: const Text('Cho phép nhắc uống thuốc?'),
          content: const Text(
            'Ứng dụng cần quyền gửi thông báo và đặt báo thức chính xác để nhắc bạn uống đúng thuốc, đúng giờ ngay cả khi không mở ứng dụng. Android có thể mở thêm trang Cài đặt để bạn cho phép báo thức.',
            textAlign: TextAlign.center,
          ),
          actions: [
            TextButton(
              onPressed: () => Navigator.pop(context, false),
              child: const Text('Để sau'),
            ),
            FilledButton(
              style: FilledButton.styleFrom(
                backgroundColor: CareSeniorColors.deepGreen,
              ),
              onPressed: () => Navigator.pop(context, true),
              child: const Text('Tiếp tục'),
            ),
          ],
        ),
      );
      if (accepted != true) return false;
      if (!enabled) {
        enabled =
            await LocalNotificationService.requestNotificationPermission();
      }
    }
    if (!enabled && mounted) {
      _showMessage(
        'Chưa có quyền thông báo. Bạn có thể bật lại trong Cài đặt của điện thoại.',
      );
    }
    if (!enabled) return false;
    if (!exactAlarmAllowed) {
      exactAlarmAllowed =
          await LocalNotificationService.requestExactAlarmPermission();
    }
    if (!exactAlarmAllowed && mounted) {
      _showMessage(
        'Chưa có quyền đặt báo thức chính xác nên chưa thể tạo nhắc thuốc đúng giờ.',
      );
    }
    return exactAlarmAllowed;
  }

  Future<void> _syncReminders() async {
    if (!mounted) return;
    if (!await _ensureNotificationPermission()) return;
    await MedicationScheduleService.instance.syncUpcomingReminders(
      refresh: true,
    );
  }

  Future<void> _chooseStatus(Map<String, dynamic> item) async {
    final today = DateTime.now();
    if (_selectedDay.year != today.year ||
        _selectedDay.month != today.month ||
        _selectedDay.day != today.day ||
        item['trangThai'] != 'ChuaDenGio') {
      return;
    }
    final id = _asInt(item['id']);
    if (id == null || _updatingIds.contains(id)) return;
    final selected = await showModalBottomSheet<String>(
      context: context,
      backgroundColor: Colors.white,
      isScrollControlled: true,
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(28)),
      ),
      builder: (sheetContext) => MedicationStatusSheet(
        name: item['tenThuoc']?.toString() ?? 'Thuốc',
        detail:
            '${_formatTime(item['thoiGianDuKien'])} • ${item['lieuDung'] ?? 'Không rõ liều dùng'}',
        onTaken: () => Navigator.pop(sheetContext, 'DaUong'),
        onMissed: () => Navigator.pop(sheetContext, 'BoLo'),
      ),
    );
    if (selected == null || !mounted) return;
    await _confirmStatus(id, selected);
  }

  bool _canRecordMissedDose(Map<String, dynamic> item) {
    final now = DateTime.now();
    final id = _asInt(item['id']);
    final scheduled = _parseDateTime(item['thoiGianDuKien']);
    return _selectedDay.year == now.year &&
        _selectedDay.month == now.month &&
        _selectedDay.day == now.day &&
        scheduled != null &&
        scheduled.year == now.year &&
        scheduled.month == now.month &&
        scheduled.day == now.day &&
        item['trangThai'] == 'BoLo' &&
        id != null &&
        !_updatingIds.contains(id);
  }

  Future<void> _confirmMissedDose(Map<String, dynamic> item) async {
    if (!_canRecordMissedDose(item)) return;
    final id = _asInt(item['id'])!;
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (dialogContext) => MedicationLateConfirmationDialog(
        name: item['tenThuoc']?.toString() ?? 'Thuốc',
        detail:
            '${_formatTime(item['thoiGianDuKien'])} • ${item['lieuDung'] ?? 'Không rõ liều dùng'}',
        onCancel: () => Navigator.pop(dialogContext, false),
        onConfirm: () => Navigator.pop(dialogContext, true),
      ),
    );
    if (confirmed != true || !mounted) return;
    // A refresh, realtime event or midnight may change eligibility while the
    // dialog is open. Never apply its stale snapshot to a different state.
    final index = _schedule.indexWhere((dose) => _asInt(dose['id']) == id);
    if (index < 0 || !_canRecordMissedDose(_schedule[index])) {
      _showMessage('Liều thuốc đã thay đổi. Vui lòng kiểm tra lại lịch.');
      return;
    }
    await _confirmStatus(id, 'DaUong');
  }

  Future<void> _confirmStatus(int id, String status) async {
    setState(() => _updatingIds.add(id));
    try {
      final updated = await MedicationScheduleService.instance
          .confirmMedication(id, status);
      if (!mounted) return;
      setState(() {
        final index = _schedule.indexWhere((item) => _asInt(item['id']) == id);
        if (index >= 0) _schedule[index] = updated;
      });
      _showMessage(
        status == 'DaUong'
            ? 'Đã xác nhận uống thuốc.'
            : 'Đã ghi nhận bỏ lỡ liều thuốc.',
      );
    } catch (error) {
      if (!mounted) return;
      _showMessage(
        error is ApiException
            ? error.message
            : 'Không thể cập nhật trạng thái uống thuốc.',
      );
    } finally {
      if (mounted) setState(() => _updatingIds.remove(id));
    }
  }

  bool _canSupplement(Map<String, dynamic> item) {
    final id = _asInt(item['id']);
    final raw = item['thoiGianDuKien']?.toString();
    if (id == null ||
        id <= 0 ||
        raw == null ||
        !['BoLo', 'ChuaDenGio'].contains(item['trangThai'])) {
      return false;
    }
    // API DATETIME2 is a Vietnam wall-clock value, without a timezone suffix.
    final scheduled = DateTime.tryParse(
      '${raw.substring(0, raw.length < 19 ? raw.length : 19)}Z',
    );
    if (scheduled == null) return false;
    final now = DateTime.now().toUtc().add(const Duration(hours: 7));
    final today = DateTime.utc(now.year, now.month, now.day);
    return scheduled.isBefore(today) &&
        now.difference(scheduled) <= const Duration(hours: 48) &&
        item['ghiNhanBoSung'] == null &&
        !_updatingIds.contains(id);
  }

  Future<void> _recordSupplement(Map<String, dynamic> item) async {
    if (!_canSupplement(item)) return;
    final id = _asInt(item['id'])!;
    final version = ApiClient.sessionVersion;
    final values = await showDialog<Map<String, String>>(
      context: context,
      builder: (_) => MedicationSupplementDialog(
        name: item['tenThuoc']?.toString() ?? 'Thuốc',
        scheduled: _parseDateTime(item['thoiGianDuKien'])!,
      ),
    );
    if (!mounted || values == null || version != ApiClient.sessionVersion) {
      return;
    }
    final index = _schedule.indexWhere((dose) => _asInt(dose['id']) == id);
    if (index < 0 || !_canSupplement(_schedule[index])) {
      _showMessage('Liều thuốc đã thay đổi. Vui lòng tải lại lịch.');
      return;
    }
    setState(() => _updatingIds.add(id));
    try {
      final updated = await MedicationScheduleService.instance
          .supplementMedication(
            id,
            takenAt: values['thoiGianThucTe']!,
            reason: values['lyDo']!,
          );
      if (!mounted || version != ApiClient.sessionVersion) return;
      setState(() {
        final current = _schedule.indexWhere(
          (dose) => _asInt(dose['id']) == id,
        );
        if (current >= 0) _schedule[current] = updated;
      });
      _showMessage('Đã ghi nhận bổ sung liều thuốc đã uống.');
    } catch (error) {
      if (mounted && version == ApiClient.sessionVersion) {
        _showMessage(
          error is ApiException
              ? error.message
              : 'Không thể ghi nhận bổ sung. Vui lòng thử lại.',
        );
      }
    } finally {
      if (mounted) setState(() => _updatingIds.remove(id));
    }
  }

  void _showMessage(String message) {
    if (!mounted) return;
    ScaffoldMessenger.of(context)
      ..hideCurrentSnackBar()
      ..showSnackBar(SnackBar(content: Text(message)));
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: CareSeniorColors.background,

      body: _buildBody(),
    );
  }

  Widget _buildBody() {
    if (_loading) {
      return ListView(
        children: [
          MedicationHeader(selectedDay: _selectedDay, today: DateTime.now()),
          const Padding(
            padding: EdgeInsets.all(48),
            child: Center(
              child: CircularProgressIndicator(color: CareSeniorColors.primary),
            ),
          ),
        ],
      );
    }
    if (_error != null) {
      return ListView(
        children: [
          MedicationHeader(selectedDay: _selectedDay, today: DateTime.now()),
          Padding(
            padding: const EdgeInsets.all(20),
            child: AppCard(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  const Icon(
                    Icons.cloud_off_rounded,
                    size: 56,
                    color: CareSeniorColors.secondaryText,
                  ),
                  const SizedBox(height: 16),
                  Text(_error!, textAlign: TextAlign.center),
                  const SizedBox(height: 16),
                  FilledButton.icon(
                    onPressed: () => _loadSchedule(refresh: true),
                    icon: const Icon(Icons.refresh),
                    label: const Text('Thử lại'),
                  ),
                ],
              ),
            ),
          ),
        ],
      );
    }

    final total = _schedule.length;
    final today = DateTime.now();
    final selectedToday =
        _selectedDay.year == today.year &&
        _selectedDay.month == today.month &&
        _selectedDay.day == today.day;
    final days = List.generate(
      7,
      (index) => DateTime(today.year, today.month, today.day - 3 + index),
    );
    final groups = <String, List<Map<String, dynamic>>>{
      'Sáng': [],
      'Trưa': [],
      'Chiều': [],
      'Tối': [],
    };
    for (final dose in _schedule) {
      final hour = _parseDateTime(dose['thoiGianDuKien'])?.hour ?? 0;
      final key = hour < 11
          ? 'Sáng'
          : hour < 14
          ? 'Trưa'
          : hour < 18
          ? 'Chiều'
          : 'Tối';
      groups[key]!.add(dose);
    }
    return RefreshIndicator(
      color: CareSeniorColors.primary,
      onRefresh: () => _loadSchedule(refresh: true),
      child: ListView(
        key: const ValueKey('medication-list'),
        physics: const AlwaysScrollableScrollPhysics(),
        padding: EdgeInsets.zero,
        children: [
          MedicationHeader(
            selectedDay: _selectedDay,
            today: today,
            days: MedicationDayStrip(
              days: days,
              selectedDay: _selectedDay,
              onSelected: (day) {
                setState(() {
                  _selectedDay = day;
                  _loading = true;
                });
                _loadSchedule(refresh: true);
              },
            ),
          ),
          Padding(
            padding: const EdgeInsets.fromLTRB(20, 20, 20, 30),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                MedicationProgressCard(
                  completed: _completedCount,
                  total: total,
                  dateLabel: selectedToday
                      ? 'Hôm nay • ${_formatSelectedDay()}'
                      : _formatSelectedDay(),
                ),
                const SizedBox(height: 18),
                const AppSectionHeader(title: 'Các cữ thuốc trong ngày'),
                const SizedBox(height: 6),
                Text(
                  selectedToday
                      ? 'Chỉ các liều hôm nay mới có thể xác nhận.'
                      : _selectedDay.isBefore(
                          DateTime(today.year, today.month, today.day),
                        )
                      ? 'Liều ngày trước trong 48 giờ có thể ghi nhận bổ sung nếu đã thực sự uống.'
                      : 'Ngày khác chỉ dùng để xem lịch thuốc.',
                  style: const TextStyle(
                    fontSize: 16,
                    color: CareSeniorColors.secondaryText,
                  ),
                ),
                const SizedBox(height: 12),
                if (_schedule.isEmpty)
                  const AppEmptyState(
                    icon: Icons.event_available_rounded,
                    title: 'Ngày này chưa có lịch uống thuốc',
                    message:
                        'Lịch do người chăm sóc nhập trên Web sẽ xuất hiện tại đây.',
                  )
                else
                  ...groups.entries
                      .where((group) => group.value.isNotEmpty)
                      .expand(
                        (group) => [
                          Padding(
                            padding: const EdgeInsets.fromLTRB(2, 12, 2, 10),
                            child: Text(
                              'Buổi ${group.key}',
                              style: const TextStyle(
                                fontSize: 20,
                                fontWeight: FontWeight.w800,
                                color: _teal,
                              ),
                            ),
                          ),
                          ...group.value.map(_buildMedicationCard),
                        ],
                      ),
                const SizedBox(height: 18),
                const AppCard(
                  child: Row(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Icon(
                        Icons.notifications_active_outlined,
                        color: CareSeniorColors.deepGreen,
                      ),
                      SizedBox(width: 12),
                      Expanded(
                        child: Text(
                          'Giờ nhắc được đồng bộ từ lịch thuốc trên hệ thống. Khi mở ứng dụng, lịch nhắc 30 ngày tới sẽ được cập nhật.',
                          style: TextStyle(
                            fontSize: 16,
                            height: 1.4,
                            color: CareSeniorColors.secondaryText,
                          ),
                        ),
                      ),
                    ],
                  ),
                ),
                const SizedBox(height: 14),
                OutlinedButton(
                  onPressed: () => Navigator.push(
                    context,
                    MaterialPageRoute(
                      builder: (_) => const AppointmentScreen(),
                    ),
                  ),
                  child: const Row(
                    mainAxisAlignment: MainAxisAlignment.center,
                    children: [
                      Icon(Icons.calendar_month_outlined),
                      SizedBox(width: 10),
                      Flexible(
                        child: Text(
                          'Xem lịch khám',
                          textAlign: TextAlign.center,
                          style: TextStyle(fontSize: 17),
                        ),
                      ),
                    ],
                  ),
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildMedicationCard(Map<String, dynamic> item) {
    final id = _asInt(item['id']);
    final status = item['trangThai']?.toString() ?? 'ChuaDenGio';
    final updating = id != null && _updatingIds.contains(id);
    final statusColor = switch (status) {
      'DaUong' => CareSeniorColors.deepGreen,
      'BoLo' || 'TuChoi' => CareSeniorColors.danger,
      _ => CareSeniorColors.warning,
    };
    final statusLabel = medicationStatusLabel(status, item['thoiGianDuKien']);
    final now = DateTime.now();
    final canConfirm =
        _selectedDay.year == now.year &&
        _selectedDay.month == now.month &&
        _selectedDay.day == now.day &&
        status == 'ChuaDenGio' &&
        !updating;

    return MedicationDoseCard(
      key: ValueKey('medication-dose-${item['id']}'),
      name: item['tenThuoc']?.toString() ?? 'Không rõ tên thuốc',
      dose: item['lieuDung']?.toString() ?? 'Không rõ liều dùng',
      time: _formatTime(item['thoiGianDuKien']),
      instructions: item['cachDung']?.toString() ?? '',
      status: status,
      statusLabel: statusLabel,
      statusColor: statusColor,
      updating: updating,
      onSupplement: _canSupplement(item) ? () => _recordSupplement(item) : null,
      supplementaryNote: item['ghiNhanBoSung'] is Map
          ? 'Ghi nhận bổ sung\nĐã uống: ${_formatMoment(item['thoiGianThucTe'])}\nGhi nhận: ${_formatMoment(item['ghiNhanBoSung']['ngayGhiNhan'])}\nNgười ghi: ${item['ghiNhanBoSung']['nguoiGhiNhanTen']}\nLý do: ${item['ghiNhanBoSung']['lyDo']}'
          : null,
      onConfirm: _canRecordMissedDose(item)
          ? () => _confirmMissedDose(item)
          : canConfirm
          ? () => _chooseStatus(item)
          : null,
    );
  }

  static int? _asInt(Object? value) {
    if (value is int) return value;
    return int.tryParse(value?.toString() ?? '');
  }

  static String _formatMoment(Object? value) {
    final date = _parseDateTime(value);
    if (date == null) return 'Chưa có dữ liệu';
    String two(int number) => number.toString().padLeft(2, '0');
    return '${two(date.hour)}:${two(date.minute)} · ${two(date.day)}/${two(date.month)}/${date.year}';
  }

  static DateTime? _parseDateTime(Object? value) =>
      DateTime.tryParse(value?.toString() ?? '');

  static String _formatTime(Object? value) {
    final date = _parseDateTime(value);
    if (date == null) return '--:--';
    return '${date.hour.toString().padLeft(2, '0')}:'
        '${date.minute.toString().padLeft(2, '0')}';
  }

  String _formatSelectedDay() {
    final day = _selectedDay;
    return '${day.day.toString().padLeft(2, '0')}/'
        '${day.month.toString().padLeft(2, '0')}/${day.year}';
  }
}
