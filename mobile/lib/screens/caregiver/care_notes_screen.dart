import 'package:flutter/material.dart';
import '../../services/api_client.dart';
import '../../services/care_notes_service.dart';
import '../../widgets/delete_care_note_dialog.dart';

class CareNotesScreen extends StatefulWidget {
  const CareNotesScreen({
    super.key,
    required this.elderlyId,
    required this.elderlyName,
    this.service,
  });
  final int elderlyId;
  final String elderlyName;
  final CareNotesService? service;
  @override
  State<CareNotesScreen> createState() => _CareNotesScreenState();
}

class _CareNotesScreenState extends State<CareNotesScreen> {
  late final CareNotesService _service = widget.service ?? CareNotesService();
  List<Map<String, dynamic>> _notes = [];
  bool _loading = true, _dialogOpen = false;
  String? _error;
  int _generation = 0;
  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    final generation = ++_generation, version = ApiClient.sessionVersion;
    setState(() {
      _loading = true;
      _error = null;
    });
    try {
      final notes = await _service.list(widget.elderlyId);
      if (!mounted ||
          generation != _generation ||
          version != ApiClient.sessionVersion) {
        return;
      }
      setState(() {
        _notes = notes;
        _loading = false;
      });
    } catch (error) {
      if (!mounted ||
          generation != _generation ||
          version != ApiClient.sessionVersion) {
        return;
      }
      setState(() {
        _loading = false;
        _error = error is ApiException
            ? error.message
            : 'Không tải được nhật ký. Hãy thử lại.';
      });
    }
  }

  Future<void> _add([Map<String, dynamic>? note]) async {
    if (_dialogOpen) return;
    _dialogOpen = true;
    final version = ApiClient.sessionVersion;
    try {
      final saved = await showDialog<bool>(
        context: context,
        barrierDismissible: false,
        builder: (_) => _NoteForm(
          elderlyId: widget.elderlyId,
          service: _service,
          note: note,
        ),
      );
      if (!mounted || version != ApiClient.sessionVersion || saved != true) {
        return;
      }
      ScaffoldMessenger.of(
        context,
      ).showSnackBar(const SnackBar(content: Text('Đã lưu nhật ký.')));
      await _load();
    } finally {
      _dialogOpen = false;
    }
  }

  Future<void> _delete(Map<String, dynamic> note) async {
    if (_dialogOpen) return;
    _dialogOpen = true;
    final version = ApiClient.sessionVersion;
    try {
      final deleted = await showDialog<bool>(
        context: context,
        barrierDismissible: false,
        builder: (_) => DeleteCareNoteDialog(note: note, service: _service),
      );
      if (!mounted || version != ApiClient.sessionVersion || deleted != true) {
        return;
      }
      ScaffoldMessenger.of(
        context,
      ).showSnackBar(const SnackBar(content: Text('Đã xóa nhật ký.')));
      await _load();
    } finally {
      _dialogOpen = false;
    }
  }

  @override
  Widget build(BuildContext context) => Scaffold(
    appBar: AppBar(title: Text('Nhật ký • ${widget.elderlyName}')),
    floatingActionButton: FloatingActionButton.extended(
      onPressed: () => _add(),
      icon: const Icon(Icons.add),
      label: const Text('Thêm nhật ký'),
    ),
    body: _loading
        ? const Center(child: CircularProgressIndicator())
        : _error != null
        ? Center(
            child: Padding(
              padding: const EdgeInsets.all(20),
              child: Column(
                mainAxisSize: MainAxisSize.min,
                children: [
                  Text(_error!, textAlign: TextAlign.center),
                  TextButton(onPressed: _load, child: const Text('Thử lại')),
                ],
              ),
            ),
          )
        : RefreshIndicator(
            onRefresh: _load,
            child: ListView(
              physics: const AlwaysScrollableScrollPhysics(),
              padding: const EdgeInsets.fromLTRB(16, 16, 16, 100),
              children: [
                if (_notes.isEmpty) const Text('Chưa có nhật ký chăm sóc.'),
                for (final note in _notes)
                  Card(
                    child: Padding(
                      padding: const EdgeInsets.all(16),
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text(
                            note['tieuDe']?.toString() ?? '',
                            style: const TextStyle(fontWeight: FontWeight.bold),
                          ),
                          const SizedBox(height: 8),
                          Text(note['noiDung']?.toString() ?? ''),
                          const SizedBox(height: 8),
                          Text(
                            '${note['ngay'] ?? ''} ${note['thoiGian'] ?? ''} • ${note['nguoiChamSocTen'] ?? 'Người chăm sóc'}',
                          ),
                          if (note['canEdit'] == true)
                            Wrap(
                              children: [
                                TextButton(
                                  onPressed: () => _add(note),
                                  child: const Text('Sửa nhật ký'),
                                ),
                                TextButton(
                                  onPressed: () => _delete(note),
                                  child: const Text('Xóa nhật ký'),
                                ),
                              ],
                            ),
                        ],
                      ),
                    ),
                  ),
              ],
            ),
          ),
  );
}

