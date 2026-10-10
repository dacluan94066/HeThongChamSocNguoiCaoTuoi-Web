import 'dart:async';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:elderly_care_app/services/api_client.dart';
import 'package:elderly_care_app/services/care_notes_service.dart';
import 'package:elderly_care_app/screens/caregiver/care_notes_screen.dart';

class FakeNotes extends CareNotesService {
  final calls = <int>[];
  final writes = <List<Object>>[];
  bool offline = false;
  bool editable = false;
  final edits = <List<Object>>[];
  int removals = 0;
  Completer<void>? pendingWrite;
  Completer<List<Map<String, dynamic>>>? pendingRead;
  @override
  Future<List<Map<String, dynamic>>> list(int id) async {
    calls.add(id);
    return pendingRead?.future ??
        [
          {
            'id': id,
            'tieuDe': 'PROFILE $id',
            'noiDung': 'SYNTHETIC',
            'canEdit': editable,
            'version': 'TEST VERSION',
          },
        ];
  }

  @override
  Future<void> create(int id, String title, String content) async {
    writes.add([id, title, content]);
    if (offline) throw const ApiException('Không thể kết nối đến máy chủ');
    await pendingWrite?.future;
  }

  @override
  Future<void> update(
    Map<String, dynamic> note,
    String title,
    String content,
  ) async {
    edits.add([
      note['id'] as Object,
      title,
      content,
      note['version'] as Object,
    ]);
    if (offline) throw const ApiException('Không thể kết nối đến máy chủ');
    await pendingWrite?.future;
  }

