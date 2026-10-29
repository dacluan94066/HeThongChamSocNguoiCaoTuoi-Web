import 'dart:convert';
import 'dart:typed_data';

import 'package:dio/dio.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:elderly_care_app/main.dart';
import 'package:elderly_care_app/screens/relative/relative_main_screen.dart';
import 'package:elderly_care_app/services/api_client.dart';
import 'package:elderly_care_app/services/relative_service.dart';
import 'package:elderly_care_app/theme/care_senior_theme.dart';

class MockRelativeAdapter implements HttpClientAdapter {
  final List<RequestOptions> requests = [];

  @override
  void close({bool force = false}) {}

  @override
  Future<ResponseBody> fetch(
    RequestOptions options,
    Stream<Uint8List>? stream,
    Future<void>? cancel,
  ) async {
    requests.add(options);
    dynamic data;

    final path = options.path;
    if (path == '/relatives/me/elderly') {
      data = [
        {
          'id': 6,
          'hoTen': 'Võ Huỳnh Duy',
          'gioiTinh': 'Nam',
          'tuoi': 61,
          'nhomMau': 'A-',
          'moiQuanHe': 'Con Gái',
          'xemBenhNen': true,
          'xemDiUng': true,
          'benhNen': 'Tăng huyết áp',
          'diUng': 'Không có',
        }
      ];
    } else if (path == '/relatives/me/elderly/6') {
      data = {
        'id': 6,
        'hoTen': 'Võ Huỳnh Duy',
        'gioiTinh': 'Nam',
        'tuoi': 61,
        'nhomMau': 'A-',
        'moiQuanHe': 'Con Gái',
        'xemBenhNen': true,
        'xemDiUng': true,
        'benhNen': 'Tăng huyết áp',
        'diUng': 'Không có',
      };
    } else if (path.endsWith('/health-metrics')) {
      data = [
        {
          'id': 101,
          'loaiChiSoId': 1,
          'tenChiSo': 'Huyết áp',
          'donVi': 'mmHg',
          'giaTri': 120,
          'giaTriPhu': 80,
          'thoiGianDo': '2026-10-30T08:00:00.000Z',
          'laBatThuong': false,
        }
      ];
    } else if (path.endsWith('/medication-schedules')) {
      data = [
        {
          'id': 201,
          'tenThuoc': 'Amlodipine 5mg',
          'lieuDung': '1 viên',
          'donViTinh': 'viên',
          'cachDung': 'Uống sau ăn',
          'thoiGianDuKien': '2026-10-30T08:00:00.000Z',
          'trangThai': 'DaUong',
        },
        {
          'id': 202,
          'tenThuoc': 'Metformin 500mg',
          'lieuDung': '1 viên',
          'donViTinh': 'viên',
          'cachDung': 'Uống sau ăn',
          'thoiGianDuKien': '2026-10-30T12:00:00.000Z',
          'trangThai': 'ChuaDenGio',
        },
      ];
    } else if (path.endsWith('/appointments')) {
      data = [
        {
          'id': 301,
          'tenBenhVien': 'Bệnh viện Tim Tâm Đức',
          'bacSiPhuTrach': 'BS. Trần Văn B',
          'chuyenKhoa': 'Tim mạch',
          'thoiGianKham': '2026-11-02T09:00:00.000Z',
        }
      ];
    } else if (path.endsWith('/care-notes')) {
      data = [
        {
          'id': 401,
          'hoatDong': 'Ăn sáng & uống thuốc',
          'nguoiChamSocTen': 'Nguyễn Y Sĩ',
          'moTaChiTiet': 'Cụ ăn hết phần cháo và uống thuốc đúng giờ',
          'ngayGhi': '2026-10-30T08:30:00.000Z',
        }
      ];
    } else if (path.endsWith('/alerts')) {
      data = [
        {
          'id': 501,
          'noiDung': 'Huyết áp sáng nay ổn định',
          'mucDo': 'Thap',
          'ngayTao': '2026-10-30T08:00:00.000Z',
        }
      ];
    } else if (path.endsWith('/sos')) {
      data = <dynamic>[];
    } else {
      data = <dynamic>[];
    }

    final body = jsonEncode({'data': data, 'status': 'success'});
    return ResponseBody.fromString(
      body,
      200,
      headers: {Headers.contentTypeHeader: [Headers.jsonContentType]},
    );
  }
}

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();

  late MockRelativeAdapter adapter;
  late HttpClientAdapter originalAdapter;
  late List<Interceptor> interceptors;

  setUp(() {
    FlutterSecureStorage.setMockInitialValues({
      ApiClient.tokenKey: 'mock-relative-token',
      ApiClient.userKey: jsonEncode({
        'userId': 12,
        'tenDangNhap': 'huong123',
        'hoTen': 'Trần Thị Lan Hương',
        'tenVaiTro': 'NguoiThan',
        'vaiTroId': 4,
      }),
    });
    adapter = MockRelativeAdapter();
    final dio = ApiClient.instance.dio;
    originalAdapter = dio.httpClientAdapter;
    interceptors = List<Interceptor>.from(dio.interceptors);
    dio.interceptors.clear(keepImplyContentTypeInterceptor: false);
    dio.httpClientAdapter = adapter;
    RelativeService.instance.clearCache();
  });

  tearDown(() {
    final dio = ApiClient.instance.dio;
    dio.httpClientAdapter = originalAdapter;
    dio.interceptors.clear(keepImplyContentTypeInterceptor: false);
    dio.interceptors.addAll(interceptors);
    RelativeService.instance.clearCache();
  });

  test('homeForRole routes NguoiThan to RelativeMainScreen', () {
    final widget = homeForRole('NguoiThan');
    expect(widget, isA<RelativeMainScreen>());
  });

  testWidgets('RelativeMainScreen renders NCT-style header, user name and elderly profile card', (tester) async {
    tester.view.physicalSize = const Size(800, 1600);
    tester.view.devicePixelRatio = 1.0;
    addTearDown(tester.view.resetPhysicalSize);
    addTearDown(tester.view.resetDevicePixelRatio);

    await tester.pumpWidget(
      MaterialApp(
        theme: CareSeniorTheme.data,
        home: const RelativeMainScreen(),
      ),
    );
    await tester.pumpAndSettle();

    expect(find.text('NGƯỜI THÂN • ĐỒNG HÀNH CHĂM SÓC'), findsOneWidget);
    expect(find.text('Xin chào, Trần Thị Lan Hương'), findsOneWidget);
    expect(find.text('Võ Huỳnh Duy'), findsOneWidget);
    expect(find.byWidgetPredicate((w) => w is RichText && w.text.toPlainText().contains('Đang xem: Võ Huỳnh Duy')), findsOneWidget);
    expect(find.text('Tăng huyết áp'), findsOneWidget);
    expect(find.text('Chỉ số sinh hiệu gần nhất'), findsOneWidget);
    expect(find.text('Lịch khám bệnh tiếp theo'), findsOneWidget);
    expect(find.text('Nhật ký chăm sóc mới nhất'), findsOneWidget);
  });

  testWidgets('Switching tabs to Lịch thuốc displays medications and shift sections', (tester) async {
    tester.view.physicalSize = const Size(800, 1600);
    tester.view.devicePixelRatio = 1.0;
    addTearDown(tester.view.resetPhysicalSize);
    addTearDown(tester.view.resetDevicePixelRatio);

    await tester.pumpWidget(
      MaterialApp(
        theme: CareSeniorTheme.data,
        home: const RelativeMainScreen(),
      ),
    );
    await tester.pumpAndSettle();

    // Switch to Lịch thuốc tab
    await tester.tap(find.text('Lịch thuốc'));
    await tester.pumpAndSettle();

    expect(find.text('Hôm nay'), findsOneWidget);
    expect(find.text('Ngày mai'), findsOneWidget);
    expect(find.text('Tất cả ngày'), findsOneWidget);
    expect(find.text('Tiến độ uống thuốc'), findsOneWidget);
    expect(find.text('Amlodipine 5mg'), findsOneWidget);
  });

  testWidgets('Switching tabs to Chỉ số displays health metrics card', (tester) async {
    tester.view.physicalSize = const Size(800, 1600);
    tester.view.devicePixelRatio = 1.0;
    addTearDown(tester.view.resetPhysicalSize);
    addTearDown(tester.view.resetDevicePixelRatio);

    await tester.pumpWidget(
      MaterialApp(
        theme: CareSeniorTheme.data,
        home: const RelativeMainScreen(),
      ),
    );
    await tester.pumpAndSettle();

    // Switch to Chỉ số tab
    await tester.tap(find.text('Chỉ số'));
    await tester.pumpAndSettle();

    expect(find.text('Chỉ số sức khỏe'), findsOneWidget);
    expect(find.text('Thêm chỉ số'), findsNWidgets(2)); // Header button + FAB
    expect(find.text('Huyết áp'), findsOneWidget);
    expect(find.text('120/80 mmHg'), findsOneWidget);
  });

  testWidgets('Switching tabs to Cảnh báo displays alerts list', (tester) async {
    tester.view.physicalSize = const Size(800, 1600);
    tester.view.devicePixelRatio = 1.0;
    addTearDown(tester.view.resetPhysicalSize);
    addTearDown(tester.view.resetDevicePixelRatio);

    await tester.pumpWidget(
      MaterialApp(
        theme: CareSeniorTheme.data,
        home: const RelativeMainScreen(),
      ),
    );
    await tester.pumpAndSettle();

    // Switch to Cảnh báo tab
    await tester.tap(find.text('Cảnh báo'));
    await tester.pumpAndSettle();

    expect(find.text('Lịch sử cảnh báo sức khỏe'), findsOneWidget);
    expect(find.text('Huyết áp sáng nay ổn định'), findsOneWidget);
  });

  testWidgets('Tapping logout button shows confirmation dialog and allows canceling', (tester) async {
    tester.view.physicalSize = const Size(800, 1600);
    tester.view.devicePixelRatio = 1.0;
    addTearDown(tester.view.resetPhysicalSize);
    addTearDown(tester.view.resetDevicePixelRatio);

    await tester.pumpWidget(
      MaterialApp(
        theme: CareSeniorTheme.data,
        home: const RelativeMainScreen(),
      ),
    );
    await tester.pumpAndSettle();

    final logoutIcon = find.byIcon(Icons.logout_rounded);
    expect(logoutIcon, findsOneWidget);

    await tester.tap(logoutIcon);
    await tester.pumpAndSettle();

    expect(find.text('Đăng xuất'), findsNWidgets(2)); // Dialog title + action button
    expect(find.text('Bạn có chắc muốn đăng xuất khỏi tài khoản Người thân?'), findsOneWidget);
    expect(find.text('Hủy'), findsOneWidget);

    // Tap Cancel
    await tester.tap(find.text('Hủy'));
    await tester.pumpAndSettle();
    expect(find.text('Bạn có chắc muốn đăng xuất khỏi tài khoản Người thân?'), findsNothing);
  });
}
