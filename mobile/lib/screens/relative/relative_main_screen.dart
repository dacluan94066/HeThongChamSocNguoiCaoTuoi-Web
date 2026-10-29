import 'package:flutter/material.dart';

import '../../services/auth_service.dart';
import '../../services/mobile_realtime_service.dart';
import '../../services/relative_service.dart';
import '../../theme/care_senior_theme.dart';
import '../../utils/metric_assessment.dart';
import '../../widgets/care_senior_ui.dart';
import 'relative_health_metric_dialog.dart';
import 'relative_medications_view.dart';

class RelativeMainScreen extends StatefulWidget {
  const RelativeMainScreen({super.key});

  @override
  State<RelativeMainScreen> createState() => _RelativeMainScreenState();
}

class _RelativeMainScreenState extends State<RelativeMainScreen> {
  int _currentIndex = 0;
  Map<String, dynamic>? _currentUser;
  List<Map<String, dynamic>> _elderlyList = [];
  Map<String, dynamic>? _selectedElderly;

  bool _loading = true;
  String? _error;

  // Elderly data
  Map<String, dynamic> _elderlyProfile = {};
  List<Map<String, dynamic>> _medications = [];
  List<Map<String, dynamic>> _metrics = [];
  List<Map<String, dynamic>> _appointments = [];
  List<Map<String, dynamic>> _alerts = [];
  List<Map<String, dynamic>> _sosList = [];
  List<Map<String, dynamic>> _careNotes = [];

  // Health tab filter
  int? _selectedMetricTypeId;

  @override
  void initState() {
    super.initState();
    MobileRealtimeService.instance.alertRevision.addListener(_onRealtimeUpdate);
    MobileRealtimeService.instance.medicationRevision.addListener(_onRealtimeUpdate);
    MobileRealtimeService.instance.notificationRevision.addListener(_onRealtimeUpdate);
    _loadInitialData();
  }

  void _onRealtimeUpdate() {
    final elderlyId = _selectedElderly?['id'];
    if (elderlyId != null && mounted) {
      _loadElderlyData(elderlyId as int, refresh: true);
    }
  }

  @override
  void dispose() {
    MobileRealtimeService.instance.alertRevision.removeListener(_onRealtimeUpdate);
    MobileRealtimeService.instance.medicationRevision.removeListener(_onRealtimeUpdate);
    MobileRealtimeService.instance.notificationRevision.removeListener(_onRealtimeUpdate);
    super.dispose();
  }

  Future<void> _loadInitialData({bool refresh = false}) async {
    if (!refresh) {
      setState(() {
        _loading = true;
        _error = null;
      });
    }

    try {
      final user = await AuthService.instance.getStoredUser();
      final elderlyList = await RelativeService.instance.getMyElderlyList(refresh: refresh);

      if (!mounted) return;

      Map<String, dynamic>? currentSelected = _selectedElderly;
      if (elderlyList.isNotEmpty) {
        if (currentSelected == null) {
          currentSelected = elderlyList.first;
        } else {
          final found = elderlyList.firstWhere(
            (e) => e['id'] == currentSelected!['id'],
            orElse: () => elderlyList.first,
          );
          currentSelected = found;
        }
      } else {
        currentSelected = null;
      }

      setState(() {
        _currentUser = user;
        _elderlyList = elderlyList;
        _selectedElderly = currentSelected;
      });

      if (currentSelected != null) {
        await _loadElderlyData(currentSelected['id'] as int, refresh: refresh);
      } else {
        setState(() => _loading = false);
      }
    } catch (e) {
      if (!mounted) return;
      setState(() {
        _error = 'Không thể tải dữ liệu Người thân. Vui lòng kiểm tra kết nối mạng.';
        _loading = false;
      });
    }
  }

  Future<void> _loadElderlyData(int elderlyId, {bool refresh = false}) async {
    try {
      final service = RelativeService.instance;
      final results = await Future.wait([
        service.getElderlyDetail(elderlyId, refresh: refresh),
        service.getElderlyMedications(elderlyId, refresh: refresh),
        service.getElderlyHealthMetrics(elderlyId, refresh: refresh),
        service.getElderlyAppointments(elderlyId, refresh: refresh),
        service.getElderlyAlerts(elderlyId, refresh: refresh),
        service.getElderlySos(elderlyId, refresh: refresh),
        service.getElderlyCareNotes(elderlyId, refresh: refresh),
      ]);

      if (!mounted) return;

      setState(() {
        _elderlyProfile = results[0] as Map<String, dynamic>;
        _medications = results[1] as List<Map<String, dynamic>>;
        _metrics = results[2] as List<Map<String, dynamic>>;
        _appointments = results[3] as List<Map<String, dynamic>>;
        _alerts = results[4] as List<Map<String, dynamic>>;
        _sosList = results[5] as List<Map<String, dynamic>>;
        _careNotes = results[6] as List<Map<String, dynamic>>;
        _loading = false;
        _error = null;
      });
    } catch (e) {
      if (!mounted) return;
      setState(() {
        _error = 'Không thể tải thông tin chi tiết của người cao tuổi.';
        _loading = false;
      });
    }
  }

