import 'package:flutter/material.dart';

import '../../services/api_client.dart';
import '../../services/local_notification_service.dart';
import '../../services/medication_schedule_service.dart';

class MedicationScreen extends StatefulWidget {
  const MedicationScreen({super.key});

  @override
  State<MedicationScreen> createState() => _MedicationScreenState();
}

class _MedicationScreenState extends State<MedicationScreen> {
  List<Map<String, dynamic>> _schedule = [];
  final Set<int> _updatingIds = {};
  bool _loading = true;
  bool _permissionExplanationShown = false;
  String? _error;

  int get _completedCount =>
      _schedule.where((item) => item['trangThai'] == 'DaUong').length;

  @override
  void initState() {
    super.initState();
    _loadSchedule();
  }

  Future<void> _loadSchedule({bool refresh = false}) async {
    if (mounted && (_schedule.isEmpty || _error != null)) {
      setState(() {
        _loading = true;
        _error = null;
      });
    }
    try {
      final items = await MedicationScheduleService.instance.getTodaySchedule(
        refresh: refresh,
      );
      if (!mounted) return;
      setState(() {
        _schedule = items;
        _loading = false;
        _error = null;
      });
      await _resetTodayReminders(items);
    } catch (error) {
      if (!mounted) return;
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
    final selected = await showModalBottomSheet<String>(
      context: context,
      backgroundColor: Colors.white,
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(28)),
      ),
      builder: (sheetContext) => SafeArea(
        child: Padding(
          padding: const EdgeInsets.fromLTRB(20, 14, 20, 22),
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
                item['tenThuoc']?.toString() ?? 'Thuốc',
                style: const TextStyle(
                  fontSize: 20,
                  fontWeight: FontWeight.bold,
                ),
              ),
              const SizedBox(height: 5),
              Text(
                '${_formatTime(item['thoiGianDuKien'])} • ${item['lieuDung'] ?? 'Không rõ liều dùng'}',
                style: const TextStyle(color: Colors.black54),
              ),
              const SizedBox(height: 18),
              ListTile(
                shape: RoundedRectangleBorder(
                  borderRadius: BorderRadius.circular(16),
                ),
                tileColor: const Color(0xffe8f8ee),
                leading: const Icon(
                  Icons.check_circle_rounded,
                  color: Color(0xff07856d),
                ),
                title: const Text(
                  'Đã uống',
                  style: TextStyle(fontWeight: FontWeight.bold),
                ),
                onTap: () => Navigator.pop(sheetContext, 'DaUong'),
              ),
              const SizedBox(height: 10),
              ListTile(
                shape: RoundedRectangleBorder(
                  borderRadius: BorderRadius.circular(16),
                ),
                tileColor: const Color(0xffffece8),
                leading: const Icon(
                  Icons.cancel_rounded,
                  color: Color(0xffd65a45),
                ),
                title: const Text(
                  'Bỏ lỡ',
                  style: TextStyle(fontWeight: FontWeight.bold),
                ),
                onTap: () => Navigator.pop(sheetContext, 'BoLo'),
              ),
            ],
          ),
        ),
      ),
    );
    if (selected == null || !mounted) return;
    await _confirmStatus(id, selected);
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
      await LocalNotificationService.cancelNotification(100000 + id);
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
        title: const Text(
          'Lịch uống thuốc',
          style: TextStyle(fontWeight: FontWeight.bold),
        ),
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
    return RefreshIndicator(
      color: const Color(0xff07856d),
      onRefresh: () => _loadSchedule(refresh: true),
      child: ListView(
        physics: const AlwaysScrollableScrollPhysics(),
        padding: const EdgeInsets.fromLTRB(18, 10, 18, 30),
        children: [
          Container(
            padding: const EdgeInsets.all(18),
            decoration: BoxDecoration(
              gradient: const LinearGradient(
                colors: [Color(0xffffeef1), Color(0xffe9fff6)],
              ),
              borderRadius: BorderRadius.circular(28),
            ),
            child: Row(
              children: [
                const CircleAvatar(
                  radius: 31,
                  backgroundColor: Colors.white,
                  child: Icon(
                    Icons.medication_rounded,
                    color: Color(0xffe85d75),
                    size: 32,
                  ),
                ),
                const SizedBox(width: 14),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        'Hôm nay • ${_formatToday()}',
                        style: const TextStyle(color: Colors.black54),
                      ),
                      const SizedBox(height: 4),
                      Text(
                        '$_completedCount/$total liều đã uống',
                        style: const TextStyle(
                          fontSize: 21,
                          fontWeight: FontWeight.bold,
                        ),
                      ),
                      const SizedBox(height: 10),
                      ClipRRect(
                        borderRadius: BorderRadius.circular(20),
                        child: LinearProgressIndicator(
                          value: total == 0 ? 0 : _completedCount / total,
                          minHeight: 9,
                          backgroundColor: Colors.white,
                          color: const Color(0xff07856d),
                        ),
                      ),
                    ],
                  ),
                ),
              ],
            ),
          ),
          const SizedBox(height: 18),
          Container(
            padding: const EdgeInsets.all(14),
            decoration: BoxDecoration(
              color: Colors.white,
              borderRadius: BorderRadius.circular(20),
            ),
            child: const Row(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Icon(
                  Icons.notifications_active_outlined,
                  color: Color(0xff07856d),
                ),
                SizedBox(width: 10),
                Expanded(
                  child: Text(
                    'Giờ nhắc được đồng bộ từ lịch thuốc trên hệ thống và đặt lại khi bạn tải màn hình này.',
                    style: TextStyle(color: Colors.black54, height: 1.35),
                  ),
                ),
              ],
            ),
          ),
          const SizedBox(height: 22),
          const Text(
            'Các liều thuốc hôm nay',
            style: TextStyle(fontSize: 19, fontWeight: FontWeight.bold),
          ),
          const SizedBox(height: 6),
          const Text(
            'Chạm vào một liều để xác nhận đã uống hoặc bỏ lỡ.',
            style: TextStyle(color: Colors.black54),
          ),
          const SizedBox(height: 12),
          if (_schedule.isEmpty)
            Container(
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
                    'Hôm nay chưa có lịch uống thuốc',
                    style: TextStyle(fontWeight: FontWeight.bold),
                  ),
                  SizedBox(height: 5),
                  Text(
                    'Lịch mới do nhân viên quản lý tạo sẽ tự động xuất hiện tại đây.',
                    textAlign: TextAlign.center,
                    style: TextStyle(color: Colors.black54),
                  ),
                ],
              ),
            )
          else
            ..._schedule.map(_buildMedicationCard),
        ],
      ),
    );
  }

  Widget _buildMedicationCard(Map<String, dynamic> item) {
    final id = _asInt(item['id']);
    final status = item['trangThai']?.toString() ?? 'ChuaDenGio';
    final updating = id != null && _updatingIds.contains(id);
    final statusColor = switch (status) {
      'DaUong' => const Color(0xff07856d),
      'BoLo' => const Color(0xffd65a45),
      _ => const Color(0xffdf8a19),
    };
    final statusLabel = switch (status) {
      'DaUong' => 'Đã uống',
      'BoLo' => 'Bỏ lỡ',
      _ => 'Chưa xác nhận',
    };

    return Padding(
      padding: const EdgeInsets.only(bottom: 12),
      child: Material(
        color: Colors.white,
        borderRadius: BorderRadius.circular(22),
        child: InkWell(
          borderRadius: BorderRadius.circular(22),
          onTap: updating ? null : () => _chooseStatus(item),
          child: Padding(
            padding: const EdgeInsets.all(16),
            child: Row(
              children: [
                Container(
                  width: 55,
                  height: 55,
                  decoration: BoxDecoration(
                    color: const Color(0xffffe8ec),
                    borderRadius: BorderRadius.circular(17),
                  ),
                  child: Center(
                    child: updating
                        ? const SizedBox(
                            width: 22,
                            height: 22,
                            child: CircularProgressIndicator(strokeWidth: 2),
                          )
                        : const Icon(
                            Icons.medication_rounded,
                            color: Color(0xffe85d75),
                          ),
                  ),
                ),
                const SizedBox(width: 13),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        item['tenThuoc']?.toString() ?? 'Không rõ tên thuốc',
                        style: const TextStyle(
                          fontSize: 16,
                          fontWeight: FontWeight.bold,
                        ),
                      ),
                      const SizedBox(height: 5),
                      Text(
                        '${_formatTime(item['thoiGianDuKien'])} • ${item['lieuDung'] ?? 'Không rõ liều dùng'}',
                        style: const TextStyle(color: Colors.black54),
                      ),
                      if ((item['cachDung']?.toString() ?? '')
                          .trim()
                          .isNotEmpty) ...[
                        const SizedBox(height: 3),
                        Text(
                          item['cachDung'].toString(),
                          style: const TextStyle(
                            color: Colors.black45,
                            fontSize: 12,
                          ),
                        ),
                      ],
                    ],
                  ),
                ),
                const SizedBox(width: 8),
                Column(
                  crossAxisAlignment: CrossAxisAlignment.end,
                  children: [
                    Container(
                      padding: const EdgeInsets.symmetric(
                        horizontal: 9,
                        vertical: 6,
                      ),
                      decoration: BoxDecoration(
                        color: statusColor.withValues(alpha: 0.1),
                        borderRadius: BorderRadius.circular(18),
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
                    const SizedBox(height: 8),
                    const Icon(
                      Icons.chevron_right_rounded,
                      color: Colors.black38,
                    ),
                  ],
                ),
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

  static String _formatToday() {
    final now = DateTime.now();
    return '${now.day.toString().padLeft(2, '0')}/'
        '${now.month.toString().padLeft(2, '0')}/${now.year}';
  }
}
