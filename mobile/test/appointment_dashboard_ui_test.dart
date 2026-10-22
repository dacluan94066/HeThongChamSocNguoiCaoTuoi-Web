import 'dart:async';
import 'dart:convert';
import 'dart:typed_data';

import 'package:dio/dio.dart';
import 'package:flutter/material.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:elderly_care_app/screens/appointments/appointment_dashboard_ui.dart';
import 'package:elderly_care_app/screens/appointments/appointment_screen.dart';
import 'package:elderly_care_app/services/api_client.dart';
import 'package:elderly_care_app/services/appointment_service.dart';
import 'package:elderly_care_app/services/local_notification_service.dart';
import 'package:elderly_care_app/services/mobile_realtime_service.dart';
import 'package:elderly_care_app/theme/care_senior_theme.dart';
import 'package:elderly_care_app/widgets/appointment_reminder_banner.dart';
import 'package:elderly_care_app/widgets/care_senior_ui.dart';
import 'package:elderly_care_app/widgets/draggable_assistant_fab.dart';
import 'support/notification_platform_fake.dart';

/// Synthetic transport; every non-GET request is rejected, never sent online.
class AppointmentUiAdapter implements HttpClientAdapter {
  final requests = <RequestOptions>[];
  bool offline = false, empty = false;
  int? deniedStatus;
  Completer<void>? gate;
  List<Map<String, dynamic>>? custom;

  static const longPlace =
      'ĐỊA ĐIỂM KHÁM KIỂM THỬ CÓ TÊN VÀ ĐỊA CHỈ RẤT DÀI TỪ API';
  static const longDoctor =
      'NGƯỜI PHỤ TRÁCH TẠI NƠI KHÁM KIỂM THỬ VỚI HỌ VÀ TÊN DÀI';
  static const longReason =
      'LÝ DO KHÁM KIỂM THỬ: nội dung nhiều dòng từ API được giữ nguyên và không bị cắt khi phóng to chữ.';

  List<Map<String, dynamic>> get rows =>
      custom ??
      [
        for (var i = 0; i < 3; i++)
          {
            'id': 700 + i,
            'tenBenhVien': i == 0 ? longPlace : 'ĐỊA ĐIỂM API $i',
            'bacSiPhuTrach': longDoctor,
            'chuyenKhoa': 'CHUYÊN KHOA KIỂM THỬ TỪ API',
            'lyDoKham': longReason,
            'thoiGianKham': DateTime.now()
                .add(Duration(days: i + 2))
                .toIso8601String(),
            // Deliberately completed/cancelled in the future: UI must trust API status.
            'trangThai': ['ChuaDen', 'DaKham', 'Huy'][i],
            'ketQuaKham': 'KẾT QUẢ KIỂM THỬ $i TỪ API',
          },
      ];

  @override
  void close({bool force = false}) {}

  @override
  Future<ResponseBody> fetch(
    RequestOptions options,
    Stream<Uint8List>? stream,
    Future<void>? cancel,
  ) async {
    requests.add(options);
    if (options.method != 'GET') {
      throw StateError('Appointment UI must remain read-only');
    }
    await gate?.future;
    if (offline) {
      throw DioException(
        requestOptions: options,
        type: DioExceptionType.connectionError,
      );
    }
    return ResponseBody.fromString(
      jsonEncode(
        deniedStatus == null
            ? {'data': empty ? [] : rows}
            : {'message': 'Bạn không có quyền xem lịch khám này.'},
      ),
      deniedStatus ?? 200,
      headers: {
        Headers.contentTypeHeader: [Headers.jsonContentType],
      },
    );
  }
}

class AppointmentUiFixture {
  AppointmentUiFixture(this.adapter);
  final AppointmentUiAdapter adapter;
  final notifications = NotificationPlatformFake();
  late HttpClientAdapter original;
  late List<Interceptor> interceptors;

  Future<void> install() async {
    SharedPreferences.setMockInitialValues({'assistant_fab_hint_seen': true});
    FlutterSecureStorage.setMockInitialValues({});
    notifications.install();
    await ApiClient.clearSession();
    AppointmentService.instance.clearCache();
    LocalNotificationService.appointmentState.value =
        AppointmentReminderState.ready;
    final dio = ApiClient.instance.dio;
    original = dio.httpClientAdapter;
    interceptors = List<Interceptor>.from(dio.interceptors);
    dio.interceptors.clear(keepImplyContentTypeInterceptor: false);
    dio.httpClientAdapter = adapter;
  }

