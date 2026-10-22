import 'package:flutter/material.dart';

import '../../theme/care_senior_theme.dart';
import '../../widgets/care_senior_ui.dart';
import '../home/home_dashboard_ui.dart' show HomeVisuals;

/// Medication-only presentation. Dates, statuses, totals and callbacks come
/// from the existing screen; these widgets never fetch or confirm a dose.
class MedicationHeader extends StatelessWidget {
  const MedicationHeader({
    super.key,
    required this.selectedDay,
    required this.today,
    this.days,
  });

  final DateTime selectedDay, today;
  final Widget? days;

  @override
  Widget build(BuildContext context) => ClipRRect(
    borderRadius: const BorderRadius.vertical(bottom: Radius.circular(32)),
    child: DecoratedBox(
      decoration: const BoxDecoration(
        gradient: LinearGradient(
          begin: Alignment.topLeft,
          end: Alignment.bottomRight,
          colors: [HomeVisuals.deep, Color(0xff1b7a5d)],
        ),
      ),
      child: Stack(
        children: [
          Positioned(
            right: -40,
            top: -56,
            child: Container(
              width: 176,
              height: 176,
              decoration: BoxDecoration(
                shape: BoxShape.circle,
                color: Colors.white.withValues(alpha: 0.06),
              ),
            ),
          ),
          SafeArea(
            bottom: false,
            child: Padding(
              padding: const EdgeInsets.fromLTRB(20, 24, 20, 24),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  if (Navigator.canPop(context))
                    const Align(
                      alignment: Alignment.centerLeft,
                      child: BackButton(color: Colors.white),
                    ),
                  const Text(
                    'Lịch uống thuốc',
                    style: TextStyle(
                      fontSize: 26,
                      height: 1.2,
                      fontWeight: FontWeight.w800,
                      color: Colors.white,
                    ),
                  ),
                  const SizedBox(height: 8),
                  Text(
                    'Tháng ${selectedDay.month}, ${selectedDay.year}',
                    key: const ValueKey('medication-month'),
                    style: const TextStyle(fontSize: 16, color: Colors.white),
                  ),
                  const SizedBox(height: 4),
                  Text(
                    'Hôm nay, ${today.day.toString().padLeft(2, '0')}/'
                    '${today.month.toString().padLeft(2, '0')}/${today.year}',
                    style: TextStyle(
                      fontSize: 16,
                      color: Colors.white.withValues(alpha: 0.85),
                    ),
                  ),
                  if (days != null) ...[const SizedBox(height: 20), days!],
                ],
              ),
            ),
          ),
        ],
      ),
    ),
  );
}

class MedicationDayStrip extends StatefulWidget {
  const MedicationDayStrip({
    super.key,
    required this.days,
    required this.selectedDay,
    required this.onSelected,
  });

  final List<DateTime> days;
  final DateTime selectedDay;
  final ValueChanged<DateTime> onSelected;

  @override
  State<MedicationDayStrip> createState() => _MedicationDayStripState();
}

