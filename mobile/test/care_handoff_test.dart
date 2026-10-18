import 'dart:async';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:elderly_care_app/services/api_client.dart';
import 'package:elderly_care_app/services/care_today_service.dart';
import 'package:elderly_care_app/screens/care/care_handoff_screen.dart';

class HandoffApi extends CareTodayService {
  final writes = <Map<String, dynamic>>[];
  bool denied = false, offline = false;
  Completer<dynamic>? pending;
  Completer<void>? save;
  @override
  Future<dynamic> request(
    String path, {
    String method = 'GET',
    Map<String, dynamic>? data,
    Map<String, dynamic>? query,
  }) async {
    if (denied) {
      throw const ApiException(
        'Bàn giao nội bộ chỉ dành cho người chăm sóc',
        statusCode: 403,
      );
    }
    if (method != 'GET') {
      writes.add({'path': path, 'data': data});
      if (offline) throw const ApiException('Không thể kết nối');
      await save?.future;
      return {'id': 1};
    }
    if (pending != null) {
      final p = pending!;
      pending = null;
      return p.future;
    }
    if (path.endsWith('history')) return {'rows': []};
    return {
      'rows': [
        {
          'id': 1,
          'nguoiTao': 'TEST ONLY AUTHOR',
          'ngayTao': '2026-10-11T08:00:00',
          'ngaySua': '2026-10-11T08:00:00',
          'version': 3,
          'daLam': 'TEST ONLY DONE',
          'conCho': 'TEST ONLY PENDING',
          'luuY': 'TEST ONLY ATTENTION',
          'canAck': true,
          'canEdit': false,
          'hasRead': false,
          'readers': [],
        },
      ],
    };
  }
}

void main() {
  setUp(() async {
    FlutterSecureStorage.setMockInitialValues({});
    await ApiClient.clearSession();
  });
  testWidgets('Session change closes already visible private history', (
    t,
  ) async {
    await t.pumpWidget(
      MaterialApp(home: CareHandoffScreen(profileId: 1, service: HandoffApi())),
    );
    await t.pumpAndSettle();
    await t.scrollUntilVisible(find.text('Lịch sử'), 150);
    await t.tap(find.text('Lịch sử'));
    await t.pumpAndSettle();
    expect(find.byType(AlertDialog), findsOneWidget);
    await t.pumpWidget(
      MaterialApp(home: CareHandoffScreen(profileId: 2, service: HandoffApi())),
    );
    await t.pumpAndSettle();
    expect(find.byType(AlertDialog), findsNothing);
    await t.scrollUntilVisible(find.text('Lịch sử'), 150);
    await t.tap(find.text('Lịch sử'));
    await t.pumpAndSettle();
    expect(find.byType(AlertDialog), findsOneWidget);
    await t.runAsync(() => ApiClient.clearSession());
    await t.pumpAndSettle();
    expect(find.byType(AlertDialog), findsNothing);
    expect(find.textContaining('TEST ONLY'), findsNothing);
  });
  testWidgets(
    'Handoff opening never acknowledges, cancel is safe, explicit ack uses version',
    (t) async {
      final api = HandoffApi();
      await t.pumpWidget(
        MaterialApp(home: CareHandoffScreen(profileId: 1, service: api)),
      );
      await t.pumpAndSettle();
      expect(api.writes, isEmpty);
      await t.scrollUntilVisible(find.text('Xác nhận đã đọc'), 150);
      await t.tap(find.text('Xác nhận đã đọc'));
      await t.pumpAndSettle();
      await t.tap(find.text('Hủy'));
      await t.pumpAndSettle();
      expect(api.writes, isEmpty);
      await t.tap(find.text('Xác nhận đã đọc'));
      await t.pumpAndSettle();
      await t.tap(find.widgetWithText(FilledButton, 'Đã đọc'));
      await t.pumpAndSettle();
      expect(api.writes.single['data'], {'version': 3});
    },
  );
  testWidgets(
    'Handoff permissions do not expose write controls or private content',
    (t) async {
      await t.pumpWidget(
        MaterialApp(
          home: CareHandoffScreen(
            profileId: 1,
            service: HandoffApi()..denied = true,
          ),
        ),
      );
      await t.pumpAndSettle();
      expect(find.textContaining('TEST ONLY DONE'), findsNothing);
      expect(find.text('Tạo bàn giao'), findsNothing);
      expect(
        find.textContaining('chỉ dành cho người chăm sóc'),
        findsOneWidget,
      );
    },
  );
  testWidgets('Handoff changed account rejects stale private payload', (
    t,
  ) async {
    final wait = Completer<dynamic>();
    await t.pumpWidget(
      MaterialApp(
        home: CareHandoffScreen(
          profileId: 1,
          service: HandoffApi()..pending = wait,
        ),
      ),
    );
    await t.pump();
    await t.runAsync(() => ApiClient.clearSession());
    await t.pump();
    wait.complete({
      'rows': [
        {'daLam': 'STALE PRIVATE'},
      ],
    });
    await t.pumpAndSettle();
    expect(find.textContaining('STALE PRIVATE'), findsNothing);
    expect(find.textContaining('Phiên đã thay đổi'), findsOneWidget);
  });
  testWidgets('Handoff save failure keeps draft and same idempotency key', (
    t,
  ) async {
    final api = HandoffApi()..offline = true;
    await t.pumpWidget(
      MaterialApp(home: CareHandoffForm(profileId: 1, service: api)),
    );
    await t.pumpAndSettle();
    await t.enterText(find.byType(TextFormField).first, 'TEST ONLY DONE');
    await t.scrollUntilVisible(
      find.text('Lưu bàn giao'),
      150,
      scrollable: find.byType(Scrollable).first,
    );
    await t.tap(find.text('Lưu bàn giao'));
    await t.pumpAndSettle();
    expect(find.text('Không thể kết nối'), findsOneWidget);
    await t.tap(find.text('Lưu bàn giao'));
    await t.pumpAndSettle();
    expect(api.writes.length, 2);
    expect(api.writes[0]['data'], api.writes[1]['data']);
  });
  testWidgets('Handoff small screen and large text remains scrollable', (
    t,
  ) async {
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
        home: CareHandoffForm(profileId: 1, service: HandoffApi()),
      ),
    );
    await t.pumpAndSettle();
    await t.scrollUntilVisible(
      find.text('Lưu bàn giao'),
      150,
      scrollable: find.byType(Scrollable).first,
    );
    expect(t.takeException(), isNull);
  });
}
