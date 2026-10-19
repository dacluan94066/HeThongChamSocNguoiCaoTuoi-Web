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
    final scale = MediaQuery.textScalerOf(context).scale(1);
    return SafeArea(
      top: false,
      child: Container(
        height: 78 + (scale - 1).clamp(0, 1.5) * 35,
        decoration: const BoxDecoration(
          color: CareSeniorColors.surface,
          border: Border(top: BorderSide(color: CareSeniorColors.border)),
        ),
        child: Row(
          children: [
            for (var index = 0; index < _items.length; index++)
              Expanded(
                child: Semantics(
                  selected: selectedIndex == index,
                  button: true,
                  label: _items[index].$2,
                  child: InkWell(
                    onTap: () => onSelected(index),
                    child: SizedBox.expand(
                      child: Column(
                        mainAxisAlignment: MainAxisAlignment.center,
                        children: index == 3
                            ? [
                                Container(
                                  width: 54,
                                  height: 54,
                                  alignment: Alignment.center,
                                  decoration: const BoxDecoration(
                                    color: CareSeniorColors.danger,
                                    shape: BoxShape.circle,
                                  ),
                                  child: const Text(
                                    'SOS',
                                    style: TextStyle(
                                      fontSize: 16,
                                      color: Colors.white,
                                      fontWeight: FontWeight.w800,
                                    ),
                                  ),
                                ),
                              ]
                            : [
                                Icon(
                                  _items[index].$1,
                                  size: 25,
                                  color: selectedIndex == index
                                      ? CareSeniorColors.deepGreen
                                      : CareSeniorColors.secondaryText,
                                ),
                                const SizedBox(height: 3),
                                Text(
                                  _items[index].$2,
                                  maxLines: 2,
                                  overflow: TextOverflow.ellipsis,
                                  textAlign: TextAlign.center,
                                  style: TextStyle(
                                    fontSize: 13,
                                    height: 1.05,
                                    fontWeight: selectedIndex == index
                                        ? FontWeight.w800
                                        : FontWeight.w600,
                                    color: selectedIndex == index
                                        ? CareSeniorColors.deepGreen
                                        : CareSeniorColors.secondaryText,
                                  ),
                                ),
                              ],
                      ),
                    ),
                  ),
                ),
              ),
          ],
        ),
      ),
    );
  }
}
