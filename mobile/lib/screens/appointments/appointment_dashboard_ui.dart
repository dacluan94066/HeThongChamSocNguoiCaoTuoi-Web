import 'package:flutter/material.dart';

import '../../theme/care_senior_theme.dart';
import '../../widgets/care_senior_ui.dart';
import '../home/home_dashboard_ui.dart' show HomeVisuals;

/// Read-only appointment presentation. Statuses, fields and actions are supplied
/// by the existing screen; no API, scheduling or permission decisions live here.
class AppointmentHeader extends StatelessWidget {
  const AppointmentHeader({super.key});

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
              padding: const EdgeInsets.fromLTRB(20, 24, 20, 26),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  if (Navigator.canPop(context))
                    const Align(
                      alignment: Alignment.centerLeft,
                      child: BackButton(color: Colors.white),
                    ),
                  const Text(
                    'Lịch khám',
                    style: TextStyle(
                      fontSize: 26,
                      height: 1.2,
                      fontWeight: FontWeight.w800,
                      color: Colors.white,
                    ),
                  ),
                  const SizedBox(height: 8),
                  Text(
                    'Theo dõi lịch hẹn khám bệnh của bạn',
                    style: TextStyle(
                      fontSize: 16,
                      height: 1.4,
                      color: Colors.white.withValues(alpha: 0.85),
                    ),
                  ),
                ],
              ),
            ),
          ),
        ],
      ),
    ),
  );
}

class AppointmentOverview extends StatelessWidget {
  const AppointmentOverview({super.key, required this.label});
  final String label;

  @override
  Widget build(BuildContext context) => AppCard(
    child: Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        const Row(
          children: [
            Icon(
              Icons.calendar_month_outlined,
              size: 28,
              color: HomeVisuals.brand,
            ),
            SizedBox(width: 12),
            Expanded(
              child: Text(
                'Theo dõi lịch khám',
                style: TextStyle(fontSize: 16, color: HomeVisuals.sub),
              ),
            ),
          ],
        ),
        const SizedBox(height: 12),
        Text(
          label,
          key: const ValueKey('appointment-overview-label'),
          style: const TextStyle(
            fontSize: 22,
            height: 1.3,
            fontWeight: FontWeight.w800,
            color: HomeVisuals.ink,
          ),
        ),
        const SizedBox(height: 8),
        const Text(
          'Kéo xuống để cập nhật dữ liệu mới nhất.',
          style: TextStyle(fontSize: 16, height: 1.4, color: HomeVisuals.sub),
        ),
      ],
    ),
  );
}

class AppointmentStatusBadge extends StatelessWidget {
  const AppointmentStatusBadge({
    super.key,
    required this.label,
    required this.color,
    required this.background,
  });
  final String label;
  final Color color, background;

  @override
  Widget build(BuildContext context) => Align(
    alignment: Alignment.centerLeft,
    child: Container(
      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
      decoration: BoxDecoration(
        color: background,
        borderRadius: BorderRadius.circular(24),
      ),
      child: Text(
        '● $label',
        style: TextStyle(
          fontSize: 16,
          fontWeight: FontWeight.w700,
          color: color,
        ),
      ),
    ),
  );
}

class AppointmentInfoField extends StatelessWidget {
  const AppointmentInfoField({
    super.key,
    required this.icon,
    required this.label,
    required this.value,
    this.valueColor,
  });
  final IconData icon;
  final String label, value;
  final Color? valueColor;

  @override
  Widget build(BuildContext context) => Padding(
    padding: const EdgeInsets.only(bottom: 16),
    child: Row(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Container(
          width: 40,
          height: 40,
          decoration: BoxDecoration(
            color: CareSeniorColors.mint,
            borderRadius: BorderRadius.circular(14),
          ),
          child: Icon(icon, size: 22, color: HomeVisuals.deep),
        ),
        const SizedBox(width: 12),
        Expanded(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              Text(
                label,
                style: const TextStyle(
                  fontSize: 16,
                  height: 1.3,
                  color: HomeVisuals.sub,
                ),
              ),
              const SizedBox(height: 4),
              Text(
                value,
                style: TextStyle(
                  fontSize: 16,
                  height: 1.4,
                  fontWeight: FontWeight.w600,
                  color: valueColor ?? HomeVisuals.ink,
                ),
              ),
            ],
          ),
        ),
      ],
    ),
  );
}

