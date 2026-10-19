import 'package:flutter/material.dart';
import '../theme/care_senior_theme.dart';
import 'care_senior_ui.dart';

class AlertVisualStyle {
  const AlertVisualStyle({
    required this.color,
    required this.background,
    required this.icon,
  });

  final Color color;
  final Color background;
  final IconData icon;
}

class AlertVisuals {
  const AlertVisuals._();

  static AlertVisualStyle styleForSeverity(Object? severity) {
    return switch (severity?.toString()) {
      'KhanCap' || 'KHAN_CAP' || 'Khẩn cấp' => const AlertVisualStyle(
        color: CareSeniorColors.danger,
        background: CareSeniorColors.dangerSurface,
        icon: Icons.sos_rounded,
      ),
      'Cao' || 'CAO' => const AlertVisualStyle(
        color: CareSeniorColors.warning,
        background: CareSeniorColors.warningSurface,
        icon: Icons.warning_amber_rounded,
      ),
      'TrungBinh' || 'TRUNG_BINH' || 'Trung bình' => const AlertVisualStyle(
        color: CareSeniorColors.warning,
        background: CareSeniorColors.warningSurface,
        icon: Icons.warning_amber_rounded,
      ),
      _ => const AlertVisualStyle(
        color: CareSeniorColors.secondaryText,
        background: CareSeniorColors.mint,
        icon: Icons.info_outline_rounded,
      ),
    };
  }

  static String typeLabel(Map<String, dynamic> alert) {
    final label = alert['loaiCanhBaoLabel']?.toString().trim();
    if (label?.isNotEmpty == true) return label!;
    return switch (alert['loaiCanhBao']?.toString()) {
      'NhacUongThuoc' => 'Nhắc uống thuốc',
      'NhacLichKham' => 'Nhắc lịch khám',
      'ChiSoBatThuong' => 'Chỉ số bất thường',
      'KhanCap' => 'Cảnh báo khẩn cấp',
      _ => 'Cảnh báo',
    };
  }

  static String statusLabel(Map<String, dynamic> alert) {
    final label = alert['trangThaiLabel']?.toString().trim();
    if (label?.isNotEmpty == true) return label!;
    return switch (alert['trangThai']?.toString()) {
      'ChuaXuLy' || 'CHUA_XU_LY' => 'Chưa xử lý',
      'DaXem' || 'DA_XEM' => 'Đã xem',
      'DaXuLy' || 'DA_XU_LY' => 'Đã xử lý',
      'BoQua' || 'BO_QUA' => 'Bỏ qua',
      _ => 'Chưa xử lý',
    };
  }

  static String content(Map<String, dynamic> alert) =>
      alert['moTa']?.toString().trim().isNotEmpty == true
      ? alert['moTa'].toString().trim()
      : alert['noiDung']?.toString().trim() ?? '';

  static String dateTime(Map<String, dynamic> alert) {
    final raw = alert['thoiGianPhatHien'] ?? alert['ngayTao'];
    final value = DateTime.tryParse(raw?.toString() ?? '')?.toLocal();
    if (value == null) return 'Chưa cập nhật thời gian';
    String two(int number) => number.toString().padLeft(2, '0');
    return '${two(value.hour)}:${two(value.minute)} • '
        '${two(value.day)}/${two(value.month)}/${value.year}';
  }
}

class AlertCard extends StatelessWidget {
  const AlertCard({
    super.key,
    required this.alert,
    this.compact = false,
    this.footer,
  });

  final Map<String, dynamic> alert;
  final bool compact;
  final Widget? footer;

  @override
  Widget build(BuildContext context) {
    final severity = alert['mucDo'] ?? alert['mucDoLabel'];
    final style = AlertVisuals.styleForSeverity(severity);
    return Container(
      margin: EdgeInsets.only(bottom: compact ? 8 : 12),
      padding: EdgeInsets.all(compact ? 12 : 15),
      decoration: BoxDecoration(
        color: CareSeniorColors.surface,
        borderRadius: BorderRadius.circular(compact ? 16 : 22),
        border: Border.all(color: style.color.withValues(alpha: 0.28)),
      ),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Container(
            width: compact ? 42 : 50,
            height: compact ? 42 : 50,
            decoration: BoxDecoration(
              color: style.background,
              borderRadius: BorderRadius.circular(15),
            ),
            child: Icon(style.icon, color: style.color),
          ),
          const SizedBox(width: 12),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  AlertVisuals.typeLabel(alert),
                  style: const TextStyle(
                    fontSize: 17,
                    fontWeight: FontWeight.bold,
                  ),
                ),
                const SizedBox(height: 7),
                AppStatusChip(
                  label:
                      alert['mucDoLabel']?.toString() ??
                      _severityLabel(severity),
                  color: style.color,
                  background: style.background,
                ),
                const SizedBox(height: 5),
                Text(
                  AlertVisuals.content(alert),
                  style: const TextStyle(
                    fontSize: 16,
                    color: CareSeniorColors.text,
                    height: 1.35,
                  ),
                ),
                const SizedBox(height: 7),
                Wrap(
                  spacing: 10,
                  runSpacing: 4,
                  children: [
                    Text(
                      AlertVisuals.dateTime(alert),
                      style: const TextStyle(
                        color: CareSeniorColors.secondaryText,
                        fontSize: 14,
                      ),
                    ),
                    Text(
                      AlertVisuals.statusLabel(alert),
                      style: TextStyle(
                        color: style.color,
                        fontSize: 14,
                        fontWeight: FontWeight.w600,
                      ),
                    ),
                  ],
                ),
                if (alert['ghiChuXuLy']?.toString().trim().isNotEmpty ==
                    true) ...[
                  const SizedBox(height: 7),
                  Text(
                    'Kết quả: ${alert['ghiChuXuLy']}',
                    style: const TextStyle(
                      color: CareSeniorColors.deepGreen,
                      fontSize: 14,
                      fontWeight: FontWeight.w600,
                    ),
                  ),
                ],
                if (footer != null) ...[const SizedBox(height: 10), footer!],
              ],
            ),
          ),
        ],
      ),
    );
  }

  static String _severityLabel(Object? value) => switch (value?.toString()) {
    'KhanCap' || 'KHAN_CAP' => 'Khẩn cấp',
    'Cao' || 'CAO' => 'Cao',
    'TrungBinh' || 'TRUNG_BINH' => 'Trung bình',
    _ => 'Thấp',
  };
}
