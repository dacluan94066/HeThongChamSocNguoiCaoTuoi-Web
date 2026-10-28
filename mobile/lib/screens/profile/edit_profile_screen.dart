import 'package:flutter/material.dart';
import '../../theme/care_senior_theme.dart';
import 'package:flutter/services.dart';

import '../../services/api_client.dart';
import '../../services/auth_service.dart';
import '../../services/elderly_service.dart';
import 'profile_dashboard_ui.dart';

class EditProfileScreen extends StatefulWidget {
  const EditProfileScreen({super.key, this.accountOnly = false});

  final bool accountOnly;

  @override
  State<EditProfileScreen> createState() => _EditProfileScreenState();
}

class _EditProfileScreenState extends State<EditProfileScreen> {
  final TextEditingController nameController = TextEditingController();

  final TextEditingController birthController = TextEditingController();

  final TextEditingController phoneController = TextEditingController();

  final TextEditingController emailController = TextEditingController();

  final TextEditingController addressController = TextEditingController();

  final TextEditingController bloodTypeController = TextEditingController();

  final TextEditingController benhNenController = TextEditingController();
  final TextEditingController diUngController = TextEditingController();

  String gender = 'Nam';

  bool loading = true;
  bool saving = false;
  String? loadError;

  @override
  void initState() {
    super.initState();
    loadProfile();
  }

  Future<void> loadProfile() async {
    setState(() {
      loading = true;
      loadError = null;
    });
    try {
      final data = widget.accountOnly
          ? await AuthService.instance.getMe()
          : await ElderlyService.instance.getMyProfile();
      if (!mounted) return;
      nameController.text = data['hoTen']?.toString() ?? '';
      emailController.text = data['email']?.toString() ?? '';
      birthController.text = ElderlyService.displayBirthDate(data);
      phoneController.text = data['soDienThoai']?.toString() ?? '';
      addressController.text = data['diaChi']?.toString() ?? '';
      bloodTypeController.text = data['nhomMau']?.toString() ?? '';
      benhNenController.text = data['benhNen']?.toString() ?? '';
      diUngController.text = data['diUng']?.toString() ?? '';
      setState(() {
        gender = data['gioiTinh']?.toString() ?? 'Nam';
        loading = false;
      });
    } on ApiException catch (error) {
      if (!mounted) return;
      setState(() {
        loadError = error.message;
        loading = false;
      });
    } catch (_) {
      if (!mounted) return;
      setState(() {
        loadError = 'Không thể tải hồ sơ. Vui lòng thử lại.';
        loading = false;
      });
    }
  }

  @override
  void dispose() {
    nameController.dispose();
    birthController.dispose();
    phoneController.dispose();
    emailController.dispose();
    addressController.dispose();
    bloodTypeController.dispose();
    benhNenController.dispose();
    diUngController.dispose();

    super.dispose();
  }

  Future<void> selectBirthDate() async {
    final selectedDate = await showDatePicker(
      context: context,
      initialDate:
          ElderlyService.birthDate({
            'ngaySinh': birthController.text.split('/').reversed.join('-'),
          }) ??
          DateTime(1950),
      firstDate: DateTime(1900),
      lastDate: DateTime.now(),
    );

    if (selectedDate == null) {
      return;
    }

    final day = selectedDate.day.toString().padLeft(2, '0');

    final month = selectedDate.month.toString().padLeft(2, '0');

    birthController.text = '$day/$month/${selectedDate.year}';
  }

