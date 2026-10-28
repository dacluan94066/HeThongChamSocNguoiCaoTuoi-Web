import test from 'node:test';
import assert from 'node:assert/strict';
import { metricAssessment } from '../src/utils/metricAssessment.js';

test('AUD-13: missing thresholds/metadata never implies normal', () => {
  for (const row of [{}, { laBatThuong: false }, { laBatThuong: false, trangThaiDanhGia: 'CHUA_CO_NGUONG' }]) {
    assert.equal(metricAssessment(row).state, 'CHUA_CO_NGUONG');
    assert.equal(metricAssessment(row).color, 'default');
  }
  assert.equal(metricAssessment({ laBatThuong: false, trangThaiDanhGia: 'BINH_THUONG' }).state, 'BINH_THUONG');
  assert.equal(metricAssessment({ laBatThuong: true, trangThaiDanhGia: 'CHUA_CO_NGUONG' }).state, 'BAT_THUONG');
  assert.equal(metricAssessment({ binhThuong: false }).state, 'BAT_THUONG');
});
