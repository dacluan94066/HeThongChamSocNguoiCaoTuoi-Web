import 'package:flutter/material.dart';

import '../../services/notification_storage.dart';

import '../appointments/appointment_screen.dart';
import '../health/health_screen.dart';
import '../medication/medication_screen.dart';

class NotificationScreen extends StatefulWidget {
  const NotificationScreen({
    super.key,
  });

  @override
  State<NotificationScreen> createState() =>
      _NotificationScreenState();
}

class _NotificationScreenState
    extends State<NotificationScreen> {
  List<Map<String, dynamic>> notifications = [];

  bool loading = true;

  @override
  void initState() {
    super.initState();
    loadNotifications();
  }

  Future<void> loadNotifications() async {
    final data =
        await NotificationStorage.loadNotifications();

    if (!mounted) {
      return;
    }

    setState(() {
      notifications = data;
      loading = false;
    });
  }

  int get unreadCount {
    return notifications
        .where(
          (item) =>
              item['read'] == false,
        )
        .length;
  }

  Future<void> markAllAsRead() async {
    await NotificationStorage.markAllAsRead();

    await loadNotifications();

    if (!mounted) {
      return;
    }

    ScaffoldMessenger.of(context).showSnackBar(
      const SnackBar(
        content: Text(
          'Đã đánh dấu tất cả thông báo là đã đọc.',
        ),
      ),
    );
  }

  Future<void> openNotification(
    Map<String, dynamic> notification,
  ) async {
    final id =
        notification['id']?.toString() ?? '';

    await NotificationStorage.markAsRead(id);

    await loadNotifications();

    if (!mounted) {
      return;
    }

    final type =
        notification['type']?.toString() ?? '';

    if (type == 'medicine') {
      await Navigator.push(
        context,
        MaterialPageRoute(
          builder: (_) =>
              const MedicationScreen(),
        ),
      );

      await loadNotifications();

      return;
    }

    if (type == 'health') {
      await Navigator.push(
        context,
        MaterialPageRoute(
          builder: (_) =>
              const HealthScreen(),
        ),
      );

      await loadNotifications();

      return;
    }

    if (type == 'appointment') {
      await Navigator.push(
        context,
        MaterialPageRoute(
          builder: (_) =>
              const AppointmentScreen(),
        ),
      );

      await loadNotifications();
    }
  }

  IconData getNotificationIcon(
    String type,
  ) {
    switch (type) {
      case 'medicine':
        return Icons.medication_rounded;

      case 'appointment':
        return Icons.calendar_month_rounded;

      default:
        return Icons.favorite_rounded;
    }
  }

  Color getNotificationColor(
    String type,
  ) {
    switch (type) {
      case 'medicine':
        return const Color(
          0xffe85d75,
        );

      case 'appointment':
        return const Color(
          0xff4b6edb,
        );

      default:
        return const Color(
          0xff43a66b,
        );
    }
  }

  Color getNotificationBackground(
    String type,
  ) {
    switch (type) {
      case 'medicine':
        return const Color(
          0xffffe8ec,
        );

      case 'appointment':
        return const Color(
          0xffe9efff,
        );

      default:
        return const Color(
          0xffe8f8ee,
        );
    }
  }

  @override
  Widget build(
    BuildContext context,
  ) {
    return Scaffold(
      backgroundColor:
          const Color(
        0xfff3f3f1,
      ),

      appBar: AppBar(
        backgroundColor:
            const Color(
          0xfff3f3f1,
        ),
        elevation: 0,
        centerTitle: true,
        title: const Text(
          'Thông báo',
          style: TextStyle(
            fontWeight:
                FontWeight.bold,
          ),
        ),
      ),

      body: loading
          ? const Center(
              child:
                  CircularProgressIndicator(
                color:
                    Color(
                  0xff07856d,
                ),
              ),
            )
          : RefreshIndicator(
              onRefresh:
                  loadNotifications,
              color:
                  const Color(
                0xff07856d,
              ),
              child: ListView(
                padding:
                    const EdgeInsets
                        .fromLTRB(
                  18,
                  10,
                  18,
                  30,
                ),
                children: [
                  Container(
                    width:
                        double.infinity,
                    padding:
                        const EdgeInsets
                            .all(
                      18,
                    ),
                    decoration:
                        BoxDecoration(
                      gradient:
                          const LinearGradient(
                        colors: [
                          Color(
                            0xffe9fff6,
                          ),
                          Color(
                            0xffffffe8,
                          ),
                        ],
                      ),
                      borderRadius:
                          BorderRadius
                              .circular(
                        26,
                      ),
                    ),
                    child: Row(
                      children: [
                        const CircleAvatar(
                          radius: 30,
                          backgroundColor:
                              Colors.white,
                          child: Icon(
                            Icons
                                .notifications_active_rounded,
                            color:
                                Color(
                              0xff07856d,
                            ),
                            size: 30,
                          ),
                        ),

                        const SizedBox(
                          width: 14,
                        ),

                        Expanded(
                          child: Column(
                            crossAxisAlignment:
                                CrossAxisAlignment
                                    .start,
                            children: [
                              const Text(
                                'Thông báo chưa đọc',
                                style:
                                    TextStyle(
                                  fontSize:
                                      13,
                                  color:
                                      Colors.black54,
                                ),
                              ),

                              const SizedBox(
                                height: 3,
                              ),

                              Text(
                                '$unreadCount thông báo',
                                style:
                                    const TextStyle(
                                  fontSize:
                                      21,
                                  fontWeight:
                                      FontWeight
                                          .bold,
                                ),
                              ),
                            ],
                          ),
                        ),
                      ],
                    ),
                  ),

                  const SizedBox(
                    height: 18,
                  ),

                  Row(
                    mainAxisAlignment:
                        MainAxisAlignment
                            .spaceBetween,
                    children: [
                      const Text(
                        'Tất cả thông báo',
                        style:
                            TextStyle(
                          fontSize: 18,
                          fontWeight:
                              FontWeight
                                  .bold,
                        ),
                      ),

                      if (unreadCount >
                          0)
                        TextButton(
                          onPressed:
                              markAllAsRead,
                          child:
                              const Text(
                            'Đánh dấu đã đọc',
                            style:
                                TextStyle(
                              color:
                                  Color(
                                0xff07856d,
                              ),
                              fontSize:
                                  12,
                            ),
                          ),
                        ),
                    ],
                  ),

                  const SizedBox(
                    height: 8,
                  ),

                  if (notifications
                      .isEmpty)
                    Container(
                      padding:
                          const EdgeInsets
                              .all(
                        28,
                      ),
                      decoration:
                          BoxDecoration(
                        color:
                            Colors.white,
                        borderRadius:
                            BorderRadius
                                .circular(
                          22,
                        ),
                      ),
                      child:
                          const Column(
                        children: [
                          Icon(
                            Icons
                                .notifications_none_rounded,
                            size: 46,
                            color:
                                Colors.black26,
                          ),

                          SizedBox(
                            height: 10,
                          ),

                          Text(
                            'Chưa có thông báo nào.',
                            style:
                                TextStyle(
                              color:
                                  Colors.black54,
                            ),
                          ),
                        ],
                      ),
                    )
                  else
                    ...notifications.map(
                      (notification) {
                        final isRead =
                            notification[
                                    'read'] ==
                                true;

                        final type =
                            notification[
                                        'type']
                                    ?.toString() ??
                                'health';

                        return InkWell(
                          onTap: () =>
                              openNotification(
                            notification,
                          ),
                          borderRadius:
                              BorderRadius
                                  .circular(
                            22,
                          ),
                          child:
                              Container(
                            margin:
                                const EdgeInsets
                                    .only(
                              bottom: 12,
                            ),
                            padding:
                                const EdgeInsets
                                    .all(
                              14,
                            ),
                            decoration:
                                BoxDecoration(
                              color: isRead
                                  ? Colors.white
                                  : const Color(
                                      0xfff8fffb,
                                    ),
                              borderRadius:
                                  BorderRadius
                                      .circular(
                                22,
                              ),
                              border:
                                  Border.all(
                                color: isRead
                                    ? Colors
                                        .transparent
                                    : const Color(
                                        0xffd9f3e6,
                                      ),
                              ),
                            ),
                            child: Row(
                              crossAxisAlignment:
                                  CrossAxisAlignment
                                      .start,
                              children: [
                                Container(
                                  width: 50,
                                  height: 50,
                                  decoration:
                                      BoxDecoration(
                                    color:
                                        getNotificationBackground(
                                      type,
                                    ),
                                    borderRadius:
                                        BorderRadius
                                            .circular(
                                      16,
                                    ),
                                  ),
                                  child: Icon(
                                    getNotificationIcon(
                                      type,
                                    ),
                                    color:
                                        getNotificationColor(
                                      type,
                                    ),
                                  ),
                                ),

                                const SizedBox(
                                  width: 12,
                                ),

                                Expanded(
                                  child:
                                      Column(
                                    crossAxisAlignment:
                                        CrossAxisAlignment
                                            .start,
                                    children: [
                                      Row(
                                        children: [
                                          Expanded(
                                            child:
                                                Text(
                                              notification['title']
                                                      ?.toString() ??
                                                  'Thông báo',
                                              style:
                                                  TextStyle(
                                                fontSize:
                                                    15,
                                                fontWeight: isRead
                                                    ? FontWeight.w600
                                                    : FontWeight.bold,
                                              ),
                                            ),
                                          ),

                                          if (!isRead)
                                            Container(
                                              width:
                                                  9,
                                              height:
                                                  9,
                                              decoration:
                                                  const BoxDecoration(
                                                color:
                                                    Color(
                                                  0xff07856d,
                                                ),
                                                shape:
                                                    BoxShape.circle,
                                              ),
                                            ),
                                        ],
                                      ),

                                      const SizedBox(
                                        height: 5,
                                      ),

                                      Text(
                                        notification['message']
                                                ?.toString() ??
                                            '',
                                        style:
                                            const TextStyle(
                                          fontSize:
                                              13,
                                          color:
                                              Colors.black54,
                                          height:
                                              1.4,
                                        ),
                                      ),

                                      const SizedBox(
                                        height: 7,
                                      ),

                                      Row(
                                        children: [
                                          Icon(
                                            type ==
                                                    'appointment'
                                                ? Icons
                                                    .calendar_today_outlined
                                                : Icons
                                                    .schedule_rounded,
                                            size:
                                                15,
                                            color:
                                                Colors.black38,
                                          ),

                                          const SizedBox(
                                            width:
                                                5,
                                          ),

                                          Text(
                                            notification['time']
                                                    ?.toString() ??
                                                '',
                                            style:
                                                const TextStyle(
                                              fontSize:
                                                  12,
                                              color:
                                                  Colors.black45,
                                            ),
                                          ),
                                        ],
                                      ),
                                    ],
                                  ),
                                ),

                                const SizedBox(
                                  width: 6,
                                ),

                                const Icon(
                                  Icons
                                      .chevron_right_rounded,
                                  color:
                                      Colors.black26,
                                ),
                              ],
                            ),
                          ),
                        );
                      },
                    ),
                ],
              ),
            ),
    );
  }
}