import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { canAccessWeb, getWebHome, STAFF_WEB_ROLES } from '../src/utils/accessControl.js';
import { createRelativePortalApi, projectRelativeProfile, projectRelativeRows, portalError,
  relativeLocalDate, formatPortalTime, metricGroups, sevenDayTrend } from '../src/utils/relativePortalData.js';
import { createRelativePortalStore } from '../src/utils/relativePortalStore.js';

const profile = (id = 1, scope = false) => ({ id, hoTen: `NCT ${id}`, tuoi: 71, moiQuanHe: 'Con gái',
  xemBenhNen: scope, xemDiUng: false, xemKetQuaKham: scope });
const health = (id = 1) => ({ id: `${id}01`, nguoiCaoTuoiId: id, loaiChiSoId: '1', tenChiSo: 'Nhịp tim', giaTri: 71, donVi: 'lần/phút', laBatThuong: false, thoiGianDo: '2026-01-02T12:00:00' });
const deferred = () => { let resolve, reject; const promise = new Promise((a, b) => { resolve = a; reject = b; }); return { promise, resolve, reject }; };
const apiFixture = overrides => ({ list: async () => [profile(1), profile(2)], profile: async id => profile(id), read: async id => [health(id)], ...overrides });
const response = data => ({ data: { data } });

test('relative Web login has its own home, while all three old roles keep their access contract', () => {
  for (const role of ['QuanTriVien', 'NguoiChamSoc']) { assert.equal(canAccessWeb({ tenVaiTro: role }), true); assert.equal(getWebHome({ tenVaiTro: role }), '/dashboard'); }
  assert.equal(canAccessWeb({ tenVaiTro: 'NguoiCaoTuoi' }), true);
  assert.equal(getWebHome({ tenVaiTro: 'NguoiCaoTuoi' }), '/ca-nhan');
  assert.equal(canAccessWeb({ tenVaiTro: 'NguoiThan' }), true); assert.equal(getWebHome({ tenVaiTro: 'NguoiThan' }), '/nguoi-than-cua-toi');
  assert.deepEqual(STAFF_WEB_ROLES, ['QuanTriVien', 'NguoiChamSoc']);
  for (const role of ['BacSi', 'future', undefined]) assert.equal(canAccessWeb({ tenVaiTro: role }), false);
});

test('profile projection excludes identifiers, address, contact, consent proof and restricted medical text', () => {
  const result = projectRelativeProfile({ ...profile(), cccd: 'PRIVATE_CCCD', diaChi: 'PRIVATE_ADDRESS', soDienThoai: 'PRIVATE_PHONE',
    benhNen: 'PRIVATE_HISTORY', diUng: 'PRIVATE_ALLERGY', gps: 'PRIVATE_GPS', canCuDongY: 'PRIVATE_CONSENT' });
  assert.doesNotMatch(JSON.stringify(result), /PRIVATE|cccd|diaChi|canCuDongY|gps/);
  assert.equal(result.hoTen, 'NCT 1'); assert.equal(result.tuoi, 71);
  const permitted = projectRelativeProfile({ ...profile(1, true), benhNen: 'Được phép chia sẻ', diUng: 'PRIVATE' });
  assert.equal(permitted.benhNen, 'Được phép chia sẻ'); assert.equal(permitted.diUng, undefined);
});

test('all read payloads use explicit fields and do not render internal SOS data', () => {
  for (const section of ['health', 'medications', 'appointments', 'alerts', 'sos']) {
    const [result] = projectRelativeRows(section, [{ ...health(), ketQuaKham: 'PRIVATE_RESULT', cccd: 'PRIVATE',
      latitude: 99, longitude: 100, viDo: 'PRIVATE', kinhDo: 'PRIVATE', ghiChuXuLy: 'PRIVATE', nhanVienXuLy: 'PRIVATE' }], profile());
    assert.doesNotMatch(JSON.stringify(result), /PRIVATE|latitude|longitude|viDo|kinhDo|ghiChuXuLy|nhanVienXuLy/);
  }
  const [permitted] = projectRelativeRows('appointments', [{ id: 3, nguoiCaoTuoiId: 1, ketQuaKham: 'Kết quả được chia sẻ' }], profile(1, true));
  assert.equal(permitted.ketQuaKham, 'Kết quả được chia sẻ');
});

test('mismatched elderly rows and malformed responses are rejected rather than mixed into the current profile', () => {
  assert.throws(() => projectRelativeRows('health', [health(2)], profile(1)), /không khớp/);
  assert.throws(() => projectRelativeRows('profile', [], profile(1)));
  assert.throws(() => projectRelativeRows('health', {}, profile(1)));
});

