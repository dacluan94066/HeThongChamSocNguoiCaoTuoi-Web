import 'package:flutter/material.dart';

class RegisterScreen extends StatefulWidget {
  const RegisterScreen({super.key});

  @override
  State<RegisterScreen> createState() => _RegisterScreenState();
}

class _RegisterScreenState extends State<RegisterScreen> {
  bool obscurePassword = true;
  bool obscureConfirmPassword = true;
  bool agreeTerms = false;

  final TextEditingController nameController = TextEditingController();
  final TextEditingController phoneController = TextEditingController();
  final TextEditingController birthController = TextEditingController();
  final TextEditingController passwordController = TextEditingController();
  final TextEditingController confirmPasswordController =
      TextEditingController();

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: const Color(0xfff6f7f5),
      appBar: AppBar(
        backgroundColor: const Color(0xfff6f7f5),
        elevation: 0,
        title: const Text(
          'Đăng ký',
          style: TextStyle(fontWeight: FontWeight.bold),
        ),
      ),
      body: SingleChildScrollView(
        padding: const EdgeInsets.symmetric(horizontal: 24, vertical: 10),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            const Text(
              'Tạo tài khoản',
              style: TextStyle(fontSize: 28, fontWeight: FontWeight.bold),
            ),

            const SizedBox(height: 8),

            const Text(
              'Tạo tài khoản để theo dõi sức khỏe và nhận nhắc nhở mỗi ngày.',
              style: TextStyle(
                fontSize: 15,
                color: Colors.black54,
                height: 1.4,
              ),
            ),

            const SizedBox(height: 30),

            const Text(
              'Họ và tên',
              style: TextStyle(fontWeight: FontWeight.w600, fontSize: 15),
            ),

            const SizedBox(height: 8),

            TextField(
              controller: nameController,
              decoration: InputDecoration(
                hintText: 'Nguyễn Văn An',
                prefixIcon: const Icon(Icons.person_outline),
                filled: true,
                fillColor: Colors.white,
                border: OutlineInputBorder(
                  borderRadius: BorderRadius.circular(18),
                  borderSide: BorderSide.none,
                ),
              ),
            ),

            const SizedBox(height: 18),

            const Text(
              'Số điện thoại',
              style: TextStyle(fontWeight: FontWeight.w600, fontSize: 15),
            ),

            const SizedBox(height: 8),

            TextField(
              controller: phoneController,
              keyboardType: TextInputType.phone,
              decoration: InputDecoration(
                hintText: 'Nhập số điện thoại',
                prefixIcon: const Icon(Icons.phone_outlined),
                filled: true,
                fillColor: Colors.white,
                border: OutlineInputBorder(
                  borderRadius: BorderRadius.circular(18),
                  borderSide: BorderSide.none,
                ),
              ),
            ),

            const SizedBox(height: 18),

            const Text(
              'Ngày sinh',
              style: TextStyle(fontWeight: FontWeight.w600, fontSize: 15),
            ),

            const SizedBox(height: 8),

            TextField(
              controller: birthController,
              readOnly: true,
              decoration: InputDecoration(
                hintText: 'Chọn ngày sinh',
                prefixIcon: const Icon(Icons.calendar_month_outlined),
                filled: true,
                fillColor: Colors.white,
                border: OutlineInputBorder(
                  borderRadius: BorderRadius.circular(18),
                  borderSide: BorderSide.none,
                ),
              ),
              onTap: () async {
                final DateTime? pickedDate = await showDatePicker(
                  context: context,
                  initialDate: DateTime(1950),
                  firstDate: DateTime(1920),
                  lastDate: DateTime.now(),
                  helpText: 'Chọn ngày sinh',
                  cancelText: 'Hủy',
                  confirmText: 'Chọn',
                );

                if (pickedDate != null) {
                  birthController.text =
                      '${pickedDate.day.toString().padLeft(2, '0')}/'
                      '${pickedDate.month.toString().padLeft(2, '0')}/'
                      '${pickedDate.year}';
                }
              },
            ),

            const SizedBox(height: 18),

            const Text(
              'Mật khẩu',
              style: TextStyle(fontWeight: FontWeight.w600, fontSize: 15),
            ),

            const SizedBox(height: 8),

            TextField(
              controller: passwordController,
              obscureText: obscurePassword,
              decoration: InputDecoration(
                hintText: 'Nhập mật khẩu',
                prefixIcon: const Icon(Icons.lock_outline),
                suffixIcon: IconButton(
                  onPressed: () {
                    setState(() {
                      obscurePassword = !obscurePassword;
                    });
                  },
                  icon: Icon(
                    obscurePassword
                        ? Icons.visibility_off_outlined
                        : Icons.visibility_outlined,
                  ),
                ),
                filled: true,
                fillColor: Colors.white,
                border: OutlineInputBorder(
                  borderRadius: BorderRadius.circular(18),
                  borderSide: BorderSide.none,
                ),
              ),
            ),

            const SizedBox(height: 18),

            const Text(
              'Xác nhận mật khẩu',
              style: TextStyle(fontWeight: FontWeight.w600, fontSize: 15),
            ),

            const SizedBox(height: 8),

            TextField(
              controller: confirmPasswordController,
              obscureText: obscureConfirmPassword,
              decoration: InputDecoration(
                hintText: 'Nhập lại mật khẩu',
                prefixIcon: const Icon(Icons.lock_outline),
                suffixIcon: IconButton(
                  onPressed: () {
                    setState(() {
                      obscureConfirmPassword = !obscureConfirmPassword;
                    });
                  },
                  icon: Icon(
                    obscureConfirmPassword
                        ? Icons.visibility_off_outlined
                        : Icons.visibility_outlined,
                  ),
                ),
                filled: true,
                fillColor: Colors.white,
                border: OutlineInputBorder(
                  borderRadius: BorderRadius.circular(18),
                  borderSide: BorderSide.none,
                ),
              ),
            ),

            const SizedBox(height: 14),

            Row(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Checkbox(
                  value: agreeTerms,
                  activeColor: const Color(0xff07856d),
                  onChanged: (value) {
                    setState(() {
                      agreeTerms = value ?? false;
                    });
                  },
                ),
                const Expanded(
                  child: Padding(
                    padding: EdgeInsets.only(top: 12),
                    child: Text(
                      'Tôi đồng ý với Điều khoản sử dụng và Chính sách bảo mật.',
                      style: TextStyle(fontSize: 13, color: Colors.black54),
                    ),
                  ),
                ),
              ],
            ),

