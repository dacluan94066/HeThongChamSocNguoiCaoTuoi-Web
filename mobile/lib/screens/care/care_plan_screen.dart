import 'package:flutter/material.dart';
import '../../services/api_client.dart';
import '../../services/care_today_service.dart';

const careCategories = {
  'nutrition': 'Ăn uống',
  'water': 'Uống nước',
  'exercise': 'Vận động',
  'rest': 'Nghỉ ngơi',
  'hygiene': 'Vệ sinh',
  'monitoring': 'Theo dõi sức khỏe',
};

class CarePlanScreen extends StatefulWidget {
  const CarePlanScreen({
    super.key,
    required this.profileId,
    required this.canWrite,
    this.service = const CareTodayService(),
  });
  final int profileId;
  final bool canWrite;
  final CareTodayService service;
  @override
  State<CarePlanScreen> createState() => _CarePlanScreenState();
}

class _CarePlanScreenState extends State<CarePlanScreen> {
  Map<String, dynamic>? _data;
  String? _error;
  int _sequence = 0;
  final _session = ApiClient.sessionVersion;
  @override
  void initState() {
    super.initState();
    ApiClient.sessionChanges.addListener(_invalidate);
    _load();
  }

  void _invalidate() {
    _sequence++;
    if (mounted) {
      setState(() {
        _data = null;
        _error = 'Phiên đã thay đổi. Hãy đăng nhập lại.';
      });
    }
  }

  @override
  void didUpdateWidget(covariant CarePlanScreen oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (oldWidget.profileId != widget.profileId) _load();
  }

  @override
  void dispose() {
    ApiClient.sessionChanges.removeListener(_invalidate);
    super.dispose();
  }

  Future<void> _load() async {
    if (_session != ApiClient.sessionVersion) return;
    if (mounted) {
      setState(() {
        _data = null;
        _error = null;
      });
    }
    final seq = ++_sequence;
    try {
      final d = await widget.service.plans(widget.profileId);
      if (mounted && seq == _sequence && _session == ApiClient.sessionVersion) {
        setState(() {
          _data = d;
          _error = null;
        });
      }
    } catch (e) {
      if (mounted && seq == _sequence) {
        setState(
          () => _error = e is ApiException
              ? e.message
              : 'Không thể tải kế hoạch.',
        );
      }
    }
  }

  @override
  Widget build(BuildContext context) => Scaffold(
    appBar: AppBar(title: const Text('Kế hoạch chăm sóc')),
    body: SafeArea(
      child: RefreshIndicator(
        onRefresh: _load,
        child: ListView(
          physics: const AlwaysScrollableScrollPhysics(),
          padding: const EdgeInsets.all(16),
          children: [
            const Text(
              'Các kế hoạch có hoạt động trong 7 ngày tới. Chỉ chăm sóc sinh hoạt, không thay chỉ định điều trị.',
            ),
            if (_data?['canWrite'] == true &&
                widget.canWrite &&
                _session == ApiClient.sessionVersion)
              FilledButton.icon(
                onPressed: () async {
                  await Navigator.push(
                    context,
                    MaterialPageRoute(
                      builder: (_) => CreateCarePlanScreen(
                        profileId: widget.profileId,
                        service: widget.service,
                      ),
                    ),
                  );
                  await _load();
                },
                icon: const Icon(Icons.add),
                label: const Text('Tạo kế hoạch'),
              ),
            if (_error != null) ...[
              Text(_error!),
              TextButton(
                onPressed: _session == ApiClient.sessionVersion ? _load : null,
                child: const Text('Thử lại'),
              ),
            ] else if (_data == null)
              const Center(child: CircularProgressIndicator())
            else ...[
              if ((_data!['plans'] as List).isEmpty)
                const Text('Chưa có kế hoạch trong khoảng này.'),
              ...(_data!['plans'] as List).map(
                (p) => Card(
                  elevation: 0,
                  child: ExpansionTile(
                    title: Text(p['ten'].toString()),
                    subtitle: Text(
                      '${p['ngayBatDau']} → ${p['ngayKetThuc']}\n${p['mucTieu']}',
                    ),
                    children: [
                      Text(
                        'Người tạo: ${p['nguoiTao'] ?? 'Chưa ghi nhận'} • ${p['ngayTao']}',
                      ),
                      ...(p['hoatDong'] as List).map(
                        (a) => ListTile(
                          title: Text(a['ten'].toString()),
                          subtitle: Text(
                            '${careCategories[a['loai']]} • ${a['gio']} • Thứ: ${a['thu']} (7=CN)',
                          ),
                        ),
                      ),
                    ],
                  ),
                ),
              ),
              const Text(
                'Lịch thực hiện',
                style: TextStyle(fontSize: 20, fontWeight: FontWeight.bold),
              ),
              ...(_data!['occurrences'] as List).map(
                (o) => ListTile(
                  title: Text(o['ten'].toString()),
                  subtitle: Text(
                    '${o['thoiGian']}\n${o['trangThai'] == 'completed'
                        ? 'Đã xác nhận bởi ${o['nguoiXacNhan'] ?? 'người chăm sóc'} lúc ${o['thoiDiemXacNhan']}'
                        : o['trangThai'] == 'upcoming'
                        ? 'Sắp tới'
                        : 'Chưa có xác nhận'}',
                  ),
                ),
              ),
            ],
          ],
        ),
      ),
    ),
  );
}

