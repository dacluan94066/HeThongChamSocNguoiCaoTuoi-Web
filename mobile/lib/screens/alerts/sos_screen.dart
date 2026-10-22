import 'dart:async';

import 'package:flutter/material.dart';
import '../../theme/care_senior_theme.dart';
import '../../widgets/care_senior_ui.dart';
import 'package:flutter/services.dart';
import 'package:geolocator/geolocator.dart';
import 'package:url_launcher/url_launcher.dart';

import '../../services/alert_service.dart';
import '../../services/api_client.dart';
import '../../services/caregiver_service.dart';
import '../../services/mobile_realtime_service.dart';
import 'alerts_dashboard_ui.dart';

class SosScreen extends StatefulWidget {
  const SosScreen({super.key});

  @override
  State<SosScreen> createState() => _SosScreenState();
}

class _SosScreenState extends State<SosScreen>
    with SingleTickerProviderStateMixin {
  static const teal = CareSeniorColors.deepGreen;
  static const red = CareSeniorColors.danger;
  late final AnimationController _hold =
      AnimationController(vsync: this, duration: const Duration(seconds: 3))
        ..addStatusListener((status) {
          if (status == AnimationStatus.completed) {
            HapticFeedback.heavyImpact();
            unawaited(_send());
          }
        });
  List<Map<String, dynamic>> _caregivers = const [];
  Map<String, dynamic>? _latest;
  Map<String, dynamic>? _sent;
  bool _sending = false;
  bool _gettingPosition = false;
  bool _releasedEarly = false;
  String? _error;
  String? _locationNote;

  @override
  void initState() {
    super.initState();
    MobileRealtimeService.instance.alertRevision.addListener(_refreshHistory);
    MobileRealtimeService.instance.notificationRevision.addListener(
      _refreshHistory,
    );
    unawaited(_load());
  }

  @override
  void dispose() {
    MobileRealtimeService.instance.alertRevision.removeListener(
      _refreshHistory,
    );
    MobileRealtimeService.instance.notificationRevision.removeListener(
      _refreshHistory,
    );
    _hold.dispose();
    super.dispose();
  }

  void _refreshHistory() => unawaited(_load());

  Future<void> _load() async {
    final version = ApiClient.sessionVersion;
    try {
      final results = await Future.wait([
        CaregiverService.instance.getMyCaregivers(),
        AlertService.instance.getMyEmergencyAlerts(refresh: true),
      ]);
      if (!mounted || version != ApiClient.sessionVersion) return;
      setState(() {
        _caregivers = results[0];
        final alerts = results[1]
          ..sort(
            (a, b) => (b['ngayGui']?.toString() ?? '').compareTo(
              a['ngayGui']?.toString() ?? '',
            ),
          );
        _latest = alerts.isEmpty ? null : alerts.first;
      });
    } catch (_) {
      // Không để lỗi tải lịch sử/người chăm sóc chặn nút gửi SOS.
    }
  }

  void _startHold(TapDownDetails _) {
    if (_sending) return;
    setState(() {
      _error = null;
      _releasedEarly = false;
      _sent = null;
    });
    HapticFeedback.selectionClick();
    _hold.forward(from: 0);
  }

  void _stopHold() {
    if (_sending || _hold.status == AnimationStatus.completed) return;
    if (_hold.value > 0) setState(() => _releasedEarly = true);
    _hold.reset();
  }

  Future<Position?> _positionOrNull() async {
    try {
      if (!await Geolocator.isLocationServiceEnabled()) {
        _locationNote = 'GPS đang tắt. SOS sẽ gửi không kèm vị trí.';
        return null;
      }
      var permission = await Geolocator.checkPermission();
      if (permission == LocationPermission.denied) {
        if (!mounted) return null;
        final explain = await showDialog<bool>(
          context: context,
          builder: (context) => AlertDialog(
            title: const Text('Cho phép lấy vị trí?'),
            content: const Text(
              'Vị trí chỉ được đính kèm vào SOS để người chăm sóc tìm bạn. Không cho phép vẫn gửi được SOS.',
            ),
            actions: [
              TextButton(
                onPressed: () => Navigator.pop(context, false),
                child: const Text('Gửi không vị trí'),
              ),
              FilledButton(
                onPressed: () => Navigator.pop(context, true),
                child: const Text('Cho phép'),
              ),
            ],
          ),
        );
        if (explain != true) {
          _locationNote = 'Bạn đã chọn gửi SOS không kèm vị trí.';
          return null;
        }
        permission = await Geolocator.requestPermission();
      }
      if (permission == LocationPermission.denied ||
          permission == LocationPermission.deniedForever) {
        _locationNote = 'Chưa có quyền vị trí. SOS đã gửi không kèm tọa độ.';
        return null;
      }
      try {
        return await Geolocator.getCurrentPosition(
          locationSettings: const LocationSettings(
            accuracy: LocationAccuracy.high,
            timeLimit: Duration(seconds: 8),
          ),
        );
      } catch (_) {
        final last = await Geolocator.getLastKnownPosition().timeout(
          const Duration(seconds: 2),
        );
        if (last == null) {
          _locationNote = 'Không lấy được GPS. SOS đã gửi không kèm tọa độ.';
        } else {
          _locationNote =
              'Đã dùng vị trí gần nhất vì GPS hiện tại không khả dụng.';
        }
        return last;
      }
    } catch (_) {
      _locationNote = 'Không lấy được vị trí. SOS đã gửi không kèm tọa độ.';
      return null;
    }
  }

  Future<void> _send() async {
    if (_sending) return;
    final version = ApiClient.sessionVersion;
    setState(() {
      _sending = true;
      _gettingPosition = true;
      _error = null;
      _locationNote = null;
    });
    final position = await _positionOrNull();
    if (!mounted || version != ApiClient.sessionVersion) return;
    setState(() => _gettingPosition = false);
    try {
      final result = await CaregiverService.instance.sendEmergencyAlert(
        noiDung: 'Cảnh báo SOS khẩn cấp',
        viDo: position?.latitude,
        kinhDo: position?.longitude,
      );
      if (!mounted || version != ApiClient.sessionVersion) return;
      AlertService.instance.invalidateAlerts();
      setState(() {
        _sent = result;
        _sending = false;
      });
      _hold.reset();
      unawaited(_load());
    } catch (error) {
      if (!mounted || version != ApiClient.sessionVersion) return;
      setState(() {
        _sending = false;
        _error = error is ApiException
            ? error.message
            : 'Không thể gửi SOS. Vui lòng thử lại.';
      });
      _hold.reset();
    }
  }

  Future<void> _call(String? raw) async {
    final phone = (raw ?? '').replaceAll(RegExp(r'[^0-9+]'), '');
    if (!RegExp(r'^\+?[0-9]{3,15}$').hasMatch(phone)) return;
    await launchUrl(
      Uri(scheme: 'tel', path: phone),
      mode: LaunchMode.externalApplication,
    );
  }

  String get _latestStatus => switch (_latest?['trangThai']?.toString()) {
    'DA_XU_LY' || 'DaXuLy' => 'Đã xử lý',
    'DA_XEM' || 'DaTiepNhan' => 'Đã tiếp nhận',
    _ => 'Đã gửi',
  };

  Widget _card(Widget child, {Color color = Colors.white}) =>
      AppCard(color: color, child: child);

  @override
  Widget build(BuildContext context) {
    final count =
        int.tryParse(
          (_sent?['soNguoiChamSocNhan'] ?? _sent?['soNguoiChamSocDaThongBao'])
                  ?.toString() ??
              '',
        ) ??
        0;
    return Scaffold(
      backgroundColor: CareSeniorColors.background,
      body: SafeArea(
        bottom: false,
        child: ListView(
          key: const ValueKey('sos-list'),
          padding: const EdgeInsets.only(bottom: 32),
          children: [
            const AlertsScreenHeader(
              title: 'Cảnh báo khẩn cấp',
              subtitle: 'Kết nối với người chăm sóc khi cần giúp đỡ',
              emergency: true,
            ),
            const SizedBox(height: 24),
            Padding(
              padding: const EdgeInsets.symmetric(horizontal: 20),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  _card(
                    Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        const Text(
                          'Nhấn và giữ 3 giây để gửi cảnh báo',
                          style: TextStyle(
                            fontSize: 23,
                            fontWeight: FontWeight.bold,
                            color: red,
                          ),
                        ),
                        const SizedBox(height: 8),
                        const Text(
                          'Nhấn giữ nút SOS đủ 3 giây để gửi cảnh báo cho người chăm sóc và quản trị viên.',
                          style: TextStyle(fontSize: 16),
                        ),
                        const SizedBox(height: 26),
                        Center(
                          child: GestureDetector(
                            key: const ValueKey('sos-hold-target'),
                            behavior: HitTestBehavior.opaque,
                            onTapDown: _startHold,
                            onTapUp: (_) => _stopHold(),
                            onTapCancel: _stopHold,
                            child: AnimatedBuilder(
                              animation: _hold,
                              builder: (context, _) => SosHoldVisual(
                                progress: _hold.value,
                                sending: _sending,
                              ),
                            ),
                          ),
                        ),
                        const SizedBox(height: 20),
                        Center(
                          child: Text(
                            _gettingPosition
                                ? 'Đang lấy vị trí...'
                                : _sending
                                ? 'Đang gửi cảnh báo...'
                                : _releasedEarly
                                ? 'Giữ đủ 3 giây để gửi SOS'
                                : 'Giữ nút SOS trong 3 giây',
                            textAlign: TextAlign.center,
                            style: const TextStyle(
                              fontSize: 17,
                              fontWeight: FontWeight.w700,
                              color: red,
                            ),
                          ),
                        ),
                      ],
                    ),
                    color: CareSeniorColors.dangerSurface,
                  ),
                  if (_sent != null) ...[
                    const SizedBox(height: 16),
                    _card(
                      Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          const Text(
                            'Đã gửi cảnh báo',
                            style: TextStyle(
                              fontSize: 21,
                              fontWeight: FontWeight.bold,
                              color: teal,
                            ),
                          ),
                          const SizedBox(height: 8),
                          Text(
                            count == 0
                                ? 'Bạn chưa có người chăm sóc, cảnh báo đã gửi tới quản trị viên.'
                                : 'Đã gửi cảnh báo tới $count người chăm sóc.',
                            style: const TextStyle(fontSize: 17),
                          ),
                          if (_sent?['trungLap'] == true)
                            const Text(
                              'SOS trước đó đã được ghi nhận; không tạo cảnh báo trùng.',
                              style: TextStyle(fontSize: 16),
                            ),
                          if (_locationNote != null)
                            Text(
                              _locationNote!,
                              style: const TextStyle(fontSize: 16),
                            ),
                          if (_sent?['viDo'] != null &&
                              _sent?['kinhDo'] != null)
                            Text(
                              'Tọa độ: ${_sent!['viDo']}, ${_sent!['kinhDo']}',
                              style: const TextStyle(fontSize: 16),
                            ),
                          Text(
                            'Giờ gửi: ${alertsDisplayTime(_sent?['ngayGui'] ?? 'Vừa xong')}',
                            style: const TextStyle(fontSize: 16),
                          ),
                        ],
                      ),
                    ),
                  ],
                  if (_error != null) ...[
                    const SizedBox(height: 16),
                    _card(
                      Column(
                        crossAxisAlignment: CrossAxisAlignment.stretch,
                        children: [
                          Text(
                            _error!,
                            style: const TextStyle(fontSize: 16, color: red),
                          ),
                          const SizedBox(height: 12),
                          FilledButton(
                            onPressed: _send,
                            child: const Text('Thử lại'),
                          ),
                        ],
                      ),
                      color: CareSeniorColors.dangerSurface,
                    ),
                  ],
                  const SizedBox(height: 16),
                  _card(
                    Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        const Text(
                          'Cảnh báo gần nhất',
                          style: TextStyle(
                            fontSize: 20,
                            fontWeight: FontWeight.bold,
                          ),
                        ),
                        const SizedBox(height: 8),
                        if (_latest == null)
                          const Text(
                            'Chưa có cảnh báo SOS.',
                            style: TextStyle(fontSize: 16),
                          )
                        else
                          AlertsBadge(
                            label: _latestStatus,
                            color: _latestStatus == 'Đã xử lý' ? teal : red,
                            background: _latestStatus == 'Đã xử lý'
                                ? CareSeniorColors.mint
                                : CareSeniorColors.dangerSurface,
                          ),
                        if (_latest != null) ...[
                          const SizedBox(height: 8),
                          Text(
                            alertsDisplayTime(_latest?['ngayGui']),
                            style: const TextStyle(fontSize: 16),
                          ),
                        ],
                      ],
                    ),
                  ),
                  const SizedBox(height: 16),
                  _card(
                    Column(
                      crossAxisAlignment: CrossAxisAlignment.stretch,
                      children: [
                        const Text(
                          'Gọi thủ công khi cần',
                          style: TextStyle(
                            fontSize: 20,
                            fontWeight: FontWeight.bold,
                          ),
                        ),
                        const SizedBox(height: 10),
                        if (_caregivers.isEmpty)
                          const Text(
                            'Chưa có người chăm sóc được phân công.',
                            style: TextStyle(fontSize: 16),
                          ),
                        ..._caregivers.map(
                          (person) => Padding(
                            padding: const EdgeInsets.only(bottom: 8),
                            child: OutlinedButton(
                              onPressed: () =>
                                  _call(person['soDienThoai']?.toString()),
                              child: Padding(
                                padding: const EdgeInsets.symmetric(
                                  vertical: 12,
                                ),
                                child: Row(
                                  children: [
                                    const Icon(Icons.call),
                                    const SizedBox(width: 12),
                                    Expanded(
                                      child: Text(
                                        'Gọi ${person['hoTen'] ?? 'người chăm sóc'}',
                                        style: const TextStyle(fontSize: 16),
                                      ),
                                    ),
                                  ],
                                ),
                              ),
                            ),
                          ),
                        ),
                        FilledButton(
                          onPressed: () => _call('115'),
                          style: FilledButton.styleFrom(backgroundColor: red),
                          child: const Padding(
                            padding: EdgeInsets.symmetric(vertical: 12),
                            child: Row(
                              children: [
                                Icon(Icons.call),
                                SizedBox(width: 12),
                                Expanded(
                                  child: Text(
                                    'Gọi 115 (thủ công)',
                                    style: TextStyle(fontSize: 16),
                                  ),
                                ),
                              ],
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
    );
  }
}
