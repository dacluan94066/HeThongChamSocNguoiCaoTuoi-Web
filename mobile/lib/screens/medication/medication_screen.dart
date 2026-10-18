import 'package:flutter/material.dart';

import '../../services/api_client.dart';
import '../../services/local_notification_service.dart';
import '../../services/medication_schedule_service.dart';

class MedicationScreen extends StatefulWidget {
  const MedicationScreen({super.key, this.profileId});
  final int? profileId;

  @override
  State<MedicationScreen> createState() => _MedicationScreenState();
}

class _MedicationScreenState extends State<MedicationScreen> {
  DateTime _selectedDate = DateTime.now();
  List<Map<String, dynamic>> _schedule = [];
  final Set<int> _updatingIds = {};
  bool _loading = true;
  bool _permissionExplanationShown = false;
  String? _error;

  int get _completedCount =>
      _schedule.where((item) => item['trangThai'] == 'DaUong').length;
  int get _missedCount =>
      _schedule.where((item) => item['trangThai'] == 'BoLo').length;
  int get _refusedCount =>
      _schedule.where((item) => item['trangThai'] == 'TuChoi').length;
  int get _pendingCount =>
      _schedule.where((item) => item['trangThai'] == 'ChuaDenGio').length;

  double get _adherenceRate {
    final confirmed = _completedCount + _missedCount + _refusedCount;
    if (confirmed == 0) return _completedCount > 0 ? 1.0 : 0.0;
    return _completedCount / confirmed;
  }

  @override
  void initState() {
    super.initState();
    _loadSchedule();
  }

  @override
  void didUpdateWidget(covariant MedicationScreen oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (oldWidget.profileId != widget.profileId) {
      _loadSchedule(refresh: true);
    }
  }

  bool _isToday(DateTime date) {
    final now = DateTime.now();
    return date.year == now.year && date.month == now.month && date.day == now.day;
  }

  Future<void> _loadSchedule({bool refresh = false}) async {
    if (mounted && (_schedule.isEmpty || _error != null)) {
      setState(() {
        _loading = true;
        _error = null;
      });
    }
    try {
      final items = await MedicationScheduleService.instance
          .getScheduleByDateRange(
            _selectedDate,
            _selectedDate,
            profileId: widget.profileId,
            refresh: refresh,
          );
      if (!mounted) return;
      setState(() {
        _schedule = items;
        _loading = false;
        _error = null;
      });
      if (_isToday(_selectedDate) && widget.profileId == null) {
        await _resetTodayReminders(items);
      }
    } catch (error) {
      if (!mounted) return;
      setState(() {
        _loading = false;
        _error = error is ApiException
            ? error.message
            : 'Không thể tải lịch uống thuốc.';
      });
    }
  }

  void _changeDate(DateTime newDate) {
    if (_selectedDate.year == newDate.year &&
        _selectedDate.month == newDate.month &&
        _selectedDate.day == newDate.day) {
      return;
    }
    setState(() {
      _selectedDate = newDate;
      _schedule = [];
      _loading = true;
    });
    _loadSchedule();
  }

