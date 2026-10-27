import test from 'node:test';
import assert from 'node:assert/strict';
import { createElderlyWorkspaceApi, createElderlyWorkspaceStore, buildOwnProfile } from '../src/utils/elderlyWorkspace.js';
import { canAccessWeb, getWebHome, isElderlyUser, STAFF_WEB_ROLES } from '../src/utils/accessControl.js';

const profile = { id: 42, userId: 70, hoTen: 'NCT fixture' };
const missing = () => ({ response: { status: 404, data: { errorCode: 'ELDERLY_PROFILE_NOT_FOUND' } } });
const deferred = () => { let resolve; const promise = new Promise(done => { resolve = done; }); return { promise, resolve }; };

test('four Web roles have separate homes; NCT is never a staff role', () => {
  for (const role of ['QuanTriVien', 'NguoiChamSoc', 'NguoiThan', 'NguoiCaoTuoi']) assert.equal(canAccessWeb({ tenVaiTro: role }), true);
  assert.equal(getWebHome({ tenVaiTro: 'NguoiCaoTuoi' }), '/ca-nhan');
  assert.equal(getWebHome({ tenVaiTro: 'NguoiThan' }), '/nguoi-than-cua-toi');
  assert.equal(isElderlyUser({ tenVaiTro: 'QuanTriVien' }), false);
  assert.equal(STAFF_WEB_ROLES.includes('NguoiCaoTuoi'), false);
  assert.equal(canAccessWeb({ tenVaiTro: 'BacSi' }), false);
});

test('own profile adapter never accepts an elderly ID, actor, role, credentials or hidden fields', async () => {
  const calls = [];
  const client = Object.fromEntries(['get', 'post'].map(method => [method, async (...args) => { calls.push({ method, args }); return { data: { data: profile } }; }]));
  const api = createElderlyWorkspaceApi(client);
  await api.getOwn();
  await api.completeOwn({ hoTen: 'Fixture', ngaySinh: { format: () => '1950-01-01' }, gioiTinh: 'Nữ', userId: 99, id: 88,
    vaiTroId: 1, token: 'secret', email: 'not-allowed', trangThai: 'Admin', matKhau: 'not-allowed' });
  assert.deepEqual(calls.map(call => [call.method, call.args[0]]), [['get', '/elderly/me'], ['post', '/elderly/me']]);
  assert.deepEqual(calls[1].args[1], { hoTen: 'Fixture', ngaySinh: '1950-01-01', gioiTinh: 'Nữ' });
  assert.equal(calls.every(call => call.args.at(-1).elderlyPortalRequest), true);
  assert.deepEqual(buildOwnProfile({ hoTen: 'A', cccd: null }), { hoTen: 'A' });
});

test('existing own profile enters ready; another account payload is rejected', async () => {
  for (const row of [profile, { ...profile, userId: 71 }, null]) {
    const store = createElderlyWorkspaceStore({ getOwn: async () => row }, 70);
    await store.check();
    assert.equal(store.getSnapshot().phase, row === profile ? 'ready' : 'error');
    if (row !== profile) assert.equal(store.getSnapshot().profile, null);
  }
});

for (const [label, error, phase] of [
  ['explicit missing', missing(), 'missing'], ['generic 404', { response: { status: 404 } }, 'error'],
  ['offline', new Error('Không kết nối'), 'error'], ['server', { response: { status: 500 } }, 'error'],
  ['forbidden', { response: { status: 403 } }, 'denied'], ['expired', { response: { status: 401 } }, 'expired'],
]) test(`profile gate: ${label} -> ${phase}; no automatic POST`, async () => {
  let posts = 0;
  const store = createElderlyWorkspaceStore({ getOwn: async () => { throw error; }, completeOwn: async () => posts++ }, 70);
  await store.check(); assert.equal(store.getSnapshot().phase, phase); assert.equal(posts, 0);
});

test('completion requires explicit submit; simultaneous clicks share one pending operation', async () => {
  const pending = deferred(); let posts = 0;
  const store = createElderlyWorkspaceStore({ getOwn: async () => { throw missing(); }, completeOwn: () => { posts++; return pending.promise; } }, 70);
  await store.check(); assert.equal(posts, 0);
  const first = store.complete({ hoTen: 'Fixture' }); await Promise.resolve();
  await store.complete({ hoTen: 'Other click' }); await Promise.resolve();
  pending.resolve(profile); await first;
  assert.equal(posts, 1); assert.equal(store.getSnapshot().phase, 'ready');
});

test('profile completed on Mobile between GET and submit is reused without POST', async () => {
  let exists = false, posts = 0;
  const store = createElderlyWorkspaceStore({ getOwn: async () => { if (!exists) throw missing(); return profile; }, completeOwn: async () => posts++ }, 70);
  await store.check(); exists = true; await store.complete({ hoTen: 'Do not overwrite' });
  assert.equal(posts, 0); assert.equal(store.getSnapshot().profile.hoTen, profile.hoTen);
});

test('network error during completion preflight cannot become a create request', async () => {
  let calls = 0, posts = 0;
  const store = createElderlyWorkspaceStore({ getOwn: async () => { if (++calls === 1) throw missing(); throw new Error('offline'); }, completeOwn: async () => posts++ }, 70);
  await store.check(); await store.complete({}); assert.equal(posts, 0); assert.equal(store.getSnapshot().phase, 'error');
});

test('backend validation remains authoritative; 422 returns to the form and preserves its message', async () => {
  const store = createElderlyWorkspaceStore({ getOwn: async () => { throw missing(); }, completeOwn: async () => { throw { response: { status: 422, data: { errorCode: 'INVALID_NGAYSINH', message: 'Ngày sinh không hợp lệ' } } }; } }, 70);
  await store.check(); await store.complete({});
  assert.equal(store.getSnapshot().phase, 'missing'); assert.equal(store.getSnapshot().notice, 'Ngày sinh không hợp lệ');
});

test('dispose, account switching and session loss reject late personal data even when abort is ignored', async () => {
  for (const mode of ['dispose', 'session']) {
    const pending = deferred(); let active = true;
    const store = createElderlyWorkspaceStore({ getOwn: () => pending.promise }, 70, () => active);
    const read = store.check();
    if (mode === 'dispose') store.dispose(); else active = false;
    pending.resolve(profile); await read; assert.equal(store.getSnapshot().profile, null);
  }
});

test('newer profile check wins over an old in-flight response', async () => {
  const pending = deferred(); let calls = 0;
  const store = createElderlyWorkspaceStore({ getOwn: () => ++calls === 1 ? pending.promise : Promise.resolve({ ...profile, hoTen: 'Current' }) }, 70);
  const first = store.check(); await store.check(); pending.resolve(profile); await first;
  assert.equal(store.getSnapshot().profile.hoTen, 'Current');
});
