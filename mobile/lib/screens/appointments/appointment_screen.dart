import 'package:flutter/material.dart';

import '../../services/api_client.dart';
import '../../services/appointment_service.dart';
import '../../widgets/foreground_refresh.dart';

class AppointmentScreen extends StatefulWidget {
  const AppointmentScreen({super.key, this.elderlyId, this.elderlyName});
  final int? elderlyId;
  final String? elderlyName;

  @override
  State<AppointmentScreen> createState() => _AppointmentScreenState();
}

class _AppointmentScreenState extends State<AppointmentScreen>
    with ForegroundRefresh<AppointmentScreen> {
  @override
  Future<void> refreshForeground() =>
      _loadAppointments(refresh: true, silent: true);
  static const List<MapEntry<String?, String>> _filters = [
    MapEntry(null, 'Tất cả'),
    MapEntry('ChuaDen', 'Chưa đến'),
    MapEntry('DaKham', 'Đã khám'),
    MapEntry('Huy', 'Hủy'),
    MapEntry('DaDoiLich', 'Đã dời lịch'),
  ];

  List<Map<String, dynamic>> _allAppointments = [];
  String? _selectedStatus;
  String? _error;
  bool _loading = true;

  @override
  void initState() {
    super.initState();
    _loadAppointments(refresh: true);
  }

  Future<void> _loadAppointments({
    bool refresh = false,
    bool silent = false,
  }) async {
    if (mounted && !silent) {
      setState(() {
        _loading = true;
        _error = null;
      });
    }
    try {
      final id = widget.elderlyId;
      final data = id == null
          ? await AppointmentService.instance.getAppointments(refresh: refresh)
          : await AppointmentService.instance.getForElderly(
              id,
              refresh: refresh,
            );
      if (!mounted) return;
      setState(() {
        _allAppointments = data;
        _loading = false;
      });
    } on ApiException catch (error) {
      if (!mounted) return;
      if (silent) return;
      setState(() {
        _allAppointments = [];
        _error = error.message;
        _loading = false;
      });
    } catch (_) {
      if (!mounted) return;
      if (silent) return;
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
    'DaDoiLich' => 'Chưa có lịch đã dời',
    _ => 'Chưa có lịch khám',
  };

  String get _emptyMessage => switch (_selectedStatus) {
    'DaKham' =>
      'Lịch chỉ xuất hiện ở đây sau khi nhân viên ghi kết quả khám trên Web.',
    'ChuaDen' => 'Tài khoản này hiện chưa có lịch khám nào đang chờ.',
    'Huy' => 'Tài khoản này hiện chưa có lịch khám nào bị hủy.',
    'DaDoiLich' => 'Tài khoản này hiện chưa có lịch khám nào đã dời.',
    _ => 'Lịch khám do nhân viên quản lý tạo sẽ xuất hiện tại đây.',
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
                label: 'Bác sĩ phụ trách',
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
                    backgroundColor: const Color(0xff07856d),
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
      backgroundColor: const Color(0xfff3f3f1),
      appBar: AppBar(
        backgroundColor: const Color(0xfff3f3f1),
        elevation: 0,
        centerTitle: true,
        title: Text(
          widget.elderlyName == null
              ? 'Lịch khám'
              : 'Lịch khám • ${widget.elderlyName}',
          style: const TextStyle(fontWeight: FontWeight.bold),
        ),
      ),
      body: Column(
        children: [
          Padding(
            padding: const EdgeInsets.fromLTRB(18, 8, 18, 14),
            child: Container(
              width: double.infinity,
              padding: const EdgeInsets.all(18),
              decoration: BoxDecoration(
                gradient: const LinearGradient(
                  colors: [Color(0xffe9fff6), Color(0xffffffe8)],
                  begin: Alignment.topLeft,
                  end: Alignment.bottomRight,
                ),
                borderRadius: BorderRadius.circular(28),
              ),
              child: Row(
                children: [
                  const CircleAvatar(
                    radius: 31,
                    backgroundColor: Colors.white,
                    child: Icon(
                      Icons.calendar_month_rounded,
                      size: 32,
                      color: Color(0xff07856d),
                    ),
                  ),
                  const SizedBox(width: 14),
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        const Text(
                          'Theo dõi lịch khám',
                          style: TextStyle(fontSize: 14, color: Colors.black54),
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
                          style: TextStyle(fontSize: 13, color: Colors.black54),
                        ),
                      ],
                    ),
                  ),
                ],
              ),
            ),
          ),
          SizedBox(
            height: 48,
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
                  selectedColor: const Color(0xffd9f4eb),
                  checkmarkColor: const Color(0xff07856d),
                  labelStyle: TextStyle(
                    color: _selectedStatus == filter.key
                        ? const Color(0xff076a59)
                        : Colors.black54,
                    fontWeight: FontWeight.w600,
                  ),
                  side: BorderSide.none,
                  backgroundColor: Colors.white,
                );
              },
            ),
          ),
          const SizedBox(height: 8),
          Expanded(child: _buildContent()),
        ],
      ),
    );
  }

  Widget _buildContent() {
    final appointments = _visibleAppointments;
    if (_loading) {
      return const Center(
        child: CircularProgressIndicator(color: Color(0xff07856d)),
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
            const SizedBox(height: 110),
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
      color: const Color(0xff07856d),
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
    return Card(
      margin: const EdgeInsets.only(bottom: 12),
      color: Colors.white,
      elevation: 0,
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(22)),
      child: InkWell(
        onTap: onTap,
        borderRadius: BorderRadius.circular(22),
        child: Padding(
          padding: const EdgeInsets.all(16),
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
                            fontSize: 13,
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
  Widget build(BuildContext context) => Container(
    padding: const EdgeInsets.symmetric(horizontal: 9, vertical: 5),
    decoration: BoxDecoration(
      color: style.background,
      borderRadius: BorderRadius.circular(16),
    ),
    child: Text(
      style.label,
      style: TextStyle(
        color: style.color,
        fontSize: 11,
        fontWeight: FontWeight.bold,
      ),
    ),
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
        Icon(icon, size: 17, color: Colors.black45),
        const SizedBox(width: 8),
        SizedBox(
          width: 82,
          child: Text(
            label,
            style: const TextStyle(fontSize: 13, color: Colors.black54),
          ),
        ),
        Expanded(
          child: Text(
            value,
            style: TextStyle(
              fontSize: 13,
              color: valueColor ?? Colors.black87,
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
            color: Color(0xffeef7f4),
            shape: BoxShape.circle,
          ),
          child: Icon(icon, size: 21, color: const Color(0xff07856d)),
        ),
        const SizedBox(width: 12),
        Expanded(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(
                label,
                style: const TextStyle(fontSize: 12, color: Colors.black54),
              ),
              const SizedBox(height: 3),
              Text(
                value,
                style: const TextStyle(
                  fontSize: 14,
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
  Widget build(BuildContext context) => Center(
    child: Padding(
      padding: const EdgeInsets.all(28),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          Icon(icon, size: 50, color: Colors.black26),
          const SizedBox(height: 12),
          Text(
            title,
            style: const TextStyle(fontSize: 17, fontWeight: FontWeight.bold),
          ),
          const SizedBox(height: 6),
          Text(
            message,
            textAlign: TextAlign.center,
            style: const TextStyle(color: Colors.black54),
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
    'DaDoiLich' => const AppointmentStatusStyle(
      'Đã dời lịch',
      Color(0xffb56b00),
      Color(0xfffff0d9),
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
