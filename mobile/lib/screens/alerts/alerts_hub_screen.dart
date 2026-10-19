import 'package:flutter/material.dart';
import '../../theme/care_senior_theme.dart';

import '../notifications/notification_screen.dart';
import 'alert_history_screen.dart';

class AlertsHubScreen extends StatelessWidget {
  const AlertsHubScreen({super.key});

  @override
  Widget build(BuildContext context) => DefaultTabController(
    length: 2,
    child: Scaffold(
      backgroundColor: CareSeniorColors.background,
      appBar: AppBar(
        title: const Text('Cảnh báo'),
        bottom: const TabBar(
          tabs: [
            Tab(text: 'Thông báo'),
            Tab(text: 'Lịch sử cảnh báo'),
          ],
        ),
      ),
      body: const TabBarView(
        children: [
          NotificationScreen(embedded: true),
          AlertHistoryScreen(embedded: true),
        ],
      ),
    ),
  );
}
