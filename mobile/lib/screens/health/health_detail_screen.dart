import 'dart:math' as math;

import 'package:flutter/material.dart';
import '../../theme/care_senior_theme.dart';
import '../../widgets/draggable_assistant_fab.dart';
import '../../widgets/care_senior_ui.dart';
import 'health_dashboard_ui.dart';

import '../../services/api_client.dart';
import '../../services/health_metric_service.dart';
import '../assistant/care_assistant_screen.dart';

class HealthDetailScreen extends StatefulWidget {
  const HealthDetailScreen({super.key});

  @override
  State<HealthDetailScreen> createState() => _HealthDetailScreenState();
}

class _HealthDetailScreenState extends State<HealthDetailScreen> {
  static const teal = CareSeniorColors.deepGreen;
  static const red = CareSeniorColors.danger;
  List<Map<String, dynamic>> _types = const [];
  List<Map<String, dynamic>> _metrics = const [];
  String _selected = 'Huyết áp';
  final _systolic = TextEditingController();
  final _diastolic = TextEditingController();
  final _pulse = TextEditingController();
  final _value = TextEditingController();
  bool _loading = true;
  bool _saving = false;
  String? _error;
  bool _sheetOpen =
      false; // Presentation only; existing data state is unchanged.

  @override
  void initState() {
    super.initState();
    _load();
  }

  @override
  void dispose() {
    _systolic.dispose();
    _diastolic.dispose();
    _pulse.dispose();
    _value.dispose();
    super.dispose();
  }

  Future<void> _load({bool refresh = false}) async {
    try {
      final result = await Future.wait([
        HealthMetricService.instance.getMetricTypes(refresh: refresh),
        HealthMetricService.instance.getMyHealthMetrics(refresh: refresh),
      ]);
      if (!mounted) return;
      setState(() {
        _types = result[0];
        _metrics = result[1];
        _loading = false;
        _error = null;
        if (_types.isNotEmpty &&
            !_types.any((type) => type['tenChiSo'] == _selected)) {
          _selected = _types.first['tenChiSo']?.toString() ?? '';
        }
      });
    } catch (error) {
      if (!mounted) return;
      setState(() {
        _loading = false;
        _error = error is ApiException
            ? error.message
            : 'Không tải được chỉ số sức khỏe.';
      });
    }
  }

  Map<String, dynamic>? _type(String name) {
    for (final type in _types) {
      if (type['tenChiSo'] == name) return type;
    }
    return null;
  }

  int? _id(Map<String, dynamic>? type) =>
      int.tryParse(type?['id']?.toString() ?? '');

