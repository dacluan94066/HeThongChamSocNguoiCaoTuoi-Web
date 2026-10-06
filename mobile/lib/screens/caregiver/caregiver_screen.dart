import 'package:flutter/material.dart';
import 'package:url_launcher/url_launcher.dart';

import '../../services/alert_storage.dart';
import '../../services/api_client.dart';
import '../../services/caregiver_service.dart';

class CaregiverScreen extends StatefulWidget {
  const CaregiverScreen({super.key});

  @override
  State<CaregiverScreen> createState() => _CaregiverScreenState();
}

class _CaregiverScreenState extends State<CaregiverScreen> {
  List<Map<String, dynamic>> _caregivers = [];
  bool _loading = true;
  String? _error;
  String _latestAlertTime = 'Chưa có';

  @override
  void initState() {
    super.initState();
    _loadData();
  }

  Future<void> _loadData({bool refresh = false}) async {
    if (!refresh && mounted) {
      setState(() {
        _loading = true;
        _error = null;
      });
    }

    try {
      final results = await Future.wait([
        CaregiverService.instance.getMyCaregivers(refresh: refresh),
        AlertStorage.loadAlerts(),
      ]);
      if (!mounted) return;
      final alerts = results[1];
      setState(() {
        _caregivers = results[0];
        _latestAlertTime = alerts.isEmpty
            ? 'Chưa có'
            : _text(alerts.first['time'], fallback: 'Chưa có');
        _loading = false;
        _error = null;
      });
    } catch (error) {
      if (!mounted) return;
      setState(() {
        _loading = false;
        _error = error is ApiException
            ? error.message
            : 'Không thể tải danh sách người chăm sóc.';
      });
    }
  }

  Future<void> _loadLatestAlert() async {
    final alerts = await AlertStorage.loadAlerts();
    if (!mounted) return;
    setState(() {
      _latestAlertTime = alerts.isEmpty
          ? 'Chưa có'
          : _text(alerts.first['time'], fallback: 'Chưa có');
    });
  }

  Future<void> _callCaregiver(Map<String, dynamic> caregiver) async {
    final phone = _text(caregiver['soDienThoai'], fallback: '');
    final normalized = phone.replaceAll(RegExp(r'[^0-9+]'), '');
    if (normalized.isEmpty) {
      _showMessage('Người chăm sóc chưa có số điện thoại.', isError: true);
      return;
    }

    try {
      final launched = await launchUrl(
        Uri.parse('tel:$normalized'),
        mode: LaunchMode.externalApplication,
      );
      if (!launched && mounted) {
        _showMessage('Không thể mở ứng dụng gọi điện.', isError: true);
      }
    } catch (_) {
      if (mounted) {
        _showMessage('Không thể mở ứng dụng gọi điện.', isError: true);
      }
    }
  }

