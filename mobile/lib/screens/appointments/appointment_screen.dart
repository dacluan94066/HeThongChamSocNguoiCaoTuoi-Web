import 'dart:async';

import 'package:flutter/material.dart';
import '../../theme/care_senior_theme.dart';
import '../../widgets/care_senior_ui.dart';

import '../../services/api_client.dart';
import '../../widgets/foreground_refresh.dart';
import '../../services/appointment_service.dart';
import '../../widgets/appointment_reminder_banner.dart';
import '../../services/mobile_realtime_service.dart';
import 'appointment_dashboard_ui.dart';

class AppointmentScreen extends StatefulWidget {
  const AppointmentScreen({super.key});

  @override
  State<AppointmentScreen> createState() => _AppointmentScreenState();
}

class _AppointmentScreenState extends State<AppointmentScreen>
    with ForegroundRefresh<AppointmentScreen> {
  @override
  Future<void> refreshForeground() =>
      _loadAppointments(refresh: true, silent: true);
  int _loadSequence = 0;
  static const List<MapEntry<String?, String>> _filters = [
    MapEntry(null, 'Tất cả'),
    MapEntry('ChuaDen', 'Chưa đến'),
    MapEntry('DaKham', 'Đã khám'),
    MapEntry('Huy', 'Hủy'),
  ];

  List<Map<String, dynamic>> _allAppointments = [];
  String? _selectedStatus;
  String? _error;
  bool _loading = true;

  @override
  void initState() {
    super.initState();
    MobileRealtimeService.instance.appointmentRevision.addListener(
      _onRealtimeAppointment,
    );
    _loadAppointments(refresh: true);
  }

  void _onRealtimeAppointment() {
    if (!mounted) return;
    unawaited(_loadAppointments(silent: true));
  }

  @override
  void dispose() {
    MobileRealtimeService.instance.appointmentRevision.removeListener(
      _onRealtimeAppointment,
    );
    super.dispose();
  }

  Future<void> _loadAppointments({
    bool refresh = false,
    bool silent = false,
  }) async {
    final sequence = ++_loadSequence;
    final version = ApiClient.sessionVersion;
    if (mounted && !silent) {
      setState(() {
        _loading = true;
        _error = null;
      });
    }
    try {
      final data = await AppointmentService.instance.getAppointments(
        refresh: refresh,
      );
      if (!mounted ||
          version != ApiClient.sessionVersion ||
          sequence != _loadSequence) {
        return;
      }
      setState(() {
        _allAppointments = data;
        _loading = false;
      });
    } on ApiException catch (error) {
      if (!mounted ||
          version != ApiClient.sessionVersion ||
          sequence != _loadSequence) {
        return;
      }
      if (silent && _allAppointments.isNotEmpty) return;
      setState(() {
        _allAppointments = [];
        _error = error.message;
        _loading = false;
      });
    } catch (_) {
      if (!mounted ||
          version != ApiClient.sessionVersion ||
          sequence != _loadSequence) {
        return;
      }
      if (silent && _allAppointments.isNotEmpty) return;
      setState(() {
        _allAppointments = [];
        _error = 'Không thể tải lịch khám. Vui lòng thử lại.';
        _loading = false;
      });
    }
  }

  void _selectStatus(String? status) {
    if (_selectedStatus == status) return;
    setState(() => _selectedStatus = status);
  }

  List<Map<String, dynamic>> get _visibleAppointments =>
      AppointmentService.filterByStatus(_allAppointments, _selectedStatus);

  String get _emptyTitle => switch (_selectedStatus) {
    'ChuaDen' => 'Chưa có lịch khám sắp tới',
    'DaKham' => 'Chưa có lịch đã khám',
    'Huy' => 'Chưa có lịch đã hủy',
    _ => 'Chưa có lịch khám',
  };

  String get _emptyMessage => switch (_selectedStatus) {
    'DaKham' =>
      'Lịch chỉ xuất hiện ở đây sau khi người chăm sóc ghi kết quả khám trên Web.',
    'ChuaDen' => 'Tài khoản này hiện chưa có lịch khám nào đang chờ.',
    'Huy' => 'Tài khoản này hiện chưa có lịch khám nào bị hủy.',
    _ => 'Lịch khám do người chăm sóc tạo trên Web sẽ xuất hiện tại đây.',
  };

  void _showAppointmentDetail(Map<String, dynamic> appointment) {
    final status = AppointmentStatusStyle.from(appointment['trangThai']);
    showModalBottomSheet<void>(
      context: context,
      isScrollControlled: true,
      backgroundColor: Colors.white,
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(28)),
      ),
      builder: (context) => AppointmentDetailSheet(
        title: _text(appointment['tenBenhVien']),
        statusLabel: status.label,
        statusColor: status.color,
        statusBackground: status.background,
        onClose: () => Navigator.pop(context),
        fields: [
          AppointmentInfoField(
            icon: Icons.calendar_today_outlined,
            label: 'Thời gian khám',
            value: _formatDateTime(appointment['thoiGianKham']),
          ),
          AppointmentInfoField(
            icon: Icons.person_outline_rounded,
            label: 'Bác sĩ tại nơi khám',
            value: _text(appointment['bacSiPhuTrach']),
          ),
          AppointmentInfoField(
            icon: Icons.local_hospital_outlined,
            label: 'Chuyên khoa',
            value: _text(appointment['chuyenKhoa']),
          ),
          AppointmentInfoField(
            icon: Icons.description_outlined,
            label: 'Lý do khám',
            value: _text(appointment['lyDoKham']),
          ),
          if (appointment['trangThai'] == 'DaKham')
            AppointmentInfoField(
              icon: Icons.fact_check_outlined,
              label: 'Kết quả khám',
              value: _text(appointment['ketQuaKham']),
            ),
        ],
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    final visibleAppointments = _visibleAppointments;
    final upcomingCount = _allAppointments
        .where((item) => item['trangThai'] == 'ChuaDen')
        .length;
    final scroll = CustomScrollView(
      key: const ValueKey('appointment-list'),
      physics: const AlwaysScrollableScrollPhysics(),
      slivers: [
        const SliverToBoxAdapter(child: AppointmentHeader()),
        const SliverToBoxAdapter(
          child: Padding(
            padding: EdgeInsets.fromLTRB(20, 16, 20, 0),
            child: AppointmentReminderBanner(),
          ),
        ),
        SliverToBoxAdapter(
          child: Padding(
            padding: const EdgeInsets.fromLTRB(20, 16, 20, 14),
            child: AppointmentOverview(
              label: _selectedStatus == null
                  ? '$upcomingCount lịch khám chưa đến'
                  : '${visibleAppointments.length} lịch phù hợp',
            ),
          ),
        ),
        SliverToBoxAdapter(
          child: SizedBox(
            key: const ValueKey('appointment-filters'),
            height: 72 * MediaQuery.textScalerOf(context).scale(1),
            child: ListView.separated(
              padding: const EdgeInsets.symmetric(horizontal: 20),
              scrollDirection: Axis.horizontal,
              itemCount: _filters.length,
              separatorBuilder: (_, _) => const SizedBox(width: 10),
              itemBuilder: (context, index) {
                final filter = _filters[index];
                return Center(
                  child: ChoiceChip(
                    key: ValueKey('appointment-filter-$index'),
                    label: Text(filter.value),
                    selected: _selectedStatus == filter.key,
                    onSelected: (_) => _selectStatus(filter.key),
                    selectedColor: CareSeniorColors.mint,
                    checkmarkColor: CareSeniorColors.deepGreen,
                    padding: const EdgeInsets.symmetric(
                      horizontal: 12,
                      vertical: 14,
                    ),
                    shape: RoundedRectangleBorder(
                      borderRadius: BorderRadius.circular(18),
                    ),
                    labelStyle: TextStyle(
                      fontSize: 16,
                      color: _selectedStatus == filter.key
                          ? CareSeniorColors.deepGreen
                          : CareSeniorColors.secondaryText,
                      fontWeight: FontWeight.w700,
                    ),
                    side: const BorderSide(color: CareSeniorColors.border),
                    backgroundColor: Colors.white,
                  ),
                );
              },
            ),
          ),
        ),
        const SliverToBoxAdapter(child: SizedBox(height: 12)),
        _buildContent(),
        const SliverToBoxAdapter(child: SizedBox(height: 30)),
      ],
    );
    return Scaffold(
      backgroundColor: CareSeniorColors.background,
      body: _loading || _error != null
          ? scroll
          : RefreshIndicator(
              onRefresh: () => _loadAppointments(refresh: true),
              color: CareSeniorColors.primary,
              child: scroll,
            ),
    );
  }

  Widget _buildContent() {
    final appointments = _visibleAppointments;
    if (_loading) {
      return const SliverToBoxAdapter(
        child: Padding(
          padding: EdgeInsets.all(48),
          child: Center(
            child: CircularProgressIndicator(color: CareSeniorColors.primary),
          ),
        ),
      );
    }
    if (_error != null) {
      return SliverToBoxAdapter(
        child: _MessageState(
          icon: Icons.cloud_off_outlined,
          title: 'Không thể tải lịch khám',
          message: _error!,
          actionLabel: 'Thử lại',
          onAction: () => _loadAppointments(refresh: true),
        ),
      );
    }
    if (appointments.isEmpty) {
      return SliverToBoxAdapter(
        child: _MessageState(
          icon: Icons.event_available_outlined,
          title: _emptyTitle,
          message: _emptyMessage,
        ),
      );
    }
    return SliverList.builder(
      itemCount: appointments.length,
      itemBuilder: (context, index) {
        final appointment = appointments[index];
        return _AppointmentCard(
          appointment: appointment,
          onTap: () => _showAppointmentDetail(appointment),
        );
      },
    );
  }
}