  Future<void> _pickDate() async {
    final picked = await showDatePicker(
      context: context,
      initialDate: _selectedDate,
      firstDate: DateTime.now().subtract(const Duration(days: 365)),
      lastDate: DateTime.now().add(const Duration(days: 365)),
      builder: (context, child) {
        return Theme(
          data: Theme.of(context).copyWith(
            colorScheme: const ColorScheme.light(
              primary: Color(0xff07856d),
              onPrimary: Colors.white,
            ),
          ),
          child: child!,
        );
      },
    );
    if (picked != null) {
      _changeDate(picked);
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
            color: Color(0xff07856d),
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
                backgroundColor: const Color(0xff07856d),
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

  Future<void> _resetTodayReminders(List<Map<String, dynamic>> items) async {
    await LocalNotificationService.cancelMedicationReminders();
    if (!mounted || items.isEmpty) return;
    if (!await _ensureNotificationPermission()) return;

    final now = DateTime.now();
    for (final item in items) {
      if (item['trangThai'] != 'ChuaDenGio') continue;
      final date = _parseDateTime(item['thoiGianDuKien']);
      final id = _asInt(item['id']);
      if (date == null || id == null || !date.isAfter(now)) continue;
      final name = item['tenThuoc']?.toString().trim();
      final dose = item['lieuDung']?.toString().trim();
      final description = [
        name,
        dose,
      ].where((part) => part != null && part.isNotEmpty).join(' - ');
      await LocalNotificationService.scheduleDailyMedication(
        id: 100000 + id,
        medicineName: description.isEmpty ? 'thuốc của bạn' : description,
        hour: date.hour,
        minute: date.minute,
      );
    }
  }

  Future<void> _chooseStatus(Map<String, dynamic> item) async {
    final id = _asInt(item['id']);
    if (id == null || _updatingIds.contains(id)) return;

    final result = await showModalBottomSheet<Map<String, String?>>(
      context: context,
      isScrollControlled: true,
      backgroundColor: Colors.white,
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(28)),
      ),
      builder: (sheetContext) {
        return _MedicationStatusSheet(
          medicineName: item['tenThuoc']?.toString() ?? 'Thuốc',
          dosageInfo: '${_formatTime(item['thoiGianDuKien'])} • ${item['lieuDung'] ?? 'Không rõ liều'}',
        );
      },
    );

    if (result == null || !mounted) return;
    final status = result['status'];
    final reason = result['reason'];
    if (status == null) return;

    await _confirmStatus(id, status, reason);
  }

