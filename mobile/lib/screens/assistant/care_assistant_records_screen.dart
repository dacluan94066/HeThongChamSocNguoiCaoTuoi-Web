import 'package:flutter/material.dart';
import 'package:url_launcher/url_launcher.dart';
import '../../models/care_assistant.dart';
import '../../services/api_client.dart';
import '../../services/care_assistant_service.dart';

class CareAssistantRecordsScreen extends StatefulWidget {
  const CareAssistantRecordsScreen({
    super.key,
    required this.action,
    this.profile,
    this.service,
  });
  final AssistantAction action;
  final AssistantProfile? profile;
  final CareAssistantService? service;
  @override
  State<CareAssistantRecordsScreen> createState() =>
      _CareAssistantRecordsScreenState();
}

class _CareAssistantRecordsScreenState
    extends State<CareAssistantRecordsScreen> {
  late final int _version;
  late final CareAssistantService _service;
  AssistantReply? _reply;
  String? _error;
  bool _loading = true;
  int _sequence = 0;
  static const questions = {
    AssistantAction.medications: 'Hôm nay tôi uống thuốc gì?',
    AssistantAction.appointments: 'Lịch khám tiếp theo khi nào?',
    AssistantAction.health: 'Chỉ số sức khỏe gần nhất?',
    AssistantAction.caregivers: 'Ai đang chăm sóc tôi?',
    AssistantAction.notes: 'Mở nhật ký chăm sóc.',
  };
  @override
  void initState() {
    super.initState();
    _version = ApiClient.sessionVersion;
    _service = widget.service ?? CareAssistantService();
    ApiClient.sessionChanges.addListener(_sessionChanged);
    _load();
  }

  void _sessionChanged() {
    _sequence++;
    if (mounted) {
      setState(() {
        _reply = null;
        _loading = false;
        _error = 'Phiên đã thay đổi. Hãy quay lại đăng nhập.';
      });
    }
  }

  Future<void> _load() async {
    if (_version != ApiClient.sessionVersion) return;
    final sequence = ++_sequence;
    setState(() {
      _loading = true;
      _error = null;
    });
    try {
      final question = questions[widget.action];
      if (question == null) {
        throw const ApiException('Màn hình này không hỗ trợ hành động đó.');
      }
      final reply = await _service.ask(question, elderlyId: widget.profile?.id);
      if (!mounted ||
          _version != ApiClient.sessionVersion ||
          sequence != _sequence) {
        return;
      }
      setState(() => _reply = reply);
    } catch (e) {
      if (!mounted ||
          _version != ApiClient.sessionVersion ||
          sequence != _sequence) {
        return;
      }
      setState(
        () =>
            _error = e is ApiException ? e.message : 'Không tải được dữ liệu.',
      );
    } finally {
      if (mounted &&
          _version == ApiClient.sessionVersion &&
          sequence == _sequence) {
        setState(() => _loading = false);
      }
    }
  }

  String text(Object? raw) => raw?.toString().trim().isNotEmpty == true
      ? raw.toString()
      : 'Chưa ghi nhận';
  String date(Object? raw) {
    final d = DateTime.tryParse(raw?.toString() ?? '');
    if (d == null) return 'Chưa ghi thời gian';
    String two(int n) => n.toString().padLeft(2, '0');
    return '${two(d.hour)}:${two(d.minute)} · ${two(d.day)}/${two(d.month)}/${d.year}';
  }

  Future<void> _call(String phone) async {
    if (_version != ApiClient.sessionVersion) return;
    final number = phone.replaceAll(RegExp(r'[^0-9+]'), '');
    if (number.isEmpty) return;
    try {
      if (!await launchUrl(
        Uri(scheme: 'tel', path: number),
        mode: LaunchMode.externalApplication,
      )) {
        throw const ApiException('Không mở được ứng dụng gọi điện.');
      }
    } catch (_) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text('Không mở được ứng dụng gọi điện.')),
        );
      }
    }
  }

  @override
  void dispose() {
    _reply = null;
    ApiClient.sessionChanges.removeListener(_sessionChanged);
    super.dispose();
  }

  @override
  Widget build(BuildContext context) => Scaffold(
    backgroundColor: const Color(0xfff3f6f4),
    appBar: AppBar(title: Text(widget.action.label)),
    body: SafeArea(
      child: _loading
          ? const Center(child: CircularProgressIndicator())
          : _error != null
          ? Center(
              child: Padding(
                padding: const EdgeInsets.all(24),
                child: Column(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    Text(_error!, textAlign: TextAlign.center),
                    const SizedBox(height: 12),
                    if (_version == ApiClient.sessionVersion)
                      FilledButton(
                        onPressed: _load,
                        child: const Text('Thử lại'),
                      ),
                  ],
                ),
              ),
            )
          : RefreshIndicator(
              onRefresh: _load,
              child: ListView(
                physics: const AlwaysScrollableScrollPhysics(),
                padding: const EdgeInsets.all(16),
                children: [
                  Text(
                    'Hồ sơ: ${widget.profile?.name ?? 'Của tôi'}',
                    style: const TextStyle(
                      fontWeight: FontWeight.bold,
                      fontSize: 18,
                    ),
                  ),
                  const SizedBox(height: 12),
                  Text(
                    _reply?.text ?? '',
                    style: const TextStyle(fontSize: 16, height: 1.5),
                  ),
                  const SizedBox(height: 8),
                  Text(
                    'Lấy dữ liệu: ${date(_reply?.fetchedAt?.toIso8601String())}',
                    style: const TextStyle(color: Colors.black54),
                  ),
                  if (_reply?.truncated == true)
                    const Text('Danh sách có giới hạn 50 mục.'),
                  const SizedBox(height: 16),
                  ...?_reply?.rows.map((row) => _card(row)),
                ],
              ),
            ),
    ),
  );
  Widget _card(Map<String, dynamic> row) {
    final (title, body) = switch (widget.action) {
      AssistantAction.medications => (
        text(row['tenThuoc']),
        'Liều: ${text(row['lieuDung'])}\nLịch: ${date(row['thoiGianDuKien'])}\nCách dùng đã lưu: ${text(row['cachDung'])}',
      ),
      AssistantAction.appointments => (
        date(row['thoiGianKham']),
        '${text(row['tenBenhVien'])}\nBác sĩ: ${text(row['bacSiPhuTrach'])}\nChuyên khoa: ${text(row['chuyenKhoa'])}\nLý do: ${text(row['lyDoKham'])}',
      ),
      AssistantAction.health => (
        text(row['tenChiSo']),
        '${text(row['giaTri'])}${row['giaTriPhu'] == null ? '' : '/${row['giaTriPhu']}'} ${text(row['donVi'])}\nĐo lúc: ${date(row['thoiGianDo'])}',
      ),
      AssistantAction.caregivers => (
        text(row['hoTen']),
        'Điện thoại: ${text(row['soDienThoai'])}',
      ),
      AssistantAction.notes => (
        text(row['hoatDong']),
        '${date(row['ngayGhi'])}\n${text(row['moTaChiTiet'])}',
      ),
      _ => ('', ''),
    };
    return Card(
      margin: const EdgeInsets.only(bottom: 12),
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(
              title,
              style: const TextStyle(fontSize: 18, fontWeight: FontWeight.bold),
            ),
            const SizedBox(height: 8),
            SelectableText(
              body,
              style: const TextStyle(fontSize: 16, height: 1.5),
            ),
            if (widget.action == AssistantAction.caregivers &&
                row['soDienThoai']?.toString().trim().isNotEmpty == true)
              Padding(
                padding: const EdgeInsets.only(top: 12),
                child: FilledButton.icon(
                  onPressed: () => _call(row['soDienThoai'].toString()),
                  icon: const Icon(Icons.call),
                  label: const Text('Gọi người chăm sóc'),
                ),
              ),
          ],
        ),
      ),
    );
  }
}
