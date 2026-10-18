import 'dart:async';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:elderly_care_app/services/api_client.dart';
import 'package:elderly_care_app/services/care_today_service.dart';
import 'package:elderly_care_app/screens/care/care_today_screen.dart';
import 'package:elderly_care_app/screens/care/care_lifestyle_screen.dart';
import 'package:elderly_care_app/screens/care/care_plan_screen.dart';
import 'package:elderly_care_app/services/care_reminder_service.dart';
import 'package:elderly_care_app/widgets/health_trend.dart';

class FakeCare extends CareTodayService {
  bool offline = false, records = false;
  Completer<void>? pendingWrite;
  Completer<dynamic>? pendingRead;
  final writes = <Map<String, dynamic>>[];
  final planReads = <int>[];
  @override
  Future<Map<String, dynamic>> plans(int id) async {
    planReads.add(id);
    return {
      'plans': [],
      'occurrences': [
        {
          'id': 'care:$id:2099-01-01',
          'kind': 'care',
          'thoiGian': '2099-01-01T10:00:00',
          'trangThai': 'upcoming',
          'ten': 'TEST ONLY FUTURE $id',
        },
      ],
    };
  }

  @override
  Future<List<Map<String, dynamic>>> profiles() async => [
    {'id': 1, 'hoTen': 'TEST ONLY A'},
    {'id': 2, 'hoTen': 'TEST ONLY B'},
  ];
  @override
  Future<Map<String, dynamic>> today(int id) async => {
    'profile': {'hoTen': 'TEST ONLY ${id == 1 ? 'A' : 'B'}'},
    'date': '2026-10-11',
    'canWrite': true,
    'items': [],
    'progress': {'completed': 0, 'total': 0},
  };
  @override
  Future<dynamic> request(
    String path, {
    String method = 'GET',
    Map<String, dynamic>? data,
    Map<String, dynamic>? query,
  }) async {
    if (method != 'GET') {
      writes.add({'path': path, 'method': method, 'data': data});
      if (offline) throw const ApiException('Không thể kết nối');
      await pendingWrite?.future;
      return {'id': 1};
    }
    if (offline) throw const ApiException('Không thể kết nối');
    if (pendingRead != null) {
      final wait = pendingRead!;
      pendingRead = null;
      return wait.future;
    }
    if (path.endsWith('/history')) return {'rows': []};
    return {
      'canWrite': true,
      'rows': records
          ? [
              {
                'id': 1,
                'loai': 'water',
                'noiDung': 'TEST ONLY WATER',
                'thoiGian': '2026-10-11T07:00:00',
                'luong': 0,
                'nguoiGhi': 'TEST ONLY CAREGIVER',
                'version': 1,
                'canEdit': true,
              },
            ]
          : [],
      'totals': {
        'mealCount': null,
        'waterMl': records ? 0 : null,
        'sleepMinutes': null,
        'exerciseMinutes': null,
        'moodCount': null,
      },
    };
  }
}

