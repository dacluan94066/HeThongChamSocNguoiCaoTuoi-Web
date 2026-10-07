import 'package:flutter/material.dart';
import 'package:dio/dio.dart';

import '../../services/alert_service.dart';
import '../../services/api_client.dart';
import '../../services/auth_service.dart';
import '../../services/caregiver_dashboard_service.dart';
import '../../widgets/foreground_refresh.dart';
import '../caregiver/caregiver_elderly_detail_screen.dart';
import '../alerts/alert_history_screen.dart';
import '../alerts/emergency_alert_history_screen.dart';
import '../appointments/appointment_screen.dart';

class NotificationScreen extends StatefulWidget {
  const NotificationScreen({super.key});

  @override
  State<NotificationScreen> createState() => _NotificationScreenState();
}

class _NotificationScreenState extends State<NotificationScreen>
    with ForegroundRefresh<NotificationScreen> {
  @override
  Future<void> refreshForeground() => _load(refresh: true, silent: true);
  final Set<int> _reading = {};
  List<Map<String, dynamic>> _items = const [];
  bool _loading = true;
  String? _error;
  bool _unreadOnly = false;
  bool _markingAll = false;
  int _loadSequence = 0;

  List<Map<String, dynamic>> get _visibleItems => _unreadOnly
      ? _items.where((item) => !_truthy(item['daDoc'])).toList()
      : _items;

  @override
  void initState() {
    super.initState();
    _load();
  }

  bool _truthy(Object? value) =>
      value == true ||
      value == 1 ||
      value?.toString().trim().toLowerCase() == 'true' ||
      value?.toString().trim() == '1';

  int get _unreadCount =>
      _items.where((item) => !_truthy(item['daDoc'])).length;

  Future<void> _load({bool refresh = false, bool silent = false}) async {
    final sequence = ++_loadSequence;
    final version = ApiClient.sessionVersion;
    if (!refresh && mounted) setState(() => _loading = true);
    try {
      final items = await AlertService.instance.getNotifications(
        refresh: refresh,
      );
      if (!mounted ||
          version != ApiClient.sessionVersion ||
          sequence != _loadSequence)
        return;
      items.sort((a, b) {
        final first = DateTime.tryParse(a['ngayTao']?.toString() ?? '');
        final second = DateTime.tryParse(b['ngayTao']?.toString() ?? '');
        if (first == null) return second == null ? 0 : 1;
        if (second == null) return -1;
        return second.compareTo(first);
      });
      setState(() {
        _items = items;
        _error = null;
        _loading = false;
      });
    } catch (error) {
      if (!mounted ||
          version != ApiClient.sessionVersion ||
          sequence != _loadSequence)
        return;
      if (error is ApiException && error.dioType == DioExceptionType.cancel) {
        setState(() => _loading = false);
        return;
      }
      setState(() {
        _loading = false;
        if (!silent || _items.isEmpty) {
          _error = error is ApiException
              ? error.message
              : 'Không thể tải thông báo.';
        }
      });
    }
  }

  void _setRead(Set<int> ids) {
    ++_loadSequence;
    setState(() {
      _loading = false;
      _items = _items.map((item) {
        final id = int.tryParse(item['id']?.toString() ?? '');
        return ids.contains(id) ? {...item, 'daDoc': true} : item;
      }).toList();
    });
  }

  Future<void> _markAllRead() async {
    if (_markingAll || _reading.isNotEmpty) return;
    final ids = _items
        .where((item) => !_truthy(item['daDoc']))
        .map((item) => int.tryParse(item['id']?.toString() ?? ''))
        .whereType<int>()
        .where((id) => id > 0)
        .toSet();
    if (ids.isEmpty) return;
    final version = ApiClient.sessionVersion;
    setState(() => _markingAll = true);
    try {
      final result = await AlertService.instance.markAllNotificationsRead(ids);
      if (!mounted || version != ApiClient.sessionVersion) return;
      _setRead(result.succeeded);
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text(
            result.failed.isEmpty
                ? 'Đã đánh dấu đọc ${result.succeeded.length} thông báo.'
                : 'Đã cập nhật ${result.succeeded.length} thông báo; '
                      '${result.failed.length} thông báo chưa cập nhật. Bạn có thể thử lại.',
          ),
        ),
      );
    } catch (error) {
      if (!mounted || version != ApiClient.sessionVersion) return;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text(
            error is ApiException
                ? error.message
                : 'Không thể đánh dấu tất cả đã đọc.',
          ),
        ),
      );
    } finally {
      if (mounted) setState(() => _markingAll = false);
    }
  }

  Future<void> _openNotification(Map<String, dynamic> item) async {
    final id = int.tryParse(item['id']?.toString() ?? '');
    if (id == null || id < 1 || _reading.isNotEmpty || _markingAll) return;
    final version = ApiClient.sessionVersion;
    setState(() => _reading.add(id));
    try {
      if (!_truthy(item['daDoc'])) {
        try {
          await AlertService.instance.markNotificationRead(id);
          if (!mounted || version != ApiClient.sessionVersion) return;
          _setRead({id});
        } on ApiException catch (error) {
          if (!mounted || version != ApiClient.sessionVersion) return;
          if (error.dioType == DioExceptionType.cancel) return;
          ScaffoldMessenger.of(context).showSnackBar(
            SnackBar(
              content: Text('Chưa đánh dấu được đã đọc: ${error.message}'),
            ),
          );
        }
      }
      final user = await AuthService.instance.getStoredUser();
      if (!mounted || version != ApiClient.sessionVersion) return;
      final caregiver = user?['tenVaiTro'] == 'NguoiChamSoc';
      final linkedAlert =
          item['lienKetBang'] == 'CanhBaoKhanCap' ||
          item['lienKetBang'] == 'CanhBao';
      final appointment = item['loaiThongBao'] == 'NhacLichKham';
      final openRelated = await showModalBottomSheet<bool>(
        context: context,
        isScrollControlled: true,
        builder: (sheetContext) => SafeArea(
          child: SingleChildScrollView(
            padding: const EdgeInsets.all(24),
            child: Column(
              mainAxisSize: MainAxisSize.min,
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  item['tieuDe']?.toString() ?? 'Thông báo',
                  style: const TextStyle(
                    fontSize: 22,
                    fontWeight: FontWeight.bold,
                  ),
                ),
                const SizedBox(height: 12),
                Text(item['noiDung']?.toString() ?? ''),
                const SizedBox(height: 12),
                Text(_dateTime(item['ngayTao'])),
                if (linkedAlert || (!caregiver && appointment)) ...[
                  const SizedBox(height: 20),
                  FilledButton(
                    onPressed: () => Navigator.pop(sheetContext, true),
                    child: Text(
                      caregiver
                          ? 'Xem hồ sơ và cảnh báo'
                          : appointment
                          ? 'Xem lịch khám'
                          : 'Xem lịch sử cảnh báo',
                    ),
                  ),
                ],
                TextButton(
                  onPressed: () => Navigator.pop(sheetContext, false),
                  child: const Text('Đóng'),
                ),
              ],
            ),
          ),
        ),
      );
      if (openRelated != true ||
          !mounted ||
          version != ApiClient.sessionVersion)
        return;
      if (!caregiver) {
        await Navigator.push(
          context,
          MaterialPageRoute(
            builder: (_) => appointment
                ? const AppointmentScreen()
                : item['lienKetBang'] == 'CanhBaoKhanCap'
                ? const EmergencyAlertHistoryScreen()
                : const AlertHistoryScreen(),
          ),
        );
      } else {
        final elderlyId = await AlertService.instance.getNotificationElderlyId(
          item,
        );
        final assigned = await CaregiverDashboardService.instance
            .getMyElderlyList(refresh: true);
        final matches = assigned.where(
          (row) => row['id']?.toString() == elderlyId?.toString(),
        );
        if (!mounted || version != ApiClient.sessionVersion) return;
        if (elderlyId == null || matches.isEmpty) {
          ScaffoldMessenger.of(context).showSnackBar(
            const SnackBar(
              content: Text(
                'Hồ sơ không còn tồn tại hoặc bạn không còn được phân công chăm sóc.',
              ),
            ),
          );
          return;
        }
        await Navigator.push(
          context,
          MaterialPageRoute(
            builder: (_) =>
                CaregiverElderlyDetailScreen(elderly: matches.first),
          ),
        );
      }
    } on ApiException catch (error) {
      if (!mounted || version != ApiClient.sessionVersion) return;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text(error.message), backgroundColor: Colors.red),
      );
    } catch (_) {
      if (!mounted || version != ApiClient.sessionVersion) return;
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(
          content: Text('Không thể mở thông báo. Vui lòng thử lại.'),
        ),
      );
    } finally {
      if (mounted) setState(() => _reading.remove(id));
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: const Color(0xfff4f6f5),
      appBar: AppBar(
        actions: [
          TextButton(
            onPressed:
                _markingAll ||
                    _loading ||
                    _unreadCount == 0 ||
                    _reading.isNotEmpty
                ? null
                : _markAllRead,
            child: _markingAll
                ? const SizedBox(
                    width: 18,
                    height: 18,
                    child: CircularProgressIndicator(strokeWidth: 2),
                  )
                : const Text('Đọc tất cả'),
          ),
        ],
        title: const Text(
          'Thông báo',
          style: TextStyle(fontWeight: FontWeight.bold),
        ),
      ),
      body: _loading
          ? const Center(child: CircularProgressIndicator())
          : _error != null && _items.isEmpty
          ? _ErrorView(message: _error!, onRetry: _load)
          : RefreshIndicator(
              onRefresh: () => _load(refresh: true),
              child: ListView(
                physics: const AlwaysScrollableScrollPhysics(),
                padding: const EdgeInsets.fromLTRB(14, 10, 14, 30),
                children: [
                  Container(
                    padding: const EdgeInsets.all(16),
                    decoration: BoxDecoration(
                      color: const Color(0xffe8f7f2),
                      borderRadius: BorderRadius.circular(20),
                    ),
                    child: Row(
                      children: [
                        const Icon(
                          Icons.notifications_active_outlined,
                          color: Color(0xff07856d),
                          size: 32,
                        ),
                        const SizedBox(width: 12),
                        Text(
                          '$_unreadCount thông báo chưa đọc',
                          style: const TextStyle(
                            fontSize: 17,
                            fontWeight: FontWeight.bold,
                          ),
                        ),
                      ],
                    ),
                  ),
                  const SizedBox(height: 14),
                  Wrap(
                    spacing: 8,
                    children: [
                      ChoiceChip(
                        label: const Text('Tất cả'),
                        selected: !_unreadOnly,
                        onSelected: (_) => setState(() => _unreadOnly = false),
                      ),
                      ChoiceChip(
                        label: Text('Chưa đọc ($_unreadCount)'),
                        selected: _unreadOnly,
                        onSelected: (_) => setState(() => _unreadOnly = true),
                      ),
                    ],
                  ),
                  if (_error != null)
                    Padding(
                      padding: const EdgeInsets.symmetric(vertical: 12),
                      child: Row(
                        children: [
                          Expanded(
                            child: Text(
                              _error!,
                              style: const TextStyle(color: Color(0xffc62828)),
                            ),
                          ),
                          TextButton(
                            onPressed: () => _load(refresh: true),
                            child: const Text('Thử lại'),
                          ),
                        ],
                      ),
                    ),
                  const SizedBox(height: 10),
                  if (_visibleItems.isEmpty)
                    Padding(
                      padding: const EdgeInsets.only(top: 120),
                      child: Column(
                        children: [
                          const Icon(
                            Icons.notifications_none_rounded,
                            size: 68,
                            color: Colors.black26,
                          ),
                          const SizedBox(height: 12),
                          Text(
                            _unreadOnly
                                ? 'Bạn đã đọc hết thông báo.'
                                : 'Chưa có thông báo nào.',
                          ),
                        ],
                      ),
                    )
                  else
                    ..._visibleItems.map(_notificationCard),
                ],
              ),
            ),
    );
  }

  Widget _notificationCard(Map<String, dynamic> item) {
    final read = _truthy(item['daDoc']);
    final type = item['loaiThongBao']?.toString();
    final emergency = type == 'KhanCap';
    final color = emergency ? const Color(0xffc62828) : const Color(0xff07856d);
    final background = read
        ? Colors.white
        : emergency
        ? const Color(0xffffe8e8)
        : const Color(0xffe9f8f4);
    return Card(
      elevation: 0,
      color: background,
      margin: const EdgeInsets.only(bottom: 9),
      child: ListTile(
        onTap: _markingAll || _reading.isNotEmpty
            ? null
            : () => _openNotification(item),
        leading: CircleAvatar(
          backgroundColor: color.withValues(alpha: 0.12),
          child: Icon(_iconFor(type), color: color),
        ),
        title: Text(
          item['tieuDe']?.toString() ?? 'Thông báo',
          style: TextStyle(
            fontWeight: read ? FontWeight.w500 : FontWeight.bold,
          ),
        ),
        subtitle: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            const SizedBox(height: 4),
            Text(item['noiDung']?.toString() ?? ''),
            const SizedBox(height: 6),
            Text(
              _dateTime(item['ngayTao']),
              style: const TextStyle(fontSize: 12, color: Colors.black45),
            ),
          ],
        ),
        trailing: _reading.contains(int.tryParse(item['id']?.toString() ?? ''))
            ? const SizedBox(
                width: 20,
                height: 20,
                child: CircularProgressIndicator(strokeWidth: 2),
              )
            : read
            ? null
            : Icon(Icons.circle, size: 10, color: color),
      ),
    );
  }

  static IconData _iconFor(String? type) => switch (type) {
    'NhacThuoc' => Icons.medication_rounded,
    'NhacLichKham' => Icons.calendar_month_rounded,
    'CanhBaoChiSo' => Icons.monitor_heart_rounded,
    'KhanCap' => Icons.sos_rounded,
    _ => Icons.notifications_outlined,
  };

  static String _dateTime(Object? raw) {
    final value = DateTime.tryParse(raw?.toString() ?? '')?.toLocal();
    if (value == null) return '';
    String two(int number) => number.toString().padLeft(2, '0');
    return '${two(value.hour)}:${two(value.minute)} • '
        '${two(value.day)}/${two(value.month)}/${value.year}';
  }
}

class _ErrorView extends StatelessWidget {
  const _ErrorView({required this.message, required this.onRetry});

  final String message;
  final VoidCallback onRetry;

  @override
  Widget build(BuildContext context) => Center(
    child: Column(
      mainAxisSize: MainAxisSize.min,
      children: [
        Text(message, textAlign: TextAlign.center),
        const SizedBox(height: 12),
        FilledButton(onPressed: onRetry, child: const Text('Thử lại')),
      ],
    ),
  );
}
