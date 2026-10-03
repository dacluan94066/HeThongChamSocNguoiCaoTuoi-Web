import 'package:flutter/material.dart';

import '../../services/medication_storage.dart';

class MedicationScreen extends StatefulWidget {
  const MedicationScreen({super.key});

  @override
  State<MedicationScreen> createState() => _MedicationScreenState();
}

class _MedicationScreenState extends State<MedicationScreen> {
  Map<String, bool> medicationStatus = {};
  Map<String, bool> reminderStatus = {};
  Map<String, String> reminderTimes = {};

  bool loading = true;

  String selectedPeriod = 'Sáng';

  final List<Map<String, String>> medicines = [
    {
      'name': 'Metformin 500mg',
      'period': 'Sáng',
      'dose': '1 viên',
      'note': 'Sau ăn',
    },
    {
      'name': 'Lisinopril 10mg',
      'period': 'Sáng',
      'dose': '1 viên',
      'note': 'Trước ăn',
    },
    {
      'name': 'Aspirin 81mg',
      'period': 'Trưa',
      'dose': '1 viên',
      'note': 'Sau ăn',
    },
    {'name': 'Vitamin D3', 'period': 'Tối', 'dose': '1 viên', 'note': 'Sau ăn'},
  ];

  @override
  void initState() {
    super.initState();
    loadData();
  }

  Future<void> loadData() async {
    final status = await MedicationStorage.loadMedicationStatus();

    final reminders = await MedicationStorage.loadReminderStatus();

    final times = await MedicationStorage.loadReminderTimes();

    if (!mounted) return;

    setState(() {
      medicationStatus = status;
      reminderStatus = reminders;
      reminderTimes = times;
      loading = false;
    });
  }

  List<Map<String, String>> get visibleMedicines {
    return medicines.where((item) => item['period'] == selectedPeriod).toList();
  }

  int get completedCount {
    return medicationStatus.values.where((done) => done).length;
  }

