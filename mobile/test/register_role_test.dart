import 'package:elderly_care_app/screens/auth/register_screen.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  testWidgets('register form only exposes the two supported Mobile roles', (
    tester,
  ) async {
    await tester.pumpWidget(
      const MaterialApp(home: RegisterScreen()),
    );

    expect(find.text('Tôi là người cao tuổi'), findsOneWidget);
    expect(find.text('Tôi là người chăm sóc, người thân'), findsOneWidget);
    expect(find.text('Ngày sinh'), findsOneWidget);
    expect(find.text('Giới tính'), findsOneWidget);
    expect(find.text('Email (không bắt buộc)'), findsNothing);
    expect(find.textContaining('Quản trị'), findsNothing);
    expect(find.textContaining('Bác sĩ'), findsNothing);

    await tester.tap(find.text('Tôi là người chăm sóc, người thân'));
    await tester.pumpAndSettle();

    expect(find.text('Email (không bắt buộc)'), findsOneWidget);
    expect(find.text('Ngày sinh'), findsNothing);
    expect(find.text('Giới tính'), findsNothing);
  });
}
