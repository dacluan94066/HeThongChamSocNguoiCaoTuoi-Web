import 'package:flutter/material.dart';

import '../../theme/care_senior_theme.dart';
import '../../widgets/care_senior_ui.dart';

/// Presentation only. All data and actions are supplied by the existing Home.
abstract final class HomeVisuals {
  static const brand = Color(0xff21966f);
  static const deep = Color(0xff155e4b);
  static const ink = Color(0xff20352c);
  static const sub = Color(0xff66746c);
  static const danger = Color(0xffc62828);
}

class HomeWelcomeHeader extends StatelessWidget {
  const HomeWelcomeHeader({
    super.key,
    required this.name,
    required this.initial,
    required this.greeting,
    required this.age,
    required this.needsAttention,
    required this.onAlerts,
    required this.quickActions,
  });
  final String name, initial, greeting, age;
  final bool needsAttention;
  final VoidCallback onAlerts;
  final Widget quickActions;

  @override
  Widget build(BuildContext context) => Stack(
    children: [
      Positioned.fill(
        bottom: 80,
        child: ClipRRect(
          borderRadius: const BorderRadius.vertical(
            bottom: Radius.circular(32),
          ),
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
                Positioned(right: -48, top: -64, child: _orb(208, 0.06)),
                Positioned(right: 64, top: 80, child: _orb(96, 0.05)),
              ],
            ),
          ),
        ),
      ),
      Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Padding(
            padding: const EdgeInsets.fromLTRB(20, 28, 20, 0),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Row(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Container(
                      padding: const EdgeInsets.all(4),
                      decoration: BoxDecoration(
                        shape: BoxShape.circle,
                        color: Colors.white.withValues(alpha: 0.25),
                      ),
                      child: CircleAvatar(
                        radius: 28,
                        backgroundColor: CareSeniorColors.mint,
                        child: Text(
                          initial,
                          style: const TextStyle(
                            fontSize: 22,
                            fontWeight: FontWeight.w800,
                            color: HomeVisuals.deep,
                          ),
                        ),
                      ),
                    ),
                    const SizedBox(width: 14),
                    Expanded(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text(
                            greeting,
                            style: TextStyle(
                              fontSize: 16,
                              color: Colors.white.withValues(alpha: 0.85),
                            ),
                          ),
                          const SizedBox(height: 4),
                          Text(
                            name,
                            style: const TextStyle(
                              fontSize: 24,
                              height: 1.2,
                              fontWeight: FontWeight.w800,
                              color: Colors.white,
                            ),
                          ),
                        ],
                      ),
                    ),
                    const SizedBox(width: 8),
                    IconButton(
                      onPressed: onAlerts,
                      tooltip: 'Mở cảnh báo và thông báo',
                      style: IconButton.styleFrom(
                        backgroundColor: Colors.white.withValues(alpha: 0.15),
                        foregroundColor: Colors.white,
                        minimumSize: const Size(56, 56),
                      ),
                      icon: const Icon(
                        Icons.notifications_none_rounded,
                        size: 26,
                      ),
                    ),
                  ],
                ),
                const SizedBox(height: 20),
                Wrap(
                  spacing: 10,
                  runSpacing: 10,
                  children: [
                    _headerPill(age),
                    _headerPill(
                      needsAttention ? 'Cần chú ý' : 'Ổn định',
                      dot: needsAttention
                          ? const Color(0xffffcf9b)
                          : const Color(0xff7de0b4),
                    ),
                  ],
                ),
              ],
            ),
          ),
          const SizedBox(height: 24),
          Padding(
            padding: const EdgeInsets.symmetric(horizontal: 20),
            child: quickActions,
          ),
        ],
      ),
    ],
  );

  Widget _orb(double size, double alpha) => Container(
    width: size,
    height: size,
    decoration: BoxDecoration(
      shape: BoxShape.circle,
      color: Colors.white.withValues(alpha: alpha),
    ),
  );

  Widget _headerPill(String label, {Color? dot}) => Container(
    padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 9),
    decoration: BoxDecoration(
      color: Colors.white.withValues(alpha: 0.15),
      borderRadius: BorderRadius.circular(99),
    ),
    child: Row(
      mainAxisSize: MainAxisSize.min,
      children: [
        if (dot != null) ...[
          Icon(Icons.circle, size: 10, color: dot),
          const SizedBox(width: 8),
        ],
        Flexible(
          child: Text(
            label,
            style: const TextStyle(
              fontSize: 16,
              fontWeight: FontWeight.w600,
              color: Colors.white,
            ),
          ),
        ),
      ],
    ),
  );
}

class HomeQuickActions extends StatelessWidget {
  const HomeQuickActions({
    super.key,
    required this.onProfile,
    required this.onHealth,
    required this.onMedication,
    required this.onSos,
  });
  final VoidCallback onProfile, onHealth, onMedication, onSos;

