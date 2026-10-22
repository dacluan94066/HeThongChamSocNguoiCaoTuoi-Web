import 'package:flutter/material.dart';

import '../../theme/care_senior_theme.dart';
import '../../widgets/care_senior_ui.dart';
import '../home/home_dashboard_ui.dart' show HomeVisuals;

/// Health-only presentation helpers. No thresholds, persistence or API access.
abstract final class HealthDisplay {
  static IconData icon(String name) => switch (name) {
    'Huyết áp' => Icons.speed_outlined,
    'Nhịp tim' => Icons.monitor_heart_outlined,
    'Đường huyết' => Icons.water_drop_outlined,
    'SpO2' => Icons.air,
    'Nhiệt độ' => Icons.thermostat_outlined,
    'Cân nặng' => Icons.monitor_weight_outlined,
    _ => Icons.health_and_safety_outlined,
  };

  static (Color, Color) colors(String name) => switch (name) {
    'Huyết áp' => (const Color(0xffe1effb), const Color(0xff2a74b8)),
    'Đường huyết' => (const Color(0xfffdebd2), const Color(0xffc9741a)),
    'Nhịp tim' => (const Color(0xffddf3e8), HomeVisuals.brand),
    'SpO2' => (const Color(0xfffce3eb), const Color(0xffc8416f)),
    'Nhiệt độ' => (const Color(0xffece5fa), const Color(0xff6b4bba)),
    'Cân nặng' => (const Color(0xfffff1bf), const Color(0xff9c7600)),
    _ => (CareSeniorColors.mint, HomeVisuals.deep),
  };

  static String time(Object? raw) {
    final date = DateTime.tryParse(raw?.toString() ?? '');
    if (date == null) return 'Chưa có thời gian đo';
    String two(int value) => value.toString().padLeft(2, '0');
    return '${two(date.hour)}:${two(date.minute)} · '
        '${two(date.day)}/${two(date.month)}/${date.year}';
  }

  static String number(double value) => value == value.roundToDouble()
      ? value.toInt().toString()
      : value.toStringAsFixed(1);
}

class HealthScreenHeader extends StatelessWidget {
  const HealthScreenHeader({super.key, required this.subtitle});
  final String subtitle;

  @override
  Widget build(BuildContext context) => Container(
    decoration: const BoxDecoration(
      borderRadius: BorderRadius.vertical(bottom: Radius.circular(32)),
      gradient: LinearGradient(
        begin: Alignment.topLeft,
        end: Alignment.bottomRight,
        colors: [HomeVisuals.deep, Color(0xff1b7a5d)],
      ),
    ),
    padding: const EdgeInsets.fromLTRB(12, 12, 20, 26),
    child: Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        const BackButton(color: Colors.white),
        Padding(
          padding: const EdgeInsets.only(left: 8),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              const Text(
                'Theo dõi sức khỏe',
                style: TextStyle(
                  fontSize: 26,
                  height: 1.2,
                  fontWeight: FontWeight.w800,
                  color: Colors.white,
                ),
              ),
              const SizedBox(height: 8),
              Text(
                subtitle,
                style: TextStyle(
                  fontSize: 16,
                  color: Colors.white.withValues(alpha: 0.85),
                ),
              ),
            ],
          ),
        ),
      ],
    ),
  );
}

class HealthMetricStatus extends StatelessWidget {
  const HealthMetricStatus({super.key, required this.abnormal});
  final bool abnormal;
  @override
  Widget build(BuildContext context) => Container(
    padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
    decoration: BoxDecoration(
      color: abnormal ? CareSeniorColors.dangerSurface : CareSeniorColors.mint,
      borderRadius: BorderRadius.circular(20),
    ),
    child: Text(
      abnormal ? '● Bất thường' : '● Bình thường',
      style: TextStyle(
        fontSize: 16,
        fontWeight: FontWeight.w600,
        color: abnormal ? CareSeniorColors.danger : HomeVisuals.deep,
      ),
    ),
  );
}

class HealthLatestCard extends StatelessWidget {
  const HealthLatestCard({
    super.key,
    required this.name,
    required this.latest,
    required this.unit,
    required this.range,
  });
  final String name, unit, range;
  final Map<String, dynamic>? latest;

