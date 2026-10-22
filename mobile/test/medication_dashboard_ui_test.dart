import 'dart:async';
import 'dart:convert';
import 'dart:typed_data';

import 'package:dio/dio.dart';
import 'package:flutter/material.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:elderly_care_app/screens/appointments/appointment_screen.dart';
import 'package:elderly_care_app/screens/medication/medication_dashboard_ui.dart';
import 'package:elderly_care_app/screens/medication/medication_screen.dart';
import 'package:elderly_care_app/services/api_client.dart';
import 'package:elderly_care_app/services/medication_schedule_service.dart';
import 'package:elderly_care_app/theme/care_senior_theme.dart';
import 'package:elderly_care_app/utils/medication_status_display.dart';
import 'package:elderly_care_app/widgets/care_senior_ui.dart';
import 'package:elderly_care_app/widgets/draggable_assistant_fab.dart';
import 'support/notification_platform_fake.dart';

/// Isolated, date-relative transport. It never connects to a real API.
class MedicationUiAdapter implements HttpClientAdapter {
  final requests = <RequestOptions>[];
  bool empty = false, offline = false;
  int? deniedStatus;
  Completer<void>? loadGate, confirmGate;
  final changed = <int, String>{};
  List<Map<String, dynamic>>? custom;

  static const longName =
      'THUỐC KIỂM THỬ VỚI TÊN RẤT DÀI ĐỂ KIỂM TRA KHẢ NĂNG XUỐNG DÒNG';
  static const longInstructions =
      'HƯỚNG DẪN KIỂM THỬ TỪ API: nhiều dòng thông tin sử dụng được giữ đầy đủ, '
      'không rút gọn hoặc thay thế bằng hướng dẫn minh họa của thiết kế.';

  List<Map<String, dynamic>> doses(DateTime day) =>
      custom ??
      [
        for (var index = 1; index <= 4; index++)
          {
            'id': index,
            'tenThuoc': index == 2
                ? longName
                : 'THUỐC KIỂM THỬ $index / ${day.day}',
            'lieuDung': index == 2
                ? 'LIỀU KIỂM THỬ NHIỀU DÒNG TỪ API, không phải liều minh họa'
                : 'LIỀU API $index',
            'cachDung': index == 2 ? longInstructions : null,
            'thoiGianDuKien': DateTime(
              day.year,
              day.month,
              day.day,
              [7, 11, 15, 20][index - 1],
            ).toIso8601String(),
            'trangThai':
                changed[index] ??
                ['DaUong', 'ChuaDenGio', 'BoLo', 'TuChoi'][index - 1],
          },
      ];

  List<RequestOptions> get confirmations =>
      requests.where((r) => r.method == 'PATCH').toList();
  List<RequestOptions> get dayRequests => requests
      .where(
        (r) =>
            r.path == '/elderly/me/medication-schedule' &&
            r.queryParameters['tuNgay'] == r.queryParameters['denNgay'],
      )
      .toList();

  @override
  void close({bool force = false}) {}

  @override
  Future<ResponseBody> fetch(
    RequestOptions options,
    Stream<Uint8List>? stream,
    Future<void>? cancel,
  ) async {
    requests.add(options);
    if (options.method == 'PATCH') {
      await confirmGate?.future;
      if (deniedStatus != null) {
        return _response({
          'message': 'Bạn không có quyền xác nhận cữ thuốc này.',
        }, deniedStatus!);
      }
      final id = int.parse(options.path.split('/')[2]);
      final status = (options.data as Map)['trangThai'] as String;
      changed[id] = status;
      return _response({
        'data': doses(DateTime.now()).firstWhere((dose) => dose['id'] == id),
      }, 200);
    }
    await loadGate?.future;
    if (offline) {
      throw DioException(
        requestOptions: options,
        type: DioExceptionType.connectionError,
      );
    }
    if (deniedStatus != null) {
      return _response({
        'message': 'Bạn không có quyền xem lịch thuốc này.',
      }, deniedStatus!);
    }
    if (options.path == '/elderly/me/medication-schedule') {
      final day = DateTime.parse(options.queryParameters['tuNgay'] as String);
      return _response({'data': empty ? [] : doses(day)}, 200);
    }
    return _response({'data': []}, 200);
  }

