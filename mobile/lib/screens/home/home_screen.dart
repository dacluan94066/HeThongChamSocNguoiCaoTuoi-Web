import 'package:flutter/material.dart';

import '../../services/appointment_storage.dart';
import '../../services/health_storage.dart';
import '../../services/medication_storage.dart';
import '../../services/notification_storage.dart';
import '../../services/api_client.dart';
import '../../services/elderly_service.dart';

import '../appointments/appointment_screen.dart';
import '../caregiver/caregiver_screen.dart';
import '../health/health_screen.dart';
import '../medication/medication_screen.dart';
import '../notifications/notification_screen.dart';
import '../profile/profile_screen.dart';

class HomeScreen extends StatefulWidget {
  const HomeScreen({super.key});

  @override
  State<HomeScreen> createState() => _HomeScreenState();
}

class _HomeScreenState extends State<HomeScreen> {
  int selectedIndex = 0;
  int unreadNotificationCount = 0;

  Map<String, dynamic> profile = {};
  String? profileError;
  Map<String, String> healthData = {};
  Map<String, bool> medicationStatus = {};
  Map<String, String> reminderTimes = {};

  Map<String, dynamic>? nextAppointment;

  bool loadingProfile = true;
  bool loadingHealth = true;
  bool loadingMedication = true;
  bool loadingAppointment = true;

  @override
  void initState() {
    super.initState();
    loadAllData();
  }

  // =====================================================
  // LOAD ALL
  // =====================================================

  Future<void> loadAllData({bool refreshProfile = false}) async {
    await Future.wait([
      loadProfile(refresh: refreshProfile),
      loadHealthData(),
      loadMedicationStatus(),
      loadReminderTimes(),
      loadUnreadNotificationCount(),
      loadNextAppointment(),
    ]);
  }

  // =====================================================
  // PROFILE
  // =====================================================

  Future<void> loadProfile({bool refresh = false}) async {
    try {
      final data = await ElderlyService.instance.getMyProfile(refresh: refresh);
      if (!mounted) return;
      setState(() {
        profile = data;
        profileError = null;
        loadingProfile = false;
      });
    } on ApiException catch (error) {
      if (!mounted) return;
      setState(() {
        profileError = error.message;
        loadingProfile = false;
      });
    } catch (_) {
      if (!mounted) return;
      setState(() {
        profileError = 'Không thể tải hồ sơ.';
        loadingProfile = false;
      });
    }
  }

  // =====================================================
  // HEALTH
  // =====================================================

  Future<void> loadHealthData() async {
    final data = await HealthStorage.loadHealthData();

    if (!mounted) {
      return;
    }

    setState(() {
      healthData = data;
      loadingHealth = false;
    });
  }

  // =====================================================
  // MEDICATION STATUS
  // =====================================================

  Future<void> loadMedicationStatus() async {
    final data = await MedicationStorage.loadMedicationStatus();

    if (!mounted) {
      return;
    }

    setState(() {
      medicationStatus = data;
      loadingMedication = false;
    });
  }

  // =====================================================
  // MEDICATION REMINDER TIMES
  // =====================================================

  Future<void> loadReminderTimes() async {
    final data = await MedicationStorage.loadReminderTimes();

    if (!mounted) {
      return;
    }

    setState(() {
      reminderTimes = data;
    });
  }

  // =====================================================
  // NOTIFICATION BADGE
  // =====================================================

  Future<void> loadUnreadNotificationCount() async {
    final count = await NotificationStorage.getUnreadCount();

    if (!mounted) {
      return;
    }

    setState(() {
      unreadNotificationCount = count;
    });
  }

  // =====================================================
  // APPOINTMENT
  // =====================================================

  Future<void> loadNextAppointment() async {
    final appointment = await AppointmentStorage.getNextAppointment();

    if (!mounted) {
      return;
    }

    setState(() {
      nextAppointment = appointment;
      loadingAppointment = false;
    });
  }

  // =====================================================
  // CALCULATE AGE
  // =====================================================

  // =====================================================
  // OPEN PROFILE
  // =====================================================

  Future<void> openProfile() async {
    await Navigator.push(
      context,
      MaterialPageRoute(builder: (_) => const ProfileScreen()),
    );

    await loadProfile();
  }

