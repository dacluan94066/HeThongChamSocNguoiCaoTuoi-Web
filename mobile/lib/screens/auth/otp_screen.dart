import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

class OtpScreen extends StatefulWidget {
  final String phoneNumber;

  const OtpScreen({super.key, required this.phoneNumber});

  @override
  State<OtpScreen> createState() => _OtpScreenState();
}

class _OtpScreenState extends State<OtpScreen> {
  final List<TextEditingController> controllers = List.generate(
    6,
    (_) => TextEditingController(),
  );

  final List<FocusNode> focusNodes = List.generate(6, (_) => FocusNode());

  void verifyOtp() {
    final otp = controllers.map((e) => e.text).join();

    if (otp.length != 6) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Vui lòng nhập đủ 6 số OTP.')),
      );
      return;
    }

    ScaffoldMessenger.of(context).showSnackBar(
      const SnackBar(content: Text('Xác thực OTP chưa được máy chủ hỗ trợ.')),
    );
  }

  String maskPhone(String phone) {
    if (phone.length != 10) {
      return phone;
    }

    return '${phone.substring(0, 3)}****${phone.substring(7)}';
  }

  void resendOtp() {
    // Xóa mã OTP cũ trên giao diện
    for (final controller in controllers) {
      controller.clear();
    }

    focusNodes[0].requestFocus();

    ScaffoldMessenger.of(context).showSnackBar(
      const SnackBar(content: Text('Gửi lại OTP chưa được máy chủ hỗ trợ.')),
    );
  }

  @override
  void dispose() {
    for (final controller in controllers) {
      controller.dispose();
    }

    for (final node in focusNodes) {
      node.dispose();
    }

    super.dispose();
  }

  Widget otpBox(int index) {
    return SizedBox(
      width: 48,
      height: 58,
      child: TextField(
        controller: controllers[index],
        focusNode: focusNodes[index],
        keyboardType: TextInputType.number,
        textAlign: TextAlign.center,
        style: const TextStyle(fontSize: 22, fontWeight: FontWeight.bold),
        inputFormatters: [
          FilteringTextInputFormatter.digitsOnly,
          LengthLimitingTextInputFormatter(1),
        ],
        decoration: InputDecoration(
          filled: true,
          fillColor: Colors.white,
          border: OutlineInputBorder(
            borderRadius: BorderRadius.circular(14),
            borderSide: BorderSide.none,
          ),
          enabledBorder: OutlineInputBorder(
            borderRadius: BorderRadius.circular(14),
            borderSide: BorderSide.none,
          ),
          focusedBorder: OutlineInputBorder(
            borderRadius: BorderRadius.circular(14),
            borderSide: const BorderSide(color: Color(0xff07856d), width: 1.5),
          ),
        ),
        onChanged: (value) {
          if (value.isNotEmpty && index < 5) {
            focusNodes[index + 1].requestFocus();
          }

          if (value.isEmpty && index > 0) {
            focusNodes[index - 1].requestFocus();
          }
        },
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: const Color(0xfff6f7f5),

      appBar: AppBar(
        backgroundColor: const Color(0xfff6f7f5),
        elevation: 0,
        title: const Text(
          'Xác minh OTP',
          style: TextStyle(fontWeight: FontWeight.bold),
        ),
      ),

      body: SingleChildScrollView(
        padding: const EdgeInsets.all(24),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            const SizedBox(height: 18),

            Center(
              child: Container(
                width: 82,
                height: 82,
                decoration: const BoxDecoration(
                  color: Color(0xffe2f4ee),
                  shape: BoxShape.circle,
                ),
                child: const Icon(
                  Icons.sms_outlined,
                  size: 42,
                  color: Color(0xff07856d),
                ),
              ),
            ),

            const SizedBox(height: 28),

            const Center(
              child: Text(
                'Nhập mã xác thực',
                style: TextStyle(fontSize: 27, fontWeight: FontWeight.bold),
              ),
            ),

            const SizedBox(height: 10),

            Center(
              child: Text(
                'Mã OTP đã được gửi đến\n${maskPhone(widget.phoneNumber)}',
                textAlign: TextAlign.center,
                style: const TextStyle(
                  fontSize: 15,
                  color: Colors.black54,
                  height: 1.5,
                ),
              ),
            ),

            const SizedBox(height: 35),

            Row(
              mainAxisAlignment: MainAxisAlignment.spaceBetween,
              children: List.generate(6, (index) => otpBox(index)),
            ),

            const SizedBox(height: 30),

            SizedBox(
              width: double.infinity,
              height: 56,
              child: ElevatedButton(
                onPressed: verifyOtp,
                style: ElevatedButton.styleFrom(
                  backgroundColor: const Color(0xff07856d),
                  foregroundColor: Colors.white,
                  elevation: 0,
                  shape: RoundedRectangleBorder(
                    borderRadius: BorderRadius.circular(18),
                  ),
                ),
                child: const Text(
                  'XÁC NHẬN',
                  style: TextStyle(fontSize: 16, fontWeight: FontWeight.bold),
                ),
              ),
            ),

            const SizedBox(height: 18),

            Center(
              child: Column(
                children: [
                  const Text(
                    'Không nhận được mã?',
                    style: TextStyle(color: Colors.black54),
                  ),

                  TextButton(
                    onPressed: resendOtp,
                    child: const Text(
                      'Gửi lại mã OTP',
                      style: TextStyle(
                        color: Color(0xff07856d),
                        fontWeight: FontWeight.bold,
                      ),
                    ),
                  ),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }
}
