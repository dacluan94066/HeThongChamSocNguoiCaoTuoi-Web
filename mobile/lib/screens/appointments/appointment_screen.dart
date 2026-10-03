import 'package:flutter/material.dart';

class AppointmentScreen extends StatefulWidget {
  const AppointmentScreen({super.key});

  @override
  State<AppointmentScreen> createState() => _AppointmentScreenState();
}

class _AppointmentScreenState extends State<AppointmentScreen> {
  final List<Map<String, dynamic>> upcomingAppointments = [
    {
      'doctor': 'BS. Nguyễn Minh Tuấn',
      'specialty': 'Tim mạch',
      'date': '25/09/2026',
      'time': '10:00',
      'hospital': 'Bệnh viện Đại học Y Dược',
      'status': 'Sắp tới',
    },
    {
      'doctor': 'BS. Trần Thu Hà',
      'specialty': 'Nội tổng quát',
      'date': '30/09/2026',
      'time': '08:30',
      'hospital': 'Bệnh viện Nhân Dân 115',
      'status': 'Sắp tới',
    },
  ];

  final List<Map<String, dynamic>> historyAppointments = [
    {
      'doctor': 'BS. Lê Hoàng Nam',
      'specialty': 'Tim mạch',
      'date': '12/09/2026',
      'time': '09:00',
      'hospital': 'Bệnh viện Chợ Rẫy',
      'status': 'Đã khám',
    },
    {
      'doctor': 'BS. Phạm Thanh Mai',
      'specialty': 'Nội tổng quát',
      'date': '28/08/2026',
      'time': '14:00',
      'hospital': 'Bệnh viện Thống Nhất',
      'status': 'Đã khám',
    },
  ];

