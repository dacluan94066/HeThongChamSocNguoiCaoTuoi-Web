import 'package:flutter/material.dart';

import '../theme/care_senior_theme.dart';

class AppCard extends StatelessWidget {
  const AppCard({
    super.key,
    required this.child,
    this.color,
    this.padding = const EdgeInsets.all(18),
  });

  final Widget child;
  final Color? color;
  final EdgeInsetsGeometry padding;

  @override
  Widget build(BuildContext context) => Container(
    width: double.infinity,
    padding: padding,
    decoration: BoxDecoration(
      color: color ?? CareSeniorColors.surface,
      borderRadius: BorderRadius.circular(22),
      border: Border.all(color: CareSeniorColors.border),
      boxShadow: const [
        BoxShadow(
          color: Color(0x0a17352a),
          blurRadius: 14,
          offset: Offset(0, 5),
        ),
      ],
    ),
    child: child,
  );
}

class AppSectionHeader extends StatelessWidget {
  const AppSectionHeader({super.key, required this.title, this.trailing});

  final String title;
  final Widget? trailing;

  @override
  Widget build(BuildContext context) => Row(
    children: [
      Expanded(
        child: Text(title, style: Theme.of(context).textTheme.titleLarge),
      ),
      if (trailing case final Widget widget) widget,
    ],
  );
}

class AppStatusChip extends StatelessWidget {
  const AppStatusChip({
    super.key,
    required this.label,
    this.color,
    this.background,
  });

  final String label;
  final Color? color;
  final Color? background;

  @override
  Widget build(BuildContext context) {
    final foreground = color ?? CareSeniorColors.deepGreen;
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 11, vertical: 7),
      decoration: BoxDecoration(
        color: background ?? CareSeniorColors.mint,
        borderRadius: BorderRadius.circular(999),
      ),
      child: Text(
        '● $label',
        style: TextStyle(
          fontSize: 14,
          fontWeight: FontWeight.w700,
          color: foreground,
        ),
      ),
    );
  }
}

class AppEmptyState extends StatelessWidget {
  const AppEmptyState({
    super.key,
    required this.icon,
    required this.title,
    required this.message,
  });

  final IconData icon;
  final String title;
  final String message;

  @override
  Widget build(BuildContext context) => AppCard(
    child: Padding(
      padding: const EdgeInsets.symmetric(vertical: 26),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          CircleAvatar(
            radius: 30,
            backgroundColor: CareSeniorColors.mint,
            child: Icon(icon, size: 31, color: CareSeniorColors.deepGreen),
          ),
          const SizedBox(height: 14),
          Text(
            title,
            textAlign: TextAlign.center,
            style: Theme.of(context).textTheme.titleMedium,
          ),
          const SizedBox(height: 6),
          Text(
            message,
            textAlign: TextAlign.center,
            style: Theme.of(context).textTheme.bodyMedium,
          ),
        ],
      ),
    ),
  );
}

class AppBottomNavigation extends StatelessWidget {
  const AppBottomNavigation({
    super.key,
    required this.selectedIndex,
    required this.onSelected,
  }) : assert(selectedIndex >= 0 && selectedIndex < 5);

  final int selectedIndex;
  final ValueChanged<int> onSelected;
  static const _items = <(IconData, String)>[
    (Icons.home_outlined, 'Trang chủ'),
    (Icons.calendar_month_outlined, 'Lịch trình'),
    (Icons.sos_rounded, 'SOS'),
    (Icons.notifications_outlined, 'Cảnh báo'),
    (Icons.person_outline, 'Hồ sơ'),
  ];
  static const _green = Color(0xff21966f);
  static const _sos = Color(0xfff32e59);

