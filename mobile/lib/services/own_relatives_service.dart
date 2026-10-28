import 'package:dio/dio.dart';
import 'api_client.dart';

const relativeScopeLabels = <String, String>{
  'hoSoCoBan': 'Hồ sơ cơ bản',
  'chiSoSucKhoe': 'Chỉ số sức khỏe',
  'lichThuoc': 'Lịch thuốc',
  'lichKham': 'Lịch khám',
  'canhBao': 'Cảnh báo & SOS',
  'benhNen': 'Bệnh nền',
  'diUng': 'Dị ứng',
  'ketQuaKham': 'Kết quả khám',
};

// No persistent cache. The owner ID checks the response only; the server derives
// the owner from JWT, and the request never supplies a profile/account ID.
Future<List<Map<String, dynamic>>> getMyRelatives({
  required int elderlyId,
  CancelToken? cancelToken,
}) async {
  final session = ApiClient.sessionVersion;
  try {
    final response = await ApiClient.instance.dio.get<Map<String, dynamic>>(
      '/elderly/me/relatives',
      cancelToken: cancelToken,
    );
    if (session != ApiClient.sessionVersion) {
      throw const ApiException('Phiên đăng nhập đã thay đổi.');
    }
    final data = response.data?['data'];
    if (data is! List) {
      throw const ApiException('Danh sách Người thân không hợp lệ.');
    }
    return data.map((item) {
      if (item is! Map ||
          item['nguoiCaoTuoiId'] != elderlyId ||
          item['id'] is! int ||
          (item['id'] as int) < 1 ||
          item['phamViChiaSe'] is! Map) {
        throw const ApiException(
          'Dữ liệu Người thân không khớp hồ sơ đang đăng nhập.',
        );
      }
      final scope = item['phamViChiaSe'] as Map;
      if (relativeScopeLabels.keys.any((key) => scope[key] is! bool)) {
        throw const ApiException('Phạm vi chia sẻ không hợp lệ.');
      }
      return <String, dynamic>{
        'id': item['id'],
        'hoTen': item['hoTen'],
        'moiQuanHe': item['moiQuanHe'],
        'soDienThoai': item['soDienThoai'],
        'phamViChiaSe': {
          for (final key in relativeScopeLabels.keys) key: scope[key],
        },
      };
    }).toList();
  } on DioException catch (error) {
    throw ApiException.fromDio(error);
  }
}