class CreateCarePlanScreen extends StatefulWidget {
  const CreateCarePlanScreen({
    super.key,
    required this.profileId,
    required this.service,
  });
  final int profileId;
  final CareTodayService service;
  @override
  State<CreateCarePlanScreen> createState() => _CreateCarePlanScreenState();
}

class _CreateCarePlanScreenState extends State<CreateCarePlanScreen> {
  final _form = GlobalKey<FormState>();
  final _name = TextEditingController(), _goal = TextEditingController();
  late DateTime _start, _end;
  final List<Map<String, dynamic>> _activities = [];
  bool _saving = false;
  String? _error;
  final _session = ApiClient.sessionVersion;
  @override
  void initState() {
    super.initState();
    final now = DateTime.now().toUtc().add(const Duration(hours: 7));
    _start = DateTime(now.year, now.month, now.day);
    _end = _start.add(const Duration(days: 6));
    ApiClient.sessionChanges.addListener(_invalidateDraft);
  }

  void _invalidateDraft() {
    if (!mounted) return;
    final ownRoute = ModalRoute.of(context);
    if (ownRoute != null && !ownRoute.isCurrent) {
      Navigator.of(context).popUntil((route) => route == ownRoute);
    }
    _name.clear();
    _goal.clear();
    setState(() {
      _activities.clear();
      _error = 'Phiên đã thay đổi; không thể lưu bản nháp này.';
    });
  }

  @override
  void dispose() {
    ApiClient.sessionChanges.removeListener(_invalidateDraft);
    _name.dispose();
    _goal.dispose();
    super.dispose();
  }

