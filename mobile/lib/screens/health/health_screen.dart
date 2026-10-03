import 'package:flutter/material.dart';

import '../../services/api_client.dart';
import '../../services/health_metric_service.dart';

class HealthScreen extends StatefulWidget {
  const HealthScreen({super.key});

  @override
  State<HealthScreen> createState() => _HealthScreenState();
}

class _HealthScreenState extends State<HealthScreen> {
  List<Map<String, dynamic>> _metricTypes = [];
  List<Map<String, dynamic>> _metrics = [];
  bool _loading = true;
  String? _error;

  @override
  void initState() {
    super.initState();
    _loadData();
  }

  Future<void> _loadData({bool refresh = false}) async {
    if (mounted && (_metricTypes.isEmpty || _metrics.isEmpty)) {
      setState(() => _loading = true);
    }
    try {
      final results = await Future.wait<List<Map<String, dynamic>>>([
        HealthMetricService.instance.getMetricTypes(refresh: refresh),
        HealthMetricService.instance.getMyHealthMetrics(refresh: refresh),
      ]);
      if (!mounted) return;
      setState(() {
        _metricTypes = results[0];
        _metrics = results[1];
        _error = null;
        _loading = false;
      });
    } on ApiException catch (error) {
      if (!mounted) return;
      setState(() {
        _error = error.message;
        _loading = false;
      });
    } catch (_) {
      if (!mounted) return;
      setState(() {
        _error = 'Không thể tải dữ liệu sức khỏe.';
        _loading = false;
      });
    }
  }

  Map<int, Map<String, dynamic>> get _latestByType {
    final result = <int, Map<String, dynamic>>{};
    for (final metric in _metrics) {
      final typeId = _asInt(metric['loaiChiSoId']);
      if (typeId != null) result.putIfAbsent(typeId, () => metric);
    }
    return result;
  }

