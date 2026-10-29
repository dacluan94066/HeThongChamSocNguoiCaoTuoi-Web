import 'package:flutter/material.dart';

import '../../theme/care_senior_theme.dart';
import '../../widgets/care_senior_ui.dart';

enum RelativeDateFilter { today, tomorrow, all, custom }

enum MedicationShift {
  morning('Buổi Sáng', '🌅', '05:00 - 10:59', Color(0xffe6f7ff), Color(0xff096dd9)),
  noon('Buổi Trưa', '☀️', '11:00 - 13:59', Color(0xfffffbe6), Color(0xffd48806)),
  afternoon('Buổi Chiều', '🌤️', '14:00 - 17:59', Color(0xfffff7e6), Color(0xffd4380d)),
  evening('Buổi Tối & Đêm', '🌙', '18:00 - 04:59', Color(0xfff9f0ff), Color(0xff722ed1));

  const MedicationShift(this.label, this.emoji, this.timeRange, this.background, this.textColor);
  final String label;
  final String emoji;
  final String timeRange;
  final Color background;
  final Color textColor;
}

class RelativeMedicationsView extends StatefulWidget {
  const RelativeMedicationsView({
    super.key,
    required this.medications,
    required this.loading,
    required this.onRefresh,
    this.onAddSupplement,
  });

  final List<Map<String, dynamic>> medications;
  final bool loading;
  final Future<void> Function() onRefresh;
  final VoidCallback? onAddSupplement;

  @override
  State<RelativeMedicationsView> createState() => _RelativeMedicationsViewState();
}

class _RelativeMedicationsViewState extends State<RelativeMedicationsView> {
  RelativeDateFilter _dateFilter = RelativeDateFilter.today;
  DateTime _customDate = DateTime.now();

  MedicationShift _getShift(DateTime? dateTime) {
    if (dateTime == null) return MedicationShift.morning;
    final hour = dateTime.hour;
    if (hour >= 5 && hour < 11) return MedicationShift.morning;
    if (hour >= 11 && hour < 14) return MedicationShift.noon;
    if (hour >= 14 && hour < 18) return MedicationShift.afternoon;
    return MedicationShift.evening;
  }

  DateTime? _parseDateTime(dynamic value) {
    if (value == null) return null;
    final str = value.toString();
    return DateTime.tryParse(str)?.toLocal();
  }

  bool _isSameDay(DateTime a, DateTime b) {
    return a.year == b.year && a.month == b.month && a.day == b.day;
  }

  List<Map<String, dynamic>> get _filteredMedications {
    final now = DateTime.now();
    final today = DateTime(now.year, now.month, now.day);
    final tomorrow = today.add(const Duration(days: 1));

    return widget.medications.where((med) {
      final scheduled = _parseDateTime(med['thoiGianDuKien']);
      if (scheduled == null) return _dateFilter == RelativeDateFilter.all;

      switch (_dateFilter) {
        case RelativeDateFilter.today:
          return _isSameDay(scheduled, today);
        case RelativeDateFilter.tomorrow:
          return _isSameDay(scheduled, tomorrow);
        case RelativeDateFilter.custom:
          return _isSameDay(scheduled, _customDate);
        case RelativeDateFilter.all:
          return true;
      }
    }).toList();
  }

  Future<void> _pickCustomDate() async {
    final picked = await showDatePicker(
      context: context,
      initialDate: _customDate,
      firstDate: DateTime.now().subtract(const Duration(days: 60)),
      lastDate: DateTime.now().add(const Duration(days: 60)),
    );
    if (picked != null) {
      setState(() {
        _customDate = picked;
        _dateFilter = RelativeDateFilter.custom;
      });
    }
  }

