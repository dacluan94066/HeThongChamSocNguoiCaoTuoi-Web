/// A display label, not a persisted status or a missed-dose calculation.
String medicationStatusLabel(
  String status,
  Object? scheduledAt, {
  DateTime? now,
}) {
  switch (status) {
    case 'DaUong':
      return 'Đã uống';
    case 'BoLo':
      return 'Bỏ lỡ';
    case 'TuChoi':
      return 'Từ chối';
    case 'ChuaDenGio':
      final at = DateTime.tryParse(scheduledAt?.toString() ?? '');
      return at != null && at.isAfter(now ?? DateTime.now())
          ? 'Chưa đến giờ'
          : 'Chưa xác nhận uống';
    default:
      return 'Chưa rõ trạng thái';
  }
}