  Future<void> _logout() async {
    final accepted = await showDialog<bool>(
      context: context,
      builder: (context) => AlertDialog(
        title: const Text('Đăng xuất'),
        content: const Text('Bạn có chắc muốn đăng xuất khỏi tài khoản Người thân?'),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(context, false),
            child: const Text('Hủy'),
          ),
          FilledButton(
            onPressed: () => Navigator.pop(context, true),
            style: FilledButton.styleFrom(backgroundColor: CareSeniorColors.danger),
            child: const Text('Đăng xuất'),
          ),
        ],
      ),
    );

    if (accepted != true) return;
    await AuthService.instance.logout();
    if (!mounted) return;
    Navigator.pushNamedAndRemoveUntil(context, '/login', (route) => false);
  }

  void _showElderlySelector() {
    if (_elderlyList.length <= 1) return;

    showModalBottomSheet(
      context: context,
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(24)),
      ),
      builder: (context) => SafeArea(
        child: Padding(
          padding: const EdgeInsets.symmetric(vertical: 20, horizontal: 16),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              const Text(
                'Chọn người thân để theo dõi',
                style: TextStyle(
                  fontSize: 18,
                  fontWeight: FontWeight.w800,
                  color: CareSeniorColors.text,
                ),
              ),
              const SizedBox(height: 14),
              for (final elderly in _elderlyList) ...[
                ListTile(
                  contentPadding: const EdgeInsets.symmetric(horizontal: 12, vertical: 4),
                  shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(14)),
                  tileColor: _selectedElderly?['id'] == elderly['id']
                      ? CareSeniorColors.mint
                      : Colors.transparent,
                  leading: CircleAvatar(
                    backgroundColor: CareSeniorColors.deepGreen,
                    child: Text(
                      _getInitials(elderly['hoTen']?.toString() ?? ''),
                      style: const TextStyle(color: Colors.white, fontWeight: FontWeight.w800),
                    ),
                  ),
                  title: Text(
                    elderly['hoTen']?.toString() ?? '',
                    style: const TextStyle(fontWeight: FontWeight.w700, fontSize: 16),
                  ),
                  subtitle: Text(
                    '${elderly['moiQuanHe'] ?? 'Người thân'} • ${elderly['tuoi'] ?? '--'} tuổi',
                    style: const TextStyle(color: CareSeniorColors.secondaryText),
                  ),
                  trailing: _selectedElderly?['id'] == elderly['id']
                      ? const Icon(Icons.check_circle_rounded, color: CareSeniorColors.deepGreen)
                      : null,
                  onTap: () {
                    Navigator.pop(context);
                    if (_selectedElderly?['id'] != elderly['id']) {
                      setState(() {
                        _selectedElderly = elderly;
                        _loading = true;
                      });
                      _loadElderlyData(elderly['id'] as int);
                    }
                  },
                ),
                const SizedBox(height: 6),
              ],
            ],
          ),
        ),
      ),
    );
  }

  String _getInitials(String name) {
    if (name.trim().isEmpty) return 'NT';
    final parts = name.trim().split(RegExp(r'\s+'));
    if (parts.length >= 2) {
      return '${parts.first[0]}${parts.last[0]}'.toUpperCase();
    }
    return parts.first[0].toUpperCase();
  }

  @override
  Widget build(BuildContext context) {
    final relativeName = _currentUser?['hoTen']?.toString() ?? 'Người thân';

    return Scaffold(
      backgroundColor: CareSeniorColors.background,
      body: Column(
        children: [
          // NCT-Style Gradient Header
          _buildHeader(relativeName),

          // Main Tab Body
          Expanded(
            child: _loading
                ? const Center(child: CircularProgressIndicator(color: CareSeniorColors.deepGreen))
                : _error != null
                ? _buildErrorView()
                : _elderlyList.isEmpty
                ? _buildNoElderlyView()
                : IndexedStack(
                    index: _currentIndex,
                    children: [
                      _buildOverviewTab(),
                      RelativeMedicationsView(
                        medications: _medications,
                        loading: _loading,
                        onRefresh: () => _loadInitialData(refresh: true),
                      ),
                      _buildHealthMetricsTab(),
                      _buildAlertsTab(),
                    ],
                  ),
          ),
        ],
      ),
      bottomNavigationBar: _buildBottomNavigationBar(),
      floatingActionButton: _currentIndex == 2
          ? FloatingActionButton.extended(
              onPressed: _openAddMetricDialog,
              backgroundColor: CareSeniorColors.deepGreen,
              foregroundColor: Colors.white,
              icon: const Icon(Icons.add_rounded),
              label: const Text('Thêm chỉ số', style: TextStyle(fontWeight: FontWeight.w700)),
            )
          : null,
    );
  }

  Future<void> _openAddMetricDialog() async {
    final elderlyId = _selectedElderly?['id'];
    final elderlyName = _selectedElderly?['hoTen']?.toString() ?? 'Người cao tuổi';
    if (elderlyId == null) return;

    final added = await RelativeHealthMetricDialog.show(
      context,
      elderlyId: elderlyId as int,
      elderlyName: elderlyName,
    );

    if (added == true && mounted) {
      _loadElderlyData(elderlyId as int, refresh: true);
    }
  }

  Widget _buildHeader(String relativeName) {
    final elderlyName = _selectedElderly?['hoTen']?.toString() ?? 'Gia đình';
    final relationship = _selectedElderly?['moiQuanHe']?.toString() ?? 'Người thân';

    return Container(
      decoration: const BoxDecoration(
        gradient: LinearGradient(
          begin: Alignment.topLeft,
          end: Alignment.bottomRight,
          colors: [Color(0xff155e4b), Color(0xff1b7a5d)],
        ),
        borderRadius: BorderRadius.vertical(bottom: Radius.circular(28)),
        boxShadow: [
          BoxShadow(
            color: Color(0x1a155e4b),
            blurRadius: 14,
            offset: Offset(0, 6),
          ),
        ],
      ),
      child: SafeArea(
        bottom: false,
        child: Padding(
          padding: const EdgeInsets.fromLTRB(20, 16, 20, 20),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              // Top Action Row
              Row(
                mainAxisAlignment: MainAxisAlignment.spaceBetween,
                children: [
                  Container(
                    padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 5),
                    decoration: BoxDecoration(
                      color: Colors.white.withValues(alpha: 0.18),
                      borderRadius: BorderRadius.circular(12),
                    ),
                    child: const Row(
                      mainAxisSize: MainAxisSize.min,
                      children: [
                        Icon(Icons.family_restroom_rounded, size: 14, color: Colors.white),
                        SizedBox(width: 6),
                        Text(
                          'NGƯỜI THÂN • ĐỒNG HÀNH CHĂM SÓC',
                          style: TextStyle(
                            color: Colors.white,
                            fontSize: 11,
                            fontWeight: FontWeight.w800,
                            letterSpacing: 0.5,
                          ),
                        ),
                      ],
                    ),
                  ),
                  Row(
                    children: [
                      IconButton(
                        tooltip: 'Làm mới',
                        icon: const Icon(Icons.refresh_rounded, color: Colors.white, size: 22),
                        onPressed: () => _loadInitialData(refresh: true),
                        style: IconButton.styleFrom(
                          backgroundColor: Colors.white.withValues(alpha: 0.15),
                          minimumSize: const Size(40, 40),
                        ),
                      ),
                      const SizedBox(width: 8),
                      IconButton(
                        tooltip: 'Đăng xuất',
                        icon: const Icon(Icons.logout_rounded, color: Colors.white, size: 22),
                        onPressed: _logout,
                        style: IconButton.styleFrom(
                          backgroundColor: Colors.white.withValues(alpha: 0.15),
                          minimumSize: const Size(40, 40),
                        ),
                      ),
                    ],
                  ),
                ],
              ),
              const SizedBox(height: 12),

              // Greeting & Relative Name
              Row(
                children: [
                  CircleAvatar(
                    radius: 24,
                    backgroundColor: CareSeniorColors.mint,
                    child: Text(
                      _getInitials(relativeName),
                      style: const TextStyle(
                        fontSize: 18,
                        fontWeight: FontWeight.w800,
                        color: CareSeniorColors.deepGreen,
                      ),
                    ),
                  ),
                  const SizedBox(width: 14),
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(
                          'Xin chào, $relativeName',
                          style: const TextStyle(
                            fontSize: 19,
                            fontWeight: FontWeight.w800,
                            color: Colors.white,
                          ),
                        ),
                        const SizedBox(height: 2),
                        Text(
                          'Theo dõi sức khỏe & nhắc nhở người cao tuổi',
                          style: TextStyle(
                            fontSize: 13,
                            color: Colors.white.withValues(alpha: 0.85),
                          ),
                        ),
                      ],
                    ),
                  ),
                ],
              ),
              const SizedBox(height: 16),

              // Elderly Switcher Pill
              if (_selectedElderly != null)
                InkWell(
                  onTap: _elderlyList.length > 1 ? _showElderlySelector : null,
                  borderRadius: BorderRadius.circular(16),
                  child: Container(
                    padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 10),
                    decoration: BoxDecoration(
                      color: Colors.white.withValues(alpha: 0.15),
                      borderRadius: BorderRadius.circular(16),
                      border: Border.all(color: Colors.white.withValues(alpha: 0.25)),
                    ),
                    child: Row(
                      children: [
                        const Icon(Icons.person_pin_rounded, color: Colors.white, size: 20),
                        const SizedBox(width: 10),
                        Expanded(
                          child: RichText(
                            text: TextSpan(
                              text: 'Đang xem: ',
                              style: TextStyle(color: Colors.white.withValues(alpha: 0.8), fontSize: 13),
                              children: [
                                TextSpan(
                                  text: elderlyName,
                                  style: const TextStyle(color: Colors.white, fontWeight: FontWeight.w800),
                                ),
                                TextSpan(
                                  text: ' ($relationship)',
                                  style: TextStyle(color: Colors.white.withValues(alpha: 0.9)),
                                ),
                              ],
                            ),
                          ),
                        ),
                        if (_elderlyList.length > 1)
                          const Icon(Icons.arrow_drop_down_circle_outlined, color: Colors.white, size: 18),
                      ],
                    ),
                  ),
                ),
            ],
          ),
        ),
      ),
    );
  }

  Widget _buildOverviewTab() {
    final name = _elderlyProfile['hoTen']?.toString() ?? _selectedElderly?['hoTen']?.toString() ?? 'Họ tên';
    final age = _elderlyProfile['tuoi']?.toString() ?? _selectedElderly?['tuoi']?.toString() ?? '--';
    final gender = _elderlyProfile['gioiTinh']?.toString() ?? _selectedElderly?['gioiTinh']?.toString() ?? '--';
    final blood = _elderlyProfile['nhomMau']?.toString() ?? _selectedElderly?['nhomMau']?.toString() ?? 'Chưa rõ';
    final relation = _elderlyProfile['moiQuanHe']?.toString() ?? _selectedElderly?['moiQuanHe']?.toString() ?? 'Người thân';

    final xemBenhNen = _elderlyProfile['xemBenhNen'] == true;
    final xemDiUng = _elderlyProfile['xemDiUng'] == true;
    final benhNen = xemBenhNen ? (_elderlyProfile['benhNen']?.toString() ?? 'Không có') : 'Chưa được đồng ý chia sẻ';
    final diUng = xemDiUng ? (_elderlyProfile['diUng']?.toString() ?? 'Không có') : 'Chưa được đồng ý chia sẻ';

    // Latest metric
    final latestMetric = _metrics.isNotEmpty ? _metrics.first : null;
    // Next appointment
    final nextAppointment = _appointments.isNotEmpty ? _appointments.first : null;
    // Latest care note
    final latestCareNote = _careNotes.isNotEmpty ? _careNotes.first : null;

    return RefreshIndicator(
      onRefresh: () => _loadInitialData(refresh: true),
      color: CareSeniorColors.deepGreen,
      child: ListView(
        padding: const EdgeInsets.all(16),
        children: [
          // Elderly Identity Hero Card
          Container(
            padding: const EdgeInsets.all(18),
            decoration: BoxDecoration(
              color: Colors.white,
              borderRadius: BorderRadius.circular(22),
              border: Border.all(color: CareSeniorColors.border),
              boxShadow: const [
                BoxShadow(
                  color: Color(0x0a17352a),
                  blurRadius: 14,
                  offset: Offset(0, 5),
                ),
              ],
            ),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Row(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    CircleAvatar(
                      radius: 30,
                      backgroundColor: CareSeniorColors.mint,
                      child: Text(
                        _getInitials(name),
                        style: const TextStyle(
                          fontSize: 22,
                          fontWeight: FontWeight.w800,
                          color: CareSeniorColors.deepGreen,
                        ),
                      ),
                    ),
                    const SizedBox(width: 14),
                    Expanded(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Row(
                            children: [
                              Expanded(
                                child: Text(
                                  name,
                                  style: const TextStyle(
                                    fontSize: 20,
                                    fontWeight: FontWeight.w800,
                                    color: CareSeniorColors.text,
                                  ),
                                ),
                              ),
                              const AppStatusChip(label: 'Đang theo dõi'),
                            ],
                          ),
                          const SizedBox(height: 4),
                          Text(
                            'Mối quan hệ: $relation • $age tuổi • Giới tính: $gender',
                            style: const TextStyle(
                              fontSize: 14,
                              fontWeight: FontWeight.w600,
                              color: CareSeniorColors.secondaryText,
                            ),
                          ),
                          const SizedBox(height: 4),
                          Text(
                            'Nhóm máu: $blood',
                            style: const TextStyle(
                              fontSize: 14,
                              fontWeight: FontWeight.w600,
                              color: CareSeniorColors.primary,
                            ),
                          ),
                        ],
                      ),
                    ),
                  ],
                ),
                const Padding(
                  padding: EdgeInsets.symmetric(vertical: 14),
                  child: Divider(color: CareSeniorColors.border, height: 1),
                ),

                // Health background & Allergies
                Row(
                  children: [
                    Expanded(
                      child: _buildInfoItem(
                        icon: Icons.history_edu_rounded,
                        title: 'BỆNH NỀN',
                        value: benhNen,
                        isRestricted: !xemBenhNen,
                      ),
                    ),
                    const SizedBox(width: 12),
                    Expanded(
                      child: _buildInfoItem(
                        icon: Icons.warning_amber_rounded,
                        title: 'DỊ ỨNG',
                        value: diUng,
                        isRestricted: !xemDiUng,
                      ),
                    ),
                  ],
                ),
              ],
            ),
          ),
          const SizedBox(height: 16),

          // Quick Vitals Summary Card
          _buildQuickVitalsCard(latestMetric),
          const SizedBox(height: 16),

          // Next Appointment Card
          _buildAppointmentCard(nextAppointment),
          const SizedBox(height: 16),

          // Latest Caregiver Note Card
          _buildCareNoteCard(latestCareNote),
          const SizedBox(height: 20),
        ],
      ),
    );
  }

  Widget _buildInfoItem({
    required IconData icon,
    required String title,
    required String value,
    required bool isRestricted,
  }) {
    return Container(
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(
        color: CareSeniorColors.background,
        borderRadius: BorderRadius.circular(14),
        border: Border.all(color: CareSeniorColors.border),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Icon(icon, size: 14, color: isRestricted ? Colors.grey : CareSeniorColors.deepGreen),
              const SizedBox(width: 4),
              Text(
                title,
                style: TextStyle(
                  fontSize: 11,
                  fontWeight: FontWeight.w800,
                  color: isRestricted ? Colors.grey : CareSeniorColors.secondaryText,
                  letterSpacing: 0.5,
                ),
              ),
            ],
          ),
          const SizedBox(height: 6),
          Text(
            value,
            style: TextStyle(
              fontSize: 13,
              fontWeight: FontWeight.w600,
              fontStyle: isRestricted ? FontStyle.italic : FontStyle.normal,
              color: isRestricted ? Colors.grey : CareSeniorColors.text,
            ),
            maxLines: 2,
            overflow: TextOverflow.ellipsis,
          ),
        ],
      ),
    );
  }

  Widget _buildQuickVitalsCard(Map<String, dynamic>? metric) {
    if (metric == null) {
      return Container(
        padding: const EdgeInsets.all(16),
        decoration: BoxDecoration(
          color: Colors.white,
          borderRadius: BorderRadius.circular(20),
          border: Border.all(color: CareSeniorColors.border),
        ),
        child: const Row(
          children: [
            Icon(Icons.favorite_border_rounded, color: CareSeniorColors.primary, size: 28),
            SizedBox(width: 12),
            Expanded(
              child: Text(
                'Chưa có dữ liệu chỉ số sức khỏe gần đây.',
                style: TextStyle(color: CareSeniorColors.secondaryText),
              ),
            ),
          ],
        ),
      );
    }

    final tenChiSo = metric['tenChiSo']?.toString() ?? 'Chỉ số';
    final giaTri = metric['giaTri']?.toString() ?? '--';
    final giaTriPhu = metric['giaTriPhu'] != null ? '/${metric['giaTriPhu']}' : '';
    final donVi = metric['donVi']?.toString() ?? '';
    final isAbnormal = MetricAssessment.abnormal(metric);

    return Container(
      padding: const EdgeInsets.all(18),
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(22),
        border: Border.all(color: isAbnormal ? CareSeniorColors.danger.withValues(alpha: 0.4) : CareSeniorColors.border),
        boxShadow: const [
          BoxShadow(
            color: Color(0x0a17352a),
            blurRadius: 14,
            offset: Offset(0, 5),
          ),
        ],
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            mainAxisAlignment: MainAxisAlignment.spaceBetween,
            children: [
              const Row(
                children: [
                  Icon(Icons.monitor_heart_rounded, color: CareSeniorColors.deepGreen, size: 22),
                  SizedBox(width: 8),
                  Text(
                    'Chỉ số sinh hiệu gần nhất',
                    style: TextStyle(
                      fontSize: 16,
                      fontWeight: FontWeight.w800,
                      color: CareSeniorColors.text,
                    ),
                  ),
                ],
              ),
              TextButton(
                onPressed: () => setState(() => _currentIndex = 2),
                child: const Text('Xem tất cả >'),
              ),
            ],
          ),
          const SizedBox(height: 10),
          Container(
            padding: const EdgeInsets.all(14),
            decoration: BoxDecoration(
              color: isAbnormal ? CareSeniorColors.dangerSurface : CareSeniorColors.mint,
              borderRadius: BorderRadius.circular(16),
            ),
            child: Row(
              children: [
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        tenChiSo,
                        style: const TextStyle(
                          fontSize: 14,
                          fontWeight: FontWeight.w700,
                          color: CareSeniorColors.secondaryText,
                        ),
                      ),
                      const SizedBox(height: 4),
                      Row(
                        crossAxisAlignment: CrossAxisAlignment.baseline,
                        textBaseline: TextBaseline.alphabetic,
                        children: [
                          Text(
                            '$giaTri$giaTriPhu',
                            style: TextStyle(
                              fontSize: 26,
                              fontWeight: FontWeight.w800,
                              color: isAbnormal ? CareSeniorColors.danger : CareSeniorColors.deepGreen,
                            ),
                          ),
                          const SizedBox(width: 4),
                          Text(
                            donVi,
                            style: TextStyle(
                              fontSize: 14,
                              fontWeight: FontWeight.w600,
                              color: isAbnormal ? CareSeniorColors.danger : CareSeniorColors.secondaryText,
                            ),
                          ),
                        ],
                      ),
                    ],
                  ),
                ),
                Container(
                  padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
                  decoration: BoxDecoration(
                    color: isAbnormal ? CareSeniorColors.danger : CareSeniorColors.primary,
                    borderRadius: BorderRadius.circular(12),
                  ),
                  child: Text(
                    isAbnormal ? 'Bất thường' : 'Bình thường',
                    style: const TextStyle(
                      color: Colors.white,
                      fontSize: 12,
                      fontWeight: FontWeight.w800,
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

  Widget _buildAppointmentCard(Map<String, dynamic>? appt) {
    return Container(
      padding: const EdgeInsets.all(18),
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(22),
        border: Border.all(color: CareSeniorColors.border),
        boxShadow: const [
          BoxShadow(
            color: Color(0x0a17352a),
            blurRadius: 14,
            offset: Offset(0, 5),
          ),
        ],
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          const Row(
            children: [
              Icon(Icons.calendar_month_rounded, color: CareSeniorColors.deepGreen, size: 22),
              SizedBox(width: 8),
              Text(
                'Lịch khám bệnh tiếp theo',
                style: TextStyle(
                  fontSize: 16,
                  fontWeight: FontWeight.w800,
                  color: CareSeniorColors.text,
                ),
              ),
            ],
          ),
          const SizedBox(height: 12),
          if (appt == null)
            const Text(
              'Chưa có lịch khám nào sắp tới.',
              style: TextStyle(color: CareSeniorColors.secondaryText),
            )
          else
            Row(
              children: [
                Container(
                  padding: const EdgeInsets.all(12),
                  decoration: BoxDecoration(
                    color: CareSeniorColors.mint,
                    borderRadius: BorderRadius.circular(14),
                  ),
                  child: const Icon(Icons.local_hospital_rounded, color: CareSeniorColors.deepGreen, size: 26),
                ),
                const SizedBox(width: 14),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        appt['tenBenhVien']?.toString() ?? 'Bệnh viện',
                        style: const TextStyle(fontSize: 15, fontWeight: FontWeight.w800, color: CareSeniorColors.text),
                      ),
                      const SizedBox(height: 2),
                      Text(
                        'Bác sĩ: ${appt['bacSiPhuTrach'] ?? 'Chưa chỉ định'} • Khoa: ${appt['chuyenKhoa'] ?? '--'}',
                        style: const TextStyle(fontSize: 13, color: CareSeniorColors.secondaryText),
                      ),
                    ],
                  ),
                ),
              ],
            ),
        ],
      ),
    );
  }

  Widget _buildCareNoteCard(Map<String, dynamic>? note) {
    return Container(
      padding: const EdgeInsets.all(18),
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(22),
        border: Border.all(color: CareSeniorColors.border),
        boxShadow: const [
          BoxShadow(
            color: Color(0x0a17352a),
            blurRadius: 14,
            offset: Offset(0, 5),
          ),
        ],
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          const Row(
            children: [
              Icon(Icons.menu_book_rounded, color: CareSeniorColors.deepGreen, size: 22),
              SizedBox(width: 8),
              Text(
                'Nhật ký chăm sóc mới nhất',
                style: TextStyle(
                  fontSize: 16,
                  fontWeight: FontWeight.w800,
                  color: CareSeniorColors.text,
                ),
              ),
            ],
          ),
          const SizedBox(height: 12),
          if (note == null)
            const Text(
              'Chưa có nhật ký chăm sóc nào được ghi nhận.',
              style: TextStyle(color: CareSeniorColors.secondaryText),
            )
          else ...[
            Row(
              mainAxisAlignment: MainAxisAlignment.spaceBetween,
              children: [
                Text(
                  note['hoatDong']?.toString() ?? 'Hoạt động',
                  style: const TextStyle(fontSize: 15, fontWeight: FontWeight.w800, color: CareSeniorColors.text),
                ),
                Text(
                  note['nguoiChamSocTen']?.toString() ?? 'Người chăm sóc',
                  style: const TextStyle(fontSize: 13, color: CareSeniorColors.primary, fontWeight: FontWeight.w600),
                ),
              ],
            ),
            if (note['moTaChiTiet'] != null && note['moTaChiTiet'].toString().isNotEmpty) ...[
              const SizedBox(height: 6),
              Text(
                note['moTaChiTiet'].toString(),
                style: const TextStyle(fontSize: 13, color: CareSeniorColors.secondaryText, height: 1.4),
              ),
            ],
          ],
        ],
      ),
    );
  }

  Widget _buildHealthMetricsTab() {
    final filteredMetrics = _selectedMetricTypeId == null
        ? _metrics
        : _metrics.where((m) => m['loaiChiSoId'] == _selectedMetricTypeId).toList();

    return RefreshIndicator(
      onRefresh: () => _loadInitialData(refresh: true),
      color: CareSeniorColors.deepGreen,
      child: ListView(
        padding: const EdgeInsets.all(16),
        children: [
          // Header with Add Button
          Row(
            mainAxisAlignment: MainAxisAlignment.spaceBetween,
            children: [
              const Text(
                'Chỉ số sức khỏe',
                style: TextStyle(fontSize: 20, fontWeight: FontWeight.w800, color: CareSeniorColors.text),
              ),
              FilledButton.icon(
                onPressed: _openAddMetricDialog,
                icon: const Icon(Icons.add_rounded, size: 18),
                label: const Text('Thêm chỉ số'),
                style: FilledButton.styleFrom(
                  backgroundColor: CareSeniorColors.deepGreen,
                  shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(14)),
                ),
              ),
            ],
          ),
          const SizedBox(height: 16),

          // Metrics List
          if (filteredMetrics.isEmpty)
            const AppEmptyState(
              icon: Icons.favorite_border_rounded,
              title: 'Không có dữ liệu',
              message: 'Chưa có bản ghi chỉ số sức khỏe nào được lưu.',
            )
          else ...[
            for (final m in filteredMetrics) ...[
              _buildMetricCard(m),
              const SizedBox(height: 12),
            ],
          ],
        ],
      ),
    );
  }

  Widget _buildMetricCard(Map<String, dynamic> metric) {
    final tenChiSo = metric['tenChiSo']?.toString() ?? 'Chỉ số';
    final giaTri = metric['giaTri']?.toString() ?? '--';
    final giaTriPhu = metric['giaTriPhu'] != null ? '/${metric['giaTriPhu']}' : '';
    final donVi = metric['donVi']?.toString() ?? '';
    final isAbnormal = MetricAssessment.abnormal(metric);
    final thoiGian = metric['thoiGianDo']?.toString() ?? '';

    return Container(
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(18),
        border: Border.all(color: CareSeniorColors.border),
        boxShadow: const [
          BoxShadow(
            color: Color(0x0a17352a),
            blurRadius: 10,
            offset: Offset(0, 4),
          ),
        ],
      ),
      child: Row(
        children: [
          Container(
            padding: const EdgeInsets.all(12),
            decoration: BoxDecoration(
              color: isAbnormal ? CareSeniorColors.dangerSurface : CareSeniorColors.mint,
              borderRadius: BorderRadius.circular(14),
            ),
            child: Icon(
              Icons.monitor_heart_rounded,
              color: isAbnormal ? CareSeniorColors.danger : CareSeniorColors.deepGreen,
              size: 26,
            ),
          ),
          const SizedBox(width: 14),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  tenChiSo,
                  style: const TextStyle(fontSize: 16, fontWeight: FontWeight.w800, color: CareSeniorColors.text),
                ),
                const SizedBox(height: 2),
                Text(
                  thoiGian.replaceFirst('T', ' ').split('.').first,
                  style: const TextStyle(fontSize: 12, color: CareSeniorColors.secondaryText),
                ),
              ],
            ),
          ),
          Column(
            crossAxisAlignment: CrossAxisAlignment.end,
            children: [
              Text(
                '$giaTri$giaTriPhu $donVi',
                style: TextStyle(
                  fontSize: 16,
                  fontWeight: FontWeight.w800,
                  color: isAbnormal ? CareSeniorColors.danger : CareSeniorColors.deepGreen,
                ),
              ),
              const SizedBox(height: 4),
              Container(
                padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
                decoration: BoxDecoration(
                  color: isAbnormal ? CareSeniorColors.dangerSurface : const Color(0xffe6f9f0),
                  borderRadius: BorderRadius.circular(8),
                ),
                child: Text(
                  isAbnormal ? 'Bất thường' : 'Bình thường',
                  style: TextStyle(
                    fontSize: 11,
                    fontWeight: FontWeight.w700,
                    color: isAbnormal ? CareSeniorColors.danger : CareSeniorColors.primary,
                  ),
                ),
              ),
            ],
          ),
        ],
      ),
    );
  }

  Widget _buildAlertsTab() {
    return RefreshIndicator(
      onRefresh: () => _loadInitialData(refresh: true),
      color: CareSeniorColors.deepGreen,
      child: ListView(
        padding: const EdgeInsets.all(16),
        children: [
          // Active SOS banner if any
          if (_sosList.isNotEmpty) ...[
            Container(
              padding: const EdgeInsets.all(16),
              decoration: BoxDecoration(
                color: CareSeniorColors.dangerSurface,
                borderRadius: BorderRadius.circular(18),
                border: Border.all(color: CareSeniorColors.danger.withValues(alpha: 0.5)),
              ),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  const Row(
                    children: [
                      Icon(Icons.sos_rounded, color: CareSeniorColors.danger, size: 28),
                      SizedBox(width: 8),
                      Text(
                        'Tín hiệu khẩn cấp (SOS)',
                        style: TextStyle(
                          fontSize: 17,
                          fontWeight: FontWeight.w800,
                          color: CareSeniorColors.danger,
                        ),
                      ),
                    ],
                  ),
                  const SizedBox(height: 8),
                  for (final sos in _sosList) ...[
                    Text(
                      '• ${sos['noiDung'] ?? 'Yêu cầu cứu hộ khẩn cấp'} (${sos['trangThai'] ?? 'Chưa xử lý'})',
                      style: const TextStyle(fontSize: 14, fontWeight: FontWeight.w600, color: CareSeniorColors.text),
                    ),
                  ],
                ],
              ),
            ),
            const SizedBox(height: 16),
          ],

          const Text(
            'Lịch sử cảnh báo sức khỏe',
            style: TextStyle(fontSize: 18, fontWeight: FontWeight.w800, color: CareSeniorColors.text),
          ),
          const SizedBox(height: 12),

          if (_alerts.isEmpty)
            const AppEmptyState(
              icon: Icons.notifications_none_rounded,
              title: 'Không có cảnh báo',
              message: 'Người thân hiện không có cảnh báo sức khỏe bất thường nào.',
            )
          else ...[
            for (final alert in _alerts) ...[
              _buildAlertItem(alert),
              const SizedBox(height: 10),
            ],
          ],
        ],
      ),
    );
  }

  Widget _buildAlertItem(Map<String, dynamic> alert) {
    final noiDung = alert['noiDung']?.toString() ?? 'Cảnh báo';
    final mucDo = alert['mucDo']?.toString() ?? 'TrungBinh';
    final ngayTao = alert['ngayTao']?.toString() ?? '';
    final isDanger = mucDo == 'NguyHiem' || mucDo == 'Cao';

    return Container(
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(16),
        border: Border.all(color: CareSeniorColors.border),
      ),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Icon(
            isDanger ? Icons.warning_rounded : Icons.info_outline_rounded,
            color: isDanger ? CareSeniorColors.danger : CareSeniorColors.warning,
            size: 22,
          ),
          const SizedBox(width: 12),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  noiDung,
                  style: const TextStyle(fontSize: 14, fontWeight: FontWeight.w700, color: CareSeniorColors.text),
                ),
                const SizedBox(height: 4),
                Text(
                  ngayTao.replaceFirst('T', ' ').split('.').first,
                  style: const TextStyle(fontSize: 12, color: CareSeniorColors.secondaryText),
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildBottomNavigationBar() {
    return NavigationBar(
      selectedIndex: _currentIndex,
      onDestinationSelected: (index) => setState(() => _currentIndex = index),
      destinations: const [
        NavigationDestination(
          icon: Icon(Icons.people_outline_rounded),
          selectedIcon: Icon(Icons.people_rounded),
          label: 'Gia đình',
        ),
        NavigationDestination(
          icon: Icon(Icons.medication_outlined),
          selectedIcon: Icon(Icons.medication_rounded),
          label: 'Lịch thuốc',
        ),
        NavigationDestination(
          icon: Icon(Icons.favorite_outline_rounded),
          selectedIcon: Icon(Icons.favorite_rounded),
          label: 'Chỉ số',
        ),
        NavigationDestination(
          icon: Icon(Icons.warning_amber_rounded),
          selectedIcon: Icon(Icons.warning_rounded),
          label: 'Cảnh báo',
        ),
      ],
    );
  }

  Widget _buildErrorView() {
    return Center(
      child: Padding(
        padding: const EdgeInsets.all(32),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            const Icon(Icons.cloud_off_rounded, color: CareSeniorColors.danger, size: 56),
            const SizedBox(height: 16),
            Text(
              _error!,
              textAlign: TextAlign.center,
              style: const TextStyle(fontSize: 16, fontWeight: FontWeight.w600),
            ),
            const SizedBox(height: 20),
            ElevatedButton.icon(
              onPressed: () => _loadInitialData(refresh: true),
              icon: const Icon(Icons.refresh_rounded),
              label: const Text('Thử lại'),
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildNoElderlyView() {
    return const Center(
      child: Padding(
        padding: EdgeInsets.all(32),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Icon(Icons.family_restroom_rounded, color: CareSeniorColors.secondaryText, size: 56),
            SizedBox(height: 16),
            Text(
              'Chưa có hồ sơ liên kết',
              style: TextStyle(fontSize: 18, fontWeight: FontWeight.w800, color: CareSeniorColors.text),
            ),
            SizedBox(height: 8),
            Text(
              'Tài khoản của bạn chưa được liên kết với người cao tuổi nào trong gia đình.',
              textAlign: TextAlign.center,
              style: TextStyle(color: CareSeniorColors.secondaryText, height: 1.4),
            ),
          ],
        ),
      ),
    );
  }
}
