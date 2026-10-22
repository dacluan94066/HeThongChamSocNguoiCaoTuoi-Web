import 'package:flutter/material.dart';
import '../../theme/care_senior_theme.dart';

/// The fields are Vietnam wall-clock values, not the phone's timezone.
class MedicationSupplementDialog extends StatefulWidget {
  const MedicationSupplementDialog({
    super.key,
    required this.name,
    required this.scheduled,
  });
  final String name;
  final DateTime scheduled;

  @override
  State<MedicationSupplementDialog> createState() =>
      _MedicationSupplementDialogState();
}

class _MedicationSupplementDialogState
    extends State<MedicationSupplementDialog> {
  final _form = GlobalKey<FormState>();
  final _time = TextEditingController();
  final _reason = TextEditingController();
  late DateTime _day;
  bool _acknowledged = false;

  DateTime get _now => DateTime.now().toUtc().add(const Duration(hours: 7));

  @override
  void initState() {
    super.initState();
    _day = DateTime(
      widget.scheduled.year,
      widget.scheduled.month,
      widget.scheduled.day,
    );
  }

  @override
  void dispose() {
    _time.dispose();
    _reason.dispose();
    super.dispose();
  }

  String _date(DateTime date) =>
      '${date.year.toString().padLeft(4, '0')}-${date.month.toString().padLeft(2, '0')}-${date.day.toString().padLeft(2, '0')}';

  String? _validateTime(String? value) {
    if (!RegExp(r'^([01]\d|2[0-3]):[0-5]\d$').hasMatch(value?.trim() ?? '')) {
      return 'Nhập giờ đã uống dạng HH:mm.';
    }
    final taken = DateTime.parse('${_date(_day)}T${value!.trim()}:00Z');
    if (taken.isAfter(_now)) return 'Giờ đã uống không được ở tương lai.';
    return null;
  }

  @override
  Widget build(BuildContext context) => AlertDialog(
    scrollable: true,
    title: const Text('Ghi nhận bổ sung'),
    shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(24)),
    content: Form(
      key: _form,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Text(
            widget.name,
            style: const TextStyle(fontWeight: FontWeight.w700),
          ),
          const SizedBox(height: 12),
          const Text(
            'Chỉ ghi nhận nếu bạn đã thực sự uống liều này trước đó. Thao tác này không hướng dẫn uống thêm hoặc uống bù thuốc.',
          ),
          const SizedBox(height: 16),
          OutlinedButton.icon(
            key: const ValueKey('supplement-date'),
            icon: const Icon(Icons.calendar_today_outlined),
            label: Text('Ngày đã uống: ${_day.day}/${_day.month}/${_day.year}'),
            onPressed: () async {
              final now = _now;
              final picked = await showDatePicker(
                context: context,
                initialDate: _day,
                firstDate: DateTime(
                  widget.scheduled.year,
                  widget.scheduled.month,
                  widget.scheduled.day,
                ),
                lastDate: DateTime(now.year, now.month, now.day),
              );
              if (mounted && picked != null) setState(() => _day = picked);
            },
          ),
          const SizedBox(height: 12),
          TextFormField(
            key: const ValueKey('supplement-time'),
            controller: _time,
            keyboardType: TextInputType.datetime,
            decoration: InputDecoration(
              labelText: 'Giờ đã uống',
              helperText: 'HH:mm · Giờ Việt Nam',
              errorMaxLines: 3,
              hintText: 'HH:mm',
              suffixIcon: IconButton(
                tooltip: 'Chọn giờ đã uống',
                icon: const Icon(Icons.schedule),
                onPressed: () async {
                  final picked = await showTimePicker(
                    context: context,
                    initialTime: const TimeOfDay(hour: 8, minute: 0),
                  );
                  if (mounted && picked != null) {
                    _time.text =
                        '${picked.hour.toString().padLeft(2, '0')}:${picked.minute.toString().padLeft(2, '0')}';
                  }
                },
              ),
            ),
            validator: _validateTime,
          ),
          const SizedBox(height: 12),
          TextFormField(
            key: const ValueKey('supplement-reason'),
            controller: _reason,
            maxLength: 300,
            minLines: 2,
            maxLines: 4,
            decoration: const InputDecoration(
              labelText: 'Lý do bổ sung',
              errorMaxLines: 3,
            ),
            validator: (value) => (value?.trim().length ?? 0) < 5
                ? 'Nhập lý do ít nhất 5 ký tự.'
                : null,
          ),
          CheckboxListTile(
            key: const ValueKey('supplement-acknowledge'),
            contentPadding: EdgeInsets.zero,
            controlAffinity: ListTileControlAffinity.leading,
            value: _acknowledged,
            title: const Text('Tôi xác nhận đã thực sự uống liều này.'),
            onChanged: (value) =>
                setState(() => _acknowledged = value ?? false),
          ),
          const Text(
            'Lưu cả giờ đã uống và thời điểm ghi nhận. Chỉ áp dụng trong 48 giờ từ giờ dự kiến.',
            style: TextStyle(color: CareSeniorColors.secondaryText),
          ),
        ],
      ),
    ),
    actions: [
      TextButton(
        onPressed: () => Navigator.pop(context),
        child: const Text('Hủy'),
      ),
      FilledButton(
        key: const ValueKey('supplement-submit'),
        onPressed: !_acknowledged
            ? null
            : () {
                if (_form.currentState!.validate()) {
                  Navigator.pop(context, <String, String>{
                    'thoiGianThucTe':
                        '${_date(_day)}T${_time.text.trim()}:00+07:00',
                    'lyDo': _reason.text.trim(),
                  });
                }
              },
        child: const Text('Lưu ghi nhận bổ sung', textAlign: TextAlign.center),
      ),
    ],
  );
}
