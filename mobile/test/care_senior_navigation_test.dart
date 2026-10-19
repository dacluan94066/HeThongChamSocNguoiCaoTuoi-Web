import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:elderly_care_app/theme/care_senior_theme.dart';
import 'package:elderly_care_app/widgets/care_senior_ui.dart';

void main() {
  for (final size in [const Size(360, 740), const Size(412, 915)]) {
    testWidgets('bottom navigation fits ${size.width} logical pixels', (
      tester,
    ) async {
      await tester.binding.setSurfaceSize(size);
      addTearDown(() => tester.binding.setSurfaceSize(null));
      var selected = -1;
      await tester.pumpWidget(
        MaterialApp(
          theme: CareSeniorTheme.data,
          home: MediaQuery(
            data: MediaQueryData(
              size: size,
              textScaler: const TextScaler.linear(1.8),
            ),
            child: Scaffold(
              bottomNavigationBar: AppBottomNavigation(
                selectedIndex: 0,
                onSelected: (index) => selected = index,
              ),
            ),
          ),
        ),
      );
      expect(find.text('Trang chủ'), findsOneWidget);
      expect(find.text('Lịch thuốc'), findsOneWidget);
      expect(find.text('Lịch khám'), findsOneWidget);
      expect(find.text('SOS'), findsOneWidget);
      expect(find.text('Cảnh báo'), findsOneWidget);
      expect(find.text('Hồ sơ'), findsOneWidget);
      expect(tester.takeException(), isNull);
      await tester.tap(find.text('SOS'));
      expect(selected, 3);
    });
  }
}
