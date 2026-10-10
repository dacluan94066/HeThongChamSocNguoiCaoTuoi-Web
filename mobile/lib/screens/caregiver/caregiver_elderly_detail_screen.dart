import 'package:flutter/material.dart';
import 'care_notes_screen.dart';
import 'package:url_launcher/url_launcher.dart';

import '../../services/api_client.dart';
import '../../widgets/foreground_refresh.dart';
import '../../services/caregiver_dashboard_service.dart';
import '../../widgets/alert_card.dart';

class CaregiverElderlyDetailScreen extends StatefulWidget {
  const CaregiverElderlyDetailScreen({super.key, required this.elderly});

  final Map<String, dynamic> elderly;

  @override
  State<CaregiverElderlyDetailScreen> createState() =>
      _CaregiverElderlyDetailScreenState();
}

class _CaregiverElderlyDetailScreenState
    extends State<CaregiverElderlyDetailScreen>
    with ForegroundRefresh<CaregiverElderlyDetailScreen> {
  @override
  Future<void> refreshForeground() => _load(refresh: true, silent: true);
  int _loadSequence = 0;
  Map<String, dynamic> _profile = const {};
  List<Map<String, dynamic>> _medications = const [];
  List<Map<String, dynamic>> _metrics = const [];
  List<Map<String, dynamic>> _appointments = const [];
  List<Map<String, dynamic>> _contacts = const [];
  List<Map<String, dynamic>> _alerts = const [];
  final Set<int> _savingAlertIds = <int>{};
  final Map<int, String> _alertDrafts = {};
  bool _alertDialogOpen = false;
  bool _loading = true;
  String? _error;

  int get _elderlyId => int.parse(widget.elderly['id'].toString());

  @override
  void initState() {
    super.initState();
    _load();
  }

  bool _truthy(dynamic value) => value == true || value == 1 || value == '1';
  int? _alertKey(Map<String, dynamic> alert) {
    final id = int.tryParse(alert['id']?.toString() ?? '');
    if (id != null) return id;
    final sosId = int.tryParse(alert['nguonId']?.toString() ?? '');
    return alert['nguonBang'] == 'CanhBaoKhanCap' && sosId != null
        ? -sosId
        : null;
  }

  Map<String, dynamic>? get _activeSos {
    for (final alert in _alerts) {
      if (alert['nguonBang'] == 'CanhBaoKhanCap' &&
          [
            'ChuaXuLy',
            'DaXem',
            'CHUA_XU_LY',
            'DA_XEM',
          ].contains(alert['trangThai'])) {
        return alert;
      }
    }
    return null;
  }

  Future<void> _load({bool refresh = false, bool silent = false}) async {
    final sequence = ++_loadSequence;
    final version = ApiClient.sessionVersion;
    if (!refresh) setState(() => _loading = true);
    try {
      final service = CaregiverDashboardService.instance;
      final results = await Future.wait<Object>([
        service.getElderlyDetail(_elderlyId, refresh: refresh),
        service.getElderlyMedicationToday(_elderlyId, refresh: refresh),
        service.getElderlyHealthMetrics(_elderlyId, refresh: refresh),
        service.getElderlyUpcomingAppointments(_elderlyId, refresh: refresh),
        service.getEmergencyContacts(_elderlyId, refresh: refresh),
        service.getElderlyAlerts(_elderlyId, refresh: refresh),
      ]);
      if (!mounted ||
          version != ApiClient.sessionVersion ||
          sequence != _loadSequence) {
        return;
      }
      setState(() {
        _profile = Map<String, dynamic>.from(results[0] as Map);
        _medications = List<Map<String, dynamic>>.from(results[1] as List);
        _metrics = List<Map<String, dynamic>>.from(results[2] as List);
        _appointments = List<Map<String, dynamic>>.from(results[3] as List);
        _contacts = List<Map<String, dynamic>>.from(results[4] as List);
        _alerts = List<Map<String, dynamic>>.from(results[5] as List);
        _error = null;
        _loading = false;
      });
    } on ApiException catch (error) {
      if (!mounted ||
          version != ApiClient.sessionVersion ||
          sequence != _loadSequence) {
        return;
      }
      if (silent && _profile.isNotEmpty) return;
      setState(() {
        _error = error.message;
        _loading = false;
      });
    } catch (_) {
      if (!mounted ||
          version != ApiClient.sessionVersion ||
          sequence != _loadSequence) {
        return;
      }
      if (silent && _profile.isNotEmpty) return;
      setState(() {
        _error = 'Không thể tải thông tin người cao tuổi. Vui lòng thử lại.';
        _loading = false;
      });
    }
  }

  List<Map<String, dynamic>> get _latestMetrics {
    final seen = <String>{};
    final latest = <Map<String, dynamic>>[];
    for (final metric in _metrics) {
      final key =
          metric['loaiChiSoId']?.toString() ??
          metric['tenChiSo']?.toString() ??
          '';
      if (seen.add(key)) latest.add(metric);
      if (latest.length == 6) break;
    }
    return latest;
  }

  String _text(dynamic value) {
    final text = value?.toString().trim() ?? '';
    return text.isEmpty ? 'Chưa cập nhật' : text;
  }

  String _dateTime(dynamic value) {
    final parsed = DateTime.tryParse(value?.toString() ?? '')?.toLocal();
    if (parsed == null) return 'Chưa cập nhật';
    String two(int number) => number.toString().padLeft(2, '0');
    return '${two(parsed.hour)}:${two(parsed.minute)} - ${two(parsed.day)}/${two(parsed.month)}/${parsed.year}';
  }

  Future<void> _call(String phone) async {
    final uri = Uri(scheme: 'tel', path: phone);
    if (!await launchUrl(uri)) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Không thể mở ứng dụng gọi điện.')),
      );
    }
  }

  Future<void> _reloadAlerts() async {
    final version = ApiClient.sessionVersion;
    final alerts = await CaregiverDashboardService.instance.getElderlyAlerts(
      _elderlyId,
      refresh: true,
    );
    if (!mounted || version != ApiClient.sessionVersion) return;
    setState(() => _alerts = alerts);
  }

  Future<void> _acceptAlert(Map<String, dynamic> alert) async {
    final version = ApiClient.sessionVersion;
    final id = _alertKey(alert);
    if (id == null || _savingAlertIds.contains(id)) return;
    setState(() => _savingAlertIds.add(id));
    var saved = false;
    try {
      if (alert['nguonBang'] == 'CanhBaoKhanCap') {
        await CaregiverDashboardService.instance.markEmergencySeen(
          int.parse(alert['nguonId'].toString()),
        );
      } else {
        await CaregiverDashboardService.instance.markAlertSeen(id);
      }
      saved = true;
      if (!mounted || version != ApiClient.sessionVersion) return;
      setState(
        () => _alerts = [
          for (final item in _alerts)
            if (_alertKey(item) == id)
              {...item, 'trangThai': 'DA_XEM', 'trangThaiLabel': 'Đã xem'}
            else
              item,
        ],
      );
      await _reloadAlerts();
      if (!mounted || version != ApiClient.sessionVersion) return;
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(
          content: Text('Đã tiếp nhận cảnh báo.'),
          backgroundColor: Color(0xff07856d),
        ),
      );
    } on ApiException catch (error) {
      if (!mounted || version != ApiClient.sessionVersion) return;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text(
            saved
                ? 'Đã tiếp nhận cảnh báo, nhưng chưa tải lại được danh sách. Kéo xuống để thử lại.'
                : error.message,
          ),
          backgroundColor: Colors.red,
        ),
      );
    } catch (_) {
      if (mounted && version == ApiClient.sessionVersion) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text(
              saved
                  ? 'Đã tiếp nhận cảnh báo. Hãy tải lại danh sách.'
                  : 'Không cập nhật được cảnh báo. Hãy thử lại.',
            ),
          ),
        );
      }
    } finally {
      if (mounted) setState(() => _savingAlertIds.remove(id));
    }
  }

  Future<void> _resolveAlert(Map<String, dynamic> alert) async {
    final version = ApiClient.sessionVersion;
    final id = _alertKey(alert);
    if (id == null || _savingAlertIds.contains(id) || _alertDialogOpen) return;
    _alertDialogOpen = true;
    final formKey = GlobalKey<FormState>();
    var noteInput = _alertDrafts[id] ?? '';
    final note = await showDialog<String>(
      context: context,
      builder: (dialogContext) => AlertDialog(
        scrollable: true,
        title: const Text('Hoàn tất xử lý cảnh báo'),
        content: Form(
          key: formKey,
          child: TextFormField(
            initialValue: noteInput,
            maxLength: 500,
            maxLines: 4,
            autofocus: true,
            onChanged: (value) {
              noteInput = value;
              _alertDrafts[id] = value;
            },
            decoration: const InputDecoration(
              labelText: 'Kết quả xử lý',
              hintText: 'Ví dụ: Đã gọi điện và xác nhận người bệnh ổn định.',
              border: OutlineInputBorder(),
            ),
            validator: (value) => value?.trim().isEmpty == true
                ? 'Vui lòng nhập kết quả xử lý'
                : null,
          ),
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(dialogContext),
            child: const Text('Hủy'),
          ),
          FilledButton(
            onPressed: () {
              if (formKey.currentState?.validate() != true) return;
              Navigator.pop(dialogContext, noteInput.trim());
            },
            child: const Text('Xác nhận đã xử lý'),
          ),
        ],
      ),
    );
    _alertDialogOpen = false;
    if (note == null ||
        note.isEmpty ||
        !mounted ||
        version != ApiClient.sessionVersion) {
      return;
    }

    setState(() => _savingAlertIds.add(id));
    var saved = false;
    try {
      if (alert['nguonBang'] == 'CanhBaoKhanCap') {
        await CaregiverDashboardService.instance.resolveEmergency(
          int.parse(alert['nguonId'].toString()),
          note,
        );
      } else {
        await CaregiverDashboardService.instance.resolveAlert(id, note);
      }
      saved = true;
      _alertDrafts.remove(id);
      if (!mounted || version != ApiClient.sessionVersion) return;
      setState(
        () => _alerts = [
          for (final item in _alerts)
            if (_alertKey(item) == id)
              {
                ...item,
                'trangThai': 'DA_XU_LY',
                'trangThaiLabel': 'Đã xử lý',
                'ghiChuXuLy': note,
              }
            else
              item,
        ],
      );
      await _reloadAlerts();
      if (!mounted || version != ApiClient.sessionVersion) return;
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(
          content: Text('Cảnh báo đã được xử lý.'),
          backgroundColor: Color(0xff07856d),
        ),
      );
    } on ApiException catch (error) {
      if (!mounted || version != ApiClient.sessionVersion) return;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text(
            saved
                ? 'Đã xử lý cảnh báo, nhưng chưa tải lại được danh sách. Kéo xuống để thử lại.'
                : error.message,
          ),
          backgroundColor: Colors.red,
        ),
      );
    } catch (_) {
      if (mounted && version == ApiClient.sessionVersion) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text(
              saved
                  ? 'Đã xử lý cảnh báo. Hãy tải lại danh sách.'
                  : 'Không cập nhật được cảnh báo. Hãy thử lại.',
            ),
          ),
        );
      }
    } finally {
      if (mounted) setState(() => _savingAlertIds.remove(id));
    }
  }

  Widget? _alertAction(Map<String, dynamic> alert) {
    final id = _alertKey(alert);
    final status = alert['trangThai']?.toString();
    final saving = id != null && _savingAlertIds.contains(id);
    if (saving) {
      return const Align(
        alignment: Alignment.centerRight,
        child: SizedBox(
          width: 22,
          height: 22,
          child: CircularProgressIndicator(strokeWidth: 2),
        ),
      );
    }
    if (status == 'CHUA_XU_LY' || status == 'ChuaXuLy') {
      return SizedBox(
        width: double.infinity,
        child: FilledButton.icon(
          onPressed: () => _acceptAlert(alert),
          icon: const Icon(Icons.visibility_outlined),
          label: const Text('TIẾP NHẬN CẢNH BÁO'),
        ),
      );
    }
    if (status == 'DA_XEM' || status == 'DaXem') {
      return SizedBox(
        width: double.infinity,
        child: FilledButton.icon(
          onPressed: () => _resolveAlert(alert),
          icon: const Icon(Icons.check_circle_outline_rounded),
          label: const Text('ĐÁNH DẤU ĐÃ XỬ LÝ'),
          style: FilledButton.styleFrom(
            backgroundColor: const Color(0xff07856d),
          ),
        ),
      );
    }
    return null;
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: const Color(0xfff4f6f5),
      appBar: AppBar(
        actions: [
          IconButton(
            tooltip: 'Nhật ký chăm sóc',
            icon: const Icon(Icons.edit_note),
            onPressed: () => Navigator.push(
              context,
              MaterialPageRoute(
                builder: (_) => CareNotesScreen(
                  elderlyId: _elderlyId,
                  elderlyName: widget.elderly['hoTen']?.toString() ?? 'Hồ sơ',
                ),
              ),
            ),
          ),
        ],
        title: Text(
          widget.elderly['hoTen']?.toString() ?? 'Chi tiết người cao tuổi',
          style: const TextStyle(fontWeight: FontWeight.bold),
        ),
      ),
      body: _loading
          ? const Center(child: CircularProgressIndicator())
          : _error != null
          ? Center(
              child: Column(
                mainAxisSize: MainAxisSize.min,
                children: [
                  Text(_error!, textAlign: TextAlign.center),
                  const SizedBox(height: 14),
                  FilledButton(onPressed: _load, child: const Text('Thử lại')),
                ],
              ),
            )
          : RefreshIndicator(
              onRefresh: () => _load(refresh: true),
              child: ListView(
                padding: const EdgeInsets.fromLTRB(14, 8, 14, 30),
                children: [
                  if (_activeSos != null)
                    _EmergencyCard(
                      content: _text(
                        _activeSos!['noiDung'] ?? _activeSos!['moTa'],
                      ),
                      sentAt: _dateTime(_activeSos!['ngayTao']),
                    ),
                  _Section(
                    title: 'Thông tin cơ bản',
                    icon: Icons.person_outline_rounded,
                    child: Column(
                      children: [
                        _InfoRow(
                          label: 'Họ tên',
                          value: _text(_profile['hoTen']),
                        ),
                        _InfoRow(
                          label: 'Tuổi',
                          value: '${widget.elderly['tuoi'] ?? '--'} tuổi',
                        ),
                        _InfoRow(
                          label: 'Giới tính',
                          value: _text(_profile['gioiTinh']),
                        ),
                        _InfoRow(
                          label: 'Nhóm máu',
                          value: _text(_profile['nhomMau']),
                        ),
                        _InfoRow(
                          label: 'Bệnh nền',
                          value: _text(_profile['benhNen']),
                        ),
                        _InfoRow(
                          label: 'Dị ứng',
                          value: _text(_profile['diUng']),
                        ),
                      ],
                    ),
                  ),
                  _Section(
                    title: 'Lịch uống thuốc hôm nay',
                    icon: Icons.medication_outlined,
                    child: _medications.isEmpty
                        ? const _EmptyLine(
                            text: 'Hôm nay không có lịch uống thuốc.',
                          )
                        : Column(
                            children: _medications.map((item) {
                              return ListTile(
                                contentPadding: EdgeInsets.zero,
                                leading: const CircleAvatar(
                                  backgroundColor: Color(0xfffff1dd),
                                  child: Icon(
                                    Icons.medication_rounded,
                                    color: Color(0xffd77700),
                                  ),
                                ),
                                title: Text(
                                  _text(item['tenThuoc']),
                                  style: const TextStyle(
                                    fontWeight: FontWeight.bold,
                                  ),
                                ),
                                subtitle: Text(
                                  '${_text(item['lieuDung'])} • ${_dateTime(item['thoiGianDuKien'])}',
                                ),
                                trailing: Text(
                                  _medicationStatus(item['trangThai']),
                                ),
                              );
                            }).toList(),
                          ),
                  ),
                  _Section(
                    title: 'Chỉ số sức khỏe gần nhất',
                    icon: Icons.monitor_heart_outlined,
                    child: _latestMetrics.isEmpty
                        ? const _EmptyLine(text: 'Chưa có chỉ số sức khỏe.')
                        : Column(
                            children: _latestMetrics.map((item) {
                              final secondary = item['giaTriPhu'];
                              final value = secondary == null
                                  ? '${item['giaTri'] ?? '--'}'
                                  : '${item['giaTri'] ?? '--'}/$secondary';
                              return ListTile(
                                contentPadding: EdgeInsets.zero,
                                leading: Icon(
                                  _truthy(item['laBatThuong'])
                                      ? Icons.warning_amber_rounded
                                      : Icons.favorite_outline_rounded,
                                  color: _truthy(item['laBatThuong'])
                                      ? Colors.red
                                      : const Color(0xff07856d),
                                ),
                                title: Text(_text(item['tenChiSo'])),
                                subtitle: Text(_dateTime(item['thoiGianDo'])),
                                trailing: Text(
                                  '$value ${item['donVi'] ?? ''}',
                                  style: const TextStyle(
                                    fontWeight: FontWeight.bold,
                                  ),
                                ),
                              );
                            }).toList(),
                          ),
                  ),
                  _Section(
                    title: 'Lịch khám sắp tới',
                    icon: Icons.calendar_month_outlined,
                    child: _appointments.isEmpty
                        ? const _EmptyLine(text: 'Không có lịch khám sắp tới.')
                        : Column(
                            children: _appointments.map((item) {
                              return ListTile(
                                contentPadding: EdgeInsets.zero,
                                leading: const CircleAvatar(
                                  backgroundColor: Color(0xffe8efff),
                                  child: Icon(
                                    Icons.local_hospital_outlined,
                                    color: Color(0xff3564c8),
                                  ),
                                ),
                                title: Text(
                                  _text(item['tenBenhVien']),
                                  style: const TextStyle(
                                    fontWeight: FontWeight.bold,
                                  ),
                                ),
                                subtitle: Text(
                                  '${_dateTime(item['thoiGianKham'])}\nBS. ${_text(item['bacSiPhuTrach'])} • ${_text(item['chuyenKhoa'])}',
                                ),
                                isThreeLine: true,
                              );
                            }).toList(),
                          ),
                  ),
                  _Section(
                    title: 'Liên hệ khẩn cấp',
                    icon: Icons.contact_phone_outlined,
                    child: _contacts.isEmpty
                        ? const _EmptyLine(text: 'Chưa có số liên hệ khẩn cấp.')
                        : Column(
                            children: _contacts.map((item) {
                              final phone =
                                  item['soDienThoai']?.toString() ?? '';
                              return ListTile(
                                contentPadding: EdgeInsets.zero,
                                leading: const Icon(
                                  Icons.phone_in_talk_outlined,
                                  color: Color(0xff07856d),
                                ),
                                title: Text(_text(item['hoTen'])),
                                subtitle: Text(
                                  '${_text(item['moiQuanHe'])} • ${_text(phone)}',
                                ),
                                trailing: IconButton.filledTonal(
                                  tooltip: 'Gọi điện',
                                  onPressed: phone.isEmpty
                                      ? null
                                      : () => _call(phone),
                                  icon: const Icon(Icons.call_rounded),
                                ),
                              );
                            }).toList(),
                          ),
                  ),
                  _Section(
                    title: 'Lịch sử cảnh báo',
                    icon: Icons.notifications_active_outlined,
                    child: _alerts.isEmpty
                        ? const _EmptyLine(text: 'Chưa có cảnh báo nào.')
                        : Column(
                            children: _alerts
                                .map(
                                  (item) => AlertCard(
                                    alert: item,
                                    compact: true,
                                    footer: _alertAction(item),
                                  ),
                                )
                                .toList(),
                          ),
                  ),
                ],
              ),
            ),
    );
  }

  String _medicationStatus(dynamic status) => switch (status?.toString()) {
    'DaUong' => 'Đã uống',
    'BoLo' => 'Bỏ lỡ',
    _ => 'Chưa đến giờ',
  };
}

