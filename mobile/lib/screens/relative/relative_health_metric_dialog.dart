import 'package:flutter/material.dart';

import '../../services/api_client.dart';
import '../../services/relative_service.dart';
import '../../theme/care_senior_theme.dart';

/// Hộp thoại ghi nhận chỉ số sức khỏe dành cho Người thân trên Mobile
class RelativeHealthMetricDialog extends StatefulWidget {
  const RelativeHealthMetricDialog({
    super.key,
    required this.elderlyId,
    required this.elderlyName,
  });

  final int elderlyId;
  final String elderlyName;

  static Future<bool?> show(BuildContext context, {required int elderlyId, required String elderlyName}) {
    return showModalBottomSheet<bool>(
      context: context,
      isScrollControlled: true,
      backgroundColor: Colors.transparent,
      builder: (context) => RelativeHealthMetricDialog(
        elderlyId: elderlyId,
        elderlyName: elderlyName,
      ),
    );
  }

  @override
  State<RelativeHealthMetricDialog> createState() => _RelativeHealthMetricDialogState();
}

class _RelativeHealthMetricDialogState extends State<RelativeHealthMetricDialog> {
  final _formKey = GlobalKey<FormState>();
  final _valueController = TextEditingController();
  final _noteController = TextEditingController();

  List<Map<String, dynamic>> _types = [];
  Map<String, dynamic>? _selectedType;
  bool _loadingTypes = true;
  bool _submitting = false;
  String? _errorMessage;

  DateTime _selectedDate = DateTime.now();
  TimeOfDay _selectedTime = TimeOfDay.now();

  @override
  void initState() {
    super.initState();
    _fetchMetricTypes();
  }

  @override
  void dispose() {
    _valueController.dispose();
    _noteController.dispose();
    super.dispose();
  }

  Future<void> _fetchMetricTypes() async {
    try {
      final types = await RelativeService.instance.getMetricTypes();
      if (!mounted) return;
      setState(() {
        _types = types;
        _loadingTypes = false;
        if (types.isNotEmpty) {
          _selectedType = types.first;
        }
      });
    } catch (_) {
      if (!mounted) return;
      setState(() {
        _loadingTypes = false;
        _errorMessage = 'Không thể tải danh mục loại chỉ số.';
      });
    }
  }

  String _getHintText() {
    final typeName = _selectedType?['tenChiSo']?.toString() ?? '';
    final unit = _selectedType?['donVi']?.toString() ?? '';

    switch (typeName) {
      case 'Huyết áp':
        return 'VD: 120/80 (Tâm thu / Tâm trương)';
      case 'Nhịp tim':
        return 'VD: 75 (nhịp/phút)';
      case 'Đường huyết':
        return 'VD: 105 (mg/dL)';
      case 'Nhiệt độ cơ thể':
        return 'VD: 36.8 (°C)';
      case 'SpO2':
        return 'VD: 98 (%)';
      case 'Cân nặng':
        return 'VD: 60 (kg)';
      default:
        return unit.isNotEmpty ? 'Nhập giá trị ($unit)' : 'Nhập giá trị đo';
    }
  }

  Future<void> _pickDate() async {
    final picked = await showDatePicker(
      context: context,
      initialDate: _selectedDate,
      firstDate: DateTime.now().subtract(const Duration(days: 30)),
      lastDate: DateTime.now(),
    );
    if (picked != null) {
      setState(() => _selectedDate = picked);
    }
  }

  Future<void> _pickTime() async {
    final picked = await showTimePicker(
      context: context,
      initialTime: _selectedTime,
    );
    if (picked != null) {
      setState(() => _selectedTime = picked);
    }
  }

