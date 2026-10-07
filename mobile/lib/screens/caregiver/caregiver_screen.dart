import 'package:flutter/material.dart';
import 'package:url_launcher/url_launcher.dart';

import '../../services/alert_service.dart';
import '../../services/api_client.dart';
import '../../services/caregiver_service.dart';
import '../alerts/emergency_alert_history_screen.dart';

class CaregiverScreen extends StatefulWidget {
  const CaregiverScreen({super.key});

  @override
  State<CaregiverScreen> createState() => _CaregiverScreenState();
}

class _CaregiverScreenState extends State<CaregiverScreen> {
  List<Map<String, dynamic>> _caregivers = [];
  bool _loading = true;
  bool _sosDialogOpen = false;
  String? _error;
  String? _historyError;
  String _latestAlertTime = 'Chưa có';
  int _loadSequence = 0;

  @override
  void initState() {
    super.initState();
    _loadData();
  }

  Future<void> _loadData({bool refresh = false}) async {
    final sequence = ++_loadSequence;
    final version = ApiClient.sessionVersion;
    if (mounted) setState(() => _loading = true);
    String? historyError;
    try {
      final results = await Future.wait([
        CaregiverService.instance.getMyCaregivers(refresh: refresh),
        AlertService.instance.getMyEmergencyAlerts(refresh: refresh).catchError(
          (Object _) {
            historyError = 'Chưa tải được lịch sử SOS.';
            return <Map<String, dynamic>>[];
          },
        ),
      ]);
      if (!mounted ||
          sequence != _loadSequence ||
          version != ApiClient.sessionVersion)
        return;
      final alerts = results[1].toList()
        ..sort((a, b) {
          final first = DateTime.tryParse(a['ngayGui']?.toString() ?? '');
          final second = DateTime.tryParse(b['ngayGui']?.toString() ?? '');
          if (first == null) return second == null ? 0 : 1;
          if (second == null) return -1;
          return second.compareTo(first);
        });
      setState(() {
        _caregivers = results[0];
        if (historyError == null) {
          _latestAlertTime = alerts.isEmpty
              ? 'Chưa có'
              : _formatAlertTime(alerts.first['ngayGui']);
        }
        _historyError = historyError;
        _loading = false;
        _error = null;
      });
    } catch (error) {
      if (!mounted ||
          sequence != _loadSequence ||
          version != ApiClient.sessionVersion)
        return;
      setState(() {
        _loading = false;
        _error = error is ApiException
            ? error.message
            : 'Không thể tải danh sách người chăm sóc.';
      });
    }
  }

  Future<void> _callCaregiver(Map<String, dynamic> caregiver) async {
    final phone = _text(
      caregiver['soDienThoai'],
      fallback: '',
    ).replaceAll(RegExp(r'[^0-9+]'), '');
    if (!RegExp(r'^\+?[0-9]{3,15}$').hasMatch(phone)) {
      _showMessage('Số điện thoại người chăm sóc chưa hợp lệ.', isError: true);
      return;
    }
    try {
      final launched = await launchUrl(
        Uri(scheme: 'tel', path: phone),
        mode: LaunchMode.externalApplication,
      );
      if (!launched && mounted) {
        _showMessage('Không thể mở ứng dụng gọi điện.', isError: true);
      }
    } catch (_) {
      if (mounted)
        _showMessage('Không thể mở ứng dụng gọi điện.', isError: true);
    }
  }

  Future<void> _showSosDialog() async {
    if (_sosDialogOpen || !mounted) return;
    final version = ApiClient.sessionVersion;
    setState(() => _sosDialogOpen = true);
    try {
      final result = await showDialog<Object>(
        context: context,
        barrierDismissible: false,
        builder: (_) => const _SosDialog(),
      );
      if (!mounted || version != ApiClient.sessionVersion) return;
      if (result == 'history') {
        await Navigator.push(
          context,
          MaterialPageRoute(
            builder: (_) => const EmergencyAlertHistoryScreen(),
          ),
        );
        if (mounted) await _loadData(refresh: true);
      } else if (result is Map<String, dynamic>) {
        ++_loadSequence;
        AlertService.instance.invalidateAlerts();
        setState(() {
          _loading = false;
          _latestAlertTime = _formatAlertTime(result['ngayGui']);
        });
        final count = int.tryParse(
          result['soNguoiChamSocDaThongBao']?.toString() ?? '',
        );
        _showMessage(
          sosDeliveryMessage(result),
          isError: count == null || count <= 0,
        );
      }
    } finally {
      if (mounted) setState(() => _sosDialogOpen = false);
    }
  }

  void _showMessage(String message, {bool isError = false}) {
    if (!mounted) return;
    ScaffoldMessenger.of(context)
      ..hideCurrentSnackBar()
      ..showSnackBar(
        SnackBar(
          duration: const Duration(seconds: 8),
          content: Text(message),
          backgroundColor: isError
              ? const Color(0xffa94400)
              : const Color(0xff07856d),
        ),
      );
  }

