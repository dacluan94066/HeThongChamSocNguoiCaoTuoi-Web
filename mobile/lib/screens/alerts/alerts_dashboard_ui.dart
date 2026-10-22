import 'package:flutter/material.dart';

import '../../theme/care_senior_theme.dart';
import '../../widgets/alert_card.dart';
import '../../widgets/care_senior_ui.dart';

/// Format only the server timestamp; preserve unparseable server text as-is.
String alertsDisplayTime(Object? raw) {
  final text = raw?.toString() ?? '';
  final value = DateTime.tryParse(text)?.toLocal();
  if (value == null) return text;
  String two(int number) => number.toString().padLeft(2, '0');
  return '${two(value.hour)}:${two(value.minute)} • '
      '${two(value.day)}/${two(value.month)}/${value.year}';
}

/// Presentation only. No timers, location access, requests or SOS callbacks.
class AlertsScreenHeader extends StatelessWidget {
  const AlertsScreenHeader({
    super.key,
    required this.title,
    required this.subtitle,
    this.emergency = false,
  });

  final String title, subtitle;
  final bool emergency;

  @override
  Widget build(BuildContext context) => Container(
    width: double.infinity,
    decoration: BoxDecoration(
      borderRadius: const BorderRadius.vertical(bottom: Radius.circular(32)),
      gradient: LinearGradient(
        begin: Alignment.topLeft,
        end: Alignment.bottomRight,
        colors: emergency
            ? const [Color(0xff9e2020), Color(0xffc62828)]
            : const [Color(0xff155e4b), Color(0xff1b7a5d)],
      ),
    ),
    child: SafeArea(
      bottom: false,
      child: Padding(
        padding: const EdgeInsets.fromLTRB(20, 20, 20, 24),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            if (Navigator.canPop(context))
              const BackButton(color: Colors.white),
            Text(
              title,
              style: const TextStyle(
                fontSize: 26,
                fontWeight: FontWeight.w800,
                color: Colors.white,
              ),
            ),
            const SizedBox(height: 6),
            Text(
              subtitle,
              style: const TextStyle(
                fontSize: 16,
                color: Color(0xffeef7f2),
                height: 1.4,
              ),
            ),
          ],
        ),
      ),
    ),
  );
}

/// Keep both existing tabs visible, including wrapped labels at 1.8x.
class AlertsDashboardTabs extends StatelessWidget {
  const AlertsDashboardTabs({super.key});

  @override
  Widget build(BuildContext context) => LayoutBuilder(
    builder: (context, constraints) {
      const labels = ['Thông báo', 'Lịch sử cảnh báo'];
      const style = TextStyle(fontSize: 16, fontWeight: FontWeight.w700);
      var height = 56.0;
      for (final label in labels) {
        final painter = TextPainter(
          text: TextSpan(text: label, style: style),
          textDirection: Directionality.of(context),
          textScaler: MediaQuery.textScalerOf(context),
        )..layout(maxWidth: constraints.maxWidth / 2 - 32);
        if (painter.height + 24 > height) height = painter.height + 24;
        painter.dispose();
      }
      return TabBar(
        labelStyle: style,
        labelPadding: const EdgeInsets.symmetric(horizontal: 16),
        dividerColor: Colors.transparent,
        tabs: [
          for (final label in labels)
            Tab(
              height: height,
              child: Text(label, textAlign: TextAlign.center),
            ),
        ],
      );
    },
  );
}

class AlertsBadge extends StatelessWidget {
  const AlertsBadge({
    super.key,
    required this.label,
    required this.color,
    this.background,
  });
  final String label;
  final Color color;
  final Color? background;

  @override
  Widget build(BuildContext context) => Container(
    padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
    decoration: BoxDecoration(
      color: background ?? color.withValues(alpha: .09),
      borderRadius: BorderRadius.circular(16),
    ),
    child: Text(
      label,
      style: TextStyle(fontSize: 16, fontWeight: FontWeight.w700, color: color),
    ),
  );
}

class SosHoldVisual extends StatelessWidget {
  const SosHoldVisual({
    super.key,
    required this.progress,
    required this.sending,
  });
  final double progress;
  final bool sending;

  @override
  Widget build(BuildContext context) => SizedBox(
    width: 240,
    height: 240,
    child: Stack(
      alignment: Alignment.center,
      children: [
        SizedBox(
          width: 226,
          height: 226,
          child: CircularProgressIndicator(
            value: progress,
            strokeWidth: 9,
            color: const Color(0xffc62828),
            backgroundColor: const Color(0xfff6d5d5),
          ),
        ),
        Container(
          width: 188,
          height: 188,
          decoration: const BoxDecoration(
            shape: BoxShape.circle,
            gradient: LinearGradient(
              colors: [Color(0xffd33131), Color(0xffad1e1e)],
              begin: Alignment.topLeft,
              end: Alignment.bottomRight,
            ),
            boxShadow: [
              BoxShadow(
                color: Color(0x33c62828),
                blurRadius: 20,
                offset: Offset(0, 8),
              ),
            ],
          ),
          alignment: Alignment.center,
          padding: const EdgeInsets.all(12),
          child: Text(
            sending ? 'ĐANG GỬI' : 'SOS',
            textAlign: TextAlign.center,
            style: TextStyle(
              fontSize: sending ? 19 : 46,
              fontWeight: FontWeight.w900,
              color: Colors.white,
            ),
          ),
        ),
      ],
    ),
  );
}

