import 'dart:async';
import 'dart:convert';
import 'dart:typed_data';
import 'package:dio/dio.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:elderly_care_app/services/api_client.dart';
import 'package:elderly_care_app/screens/home/home_screen.dart';
import 'package:elderly_care_app/main.dart'
    show LoginScreen, SessionHomeScreen, homeForRole;
import 'package:elderly_care_app/screens/caregiver/caregiver_home_screen.dart';
import 'package:elderly_care_app/screens/health/health_screen.dart';
import 'package:elderly_care_app/screens/medication/medication_screen.dart';
import 'package:elderly_care_app/screens/appointments/appointment_screen.dart';
import 'package:elderly_care_app/screens/notifications/notification_screen.dart';
import 'package:elderly_care_app/screens/profile/profile_screen.dart';
import 'package:elderly_care_app/screens/caregiver/caregiver_elderly_detail_screen.dart';

class FlowAdapter implements HttpClientAdapter {
  final paths = <String>[];
  bool offline = false;
  Completer<void>? held;
  @override
  void close({bool force = false}) {}
  @override
  Future<ResponseBody> fetch(
    RequestOptions options,
    Stream<Uint8List>? stream,
    Future<void>? cancel,
  ) async {
    paths.add(options.path);
    if (held != null) await held!.future;
    if (offline) {
      throw DioException(
        requestOptions: options,
        type: DioExceptionType.connectionError,
      );
    }
    final Object data = options.path == '/auth/me'
        ? {'userId': 1, 'tenVaiTro': 'NguoiCaoTuoi'}
        : options.path == '/elderly/me' || options.path == '/elderly/1'
        ? {
            'id': 1,
            'hoTen': 'TEST ONLY PROFILE',
            'ngaySinh': '1950-01-01',
            'gioiTinh': 'Nam',
          }
        : <dynamic>[];
    return ResponseBody.fromString(
      jsonEncode({'data': data}),
      200,
      headers: {
        Headers.contentTypeHeader: [Headers.jsonContentType],
      },
    );
  }
}

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();
  test('Authenticated role chooses its actual home screen', () {
    expect(homeForRole('NguoiChamSoc'), isA<CaregiverHomeScreen>());
    expect(homeForRole('NguoiCaoTuoi'), isA<HomeScreen>());
    expect(homeForRole(null), isA<LoginScreen>());
  });
  final screens = <String, Widget>{
    'home': const HomeScreen(),
    'medication': const MedicationScreen(),
    'appointments': const AppointmentScreen(),
    'health': const HealthScreen(),
    'notifications': const NotificationScreen(),
    'profile': const ProfileScreen(),
    'caregiver-detail': const CaregiverElderlyDetailScreen(
      elderly: {'id': 1, 'hoTen': 'TEST ONLY PROFILE'},
    ),
  };
  late HttpClientAdapter original;
  late FlowAdapter adapter;
  late List<Interceptor> interceptors;
  setUp(() async {
    FlutterSecureStorage.setMockInitialValues({'jwt_token': 'test-session'});
    await ApiClient.clearSession();
    FlutterSecureStorage.setMockInitialValues({'jwt_token': 'test-session'});
    original = ApiClient.instance.dio.httpClientAdapter;
    interceptors = List<Interceptor>.from(ApiClient.instance.dio.interceptors);
    ApiClient.instance.dio.interceptors.clear(
      keepImplyContentTypeInterceptor: false,
    );
    adapter = FlowAdapter();
    ApiClient.instance.dio.httpClientAdapter = adapter;
  });
  tearDown(() {
    ApiClient.instance.dio.httpClientAdapter = original;
    ApiClient.instance.dio.interceptors.clear(
      keepImplyContentTypeInterceptor: false,
    );
    ApiClient.instance.dio.interceptors.addAll(interceptors);
  });
  testWidgets(
    'Restored caregiver session opens assignments without loading an elderly own profile',
    (tester) async {
      FlutterSecureStorage.setMockInitialValues({
        'jwt_token': 'test-session',
        'auth_user': jsonEncode({'userId': 3, 'tenVaiTro': 'NguoiChamSoc'}),
      });
      await tester.pumpWidget(const MaterialApp(home: SessionHomeScreen()));
      await tester.runAsync(
        () => Future<void>.delayed(const Duration(milliseconds: 100)),
      );
      await tester.pump();
      await tester.runAsync(
        () => Future<void>.delayed(const Duration(milliseconds: 100)),
      );
      await tester.pumpAndSettle();
      expect(find.byType(CaregiverHomeScreen), findsOneWidget);
      expect(adapter.paths, contains('/caregivers/me/elderly'));
      expect(adapter.paths, isNot(contains('/elderly/me')));
      expect(tester.takeException(), isNull);
    },
    variant: TargetPlatformVariant.only(TargetPlatform.linux),
  );
  for (final entry in screens.entries) {
    testWidgets(
      'Empty ${entry.key}: narrow screen and large text',
      (tester) async {
        await tester.binding.setSurfaceSize(const Size(360, 740));
        addTearDown(() => tester.binding.setSurfaceSize(null));
        await tester.pumpWidget(
          MaterialApp(
            home: MediaQuery(
              data: const MediaQueryData(
                size: Size(360, 740),
                textScaler: TextScaler.linear(1.8),
              ),
              child: entry.value,
            ),
          ),
        );
        await tester.runAsync(
          () => Future<void>.delayed(const Duration(milliseconds: 60)),
        );
        await tester.pumpAndSettle(
          const Duration(milliseconds: 100),
          EnginePhase.sendSemanticsUpdate,
          const Duration(seconds: 5),
        );
        expect(tester.takeException(), isNull);
      },
      variant: TargetPlatformVariant.only(TargetPlatform.linux),
    );
  }
  for (final entry in screens.entries) {
    testWidgets(
      'Network error ${entry.key}: ends loading and offers retry',
      (tester) async {
        adapter.offline = true;
        await tester.pumpWidget(MaterialApp(home: entry.value));
        await tester.runAsync(
          () => Future<void>.delayed(const Duration(milliseconds: 60)),
        );
        await tester.pump(const Duration(milliseconds: 500));
        await tester.runAsync(
          () => Future<void>.delayed(const Duration(milliseconds: 100)),
        );
        await tester.pump();
        expect(find.text('Thử lại'), findsWidgets);
        expect(find.byType(CircularProgressIndicator), findsNothing);
        expect(tester.takeException(), isNull);
      },
      variant: TargetPlatformVariant.only(TargetPlatform.linux),
    );
  }
  testWidgets(
    'Loading then navigate back: late response does not update disposed health screen',
    (tester) async {
      adapter.held = Completer<void>();
      await tester.pumpWidget(
        MaterialApp(
          home: Builder(
            builder: (context) => TextButton(
              onPressed: () => Navigator.push(
                context,
                MaterialPageRoute<void>(builder: (_) => const HealthScreen()),
              ),
              child: const Text('OPEN'),
            ),
          ),
        ),
      );
      await tester.tap(find.text('OPEN'));
      await tester.pump();
      await tester.pump(const Duration(milliseconds: 400));
      await tester.runAsync(
        () => Future<void>.delayed(const Duration(milliseconds: 60)),
      );
      expect(find.byType(CircularProgressIndicator), findsWidgets);
      Navigator.of(tester.element(find.byType(HealthScreen))).pop();
      await tester.pump();
      await tester.pump(const Duration(milliseconds: 400));
      adapter.held!.complete();
      await tester.runAsync(
        () => Future<void>.delayed(const Duration(milliseconds: 60)),
      );
      await tester.pumpAndSettle(
        const Duration(milliseconds: 100),
        EnginePhase.sendSemanticsUpdate,
        const Duration(seconds: 5),
      );
      expect(tester.takeException(), isNull);
    },
  );
  testWidgets(
    'Login fits large text with keyboard inset and keeps entered text',
    (tester) async {
      await tester.binding.setSurfaceSize(const Size(360, 740));
      addTearDown(() => tester.binding.setSurfaceSize(null));
      await tester.pumpWidget(
        const MaterialApp(
          home: MediaQuery(
            data: MediaQueryData(
              size: Size(360, 740),
              viewInsets: EdgeInsets.only(bottom: 300),
              textScaler: TextScaler.linear(1.8),
            ),
            child: LoginScreen(),
          ),
        ),
      );
      await tester.enterText(find.byType(TextField).first, 'test.elder.a');
      await tester.pump();
      expect(find.text('test.elder.a'), findsOneWidget);
      expect(tester.takeException(), isNull);
    },
  );
}
