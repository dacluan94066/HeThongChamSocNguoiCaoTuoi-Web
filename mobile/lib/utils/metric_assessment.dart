/// Display the server's assessment; never invent medical thresholds locally.
abstract final class MetricAssessment {
  static bool abnormal(Map<String, dynamic>? row) =>
      row?['laBatThuong'] == true || row?['laBatThuong'] == 1;

  static bool assessed(Map<String, dynamic>? row) =>
      abnormal(row) || row?['trangThaiDanhGia'] == 'BINH_THUONG';

  static String label(Map<String, dynamic>? row) => abnormal(row)
      ? 'Bất thường'
      : assessed(row)
      ? 'Trong ngưỡng theo dõi'
      : 'Chưa có ngưỡng đánh giá';
}