  Future<void> _confirmStatus(int id, String status, [String? reason]) async {
    setState(() => _updatingIds.add(id));
    try {
      final updated = await MedicationScheduleService.instance
          .confirmMedication(id, status, ghiChu: reason);
      if (!mounted) return;
      setState(() {
        final index = _schedule.indexWhere((item) => _asInt(item['id']) == id);
        if (index >= 0) _schedule[index] = updated;
      });
      await LocalNotificationService.cancelNotification(100000 + id);
      final msg = switch (status) {
        'DaUong' => 'Đã xác nhận uống thuốc.',
        'BoLo' => 'Đã ghi nhận bỏ lỡ liều thuốc.',
        'TuChoi' => 'Đã ghi nhận từ chối uống thuốc.',
        _ => 'Đã cập nhật trạng thái.',
      };
      _showMessage(msg);
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

  void _showMessage(String message) {
    if (!mounted) return;
    ScaffoldMessenger.of(context)
      ..hideCurrentSnackBar()
      ..showSnackBar(SnackBar(content: Text(message)));
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: const Color(0xfff3f3f1),
      appBar: AppBar(
        backgroundColor: const Color(0xfff3f3f1),
        elevation: 0,
        centerTitle: true,
        title: Text(
          widget.profileId != null ? 'Lịch uống thuốc của cụ' : 'Lịch uống thuốc',
          style: const TextStyle(fontWeight: FontWeight.bold),
        ),
        actions: [
          IconButton(
            tooltip: 'Chọn ngày',
            icon: const Icon(Icons.calendar_month_outlined),
            onPressed: _pickDate,
          ),
        ],
      ),
      body: _buildBody(),
    );
  }

  Widget _buildBody() {
    if (_loading) {
      return const Center(
        child: CircularProgressIndicator(color: Color(0xff07856d)),
      );
    }
    if (_error != null) {
      return Center(
        child: Padding(
          padding: const EdgeInsets.all(28),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              const Icon(Icons.cloud_off_rounded, size: 58, color: Colors.grey),
              const SizedBox(height: 14),
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
      );
    }

    final total = _schedule.length;
    final morningDoses = <Map<String, dynamic>>[];
    final afternoonDoses = <Map<String, dynamic>>[];
    final eveningDoses = <Map<String, dynamic>>[];

    for (final item in _schedule) {
      final date = _parseDateTime(item['thoiGianDuKien']);
      final hour = date?.hour ?? 8;
      if (hour < 11) {
        morningDoses.add(item);
      } else if (hour < 17) {
        afternoonDoses.add(item);
      } else {
        eveningDoses.add(item);
      }
    }

    return RefreshIndicator(
      color: const Color(0xff07856d),
      onRefresh: () => _loadSchedule(refresh: true),
      child: ListView(
        physics: const AlwaysScrollableScrollPhysics(),
        padding: const EdgeInsets.fromLTRB(18, 6, 18, 30),
        children: [
          _buildDateSelector(),
          const SizedBox(height: 14),
          _buildAdherenceCard(total),
          const SizedBox(height: 14),
          _buildInfoBanner(),
          const SizedBox(height: 20),
          if (total == 0)
            _buildEmptyState()
          else ...[
            if (morningDoses.isNotEmpty)
              _buildDoseGroup('Buổi sáng (trước 11h)', Icons.wb_sunny_outlined, morningDoses, const Color(0xfffff7e6), const Color(0xffd48806)),
            if (afternoonDoses.isNotEmpty)
              _buildDoseGroup('Buổi trưa / chiều (11h - 17h)', Icons.wb_twilight_rounded, afternoonDoses, const Color(0xffe6f7ff), const Color(0xff096dd9)),
            if (eveningDoses.isNotEmpty)
              _buildDoseGroup('Buổi tối (sau 17h)', Icons.nightlight_round_outlined, eveningDoses, const Color(0xfff9f0ff), const Color(0xff722ed1)),
          ],
        ],
      ),
    );
  }

  Widget _buildDateSelector() {
    final now = DateTime.now();
    final today = DateTime(now.year, now.month, now.day);
    final isToday = _selectedDate.year == today.year &&
        _selectedDate.month == today.month &&
        _selectedDate.day == today.day;
    final tomorrow = today.add(const Duration(days: 1));
    final isTomorrow = _selectedDate.year == tomorrow.year &&
        _selectedDate.month == tomorrow.month &&
        _selectedDate.day == tomorrow.day;

    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 8),
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(20),
      ),
      child: Row(
        children: [
          IconButton(
            tooltip: 'Ngày trước',
            icon: const Icon(Icons.chevron_left_rounded),
            onPressed: () => _changeDate(_selectedDate.subtract(const Duration(days: 1))),
          ),
          Expanded(
            child: GestureDetector(
              onTap: _pickDate,
              child: Column(
                children: [
                  Text(
                    isToday ? 'Hôm nay' : (isTomorrow ? 'Ngày mai' : 'Lịch ngày'),
                    style: const TextStyle(fontSize: 12, color: Colors.black54),
                  ),
                  const SizedBox(height: 2),
                  FittedBox(
                    fit: BoxFit.scaleDown,
                    child: Row(
                      mainAxisAlignment: MainAxisAlignment.center,
                      mainAxisSize: MainAxisSize.min,
                      children: [
                        Text(
                          '${_selectedDate.day.toString().padLeft(2, '0')}/${_selectedDate.month.toString().padLeft(2, '0')}/${_selectedDate.year}',
                          style: const TextStyle(fontSize: 16, fontWeight: FontWeight.bold),
                        ),
                        const SizedBox(width: 4),
                        const Icon(Icons.arrow_drop_down_rounded, size: 20, color: Color(0xff07856d)),
                      ],
                    ),
                  ),
                ],
              ),
            ),
          ),
          IconButton(
            tooltip: 'Ngày sau',
            icon: const Icon(Icons.chevron_right_rounded),
            onPressed: () => _changeDate(_selectedDate.add(const Duration(days: 1))),
          ),
        ],
      ),
    );
  }

  Widget _buildAdherenceCard(int total) {
    final ratePercent = (_adherenceRate * 100).toInt();
    final rateColor = ratePercent >= 80
        ? const Color(0xff07856d)
        : (ratePercent >= 50 ? const Color(0xffdf8a19) : const Color(0xffd65a45));

    return Container(
      padding: const EdgeInsets.all(18),
      decoration: BoxDecoration(
        gradient: LinearGradient(
          colors: [
            rateColor.withValues(alpha: 0.12),
            const Color(0xffffffff),
          ],
        ),
        borderRadius: BorderRadius.circular(28),
        border: Border.all(color: rateColor.withValues(alpha: 0.2)),
      ),
      child: Column(
        children: [
          Row(
            children: [
              CircleAvatar(
                radius: 26,
                backgroundColor: Colors.white,
                child: Icon(
                  Icons.medication_rounded,
                  color: rateColor,
                  size: 28,
                ),
              ),
              const SizedBox(width: 14),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      '$_completedCount/$total liều đã uống',
                      style: const TextStyle(fontSize: 18, fontWeight: FontWeight.bold),
                    ),
                    const SizedBox(height: 2),
                    Text(
                      'Tỷ lệ tuân thủ: $ratePercent%',
                      style: TextStyle(
                        fontSize: 13,
                        fontWeight: FontWeight.w600,
                        color: rateColor,
                      ),
                    ),
                  ],
                ),
              ),
              Container(
                padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
                decoration: BoxDecoration(
                  color: rateColor.withValues(alpha: 0.15),
                  borderRadius: BorderRadius.circular(16),
                ),
                child: Text(
                  ratePercent >= 80 ? 'Tốt' : (ratePercent >= 50 ? 'Trung bình' : 'Cần chú ý'),
                  style: TextStyle(fontSize: 12, fontWeight: FontWeight.bold, color: rateColor),
                ),
              ),
            ],
          ),
          const SizedBox(height: 12),
          ClipRRect(
            borderRadius: BorderRadius.circular(10),
            child: LinearProgressIndicator(
              value: total == 0 ? 0 : _completedCount / total,
              minHeight: 8,
              backgroundColor: Colors.black12,
              color: rateColor,
            ),
          ),
          const SizedBox(height: 12),
          Wrap(
            alignment: WrapAlignment.spaceAround,
            runAlignment: WrapAlignment.center,
            spacing: 12,
            runSpacing: 8,
            children: [
              _buildCountBadge('Đã uống', _completedCount, const Color(0xff07856d)),
              _buildCountBadge('Bỏ lỡ', _missedCount, const Color(0xffd65a45)),
              _buildCountBadge('Từ chối', _refusedCount, const Color(0xff722ed1)),
              _buildCountBadge('Chờ uống', _pendingCount, const Color(0xffdf8a19)),
            ],
          ),
        ],
      ),
    );
  }

  Widget _buildCountBadge(String label, int count, Color color) {
    return Column(
      children: [
        Text(
          '$count',
          style: TextStyle(fontSize: 16, fontWeight: FontWeight.bold, color: color),
        ),
        Text(
          label,
          style: const TextStyle(fontSize: 11, color: Colors.black54),
        ),
      ],
    );
  }

  Widget _buildInfoBanner() {
    return Container(
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(20),
      ),
      child: const Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Icon(Icons.info_outline_rounded, color: Color(0xff07856d), size: 20),
          SizedBox(width: 10),
          Expanded(
            child: Text(
              'Chạm vào liều thuốc để xác nhận Đã uống, Bỏ lỡ hoặc Từ chối kèm lý do. Hệ thống sẽ đồng bộ về máy chủ.',
              style: TextStyle(color: Colors.black54, fontSize: 12, height: 1.4),
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildEmptyState() {
    return Container(
      padding: const EdgeInsets.symmetric(vertical: 42, horizontal: 20),
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(24),
      ),
      child: const Column(
        children: [
          Icon(
            Icons.event_available_rounded,
            size: 52,
            color: Color(0xff07856d),
          ),
          SizedBox(height: 12),
          Text(
            'Không có lịch uống thuốc cho ngày này',
            style: TextStyle(fontWeight: FontWeight.bold, fontSize: 16),
          ),
          SizedBox(height: 5),
          Text(
            'Đơn thuốc và lịch uống do cơ sở y tế hoặc người quản lý cập nhật.',
            textAlign: TextAlign.center,
            style: TextStyle(color: Colors.black54),
          ),
        ],
      ),
    );
  }

  Widget _buildDoseGroup(
    String title,
    IconData icon,
    List<Map<String, dynamic>> doses,
    Color bg,
    Color iconColor,
  ) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Row(
          children: [
            Icon(icon, size: 20, color: iconColor),
            const SizedBox(width: 8),
            Text(
              title,
              style: const TextStyle(fontSize: 16, fontWeight: FontWeight.bold),
            ),
            const Spacer(),
            Text(
              '${doses.length} liều',
              style: const TextStyle(fontSize: 12, color: Colors.black45),
            ),
          ],
        ),
        const SizedBox(height: 10),
        ...doses.map(_buildMedicationCard),
        const SizedBox(height: 14),
      ],
    );
  }

  Widget _buildMedicationCard(Map<String, dynamic> item) {
    final id = _asInt(item['id']);
    final status = item['trangThai']?.toString() ?? 'ChuaDenGio';
    final updating = id != null && _updatingIds.contains(id);

    final schedDate = _parseDateTime(item['thoiGianDuKien']);
    final now = DateTime.now();
    final isOverdue = status == 'ChuaDenGio' && schedDate != null && schedDate.isBefore(now);

    final statusColor = switch (status) {
      'DaUong' => const Color(0xff07856d),
      'BoLo' => const Color(0xffd65a45),
      'TuChoi' => const Color(0xff722ed1),
      _ => isOverdue ? const Color(0xffd65a45) : const Color(0xffdf8a19),
    };
    final statusLabel = switch (status) {
      'DaUong' => 'Đã uống',
      'BoLo' => 'Bỏ lỡ',
      'TuChoi' => 'Từ chối',
      _ => isOverdue ? 'Quá giờ hẹn' : 'Chưa uống',
    };

    int? daysLeft;
    final endDateStr = item['ngayKetThucDon']?.toString();
    if (endDateStr != null) {
      final endDate = DateTime.tryParse(endDateStr);
      if (endDate != null) {
        daysLeft = endDate.difference(DateTime(now.year, now.month, now.day)).inDays;
      }
    }

    return Padding(
      padding: const EdgeInsets.only(bottom: 10),
      child: Material(
        color: Colors.white,
        borderRadius: BorderRadius.circular(22),
        elevation: 0,
        child: InkWell(
          borderRadius: BorderRadius.circular(22),
          onTap: updating ? null : () => _chooseStatus(item),
          child: Padding(
            padding: const EdgeInsets.all(16),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Row(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Container(
                      width: 50,
                      height: 50,
                      decoration: BoxDecoration(
                        color: statusColor.withValues(alpha: 0.12),
                        borderRadius: BorderRadius.circular(16),
                      ),
                      child: Center(
                        child: updating
                            ? const SizedBox(
                                width: 22,
                                height: 22,
                                child: CircularProgressIndicator(strokeWidth: 2),
                              )
                            : Icon(
                                status == 'DaUong'
                                    ? Icons.check_circle_rounded
                                    : (status == 'TuChoi' ? Icons.block_rounded : Icons.medication_rounded),
                                color: statusColor,
                                size: 28,
                              ),
                      ),
                    ),
                    const SizedBox(width: 12),
                    Expanded(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text(
                            item['tenThuoc']?.toString() ?? 'Không rõ tên thuốc',
                            style: const TextStyle(fontSize: 16, fontWeight: FontWeight.bold),
                          ),
                          const SizedBox(height: 4),
                          Text(
                            '${_formatTime(item['thoiGianDuKien'])} • ${item['lieuDung'] ?? 'Không rõ liều'}',
                            style: const TextStyle(fontSize: 13, color: Colors.black54),
                          ),
                          if ((item['cachDung']?.toString() ?? '').trim().isNotEmpty) ...[
                            const SizedBox(height: 2),
                            Text(
                              item['cachDung'].toString(),
                              style: const TextStyle(color: Colors.black45, fontSize: 12),
                            ),
                          ],
                        ],
                      ),
                    ),
                    Container(
                      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 5),
                      decoration: BoxDecoration(
                        color: statusColor.withValues(alpha: 0.12),
                        borderRadius: BorderRadius.circular(16),
                      ),
                      child: Text(
                        statusLabel,
                        style: TextStyle(
                          color: statusColor,
                          fontSize: 11,
                          fontWeight: FontWeight.bold,
                        ),
                      ),
                    ),
                  ],
                ),
                if ((item['ghiChu']?.toString() ?? '').trim().isNotEmpty) ...[
                  const SizedBox(height: 8),
                  Container(
                    width: double.infinity,
                    padding: const EdgeInsets.all(8),
                    decoration: BoxDecoration(
                      color: const Color(0xfff8f9fa),
                      borderRadius: BorderRadius.circular(8),
                    ),
                    child: Text(
                      'Ghi chú: ${item['ghiChu']}',
                      style: const TextStyle(fontSize: 12, color: Colors.black87, fontStyle: FontStyle.italic),
                    ),
                  ),
                ],
                if (daysLeft != null) ...[
                  const SizedBox(height: 6),
                  if (daysLeft >= 0 && daysLeft <= 3)
                    Container(
                      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
                      decoration: BoxDecoration(
                        color: const Color(0xfffff7e6),
                        borderRadius: BorderRadius.circular(6),
                      ),
                      child: Text(
                        '💊 Đơn thuốc còn $daysLeft ngày dùng',
                        style: const TextStyle(fontSize: 11, color: Color(0xffd48806), fontWeight: FontWeight.w600),
                      ),
                    )
                  else if (daysLeft < 0)
                    Container(
                      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
                      decoration: BoxDecoration(
                        color: const Color(0xfffff1f0),
                        borderRadius: BorderRadius.circular(6),
                      ),
                      child: const Text(
                        '⚠️ Đơn thuốc đã kết thúc hạn',
                        style: TextStyle(fontSize: 11, color: Colors.red, fontWeight: FontWeight.w600),
                      ),
                    ),
                ],
              ],
            ),
          ),
        ),
      ),
    );
  }

  static int? _asInt(Object? value) {
    if (value is int) return value;
    return int.tryParse(value?.toString() ?? '');
  }

  static DateTime? _parseDateTime(Object? value) =>
      DateTime.tryParse(value?.toString() ?? '');

  static String _formatTime(Object? value) {
    final date = _parseDateTime(value);
    if (date == null) return '--:--';
    return '${date.hour.toString().padLeft(2, '0')}:'
        '${date.minute.toString().padLeft(2, '0')}';
  }
}

