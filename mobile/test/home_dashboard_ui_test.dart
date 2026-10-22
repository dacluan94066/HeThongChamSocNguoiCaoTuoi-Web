import 'dart:async';
import 'dart:convert';
import 'dart:typed_data';

import 'package:dio/dio.dart';
import 'package:flutter/material.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:elderly_care_app/screens/home/elderly_home_screen.dart';
import 'package:elderly_care_app/screens/home/home_dashboard_ui.dart';
import 'package:elderly_care_app/screens/alerts/sos_screen.dart';
import 'package:elderly_care_app/screens/alerts/alerts_hub_screen.dart';
import 'package:elderly_care_app/screens/appointments/appointment_screen.dart';
import 'package:elderly_care_app/screens/medication/medication_screen.dart';
import 'package:elderly_care_app/screens/profile/profile_screen.dart';
import 'package:elderly_care_app/services/api_client.dart';
import 'package:elderly_care_app/services/elderly_service.dart';
import 'package:elderly_care_app/theme/care_senior_theme.dart';
import 'package:elderly_care_app/widgets/care_senior_ui.dart';
import 'package:elderly_care_app/widgets/draggable_assistant_fab.dart';
import 'support/notification_platform_fake.dart';

/// Synthetic transport used by widget/native UI checks. Never contacts a server.
class HomeUiAdapter implements HttpClientAdapter {
  final requests = <RequestOptions>[];
  bool empty = false;
  bool offline = false;
  String name = 'Người dùng kiểm thử giao diện';
  @override
  void close({bool force = false}) {}
  @override
  Future<ResponseBody> fetch(
    RequestOptions options,
    Stream<Uint8List>? stream,
    Future<void>? cancel,
  ) async {
    requests.add(options);
    if (offline) {
      throw DioException(
        requestOptions: options,
        type: DioExceptionType.connectionError,
      );
    }
    final now = DateTime.now().toIso8601String();
    Object data = <Object>[];
    if (options.path == '/elderly/me' || options.path == '/auth/me') {
      data = {
        'id': 1,
        'userId': 1,
        'tenVaiTro': 'NguoiCaoTuoi',
        'hoTen': name,
        'ngaySinh': '1950-01-01',
        'gioiTinh': 'Nam',
      };
    } else if (!empty && options.path == '/elderly/me/health-metrics') {
      data = [
        // Deliberately above the Figma demo range but normal per API flag.
        {
          'tenChiSo': 'Huyết áp',
          'giaTri': 175,
          'giaTriPhu': 108,
          'donVi': 'mmHg',
          'laBatThuong': false,
          'thoiGianDo': now,
        },
        {
          'tenChiSo': 'Đường huyết',
          'giaTri': 111,
          'donVi': 'mg/dL',
          'laBatThuong': true,
          'thoiGianDo': now,
        },
      ];
    } else if (!empty && options.path == '/elderly/me/medication-schedule') {
      data = [
        {
          'id': 201,
          'tenThuoc': 'THUỐC KIỂM THỬ A',
          'lieuDung': 'LIỀU KIỂM THỬ',
          'thoiGianDuKien': now,
          'trangThai': 'DaUong',
        },
        {
          'id': 202,
          'tenThuoc': 'THUỐC KIỂM THỬ B VỚI TÊN DÀI ĐỂ KIỂM TRA HIỂN THỊ',
          'lieuDung': 'LIỀU KIỂM THỬ',
          'thoiGianDuKien': now,
          'trangThai': 'ChuaDenGio',
        },
      ];
    } else if (!empty && options.path.startsWith('/elderly/me/appointments')) {
      data = [
        {
          'id': 301,
          'thoiGianKham': now,
          'tenBenhVien': 'ĐỊA ĐIỂM KIỂM THỬ',
          'lyDoKham': 'NỘI DUNG KIỂM THỬ',
          'trangThai': 'ChuaDen',
        },
      ];
    } else if (options.method == 'PATCH' &&
        options.path == '/medication-schedule/202/confirm') {
      data = {'id': 202, 'trangThai': 'DaUong'};
    }
    return ResponseBody.fromString(
      jsonEncode({'data': data}),
      200,
      headers: {
        Headers.contentTypeHeader: [Headers.jsonContentType],
      },
    );
  }
}