  Future<void> _activity() async {
    String type = 'nutrition', title = '';
    TimeOfDay time = const TimeOfDay(hour: 8, minute: 0);
    Set<int> days = {1, 2, 3, 4, 5, 6, 7};
    final activity = await showDialog<Map<String, dynamic>>(
      context: context,
      builder: (context) => StatefulBuilder(
        builder: (context, set) => AlertDialog(
          scrollable: true,
          title: const Text('Thêm hoạt động'),
          content: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              DropdownButtonFormField<String>(
                initialValue: type,
                isExpanded: true,
                items: careCategories.entries
                    .map(
                      (e) =>
                          DropdownMenuItem(value: e.key, child: Text(e.value)),
                    )
                    .toList(),
                onChanged: (v) => set(() => type = v!),
              ),
              TextField(
                maxLength: 120,
                decoration: const InputDecoration(labelText: 'Tên hoạt động'),
                onChanged: (v) => title = v,
              ),
              TextButton(
                onPressed: () async {
                  final t = await showTimePicker(
                    context: context,
                    initialTime: time,
                  );
                  if (t != null) set(() => time = t);
                },
                child: Text('Giờ ${time.format(context)}'),
              ),
              const Text('Chọn ngày lặp (7=CN)'),
              Wrap(
                children: List.generate(
                  7,
                  (i) => FilterChip(
                    label: Text('${i + 1}'),
                    selected: days.contains(i + 1),
                    onSelected: (selected) => set(
                      () => selected ? days.add(i + 1) : days.remove(i + 1),
                    ),
                  ),
                ),
              ),
            ],
          ),
          actions: [
            TextButton(
              onPressed: () => Navigator.pop(context),
              child: const Text('Hủy'),
            ),
            FilledButton(
              onPressed: () {
                if (title.trim().isEmpty || days.isEmpty) return;
                Navigator.pop(context, {
                  'loai': type,
                  'ten': title.trim(),
                  'gio':
                      '${time.hour.toString().padLeft(2, '0')}:${time.minute.toString().padLeft(2, '0')}',
                  'thu': days.toList()..sort(),
                });
              },
              child: const Text('Thêm'),
            ),
          ],
        ),
      ),
    );
    if (activity != null && mounted && _session == ApiClient.sessionVersion) {
      setState(() => _activities.add(activity));
    }
  }

  Future<void> _save() async {
    if (!_form.currentState!.validate() || _activities.isEmpty || _saving) {
      return;
    }
    if (_session != ApiClient.sessionVersion) {
      setState(() => _error = 'Phiên đã thay đổi; không thể lưu bản nháp này.');
      return;
    }
    setState(() {
      _saving = true;
      _error = null;
    });
    try {
      await widget.service.create(widget.profileId, {
        'ten': _name.text.trim(),
        'mucTieu': _goal.text.trim(),
        'ngayBatDau': _date(_start),
        'ngayKetThuc': _date(_end),
        'hoatDong': _activities,
      });
      if (mounted && _session == ApiClient.sessionVersion) {
        Navigator.pop(context);
      }
    } catch (e) {
      if (mounted) {
        setState(
          () => _error = e is ApiException
              ? e.message
              : 'Không lưu được. Bản nháp vẫn được giữ.',
        );
      }
    } finally {
      if (mounted) setState(() => _saving = false);
    }
  }

  static String _date(DateTime d) =>
      '${d.year}-${d.month.toString().padLeft(2, '0')}-${d.day.toString().padLeft(2, '0')}';
  @override
  Widget build(BuildContext context) => Scaffold(
    appBar: AppBar(title: const Text('Tạo kế hoạch')),
    body: SafeArea(
      child: Form(
        key: _form,
        child: ListView(
          padding: const EdgeInsets.all(16),
          children: [
            const Text(
              'Chỉ lập sinh hoạt chăm sóc, không kê thuốc hoặc mục tiêu điều trị.',
            ),
            TextFormField(
              controller: _name,
              maxLength: 120,
              enabled: !_saving,
              decoration: const InputDecoration(labelText: 'Tên kế hoạch'),
              validator: (v) =>
                  v == null || v.trim().isEmpty ? 'Nhập tên kế hoạch' : null,
            ),
            TextFormField(
              controller: _goal,
              maxLength: 500,
              minLines: 2,
              maxLines: 4,
              enabled: !_saving,
              decoration: const InputDecoration(
                labelText: 'Mục tiêu sinh hoạt',
              ),
              validator: (v) =>
                  v == null || v.trim().isEmpty ? 'Nhập mục tiêu' : null,
            ),
            TextButton(
              onPressed: _saving
                  ? null
                  : () async {
                      final d = await showDatePicker(
                        context: context,
                        initialDate: _start,
                        firstDate: DateTime(2020),
                        lastDate: DateTime(2100),
                      );
                      if (d != null && mounted) {
                        setState(() {
                          _start = d;
                          _end = d.add(const Duration(days: 6));
                        });
                      }
                    },
              child: Text('Bắt đầu: ${_date(_start)}'),
            ),
            TextButton(
              onPressed: _saving
                  ? null
                  : () async {
                      final d = await showDatePicker(
                        context: context,
                        initialDate: _end,
                        firstDate: _start,
                        lastDate: _start.add(const Duration(days: 89)),
                      );
                      if (d != null && mounted) setState(() => _end = d);
                    },
              child: Text('Kết thúc: ${_date(_end)} • tối đa 90 ngày'),
            ),
            ..._activities.asMap().entries.map(
              (e) => ListTile(
                title: Text(e.value['ten']),
                subtitle: Text('${e.value['gio']} • Thứ ${e.value['thu']}'),
                trailing: IconButton(
                  onPressed: _saving
                      ? null
                      : () => setState(() => _activities.removeAt(e.key)),
                  icon: const Icon(Icons.remove_circle_outline),
                ),
              ),
            ),
            OutlinedButton.icon(
              onPressed: _saving || _activities.length >= 20 ? null : _activity,
              icon: const Icon(Icons.add),
              label: const Text('Thêm hoạt động (tối đa 20)'),
            ),
            if (_error != null)
              Text(_error!, style: const TextStyle(color: Colors.red)),
            FilledButton(
              onPressed: _saving || _activities.isEmpty ? null : _save,
              child: Text(_saving ? 'Đang lưu…' : 'Lưu kế hoạch'),
            ),
          ],
        ),
      ),
    ),
  );
}