  Future<void> _openUpdateSheet() async {
    if (_metricTypes.isEmpty) return;
    var selectedId = _asInt(_metricTypes.first['id']);
    var saving = false;
    var primaryText = '';
    var secondaryText = '';
    var noteText = '';

    final result = await showModalBottomSheet<Map<String, dynamic>>(
      context: context,
      isScrollControlled: true,
      backgroundColor: Colors.white,
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(28)),
      ),
      builder: (sheetContext) => StatefulBuilder(
        builder: (sheetContext, setSheetState) {
          final selectedType = _metricTypes
              .cast<Map<String, dynamic>?>()
              .firstWhere(
                (item) => _asInt(item?['id']) == selectedId,
                orElse: () => null,
              );
          final needsSecondary =
              selectedType?['giaTriMin2'] != null ||
              selectedType?['giaTriMax2'] != null;
          final unit = selectedType?['donVi']?.toString() ?? '';

          Future<void> save() async {
            final primary = double.tryParse(
              primaryText.trim().replaceAll(',', '.'),
            );
            final secondary = double.tryParse(
              secondaryText.trim().replaceAll(',', '.'),
            );
            if (selectedId == null || primary == null) {
              _showMessage('Vui lòng chọn loại và nhập giá trị hợp lệ.');
              return;
            }
            if (needsSecondary && secondary == null) {
              _showMessage('Vui lòng nhập cả huyết áp tâm trương.');
              return;
            }

            setSheetState(() => saving = true);
            try {
              final result = await HealthMetricService.instance.addHealthMetric(
                loaiChiSoId: selectedId!,
                giaTri: primary,
                giaTriPhu: needsSecondary ? secondary : null,
                ghiChu: noteText,
              );
              if (!sheetContext.mounted) return;
              Navigator.pop(sheetContext, result);
            } on ApiException catch (error) {
              if (!mounted) return;
              _showMessage(error.message);
              if (sheetContext.mounted) {
                setSheetState(() => saving = false);
              }
            } catch (_) {
              if (!mounted) return;
              _showMessage('Không thể ghi nhận chỉ số. Vui lòng thử lại.');
              if (sheetContext.mounted) {
                setSheetState(() => saving = false);
              }
            }
          }

          return Padding(
            padding: EdgeInsets.fromLTRB(
              20,
              18,
              20,
              MediaQuery.of(sheetContext).viewInsets.bottom + 24,
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
                  const SizedBox(height: 20),
                  const Text(
                    'Cập nhật chỉ số',
                    style: TextStyle(fontSize: 21, fontWeight: FontWeight.bold),
                  ),
                  const SizedBox(height: 18),
                  InputDecorator(
                    decoration: _inputDecoration('Loại chỉ số'),
                    child: DropdownButtonHideUnderline(
                      child: DropdownButton<int>(
                        value: selectedId,
                        isExpanded: true,
                        items: _metricTypes.map((type) {
                          final id = _asInt(type['id'])!;
                          return DropdownMenuItem<int>(
                            value: id,
                            child: Text(type['tenChiSo']?.toString() ?? ''),
                          );
                        }).toList(),
                        onChanged: saving
                            ? null
                            : (value) => setSheetState(() {
                                selectedId = value;
                              }),
                      ),
                    ),
                  ),
                  const SizedBox(height: 14),
                  TextField(
                    enabled: !saving,
                    onChanged: (value) => primaryText = value,
                    keyboardType: const TextInputType.numberWithOptions(
                      decimal: true,
                    ),
                    decoration: _inputDecoration(
                      needsSecondary ? 'Huyết áp tâm thu' : 'Giá trị',
                      suffix: unit,
                    ),
                  ),
                  if (needsSecondary) ...[
                    const SizedBox(height: 14),
                    TextField(
                      enabled: !saving,
                      onChanged: (value) => secondaryText = value,
                      keyboardType: const TextInputType.numberWithOptions(
                        decimal: true,
                      ),
                      decoration: _inputDecoration(
                        'Huyết áp tâm trương',
                        suffix: unit,
                      ),
                    ),
                  ],
                  const SizedBox(height: 14),
                  TextField(
                    enabled: !saving,
                    onChanged: (value) => noteText = value,
                    maxLength: 300,
                    decoration: _inputDecoration('Ghi chú (không bắt buộc)'),
                  ),
                  const SizedBox(height: 8),
                  SizedBox(
                    width: double.infinity,
                    height: 54,
                    child: ElevatedButton.icon(
                      onPressed: saving ? null : save,
                      icon: saving
                          ? const SizedBox(
                              width: 20,
                              height: 20,
                              child: CircularProgressIndicator(
                                strokeWidth: 2,
                                color: Colors.white,
                              ),
                            )
                          : const Icon(Icons.save_outlined),
                      label: Text(saving ? 'ĐANG LƯU...' : 'LƯU CHỈ SỐ'),
                      style: ElevatedButton.styleFrom(
                        backgroundColor: const Color(0xff07856d),
                        foregroundColor: Colors.white,
                        shape: RoundedRectangleBorder(
                          borderRadius: BorderRadius.circular(18),
                        ),
                      ),
                    ),
                  ),
                ],
              ),
            ),
          );
        },
      ),
    );
    if (!mounted || result == null) return;
    await _loadData(refresh: true);
    if (!mounted) return;
    if (result['laBatThuong'] == true) {
      await _showAbnormalWarning(result);
    } else {
      _showMessage('Đã ghi nhận chỉ số sức khỏe.');
    }
  }

  Future<void> _showHistory(Map<String, dynamic> type) async {
    final typeId = _asInt(type['id']);
    if (typeId == null) return;
    await showModalBottomSheet<void>(
      context: context,
      isScrollControlled: true,
      backgroundColor: const Color(0xfff3f3f1),
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(28)),
      ),
      builder: (context) => FractionallySizedBox(
        heightFactor: 0.78,
        child: Padding(
          padding: const EdgeInsets.fromLTRB(18, 18, 18, 24),
          child: Column(
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
              const SizedBox(height: 20),
              Text(
                'Lịch sử ${type['tenChiSo'] ?? ''}',
                style: const TextStyle(
                  fontSize: 21,
                  fontWeight: FontWeight.bold,
                ),
              ),
              const SizedBox(height: 14),
              Expanded(
                child: FutureBuilder<List<Map<String, dynamic>>>(
                  future: HealthMetricService.instance.getMyHealthMetrics(
                    loaiChiSoId: typeId,
                  ),
                  builder: (context, snapshot) {
                    if (snapshot.connectionState == ConnectionState.waiting) {
                      return const Center(child: CircularProgressIndicator());
                    }
                    if (snapshot.hasError) {
                      return Center(
                        child: Text(
                          snapshot.error is ApiException
                              ? (snapshot.error! as ApiException).message
                              : 'Không thể tải lịch sử chỉ số.',
                          textAlign: TextAlign.center,
                        ),
                      );
                    }
                    final items = snapshot.data ?? [];
                    if (items.isEmpty) {
                      return const Center(
                        child: Text('Chưa có lần đo nào được ghi nhận.'),
                      );
                    }
                    return ListView.separated(
                      itemCount: items.length,
                      separatorBuilder: (_, _) => const SizedBox(height: 10),
                      itemBuilder: (context, index) {
                        final item = items[index];
                        final abnormal = item['laBatThuong'] == true;
                        return Container(
                          padding: const EdgeInsets.all(15),
                          decoration: BoxDecoration(
                            color: Colors.white,
                            borderRadius: BorderRadius.circular(18),
                            border: abnormal
                                ? Border.all(color: const Color(0xffe45151))
                                : null,
                          ),
                          child: Row(
                            children: [
                              Icon(
                                abnormal
                                    ? Icons.warning_amber_rounded
                                    : Icons.check_circle_outline,
                                color: abnormal
                                    ? const Color(0xffe45151)
                                    : const Color(0xff07856d),
                              ),
                              const SizedBox(width: 12),
                              Expanded(
                                child: Column(
                                  crossAxisAlignment: CrossAxisAlignment.start,
                                  children: [
                                    Text(
                                      _displayValue(item),
                                      style: const TextStyle(
                                        fontSize: 17,
                                        fontWeight: FontWeight.bold,
                                      ),
                                    ),
                                    const SizedBox(height: 4),
                                    Text(
                                      _formatDateTime(item['thoiGianDo']),
                                      style: const TextStyle(
                                        color: Colors.black54,
                                      ),
                                    ),
                                    if ((item['ghiChu']?.toString() ?? '')
                                        .trim()
                                        .isNotEmpty) ...[
                                      const SizedBox(height: 4),
                                      Text(item['ghiChu'].toString()),
                                    ],
                                  ],
                                ),
                              ),
                            ],
                          ),
                        );
                      },
                    );
                  },
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }

  Future<void> _showAbnormalWarning(Map<String, dynamic> metric) {
    return showDialog<void>(
      context: context,
      builder: (context) => AlertDialog(
        icon: const Icon(
          Icons.warning_amber_rounded,
          color: Color(0xffd94b32),
          size: 48,
        ),
        title: const Text('Chỉ số vượt ngưỡng'),
        content: Text(
          '${metric['tenChiSo'] ?? 'Chỉ số'}: ${_displayValue(metric)}. '
          'Chỉ số vượt ngưỡng bình thường, vui lòng chú ý và liên hệ nhân viên y tế nếu thấy không khỏe.',
          textAlign: TextAlign.center,
        ),
        actions: [
          FilledButton(
            style: FilledButton.styleFrom(
              backgroundColor: const Color(0xffd94b32),
            ),
            onPressed: () => Navigator.pop(context),
            child: const Text('ĐÃ HIỂU'),
          ),
        ],
      ),
    );
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
          'Theo dõi sức khỏe',
          style: TextStyle(fontWeight: FontWeight.bold),
        ),
      ),
      floatingActionButton: _loading || _error != null || _metricTypes.isEmpty
          ? null
          : FloatingActionButton.extended(
              onPressed: _openUpdateSheet,
              backgroundColor: const Color(0xff07856d),
              foregroundColor: Colors.white,
              icon: const Icon(Icons.add_rounded),
              label: const Text('CẬP NHẬT'),
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
                onPressed: () => _loadData(refresh: true),
                icon: const Icon(Icons.refresh),
                label: const Text('Thử lại'),
              ),
            ],
          ),
        ),
      );
    }

    final latest = _latestByType;
    final newest = _metrics.isEmpty ? null : _metrics.first;
    return RefreshIndicator(
      onRefresh: () => _loadData(refresh: true),
      child: ListView(
        padding: const EdgeInsets.fromLTRB(18, 10, 18, 100),
        children: [
          Container(
            padding: const EdgeInsets.all(18),
            decoration: BoxDecoration(
              gradient: const LinearGradient(
                colors: [Color(0xffe9fff6), Color(0xffffffe8)],
              ),
              borderRadius: BorderRadius.circular(28),
            ),
            child: Row(
              children: [
                const CircleAvatar(
                  radius: 33,
                  backgroundColor: Colors.white,
                  child: Icon(
                    Icons.favorite_rounded,
                    color: Color(0xffe45050),
                    size: 34,
                  ),
                ),
                const SizedBox(width: 14),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      const Text(
                        'Dữ liệu sức khỏe gần nhất',
                        style: TextStyle(color: Colors.black54),
                      ),
                      const SizedBox(height: 5),
                      Text(
                        newest == null
                            ? 'Chưa có chỉ số'
                            : _formatDateTime(newest['thoiGianDo']),
                        style: const TextStyle(
                          fontSize: 18,
                          fontWeight: FontWeight.bold,
                        ),
                      ),
                    ],
                  ),
                ),
              ],
            ),
          ),
          const SizedBox(height: 24),
          const Text(
            'Các chỉ số theo dõi',
            style: TextStyle(fontSize: 18, fontWeight: FontWeight.bold),
          ),
          const SizedBox(height: 6),
          const Text(
            'Chạm vào từng chỉ số để xem lịch sử đo.',
            style: TextStyle(color: Colors.black54),
          ),
          const SizedBox(height: 12),
          if (_metricTypes.isEmpty)
            const Padding(
              padding: EdgeInsets.symmetric(vertical: 40),
              child: Center(child: Text('Chưa có danh mục chỉ số.')),
            )
          else
            ..._metricTypes.map((type) {
              final metric = latest[_asInt(type['id'])];
              return Padding(
                padding: const EdgeInsets.only(bottom: 12),
                child: _MetricCard(
                  icon: _iconFor(type['tenChiSo']?.toString()),
                  title: type['tenChiSo']?.toString() ?? 'Chỉ số',
                  value: metric == null
                      ? 'Chưa có dữ liệu'
                      : _displayValue(metric),
                  time: metric == null
                      ? _normalRange(type)
                      : _formatDateTime(metric['thoiGianDo']),
                  abnormal: metric?['laBatThuong'] == true,
                  onTap: () => _showHistory(type),
                ),
              );
            }),
          const SizedBox(height: 12),
          Container(
            padding: const EdgeInsets.all(16),
            decoration: BoxDecoration(
              color: Colors.white,
              borderRadius: BorderRadius.circular(22),
            ),
            child: const Row(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Icon(Icons.info_outline_rounded, color: Color(0xff07856d)),
                SizedBox(width: 10),
                Expanded(
                  child: Text(
                    'Các chỉ số dùng để theo dõi thông tin do người dùng nhập, không thay thế chẩn đoán của nhân viên y tế.',
                    style: TextStyle(color: Colors.black54, height: 1.4),
                  ),
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }

  static InputDecoration _inputDecoration(String label, {String? suffix}) {
    return InputDecoration(
      labelText: label,
      suffixText: suffix,
      filled: true,
      fillColor: const Color(0xfff6f6f6),
      border: OutlineInputBorder(
        borderRadius: BorderRadius.circular(16),
        borderSide: BorderSide.none,
      ),
    );
  }

  static int? _asInt(Object? value) {
    if (value is int) return value;
    return int.tryParse(value?.toString() ?? '');
  }

  static String _displayValue(Map<String, dynamic> metric) {
    final primary = _number(metric['giaTri']);
    final secondary = metric['giaTriPhu'];
    final value = secondary == null
        ? primary
        : '$primary/${_number(secondary)}';
    final unit = metric['donVi']?.toString() ?? '';
    return unit.isEmpty ? value : '$value $unit';
  }

  static String _number(Object? value) {
    final number = double.tryParse(value?.toString() ?? '');
    if (number == null) return value?.toString() ?? '—';
    return number == number.roundToDouble()
        ? number.toInt().toString()
        : number.toStringAsFixed(1);
  }

  static String _formatDateTime(Object? raw) {
    final date = DateTime.tryParse(raw?.toString() ?? '')?.toLocal();
    if (date == null) return 'Không rõ thời gian';
    return '${date.hour.toString().padLeft(2, '0')}:'
        '${date.minute.toString().padLeft(2, '0')} '
        '${date.day.toString().padLeft(2, '0')}/'
        '${date.month.toString().padLeft(2, '0')}/${date.year}';
  }

  static String _normalRange(Map<String, dynamic> type) {
    final min = type['giaTriMin'];
    final max = type['giaTriMax'];
    final min2 = type['giaTriMin2'];
    final max2 = type['giaTriMax2'];
    if (min == null && max == null) return 'Chưa cấu hình ngưỡng';
    final primary = '${_number(min)}–${_number(max)}';
    final secondary = min2 == null && max2 == null
        ? ''
        : '/${_number(min2)}–${_number(max2)}';
    return 'Ngưỡng: $primary$secondary ${type['donVi'] ?? ''}';
  }

  static IconData _iconFor(String? name) {
    final value = name?.toLowerCase() ?? '';
    if (value.contains('huyết áp')) return Icons.monitor_heart_rounded;
    if (value.contains('nhịp tim')) return Icons.favorite_rounded;
    if (value.contains('đường huyết')) return Icons.bloodtype_rounded;
    if (value.contains('nhiệt độ')) return Icons.thermostat_rounded;
    if (value.contains('spo2')) return Icons.air_rounded;
    if (value.contains('cân nặng')) return Icons.monitor_weight_rounded;
    return Icons.health_and_safety_rounded;
  }
}

class _MetricCard extends StatelessWidget {
  const _MetricCard({
    required this.icon,
    required this.title,
    required this.value,
    required this.time,
    required this.abnormal,
    required this.onTap,
  });

  final IconData icon;
  final String title;
  final String value;
  final String time;
  final bool abnormal;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final color = abnormal ? const Color(0xffd94b32) : const Color(0xff07856d);
    return Material(
      color: Colors.white,
      borderRadius: BorderRadius.circular(22),
      child: InkWell(
        onTap: onTap,
        borderRadius: BorderRadius.circular(22),
        child: Container(
          padding: const EdgeInsets.all(16),
          decoration: BoxDecoration(
            borderRadius: BorderRadius.circular(22),
            border: abnormal ? Border.all(color: color) : null,
          ),
          child: Row(
            children: [
              Container(
                width: 50,
                height: 50,
                decoration: BoxDecoration(
                  color: color.withValues(alpha: 0.1),
                  borderRadius: BorderRadius.circular(16),
                ),
                child: Icon(icon, color: color),
              ),
              const SizedBox(width: 13),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Row(
                      children: [
                        Expanded(
                          child: Text(
                            title,
                            style: const TextStyle(fontWeight: FontWeight.w600),
                          ),
                        ),
                        if (abnormal)
                          const Text(
                            'BẤT THƯỜNG',
                            style: TextStyle(
                              color: Color(0xffd94b32),
                              fontSize: 11,
                              fontWeight: FontWeight.bold,
                            ),
                          ),
                      ],
                    ),
                    const SizedBox(height: 5),
                    Text(
                      value,
                      style: const TextStyle(
                        fontSize: 18,
                        fontWeight: FontWeight.bold,
                      ),
                    ),
                    const SizedBox(height: 4),
                    Text(
                      time,
                      style: const TextStyle(
                        color: Colors.black54,
                        fontSize: 12,
                      ),
                    ),
                  ],
                ),
              ),
              const Icon(Icons.chevron_right_rounded, color: Colors.black38),
            ],
          ),
        ),
      ),
    );
  }
}