  @override
  Widget build(BuildContext context) => AppCard(
    padding: const EdgeInsets.all(10),
    child: LayoutBuilder(
      builder: (context, constraints) {
        final wide =
            constraints.maxWidth >= 300 &&
            MediaQuery.textScalerOf(context).scale(1) <= 1.3;
        final count = wide ? 4 : 2;
        final width = (constraints.maxWidth - (count - 1) * 4) / count;
        final actions = <(String, IconData, Color, Color, VoidCallback)>[
          (
            'Hồ sơ',
            Icons.badge_outlined,
            CareSeniorColors.mint,
            HomeVisuals.brand,
            onProfile,
          ),
          (
            'Sức khỏe',
            Icons.monitor_heart_outlined,
            const Color(0xffe1effb),
            const Color(0xff2a74b8),
            onHealth,
          ),
          (
            'Lịch thuốc',
            Icons.medication_outlined,
            const Color(0xffece5fa),
            const Color(0xff6b4bba),
            onMedication,
          ),
          (
            'SOS',
            Icons.sos_rounded,
            const Color(0xfffbe3e3),
            HomeVisuals.danger,
            onSos,
          ),
        ];
        return Wrap(
          spacing: 4,
          runSpacing: 8,
          children: [
            for (final action in actions)
              SizedBox(
                width: width,
                child: Semantics(
                  button: true,
                  label: 'Mở ${action.$1}',
                  child: InkWell(
                    key: ValueKey('home-quick-${action.$1}'),
                    onTap: action.$5,
                    borderRadius: BorderRadius.circular(16),
                    child: Padding(
                      padding: const EdgeInsets.symmetric(
                        horizontal: 2,
                        vertical: 8,
                      ),
                      child: Column(
                        children: [
                          Container(
                            width: 56,
                            height: 56,
                            decoration: BoxDecoration(
                              color: action.$3,
                              borderRadius: BorderRadius.circular(18),
                            ),
                            child: Icon(action.$2, size: 28, color: action.$4),
                          ),
                          const SizedBox(height: 8),
                          Text(
                            action.$1,
                            textAlign: TextAlign.center,
                            style: TextStyle(
                              fontSize: 16,
                              fontWeight: FontWeight.w600,
                              color: action.$1 == 'SOS'
                                  ? HomeVisuals.danger
                                  : HomeVisuals.ink,
                            ),
                          ),
                        ],
                      ),
                    ),
                  ),
                ),
              ),
          ],
        );
      },
    ),
  );
}

class HomeMetricTile extends StatelessWidget {
  const HomeMetricTile({
    super.key,
    required this.width,
    required this.name,
    required this.value,
    required this.unit,
    required this.status,
    required this.measuredAt,
    required this.abnormal,
    required this.icon,
    required this.onTap,
    required this.hasData,
  });
  final String name, value, unit, status, measuredAt;
  final double width;
  final bool abnormal, hasData;
  final IconData icon;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    // Only typography responds to the available card width. API values and
    // flags remain untouched. Wrap is retained for genuinely narrow layouts.
    final scaler = MediaQuery.textScalerOf(context);
    double textWidth(String text, double fontSize, FontWeight weight) {
      final painter = TextPainter(
        text: TextSpan(
          text: text,
          style: DefaultTextStyle.of(
            context,
          ).style.copyWith(fontSize: fontSize, fontWeight: weight, height: 1.2),
        ),
        textDirection: Directionality.of(context),
        textScaler: scaler,
      )..layout();
      final result = painter.width;
      painter.dispose();
      return result;
    }