  @override
  Widget build(BuildContext context) {
    final filtered = _filteredMedications;
    final totalDoses = filtered.length;
    final takenDoses = filtered.where((m) => m['trangThai'] == 'DaUong').length;

    // Group by shifts
    final shiftGroups = <MedicationShift, List<Map<String, dynamic>>>{
      for (final shift in MedicationShift.values) shift: [],
    };

    for (final med in filtered) {
      final scheduled = _parseDateTime(med['thoiGianDuKien']);
      final shift = _getShift(scheduled);
      shiftGroups[shift]!.add(med);
    }

    return RefreshIndicator(
      onRefresh: widget.onRefresh,
      color: CareSeniorColors.deepGreen,
      child: ListView(
        padding: const EdgeInsets.fromLTRB(16, 16, 16, 32),
        children: [
          // Date Filter Bar
          _buildDateFilterBar(),
          const SizedBox(height: 16),

          // Progress Summary Card (if not empty)
          if (totalDoses > 0) ...[
            _buildProgressCard(takenDoses, totalDoses),
            const SizedBox(height: 16),
          ],

          // Shift Groups
          if (widget.loading)
            const Padding(
              padding: EdgeInsets.symmetric(vertical: 40),
              child: Center(child: CircularProgressIndicator(color: CareSeniorColors.deepGreen)),
            )
          else if (totalDoses == 0)
            AppEmptyState(
              icon: Icons.medication_outlined,
              title: 'Không có lịch uống thuốc',
              message: _getEmptyMessage(),
            )
          else ...[
            for (final shift in MedicationShift.values)
              if (shiftGroups[shift]!.isNotEmpty) ...[
                _buildShiftSection(shift, shiftGroups[shift]!),
                const SizedBox(height: 16),
              ],
          ],
        ],
      ),
    );
  }

  String _getEmptyMessage() {
    switch (_dateFilter) {
      case RelativeDateFilter.today:
        return 'Người thân không có lịch uống thuốc nào trong ngày hôm nay.';
      case RelativeDateFilter.tomorrow:
        return 'Không có lịch uống thuốc trong ngày mai.';
      case RelativeDateFilter.custom:
        final d = '${_customDate.day.toString().padLeft(2, '0')}/${_customDate.month.toString().padLeft(2, '0')}/${_customDate.year}';
        return 'Không có lịch uống thuốc trong ngày $d.';
      case RelativeDateFilter.all:
        return 'Hiện chưa có lịch thuốc nào được cài đặt.';
    }
  }