class _MedicationDayStripState extends State<MedicationDayStrip> {
  ScrollController? _scroll;

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    final width = 76 * MediaQuery.textScalerOf(context).scale(1);
    final index = widget.days.indexWhere(
      (day) => DateUtils.isSameDay(day, widget.selectedDay),
    );
    final offset =
        index * (width + 10) -
        (MediaQuery.sizeOf(context).width - 40 - width) / 2;
    _scroll ??= ScrollController(initialScrollOffset: offset < 0 ? 0 : offset);
  }

  @override
  void dispose() {
    _scroll?.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final scale = MediaQuery.textScalerOf(context).scale(1);
    return SizedBox(
      height: 96 * scale,
      child: SingleChildScrollView(
        controller: _scroll,
        scrollDirection: Axis.horizontal,
        child: Row(
          children: [
            for (var index = 0; index < widget.days.length; index++) ...[
              if (index != 0) const SizedBox(width: 10),
              _day(context, widget.days[index], index, scale),
            ],
          ],
        ),
      ),
    );
  }

  Widget _day(BuildContext context, DateTime day, int index, double scale) {
    final selected = DateUtils.isSameDay(day, widget.selectedDay);
    // The screen's existing seven-day range always places today at index 3.
    final today = index == 3;
    final color = selected ? HomeVisuals.deep : Colors.white;
    return Semantics(
      selected: selected,
      button: true,
      label: '${day.day}/${day.month}/${day.year}${today ? ', hôm nay' : ''}',
      child: InkWell(
        key: ValueKey('medication-day-$index'),
        onTap: () => widget.onSelected(day),
        borderRadius: BorderRadius.circular(20),
        child: AnimatedContainer(
          duration: MediaQuery.disableAnimationsOf(context)
              ? Duration.zero
              : const Duration(milliseconds: 180),
          width: 76 * scale,
          alignment: Alignment.center,
          decoration: BoxDecoration(
            color: selected
                ? Colors.white
                : Colors.white.withValues(alpha: 0.12),
            borderRadius: BorderRadius.circular(20),
          ),
          child: Column(
            mainAxisAlignment: MainAxisAlignment.center,
            children: [
              Text(
                today
                    ? 'Hôm nay'
                    : day.weekday == 7
                    ? 'CN'
                    : 'Th ${day.weekday + 1}',
                style: TextStyle(fontSize: 16, color: color),
              ),
              const SizedBox(height: 4),
              Text(
                '${day.day}',
                style: TextStyle(
                  fontSize: 24,
                  fontWeight: FontWeight.w800,
                  color: color,
                ),
              ),
              const SizedBox(height: 6),
              Container(
                width: 6,
                height: 6,
                decoration: BoxDecoration(
                  shape: BoxShape.circle,
                  color: today ? color : Colors.transparent,
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

class MedicationProgressCard extends StatelessWidget {
  const MedicationProgressCard({
    super.key,
    required this.completed,
    required this.total,
    required this.dateLabel,
  });
  final int completed, total;
  final String dateLabel;

  @override
  Widget build(BuildContext context) {
    final progress = total == 0 ? 0.0 : completed / total;
    return AppCard(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Text(
            dateLabel,
            style: const TextStyle(fontSize: 16, color: HomeVisuals.sub),
          ),
          const SizedBox(height: 8),
          Text(
            'Đã uống $completed/$total liều',
            key: const ValueKey('medication-progress-label'),
            style: const TextStyle(
              fontSize: 22,
              fontWeight: FontWeight.w800,
              color: HomeVisuals.ink,
            ),
          ),
          const SizedBox(height: 14),
          ClipRRect(
            borderRadius: BorderRadius.circular(20),
            child: LinearProgressIndicator(
              value: progress,
              minHeight: 10,
              backgroundColor: CareSeniorColors.mint,
              color: HomeVisuals.brand,
              semanticsLabel: 'Tiến độ uống thuốc',
            ),
          ),
          const SizedBox(height: 8),
          Text(
            '${total == 0 ? 0 : (completed * 100 / total).round()}% hoàn thành',
            style: const TextStyle(fontSize: 16, color: HomeVisuals.deep),
          ),
        ],
      ),
    );
  }
}

class MedicationDoseCard extends StatelessWidget {
  const MedicationDoseCard({
    super.key,
    required this.name,
    required this.dose,
    required this.time,
    required this.instructions,
    required this.status,
    required this.statusLabel,
    required this.statusColor,
    required this.updating,
    required this.onConfirm,
  });
  final String name, dose, time, instructions, status, statusLabel;
  final Color statusColor;
  final bool updating;
  final VoidCallback? onConfirm;

  @override
  Widget build(BuildContext context) {
    final taken = status == 'DaUong';
    final background = taken
        ? CareSeniorColors.mint
        : status == 'ChuaDenGio'
        ? CareSeniorColors.warningSurface
        : CareSeniorColors.dangerSurface;
    return Padding(
      padding: const EdgeInsets.only(bottom: 14),
      child: Container(
        padding: const EdgeInsets.all(16),
        decoration: BoxDecoration(
          color: Colors.white,
          borderRadius: BorderRadius.circular(22),
          border: Border.all(
            color: status == 'BoLo'
                ? const Color(0xfff2caca)
                : CareSeniorColors.border,
          ),
          boxShadow: const [
            BoxShadow(
              color: Color(0x0d155e4b),
              blurRadius: 10,
              offset: Offset(0, 2),
            ),
          ],
        ),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Row(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Container(
                  width: 56,
                  height: 56,
                  decoration: BoxDecoration(
                    color: taken
                        ? CareSeniorColors.mint
                        : const Color(0xffece5fa),
                    borderRadius: BorderRadius.circular(18),
                  ),
                  child: Center(
                    child: updating
                        ? const SizedBox(
                            width: 24,
                            height: 24,
                            child: CircularProgressIndicator(strokeWidth: 2),
                          )
                        : Icon(
                            taken
                                ? Icons.check_rounded
                                : Icons.medication_outlined,
                            color: taken
                                ? HomeVisuals.brand
                                : const Color(0xff6b4bba),
                            size: 28,
                          ),
                  ),
                ),
                const SizedBox(width: 14),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.stretch,
                    children: [
                      Text(
                        name,
                        style: const TextStyle(
                          fontSize: 19,
                          height: 1.3,
                          fontWeight: FontWeight.w800,
                          color: HomeVisuals.ink,
                        ),
                      ),
                      const SizedBox(height: 5),
                      Text(
                        dose,
                        style: const TextStyle(
                          fontSize: 16,
                          height: 1.35,
                          color: HomeVisuals.sub,
                        ),
                      ),
                    ],
                  ),
                ),
              ],
            ),
            const SizedBox(height: 14),
            Align(
              alignment: Alignment.centerLeft,
              child: Container(
                padding: const EdgeInsets.symmetric(
                  horizontal: 12,
                  vertical: 8,
                ),
                decoration: BoxDecoration(
                  color: background,
                  borderRadius: BorderRadius.circular(24),
                ),
                child: Text(
                  '● $statusLabel',
                  style: TextStyle(
                    fontSize: 16,
                    fontWeight: FontWeight.w700,
                    color: statusColor,
                  ),
                ),
              ),
            ),
            const SizedBox(height: 14),
            Container(
              padding: const EdgeInsets.all(14),
              decoration: BoxDecoration(
                color: CareSeniorColors.background,
                borderRadius: BorderRadius.circular(16),
              ),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  Row(
                    children: [
                      const Icon(
                        Icons.schedule_outlined,
                        size: 22,
                        color: HomeVisuals.brand,
                      ),
                      const SizedBox(width: 8),
                      Expanded(
                        child: Text(
                          time,
                          style: const TextStyle(
                            fontSize: 17,
                            fontWeight: FontWeight.w700,
                            color: HomeVisuals.ink,
                          ),
                        ),
                      ),
                    ],
                  ),
                  if (instructions.trim().isNotEmpty) ...[
                    const SizedBox(height: 8),
                    Text(
                      instructions,
                      style: const TextStyle(
                        fontSize: 16,
                        height: 1.4,
                        color: HomeVisuals.sub,
                      ),
                    ),
                  ],
                ],
              ),
            ),
            if (onConfirm != null) ...[
              const SizedBox(height: 14),
              FilledButton(
                onPressed: onConfirm,
                style: FilledButton.styleFrom(
                  backgroundColor: HomeVisuals.brand,
                  padding: const EdgeInsets.symmetric(
                    horizontal: 16,
                    vertical: 16,
                  ),
                ),
                child: Row(
                  mainAxisAlignment: MainAxisAlignment.center,
                  children: [
                    const Icon(Icons.check_rounded, size: 24),
                    const SizedBox(width: 8),
                    Flexible(
                      child: Text(
                        status == 'BoLo'
                            ? 'Xác nhận đã uống muộn'
                            : 'Xác nhận đã uống',
                        textAlign: TextAlign.center,
                        style: const TextStyle(
                          fontSize: 17,
                          fontWeight: FontWeight.w800,
                        ),
                      ),
                    ),
                  ],
                ),
              ),
            ],
          ],
        ),
      ),
    );
  }
}