  Future<void> saveProfile() async {
    if (widget.accountOnly) {
      await _saveAccountProfile();
      return;
    }
    final name = nameController.text.trim();
    final birthDate = birthController.text.trim();
    final phone = phoneController.text.trim();
    final email = emailController.text.trim();
    final address = addressController.text.trim();
    final bloodType = bloodTypeController.text.trim();
    final benhNen = benhNenController.text.trim();
    final diUng = diUngController.text.trim();

    if (name.isEmpty || birthDate.isEmpty || email.isEmpty) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(
          content: Text('Vui lòng nhập đầy đủ thông tin cá nhân.'),
        ),
      );
      return;
    }

    if (!RegExp(r'^[^\s@]+@[^\s@]+\.[^\s@]+$').hasMatch(email)) {
      ScaffoldMessenger.of(
        context,
      ).showSnackBar(const SnackBar(content: Text('Email không hợp lệ.')));
      return;
    }

    if (phone.isNotEmpty && (phone.length != 10 || !phone.startsWith('0'))) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(
          content: Text('Số điện thoại phải gồm 10 số và bắt đầu bằng 0.'),
        ),
      );
      return;
    }

    setState(() {
      saving = true;
    });

    final parts = birthDate.split('/');
    if (parts.length != 3) {
      ScaffoldMessenger.of(
        context,
      ).showSnackBar(const SnackBar(content: Text('Ngày sinh không hợp lệ.')));
      setState(() => saving = false);
      return;
    }
    try {
      await ElderlyService.instance.updateMyProfile({
        'hoTen': name,
        'ngaySinh': '${parts[2]}-${parts[1]}-${parts[0]}',
        'gioiTinh': gender,
        'soDienThoai': phone,
        'email': email,
        'diaChi': address,
        'nhomMau': bloodType,
        'benhNen': benhNen,
        'diUng': diUng,
      });
      if (!mounted) return;
      Navigator.pop(context, true);
    } on ApiException catch (error) {
      if (!mounted) return;
      ScaffoldMessenger.of(
        context,
      ).showSnackBar(SnackBar(content: Text(error.message)));
    } catch (_) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Không thể lưu hồ sơ. Vui lòng thử lại.')),
      );
    } finally {
      if (mounted) setState(() => saving = false);
    }
  }

  Future<void> _saveAccountProfile() async {
    final name = nameController.text.trim();
    final email = emailController.text.trim();
    final phone = phoneController.text.trim();
    if (name.isEmpty) {
      ScaffoldMessenger.of(
        context,
      ).showSnackBar(const SnackBar(content: Text('Vui lòng nhập họ và tên.')));
      return;
    }
    if (phone.isNotEmpty && (phone.length != 10 || !phone.startsWith('0'))) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(
          content: Text('Số điện thoại phải gồm 10 số và bắt đầu bằng 0.'),
        ),
      );
      return;
    }
    setState(() => saving = true);
    try {
      await AuthService.instance.updateMe(
        hoTen: name,
        email: email.isEmpty ? null : email,
        soDienThoai: phone.isEmpty ? null : phone,
      );
      if (!mounted) return;
      Navigator.pop(context, true);
    } on ApiException catch (error) {
      if (!mounted) return;
      ScaffoldMessenger.of(
        context,
      ).showSnackBar(SnackBar(content: Text(error.message)));
    } catch (_) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Không thể lưu hồ sơ. Vui lòng thử lại.')),
      );
    } finally {
      if (mounted) setState(() => saving = false);
    }
  }

  Widget buildTextField({
    required String label,
    required TextEditingController controller,
    required IconData icon,
    String? hint,
    TextInputType keyboardType = TextInputType.text,
    List<TextInputFormatter>? inputFormatters,
    bool readOnly = false,
    VoidCallback? onTap,
    String? suffixText,
  }) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(
          label,
          style: const TextStyle(fontSize: 16, fontWeight: FontWeight.w600),
        ),

        const SizedBox(height: 8),

        TextField(
          key: ValueKey('profile-field-$label'),
          style: const TextStyle(fontSize: 18),
          scrollPadding: const EdgeInsets.all(28),
          minLines: 1,
          maxLines:
              controller == addressController ||
                  controller == benhNenController ||
                  controller == diUngController
              ? 4
              : 1,
          controller: controller,
          keyboardType: keyboardType,
          inputFormatters: inputFormatters,
          readOnly: readOnly,
          onTap: onTap,
          decoration: InputDecoration(
            hintText: hint,
            suffixText: suffixText,
            prefixIcon: Icon(icon),
            filled: true,
            fillColor: const Color(0xfff7faf8),
            border: OutlineInputBorder(
              borderRadius: BorderRadius.circular(18),
              borderSide: const BorderSide(color: CareSeniorColors.border),
            ),
            enabledBorder: OutlineInputBorder(
              borderRadius: BorderRadius.circular(18),
              borderSide: const BorderSide(color: CareSeniorColors.border),
            ),
            focusedBorder: OutlineInputBorder(
              borderRadius: BorderRadius.circular(18),
              borderSide: const BorderSide(
                color: CareSeniorColors.deepGreen,
                width: 1.4,
              ),
            ),
          ),
        ),
      ],
    );
  }

  @override
  Widget build(BuildContext context) {
    if (widget.accountOnly) return _buildAccountEditor();
    return ProfileFormPage(
      title: 'Chỉnh sửa hồ sơ',
      subtitle: 'Thông tin cá nhân và sức khỏe của bạn',
      scrollKey: const ValueKey('profile-edit-scroll'),
      child: loading
          ? const Center(
              child: CircularProgressIndicator(
                color: CareSeniorColors.deepGreen,
              ),
            )
          : loadError != null
          ? _editorError()
          : Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                const Text(
                  'Thông tin cá nhân',
                  style: TextStyle(fontSize: 22, fontWeight: FontWeight.w800),
                ),
                const SizedBox(height: 20),
                buildTextField(
                  label: 'Họ tên hồ sơ NCT',
                  controller: nameController,
                  icon: Icons.badge_outlined,
                  hint: 'Nhập họ và tên',
                ),
                const SizedBox(height: 18),
                buildTextField(
                  label: 'Ngày sinh',
                  controller: birthController,
                  icon: Icons.cake_outlined,
                  readOnly: true,
                  onTap: selectBirthDate,
                ),
                const SizedBox(height: 18),
                const Text(
                  'Giới tính',
                  style: TextStyle(fontSize: 16, fontWeight: FontWeight.w600),
                ),
                const SizedBox(height: 8),
                DropdownButtonFormField<String>(
                  key: const ValueKey('profile-gender'),
                  initialValue: gender,
                  isExpanded: true,
                  style: const TextStyle(
                    fontSize: 18,
                    color: CareSeniorColors.text,
                  ),
                  items: const [
                    DropdownMenuItem(value: 'Nam', child: Text('Nam')),
                    DropdownMenuItem(value: 'Nữ', child: Text('Nữ')),
                    DropdownMenuItem(value: 'Khác', child: Text('Khác')),
                  ],
                  onChanged: (value) {
                    if (value == null) {
                      return;
                    }
                    setState(() {
                      gender = value;
                    });
                  },
                  decoration: InputDecoration(
                    prefixIcon: const Icon(Icons.people_outline_rounded),
                    filled: true,
                    fillColor: const Color(0xfff7faf8),
                    border: OutlineInputBorder(
                      borderRadius: BorderRadius.circular(18),
                      borderSide: const BorderSide(
                        color: CareSeniorColors.border,
                      ),
                    ),
                  ),
                ),
                const SizedBox(height: 18),
                buildTextField(
                  label: 'Số điện thoại liên hệ',
                  controller: phoneController,
                  icon: Icons.phone_outlined,
                  keyboardType: TextInputType.phone,
                  inputFormatters: [
                    FilteringTextInputFormatter.digitsOnly,
                    LengthLimitingTextInputFormatter(10),
                  ],
                ),
                const SizedBox(height: 18),
                buildTextField(
                  label: 'Email dùng để khôi phục mật khẩu',
                  controller: emailController,
                  icon: Icons.email_outlined,
                  hint: 'Nhập địa chỉ email',
                  keyboardType: TextInputType.emailAddress,
                ),
                const SizedBox(height: 18),
                buildTextField(
                  label: 'Địa chỉ',
                  controller: addressController,
                  icon: Icons.location_on_outlined,
                ),
                const SizedBox(height: 26),
                const Text(
                  'Thông tin sức khỏe',
                  style: TextStyle(fontSize: 22, fontWeight: FontWeight.w800),
                ),
                const SizedBox(height: 20),
                buildTextField(
                  label: 'Nhóm máu',
                  controller: bloodTypeController,
                  icon: Icons.bloodtype_outlined,
                  hint: 'Ví dụ: O+',
                ),
                const SizedBox(height: 18),
                buildTextField(
                  label: 'Bệnh nền',
                  controller: benhNenController,
                  icon: Icons.medical_information_outlined,
                ),
                const SizedBox(height: 18),
                buildTextField(
                  label: 'Dị ứng',
                  controller: diUngController,
                  icon: Icons.healing_outlined,
                ),
                const SizedBox(height: 26),
                FilledButton(
                  onPressed: saving ? null : saveProfile,
                  style: FilledButton.styleFrom(
                    backgroundColor: const Color(0xff21966f),
                  ),
                  child: ProfileButtonLabel(
                    label: saving ? 'ĐANG LƯU...' : 'LƯU THAY ĐỔI',
                    icon: Icons.save_outlined,
                    busy: saving,
                  ),
                ),
                const SizedBox(height: 12),
                OutlinedButton(
                  onPressed: () => Navigator.maybePop(context),
                  child: const ProfileButtonLabel(label: 'Hủy'),
                ),
              ],
            ),
    );
  }

  Widget _editorError() => Column(
    children: [
      const Icon(
        Icons.info_outline_rounded,
        color: CareSeniorColors.deepGreen,
        size: 44,
      ),
      const SizedBox(height: 16),
      Text(
        loadError!,
        textAlign: TextAlign.center,
        style: const TextStyle(fontSize: 17),
      ),
      const SizedBox(height: 16),
      FilledButton(onPressed: loadProfile, child: const Text('Thử lại')),
    ],
  );

  Widget _buildAccountEditor() {
    return ProfileFormPage(
      title: 'Chỉnh sửa hồ sơ',
      subtitle: 'Cập nhật thông tin tài khoản của bạn',
      scrollKey: const ValueKey('profile-edit-scroll'),
      child: loading
          ? const Center(child: CircularProgressIndicator())
          : loadError != null
          ? _editorError()
          : Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                const Text(
                  'Thông tin tài khoản',
                  style: TextStyle(fontSize: 22, fontWeight: FontWeight.w800),
                ),
                const SizedBox(height: 20),
                buildTextField(
                  label: 'Tên tài khoản',
                  controller: nameController,
                  icon: Icons.badge_outlined,
                ),
                const SizedBox(height: 18),
                buildTextField(
                  label: 'Email',
                  controller: emailController,
                  icon: Icons.email_outlined,
                  keyboardType: TextInputType.emailAddress,
                ),
                const SizedBox(height: 18),
                buildTextField(
                  label: 'Số điện thoại tài khoản',
                  controller: phoneController,
                  icon: Icons.phone_outlined,
                  keyboardType: TextInputType.phone,
                  inputFormatters: [
                    FilteringTextInputFormatter.digitsOnly,
                    LengthLimitingTextInputFormatter(10),
                  ],
                ),
                const SizedBox(height: 26),
                FilledButton(
                  onPressed: saving ? null : saveProfile,
                  style: FilledButton.styleFrom(
                    backgroundColor: const Color(0xff21966f),
                  ),
                  child: ProfileButtonLabel(
                    label: saving ? 'ĐANG LƯU...' : 'LƯU THAY ĐỔI',
                    icon: Icons.save_outlined,
                    busy: saving,
                  ),
                ),
                const SizedBox(height: 12),
                OutlinedButton(
                  onPressed: () => Navigator.maybePop(context),
                  child: const ProfileButtonLabel(label: 'Hủy'),
                ),
              ],
            ),
    );
  }
}