class _NoteForm extends StatefulWidget {
  const _NoteForm({required this.elderlyId, required this.service, this.note});
  final int elderlyId;
  final CareNotesService service;
  final Map<String, dynamic>? note;
  @override
  State<_NoteForm> createState() => _NoteFormState();
}

class _NoteFormState extends State<_NoteForm> {
  final _title = TextEditingController(), _content = TextEditingController();
  final _form = GlobalKey<FormState>();
  bool _saving = false;
  String? _error;
  final _version = ApiClient.sessionVersion;
  @override
  void initState() {
    super.initState();
    _title.text = widget.note?['tieuDe']?.toString() ?? '';
    _content.text = widget.note?['noiDung']?.toString() ?? '';
  }

  @override
  void dispose() {
    _title.dispose();
    _content.dispose();
    super.dispose();
  }

  Future<void> _save() async {
    if (_saving || _form.currentState?.validate() != true) return;
    if (_version != ApiClient.sessionVersion) {
      setState(
        () => _error = 'Phiên đăng nhập đã thay đổi. Hãy mở lại nhật ký.',
      );
      return;
    }
    setState(() {
      _saving = true;
      _error = null;
    });
    try {
      if (widget.note == null) {
        await widget.service.create(
          widget.elderlyId,
          _title.text,
          _content.text,
        );
      } else {
        await widget.service.update(widget.note!, _title.text, _content.text);
      }
      if (!mounted || _version != ApiClient.sessionVersion) return;
      Navigator.pop(context, true);
    } catch (error) {
      if (!mounted || _version != ApiClient.sessionVersion) return;
      setState(
        () => _error = error is ApiException
            ? error.message
            : 'Không lưu được nhật ký. Nội dung nhập vẫn được giữ.',
      );
    } finally {
      if (mounted) setState(() => _saving = false);
    }
  }

  @override
  Widget build(BuildContext context) => PopScope(
    canPop: !_saving,
    child: AlertDialog(
      scrollable: true,
      title: Text(
        widget.note == null ? 'Thêm nhật ký chăm sóc' : 'Sửa nhật ký chăm sóc',
      ),
      content: SingleChildScrollView(
        child: Form(
          key: _form,
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              TextFormField(
                controller: _title,
                enabled: !_saving,
                maxLength: 200,
                decoration: const InputDecoration(labelText: 'Tiêu đề'),
                validator: (value) =>
                    value?.trim().isEmpty != false ? 'Nhập tiêu đề' : null,
              ),
              TextFormField(
                controller: _content,
                enabled: !_saving,
                maxLength: 1000,
                minLines: 3,
                maxLines: 6,
                decoration: const InputDecoration(labelText: 'Nội dung'),
                validator: (value) =>
                    value?.trim().isEmpty != false ? 'Nhập nội dung' : null,
              ),
              if (_error != null)
                Text(
                  _error!,
                  style: TextStyle(color: Theme.of(context).colorScheme.error),
                ),
            ],
          ),
        ),
      ),
      actions: [
        TextButton(
          onPressed: _saving ? null : () => Navigator.pop(context, false),
          child: const Text('Hủy'),
        ),
        FilledButton(
          onPressed: _saving ? null : _save,
          child: Text(_saving ? 'Đang lưu…' : 'Lưu nhật ký'),
        ),
      ],
    ),
  );
}
