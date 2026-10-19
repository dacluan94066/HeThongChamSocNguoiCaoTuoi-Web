import 'package:elderly_care_app/screens/auth/register_screen.dart';
import 'package:elderly_care_app/screens/auth/google_registration_screen.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  testWidgets('register form is for the elderly Mobile role only', (
    tester,
  ) async {
    await tester.pumpWidget(const MaterialApp(home: RegisterScreen()));

    expect(find.text('Tôi là người chăm sóc, người thân'), findsNothing);
    expect(find.text('Ngày sinh'), findsOneWidget);
    expect(find.text('Giới tính'), findsOneWidget);
    expect(find.text('Email (dùng để khôi phục mật khẩu)'), findsOneWidget);
    expect(find.text('Email'), findsNothing);
    expect(find.textContaining('Quản trị'), findsNothing);
    expect(find.textContaining('Bác sĩ'), findsNothing);
  });

  testWidgets('Google registration is for the elderly Mobile role only', (
    tester,
  ) async {
    await tester.pumpWidget(
      const MaterialApp(
        home: GoogleRegistrationScreen(
          idToken: 'test-id-token',
          email: 'nguoidung@example.com',
          displayName: 'Người dùng thử',
        ),
      ),
    );

    expect(find.text('Người chăm sóc'), findsNothing);
    expect(find.text('Email Google'), findsOneWidget);
    expect(find.text('nguoidung@example.com'), findsOneWidget);
    expect(find.text('Ngày sinh'), findsOneWidget);
    expect(find.text('Giới tính'), findsOneWidget);
    expect(find.textContaining('Mật khẩu'), findsNothing);
    expect(find.textContaining('Quản trị'), findsNothing);
    expect(find.textContaining('Bác sĩ'), findsNothing);
  });
}
