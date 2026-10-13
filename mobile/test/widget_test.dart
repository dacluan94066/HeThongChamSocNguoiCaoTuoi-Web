import 'package:flutter/services.dart';
import 'package:flutter_test/flutter_test.dart';

import 'package:elderly_care_app/main.dart';

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();

  const secureStorageChannel = MethodChannel(
    'plugins.it_nomads.com/flutter_secure_storage',
  );

  setUp(() {
    TestDefaultBinaryMessengerBinding.instance.defaultBinaryMessenger
        .setMockMethodCallHandler(secureStorageChannel, (_) async => null);
  });

  tearDown(() {
    TestDefaultBinaryMessengerBinding.instance.defaultBinaryMessenger
        .setMockMethodCallHandler(secureStorageChannel, null);
  });

  testWidgets(
    'ElderlyCareApp khởi động và chuyển tới màn chào khi chưa có token',
    (tester) async {
      await tester.pumpWidget(const ElderlyCareApp());

      expect(find.byType(SplashScreen), findsOneWidget);

      await tester.pumpAndSettle();

      expect(find.byType(WelcomeScreen), findsOneWidget);
      expect(tester.takeException(), isNull);
    },
  );
}
