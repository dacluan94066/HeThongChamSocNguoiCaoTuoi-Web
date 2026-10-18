import 'dart:async';
import 'dart:convert';
import 'package:flutter/foundation.dart';
import 'package:flutter/services.dart';
import 'api_client.dart';

class CareReportExportService {
  static const _channel = MethodChannel('elderly_care/report_print');
  static bool _listening = false;
  static bool get supported =>
      !kIsWeb && defaultTargetPlatform == TargetPlatform.android;

  static Future<void> shareExported(int session) async {
    if (!supported || session != ApiClient.sessionVersion) {
      throw const ApiException('Phiên đã thay đổi. Hãy mở lại báo cáo.');
    }
    _listen();
    try {
      await _channel.invokeMethod<bool>('share');
    } on PlatformException {
      throw const ApiException(
        'Chưa đọc hoặc chia sẻ được file PDF. Hãy xuất file thành công rồi thử lại.',
      );
    } on MissingPluginException {
      throw const ApiException('Bản ứng dụng này chưa hỗ trợ chia sẻ PDF.');
    }
  }

  static void _listen() {
    if (_listening) return;
    _listening = true;
    ApiClient.sessionChanges.addListener(() {
      unawaited(
        _channel.invokeMethod<void>('cancel').catchError((Object _) {}),
      );
    });
  }

  static void cancel() {
    if (supported) {
      unawaited(
        _channel.invokeMethod<void>('cancel').catchError((Object _) {}),
      );
    }
  }

  static Future<void> printReport(
    Map<String, dynamic> report,
    int session,
  ) async {
    if (!supported || session != ApiClient.sessionVersion) {
      throw const ApiException(
        'Phiên đã thay đổi hoặc thiết bị chưa hỗ trợ xuất PDF.',
      );
    }
    _listen();
    try {
      await _channel.invokeMethod<void>('print', {'html': document(report)});
    } on PlatformException {
      throw const ApiException('Chưa mở được hộp thoại xuất PDF. Hãy thử lại.');
    } on MissingPluginException {
      throw const ApiException('Bản ứng dụng này chưa hỗ trợ xuất PDF.');
    }
  }

  static String document(Map<String, dynamic> r) {
    String esc(Object? value) =>
        const HtmlEscape().convert(value?.toString() ?? 'Chưa ghi nhận');
    String line(String label, Object? value) =>
        '<p>${esc(label)}: ${esc(value)}</p>';
    final medication = r['medication'] as Map;
    final care = r['activities'] as Map;
    final lifestyle = r['lifestyle'] as Map;
    final totals = lifestyle['totals'] as Map;
    final appointments = r['appointments'] as Map;
    final statuses = <String, String>{
      'DaKham': 'Đã khám',
      'ChuaDen': 'Chưa đến',
      'Huy': 'Đã hủy',
      'DaHuy': 'Đã hủy',
      'DaDoiLich': 'Đã đổi lịch',
    };
    return '''<!doctype html><html lang="vi"><head><meta charset="utf-8"><style>
body{font-family:sans-serif;color:#163b32;font-size:12pt}h1{font-size:20pt}h2{font-size:15pt}table{border-collapse:collapse;width:100%;font-size:10pt}td,th{border:1px solid #ccc;padding:5px;text-align:left}p{margin:6px 0}
</style></head><body><h1>Báo cáo chăm sóc</h1>
${line('Hồ sơ', (r['profile'] as Map)['hoTen'])}
${line('Khoảng ngày', '${r['from']} – ${r['to']}')}
${line('Thời điểm tạo (giờ Việt Nam)', r['generatedAt'])}
<h2>Thuốc</h2>${line('Lịch đã lưu', medication['scheduled'])}${line('Có xác nhận uống', medication['confirmed'])}${line('Chưa có xác nhận', medication['withoutConfirmation'])}
<p>Thiếu xác nhận không đồng nghĩa chắc chắn chưa uống thuốc.</p>
<h2>Lịch khám</h2>${line('Tổng lịch', appointments['total'])}
${(appointments['byStatus'] as Map).entries.map((e) => line(statuses[e.key] ?? 'Trạng thái khác', e.value)).join()}
<h2>Hoạt động chăm sóc</h2>${line('Số lần theo lịch', care['scheduled'])}${line('Đã hoàn thành', care['completed'])}
<h2>Sinh hoạt</h2>${line('Số bản ghi', lifestyle['records'])}${line('Bữa ăn', totals['mealCount'])}${line('Nước (ml)', totals['waterMl'])}${line('Ngủ (phút)', totals['sleepMinutes'])}${line('Vận động (phút)', totals['exerciseMinutes'])}${line('Tâm trạng (bản ghi)', totals['moodCount'])}
<h2>Cảnh báo và số đo</h2>${line('Cảnh báo', (r['alerts'] as Map)['total'])}${line('Số lần đo được ghi nhận', r['measurementCount'])}
<p>Không ghi nhận dữ liệu không đồng nghĩa sức khỏe tốt. Báo cáo không chẩn đoán hay đề xuất điều trị.</p>
<h2>Từng ngày</h2><table><tr><th>Ngày</th><th>Lịch thuốc</th><th>Xác nhận uống</th><th>Lịch chăm sóc</th><th>Hoàn thành</th></tr>
${(r['daily'] as List).map((d) => '<tr>${['date', 'medicationScheduled', 'medicationConfirmed', 'careScheduled', 'careCompleted'].map((k) => '<td>${esc(d[k])}</td>').join()}</tr>').join()}
</table></body></html>''';
  }
}