  @override
  Widget build(BuildContext context) {
    final (surface, accent) = HealthDisplay.colors(name);
    final value = latest == null
        ? 'Chưa có dữ liệu'
        : '${latest!['giaTri'] ?? '—'}${latest!['giaTriPhu'] == null ? '' : '/${latest!['giaTriPhu']}'}';
    return AppCard(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Row(
            children: [
              const Expanded(
                child: Text(
                  'Số đo mới nhất',
                  style: TextStyle(
                    fontSize: 16,
                    fontWeight: FontWeight.w600,
                    color: HomeVisuals.sub,
                  ),
                ),
              ),
              const SizedBox(width: 8),
              Container(
                width: 56,
                height: 56,
                decoration: BoxDecoration(
                  color: surface,
                  borderRadius: BorderRadius.circular(18),
                ),
                child: Icon(HealthDisplay.icon(name), size: 28, color: accent),
              ),
            ],
          ),
          const SizedBox(height: 10),
          Wrap(
            spacing: 8,
            runSpacing: 4,
            crossAxisAlignment: WrapCrossAlignment.end,
            children: [
              Text(
                value,
                key: const ValueKey('health-latest-value'),
                style: TextStyle(
                  fontSize: latest == null ? 22 : 36,
                  height: 1.2,
                  fontWeight: FontWeight.w800,
                  color: HomeVisuals.ink,
                ),
              ),
              if (latest != null && unit.isNotEmpty)
                Text(
                  unit,
                  style: const TextStyle(fontSize: 18, color: HomeVisuals.sub),
                ),
            ],
          ),
          if (latest != null) ...[
            const SizedBox(height: 16),
            Align(
              alignment: Alignment.centerLeft,
              child: HealthMetricStatus(
                abnormal: latest!['laBatThuong'] == true,
              ),
            ),
            const SizedBox(height: 12),
            Text(
              HealthDisplay.time(latest!['thoiGianDo']),
              style: const TextStyle(fontSize: 16, color: HomeVisuals.sub),
            ),
          ],
          const SizedBox(height: 12),
          Text(
            range,
            style: const TextStyle(fontSize: 16, color: HomeVisuals.sub),
          ),
        ],
      ),
    );
  }
}

class HealthTrendCard extends StatelessWidget {
  const HealthTrendCard({
    super.key,
    required this.rows,
    required this.unit,
    required this.bloodPressure,
    required this.chart,
  });
  final List<Map<String, dynamic>> rows;
  final String unit;
  final bool bloodPressure;
  final Widget chart;

  @override
  Widget build(BuildContext context) {
    // Descriptive display statistics only; no health classification is inferred.
    final values = rows
        .map((row) => double.tryParse('${row['giaTri']}'))
        .whereType<double>()
        .where((value) => value.isFinite)
        .toList();
    final stats = values.isEmpty
        ? <double>[]
        : <double>[
            values.reduce((a, b) => a < b ? a : b),
            values.reduce((a, b) => a + b) / values.length,
            values.reduce((a, b) => a > b ? a : b),
          ];
    const labels = ['Thấp nhất', 'Trung bình', 'Cao nhất'];
    return AppCard(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Wrap(
            spacing: 8,
            runSpacing: 4,
            alignment: WrapAlignment.spaceBetween,
            children: [
              const Text(
                'Xu hướng 7 ngày',
                style: TextStyle(
                  fontSize: 20,
                  fontWeight: FontWeight.w800,
                  color: HomeVisuals.ink,
                ),
              ),
              Text(
                unit,
                style: const TextStyle(fontSize: 16, color: HomeVisuals.sub),
              ),
            ],
          ),
          const SizedBox(height: 16),
          if (rows.isEmpty)
            const Padding(
              padding: EdgeInsets.symmetric(vertical: 24),
              child: Text(
                'Chưa có dữ liệu trong 7 ngày.',
                style: TextStyle(fontSize: 16, color: HomeVisuals.sub),
              ),
            )
          else ...[
            Semantics(
              label: 'Biểu đồ xu hướng các số đo trong 7 ngày',
              image: true,
              child: chart,
            ),
            const SizedBox(height: 8),
            Text(
              'Từ ${HealthDisplay.time(rows.first['thoiGianDo'])}',
              style: const TextStyle(fontSize: 16, color: HomeVisuals.sub),
            ),
            Text(
              'Đến ${HealthDisplay.time(rows.last['thoiGianDo'])}',
              style: const TextStyle(fontSize: 16, color: HomeVisuals.sub),
            ),
            if (bloodPressure) ...[
              const SizedBox(height: 12),
              const Wrap(
                spacing: 16,
                runSpacing: 8,
                children: [
                  Text(
                    '━ Tâm thu',
                    style: TextStyle(
                      fontSize: 16,
                      color: CareSeniorColors.deepGreen,
                    ),
                  ),
                  Text(
                    '━ Tâm trương',
                    style: TextStyle(
                      fontSize: 16,
                      color: CareSeniorColors.primary,
                    ),
                  ),
                ],
              ),
            ],
          ],
          const Divider(height: 32),
          Text(
            bloodPressure
                ? 'Thống kê tâm thu trong 7 ngày'
                : 'Thống kê trong 7 ngày',
            style: const TextStyle(fontSize: 16, color: HomeVisuals.sub),
          ),
          const SizedBox(height: 12),
          LayoutBuilder(
            builder: (context, constraints) {
              final columns =
                  MediaQuery.textScalerOf(context).scale(1) > 1.3 ||
                      constraints.maxWidth < 280
                  ? 1
                  : 3;
              return Wrap(
                spacing: 8,
                runSpacing: 12,
                children: [
                  for (var i = 0; i < labels.length; i++)
                    SizedBox(
                      width:
                          (constraints.maxWidth - (columns - 1) * 8) / columns,
                      child: Container(
                        padding: const EdgeInsets.all(12),
                        decoration: BoxDecoration(
                          color: CareSeniorColors.background,
                          borderRadius: BorderRadius.circular(16),
                        ),
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Text(
                              labels[i],
                              style: const TextStyle(
                                fontSize: 16,
                                color: HomeVisuals.sub,
                              ),
                            ),
                            const SizedBox(height: 4),
                            Text(
                              stats.isEmpty
                                  ? 'Chưa có dữ liệu'
                                  : HealthDisplay.number(stats[i]),
                              key: ValueKey('health-stat-$i'),
                              style: const TextStyle(
                                fontSize: 20,
                                fontWeight: FontWeight.w800,
                                color: HomeVisuals.ink,
                              ),
                            ),
                          ],
                        ),
                      ),
                    ),
                ],
              );
            },
          ),
        ],
      ),
    );
  }
}