            const SizedBox(height: 12),

            SizedBox(
              width: double.infinity,
              height: 56,
              child: ElevatedButton(
                onPressed: () {
                  if (nameController.text.isEmpty ||
                      phoneController.text.isEmpty ||
                      birthController.text.isEmpty ||
                      passwordController.text.isEmpty ||
                      confirmPasswordController.text.isEmpty) {
                    ScaffoldMessenger.of(context).showSnackBar(
                      const SnackBar(
                        content: Text('Vui lòng nhập đầy đủ thông tin.'),
                      ),
                    );
                    return;
                  }

                  if (passwordController.text !=
                      confirmPasswordController.text) {
                    ScaffoldMessenger.of(context).showSnackBar(
                      const SnackBar(
                        content: Text('Mật khẩu xác nhận không khớp.'),
                      ),
                    );
                    return;
                  }

                  if (!agreeTerms) {
                    ScaffoldMessenger.of(context).showSnackBar(
                      const SnackBar(
                        content: Text(
                          'Vui lòng đồng ý với điều khoản sử dụng.',
                        ),
                      ),
                    );
                    return;
                  }

                  ScaffoldMessenger.of(context).showSnackBar(
                    const SnackBar(
                      content: Text('Thông tin hợp lệ. Chuẩn bị gửi mã OTP.'),
                    ),
                  );
                },
                style: ElevatedButton.styleFrom(
                  backgroundColor: const Color(0xff07856d),
                  foregroundColor: Colors.white,
                  elevation: 0,
                  shape: RoundedRectangleBorder(
                    borderRadius: BorderRadius.circular(18),
                  ),
                ),
                child: const Text(
                  'ĐĂNG KÝ',
                  style: TextStyle(fontSize: 16, fontWeight: FontWeight.bold),
                ),
              ),
            ),

            const SizedBox(height: 22),

            Row(
              mainAxisAlignment: MainAxisAlignment.center,
              children: [
                const Text(
                  'Đã có tài khoản? ',
                  style: TextStyle(color: Colors.black54),
                ),
                TextButton(
                  onPressed: () {
                    Navigator.pop(context);
                  },
                  child: const Text(
                    'Đăng nhập',
                    style: TextStyle(
                      color: Color(0xff07856d),
                      fontWeight: FontWeight.bold,
                    ),
                  ),
                ),
              ],
            ),

            const SizedBox(height: 25),
          ],
        ),
      ),
    );
  }
}
