import test from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import fs from 'node:fs';
import {parseAlertTime,formatAlertTime,vietnamAlertParts,alertElapsedMinutes,formatAlertWaiting} from '../src/utils/alertTime.js';
import {formatSosTime} from '../src/utils/sosAlarm.js';
import {relativeLocalDate,formatPortalTime} from '../src/utils/relativePortalData.js';
const NOW=Date.parse('2026-10-27T06:32:00Z');
test('correct UTC, Vietnam offset and legacy wall time identify the same instant without double conversion',()=>{
 const stamps=['2026-10-27T06:20:00Z','2026-10-27T13:20:00+07:00','2026-10-27T13:20:00'];
 for(const stamp of stamps){assert.equal(parseAlertTime(stamp).getTime(),Date.parse(stamps[0]));assert.equal(formatAlertTime(stamp,true),'13:20 · 27/10/2026');assert.equal(alertElapsedMinutes(stamp,null,NOW),12);}
});
test('13:20 UTC really displays as 20:20 Vietnam; Z is not stripped or patched',()=>{
 assert.equal(formatAlertTime('2026-10-27T13:20:00Z',true),'20:20 · 27/10/2026');
});
test('Vietnam midnight and year boundary use the Vietnam calendar day',()=>{
 assert.equal(vietnamAlertParts('2026-10-26T17:05:00Z').dayKey,'2026-10-27');
 assert.equal(formatAlertTime('2026-12-31T17:05:00Z'),'01/01/2027 00:05');
 assert.equal(alertElapsedMinutes('2026-10-26T23:55:00+07:00',null,Date.parse('2026-10-27T00:07:00+07:00')),12);
});
test('new/12/over60 minutes and rounding use a fixed clock',()=>{
 assert.equal(alertElapsedMinutes('2026-10-27T06:32:00Z',null,NOW),0);
 assert.equal(alertElapsedMinutes('2026-10-27T06:20:00Z',null,NOW),12);
 assert.equal(alertElapsedMinutes('2026-10-27T05:20:00Z',null,NOW),72);
 assert.equal(alertElapsedMinutes('2026-10-27T06:19:59.500Z',null,NOW),12);
});
for(const value of[null,'bad','2026-02-30T06:20:00Z','2026-10-27T24:00:00Z','2026-10-27T06:20:00+07:99'])
 test(`invalid UI timestamp ${value} is unknown`,()=>{assert.equal(parseAlertTime(value),null);assert.equal(formatAlertTime(value),'—');assert.equal(alertElapsedMinutes(value,null,NOW),null);});
test('future/reversed intervals and null SLA never display as just recorded',()=>{
 assert.equal(alertElapsedMinutes('2026-10-27T06:33:00Z',null,NOW),null);
 assert.equal(alertElapsedMinutes('2026-10-27T06:32:00Z','2026-10-27T06:31:00Z'),null);
 assert.equal(formatAlertWaiting(null),'Chưa rõ thời gian');assert.equal(formatAlertWaiting(0),'Vừa ghi nhận');assert.equal(formatAlertWaiting(12),'12 phút');
});
test('existing SOS/relative readers accept canonical UTC; medication/appointment/metric wall-time behavior stays unchanged',()=>{
 for(const stamp of['2026-10-27T06:20:00Z','2026-10-27T13:20:00+07:00','2026-10-27T13:20:00']){
  assert.equal(relativeLocalDate(stamp).getTime(),parseAlertTime(stamp).getTime());
  assert.match(formatPortalTime(stamp),/13:20/);assert.match(formatSosTime(stamp),/13:20:00/);
 }
});
test('formatting stays in Vietnam when browser/Node host timezone changes',()=>{
 const url=new URL('../src/utils/alertTime.js',import.meta.url).href;
 for(const [TZ,offset]of[['UTC',0],['Asia/Ho_Chi_Minh',-420],['America/Los_Angeles',420]]){
  const result=spawnSync(process.execPath,['--input-type=module','-e',`import {formatAlertTime} from ${JSON.stringify(url)};process.stdout.write(JSON.stringify({formatted:formatAlertTime('2026-10-26T17:05:00Z'),offset:new Date('2026-10-26T17:05:00Z').getTimezoneOffset()}));`],{env:{...process.env,TZ},encoding:'utf8'});
  assert.equal(result.status,0,result.stderr);const actual=JSON.parse(result.stdout);assert.equal(actual.formatted,'27/10/2026 00:05');assert.equal(actual.offset,offset);
 }
});
test('Dashboard, list and detail use the explicit Vietnam formatter; no local-zone date formatting remains for alert timestamps',()=>{
 const read=file=>fs.readFileSync(new URL(`../src/${file}`,import.meta.url),'utf8');
 assert.match(read('pages/Dashboard/DashboardPage.jsx'),/formatAlertTime\(alert.thoiGianPhatHien, true\)/);
 const list=read('pages/Alerts/AlertsPage.jsx');assert.match(list,/vietnamAlertParts/);assert.doesNotMatch(list,/dayjs\((?:value|alert.thoiGianPhatHien|item.thoiGianXuLy)\)/);
});