test('API adapter has GET only and exact relative endpoints, queries cannot inject another identity', async () => {
  const calls = [], client = { get: async (path, config) => { calls.push({ path, config });
    return response(path === '/relatives/me/elderly' ? [profile()] : path === '/relatives/me/elderly/1' ? profile() : [{ ...health(), tenThuoc: 'Thuốc fixture' }]); } };
  const api = createRelativePortalApi(client), signal = new AbortController().signal;
  await api.list({ limit: 100, offset: 0, userId: 88, nguoiThanUserId: 99 }, signal);
  const person = await api.profile(1, signal);
  for (const section of ['health', 'medications', 'appointments', 'alerts', 'sos']) await api.read(1, section, person, { limit: 100, actorId: 7 }, signal);
  assert.deepEqual(calls.map(call => call.path), ['/relatives/me/elderly', '/relatives/me/elderly/1', '/relatives/me/elderly/1/health-metrics',
    '/relatives/me/elderly/1/medication-schedules', '/relatives/me/elderly/1/appointments', '/relatives/me/elderly/1/alerts', '/relatives/me/elderly/1/sos']);
  assert.deepEqual(calls[0].config.params, { limit: 100, offset: 0 }); assert.equal(calls.every(call => call.config.signal === signal), true);
  assert.deepEqual(Object.keys(api).sort(), ['list', 'profile', 'read']);
  await assert.rejects(api.profile('1 OR 1=1')); await assert.rejects(api.read(1, 'constructor', person));
  await assert.rejects(api.read(1, 'health', profile(2)));
});

test('API adapter validates profile identity, array responses and propagates authentication errors', async () => {
  await assert.rejects(createRelativePortalApi({ get: async () => response(profile(2)) }).profile(1), /không khớp/);
  await assert.rejects(createRelativePortalApi({ get: async () => response({}) }).list(), /danh sách/);
  const error = { response: { status: 403 } };
  await assert.rejects(createRelativePortalApi({ get: async () => { throw error; } }).list(), value => value === error);
});

test('one relative can select two linked elderly profiles; switching erases old medical rows immediately', async () => {
  const store = createRelativePortalStore(apiFixture(), 10);
  await store.reload(); await store.loadSection('health');
  assert.equal(store.getSnapshot().sections.health.rows[0].nguoiCaoTuoiId, 1);
  const switching = store.select(2);
  assert.equal(store.getSnapshot().profile, null); assert.deepEqual(store.getSnapshot().sections.health.rows, []);
  await switching; await store.loadSection('health');
  assert.equal(store.getSnapshot().profile.id, 2); assert.equal(store.getSnapshot().sections.health.rows[0].nguoiCaoTuoiId, 2);
});

test('late response from elderly A cannot populate elderly B even if the request ignores abort', async () => {
  const pending = deferred();
  const store = createRelativePortalStore(apiFixture({ read: id => id === 1 ? pending.promise : Promise.resolve([health(2)]) }));
  await store.reload(); const old = store.loadSection('health');
  await store.select(2); await store.loadSection('health'); pending.resolve([health(1)]); await old;
  assert.equal(store.getSnapshot().selectedId, 2); assert.equal(store.getSnapshot().sections.health.rows[0].nguoiCaoTuoiId, 2);
});

test('late profile response from the previous selection is ignored', async () => {
  const pending = deferred(); let delay = false;
  const store = createRelativePortalStore(apiFixture({ profile: id => delay && id === 1 ? pending.promise : Promise.resolve(profile(id)) }));
  await store.reload(); delay = true; const old = store.select(1); await store.select(2); pending.resolve(profile(1)); await old;
  assert.equal(store.getSnapshot().profile.id, 2);
});

test('URL elderly ID is never treated as a capability; unknown and invalid IDs reveal no profile', async () => {
  const reads = [];
  const store = createRelativePortalStore(apiFixture({ profile: async id => { reads.push(id); return profile(id); } }));
  await store.reload('999'); assert.equal(store.getSnapshot().profile, null); assert.deepEqual(reads, []);
  await store.reload('1 OR 1=1'); assert.equal(store.getSnapshot().phase, 'denied'); assert.deepEqual(reads, []);
});

