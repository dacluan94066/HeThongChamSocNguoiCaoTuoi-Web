import test from 'node:test';
import assert from 'node:assert/strict';
import { medicationPendingLabel } from '../src/utils/medicationStatus.js';

const now = new Date('2026-10-22T22:36:00+07:00');
test('future pending dose remains Chưa đến giờ', () => {
  assert.equal(medicationPendingLabel('2026-10-22T23:00:00+07:00', now), 'Chưa đến giờ');
});
test('past pending dose is Chưa xác nhận uống, not BoLo', () => {
  assert.equal(medicationPendingLabel('2026-10-22T21:40:00+07:00', now), 'Chưa xác nhận uống');
});
test('at the due instant it is no longer upcoming', () => {
  assert.equal(medicationPendingLabel(now.toISOString(), now), 'Chưa xác nhận uống');
});
test('missing or invalid dates never claim Chưa đến giờ', () => {
  for (const value of [null, undefined, '', 'invalid']) {
    assert.equal(medicationPendingLabel(value, now), 'Chưa xác nhận uống');
  }
});
test('SQL Vietnam wall-clock values match the same local-clock instant', () => {
  const localNow = new Date(2026, 9, 22, 22, 36);
  assert.equal(medicationPendingLabel('2026-10-22T21:40:00', localNow), 'Chưa xác nhận uống');
  assert.equal(medicationPendingLabel('2026-10-22T23:00:00', localNow), 'Chưa đến giờ');
});
