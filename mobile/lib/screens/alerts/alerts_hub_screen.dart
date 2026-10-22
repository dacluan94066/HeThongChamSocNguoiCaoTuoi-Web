import 'package:flutter/material.dart';
import '../../theme/care_senior_theme.dart';

import '../notifications/notification_screen.dart';
import 'alert_history_screen.dart';
import 'alerts_dashboard_ui.dart';

class AlertsHubScreen extends StatelessWidget {
  const AlertsHubScreen({super.key});

  @override
  Widget build(BuildContext context) => DefaultTabController(
    length: 2,
    child: Scaffold(
      backgroundColor: CareSeniorColors.background,
      body: SafeArea(
        bottom: false,
        child: NestedScrollView(
          headerSliverBuilder: (context, innerBoxIsScrolled) => const [
            SliverToBoxAdapter(
              child: AlertsScreenHeader(
                title: 'Cảnh báo',
                subtitle: 'Thông báo và lịch sử cảnh báo của bạn',
              ),
            ),
            SliverToBoxAdapter(
              child: Padding(
                padding: EdgeInsets.only(top: 8),
                child: AlertsDashboardTabs(),
              ),
            ),
          ],
          body: const TabBarView(
            children: [
              NotificationScreen(embedded: true),
              AlertHistoryScreen(embedded: true),
            ],
          ),
        ),
      ),
    ),
  );
}