test('logout/unmount clears list and all sections, aborts requests and prevents late repopulation', async () => {
  const pending = deferred(); let signal;
  const store = createRelativePortalStore(apiFixture({ read: (_id, _section, _profile, _options, requestSignal) => { signal = requestSignal; return pending.promise; } }));
  await store.reload(); const loading = store.loadSection('health'); store.clear('expired');
  assert.equal(signal.aborted, true); assert.deepEqual(store.getSnapshot().list, []);
  pending.resolve([health(1)]); await loading; assert.equal(store.getSnapshot().profile, null); assert.deepEqual(store.getSnapshot().sections.health.rows, []);
});

for (const status of [401, 403, 404]) test(`${status} on a section closes every profile and all cached health data`, async () => {
  let fail = false;
  const store = createRelativePortalStore(apiFixture({ read: async id => { if (fail) throw { response: { status } }; return [health(id)]; } }));
  await store.reload(); await store.loadSection('health'); fail = true; await store.loadSection('medications');
  assert.equal(store.getSnapshot().profile, null); assert.deepEqual(store.getSnapshot().list, []);
  for (const section of Object.values(store.getSnapshot().sections)) assert.deepEqual(section.rows, []);
  assert.equal(store.getSnapshot().phase, status === 401 ? 'expired' : 'denied');
});

test('revocation during an active session clears data before revalidation and removes revoked elderly', async () => {
  let revoked = false; const pending = deferred();
  const store = createRelativePortalStore(apiFixture({ list: () => revoked ? pending.promise : Promise.resolve([profile(1), profile(2)]) }));
  await store.reload(); await store.loadSection('health'); revoked = true;
  const rechecking = store.reload(1); assert.equal(store.getSnapshot().profile, null); assert.deepEqual(store.getSnapshot().sections.health.rows, []);
  pending.resolve([profile(2)]); await rechecking; assert.equal(store.getSnapshot().profile, null);
  assert.deepEqual(store.getSnapshot().list.map(row => row.id), [2]);
});

test('consent changes reload a new profile and drop results from an in-flight old scope', async () => {
  let allowed = true; const pending = deferred();
  const store = createRelativePortalStore(apiFixture({ profile: async id => profile(id, allowed), read: () => pending.promise }));
  await store.reload(); const old = store.loadSection('appointments'); allowed = false; await store.reload(1);
  pending.resolve([{ id: 9, nguoiCaoTuoiId: 1, ketQuaKham: 'OLD_PRIVATE_RESULT' }]); await old;
  assert.equal(store.getSnapshot().profile.xemKetQuaKham, false); assert.deepEqual(store.getSnapshot().sections.appointments.rows, []);
});

test('missing schema is unavailable, not a fabricated empty family list', async () => {
  const store = createRelativePortalStore(apiFixture({ list: async () => { throw { response: { status: 503, data: { errorCode: 'RELATIVES_NOT_INSTALLED' } } }; } }));
  await store.reload(); assert.equal(store.getSnapshot().phase, 'unavailable'); assert.deepEqual(store.getSnapshot().list, []);
});

test('empty linked list does not issue profile or medical requests', async () => {
  let requests = 0; const store = createRelativePortalStore(apiFixture({ list: async () => [], profile: async () => { requests++; }, read: async () => { requests++; } }));
  await store.reload(); assert.equal(store.getSnapshot().phase, 'ready'); assert.equal(requests, 0); assert.equal(store.getSnapshot().list.length, 0);
});

test('network failure has retry, no stale section data, and no simulated readings', async () => {
  let broken = true; const store = createRelativePortalStore(apiFixture({ read: async id => { if (broken) throw new Error('network'); return [health(id)]; } }));
  await store.reload(); await store.loadSection('health'); assert.equal(store.getSnapshot().sections.health.status, 'error'); assert.deepEqual(store.getSnapshot().sections.health.rows, []);
  broken = false; await store.loadSection('health'); assert.equal(store.getSnapshot().sections.health.rows.length, 1);
});

test('pagination appends rows for the same profile only', async () => {
  const offsets = []; const store = createRelativePortalStore(apiFixture({ read: async (id, _section, _profile, options) => {
    offsets.push(options.offset); return Array.from({ length: options.offset ? 1 : 100 }, (_, index) => ({ ...health(id), id: index + options.offset }));
  } }));
  await store.reload(); await store.loadSection('health'); await store.loadSection('health', true);
  assert.deepEqual(offsets, [0, 100]); assert.equal(store.getSnapshot().sections.health.rows.length, 101); assert.equal(store.getSnapshot().sections.health.more, false);
});