class _EmergencyCard extends StatelessWidget {
  const _EmergencyCard({required this.content, required this.sentAt});

  final String content;
  final String sentAt;

  @override
  Widget build(BuildContext context) => Container(
    margin: const EdgeInsets.only(bottom: 12),
    padding: const EdgeInsets.all(16),
    decoration: BoxDecoration(
      color: const Color(0xffffe3e3),
      borderRadius: BorderRadius.circular(18),
      border: Border.all(color: const Color(0xffe64a4a)),
    ),
    child: Row(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        const Icon(Icons.sos_rounded, color: Colors.red, size: 34),
        const SizedBox(width: 12),
        Expanded(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              const Text(
                'Cảnh báo khẩn cấp chưa xử lý',
                style: TextStyle(
                  color: Color(0xffa51414),
                  fontWeight: FontWeight.bold,
                ),
              ),
              const SizedBox(height: 5),
              Text(content),
              Text(sentAt, style: const TextStyle(color: Colors.black54)),
            ],
          ),
        ),
      ],
    ),
  );
}

class _Section extends StatelessWidget {
  const _Section({
    required this.title,
    required this.icon,
    required this.child,
  });

  final String title;
  final IconData icon;
  final Widget child;

  @override
  Widget build(BuildContext context) => Card(
    elevation: 0,
    color: Colors.white,
    margin: const EdgeInsets.only(bottom: 12),
    child: Padding(
      padding: const EdgeInsets.all(16),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Icon(icon, color: const Color(0xff07856d)),
              const SizedBox(width: 8),
              Expanded(
                child: Text(
                  title,
                  style: const TextStyle(
                    fontSize: 17,
                    fontWeight: FontWeight.bold,
                  ),
                ),
              ),
            ],
          ),
          const Divider(height: 24),
          child,
        ],
      ),
    ),
  );
}

class _InfoRow extends StatelessWidget {
  const _InfoRow({required this.label, required this.value});

  final String label;
  final String value;

  @override
  Widget build(BuildContext context) => Padding(
    padding: const EdgeInsets.symmetric(vertical: 5),
    child: Row(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        SizedBox(
          width: 90,
          child: Text(label, style: const TextStyle(color: Colors.black54)),
        ),
        Expanded(
          child: Text(
            value,
            style: const TextStyle(fontWeight: FontWeight.w600),
          ),
        ),
      ],
    ),
  );
}

class _EmptyLine extends StatelessWidget {
  const _EmptyLine({required this.text});

  final String text;

  @override
  Widget build(BuildContext context) => Padding(
    padding: const EdgeInsets.symmetric(vertical: 12),
    child: Center(
      child: Text(text, style: const TextStyle(color: Colors.black54)),
    ),
  );
}
