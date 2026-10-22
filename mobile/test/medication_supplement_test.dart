import 'dart:async';
import 'dart:convert';
import 'dart:typed_data';
import 'package:dio/dio.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:elderly_care_app/screens/medication/medication_dashboard_ui.dart';
import 'package:elderly_care_app/screens/medication/medication_supplement_dialog.dart';
import 'package:elderly_care_app/services/api_client.dart';
import 'package:elderly_care_app/services/mobile_realtime_service.dart';
import 'medication_dashboard_ui_test.dart'
    show
        MedicationUiAdapter,
        MedicationUiFixture,
        medicationUiApp,
        settleMedicationUi,
        revealMedication;

/// Every request uses the isolated transport. No live medication writes.
class SupplementUiAdapter extends MedicationUiAdapter {
  final records = <int, Map<String, dynamic>>{};
  bool timeout = false;

  @override
  List<Map<String, dynamic>> doses(DateTime day) => super.doses(day).map((row) {
    final history = records[row['id']];
    return history == null
        ? row
        : {
            ...row,
            'thoiGianThucTe': history['thoiGianThucTe'],
            'ghiNhanBoSung': history,
          };
  }).toList();

  @override
  Future<ResponseBody> fetch(
    RequestOptions options,
    Stream<Uint8List>? stream,
    Future<void>? cancel,
  ) async {
    if (!options.path.endsWith('/supplement')) {
      return super.fetch(options, stream, cancel);
    }
    requests.add(options);
    await confirmGate?.future;
    if (timeout) {
      throw DioException(
        requestOptions: options,
        type: DioExceptionType.receiveTimeout,
      );
    }
    if (offline) {
      throw DioException(
        requestOptions: options,
        type: DioExceptionType.connectionError,
      );
    }
    if (deniedStatus != null) {
      return ResponseBody.fromString(
        jsonEncode({'message': 'BỔ SUNG BỊ TỪ CHỐI $deniedStatus'}),
        deniedStatus!,
        headers: {
          Headers.contentTypeHeader: [Headers.jsonContentType],
        },
      );
    }
    final body = Map<String, dynamic>.from(options.data as Map);
    final id = int.parse(options.path.split('/')[2]);
    changed[id] = 'DaUong';
    records[id] = {
      'trangThaiCu': 'BoLo',
      'thoiGianThucTe': body['thoiGianThucTe'].toString().substring(0, 19),
      'ngayGhiNhan': DateTime.now().toIso8601String().substring(0, 19),
      'nguoiGhiNhanTen': 'NGƯỜI KIỂM THỬ',
      'lyDo': body['lyDo'],
    };
    final taken = DateTime.parse(
      body['thoiGianThucTe'].toString().substring(0, 19),
    );
    return ResponseBody.fromString(
      jsonEncode({'data': doses(taken).firstWhere((row) => row['id'] == id)}),
      200,
      headers: {
        Headers.contentTypeHeader: [Headers.jsonContentType],
      },
    );
  }
}

Finder supplementButton() => find.descendant(
  of: find.byKey(const ValueKey('medication-dose-3')),
  matching: find.byKey(const ValueKey('supplement-dose')),
);

Future<void> selectYesterday(WidgetTester tester) async {
  final day = find.byKey(const ValueKey('medication-day-2'));
  await tester.ensureVisible(day);
  await tester.tap(day);
  await settleMedicationUi(tester);
}

Future<void> openSupplement(WidgetTester tester) async {
  await revealMedication(tester, supplementButton());
  await tester.tap(supplementButton());
  await tester.pumpAndSettle();
  expect(find.byType(MedicationSupplementDialog), findsOneWidget);
}