test('StrictMode cleanup/start cycle is safe and distinct sessions never share a store', async () => {
  const first = createRelativePortalStore(apiFixture(), 10), second = createRelativePortalStore(apiFixture(), 20);
  await first.reload(); first.clear(); await first.reload(2);
  assert.equal(first.getSnapshot().profile.id, 2); assert.equal(second.getSnapshot().profile, null); assert.notEqual(first.sessionKey, second.sessionKey);
});

test('Vietnam SQL wall clocks are interpreted at +07 and charts use only seven actual days of loaded readings', () => {
  assert.equal(relativeLocalDate('2026-01-02T12:00:00').toISOString(), '2026-01-02T05:00:00.000Z');
  assert.match(formatPortalTime('2026-01-02T12:00:00'), /12:00/);
  const rows = [health(), { ...health(), id: 2, thoiGianDo: '2026-01-01T12:00:00' }, { ...health(), id: 3, thoiGianDo: '2025-12-20T12:00:00' }, { ...health(), id: 4, thoiGianDo: '2026-01-03T12:00:00' }];
  assert.equal(sevenDayTrend(rows, new Date('2026-01-02T12:00:00+07:00')).length, 2);
  assert.equal(metricGroups(rows)[0].values[0].id, 4);
});

test('auth errors and schema errors have distinct user-facing states without revealing raw server content', () => {
  assert.equal(portalError({ response: { status: 401 } }).kind, 'expired'); assert.equal(portalError({ response: { status: 403 } }).kind, 'denied');
  assert.doesNotMatch(portalError({ response: { status: 500, data: { message: 'PRIVATE_SQL' } } }).message, /PRIVATE_SQL/);
});

test('portal integrates separate role guards, no operational actions, no medical localStorage or SOS audio', () => {
  const source = file => fs.readFileSync(new URL(`../src/${file}`, import.meta.url), 'utf8');
  assert.match(source('App.jsx'), /StaffWorkspaceRoute><MainLayout/); assert.match(source('App.jsx'), /RelativeWorkspaceRoute><RelativePortalPage/);
  assert.match(source('pages/Login/LoginPage.jsx'), /navigate\(getWebHome\(verified\)/);
  const page = source('pages/Relatives/RelativePortalPage.jsx'), hook = source('hooks/useRelativePortal.js');
  assert.doesNotMatch(page, /confirmMedication|updateElder|createAppointment|resolveSos|SosAudioControls|SmartAlertCenter|JSON.stringify|localStorage/);
  assert.match(hook, /relatives:access-changed/); assert.match(hook, /visibilitychange/); assert.match(hook, /store.clear/);
  assert.doesNotMatch(hook, /canhbao:new|\.emit\(|localStorage|play\(/);
  assert.doesNotMatch(source('utils/relativePortalStore.js'), /localStorage|sessionStorage|indexedDB/);
});

test('intentional cancellations skip the network toast; real failures retain error handling', async () => {
  let rejected;
  const toasts = [], removed = [], redirects = [];
  const client = { interceptors: { request: { use() {} }, response: { use(_success, failure) { rejected = failure; } } } };
  const source = fs.readFileSync(new URL('../src/services/axiosClient.js', import.meta.url), 'utf8')
    .replace(/^import .*\r?\n/gm, '').replaceAll('import.meta.env.VITE_API_URL', 'undefined').replace('export default axiosClient;', '');
  vm.runInNewContext(source, { axios: { create: () => client }, message: { error: value => toasts.push(value) }, Promise,
    webSession: { isCurrent: () => true, clear: () => removed.push('token', 'user') },
    localStorage: { removeItem: key => removed.push(key) }, window: { location: { pathname: '/nguoi-than-cua-toi', assign: path => redirects.push(path) } } });
  const cancellation = { code: 'ERR_CANCELED', config: { relativePortalRead: true } };
  await assert.rejects(rejected(cancellation), error => error === cancellation); assert.equal(toasts.length, 0);
  await assert.rejects(rejected({ code: 'ERR_CANCELED', config: {} })); assert.equal(toasts.length, 0);
  await assert.rejects(rejected({ code: 'ERR_NETWORK', config: { relativePortalRead: true } })); assert.equal(toasts.length, 1);
  await assert.rejects(rejected({ response: { status: 403, data: {} }, config: { relativePortalRead: true } })); assert.equal(toasts.length, 2);
  await assert.rejects(rejected({ response: { status: 401, data: {} }, config: { relativePortalRead: true, url: '/relatives/me/elderly' } }));
  assert.deepEqual(removed, ['token', 'user']); assert.deepEqual(redirects, ['/login']);
});