  ResponseBody _response(Object data, int status) => ResponseBody.fromString(
    jsonEncode(data),
    status,
    headers: {
      Headers.contentTypeHeader: [Headers.jsonContentType],
    },
  );
}

class MedicationUiFixture {
  MedicationUiFixture(this.adapter);
  final MedicationUiAdapter adapter;
  final notifications = NotificationPlatformFake();
  late HttpClientAdapter original;
  late List<Interceptor> interceptors;

  Future<void> install() async {
    SharedPreferences.setMockInitialValues({'assistant_fab_hint_seen': true});
    FlutterSecureStorage.setMockInitialValues({});
    notifications.install();
    await ApiClient.clearSession();
    MedicationScheduleService.instance.clearCache();
    final dio = ApiClient.instance.dio;
    original = dio.httpClientAdapter;
    interceptors = List<Interceptor>.from(dio.interceptors);
    dio.interceptors.clear(keepImplyContentTypeInterceptor: false);
    dio.httpClientAdapter = adapter;
  }

  void dispose() {
    MedicationScheduleService.instance.clearCache();
    final dio = ApiClient.instance.dio;
    dio.httpClientAdapter = original;
    dio.interceptors.clear(keepImplyContentTypeInterceptor: false);
    dio.interceptors.addAll(interceptors);
  }
}

Widget medicationUiApp({double scale = 1, bool withNavigation = false}) =>
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
                child: const MedicationScreen(),
              ),
              bottomNavigationBar: AppBottomNavigation(
                selectedIndex: 1,
                onSelected: (_) {},
              ),
            )
          : const MedicationScreen(),
    );

Future<void> settleMedicationUi(WidgetTester tester) async {
  for (var i = 0; i < 3; i++) {
    await tester.pump(const Duration(milliseconds: 100));
    await tester.runAsync(
      () => Future<void>.delayed(const Duration(milliseconds: 30)),
    );
  }
  await tester.pumpAndSettle();
}