  Map<String, dynamic>? get _primaryCaregiver {
    for (final caregiver in _caregivers) {
      if (_isPrimaryCaregiver(caregiver)) return caregiver;
    }
    return null;
  }

  @override
  Widget build(BuildContext context) {
    final primary = _primaryCaregiver;
    return Scaffold(
      backgroundColor: const Color(0xfff3f3f1),
      appBar: AppBar(title: const Text('Người chăm sóc')),
      body: RefreshIndicator(
        onRefresh: () => _loadData(refresh: true),
        child: ListView(
          physics: const AlwaysScrollableScrollPhysics(),
          padding: const EdgeInsets.fromLTRB(18, 12, 18, 30),
          children: [
            Container(
              padding: const EdgeInsets.all(20),
              decoration: BoxDecoration(
                color: const Color(0xffe8fff5),
                borderRadius: BorderRadius.circular(24),
              ),
              child: Column(
                children: [
                  const CircleAvatar(
                    radius: 34,
                    backgroundColor: Colors.white,
                    child: Icon(
                      Icons.person,
                      size: 42,
                      color: Color(0xff07856d),
                    ),
                  ),
                  const SizedBox(height: 12),
                  Text(
                    primary == null
                        ? 'Chưa có người chăm sóc chính'
                        : _text(primary['hoTen']),
                    textAlign: TextAlign.center,
                    style: const TextStyle(
                      fontSize: 21,
                      fontWeight: FontWeight.bold,
                    ),
                  ),
                  const SizedBox(height: 6),
                  Text(
                    primary == null
                        ? 'Liên hệ quản trị viên để được phân công'
                        : 'Người chăm sóc chính',
                    textAlign: TextAlign.center,
                  ),
                  if (primary != null) ...[
                    const SizedBox(height: 14),
                    FilledButton.icon(
                      onPressed: () => _callCaregiver(primary),
                      icon: const Icon(Icons.phone),
                      label: const Text('GỌI NGƯỜI CHĂM SÓC'),
                    ),
                  ],
                ],
              ),
            ),
            const SizedBox(height: 16),
            // SOS vẫn truy cập được khi tải danh sách hoặc lịch sử thất bại.
            Card(
              color: const Color(0xffffeeee),
              child: Padding(
                padding: const EdgeInsets.all(18),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.stretch,
                  children: [
                    const Text(
                      'Cần trợ giúp khẩn cấp?',
                      style: TextStyle(
                        fontSize: 18,
                        fontWeight: FontWeight.bold,
                      ),
                    ),
                    const SizedBox(height: 8),
                    const Text(
                      'Gửi cảnh báo đến hệ thống. Nếu cần hỗ trợ ngay, '
                      'hãy gọi người chăm sóc hoặc người thân.',
                    ),
                    const SizedBox(height: 16),
                    ElevatedButton.icon(
                      onPressed: _sosDialogOpen ? null : _showSosDialog,
                      style: ElevatedButton.styleFrom(
                        backgroundColor: Colors.red,
                        foregroundColor: Colors.white,
                        padding: const EdgeInsets.symmetric(vertical: 14),
                      ),
                      icon: const Icon(Icons.sos),
                      label: const Text('GỬI CẢNH BÁO SOS'),
                    ),
                  ],
                ),
              ),
            ),
            const SizedBox(height: 18),
            const Text(
              'Danh sách người chăm sóc',
              style: TextStyle(fontSize: 18, fontWeight: FontWeight.bold),
            ),
            const SizedBox(height: 10),
            if (_loading) const LinearProgressIndicator(),
            if (_error != null)
              Card(
                child: Padding(
                  padding: const EdgeInsets.all(14),
                  child: Column(
                    children: [
                      Text(_error!, textAlign: TextAlign.center),
                      TextButton(
                        onPressed: () => _loadData(refresh: true),
                        child: const Text('Thử lại'),
                      ),
                    ],
                  ),
                ),
              ),
            if (!_loading && _error == null && _caregivers.isEmpty)
              const Padding(
                padding: EdgeInsets.all(20),
                child: Text(
                  'Chưa có người chăm sóc được phân công.',
                  textAlign: TextAlign.center,
                ),
              ),
            ..._caregivers.map(
              (caregiver) => Card(
                child: ListTile(
                  leading: const CircleAvatar(
                    child: Icon(Icons.person_outline),
                  ),
                  title: Text(
                    _text(caregiver['hoTen']),
                    style: const TextStyle(fontWeight: FontWeight.bold),
                  ),
                  subtitle: Text(
                    '${_caregiverRoleLabel(caregiver)}\n'
                    '${_text(caregiver['soDienThoai'])}'
                    '${_text(caregiver['diaChi'], fallback: '').isEmpty ? '' : '\n${_text(caregiver['diaChi'])}'}',
                  ),
                  isThreeLine: true,
                  trailing: IconButton(
                    tooltip: 'Gọi người chăm sóc',
                    onPressed: () => _callCaregiver(caregiver),
                    icon: const Icon(Icons.phone, color: Color(0xff07856d)),
                  ),
                ),
              ),
            ),
            const SizedBox(height: 16),
            Card(
              child: ListTile(
                leading: const Icon(Icons.history),
                title: const Text('SOS gần nhất'),
                subtitle: Text(_historyError ?? _latestAlertTime),
                onTap: () => Navigator.push(
                  context,
                  MaterialPageRoute(
                    builder: (_) => const EmergencyAlertHistoryScreen(),
                  ),
                ),
                trailing: const Icon(Icons.chevron_right),
              ),
            ),
          ],
        ),
      ),
    );
  }

  static bool _isPrimaryCaregiver(Map<String, dynamic> caregiver) {
    final value = caregiver['laChinh']?.toString().trim().toLowerCase();
    return value == 'true' || value == '1';
  }

  static String _caregiverRoleLabel(Map<String, dynamic> caregiver) {
    if (_isPrimaryCaregiver(caregiver)) return 'Người chăm sóc chính';
    final relationship = _text(
      caregiver['moiQuanHe'],
      fallback: 'Người chăm sóc',
    );
    return relationship.toLowerCase() == 'người chăm sóc chính'
        ? 'Người chăm sóc'
        : relationship;
  }

  static String _text(Object? value, {String fallback = 'Chưa cập nhật'}) {
    final text = value?.toString().trim() ?? '';
    return text.isEmpty ? fallback : text;
  }

  static String _formatAlertTime(Object? raw) {
    final date = DateTime.tryParse(raw?.toString() ?? '')?.toLocal();
    if (date == null) return 'Chưa cập nhật';
    String two(int value) => value.toString().padLeft(2, '0');
    return '${two(date.hour)}:${two(date.minute)} • '
        '${two(date.day)}/${two(date.month)}/${date.year}';
  }
}

