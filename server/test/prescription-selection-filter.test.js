const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { createRequire } = require('node:module');
const { pathToFileURL } = require('node:url');
const { todayVietnam } = require('../src/utils/vietnamDate');

function fixture() {
  let databaseTouched = false;
  const filename = path.resolve(__dirname, '../src/controllers/donThuoc.controller.js');
  const module = { exports: {} };
  vm.runInNewContext(`${fs.readFileSync(filename, 'utf8')}\nmodule.exports.validate = validatePrescription;`, {
    module, exports: module.exports,
    require: name => name === '../config/db'
      ? { poolPromise: { then() { databaseTouched = true; throw new Error('TEST MUST NOT USE SQL'); } }, sql: {} }
      : name === '../utils/response' ? {
        fail: (res, message, errorCode, status) => Object.assign(res, { status, message, errorCode }),
      } : name === '../socket' ? { emitToUser() {}, emitToAdmin() {} } : createRequire(filename)(name),
  }, { filename });
  return { controller: module.exports, touched: () => databaseTouched };
}
const medicine = id => ({ thuocId: id, lieuDung: 'TEST DOSAGE', soLanMoiNgay: 1, gioUong: ['08:00'] });
const prescription = items => ({ ngayBatDau: todayVietnam(), danhSachThuoc: items });
const rules = () => import(pathToFileURL(path.resolve(__dirname, '../../frontend/src/utils/medicationScheduleRules.js')).href);

test('Backend rejects repeated medicine IDs before SQL even when times/dosages differ or IDs are string/number', async () => {
  for (const items of [[medicine(1), medicine(1)], [medicine(1), { ...medicine('1'), gioUong: ['20:00'], lieuDung: 'DIFFERENT' }],
    [medicine(1), medicine(2), medicine('01')]]) {
    const f = fixture(), res = {};
    await f.controller.create({ params: { id: '7' }, body: prescription(items), user: { userId: 1 } }, res, error => { throw error; });
    assert.equal(res.status, 400); assert.equal(res.errorCode, 'INVALID_PRESCRIPTION');
    assert.match(res.message, /đã được chọn ở dòng 1/); assert.equal(f.touched(), false);
  }
});

test('Distinct medicines and several daily times in one row remain valid; duplicate hours are still rejected', () => {
  const { controller } = fixture();
  assert.equal(controller.validate(prescription([medicine(1), medicine(2)])), null);
  assert.equal(controller.validate(prescription([{ ...medicine(1), soLanMoiNgay: 2, gioUong: ['08:00', '20:00'] }])), null);
  assert.match(controller.validate(prescription([{ ...medicine(1), soLanMoiNgay: 2, gioUong: ['08:00', '08:00'] }])), /gioUong khong duoc trung/);
  // Reusing a medicine in a different prescription is not forbidden.
  assert.equal(controller.validate(prescription([medicine(1)])), null);
  assert.equal(controller.validate(prescription([medicine(1)])), null);
});

test('UI disables only medicine IDs selected in other rows and releases them when removed/changed', async () => {
  const { selectedMedicineIds, findDuplicateMedicine } = await rules();
  const rows = [{ thuocId: 1 }, { thuocId: '2' }, {}];
  assert.deepEqual([...selectedMedicineIds(rows, 0)], [2]);
  assert.deepEqual([...selectedMedicineIds(rows, 1)], [1]);
  assert.deepEqual([...selectedMedicineIds(rows, 2)], [1, 2]);
  assert.equal(findDuplicateMedicine(rows), null);
  assert.deepEqual(findDuplicateMedicine([{ thuocId: 1 }, {}, { thuocId: '01' }]), { index: 2, firstIndex: 0, id: 1 });
  assert.deepEqual([...selectedMedicineIds([rows[0]], 0)], []);
  assert.deepEqual([...selectedMedicineIds([{ thuocId: 3 }, rows[1]], 1)], [3]);
  assert.equal(findDuplicateMedicine([{}, { thuocId: null }, { thuocId: undefined }]), null);
});

test('Date filter includes entire boundary days, supports a single day, cleared and open-ended ranges', async () => {
  const { matchesScheduleDateRange } = await rules();
  const schedules = ['2026-10-21T23:59:59', '2026-10-22T00:00:00', '2026-10-22T23:59:59', '2026-10-23T00:00:00', '2026-10-24T00:00:00']
    .map(thoiGianDuKien => ({ thoiGianDuKien }));
  assert.deepEqual(schedules.map(row => matchesScheduleDateRange(row, '2026-10-22', '2026-10-22')), [false, true, true, false, false]);
  assert.deepEqual(schedules.map(row => matchesScheduleDateRange(row, '2026-10-22', '2026-10-23')), [false, true, true, true, false]);
  assert.equal(schedules.filter(row => matchesScheduleDateRange(row, null, null)).length, 5);
  assert.equal(schedules.filter(row => matchesScheduleDateRange(row, '2026-10-23', null)).length, 2);
  assert.equal(schedules.filter(row => matchesScheduleDateRange(row, null, '2026-10-21')).length, 1);
});

test('Date filter uses scheduled day, not confirmation day, rejects bad dates and composes with other filters', async () => {
  const { matchesScheduleDateRange, scheduledDate } = await rules();
  const dose = { thoiGianDuKien: '2026-10-22T00:00:00', thoiGianThucTe: '2026-10-23T01:00:00',
    nguoiCaoTuoiId: 7, trangThaiHom_nay: 'DA_UONG' };
  assert.equal(scheduledDate(dose), '2026-10-22');
  assert.equal(matchesScheduleDateRange(dose, '2026-10-22', '2026-10-22'), true);
  assert.equal(matchesScheduleDateRange(dose, '2026-10-23', '2026-10-23'), false);
  assert.equal([dose, { ...dose, nguoiCaoTuoiId: 8 }].filter(row => row.nguoiCaoTuoiId === 7
    && row.trangThaiHom_nay === 'DA_UONG' && matchesScheduleDateRange(row, '2026-10-22', '2026-10-22')).length, 1);
  for (const thoiGianDuKien of [null, '', 'invalid', '2026-02-30T08:00:00']) {
    assert.equal(matchesScheduleDateRange({ thoiGianDuKien }, '2026-01-01', '2026-12-31'), false);
  }
});

test('Web page wires duplicate prevention and date controls into the real list without changing today KPIs', () => {
  const source = fs.readFileSync(path.resolve(__dirname, '../../frontend/src/pages/MedicationSchedule/MedicationSchedulePage.jsx'), 'utf8');
  assert.match(source, /Form.useWatch\('danhSachThuoc', form\)/);
  assert.match(source, /disabled: selectedElsewhere.has\(Number\(medication.id\)\)/);
  assert.ok(source.indexOf('findDuplicateMedicine(values.danhSachThuoc)') < source.indexOf('await createPrescription('));
  assert.match(source, /matchesSearch && matchesElder && matchesStatus && matchesShift && matchesDate/);
  assert.match(source, /DatePicker.RangePicker/); assert.match(source, /onChange=\{setDateRange\}/);
  assert.match(source, /setDateRange\(null\)/); assert.match(source, /title: 'Ngày uống'/);
  assert.match(source, /const total = todaySchedules.length/);
});
