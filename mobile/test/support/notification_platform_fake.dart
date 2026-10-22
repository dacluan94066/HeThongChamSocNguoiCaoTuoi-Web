import 'dart:async';
import 'package:flutter/services.dart';
import 'package:flutter_local_notifications/flutter_local_notifications.dart';
import 'package:flutter_test/flutter_test.dart';

/// Test-only Android method channel; never requests real OS permissions.
class NotificationPlatformFake {
  final pending = <int, Map<String, dynamic>>{};
  final scheduled = <Map<String, dynamic>>[];
  final cancelled = <int>[];
  final cancelledRequests = <Map<String, dynamic>>[];
  final active = <int, Map<String, dynamic>>{};
  bool enabled = true;
  bool exact = true;
  Completer<void>? holdSchedule;
  Completer<void>? scheduleStarted;

  void install() {
    AndroidFlutterLocalNotificationsPlugin.registerWith();
    TestDefaultBinaryMessengerBinding.instance.defaultBinaryMessenger
        .setMockMethodCallHandler(
          const MethodChannel('dexterous.com/flutter/local_notifications'),
          (call) async {
            switch (call.method) {
              case 'initialize':
                return true;
              case 'getNotificationAppLaunchDetails':
                return {'notificationLaunchedApp': false};
              case 'areNotificationsEnabled':
              case 'requestNotificationsPermission':
                return enabled;
              case 'canScheduleExactNotifications':
              case 'requestExactAlarmsPermission':
                return exact;
              case 'pendingNotificationRequests':
                return pending.values.toList();
              case 'getActiveNotifications':
                return active.values.toList();
              case 'zonedSchedule':
                final args = Map<String, dynamic>.from(call.arguments as Map);
                if (scheduleStarted?.isCompleted == false) {
                  scheduleStarted!.complete();
                }
                await holdSchedule?.future;
                scheduled.add(args);
                pending[args['id'] as int] = args;
                return null;
              case 'cancel':
                cancelledRequests.add(
                  Map<String, dynamic>.from(call.arguments as Map),
                );
                final id = (call.arguments as Map)['id'] as int;
                cancelled.add(id);
                pending.remove(id);
                if (active[id]?['tag'] == (call.arguments as Map)['tag']) {
                  active.remove(id);
                }
                return null;
              default:
                return null;
            }
          },
        );
  }
}