void main() {
  testWidgets('Plan draft is cleared when the account changes', (t) async {
    await t.pumpWidget(
      MaterialApp(
        home: CreateCarePlanScreen(profileId: 1, service: FakeCare()),
      ),
    );
    await t.enterText(
      find.byType(TextFormField).first,
      'TEST ONLY PRIVATE PLAN',
    );
    await t.enterText(
      find.byType(TextFormField).last,
      'TEST ONLY PRIVATE GOAL',
    );
    await t.runAsync(() => ApiClient.clearSession());
    await t.pumpAndSettle();
    expect(find.text('TEST ONLY PRIVATE PLAN'), findsNothing);
    expect(find.text('TEST ONLY PRIVATE GOAL'), findsNothing);
  });
  testWidgets('Plan screen reloads when its selected profile changes', (
    t,
  ) async {
    final api = FakeCare();
    await t.pumpWidget(
      MaterialApp(
        home: CarePlanScreen(profileId: 1, canWrite: true, service: api),
      ),
    );
    await t.pumpAndSettle();
    await t.pumpWidget(
      MaterialApp(
        home: CarePlanScreen(profileId: 2, canWrite: true, service: api),
      ),
    );
    await t.pumpAndSettle();
    expect(api.planReads, [1, 2]);
  });
  testWidgets('Session change closes visible lifestyle history', (t) async {
    await t.pumpWidget(
      MaterialApp(
        home: CareLifestyleScreen(
          profileId: 1,
          service: FakeCare()..records = true,
        ),
      ),
    );
    await t.pumpAndSettle();
    await t.scrollUntilVisible(find.text('Lịch sử'), 150);
    await t.tap(find.text('Lịch sử'));
    await t.pumpAndSettle();
    expect(find.byType(AlertDialog), findsOneWidget);
    await t.runAsync(() => ApiClient.clearSession());
    await t.pumpAndSettle();
    expect(find.byType(AlertDialog), findsNothing);
    expect(find.textContaining('TEST ONLY WATER'), findsNothing);
  });
  setUp(() async {
    SharedPreferences.setMockInitialValues({});
    FlutterSecureStorage.setMockInitialValues({});
    await ApiClient.clearSession();
  });
  testWidgets(
    'Today switches whole profile, truthful empty progress and weekly reminders',
    (t) async {
      await t.pumpWidget(
        MaterialApp(home: CareTodayScreen(service: FakeCare())),
      );
      await t.pumpAndSettle();
      expect(find.textContaining('Chào'), findsOneWidget);
      expect(find.text('Đã xác nhận 0/0 việc theo lịch'), findsOneWidget);
      await t.tap(find.byType(DropdownButtonFormField<int>));
      await t.pumpAndSettle();
      await t.tap(find.text('TEST ONLY B').last);
      await t.pumpAndSettle();
      expect(find.textContaining('! TEST ONLY B'), findsOneWidget);
      expect(find.textContaining('! TEST ONLY A'), findsNothing);
      SharedPreferences.setMockInitialValues({'care_local_reminders': true});
      final s = FakeCare();
      await t.pumpWidget(
        MaterialApp(
          home: CareTodayScreen(key: const ValueKey('weekly'), service: s),
        ),
      );
      await t.pumpAndSettle();
      expect(s.planReads, [1]);
      await t.tap(find.byType(DropdownButtonFormField<int>));
      await t.pumpAndSettle();
      await t.tap(find.text('TEST ONLY B').last);
      await t.pumpAndSettle();
      expect(s.planReads, [1, 2]);
    },
    variant: TargetPlatformVariant.only(TargetPlatform.windows),
  );
  testWidgets(
    'Lifestyle retry clears error and does not replace absence by zero',
    (t) async {
      final s = FakeCare()..offline = true;
      await t.pumpWidget(
        MaterialApp(home: CareLifestyleScreen(profileId: 1, service: s)),
      );
      await t.pumpAndSettle();
      expect(find.text('Không thể kết nối'), findsOneWidget);
      s.offline = false;
      await t.tap(find.text('Thử lại'));
      await t.pumpAndSettle();
      expect(find.textContaining('Nước: Chưa ghi nhận'), findsOneWidget);
      expect(find.textContaining('Nước: 0'), findsNothing);
    },
  );
  testWidgets('Lifestyle stale read cannot leak after account changes', (
    t,
  ) async {
    final wait = Completer<dynamic>(),
        s = FakeCare()..pendingRead = Completer<dynamic>();
    s.pendingRead = wait;
    await t.pumpWidget(
      MaterialApp(home: CareLifestyleScreen(profileId: 1, service: s)),
    );
    await t.pump();
    await t.runAsync(() => ApiClient.clearSession());
    await t.pump();
    wait.complete({
      'rows': [
        {'noiDung': 'STALE PRIVATE'},
      ],
      'totals': {},
    });
    await t.pumpAndSettle();
    expect(find.textContaining('STALE PRIVATE'), findsNothing);
    expect(find.textContaining('Phiên đã thay đổi'), findsOneWidget);
  });
  testWidgets('Lifestyle delete requires confirmation, uses original version', (
    t,
  ) async {
    final s = FakeCare()..records = true;
    await t.pumpWidget(
      MaterialApp(home: CareLifestyleScreen(profileId: 1, service: s)),
    );
    await t.pumpAndSettle();
    await t.scrollUntilVisible(find.text('Xóa'), 180);
    await t.tap(find.text('Xóa'));
    await t.pumpAndSettle();
    expect(s.writes, isEmpty);
    await t.tap(find.text('Hủy'));
    await t.pumpAndSettle();
    expect(s.writes, isEmpty);
    await t.tap(find.text('Xóa'));
    await t.pumpAndSettle();
    await t.tap(find.widgetWithText(FilledButton, 'Xóa'));
    await t.pumpAndSettle();
    expect(s.writes.single['data'], {'version': 1});
    expect(s.writes.single['method'], 'DELETE');
  });
  testWidgets(
    'Lifestyle failed save retains draft and request id for safe retry',
    (t) async {
      final s = FakeCare()..offline = true;
      await t.pumpWidget(
        MaterialApp(home: CareLifestyleForm(profileId: 1, service: s)),
      );
      await t.pumpAndSettle();
      await t.enterText(find.byType(TextFormField).first, 'TEST ONLY MEAL');
      await t.scrollUntilVisible(
        find.text('Lưu bản ghi'),
        180,
        scrollable: find.byType(Scrollable).first,
      );
      await t.tap(find.text('Lưu bản ghi'));
      await t.pumpAndSettle();
      expect(find.text('Không thể kết nối'), findsOneWidget);
      await t.tap(find.text('Lưu bản ghi'));
      await t.pumpAndSettle();
      expect(s.writes.length, 2);
      expect(s.writes[0]['data'], s.writes[1]['data']);
    },
  );
  testWidgets(
    'Lifestyle small screen, keyboard and large text scroll without overflow',
    (t) async {
      t.view.physicalSize = const Size(320, 640);
      t.view.devicePixelRatio = 1;
      addTearDown(t.view.resetPhysicalSize);
      addTearDown(t.view.resetDevicePixelRatio);
      await t.pumpWidget(
        MaterialApp(
          builder: (c, w) => MediaQuery(
            data: MediaQuery.of(c).copyWith(
              textScaler: const TextScaler.linear(1.6),
              viewInsets: const EdgeInsets.only(bottom: 250),
            ),
            child: w!,
          ),
          home: CareLifestyleForm(profileId: 1, service: FakeCare()),
        ),
      );
      await t.pumpAndSettle();
      await t.scrollUntilVisible(
        find.widgetWithText(TextFormField, 'Nội dung'),
        140,
        scrollable: find.byType(Scrollable).first,
      );
      await t.enterText(
        find.widgetWithText(TextFormField, 'Nội dung'),
        'TEST ONLY',
      );
      await t.scrollUntilVisible(
        find.text('Lưu bản ghi'),
        140,
        scrollable: find.byType(Scrollable).first,
      );
      expect(t.takeException(), isNull);
    },
  );
  test('Care reminders are future, unfinished, profile scoped wall times', () {
    final rows = [
      {
        'kind': 'care',
        'trangThai': 'upcoming',
        'thoiGian': '2026-10-11T20:00:00',
      },
      {
        'kind': 'care',
        'trangThai': 'completed',
        'thoiGian': '2026-10-11T20:00:00',
      },
      {
        'kind': 'medication',
        'trangThai': 'upcoming',
        'thoiGian': '2026-10-11T20:00:00',
      },
    ];
    expect(
      CareReminderService.pending(
        rows,
        DateTime.parse('2026-10-11T12:00:00Z'),
      ).length,
      1,
    );
    expect(
      CareReminderService.pending(rows, DateTime.parse('2026-10-11T14:00:00Z')),
      isEmpty,
    );
  });
  test(
    'Health chart filters Vietnamese calendar days without inventing points',
    () {
      final rows = [
        {
          'tenChiSo': 'Huyết áp',
          'giaTri': 120,
          'giaTriPhu': 80,
          'thoiGianDo': '2026-10-05T00:00:00',
        },
        {
          'tenChiSo': 'Huyết áp',
          'giaTri': 110,
          'giaTriPhu': 70,
          'thoiGianDo': '2026-10-04T23:59:00',
        },
        {
          'tenChiSo': 'Huyết áp',
          'giaTri': 999,
          'thoiGianDo': '2026-10-12T08:00:00',
        },
      ];
      expect(
        HealthTrend.points(
          rows,
          'Huyết áp',
          7,
          DateTime.parse('2026-10-11T12:00:00Z'),
        ).length,
        1,
      );
      expect(
        HealthTrend.points(
          rows,
          'Huyết áp',
          30,
          DateTime.parse('2026-10-11T12:00:00Z'),
        ).length,
        2,
      );
    },
  );
}