class HomeUiFixture {
  HomeUiFixture(this.adapter);
  final HomeUiAdapter adapter;
  late HttpClientAdapter original;
  late List<Interceptor> interceptors;
  Future<void> install() async {
    // In-memory platform doubles: no real account/session or reminders are touched.
    SharedPreferences.setMockInitialValues({'assistant_fab_hint_seen': true});
    FlutterSecureStorage.setMockInitialValues({});
    NotificationPlatformFake().install();
    await ApiClient.clearSession();
    ElderlyService.instance.beginSession(1);
    final dio = ApiClient.instance.dio;
    original = dio.httpClientAdapter;
    interceptors = List<Interceptor>.from(dio.interceptors);
    dio.interceptors.clear(keepImplyContentTypeInterceptor: false);
    dio.httpClientAdapter = adapter;
  }

  void dispose() {
    final dio = ApiClient.instance.dio;
    dio.httpClientAdapter = original;
    dio.interceptors.clear(keepImplyContentTypeInterceptor: false);
    dio.interceptors.addAll(interceptors);
    ElderlyService.instance.clearCache();
  }
}

Future<void> settleHomeUi(WidgetTester tester) async {
  for (var i = 0; i < 3; i++) {
    await tester.pump(const Duration(milliseconds: 100));
    await tester.runAsync(
      () => Future<void>.delayed(const Duration(milliseconds: 50)),
    );
  }
  await tester.pumpAndSettle();
}