  @override
  Future<void> remove(Map<String, dynamic> note) async {
    removals++;
    if (offline) throw const ApiException('Không thể kết nối đến máy chủ');
    await pendingWrite?.future;
  }
}

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();
  setUp(() async {
    FlutterSecureStorage.setMockInitialValues({});
    await ApiClient.clearSession();
  });
  Future<void> open(
    WidgetTester tester,
    FakeNotes service, {
    int id = 1,
  }) async {
    await tester.pumpWidget(
      MaterialApp(
        home: CareNotesScreen(
          key: ValueKey(id),
          elderlyId: id,
          elderlyName: 'TEST ONLY $id',
          service: service,
        ),
      ),
    );
    await tester.pumpAndSettle();
  }

  Future<void> enter(WidgetTester tester) async {
    await tester.tap(find.text('Thêm nhật ký'));
    await tester.pumpAndSettle();
    await tester.enterText(find.byType(TextFormField).at(0), 'TEST TITLE');
    await tester.enterText(find.byType(TextFormField).at(1), 'TEST CONTENT');
  }

  testWidgets('Edit failure preserves draft and original version for retry', (
    tester,
  ) async {
    final service = FakeNotes()
      ..editable = true
      ..offline = true;
    await open(tester, service, id: 2);
    await tester.tap(find.text('Sửa nhật ký'));
    await tester.pumpAndSettle();
    await tester.enterText(find.byType(TextFormField).at(1), 'TEST EDIT DRAFT');
    await tester.tap(find.text('Lưu nhật ký'));
    await tester.pumpAndSettle();
    expect(find.text('TEST EDIT DRAFT'), findsOneWidget);
    expect(find.text('Không thể kết nối đến máy chủ'), findsOneWidget);
    service.offline = false;
    await tester.tap(find.text('Lưu nhật ký'));
    await tester.pumpAndSettle();
    expect(service.edits.last, [
      2,
      'PROFILE 2',
      'TEST EDIT DRAFT',
      'TEST VERSION',
    ]);
    expect(find.byType(AlertDialog), findsNothing);
  });
  testWidgets(
    'Delete requires confirmation, preserves dialog on failure, prevents duplicate pending delete',
    (tester) async {
      final service = FakeNotes()
        ..editable = true
        ..offline = true;
      await open(tester, service);
      await tester.tap(find.text('Xóa nhật ký'));
      await tester.pumpAndSettle();
      expect(service.removals, 0);
      await tester.tap(find.text('Xác nhận xóa'));
      await tester.pumpAndSettle();
      expect(find.text('Không thể kết nối đến máy chủ'), findsOneWidget);
      service.offline = false;
      service.pendingWrite = Completer<void>();
      await tester.tap(find.text('Xác nhận xóa'));
      await tester.pump();
      await tester.tap(find.text('Đang xóa…'));
      await tester.pump();
      expect(service.removals, 2);
      service.pendingWrite!.complete();
      await tester.pumpAndSettle();
      expect(find.byType(AlertDialog), findsNothing);
    },
  );
  testWidgets('Read-only notes do not expose mutation actions', (tester) async {
    await open(tester, FakeNotes());
    expect(find.text('Sửa nhật ký'), findsNothing);
    expect(find.text('Xóa nhật ký'), findsNothing);
  });

  testWidgets(
    'Failed save preserves draft; retry writes the selected profile',
    (tester) async {
      final service = FakeNotes()..offline = true;
      await open(tester, service, id: 2);
      await enter(tester);
      await tester.tap(find.text('Lưu nhật ký'));
      await tester.pumpAndSettle();
      expect(find.text('Không thể kết nối đến máy chủ'), findsOneWidget);
      expect(find.text('TEST CONTENT'), findsOneWidget);
      service.offline = false;
      await tester.tap(find.text('Lưu nhật ký'));
      await tester.pumpAndSettle();
      expect(service.writes.last, [2, 'TEST TITLE', 'TEST CONTENT']);
      expect(find.byType(AlertDialog), findsNothing);
      expect(service.calls, [2, 2]);
    },
  );
  testWidgets('Pending save disables duplicate submit and back', (
    tester,
  ) async {
    final service = FakeNotes()..pendingWrite = Completer<void>();
    await open(tester, service);
    await enter(tester);
    await tester.tap(find.text('Lưu nhật ký'));
    await tester.pump();
    await tester.tap(find.text('Đang lưu…'));
    await tester.pump();
    expect(service.writes.length, 1);
    expect(tester.widget<PopScope>(find.byType(PopScope).last).canPop, isFalse);
    service.pendingWrite!.complete();
    await tester.pumpAndSettle();
    expect(find.byType(AlertDialog), findsNothing);
  });
  testWidgets(
    'Old profile response cannot replace the newly selected profile',
    (tester) async {
      final first = FakeNotes()
        ..pendingRead = Completer<List<Map<String, dynamic>>>();
      await tester.pumpWidget(
        MaterialApp(
          home: CareNotesScreen(
            key: const ValueKey(1),
            elderlyId: 1,
            elderlyName: 'TEST A',
            service: first,
          ),
        ),
      );
      await tester.pump();
      await open(tester, FakeNotes(), id: 2);
      first.pendingRead!.complete([
        {'tieuDe': 'OLD PRIVATE PROFILE'},
      ]);
      await tester.pumpAndSettle();
      expect(find.text('PROFILE 2'), findsOneWidget);
      expect(find.text('OLD PRIVATE PROFILE'), findsNothing);
      expect(tester.takeException(), isNull);
    },
  );
  testWidgets(
    'Small screen, large text and keyboard keep journal form usable',
    (tester) async {
      tester.view.physicalSize = const Size(360, 640);
      tester.view.devicePixelRatio = 1;
      addTearDown(tester.view.resetPhysicalSize);
      addTearDown(tester.view.resetDevicePixelRatio);
      await tester.pumpWidget(
        MaterialApp(
          builder: (_, child) => MediaQuery(
            data: const MediaQueryData(
              size: Size(360, 640),
              textScaler: TextScaler.linear(1.8),
              viewInsets: EdgeInsets.only(bottom: 240),
            ),
            child: child!,
          ),
          home: CareNotesScreen(
            elderlyId: 1,
            elderlyName: 'TEST',
            service: FakeNotes(),
          ),
        ),
      );
      await tester.pumpAndSettle();
      await tester.tap(find.text('Thêm nhật ký'));
      await tester.pumpAndSettle();
      expect(tester.takeException(), isNull);
      expect(find.text('Lưu nhật ký'), findsOneWidget);
    },
  );
}
