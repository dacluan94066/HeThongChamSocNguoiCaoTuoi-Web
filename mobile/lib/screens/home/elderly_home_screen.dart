import 'dart:async';

import 'package:flutter/material.dart';
import 'package:url_launcher/url_launcher.dart';
import '../../theme/care_senior_theme.dart';
import '../../widgets/care_senior_ui.dart';

import '../../services/api_client.dart';
import '../../services/appointment_service.dart';
import '../../services/caregiver_service.dart';
import '../../services/elderly_service.dart';
import '../../services/health_metric_service.dart';
import '../../services/medication_schedule_service.dart';
import '../../services/mobile_realtime_service.dart';
import '../alerts/alerts_hub_screen.dart';
import '../alerts/sos_screen.dart';
import '../appointments/appointment_screen.dart';
import '../health/health_detail_screen.dart';
import '../medication/medication_screen.dart';
import '../profile/profile_screen.dart';

class HomeScreen extends StatefulWidget {
  const HomeScreen({super.key});

  @override
  State<HomeScreen> createState() => _HomeScreenState();
}

class _HomeScreenState extends State<HomeScreen> {
  static const teal = CareSeniorColors.deepGreen;
  static const red = CareSeniorColors.danger;
  int _tab = 0;
  Map<String, dynamic> _profile = {};
  List<Map<String, dynamic>> _metrics = const [];
  List<Map<String, dynamic>> _medications = const [];
  List<Map<String, dynamic>> _caregivers = const [];
  Map<String, dynamic>? _nextAppointment;
  bool _appointmentLoading = true;
  String? _appointmentError;
  bool _loading = true;
  String? _error;

  @override
  void initState() {
    super.initState();
    MobileRealtimeService.instance.medicationRevision.addListener(
      _realtimeRefresh,
    );
    MobileRealtimeService.instance.notificationRevision.addListener(
      _realtimeRefresh,
    );
    MobileRealtimeService.instance.appointmentRevision.addListener(
      _appointmentRefresh,
    );
    unawaited(_load());
    unawaited(_loadAppointment());
  }

  @override
  void dispose() {
    MobileRealtimeService.instance.medicationRevision.removeListener(
      _realtimeRefresh,
    );
    MobileRealtimeService.instance.notificationRevision.removeListener(
      _realtimeRefresh,
    );
    MobileRealtimeService.instance.appointmentRevision.removeListener(
      _appointmentRefresh,
    );
    super.dispose();
  }

  void _realtimeRefresh() => unawaited(_load(refresh: true));
  void _appointmentRefresh() => unawaited(_loadAppointment(refresh: true));

  Future<void> _loadAppointment({bool refresh = false}) async {
    final version = ApiClient.sessionVersion;
    try {
      // The full list reconciles local appointment reminders, including cancellations.
      await AppointmentService.instance.getAppointments(refresh: refresh);
      final upcoming = await AppointmentService.instance
          .getUpcomingAppointments(refresh: refresh);
      if (!mounted || version != ApiClient.sessionVersion) return;
      setState(() {
        _nextAppointment = upcoming.isEmpty ? null : upcoming.first;
        _appointmentLoading = false;
        _appointmentError = null;
      });
    } catch (error) {
      if (!mounted || version != ApiClient.sessionVersion) return;
      setState(() {
        _appointmentLoading = false;
        _appointmentError = error is ApiException
            ? error.message
            : 'Không thể tải lịch khám.';
      });
    }
  }

  Future<void> _load({bool refresh = false}) async {
    final version = ApiClient.sessionVersion;
    try {
      final results = await Future.wait<dynamic>([
        ElderlyService.instance.getMyProfile(refresh: refresh),
        HealthMetricService.instance.getMyHealthMetrics(refresh: refresh),
        MedicationScheduleService.instance.getTodaySchedule(refresh: refresh),
        CaregiverService.instance.getMyCaregivers(refresh: refresh),
      ]);
      if (!mounted || version != ApiClient.sessionVersion) return;
      setState(() {
        _profile = results[0] as Map<String, dynamic>;
        _metrics = results[1] as List<Map<String, dynamic>>;
        _medications = results[2] as List<Map<String, dynamic>>;
        _caregivers = results[3] as List<Map<String, dynamic>>;
        _loading = false;
        _error = null;
      });
      unawaited(
        MedicationScheduleService.instance.syncUpcomingReminders().catchError(
          (Object _) {},
        ),
      );
    } catch (error) {
      if (!mounted || version != ApiClient.sessionVersion) return;
      setState(() {
        _loading = false;
        _error = error is ApiException
            ? error.message
            : 'Không thể tải dữ liệu Trang chủ.';
      });
    }
  }

  Map<String, dynamic>? _latest(String name) {
    for (final metric in _metrics) {
      if (metric['tenChiSo'] == name) return metric;
    }
    return null;
  }

