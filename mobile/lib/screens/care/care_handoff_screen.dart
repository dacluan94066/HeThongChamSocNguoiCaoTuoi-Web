import 'package:flutter/material.dart';
import '../../services/api_client.dart';
import '../../services/care_today_service.dart';
import 'care_lifestyle_screen.dart';

class CareHandoffScreen extends StatefulWidget {
  const CareHandoffScreen({
    super.key,
    required this.profileId,
    this.profileName = '',
    this.service = const CareTodayService(),
  });
  final int profileId;
  final String profileName;
  final CareTodayService service;
  @override
  State<CareHandoffScreen> createState() => _CareHandoffScreenState();
}

class _CareHandoffScreenState extends State<CareHandoffScreen> {
  final _session = ApiClient.sessionVersion;
  int _seq = 0, _days = 7;
  bool _loading = true, _saving = false;
  String? _error;
  Map<String, dynamic>? _data;
  BuildContext? _dialogContext;
  bool get _valid => mounted && _session == ApiClient.sessionVersion;
  @override
  void initState() {
    super.initState();
    ApiClient.sessionChanges.addListener(_invalidate);
    _load();
  }

  @override
  void didUpdateWidget(covariant CareHandoffScreen old) {
    super.didUpdateWidget(old);
    if (old.profileId != widget.profileId) {
      _closeDialog();
      _load();
    }
  }

  void _closeDialog() {
    final dialog = _dialogContext;
    _dialogContext = null;
    if (dialog != null &&
        dialog.mounted &&
        ModalRoute.of(dialog)?.isCurrent == true) {
      Navigator.of(dialog).pop();
    }
  }

  void _invalidate() {
    _seq++;
    if (mounted) {
      _closeDialog();
      setState(() {
        _data = null;
        _loading = false;
        _error = 'Phiên đã thay đổi. Hãy đăng nhập lại.';
      });
    }
  }

  @override
  void dispose() {
    ApiClient.sessionChanges.removeListener(_invalidate);
    super.dispose();
  }

  Future<void> _load() async {
    if (!_valid) return;
    final seq = ++_seq;
    setState(() {
      _data = null;
      _error = null;
      _loading = true;
    });
    final end = careNow();
    try {
      final data = Map<String, dynamic>.from(
        await widget.service.request(
              '/care/${widget.profileId}/handoffs',
              query: {
                'from': careDay(end.subtract(Duration(days: _days - 1))),
                'to': careDay(end),
              },
            )
            as Map,
      );
      if (_valid && seq == _seq) {
        setState(() {
          _data = data;
          _loading = false;
        });
      }
    } catch (e) {
      if (_valid && seq == _seq) {
        setState(() {
          _loading = false;
          _error = e is ApiException ? e.message : 'Không thể tải bàn giao.';
        });
      }
    }
  }