  Future<void> _submit() async {
    if (!_formKey.currentState!.validate()) return;
    if (_selectedType == null) {
      setState(() => _errorMessage = 'Vui lòng chọn loại chỉ số.');
      return;
    }

    setState(() {
      _submitting = true;
      _errorMessage = null;
    });

    final ngayDo = '${_selectedDate.year.toString().padLeft(4, '0')}-'
        '${_selectedDate.month.toString().padLeft(2, '0')}-'
        '${_selectedDate.day.toString().padLeft(2, '0')}';

    final gioDo = '${_selectedTime.hour.toString().padLeft(2, '0')}:'
        '${_selectedTime.minute.toString().padLeft(2, '0')}';

    final payload = <String, dynamic>{
      'loaiChiSoId': _selectedType!['id'],
      'giaTri': _valueController.text.trim(),
      'ngayDo': ngayDo,
      'gioDo': gioDo,
      if (_noteController.text.trim().isNotEmpty) 'ghiChu': _noteController.text.trim(),
    };

    try {
      final result = await RelativeService.instance.createElderlyHealthMetric(
        widget.elderlyId,
        payload,
      );

      if (!mounted) return;
      Navigator.pop(context, true);

      final alertCreated = result['alertCreated'] == true ||
          (result['data'] is Map && result['data']['alertCreated'] == true);

      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          backgroundColor: alertCreated ? CareSeniorColors.warning : CareSeniorColors.deepGreen,
          content: Text(
            alertCreated
                ? 'Đã lưu chỉ số! Cảnh báo: Chỉ số vừa đo vượt ngưỡng an toàn.'
                : 'Ghi nhận chỉ số sức khỏe thành công!',
          ),
        ),
      );
    } on ApiException catch (e) {
      if (!mounted) return;
      setState(() {
        _submitting = false;
        _errorMessage = e.message;
      });
    } catch (_) {
      if (!mounted) return;
      setState(() {
        _submitting = false;
        _errorMessage = 'Không thể ghi nhận chỉ số. Vui lòng thử lại.';
      });
    }
  }

  @override
  Widget build(BuildContext context) {
    final bottomInset = MediaQuery.of(context).viewInsets.bottom;

    return Container(
      decoration: const BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.vertical(top: Radius.circular(28)),
      ),
      padding: EdgeInsets.fromLTRB(20, 16, 20, 20 + bottomInset),
      child: SafeArea(
        top: false,
        child: SingleChildScrollView(
          child: Form(
            key: _formKey,
            child: Column(
              mainAxisSize: MainAxisSize.min,
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                // Top drag handle
                Center(
                  child: Container(
                    width: 40,
                    height: 4,
                    decoration: BoxDecoration(
                      color: Colors.grey.shade300,
                      borderRadius: BorderRadius.circular(2),
                    ),
                  ),
                ),
                const SizedBox(height: 16),

                // Title Row
                Row(
                  children: [
                    Container(
                      padding: const EdgeInsets.all(8),
                      decoration: BoxDecoration(
                        color: CareSeniorColors.mint,
                        borderRadius: BorderRadius.circular(12),
                      ),
                      child: const Icon(
                        Icons.favorite_rounded,
                        color: CareSeniorColors.deepGreen,
                        size: 24,
                      ),
                    ),
                    const SizedBox(width: 12),
                    Expanded(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          const Text(
                            'Thêm chỉ số sức khỏe',
                            style: TextStyle(
                              fontSize: 18,
                              fontWeight: FontWeight.w800,
                              color: CareSeniorColors.text,
                            ),
                          ),
                          Text(
                            'Dành cho: ${widget.elderlyName}',
                            style: const TextStyle(
                              fontSize: 13,
                              color: CareSeniorColors.secondaryText,
                            ),
                          ),
                        ],
                      ),
                    ),
                    IconButton(
                      icon: const Icon(Icons.close_rounded),
                      onPressed: () => Navigator.pop(context),
                    ),
                  ],
                ),
                const SizedBox(height: 16),

                if (_errorMessage != null) ...[
                  Container(
                    padding: const EdgeInsets.all(12),
                    decoration: BoxDecoration(
                      color: CareSeniorColors.dangerSurface,
                      borderRadius: BorderRadius.circular(12),
                      border: Border.all(color: CareSeniorColors.danger.withValues(alpha: 0.4)),
                    ),
                    child: Row(
                      children: [
                        const Icon(Icons.error_outline_rounded, color: CareSeniorColors.danger, size: 20),
                        const SizedBox(width: 8),
                        Expanded(
                          child: Text(
                            _errorMessage!,
                            style: const TextStyle(color: CareSeniorColors.danger, fontSize: 13, fontWeight: FontWeight.w600),
                          ),
                        ),
                      ],
                    ),
                  ),
                  const SizedBox(height: 14),
                ],

                // Metric Type Selector
                const Text(
                  'Loại chỉ số sức khỏe *',
                  style: TextStyle(fontSize: 14, fontWeight: FontWeight.w700, color: CareSeniorColors.text),
                ),
                const SizedBox(height: 8),
                if (_loadingTypes)
                  const Center(child: Padding(padding: EdgeInsets.all(8), child: CircularProgressIndicator()))
                else
                  Container(
                    padding: const EdgeInsets.symmetric(horizontal: 14),
                    decoration: BoxDecoration(
                      color: CareSeniorColors.background,
                      borderRadius: BorderRadius.circular(14),
                      border: Border.all(color: CareSeniorColors.border),
                    ),
                    child: DropdownButtonHideUnderline(
                      child: DropdownButton<Map<String, dynamic>>(
                        isExpanded: true,
                        value: _selectedType,
                        items: _types.map((type) {
                          final name = type['tenChiSo']?.toString() ?? '';
                          final unit = type['donVi']?.toString() ?? '';
                          return DropdownMenuItem<Map<String, dynamic>>(
                            value: type,
                            child: Text(
                              unit.isNotEmpty ? '$name ($unit)' : name,
                              style: const TextStyle(fontWeight: FontWeight.w700, fontSize: 15),
                            ),
                          );
                        }).toList(),
                        onChanged: (val) {
                          if (val != null) setState(() => _selectedType = val);
                        },
                      ),
                    ),
                  ),
                const SizedBox(height: 16),

                // Value input field
                const Text(
                  'Giá trị đo *',
                  style: TextStyle(fontSize: 14, fontWeight: FontWeight.w700, color: CareSeniorColors.text),
                ),
                const SizedBox(height: 8),
                TextFormField(
                  controller: _valueController,
                  keyboardType: TextInputType.text,
                  decoration: InputDecoration(
                    hintText: _getHintText(),
                    hintStyle: TextStyle(color: Colors.grey.shade400, fontSize: 14),
                    filled: true,
                    fillColor: CareSeniorColors.background,
                    border: OutlineInputBorder(
                      borderRadius: BorderRadius.circular(14),
                      borderSide: const BorderSide(color: CareSeniorColors.border),
                    ),
                    enabledBorder: OutlineInputBorder(
                      borderRadius: BorderRadius.circular(14),
                      borderSide: const BorderSide(color: CareSeniorColors.border),
                    ),
                    focusedBorder: OutlineInputBorder(
                      borderRadius: BorderRadius.circular(14),
                      borderSide: const BorderSide(color: CareSeniorColors.deepGreen, width: 2),
                    ),
                    prefixIcon: const Icon(Icons.edit_note_rounded, color: CareSeniorColors.deepGreen),
                  ),
                  validator: (val) {
                    if (val == null || val.trim().isEmpty) {
                      return 'Vui lòng nhập giá trị đo.';
                    }
                    return null;
                  },
                ),
                const SizedBox(height: 16),

                // Date and Time Row
                Row(
                  children: [
                    Expanded(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          const Text(
                            'Ngày đo',
                            style: TextStyle(fontSize: 14, fontWeight: FontWeight.w700, color: CareSeniorColors.text),
                          ),
                          const SizedBox(height: 8),
                          InkWell(
                            onTap: _pickDate,
                            borderRadius: BorderRadius.circular(14),
                            child: Container(
                              padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 14),
                              decoration: BoxDecoration(
                                color: CareSeniorColors.background,
                                borderRadius: BorderRadius.circular(14),
                                border: Border.all(color: CareSeniorColors.border),
                              ),
                              child: Row(
                                children: [
                                  const Icon(Icons.calendar_today_rounded, size: 18, color: CareSeniorColors.deepGreen),
                                  const SizedBox(width: 8),
                                  Text(
                                    '${_selectedDate.day.toString().padLeft(2, '0')}/${_selectedDate.month.toString().padLeft(2, '0')}/${_selectedDate.year}',
                                    style: const TextStyle(fontWeight: FontWeight.w700, fontSize: 14),
                                  ),
                                ],
                              ),
                            ),
                          ),
                        ],
                      ),
                    ),
                    const SizedBox(width: 12),
                    Expanded(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          const Text(
                            'Giờ đo',
                            style: TextStyle(fontSize: 14, fontWeight: FontWeight.w700, color: CareSeniorColors.text),
                          ),
                          const SizedBox(height: 8),
                          InkWell(
                            onTap: _pickTime,
                            borderRadius: BorderRadius.circular(14),
                            child: Container(
                              padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 14),
                              decoration: BoxDecoration(
                                color: CareSeniorColors.background,
                                borderRadius: BorderRadius.circular(14),
                                border: Border.all(color: CareSeniorColors.border),
                              ),
                              child: Row(
                                children: [
                                  const Icon(Icons.access_time_rounded, size: 18, color: CareSeniorColors.deepGreen),
                                  const SizedBox(width: 8),
                                  Text(
                                    '${_selectedTime.hour.toString().padLeft(2, '0')}:${_selectedTime.minute.toString().padLeft(2, '0')}',
                                    style: const TextStyle(fontWeight: FontWeight.w700, fontSize: 14),
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
                const SizedBox(height: 16),

                // Note field
                const Text(
                  'Ghi chú (Tùy chọn)',
                  style: TextStyle(fontSize: 14, fontWeight: FontWeight.w700, color: CareSeniorColors.text),
                ),
                const SizedBox(height: 8),
                TextFormField(
                  controller: _noteController,
                  maxLines: 2,
                  maxLength: 300,
                  decoration: InputDecoration(
                    hintText: 'Ví dụ: Đo sau khi nghỉ ngơi 15 phút, trước bữa ăn sáng',
                    hintStyle: TextStyle(color: Colors.grey.shade400, fontSize: 13),
                    filled: true,
                    fillColor: CareSeniorColors.background,
                    border: OutlineInputBorder(
                      borderRadius: BorderRadius.circular(14),
                      borderSide: const BorderSide(color: CareSeniorColors.border),
                    ),
                    enabledBorder: OutlineInputBorder(
                      borderRadius: BorderRadius.circular(14),
                      borderSide: const BorderSide(color: CareSeniorColors.border),
                    ),
                    focusedBorder: OutlineInputBorder(
                      borderRadius: BorderRadius.circular(14),
                      borderSide: const BorderSide(color: CareSeniorColors.deepGreen, width: 2),
                    ),
                  ),
                ),
                const SizedBox(height: 20),

                // Submit Button
                FilledButton.icon(
                  onPressed: _submitting ? null : _submit,
                  icon: _submitting
                      ? const SizedBox(
                          width: 18,
                          height: 18,
                          child: CircularProgressIndicator(color: Colors.white, strokeWidth: 2),
                        )
                      : const Icon(Icons.save_rounded),
                  label: Text(_submitting ? 'Đang lưu...' : 'Lưu chỉ số sức khỏe'),
                  style: FilledButton.styleFrom(
                    backgroundColor: CareSeniorColors.deepGreen,
                    padding: const EdgeInsets.symmetric(vertical: 16),
                    shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(16)),
                  ),
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}

