import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import { metricTime, metricNow } from '../src/utils/healthMetricTime.js';
import { relativeLocalDate, formatPortalTime } from '../src/utils/relativePortalData.js';

const NOW = Date.parse('2026-10-27T17:30:00Z'); // Vietnam 28/10 00:30.
for (const [instant, expected] of [
  ['2026-10-27T06:05:00Z', '27/10/2026 13:05'],
  ['2026-10-27T16:55:00Z', '27/10/2026 23:55'],
  ['2026-10-27T23:55:00+07:00', '27/10/2026 23:55'],
  ['2026-10-27T23:55:00', '27/10/2026 23:55'],
  ['2026-12-31T17:05:00Z', '01/01/2027 00:05'],
]) test(`measurement instant formats in Vietnam without a second conversion: ${instant}`, () => {
  const time = metricTime({ thoiGianDo: instant }); assert.equal(time.format('DD/MM/YYYY HH:mm'), expected);
  assert.equal(time.valueOf(), relativeLocalDate(instant).getTime());
  assert.ok(formatPortalTime(instant).includes(time.format('HH:mm')));
});

test('actual 13:05 UTC remains a real UTC instant and displays as 20:05 Vietnam', () => {
  assert.equal(metricTime({ thoiGianDo: '2026-10-27T13:05:00Z' }).format('HH:mm'), '20:05');
});

test('legacy date/time fields and invalid measurements keep explicit semantics', () => {
  assert.equal(metricTime({ ngayDo: '2026-10-27', gioDo: '23:55' }).format('DD/MM HH:mm'), '27/10 23:55');
  for (const value of ['bad', '2026-02-30T13:05:00Z', '2026-10-27T24:00:00Z'])
    assert.equal(metricTime({ thoiGianDo: value }).isValid(), false);
});

test('fixed-clock 24-hour filtering and Vietnam calendar-day boundaries are correct', () => {
  const now = metricNow(NOW); assert.equal(now.format('YYYY-MM-DD HH:mm'), '2026-10-28 00:30');
  const midnight = now.startOf('day');
  const late = metricTime({ thoiGianDo: '2026-10-27T16:55:00Z' });
  assert.ok(late.isBefore(midnight)); assert.ok(!late.isBefore(now.subtract(24, 'hour')));
  assert.equal(late.format('DD/MM'), '27/10'); assert.equal(late.format('HH:mm · DD/MM/YYYY'), '23:55 · 27/10/2026');
  assert.ok(metricTime({ thoiGianDo: '2026-10-26T17:29:59Z' }).isBefore(now.subtract(24, 'hour')));
});

test('health formatter and new-entry defaults stay in Vietnam under UTC and US host timezones', () => {
  const url = new URL('../src/utils/healthMetricTime.js', import.meta.url).href;
  const dayjsUrl = new URL('../node_modules/dayjs/dayjs.min.js', import.meta.url).href;
  for (const [TZ, offset] of [['UTC', 0], ['Asia/Ho_Chi_Minh', -420], ['America/Los_Angeles', 420]]) {
    const child = spawnSync(process.execPath, ['--input-type=module', '-e', `import dayjs from ${JSON.stringify(dayjsUrl)}; import {metricTime,metricNow} from ${JSON.stringify(url)};
      process.stdout.write(JSON.stringify({formatted:metricTime({thoiGianDo:'2026-10-27T16:55:00Z'}).format('YYYY-MM-DD HH:mm'),
      now:metricNow(${NOW}).format('YYYY-MM-DD HH:mm'),offset:new Date(${NOW}).getTimezoneOffset(),defaultDayjsOffset:dayjs(${NOW}).utcOffset()}));`], { env: { ...process.env, TZ }, encoding: 'utf8' });
    assert.equal(child.status, 0, child.stderr); assert.deepEqual(JSON.parse(child.stdout), {
      formatted: '2026-10-27 23:55', now: '2026-10-28 00:30', offset, defaultDayjsOffset: offset === 0 ? 0 : -offset });
  }
});

test('page uses one formatter for sorting, history, detail, chart and period filtering', () => {
  const source = fs.readFileSync(new URL('../src/pages/HealthMetrics/HealthMetricsPage.jsx', import.meta.url), 'utf8');
  assert.match(source, /import \{ metricTime, metricNow \}/);
  assert.match(source, /metricTime\(record\).format\('HH:mm'\)/);
  assert.match(source, /metricTime\(record\).format\('HH:mm · DD\/MM\/YYYY'\)/);
  assert.match(source, /period === '24h' \? metricTime\(metric\).format\('HH:mm'\)/);
  assert.match(source, /const now = metricNow\(\)/);
  assert.doesNotMatch(source, /dayjs\(metric\.thoiGianDo/);
});
