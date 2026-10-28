import '../../utils/metric_assessment.dart';
import 'dart:async';

import 'package:flutter/material.dart';
import 'package:url_launcher/url_launcher.dart';
import 'home_dashboard_ui.dart';
import '../../theme/care_senior_theme.dart';
import '../../widgets/care_senior_ui.dart';
import '../../widgets/draggable_assistant_fab.dart';

import '../../services/api_client.dart';
import '../../services/appointment_service.dart';
import '../../services/caregiver_service.dart';
import '../../services/elderly_service.dart';
import '../../services/health_metric_service.dart';
import '../../services/medication_schedule_service.dart';
import '../../services/mobile_realtime_service.dart';
import '../alerts/alerts_hub_screen.dart';
import '../alerts/sos_screen.dart';
import '../assistant/care_assistant_screen.dart';
import '../appointments/appointment_screen.dart';
import '../health/health_detail_screen.dart';
import '../schedule/schedule_screen.dart';
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
  int _scheduleTab = 0;
  bool _scheduleVisited = false;

  void _selectTab(int index, {int? scheduleTab}) => setState(() {
    _tab = index;
    if (index == 1) _scheduleVisited = true;
    if (scheduleTab != null) _scheduleTab = scheduleTab;
  });
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
      // Home uses a short label; the API catalog uses the full temperature name.
      if (metric['tenChiSo'] == name ||
          (name == 'Nhiệt độ' && metric['tenChiSo'] == 'Nhiệt độ cơ thể')) {
        return metric;
      }
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

  void _openAssistant() => Navigator.push(
    context,
    MaterialPageRoute(builder: (_) => const CareAssistantScreen()),
  );

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

  Widget _metricCard(String name, IconData icon, {required double width}) {
    final metric = _latest(name);
    final abnormal = MetricAssessment.abnormal(metric);
    final value = metric == null
        ? 'Chưa có dữ liệu'
        : '${_number(metric['giaTri'])}${metric['giaTriPhu'] == null ? '' : '/${_number(metric['giaTriPhu'])}'}';
    return HomeMetricTile(
      width: width,
      name: name,
      value: value,
      icon: icon,
      unit: metric?['donVi']?.toString() ?? '',
      measuredAt: metric == null
          ? 'Chưa cập nhật'
          : _time(metric['thoiGianDo']),
      status: metric == null
          ? 'Chưa có dữ liệu'
          : MetricAssessment.label(metric),
      abnormal: abnormal,
      hasData: metric != null,
      assessed: MetricAssessment.assessed(metric),
      onTap: _openHealth,
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
      child: SafeArea(
        bottom: false,
        child: Align(
          alignment: Alignment.topCenter,
          child: ConstrainedBox(
            constraints: const BoxConstraints(maxWidth: 760),
            child: ListView(
              // Leave scroll space so the floating shortcut need not cover
              // the last card's text or actions.
              padding: const EdgeInsets.only(bottom: 92),
              children: [
                if (_error != null)
                  Padding(
                    padding: const EdgeInsets.all(20),
                    child: _panel(
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
                  ),
                HomeWelcomeHeader(
                  name: ElderlyService.text(_profile, 'hoTen'),
                  initial:
                      (ElderlyService.text(_profile, 'hoTen').trim().isEmpty
                              ? '?'
                              : ElderlyService.text(
                                  _profile,
                                  'hoTen',
                                ).trim().substring(0, 1))
                          .toUpperCase(),
                  greeting: greeting,
                  age: ElderlyService.displayAge(_profile),
                  needsAttention: _needsAttention,
                  onAlerts: () => _selectTab(3),
                  quickActions: HomeQuickActions(
                    onProfile: () => _selectTab(4),
                    onHealth: _openHealth,
                    onMedication: () => _selectTab(1, scheduleTab: 0),
                    onSos: () => _selectTab(2),
                  ),
                ),
                Padding(
                  padding: const EdgeInsets.fromLTRB(20, 28, 20, 0),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.stretch,
                    children: [
                      const AppSectionHeader(title: 'Chỉ số sức khỏe mới nhất'),
                      const SizedBox(height: 4),
                      const Text(
                        'Theo dõi tình trạng sức khỏe của bạn',
                        style: TextStyle(fontSize: 16, color: HomeVisuals.sub),
                      ),
                      const SizedBox(height: 16),
                      LayoutBuilder(
                        builder: (context, constraints) {
                          final largeText =
                              MediaQuery.textScalerOf(context).scale(1) > 1.25;
                          final singleColumn =
                              largeText || constraints.maxWidth < 310;
                          final cardWidth = singleColumn
                              ? constraints.maxWidth
                              : (constraints.maxWidth - 12) / 2;
                          final metricCards = [
                            _metricCard(
                              'Huyết áp',
                              Icons.speed_outlined,
                              width: cardWidth,
                            ),
                            _metricCard(
                              'Đường huyết',
                              Icons.water_drop_outlined,
                              width: cardWidth,
                            ),
                            _metricCard(
                              'Nhịp tim',
                              Icons.monitor_heart_outlined,
                              width: cardWidth,
                            ),
                            _metricCard('SpO2', Icons.air, width: cardWidth),
                            _metricCard(
                              'Nhiệt độ',
                              Icons.thermostat_outlined,
                              width: cardWidth,
                            ),
                            _metricCard(
                              'Cân nặng',
                              Icons.monitor_weight_outlined,
                              width: cardWidth,
                            ),
                          ];
                          if (singleColumn) {
                            return Column(
                              children: [
                                for (final card in metricCards) ...[
                                  card,
                                  const SizedBox(height: 12),
                                ],
                              ],
                            );
                          }
                          return Column(
                            children: [
                              for (
                                var index = 0;
                                index < metricCards.length;
                                index += 2
                              ) ...[
                                IntrinsicHeight(
                                  child: Row(
                                    crossAxisAlignment:
                                        CrossAxisAlignment.stretch,
                                    children: [
                                      Expanded(child: metricCards[index]),
                                      const SizedBox(width: 12),
                                      Expanded(child: metricCards[index + 1]),
                                    ],
                                  ),
                                ),
                                if (index + 2 < metricCards.length)
                                  const SizedBox(height: 12),
                              ],
                            ],
                          );
                        },
                      ),
                      const SizedBox(height: 16),
                      FilledButton.icon(
                        onPressed: _openHealth,
                        icon: const Icon(Icons.add_circle_outline),
                        label: const Padding(
                          padding: EdgeInsets.symmetric(vertical: 14),
                          child: Text(
                            'Đo & Cập nhật chỉ số mới',
                            textAlign: TextAlign.center,
                            style: TextStyle(fontSize: 17),
                          ),
                        ),
                      ),
                      const SizedBox(height: 28),
                      const AppSectionHeader(title: 'Lịch uống thuốc hôm nay'),
                      const SizedBox(height: 16),
                      _panel(
                        Column(
                          crossAxisAlignment: CrossAxisAlignment.stretch,
                          children: [
                            Wrap(
                              alignment: WrapAlignment.spaceBetween,
                              spacing: 12,
                              runSpacing: 4,
                              children: [
                                Text(
                                  'Đã uống $taken/$total cữ',
                                  style: const TextStyle(
                                    fontSize: 17,
                                    fontWeight: FontWeight.w700,
                                  ),
                                ),
                                Text(
                                  '${total == 0 ? 0 : (taken / total * 100).round()}%',
                                  style: const TextStyle(
                                    fontSize: 17,
                                    color: HomeVisuals.brand,
                                    fontWeight: FontWeight.w800,
                                  ),
                                ),
                              ],
                            ),
                            const SizedBox(height: 12),
                            ClipRRect(
                              borderRadius: BorderRadius.circular(99),
                              child: LinearProgressIndicator(
                                value: total == 0 ? 0 : taken / total,
                                minHeight: 10,
                                color: HomeVisuals.brand,
                                backgroundColor: CareSeniorColors.mint,
                              ),
                            ),
                            if (_medications.isEmpty)
                              const Padding(
                                padding: EdgeInsets.symmetric(vertical: 18),
                                child: Text(
                                  'Chưa có dữ liệu lịch uống thuốc hôm nay.',
                                  style: TextStyle(fontSize: 16),
                                ),
                              )
                            else
                              for (final item in _medications.take(3)) ...[
                                HomeMedicationPreviewRow(
                                  name:
                                      item['tenThuoc']?.toString() ??
                                      'Chưa có dữ liệu',
                                  dosage: item['lieuDung']?.toString() ?? '',
                                  time: _time(
                                    item['thoiGianDuKien'],
                                  ).split(' · ').first,
                                  status: item['trangThai']?.toString() ?? '',
                                ),
                                const Divider(height: 1),
                              ],
                            const SizedBox(height: 12),
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
                            const SizedBox(height: 12),
                            OutlinedButton.icon(
                              onPressed: () => _selectTab(1, scheduleTab: 0),
                              icon: const Icon(Icons.arrow_forward_rounded),
                              label: const Text(
                                'Xem lịch thuốc',
                                style: TextStyle(fontSize: 17),
                              ),
                            ),
                          ],
                        ),
                      ),
                      const SizedBox(height: 24),
                      HomeSosEntry(onTap: () => _selectTab(2)),
                      const SizedBox(height: 24),
                      _panel(
                        Column(
                          crossAxisAlignment: CrossAxisAlignment.stretch,
                          children: [
                            const Text(
                              'Lịch khám sắp tới',
                              style: TextStyle(
                                fontSize: 20,
                                fontWeight: FontWeight.bold,
                              ),
                            ),
                            const SizedBox(height: 8),
                            if (_appointmentLoading)
                              const LinearProgressIndicator(),
                            if (_appointmentError != null)
                              Text(
                                _appointmentError!,
                                style: const TextStyle(
                                  fontSize: 16,
                                  color: red,
                                ),
                              )
                            else if (!_appointmentLoading &&
                                _nextAppointment == null)
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
                              if ((_nextAppointment!['lyDoKham']?.toString() ??
                                      '')
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

                      const SizedBox(height: 24),
                      _panel(
                        Column(
                          crossAxisAlignment: CrossAxisAlignment.stretch,
                          children: [
                            const Text(
                              'Người chăm sóc của bạn',
                              style: TextStyle(
                                fontSize: 20,
                                fontWeight: FontWeight.bold,
                              ),
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
                                      (person['hoTen']?.toString().trim() ??
                                              '?')
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
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }

  @override
  Widget build(BuildContext context) => Scaffold(
    backgroundColor: CareSeniorColors.background,
    body: DraggableAssistantFabHost(
      compact: _tab == 0,
      visible: _tab <= 1,
      onPressed: _openAssistant,
      child: Stack(
        fit: StackFit.expand,
        children: [
          Offstage(
            offstage: _tab != 1,
            child: TickerMode(
              enabled: _tab == 1,
              child: _scheduleVisited
                  ? ScheduleScreen(
                      selectedIndex: _scheduleTab,
                      onSelected: (index) =>
                          setState(() => _scheduleTab = index),
                    )
                  : const SizedBox.shrink(),
            ),
          ),
          if (_tab != 1)
            _tab == 0
                ? _loading
                      ? const Center(child: CircularProgressIndicator())
                      : _dashboard()
                : switch (_tab) {
                    2 => const SosScreen(),
                    3 => const AlertsHubScreen(),
                    _ => const ProfileScreen(),
                  },
        ],
      ),
    ),
    bottomNavigationBar: AppBottomNavigation(
      selectedIndex: _tab,
      onSelected: _selectTab,
    ),
  );
}
