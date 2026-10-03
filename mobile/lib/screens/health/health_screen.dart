import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

import '../../services/health_storage.dart';

class HealthScreen extends StatefulWidget {
  const HealthScreen({super.key});

  @override
  State<HealthScreen> createState() => _HealthScreenState();
}

class _HealthScreenState extends State<HealthScreen> {
  Map<String, String> healthData = {};

  bool loading = true;

  @override
  void initState() {
    super.initState();
    loadHealthData();
  }

  Future<void> loadHealthData() async {
    final data = await HealthStorage.loadHealthData();

    if (!mounted) {
      return;
    }

    setState(() {
      healthData = data;
      loading = false;
    });
  }

  Future<void> openUpdateHealthSheet() async {
    final heartController = TextEditingController(
      text: healthData['heartRate'] ?? '72',
    );

    final systolicController = TextEditingController(
      text: healthData['systolic'] ?? '125',
    );

    final diastolicController = TextEditingController(
      text: healthData['diastolic'] ?? '80',
    );

    final temperatureController = TextEditingController(
      text: healthData['temperature'] ?? '36.9',
    );

    final bloodSugarController = TextEditingController(
      text: healthData['bloodSugar'] ?? '6.2',
    );

    final weightController = TextEditingController(
      text: healthData['weight'] ?? '60',
    );

    await showModalBottomSheet(
      context: context,
      isScrollControlled: true,
      backgroundColor: Colors.white,
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(28)),
      ),
      builder: (sheetContext) {
        return Padding(
          padding: EdgeInsets.only(
            left: 18,
            right: 18,
            top: 18,
            bottom: MediaQuery.of(sheetContext).viewInsets.bottom + 24,
          ),
          child: SingleChildScrollView(
            child: Column(
              mainAxisSize: MainAxisSize.min,
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Center(
                  child: Container(
                    width: 48,
                    height: 5,
                    decoration: BoxDecoration(
                      color: Colors.black12,
                      borderRadius: BorderRadius.circular(20),
                    ),
                  ),
                ),

                const SizedBox(height: 20),

                const Text(
                  'Cập nhật chỉ số sức khỏe',
                  style: TextStyle(fontSize: 21, fontWeight: FontWeight.bold),
                ),

                const SizedBox(height: 6),

                const Text(
                  'Nhập các chỉ số đo được gần nhất.',
                  style: TextStyle(color: Colors.black54),
                ),

                const SizedBox(height: 22),

                buildHealthInput(
                  label: 'Nhịp tim',
                  controller: heartController,
                  icon: Icons.favorite_outline,
                  suffix: 'bpm',
                  decimal: false,
                ),

                const SizedBox(height: 14),

                buildHealthInput(
                  label: 'Huyết áp tâm thu',
                  controller: systolicController,
                  icon: Icons.monitor_heart_outlined,
                  suffix: 'mmHg',
                  decimal: false,
                ),

                const SizedBox(height: 14),

                buildHealthInput(
                  label: 'Huyết áp tâm trương',
                  controller: diastolicController,
                  icon: Icons.monitor_heart_outlined,
                  suffix: 'mmHg',
                  decimal: false,
                ),

                const SizedBox(height: 14),

                buildHealthInput(
                  label: 'Nhiệt độ',
                  controller: temperatureController,
                  icon: Icons.thermostat_outlined,
                  suffix: '°C',
                  decimal: true,
                ),

                const SizedBox(height: 14),

                buildHealthInput(
                  label: 'Đường huyết',
                  controller: bloodSugarController,
                  icon: Icons.bloodtype_outlined,
                  suffix: 'mmol/L',
                  decimal: true,
                ),

                const SizedBox(height: 14),

                buildHealthInput(
                  label: 'Cân nặng',
                  controller: weightController,
                  icon: Icons.monitor_weight_outlined,
                  suffix: 'kg',
                  decimal: true,
                ),

                const SizedBox(height: 24),

                SizedBox(
                  width: double.infinity,
                  height: 54,
                  child: ElevatedButton.icon(
                    onPressed: () async {
                      if (heartController.text.trim().isEmpty ||
                          systolicController.text.trim().isEmpty ||
                          diastolicController.text.trim().isEmpty ||
                          temperatureController.text.trim().isEmpty ||
                          bloodSugarController.text.trim().isEmpty ||
                          weightController.text.trim().isEmpty) {
                        ScaffoldMessenger.of(context).showSnackBar(
                          const SnackBar(
                            content: Text('Vui lòng nhập đầy đủ các chỉ số.'),
                          ),
                        );

                        return;
                      }

                      await HealthStorage.saveHealthData(
                        heartRate: heartController.text.trim(),
                        systolic: systolicController.text.trim(),
                        diastolic: diastolicController.text.trim(),
                        temperature: temperatureController.text.trim(),
                        bloodSugar: bloodSugarController.text.trim(),
                        weight: weightController.text.trim(),
                      );

                      if (!mounted) {
                        return;
                      }

                      Navigator.pop(sheetContext);

                      await loadHealthData();

                      if (!mounted) {
                        return;
                      }

                      ScaffoldMessenger.of(context).showSnackBar(
                        const SnackBar(
                          content: Text('Đã lưu chỉ số sức khỏe.'),
                        ),
                      );
                    },
                    icon: const Icon(Icons.save_outlined),
                    label: const Text(
                      'LƯU CHỈ SỐ',
                      style: TextStyle(fontWeight: FontWeight.bold),
                    ),
                    style: ElevatedButton.styleFrom(
                      backgroundColor: const Color(0xff07856d),
                      foregroundColor: Colors.white,
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
      },
    );

    heartController.dispose();
    systolicController.dispose();
    diastolicController.dispose();
    temperatureController.dispose();
    bloodSugarController.dispose();
    weightController.dispose();
  }

  Widget buildHealthInput({
    required String label,
    required TextEditingController controller,
    required IconData icon,
    required String suffix,
    required bool decimal,
  }) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(
          label,
          style: const TextStyle(fontSize: 14, fontWeight: FontWeight.w600),
        ),

        const SizedBox(height: 7),

        TextField(
          controller: controller,
          keyboardType: TextInputType.numberWithOptions(decimal: decimal),
          inputFormatters: [
            FilteringTextInputFormatter.allow(
              decimal ? RegExp(r'[0-9.]') : RegExp(r'[0-9]'),
            ),
          ],
          decoration: InputDecoration(
            prefixIcon: Icon(icon),
            suffixText: suffix,
            filled: true,
            fillColor: const Color(0xfff6f6f6),
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
                width: 1.3,
              ),
            ),
          ),
        ),
      ],
    );
  }

  @override
  Widget build(BuildContext context) {
    if (loading) {
      return const Scaffold(
        backgroundColor: Color(0xfff3f3f1),
        body: Center(
          child: CircularProgressIndicator(color: Color(0xff07856d)),
        ),
      );
    }

    final heartRate = healthData['heartRate'] ?? '72';

    final systolic = healthData['systolic'] ?? '125';

    final diastolic = healthData['diastolic'] ?? '80';

    final temperature = healthData['temperature'] ?? '36.9';

    final bloodSugar = healthData['bloodSugar'] ?? '6.2';

    final weight = healthData['weight'] ?? '60';

    final updatedAt = healthData['updatedAt'] ?? 'Chưa cập nhật';

    return Scaffold(
      backgroundColor: const Color(0xfff3f3f1),

      appBar: AppBar(
        backgroundColor: const Color(0xfff3f3f1),
        elevation: 0,
        centerTitle: true,
        title: const Text(
          'Theo dõi sức khỏe',
          style: TextStyle(fontWeight: FontWeight.bold),
        ),
      ),

      body: SingleChildScrollView(
        padding: const EdgeInsets.fromLTRB(18, 10, 18, 30),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Container(
              width: double.infinity,
              padding: const EdgeInsets.all(18),
              decoration: BoxDecoration(
                gradient: const LinearGradient(
                  colors: [Color(0xffe9fff6), Color(0xffffffe8)],
                  begin: Alignment.topLeft,
                  end: Alignment.bottomRight,
                ),
                borderRadius: BorderRadius.circular(28),
              ),
              child: Row(
                children: [
                  Container(
                    width: 66,
                    height: 66,
                    decoration: const BoxDecoration(
                      color: Colors.white,
                      shape: BoxShape.circle,
                    ),
                    child: const Icon(
                      Icons.favorite_rounded,
                      color: Color(0xffe45050),
                      size: 34,
                    ),
                  ),

                  const SizedBox(width: 14),

                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        const Text(
                          'Chỉ số sức khỏe gần nhất',
                          style: TextStyle(fontSize: 13, color: Colors.black54),
                        ),

                        const SizedBox(height: 5),

                        const Text(
                          'Đã ghi nhận dữ liệu',
                          style: TextStyle(
                            fontSize: 20,
                            fontWeight: FontWeight.bold,
                          ),
                        ),

                        const SizedBox(height: 5),

                        Text(
                          updatedAt,
                          style: const TextStyle(
                            fontSize: 12,
                            color: Colors.black54,
                          ),
                        ),
                      ],
                    ),
                  ),
                ],
              ),
            ),

            const SizedBox(height: 24),

            const Text(
              'Chỉ số hiện tại',
              style: TextStyle(fontSize: 18, fontWeight: FontWeight.bold),
            ),

            const SizedBox(height: 12),

            Row(
              children: [
                Expanded(
                  child: HealthMetricCard(
                    icon: Icons.favorite_rounded,
                    title: 'Nhịp tim',
                    value: heartRate,
                    unit: 'bpm',
                    iconColor: const Color(0xffe45050),
                    backgroundColor: const Color(0xffffeeee),
                  ),
                ),

                const SizedBox(width: 12),

                Expanded(
                  child: HealthMetricCard(
                    icon: Icons.thermostat,
                    title: 'Nhiệt độ',
                    value: temperature,
                    unit: '°C',
                    iconColor: const Color(0xffff8b3d),
                    backgroundColor: const Color(0xfffff2e8),
                  ),
                ),
              ],
            ),

            const SizedBox(height: 12),

            Row(
              children: [
                Expanded(
                  child: HealthMetricCard(
                    icon: Icons.monitor_heart_rounded,
                    title: 'Huyết áp',
                    value: '$systolic/$diastolic',
                    unit: 'mmHg',
                    iconColor: const Color(0xff4b6edb),
                    backgroundColor: const Color(0xffe9efff),
                  ),
                ),

                const SizedBox(width: 12),

                Expanded(
                  child: HealthMetricCard(
                    icon: Icons.bloodtype_rounded,
                    title: 'Đường huyết',
                    value: bloodSugar,
                    unit: 'mmol/L',
                    iconColor: const Color(0xff9c55d7),
                    backgroundColor: const Color(0xfff3eaff),
                  ),
                ),
              ],
            ),

            const SizedBox(height: 12),

            HealthMetricCard(
              icon: Icons.monitor_weight_rounded,
              title: 'Cân nặng',
              value: weight,
              unit: 'kg',
              iconColor: const Color(0xff07856d),
              backgroundColor: const Color(0xffe8f8ee),
              fullWidth: true,
            ),

            const SizedBox(height: 24),

            Container(
              width: double.infinity,
              padding: const EdgeInsets.all(16),
              decoration: BoxDecoration(
                color: Colors.white,
                borderRadius: BorderRadius.circular(22),
              ),
              child: const Row(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Icon(Icons.info_outline_rounded, color: Color(0xff07856d)),

                  SizedBox(width: 10),

                  Expanded(
                    child: Text(
                      'Các chỉ số trong ứng dụng dùng để ghi nhận và theo dõi thông tin do người dùng nhập, không thay thế chẩn đoán của nhân viên y tế.',
                      style: TextStyle(
                        fontSize: 13,
                        color: Colors.black54,
                        height: 1.4,
                      ),
                    ),
                  ),
                ],
              ),
            ),

            const SizedBox(height: 24),

            SizedBox(
              width: double.infinity,
              height: 56,
              child: ElevatedButton.icon(
                onPressed: openUpdateHealthSheet,
                icon: const Icon(Icons.edit_rounded),
                label: const Text(
                  'CẬP NHẬT CHỈ SỐ',
                  style: TextStyle(fontSize: 16, fontWeight: FontWeight.bold),
                ),
                style: ElevatedButton.styleFrom(
                  backgroundColor: const Color(0xff07856d),
                  foregroundColor: Colors.white,
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
}

class HealthMetricCard extends StatelessWidget {
  final IconData icon;
  final String title;
  final String value;
  final String unit;
  final Color iconColor;
  final Color backgroundColor;
  final bool fullWidth;

  const HealthMetricCard({
    super.key,
    required this.icon,
    required this.title,
    required this.value,
    required this.unit,
    required this.iconColor,
    required this.backgroundColor,
    this.fullWidth = false,
  });

  @override
  Widget build(BuildContext context) {
    return Container(
      width: fullWidth ? double.infinity : null,
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(22),
      ),
      child: Row(
        children: [
          Container(
            width: 46,
            height: 46,
            decoration: BoxDecoration(
              color: backgroundColor,
              borderRadius: BorderRadius.circular(15),
            ),
            child: Icon(icon, color: iconColor),
          ),

          const SizedBox(width: 12),

          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  title,
                  style: const TextStyle(fontSize: 12, color: Colors.black54),
                ),

                const SizedBox(height: 4),

                Wrap(
                  crossAxisAlignment: WrapCrossAlignment.center,
                  spacing: 4,
                  children: [
                    Text(
                      value,
                      style: const TextStyle(
                        fontSize: 20,
                        fontWeight: FontWeight.bold,
                      ),
                    ),
                    Text(
                      unit,
                      style: const TextStyle(
                        fontSize: 11,
                        color: Colors.black54,
                      ),
                    ),
                  ],
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }
}
