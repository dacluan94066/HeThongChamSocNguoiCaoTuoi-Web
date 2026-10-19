import 'package:flutter/material.dart';
import '../../theme/care_senior_theme.dart';

import '../../services/api_client.dart';
import '../../services/auth_service.dart';

class GoogleRegistrationScreen extends StatefulWidget {
  const GoogleRegistrationScreen({
    super.key,
    required this.idToken,
    required this.email,
    this.displayName = '',
  });

  final String idToken;
  final String email;
  final String displayName;

  @override
  State<GoogleRegistrationScreen> createState() =>
      _GoogleRegistrationScreenState();
}

class _GoogleRegistrationScreenState extends State<GoogleRegistrationScreen> {
  late final TextEditingController _nameController;
  final TextEditingController _phoneController = TextEditingController();
  final TextEditingController _birthController = TextEditingController();
  final String _accountType = 'NguoiCaoTuoi';
  String _gender = 'Nam';
  bool _agreeTerms = false;
  bool _saving = false;

  @override
  void initState() {
    super.initState();
    _nameController = TextEditingController(text: widget.displayName);
  }

  @override
  void dispose() {
    _nameController.dispose();
    _phoneController.dispose();
    _birthController.dispose();
    super.dispose();
  }

  Future<void> _selectBirthDate() async {
    final picked = await showDatePicker(
      context: context,
      initialDate: DateTime(1950),
      firstDate: DateTime(1920),
      lastDate: DateTime.now(),
      helpText: 'Chọn ngày sinh',
      cancelText: 'Hủy',
      confirmText: 'Chọn',
    );
    if (picked != null) {
      _birthController.text =
          '${picked.day.toString().padLeft(2, '0')}/'
          '${picked.month.toString().padLeft(2, '0')}/${picked.year}';
    }
  }

  Future<void> _completeRegistration() async {
    final name = _nameController.text.trim();
    final phone = _phoneController.text.trim();
    final isElderly = _accountType == 'NguoiCaoTuoi';
    if (name.isEmpty ||
        phone.isEmpty ||
        (isElderly && _birthController.text.isEmpty)) {
      _showMessage('Vui lòng nhập đầy đủ thông tin bắt buộc.');
      return;
    }
    if (!RegExp(r'^[0-9+]{8,15}$').hasMatch(phone)) {
      _showMessage('Số điện thoại phải có từ 8 đến 15 chữ số.');
      return;
    }
    if (!_agreeTerms) {
      _showMessage('Vui lòng đồng ý với điều khoản sử dụng.');
      return;
    }

    String? birthDate;
    if (isElderly) {
      final parts = _birthController.text.split('/');
      if (parts.length != 3) {
        _showMessage('Ngày sinh không hợp lệ.');
        return;
      }
      birthDate = '${parts[2]}-${parts[1]}-${parts[0]}';
    }

    setState(() => _saving = true);
    try {
      await AuthService.instance.registerWithGoogle(
        idToken: widget.idToken,
        loaiTaiKhoan: _accountType,
        hoTen: name,
        soDienThoai: phone,
        ngaySinh: birthDate,
        gioiTinh: isElderly ? _gender : null,
      );
      if (!mounted) return;
      Navigator.pop(context, true);
    } on ApiException catch (error) {
      if (mounted) _showMessage(error.message);
    } catch (_) {
      if (mounted) {
        _showMessage('Không thể tạo tài khoản Google. Vui lòng thử lại.');
      }
    } finally {
      if (mounted) setState(() => _saving = false);
    }
  }

  void _showMessage(String message) {
    ScaffoldMessenger.of(
      context,
    ).showSnackBar(SnackBar(content: Text(message)));
  }

  @override
  Widget build(BuildContext context) {
    final isElderly = _accountType == 'NguoiCaoTuoi';
    return Scaffold(
      backgroundColor: CareSeniorColors.background,
      appBar: AppBar(
        backgroundColor: CareSeniorColors.background,
        title: const Text(
          'Hoàn tất đăng ký Google',
          style: TextStyle(fontWeight: FontWeight.bold),
        ),
      ),
      body: SingleChildScrollView(
        padding: const EdgeInsets.fromLTRB(24, 12, 24, 32),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            const Text(
              'Tạo hồ sơ người cao tuổi',
              style: TextStyle(fontSize: 18, fontWeight: FontWeight.bold),
            ),
            const SizedBox(height: 24),
            TextFormField(
              readOnly: true,
              initialValue: widget.email,
              decoration: _decoration('Email Google', Icons.email_outlined),
            ),
            const SizedBox(height: 16),
            TextField(
              controller: _nameController,
              textCapitalization: TextCapitalization.words,
              decoration: _decoration('Họ và tên', Icons.person_outline),
            ),
            const SizedBox(height: 16),
            TextField(
              controller: _phoneController,
              keyboardType: TextInputType.phone,
              decoration: _decoration('Số điện thoại', Icons.phone_outlined),
            ),
            if (isElderly) ...[
              const SizedBox(height: 16),
              TextField(
                controller: _birthController,
                readOnly: true,
                onTap: _selectBirthDate,
                decoration: _decoration('Ngày sinh', Icons.cake_outlined),
              ),
              const SizedBox(height: 16),
              DropdownButtonFormField<String>(
                initialValue: _gender,
                decoration: _decoration('Giới tính', Icons.people_outline),
                items: const [
                  DropdownMenuItem(value: 'Nam', child: Text('Nam')),
                  DropdownMenuItem(value: 'Nữ', child: Text('Nữ')),
                  DropdownMenuItem(value: 'Khác', child: Text('Khác')),
                ],
                onChanged: _saving
                    ? null
                    : (value) {
                        if (value != null) setState(() => _gender = value);
                      },
              ),
            ],
            const SizedBox(height: 14),
            CheckboxListTile(
              contentPadding: EdgeInsets.zero,
              value: _agreeTerms,
              activeColor: CareSeniorColors.deepGreen,
              onChanged: _saving
                  ? null
                  : (value) => setState(() => _agreeTerms = value ?? false),
              title: const Text(
                'Tôi đồng ý với Điều khoản sử dụng và Chính sách bảo mật.',
                style: TextStyle(fontSize: 13),
              ),
              controlAffinity: ListTileControlAffinity.leading,
            ),
            const SizedBox(height: 12),
            SizedBox(
              width: double.infinity,
              height: 56,
              child: ElevatedButton(
                onPressed: _saving ? null : _completeRegistration,
                style: ElevatedButton.styleFrom(
                  backgroundColor: CareSeniorColors.deepGreen,
                  foregroundColor: Colors.white,
                  shape: RoundedRectangleBorder(
                    borderRadius: BorderRadius.circular(18),
                  ),
                ),
                child: _saving
                    ? const SizedBox(
                        width: 22,
                        height: 22,
                        child: CircularProgressIndicator(
                          strokeWidth: 2,
                          color: Colors.white,
                        ),
                      )
                    : const Text(
                        'TẠO TÀI KHOẢN VÀ ĐĂNG NHẬP',
                        style: TextStyle(fontWeight: FontWeight.bold),
                      ),
              ),
            ),
          ],
        ),
      ),
    );
  }

  InputDecoration _decoration(String label, IconData icon) => InputDecoration(
    labelText: label,
    prefixIcon: Icon(icon),
    filled: true,
    fillColor: Colors.white,
    border: OutlineInputBorder(
      borderRadius: BorderRadius.circular(18),
      borderSide: BorderSide.none,
    ),
  );
}
