import test from 'node:test';
import assert from 'node:assert/strict';
import { prescriptionDosePreview } from '../src/utils/medicationScheduleRules.js';

const now = new Date('2026-10-28T08:00:00Z'); // 15:00 Vietnam, independent of host TZ
const preview = (times, start = '2026-10-28', end = start, clock = now) => prescriptionDosePreview(start, end, times, clock);
test('past-only today cannot be submitted; mixed times preview the actual first future dose', () => {
  assert.deepEqual(preview(['08:00']), { firstDose: null, skippedToday: 1 });
  assert.deepEqual(preview(['20:00', '08:00']), { firstDose: '2026-10-28T20:00:00', skippedToday: 1 });
});
test('earlier clock time tomorrow and next-day recurrence are valid', () => {
  assert.equal(preview(['08:00'], '2026-10-29').firstDose, '2026-10-29T08:00:00');
  assert.equal(preview(['08:00'], '2026-10-28', '2026-10-29').firstDose, '2026-10-29T08:00:00');
  assert.equal(prescriptionDosePreview('2026-10-28', null, ['08:00'], now).firstDose, '2026-10-29T08:00:00');
});
test('Vietnam midnight and exactly due times are handled by date + time, not local timezone', () => {
  const late = new Date('2026-10-28T16:59:59Z');
  assert.equal(preview(['23:59'], '2026-10-28', '2026-10-28', late).firstDose, null);
  assert.equal(preview(['00:00'], '2026-10-29', '2026-10-29', late).firstDose, '2026-10-29T00:00:00');
  assert.equal(preview(['15:00']).firstDose, null);
  assert.equal(preview(['08:00'], '2026-10-28', '2026-10-29', new Date('2026-10-29T00:00:00+07:00')).firstDose, null);
});
test('incomplete/invalid form has no misleading preview; reversed range has no future dose', () => {
  for (const args of [[null, null, []], ['2026-02-30', null, ['08:00']], ['2026-10-28', null, [null]], ['2026-10-28', null, ['24:00']]]) {
    assert.equal(prescriptionDosePreview(...args, now), null);
  }
  assert.equal(preview(['08:00'], '2026-10-30', '2026-10-29').firstDose, null);
});