  void showAppointmentDetail(Map<String, dynamic> appointment) {
    showModalBottomSheet(
      context: context,
      isScrollControlled: true,
      backgroundColor: Colors.white,
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(28)),
      ),
      builder: (context) {
        return Padding(
          padding: const EdgeInsets.fromLTRB(22, 18, 22, 30),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              Container(
                width: 50,
                height: 5,
                decoration: BoxDecoration(
                  color: Colors.black12,
                  borderRadius: BorderRadius.circular(20),
                ),
              ),

              const SizedBox(height: 22),

              const CircleAvatar(
                radius: 34,
                backgroundColor: Color(0xffe8f8ee),
                child: Icon(
                  Icons.medical_services_outlined,
                  size: 34,
                  color: Color(0xff07856d),
                ),
              ),

              const SizedBox(height: 16),

              Text(
                appointment['doctor'],
                style: const TextStyle(
                  fontSize: 20,
                  fontWeight: FontWeight.bold,
                ),
              ),

              const SizedBox(height: 4),

              Text(
                appointment['specialty'],
                style: const TextStyle(fontSize: 14, color: Colors.black54),
              ),

              const SizedBox(height: 22),

              DetailRow(
                icon: Icons.calendar_today_outlined,
                label: 'Ngày khám',
                value: appointment['date'],
              ),

              const SizedBox(height: 14),

              DetailRow(
                icon: Icons.access_time_rounded,
                label: 'Giờ khám',
                value: appointment['time'],
              ),

              const SizedBox(height: 14),

              DetailRow(
                icon: Icons.location_on_outlined,
                label: 'Địa điểm',
                value: appointment['hospital'],
              ),

              const SizedBox(height: 14),

              DetailRow(
                icon: Icons.info_outline_rounded,
                label: 'Trạng thái',
                value: appointment['status'],
              ),

              const SizedBox(height: 24),

              SizedBox(
                width: double.infinity,
                height: 50,
                child: ElevatedButton(
                  onPressed: () {
                    Navigator.pop(context);
                  },
                  style: ElevatedButton.styleFrom(
                    backgroundColor: const Color(0xff07856d),
                    foregroundColor: Colors.white,
                    elevation: 0,
                    shape: RoundedRectangleBorder(
                      borderRadius: BorderRadius.circular(16),
                    ),
                  ),
                  child: const Text(
                    'ĐÓNG',
                    style: TextStyle(fontWeight: FontWeight.bold),
                  ),
                ),
              ),
            ],
          ),
        );
      },
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
          'Lịch khám',
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
              child: const Row(
                children: [
                  CircleAvatar(
                    radius: 32,
                    backgroundColor: Colors.white,
                    child: Icon(
                      Icons.calendar_month_rounded,
                      size: 32,
                      color: Color(0xff07856d),
                    ),
                  ),

                  SizedBox(width: 14),

                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(
                          'Theo dõi lịch khám',
                          style: TextStyle(fontSize: 14, color: Colors.black54),
                        ),
                        SizedBox(height: 4),
                        Text(
                          '2 lịch khám sắp tới',
                          style: TextStyle(
                            fontSize: 20,
                            fontWeight: FontWeight.bold,
                          ),
                        ),
                        SizedBox(height: 4),
                        Text(
                          'Đừng quên đến đúng giờ.',
                          style: TextStyle(fontSize: 13, color: Colors.black54),
                        ),
                      ],
                    ),
                  ),
                ],
              ),
            ),

            const SizedBox(height: 24),

            const Text(
              'Lịch khám sắp tới',
              style: TextStyle(fontSize: 18, fontWeight: FontWeight.bold),
            ),

            const SizedBox(height: 12),

            ...upcomingAppointments.map(
              (appointment) => AppointmentCard(
                appointment: appointment,
                onTap: () {
                  showAppointmentDetail(appointment);
                },
              ),
            ),

            const SizedBox(height: 20),

            const Text(
              'Lịch sử khám',
              style: TextStyle(fontSize: 18, fontWeight: FontWeight.bold),
            ),

            const SizedBox(height: 12),

            ...historyAppointments.map(
              (appointment) => AppointmentCard(
                appointment: appointment,
                onTap: () {
                  showAppointmentDetail(appointment);
                },
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class AppointmentCard extends StatelessWidget {
  final Map<String, dynamic> appointment;
  final VoidCallback onTap;

  const AppointmentCard({
    super.key,
    required this.appointment,
    required this.onTap,
  });

  @override
  Widget build(BuildContext context) {
    final bool completed = appointment['status'] == 'Đã khám';

    return InkWell(
      onTap: onTap,
      borderRadius: BorderRadius.circular(22),
      child: Container(
        margin: const EdgeInsets.only(bottom: 12),
        padding: const EdgeInsets.all(15),
        decoration: BoxDecoration(
          color: Colors.white,
          borderRadius: BorderRadius.circular(22),
        ),
        child: Row(
          children: [
            Container(
              width: 54,
              height: 54,
              decoration: BoxDecoration(
                color: completed
                    ? const Color(0xffeeeeee)
                    : const Color(0xffe8f8ee),
                shape: BoxShape.circle,
              ),
              child: Icon(
                Icons.medical_services_outlined,
                color: completed ? Colors.black45 : const Color(0xff07856d),
              ),
            ),

            const SizedBox(width: 12),

            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    appointment['doctor'],
                    style: const TextStyle(
                      fontSize: 15,
                      fontWeight: FontWeight.bold,
                    ),
                  ),

                  const SizedBox(height: 3),

                  Text(
                    appointment['specialty'],
                    style: const TextStyle(fontSize: 12, color: Colors.black54),
                  ),

                  const SizedBox(height: 7),

                  Row(
                    children: [
                      const Icon(
                        Icons.calendar_today_outlined,
                        size: 14,
                        color: Colors.black45,
                      ),
                      const SizedBox(width: 5),
                      Text(
                        '${appointment['date']} • ${appointment['time']}',
                        style: const TextStyle(
                          fontSize: 12,
                          color: Colors.black54,
                        ),
                      ),
                    ],
                  ),

                  const SizedBox(height: 4),

                  Row(
                    children: [
                      const Icon(
                        Icons.location_on_outlined,
                        size: 14,
                        color: Colors.black45,
                      ),
                      const SizedBox(width: 5),
                      Expanded(
                        child: Text(
                          appointment['hospital'],
                          style: const TextStyle(
                            fontSize: 12,
                            color: Colors.black54,
                          ),
                        ),
                      ),
                    ],
                  ),
                ],
              ),
            ),

            const SizedBox(width: 8),

            Column(
              crossAxisAlignment: CrossAxisAlignment.end,
              children: [
                Container(
                  padding: const EdgeInsets.symmetric(
                    horizontal: 9,
                    vertical: 5,
                  ),
                  decoration: BoxDecoration(
                    color: completed
                        ? const Color(0xffeeeeee)
                        : const Color(0xffe8f8ee),
                    borderRadius: BorderRadius.circular(18),
                  ),
                  child: Text(
                    appointment['status'],
                    style: TextStyle(
                      fontSize: 10,
                      fontWeight: FontWeight.bold,
                      color: completed
                          ? Colors.black54
                          : const Color(0xff07856d),
                    ),
                  ),
                ),

                const SizedBox(height: 12),

                const Icon(Icons.chevron_right_rounded, color: Colors.black26),
              ],
            ),
          ],
        ),
      ),
    );
  }
}

class DetailRow extends StatelessWidget {
  final IconData icon;
  final String label;
  final String value;

  const DetailRow({
    super.key,
    required this.icon,
    required this.label,
    required this.value,
  });

  @override
  Widget build(BuildContext context) {
    return Row(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Container(
          width: 42,
          height: 42,
          decoration: const BoxDecoration(
            color: Color(0xffeef7f4),
            shape: BoxShape.circle,
          ),
          child: Icon(icon, size: 21, color: const Color(0xff07856d)),
        ),

        const SizedBox(width: 12),

        Expanded(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(
                label,
                style: const TextStyle(fontSize: 12, color: Colors.black54),
              ),
              const SizedBox(height: 3),
              Text(
                value,
                style: const TextStyle(
                  fontSize: 14,
                  fontWeight: FontWeight.w600,
                ),
              ),
            ],
          ),
        ),
      ],
    );
  }
}