  Widget _buildDateFilterBar() {
    return SingleChildScrollView(
      scrollDirection: Axis.horizontal,
      child: Row(
        children: [
          _buildFilterChip('Hôm nay', RelativeDateFilter.today),
          const SizedBox(width: 8),
          _buildFilterChip('Ngày mai', RelativeDateFilter.tomorrow),
          const SizedBox(width: 8),
          _buildFilterChip('Tất cả ngày', RelativeDateFilter.all),
          const SizedBox(width: 8),
          ChoiceChip(
            label: Row(
              mainAxisSize: MainAxisSize.min,
              children: [
                const Icon(Icons.calendar_month_outlined, size: 16),
                const SizedBox(width: 4),
                Text(
                  _dateFilter == RelativeDateFilter.custom
                      ? '${_customDate.day.toString().padLeft(2, '0')}/${_customDate.month.toString().padLeft(2, '0')}'
                      : 'Chọn ngày',
                  style: const TextStyle(fontWeight: FontWeight.w700),
                ),
              ],
            ),
            selected: _dateFilter == RelativeDateFilter.custom,
            selectedColor: CareSeniorColors.deepGreen,
            labelStyle: TextStyle(
              color: _dateFilter == RelativeDateFilter.custom ? Colors.white : CareSeniorColors.text,
              fontSize: 13,
            ),
            shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(20)),
            onSelected: (_) => _pickCustomDate(),
          ),
        ],
      ),
    );
  }

  Widget _buildFilterChip(String label, RelativeDateFilter filter) {
    final isSelected = _dateFilter == filter;
    return ChoiceChip(
      label: Text(
        label,
        style: TextStyle(
          color: isSelected ? Colors.white : CareSeniorColors.text,
          fontWeight: FontWeight.w700,
          fontSize: 13,
        ),
      ),
      selected: isSelected,
      selectedColor: CareSeniorColors.deepGreen,
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(20)),
      onSelected: (selected) {
        if (selected) setState(() => _dateFilter = filter);
      },
    );
  }

  Widget _buildProgressCard(int taken, int total) {
    final percent = total > 0 ? (taken / total) : 0.0;
    final isAllDone = taken == total && total > 0;

    return Container(
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(18),
        border: Border.all(color: CareSeniorColors.border),
        boxShadow: const [
          BoxShadow(
            color: Color(0x0a17352a),
            blurRadius: 10,
            offset: Offset(0, 4),
          ),
        ],
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            mainAxisAlignment: MainAxisAlignment.spaceBetween,
            children: [
              Row(
                children: [
                  Icon(
                    isAllDone ? Icons.check_circle_rounded : Icons.pie_chart_rounded,
                    color: isAllDone ? CareSeniorColors.primary : CareSeniorColors.deepGreen,
                    size: 20,
                  ),
                  const SizedBox(width: 8),
                  const Text(
                    'Tiến độ uống thuốc',
                    style: TextStyle(
                      fontSize: 15,
                      fontWeight: FontWeight.w700,
                      color: CareSeniorColors.text,
                    ),
                  ),
                ],
              ),
              Text(
                '$taken/$total liều đã uống',
                style: const TextStyle(
                  fontSize: 14,
                  fontWeight: FontWeight.w700,
                  color: CareSeniorColors.deepGreen,
                ),
              ),
            ],
          ),
          const SizedBox(height: 12),
          ClipRRect(
            borderRadius: BorderRadius.circular(8),
            child: LinearProgressIndicator(
              value: percent,
              minHeight: 8,
              backgroundColor: CareSeniorColors.mint,
              valueColor: AlwaysStoppedAnimation<Color>(
                isAllDone ? CareSeniorColors.primary : CareSeniorColors.deepGreen,
              ),
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildShiftSection(MedicationShift shift, List<Map<String, dynamic>> doses) {
    return Container(
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(20),
        border: Border.all(color: CareSeniorColors.border),
        boxShadow: const [
          BoxShadow(
            color: Color(0x0a17352a),
            blurRadius: 12,
            offset: Offset(0, 4),
          ),
        ],
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          // Shift Header
          Container(
            padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
            decoration: BoxDecoration(
              color: shift.background,
              borderRadius: const BorderRadius.vertical(top: Radius.circular(20)),
            ),
            child: Row(
              children: [
                Text(shift.emoji, style: const TextStyle(fontSize: 18)),
                const SizedBox(width: 8),
                Text(
                  shift.label,
                  style: TextStyle(
                    fontSize: 16,
                    fontWeight: FontWeight.w800,
                    color: shift.textColor,
                  ),
                ),
                const SizedBox(width: 8),
                Text(
                  '(${shift.timeRange})',
                  style: TextStyle(
                    fontSize: 12,
                    color: shift.textColor.withValues(alpha: 0.8),
                    fontWeight: FontWeight.w600,
                  ),
                ),
                const Spacer(),
                Container(
                  padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 2),
                  decoration: BoxDecoration(
                    color: Colors.white.withValues(alpha: 0.8),
                    borderRadius: BorderRadius.circular(10),
                  ),
                  child: Text(
                    '${doses.length} liều',
                    style: TextStyle(
                      fontSize: 12,
                      fontWeight: FontWeight.w700,
                      color: shift.textColor,
                    ),
                  ),
                ),
              ],
            ),
          ),

          // Dose Cards
          Padding(
            padding: const EdgeInsets.all(12),
            child: Column(
              children: [
                for (var i = 0; i < doses.length; i++) ...[
                  _buildDoseCard(doses[i]),
                  if (i < doses.length - 1) const SizedBox(height: 10),
                ],
              ],
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildDoseCard(Map<String, dynamic> med) {
    final tenThuoc = med['tenThuoc']?.toString() ?? 'Tên thuốc';
    final lieuDung = med['lieuDung']?.toString() ?? '';
    final donViTinh = med['donViTinh']?.toString() ?? '';
    final cachDung = med['cachDung']?.toString() ?? '';
    final trangThai = med['trangThai']?.toString() ?? 'ChuaDenGio';
    final scheduled = _parseDateTime(med['thoiGianDuKien']);

    final timeStr = scheduled != null
        ? '${scheduled.hour.toString().padLeft(2, '0')}:${scheduled.minute.toString().padLeft(2, '0')}'
        : '--:--';

    final isTaken = trangThai == 'DaUong';
    final isMissed = trangThai == 'BoLo' || trangThai == 'TuChoi';

    Color statusBg;
    Color statusFg;
    String statusLabel;
    IconData statusIcon;

    if (isTaken) {
      statusBg = const Color(0xffe6f9f0);
      statusFg = CareSeniorColors.primary;
      statusLabel = 'Đã uống';
      statusIcon = Icons.check_circle_rounded;
    } else if (isMissed) {
      statusBg = CareSeniorColors.dangerSurface;
      statusFg = CareSeniorColors.danger;
      statusLabel = 'Bỏ lỡ';
      statusIcon = Icons.cancel_rounded;
    } else {
      statusBg = const Color(0xffe6f4ff);
      statusFg = const Color(0xff0958d9);
      statusLabel = 'Chưa uống';
      statusIcon = Icons.schedule_rounded;
    }

    return Container(
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(
        color: CareSeniorColors.background,
        borderRadius: BorderRadius.circular(14),
        border: Border.all(color: CareSeniorColors.border),
      ),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          // Time badge
          Container(
            padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
            decoration: BoxDecoration(
              color: CareSeniorColors.deepGreen,
              borderRadius: BorderRadius.circular(10),
            ),
            child: Row(
              mainAxisSize: MainAxisSize.min,
              children: [
                const Icon(Icons.access_time_filled_rounded, size: 14, color: Colors.white),
                const SizedBox(width: 4),
                Text(
                  timeStr,
                  style: const TextStyle(
                    color: Colors.white,
                    fontSize: 13,
                    fontWeight: FontWeight.w800,
                  ),
                ),
              ],
            ),
          ),
          const SizedBox(width: 12),

          // Medicine info
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  tenThuoc,
                  style: const TextStyle(
                    fontSize: 16,
                    fontWeight: FontWeight.w800,
                    color: CareSeniorColors.text,
                  ),
                ),
                const SizedBox(height: 4),
                Text(
                  'Liều lượng: $lieuDung $donViTinh'.trim(),
                  style: const TextStyle(
                    fontSize: 13,
                    fontWeight: FontWeight.w600,
                    color: CareSeniorColors.secondaryText,
                  ),
                ),
                if (cachDung.isNotEmpty) ...[
                  const SizedBox(height: 2),
                  Text(
                    'Cách dùng: $cachDung',
                    style: const TextStyle(
                      fontSize: 12,
                      fontStyle: FontStyle.italic,
                      color: CareSeniorColors.secondaryText,
                    ),
                  ),
                ],
              ],
            ),
          ),
          const SizedBox(width: 8),

          // Status Badge
          Container(
            padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 5),
            decoration: BoxDecoration(
              color: statusBg,
              borderRadius: BorderRadius.circular(10),
            ),
            child: Row(
              mainAxisSize: MainAxisSize.min,
              children: [
                Icon(statusIcon, size: 13, color: statusFg),
                const SizedBox(width: 4),
                Text(
                  statusLabel,
                  style: TextStyle(
                    fontSize: 11,
                    fontWeight: FontWeight.w700,
                    color: statusFg,
                  ),
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }
}