  Future<void> _save() async {
    if (_saving) return;
    final type = _type(_selected);
    final id = _id(type);
    if (id == null) return;
    setState(() => _saving = true);
    try {
      final service = HealthMetricService.instance;
      final results = <Map<String, dynamic>>[];
      if (_selected == 'Huyết áp') {
        final systolic = int.tryParse(_systolic.text.trim());
        final diastolic = int.tryParse(_diastolic.text.trim());
        final pulse = int.tryParse(_pulse.text.trim());
        if (systolic == null ||
            systolic < 40 ||
            systolic > 280 ||
            diastolic == null ||
            diastolic < 30 ||
            diastolic > 200 ||
            systolic <= diastolic ||
            pulse == null ||
            pulse < 25 ||
            pulse > 240) {
          throw const ApiException(
            'Nhập huyết áp và nhịp tim hợp lệ trước khi lưu.',
          );
        }
        final pulseId = _id(_type('Nhịp tim'));
        if (pulseId == null) {
          throw const ApiException(
            'Chưa có loại chỉ số Nhịp tim trong hệ thống.',
          );
        }
        results.add(
          await service.addHealthMetric(
            loaiChiSoId: id,
            giaTri: systolic.toDouble(),
            giaTriPhu: diastolic.toDouble(),
          ),
        );
        results.add(
          await service.addHealthMetric(
            loaiChiSoId: pulseId,
            giaTri: pulse.toDouble(),
          ),
        );
      } else {
        final number = double.tryParse(_value.text.trim().replaceAll(',', '.'));
        if (number == null || !number.isFinite) {
          throw const ApiException('Nhập giá trị chỉ số hợp lệ.');
        }
        results.add(
          await service.addHealthMetric(loaiChiSoId: id, giaTri: number),
        );
      }
      await _load(refresh: true);
      if (!mounted) return;
      if (results.any((item) => item['laBatThuong'] == true)) {
        await showDialog<void>(
          context: context,
          builder: (context) => AlertDialog(
            icon: const Icon(Icons.warning_amber_rounded, color: red, size: 48),
            title: const Text('Chỉ số bất thường'),
            content: const Text(
              'Chỉ số vừa nhập vượt ngưỡng theo dõi. Người chăm sóc sẽ được thông báo.',
            ),
            actions: [
              FilledButton(
                onPressed: () => Navigator.pop(context),
                child: const Text('Đã hiểu'),
              ),
            ],
          ),
        );
      } else {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text('Đã lưu chỉ số sức khỏe.')),
        );
      }
    } catch (error) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text(
              error is ApiException
                  ? error.message
                  : 'Không thể lưu đủ chỉ số. Kiểm tra lịch sử rồi thử lại.',
            ),
            backgroundColor: red,
          ),
        );
      }
      await _load(refresh: true);
    } finally {
      if (mounted) setState(() => _saving = false);
    }
  }

  Widget _stepper(
    String label,
    TextEditingController controller,
    int min,
    int max,
  ) => Container(
    padding: const EdgeInsets.all(12),
    decoration: BoxDecoration(
      color: CareSeniorColors.mint,
      borderRadius: BorderRadius.circular(16),
    ),
    child: Column(
      children: [
        Text(
          label,
          style: const TextStyle(fontSize: 16, fontWeight: FontWeight.w700),
        ),
        Row(
          mainAxisAlignment: MainAxisAlignment.spaceAround,
          children: [
            IconButton.filledTonal(
              onPressed: () {
                final current = int.tryParse(controller.text);
                if (current != null) {
                  controller.text = (current - 1).clamp(min, max).toString();
                }
              },
              icon: const Icon(Icons.remove),
              constraints: const BoxConstraints(minWidth: 56, minHeight: 56),
            ),
            Expanded(
              child: TextField(
                key: ValueKey('health-field-$label'),
                controller: controller,
                keyboardType: TextInputType.number,
                textAlign: TextAlign.center,
                style: const TextStyle(
                  fontSize: 24,
                  fontWeight: FontWeight.bold,
                  color: teal,
                ),
                decoration: const InputDecoration(
                  hintText: '—',
                  border: InputBorder.none,
                ),
              ),
            ),
            IconButton.filledTonal(
              onPressed: () {
                final current = int.tryParse(controller.text);
                if (current != null) {
                  controller.text = (current + 1).clamp(min, max).toString();
                }
              },
              icon: const Icon(Icons.add),
              constraints: const BoxConstraints(minWidth: 56, minHeight: 56),
            ),
          ],
        ),
      ],
    ),
  );

  String _range(Map<String, dynamic>? type) {
    if (type == null) return 'Chưa có ngưỡng';
    final min = type['giaTriMin'];
    final max = type['giaTriMax'];
    if (min == null && max == null) return 'Chưa cấu hình ngưỡng';
    final secondary = type['giaTriMin2'] != null && type['giaTriMax2'] != null
        ? '/${type['giaTriMin2']}–${type['giaTriMax2']}'
        : '';
    return 'Ngưỡng: $min–$max$secondary ${type['donVi'] ?? ''}';
  }

  String _valueOf(Map<String, dynamic> item) =>
      '${item['giaTri'] ?? '—'}${item['giaTriPhu'] == null ? '' : '/${item['giaTriPhu']}'} ${item['donVi'] ?? ''}';

  Widget _inputFields(Map<String, dynamic>? selectedType) => Column(
    crossAxisAlignment: CrossAxisAlignment.stretch,
    children: [
      if (_selected == 'Huyết áp') ...[
        _stepper('Tâm thu', _systolic, 40, 280),
        const SizedBox(height: 10),
        _stepper('Tâm trương', _diastolic, 30, 200),
        const SizedBox(height: 10),
        _stepper('Nhịp tim (nhịp/phút)', _pulse, 25, 240),
      ] else
        TextField(
          key: const ValueKey('health-value-field'),
          controller: _value,
          keyboardType: const TextInputType.numberWithOptions(decimal: true),
          style: const TextStyle(fontSize: 22, fontWeight: FontWeight.w700),
          decoration: InputDecoration(
            labelText: 'Giá trị ${selectedType?['donVi'] ?? ''}',
            border: const OutlineInputBorder(),
          ),
        ),
    ],
  );

  // Presentation-only sheet. Keeping it on this Scaffold also keeps the
  // original _save SnackBars above the sheet, including backend error text.
  void _openAddSheet(BuildContext sheetContext) {
    if (_sheetOpen) return;
    final selectedType = _type(_selected);
    late PersistentBottomSheetController controller;
    setState(() => _sheetOpen = true);
    controller = showBottomSheet(
      context: sheetContext,
      backgroundColor: Colors.white,
      enableDrag: true,
      constraints: BoxConstraints(
        maxWidth: 760,
        maxHeight: MediaQuery.sizeOf(sheetContext).height * 0.72,
      ),
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(28)),
      ),
      clipBehavior: Clip.antiAlias,
      builder: (_) => HealthMeasurementSheet(
        name: _selected,
        range: _range(selectedType),
        fields: _inputFields(selectedType),
        onSave: _save,
        onClose: () => controller.close(),
      ),
    );
    controller.closed.whenComplete(() {
      if (mounted) setState(() => _sheetOpen = false);
    });
  }

  @override
  Widget build(BuildContext context) {
    final selectedType = _type(_selected);
    final cutoff = DateTime.now().subtract(const Duration(days: 7));
    final selectedMetrics = _metrics
        .where((item) => item['tenChiSo'] == _selected)
        .toList();
    final trend = selectedMetrics
        .where(
          (item) =>
              (DateTime.tryParse(
                item['thoiGianDo']?.toString() ?? '',
              )?.isAfter(cutoff) ??
              false),
        )
        .toList()
        .reversed
        .toList();
    final latest = selectedMetrics.isEmpty ? null : selectedMetrics.first;
    final unit =
        latest?['donVi']?.toString() ??
        selectedType?['donVi']?.toString() ??
        '';
    return Scaffold(
      backgroundColor: CareSeniorColors.background,
      body: SafeArea(
        bottom: false,
        child: Stack(
          children: [
            DraggableAssistantFabHost(
              onPressed: () => Navigator.push(
                context,
                MaterialPageRoute(builder: (_) => const CareAssistantScreen()),
              ),
              child: _loading
                  ? const Center(child: CircularProgressIndicator())
                  : RefreshIndicator(
                      onRefresh: () => _load(refresh: true),
                      child: Align(
                        alignment: Alignment.topCenter,
                        child: ConstrainedBox(
                          constraints: const BoxConstraints(maxWidth: 760),
                          child: ListView(
                            key: const ValueKey('health-dashboard-scroll'),
                            padding: const EdgeInsets.only(bottom: 104),
                            children: [
                              HealthScreenHeader(
                                subtitle: latest == null
                                    ? 'Chưa có dữ liệu đo'
                                    : 'Cập nhật gần nhất: ${HealthDisplay.time(latest['thoiGianDo'])}',
                              ),
                              if (_error != null)
                                Padding(
                                  padding: const EdgeInsets.fromLTRB(
                                    20,
                                    20,
                                    20,
                                    0,
                                  ),
                                  child: AppCard(
                                    child: Text(
                                      _error!,
                                      style: const TextStyle(
                                        fontSize: 16,
                                        color: red,
                                      ),
                                    ),
                                  ),
                                ),
                              const SizedBox(height: 20),
                              if (_types.isEmpty)
                                const Padding(
                                  padding: EdgeInsets.symmetric(horizontal: 20),
                                  child: Text(
                                    'Chưa có dữ liệu loại chỉ số.',
                                    style: TextStyle(fontSize: 16),
                                  ),
                                )
                              else
                                SingleChildScrollView(
                                  key: const ValueKey('health-metric-tabs'),
                                  scrollDirection: Axis.horizontal,
                                  padding: const EdgeInsets.symmetric(
                                    horizontal: 20,
                                  ),
                                  child: Row(
                                    children: _types.map((type) {
                                      final name =
                                          type['tenChiSo']?.toString() ?? '';
                                      return Padding(
                                        padding: const EdgeInsets.only(
                                          right: 10,
                                        ),
                                        child: ConstrainedBox(
                                          constraints: const BoxConstraints(
                                            minHeight: 56,
                                          ),
                                          child: ChoiceChip(
                                            key: ValueKey('health-type-$name'),
                                            avatar: Icon(
                                              HealthDisplay.icon(name),
                                              size: 22,
                                              color: _selected == name
                                                  ? Colors.white
                                                  : teal,
                                            ),
                                            label: Text(
                                              name,
                                              style: TextStyle(
                                                fontSize: 16,
                                                fontWeight: FontWeight.w600,
                                                color: _selected == name
                                                    ? Colors.white
                                                    : teal,
                                              ),
                                            ),
                                            selectedColor: const Color(
                                              0xff21966f,
                                            ),
                                            backgroundColor: Colors.white,
                                            showCheckmark: false,
                                            selected: _selected == name,
                                            onSelected: (_) => setState(
                                              () => _selected = name,
                                            ),
                                          ),
                                        ),
                                      );
                                    }).toList(),
                                  ),
                                ),
                              Padding(
                                padding: const EdgeInsets.fromLTRB(
                                  20,
                                  16,
                                  20,
                                  0,
                                ),
                                child: Column(
                                  crossAxisAlignment:
                                      CrossAxisAlignment.stretch,
                                  children: [
                                    HealthLatestCard(
                                      name: _selected,
                                      latest: latest,
                                      unit: unit,
                                      range: _range(selectedType),
                                    ),
                                    const SizedBox(height: 16),
                                    HealthTrendCard(
                                      rows: trend,
                                      unit: unit,
                                      bloodPressure: _selected == 'Huyết áp',
                                      chart: SizedBox(
                                        height: 180,
                                        width: double.infinity,
                                        child: CustomPaint(
                                          key: const ValueKey(
                                            'health-trend-chart',
                                          ),
                                          painter: _TrendPainter(trend),
                                        ),
                                      ),
                                    ),
                                    const SizedBox(height: 16),
                                    AppCard(
                                      child: Column(
                                        crossAxisAlignment:
                                            CrossAxisAlignment.stretch,
                                        children: [
                                          const Text(
                                            'Lịch sử đo gần đây',
                                            style: TextStyle(
                                              fontSize: 20,
                                              fontWeight: FontWeight.w800,
                                            ),
                                          ),
                                          const SizedBox(height: 8),
                                          if (selectedMetrics.isEmpty)
                                            const Text(
                                              'Chưa có lần đo nào.',
                                              style: TextStyle(fontSize: 16),
                                            ),
                                          for (final item
                                              in selectedMetrics.take(8)) ...[
                                            HealthHistoryRow(
                                              value: _valueOf(item),
                                              row: item,
                                            ),
                                            const Divider(height: 1),
                                          ],
                                        ],
                                      ),
                                    ),
                                    const SizedBox(height: 16),
                                    const Text(
                                      'Nếu chỉ số bất thường, người chăm sóc sẽ được thông báo.',
                                      style: TextStyle(
                                        fontSize: 16,
                                        color: teal,
                                      ),
                                    ),
                                  ],
                                ),
                              ),
                            ],
                          ),
                        ),
                      ),
                    ),
            ),
            if (_sheetOpen)
              ModalBarrier(
                color: Colors.black.withValues(alpha: 0.4),
                dismissible: false,
                semanticsLabel: 'Biểu mẫu thêm số đo đang mở',
              ),
          ],
        ),
      ),
      bottomNavigationBar: _sheetOpen || _loading
          ? null
          : SafeArea(
              top: false,
              child: Padding(
                padding: const EdgeInsets.fromLTRB(20, 8, 20, 12),
                child: Builder(
                  builder: (sheetContext) => FilledButton.icon(
                    key: const ValueKey('health-add-measurement'),
                    onPressed: _types.isEmpty
                        ? null
                        : () => _openAddSheet(sheetContext),
                    style: FilledButton.styleFrom(
                      backgroundColor: const Color(0xff21966f),
                    ),
                    icon: const Icon(Icons.add, size: 24),
                    label: Padding(
                      padding: const EdgeInsets.symmetric(vertical: 12),
                      child: Text(
                        'Thêm số đo ${_selected.toLowerCase()}',
                        textAlign: TextAlign.center,
                        style: const TextStyle(
                          fontSize: 18,
                          fontWeight: FontWeight.w700,
                        ),
                      ),
                    ),
                  ),
                ),
              ),
            ),
    );
  }
}