Widget homeUiApp({double scale = 1}) => MaterialApp(
  theme: CareSeniorTheme.data,
  builder: (context, child) => MediaQuery(
    data: MediaQuery.of(context).copyWith(textScaler: TextScaler.linear(scale)),
    child: child!,
  ),
  home: const HomeScreen(),
);

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();
  late HomeUiAdapter adapter;
  late HomeUiFixture fixture;
  setUp(() async {
    adapter = HomeUiAdapter();
    fixture = HomeUiFixture(adapter);
    await fixture.install();
  });
  tearDown(() => fixture.dispose());

  testWidgets(
    'Home renders API values and flags, never demo thresholds or data',
    (tester) async {
      await tester.pumpWidget(homeUiApp());
      await settleHomeUi(tester);
      final welcome = tester.widget<HomeWelcomeHeader>(
        find.byType(HomeWelcomeHeader),
      );
      expect(welcome.name, adapter.name);
      expect(welcome.needsAttention, true);
      final cards = tester
          .widgetList<HomeMetricTile>(find.byType(HomeMetricTile))
          .toList();
      expect(cards.length, 6);
      expect(cards.first.value, '175/108');
      expect(cards.first.status, 'Bình thường');
      expect(cards[1].status, 'Bất thường');
      expect(cards[1].unit, 'mg/dL');
      expect(find.text('Nguyễn Văn An'), findsNothing);
      expect(find.text('120/80'), findsNothing);
      expect(adapter.requests.every((r) => r.method == 'GET'), true);
      expect(find.byType(DraggableAssistantFabHost), findsOneWidget);
      expect(tester.takeException(), isNull);
    },
  );

  testWidgets(
    'Missing API measurements show an empty state, never fabricated metrics/BMI',
    (tester) async {
      adapter.empty = true;
      await tester.pumpWidget(homeUiApp());
      await settleHomeUi(tester);
      final cards = tester.widgetList<HomeMetricTile>(
        find.byType(HomeMetricTile),
      );
      expect(
        cards.every((card) => !card.hasData && card.value == 'Chưa có dữ liệu'),
        true,
      );
      await tester.scrollUntilVisible(
        find.text('Chưa có dữ liệu lịch uống thuốc hôm nay.'),
        250,
        scrollable: find.byType(Scrollable).first,
      );
      expect(
        find.text('Chưa có dữ liệu lịch uống thuốc hôm nay.'),
        findsOneWidget,
      );
      expect(adapter.requests.every((r) => r.method == 'GET'), true);
      expect(tester.takeException(), isNull);
    },
  );

  for (final (width, scale) in <(double, double)>[
    for (final width in [320.0, 360.0, 390.0, 412.0, 768.0])
      for (final scale in [1.0, 1.2, 1.4, 1.6, 1.8]) (width, scale),
    (768, 2),
  ]) {
    testWidgets(
      'Home layout fits width=$width and text scale=$scale with long real-data shapes',
      (tester) async {
        adapter.name = 'NGƯỜI DÙNG KIỂM THỬ GIAO DIỆN VỚI HỌ VÀ TÊN DÀI';
        tester.view.physicalSize = Size(width, 820);
        tester.view.devicePixelRatio = 1;
        addTearDown(tester.view.resetPhysicalSize);
        addTearDown(tester.view.resetDevicePixelRatio);
        await tester.pumpWidget(homeUiApp(scale: scale));
        await settleHomeUi(tester);
        expect(tester.takeException(), isNull);
        await tester.scrollUntilVisible(
          find.text('Người chăm sóc của bạn'),
          400,
          maxScrolls: 60,
          scrollable: find.byType(Scrollable).first,
        );
        await tester.pumpAndSettle();
        expect(tester.takeException(), isNull);
        expect(find.byType(AppBottomNavigation), findsOneWidget);
      },
    );
  }

  for (final (width, scale, value, unit) in [
    (264.0, 1.0, '175/108', 'mmHg'),
    (200.0, 1.0, '111', 'mg/dL'),
    (500.0, 1.8, '175/108', 'mmHg'),
  ]) {
    testWidgets(
      'metric reading keeps value and unit together when they fit: $width/$scale',
      (tester) async {
        await tester.pumpWidget(
          MaterialApp(
            theme: CareSeniorTheme.data,
            home: MediaQuery(
              data: MediaQueryData(textScaler: TextScaler.linear(scale)),
              child: Scaffold(
                body: Align(
                  alignment: Alignment.topLeft,
                  child: SizedBox(
                    width: width,
                    child: HomeMetricTile(
                      width: width,
                      name: 'Chỉ số kiểm thử',
                      value: value,
                      unit: unit,
                      status: 'Bình thường',
                      measuredAt: 'GIỜ KIỂM THỬ',
                      abnormal: false,
                      icon: Icons.monitor_heart_outlined,
                      onTap: () {},
                      hasData: true,
                    ),
                  ),
                ),
              ),
            ),
          ),
        );
        expect(
          tester.getBottomRight(find.text(value)).dy,
          closeTo(tester.getBottomRight(find.text(unit)).dy, 0.5),
        );
        final text = tester.widget<Text>(find.text(value));
        expect(text.style!.fontSize, inInclusiveRange(22, 28));
        expect(tester.widget<Text>(find.text(unit)).style!.fontSize, 16);
        expect(tester.takeException(), isNull);
      },
    );
  }

  testWidgets(
    'All six bottom destinations preserve order and exact existing screens',
    (tester) async {
      await tester.pumpWidget(homeUiApp());
      await settleHomeUi(tester);
      final nav = find.byType(AppBottomNavigation);
      expect(
        tester
            .widgetList<Text>(
              find.descendant(of: nav, matching: find.byType(Text)),
            )
            .map((text) => text.data)
            .toList(),
        ['Trang chủ', 'Lịch thuốc', 'Lịch khám', 'SOS', 'Cảnh báo', 'Hồ sơ'],
      );
      final destinations = <(String, Type)>[
        ('Lịch thuốc', MedicationScreen),
        ('Lịch khám', AppointmentScreen),
        ('SOS', SosScreen),
        ('Cảnh báo', AlertsHubScreen),
        ('Hồ sơ', ProfileScreen),
      ];
      for (final (label, screen) in destinations) {
        await tester.tap(find.descendant(of: nav, matching: find.text(label)));
        await settleHomeUi(tester);
        expect(find.byType(screen), findsOneWidget);
      }
      expect(adapter.requests.every((r) => r.method == 'GET'), true);
      expect(tester.takeException(), isNull);
    },
  );

  testWidgets(
    'Home quick SOS only opens current SOS screen, never sends immediately',
    (tester) async {
      await tester.pumpWidget(homeUiApp());
      await settleHomeUi(tester);
      await tester.tap(find.byKey(const ValueKey('home-quick-SOS')));
      await settleHomeUi(tester);
      expect(find.byType(SosScreen), findsOneWidget);
      expect(find.text('Giữ nút SOS trong 3 giây'), findsOneWidget);
      expect(adapter.requests.every((r) => r.method == 'GET'), true);
    },
  );

  testWidgets(
    'Confirmation retains the existing endpoint, status and selected next dose',
    (tester) async {
      await tester.pumpWidget(homeUiApp());
      await settleHomeUi(tester);
      await tester.scrollUntilVisible(
        find.text('Tôi đã uống cữ này').hitTestable(),
        350,
        scrollable: find.byType(Scrollable).first,
      );
      await tester.tap(find.text('Tôi đã uống cữ này'));
      await settleHomeUi(tester);
      final writes = adapter.requests.where((r) => r.method != 'GET').toList();
      expect(writes.length, 1);
      expect(writes.single.path, '/medication-schedule/202/confirm');
      expect(writes.single.data, {'trangThai': 'DaUong'});
      expect(tester.takeException(), isNull);
    },
  );
}
