import 'package:flutter_test/flutter_test.dart';
import 'package:elderly_care_app/models/care_assistant.dart';

void main() {
  test('General fallback label describes guidance, not personal lookup', () {
    for (final intent in ['visit_preparation', 'visit_fasting']) {
      for (final code in [
        'AI_RATE_LIMITED',
        'AI_TIMEOUT',
        'AI_PROVIDER_ERROR',
      ]) {
        final reply = AssistantReply.fromJson({
          'intent': intent,
          'mode': 'functional',
          'modeReason': 'ai_unavailable',
          'aiFailureCode': code,
          'text': 'Hướng dẫn chung',
        });
        expect(reply.modeLabel, 'Trợ lý theo chức năng');
        expect(reply.modeNotice, contains('hướng dẫn chung'));
        expect(reply.modeNotice, isNot(contains('tra cứu')));
      }
    }
  });
  test('Successful AI keeps its real label without a fallback notice', () {
    final reply = AssistantReply.fromJson({
      'intent': 'visit_preparation',
      'mode': 'ai',
      'text': 'Hướng dẫn chung',
    });
    expect(reply.modeLabel, 'AI');
    expect(reply.modeNotice, isNull);
  });
}