  void dispose() {
    AppointmentService.instance.clearCache();
    final dio = ApiClient.instance.dio;
    dio.httpClientAdapter = original;
    dio.interceptors.clear(keepImplyContentTypeInterceptor: false);
    dio.interceptors.addAll(interceptors);
  }
}

Widget appointmentUiApp({double scale = 1, bool withNavigation = false}) =>
    MaterialApp(
      theme: CareSeniorTheme.data,
      builder: (context, child) => MediaQuery(
        data: MediaQuery.of(
          context,
        ).copyWith(textScaler: TextScaler.linear(scale)),
        child: child!,
      ),
      home: withNavigation
          ? Scaffold(
              body: DraggableAssistantFabHost(
                onPressed: () {},
                child: const AppointmentScreen(),
              ),
              bottomNavigationBar: AppBottomNavigation(
                selectedIndex: 2,
                onSelected: (_) {},
              ),
            )
          : const AppointmentScreen(),
    );

Future<void> settleAppointmentUi(WidgetTester tester) async {
  for (var i = 0; i < 3; i++) {
    await tester.pump(const Duration(milliseconds: 100));
    await tester.runAsync(
      () => Future<void>.delayed(const Duration(milliseconds: 30)),
    );
  }
  await tester.pumpAndSettle();
}

Finder appointmentScroll() => find
    .descendant(
      of: find.byKey(const ValueKey('appointment-list')),
      matching: find.byType(Scrollable),
    )
    .first;

Future<void> revealAppointment(
  WidgetTester tester,
  Finder finder, {
  double delta = 240,
}) async {
  await tester.scrollUntilVisible(
    finder,
    delta,
    maxScrolls: 150,
    scrollable: appointmentScroll(),
  );
  await tester.pumpAndSettle();
}

