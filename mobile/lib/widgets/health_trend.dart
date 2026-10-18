import 'dart:math' as math;
import 'package:flutter/material.dart';

class HealthTrend extends StatefulWidget {
  const HealthTrend({super.key, required this.metrics});
  final List<Map<String, dynamic>> metrics;
  @override
  State<HealthTrend> createState() => _HealthTrendState();
  static DateTime? measuredAt(Object? raw) {
    final text = raw?.toString() ?? '';
    return DateTime.tryParse(
      RegExp(r'(Z|[+-]\d\d:\d\d)$').hasMatch(text) ? text : '$text+07:00',
    );
  }

  static List<Map<String, dynamic>> points(
    List<Map<String, dynamic>> rows,
    String type,
    int days,
    DateTime now,
  ) =>
      rows.where((r) {
        final t = measuredAt(r['thoiGianDo']);
        return r['tenChiSo'] == type &&
            t != null &&
            !t.isAfter(now) &&
            !t.isBefore(
              DateTime.utc(
                    now.toUtc().add(const Duration(hours: 7)).year,
                    now.toUtc().add(const Duration(hours: 7)).month,
                    now.toUtc().add(const Duration(hours: 7)).day,
                  )
                  .subtract(const Duration(hours: 7))
                  .subtract(Duration(days: days - 1)),
            ) &&
            num.tryParse(r['giaTri'].toString())?.isFinite == true;
      }).map((r)=>{...r,'giaTri':num.parse(r['giaTri'].toString()),'giaTriPhu':num.tryParse(r['giaTriPhu']?.toString()??'')?.isFinite==true?num.parse(r['giaTriPhu'].toString()):null}).toList()..sort(
        (a, b) => measuredAt(
          a['thoiGianDo'],
        )!.compareTo(measuredAt(b['thoiGianDo'])!),
      );
}

