import 'package:flutter/material.dart';
import '../../services/api_client.dart';
import '../../services/care_today_service.dart';
import '../../services/care_report_export_service.dart';
import 'care_lifestyle_screen.dart';

class CareReportScreen extends StatefulWidget {
  const CareReportScreen({
    super.key,
    required this.profileId,
    this.initialDays = 7,
    this.service = const CareTodayService(),
  });
  final int profileId, initialDays;
  final CareTodayService service;
  @override
  State<CareReportScreen> createState() => _CareReportScreenState();
}

class _CareReportScreenState extends State<CareReportScreen> {
  final _session = ApiClient.sessionVersion;
  int _seq = 0, _days = 7;
  bool _loading = true;
  String? _error;
  Map<String, dynamic>? _data;
  bool _exporting = false;
  bool get _valid => mounted && _session == ApiClient.sessionVersion;
  @override
  void initState() {
    super.initState();
    _days = widget.initialDays == 30 ? 30 : 7;
    ApiClient.sessionChanges.addListener(_invalidate);
    _load();
  }

  @override
  void didUpdateWidget(covariant CareReportScreen old) {
    super.didUpdateWidget(old);
    if (old.profileId != widget.profileId) {
      CareReportExportService.cancel();
      _load();
    }
  }

  void _invalidate() {
    _seq++;
    if (mounted) {
      setState(() {
        _data = null;
        _loading = false;
        _error = 'Phiên đã thay đổi. Hãy đăng nhập lại.';
      });
    }
  }

  @override
  void dispose() {
    ApiClient.sessionChanges.removeListener(_invalidate);
    super.dispose();
  }

  Future<void> _load() async {
    if (!_valid) return;
    final seq = ++_seq;
    setState(() {
      _data = null;
      _loading = true;
      _error = null;
    });
    try {
      final d = Map<String, dynamic>.from(
        await widget.service.request(
              '/care/${widget.profileId}/report',
              query: {'days': _days},
            )
            as Map,
      );
      if (_valid && seq == _seq) {
        setState(() {
          _data = d;
          _loading = false;
        });
      }
    } catch (e) {
      if (_valid && seq == _seq) {
        setState(() {
          _loading = false;
          _error = e is ApiException
              ? e.message
              : 'Không thể tạo báo cáo từ dữ liệu nguồn.';
        });
      }
    }
  }

