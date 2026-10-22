import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:elderly_care_app/screens/profile/edit_profile_screen.dart';
import 'package:elderly_care_app/screens/profile/change_password_screen.dart';
import 'package:elderly_care_app/screens/alerts/alert_history_screen.dart';
import 'package:elderly_care_app/services/api_client.dart';
import 'package:elderly_care_app/widgets/care_senior_ui.dart';
import 'support/profile_ui_fixture.dart';

// App callbacks use a real async zone because the unchanged session-storage
// queue is shared across cases; a completed future from a disposed fake zone
// otherwise stalls the next case. Rendering still uses widget-test pumps.
void profileTest(String description, Future<void> Function(WidgetTester) body) {
  testWidgets(description, (tester) async {
    await tester.runAsync(() => body(tester));
    expect(tester.takeException(), isNull);
  });
}

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();
  late ProfileUiAdapter api;
  late ProfileUiFixture fixture;
  setUp(() async {
    api = ProfileUiAdapter();
    fixture = ProfileUiFixture(api);
    await fixture.install();
  });
  tearDown(() => fixture.dispose());

  Future<void> start(
    WidgetTester tester, {
    bool account = false,
    double scale = 1,
    Widget? screen,
  }) async {
    tester.view.devicePixelRatio = 1;
    tester.view.physicalSize = const Size(390, 844);
    addTearDown(tester.view.resetPhysicalSize);
    addTearDown(tester.view.resetDevicePixelRatio);
    await tester.pumpWidget(
      profileUiApp(accountOnly: account, scale: scale, screen: screen),
    );
    await settleProfileUi(tester);
  }

  Future<void> edit(WidgetTester tester, {bool account = false}) async {
    await start(tester, account: account);
    await tapProfileUi(tester, 'Chỉnh sửa hồ sơ');
    expect(find.byType(EditProfileScreen), findsOneWidget);
  }

  Future<void> password(WidgetTester tester) async {
    await start(tester);
    await tapProfileUi(tester, 'Đổi mật khẩu');
    expect(find.byType(ChangePasswordScreen), findsOneWidget);
  }

  Future<void> passwordValues(
    WidgetTester tester,
    String old,
    String next,
    String confirm,
  ) async {
    await enterProfileUi(tester, passwordField('Mật khẩu hiện tại'), old);
    await enterProfileUi(tester, passwordField('Mật khẩu mới'), next);
    await enterProfileUi(
      tester,
      passwordField('Xác nhận mật khẩu mới'),
      confirm,
    );
  }

  profileTest(
    'real API fields, initials, missing photo, no sensitive or invented fields',
    (tester) async {
      await start(tester);
      expect(find.text(ProfileUiAdapter.name), findsWidgets);
      expect(find.text('HD'), findsOneWidget);
      expect(find.text('Người cao tuổi'), findsOneWidget);
      expect(find.byType(AppBottomNavigation), findsOneWidget);
      for (final value in [
        ProfileUiAdapter.address,
        'AB+',
        api.profile['benhNen'] as String,
        api.profile['diUng'] as String,
        api.profile['nguoiChamSocTen'] as String,
      ]) {
        await revealProfileUi(tester, find.text(value));
        expect(find.text(value).hitTestable(), findsOneWidget);
      }
      expect(find.text('Chiều cao'), findsNothing);
      expect(find.text('SECRET-NOT-FOR-DISPLAY'), findsNothing);
      expect(find.byType(Image), findsNothing);
      expect(api.writes, isEmpty);
      expect(tester.takeException(), isNull);
    },
  );

  for (final role in {
    'Admin': 'Quản trị viên',
    'NguoiChamSoc': 'Người chăm sóc',
    'NguoiCaoTuoi': 'Người cao tuổi',
    'Unknown': 'Tài khoản',
  }.entries) {
    profileTest(
      'accountOnly uses account API and displays ${role.key} without extra editing rights',
      (tester) async {
        api.account['tenVaiTro'] = role.key;
        await edit(tester, account: true);
        expect(api.requests.every((r) => r.path == '/auth/me'), isTrue);
        expect(find.byType(TextField), findsNWidgets(3));
        expect(profileField('Ngày sinh'), findsNothing);
        expect(profileField('Tên đăng nhập'), findsNothing);
        expect(profileField('Bệnh nền'), findsNothing);
        await tapProfileUi(tester, 'Hủy', scroll: 'profile-edit-scroll');
        tester
            .state<ScrollableState>(
              find
                  .descendant(
                    of: find.byKey(const ValueKey('profile-list')),
                    matching: find.byType(Scrollable),
                  )
                  .first,
            )
            .position
            .jumpTo(0);
        await tester.pumpAndSettle();
        expect(find.text(role.value), findsOneWidget);
        expect(api.writes, isEmpty);
      },
    );
  }
  profileTest('loading is visible without fake profile or editable fields', (
    tester,
  ) async {
    api.getGate = Completer<void>();
    await tester.pumpWidget(profileUiApp());
    await tester.pump();
    expect(find.text('Đang tải hồ sơ…'), findsOneWidget);
    expect(find.byType(CircularProgressIndicator), findsOneWidget);
    expect(find.text(ProfileUiAdapter.name), findsNothing);
    expect(find.text('Chỉnh sửa hồ sơ'), findsNothing);
    api.getGate!.complete();
    await settleProfileUi(tester);
    expect(find.text(ProfileUiAdapter.name), findsWidgets);
  });
  profileTest('empty data stays empty, not Figma sample', (tester) async {
    api.empty = true;
    await start(tester);
    await revealProfileUi(tester, find.text('Chưa có dữ liệu hồ sơ'));
    expect(find.text('Chưa cập nhật'), findsWidgets);
    expect(find.text(ProfileUiAdapter.name), findsNothing);
    expect(api.writes, isEmpty);
  });
  for (final status in [403, 404, 500]) {
    profileTest('API $status remains read-only error and retry works', (
      tester,
    ) async {
      api.getStatus = status;
      await start(tester);
      expect(find.text('LỖI TẢI HỒ SƠ KIỂM THỬ $status'), findsOneWidget);
      expect(find.text('Chỉnh sửa hồ sơ'), findsNothing);
      api.getStatus = null;
      await tester.tap(find.text('Thử lại'));
      await settleProfileUi(tester);
      expect(find.text(ProfileUiAdapter.name), findsWidgets);
      expect(api.writes, isEmpty);
    });
  }
  profileTest('offline error can retry without losing navigation', (
    tester,
  ) async {
    api.offline = true;
    await start(tester);
    expect(find.text('Thử lại'), findsOneWidget);
    expect(find.byType(AppBottomNavigation), findsOneWidget);
    api.offline = false;
    await tester.tap(find.text('Thử lại'));
    await settleProfileUi(tester);
    expect(find.text(ProfileUiAdapter.name), findsWidgets);
  });
  profileTest(
    'NCT editor retains eight text fields, gender, read-only date picker and cancel',
    (tester) async {
      await edit(tester);
      expect(find.byType(TextField), findsNWidgets(8));
      expect(
        tester.widget<TextField>(profileField('Ngày sinh')).readOnly,
        isTrue,
      );
      await tester.ensureVisible(profileField('Ngày sinh'));
      await tester.tap(profileField('Ngày sinh'));
      await tester.pumpAndSettle();
      expect(find.byType(DatePickerDialog), findsOneWidget);
      await tester.tap(find.text('Cancel'));
      await tester.pumpAndSettle();
      await tester.ensureVisible(find.byKey(const ValueKey('profile-gender')));
      await tester.tap(find.byKey(const ValueKey('profile-gender')));
      await tester.pumpAndSettle();
      expect(find.text('Khác'), findsWidgets);
      await tester.tap(find.text('Nữ').last);
      await tester.pumpAndSettle();
      await tapProfileUi(tester, 'Hủy', scroll: 'profile-edit-scroll');
      expect(api.writes, isEmpty);
      expect(api.profile['gioiTinh'], 'Khác');
    },
  );
  profileTest(
    'NCT save keeps existing exact nine-field request and reload callback',
    (tester) async {
      await edit(tester);
      await enterProfileUi(
        tester,
        profileField('Họ và tên'),
        'ĐÃ SỬA BẰNG FIXTURE',
      );
      await tapProfileUi(tester, 'LƯU THAY ĐỔI', scroll: 'profile-edit-scroll');
      expect(api.writes, hasLength(1));
      final request = api.writes.single;
      expect(request.path, '/elderly/me');
      expect(request.method, 'PUT');
      expect((request.data as Map).keys.toSet(), {
        'hoTen',
        'ngaySinh',
        'gioiTinh',
        'soDienThoai',
        'email',
        'diaChi',
        'nhomMau',
        'benhNen',
        'diUng',
      });
      expect(request.data['hoTen'], 'ĐÃ SỬA BẰNG FIXTURE');
      expect(request.data['gioiTinh'], 'Khác');
      expect(find.byType(EditProfileScreen), findsNothing);
      expect(find.text('Đã cập nhật hồ sơ thành công.'), findsOneWidget);
    },
  );
  for (final invalid in [
    ('Họ và tên', '', 'Vui lòng nhập đầy đủ thông tin cá nhân.'),
    ('Email dùng để khôi phục mật khẩu', 'not-email', 'Email không hợp lệ.'),
    (
      'Số điện thoại',
      '1234',
      'Số điện thoại phải gồm 10 số và bắt đầu bằng 0.',
    ),
  ]) {
    profileTest('existing validation ${invalid.$1} unchanged', (tester) async {
      await edit(tester);
      await enterProfileUi(tester, profileField(invalid.$1), invalid.$2);
      await tapProfileUi(tester, 'LƯU THAY ĐỔI', scroll: 'profile-edit-scroll');
      expect(find.text(invalid.$3), findsOneWidget);
      expect(api.writes, isEmpty);
    });
  }
  profileTest('save 403 keeps draft, existing error and enabled retry', (
    tester,
  ) async {
    await edit(tester);
    api.putStatus = 403;
    await enterProfileUi(
      tester,
      profileField('Họ và tên'),
      'BẢN NHÁP CHƯA LƯU',
    );
    await tapProfileUi(tester, 'LƯU THAY ĐỔI', scroll: 'profile-edit-scroll');
    expect(find.text('LỖI LƯU KIỂM THỬ 403'), findsOneWidget);
    expect(
      tester.widget<TextField>(profileField('Họ và tên')).controller!.text,
      'BẢN NHÁP CHƯA LƯU',
    );
    expect(find.byType(EditProfileScreen), findsOneWidget);
    expect(
      tester.widget<FilledButton>(find.byType(FilledButton)).onPressed,
      isNotNull,
    );
  });
  profileTest('saving disables repeated taps, spinner does not replace draft', (
    tester,
  ) async {
    await edit(tester);
    api.putGate = Completer<void>();
    await revealProfileUi(
      tester,
      find.text('LƯU THAY ĐỔI'),
      scroll: 'profile-edit-scroll',
    );
    await tester.tap(find.text('LƯU THAY ĐỔI'));
    await tester.pump();
    await Future<void>.delayed(const Duration(milliseconds: 40));
    await tester.pump();
    expect(
      tester.widget<FilledButton>(find.byType(FilledButton)).onPressed,
      isNull,
    );
    expect(find.text('ĐANG LƯU...'), findsOneWidget);
    expect(api.writes, hasLength(1));
    api.putGate!.complete();
    await settleProfileUi(tester);
    expect(find.byType(EditProfileScreen), findsNothing);
  });
  profileTest('account save uses only three original fields and endpoint', (
    tester,
  ) async {
    await edit(tester, account: true);
    await enterProfileUi(tester, profileField('Họ và tên'), 'TÀI KHOẢN ĐÃ SỬA');
    await tapProfileUi(tester, 'LƯU THAY ĐỔI', scroll: 'profile-edit-scroll');
    expect(api.writes.single.path, '/auth/me');
    expect(api.writes.single.data, {
      'hoTen': 'TÀI KHOẢN ĐÃ SỬA',
      'email': api.account['email'],
      'soDienThoai': api.account['soDienThoai'],
    });
  });
  profileTest('history callback still opens existing alert history', (
    tester,
  ) async {
    await start(tester);
    await tapProfileUi(tester, 'Lịch sử cảnh báo');
    expect(find.byType(AlertHistoryScreen), findsOneWidget);
    expect(api.requests.any((r) => r.path == '/elderly/me/alerts'), isTrue);
    expect(api.writes, isEmpty);
  });
  for (final invalid in [
    ('', '', '', 'Vui lòng nhập đầy đủ thông tin.'),
    ('old-123', '123', '123', 'Mật khẩu mới phải có ít nhất 6 ký tự.'),
    (
      'old-123',
      'old-123',
      'old-123',
      'Mật khẩu mới phải khác mật khẩu hiện tại.',
    ),
    ('old-123', 'next-123', 'different', 'Xác nhận mật khẩu không khớp.'),
  ]) {
    profileTest('password validation ${invalid.$4}', (tester) async {
      await password(tester);
      await passwordValues(tester, invalid.$1, invalid.$2, invalid.$3);
      await tapProfileUi(
        tester,
        'ĐỔI MẬT KHẨU',
        scroll: 'profile-password-scroll',
      );
      expect(find.text(invalid.$4), findsOneWidget);
      expect(api.writes, isEmpty);
    });
  }
  profileTest('password visibility and cancel do not write', (tester) async {
    await password(tester);
    final field = passwordField('Mật khẩu hiện tại');
    await tester.ensureVisible(field);
    expect(tester.widget<TextField>(field).obscureText, isTrue);
    await tester.tap(
      find.descendant(of: field, matching: find.byType(IconButton)),
    );
    await tester.pump();
    expect(tester.widget<TextField>(field).obscureText, isFalse);
    await tapProfileUi(tester, 'Hủy', scroll: 'profile-password-scroll');
    expect(api.writes, isEmpty);
  });
  profileTest('password API failure preserves typed values and session', (
    tester,
  ) async {
    api.putStatus = 422;
    await password(tester);
    await passwordValues(tester, 'old-123', 'next-123', 'next-123');
    await tapProfileUi(
      tester,
      'ĐỔI MẬT KHẨU',
      scroll: 'profile-password-scroll',
    );
    expect(find.text('LỖI LƯU KIỂM THỬ 422'), findsOneWidget);
    expect(
      tester.widget<TextField>(passwordField('Mật khẩu mới')).controller!.text,
      'next-123',
    );
    expect(
      await ApiClient.storage.read(key: ApiClient.tokenKey),
      'SYNTHETIC-PROFILE-SESSION',
    );
  });
  profileTest('password success keeps exact API, modal and return behavior', (
    tester,
  ) async {
    await password(tester);
    await passwordValues(tester, 'old-123', 'next-123', 'next-123');
    await tapProfileUi(
      tester,
      'ĐỔI MẬT KHẨU',
      scroll: 'profile-password-scroll',
    );
    expect(api.writes.single.path, '/users/me/password');
    expect(api.writes.single.data, {
      'matKhauCu': 'old-123',
      'matKhauMoi': 'next-123',
    });
    expect(find.text('Đổi mật khẩu thành công'), findsOneWidget);
    await tester.tap(find.text('HOÀN TẤT'));
    await settleProfileUi(tester);
    expect(find.byType(ChangePasswordScreen), findsNothing);
    expect(
      await ApiClient.storage.read(key: ApiClient.tokenKey),
      'SYNTHETIC-PROFILE-SESSION',
    );
  });
  profileTest(
    'NCT logout cancel preserves session, confirm clears synthetic session only',
    (tester) async {
      await start(tester);
      await tapProfileUi(tester, 'ĐĂNG XUẤT');
      expect(find.byType(AlertDialog), findsOneWidget);
      await tester.tap(find.text('Hủy'));
      await tester.pumpAndSettle();
      expect(
        await ApiClient.storage.read(key: ApiClient.tokenKey),
        'SYNTHETIC-PROFILE-SESSION',
      );
      await tester.tap(find.text('ĐĂNG XUẤT'));
      await tester.pumpAndSettle();
      await tester.tap(
        find.descendant(
          of: find.byType(AlertDialog),
          matching: find.text('ĐĂNG XUẤT'),
        ),
      );
      await settleProfileUi(tester);
      expect(find.text('FIXTURE LOGIN'), findsOneWidget);
      expect(await ApiClient.storage.read(key: ApiClient.tokenKey), isNull);
    },
  );
  profileTest('account logout remains direct (no new confirmation flow)', (
    tester,
  ) async {
    await start(tester, account: true);
    await tapProfileUi(tester, 'ĐĂNG XUẤT');
    expect(find.text('FIXTURE LOGIN'), findsOneWidget);
    expect(find.byType(AlertDialog), findsNothing);
  });

  for (final width in [320.0, 360.0, 390.0, 412.0, 768.0]) {
    for (final scale in [1.0, 1.2, 1.4, 1.6, 1.8]) {
      profileTest(
        'long profile and edit responsive ${width}dp / ${scale}x, bottom pill unobscured',
        (tester) async {
          tester.view.devicePixelRatio = 1;
          tester.view.physicalSize = Size(width, 844);
          addTearDown(tester.view.resetPhysicalSize);
          addTearDown(tester.view.resetDevicePixelRatio);
          await tester.pumpWidget(profileUiApp(scale: scale));
          await settleProfileUi(tester);
          await revealProfileUi(tester, find.text('ĐĂNG XUẤT'));
          final logout = tester.getRect(
            find.widgetWithText(OutlinedButton, 'ĐĂNG XUẤT'),
          );
          final nav = tester.getRect(find.byType(AppBottomNavigation));
          expect(logout.bottom, lessThanOrEqualTo(nav.top));
          await tester.tap(find.text('ĐĂNG XUẤT'));
          await tester.pumpAndSettle();
          expect(tester.takeException(), isNull);
          await tester.tap(find.text('Hủy'));
          await tester.pumpAndSettle();
          // Return to the beginning before scrolling forward to the edit action.
          tester
              .state<ScrollableState>(
                find
                    .descendant(
                      of: find.byKey(const ValueKey('profile-list')),
                      matching: find.byType(Scrollable),
                    )
                    .first,
              )
              .position
              .jumpTo(0);
          await tapProfileUi(tester, 'Chỉnh sửa hồ sơ');
          await revealProfileUi(
            tester,
            find.text('LƯU THAY ĐỔI'),
            scroll: 'profile-edit-scroll',
          );
          expect(find.text('LƯU THAY ĐỔI').hitTestable(), findsOneWidget);
          expect(tester.takeException(), isNull);
          await tapProfileUi(tester, 'Hủy', scroll: 'profile-edit-scroll');
          expect(api.writes, isEmpty);
        },
      );
    }
  }
  profileTest(
    '320dp 1.8x edit and password scroll above simulated docked keyboard',
    (tester) async {
      tester.view.devicePixelRatio = 1;
      tester.view.physicalSize = const Size(320, 844);
      addTearDown(tester.view.resetPhysicalSize);
      addTearDown(tester.view.resetDevicePixelRatio);
      addTearDown(tester.view.resetViewInsets);
      await tester.pumpWidget(profileUiApp(scale: 1.8));
      await settleProfileUi(tester);
      await tapProfileUi(tester, 'Chỉnh sửa hồ sơ');
      await enterProfileUi(
        tester,
        profileField('Địa chỉ'),
        ProfileUiAdapter.address,
      );
      tester.view.viewInsets = const FakeViewPadding(bottom: 300);
      await tester.pumpAndSettle();
      await revealProfileUi(
        tester,
        find.text('LƯU THAY ĐỔI'),
        scroll: 'profile-edit-scroll',
      );
      expect(
        tester
            .getRect(find.widgetWithText(FilledButton, 'LƯU THAY ĐỔI'))
            .bottom,
        lessThanOrEqualTo(544),
      );
      await tapProfileUi(tester, 'Hủy', scroll: 'profile-edit-scroll');
      tester.view.resetViewInsets();
      await tester.pumpAndSettle();
      await tapProfileUi(tester, 'Đổi mật khẩu');
      await enterProfileUi(
        tester,
        passwordField('Mật khẩu hiện tại'),
        'synthetic-only',
      );
      tester.view.viewInsets = const FakeViewPadding(bottom: 300);
      await tester.pumpAndSettle();
      await revealProfileUi(
        tester,
        find.text('ĐỔI MẬT KHẨU'),
        scroll: 'profile-password-scroll',
      );
      expect(
        tester
            .getRect(find.widgetWithText(FilledButton, 'ĐỔI MẬT KHẨU'))
            .bottom,
        lessThanOrEqualTo(544),
      );
      expect(tester.takeException(), isNull);
      expect(api.writes, isEmpty);
    },
  );
}