  void _notice(String s) {
    if (_valid) {
      ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(s)));
    }
  }

  Future<void> _edit([Map<String, dynamic>? row]) async {
    if (!_valid || _saving) return;
    await Navigator.push(
      context,
      MaterialPageRoute(
        builder: (_) => CareHandoffForm(
          profileId: widget.profileId,
          row: row,
          service: widget.service,
        ),
      ),
    );
    if (_valid) await _load();
  }

  Future<void> _ack(Map<String, dynamic> r) async {
    final id = widget.profileId;
    final yes = await showDialog<bool>(
      context: context,
      builder: (c) {
        _dialogContext = c;
        return AlertDialog(
          title: const Text('Xác nhận đã đọc?'),
          content: Text(
            'Xác nhận bạn đã đọc bàn giao phiên bản ${r['version']} của ${r['nguoiTao']}.',
          ),
          actions: [
            TextButton(
              onPressed: () => Navigator.pop(c, false),
              child: const Text('Hủy'),
            ),
            FilledButton(
              onPressed: () => Navigator.pop(c, true),
              child: const Text('Đã đọc'),
            ),
          ],
        );
      },
    );
    if (yes != true || !_valid || id != widget.profileId) return;
    setState(() => _saving = true);
    try {
      await widget.service.request(
        '/care/$id/handoffs/${r['id']}/read',
        method: 'POST',
        data: {'version': r['version']},
      );
      if (_valid) await _load();
    } catch (e) {
      _notice(
        e is ApiException ? e.message : 'Chưa lưu được xác nhận. Hãy tải lại.',
      );
    } finally {
      if (_valid) setState(() => _saving = false);
    }
  }

  Future<void> _history(Map<String, dynamic> r) async {
    final id = widget.profileId;
    try {
      final d = await widget.service.request(
        '/care/$id/handoffs/${r['id']}/history',
      );
      if (!_valid || id != widget.profileId) return;
      _showHistory(d['rows'] as List);
    } catch (e) {
      _notice(e is ApiException ? e.message : 'Không thể tải lịch sử.');
    }
  }

  void _showHistory(List rows) {
    showDialog<void>(
      context: context,
      builder: (c) {
        _dialogContext = c;
        return AlertDialog(
          title: const Text('Lịch sử bàn giao'),
          content: SizedBox(
            width: 400,
            child: ListView(
              shrinkWrap: true,
              children: rows
                  .map(
                    (r) => ListTile(
                      title: Text(
                        'Phiên bản ${r['version']} • ${r['nguoiSua']}',
                      ),
                      subtitle: Text(
                        '${careDisplay(r['thoiDiem'])}\nĐã làm: ${r['duLieu']['daLam']}\nCòn chờ: ${r['duLieu']['conCho']}\nLưu ý: ${r['duLieu']['luuY']}',
                      ),
                    ),
                  )
                  .toList(),
            ),
          ),
          actions: [
            TextButton(
              onPressed: () => Navigator.pop(c),
              child: const Text('Đóng'),
            ),
          ],
        );
      },
    );
  }

  @override
  Widget build(BuildContext context) => Scaffold(
    appBar: AppBar(
      title: const Text('Bàn giao chăm sóc'),
      actions: [
        IconButton(
          onPressed: _loading || _saving ? null : _load,
          icon: const Icon(Icons.refresh),
          tooltip: 'Tải lại',
        ),
      ],
    ),
    body: SafeArea(
      child: RefreshIndicator(
        onRefresh: _load,
        child: ListView(
          physics: const AlwaysScrollableScrollPhysics(),
          padding: const EdgeInsets.all(16),
          children: [
            Text(
              widget.profileName.isEmpty
                  ? 'Hồ sơ #${widget.profileId}'
                  : widget.profileName,
              style: const TextStyle(fontSize: 20, fontWeight: FontWeight.bold),
            ),
            const Text(
              'Nội bộ người chăm sóc đang được phân công. Xác nhận đọc chỉ áp dụng cho phiên bản bạn đã đọc.',
            ),
            Wrap(
              spacing: 8,
              children: [
                for (final days in [7, 30])
                  ChoiceChip(
                    label: Text('$days ngày'),
                    selected: _days == days,
                    onSelected: _saving || !_valid
                        ? null
                        : (_) {
                            setState(() => _days = days);
                            _load();
                          },
                  ),
              ],
            ),
            if (_loading)
              const Center(child: CircularProgressIndicator())
            else if (_error != null) ...[
              Text(_error!),
              TextButton(
                onPressed: _valid ? _load : null,
                child: const Text('Thử lại'),
              ),
            ] else if (_data != null) ...[
              FilledButton.icon(
                onPressed: _saving ? null : () => _edit(),
                icon: const Icon(Icons.add),
                label: const Text('Tạo bàn giao'),
              ),
              if (_data!['truncated'] == true)
                const Text(
                  'Đang hiển thị 100 bàn giao gần nhất trong khoảng đã chọn.',
                ),
              if ((_data!['rows'] as List).isEmpty)
                const Text('Chưa có bàn giao trong khoảng này.'),
              ...(_data!['rows'] as List).map((raw) {
                final r = Map<String, dynamic>.from(raw as Map);
                return Card(
                  elevation: 0,
                  child: Padding(
                    padding: const EdgeInsets.all(12),
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(
                          '${r['nguoiTao']} • phiên bản ${r['version']}',
                          style: const TextStyle(
                            fontSize: 18,
                            fontWeight: FontWeight.bold,
                          ),
                        ),
                        Text(
                          'Tạo: ${careDisplay(r['ngayTao'])}\nCập nhật: ${careDisplay(r['ngaySua'])}',
                        ),
                        Text(
                          'Đã làm: ${r['daLam']}\nCòn chờ: ${r['conCho']}\nLưu ý: ${r['luuY']}',
                        ),
                        if (r['hasRead'] == true)
                          const Text('Bạn đã xác nhận đọc phiên bản này.'),
                        ...(r['readers'] as List? ?? []).map(
                          (a) => Text(
                            '${a['nguoiDoc']} đã đọc phiên bản ${a['version']} lúc ${careDisplay(a['thoiDiem'])}${a['isCurrent'] == true ? '' : ' (bản cũ)'}',
                          ),
                        ),
                        Wrap(
                          spacing: 8,
                          children: [
                            TextButton(
                              onPressed: _saving ? null : () => _history(r),
                              child: const Text('Lịch sử'),
                            ),
                            if (r['canEdit'] == true)
                              TextButton(
                                onPressed: _saving ? null : () => _edit(r),
                                child: const Text('Sửa'),
                              ),
                            if (r['canAck'] == true && r['hasRead'] != true)
                              FilledButton(
                                onPressed: _saving ? null : () => _ack(r),
                                child: const Text('Xác nhận đã đọc'),
                              ),
                          ],
                        ),
                      ],
                    ),
                  ),
                );
              }),
            ],
          ],
        ),
      ),
    ),
  );
}

