import 'dart:async';
import 'dart:convert';
import 'dart:typed_data';

import 'package:dio/dio.dart';
import 'package:flutter/material.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:elderly_care_app/services/api_client.dart';
import 'package:elderly_care_app/services/elderly_service.dart';
import 'package:elderly_care_app/screens/profile/complete_profile_screen.dart';
import 'package:elderly_care_app/theme/care_senior_theme.dart';
import 'package:elderly_care_app/widgets/elderly_profile_gate.dart';
import 'support/notification_platform_fake.dart';

class OnboardingAdapter implements HttpClientAdapter {
  bool exists = false;
  int missingStatus = 404;
  String missingCode = 'ELDERLY_PROFILE_NOT_FOUND';
  int? saveStatus;
  bool offline = false;
  Completer<void>? heldSave;
  final posts = <Map<String, dynamic>>[];
  final paths = <String>[];
  Map<String, dynamic> get profile => {
    'id': 42,
    'userId': 1,
    'hoTen': 'NCT kiểm thử',
    'ngaySinh': '1950-01-01',
    'gioiTinh': 'Nữ',
  };

  @override
  void close({bool force = false}) {}

  @override
  Future<ResponseBody> fetch(
    RequestOptions options,
    Stream<Uint8List>? stream,
    Future<void>? cancel,
  ) async {
    paths.add('${options.method} ${options.path}');
    if (offline) {
      throw DioException(
        requestOptions: options,
        type: DioExceptionType.connectionError,
      );
    }
    Map<String, dynamic> envelope;
    int status = 200;
    if (options.path == '/auth/me') {
      envelope = {
        'data': {
          'userId': 1,
          'hoTen': 'Tên tài khoản',
          'tenDangNhap': 'test.elder',
          'tenVaiTro': 'NguoiCaoTuoi',
          'soDienThoai': '0899999930',
          'email': 'test@example.invalid',
        },
      };
    } else if (options.method == 'POST') {
      posts.add(Map<String, dynamic>.from(options.data as Map));
      if (heldSave != null) await heldSave!.future;
      if (saveStatus != null) {
        status = saveStatus!;
        envelope = {
          'message': 'CCCD đã được sử dụng. Vui lòng liên hệ quản trị viên.',
          'errorCode': 'CCCD_TAKEN',
        };
      } else {
        status = 201;
        exists = true;
        envelope = {'data': profile};
      }
    } else if (exists) {
      envelope = {'data': profile};
    } else {
      status = missingStatus;
      envelope = {'message': 'Chưa có hồ sơ', 'errorCode': missingCode};
    }
    return ResponseBody.fromString(
      jsonEncode(envelope),
      status,
      headers: {
        Headers.contentTypeHeader: [Headers.jsonContentType],
      },
    );
  }
}

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();
  late HttpClientAdapter original;
  late List<Interceptor> interceptors;
  late OnboardingAdapter adapter;
  setUp(() async {
    NotificationPlatformFake().install();
    FlutterSecureStorage.setMockInitialValues({});
    await ApiClient.clearSession();
    FlutterSecureStorage.setMockInitialValues({
      'jwt_token': 'test-session',
      'auth_user': jsonEncode({'userId': 1, 'tenVaiTro': 'NguoiCaoTuoi'}),
    });
    ElderlyService.instance.beginSession(1);
    original = ApiClient.instance.dio.httpClientAdapter;
    interceptors = List<Interceptor>.from(ApiClient.instance.dio.interceptors);
    // Same direct widget transport as mobile_flows_test. The async test below
    // restores real interceptors to verify session changes during a request.
    ApiClient.instance.dio.interceptors.clear(
      keepImplyContentTypeInterceptor: false,
    );
    adapter = OnboardingAdapter();
    ApiClient.instance.dio.httpClientAdapter = adapter;
  });
  tearDown(() {
    ApiClient.instance.dio.httpClientAdapter = original;
    ApiClient.instance.dio.interceptors.clear(
      keepImplyContentTypeInterceptor: false,
    );
    ApiClient.instance.dio.interceptors.addAll(interceptors);
    ElderlyService.instance.clearCache();
  });

  Future<void> settle(WidgetTester tester) async {
    // Dio, platform storage and setState cross real/fake async boundaries.
    for (var step = 0; step < 5; step++) {
      await tester.pump(const Duration(milliseconds: 100));
      await tester.runAsync(
        () => Future<void>.delayed(const Duration(milliseconds: 50)),
      );
    }
    await tester.pump(const Duration(milliseconds: 100));
    await tester.pumpAndSettle();
  }

  Future<void> open(WidgetTester tester) async {
    tester.view.physicalSize = const Size(600, 2400);
    tester.view.devicePixelRatio = 1;
    addTearDown(tester.view.resetPhysicalSize);
    addTearDown(tester.view.resetDevicePixelRatio);
    await tester.runAsync(() async {
      await tester.pumpWidget(
        MaterialApp(
          theme: CareSeniorTheme.data,
          home: const ElderlyProfileGate(
            child: Scaffold(body: Text('HOME READY')),
          ),
        ),
      );
      await Future<void>.delayed(const Duration(milliseconds: 100));
    });
    await settle(tester);
  }

  Future<void> fillRequired(WidgetTester tester) async {
    await tester.enterText(
      find.byKey(const ValueKey('complete-name')),
      'NCT kiểm thử',
    );
    await tester.tap(find.byKey(const ValueKey('complete-birth')));
    await tester.pumpAndSettle();
    await tester.tap(find.text('OK'));
    await tester.pumpAndSettle();
    await tester.tap(find.byKey(const ValueKey('complete-gender')));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Nữ').last);
    await tester.pumpAndSettle();
  }

  testWidgets(
    'Missing own profile shows prefilled completion form, not broken Home or an automatic write',
    (tester) async {
      await open(tester);
      expect(find.byType(CompleteProfileScreen), findsOneWidget);
      expect(find.text('Tên tài khoản'), findsOneWidget);
      expect(find.text('0899999930'), findsOneWidget);
      expect(find.text('HOME READY'), findsNothing);
      expect(adapter.posts, isEmpty);
      expect(ElderlyService.instance.cachedProfile, isNull);
      expect(tester.takeException(), isNull);
    },
  );

  testWidgets(
    'Existing profile goes directly to Home without creating anything',
    (tester) async {
      adapter.exists = true;
      await open(tester);
      expect(find.text('HOME READY'), findsOneWidget);
      expect(find.byType(CompleteProfileScreen), findsNothing);
      expect(adapter.posts, isEmpty);
      expect(adapter.paths, isNot(contains('GET /auth/me')));
    },
  );

  for (final status in [404, 500]) {
    testWidgets(
      'Other HTTP $status is retryable, not missing-profile onboarding',
      (tester) async {
        adapter.missingStatus = status;
        adapter.missingCode = 'OTHER_ERROR';
        await open(tester);
        expect(find.byType(CompleteProfileScreen), findsNothing);
        expect(find.text('Thử lại'), findsOneWidget);
        expect(adapter.posts, isEmpty);
        adapter.exists = true;
        await tester.tap(find.text('Thử lại'));
        await settle(tester);
        expect(find.text('HOME READY'), findsOneWidget);
      },
    );
  }

  testWidgets(
    'Offline never creates a profile; retry can load the real profile',
    (tester) async {
      adapter.offline = true;
      await open(tester);
      expect(find.byType(CompleteProfileScreen), findsNothing);
      expect(adapter.posts, isEmpty);
      adapter.offline = false;
      adapter.exists = true;
      await tester.tap(find.text('Thử lại'));
      await settle(tester);
      expect(find.text('HOME READY'), findsOneWidget);
    },
  );

  testWidgets(
    'Required fields block POST; valid completion links via /me and refreshes Home',
    (tester) async {
      await open(tester);
      await tester.tap(find.byKey(const ValueKey('complete-save')));
      await tester.pumpAndSettle();
      expect(adapter.posts, isEmpty);
      expect(find.text('Vui lòng chọn giới tính'), findsOneWidget);
      await fillRequired(tester);
      await tester.tap(find.byKey(const ValueKey('complete-save')));
      await settle(tester);
      expect(adapter.posts, hasLength(1));
      expect(adapter.posts.single['ngaySinh'], '1950-01-01');
      expect(adapter.posts.single['gioiTinh'], 'Nữ');
      for (final field in [
        'UserID',
        'userId',
        'nguoiChamSocId',
        'taiKhoan',
        'email',
      ]) {
        expect(adapter.posts.single.containsKey(field), false);
      }
      expect(find.text('HOME READY'), findsOneWidget);
      expect(ElderlyService.instance.myElderlyId, 42);
      expect(tester.takeException(), isNull);
    },
  );

  testWidgets(
    'Server conflict leaves form and input intact, with a clear message and retry',
    (tester) async {
      adapter.saveStatus = 409;
      await open(tester);
      await fillRequired(tester);
      await tester.tap(find.byKey(const ValueKey('complete-save')));
      await settle(tester);
      expect(
        find.text('CCCD đã được sử dụng. Vui lòng liên hệ quản trị viên.'),
        findsOneWidget,
      );
      expect(find.text('NCT kiểm thử'), findsOneWidget);
      expect(find.text('HOME READY'), findsNothing);
      adapter.saveStatus = null;
      await tester.tap(find.byKey(const ValueKey('complete-save')));
      await settle(tester);
      expect(find.text('HOME READY'), findsOneWidget);
    },
  );

  test(
    'Late create response cannot populate the next account session cache',
    () async {
      ApiClient.instance.dio.interceptors.addAll(interceptors);
      adapter.heldSave = Completer<void>();
      final request = ElderlyService.instance.createMyProfile({
        'hoTen': 'OLD ACCOUNT',
      });
      final assertion = expectLater(request, throwsA(isA<ApiException>()));
      while (adapter.posts.isEmpty) {
        await Future<void>.delayed(const Duration(milliseconds: 10));
      }
      await ApiClient.clearSession();
      ElderlyService.instance.beginSession(2);
      adapter.heldSave!.complete();
      await assertion;
      expect(ElderlyService.instance.cachedProfile, isNull);
    },
  );
}
