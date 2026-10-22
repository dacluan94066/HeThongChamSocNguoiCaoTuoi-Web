import 'package:flutter/material.dart';
import '../../theme/care_senior_theme.dart';
import '../appointments/appointment_screen.dart';
import '../medication/medication_screen.dart';

/// Navigation only. The original screens own all data, filters and callbacks.
class ScheduleScreen extends StatefulWidget {
  const ScheduleScreen({
    super.key,
    required this.selectedIndex,
    required this.onSelected,
  }) : assert(selectedIndex == 0 || selectedIndex == 1);
  final int selectedIndex;
  final ValueChanged<int> onSelected;

  @override
  State<ScheduleScreen> createState() => _ScheduleScreenState();
}

class _ScheduleScreenState extends State<ScheduleScreen> {
  final _visited = <int>{};
  @override
  void initState() {
    super.initState();
    _visited.add(widget.selectedIndex);
  }

  @override
  void didUpdateWidget(covariant ScheduleScreen oldWidget) {
    super.didUpdateWidget(oldWidget);
    _visited.add(widget.selectedIndex);
  }

  @override
  Widget build(BuildContext context) => Column(
    children: [
      SafeArea(
        bottom: false,
        child: Padding(
          padding: const EdgeInsets.fromLTRB(16, 8, 16, 10),
          child: DecoratedBox(
            decoration: BoxDecoration(
              color: Colors.white,
              borderRadius: BorderRadius.circular(24),
              border: Border.all(color: CareSeniorColors.border),
            ),
            child: Padding(
              padding: const EdgeInsets.all(4),
              child: IntrinsicHeight(
                child: Row(
                  crossAxisAlignment: CrossAxisAlignment.stretch,
                  children: [
                    for (var i = 0; i < 2; i++)
                      Expanded(
                        child: Semantics(
                          selected: widget.selectedIndex == i,
                          button: true,
                          child: Material(
                            color: widget.selectedIndex == i
                                ? CareSeniorColors.primary
                                : Colors.transparent,
                            borderRadius: BorderRadius.circular(20),
                            child: InkWell(
                              key: ValueKey('schedule-tab-$i'),
                              borderRadius: BorderRadius.circular(20),
                              onTap: () => widget.onSelected(i),
                              child: ConstrainedBox(
                                constraints: const BoxConstraints(
                                  minHeight: 56,
                                ),
                                child: Padding(
                                  padding: const EdgeInsets.symmetric(
                                    horizontal: 12,
                                    vertical: 12,
                                  ),
                                  child: Row(
                                    mainAxisAlignment: MainAxisAlignment.center,
                                    children: [
                                      Icon(
                                        i == 0
                                            ? Icons.medication_outlined
                                            : Icons.event_outlined,
                                        size: 22,
                                        color: widget.selectedIndex == i
                                            ? Colors.white
                                            : CareSeniorColors.deepGreen,
                                      ),
                                      const SizedBox(width: 8),
                                      Flexible(
                                        child: Text(
                                          i == 0 ? 'Lịch thuốc' : 'Lịch khám',
                                          textAlign: TextAlign.center,
                                          style: TextStyle(
                                            fontSize: 16,
                                            fontWeight: FontWeight.w700,
                                            color: widget.selectedIndex == i
                                                ? Colors.white
                                                : CareSeniorColors.deepGreen,
                                          ),
                                        ),
                                      ),
                                    ],
                                  ),
                                ),
                              ),
                            ),
                          ),
                        ),
                      ),
                  ],
                ),
              ),
            ),
          ),
        ),
      ),
      Expanded(
        child: MediaQuery.removePadding(
          context: context,
          removeTop: true,
          child: IndexedStack(
            index: widget.selectedIndex,
            children: [
              for (var i = 0; i < 2; i++)
                TickerMode(
                  enabled: widget.selectedIndex == i,
                  child: _visited.contains(i)
                      ? i == 0
                            ? const MedicationScreen()
                            : const AppointmentScreen()
                      : const SizedBox.shrink(),
                ),
            ],
          ),
        ),
      ),
    ],
  );
}
