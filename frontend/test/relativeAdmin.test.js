import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { canViewRelativeAdmin, canEditRelativePermission, buildRelativeGrant, buildRelativeUpdate, buildRelativeRevoke,
  hasActiveRelativeLink, relativeErrorInfo, relativeHistoryChanges, vietnamWallTime, consentIso, isFamilyAccount } from '../src/utils/relativeAdmin.js';

const proof = () => ({ nguoiCaoTuoiId: 7, nguoiThanUserId: 10, moiQuanHe: 'Con gái', dongYChiaSe: true,
  nguoiDongY: 'NCT fixture', tuCachDongY: 'Bản thân NCT', thoiDiemDongY: '2025-01-02T09:30:00', canCuDongY: 'Biên bản fixture',
  phamViChiaSe: { benhNen: true, diUng: false, ketQuaKham: true } });
test('only Admin with account-view permission can enter family administration', () => {
  for (const role of ['NguoiChamSoc', 'NguoiCaoTuoi', 'NguoiThan', undefined]) assert.equal(canViewRelativeAdmin({ tenVaiTro: role }, () => true), false);
  assert.equal(canViewRelativeAdmin({ tenVaiTro: 'QuanTriVien' }, () => false), false);
  assert.equal(canViewRelativeAdmin({ tenVaiTro: 'QuanTriVien' }, (feature, action) => feature === 'QLNGUOIDUNG' && action === 'xem'), true);
  assert.equal(isFamilyAccount({ vaiTro: 'NGUOI_THAN' }), true);
  assert.equal(isFamilyAccount({ vaiTro: 'NGUOI_CHAM_SOC' }), false);
});
test('grant sends only approved API fields and preserves every scope boolean', () => {
  const payload = buildRelativeGrant({ ...proof(), nguoiTaoId: 99, actorId: 99, gps: true, version: 'hidden', confirmPassword: 'secret' });
  assert.deepEqual(Object.keys(payload).sort(), ['nguoiCaoTuoiId', 'nguoiThanUserId', 'moiQuanHe', 'dongYChiaSe', 'nguoiDongY', 'tuCachDongY', 'thoiDiemDongY', 'canCuDongY', 'phamViChiaSe'].sort());
  assert.deepEqual(payload.phamViChiaSe, { benhNen: true, diUng: false, ketQuaKham: true });
  assert.equal(payload.thoiDiemDongY, '2025-01-02T09:30:00+07:00');
});
test('unverified consent, missing basis, incomplete scope and invalid identities never become valid payloads', () => {
  for (const mutation of [v => { v.dongYChiaSe = false; }, v => { v.canCuDongY = ' '; }, v => { v.nguoiDongY = ''; },
    v => { delete v.phamViChiaSe.diUng; }, v => { v.phamViChiaSe.diUng = 1; }, v => { v.nguoiCaoTuoiId = '1 OR 1=1'; },
    v => { v.nguoiThanUserId = 0; }, v => { v.moiQuanHe = 'x'.repeat(51); }]) {
    const value = proof(); mutation(value); assert.throws(() => buildRelativeGrant(value));
  }
});
test('consent time consistently uses Vietnam wall time, rejects invalid calendars and future instants', () => {
  assert.equal(vietnamWallTime('2025-01-02T02:30:00Z'), '2025-01-02T09:30:00');
  assert.equal(consentIso({ format: () => '2025-01-02T09:30:00' }), '2025-01-02T09:30:00+07:00');
  for (const value of ['2025-02-30T10:00:00', 'bad', '2999-01-01T00:00:00', '2025-01-01T25:00:00']) assert.throws(() => consentIso(value));
});
test('updates retain original version, omit identity changes and require a reason', () => {
  const record = { id: 11, version: 'AAAAAAAAAAE=' };
  const result = buildRelativeUpdate({ ...proof(), lyDo: 'Mở rộng chia sẻ', version: 'attacker-version' }, record);
  assert.equal(result.version, record.version); assert.equal(result.lyDo, 'Mở rộng chia sẻ');
  assert.equal(result.nguoiCaoTuoiId, undefined); assert.equal(result.nguoiThanUserId, undefined);
  assert.throws(() => buildRelativeUpdate({ ...proof(), lyDo: '' }, record));
  assert.throws(() => buildRelativeUpdate({ ...proof(), lyDo: 'test' }, { id: 11 }));
});
test('revocation has only reason and version; it cannot update an SOS or delete a record', () => {
  assert.deepEqual(buildRelativeRevoke({ lyDo: 'Thu hồi', trangThai: 'DaXuLy' }, { id: 11, version: 'AAAAAAAAAAE=' }), { lyDo: 'Thu hồi', version: 'AAAAAAAAAAE=' });
  assert.throws(() => buildRelativeRevoke({ lyDo: ' ' }, { id: 11, version: 'AAAAAAAAAAE=' }));
});
test('duplicate detection treats only the exact still-active pair as a duplicate', () => {
  const links = [{ nguoiCaoTuoiId: 7, nguoiThanUserId: 10, thuHoiLuc: null }, { nguoiCaoTuoiId: 8, nguoiThanUserId: 10, thuHoiLuc: '2025-01-01' }];
  assert.equal(hasActiveRelativeLink(links, 7, 10), true); assert.equal(hasActiveRelativeLink(links, 8, 10), false);
  assert.equal(hasActiveRelativeLink(links, 7, 11), false);
});
test('schema unavailable, conflicts and forbidden errors remain distinguishable', () => {
  assert.equal(relativeErrorInfo({ response: { status: 503, data: { errorCode: 'RELATIVES_NOT_INSTALLED' } } }).notReady, true);
  assert.equal(relativeErrorInfo({ response: { status: 409 } }).conflict, true);
  assert.equal(relativeErrorInfo({ response: { status: 403 } }).forbidden, true);
  assert.equal(relativeErrorInfo({}).notReady, false);
});
test('family matrix can edit only supported reads, with no write checkbox accidentally enabled', () => {
  assert.equal(canEditRelativePermission('NguoiThan', 'QLHOSONCT', 'xem'), true);
  for (const action of ['them', 'sua', 'xoa']) assert.equal(canEditRelativePermission('NguoiThan', 'QLHOSONCT', action), false);
  assert.equal(canEditRelativePermission('NguoiThan', 'QLNHATKY', 'xem'), false);
  assert.equal(canEditRelativePermission('NguoiChamSoc', 'QLHOSONCT', 'sua'), true);
});
test('history shows whitelisted changes, ignores raw private fields and tolerates malformed snapshots', () => {
  const before = { moiQuanHe: 'Con', phamViChiaSe: { diUng: false }, cccd: 'PRIVATE', version: 'old' };
  const after = { ...before, moiQuanHe: 'Con gái', phamViChiaSe: { diUng: true }, version: 'new', gps: 'PRIVATE' };
  const changes = relativeHistoryChanges({ duLieuCu: JSON.stringify(before), duLieuMoi: JSON.stringify(after) });
  assert.deepEqual(changes.map(item => item.label), ['Mối quan hệ', 'Dị ứng']);
  assert.doesNotMatch(JSON.stringify(changes), /PRIVATE|version|gps|cccd/);
  assert.deepEqual(relativeHistoryChanges({ duLieuCu: '{bad', duLieuMoi: '[1,2]' }), []);
});
const loadService = client => {
  const source = fs.readFileSync(new URL('../src/services/relativeService.js', import.meta.url), 'utf8')
    .replace(/^import axiosClient.*\r?\n/m, '').replace(/export const /g, 'const ');
  const module = { exports: {} };
  vm.runInNewContext(source + '\nmodule.exports={createRelativeAdminService};', { module, axiosClient: client });
  return module.exports.createRelativeAdminService(client);
};
test('service uses exact approved endpoints, verbs, query fields and no database-installation route', async () => {
  const calls = []; const client = Object.fromEntries(['get', 'post', 'put'].map(method => [method, async (...args) => {
    calls.push([method, ...args]); return { data: { data: method === 'get' ? [] : { id: 11 } } };
  }]));
  const service = loadService(client);
  await service.getLinks({ nguoiCaoTuoiId: 7, includeRevoked: true, actorId: 9 });
  await service.grant(buildRelativeGrant(proof()));
  await service.update(11, buildRelativeUpdate({ ...proof(), lyDo: 'Đổi phạm vi' }, { id: 11, version: 'AAAAAAAAAAE=' }));
  await service.revoke(11, buildRelativeRevoke({ lyDo: 'Thu hồi' }, { id: 11, version: 'AAAAAAAAAAE=' }));
  await service.history(11, { limit: 50, offset: 0, userId: 999 });
  assert.deepEqual(calls.map(call => call.slice(0, 2)), [
    ['get', '/relatives/links'], ['post', '/relatives/links'], ['put', '/relatives/links/11'],
    ['post', '/relatives/links/11/revoke'], ['get', '/relatives/links/11/history'],
  ]);
  assert.equal(calls[0][2].params.actorId, undefined); assert.equal(calls[4][2].params.userId, undefined);
  assert.doesNotMatch(JSON.stringify(calls), /patch|migration|seed|emergency-alerts/);
});
test('service does not hide API errors with sample data', async () => {
  const error = { response: { status: 503, data: { errorCode: 'RELATIVES_NOT_INSTALLED' } } };
  const service = loadService({ get: async () => { throw error; } });
  await assert.rejects(() => service.getLinks(), e => e === error);
});
test('production integration keeps the shared account flow, Admin gate, lazy profile panel and versioned consent workflow', () => {
  const source = file => fs.readFileSync(new URL(`../src/${file}`, import.meta.url), 'utf8');
  assert.match(source('App.jsx'), /path="nguoi-than" element=\{<RelativeAdminRoute><RelativeAdminPage/);
  assert.match(source('pages/Relatives/RelativeAdminPage.jsx'), /\/nguoi-dung\?role=NGUOI_THAN&create=1&from=relatives/);
  assert.match(source('pages/Users/UsersPage.jsx'), /createUser\(buildUserCreatePayload/);
  assert.match(source('pages/ElderlyProfiles/ElderlyProfilesPage.jsx'), /detailOpen && relativeSectionOpen && <RelativeLinksPanel/);
  assert.match(source('components/RelativeLinksPanel.jsx'), /const existing = await getRelativeLinks/);
  assert.match(source('components/RelativeLinksPanel.jsx'), /buildRelativeUpdate\(values, editor.record\)/);
  assert.match(source('components/RelativeLinksPanel.jsx'), /buildRelativeRevoke\(values, revokeTarget\)/);
  assert.match(source('components/RelativeLinksPanel.jsx'), /Xác nhận thu hồi/);
});
