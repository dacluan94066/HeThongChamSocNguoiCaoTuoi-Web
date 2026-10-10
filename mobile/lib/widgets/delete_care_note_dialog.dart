import 'package:flutter/material.dart';
import '../services/api_client.dart';
import '../services/care_notes_service.dart';

class DeleteCareNoteDialog extends StatefulWidget {
  const DeleteCareNoteDialog({
    super.key,
    required this.note,
    required this.service,
  });
  final Map<String, dynamic> note;
  final CareNotesService service;
  @override
  State<DeleteCareNoteDialog> createState() => _DeleteCareNoteDialogState();
}

class _DeleteCareNoteDialogState extends State<DeleteCareNoteDialog> {
  final _version = ApiClient.sessionVersion;
  bool _saving = false;
  String? _error;
  Future<void> _delete() async {
    if (_saving) return;
    if (_version != ApiClient.sessionVersion) {
      setState(() => _error = 'Phiên đã thay đổi. Hãy mở lại nhật ký.');
      return;
    }
    setState(() {
      _saving = true;
      _error = null;
    });
    try {
      await widget.service.remove(widget.note);
      if (!mounted || _version != ApiClient.sessionVersion) return;
      Navigator.pop(context, true);
    } catch (error) {
      if (mounted && _version == ApiClient.sessionVersion) {
        setState(
          () => _error = error is ApiException
              ? error.message
              : 'Không xóa được nhật ký. Hãy thử lại.',
        );
      }
    } finally {
      if (mounted) setState(() => _saving = false);
    }
  }

  @override
  Widget build(BuildContext context) => PopScope(
    canPop: !_saving,
    child: AlertDialog(
      scrollable: true,
      title: const Text('Xóa nhật ký?'),
      content: Column(
        mainAxisSize: MainAxisSize.min,
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(widget.note['tieuDe']?.toString() ?? ''),
          const Text('Nhật ký sẽ được ẩn, dữ liệu gốc vẫn được giữ.'),
          if (_error != null)
            Text(
              _error!,
              style: TextStyle(color: Theme.of(context).colorScheme.error),
            ),
        ],
      ),
      actions: [
        TextButton(
          onPressed: _saving ? null : () => Navigator.pop(context, false),
          child: const Text('Hủy'),
        ),
        FilledButton(
          onPressed: _saving ? null : _delete,
          child: Text(_saving ? 'Đang xóa…' : 'Xác nhận xóa'),
        ),
      ],
    ),
  );
}
