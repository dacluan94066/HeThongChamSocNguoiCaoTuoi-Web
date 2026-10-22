import 'dart:convert';
import 'dart:typed_data';
import 'package:dio/dio.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:elderly_care_app/main.dart' show ElderlyCareApp;
import 'package:elderly_care_app/screens/home/elderly_home_screen.dart';
import '../home_dashboard_ui_test.dart' show HomeUiAdapter;

/// All navigation requests terminate here, never at a real API or AI service.
class StitchNavigationAdapter extends HomeUiAdapter {
  int appointmentRevision = 0;
  @override
  Future<ResponseBody> fetch(
    RequestOptions options,
    Stream<Uint8List>? stream,
    Future<void>? cancel,
  ) async {
    Object? data;
    if (options.method == 'GET') {
      final now = DateTime.now();
      if (options.path == '/elderly/me/medication-schedule') {
        final day =
            DateTime.tryParse(
              options.queryParameters['tuNgay']?.toString() ?? '',
            ) ??
            now;
        data = [
          for (var i = 0; i < 2; i++)
            {
              'id': 201 + i,
              'tenThuoc': 'THUỐC FIXTURE ${day.day} / $i',
              'lieuDung': 'LIỀU FIXTURE',
              'trangThai': i == 0 ? 'DaUong' : 'ChuaDenGio',
              'thoiGianDuKien': DateTime(
                day.year,
                day.month,
                day.day,
                9 + i,
              ).toIso8601String(),
            },
        ];
      } else if (options.path.startsWith('/elderly/me/appointments')) {
        data = [
          for (var i = 0; i < 3; i++)
            {
              'id': 301 + i,
              'trangThai': ['ChuaDen', 'DaKham', 'Huy'][i],
              'thoiGianKham': now
                  .add(Duration(days: i == 1 ? -2 : i + 2))
                  .toIso8601String(),
              'tenBenhVien': 'ĐỊA ĐIỂM FIXTURE $i V$appointmentRevision',
              'lyDoKham': 'LÝ DO FIXTURE $i',
              'ketQuaKham': i == 1 ? 'KẾT QUẢ FIXTURE' : null,
            },
        ];
      } else if (options.path == '/notifications/me') {
        data = [
          for (var i = 0; i < 2; i++)
            {
              'id': 801 + i,
              'tieuDe': 'THÔNG BÁO FIXTURE $i',
              'noiDung': 'Nội dung kiểm thử điều hướng',
              'daDoc': true,
              'loaiThongBao': i == 0 ? 'NhacThuoc' : 'NhacLichKham',
              'ngayTao': now.toIso8601String(),
            },
        ];
      } else if (options.path == '/care-assistant/profiles') {
        data = [
          {'id': 1, 'hoTen': name},
        ];
      } else if (options.path == '/care-assistant/status') {
        data = {'aiConfigured': false};
      }
    } else if (options.method == 'POST' &&
        const [
          '/care-assistant/chat',
          '/care-assistant/query',
        ].contains(options.path)) {
      data = {
        'mode': 'functional',
        'profile': {'id': (options.data as Map?)?['elderlyId'] ?? 1},
        'text': 'KẾT QUẢ KIỂM THỬ ĐIỀU HƯỚNG',
        'intent': 'general',
        'actions': ['medications', 'appointments'],
        'rows': [],
      };
    } else {
      throw StateError(
        'Mutation is forbidden in navigation fixture: ${options.method} ${options.path}',
      );
    }
    if (data == null) return super.fetch(options, stream, cancel);
    requests.add(options);
    return ResponseBody.fromString(
      jsonEncode({'data': data}),
      200,
      headers: {
        Headers.contentTypeHeader: [Headers.jsonContentType],
      },
    );
  }
}

/// Use the production named-route builders, not copied or renamed routes.
Widget stitchNavigationApp({double scale = 1}) => Builder(
  builder: (context) {
    final production = const ElderlyCareApp().build(context) as MaterialApp;
    return MaterialApp(
      theme: production.theme,
      routes: production.routes!,
      builder: (context, child) => MediaQuery(
        data: MediaQuery.of(
          context,
        ).copyWith(textScaler: TextScaler.linear(scale)),
        child: child!,
      ),
      home: const HomeScreen(),
    );
  },
);

Future<void> settleStitchNavigation(WidgetTester tester) async {
  for (var i = 0; i < 3; i++) {
    await tester.pump(const Duration(milliseconds: 100));
    await tester.runAsync(
      () => Future<void>.delayed(const Duration(milliseconds: 30)),
    );
  }
  await tester.pumpAndSettle();
}

Future<void> selectStitchNav(WidgetTester tester, int index) async {
  await tester.tap(find.byKey(ValueKey('home-nav-$index')));
  await settleStitchNavigation(tester);
}

Future<void> selectScheduleTab(WidgetTester tester, int index) async {
  await tester.tap(find.byKey(ValueKey('schedule-tab-$index')));
  await settleStitchNavigation(tester);
}