class _MedicationStatusSheet extends StatefulWidget {
  const _MedicationStatusSheet({
    required this.medicineName,
    required this.dosageInfo,
  });

  final String medicineName;
  final String dosageInfo;

  @override
  State<_MedicationStatusSheet> createState() => _MedicationStatusSheetState();
}

class _MedicationStatusSheetState extends State<_MedicationStatusSheet> {
  String? _selectedStatus;
  String _reason = '';
  final _reasonController = TextEditingController();

  final _missedReasons = [
    'Quên uống đúng giờ',
    'Ngủ quên',
    'Bận việc bên ngoài',
    'Thuốc bị thất lạc / hết',
  ];

  final _refusedReasons = [
    'Tác dụng phụ gây mệt mỏi',
    'Buồn nôn / khó chịu',
    'Bác sĩ chỉ định tạm ngưng',
    'Không muốn dùng liều này',
  ];

  @override
  void dispose() {
    _reasonController.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return SafeArea(
      child: Padding(
        padding: EdgeInsets.fromLTRB(
          20,
          14,
          20,
          MediaQuery.of(context).viewInsets.bottom + 20,
        ),
        child: SingleChildScrollView(
          child: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Center(
                child: Container(
                  width: 48,
                  height: 5,
                  decoration: BoxDecoration(
                    color: Colors.black12,
                    borderRadius: BorderRadius.circular(20),
                  ),
                ),
              ),
              const SizedBox(height: 18),
              Text(
                widget.medicineName,
                style: const TextStyle(fontSize: 20, fontWeight: FontWeight.bold),
              ),
              const SizedBox(height: 4),
              Text(
                widget.dosageInfo,
                style: const TextStyle(color: Colors.black54),
              ),
              const SizedBox(height: 18),
              ListTile(
                shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(16)),
                tileColor: const Color(0xffe8f8ee),
                leading: const Icon(Icons.check_circle_rounded, color: Color(0xff07856d)),
                title: const Text('Đã uống', style: TextStyle(fontWeight: FontWeight.bold)),
                subtitle: const Text('Đã dùng thuốc đúng liều lượng'),
                onTap: () => Navigator.pop(context, {'status': 'DaUong', 'reason': null}),
              ),
              const SizedBox(height: 10),
              ListTile(
                shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(16)),
                tileColor: _selectedStatus == 'BoLo' ? const Color(0xffffe0d8) : const Color(0xffffece8),
                leading: const Icon(Icons.cancel_rounded, color: Color(0xffd65a45)),
                title: const Text('Bỏ lỡ', style: TextStyle(fontWeight: FontWeight.bold)),
                subtitle: const Text('Quên hoặc chưa kịp uống'),
                onTap: () => setState(() {
                  _selectedStatus = 'BoLo';
                  _reason = _missedReasons.first;
                  _reasonController.text = _reason;
                }),
              ),
              const SizedBox(height: 10),
              ListTile(
                shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(16)),
                tileColor: _selectedStatus == 'TuChoi' ? const Color(0xffeedeff) : const Color(0xfff6edff),
                leading: const Icon(Icons.block_rounded, color: Color(0xff722ed1)),
                title: const Text('Từ chối', style: TextStyle(fontWeight: FontWeight.bold)),
                subtitle: const Text('Không muốn uống do tác dụng phụ hoặc chỉ định'),
                onTap: () => setState(() {
                  _selectedStatus = 'TuChoi';
                  _reason = _refusedReasons.first;
                  _reasonController.text = _reason;
                }),
              ),
              if (_selectedStatus != null) ...[
                const SizedBox(height: 16),
                Text(
                  _selectedStatus == 'BoLo' ? 'Lý do bỏ lỡ:' : 'Lý do từ chối:',
                  style: const TextStyle(fontWeight: FontWeight.bold, fontSize: 14),
                ),
                const SizedBox(height: 8),
                Wrap(
                  spacing: 6,
                  children: (_selectedStatus == 'BoLo' ? _missedReasons : _refusedReasons)
                      .map((r) => ChoiceChip(
                            label: Text(r, style: const TextStyle(fontSize: 12)),
                            selected: _reason == r,
                            onSelected: (_) => setState(() {
                              _reason = r;
                              _reasonController.text = r;
                            }),
                          ))
                      .toList(),
                ),
                const SizedBox(height: 10),
                TextField(
                  controller: _reasonController,
                  onChanged: (v) => _reason = v,
                  decoration: InputDecoration(
                    hintText: 'Nhập lý do chi tiết...',
                    border: OutlineInputBorder(borderRadius: BorderRadius.circular(12)),
                    contentPadding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
                  ),
                ),
                const SizedBox(height: 14),
                SizedBox(
                  width: double.infinity,
                  height: 48,
                  child: FilledButton(
                    style: FilledButton.styleFrom(
                      backgroundColor: _selectedStatus == 'BoLo' ? const Color(0xffd65a45) : const Color(0xff722ed1),
                    ),
                    onPressed: () => Navigator.pop(context, {
                      'status': _selectedStatus!,
                      'reason': _reason,
                    }),
                    child: Text('XÁC NHẬN ${_selectedStatus == 'BoLo' ? 'BỎ LỠ' : 'TỪ CHỐI'}'),
                  ),
                ),
              ],
            ],
          ),
        ),
      ),
    );
  }
}