Future<void> fillSupplement(WidgetTester tester) async {
  await tester.ensureVisible(find.byKey(const ValueKey('supplement-time')));
  await tester.enterText(
    find.byKey(const ValueKey('supplement-time')),
    '21:45',
  );
  await tester.enterText(
    find.byKey(const ValueKey('supplement-reason')),
    'Đã uống nhưng quên xác nhận',
  );
  FocusManager.instance.primaryFocus?.unfocus();
  await tester.ensureVisible(
    find.byKey(const ValueKey('supplement-acknowledge')),
  );
  await tester.tap(find.byKey(const ValueKey('supplement-acknowledge')));
  await tester.pumpAndSettle();
}

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();
  late SupplementUiAdapter api;
  late MedicationUiFixture fixture;
  setUp(() async {
    api = SupplementUiAdapter();
    fixture = MedicationUiFixture(api);
    await fixture.install();
  });
  tearDown(() => fixture.dispose());

  Future<void> start(WidgetTester tester, {double scale = 1}) async {
    await tester.pumpWidget(
      medicationUiApp(scale: scale, withNavigation: true),
    );
    await settleMedicationUi(tester);
    await selectYesterday(tester);
  }

  MedicationDoseCard card(WidgetTester tester) =>
      tester.widget(find.byKey(const ValueKey('medication-dose-3')));
  Future<void> submit(WidgetTester tester) async {
    await tester.ensureVisible(find.byKey(const ValueKey('supplement-submit')));
    await tester.tap(find.byKey(const ValueKey('supplement-submit')));
    await settleMedicationUi(tester);
  }

  testWidgets(
    'yesterday exposes a separate supplemental action; today confirmation stays unchanged',
    (tester) async {
      await start(tester);
      expect(card(tester).onConfirm, isNull);
      expect(card(tester).onSupplement, isNotNull);
      final refused = tester.widget<MedicationDoseCard>(
        find.byKey(const ValueKey('medication-dose-4')),
      );
      expect(refused.onSupplement, isNull);
      await openSupplement(tester);
      expect(find.textContaining('không hướng dẫn uống thêm'), findsOneWidget);
      expect(api.confirmations, isEmpty);
      await tester.tap(find.text('Hủy'));
      await tester.pumpAndSettle();
      expect(api.confirmations, isEmpty);
      expect(card(tester).status, 'BoLo');
    },
  );
  testWidgets(
    'actual time, reason and acknowledgement are required; no automatic current time',
    (tester) async {
      await start(tester);
      await openSupplement(tester);
      expect(
        tester
            .widget<FilledButton>(
              find.byKey(const ValueKey('supplement-submit')),
            )
            .onPressed,
        isNull,
      );
      expect(
        tester
            .widget<TextFormField>(
              find.byKey(const ValueKey('supplement-time')),
            )
            .controller!
            .text,
        isEmpty,
      );
      await tester.ensureVisible(
        find.byKey(const ValueKey('supplement-acknowledge')),
      );
      await tester.tap(find.byKey(const ValueKey('supplement-acknowledge')));
      await tester.pumpAndSettle();
      await submit(tester);
      expect(find.text('Nhập giờ đã uống dạng HH:mm.'), findsOneWidget);
      expect(find.text('Nhập lý do ít nhất 5 ký tự.'), findsOneWidget);
      expect(api.confirmations, isEmpty);
    },
  );
  testWidgets(
    'supplement sends one separate PATCH, updates API progress/history, cleans reminders',
    (tester) async {
      await start(tester);
      await openSupplement(tester);
      await fillSupplement(tester);
      await submit(tester);
      expect(api.confirmations, hasLength(1));
      expect(
        api.confirmations.single.path,
        '/medication-schedule/3/supplement',
      );
      final sent = api.confirmations.single.data as Map;
      expect(sent['thoiGianThucTe'], endsWith('T21:45:00+07:00'));
      expect(sent['lyDo'], 'Đã uống nhưng quên xác nhận');
      expect(sent.containsKey('trangThai'), isFalse);
      expect(card(tester).status, 'DaUong');
      expect(card(tester).onSupplement, isNull);
      expect(card(tester).supplementaryNote, contains('NGƯỜI KIỂM THỬ'));
      expect(find.text('Đã uống 2/4 liều'), findsOneWidget);
      expect(fixture.notifications.cancelled, contains(100003));
      // A fresh GET, not an optimistic in-memory-only badge.
      MobileRealtimeService.instance.medicationRevision.value++;
      await settleMedicationUi(tester);
      expect(card(tester).supplementaryNote, contains('Ghi nhận bổ sung'));
      expect(api.confirmations, hasLength(1));
    },
  );
  for (final status in [403, 409, 422, 500, 503]) {
    testWidgets(
      'server $status preserves old dose/progress and does not cancel reminders',
      (tester) async {
        await start(tester);
        await openSupplement(tester);
        await fillSupplement(tester);
        api.deniedStatus = status;
        await submit(tester);
        expect(card(tester).status, 'BoLo');
        expect(card(tester).updating, false);
        expect(find.text('Đã uống 1/4 liều'), findsOneWidget);
        expect(find.text('BỔ SUNG BỊ TỪ CHỐI $status'), findsOneWidget);
        expect(fixture.notifications.cancelled, isNot(contains(100003)));
      },
    );
  }
  testWidgets('offline never pretends success', (tester) async {
    await start(tester);
    await openSupplement(tester);
    await fillSupplement(tester);
    api.offline = true;
    await submit(tester);
    expect(card(tester).status, 'BoLo');
    expect(card(tester).updating, false);
    expect(card(tester).supplementaryNote, isNull);
    expect(fixture.notifications.cancelled, isNot(contains(100003)));
  });
  testWidgets(
    'timeout does not update locally or automatically retry the write',
    (tester) async {
      await start(tester);
      await openSupplement(tester);
      await fillSupplement(tester);
      api.timeout = true;
      await submit(tester);
      expect(api.confirmations, hasLength(1));
      expect(card(tester).status, 'BoLo');
      expect(card(tester).supplementaryNote, isNull);
      expect(fixture.notifications.cancelled, isNot(contains(100003)));
      expect(card(tester).updating, false);
    },
  );
  testWidgets('realtime change while form is open blocks stale submission', (
    tester,
  ) async {
    await start(tester);
    await openSupplement(tester);
    await fillSupplement(tester);
    api.changed[3] = 'DaUong';
    MobileRealtimeService.instance.medicationRevision.value++;
    await settleMedicationUi(tester);
    await submit(tester);
    expect(api.confirmations, isEmpty);
    expect(card(tester).status, 'DaUong');
  });
  testWidgets(
    'pending request disables action and never optimistically marks taken',
    (tester) async {
      await start(tester);
      await openSupplement(tester);
      await fillSupplement(tester);
      api.confirmGate = Completer<void>();
      await tester.tap(find.byKey(const ValueKey('supplement-submit')));
      for (var i = 0; i < 4; i++) {
        await tester.pump(const Duration(milliseconds: 100));
        await tester.runAsync(
          () => Future<void>.delayed(const Duration(milliseconds: 30)),
        );
      }
      expect(api.confirmations, hasLength(1));
      expect(card(tester).status, 'BoLo');
      expect(card(tester).updating, true);
      expect(card(tester).onSupplement, isNull);
      api.confirmGate!.complete();
      await settleMedicationUi(tester);
      expect(card(tester).status, 'DaUong');
      expect(api.confirmations, hasLength(1));
    },
  );
  testWidgets(
    'session change while form is open cannot submit to the next account',
    (tester) async {
      await start(tester);
      await openSupplement(tester);
      await fillSupplement(tester);
      await tester.runAsync(() => ApiClient.clearSession());
      await submit(tester);
      expect(api.confirmations, isEmpty);
    },
  );
  testWidgets('more than 48 hours and missing dates are read-only', (
    tester,
  ) async {
    final now = DateTime.now();
    api.custom = [
      {
        'id': 3,
        'tenThuoc': 'OLD',
        'trangThai': 'BoLo',
        'thoiGianDuKien': now
            .subtract(const Duration(hours: 49))
            .toIso8601String(),
      },
    ];
    await start(tester);
    expect(card(tester).onSupplement, isNull);
    api.custom = [
      {'id': 3, 'trangThai': 'BoLo', 'thoiGianDuKien': null},
    ];
    MobileRealtimeService.instance.medicationRevision.value++;
    await settleMedicationUi(tester);
    expect(card(tester).onSupplement, isNull);
  });
  for (final width in [320.0, 390.0, 768.0]) {
    for (final scale in [1.0, 1.8]) {
      testWidgets(
        'supplement form/card fit ${width}dp at ${scale}x and keyboard insets',
        (tester) async {
          tester.view.physicalSize = Size(width, 900);
          tester.view.devicePixelRatio = 1;
          addTearDown(tester.view.resetPhysicalSize);
          addTearDown(tester.view.resetDevicePixelRatio);
          await start(tester, scale: scale);
          await openSupplement(tester);
          await fillSupplement(tester);
          tester.view.viewInsets = const FakeViewPadding(bottom: 280);
          await tester.pumpAndSettle();
          await tester.ensureVisible(
            find.byKey(const ValueKey('supplement-submit')),
          );
          expect(
            find.byKey(const ValueKey('supplement-submit')).hitTestable(),
            findsOneWidget,
          );
          expect(tester.takeException(), isNull);
          tester.view.resetViewInsets();
          await tester.pumpAndSettle();
          await submit(tester);
          expect(card(tester).status, 'DaUong');
          await revealMedication(
            tester,
            find.textContaining('Ghi nhận bổ sung').first,
          );
          expect(tester.takeException(), isNull);
        },
      );
    }
  }
}
