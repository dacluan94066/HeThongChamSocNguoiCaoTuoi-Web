import 'dart:async';
import 'dart:convert';
import 'dart:typed_data';

import 'package:dio/dio.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:elderly_care_app/screens/health/health_detail_screen.dart';
import 'package:elderly_care_app/screens/health/health_dashboard_ui.dart';
import 'package:elderly_care_app/services/health_metric_service.dart';
import 'package:elderly_care_app/theme/care_senior_theme.dart';
import 'home_dashboard_ui_test.dart'
    show HomeUiAdapter, HomeUiFixture, settleHomeUi;

/// Transport-only fixtures: no live backend, user storage or database writes.
class HealthUiAdapter extends HomeUiAdapter {
  HealthUiAdapter() {
    final now = DateTime.now();
    Map<String, dynamic> reading(
      String name,
      num value,
      int days, {
      num? secondary,
      bool abnormal = false,
      String unit = 'mmHg',
    }) => {
      'tenChiSo': name,
      'giaTri': value,
      'giaTriPhu': secondary,
      'laBatThuong': abnormal,
      'donVi': unit,
      'thoiGianDo': now
          .subtract(Duration(days: days, hours: 1))
          .toIso8601String(),
    };
    readings = [
      // Flags deliberately do not follow a demo threshold. UI must trust API.
      reading('Huyết áp', 137, 0, secondary: 83, abnormal: true),
      reading('Đường huyết', 172, 0, unit: 'mg/dL', abnormal: false),
      reading('Huyết áp', 121, 1, secondary: 73),
      reading('Huyết áp', 149, 4, secondary: 89),
      reading('Huyết áp', 240, 9, secondary: 150, abnormal: true),
    ];
  }
  List<Map<String, dynamic>> types = [
    {
      'id': 1,
      'tenChiSo': 'Huyết áp',
      'donVi': 'mmHg',
      'giaTriMin': 91,
      'giaTriMax': 149,
      'giaTriMin2': 52,
      'giaTriMax2': 94,
    },
    {
      'id': 2,
      'tenChiSo': 'Nhịp tim',
      'donVi': 'nhịp/phút',
      'giaTriMin': 61,
      'giaTriMax': 101,
    },
    {
      'id': 3,
      'tenChiSo': 'Đường huyết',
      'donVi': 'mg/dL',
      'giaTriMin': 73,
      'giaTriMax': 131,
    },
    {
      'id': 4,
      'tenChiSo': 'SpO2',
      'donVi': '%',
      'giaTriMin': 95,
      'giaTriMax': 100,
    },
    {
      'id': 5,
      'tenChiSo': 'Nhiệt độ',
      'donVi': '°C',
      'giaTriMin': 36,
      'giaTriMax': 37.5,
    },
    {'id': 6, 'tenChiSo': 'Cân nặng', 'donVi': 'kg'},
  ];
  late List<Map<String, dynamic>> readings;
  bool failLoad = false;
  int? rejectType;
  bool abnormalResult = false;
  Completer<void>? heldSave;
  List<RequestOptions> get writes =>
      requests.where((r) => r.method == 'POST').toList();

  @override
  Future<ResponseBody> fetch(
    RequestOptions options,
    Stream<Uint8List>? stream,
    Future<void>? cancel,
  ) async {
    requests.add(options);
    ResponseBody response(Object data, [int status = 200]) =>
        ResponseBody.fromString(
          jsonEncode(data),
          status,
          headers: {
            Headers.contentTypeHeader: [Headers.jsonContentType],
          },
        );
    if (options.method == 'POST') {
      if (heldSave != null) await heldSave!.future;
      final body = Map<String, dynamic>.from(options.data as Map);
      if (body['loaiChiSoId'] == rejectType) {
        return response({
          'message': 'LỖI KIỂM THỬ TỪ BACKEND: giá trị không hợp lệ.',
        }, 422);
      }
      final type = types.firstWhere((row) => row['id'] == body['loaiChiSoId']);
      final saved = <String, dynamic>{
        ...body,
        'id': 900 + writes.length,
        'tenChiSo': type['tenChiSo'],
        'donVi': type['donVi'],
        'laBatThuong': abnormalResult,
        'thoiGianDo': DateTime.now().toIso8601String(),
      };
      readings.insert(0, saved);
      return response({'data': saved});
    }
    if (failLoad) return response({'message': 'LỖI TẢI DỮ LIỆU KIỂM THỬ'}, 503);
    return response({
      'data': options.path == '/health-metric-types' ? types : readings,
    });
  }
}