Future<void> revealMedication(WidgetTester tester, Finder finder) async {
  await tester.scrollUntilVisible(
    finder,
    220,
    maxScrolls: 90,
    scrollable: find
        .descendant(
          of: find.byKey(const ValueKey('medication-list')),
          matching: find.byType(Scrollable),
        )
        .first,
  );
  await tester.pumpAndSettle();
}

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();
  late MedicationUiAdapter adapter;
  late MedicationUiFixture fixture;

  setUp(() async {
    adapter = MedicationUiAdapter();
    fixture = MedicationUiFixture(adapter);
    await fixture.install();
  });
  tearDown(() => fixture.dispose());

  testWidgets(
    'Medication uses real dates, API values/statuses and per-dose progress',
    (tester) async {
      await tester.pumpWidget(medicationUiApp());
      await settleMedicationUi(tester);
      final now = DateTime.now();
      expect(find.text('Tháng ${now.month}, ${now.year}'), findsOneWidget);
      expect(find.text('Đã uống 1/4 liều'), findsOneWidget);
      expect(find.byType(MedicationDoseCard), findsNWidgets(4));
      final cards = tester
          .widgetList<MedicationDoseCard>(find.byType(MedicationDoseCard))
          .toList();
      expect(cards.map((c) => c.statusLabel), [
        'Đã uống',
        medicationStatusLabel(
          'ChuaDenGio',
          adapter.doses(DateTime.now())[1]['thoiGianDuKien'],
        ),
        'Bỏ lỡ',
        'Từ chối',
      ]);
      expect(cards[1].name, MedicationUiAdapter.longName);
      expect(cards[1].instructions, MedicationUiAdapter.longInstructions);
      expect(cards.where((c) => c.onConfirm != null), hasLength(2));
      expect(
        cards[2].onConfirm,
        isNotNull,
      ); // Today's missed dose can be recorded.
      expect(find.textContaining('trước 10 phút'), findsNothing);
      expect(adapter.requests.every((r) => r.method == 'GET'), true);
      expect(tester.takeException(), isNull);
    },
  );

  testWidgets(
    'Selecting another date fetches its API range and disables confirmation',
    (tester) async {
      await tester.pumpWidget(medicationUiApp());
      await settleMedicationUi(tester);
      await tester.ensureVisible(
        find.byKey(const ValueKey('medication-day-4')),
      );
      await tester.tap(find.byKey(const ValueKey('medication-day-4')));
      await settleMedicationUi(tester);
      final now = DateTime.now();
      final tomorrow = DateTime(now.year, now.month, now.day + 1);
      String date(DateTime d) =>
          '${d.year}-${d.month.toString().padLeft(2, '0')}-${d.day.toString().padLeft(2, '0')}';
      expect(
        adapter.dayRequests.last.queryParameters['tuNgay'],
        date(tomorrow),
      );
      expect(
        adapter.dayRequests.last.queryParameters['denNgay'],
        date(tomorrow),
      );
      expect(
        tester
            .widgetList<MedicationDoseCard>(find.byType(MedicationDoseCard))
            .first
            .name,
        'THUỐC KIỂM THỬ 1 / ${tomorrow.day}',
      );
      expect(
        tester
            .widgetList<MedicationDoseCard>(find.byType(MedicationDoseCard))
            .every((c) => c.onConfirm == null),
        true,
      );
      expect(
        find.text('Ngày khác chỉ dùng để xem lịch thuốc.'),
        findsOneWidget,
      );
      expect(adapter.confirmations, isEmpty);
    },
  );

  testWidgets(
    'Loading, empty and retry after connection failure are preserved',
    (tester) async {
      adapter.loadGate = Completer<void>();
      await tester.pumpWidget(medicationUiApp());
      await tester.pump();
      expect(find.byType(CircularProgressIndicator), findsOneWidget);
      expect(find.byType(MedicationDoseCard), findsNothing);
      adapter.offline = true;
      adapter.loadGate!.complete();
      await settleMedicationUi(tester);
      expect(find.text('Thử lại'), findsOneWidget);
      expect(find.byType(MedicationDoseCard), findsNothing);
      adapter.offline = false;
      adapter.empty = true;
      await tester.tap(find.text('Thử lại'));
      await settleMedicationUi(tester);
      expect(find.text('Ngày này chưa có lịch uống thuốc'), findsOneWidget);
      expect(find.text('Đã uống 0/0 liều'), findsOneWidget);
      expect(adapter.confirmations, isEmpty);
      expect(tester.takeException(), isNull);
    },
  );

  testWidgets(
    'Forbidden API response displays its error without confirmation actions',
    (tester) async {
      adapter.deniedStatus = 403;
      await tester.pumpWidget(medicationUiApp());
      await settleMedicationUi(tester);
      expect(
        find.text('Bạn không có quyền xem lịch thuốc này.'),
        findsOneWidget,
      );
      expect(find.text('Xác nhận đã uống'), findsNothing);
      expect(adapter.confirmations, isEmpty);
    },
  );

  for (final status in ['DaUong', 'BoLo']) {
    testWidgets(
      'Existing status sheet confirms $status exactly once and updates API result',
      (tester) async {
        await tester.pumpWidget(medicationUiApp());
        await settleMedicationUi(tester);
        await revealMedication(tester, find.text('Xác nhận đã uống'));
        await tester.tap(find.text('Xác nhận đã uống'));
        await tester.pumpAndSettle();
        expect(find.byType(MedicationStatusSheet), findsOneWidget);
        expect(adapter.confirmations, isEmpty);
        await tester.tap(
          find.widgetWithText(
            status == 'DaUong' ? FilledButton : OutlinedButton,
            status == 'DaUong' ? 'Đã uống' : 'Bỏ lỡ',
          ),
        );
        await settleMedicationUi(tester);
        expect(adapter.confirmations, hasLength(1));
        expect(
          adapter.confirmations.single.path,
          '/medication-schedule/2/confirm',
        );
        expect(adapter.confirmations.single.data, {'trangThai': status});
        expect(
          tester
              .widgetList<MedicationDoseCard>(find.byType(MedicationDoseCard))
              .firstWhere((c) => c.name == MedicationUiAdapter.longName)
              .status,
          status,
        );
        expect(fixture.notifications.cancelled, contains(100002));
        expect(
          find.text(
            status == 'DaUong'
                ? 'Đã xác nhận uống thuốc.'
                : 'Đã ghi nhận bỏ lỡ liều thuốc.',
          ),
          findsOneWidget,
        );
        expect(tester.takeException(), isNull);
      },
    );
  }

  testWidgets('Cancel status sheet never sends a confirmation', (tester) async {
    await tester.pumpWidget(medicationUiApp());
    await settleMedicationUi(tester);
    await revealMedication(tester, find.text('Xác nhận đã uống'));
    await tester.tap(find.text('Xác nhận đã uống'));
    await tester.pumpAndSettle();
    Navigator.of(tester.element(find.byType(MedicationStatusSheet))).pop();
    await tester.pumpAndSettle();
    expect(adapter.confirmations, isEmpty);
  });

  testWidgets(
    'In-flight confirmation prevents duplicate action; backend error retains dose',
    (tester) async {
      await tester.pumpWidget(medicationUiApp());
      await settleMedicationUi(tester);
      await revealMedication(tester, find.text('Xác nhận đã uống'));
      await tester.tap(find.text('Xác nhận đã uống'));
      await tester.pumpAndSettle();
      adapter.confirmGate = Completer<void>();
      adapter.deniedStatus = 403;
      await tester.tap(find.widgetWithText(FilledButton, 'Đã uống'));
      await tester.pump();
      await tester.pump(const Duration(seconds: 1));
      final updating = tester
          .widgetList<MedicationDoseCard>(find.byType(MedicationDoseCard))
          .firstWhere((c) => c.updating);
      expect(updating.onConfirm, isNull);
      expect(adapter.confirmations, hasLength(1));
      adapter.confirmGate!.complete();
      await settleMedicationUi(tester);
      expect(
        find.text('Bạn không có quyền xác nhận cữ thuốc này.'),
        findsOneWidget,
      );
      final card = tester
          .widgetList<MedicationDoseCard>(find.byType(MedicationDoseCard))
          .firstWhere((c) => c.name == MedicationUiAdapter.longName);
      expect(card.status, 'ChuaDenGio');
      expect(card.onConfirm, isNotNull);
      expect(card.updating, false);
    },
  );

  testWidgets(
    'Time groups retain original 11/14/18 boundaries; no local overdue inference',
    (tester) async {
      final now = DateTime.now();
      final times = [(10, 59), (11, 0), (13, 59), (14, 0), (17, 59), (18, 0)];
      adapter.custom = [
        for (var i = 0; i < times.length; i++)
          {
            'id': 20 + i,
            'tenThuoc': 'BIÊN GIỜ $i',
            'lieuDung': 'LIỀU API',
            'trangThai': 'ChuaDenGio',
            'thoiGianDuKien': DateTime(
              now.year,
              now.month,
              now.day,
              times[i].$1,
              times[i].$2,
            ).toIso8601String(),
          },
      ];
      await tester.pumpWidget(medicationUiApp());
      await settleMedicationUi(tester);
      for (final title in [
        'Buổi Sáng',
        'Buổi Trưa',
        'Buổi Chiều',
        'Buổi Tối',
      ]) {
        expect(find.text(title), findsOneWidget);
      }
      expect(
        tester
            .widgetList<MedicationDoseCard>(find.byType(MedicationDoseCard))
            .every((c) => c.status == 'ChuaDenGio' && c.onConfirm != null),
        true,
      );
      expect(find.text('Đã uống 0/6 liều'), findsOneWidget);
    },
  );

  for (final width in [320.0, 360.0, 390.0, 412.0, 768.0]) {
    for (final scale in [1.0, 1.2, 1.4, 1.6, 1.8]) {
      testWidgets(
        'Medication long cards, sheet and pill fit width=$width scale=$scale',
        (tester) async {
          tester.view.physicalSize = Size(width, 820);
          tester.view.devicePixelRatio = 1;
          addTearDown(tester.view.resetPhysicalSize);
          addTearDown(tester.view.resetDevicePixelRatio);
          await tester.pumpWidget(
            medicationUiApp(scale: scale, withNavigation: true),
          );
          await settleMedicationUi(tester);
          expect(tester.takeException(), isNull);
          final pill = tester.getRect(
            find.byKey(const ValueKey('floating-pill-navigation')),
          );
          final body = tester.getRect(find.byType(MedicationScreen));
          expect(body.bottom, lessThanOrEqualTo(pill.top));
          await revealMedication(tester, find.text('Xác nhận đã uống'));
          final button = tester.getRect(
            find.widgetWithText(FilledButton, 'Xác nhận đã uống'),
          );
          expect(button.bottom, lessThanOrEqualTo(pill.top));
          expect(tester.takeException(), isNull);
          await tester.tap(find.text('Xác nhận đã uống'));
          await tester.pumpAndSettle();
          expect(find.byType(MedicationStatusSheet), findsOneWidget);
          await tester.ensureVisible(
            find.widgetWithText(OutlinedButton, 'Bỏ lỡ'),
          );
          await tester.pumpAndSettle();
          expect(tester.takeException(), isNull);
          Navigator.of(
            tester.element(find.byType(MedicationStatusSheet)),
          ).pop();
          await tester.pumpAndSettle();
          await revealMedication(tester, find.text('Xem lịch khám'));
          expect(tester.takeException(), isNull);
          expect(adapter.confirmations, isEmpty);
        },
      );
    }
  }

  testWidgets(
    'Long schedule scrolls to the last API dose without hidden actions',
    (tester) async {
      final now = DateTime.now();
      adapter.custom = [
        for (var i = 0; i < 40; i++)
          {
            'id': 500 + i,
            'tenThuoc': 'DANH SÁCH KIỂM THỬ $i',
            'lieuDung': 'LIỀU API $i',
            'cachDung': MedicationUiAdapter.longInstructions,
            'trangThai': 'ChuaDenGio',
            'thoiGianDuKien': DateTime(
              now.year,
              now.month,
              now.day,
              8,
            ).toIso8601String(),
          },
      ];
      await tester.pumpWidget(medicationUiApp(withNavigation: true));
      await settleMedicationUi(tester);
      expect(find.text('Đã uống 0/40 liều'), findsOneWidget);
      await revealMedication(tester, find.text('DANH SÁCH KIỂM THỬ 39'));
      expect(find.text('DANH SÁCH KIỂM THỬ 39').hitTestable(), findsOneWidget);
      expect(tester.takeException(), isNull);
      expect(adapter.confirmations, isEmpty);
    },
  );

  testWidgets(
    'Absent API fields display existing fallbacks, never invented instructions',
    (tester) async {
      adapter.custom = [
        {'id': 901, 'trangThai': 'BoLo'},
      ];
      await tester.pumpWidget(medicationUiApp());
      await settleMedicationUi(tester);
      final card = tester.widget<MedicationDoseCard>(
        find.byType(MedicationDoseCard),
      );
      expect(card.name, 'Không rõ tên thuốc');
      expect(card.dose, 'Không rõ liều dùng');
      expect(card.time, '--:--');
      expect(card.instructions, '');
      expect(card.onConfirm, isNull);
      expect(tester.takeException(), isNull);
    },
  );

  testWidgets(
    'Appointment shortcut still opens the existing appointment screen',
    (tester) async {
      adapter.empty = true;
      await tester.pumpWidget(medicationUiApp());
      await settleMedicationUi(tester);
      await revealMedication(tester, find.text('Xem lịch khám'));
      await tester.tap(find.text('Xem lịch khám'));
      await settleMedicationUi(tester);
      expect(find.byType(AppointmentScreen), findsOneWidget);
      expect(find.byType(BackButton), findsOneWidget);
      expect(adapter.confirmations, isEmpty);
    },
  );
}