class _AppointmentCard extends StatelessWidget {
  const _AppointmentCard({required this.appointment, required this.onTap});

  final Map<String, dynamic> appointment;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final status = AppointmentStatusStyle.from(appointment['trangThai']);
    return AppointmentScheduleCard(
      key: ValueKey('appointment-card-${appointment['id']}'),
      title: _text(appointment['tenBenhVien']),
      time: _formatDateTime(appointment['thoiGianKham']),
      doctor: _text(appointment['bacSiPhuTrach']),
      specialty: _text(appointment['chuyenKhoa']),
      reason: _text(appointment['lyDoKham']),
      result: appointment['trangThai'] == 'DaKham'
          ? _text(appointment['ketQuaKham'])
          : null,
      statusLabel: status.label,
      statusColor: status.color,
      statusBackground: status.background,
      onDetails: onTap,
    );
  }
}

class _MessageState extends StatelessWidget {
  const _MessageState({
    required this.icon,
    required this.title,
    required this.message,
    this.actionLabel,
    this.onAction,
  });

  final IconData icon;
  final String title;
  final String message;
  final String? actionLabel;
  final VoidCallback? onAction;

  @override
  Widget build(BuildContext context) => Padding(
    padding: const EdgeInsets.symmetric(horizontal: 18),
    child: AppCard(
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          CircleAvatar(
            radius: 30,
            backgroundColor: CareSeniorColors.mint,
            child: Icon(icon, size: 30, color: CareSeniorColors.deepGreen),
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
          if (onAction != null) ...[
            const SizedBox(height: 14),
            FilledButton(
              onPressed: onAction,
              child: Text(actionLabel ?? 'Thử lại'),
            ),
          ],
        ],
      ),
    ),
  );
}