Widget healthUiApp({double scale = 1}) => MaterialApp(
  theme: CareSeniorTheme.data,
  builder: (context, child) => MediaQuery(
    data: MediaQuery.of(context).copyWith(textScaler: TextScaler.linear(scale)),
    child: child!,
  ),
  home: const HealthDetailScreen(),
);

Future<void> chooseHealthType(WidgetTester tester, String name) async {
  final chip = find.byKey(ValueKey('health-type-$name'));
  await tester.ensureVisible(chip);
  await tester.pumpAndSettle();
  await tester.tap(chip);
  await tester.pumpAndSettle();
}

Future<void> openHealthSheet(WidgetTester tester) async {
  await tester.tap(find.byKey(const ValueKey('health-add-measurement')));
  await tester.pumpAndSettle();
}

Future<void> enterHealthPressure(
  WidgetTester tester, {
  String systolic = '139',
  String diastolic = '81',
  String pulse = '77',
}) async {
  for (final (key, text) in [
    ('health-field-Tâm thu', systolic),
    ('health-field-Tâm trương', diastolic),
    ('health-field-Nhịp tim (nhịp/phút)', pulse),
  ]) {
    final field = find.byKey(ValueKey(key));
    await tester.ensureVisible(field);
    await tester.enterText(field, text);
    await tester.pump();
  }
}

