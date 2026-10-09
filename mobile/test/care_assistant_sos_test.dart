import 'dart:async';
import 'package:dio/dio.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:elderly_care_app/services/api_client.dart';
import 'package:elderly_care_app/services/caregiver_service.dart';
import 'care_assistant_test.dart' show RecordingAdapter;

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();
  test('Existing SOS sender rejects double submission while pending', () async {
    FlutterSecureStorage.setMockInitialValues({'jwt_token': 'test-session'});
    final dio = ApiClient.instance.dio;
    final original = dio.httpClientAdapter;
    final adapter = RecordingAdapter()
      ..heldResponse = Completer<ResponseBody>();
    dio.httpClientAdapter = adapter;
    try {
      final first = CaregiverService.instance.sendEmergencyAlert(
        noiDung: 'Cần hỗ trợ',
      );
      await expectLater(
        CaregiverService.instance.sendEmergencyAlert(noiDung: 'Cần hỗ trợ'),
        throwsA(isA<ApiException>()),
      );
      adapter.heldResponse!.complete(
        ResponseBody.fromString(
          '{"data":{"soNguoiChamSocDaThongBao":1}}',
          201,
          headers: {
            Headers.contentTypeHeader: [Headers.jsonContentType],
          },
        ),
      );
      await first;
      expect(
        adapter.requests.where((r) => r.path == '/emergency-alerts').length,
        1,
      );
    } finally {
      dio.httpClientAdapter = original;
      FlutterSecureStorage.setMockInitialValues({});
    }
  });
}
