import 'dart:math';
import 'package:flutter/material.dart';
import '../../services/api_client.dart';
import '../../services/care_today_service.dart';

const lifestyleLabels = {
  'meal': 'Bữa ăn',
  'water': 'Uống nước',
  'sleep': 'Giấc ngủ',
  'exercise': 'Vận động',
  'mood': 'Tâm trạng',
};
String careDay(DateTime d) =>
    '${d.year.toString().padLeft(4, '0')}-${d.month.toString().padLeft(2, '0')}-${d.day.toString().padLeft(2, '0')}';
DateTime careNow() {
  final n = DateTime.now().toUtc().add(const Duration(hours: 7));
  return DateTime(n.year, n.month, n.day, n.hour, n.minute);
}

String careTime(DateTime d) =>
    '${careDay(d)}T${d.hour.toString().padLeft(2, '0')}:${d.minute.toString().padLeft(2, '0')}:00';
String careDisplay(Object? v) =>
    v == null ? 'Chưa ghi nhận' : v.toString().replaceFirst('T', ' ');
String careRequestId() {
  final r = Random.secure();
  return List.generate(
    24,
    (_) => r.nextInt(256).toRadixString(16).padLeft(2, '0'),
  ).join();
}

class CareLifestyleScreen extends StatefulWidget {
  const CareLifestyleScreen({
    super.key,
    required this.profileId,
    this.profileName = '',
    this.service = const CareTodayService(),
  });
  final int profileId;
  final String profileName;
  final CareTodayService service;
  @override
  State<CareLifestyleScreen> createState() => _CareLifestyleScreenState();
}

class _CareLifestyleScreenState extends State<CareLifestyleScreen> {
  final _session = ApiClient.sessionVersion;
  int _sequence = 0;
  bool _loading = true, _saving = false;
  String? _error;
  Map<String, dynamic>? _data;
  BuildContext? _dialogContext;
  DateTime _day = careNow();
  bool get _valid => mounted && _session == ApiClient.sessionVersion;
  @override
  void initState() {
    super.initState();
    ApiClient.sessionChanges.addListener(_invalidate);
    _load();
  }

  @override
  void didUpdateWidget(covariant CareLifestyleScreen old) {
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
    _sequence++;
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
    final seq = ++_sequence;
    setState(() {
      _loading = true;
      _data = null;
      _error = null;
    });
    try {
      final d = Map<String, dynamic>.from(
        await widget.service.request(
              '/care/${widget.profileId}/lifestyle',
              query: {'from': careDay(_day), 'to': careDay(_day)},
            )
            as Map,
      );
      if (_valid && seq == _sequence) {
        setState(() {
          _data = d;
          _loading = false;
        });
      }
    } catch (e) {
      if (_valid && seq == _sequence) {
        setState(() {
          _loading = false;
          _error = e is ApiException ? e.message : 'Không thể tải sinh hoạt.';
        });
      }
    }
  }