class AppointmentStatusStyle {
  const AppointmentStatusStyle(this.label, this.color, this.background);

  final String label;
  final Color color;
  final Color background;

  factory AppointmentStatusStyle.from(Object? raw) => switch (raw?.toString()) {
    'DaKham' => const AppointmentStatusStyle(
      'Đã khám',
      Color(0xff2e7d4f),
      Color(0xffe5f5eb),
    ),
    'Huy' => const AppointmentStatusStyle(
      'Hủy',
      Color(0xff6f767d),
      Color(0xffeeeeee),
    ),
    _ => const AppointmentStatusStyle(
      'Chưa đến',
      Color(0xff2563a7),
      Color(0xffe5f0ff),
    ),
  };
}

String _text(Object? value) {
  final text = value?.toString().trim();
  return text == null || text.isEmpty ? 'Chưa cập nhật' : text;
}

String _formatDateTime(Object? raw) {
  final date = DateTime.tryParse(raw?.toString() ?? '');
  if (date == null) return 'Chưa cập nhật';
  return '${date.day.toString().padLeft(2, '0')}/'
      '${date.month.toString().padLeft(2, '0')}/${date.year} • '
      '${date.hour.toString().padLeft(2, '0')}:'
      '${date.minute.toString().padLeft(2, '0')}';
}