  // =====================================================
  // OPEN HEALTH
  // =====================================================

  Future<void> openHealth() async {
    await Navigator.push(
      context,
      MaterialPageRoute(builder: (_) => const HealthScreen()),
    );

    await loadHealthData();
    await loadUnreadNotificationCount();
  }

  // =====================================================
  // OPEN MEDICATION
  // =====================================================

  Future<void> openMedication() async {
    await Navigator.push(
      context,
      MaterialPageRoute(builder: (_) => const MedicationScreen()),
    );

    await loadMedicationStatus();
    await loadReminderTimes();
    await loadUnreadNotificationCount();
  }

  // =====================================================
  // OPEN NOTIFICATION
  // =====================================================

  Future<void> openNotifications() async {
    await Navigator.push(
      context,
      MaterialPageRoute(builder: (_) => const NotificationScreen()),
    );

    await loadUnreadNotificationCount();
  }

  // =====================================================
  // OPEN APPOINTMENT
  // =====================================================

  Future<void> openAppointments() async {
    await Navigator.push(
      context,
      MaterialPageRoute(builder: (_) => const AppointmentScreen()),
    );

    await loadNextAppointment();
    await loadUnreadNotificationCount();
  }

  // =====================================================
  // BUILD
  // =====================================================

  @override
  Widget build(BuildContext context) {
    final name = profileError == null
        ? ElderlyService.text(profile, 'hoTen')
        : profileError!;
    final gender = ElderlyService.text(profile, 'gioiTinh');
    final age = ElderlyService.displayAge(profile);

    final heartRate = healthData['heartRate'] ?? '72';

    final temperature = healthData['temperature'] ?? '36.9';

    final metforminDone = medicationStatus['Metformin 500mg'] ?? false;

    final metforminTime = reminderTimes['Metformin 500mg'] ?? '08:00';

    final systolic = healthData['systolic'] ?? '125';

    final diastolic = healthData['diastolic'] ?? '80';

    final updatedAt = healthData['updatedAt'] ?? 'Chưa cập nhật';

    final now = DateTime.now();

    final today =
        '${now.day.toString().padLeft(2, '0')}/'
        '${now.month.toString().padLeft(2, '0')}/'
        '${now.year}';

    final healthUpdatedToday =
        updatedAt != 'Chưa cập nhật' && updatedAt.startsWith(today);

    final greeting = now.hour < 11
        ? 'Chào buổi sáng'
        : now.hour < 14
        ? 'Chào buổi trưa'
        : now.hour < 18
        ? 'Chào buổi chiều'
        : 'Chào buổi tối';

    return Scaffold(
      backgroundColor: const Color(0xfff3f3f1),

      body: SafeArea(
        child: RefreshIndicator(
          onRefresh: () => loadAllData(refreshProfile: true),
          color: const Color(0xff07856d),
          child: SingleChildScrollView(
            physics: const AlwaysScrollableScrollPhysics(),
            padding: const EdgeInsets.fromLTRB(18, 16, 18, 100),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                // =========================================
                // HEADER
                // =========================================
                Row(
                  children: [
                    GestureDetector(
                      onTap: openProfile,
                      child: Container(
                        width: 52,
                        height: 52,
                        decoration: const BoxDecoration(
                          color: Colors.white,
                          shape: BoxShape.circle,
                        ),
                        child: const Icon(
                          Icons.person,
                          size: 30,
                          color: Colors.black54,
                        ),
                      ),
                    ),

                    const SizedBox(width: 12),

                    Expanded(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text(
                            greeting,
                            style: const TextStyle(
                              fontSize: 14,
                              color: Colors.black54,
                            ),
                          ),

                          const SizedBox(height: 2),

                          loadingProfile
                              ? const SizedBox(
                                  width: 18,
                                  height: 18,
                                  child: CircularProgressIndicator(
                                    strokeWidth: 2,
                                    color: Color(0xff07856d),
                                  ),
                                )
                              : Text(
                                  name,
                                  style: const TextStyle(
                                    fontSize: 20,
                                    fontWeight: FontWeight.bold,
                                  ),
                                ),
                        ],
                      ),
                    ),

                    Stack(
                      clipBehavior: Clip.none,
                      children: [
                        Container(
                          width: 50,
                          height: 50,
                          decoration: const BoxDecoration(
                            color: Colors.white,
                            shape: BoxShape.circle,
                          ),
                          child: IconButton(
                            onPressed: openNotifications,
                            icon: const Icon(
                              Icons.notifications_none_rounded,
                              size: 26,
                              color: Colors.black54,
                            ),
                          ),
                        ),

                        if (unreadNotificationCount > 0)
                          Positioned(
                            right: -2,
                            top: -3,
                            child: Container(
                              constraints: const BoxConstraints(
                                minWidth: 21,
                                minHeight: 21,
                              ),
                              padding: const EdgeInsets.symmetric(
                                horizontal: 5,
                              ),
                              decoration: BoxDecoration(
                                color: const Color(0xffd84444),
                                borderRadius: BorderRadius.circular(20),
                                border: Border.all(
                                  color: const Color(0xfff3f3f1),
                                  width: 2,
                                ),
                              ),
                              alignment: Alignment.center,
                              child: Text(
                                unreadNotificationCount > 99
                                    ? '99+'
                                    : '$unreadNotificationCount',
                                style: const TextStyle(
                                  color: Colors.white,
                                  fontSize: 10,
                                  fontWeight: FontWeight.bold,
                                ),
                              ),
                            ),
                          ),
                      ],
                    ),
                  ],
                ),

                const SizedBox(height: 18),

                // =========================================
                // HEALTH CARD
                // =========================================
                InkWell(
                  onTap: openHealth,
                  borderRadius: BorderRadius.circular(28),
                  child: Container(
                    width: double.infinity,
                    padding: const EdgeInsets.all(18),
                    decoration: BoxDecoration(
                      gradient: const LinearGradient(
                        colors: [Color(0xffffffe6), Color(0xffe9fff6)],
                        begin: Alignment.topLeft,
                        end: Alignment.bottomRight,
                      ),
                      borderRadius: BorderRadius.circular(28),
                    ),
                    child: Row(
                      children: [
                        Container(
                          width: 68,
                          height: 68,
                          decoration: const BoxDecoration(
                            color: Colors.white,
                            shape: BoxShape.circle,
                          ),
                          child: const Icon(
                            Icons.elderly_rounded,
                            size: 38,
                            color: Colors.black54,
                          ),
                        ),

                        const SizedBox(width: 14),

                        Expanded(
                          child: Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              const Text(
                                'Sức khỏe hôm nay',
                                style: TextStyle(
                                  fontSize: 13,
                                  color: Colors.black54,
                                ),
                              ),

                              const SizedBox(height: 3),

                              Text(
                                name,
                                style: const TextStyle(
                                  fontSize: 18,
                                  fontWeight: FontWeight.bold,
                                ),
                              ),

                              const SizedBox(height: 4),

                              Text(
                                '$age • $gender',
                                style: const TextStyle(
                                  fontSize: 13,
                                  color: Colors.black54,
                                ),
                              ),

                              const SizedBox(height: 9),

                              loadingHealth
                                  ? const SizedBox(
                                      width: 18,
                                      height: 18,
                                      child: CircularProgressIndicator(
                                        strokeWidth: 2,
                                        color: Color(0xff07856d),
                                      ),
                                    )
                                  : Wrap(
                                      spacing: 7,
                                      runSpacing: 6,
                                      children: [
                                        HealthChip(
                                          icon: Icons.favorite,
                                          text: '$heartRate bpm',
                                        ),
                                        HealthChip(
                                          icon: Icons.thermostat,
                                          text: '$temperature°C',
                                        ),
                                      ],
                                    ),
                            ],
                          ),
                        ),

                        const SizedBox(width: 8),

                        Container(
                          width: 82,
                          height: 82,
                          decoration: BoxDecoration(
                            color: Colors.white,
                            shape: BoxShape.circle,
                            border: Border.all(
                              color: healthUpdatedToday
                                  ? const Color(0xff46b57a)
                                  : const Color(0xffffb24d),
                              width: 4,
                            ),
                          ),
                          child: Column(
                            mainAxisAlignment: MainAxisAlignment.center,
                            children: [
                              Icon(
                                healthUpdatedToday
                                    ? Icons.check_circle_rounded
                                    : Icons.schedule_rounded,
                                size: 25,
                                color: healthUpdatedToday
                                    ? const Color(0xff46b57a)
                                    : const Color(0xffff9f27),
                              ),

                              const SizedBox(height: 3),

                              Text(
                                healthUpdatedToday
                                    ? 'Đã cập nhật'
                                    : 'Chưa cập nhật',
                                textAlign: TextAlign.center,
                                style: const TextStyle(
                                  fontSize: 9,
                                  fontWeight: FontWeight.bold,
                                ),
                              ),
                            ],
                          ),
                        ),
                      ],
                    ),
                  ),
                ),

                const SizedBox(height: 24),

                // =========================================
                // QUICK ACTION
                // =========================================
                const Text(
                  'Truy cập nhanh',
                  style: TextStyle(fontSize: 18, fontWeight: FontWeight.bold),
                ),

                const SizedBox(height: 10),

                Row(
                  mainAxisAlignment: MainAxisAlignment.spaceBetween,
                  children: [
                    QuickAction(
                      icon: Icons.medication_rounded,
                      title: 'Thuốc',
                      iconBackground: const Color(0xffffe8ec),
                      iconColor: const Color(0xffe85d75),
                      onTap: openMedication,
                    ),

                    QuickAction(
                      icon: Icons.favorite_rounded,
                      title: 'Sức khỏe',
                      iconBackground: const Color(0xffe8f8ee),
                      iconColor: const Color(0xff43a66b),
                      onTap: openHealth,
                    ),

                    QuickAction(
                      icon: Icons.sos_rounded,
                      title: 'Khẩn cấp',
                      iconBackground: const Color(0xffffe5e5),
                      iconColor: const Color(0xffd84444),
                      onTap: () async {
                        await Navigator.push(
                          context,
                          MaterialPageRoute(
                            builder: (_) => const CaregiverScreen(),
                          ),
                        );

                        await loadUnreadNotificationCount();
                      },
                    ),

                    QuickAction(
                      icon: Icons.person_rounded,
                      title: 'Cá nhân',
                      iconBackground: const Color(0xffe9efff),
                      iconColor: const Color(0xff4b6edb),
                      onTap: openProfile,
                    ),
                  ],
                ),

                const SizedBox(height: 24),

                // =========================================
                // TODAY
                // =========================================
                Row(
                  mainAxisAlignment: MainAxisAlignment.spaceBetween,
                  children: [
                    const Text(
                      'Việc hôm nay',
                      style: TextStyle(
                        fontSize: 18,
                        fontWeight: FontWeight.bold,
                      ),
                    ),

                    TextButton(
                      onPressed: openMedication,
                      child: const Text(
                        'Xem tất cả',
                        style: TextStyle(fontSize: 13, color: Colors.black54),
                      ),
                    ),
                  ],
                ),

                const SizedBox(height: 8),

                Container(
                  padding: const EdgeInsets.all(12),
                  decoration: BoxDecoration(
                    color: Colors.white,
                    borderRadius: BorderRadius.circular(26),
                  ),
                  child: Column(
                    children: [
                      loadingMedication
                          ? const Padding(
                              padding: EdgeInsets.all(14),
                              child: CircularProgressIndicator(
                                strokeWidth: 2,
                                color: Color(0xff07856d),
                              ),
                            )
                          : TaskItem(
                              icon: Icons.medication_rounded,
                              iconColor: const Color(0xffe85d75),
                              title: 'Uống Metformin 500mg',
                              subtitle: '$metforminTime • Sau ăn',
                              status: metforminDone ? 'Đã uống' : 'Chưa uống',
                              statusColor: metforminDone
                                  ? const Color(0xff43a66b)
                                  : const Color(0xffff9f27),
                            ),

                      const Divider(height: 22, color: Color(0xffeeeeee)),

                      TaskItem(
                        icon: Icons.favorite_rounded,
                        iconColor: const Color(0xffe45050),
                        title: 'Đo huyết áp',
                        subtitle: healthUpdatedToday
                            ? '$systolic/$diastolic mmHg • $updatedAt'
                            : 'Chưa cập nhật chỉ số hôm nay',
                        status: healthUpdatedToday
                            ? 'Hoàn thành'
                            : 'Cần cập nhật',
                        statusColor: healthUpdatedToday
                            ? const Color(0xff43a66b)
                            : const Color(0xffff9f27),
                      ),
                    ],
                  ),
                ),

                const SizedBox(height: 24),

                // =========================================
                // APPOINTMENT
                // =========================================
                Row(
                  mainAxisAlignment: MainAxisAlignment.spaceBetween,
                  children: [
                    const Text(
                      'Lịch khám sắp tới',
                      style: TextStyle(
                        fontSize: 18,
                        fontWeight: FontWeight.bold,
                      ),
                    ),

                    TextButton(
                      onPressed: openAppointments,
                      child: const Text(
                        'Xem tất cả',
                        style: TextStyle(
                          fontSize: 13,
                          color: Color(0xff07856d),
                        ),
                      ),
                    ),
                  ],
                ),

                const SizedBox(height: 8),

                if (loadingAppointment)
                  Container(
                    width: double.infinity,
                    padding: const EdgeInsets.all(30),
                    decoration: BoxDecoration(
                      color: Colors.white,
                      borderRadius: BorderRadius.circular(24),
                    ),
                    child: const Center(
                      child: CircularProgressIndicator(
                        strokeWidth: 2,
                        color: Color(0xff07856d),
                      ),
                    ),
                  )
                else if (nextAppointment == null)
                  InkWell(
                    onTap: openAppointments,
                    borderRadius: BorderRadius.circular(24),
                    child: Container(
                      width: double.infinity,
                      padding: const EdgeInsets.all(22),
                      decoration: BoxDecoration(
                        color: Colors.white,
                        borderRadius: BorderRadius.circular(24),
                      ),
                      child: const Column(
                        children: [
                          Icon(
                            Icons.calendar_month_outlined,
                            size: 40,
                            color: Colors.black26,
                          ),

                          SizedBox(height: 10),

                          Text(
                            'Chưa có lịch khám sắp tới',
                            style: TextStyle(fontWeight: FontWeight.bold),
                          ),

                          SizedBox(height: 5),

                          Text(
                            'Nhấn để xem lịch khám.',
                            style: TextStyle(
                              fontSize: 12,
                              color: Colors.black54,
                            ),
                          ),
                        ],
                      ),
                    ),
                  )
                else
                  InkWell(
                    onTap: openAppointments,
                    borderRadius: BorderRadius.circular(24),
                    child: Container(
                      padding: const EdgeInsets.all(14),
                      decoration: BoxDecoration(
                        color: Colors.white,
                        borderRadius: BorderRadius.circular(24),
                      ),
                      child: Row(
                        children: [
                          Container(
                            width: 56,
                            height: 56,
                            decoration: const BoxDecoration(
                              color: Color(0xffeef3f1),
                              shape: BoxShape.circle,
                            ),
                            child: const Icon(
                              Icons.medical_services_outlined,
                              color: Color(0xff07856d),
                              size: 28,
                            ),
                          ),

                          const SizedBox(width: 12),

                          Expanded(
                            child: Column(
                              crossAxisAlignment: CrossAxisAlignment.start,
                              children: [
                                Text(
                                  nextAppointment?['doctor'] ?? 'Bác sĩ',
                                  style: const TextStyle(
                                    fontSize: 15,
                                    fontWeight: FontWeight.bold,
                                  ),
                                ),

                                const SizedBox(height: 3),

                                Text(
                                  nextAppointment?['specialty'] ?? '',
                                  style: const TextStyle(
                                    fontSize: 13,
                                    color: Colors.black54,
                                  ),
                                ),

                                const SizedBox(height: 6),

                                Row(
                                  children: [
                                    const Icon(
                                      Icons.calendar_today_outlined,
                                      size: 14,
                                      color: Colors.black54,
                                    ),

                                    const SizedBox(width: 5),

                                    Expanded(
                                      child: Text(
                                        '${nextAppointment?['date'] ?? ''} • ${nextAppointment?['time'] ?? ''}',
                                        style: const TextStyle(fontSize: 12),
                                      ),
                                    ),
                                  ],
                                ),

                                const SizedBox(height: 3),

                                Row(
                                  children: [
                                    const Icon(
                                      Icons.location_on_outlined,
                                      size: 14,
                                      color: Colors.black54,
                                    ),

                                    const SizedBox(width: 5),

                                    Expanded(
                                      child: Text(
                                        nextAppointment?['hospital'] ?? '',
                                        style: const TextStyle(
                                          fontSize: 12,
                                          color: Colors.black54,
                                        ),
                                      ),
                                    ),
                                  ],
                                ),
                              ],
                            ),
                          ),

                          const Icon(
                            Icons.chevron_right_rounded,
                            color: Colors.black38,
                          ),
                        ],
                      ),
                    ),
                  ),

                const SizedBox(height: 24),

                // =========================================
                // EMERGENCY
                // =========================================
                Container(
                  width: double.infinity,
                  padding: const EdgeInsets.all(18),
                  decoration: BoxDecoration(
                    color: const Color(0xffffeeee),
                    borderRadius: BorderRadius.circular(24),
                  ),
                  child: Column(
                    children: [
                      const Row(
                        children: [
                          Icon(
                            Icons.warning_amber_rounded,
                            color: Color(0xffd84444),
                            size: 28,
                          ),

                          SizedBox(width: 10),

                          Expanded(
                            child: Text(
                              'Bạn cần trợ giúp khẩn cấp?',
                              style: TextStyle(
                                fontSize: 17,
                                fontWeight: FontWeight.bold,
                              ),
                            ),
                          ),
                        ],
                      ),

                      const SizedBox(height: 8),

                      const Text(
                        'Mở danh sách người chăm sóc để liên hệ hoặc gửi cảnh báo SOS khi cần.',
                        style: TextStyle(
                          fontSize: 13,
                          color: Colors.black54,
                          height: 1.4,
                        ),
                      ),

                      const SizedBox(height: 14),

                      SizedBox(
                        width: double.infinity,
                        height: 50,
                        child: ElevatedButton.icon(
                          onPressed: () async {
                            await Navigator.push(
                              context,
                              MaterialPageRoute(
                                builder: (_) => const CaregiverScreen(),
                              ),
                            );

                            await loadUnreadNotificationCount();
                          },
                          icon: const Icon(Icons.sos_rounded),
                          label: const Text(
                            'LIÊN HỆ KHẨN CẤP',
                            style: TextStyle(fontWeight: FontWeight.bold),
                          ),
                          style: ElevatedButton.styleFrom(
                            backgroundColor: const Color(0xffd84444),
                            foregroundColor: Colors.white,
                            elevation: 0,
                            shape: RoundedRectangleBorder(
                              borderRadius: BorderRadius.circular(16),
                            ),
                          ),
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

      // =================================================
      // BOTTOM NAVIGATION
      // =================================================
      bottomNavigationBar: Container(
        decoration: const BoxDecoration(
          color: Colors.white,
          boxShadow: [
            BoxShadow(
              color: Color(0x11000000),
              blurRadius: 10,
              offset: Offset(0, -2),
            ),
          ],
        ),
        child: BottomNavigationBar(
          currentIndex: selectedIndex,
          type: BottomNavigationBarType.fixed,
          backgroundColor: Colors.white,
          selectedItemColor: const Color(0xff07856d),
          unselectedItemColor: Colors.black45,
          selectedFontSize: 11,
          unselectedFontSize: 11,

          onTap: (index) async {
            if (index == 0) {
              setState(() {
                selectedIndex = 0;
              });

              await loadAllData();

              return;
            }

            if (index == 1) {
              await openHealth();
              return;
            }

            if (index == 2) {
              await openMedication();
              return;
            }

            if (index == 3) {
              await openNotifications();
              return;
            }

            if (index == 4) {
              await openProfile();
              return;
            }
          },

          items: [
            const BottomNavigationBarItem(
              icon: Icon(Icons.home_outlined),
              activeIcon: Icon(Icons.home_rounded),
              label: 'Trang chủ',
            ),

            const BottomNavigationBarItem(
              icon: Icon(Icons.favorite_border_rounded),
              activeIcon: Icon(Icons.favorite_rounded),
              label: 'Sức khỏe',
            ),

            const BottomNavigationBarItem(
              icon: Icon(Icons.medication_outlined),
              activeIcon: Icon(Icons.medication_rounded),
              label: 'Thuốc',
            ),

            BottomNavigationBarItem(
              icon: Stack(
                clipBehavior: Clip.none,
                children: [
                  const Icon(Icons.notifications_none_rounded),

                  if (unreadNotificationCount > 0)
                    Positioned(
                      right: -8,
                      top: -7,
                      child: Container(
                        constraints: const BoxConstraints(
                          minWidth: 17,
                          minHeight: 17,
                        ),
                        padding: const EdgeInsets.symmetric(horizontal: 4),
                        decoration: BoxDecoration(
                          color: const Color(0xffd84444),
                          borderRadius: BorderRadius.circular(20),
                        ),
                        alignment: Alignment.center,
                        child: Text(
                          unreadNotificationCount > 99
                              ? '99+'
                              : '$unreadNotificationCount',
                          style: const TextStyle(
                            color: Colors.white,
                            fontSize: 8,
                            fontWeight: FontWeight.bold,
                          ),
                        ),
                      ),
                    ),
                ],
              ),
              activeIcon: const Icon(Icons.notifications_rounded),
              label: 'Thông báo',
            ),

            const BottomNavigationBarItem(
              icon: Icon(Icons.person_outline_rounded),
              activeIcon: Icon(Icons.person_rounded),
              label: 'Cá nhân',
            ),
          ],
        ),
      ),
    );
  }
}

// =========================================================
// HEALTH CHIP
// =========================================================

class HealthChip extends StatelessWidget {
  final IconData icon;
  final String text;

  const HealthChip({super.key, required this.icon, required this.text});

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 5),
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(20),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          Icon(icon, size: 14, color: const Color(0xff07856d)),

          const SizedBox(width: 4),

          Text(
            text,
            style: const TextStyle(fontSize: 11, fontWeight: FontWeight.w500),
          ),
        ],
      ),
    );
  }
}