  @override
  Widget build(BuildContext context) {
    // Reserve the entire raised SOS area in Scaffold; neither the content nor
    // the independent AI shortcut may extend beneath this navigation.
    if (MediaQuery.viewInsetsOf(context).bottom > 0) {
      return const SizedBox.shrink();
    }
    final duration = MediaQuery.disableAnimationsOf(context)
        ? Duration.zero
        : const Duration(milliseconds: 180);
    return SafeArea(
      top: false,
      minimum: const EdgeInsets.fromLTRB(10, 0, 10, 12),
      child: Padding(
        padding: const EdgeInsets.only(top: 10),
        child: Align(
          heightFactor: 1,
          child: ConstrainedBox(
            constraints: const BoxConstraints(maxWidth: 760),
            child: LayoutBuilder(
              builder: (context, constraints) {
                final itemWidth = constraints.maxWidth / _items.length;
                final styles = List.generate(
                  _items.length,
                  (i) => DefaultTextStyle.of(context).style.copyWith(
                    fontSize: 12,
                    height: 1.2,
                    fontWeight: FontWeight.w700,
                    color: i == 2
                        ? _sos
                        : selectedIndex == i
                        ? _green
                        : const Color(0xff718096),
                  ),
                );
                var labelHeight = 0.0;
                for (var i = 0; i < _items.length; i++) {
                  final painter = TextPainter(
                    text: TextSpan(text: _items[i].$2, style: styles[i]),
                    textDirection: Directionality.of(context),
                    textScaler: MediaQuery.textScalerOf(context),
                  )..layout(maxWidth: itemWidth - 2);
                  if (painter.height > labelHeight) {
                    labelHeight = painter.height;
                  }
                  painter.dispose();
                }
                const raise = 20.0;
                const normalExtent = 44.0;
                final sosExtent = itemWidth.clamp(52.0, 64.0);
                const labelTop = raise + 12 + normalExtent + 6;
                final height = labelTop + labelHeight.ceilToDouble() + 14;
                return SizedBox(
                  key: const ValueKey('floating-pill-navigation'),
                  height: height,
                  child: Stack(
                    children: [
                      Positioned.fill(
                        top: raise,
                        child: DecoratedBox(
                          key: const ValueKey('floating-pill-surface'),
                          decoration: BoxDecoration(
                            color: Colors.white,
                            borderRadius: BorderRadius.circular(40),
                            border: Border.all(color: const Color(0xffe7eeea)),
                            boxShadow: const [
                              BoxShadow(
                                color: Color(0x14155e4b),
                                blurRadius: 28,
                                offset: Offset(0, 6),
                              ),
                            ],
                          ),
                        ),
                      ),
                      Row(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          for (var i = 0; i < _items.length; i++)
                            Expanded(
                              child: Semantics(
                                selected: selectedIndex == i,
                                button: true,
                                label: _items[i].$2,
                                child: Material(
                                  color: Colors.transparent,
                                  child: InkWell(
                                    key: ValueKey('home-nav-$i'),
                                    onTap: () => onSelected(i),
                                    borderRadius: BorderRadius.circular(28),
                                    child: SizedBox(
                                      height: height,
                                      child: Column(
                                        children: [
                                          SizedBox(
                                            height: i == 2 ? 0 : raise + 12,
                                          ),
                                          AnimatedContainer(
                                            key: ValueKey('home-nav-circle-$i'),
                                            duration: duration,
                                            curve: Curves.easeOutCubic,
                                            width: i == 2
                                                ? sosExtent
                                                : normalExtent,
                                            height: i == 2
                                                ? sosExtent
                                                : normalExtent,
                                            alignment: Alignment.center,
                                            decoration: BoxDecoration(
                                              shape: i == 2
                                                  ? BoxShape.circle
                                                  : BoxShape.rectangle,
                                              borderRadius: i == 2
                                                  ? null
                                                  : BorderRadius.circular(20),
                                              color: i == 2
                                                  ? _sos
                                                  : selectedIndex == i
                                                  ? const Color(0xffe8f6ef)
                                                  : Colors.transparent,
                                              border: i == 2
                                                  ? Border.all(
                                                      color: const Color(
                                                        0xffffd8e2,
                                                      ),
                                                      width: 4,
                                                    )
                                                  : null,
                                              boxShadow: i == 2
                                                  ? const [
                                                      BoxShadow(
                                                        color: Color(
                                                          0x40f32e59,
                                                        ),
                                                        blurRadius: 18,
                                                        offset: Offset(0, 4),
                                                      ),
                                                    ]
                                                  : null,
                                            ),
                                            child: Icon(
                                              i == 0 && selectedIndex == 0
                                                  ? Icons.home_rounded
                                                  : _items[i].$1,
                                              key: ValueKey('home-nav-icon-$i'),
                                              size: i == 2 ? 32 : 26,
                                              color: i == 2
                                                  ? Colors.white
                                                  : selectedIndex == i
                                                  ? _green
                                                  : const Color(0xff94a3b8),
                                            ),
                                          ),
                                          SizedBox(
                                            height: i == 2
                                                ? labelTop - sosExtent
                                                : 6,
                                          ),
                                          SizedBox(
                                            height: labelHeight.ceilToDouble(),
                                            width: itemWidth - 2,
                                            child: AnimatedDefaultTextStyle(
                                              duration: duration,
                                              curve: Curves.easeOutCubic,
                                              style: styles[i],
                                              textAlign: TextAlign.center,
                                              child: Text(
                                                _items[i].$2,
                                                key: ValueKey(
                                                  'home-nav-label-$i',
                                                ),
                                                textAlign: TextAlign.center,
                                                softWrap: true,
                                              ),
                                            ),
                                          ),
                                        ],
                                      ),
                                    ),
                                  ),
                                ),
                              ),
                            ),
                        ],
                      ),
                    ],
                  ),
                );
              },
            ),
          ),
        ),
      ),
    );
  }
}
