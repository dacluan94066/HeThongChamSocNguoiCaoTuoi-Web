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
  });

  final int selectedIndex;
  final ValueChanged<int> onSelected;

  static const _items = <(IconData, String)>[
    (Icons.home_outlined, 'Trang chủ'),
    (Icons.medication_outlined, 'Lịch thuốc'),
    (Icons.calendar_month_outlined, 'Lịch khám'),
    (Icons.sos_outlined, 'SOS'),
    (Icons.notifications_outlined, 'Cảnh báo'),
    (Icons.person_outline, 'Hồ sơ'),
  ];

  @override
  Widget build(BuildContext context) {
    // Keep the keyboard and input actions unobstructed. Scaffold reserves the
    // bar's full height; do not use extendBody or an overlay for the floating look.
    if (MediaQuery.viewInsetsOf(context).bottom > 0) {
      return const SizedBox.shrink();
    }
    final animation = MediaQuery.disableAnimationsOf(context)
        ? Duration.zero
        : const Duration(milliseconds: 180);
    return SafeArea(
      top: false,
      minimum: const EdgeInsets.fromLTRB(10, 0, 10, 12),
      child: Padding(
        padding: const EdgeInsets.only(top: 12),
        child: Align(
          heightFactor: 1,
          child: ConstrainedBox(
            constraints: const BoxConstraints(maxWidth: 760),
            child: LayoutBuilder(
              builder: (context, constraints) {
                const horizontalPadding = 4.0;
                final contentWidth =
                    constraints.maxWidth - horizontalPadding * 2 - 2;
                final scaler = MediaQuery.textScalerOf(context);
                final styles = List.generate(
                  _items.length,
                  (index) => DefaultTextStyle.of(context).style.copyWith(
                    fontSize: 13,
                    height: 1.15,
                    fontWeight: selectedIndex == index
                        ? FontWeight.w800
                        : FontWeight.w600,
                    color: index == 3
                        ? CareSeniorColors.danger
                        : selectedIndex == index
                        ? const Color(0xff155e4b)
                        : const Color(0xff5f6c65),
                  ),
                );
                var columns = _items.length;
                if (scaler.scale(1) > 1.25) {
                  // Accessibility layout: give whole words room instead of
                  // shrinking system text or splitting Vietnamese words.
                  for (var index = 0; index < _items.length; index++) {
                    for (final word in _items[index].$2.split(' ')) {
                      final painter = TextPainter(
                        text: TextSpan(
                          text: word,
                          style: styles[index].copyWith(
                            fontWeight: FontWeight.w800,
                          ),
                        ),
                        textDirection: Directionality.of(context),
                        textScaler: scaler,
                      )..layout();
                      if (painter.width > contentWidth / _items.length - 4) {
                        columns = 3;
                      }
                      painter.dispose();
                    }
                  }
                }
                // A small sub-pixel tolerance prevents Wrap rounding a last
                // item onto an unintended extra row.
                final itemWidth = (contentWidth - 0.06) / columns;
                final iconExtent = (itemWidth - 4).clamp(36.0, 44.0);
                final labelWidth = itemWidth - 4;
                var labelHeight = 0.0;
                for (var index = 0; index < _items.length; index++) {
                  // Reserve space for every label in its selected (bold) style
                  // so switching tabs cannot trim or jump the enlarged labels.
                  final painter = TextPainter(
                    text: TextSpan(
                      text: _items[index].$2,
                      style: styles[index].copyWith(
                        fontWeight: FontWeight.w800,
                      ),
                    ),
                    textDirection: Directionality.of(context),
                    textScaler: scaler,
                  )..layout(maxWidth: labelWidth);
                  if (painter.height > labelHeight) {
                    labelHeight = painter.height;
                  }
                  painter.dispose();
                }
                final tileHeight =
                    12 + iconExtent + 6 + labelHeight.ceilToDouble() + 12;
                final rows = _items.length ~/ columns;
                return Container(
                  key: const ValueKey('floating-pill-navigation'),
                  height: tileHeight * rows + (rows - 1) * 8 + 2,
                  padding: const EdgeInsets.symmetric(
                    horizontal: horizontalPadding,
                  ),
                  decoration: BoxDecoration(
                    color: Colors.white,
                    borderRadius: BorderRadius.circular(40),
                    border: Border.all(color: const Color(0xffe4ece7)),
                    boxShadow: const [
                      BoxShadow(
                        color: Color(0x18155e4b),
                        blurRadius: 24,
                        offset: Offset(0, 6),
                      ),
                    ],
                  ),
                  child: Material(
                    color: Colors.transparent,
                    child: Wrap(
                      runSpacing: 8,
                      children: [
                        for (var index = 0; index < _items.length; index++)
                          SizedBox(
                            width: itemWidth,
                            height: tileHeight,
                            child: Semantics(
                              selected: selectedIndex == index,
                              button: true,
                              label: _items[index].$2,
                              child: InkWell(
                                key: ValueKey('home-nav-$index'),
                                onTap: () => onSelected(index),
                                borderRadius: BorderRadius.circular(28),
                                child: SizedBox.expand(
                                  child: Padding(
                                    padding: const EdgeInsets.symmetric(
                                      horizontal: 2,
                                    ),
                                    child: Column(
                                      mainAxisAlignment:
                                          MainAxisAlignment.center,
                                      children: [
                                        AnimatedContainer(
                                          key: ValueKey(
                                            'home-nav-circle-$index',
                                          ),
                                          duration: animation,
                                          curve: Curves.easeOutCubic,
                                          width: iconExtent,
                                          height: iconExtent,
                                          alignment: Alignment.center,
                                          decoration: BoxDecoration(
                                            shape: BoxShape.circle,
                                            color: selectedIndex == index
                                                ? const Color(0xff21966f)
                                                : const Color(0xfff0f3f1),
                                          ),
                                          child: AnimatedContainer(
                                            duration: animation,
                                            curve: Curves.easeOutCubic,
                                            width:
                                                index == 3 &&
                                                    selectedIndex == index
                                                ? iconExtent - 10
                                                : iconExtent,
                                            height:
                                                index == 3 &&
                                                    selectedIndex == index
                                                ? iconExtent - 10
                                                : iconExtent,
                                            alignment: Alignment.center,
                                            decoration: BoxDecoration(
                                              shape: BoxShape.circle,
                                              color:
                                                  index == 3 &&
                                                      selectedIndex == index
                                                  ? Colors.white
                                                  : Colors.transparent,
                                            ),
                                            child: Icon(
                                              index == 3
                                                  ? Icons.sos_rounded
                                                  : _items[index].$1,
                                              key: ValueKey(
                                                'home-nav-icon-$index',
                                              ),
                                              size: 24,
                                              color: index == 3
                                                  ? CareSeniorColors.danger
                                                  : selectedIndex == index
                                                  ? Colors.white
                                                  : const Color(0xff5f6c65),
                                            ),
                                          ),
                                        ),
                                        const SizedBox(height: 6),
                                        SizedBox(
                                          height: labelHeight.ceilToDouble(),
                                          child: AnimatedDefaultTextStyle(
                                            duration: animation,
                                            curve: Curves.easeOutCubic,
                                            style: styles[index],
                                            textAlign: TextAlign.center,
                                            child: Text(
                                              _items[index].$2,
                                              key: ValueKey(
                                                'home-nav-label-$index',
                                              ),
                                              softWrap: true,
                                              textAlign: TextAlign.center,
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