  bool get _needsAttention {
    final cutoff = DateTime.now().subtract(const Duration(hours: 24));
    final abnormal = _metrics.any(
      (item) =>
          item['laBatThuong'] == true &&
          (DateTime.tryParse(
                item['thoiGianDo']?.toString() ?? '',
              )?.isAfter(cutoff) ??
              false),
    );
    final missed = _medications.any(
      (item) => item['trangThai'] == 'BoLo' || item['trangThai'] == 'TuChoi',
    );
    return abnormal || missed;
  }

  String _number(Object? value) {
    final n = double.tryParse(value?.toString() ?? '');
    if (n == null) return 'Chưa có';
    return n == n.roundToDouble() ? n.toInt().toString() : n.toStringAsFixed(1);
  }

  String _time(Object? raw) {
    final date = DateTime.tryParse(raw?.toString() ?? '');
    if (date == null) return 'Chưa cập nhật';
    return '${date.hour.toString().padLeft(2, '0')}:${date.minute.toString().padLeft(2, '0')} · '
        '${date.day.toString().padLeft(2, '0')}/${date.month.toString().padLeft(2, '0')}';
  }

  Future<void> _openHealth() async {
    await Navigator.push(
      context,
      MaterialPageRoute(builder: (_) => const HealthDetailScreen()),
    );
    if (mounted) await _load(refresh: true);
  }

  Future<void> _openAppointments() async {
    await Navigator.push(
      context,
      MaterialPageRoute(builder: (_) => const AppointmentScreen()),
    );
    if (mounted) await _loadAppointment(refresh: true);
  }

