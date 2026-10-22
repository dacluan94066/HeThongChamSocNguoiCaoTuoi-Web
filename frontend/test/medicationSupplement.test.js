import test from 'node:test';
import assert from 'node:assert/strict';
import { canSupplementDose } from '../src/utils/medicationSupplement.js';

const now = new Date('2026-10-23T05:30:00Z');
const dose = { trangThaiHom_nay: 'BO_LO', thoiGianDuKien: '2026-10-22T21:40:00' };
test('past missed/pending doses in 48 hours offer supplemental recording, not normal confirmation', () => {
  assert.equal(canSupplementDose(dose, now), true);
  assert.equal(canSupplementDose({ ...dose, trangThaiHom_nay: 'CHUA_DEN_GIO' }, now), true);
  for (const trangThaiHom_nay of ['DA_UONG', 'TU_CHOI', 'UNKNOWN']) {
    assert.equal(canSupplementDose({ ...dose, trangThaiHom_nay }, now), false);
  }
});
test('48-hour boundary and Vietnam calendar date are used regardless of local timezone', () => {
  assert.equal(canSupplementDose({ ...dose, thoiGianDuKien: '2026-10-21T12:30:00' }, now), true);
  assert.equal(canSupplementDose({ ...dose, thoiGianDuKien: '2026-10-21T12:29:59' }, now), false);
  assert.equal(canSupplementDose({ ...dose, thoiGianDuKien: '2026-10-23T00:01:00' }, now), false);
  assert.equal(canSupplementDose({ ...dose, thoiGianDuKien: '2026-10-24T08:00:00' }, now), false);
  // UTC still says Oct 22, but Vietnam is already Oct 23.
  assert.equal(canSupplementDose(dose, new Date('2026-10-22T17:01:00Z')), true);
});
test('invalid or already supplemented records never expose a new write action', () => {
  assert.equal(canSupplementDose(undefined, now), false);
  assert.equal(canSupplementDose({ ...dose, ghiNhanBoSung: {} }, now), false);
  assert.equal(canSupplementDose({ ...dose, thoiGianDuKien: null }, now), false);
  assert.equal(canSupplementDose({ ...dose, thoiGianDuKien: 'invalid' }, now), false);
});
