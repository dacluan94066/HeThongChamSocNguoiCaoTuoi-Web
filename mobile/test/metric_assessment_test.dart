import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:elderly_care_app/utils/metric_assessment.dart';
import 'package:elderly_care_app/screens/health/health_dashboard_ui.dart';

void main() {
  test('AUD-13 unknown metadata is not normal, stored abnormal flag wins', () {
    expect(MetricAssessment.assessed({'laBatThuong': false}), isFalse);
    expect(MetricAssessment.label({'laBatThuong': false, 'trangThaiDanhGia': 'CHUA_CO_NGUONG'}), 'Chưa có ngưỡng đánh giá');
    expect(MetricAssessment.label({'laBatThuong': false, 'trangThaiDanhGia': 'BINH_THUONG'}), 'Trong ngưỡng theo dõi');
    expect(MetricAssessment.label({'laBatThuong': true, 'trangThaiDanhGia': 'CHUA_CO_NGUONG'}), 'Bất thường');
  });
  for (final scale in [1.0, 1.8]) {
    testWidgets('AUD-13 latest and history status fit 320dp at ${scale}x without false normal', (tester) async {
      tester.view.devicePixelRatio = 1;
      tester.view.physicalSize = const Size(320, 800);
      addTearDown(tester.view.resetDevicePixelRatio);
      addTearDown(tester.view.resetPhysicalSize);
      await tester.pumpWidget(MaterialApp(home: MediaQuery(
        data: MediaQueryData(size: const Size(320, 800), textScaler: TextScaler.linear(scale)),
        child: Scaffold(body: SingleChildScrollView(child: HealthLatestCard(
          name: 'Cân nặng', unit: 'kg', range: 'Chưa cấu hình ngưỡng',
          latest: {'giaTri': 75, 'laBatThuong': false, 'trangThaiDanhGia': 'CHUA_CO_NGUONG'},
        ))),
      )));
      expect(find.text('● Chưa có ngưỡng đánh giá'), findsOneWidget);
      expect(find.textContaining('Bình thường'), findsNothing);
      expect(tester.takeException(), isNull);
    });
  }
}
