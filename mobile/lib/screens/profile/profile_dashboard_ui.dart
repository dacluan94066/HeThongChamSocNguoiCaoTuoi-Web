import 'package:flutter/material.dart';

import '../../theme/care_senior_theme.dart';
import '../../widgets/care_senior_ui.dart';
import '../home/home_dashboard_ui.dart' show HomeVisuals;

/// Profile-only presentation: no services, permissions or account mutations.
class ProfileIdentityHeader extends StatelessWidget {
  const ProfileIdentityHeader({
    super.key,
    required this.name,
    required this.role,
    this.subtitle,
  });
  final String name, role;
  final String? subtitle;

  @override
  Widget build(BuildContext context) => ProfilePageHeader(
    title: name,
    subtitle: subtitle,
    centered: true,
    leading: Column(
      children: [
        Container(
          width: 108,
          height: 108,
          padding: const EdgeInsets.all(6),
          decoration: BoxDecoration(
            shape: BoxShape.circle,
            color: Colors.white.withValues(alpha: .24),
          ),
          child: CircleAvatar(
            backgroundColor: CareSeniorColors.mint,
            child: name.trim().isEmpty || name == 'Chưa cập nhật'
                ? const Icon(
                    Icons.person_outline_rounded,
                    size: 44,
                    color: HomeVisuals.deep,
                  )
                : Padding(
                    padding: const EdgeInsets.all(12),
                    child: FittedBox(
                      fit: BoxFit.scaleDown,
                      child: Text(
                        _initials(name),
                        style: const TextStyle(
                          fontSize: 32,
                          fontWeight: FontWeight.w800,
                          color: HomeVisuals.deep,
                        ),
                      ),
                    ),
                  ),
          ),
        ),
        const SizedBox(height: 16),
      ],
    ),
    trailing: Padding(
      padding: const EdgeInsets.only(top: 12),
      child: Text(
        role,
        textAlign: TextAlign.center,
        style: const TextStyle(
          fontSize: 16,
          color: Colors.white,
          fontWeight: FontWeight.w600,
        ),
      ),
    ),
  );

  static String _initials(String name) {
    final parts = name.trim().split(RegExp(r'\s+'));
    return (parts.length == 1
            ? parts.first.characters.first
            : '${parts.first.characters.first}${parts.last.characters.first}')
        .toUpperCase();
  }
}

class ProfilePageHeader extends StatelessWidget {
  const ProfilePageHeader({
    super.key,
    required this.title,
    this.subtitle,
    this.centered = false,
    this.leading,
    this.trailing,
  });
  final String title;
  final String? subtitle;
  final bool centered;
  final Widget? leading, trailing;

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
            left: -40,
            top: -56,
            child: Container(
              width: 176,
              height: 176,
              decoration: BoxDecoration(
                shape: BoxShape.circle,
                color: Colors.white.withValues(alpha: .06),
              ),
            ),
          ),
          Positioned(
            right: -32,
            top: 80,
            child: Container(
              width: 112,
              height: 112,
              decoration: BoxDecoration(
                shape: BoxShape.circle,
                color: Colors.white.withValues(alpha: .05),
              ),
            ),
          ),
          Padding(
            padding: const EdgeInsets.fromLTRB(20, 20, 20, 28),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                if (Navigator.canPop(context))
                  const Align(
                    alignment: Alignment.centerLeft,
                    child: BackButton(color: Colors.white),
                  ),
                ?leading,
                Text(
                  title,
                  textAlign: centered ? TextAlign.center : TextAlign.start,
                  style: const TextStyle(
                    fontSize: 26,
                    height: 1.2,
                    fontWeight: FontWeight.w800,
                    color: Colors.white,
                  ),
                ),
                if (subtitle?.isNotEmpty == true) ...[
                  const SizedBox(height: 8),
                  Text(
                    subtitle!,
                    textAlign: centered ? TextAlign.center : TextAlign.start,
                    style: TextStyle(
                      fontSize: 16,
                      height: 1.4,
                      color: Colors.white.withValues(alpha: .85),
                    ),
                  ),
                ],
                ?trailing,
              ],
            ),
          ),
        ],
      ),
    ),
  );
}

class ProfileStatePage extends StatelessWidget {
  const ProfileStatePage({
    super.key,
    this.loading = false,
    this.message,
    this.onRetry,
  });
  final bool loading;
  final String? message;
  final VoidCallback? onRetry;

  @override
  Widget build(BuildContext context) => Scaffold(
    backgroundColor: CareSeniorColors.background,
    body: SafeArea(
      bottom: false,
      child: ListView(
        children: [
          const ProfilePageHeader(
            title: 'Hồ sơ cá nhân',
            subtitle: 'Thông tin cá nhân và tài khoản của bạn',
          ),
          Padding(
            padding: const EdgeInsets.all(20),
            child: AppCard(
              child: Column(
                children: [
                  if (loading)
                    const CircularProgressIndicator(
                      color: CareSeniorColors.primary,
                    )
                  else
                    const Icon(
                      Icons.info_outline_rounded,
                      size: 44,
                      color: HomeVisuals.deep,
                    ),
                  const SizedBox(height: 16),
                  Text(
                    loading
                        ? 'Đang tải hồ sơ…'
                        : (message ?? 'Chưa có dữ liệu'),
                    textAlign: TextAlign.center,
                    style: const TextStyle(fontSize: 17, height: 1.4),
                  ),
                  if (onRetry != null) ...[
                    const SizedBox(height: 16),
                    FilledButton(
                      onPressed: onRetry,
                      child: const Text('Thử lại'),
                    ),
                  ],
                ],
              ),
            ),
          ),
        ],
      ),
    ),
  );
}

class ProfileButtonLabel extends StatelessWidget {
  const ProfileButtonLabel({
    super.key,
    required this.label,
    this.icon,
    this.busy = false,
  });
  final String label;
  final IconData? icon;
  final bool busy;
  @override
  Widget build(BuildContext context) => Padding(
    padding: const EdgeInsets.symmetric(vertical: 14),
    child: Row(
      mainAxisAlignment: MainAxisAlignment.center,
      children: [
        if (busy)
          const SizedBox(
            width: 22,
            height: 22,
            child: CircularProgressIndicator(
              strokeWidth: 2,
              color: Colors.white,
            ),
          )
        else if (icon != null)
          Icon(icon),
        if (busy || icon != null) const SizedBox(width: 12),
        Flexible(
          child: Text(
            label,
            textAlign: TextAlign.center,
            style: const TextStyle(fontSize: 17, fontWeight: FontWeight.w700),
          ),
        ),
      ],
    ),
  );
}

/// The existing forms supply their unchanged fields and callbacks.
class ProfileFormPage extends StatelessWidget {
  const ProfileFormPage({
    super.key,
    required this.title,
    required this.subtitle,
    required this.child,
    this.scrollKey,
  });
  final String title, subtitle;
  final Widget child;
  final Key? scrollKey;

  @override
  Widget build(BuildContext context) => Scaffold(
    backgroundColor: CareSeniorColors.background,
    body: SafeArea(
      child: SingleChildScrollView(
        key: scrollKey,
        keyboardDismissBehavior: ScrollViewKeyboardDismissBehavior.onDrag,
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            ProfilePageHeader(title: title, subtitle: subtitle),
            Padding(
              padding: const EdgeInsets.fromLTRB(20, 20, 20, 32),
              child: AppCard(child: child),
            ),
          ],
        ),
      ),
    ),
  );
}