// =========================================================
// QUICK ACTION
// =========================================================

class QuickAction extends StatelessWidget {
  final IconData icon;
  final String title;
  final Color iconBackground;
  final Color iconColor;
  final VoidCallback onTap;

  const QuickAction({
    super.key,
    required this.icon,
    required this.title,
    required this.iconBackground,
    required this.iconColor,
    required this.onTap,
  });

  @override
  Widget build(BuildContext context) {
    return InkWell(
      onTap: onTap,
      borderRadius: BorderRadius.circular(30),
      child: Container(
        width: 78,
        height: 116,
        decoration: BoxDecoration(
          color: Colors.white,
          borderRadius: BorderRadius.circular(30),
        ),
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            Container(
              width: 46,
              height: 46,
              decoration: BoxDecoration(
                color: iconBackground,
                borderRadius: BorderRadius.circular(17),
              ),
              child: Icon(icon, color: iconColor, size: 27),
            ),

            const SizedBox(height: 10),

            Text(
              title,
              textAlign: TextAlign.center,
              style: const TextStyle(fontSize: 13, fontWeight: FontWeight.w600),
            ),
          ],
        ),
      ),
    );
  }
}

// =========================================================
// TASK ITEM
// =========================================================

class TaskItem extends StatelessWidget {
  final IconData icon;
  final Color iconColor;
  final String title;
  final String subtitle;
  final String status;
  final Color statusColor;

  const TaskItem({
    super.key,
    required this.icon,
    required this.iconColor,
    required this.title,
    required this.subtitle,
    required this.status,
    required this.statusColor,
  });

  @override
  Widget build(BuildContext context) {
    return Row(
      children: [
        Container(
          width: 48,
          height: 48,
          decoration: const BoxDecoration(
            color: Color(0xfff4f4f4),
            shape: BoxShape.circle,
          ),
          child: Icon(icon, color: iconColor),
        ),

        const SizedBox(width: 11),

        Expanded(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(
                title,
                style: const TextStyle(
                  fontSize: 14,
                  fontWeight: FontWeight.bold,
                ),
              ),

              const SizedBox(height: 3),

              Text(
                subtitle,
                style: const TextStyle(fontSize: 12, color: Colors.black54),
              ),
            ],
          ),
        ),

        const SizedBox(width: 8),

        Container(
          padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
          decoration: BoxDecoration(
            color: statusColor.withValues(alpha: 0.12),
            borderRadius: BorderRadius.circular(20),
          ),
          child: Text(
            status,
            style: TextStyle(
              color: statusColor,
              fontSize: 10,
              fontWeight: FontWeight.bold,
            ),
          ),
        ),
      ],
    );
  }
}