  void _notice(String s) {
    if (_valid) {
      ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(s)));
    }
  }

  Future<void> _edit([Map<String, dynamic>? r]) async {
    if (!_valid || _saving) return;
    await Navigator.push(
      context,
      MaterialPageRoute(
        builder: (_) => CareLifestyleForm(
          profileId: widget.profileId,
          row: r,
          service: widget.service,
        ),
      ),
    );
    if (_valid) await _load();
  }

  Future<void> _remove(Map<String, dynamic> r) async {
    final id = widget.profileId;
    final yes = await showDialog<bool>(
      context: context,
      builder: (c) {
        _dialogContext = c;
        return AlertDialog(
          title: const Text('Xóa bản ghi sinh hoạt?'),
          content: const Text(
            'Bản ghi sẽ không còn trong tổng hợp. Lịch sử vẫn được giữ.',
          ),
          actions: [
            TextButton(
              onPressed: () => Navigator.pop(c, false),
              child: const Text('Hủy'),
            ),
            FilledButton(
              onPressed: () => Navigator.pop(c, true),
              child: const Text('Xóa'),
            ),
          ],
        );
      },
    );
    if (yes != true || !_valid || id != widget.profileId) return;
    setState(() => _saving = true);
    try {
      await widget.service.request(
        '/care/$id/lifestyle/${r['id']}',
        method: 'DELETE',
        data: {'version': r['version']},
      );
      if (_valid) await _load();
    } catch (e) {
      _notice(
        e is ApiException
            ? e.message
            : 'Chưa xóa được. Hãy tải lại trước khi thử tiếp.',
      );
    } finally {
      if (_valid) setState(() => _saving = false);
    }
  }

  Future<void> _history(Map<String, dynamic> r) async {
    final id = widget.profileId;
    try {
      final d = await widget.service.request(
        '/care/$id/lifestyle/${r['id']}/history',
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
          title: const Text('Lịch sử sinh hoạt'),
          content: SizedBox(
            width: 400,
            child: ListView(
              shrinkWrap: true,
              children: rows
                  .map(
                    (r) => ListTile(
                      title: Text('Lần ${r['version']} • ${r['nguoiSua']}'),
                      subtitle: Text(
                        '${careDisplay(r['thoiDiem'])}\n${r['duLieu']['deleted'] == true ? 'Đã xóa' : r['duLieu']['noiDung']}',
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

  Future<void> _pickDay() async {
    final d = await showDatePicker(
      context: context,
      initialDate: _day,
      firstDate: DateTime(2000),
      lastDate: careNow(),
    );
    if (d != null && _valid) {
      setState(() => _day = d);
      await _load();
    }
  }

  @override
  Widget build(BuildContext context) {
    final d = _data, tot = d?['totals'];
    return Scaffold(
      appBar: AppBar(
        title: const Text('Sinh hoạt hằng ngày'),
        actions: [
          IconButton(
            onPressed: _saving || _loading ? null : _load,
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
                style: const TextStyle(
                  fontSize: 20,
                  fontWeight: FontWeight.bold,
                ),
              ),
              OutlinedButton.icon(
                onPressed: _saving || !_valid ? null : _pickDay,
                icon: const Icon(Icons.calendar_today),
                label: Text('${careDay(_day)} • Giờ Việt Nam'),
              ),
              if (_loading)
                const Center(child: CircularProgressIndicator())
              else if (_error != null) ...[
                Text(_error!),
                TextButton(
                  onPressed: _valid ? _load : null,
                  child: const Text('Thử lại'),
                ),
              ] else if (d != null) ...[
                const Text(
                  'Tổng hợp từ bản ghi. Chưa ghi nhận khác với 0; không tự đặt mục tiêu điều trị.',
                ),
                Text(
                  'Bữa ăn: ${careDisplay(tot['mealCount'])}\nNước: ${careDisplay(tot['waterMl'])} ml\nNgủ trong ngày: ${careDisplay(tot['sleepMinutes'])} phút\nVận động: ${careDisplay(tot['exerciseMinutes'])} phút\nTâm trạng: ${careDisplay(tot['moodCount'])} bản ghi',
                ),
                if (d['canWrite'] == true)
                  FilledButton.icon(
                    onPressed: _saving ? null : () => _edit(),
                    icon: const Icon(Icons.add),
                    label: const Text('Ghi sinh hoạt'),
                  ),
                if ((d['rows'] as List).isEmpty)
                  const Padding(
                    padding: EdgeInsets.all(20),
                    child: Text('Chưa ghi nhận sinh hoạt trong ngày này.'),
                  ),
                ...(d['rows'] as List).map((raw) {
                  final r = Map<String, dynamic>.from(raw as Map);
                  return Card(
                    elevation: 0,
                    child: Padding(
                      padding: const EdgeInsets.all(12),
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text(
                            '${lifestyleLabels[r['loai']]} • ${r['noiDung']}',
                            style: const TextStyle(
                              fontSize: 18,
                              fontWeight: FontWeight.bold,
                            ),
                          ),
                          Text(
                            '${careDisplay(r['thoiGian'])}${r['ketThuc'] == null ? '' : ' → ${careDisplay(r['ketThuc'])}'}\nNgười ghi: ${r['nguoiGhi']}',
                          ),
                          if (r['luong'] != null)
                            Text(
                              '${r['luong']} ${r['loai'] == 'water' ? 'ml' : 'phút'}',
                            ),
                          if (r['ghiChu']?.toString().isNotEmpty == true)
                            Text(r['ghiChu'].toString()),
                          Wrap(
                            spacing: 8,
                            children: [
                              TextButton(
                                onPressed: _saving ? null : () => _history(r),
                                child: const Text('Lịch sử'),
                              ),
                              if (r['canEdit'] == true) ...[
                                TextButton(
                                  onPressed: _saving ? null : () => _edit(r),
                                  child: const Text('Sửa'),
                                ),
                                TextButton(
                                  onPressed: _saving ? null : () => _remove(r),
                                  child: const Text('Xóa'),
                                ),
                              ],
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
}

class CareLifestyleForm extends StatefulWidget {
  const CareLifestyleForm({
    super.key,
    required this.profileId,
    this.row,
    this.service = const CareTodayService(),
  });
  final int profileId;
  final Map<String, dynamic>? row;
  final CareTodayService service;
  @override
  State<CareLifestyleForm> createState() => _CareLifestyleFormState();
}

class _CareLifestyleFormState extends State<CareLifestyleForm> {
  final _form = GlobalKey<FormState>(),
      _content = TextEditingController(),
      _notes = TextEditingController(),
      _amount = TextEditingController();
  final _session = ApiClient.sessionVersion, _key = careRequestId();
  String _kind = 'meal';
  DateTime _at = careNow(), _end = careNow();
  bool _saving = false;
  String? _error;
  @override
  void initState() {
    super.initState();
    final r = widget.row;
    if (r != null) {
      _kind = r['loai'] as String;
      _at = DateTime.parse(r['thoiGian'] as String);
      _end = DateTime.tryParse(r['ketThuc']?.toString() ?? '') ?? careNow();
      _content.text = r['noiDung']?.toString() ?? '';
      _notes.text = r['ghiChu']?.toString() ?? '';
      _amount.text = r['luong']?.toString() ?? '';
    }
    ApiClient.sessionChanges.addListener(_invalidate);
  }

  void _invalidate() {
    if (mounted) {
      _content.clear();
      _notes.clear();
      _amount.clear();
      setState(
        () => _error = 'Phiên đã thay đổi. Đóng bản nháp và đăng nhập lại.',
      );
    }
  }

  @override
  void dispose() {
    ApiClient.sessionChanges.removeListener(_invalidate);
    _content.dispose();
    _notes.dispose();
    _amount.dispose();
    super.dispose();
  }

  Future<void> _pick(bool end) async {
    final current = end ? _end : _at;
    final date = await showDatePicker(
      context: context,
      initialDate: current,
      firstDate: DateTime(2000),
      lastDate: careNow(),
    );
    if (date == null || !mounted || _session != ApiClient.sessionVersion) {
      return;
    }
    final time = await showTimePicker(
      context: context,
      initialTime: TimeOfDay.fromDateTime(current),
    );
    if (time != null && mounted && _session == ApiClient.sessionVersion) {
      setState(() {
        final v = DateTime(
          date.year,
          date.month,
          date.day,
          time.hour,
          time.minute,
        );
        if (end) {
          _end = v;
        } else {
          _at = v;
        }
      });
    }
  }

  Future<void> _save() async {
    if (_saving ||
        _session != ApiClient.sessionVersion ||
        !_form.currentState!.validate()) {
      return;
    }
    setState(() {
      _saving = true;
      _error = null;
    });
    final body = <String, dynamic>{
      'loai': _kind,
      'thoiGian': careTime(_at),
      'noiDung': _content.text.trim(),
      'ghiChu': _notes.text.trim(),
      'requestId': _key,
      if (widget.row != null) 'version': widget.row!['version'],
      if (['water', 'exercise'].contains(_kind))
        'luong': num.parse(_amount.text.replaceAll(',', '.')),
      if (_kind == 'sleep') 'ketThuc': careTime(_end),
    };
    try {
      await widget.service.request(
        '/care/${widget.profileId}/lifestyle${widget.row == null ? '' : '/${widget.row!['id']}'}',
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
        title: Text(widget.row == null ? 'Ghi sinh hoạt' : 'Sửa sinh hoạt'),
      ),
      body: SafeArea(
        child: Form(
          key: _form,
          child: ListView(
            padding: const EdgeInsets.all(16),
            children: [
              const Text(
                'Ghi sự việc đã diễn ra theo giờ Việt Nam. Giấc ngủ có thể kết thúc vào ngày hôm sau.',
              ),
              DropdownButtonFormField<String>(
                initialValue: _kind,
                isExpanded: true,
                decoration: const InputDecoration(labelText: 'Loại sinh hoạt'),
                items: lifestyleLabels.entries
                    .map(
                      (e) =>
                          DropdownMenuItem(value: e.key, child: Text(e.value)),
                    )
                    .toList(),
                onChanged: _saving ? null : (v) => setState(() => _kind = v!),
              ),
              TextFormField(
                controller: _content,
                enabled: !_saving,
                maxLength: 200,
                decoration: const InputDecoration(labelText: 'Nội dung'),
                validator: (v) =>
                    v?.trim().isEmpty != false ? 'Nhập nội dung' : null,
              ),
              OutlinedButton(
                onPressed: _saving ? null : () => _pick(false),
                child: Text(
                  '${_kind == 'sleep' ? 'Bắt đầu' : 'Thời điểm'}: ${careDisplay(careTime(_at))}',
                ),
              ),
              if (_kind == 'sleep')
                OutlinedButton(
                  onPressed: _saving ? null : () => _pick(true),
                  child: Text('Kết thúc: ${careDisplay(careTime(_end))}'),
                ),
              if (['water', 'exercise'].contains(_kind))
                TextFormField(
                  controller: _amount,
                  enabled: !_saving,
                  keyboardType: const TextInputType.numberWithOptions(
                    decimal: true,
                  ),
                  decoration: InputDecoration(
                    labelText: _kind == 'water'
                        ? 'Lượng nước (ml)'
                        : 'Thời gian vận động (phút)',
                  ),
                  validator: (v) {
                    final n = num.tryParse((v ?? '').replaceAll(',', '.'));
                    return n == null || !n.isFinite || n < 0
                        ? 'Nhập số không âm'
                        : null;
                  },
                ),
              TextFormField(
                controller: _notes,
                enabled: !_saving,
                maxLength: 500,
                minLines: 2,
                maxLines: 4,
                decoration: const InputDecoration(
                  labelText: 'Ghi chú (không bắt buộc)',
                ),
              ),
              if (_error != null)
                Text(_error!, style: const TextStyle(color: Colors.red)),
              FilledButton(
                onPressed: _saving || _session != ApiClient.sessionVersion
                    ? null
                    : _save,
                child: Text(_saving ? 'Đang lưu…' : 'Lưu bản ghi'),
              ),
            ],
          ),
        ),
      ),
    ),
  );
}
