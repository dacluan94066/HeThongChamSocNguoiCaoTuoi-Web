import test from 'node:test';
import assert from 'node:assert/strict';
import { createElderlyCareApi, createSingleFlight, editableProfile, doseProgress, latestMetrics, dayOf, ownDay, inDays, canRecordPastDose } from '../src/utils/elderlyCare.js';
import { formatAlertTime } from '../src/utils/alertTime.js';

function fixture(rows = []) {
  const calls = [];
  const client = Object.fromEntries(['get', 'post', 'put', 'patch'].map(method => [method, async (...args) => {
    calls.push({ method, args }); return { data: { data: rows } };
  }]));
  return { calls, api: createElderlyCareApi(client) };
}
test('own relatives adapter uses only /me, preserves session scope, rejects another owner and never writes', async () => {
  const f = fixture([{ id: 71, nguoiCaoTuoiId: 42, hoTen: 'Family fixture' }]);
  const abort = new AbortController(); await f.api.relatives(42, abort.signal);
  assert.equal(f.calls[0].method, 'get'); assert.equal(f.calls[0].args[0], '/elderly/me/relatives');
  assert.equal(f.calls[0].args[1].params, undefined); assert.equal(f.calls[0].args[1].signal, abort.signal);
  await assert.rejects(fixture([{ nguoiCaoTuoiId: 99 }]).api.relatives(42), /không khớp/);
  await assert.rejects(fixture({}).api.relatives(42), /không hợp lệ/);
});
test('own care API only uses Mobile own endpoints; queries cannot inject a foreign elderly ID', async () => {
  const f = fixture([{ id: 2, nguoiCaoTuoiId: 42 }]), signal = new AbortController().signal;
  await f.api.metrics(42, { nguoiCaoTuoiId: 999, loaiChiSoId: 1, tuNgay: '2026-10-27', denNgay: '2026-10-28' }, signal);
  await f.api.medications(42, '2026-10-27', signal);
  await f.api.appointments(42, true, signal); await f.api.appointments(42, false, signal); await f.api.caregivers(signal); await f.api.types(signal);
  assert.deepEqual(f.calls.map(row => row.args[0]), ['/elderly/me/health-metrics', '/elderly/me/medication-schedule', '/elderly/me/appointments/upcoming', '/elderly/me/appointments', '/elderly/me/caregivers', '/health-metric-types']);
  assert.equal('nguoiCaoTuoiId' in f.calls[0].args[1].params, false);
  for (const call of f.calls) { assert.equal(call.args[1].signal, signal); assert.equal(call.args[1].elderlyPortalRequest, true); }
});
test('foreign records or invalid envelopes fail closed rather than rendering another NCT', async () => {
  const f = fixture([{ nguoiCaoTuoiId: 999 }]);
  for (const work of [() => f.api.metrics(42), () => f.api.medications(42, '2026-10-27'), () => f.api.appointments(42, true)]) await assert.rejects(work, /không khớp/);
  await assert.rejects(fixture({}).api.metrics(42), /không hợp lệ/);
});
test('capture the Web session synchronously before Axios dispatch to prevent a queued request using a new account', async () => {
  const stamp = { token: 'original-session', revision: 3 }; let sent;
  const api = createElderlyCareApi({ get: async (path, config) => { sent = config.webSessionStamp; return { data: { data: [] } }; } }, () => stamp);
  await api.metrics(42, {}); assert.equal(sent, stamp);
});
test('metric POST cannot set owner, time, assessment or send irrelevant fields', async () => {
  const f = fixture();
  await f.api.addMetric({ loaiChiSoId: 1, giaTri: 120, giaTriPhu: 80, ghiChu: 'đã nghỉ', nguoiCaoTuoiId: 999, thoiGianDo: '1990-01-01', laBatThuong: false });
  assert.deepEqual(f.calls[0].args[1], { loaiChiSoId: 1, giaTri: 120, giaTriPhu: 80, ghiChu: 'đã nghỉ' });
  assert.equal(f.calls[0].method, 'post');
});
test('profile edit keeps the existing field contract and never edits CCCD, status, role or account identity', async () => {
  const values = { hoTen: 'Người thử', ngaySinh: { format: pattern => pattern === 'YYYY-MM-DD' ? '1950-01-01' : '' }, email: 'test@example.invalid', cccd: '000000000000', userId: 99, id: 99, trangThai: 'DangTheoDoi', tenVaiTro: 'QuanTriVien' };
  assert.deepEqual(editableProfile(values), { hoTen: 'Người thử', ngaySinh: '1950-01-01', email: 'test@example.invalid' });
  const f = fixture(); await f.api.updateProfile(values);
  assert.equal(f.calls[0].args[0], '/elderly/me'); assert.deepEqual(f.calls[0].args[1], editableProfile(values));
});
test('confirmation and supplement use the original distinct contracts', async () => {
  const f = fixture(); await f.api.confirmDose(5, 'DaUong');
  await f.api.supplementDose(5, { thoiGianThucTe: '2026-10-26T21:40:00+07:00', lyDo: 'Đã uống, quên ghi nhận', trangThai: 'Bogus', nguoiCaoTuoiId: 99 });
  assert.deepEqual(f.calls.map(row => [row.method, row.args[0]]), [['patch', '/medication-schedule/5/confirm'], ['patch', '/medication-schedule/5/supplement']]);
  assert.deepEqual(f.calls[0].args[1], { trangThai: 'DaUong' });
  assert.deepEqual(f.calls[1].args[1], { thoiGianThucTe: '2026-10-26T21:40:00+07:00', lyDo: 'Đã uống, quên ghi nhận' });
  await assert.rejects(f.api.confirmDose(5, 'Bogus')); await assert.rejects(f.api.confirmDose('../99', 'DaUong')); assert.equal(f.calls.length, 2);
});
test('same-render double click makes one request; failures release the lock for an explicit retry', async () => {
  const flight = createSingleFlight(); let count = 0, release;
  const first = flight(async () => { count++; return new Promise(resolve => { release = resolve; }); });
  assert.deepEqual(await flight(async () => { count++; }), { ignored: true });
  release('saved'); assert.deepEqual(await first, { value: 'saved' }); assert.equal(count, 1);
  await assert.rejects(flight(() => { throw Error('422'); }), /422/);
  assert.deepEqual(await flight(() => 'retry'), { value: 'retry' });
});
test('Vietnam wall times, UTC and midnight keep the same intended dates without double conversion', () => {
  assert.equal(formatAlertTime('2026-10-27T13:05:00'), '27/10/2026 13:05');
  assert.equal(formatAlertTime('2026-10-27T23:55:00'), '27/10/2026 23:55');
  assert.equal(formatAlertTime('2026-10-27T16:55:00Z'), '27/10/2026 23:55');
  assert.equal(dayOf('2026-10-27T17:05:00Z'), '2026-10-28');
  assert.equal(ownDay(new Date('2026-10-27T17:05:00Z')), '2026-10-28');
  assert.equal(inDays('2026-10-27T16:55:00Z', '2026-10-27', '2026-10-27'), true);
});
test('latest metrics and progress count actual rows/doses, preserving values and backend assessment', () => {
  const rows = [{ id: 1, loaiChiSoId: 1, giaTri: 110, thoiGianDo: '2026-10-26T23:55:00' }, { id: 2, loaiChiSoId: 1, giaTri: 125, laBatThuong: true, thoiGianDo: '2026-10-27T13:05:00' }, { id: 3, loaiChiSoId: 2, giaTri: 37.2, thoiGianDo: '2026-10-27T23:55:00' }];
  assert.deepEqual(latestMetrics(rows).map(row => row.id).sort(), [2, 3]); assert.equal(rows[0].giaTri, 110);
  assert.deepEqual(doseProgress([{ trangThai: 'DaUong' }, { trangThai: 'DaUong' }, { trangThai: 'BoLo' }, { trangThai: 'ChuaDenGio' }]), { total: 4, done: 2 });
  assert.deepEqual(doseProgress([]), { total: 0, done: 0 });
});
test('past-dose UI follows 48 hour eligibility; backend remains the final authority', () => {
  const row = { trangThai: 'BoLo', thoiGianDuKien: '2026-10-26T21:40:00' };
  assert.equal(canRecordPastDose(row, new Date('2026-10-28T14:40:00Z')), true);
  assert.equal(canRecordPastDose(row, new Date('2026-10-28T14:40:01Z')), false);
  assert.equal(canRecordPastDose({ ...row, trangThai: 'DaUong' }, new Date('2026-10-27T00:00:00Z')), false);
  assert.equal(canRecordPastDose({ ...row, ghiNhanBoSung: {} }, new Date('2026-10-27T00:00:00Z')), false);
  assert.equal(canRecordPastDose(row, new Date('2026-10-26T15:00:00Z')), false, 'Same-day uses the existing confirm API');
});
