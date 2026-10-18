import 'dart:async';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:elderly_care_app/services/api_client.dart';
import 'package:elderly_care_app/services/care_today_service.dart';
import 'package:elderly_care_app/screens/care/care_report_screen.dart';

class ReportApi extends CareTodayService{
 final queries=<Map<String,dynamic>>[];bool offline=false;Completer<dynamic>? pending;
 @override Future<dynamic> request(String path,{String method='GET',Map<String,dynamic>? data,Map<String,dynamic>? query})async{
  queries.add({'path':path,'query':query,'method':method});if(offline)throw const ApiException('Không thể kết nối');
  if(pending!=null){final p=pending!;pending=null;return p.future;}
  return {'profile':{'hoTen':path.contains('/2/')?'TEST ONLY B':'TEST ONLY A'},'from':'2026-10-05','to':'2026-10-11','generatedAt':'2026-10-11T12:00:00','hasData':false,
   'medication':{'confirmed':0,'scheduled':0,'withoutConfirmation':0,'byStatus':{}},'appointments':{'total':0,'byStatus':{}},'activities':{'completed':0,'scheduled':0,'withoutConfirmation':0},
   'lifestyle':{'records':0,'totals':{'mealCount':null,'waterMl':null,'sleepMinutes':null,'exerciseMinutes':null,'moodCount':null}},'alerts':{'total':0,'bySource':[]},'measurementCount':0,'daily':[]};
 }
}
void main(){
 setUp(()async{FlutterSecureStorage.setMockInitialValues({});await ApiClient.clearSession();});
 testWidgets('Report 30 day navigation loads correct range and only reads',(t)async{
  final api=ReportApi();await t.pumpWidget(MaterialApp(home:CareReportScreen(profileId:1,initialDays:30,service:api)));await t.pumpAndSettle();
  expect(api.queries.single['query'],{'days':30});expect(api.queries.single['method'],'GET');expect(find.text('TEST ONLY A'),findsOneWidget);
  await t.tap(find.text('7 ngày'));await t.pumpAndSettle();expect(api.queries.last['query'],{'days':7});
  expect(find.textContaining('Chưa có dữ liệu chăm sóc'),findsOneWidget);expect(find.textContaining('Nước: Chưa ghi nhận'),findsNothing);
  await t.scrollUntilVisible(find.textContaining('Nước: Chưa ghi nhận'),150);expect(find.textContaining('Nước: Chưa ghi nhận'),findsOneWidget);
 });
 testWidgets('Report profile changes reload every source, stale account response hidden',(t)async{
  final api=ReportApi();await t.pumpWidget(MaterialApp(home:CareReportScreen(profileId:1,service:api)));await t.pumpAndSettle();
  await t.pumpWidget(MaterialApp(home:CareReportScreen(profileId:2,service:api)));await t.pumpAndSettle();expect(find.text('TEST ONLY B'),findsOneWidget);expect(find.text('TEST ONLY A'),findsNothing);expect(api.queries.last['path'],'/care/2/report');
  final wait=Completer<dynamic>();api.pending=wait;await t.tap(find.byTooltip('Tạo lại báo cáo'));await t.pump();await t.runAsync(()=>ApiClient.clearSession());await t.pump();wait.complete({'profile':{'hoTen':'STALE PRIVATE'}});await t.pumpAndSettle();expect(find.text('STALE PRIVATE'),findsNothing);expect(find.textContaining('Phiên đã thay đổi'),findsOneWidget);
 });
 testWidgets('Report network error remains error, retry and large text supported',(t)async{
  final api=ReportApi()..offline=true;t.view.physicalSize=const Size(320,640);t.view.devicePixelRatio=1;addTearDown(t.view.resetPhysicalSize);addTearDown(t.view.resetDevicePixelRatio);
  await t.pumpWidget(MaterialApp(builder:(c,w)=>MediaQuery(data:MediaQuery.of(c).copyWith(textScaler:const TextScaler.linear(1.6)),child:w!),home:CareReportScreen(profileId:1,service:api)));await t.pumpAndSettle();
  expect(find.text('Không thể kết nối'),findsOneWidget);expect(find.textContaining('Chưa có dữ liệu chăm sóc'),findsNothing);
  api.offline=false;await t.tap(find.text('Thử lại'));await t.pumpAndSettle();await t.scrollUntilVisible(find.text('Cảnh báo'),150);expect(t.takeException(),isNull);
 });
}