Future<void> selectAppointmentFilter(WidgetTester tester, int index) async {
  tester.state<ScrollableState>(appointmentScroll()).position.jumpTo(0);
  await tester.pumpAndSettle();
  await revealAppointment(
    tester,
    find.byKey(const ValueKey('appointment-filters')),
    delta: 200,
  );
  final horizontal = find.descendant(
    of: find.byKey(const ValueKey('appointment-filters')),
    matching: find.byType(Scrollable),
  );
  tester.state<ScrollableState>(horizontal).position.jumpTo(0);
  await tester.pumpAndSettle();
  await tester.scrollUntilVisible(
    find.byKey(ValueKey('appointment-filter-$index')),
    100,
    scrollable: horizontal,
  );
  await tester.ensureVisible(find.byKey(ValueKey('appointment-filter-$index')));
  await tester.pumpAndSettle();
  expect(
    find.byKey(ValueKey('appointment-filter-$index')).hitTestable(),
    findsOneWidget,
  );
  await tester.tap(find.byKey(ValueKey('appointment-filter-$index')));
  await settleAppointmentUi(tester);
  tester.state<ScrollableState>(appointmentScroll()).position.jumpTo(0);
  await tester.pumpAndSettle();
  await revealAppointment(tester, find.byType(AppointmentOverview), delta: 200);
  expect(
    tester.widget<AppointmentOverview>(find.byType(AppointmentOverview)).label,
    index == 0 ? contains('lịch khám chưa đến') : contains('lịch phù hợp'),
  );
}

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();
  late AppointmentUiAdapter adapter;
  late AppointmentUiFixture fixture;
  setUp(() async {
    adapter = AppointmentUiAdapter();
    fixture = AppointmentUiFixture(adapter);
    await fixture.install();
  });
  tearDown(() => fixture.dispose());

  testWidgets(
    'API fields, original summary, reminders and read-only actions are retained',
    (tester) async {
      await tester.pumpWidget(appointmentUiApp());
      await settleAppointmentUi(tester);
      expect(find.text('1 lịch khám chưa đến'), findsOneWidget);
      expect(find.byType(AppointmentReminderBanner), findsOneWidget);
      await revealAppointment(
        tester,
        find.byKey(const ValueKey('appointment-card-700')),
      );
      final card = tester.widget<AppointmentScheduleCard>(
        find.byKey(const ValueKey('appointment-card-700')),
      );
      expect(card.title, AppointmentUiAdapter.longPlace);
      expect(card.doctor, AppointmentUiAdapter.longDoctor);
      expect(card.reason, AppointmentUiAdapter.longReason);
      expect(card.statusLabel, 'Chưa đến');
      expect(card.result, isNull);
      expect(
        adapter.requests.every(
          (r) => r.path == '/elderly/me/appointments' && r.method == 'GET',
        ),
        true,
      );
      expect(find.text('Đặt lịch'), findsNothing);
      expect(find.text('Hủy lịch'), findsNothing);
      expect(tester.takeException(), isNull);
      await tester.pumpWidget(const SizedBox.shrink());
    },
  );

  testWidgets(
    'All four existing filters remain local and display API status/result',
    (tester) async {
      await tester.pumpWidget(appointmentUiApp());
      await settleAppointmentUi(tester);
      final count = adapter.requests.length;
      for (final (index, label, id) in [
        (1, 'Chưa đến', 700),
        (2, 'Đã khám', 701),
        (3, 'Hủy', 702),
      ]) {
        await selectAppointmentFilter(tester, index);
        expect(find.text('1 lịch phù hợp'), findsOneWidget);
        await revealAppointment(
          tester,
          find.byKey(ValueKey('appointment-card-$id')),
        );
        final card = tester.widget<AppointmentScheduleCard>(
          find.byKey(ValueKey('appointment-card-$id')),
        );
        expect(card.statusLabel, label);
        expect(card.result, index == 2 ? 'KẾT QUẢ KIỂM THỬ 1 TỪ API' : null);
      }
      expect(adapter.requests.length, count);
      await selectAppointmentFilter(tester, 0);
      expect(find.text('1 lịch khám chưa đến'), findsOneWidget);
      await tester.pumpWidget(const SizedBox.shrink());
    },
  );

  testWidgets(
    'Detail sheet retains all fields, conditional result and close action',
    (tester) async {
      await tester.pumpWidget(appointmentUiApp());
      await settleAppointmentUi(tester);
      await selectAppointmentFilter(tester, 2);
      await revealAppointment(tester, find.text('Xem chi tiết'));
      await tester.tap(find.text('Xem chi tiết'));
      await tester.pumpAndSettle();
      expect(find.byType(AppointmentDetailSheet), findsOneWidget);
      final sheet = tester.widget<AppointmentDetailSheet>(
        find.byType(AppointmentDetailSheet),
      );
      expect(sheet.title, 'ĐỊA ĐIỂM API 1');
      final fields = sheet.fields.whereType<AppointmentInfoField>().toList();
      expect(fields.map((f) => f.label), [
        'Thời gian khám',
        'Bác sĩ tại nơi khám',
        'Chuyên khoa',
        'Lý do khám',
        'Kết quả khám',
      ]);
      expect(fields.last.value, 'KẾT QUẢ KIỂM THỬ 1 TỪ API');
      await tester.ensureVisible(find.text('ĐÓNG'));
      await tester.tap(find.text('ĐÓNG'));
      await tester.pumpAndSettle();
      expect(find.byType(AppointmentDetailSheet), findsNothing);
      expect(adapter.requests.every((r) => r.method == 'GET'), true);
      await tester.pumpWidget(const SizedBox.shrink());
    },
  );

  testWidgets(
    'Loading, connection error and retry to empty preserve existing messages',
    (tester) async {
      adapter.gate = Completer<void>();
      await tester.pumpWidget(appointmentUiApp());
      await tester.pump();
      expect(find.byType(CircularProgressIndicator), findsOneWidget);
      adapter.offline = true;
      adapter.gate!.complete();
      await settleAppointmentUi(tester);
      expect(find.text('Không thể tải lịch khám'), findsOneWidget);
      adapter.offline = false;
      adapter.empty = true;
      final retry = find.widgetWithText(FilledButton, 'Thử lại');
      await revealAppointment(tester, retry);
      await tester.tap(retry);
      await settleAppointmentUi(tester);
      expect(find.text('Chưa có lịch khám'), findsOneWidget);
      expect(find.byType(AppointmentScheduleCard), findsNothing);
      await tester.pumpWidget(const SizedBox.shrink());
    },
  );

  testWidgets(
    'Empty filters show distinct existing explanations without invented data',
    (tester) async {
      adapter.empty = true;
      await tester.pumpWidget(appointmentUiApp());
      await settleAppointmentUi(tester);
      for (final (index, text) in [
        (1, 'Chưa có lịch khám sắp tới'),
        (2, 'Chưa có lịch đã khám'),
        (3, 'Chưa có lịch đã hủy'),
      ]) {
        await selectAppointmentFilter(tester, index);
        expect(find.text(text), findsOneWidget);
        expect(find.text('0 lịch phù hợp'), findsOneWidget);
      }
      await tester.pumpWidget(const SizedBox.shrink());
    },
  );

  testWidgets('Forbidden API message is preserved with no mutation controls', (
    tester,
  ) async {
    adapter.deniedStatus = 403;
    await tester.pumpWidget(appointmentUiApp());
    await settleAppointmentUi(tester);
    expect(find.text('Bạn không có quyền xem lịch khám này.'), findsOneWidget);
    expect(find.byType(AppointmentScheduleCard), findsNothing);
    expect(adapter.requests.every((r) => r.method == 'GET'), true);
    await tester.pumpWidget(const SizedBox.shrink());
  });

  testWidgets(
    'Legacy status filtering and missing API field fallbacks stay unchanged',
    (tester) async {
      adapter.custom = [
        {'id': 899, 'trangThai': 'DaDoiLich'},
      ];
      await tester.pumpWidget(appointmentUiApp());
      await settleAppointmentUi(tester);
      expect(
        find.text('0 lịch khám chưa đến'),
        findsOneWidget,
      ); // Existing exact-status summary.
      await selectAppointmentFilter(
        tester,
        1,
      ); // Existing service includes legacy rows here.
      await revealAppointment(
        tester,
        find.byKey(const ValueKey('appointment-card-899')),
      );
      final card = tester.widget<AppointmentScheduleCard>(
        find.byKey(const ValueKey('appointment-card-899')),
      );
      expect(card.statusLabel, 'Chưa đến');
      expect(card.title, 'Chưa cập nhật');
      expect(card.time, 'Chưa cập nhật');
      expect(card.doctor, 'Chưa cập nhật');
      expect(find.text('Đã dời lịch'), findsNothing);
      await tester.pumpWidget(const SizedBox.shrink());
    },
  );

  testWidgets(
    'Realtime refresh uses current service data and retains data on silent failure',
    (tester) async {
      await tester.pumpWidget(appointmentUiApp());
      await settleAppointmentUi(tester);
      adapter.custom = [
        {
          'id': 910,
          'tenBenhVien': 'ĐỊA ĐIỂM CẬP NHẬT API',
          'trangThai': 'DaKham',
          'ketQuaKham': 'KẾT QUẢ MỚI',
        },
      ];
      await tester.runAsync(
        () => AppointmentService.instance.getAppointments(refresh: true),
      );
      MobileRealtimeService.instance.appointmentRevision.value++;
      await settleAppointmentUi(tester);
      await revealAppointment(
        tester,
        find.byKey(const ValueKey('appointment-card-910')),
      );
      expect(
        tester
            .widget<AppointmentScheduleCard>(
              find.byKey(const ValueKey('appointment-card-910')),
            )
            .result,
        'KẾT QUẢ MỚI',
      );
      adapter.offline = true;
      AppointmentService.instance.clearCache();
      MobileRealtimeService.instance.appointmentRevision.value++;
      await settleAppointmentUi(tester);
      expect(
        find.byKey(const ValueKey('appointment-card-910')),
        findsOneWidget,
      );
      expect(find.text('Không thể tải lịch khám'), findsNothing);
      await tester.pumpWidget(const SizedBox.shrink());
    },
  );

  testWidgets(
    'Pull-to-refresh retains selected filter and applies updated API status',
    (tester) async {
      await tester.pumpWidget(appointmentUiApp());
      await settleAppointmentUi(tester);
      await selectAppointmentFilter(tester, 1);
      adapter.custom = [
        {'id': 700, 'trangThai': 'DaKham'},
      ];
      // Loading replaces the existing indicator, so do not await its disposed
      // animation. Assert the actual completed API result below instead.
      unawaited(
        tester
            .state<RefreshIndicatorState>(find.byType(RefreshIndicator))
            .show(),
      );
      await settleAppointmentUi(tester);
      expect(find.text('Chưa có lịch khám sắp tới'), findsOneWidget);
      expect(find.text('0 lịch phù hợp'), findsOneWidget);
      await tester.pumpWidget(const SizedBox.shrink());
    },
  );

  for (final width in [320.0, 360.0, 390.0, 412.0, 768.0]) {
    for (final scale in [1.0, 1.2, 1.4, 1.6, 1.8]) {
      testWidgets(
        'Appointment long card/detail and pill fit width=$width scale=$scale',
        (tester) async {
          tester.view.physicalSize = Size(width, 820);
          tester.view.devicePixelRatio = 1;
          addTearDown(tester.view.resetPhysicalSize);
          addTearDown(tester.view.resetDevicePixelRatio);
          adapter.custom = [
            adapter.rows[1]..['tenBenhVien'] = AppointmentUiAdapter.longPlace,
          ];
          await tester.pumpWidget(
            appointmentUiApp(scale: scale, withNavigation: true),
          );
          await settleAppointmentUi(tester);
          expect(tester.takeException(), isNull);
          await selectAppointmentFilter(tester, 2);
          await revealAppointment(tester, find.text('Xem chi tiết'));
          final pill = tester.getRect(
            find.byKey(const ValueKey('floating-pill-navigation')),
          );
          final button = tester.getRect(
            find.widgetWithText(OutlinedButton, 'Xem chi tiết'),
          );
          expect(button.bottom, lessThanOrEqualTo(pill.top));
          expect(tester.takeException(), isNull);
          await tester.tap(find.text('Xem chi tiết'));
          await tester.pumpAndSettle();
          expect(find.byType(AppointmentDetailSheet), findsOneWidget);
          await tester.ensureVisible(find.text('ĐÓNG'));
          await tester.pumpAndSettle();
          expect(tester.takeException(), isNull);
          await tester.tap(find.text('ĐÓNG'));
          await tester.pumpAndSettle();
          expect(adapter.requests.every((r) => r.method == 'GET'), true);
          await tester.pumpWidget(const SizedBox.shrink());
        },
      );
    }
  }

  testWidgets('Header, pill and detail close respect Android safe insets', (
    tester,
  ) async {
    tester.view.physicalSize = const Size(320, 820);
    tester.view.devicePixelRatio = 1;
    tester.view.padding = const FakeViewPadding(top: 24, bottom: 34);
    addTearDown(tester.view.resetPhysicalSize);
    addTearDown(tester.view.resetDevicePixelRatio);
    addTearDown(tester.view.resetPadding);
    adapter.custom = [adapter.rows.first];
    await tester.pumpWidget(appointmentUiApp(scale: 1.8, withNavigation: true));
    await settleAppointmentUi(tester);
    expect(
      tester.getTopLeft(find.text('Lịch khám').first).dy,
      greaterThanOrEqualTo(24),
    );
    expect(
      tester
          .getRect(find.byKey(const ValueKey('floating-pill-navigation')))
          .bottom,
      lessThanOrEqualTo(786),
    );
    await revealAppointment(tester, find.text('Xem chi tiết'));
    await tester.tap(find.text('Xem chi tiết'));
    await tester.pumpAndSettle();
    await tester.ensureVisible(find.text('ĐÓNG'));
    await tester.pumpAndSettle();
    expect(
      tester.getRect(find.widgetWithText(FilledButton, 'ĐÓNG')).bottom,
      lessThanOrEqualTo(786),
    );
    expect(tester.takeException(), isNull);
    await tester.pumpWidget(const SizedBox.shrink());
  });

  testWidgets('Long appointment list scrolls to the final API row', (
    tester,
  ) async {
    adapter.custom = [
      for (var i = 0; i < 30; i++)
        {
          ...adapter.rows.first,
          'id': 1000 + i,
          'tenBenhVien': 'ĐỊA ĐIỂM KIỂM THỬ $i',
        },
    ];
    await tester.pumpWidget(appointmentUiApp(withNavigation: true));
    await settleAppointmentUi(tester);
    await revealAppointment(
      tester,
      find.byKey(const ValueKey('appointment-card-1029')),
    );
    expect(find.text('ĐỊA ĐIỂM KIỂM THỬ 29').hitTestable(), findsOneWidget);
    expect(tester.takeException(), isNull);
    await tester.pumpWidget(const SizedBox.shrink());
  });
}