  Future<void> _confirmNext(Map<String, dynamic> item) async {
    final id = int.tryParse(item['id']?.toString() ?? '');
    if (id == null) return;
    try {
      await MedicationScheduleService.instance.confirmMedication(id, 'DaUong');
      await _load(refresh: true);
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text('Đã xác nhận uống thuốc.')),
        );
      }
    } catch (error) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text(
              error is ApiException
                  ? error.message
                  : 'Không thể xác nhận liều thuốc.',
            ),
          ),
        );
      }
    }
  }

  Future<void> _call(Object? raw) async {
    final phone = (raw?.toString() ?? '').replaceAll(RegExp(r'[^0-9+]'), '');
    if (!RegExp(r'^\+?[0-9]{3,15}$').hasMatch(phone)) return;
    await launchUrl(
      Uri(scheme: 'tel', path: phone),
      mode: LaunchMode.externalApplication,
    );
  }

  Widget _panel(Widget child, {Color color = Colors.white}) =>
      AppCard(color: color, child: child);

  Widget _metricCard(String name, IconData icon) {
    final metric = _latest(name);
    final abnormal = metric?['laBatThuong'] == true;
    final value = metric == null
        ? 'Chưa có'
        : '${_number(metric['giaTri'])}${metric['giaTriPhu'] == null ? '' : '/${_number(metric['giaTriPhu'])}'}';
    return InkWell(
      onTap: _openHealth,
      borderRadius: BorderRadius.circular(18),
      child: _panel(
        Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            CircleAvatar(
              backgroundColor: CareSeniorColors.mint,
              child: Icon(icon, color: teal, size: 25),
            ),
            const SizedBox(height: 10),
            Text(
              name,
              style: const TextStyle(fontSize: 16, fontWeight: FontWeight.w700),
            ),
            const SizedBox(height: 5),
            Text(
              value,
              style: const TextStyle(
                fontSize: 23,
                fontWeight: FontWeight.bold,
                color: teal,
              ),
            ),
            if (metric != null &&
                (metric['donVi']?.toString().isNotEmpty ?? false))
              Text(
                metric['donVi'].toString(),
                style: const TextStyle(fontSize: 16),
              ),
            const SizedBox(height: 7),
            AppStatusChip(
              label: metric == null
                  ? 'Chưa có dữ liệu'
                  : abnormal
                  ? 'Bất thường'
                  : 'Bình thường',
              color: abnormal ? red : teal,
              background: abnormal
                  ? CareSeniorColors.dangerSurface
                  : CareSeniorColors.mint,
            ),
            const SizedBox(height: 6),
            Text(
              metric == null ? 'Chưa cập nhật' : _time(metric['thoiGianDo']),
              style: const TextStyle(
                fontSize: 14,
                color: CareSeniorColors.secondaryText,
              ),
            ),
          ],
        ),
      ),
    );
  }

  Widget _dashboard() {
    final now = DateTime.now();
    final greeting = now.hour < 11
        ? 'Chào buổi sáng'
        : now.hour < 14
        ? 'Chào buổi trưa'
        : now.hour < 18
        ? 'Chào buổi chiều'
        : 'Chào buổi tối';
    final taken = _medications
        .where((item) => item['trangThai'] == 'DaUong')
        .length;
    final total = _medications.length;
    final upcoming =
        _medications.where((item) => item['trangThai'] == 'ChuaDenGio').toList()
          ..sort(
            (a, b) => (a['thoiGianDuKien']?.toString() ?? '').compareTo(
              b['thoiGianDuKien']?.toString() ?? '',
            ),
          );
    final next = upcoming.isEmpty ? null : upcoming.first;
    return RefreshIndicator(
      onRefresh: () async {
        await Future.wait([
          _load(refresh: true),
          _loadAppointment(refresh: true),
        ]);
      },
      child: ListView(
        padding: const EdgeInsets.fromLTRB(18, 16, 18, 28),
        children: [
          if (_error != null)
            _panel(
              Column(
                children: [
                  Text(
                    _error!,
                    style: const TextStyle(fontSize: 16, color: red),
                  ),
                  TextButton(
                    onPressed: () => _load(refresh: true),
                    child: const Text('Thử lại'),
                  ),
                ],
              ),
            ),
          _panel(
            Row(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                CircleAvatar(
                  radius: 27,
                  backgroundColor: Colors.white,
                  child: Text(
                    (ElderlyService.text(_profile, 'hoTen').trim().isEmpty
                            ? '?'
                            : ElderlyService.text(
                                _profile,
                                'hoTen',
                              ).trim().substring(0, 1))
                        .toUpperCase(),
                    style: const TextStyle(
                      fontSize: 23,
                      fontWeight: FontWeight.w800,
                      color: teal,
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
                        style: const TextStyle(
                          fontSize: 16,
                          color: CareSeniorColors.secondaryText,
                        ),
                      ),
                      Text(
                        ElderlyService.text(_profile, 'hoTen'),
                        style: const TextStyle(
                          fontSize: 23,
                          fontWeight: FontWeight.w800,
                          color: CareSeniorColors.text,
                        ),
                      ),
                      Text(
                        ElderlyService.displayAge(_profile),
                        style: const TextStyle(fontSize: 16),
                      ),
                      const SizedBox(height: 9),
                      AppStatusChip(
                        label: _needsAttention ? 'Cần chú ý' : 'Ổn định',
                        color: _needsAttention ? red : teal,
                        background: _needsAttention
                            ? CareSeniorColors.dangerSurface
                            : Colors.white,
                      ),
                    ],
                  ),
                ),
              ],
            ),
            color: CareSeniorColors.mint,
          ),
          const SizedBox(height: 16),
          InkWell(
            onTap: () => setState(() => _tab = 3),
            borderRadius: BorderRadius.circular(20),
            child: _panel(
              const Row(
                children: [
                  Icon(Icons.sos, size: 42, color: red),
                  SizedBox(width: 14),
                  Expanded(
                    child: Text(
                      'Cần hỗ trợ khẩn cấp?\nMở màn SOS',
                      style: TextStyle(
                        fontSize: 18,
                        fontWeight: FontWeight.bold,
                        color: red,
                      ),
                    ),
                  ),
                  Icon(Icons.arrow_forward_ios, color: red),
                ],
              ),
              color: CareSeniorColors.dangerSurface,
            ),
          ),
          const SizedBox(height: 20),
          const AppSectionHeader(title: 'Chỉ số sức khỏe mới nhất'),
          const SizedBox(height: 10),
          LayoutBuilder(
            builder: (context, constraints) {
              final metricCards = [
                _metricCard('Huyết áp', Icons.monitor_heart_outlined),
                _metricCard('Nhịp tim', Icons.favorite_outline),
                _metricCard('Đường huyết', Icons.water_drop_outlined),
                _metricCard('SpO2', Icons.air),
              ];
              final largeText =
                  MediaQuery.textScalerOf(context).scale(1) > 1.25;
              if (largeText || constraints.maxWidth < 310) {
                return Column(
                  children: [
                    for (final card in metricCards) ...[
                      card,
                      const SizedBox(height: 10),
                    ],
                  ],
                );
              }
              return GridView.count(
                crossAxisCount: 2,
                shrinkWrap: true,
                physics: const NeverScrollableScrollPhysics(),
                mainAxisSpacing: 10,
                crossAxisSpacing: 10,
                mainAxisExtent: 265,
                children: metricCards,
              );
            },
          ),
          const SizedBox(height: 12),
          SizedBox(
            height: 56,
            child: FilledButton.icon(
              onPressed: _openHealth,
              icon: const Icon(Icons.add_circle_outline),
              label: const Text(
                'Đo & Cập nhật chỉ số mới',
                style: TextStyle(fontSize: 17),
              ),
            ),
          ),
          const SizedBox(height: 20),
          _panel(
            Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                const Text(
                  'Lịch uống thuốc hôm nay',
                  style: TextStyle(fontSize: 20, fontWeight: FontWeight.bold),
                ),
                const SizedBox(height: 6),
                Text(
                  'Đã uống $taken/$total cữ',
                  style: const TextStyle(fontSize: 17),
                ),
                const SizedBox(height: 8),
                LinearProgressIndicator(
                  value: total == 0 ? 0 : taken / total,
                  minHeight: 10,
                  color: CareSeniorColors.primary,
                  backgroundColor: CareSeniorColors.border,
                ),
                const SizedBox(height: 10),
                Text(
                  next == null
                      ? 'Không có cữ thuốc tiếp theo hôm nay.'
                      : '${_time(next['thoiGianDuKien'])} · ${next['tenThuoc'] ?? 'Thuốc'} · ${next['lieuDung'] ?? ''}',
                  style: const TextStyle(fontSize: 16),
                ),
                if (next != null) ...[
                  const SizedBox(height: 12),
                  FilledButton(
                    onPressed: () => _confirmNext(next),
                    child: const Text(
                      'Tôi đã uống cữ này',
                      style: TextStyle(fontSize: 17),
                    ),
                  ),
                ],
              ],
            ),
          ),
          const SizedBox(height: 20),
          _panel(
            Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                const Text(
                  'Lịch khám sắp tới',
                  style: TextStyle(fontSize: 20, fontWeight: FontWeight.bold),
                ),
                const SizedBox(height: 8),
                if (_appointmentLoading) const LinearProgressIndicator(),
                if (_appointmentError != null)
                  Text(
                    _appointmentError!,
                    style: const TextStyle(fontSize: 16, color: red),
                  )
                else if (!_appointmentLoading && _nextAppointment == null)
                  const Text(
                    'Chưa có lịch khám sắp tới.',
                    style: TextStyle(fontSize: 16),
                  )
                else if (_nextAppointment != null) ...[
                  Text(
                    _time(_nextAppointment!['thoiGianKham']),
                    style: const TextStyle(
                      fontSize: 19,
                      fontWeight: FontWeight.bold,
                      color: teal,
                    ),
                  ),
                  Text(
                    'Nơi khám: ${_nextAppointment!['tenBenhVien'] ?? _nextAppointment!['noiKham'] ?? 'Chưa cập nhật'}',
                    style: const TextStyle(fontSize: 16),
                  ),
                  if ((_nextAppointment!['lyDoKham']?.toString() ?? '')
                      .isNotEmpty)
                    Text(
                      'Lý do: ${_nextAppointment!['lyDoKham']}',
                      style: const TextStyle(fontSize: 16),
                    ),
                ],
                const SizedBox(height: 12),
                OutlinedButton.icon(
                  onPressed: _openAppointments,
                  icon: const Icon(Icons.calendar_month_outlined),
                  label: const Text(
                    'Xem tất cả lịch khám',
                    style: TextStyle(fontSize: 17),
                  ),
                ),
              ],
            ),
          ),
          const SizedBox(height: 20),
          _panel(
            Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                const Text(
                  'Người chăm sóc của bạn',
                  style: TextStyle(fontSize: 20, fontWeight: FontWeight.bold),
                ),
                const SizedBox(height: 8),
                if (_caregivers.isEmpty)
                  const Text(
                    'Chưa có người chăm sóc được phân công.',
                    style: TextStyle(fontSize: 16),
                  ),
                ..._caregivers.map(
                  (person) => Padding(
                    padding: const EdgeInsets.only(bottom: 8),
                    child: OutlinedButton.icon(
                      onPressed: () => _call(person['soDienThoai']),
                      icon: CircleAvatar(
                        backgroundColor: const Color(0xffe8f5f4),
                        child: Text(
                          (person['hoTen']?.toString().trim() ?? '?')
                              .substring(0, 1)
                              .toUpperCase(),
                        ),
                      ),
                      label: Text(
                        'Gọi ${person['hoTen'] ?? 'người chăm sóc'}',
                        style: const TextStyle(fontSize: 16),
                      ),
                    ),
                  ),
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }

  @override
  Widget build(BuildContext context) => Scaffold(
    backgroundColor: CareSeniorColors.background,
    body: _tab == 0
        ? _loading
              ? const Center(child: CircularProgressIndicator())
              : _dashboard()
        : switch (_tab) {
            1 => const MedicationScreen(),
            2 => const AppointmentScreen(),
            3 => const SosScreen(),
            4 => const AlertsHubScreen(),
            _ => const ProfileScreen(),
          },
    bottomNavigationBar: AppBottomNavigation(
      selectedIndex: _tab,
      onSelected: (index) => setState(() => _tab = index),
    ),
  );
}
