import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

import '../../services/api_client.dart';
import '../../services/elderly_service.dart';
import '../../theme/care_senior_theme.dart';
import '../../widgets/care_senior_ui.dart';

class CompleteProfileScreen extends StatefulWidget {
  const CompleteProfileScreen({
    super.key,
    required this.account,
    required this.onCompleted,
    this.onLogout,
  });
  final Map<String, dynamic> account;
  final Future<void> Function() onCompleted;
  final VoidCallback? onLogout;

  @override
  State<CompleteProfileScreen> createState() => _CompleteProfileScreenState();
}

class _CompleteProfileScreenState extends State<CompleteProfileScreen> {
  final _form = GlobalKey<FormState>();
  final _name = TextEditingController();
  final _birth = TextEditingController();
  final _phone = TextEditingController();
  final _cccd = TextEditingController();
  final _address = TextEditingController();
  final _blood = TextEditingController();
  final _conditions = TextEditingController();
  final _allergies = TextEditingController();
  String? _gender;
  String? _birthValue;
  String? _error;
  bool _saving = false;
  late final int _version;

  @override
  void initState() {
    super.initState();
    _version = ApiClient.sessionVersion;
    _name.text = widget.account['hoTen']?.toString() ?? '';
    _phone.text = widget.account['soDienThoai']?.toString() ?? '';
  }

  @override
  void dispose() {
    for (final controller in [
      _name,
      _birth,
      _phone,
      _cccd,
      _address,
      _blood,
      _conditions,
      _allergies,
    ]) {
      controller.dispose();
    }
    super.dispose();
  }

  Future<void> _selectBirth() async {
    final date = await showDatePicker(
      context: context,
      initialDate: _birthValue == null
          ? DateTime(1950)
          : DateTime.parse(_birthValue!),
      firstDate: DateTime(1900),
      lastDate: DateTime.now(),
    );
    if (date == null || !mounted) return;
    setState(() {
      _birthValue =
          '${date.year.toString().padLeft(4, '0')}-${date.month.toString().padLeft(2, '0')}-${date.day.toString().padLeft(2, '0')}';
      _birth.text =
          '${date.day.toString().padLeft(2, '0')}/${date.month.toString().padLeft(2, '0')}/${date.year}';
    });
  }

  Future<void> _save() async {
    if (_saving || !_form.currentState!.validate()) return;
    setState(() {
      _saving = true;
      _error = null;
    });
    try {
      await ElderlyService.instance.createMyProfile({
        'hoTen': _name.text.trim(),
        'ngaySinh': _birthValue,
        'gioiTinh': _gender,
        'soDienThoai': _phone.text.trim(),
        'cccd': _cccd.text.trim(),
        'diaChi': _address.text.trim(),
        'nhomMau': _blood.text.trim(),
        'benhNen': _conditions.text.trim(),
        'diUng': _allergies.text.trim(),
      });
      if (!mounted || _version != ApiClient.sessionVersion) return;
      await widget.onCompleted();
    } on ApiException catch (error) {
      if (mounted && _version == ApiClient.sessionVersion) {
        setState(() => _error = error.message);
      }
    } catch (_) {
      if (mounted && _version == ApiClient.sessionVersion) {
        setState(() => _error = 'Không thể lưu hồ sơ. Vui lòng thử lại.');
      }
    } finally {
      if (mounted && _version == ApiClient.sessionVersion) {
        setState(() => _saving = false);
      }
    }
  }

  Widget _field(
    String key,
    String label,
    TextEditingController controller,
    int max, {
    bool required = false,
    bool digits = false,
    bool readOnly = false,
    VoidCallback? onTap,
    String? Function(String)? validate,
  }) => Padding(
    padding: const EdgeInsets.only(bottom: 18),
    child: TextFormField(
      key: ValueKey(key),
      controller: controller,
      maxLength: max,
      readOnly: readOnly,
      onTap: onTap,
      style: const TextStyle(fontSize: 17),
      keyboardType: digits ? TextInputType.number : TextInputType.text,
      inputFormatters: digits ? [FilteringTextInputFormatter.digitsOnly] : null,
      decoration: InputDecoration(
        labelText: label,
        counterText: '',
        labelStyle: const TextStyle(fontSize: 16),
        suffixIcon: readOnly ? const Icon(Icons.calendar_month_outlined) : null,
      ),
      validator: (value) {
        final text = value?.trim() ?? '';
        if (required && text.isEmpty) return 'Vui lòng nhập $label';
        return text.isEmpty ? null : validate?.call(text);
      },
    ),
  );