/// Full-width content prevents narrow text columns at large accessibility sizes.
class NotificationDashboardCard extends StatelessWidget {
  const NotificationDashboardCard({
    super.key,
    required this.title,
    required this.content,
    required this.time,
    required this.read,
    required this.busy,
    required this.color,
    required this.background,
    required this.icon,
    required this.onTap,
  });
  final String title, content, time;
  final bool read, busy;
  final Color color, background;
  final IconData icon;
  final VoidCallback? onTap;

  @override
  Widget build(BuildContext context) => Padding(
    padding: const EdgeInsets.only(bottom: 14),
    child: Material(
      color: Colors.white,
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.circular(22),
        side: BorderSide(
          color: read ? CareSeniorColors.border : color.withValues(alpha: .3),
        ),
      ),
      clipBehavior: Clip.antiAlias,
      child: InkWell(
        onTap: onTap,
        child: Padding(
          padding: const EdgeInsets.all(18),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Row(
                children: [
                  Container(
                    width: 48,
                    height: 48,
                    decoration: BoxDecoration(
                      color: background,
                      borderRadius: BorderRadius.circular(16),
                    ),
                    child: Icon(icon, color: color, size: 26),
                  ),
                  const Spacer(),
                  if (busy)
                    const SizedBox(
                      width: 24,
                      height: 24,
                      child: CircularProgressIndicator(strokeWidth: 2),
                    )
                  else if (!read)
                    Icon(Icons.circle, size: 12, color: color),
                ],
              ),
              const SizedBox(height: 12),
              Text(
                title,
                style: TextStyle(
                  fontSize: 19,
                  fontWeight: read ? FontWeight.w600 : FontWeight.w800,
                  color: const Color(0xff20352c),
                ),
              ),
              const SizedBox(height: 10),
              Text(content, style: const TextStyle(fontSize: 16, height: 1.45)),
              const SizedBox(height: 14),
              AlertsBadge(label: read ? 'Đã đọc' : 'Chưa đọc', color: color),
              if (time.isNotEmpty) ...[
                const SizedBox(height: 12),
                Text(
                  time,
                  style: const TextStyle(
                    fontSize: 16,
                    color: CareSeniorColors.secondaryText,
                  ),
                ),
              ],
            ],
          ),
        ),
      ),
    ),
  );
}

/// Uses the existing AlertVisuals mappings; never derives a new clinical status.
class AlertHistoryDashboardCard extends StatelessWidget {
  const AlertHistoryDashboardCard({super.key, required this.alert});
  final Map<String, dynamic> alert;

  @override
  Widget build(BuildContext context) {
    final severity = alert['mucDo'] ?? alert['mucDoLabel'];
    final style = AlertVisuals.styleForSeverity(severity);
    final severityLabel =
        alert['mucDoLabel']?.toString() ??
        switch (severity?.toString()) {
          'KhanCap' || 'KHAN_CAP' => 'Khẩn cấp',
          'Cao' || 'CAO' => 'Cao',
          'TrungBinh' || 'TRUNG_BINH' => 'Trung bình',
          _ => 'Thấp',
        };
    return Padding(
      padding: const EdgeInsets.only(bottom: 14),
      child: AppCard(
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Container(
              width: 48,
              height: 48,
              decoration: BoxDecoration(
                color: style.background,
                borderRadius: BorderRadius.circular(16),
              ),
              child: Icon(style.icon, color: style.color, size: 26),
            ),
            const SizedBox(height: 12),
            Text(
              AlertVisuals.typeLabel(alert),
              style: const TextStyle(fontSize: 20, fontWeight: FontWeight.w800),
            ),
            const SizedBox(height: 12),
            Wrap(
              spacing: 8,
              runSpacing: 8,
              children: [
                AlertsBadge(
                  label: severityLabel,
                  color: style.color,
                  background: style.background,
                ),
                AlertsBadge(
                  label: AlertVisuals.statusLabel(alert),
                  color: CareSeniorColors.deepGreen,
                ),
              ],
            ),
            const SizedBox(height: 14),
            Text(
              AlertVisuals.content(alert),
              style: const TextStyle(fontSize: 16, height: 1.45),
            ),
            const SizedBox(height: 14),
            Text(
              AlertVisuals.dateTime(alert),
              style: const TextStyle(
                fontSize: 16,
                color: CareSeniorColors.secondaryText,
              ),
            ),
            if (alert['nguonBang']?.toString().trim().isNotEmpty == true) ...[
              const SizedBox(height: 8),
              Text(
                'Nguồn: ${alert['nguonBang']}',
                style: const TextStyle(
                  fontSize: 16,
                  color: CareSeniorColors.secondaryText,
                ),
              ),
            ],
            if (alert['ghiChuXuLy']?.toString().trim().isNotEmpty == true) ...[
              const SizedBox(height: 12),
              Text(
                'Kết quả: ${alert['ghiChuXuLy']}',
                style: const TextStyle(
                  fontSize: 16,
                  color: CareSeniorColors.deepGreen,
                  fontWeight: FontWeight.w600,
                ),
              ),
            ],
          ],
        ),
      ),
    );
  }
}