class AppointmentScheduleCard extends StatelessWidget {
  const AppointmentScheduleCard({
    super.key,
    required this.title,
    required this.time,
    required this.doctor,
    required this.specialty,
    required this.reason,
    required this.result,
    required this.statusLabel,
    required this.statusColor,
    required this.statusBackground,
    required this.onDetails,
  });
  final String title, time, doctor, specialty, reason, statusLabel;
  final String? result;
  final Color statusColor, statusBackground;
  final VoidCallback onDetails;

  @override
  Widget build(BuildContext context) => Padding(
    padding: const EdgeInsets.fromLTRB(20, 0, 20, 14),
    child: AppCard(
      padding: EdgeInsets.zero,
      child: Material(
        color: Colors.transparent,
        child: InkWell(
          onTap: onDetails,
          borderRadius: BorderRadius.circular(22),
          child: Padding(
            padding: const EdgeInsets.all(16),
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
                        color: statusBackground,
                        borderRadius: BorderRadius.circular(18),
                      ),
                      child: Icon(
                        Icons.local_hospital_outlined,
                        size: 28,
                        color: statusColor,
                      ),
                    ),
                    const SizedBox(width: 14),
                    Expanded(
                      child: Text(
                        title,
                        style: const TextStyle(
                          fontSize: 19,
                          height: 1.3,
                          fontWeight: FontWeight.w800,
                          color: HomeVisuals.ink,
                        ),
                      ),
                    ),
                  ],
                ),
                const SizedBox(height: 14),
                AppointmentStatusBadge(
                  label: statusLabel,
                  color: statusColor,
                  background: statusBackground,
                ),
                const SizedBox(height: 14),
                Container(
                  padding: const EdgeInsets.all(14),
                  decoration: BoxDecoration(
                    color: CareSeniorColors.background,
                    borderRadius: BorderRadius.circular(16),
                  ),
                  child: Row(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      const Icon(
                        Icons.schedule_outlined,
                        size: 22,
                        color: HomeVisuals.brand,
                      ),
                      const SizedBox(width: 10),
                      Expanded(
                        child: Text(
                          time,
                          style: const TextStyle(
                            fontSize: 17,
                            height: 1.4,
                            fontWeight: FontWeight.w700,
                            color: HomeVisuals.ink,
                          ),
                        ),
                      ),
                    ],
                  ),
                ),
                const SizedBox(height: 16),
                AppointmentInfoField(
                  icon: Icons.person_outline,
                  label: 'Bác sĩ',
                  value: doctor,
                ),
                AppointmentInfoField(
                  icon: Icons.medical_information_outlined,
                  label: 'Chuyên khoa',
                  value: specialty,
                ),
                AppointmentInfoField(
                  icon: Icons.description_outlined,
                  label: 'Lý do',
                  value: reason,
                ),
                if (result != null)
                  AppointmentInfoField(
                    icon: Icons.fact_check_outlined,
                    label: 'Kết quả',
                    value: result!,
                    valueColor: const Color(0xff2e7d4f),
                  ),
                OutlinedButton(
                  onPressed: onDetails,
                  child: const Row(
                    mainAxisAlignment: MainAxisAlignment.center,
                    children: [
                      Icon(Icons.visibility_outlined),
                      SizedBox(width: 10),
                      Flexible(
                        child: Text(
                          'Xem chi tiết',
                          textAlign: TextAlign.center,
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
  );
}

class AppointmentDetailSheet extends StatelessWidget {
  const AppointmentDetailSheet({
    super.key,
    required this.title,
    required this.statusLabel,
    required this.statusColor,
    required this.statusBackground,
    required this.fields,
    required this.onClose,
  });
  final String title, statusLabel;
  final Color statusColor, statusBackground;
  final List<Widget> fields;
  final VoidCallback onClose;

  @override
  Widget build(BuildContext context) => SafeArea(
    child: ConstrainedBox(
      constraints: BoxConstraints(
        maxHeight: MediaQuery.sizeOf(context).height * 0.9,
      ),
      child: SingleChildScrollView(
        key: const ValueKey('appointment-detail-scroll'),
        padding: const EdgeInsets.fromLTRB(20, 14, 20, 24),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.stretch,
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
            const SizedBox(height: 20),
            Text(
              title,
              style: const TextStyle(
                fontSize: 22,
                height: 1.3,
                fontWeight: FontWeight.w800,
                color: HomeVisuals.ink,
              ),
            ),
            const SizedBox(height: 14),
            AppointmentStatusBadge(
              label: statusLabel,
              color: statusColor,
              background: statusBackground,
            ),
            const SizedBox(height: 22),
            ...fields,
            const SizedBox(height: 8),
            FilledButton(onPressed: onClose, child: const Text('ĐÓNG')),
          ],
        ),
      ),
    ),
  );
}
