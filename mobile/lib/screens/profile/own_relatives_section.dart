import 'package:dio/dio.dart';
import 'package:flutter/material.dart';
import '../../services/api_client.dart';
import '../../services/own_relatives_service.dart';
import '../../theme/care_senior_theme.dart';
import '../../widgets/care_senior_ui.dart';

class OwnRelativesSection extends StatefulWidget {
  const OwnRelativesSection({super.key, required this.elderlyId});
  final int elderlyId;
  @override
  State<OwnRelativesSection> createState() => _OwnRelativesSectionState();
}

class _OwnRelativesSectionState extends State<OwnRelativesSection>
    with WidgetsBindingObserver {
  List<Map<String, dynamic>> _rows = [];
  String? _error;
  bool _loading = true;
  int _revision = 0;
  late final int _session;
  CancelToken? _cancel;
  @override
  void initState() {
    super.initState();
    _session = ApiClient.sessionVersion;
    WidgetsBinding.instance.addObserver(this);
    ApiClient.sessionChanges.addListener(_sessionChanged);
    _load();
  }

  void _sessionChanged() {
    _revision++;
    _cancel?.cancel();
    if (mounted) {
      setState(() {
        _rows = [];
        _loading = false;
        _error = 'Phiên đăng nhập đã thay đổi.';
      });
    }
  }

  @override
  void didUpdateWidget(covariant OwnRelativesSection oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (oldWidget.elderlyId != widget.elderlyId) _load();
  }

  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    if (state == AppLifecycleState.resumed &&
        _session == ApiClient.sessionVersion) {
      _load();
    }
  }

  Future<void> _load() async {
    if (_session != ApiClient.sessionVersion) return;
    final revision = ++_revision;
    _cancel?.cancel();
    final cancel = CancelToken();
    _cancel = cancel;
    setState(() {
      _loading = true;
      _rows = [];
      _error = null;
    });
    try {
      final rows = await getMyRelatives(
        elderlyId: widget.elderlyId,
        cancelToken: cancel,
      );
      if (mounted &&
          revision == _revision &&
          _session == ApiClient.sessionVersion) {
        setState(() {
          _rows = rows;
          _loading = false;
        });
      }
    } catch (error) {
      if (mounted &&
          revision == _revision &&
          _session == ApiClient.sessionVersion) {
        setState(() {
          _rows = [];
          _loading = false;
          _error = error is ApiException
              ? error.message
              : 'Không thể tải Người thân. Vui lòng thử lại.';
        });
      }
    }
  }

  @override
  void dispose() {
    _revision++;
    _cancel?.cancel();
    ApiClient.sessionChanges.removeListener(_sessionChanged);
    WidgetsBinding.instance.removeObserver(this);
    super.dispose();
  }

  @override
  Widget build(BuildContext context) => AppCard(
    key: const ValueKey('own-relatives-section'),
    child: Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        const Text(
          'Người thân được phép theo dõi',
          style: TextStyle(fontSize: 20, fontWeight: FontWeight.w800),
        ),
        const SizedBox(height: 8),
        const Text('Quyền theo dõi do Admin quản lý theo sự đồng ý chia sẻ.'),
        const SizedBox(height: 12),
        if (_loading)
          const Column(
            children: [
              CircularProgressIndicator(),
              SizedBox(height: 8),
              Text('Đang tải Người thân…'),
            ],
          )
        else if (_error != null)
          Text(_error!, style: const TextStyle(color: CareSeniorColors.danger))
        else if (_rows.isEmpty)
          const Text(
            'Chưa có Người thân được liên kết. Hãy liên hệ Admin nếu cần hỗ trợ.',
          )
        else
          ..._rows.map((row) {
            final scope = row['phamViChiaSe'] as Map;
            final shared = relativeScopeLabels.entries
                .where((entry) => scope[entry.key] == true)
                .map((entry) => entry.value)
                .toList();
            final private = ['benhNen', 'diUng', 'ketQuaKham']
                .where((key) => scope[key] != true)
                .map((key) => relativeScopeLabels[key]!)
                .toList();
            final phone = row['soDienThoai']?.toString().trim() ?? '';
            return Padding(
              padding: const EdgeInsets.symmetric(vertical: 12),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  const Divider(),
                  Text(
                    row['hoTen']?.toString() ?? 'Chưa cập nhật họ tên',
                    style: const TextStyle(
                      fontSize: 18,
                      fontWeight: FontWeight.w700,
                    ),
                  ),
                  Text(
                    '${row['moiQuanHe'] ?? 'Chưa cập nhật quan hệ'} · Đang liên kết',
                  ),
                  const SizedBox(height: 8),
                  Text(
                    'Số điện thoại: ${phone.isEmpty ? 'Chưa cập nhật' : phone}',
                  ),
                  const SizedBox(height: 10),
                  Text(
                    'Được xem: ${shared.isEmpty ? 'Hiện chưa có quyền xem dữ liệu' : shared.join(', ')}.',
                  ),
                  const SizedBox(height: 8),
                  Text(
                    private.isEmpty
                        ? 'Bệnh nền, dị ứng và kết quả khám đã được đồng ý chia sẻ.'
                        : 'Không chia sẻ: ${private.join(', ')}.',
                  ),
                ],
              ),
            );
          }),
        const SizedBox(height: 12),
        OutlinedButton.icon(
          onPressed: _loading || _session != ApiClient.sessionVersion
              ? null
              : _load,
          icon: const Icon(Icons.refresh_rounded),
          label: const Text('Tải lại Người thân'),
        ),
      ],
    ),
  );
}