class _HealthTrendState extends State<HealthTrend> {
  int _days = 7;
  String? _type;
  int? _selected;
  @override
  Widget build(BuildContext context) {
    final types = widget.metrics
        .map((r) => r['tenChiSo']?.toString())
        .whereType<String>()
        .toSet()
        .toList();
    if (types.isEmpty) {
      return const Card(
        child: Padding(
          padding: EdgeInsets.all(16),
          child: Text('Chưa có số đo để vẽ biểu đồ.'),
        ),
      );
    }
    final type = types.contains(_type) ? _type! : types.first;
    final now = DateTime.now();
    final rows = HealthTrend.points(
      widget.metrics,
      type,
      _days,
      now,
    );
    final prevRows = HealthTrend.points(
      widget.metrics,
      type,
      _days,
      now.subtract(Duration(days: _days)),
    );
    final unit = rows.isEmpty ? '' : rows.first['donVi']?.toString() ?? '';

    num? avgCurrent;
    num? avgPrev;
    num? diff;
    num? maxVal;
    num? minVal;
    num? avgSecCurrent;
    num? avgSecPrev;
    num? diffSec;
    int abnormalCount = 0;

    if (rows.isNotEmpty) {
      final primaries = rows.map((r) => r['giaTri'] as num).toList();
      avgCurrent = primaries.reduce((a, b) => a + b) / primaries.length;
      maxVal = primaries.reduce(math.max);
      minVal = primaries.reduce(math.min);
      abnormalCount = rows.where((r) => r['laBatThuong'] == true || r['laBatThuong'] == 1).length;

      final secondaries = rows.map((r) => r['giaTriPhu']).whereType<num>().toList();
      if (secondaries.isNotEmpty) {
        avgSecCurrent = secondaries.reduce((a, b) => a + b) / secondaries.length;
      }

      if (prevRows.isNotEmpty) {
        final prevPrimaries = prevRows.map((r) => r['giaTri'] as num).toList();
        avgPrev = prevPrimaries.reduce((a, b) => a + b) / prevPrimaries.length;
        diff = avgCurrent - avgPrev;

        final prevSecondaries = prevRows.map((r) => r['giaTriPhu']).whereType<num>().toList();
        if (prevSecondaries.isNotEmpty && avgSecCurrent != null) {
          avgSecPrev = prevSecondaries.reduce((a, b) => a + b) / prevSecondaries.length;
          diffSec = avgSecCurrent - avgSecPrev;
        }
      }
    }

    return Card(
      elevation: 0,
      color: Colors.white,
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(20)),
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: [
                const Icon(Icons.show_chart_rounded, color: Color(0xff07856d), size: 24),
                const SizedBox(width: 8),
                const Expanded(
                  child: Text(
                    'Biểu đồ & Xu hướng số đo',
                    style: TextStyle(fontSize: 18, fontWeight: FontWeight.bold),
                  ),
                ),
              ],
            ),
            const SizedBox(height: 12),
            DropdownButtonFormField<String>(
              key: ValueKey(type),
              initialValue: type,
              isExpanded: true,
              decoration: InputDecoration(
                contentPadding: const EdgeInsets.symmetric(horizontal: 14, vertical: 8),
                border: OutlineInputBorder(borderRadius: BorderRadius.circular(12)),
              ),
              items: types
                  .map((t) => DropdownMenuItem(value: t, child: Text(t)))
                  .toList(),
              onChanged: (t) => setState(() {
                _type = t;
                _selected = null;
              }),
            ),
            const SizedBox(height: 10),
            Wrap(
              spacing: 8,
              children: [
                for (final days in [7, 30, 90])
                  ChoiceChip(
                    label: Text('$days ngày'),
                    selected: _days == days,
                    selectedColor: const Color(0xffe8f8ee),
                    labelStyle: TextStyle(
                      color: _days == days ? const Color(0xff07856d) : Colors.black87,
                      fontWeight: _days == days ? FontWeight.bold : FontWeight.normal,
                    ),
                    onSelected: (_) => setState(() {
                      _days = days;
                      _selected = null;
                    }),
                  ),
              ],
            ),
            if (rows.isNotEmpty) ...[
              const SizedBox(height: 14),
              Container(
                padding: const EdgeInsets.all(12),
                decoration: BoxDecoration(
                  color: const Color(0xfff8faf9),
                  borderRadius: BorderRadius.circular(14),
                  border: Border.all(color: Colors.black12),
                ),
                child: Column(
                  children: [
                    Row(
                      children: [
                        Expanded(
                          child: Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              const Text('Trung bình kỳ', style: TextStyle(fontSize: 12, color: Colors.black54)),
                              const SizedBox(height: 2),
                              Text(
                                '${avgCurrent!.toStringAsFixed(1)}${avgSecCurrent != null ? '/${avgSecCurrent.toStringAsFixed(1)}' : ''} $unit',
                                style: const TextStyle(fontSize: 16, fontWeight: FontWeight.bold, color: Color(0xff07856d)),
                              ),
                              if (diff != null) ...[
                                const SizedBox(height: 2),
                                Row(
                                  children: [
                                    Icon(
                                      diff > 0.1 ? Icons.arrow_upward_rounded : (diff < -0.1 ? Icons.arrow_downward_rounded : Icons.remove_rounded),
                                      size: 13,
                                      color: diff > 0.1 ? Colors.orange : (diff < -0.1 ? Colors.blue : Colors.grey),
                                    ),
                                    Text(
                                      '${diff > 0 ? '+' : ''}${diff.toStringAsFixed(1)}${diffSec != null ? ' (${diffSec > 0 ? '+' : ''}${diffSec.toStringAsFixed(1)})' : ''} so kỳ trước',
                                      style: TextStyle(
                                        fontSize: 11,
                                        color: diff > 0.1 ? Colors.orange : (diff < -0.1 ? Colors.blue : Colors.grey),
                                        fontWeight: FontWeight.w600,
                                      ),
                                    ),
                                  ],
                                ),
                              ],
                            ],
                          ),
                        ),
                        Container(width: 1, height: 38, color: Colors.black12),
                        const SizedBox(width: 10),
                        Expanded(
                          child: Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              const Text('Biên độ đo', style: TextStyle(fontSize: 12, color: Colors.black54)),
                              const SizedBox(height: 2),
                              Text(
                                '$minVal – $maxVal $unit',
                                style: const TextStyle(fontSize: 14, fontWeight: FontWeight.bold),
                              ),
                              const SizedBox(height: 2),
                              Text(
                                abnormalCount > 0 ? '⚠️ $abnormalCount lần bất thường' : '✅ Ổn định trong kỳ',
                                style: TextStyle(
                                  fontSize: 11,
                                  color: abnormalCount > 0 ? Colors.red : const Color(0xff07856d),
                                  fontWeight: FontWeight.w600,
                                ),
                              ),
                            ],
                          ),
                        ),
                      ],
                    ),
                  ],
                ),
              ),
            ],
            const SizedBox(height: 10),
            Text('${rows.length} lần đo trong $_days ngày • $unit', style: const TextStyle(fontSize: 12, color: Colors.black54)),
            if (rows.isEmpty)
              Padding(
                padding: const EdgeInsets.symmetric(vertical: 24),
                child: Center(
                  child: Text('Không có số đo trong khoảng $_days ngày đã chọn.', style: const TextStyle(color: Colors.black54)),
                ),
              )
            else ...[
              if (rows.length < 2)
                const Padding(
                  padding: EdgeInsets.symmetric(vertical: 4),
                  child: Text('Cần ít nhất 2 số đo để vẽ đường biểu diễn.', style: TextStyle(fontSize: 12, color: Colors.black54)),
                ),
              const SizedBox(height: 4),
              Row(
                children: [
                  Container(width: 10, height: 10, decoration: const BoxDecoration(color: Color(0xff07856d), shape: BoxShape.circle)),
                  const SizedBox(width: 4),
                  const Text('Giá trị chính', style: TextStyle(fontSize: 11, color: Colors.black54)),
                  const SizedBox(width: 12),
                  Container(width: 10, height: 10, decoration: const BoxDecoration(color: Color(0xffc85b00), shape: BoxShape.circle)),
                  const SizedBox(width: 4),
                  const Text('Tâm trương', style: TextStyle(fontSize: 11, color: Colors.black54)),
                ],
              ),
              const SizedBox(height: 8),
              Semantics(
                label: 'Biểu đồ ${rows.length} số đo $type, đơn vị $unit',
                child: LayoutBuilder(
                  builder: (context, box) => GestureDetector(
                    onTapDown: (details) {
                      final painter = _DotPainter(rows);
                      final coordinates = painter.coordinates(
                        Size(box.maxWidth, 180),
                      );
                      int closest = 0;
                      double distance = double.infinity;
                      for (var i = 0; i < coordinates.length; i++) {
                        final d =
                            (coordinates[i] - details.localPosition).distance;
                        if (d < distance) {
                          distance = d;
                          closest = i;
                        }
                      }
                      setState(() => _selected = closest);
                    },
                    child: SizedBox(
                      height: 180,
                      width: double.infinity,
                      child: CustomPaint(painter: _DotPainter(rows)),
                    ),
                  ),
                ),
              ),
              const SizedBox(height: 6),
              ...rows.asMap().entries.map(
                (e) {
                  final isAbnormal = e.value['laBatThuong'] == true || e.value['laBatThuong'] == 1;
                  return Container(
                    margin: const EdgeInsets.only(bottom: 6),
                    decoration: BoxDecoration(
                      color: _selected == e.key ? const Color(0xffeef7f4) : Colors.transparent,
                      borderRadius: BorderRadius.circular(10),
                    ),
                    child: ListTile(
                      selected: _selected == e.key,
                      onTap: () => setState(() => _selected = e.key),
                      dense: true,
                      contentPadding: const EdgeInsets.symmetric(horizontal: 8),
                      leading: Icon(
                        isAbnormal ? Icons.warning_amber_rounded : Icons.check_circle_outline_rounded,
                        color: isAbnormal ? Colors.red : const Color(0xff07856d),
                        size: 20,
                      ),
                      title: Text(
                        '${e.value['giaTri']}${e.value['giaTriPhu'] == null ? '' : ' / ${e.value['giaTriPhu']}'} $unit',
                        style: TextStyle(fontWeight: FontWeight.bold, color: isAbnormal ? Colors.red : Colors.black87),
                      ),
                      subtitle: Text(
                        '${e.value['thoiGianDo']}${isAbnormal ? ' • Vượt ngưỡng theo dõi' : ''}',
                        style: TextStyle(fontSize: 11, color: isAbnormal ? Colors.red : Colors.black54),
                      ),
                    ),
                  );
                },
              ),
            ],
            const Divider(height: 20),
            const Text(
              'Ghi chú y tế: Số đo và cờ đánh dấu hiển thị theo dữ liệu lưu trữ từ hệ thống; không tự chẩn đoán thay thế bác sĩ.',
              style: TextStyle(fontSize: 11, color: Colors.black45, fontStyle: FontStyle.italic),
            ),
          ],
        ),
      ),
    );
  }
}

