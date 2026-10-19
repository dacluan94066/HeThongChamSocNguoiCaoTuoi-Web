import 'dart:async';

import 'package:flutter/material.dart';
import '../../theme/care_senior_theme.dart';
import '../../widgets/care_senior_ui.dart';

import '../../services/api_client.dart';
import '../../widgets/foreground_refresh.dart';
import '../../services/appointment_service.dart';
import '../../widgets/appointment_reminder_banner.dart';
import '../../services/mobile_realtime_service.dart';

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
      builder: (context) => SafeArea(
        child: SingleChildScrollView(
          padding: const EdgeInsets.fromLTRB(22, 14, 22, 28),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              Container(
                width: 48,
                height: 5,
                decoration: BoxDecoration(
                  color: Colors.black12,
                  borderRadius: BorderRadius.circular(20),
                ),
              ),
              const SizedBox(height: 20),
              CircleAvatar(
                radius: 34,
                backgroundColor: status.background,
                child: Icon(
                  Icons.medical_services_outlined,
                  size: 34,
                  color: status.color,
                ),
              ),
              const SizedBox(height: 14),
              Text(
                _text(appointment['tenBenhVien']),
                textAlign: TextAlign.center,
                style: const TextStyle(
                  fontSize: 20,
                  fontWeight: FontWeight.bold,
                ),
              ),
              const SizedBox(height: 8),
              _StatusBadge(style: status),
              const SizedBox(height: 22),
              _DetailRow(
                icon: Icons.calendar_today_outlined,
                label: 'Thời gian khám',
                value: _formatDateTime(appointment['thoiGianKham']),
              ),
              _DetailRow(
                icon: Icons.person_outline_rounded,
                label: 'Bác sĩ tại nơi khám',
                value: _text(appointment['bacSiPhuTrach']),
              ),
              _DetailRow(
                icon: Icons.local_hospital_outlined,
                label: 'Chuyên khoa',
                value: _text(appointment['chuyenKhoa']),
              ),
              _DetailRow(
                icon: Icons.description_outlined,
                label: 'Lý do khám',
                value: _text(appointment['lyDoKham']),
              ),
              if (appointment['trangThai'] == 'DaKham')
                _DetailRow(
                  icon: Icons.fact_check_outlined,
                  label: 'Kết quả khám',
                  value: _text(appointment['ketQuaKham']),
                ),
              const SizedBox(height: 12),
              SizedBox(
                width: double.infinity,
                height: 50,
                child: ElevatedButton(
                  onPressed: () => Navigator.pop(context),
                  style: ElevatedButton.styleFrom(
                    backgroundColor: CareSeniorColors.deepGreen,
                    foregroundColor: Colors.white,
                    elevation: 0,
                    shape: RoundedRectangleBorder(
                      borderRadius: BorderRadius.circular(16),
                    ),
                  ),
                  child: const Text(
                    'ĐÓNG',
                    style: TextStyle(fontWeight: FontWeight.bold),
                  ),
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    final visibleAppointments = _visibleAppointments;
    final upcomingCount = _allAppointments
        .where((item) => item['trangThai'] == 'ChuaDen')
        .length;
    return Scaffold(
      backgroundColor: CareSeniorColors.background,
      appBar: AppBar(
        backgroundColor: CareSeniorColors.background,
        elevation: 0,
        centerTitle: true,
        title: const Text(
          'Lịch khám',
          style: TextStyle(fontWeight: FontWeight.bold),
        ),
      ),
      body: LayoutBuilder(
        builder: (context, viewport) => SingleChildScrollView(
          child: Column(
            children: [
              const Padding(
                padding: EdgeInsets.symmetric(horizontal: 14),
                child: AppointmentReminderBanner(),
              ),
              Padding(
                padding: const EdgeInsets.fromLTRB(18, 8, 18, 14),
                child: AppCard(
                  color: CareSeniorColors.mint,
                  child: Row(
                    children: [
                      const CircleAvatar(
                        radius: 31,
                        backgroundColor: Colors.white,
                        child: Icon(
                          Icons.calendar_month_rounded,
                          size: 32,
                          color: CareSeniorColors.deepGreen,
                        ),
                      ),
                      const SizedBox(width: 14),
                      Expanded(
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            const Text(
                              'Theo dõi lịch khám',
                              style: TextStyle(
                                fontSize: 16,
                                color: CareSeniorColors.secondaryText,
                              ),
                            ),
                            const SizedBox(height: 4),
                            Text(
                              _selectedStatus == null
                                  ? '$upcomingCount lịch khám chưa đến'
                                  : '${visibleAppointments.length} lịch phù hợp',
                              style: const TextStyle(
                                fontSize: 20,
                                fontWeight: FontWeight.bold,
                              ),
                            ),
                            const SizedBox(height: 4),
                            const Text(
                              'Kéo xuống để cập nhật dữ liệu mới nhất.',
                              style: TextStyle(
                                fontSize: 14,
                                color: CareSeniorColors.secondaryText,
                              ),
                            ),
                          ],
                        ),
                      ),
                    ],
                  ),
                ),
              ),
              SizedBox(
                height:
                    56 *
                    MediaQuery.textScalerOf(context).scale(1).clamp(1, 1.8),
                child: ListView.separated(
                  padding: const EdgeInsets.symmetric(horizontal: 18),
                  scrollDirection: Axis.horizontal,
                  itemCount: _filters.length,
                  separatorBuilder: (_, _) => const SizedBox(width: 8),
                  itemBuilder: (context, index) {
                    final filter = _filters[index];
                    return ChoiceChip(
                      label: Text(filter.value),
                      selected: _selectedStatus == filter.key,
                      onSelected: (_) => _selectStatus(filter.key),
                      selectedColor: CareSeniorColors.mint,
                      checkmarkColor: CareSeniorColors.deepGreen,
                      labelStyle: TextStyle(
                        color: _selectedStatus == filter.key
                            ? CareSeniorColors.deepGreen
                            : CareSeniorColors.secondaryText,
                        fontWeight: FontWeight.w600,
                      ),
                      side: const BorderSide(color: CareSeniorColors.border),
                      backgroundColor: Colors.white,
                    );
                  },
                ),
              ),
              const SizedBox(height: 8),
              SizedBox(height: viewport.maxHeight, child: _buildContent()),
            ],
          ),
        ),
      ),
    );
  }

  Widget _buildContent() {
    final appointments = _visibleAppointments;
    if (_loading) {
      return const Center(
        child: CircularProgressIndicator(color: CareSeniorColors.primary),
      );
    }
    if (_error != null) {
      return _MessageState(
        icon: Icons.cloud_off_outlined,
        title: 'Không thể tải lịch khám',
        message: _error!,
        actionLabel: 'Thử lại',
        onAction: () => _loadAppointments(refresh: true),
      );
    }
    if (appointments.isEmpty) {
      return RefreshIndicator(
        onRefresh: () => _loadAppointments(refresh: true),
        child: ListView(
          physics: const AlwaysScrollableScrollPhysics(),
          children: [
            const SizedBox(height: 30),
            _MessageState(
              icon: Icons.event_available_outlined,
              title: _emptyTitle,
              message: _emptyMessage,
            ),
          ],
        ),
      );
    }
    return RefreshIndicator(
      onRefresh: () => _loadAppointments(refresh: true),
      color: CareSeniorColors.primary,
      child: ListView.builder(
        padding: const EdgeInsets.fromLTRB(18, 4, 18, 30),
        physics: const AlwaysScrollableScrollPhysics(),
        itemCount: appointments.length,
        itemBuilder: (context, index) {
          final appointment = appointments[index];
          return _AppointmentCard(
            appointment: appointment,
            onTap: () => _showAppointmentDetail(appointment),
          );
        },
      ),
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
    return Padding(
      padding: const EdgeInsets.only(bottom: 12),
      child: AppCard(
        child: InkWell(
          onTap: onTap,
          borderRadius: BorderRadius.circular(22),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Row(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Container(
                    width: 48,
                    height: 48,
                    decoration: BoxDecoration(
                      color: status.background,
                      shape: BoxShape.circle,
                    ),
                    child: Icon(
                      Icons.local_hospital_outlined,
                      color: status.color,
                    ),
                  ),
                  const SizedBox(width: 12),
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(
                          _text(appointment['tenBenhVien']),
                          style: const TextStyle(
                            fontSize: 16,
                            fontWeight: FontWeight.bold,
                          ),
                        ),
                        const SizedBox(height: 4),
                        Text(
                          _formatDateTime(appointment['thoiGianKham']),
                          style: TextStyle(
                            fontSize: 16,
                            color: status.color,
                            fontWeight: FontWeight.w600,
                          ),
                        ),
                      ],
                    ),
                  ),
                  _StatusBadge(style: status),
                ],
              ),
              const Divider(height: 24),
              _InfoLine(
                icon: Icons.person_outline,
                label: 'Bác sĩ',
                value: _text(appointment['bacSiPhuTrach']),
              ),
              _InfoLine(
                icon: Icons.medical_information_outlined,
                label: 'Chuyên khoa',
                value: _text(appointment['chuyenKhoa']),
              ),
              _InfoLine(
                icon: Icons.description_outlined,
                label: 'Lý do',
                value: _text(appointment['lyDoKham']),
              ),
              if (appointment['trangThai'] == 'DaKham')
                _InfoLine(
                  icon: Icons.fact_check_outlined,
                  label: 'Kết quả',
                  value: _text(appointment['ketQuaKham']),
                  valueColor: const Color(0xff2e7d4f),
                ),
              const SizedBox(height: 8),
              SizedBox(
                width: double.infinity,
                child: OutlinedButton.icon(
                  onPressed: onTap,
                  icon: const Icon(Icons.visibility_outlined),
                  label: const Text('Xem chi tiết'),
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

class _StatusBadge extends StatelessWidget {
  const _StatusBadge({required this.style});

  final AppointmentStatusStyle style;

  @override
  Widget build(BuildContext context) => AppStatusChip(
    label: style.label,
    color: style.color,
    background: style.background,
  );
}

class _InfoLine extends StatelessWidget {
  const _InfoLine({
    required this.icon,
    required this.label,
    required this.value,
    this.valueColor,
  });

  final IconData icon;
  final String label;
  final String value;
  final Color? valueColor;

  @override
  Widget build(BuildContext context) => Padding(
    padding: const EdgeInsets.only(bottom: 8),
    child: Row(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Icon(icon, size: 20, color: CareSeniorColors.deepGreen),
        const SizedBox(width: 8),
        SizedBox(
          width: 82,
          child: Text(
            label,
            style: const TextStyle(
              fontSize: 15,
              color: CareSeniorColors.secondaryText,
            ),
          ),
        ),
        Expanded(
          child: Text(
            value,
            style: TextStyle(
              fontSize: 16,
              color: valueColor ?? CareSeniorColors.text,
              fontWeight: FontWeight.w500,
            ),
          ),
        ),
      ],
    ),
  );
}

class _DetailRow extends StatelessWidget {
  const _DetailRow({
    required this.icon,
    required this.label,
    required this.value,
  });

  final IconData icon;
  final String label;
  final String value;

  @override
  Widget build(BuildContext context) => Padding(
    padding: const EdgeInsets.only(bottom: 14),
    child: Row(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Container(
          width: 42,
          height: 42,
          decoration: const BoxDecoration(
            color: CareSeniorColors.mint,
            shape: BoxShape.circle,
          ),
          child: Icon(icon, size: 21, color: CareSeniorColors.deepGreen),
        ),
        const SizedBox(width: 12),
        Expanded(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(
                label,
                style: const TextStyle(
                  fontSize: 14,
                  color: CareSeniorColors.secondaryText,
                ),
              ),
              const SizedBox(height: 3),
              Text(
                value,
                style: const TextStyle(
                  fontSize: 16,
                  fontWeight: FontWeight.w600,
                ),
              ),
            ],
          ),
        ),
      ],
    ),
  );
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