    var valueSize = hasData ? 28.0 : 20.0;
    if (hasData && unit.isNotEmpty) {
      final unitWidth = textWidth(unit, 16, FontWeight.normal);
      while (valueSize > 22 &&
          textWidth(value, valueSize, FontWeight.w800) + unitWidth + 6 >
              width - 34) {
        valueSize--;
      }
    }
    final (surface, accent) = switch (name) {
      'Huyết áp' => (const Color(0xffe1effb), const Color(0xff2a74b8)),
      'Đường huyết' => (const Color(0xfffdebd2), const Color(0xffc9741a)),
      'Nhịp tim' => (const Color(0xffddf3e8), const Color(0xff1c8560)),
      'SpO2' => (const Color(0xfffce3eb), const Color(0xffc8416f)),
      'Nhiệt độ' => (const Color(0xffece5fa), const Color(0xff6b4bba)),
      _ => (const Color(0xfffff1bf), const Color(0xff9c7600)),
    };
    return Semantics(
      button: true,
      label: 'Xem chỉ số $name',
      child: InkWell(
        onTap: onTap,
        borderRadius: BorderRadius.circular(20),
        child: AppCard(
          padding: const EdgeInsets.all(16),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Container(
                width: 48,
                height: 48,
                decoration: BoxDecoration(
                  color: surface,
                  borderRadius: BorderRadius.circular(16),
                ),
                child: Icon(icon, size: 26, color: accent),
              ),
              const SizedBox(height: 12),
              Text(
                name,
                style: const TextStyle(
                  fontSize: 16,
                  fontWeight: FontWeight.w500,
                  color: HomeVisuals.sub,
                ),
              ),
              const SizedBox(height: 5),
              Wrap(
                crossAxisAlignment: WrapCrossAlignment.end,
                spacing: 6,
                runSpacing: 4,
                children: [
                  Text(
                    value,
                    style: TextStyle(
                      fontSize: valueSize,
                      height: 1.2,
                      fontWeight: FontWeight.w800,
                      color: HomeVisuals.ink,
                    ),
                  ),
                  if (unit.isNotEmpty)
                    Text(
                      unit,
                      style: const TextStyle(
                        fontSize: 16,
                        color: HomeVisuals.sub,
                      ),
                    ),
                ],
              ),
              const SizedBox(height: 12),
              Container(
                padding: const EdgeInsets.symmetric(
                  horizontal: 10,
                  vertical: 7,
                ),
                decoration: BoxDecoration(
                  color: !hasData
                      ? const Color(0xffeef2ef)
                      : abnormal
                      ? const Color(0xfffbe3e3)
                      : const Color(0xffddf3e8),
                  borderRadius: BorderRadius.circular(18),
                ),
                child: Text(
                  '● $status',
                  style: TextStyle(
                    fontSize: 16,
                    fontWeight: FontWeight.w600,
                    color: !hasData
                        ? HomeVisuals.sub
                        : abnormal
                        ? HomeVisuals.danger
                        : const Color(0xff146b4d),
                  ),
                ),
              ),
              const SizedBox(height: 8),
              Text(
                measuredAt,
                style: const TextStyle(fontSize: 16, color: HomeVisuals.sub),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

class HomeMedicationPreviewRow extends StatelessWidget {
  const HomeMedicationPreviewRow({
    super.key,
    required this.name,
    required this.dosage,
    required this.time,
    required this.status,
  });
  final String name, dosage, time, status;
  @override
  Widget build(BuildContext context) {
    final (label, color) = switch (status) {
      'DaUong' => ('Đã uống', const Color(0xff146b4d)),
      'BoLo' => ('Bỏ lỡ', HomeVisuals.danger),
      'TuChoi' => ('Từ chối', HomeVisuals.danger),
      _ => ('Chưa đến giờ', HomeVisuals.sub),
    };
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 14),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Container(
            padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 12),
            decoration: BoxDecoration(
              color: CareSeniorColors.background,
              borderRadius: BorderRadius.circular(16),
            ),
            child: Text(
              time,
              style: const TextStyle(
                fontSize: 17,
                fontWeight: FontWeight.w700,
                color: HomeVisuals.deep,
              ),
            ),
          ),
          const SizedBox(width: 12),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  name,
                  style: const TextStyle(
                    fontSize: 17,
                    fontWeight: FontWeight.w700,
                    color: HomeVisuals.ink,
                  ),
                ),
                if (dosage.isNotEmpty)
                  Text(
                    dosage,
                    style: const TextStyle(
                      fontSize: 16,
                      color: HomeVisuals.sub,
                    ),
                  ),
                const SizedBox(height: 4),
                Text(
                  label,
                  style: TextStyle(
                    fontSize: 16,
                    fontWeight: FontWeight.w600,
                    color: color,
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

class HomeSosEntry extends StatelessWidget {
  const HomeSosEntry({super.key, required this.onTap});
  final VoidCallback onTap;
  @override
  Widget build(BuildContext context) => Semantics(
    button: true,
    label: 'Mở màn SOS',
    child: InkWell(
      key: const ValueKey('home-sos-entry'),
      onTap: onTap,
      borderRadius: BorderRadius.circular(22),
      child: AppCard(
        color: const Color(0xfffff5f5),
        padding: const EdgeInsets.all(16),
        child: Row(
          crossAxisAlignment: CrossAxisAlignment.center,
          children: [
            Container(
              width: 56,
              height: 56,
              decoration: const BoxDecoration(
                color: HomeVisuals.danger,
                shape: BoxShape.circle,
              ),
              alignment: Alignment.center,
              child: const Text(
                'SOS',
                style: TextStyle(
                  fontSize: 16,
                  fontWeight: FontWeight.w800,
                  color: Colors.white,
                ),
              ),
            ),
            const SizedBox(width: 14),
            const Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    'Bạn cần hỗ trợ khẩn cấp?',
                    style: TextStyle(
                      fontSize: 18,
                      height: 1.3,
                      fontWeight: FontWeight.w800,
                      color: Color(0xff8f1d1d),
                    ),
                  ),
                  SizedBox(height: 4),
                  Text(
                    'Nhấn để mở chức năng SOS',
                    style: TextStyle(fontSize: 16, color: Color(0xff7a4a4a)),
                  ),
                ],
              ),
            ),
            const SizedBox(width: 6),
            const Icon(Icons.arrow_forward_rounded, color: HomeVisuals.danger),
          ],
        ),
      ),
    ),
  );
}