class HealthHistoryRow extends StatelessWidget {
  const HealthHistoryRow({super.key, required this.value, required this.row});
  final String value;
  final Map<String, dynamic> row;
  @override
  Widget build(BuildContext context) => Padding(
    padding: const EdgeInsets.symmetric(vertical: 14),
    child: Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(
          HealthDisplay.time(row['thoiGianDo']),
          style: const TextStyle(fontSize: 16, color: HomeVisuals.sub),
        ),
        const SizedBox(height: 8),
        Wrap(
          spacing: 12,
          runSpacing: 8,
          crossAxisAlignment: WrapCrossAlignment.center,
          children: [
            Text(
              value,
              style: const TextStyle(
                fontSize: 20,
                fontWeight: FontWeight.w800,
                color: HomeVisuals.ink,
              ),
            ),
            HealthMetricStatus(abnormal: row['laBatThuong'] == true),
          ],
        ),
      ],
    ),
  );
}

/// Busy state is presentation-only. The original screen callback handles all
/// validation, request ordering, errors, refresh and abnormal-result dialogs.
class HealthMeasurementSheet extends StatefulWidget {
  const HealthMeasurementSheet({
    super.key,
    required this.name,
    required this.range,
    required this.fields,
    required this.onSave,
    required this.onClose,
  });
  final String name, range;
  final Widget fields;
  final Future<void> Function() onSave;
  final VoidCallback onClose;
  @override
  State<HealthMeasurementSheet> createState() => _HealthMeasurementSheetState();
}

class _HealthMeasurementSheetState extends State<HealthMeasurementSheet> {
  bool _busy = false;
  @override
  Widget build(BuildContext context) => SafeArea(
    top: false,
    child: SingleChildScrollView(
      key: const ValueKey('health-sheet-scroll'),
      padding: const EdgeInsets.fromLTRB(20, 12, 20, 20),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Center(
            child: Container(
              width: 48,
              height: 6,
              decoration: BoxDecoration(
                color: CareSeniorColors.border,
                borderRadius: BorderRadius.circular(3),
              ),
            ),
          ),
          const SizedBox(height: 12),
          Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Expanded(
                child: Text(
                  'Thêm số đo ${widget.name.toLowerCase()}',
                  style: const TextStyle(
                    fontSize: 22,
                    fontWeight: FontWeight.w800,
                    color: HomeVisuals.ink,
                  ),
                ),
              ),
              IconButton(
                onPressed: _busy ? null : widget.onClose,
                key: const ValueKey('health-close-sheet'),
                tooltip: 'Đóng biểu mẫu',
                constraints: const BoxConstraints(minWidth: 56, minHeight: 56),
                icon: const Icon(Icons.close),
              ),
            ],
          ),
          const SizedBox(height: 8),
          Text(
            widget.range,
            style: const TextStyle(fontSize: 16, color: HomeVisuals.sub),
          ),
          const SizedBox(height: 20),
          widget.fields,
          const SizedBox(height: 20),
          FilledButton.icon(
            key: const ValueKey('health-save-measurement'),
            onPressed: _busy
                ? null
                : () async {
                    setState(() => _busy = true);
                    try {
                      await widget.onSave();
                    } finally {
                      if (mounted) setState(() => _busy = false);
                    }
                  },
            style: FilledButton.styleFrom(backgroundColor: HomeVisuals.brand),
            icon: const Icon(Icons.save_outlined),
            label: Padding(
              padding: const EdgeInsets.symmetric(vertical: 12),
              child: Text(
                _busy ? 'Đang lưu...' : 'Lưu chỉ số',
                style: const TextStyle(
                  fontSize: 18,
                  fontWeight: FontWeight.w700,
                ),
              ),
            ),
          ),
        ],
      ),
    ),
  );
}