  @override
  Widget build(BuildContext context) => PopScope(
    canPop: false,
    child: Scaffold(
      appBar: AppBar(
        automaticallyImplyLeading: false,
        title: const Text('Bổ sung hồ sơ NCT'),
      ),
      body: SafeArea(
        child: SingleChildScrollView(
          padding: const EdgeInsets.all(20),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              AppCard(
                color: CareSeniorColors.mint,
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    const Text(
                      'Chào mừng đến CareSenior',
                      style: TextStyle(
                        fontSize: 22,
                        fontWeight: FontWeight.w800,
                      ),
                    ),
                    const SizedBox(height: 12),
                    const Text(
                      'Tài khoản của bạn chưa có hồ sơ người cao tuổi. Vui lòng bổ sung thông tin để bắt đầu sử dụng.',
                      style: TextStyle(fontSize: 17),
                    ),
                    const SizedBox(height: 12),
                    Text(
                      'Tài khoản: ${widget.account['tenDangNhap'] ?? widget.account['email'] ?? ''}',
                      style: const TextStyle(fontSize: 16),
                    ),
                    const SizedBox(height: 8),
                    const Text(
                      'Không cần đăng ký tài khoản mới. Người chăm sóc sẽ do Admin phân công.',
                      style: TextStyle(fontSize: 16),
                    ),
                  ],
                ),
              ),
              const SizedBox(height: 24),
              AbsorbPointer(
                absorbing: _saving,
                child: Form(
                  key: _form,
                  child: Column(
                    children: [
                      _field(
                        'complete-name',
                        'Họ và tên *',
                        _name,
                        100,
                        required: true,
                      ),
                      _field(
                        'complete-birth',
                        'Ngày sinh *',
                        _birth,
                        10,
                        required: true,
                        readOnly: true,
                        onTap: _selectBirth,
                      ),
                      Padding(
                        padding: const EdgeInsets.only(bottom: 18),
                        child: DropdownButtonFormField<String>(
                          key: const ValueKey('complete-gender'),
                          initialValue: _gender,
                          decoration: const InputDecoration(
                            labelText: 'Giới tính *',
                            labelStyle: TextStyle(fontSize: 16),
                          ),
                          style: const TextStyle(
                            fontSize: 17,
                            color: CareSeniorColors.text,
                          ),
                          items: ['Nam', 'Nữ', 'Khác']
                              .map(
                                (value) => DropdownMenuItem(
                                  value: value,
                                  child: Text(value),
                                ),
                              )
                              .toList(),
                          onChanged: (value) => setState(() => _gender = value),
                          validator: (value) =>
                              value == null ? 'Vui lòng chọn giới tính' : null,
                        ),
                      ),
                      _field(
                        'complete-phone',
                        'Số điện thoại',
                        _phone,
                        10,
                        digits: true,
                        validate: (value) => RegExp(r'^0\d{9}$').hasMatch(value)
                            ? null
                            : 'SĐT phải gồm 10 số, bắt đầu bằng 0',
                      ),
                      _field(
                        'complete-cccd',
                        'CCCD (không bắt buộc)',
                        _cccd,
                        12,
                        digits: true,
                        validate: (value) =>
                            value.length == 12 ? null : 'CCCD phải gồm 12 số',
                      ),
                      _field('complete-address', 'Địa chỉ', _address, 255),
                      _field(
                        'complete-blood',
                        'Nhóm máu (nếu biết)',
                        _blood,
                        5,
                      ),
                      _field(
                        'complete-conditions',
                        'Bệnh nền (nếu có)',
                        _conditions,
                        500,
                      ),
                      _field(
                        'complete-allergies',
                        'Dị ứng (nếu có)',
                        _allergies,
                        300,
                      ),
                    ],
                  ),
                ),
              ),
              if (_error != null) ...[
                AppCard(
                  color: CareSeniorColors.dangerSurface,
                  child: Text(
                    _error!,
                    style: const TextStyle(
                      fontSize: 17,
                      color: CareSeniorColors.danger,
                    ),
                  ),
                ),
                const SizedBox(height: 16),
              ],
              FilledButton.icon(
                key: const ValueKey('complete-save'),
                onPressed: _saving ? null : _save,
                style: FilledButton.styleFrom(
                  minimumSize: const Size.fromHeight(56),
                ),
                icon: _saving
                    ? const SizedBox(
                        width: 20,
                        height: 20,
                        child: CircularProgressIndicator(
                          strokeWidth: 2,
                          color: Colors.white,
                        ),
                      )
                    : const Icon(Icons.check_circle_outline),
                label: Text(_saving ? 'Đang lưu...' : 'Lưu hồ sơ và tiếp tục'),
              ),
              const SizedBox(height: 12),
              OutlinedButton(
                onPressed: _saving ? null : widget.onLogout,
                style: OutlinedButton.styleFrom(
                  minimumSize: const Size.fromHeight(56),
                ),
                child: const Text('Đăng xuất'),
              ),
            ],
          ),
        ),
      ),
    ),
  );
}