class _DotPainter extends CustomPainter {
  _DotPainter(this.rows);
  final List<Map<String, dynamic>> rows;
  List<Offset> coordinates(Size size) {
    final times = rows
        .map(
          (r) => HealthTrend.measuredAt(
            r['thoiGianDo'],
          )!.millisecondsSinceEpoch.toDouble(),
        )
        .toList();
    final values = rows
        .expand((r) => [r['giaTri'], r['giaTriPhu']])
        .whereType<num>()
        .map((n) => n.toDouble())
        .toList();
    final low = values.reduce(math.min), high = values.reduce(math.max);
    final span = math.max(high - low, 1.0);
    final dt = math.max(times.last - times.first, 1.0);
    return List.generate(
      rows.length,
      (i) => Offset(
        32 + (size.width - 48) * (times[i] - times.first) / dt,
        150 - 120 * ((rows[i]['giaTri'] as num) - low) / span,
      ),
    );
  }

  @override
  void paint(Canvas canvas, Size size) {
    if (rows.isEmpty) return;
    final paint = Paint()
      ..color = Colors.black26
      ..strokeWidth = 1;
    canvas.drawLine(const Offset(30, 12), const Offset(30, 152), paint);
    canvas.drawLine(const Offset(30, 152), Offset(size.width - 8, 152), paint);
    final positions = coordinates(size);
    final values = rows
        .expand((r) => [r['giaTri'], r['giaTriPhu']])
        .whereType<num>()
        .map((n) => n.toDouble())
        .toList();
    final low = values.reduce(math.min), high = values.reduce(math.max);
    final span = math.max(high - low, 1.0);
    void label(String text, Offset offset) {
      final p = TextPainter(
        text: TextSpan(
          text: text,
          style: const TextStyle(color: Colors.black87, fontSize: 11),
        ),
        textDirection: TextDirection.ltr,
      )..layout();
      p.paint(canvas, offset);
    }

    label(high.toStringAsFixed(1), const Offset(0, 12));
    label(low.toStringAsFixed(1), const Offset(0, 142));
    label(
      rows.first['thoiGianDo'].toString().substring(5, 10),
      const Offset(30, 156),
    );
    if (rows.length > 1) {
      label(
        rows.last['thoiGianDo'].toString().substring(5, 10),
        Offset(size.width - 48, 156),
      );
    }
    for (var i = 0; i < rows.length; i++) {
      canvas.drawCircle(
        positions[i],
        5,
        Paint()..color = const Color(0xff07856d),
      );
      final secondary = rows[i]['giaTriPhu'];
      if (secondary is num) {
        canvas.drawCircle(
          Offset(positions[i].dx, 150 - 120 * (secondary - low) / span),
          5,
          Paint()..color = const Color(0xffc85b00),
        );
      }
    }
  }

  @override
  bool shouldRepaint(covariant _DotPainter oldDelegate) => true;
}