/// Records an already-taken missed dose; this is not a dosing recommendation.
class MedicationLateConfirmationDialog extends StatelessWidget {
  const MedicationLateConfirmationDialog({
    super.key,
    required this.name,
    required this.detail,
    required this.onCancel,
    required this.onConfirm,
  });
  final String name, detail;
  final VoidCallback onCancel, onConfirm;

  @override
  Widget build(BuildContext context) => AlertDialog(
    scrollable: true,
    shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(24)),
    icon: const Icon(Icons.history_rounded, color: HomeVisuals.brand, size: 40),
    title: const Text('Xác nhận đã uống muộn?', textAlign: TextAlign.center),
    content: Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        Text(
          name,
          style: const TextStyle(fontSize: 19, fontWeight: FontWeight.w700),
        ),
        const SizedBox(height: 8),
        Text(
          detail,
          style: const TextStyle(fontSize: 16, color: HomeVisuals.sub),
        ),
        const SizedBox(height: 16),
        const Text(
          'Chỉ xác nhận nếu bạn đã thực sự uống liều này. Đây là thao tác ghi nhận, không phải hướng dẫn uống thêm thuốc.',
          style: TextStyle(fontSize: 17, height: 1.4),
        ),
      ],
    ),
    actions: [
      Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          FilledButton(
            onPressed: onConfirm,
            style: FilledButton.styleFrom(
              backgroundColor: HomeVisuals.brand,
              padding: const EdgeInsets.all(16),
            ),
            child: const Text(
              'Tôi đã uống liều này',
              textAlign: TextAlign.center,
            ),
          ),
          const SizedBox(height: 8),
          TextButton(onPressed: onCancel, child: const Text('Hủy')),
        ],
      ),
    ],
  );
}