  Future<void> _showSosDialog() async {
    final noteController = TextEditingController();
    var sending = false;
    String? sendError;

    await showDialog<void>(
      context: context,
      barrierDismissible: false,
      builder: (dialogContext) {
        return StatefulBuilder(
          builder: (context, setDialogState) {
            Future<void> submit() async {
              setDialogState(() {
                sending = true;
                sendError = null;
              });
              final note = noteController.text.trim();
              final content = note.isEmpty ? 'Tôi cần hỗ trợ khẩn cấp.' : note;

              try {
                final response = await CaregiverService.instance
                    .sendEmergencyAlert(noiDung: content);
                await AlertStorage.addEmergencyAlert(
                  message: content,
                  backendId: response['id'],
                );
                if (!dialogContext.mounted) return;
                Navigator.of(dialogContext).pop();
                await _loadLatestAlert();
                if (mounted) {
                  _showMessage(
                    'Đã gửi cảnh báo SOS đến hệ thống và người chăm sóc.',
                  );
                }
              } catch (error) {
                if (!dialogContext.mounted) return;
                setDialogState(() {
                  sending = false;
                  sendError = error is ApiException
                      ? error.message
                      : 'Gửi SOS thất bại. Vui lòng thử lại ngay.';
                });
              }
            }

            return AlertDialog(
              shape: RoundedRectangleBorder(
                borderRadius: BorderRadius.circular(24),
              ),
              title: const Row(
                children: [
                  Icon(Icons.warning_amber_rounded, color: Colors.red),
                  SizedBox(width: 10),
                  Text('Xác nhận gửi SOS'),
                ],
              ),
              content: Column(
                mainAxisSize: MainAxisSize.min,
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  const Text(
                    'Cảnh báo sẽ được gửi ngay đến hệ thống và tất cả người chăm sóc đang phụ trách bạn.',
                    style: TextStyle(height: 1.4),
                  ),
                  const SizedBox(height: 16),
                  TextField(
                    controller: noteController,
                    enabled: !sending,
                    maxLength: 500,
                    maxLines: 3,
                    decoration: const InputDecoration(
                      labelText: 'Ghi chú (không bắt buộc)',
                      hintText:
                          'Ví dụ: Tôi bị chóng mặt, đang ở phòng khách...',
                      border: OutlineInputBorder(),
                    ),
                  ),
                  if (sending) ...[
                    const SizedBox(height: 8),
                    const Row(
                      children: [
                        SizedBox(
                          width: 20,
                          height: 20,
                          child: CircularProgressIndicator(strokeWidth: 2),
                        ),
                        SizedBox(width: 10),
                        Text('Đang gửi cảnh báo khẩn cấp...'),
                      ],
                    ),
                  ],
                  if (sendError != null) ...[
                    const SizedBox(height: 8),
                    Container(
                      width: double.infinity,
                      padding: const EdgeInsets.all(10),
                      decoration: BoxDecoration(
                        color: const Color(0xffffebee),
                        borderRadius: BorderRadius.circular(10),
                      ),
                      child: Text(
                        sendError!,
                        style: const TextStyle(
                          color: Color(0xffc62828),
                          fontWeight: FontWeight.w600,
                        ),
                      ),
                    ),
                  ],
                ],
              ),
              actions: [
                TextButton(
                  onPressed: sending
                      ? null
                      : () => Navigator.of(dialogContext).pop(),
                  child: const Text('Hủy'),
                ),
                ElevatedButton.icon(
                  onPressed: sending ? null : submit,
                  style: ElevatedButton.styleFrom(
                    backgroundColor: Colors.red,
                    foregroundColor: Colors.white,
                  ),
                  icon: const Icon(Icons.sos_rounded),
                  label: Text(sendError == null ? 'GỬI SOS' : 'THỬ LẠI'),
                ),
              ],
            );
          },
        );
      },
    );
    noteController.dispose();
  }

  void _showMessage(String message, {bool isError = false}) {
    ScaffoldMessenger.of(context)
      ..hideCurrentSnackBar()
      ..showSnackBar(
        SnackBar(
          content: Text(message),
          backgroundColor: isError
              ? const Color(0xffc62828)
              : const Color(0xff07856d),
        ),
      );
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
          'Người chăm sóc',
          style: TextStyle(fontWeight: FontWeight.bold),
        ),
      ),
      body: _loading
          ? const Center(
              child: CircularProgressIndicator(color: Color(0xff07856d)),
            )
          : _error != null
          ? _ErrorView(
              message: _error!,
              onRetry: () => _loadData(refresh: true),
            )
          : RefreshIndicator(
              onRefresh: () => _loadData(refresh: true),
              color: const Color(0xff07856d),
              child: ListView(
                physics: const AlwaysScrollableScrollPhysics(),
                padding: const EdgeInsets.fromLTRB(18, 10, 18, 30),
                children: [
                  _buildSummary(),
                  const SizedBox(height: 24),
                  const Text(
                    'Danh sách người chăm sóc',
                    style: TextStyle(fontSize: 18, fontWeight: FontWeight.bold),
                  ),
                  const SizedBox(height: 12),
                  if (_caregivers.isEmpty)
                    _buildEmptyCaregivers()
                  else
                    ..._caregivers.map(_buildCaregiverCard),
                  const SizedBox(height: 18),
                  _buildSosCard(),
                  const SizedBox(height: 18),
                  _buildLatestAlertCard(),
                ],
              ),
            ),
    );
  }

  Widget _buildSummary() {
    final primary = _primaryCaregiver;
    return Container(
      width: double.infinity,
      padding: const EdgeInsets.all(20),
      decoration: BoxDecoration(
        gradient: const LinearGradient(
          colors: [Color(0xffe8fff5), Color(0xfffffce8)],
          begin: Alignment.topLeft,
          end: Alignment.bottomRight,
        ),
        borderRadius: BorderRadius.circular(28),
      ),
      child: Column(
        children: [
          const CircleAvatar(
            radius: 42,
            backgroundColor: Colors.white,
            child: Icon(
              Icons.person_rounded,
              size: 48,
              color: Color(0xff07856d),
            ),
          ),
          const SizedBox(height: 14),
          Text(
            primary == null
                ? 'Chưa có người chăm sóc chính'
                : _text(primary['hoTen']),
            textAlign: TextAlign.center,
            style: const TextStyle(fontSize: 22, fontWeight: FontWeight.bold),
          ),
          const SizedBox(height: 4),
          Text(
            primary == null
                ? 'Liên hệ quản trị viên để được phân công'
                : 'Người chăm sóc chính',
            textAlign: TextAlign.center,
            style: const TextStyle(fontSize: 14, color: Colors.black54),
          ),
          if (primary != null) ...[
            const SizedBox(height: 16),
            SizedBox(
              width: double.infinity,
              height: 50,
              child: ElevatedButton.icon(
                onPressed: () => _callCaregiver(primary),
                icon: const Icon(Icons.phone_rounded),
                label: const Text(
                  'GỌI NGƯỜI CHĂM SÓC',
                  style: TextStyle(fontWeight: FontWeight.bold),
                ),
                style: ElevatedButton.styleFrom(
                  backgroundColor: const Color(0xff07856d),
                  foregroundColor: Colors.white,
                  elevation: 0,
                  shape: RoundedRectangleBorder(
                    borderRadius: BorderRadius.circular(16),
                  ),
                ),
              ),
            ),
          ],
        ],
      ),
    );
  }

  Widget _buildCaregiverCard(Map<String, dynamic> caregiver) {
    final isPrimary =
        caregiver['laChinh'] == true ||
        caregiver['laChinh'] == 1 ||
        caregiver['laChinh']?.toString().toLowerCase() == 'true';
    final phone = _text(caregiver['soDienThoai']);
    return Container(
      margin: const EdgeInsets.only(bottom: 12),
      padding: const EdgeInsets.all(15),
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(22),
      ),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Container(
            width: 50,
            height: 50,
            decoration: const BoxDecoration(
              color: Color(0xffeef7f4),
              shape: BoxShape.circle,
            ),
            child: const Icon(
              Icons.person_outline_rounded,
              color: Color(0xff07856d),
            ),
          ),
          const SizedBox(width: 12),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Row(
                  children: [
                    Expanded(
                      child: Text(
                        _text(caregiver['hoTen']),
                        style: const TextStyle(
                          fontSize: 15,
                          fontWeight: FontWeight.bold,
                        ),
                      ),
                    ),
                    if (isPrimary)
                      Container(
                        padding: const EdgeInsets.symmetric(
                          horizontal: 8,
                          vertical: 4,
                        ),
                        decoration: BoxDecoration(
                          color: const Color(0xffe4f7f1),
                          borderRadius: BorderRadius.circular(20),
                        ),
                        child: const Text(
                          'Chính',
                          style: TextStyle(
                            color: Color(0xff07856d),
                            fontSize: 11,
                            fontWeight: FontWeight.bold,
                          ),
                        ),
                      ),
                  ],
                ),
                const SizedBox(height: 4),
                Text(
                  _text(caregiver['moiQuanHe'], fallback: 'Người chăm sóc'),
                  style: const TextStyle(fontSize: 13, color: Colors.black54),
                ),
                const SizedBox(height: 4),
                Text(
                  phone,
                  style: const TextStyle(fontSize: 13, color: Colors.black54),
                ),
                if (_text(caregiver['diaChi'], fallback: '').isNotEmpty) ...[
                  const SizedBox(height: 4),
                  Text(
                    _text(caregiver['diaChi']),
                    style: const TextStyle(fontSize: 12, color: Colors.black45),
                  ),
                ],
              ],
            ),
          ),
          IconButton(
            tooltip: 'Gọi ${_text(caregiver['hoTen'])}',
            onPressed: () => _callCaregiver(caregiver),
            icon: const Icon(Icons.phone_rounded, color: Color(0xff07856d)),
          ),
        ],
      ),
    );
  }

  Widget _buildEmptyCaregivers() {
    return Container(
      padding: const EdgeInsets.all(24),
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(22),
      ),
      child: const Column(
        children: [
          Icon(Icons.person_off_outlined, size: 44, color: Colors.black38),
          SizedBox(height: 10),
          Text(
            'Chưa có người chăm sóc được phân công.',
            textAlign: TextAlign.center,
            style: TextStyle(color: Colors.black54),
          ),
        ],
      ),
    );
  }

  Widget _buildSosCard() {
    return Container(
      width: double.infinity,
      padding: const EdgeInsets.all(18),
      decoration: BoxDecoration(
        color: const Color(0xffffeeee),
        borderRadius: BorderRadius.circular(24),
      ),
      child: Column(
        children: [
          const Row(
            children: [
              CircleAvatar(
                radius: 26,
                backgroundColor: Colors.white,
                child: Icon(Icons.sos_rounded, color: Colors.red, size: 30),
              ),
              SizedBox(width: 12),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      'Cần trợ giúp khẩn cấp?',
                      style: TextStyle(
                        fontSize: 17,
                        fontWeight: FontWeight.bold,
                      ),
                    ),
                    SizedBox(height: 4),
                    Text(
                      'Gửi cảnh báo ngay đến hệ thống và người chăm sóc.',
                      style: TextStyle(fontSize: 13, color: Colors.black54),
                    ),
                  ],
                ),
              ),
            ],
          ),
          const SizedBox(height: 16),
          SizedBox(
            width: double.infinity,
            height: 52,
            child: ElevatedButton.icon(
              onPressed: _showSosDialog,
              icon: const Icon(Icons.warning_rounded),
              label: const Text(
                'GỬI CẢNH BÁO SOS',
                style: TextStyle(fontWeight: FontWeight.bold),
              ),
              style: ElevatedButton.styleFrom(
                backgroundColor: Colors.red,
                foregroundColor: Colors.white,
                elevation: 0,
                shape: RoundedRectangleBorder(
                  borderRadius: BorderRadius.circular(17),
                ),
              ),
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildLatestAlertCard() {
    return Container(
      width: double.infinity,
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(22),
      ),
      child: Row(
        children: [
          const CircleAvatar(
            backgroundColor: Color(0xffe8f8ee),
            child: Icon(
              Icons.check_circle_outline_rounded,
              color: Color(0xff07856d),
            ),
          ),
          const SizedBox(width: 12),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                const Text(
                  'Cảnh báo gần nhất',
                  style: TextStyle(fontWeight: FontWeight.bold),
                ),
                const SizedBox(height: 4),
                Text(
                  _latestAlertTime,
                  style: const TextStyle(fontSize: 12, color: Colors.black54),
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }

  Map<String, dynamic>? get _primaryCaregiver {
    for (final caregiver in _caregivers) {
      if (caregiver['laChinh'] == true ||
          caregiver['laChinh'] == 1 ||
          caregiver['laChinh']?.toString().toLowerCase() == 'true') {
        return caregiver;
      }
    }
    return _caregivers.isEmpty ? null : _caregivers.first;
  }

  static String _text(Object? value, {String fallback = 'Chưa cập nhật'}) {
    final text = value?.toString().trim() ?? '';
    return text.isEmpty ? fallback : text;
  }
}

class _ErrorView extends StatelessWidget {
  const _ErrorView({required this.message, required this.onRetry});

  final String message;
  final VoidCallback onRetry;

  @override
  Widget build(BuildContext context) {
    return Center(
      child: Padding(
        padding: const EdgeInsets.all(28),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            const Icon(
              Icons.cloud_off_rounded,
              color: Color(0xffc62828),
              size: 52,
            ),
            const SizedBox(height: 12),
            Text(message, textAlign: TextAlign.center),
            const SizedBox(height: 16),
            ElevatedButton.icon(
              onPressed: onRetry,
              icon: const Icon(Icons.refresh_rounded),
              label: const Text('Thử lại'),
            ),
          ],
        ),
      ),
    );
  }
}