class CareHandoffForm extends StatefulWidget {
  const CareHandoffForm({
    super.key,
    required this.profileId,
    this.row,
    this.service = const CareTodayService(),
  });
  final int profileId;
  final Map<String, dynamic>? row;
  final CareTodayService service;
  @override
  State<CareHandoffForm> createState() => _CareHandoffFormState();
}

class _CareHandoffFormState extends State<CareHandoffForm> {
  final _form = GlobalKey<FormState>(),
      _done = TextEditingController(),
      _pending = TextEditingController(),
      _attention = TextEditingController();
  final _session = ApiClient.sessionVersion, _key = careRequestId();
  bool _saving = false;
  String? _error;
  @override
  void initState() {
    super.initState();
    final r = widget.row;
    _done.text = r?['daLam']?.toString() ?? '';
    _pending.text = r?['conCho']?.toString() ?? '';
    _attention.text = r?['luuY']?.toString() ?? '';
    ApiClient.sessionChanges.addListener(_invalidate);
  }

  void _invalidate() {
    if (mounted) {
      _done.clear();
      _pending.clear();
      _attention.clear();
      setState(
        () => _error = 'Phiên đã thay đổi. Đóng bản nháp và đăng nhập lại.',
      );
    }
  }

  @override
  void dispose() {
    ApiClient.sessionChanges.removeListener(_invalidate);
    _done.dispose();
    _pending.dispose();
    _attention.dispose();
    super.dispose();
  }

  Future<void> _save() async {
    if (_saving ||
        _session != ApiClient.sessionVersion ||
        !_form.currentState!.validate()) {
      return;
    }
    if ([_done, _pending, _attention].every((c) => c.text.trim().isEmpty)) {
      setState(() => _error = 'Nhập ít nhất một phần bàn giao.');
      return;
    }
    setState(() {
      _saving = true;
      _error = null;
    });
    final body = <String, dynamic>{
      'daLam': _done.text.trim(),
      'conCho': _pending.text.trim(),
      'luuY': _attention.text.trim(),
      'requestId': _key,
      if (widget.row != null) 'version': widget.row!['version'],
    };
    try {
      await widget.service.request(
        '/care/${widget.profileId}/handoffs${widget.row == null ? '' : '/${widget.row!['id']}'}',
        method: widget.row == null ? 'POST' : 'PATCH',
        data: body,
      );
      if (mounted && _session == ApiClient.sessionVersion) {
        Navigator.pop(context, true);
      }
    } catch (e) {
      if (mounted && _session == ApiClient.sessionVersion) {
        setState(
          () => _error = e is ApiException
              ? e.message
              : 'Chưa lưu được. Bản nháp được giữ để thử lại.',
        );
      }
    } finally {
      if (mounted) setState(() => _saving = false);
    }
  }

  @override
  Widget build(BuildContext context) => PopScope(
    canPop: !_saving,
    child: Scaffold(
      appBar: AppBar(
        title: Text(widget.row == null ? 'Tạo bàn giao' : 'Sửa bàn giao'),
      ),
      body: SafeArea(
        child: Form(
          key: _form,
          child: ListView(
            padding: const EdgeInsets.all(16),
            children: [
              const Text(
                'Ghi chú nội bộ của người chăm sóc, không hiển thị cho người cao tuổi.',
              ),
              for (final e in [_done, _pending, _attention].asMap().entries)
                TextFormField(
                  controller: e.value,
                  enabled: !_saving,
                  minLines: 2,
                  maxLines: 5,
                  maxLength: 1000,
                  decoration: InputDecoration(
                    labelText: [
                      'Việc đã làm',
                      'Việc còn chờ',
                      'Điều cần lưu ý',
                    ][e.key],
                  ),
                ),
              if (_error != null)
                Text(_error!, style: const TextStyle(color: Colors.red)),
              FilledButton(
                onPressed: _saving || _session != ApiClient.sessionVersion
                    ? null
                    : _save,
                child: Text(_saving ? 'Đang lưu…' : 'Lưu bàn giao'),
              ),
            ],
          ),
        ),
      ),
    ),
  );
}
