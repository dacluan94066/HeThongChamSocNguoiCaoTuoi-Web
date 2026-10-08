import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

import '../../services/api_client.dart';
import '../../services/auth_service.dart';
import '../../services/elderly_service.dart';

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
          style: const TextStyle(fontSize: 14, fontWeight: FontWeight.w600),
        ),

        const SizedBox(height: 8),

        TextField(
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
            fillColor: Colors.white,
            border: OutlineInputBorder(
              borderRadius: BorderRadius.circular(18),
              borderSide: BorderSide.none,
            ),
            enabledBorder: OutlineInputBorder(
              borderRadius: BorderRadius.circular(18),
              borderSide: BorderSide.none,
            ),
            focusedBorder: OutlineInputBorder(
              borderRadius: BorderRadius.circular(18),
              borderSide: const BorderSide(
                color: Color(0xff07856d),
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
    return Scaffold(
      backgroundColor: const Color(0xfff3f3f1),
      appBar: AppBar(
        backgroundColor: const Color(0xfff3f3f1),
        elevation: 0,
        centerTitle: true,
        title: const Text(
          'Chỉnh sửa hồ sơ',
          style: TextStyle(fontWeight: FontWeight.bold),
        ),
      ),
      body: loading
          ? const Center(
              child: CircularProgressIndicator(color: Color(0xff07856d)),
            )
          : loadError != null
          ? Center(
              child: Column(
                mainAxisSize: MainAxisSize.min,
                children: [
                  Text(loadError!, textAlign: TextAlign.center),
                  ElevatedButton(
                    onPressed: loadProfile,
                    child: const Text('Thử lại'),
                  ),
                ],
              ),
            )
          : SingleChildScrollView(
              padding: const EdgeInsets.fromLTRB(18, 10, 18, 30),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Center(
                    child: Stack(
                      alignment: Alignment.bottomRight,
                      children: [
                        const CircleAvatar(
                          radius: 52,
                          backgroundColor: Color(0xffe8f8ee),
                          child: Icon(
                            Icons.person_rounded,
                            size: 62,
                            color: Color(0xff07856d),
                          ),
                        ),
                        Container(
                          width: 34,
                          height: 34,
                          decoration: const BoxDecoration(
                            color: Color(0xff07856d),
                            shape: BoxShape.circle,
                          ),
                          child: const Icon(
                            Icons.camera_alt_outlined,
                            color: Colors.white,
                            size: 18,
                          ),
                        ),
                      ],
                    ),
                  ),

                  const SizedBox(height: 26),

                  const Text(
                    'Thông tin cá nhân',
                    style: TextStyle(fontSize: 19, fontWeight: FontWeight.bold),
                  ),

                  const SizedBox(height: 16),

                  buildTextField(
                    label: 'Họ và tên',
                    controller: nameController,
                    icon: Icons.badge_outlined,
                    hint: 'Nhập họ và tên',
                  ),

                  const SizedBox(height: 16),

                  buildTextField(
                    label: 'Ngày sinh',
                    controller: birthController,
                    icon: Icons.cake_outlined,
                    readOnly: true,
                    onTap: selectBirthDate,
                  ),

                  const SizedBox(height: 16),

                  const Text(
                    'Giới tính',
                    style: TextStyle(fontSize: 14, fontWeight: FontWeight.w600),
                  ),

                  const SizedBox(height: 8),

                  DropdownButtonFormField<String>(
                    initialValue: gender,
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
                      fillColor: Colors.white,
                      border: OutlineInputBorder(
                        borderRadius: BorderRadius.circular(18),
                        borderSide: BorderSide.none,
                      ),
                    ),
                  ),

                  const SizedBox(height: 16),

                  buildTextField(
                    label: 'Số điện thoại',
                    controller: phoneController,
                    icon: Icons.phone_outlined,
                    keyboardType: TextInputType.phone,
                    inputFormatters: [
                      FilteringTextInputFormatter.digitsOnly,
                      LengthLimitingTextInputFormatter(10),
                    ],
                  ),

                  const SizedBox(height: 16),

                  buildTextField(
                    label: 'Email dùng để khôi phục mật khẩu',
                    controller: emailController,
                    icon: Icons.email_outlined,
                    hint: 'Nhập địa chỉ email',
                    keyboardType: TextInputType.emailAddress,
                  ),

                  const SizedBox(height: 16),

                  buildTextField(
                    label: 'Địa chỉ',
                    controller: addressController,
                    icon: Icons.location_on_outlined,
                  ),

                  const SizedBox(height: 26),

                  const Text(
                    'Thông tin sức khỏe',
                    style: TextStyle(fontSize: 19, fontWeight: FontWeight.bold),
                  ),

                  const SizedBox(height: 16),

                  buildTextField(
                    label: 'Nhóm máu',
                    controller: bloodTypeController,
                    icon: Icons.bloodtype_outlined,
                    hint: 'Ví dụ: O+',
                  ),

                  const SizedBox(height: 16),

                  buildTextField(
                    label: 'Bệnh nền',
                    controller: benhNenController,
                    icon: Icons.medical_information_outlined,
                  ),

                  const SizedBox(height: 16),

                  buildTextField(
                    label: 'Dị ứng',
                    controller: diUngController,
                    icon: Icons.healing_outlined,
                  ),

                  const SizedBox(height: 28),

                  SizedBox(
                    width: double.infinity,
                    height: 56,
                    child: ElevatedButton.icon(
                      onPressed: saving ? null : saveProfile,
                      icon: saving
                          ? const SizedBox(
                              width: 19,
                              height: 19,
                              child: CircularProgressIndicator(
                                strokeWidth: 2,
                                color: Colors.white,
                              ),
                            )
                          : const Icon(Icons.save_outlined),
                      label: Text(
                        saving ? 'ĐANG LƯU...' : 'LƯU THAY ĐỔI',
                        style: const TextStyle(
                          fontSize: 16,
                          fontWeight: FontWeight.bold,
                        ),
                      ),
                      style: ElevatedButton.styleFrom(
                        backgroundColor: const Color(0xff07856d),
                        foregroundColor: Colors.white,
                        disabledBackgroundColor: const Color(0xff7db5a8),
                        elevation: 0,
                        shape: RoundedRectangleBorder(
                          borderRadius: BorderRadius.circular(18),
                        ),
                      ),
                    ),
                  ),
                ],
              ),
            ),
    );
  }

  Widget _buildAccountEditor() {
    return Scaffold(
      backgroundColor: const Color(0xfff3f3f1),
      appBar: AppBar(
        title: const Text(
          'Chỉnh sửa hồ sơ',
          style: TextStyle(fontWeight: FontWeight.bold),
        ),
      ),
      body: loading
          ? const Center(child: CircularProgressIndicator())
          : loadError != null
          ? Center(
              child: Column(
                mainAxisSize: MainAxisSize.min,
                children: [
                  Text(loadError!, textAlign: TextAlign.center),
                  const SizedBox(height: 12),
                  FilledButton(
                    onPressed: loadProfile,
                    child: const Text('Thử lại'),
                  ),
                ],
              ),
            )
          : ListView(
              padding: const EdgeInsets.all(18),
              children: [
                buildTextField(
                  label: 'Họ và tên',
                  controller: nameController,
                  icon: Icons.badge_outlined,
                ),
                const SizedBox(height: 16),
                buildTextField(
                  label: 'Email',
                  controller: emailController,
                  icon: Icons.email_outlined,
                  keyboardType: TextInputType.emailAddress,
                ),
                const SizedBox(height: 16),
                buildTextField(
                  label: 'Số điện thoại',
                  controller: phoneController,
                  icon: Icons.phone_outlined,
                  keyboardType: TextInputType.phone,
                  inputFormatters: [
                    FilteringTextInputFormatter.digitsOnly,
                    LengthLimitingTextInputFormatter(10),
                  ],
                ),
                const SizedBox(height: 28),
                FilledButton.icon(
                  onPressed: saving ? null : saveProfile,
                  style: FilledButton.styleFrom(
                    minimumSize: const Size.fromHeight(54),
                    backgroundColor: const Color(0xff07856d),
                  ),
                  icon: saving
                      ? const SizedBox(
                          width: 19,
                          height: 19,
                          child: CircularProgressIndicator(
                            strokeWidth: 2,
                            color: Colors.white,
                          ),
                        )
                      : const Icon(Icons.save_outlined),
                  label: Text(saving ? 'ĐANG LƯU...' : 'LƯU THAY ĐỔI'),
                ),
              ],
            ),
    );
  }
}