class _SosDialog extends StatefulWidget {
  const _SosDialog();

  @override
  State<_SosDialog> createState() => _SosDialogState();
}

class _SosDialogState extends State<_SosDialog> {
  final _noteController = TextEditingController();
  bool _sending = false;
  bool _completed = false;
  String? _error;

  @override
  void dispose() {
    _noteController.dispose();
    super.dispose();
  }

  Future<void> _submit() async {
    if (_sending || _completed) return;
    final version = ApiClient.sessionVersion;
    setState(() {
      _sending = true;
      _error = null;
    });
    try {
      final note = _noteController.text.trim();
      final result = await CaregiverService.instance.sendEmergencyAlert(
        noiDung: note.isEmpty ? 'Tôi cần hỗ trợ khẩn cấp.' : note,
      );
      if (!mounted || version != ApiClient.sessionVersion) return;
      // Cho phép pop sau khi kết thúc request.
      setState(() {
        _sending = false;
        _completed = true;
      });
      WidgetsBinding.instance.addPostFrameCallback((_) {
        if (mounted && ModalRoute.of(context)?.isCurrent == true) {
          Navigator.pop(context, result);
        }
      });
    } catch (error) {
      if (!mounted || version != ApiClient.sessionVersion) return;
      setState(() {
        _sending = false;
        _error = error is ApiException
            ? error.message
            : 'Chưa xác nhận được kết quả gửi SOS. Kiểm tra lịch sử trước khi gửi lại.';
      });
    }
  }

  @override
  Widget build(BuildContext context) => PopScope(
    canPop: !_sending,
    child: AlertDialog(
      title: const Text('Xác nhận gửi SOS'),
      content: SingleChildScrollView(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            const Text(
              'Hệ thống sẽ lưu cảnh báo và tạo thông báo cho người chăm sóc '
              'đang phụ trách có tài khoản liên kết.',
            ),
            const SizedBox(height: 16),
            TextField(
              controller: _noteController,
              enabled: !_sending,
              maxLength: 500,
              maxLines: 3,
              decoration: const InputDecoration(
                labelText: 'Ghi chú (không bắt buộc)',
                hintText: 'Ví dụ: Tôi chóng mặt, đang ở phòng khách...',
                border: OutlineInputBorder(),
              ),
            ),
            if (_sending)
              const Padding(
                padding: EdgeInsets.only(top: 10),
                child: LinearProgressIndicator(),
              ),
            if (_error != null)
              Padding(
                padding: const EdgeInsets.only(top: 10),
                child: Text(
                  _error!,
                  style: const TextStyle(color: Color(0xffc62828)),
                ),
              ),
          ],
        ),
      ),
      actions: [
        if (_error != null)
          TextButton(
            onPressed: _sending
                ? null
                : () => Navigator.pop(context, 'history'),
            child: const Text('Xem lịch sử'),
          ),
        TextButton(
          onPressed: _sending ? null : () => Navigator.pop(context),
          child: const Text('Đóng'),
        ),
        ElevatedButton.icon(
          onPressed: _sending || _completed ? null : _submit,
          style: ElevatedButton.styleFrom(
            backgroundColor: Colors.red,
            foregroundColor: Colors.white,
          ),
          icon: const Icon(Icons.sos),
          label: Text(_sending ? 'ĐANG GỬI...' : 'GỬI SOS'),
        ),
      ],
    ),
  );
}