  Future<void> toggleMedication(String medicineName) async {
    final current = medicationStatus[medicineName] ?? false;

    await MedicationStorage.saveMedicationStatus(
      medicineName: medicineName,
      done: !current,
    );

    await loadData();

    if (!mounted) return;

    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(
        content: Text(
          !current
              ? 'Đã đánh dấu $medicineName là đã uống.'
              : 'Đã chuyển $medicineName về chưa uống.',
        ),
      ),
    );
  }

  Future<void> toggleReminder(String medicineName, bool enabled) async {
    await MedicationStorage.saveReminderStatus(
      medicineName: medicineName,
      enabled: enabled,
    );

    await loadData();

    if (!mounted) return;

    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(
        content: Text(
          enabled
              ? 'Đã bật nhắc uống $medicineName.'
              : 'Đã tắt nhắc uống $medicineName.',
        ),
      ),
    );
  }

  Future<void> changeReminderTime(String medicineName) async {
    final currentTime = reminderTimes[medicineName] ?? '08:00';

    final parts = currentTime.split(':');

    final initialTime = TimeOfDay(
      hour: int.tryParse(parts[0]) ?? 8,
      minute: int.tryParse(parts[1]) ?? 0,
    );

    final selected = await showTimePicker(
      context: context,
      initialTime: initialTime,
    );

    if (selected == null) return;

    final hour = selected.hour.toString().padLeft(2, '0');

    final minute = selected.minute.toString().padLeft(2, '0');

    final formatted = '$hour:$minute';
    await MedicationStorage.saveReminderTime(
      medicineName: medicineName,
      time: formatted,
    );

    await loadData();

    if (!mounted) return;

    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(
        content: Text('Đã đổi giờ nhắc $medicineName thành $formatted.'),
      ),
    );
  }

  Widget buildPeriodButton(String period) {
    final selected = selectedPeriod == period;

    return Expanded(
      child: SizedBox(
        height: 52,
        child: ElevatedButton(
          onPressed: () {
            setState(() {
              selectedPeriod = period;
            });
          },
          style: ElevatedButton.styleFrom(
            backgroundColor: selected ? const Color(0xff07856d) : Colors.white,
            foregroundColor: selected ? Colors.white : Colors.black54,
            elevation: 0,
            shape: RoundedRectangleBorder(
              borderRadius: BorderRadius.circular(18),
            ),
          ),
          child: Text(
            period,
            style: const TextStyle(fontWeight: FontWeight.bold),
          ),
        ),
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: const Color(0xfff3f3f1),

      appBar: AppBar(
        backgroundColor: const Color(0xfff3f3f1),
        elevation: 0,
        centerTitle: true,
        title: const Text(
          'Lịch uống thuốc',
          style: TextStyle(fontWeight: FontWeight.bold),
        ),
      ),

      body: loading
          ? const Center(
              child: CircularProgressIndicator(color: Color(0xff07856d)),
            )
          : RefreshIndicator(
              onRefresh: loadData,
              color: const Color(0xff07856d),
              child: ListView(
                padding: const EdgeInsets.fromLTRB(18, 10, 18, 30),
                children: [
                  Container(
                    padding: const EdgeInsets.all(18),
                    decoration: BoxDecoration(
                      gradient: const LinearGradient(
                        colors: [Color(0xffffeef1), Color(0xffe9fff6)],
                      ),
                      borderRadius: BorderRadius.circular(28),
                    ),
                    child: Row(
                      children: [
                        const CircleAvatar(
                          radius: 31,
                          backgroundColor: Colors.white,
                          child: Icon(
                            Icons.medication_rounded,
                            color: Color(0xffe85d75),
                            size: 32,
                          ),
                        ),

                        const SizedBox(width: 14),

                        Expanded(
                          child: Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              const Text(
                                'Tiến độ hôm nay',
                                style: TextStyle(
                                  fontSize: 13,
                                  color: Colors.black54,
                                ),
                              ),

                              const SizedBox(height: 4),

                              Text(
                                '$completedCount/${medicines.length} loại thuốc',
                                style: const TextStyle(
                                  fontSize: 21,
                                  fontWeight: FontWeight.bold,
                                ),
                              ),

                              const SizedBox(height: 10),

                              ClipRRect(
                                borderRadius: BorderRadius.circular(20),
                                child: LinearProgressIndicator(
                                  value: completedCount / medicines.length,
                                  minHeight: 9,
                                  backgroundColor: Colors.white,
                                  color: const Color(0xff07856d),
                                ),
                              ),
                            ],
                          ),
                        ),
                      ],
                    ),
                  ),

                  const SizedBox(height: 20),

                  Container(
                    padding: const EdgeInsets.all(14),
                    decoration: BoxDecoration(
                      color: Colors.white,
                      borderRadius: BorderRadius.circular(22),
                    ),
                    child: const Row(
                      children: [
                        Icon(
                          Icons.notifications_active_outlined,
                          color: Color(0xff07856d),
                        ),
                        SizedBox(width: 10),
                        Expanded(
                          child: Text(
                            'Bật nhắc và chọn giờ riêng cho từng loại thuốc.',
                            style: TextStyle(
                              fontSize: 13,
                              color: Colors.black54,
                            ),
                          ),
                        ),
                      ],
                    ),
                  ),

                  const SizedBox(height: 20),

                  Row(
                    children: [
                      buildPeriodButton('Sáng'),
                      const SizedBox(width: 8),
                      buildPeriodButton('Trưa'),
                      const SizedBox(width: 8),
                      buildPeriodButton('Tối'),
                    ],
                  ),

                  const SizedBox(height: 24),

                  Text(
                    'Thuốc buổi $selectedPeriod',
                    style: const TextStyle(
                      fontSize: 20,
                      fontWeight: FontWeight.bold,
                    ),
                  ),

                  const SizedBox(height: 12),

                  ...visibleMedicines.map((medicine) {
                    final name = medicine['name']!;

                    final done = medicationStatus[name] ?? false;

                    final reminderEnabled = reminderStatus[name] ?? false;

                    final reminderTime = reminderTimes[name] ?? '--:--';

                    return Container(
                      margin: const EdgeInsets.only(bottom: 14),
                      padding: const EdgeInsets.all(16),
                      decoration: BoxDecoration(
                        color: Colors.white,
                        borderRadius: BorderRadius.circular(24),
                      ),
                      child: Column(
                        children: [
                          Row(
                            children: [
                              Container(
                                width: 54,
                                height: 54,
                                decoration: BoxDecoration(
                                  color: const Color(0xffffe8ec),
                                  borderRadius: BorderRadius.circular(17),
                                ),
                                child: const Icon(
                                  Icons.medication_rounded,
                                  color: Color(0xffe85d75),
                                ),
                              ),

                              const SizedBox(width: 12),

                              Expanded(
                                child: Column(
                                  crossAxisAlignment: CrossAxisAlignment.start,
                                  children: [
                                    Text(
                                      name,
                                      style: const TextStyle(
                                        fontSize: 15,
                                        fontWeight: FontWeight.bold,
                                      ),
                                    ),

                                    const SizedBox(height: 4),

                                    Text(
                                      '$reminderTime • ${medicine['dose']}',
                                      style: const TextStyle(
                                        fontSize: 13,
                                        color: Colors.black54,
                                      ),
                                    ),

                                    Text(
                                      medicine['note']!,
                                      style: const TextStyle(
                                        fontSize: 12,
                                        color: Colors.black45,
                                      ),
                                    ),
                                  ],
                                ),
                              ),

                              Container(
                                padding: const EdgeInsets.symmetric(
                                  horizontal: 10,
                                  vertical: 6,
                                ),
                                decoration: BoxDecoration(
                                  color: done
                                      ? const Color(0xffe8f8ee)
                                      : const Color(0xfffff1df),
                                  borderRadius: BorderRadius.circular(18),
                                ),
                                child: Text(
                                  done ? 'Đã uống' : 'Chưa uống',
                                  style: TextStyle(
                                    fontSize: 10,
                                    fontWeight: FontWeight.bold,
                                    color: done
                                        ? const Color(0xff07856d)
                                        : const Color(0xffe28a15),
                                  ),
                                ),
                              ),
                            ],
                          ),

                          const SizedBox(height: 14),

                          Container(
                            padding: const EdgeInsets.symmetric(
                              horizontal: 12,
                              vertical: 8,
                            ),
                            decoration: BoxDecoration(
                              color: const Color(0xfff7f7f7),
                              borderRadius: BorderRadius.circular(16),
                            ),
                            child: Row(
                              children: [
                                const Icon(
                                  Icons.notifications_none_rounded,
                                  color: Color(0xff07856d),
                                ),

                                const SizedBox(width: 8),

                                Expanded(
                                  child: InkWell(
                                    onTap: reminderEnabled
                                        ? () {
                                            changeReminderTime(name);
                                          }
                                        : null,
                                    child: Column(
                                      crossAxisAlignment:
                                          CrossAxisAlignment.start,
                                      children: [
                                        const Text(
                                          'Giờ nhắc',
                                          style: TextStyle(
                                            fontSize: 11,
                                            color: Colors.black54,
                                          ),
                                        ),
                                        Text(
                                          reminderTime,
                                          style: TextStyle(
                                            fontSize: 15,
                                            fontWeight: FontWeight.bold,
                                            color: reminderEnabled
                                                ? const Color(0xff07856d)
                                                : Colors.black38,
                                          ),
                                        ),
                                      ],
                                    ),
                                  ),
                                ),

                                Switch(
                                  value: reminderEnabled,
                                  activeColor: const Color(0xff07856d),
                                  onChanged: (value) {
                                    toggleReminder(name, value);
                                  },
                                ),
                              ],
                            ),
                          ),

                          const SizedBox(height: 12),

                          SizedBox(
                            width: double.infinity,
                            height: 48,
                            child: OutlinedButton.icon(
                              onPressed: () {
                                toggleMedication(name);
                              },
                              icon: Icon(
                                done
                                    ? Icons.undo_rounded
                                    : Icons.check_circle_outline_rounded,
                              ),
                              label: Text(
                                done
                                    ? 'ĐÁNH DẤU CHƯA UỐNG'
                                    : 'ĐÁNH DẤU ĐÃ UỐNG',
                                style: const TextStyle(
                                  fontWeight: FontWeight.bold,
                                ),
                              ),
                              style: OutlinedButton.styleFrom(
                                foregroundColor: done
                                    ? Colors.black54
                                    : const Color(0xff07856d),
                                side: BorderSide(
                                  color: done
                                      ? Colors.black26
                                      : const Color(0xff07856d),
                                ),
                                shape: RoundedRectangleBorder(
                                  borderRadius: BorderRadius.circular(16),
                                ),
                              ),
                            ),
                          ),
                        ],
                      ),
                    );
                  }),
                ],
              ),
            ),
    );
  }
}