class _TrendPainter extends CustomPainter {
  _TrendPainter(this.rows);
  final List<Map<String, dynamic>> rows;

  @override
  void paint(Canvas canvas, Size size) {
    final values = rows
        .map((row) => double.tryParse(row['giaTri']?.toString() ?? '') ?? 0)
        .toList();
    final secondary = rows
        .map((row) => double.tryParse(row['giaTriPhu']?.toString() ?? ''))
        .toList();
    final all = [...values, ...secondary.whereType<double>()];
    if (all.isEmpty) return;
    final minValue = all.reduce(math.min) - 5;
    final maxValue = all.reduce(math.max) + 5;
    final span = math.max(1, maxValue - minValue);
    Offset point(int index, double value) => Offset(
      12 + index * (size.width - 24) / math.max(1, rows.length - 1),
      size.height - 18 - (value - minValue) / span * (size.height - 36),
    );
    final grid = Paint()
      ..color = CareSeniorColors.border
      ..strokeWidth = 1;
    for (var i = 0; i < 4; i++) {
      final y = 18 + i * (size.height - 36) / 3;
      canvas.drawLine(Offset(0, y), Offset(size.width, y), grid);
    }
    void drawLine(List<double?> series, Color color) {
      final path = Path();
      var started = false;
      for (var i = 0; i < series.length; i++) {
        final value = series[i];
        if (value == null) continue;
        final p = point(i, value);
        if (!started) {
          path.moveTo(p.dx, p.dy);
          started = true;
        } else {
          path.lineTo(p.dx, p.dy);
        }
      }
      canvas.drawPath(
        path,
        Paint()
          ..color = color
          ..strokeWidth = 3
          ..style = PaintingStyle.stroke,
      );
      for (var i = 0; i < series.length; i++) {
        final value = series[i];
        if (value == null) continue;
        canvas.drawCircle(
          point(i, value),
          5,
          Paint()
            ..color = rows[i]['laBatThuong'] == true
                ? CareSeniorColors.danger
                : color,
        );
      }
    }

    drawLine(values, CareSeniorColors.deepGreen);
    if (secondary.any((value) => value != null)) {
      drawLine(secondary, CareSeniorColors.primary);
    }
  }

  @override
  bool shouldRepaint(covariant _TrendPainter oldDelegate) =>
      oldDelegate.rows != rows;
}
