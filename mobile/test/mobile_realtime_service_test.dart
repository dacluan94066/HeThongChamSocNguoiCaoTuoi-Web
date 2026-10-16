import 'package:elderly_care_app/services/mobile_realtime_service.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  test('socket URL is derived from API origin without the /api suffix', () {
    expect(
      MobileRealtimeService.socketUrlFromApiBase('http://10.0.2.2:5000/api'),
      'http://10.0.2.2:5000',
    );
    expect(
      MobileRealtimeService.socketUrlFromApiBase(
        'https://care.example/v1/api/',
      ),
      'https://care.example/v1',
    );
  });

  test('only valid appointment mutation payloads trigger an API refresh', () {
    for (final action in [
      'created',
      'updated',
      'cancelled',
      'result-recorded',
    ]) {
      expect(
        MobileRealtimeService.isAppointmentEvent({'id': 12, 'action': action}),
        isTrue,
      );
    }
    for (final payload in [
      null,
      'not-a-map',
      <String, dynamic>{},
      {'id': 0, 'action': 'cancelled'},
      {'id': 12, 'action': 'delete-everything'},
    ]) {
      expect(MobileRealtimeService.isAppointmentEvent(payload), isFalse);
    }
  });
}