class MedicationStatusSheet extends StatelessWidget {
  const MedicationStatusSheet({
    super.key,
    required this.name,
    required this.detail,
    required this.onTaken,
    required this.onMissed,
  });
  final String name, detail;
  final VoidCallback onTaken, onMissed;

  @override
  Widget build(BuildContext context) => SafeArea(
    child: ConstrainedBox(
      constraints: BoxConstraints(
        maxHeight: MediaQuery.sizeOf(context).height * 0.9,
      ),
      child: SingleChildScrollView(
        padding: const EdgeInsets.fromLTRB(20, 14, 20, 24),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          mainAxisSize: MainAxisSize.min,
          children: [
            Center(
              child: Container(
                width: 48,
                height: 5,
                decoration: BoxDecoration(
                  color: CareSeniorColors.border,
                  borderRadius: BorderRadius.circular(20),
                ),
              ),
            ),
            const SizedBox(height: 18),
            Text(
              name,
              style: const TextStyle(
                fontSize: 22,
                fontWeight: FontWeight.w800,
                color: HomeVisuals.ink,
              ),
            ),
            const SizedBox(height: 8),
            Text(
              detail,
              style: const TextStyle(fontSize: 16, color: HomeVisuals.sub),
            ),
            const SizedBox(height: 20),
            FilledButton(onPressed: onTaken, child: const Text('Đã uống')),
            const SizedBox(height: 12),
            OutlinedButton(
              onPressed: onMissed,
              style: OutlinedButton.styleFrom(
                foregroundColor: CareSeniorColors.danger,
              ),
              child: const Text('Bỏ lỡ'),
            ),
          ],
        ),
      ),
    ),
  );
}