  Widget _card(String title, String content) => Card(
    elevation: 0,
    child: Padding(
      padding: const EdgeInsets.all(14),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            title,
            style: const TextStyle(fontSize: 20, fontWeight: FontWeight.bold),
          ),
          Text(content),
        ],
      ),
    ),
  );
  Future<void> _export() async {
    if (!_valid || _data == null || _exporting) return;
    final report = _data!;
    final id = widget.profileId;
    setState(() => _exporting = true);
    try {
      final yes = await showDialog<bool>(
        context: context,
        builder: (c) => AlertDialog(
          title: const Text('Xuất báo cáo PDF?'),
          content: const Text(
            'Hộp thoại Android sẽ cho xem trước. Chọn “Lưu dưới dạng PDF” và vị trí lưu. Báo cáo có thông tin cá nhân; chỉ lưu hoặc in khi bạn chủ động xác nhận.',
          ),
          actions: [
            TextButton(
              onPressed: () => Navigator.pop(c, false),
              child: const Text('Hủy'),
            ),
            FilledButton(
              onPressed: () => Navigator.pop(c, true),
              child: const Text('Tiếp tục'),
            ),
          ],
        ),
      );
      if (yes == true &&
          _valid &&
          id == widget.profileId &&
          identical(report, _data)) {
        await CareReportExportService.printReport(report, _session);
      }
    } catch (e) {
      if (mounted && _valid) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text(
              e is ApiException
                  ? e.message
                  : 'Chưa xuất được báo cáo. Hãy thử lại.',
            ),
          ),
        );
      }
    } finally {
      if (mounted) setState(() => _exporting = false);
    }
  }

  String _statuses(Map raw) => raw.entries
      .map((e) => '${_labels[e.key] ?? e.key}: ${e.value}')
      .join('\n');
  Future<void> _share() async {
    if (!_valid || _data == null || _exporting) return;
    final report = _data;
    final id = widget.profileId;
    setState(() => _exporting = true);
    try {
      final yes = await showDialog<bool>(
        context: context,
        builder: (c) => AlertDialog(
          title: const Text('Chia sẻ PDF đã xuất'),
          content: const Text(
            'Chọn file báo cáo đã lưu, đúng hồ sơ và khoảng ngày đang xem. Nếu chưa có file, hãy hủy và dùng nút Xuất PDF trước. Bạn tự chọn ứng dụng và người nhận.',
          ),
          actions: [
            TextButton(
              onPressed: () => Navigator.pop(c, false),
              child: const Text('Hủy'),
            ),
            FilledButton(
              onPressed: () => Navigator.pop(c, true),
              child: const Text('Chọn file'),
            ),
          ],
        ),
      );
      if (yes == true &&
          _valid &&
          id == widget.profileId &&
          identical(report, _data)) {
        await CareReportExportService.shareExported(_session);
      }
    } catch (e) {
      if (mounted && _valid) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text(
              e is ApiException
                  ? e.message
                  : 'Chưa chia sẻ được PDF. Hãy thử lại.',
            ),
          ),
        );
      }
    } finally {
      if (mounted) setState(() => _exporting = false);
    }
  }

  static const _labels = {
    'DaUong': 'Đã xác nhận uống',
    'ChuaDenGio': 'Chưa có xác nhận uống',
    'BoLo': 'Bản ghi bỏ lỡ',
    'TuChoi': 'Bản ghi từ chối',
    'ChuaDen': 'Chưa đến',
    'DaKham': 'Đã khám',
    'Huy': 'Đã hủy',
    'DaHuy': 'Đã hủy',
    'DaDoiLich': 'Đã đổi lịch',
    'ChuaXuLy': 'Chưa xử lý',
    'DaXem': 'Đã xem',
    'DaXuLy': 'Đã xử lý',
    'BoQua': 'Đã bỏ qua',
    'DangGui': 'Đang gửi',
    'DaTiepNhan': 'Đã tiếp nhận',
  };
  @override
  Widget build(BuildContext context) {
    final d = _data;
    return Scaffold(
      appBar: AppBar(
        title: const Text('Báo cáo chăm sóc'),
        actions: [
          if (CareReportExportService.supported)
            IconButton(
              onPressed: _valid && d != null && !_loading && !_exporting
                  ? _share
                  : null,
              icon: const Icon(Icons.share_outlined),
              tooltip: 'Chia sẻ PDF đã xuất',
            ),
          if (CareReportExportService.supported)
            IconButton(
              onPressed: _valid && d != null && !_loading && !_exporting
                  ? _export
                  : null,
              icon: const Icon(Icons.picture_as_pdf_outlined),
              tooltip: 'Xuất PDF',
            ),
          IconButton(
            onPressed: _loading ? null : _load,
            icon: const Icon(Icons.refresh),
            tooltip: 'Tạo lại báo cáo',
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
              Wrap(
                spacing: 8,
                children: [
                  for (final days in [7, 30])
                    ChoiceChip(
                      label: Text('$days ngày'),
                      selected: _days == days,
                      onSelected: !_valid
                          ? null
                          : (_) {
                              setState(() => _days = days);
                              _load();
                            },
                    ),
                ],
              ),
              if (_loading)
                const Center(child: CircularProgressIndicator())
              else if (_error != null) ...[
                Text(_error!),
                TextButton(
                  onPressed: _valid ? _load : null,
                  child: const Text('Thử lại'),
                ),
              ] else if (d != null) ...[
                Text(
                  d['profile']['hoTen'].toString(),
                  style: const TextStyle(
                    fontSize: 22,
                    fontWeight: FontWeight.bold,
                  ),
                ),
                Text(
                  '${d['from']} → ${d['to']} • Giờ Việt Nam\nTạo lúc ${careDisplay(d['generatedAt'])}',
                ),
                const Text(
                  'Thiếu xác nhận không chứng minh đã bỏ thuốc. Không ghi nhận dữ liệu không có nghĩa sức khỏe tốt.',
                ),
                if (d['hasData'] != true)
                  const Padding(
                    padding: EdgeInsets.all(16),
                    child: Text('Chưa có dữ liệu chăm sóc trong khoảng này.'),
                  ),
                _card(
                  'Thuốc theo lịch',
                  '${d['medication']['confirmed']}/${d['medication']['scheduled']} lịch có xác nhận uống\n${d['medication']['withoutConfirmation']} chưa có xác nhận uống\n${_statuses(d['medication']['byStatus'] as Map)}',
                ),
                _card(
                  'Lịch khám',
                  '${d['appointments']['total']} lịch theo thời điểm đã lưu\n${_statuses(d['appointments']['byStatus'] as Map)}',
                ),
                _card(
                  'Hoạt động chăm sóc',
                  '${d['activities']['completed']}/${d['activities']['scheduled']} lần đã xác nhận\n${d['activities']['withoutConfirmation']} chưa có xác nhận',
                ),
                _card(
                  'Sinh hoạt',
                  '${d['lifestyle']['records']} bản ghi\nBữa ăn: ${careDisplay(d['lifestyle']['totals']['mealCount'])}\nNước: ${careDisplay(d['lifestyle']['totals']['waterMl'])} ml\nNgủ trong khoảng: ${careDisplay(d['lifestyle']['totals']['sleepMinutes'])} phút\nVận động: ${careDisplay(d['lifestyle']['totals']['exerciseMinutes'])} phút\nTâm trạng: ${careDisplay(d['lifestyle']['totals']['moodCount'])} bản ghi',
                ),
                _card(
                  'Cảnh báo',
                  '${d['alerts']['total']} cảnh báo (SOS chỉ tính một lần)\n${(d['alerts']['bySource'] as List).map((r) => '${r['source'] == 'sos' ? 'SOS' : 'Cảnh báo'} • ${_labels[r['status']] ?? r['status']}: ${r['count']}').join('\n')}\n${d['measurementCount']} số đo đã ghi. Báo cáo không chẩn đoán hay đánh giá sức khỏe tổng thể.',
                ),
                const Text(
                  'Xác nhận theo ngày',
                  style: TextStyle(fontSize: 20, fontWeight: FontWeight.bold),
                ),
                ...(d['daily'] as List).map(
                  (r) => Card(
                    elevation: 0,
                    child: Padding(
                      padding: const EdgeInsets.all(12),
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text(r['date'].toString()),
                          Text(
                            'Thuốc: ${r['medicationConfirmed']}/${r['medicationScheduled']} xác nhận',
                          ),
                          if ((r['medicationScheduled'] as num) > 0)
                            Semantics(
                              label: 'Tỷ lệ xác nhận thuốc ngày ${r['date']}',
                              child: LinearProgressIndicator(
                                value:
                                    (r['medicationConfirmed'] as num) /
                                    (r['medicationScheduled'] as num),
                                color: const Color(0xff07856d),
                              ),
                            ),
                          Text(
                            'Chăm sóc: ${r['careCompleted']}/${r['careScheduled']} xác nhận',
                          ),
                          if ((r['careScheduled'] as num) > 0)
                            Semantics(
                              label:
                                  'Tỷ lệ hoàn thành chăm sóc ngày ${r['date']}',
                              child: LinearProgressIndicator(
                                value:
                                    (r['careCompleted'] as num) /
                                    (r['careScheduled'] as num),
                                color: const Color(0xff07856d),
                              ),
                            ),
                        ],
                      ),
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
}