Future<void> tapHealthSave(WidgetTester tester) async {
  final button = find.byKey(const ValueKey('health-save-measurement'));
  await tester.ensureVisible(button);
  await tester.pumpAndSettle();
  await tester.tap(button);
  await settleHomeUi(tester);
}

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();
  late HealthUiAdapter adapter;
  late HomeUiFixture fixture;
  setUp(() async {
    adapter = HealthUiAdapter();
    fixture = HomeUiFixture(adapter);
    await fixture.install();
    HealthMetricService.instance.clearCache();
  });
  tearDown(() {
    HealthMetricService.instance.clearCache();
    fixture.dispose();
  });

  testWidgets('Health uses API types, latest values, flags, units and ranges', (
    tester,
  ) async {
    await tester.pumpWidget(healthUiApp());
    await settleHomeUi(tester);
    expect(find.text('Theo dõi sức khỏe'), findsOneWidget);
    expect(find.byType(ChoiceChip), findsNWidgets(6));
    final latest = tester.widget<HealthLatestCard>(
      find.byType(HealthLatestCard),
    );
    expect(latest.latest!['giaTri'], 137);
    expect(latest.latest!['laBatThuong'], true);
    expect(latest.unit, 'mmHg');
    expect(latest.range, 'Ngưỡng: 91–149/52–94 mmHg');
    expect(find.textContaining('BMI'), findsNothing);
    expect(adapter.writes, isEmpty);
    expect(tester.takeException(), isNull);
  });

  testWidgets(
    'Trend preserves 7-day filtering and computes descriptive stats only',
    (tester) async {
      await tester.pumpWidget(healthUiApp());
      await settleHomeUi(tester);
      final trend = tester.widget<HealthTrendCard>(
        find.byType(HealthTrendCard),
      );
      expect(trend.rows.map((row) => row['giaTri']).toList(), [149, 121, 137]);
      final scrollable = find
          .descendant(
            of: find.byKey(const ValueKey('health-dashboard-scroll')),
            matching: find.byType(Scrollable),
          )
          .first;
      await tester.scrollUntilVisible(
        find.byKey(const ValueKey('health-stat-2')).hitTestable(),
        300,
        scrollable: scrollable,
      );
      expect(
        tester.widget<Text>(find.byKey(const ValueKey('health-stat-0'))).data,
        '121',
      );
      expect(
        tester.widget<Text>(find.byKey(const ValueKey('health-stat-1'))).data,
        '135.7',
      );
      expect(
        tester.widget<Text>(find.byKey(const ValueKey('health-stat-2'))).data,
        '149',
      );
      expect(find.byKey(const ValueKey('health-trend-chart')), findsOneWidget);
      expect(
        tester
            .widgetList<HealthHistoryRow>(find.byType(HealthHistoryRow))
            .length,
        4,
      );
      expect(adapter.writes, isEmpty);
      expect(tester.takeException(), isNull);
    },
  );

  testWidgets(
    'Each API type selects without requests and opens its existing form',
    (tester) async {
      await tester.pumpWidget(healthUiApp());
      await settleHomeUi(tester);
      final count = adapter.requests.length;
      for (final type in adapter.types) {
        await chooseHealthType(tester, type['tenChiSo'] as String);
        expect(
          tester.widget<HealthLatestCard>(find.byType(HealthLatestCard)).name,
          type['tenChiSo'],
        );
        await openHealthSheet(tester);
        expect(
          find.byType(TextField),
          findsNWidgets(type['tenChiSo'] == 'Huyết áp' ? 3 : 1),
        );
        await tester.tap(find.byKey(const ValueKey('health-close-sheet')));
        await tester.pumpAndSettle();
        expect(find.byType(HealthMeasurementSheet), findsNothing);
      }
      expect(adapter.requests.length, count);
      expect(tester.takeException(), isNull);
    },
  );

  testWidgets(
    'Closing and system back preserve controller text and do not save',
    (tester) async {
      await tester.pumpWidget(healthUiApp());
      await settleHomeUi(tester);
      await openHealthSheet(tester);
      await tester.enterText(
        find.byKey(const ValueKey('health-field-Tâm thu')),
        '139',
      );
      await tester.tap(find.byKey(const ValueKey('health-close-sheet')));
      await tester.pumpAndSettle();
      await openHealthSheet(tester);
      expect(
        tester
            .widget<TextField>(
              find.byKey(const ValueKey('health-field-Tâm thu')),
            )
            .controller!
            .text,
        '139',
      );
      await tester.binding.handlePopRoute();
      await tester.pumpAndSettle();
      expect(find.byType(HealthMeasurementSheet), findsNothing);
      expect(find.byType(HealthDetailScreen), findsOneWidget);
      expect(adapter.writes, isEmpty);
    },
  );

  testWidgets(
    'Pressure save preserves two separate POSTs and reloads real service data',
    (tester) async {
      await tester.pumpWidget(healthUiApp());
      await settleHomeUi(tester);
      await openHealthSheet(tester);
      await enterHealthPressure(tester);
      await tapHealthSave(tester);
      expect(
        adapter.writes.map((r) => r.path),
        everyElement('/elderly/me/health-metrics'),
      );
      expect(adapter.writes.map((r) => r.data).toList(), [
        {'loaiChiSoId': 1, 'giaTri': 139.0, 'giaTriPhu': 81.0},
        {'loaiChiSoId': 2, 'giaTri': 77.0},
      ]);
      expect(find.text('Đã lưu chỉ số sức khỏe.'), findsOneWidget);
      expect(
        tester
            .widget<HealthLatestCard>(find.byType(HealthLatestCard))
            .latest!['giaTri'],
        139,
      );
      expect(tester.takeException(), isNull);
    },
  );

  testWidgets(
    'Existing pressure validation rejects missing/invalid input before POST',
    (tester) async {
      await tester.pumpWidget(healthUiApp());
      await settleHomeUi(tester);
      await openHealthSheet(tester);
      await tapHealthSave(tester);
      expect(adapter.writes, isEmpty);
      expect(
        find.text('Nhập huyết áp và nhịp tim hợp lệ trước khi lưu.'),
        findsOneWidget,
      );
      expect(
        find
            .text('Nhập huyết áp và nhịp tim hợp lệ trước khi lưu.')
            .hitTestable(),
        findsOneWidget,
      );
      expect(tester.takeException(), isNull);
    },
  );

  testWidgets('Decimal comma retains existing single POST payload', (
    tester,
  ) async {
    await tester.pumpWidget(healthUiApp());
    await settleHomeUi(tester);
    await chooseHealthType(tester, 'Nhiệt độ');
    await openHealthSheet(tester);
    await tester.enterText(
      find.byKey(const ValueKey('health-value-field')),
      '36,7',
    );
    await tapHealthSave(tester);
    expect(adapter.writes.single.data, {'loaiChiSoId': 5, 'giaTri': 36.7});
    expect(tester.takeException(), isNull);
  });

  testWidgets(
    '422 message remains visible above sheet and leaves entered value intact',
    (tester) async {
      adapter.rejectType = 4;
      await tester.pumpWidget(healthUiApp());
      await settleHomeUi(tester);
      await chooseHealthType(tester, 'SpO2');
      await openHealthSheet(tester);
      await tester.enterText(
        find.byKey(const ValueKey('health-value-field')),
        '101',
      );
      await tapHealthSave(tester);
      expect(
        find
            .text('LỖI KIỂM THỬ TỪ BACKEND: giá trị không hợp lệ.')
            .hitTestable(),
        findsOneWidget,
      );
      expect(
        tester
            .widget<TextField>(find.byKey(const ValueKey('health-value-field')))
            .controller!
            .text,
        '101',
      );
      expect(adapter.writes.single.data, {'loaiChiSoId': 4, 'giaTri': 101.0});
      expect(tester.takeException(), isNull);
    },
  );

  testWidgets(
    'Abnormal POST result still shows existing caregiver warning dialog',
    (tester) async {
      adapter.abnormalResult = true;
      await tester.pumpWidget(healthUiApp());
      await settleHomeUi(tester);
      await chooseHealthType(tester, 'Đường huyết');
      await openHealthSheet(tester);
      await tester.enterText(
        find.byKey(const ValueKey('health-value-field')),
        '173',
      );
      await tapHealthSave(tester);
      expect(find.text('Chỉ số bất thường'), findsOneWidget);
      expect(
        find.text(
          'Chỉ số vừa nhập vượt ngưỡng theo dõi. Người chăm sóc sẽ được thông báo.',
        ),
        findsOneWidget,
      );
      await tester.tap(find.text('Đã hiểu'));
      await tester.pumpAndSettle();
      expect(tester.takeException(), isNull);
    },
  );

  testWidgets(
    'Busy sheet disables duplicate submissions without altering save callback',
    (tester) async {
      adapter.heldSave = Completer<void>();
      await tester.pumpWidget(healthUiApp());
      await settleHomeUi(tester);
      await chooseHealthType(tester, 'Cân nặng');
      await openHealthSheet(tester);
      await tester.enterText(
        find.byKey(const ValueKey('health-value-field')),
        '63.5',
      );
      await tapHealthSave(tester);
      expect(adapter.writes.length, 1);
      expect(
        tester
            .widget<FilledButton>(
              find.byKey(const ValueKey('health-save-measurement')),
            )
            .onPressed,
        isNull,
      );
      adapter.heldSave!.complete();
      await settleHomeUi(tester);
      expect(adapter.writes.length, 1);
      expect(tester.takeException(), isNull);
    },
  );

  testWidgets('Empty data uses no demo samples or zero-valued statistics', (
    tester,
  ) async {
    adapter.readings.clear();
    adapter.types = [adapter.types.last];
    await tester.pumpWidget(healthUiApp());
    await settleHomeUi(tester);
    expect(find.byType(ChoiceChip), findsOneWidget);
    expect(
      tester.widget<HealthLatestCard>(find.byType(HealthLatestCard)).latest,
      isNull,
    );
    expect(
      tester.widget<HealthTrendCard>(find.byType(HealthTrendCard)).rows,
      isEmpty,
    );
    expect(find.text('Chưa có dữ liệu'), findsWidgets);
    expect(find.textContaining('BMI'), findsNothing);
    expect(adapter.writes, isEmpty);
    expect(tester.takeException(), isNull);
  });

  testWidgets(
    'Load error retains backend message and existing refresh retries',
    (tester) async {
      adapter.failLoad = true;
      await tester.pumpWidget(healthUiApp());
      await settleHomeUi(tester);
      expect(find.text('LỖI TẢI DỮ LIỆU KIỂM THỬ'), findsOneWidget);
      adapter.failLoad = false;
      unawaited(
        tester
            .widget<RefreshIndicator>(find.byType(RefreshIndicator))
            .onRefresh(),
      );
      await settleHomeUi(tester);
      expect(find.byType(ChoiceChip), findsNWidgets(6));
      expect(tester.takeException(), isNull);
    },
  );

  testWidgets(
    'Second pressure request failure preserves partial result and backend error',
    (tester) async {
      adapter.rejectType = 2;
      await tester.pumpWidget(healthUiApp());
      await settleHomeUi(tester);
      await openHealthSheet(tester);
      await enterHealthPressure(tester);
      await tapHealthSave(tester);
      expect(adapter.writes.length, 2);
      expect(adapter.readings.first['giaTri'], 139);
      expect(
        find
            .text('LỖI KIỂM THỬ TỪ BACKEND: giá trị không hợp lệ.')
            .hitTestable(),
        findsOneWidget,
      );
      expect(
        tester
            .widget<HealthLatestCard>(find.byType(HealthLatestCard))
            .latest!['giaTri'],
        139,
      );
      expect(tester.takeException(), isNull);
    },
  );

  testWidgets(
    'A single sample plots without synthetic extra points or invalid stats',
    (tester) async {
      adapter.readings = [adapter.readings.first];
      await tester.pumpWidget(healthUiApp());
      await settleHomeUi(tester);
      final chart = tester.widget<HealthTrendCard>(
        find.byType(HealthTrendCard),
      );
      expect(chart.rows.length, 1);
      await tester.scrollUntilVisible(
        find.byKey(const ValueKey('health-stat-2')).hitTestable(),
        250,
        scrollable: find
            .descendant(
              of: find.byKey(const ValueKey('health-dashboard-scroll')),
              matching: find.byType(Scrollable),
            )
            .first,
      );
      for (var index = 0; index < 3; index++) {
        expect(
          tester.widget<Text>(find.byKey(ValueKey('health-stat-$index'))).data,
          '137',
        );
      }
      expect(tester.takeException(), isNull);
    },
  );

  for (final width in [320.0, 360.0, 390.0, 412.0, 768.0]) {
    for (final scale in [1.0, 1.2, 1.4, 1.6, 1.8]) {
      testWidgets(
        'Health and sheet scroll without overflow width=$width scale=$scale including keyboard',
        (tester) async {
          tester.view.physicalSize = Size(width, 820);
          tester.view.devicePixelRatio = 1;
          addTearDown(tester.view.resetPhysicalSize);
          addTearDown(tester.view.resetDevicePixelRatio);
          addTearDown(tester.view.resetViewInsets);
          await tester.pumpWidget(healthUiApp(scale: scale));
          await settleHomeUi(tester);
          expect(tester.takeException(), isNull);
          final scrollable = find
              .descendant(
                of: find.byKey(const ValueKey('health-dashboard-scroll')),
                matching: find.byType(Scrollable),
              )
              .first;
          await tester.scrollUntilVisible(
            find.text('Lịch sử đo gần đây').hitTestable(),
            300,
            maxScrolls: 80,
            scrollable: scrollable,
          );
          expect(tester.takeException(), isNull);
          await openHealthSheet(tester);
          await enterHealthPressure(tester);
          tester.view.viewInsets = const FakeViewPadding(bottom: 300);
          await tester.pumpAndSettle();
          await tester.ensureVisible(
            find.byKey(const ValueKey('health-save-measurement')),
          );
          await tester.pumpAndSettle();
          expect(tester.takeException(), isNull);
          await tester.ensureVisible(
            find.byKey(const ValueKey('health-close-sheet')),
          );
          await tester.pumpAndSettle();
          await tester.tap(find.byKey(const ValueKey('health-close-sheet')));
          await tester.pumpAndSettle();
          expect(find.byType(HealthMeasurementSheet), findsNothing);
          expect(adapter.writes, isEmpty);
          expect(tester.takeException(), isNull);
        },
      );
    }
  }
}
