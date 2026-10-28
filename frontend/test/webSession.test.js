import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { createWebSession, sessionChangedError } from '../src/utils/webSession.js';

const fixture = () => {
  const data = new Map(), handlers = new Set();
  const storage = { getItem: key => data.get(key) || null, setItem: (key, value) => data.set(key, value), removeItem: key => data.delete(key) };
  const events = { addEventListener: (_, fn) => handlers.add(fn), removeEventListener: (_, fn) => handlers.delete(fn) };
  return { data, storage, session: createWebSession(storage, events), emit: key => { for (const fn of handlers) fn({ key }); } };
};

test('Web session changes never revoke a Mobile session or persist personal profiles', () => {
  const f = fixture(); const empty = f.session.capture();
  f.session.replace('web-token', { userId: 70 }, empty);
  const logged = f.session.capture(); assert.equal(f.session.isCurrent(empty), false);
  assert.deepEqual([...f.data.keys()], ['token', 'user']);
  f.session.clear(); assert.equal(f.session.isCurrent(logged), false); assert.equal(f.data.size, 0);
});
test('late login/401 cannot replace or clear a newer account, including identical token strings', () => {
  const f = fixture(); f.session.replace('token', { userId: 70 }); const old = f.session.capture();
  f.session.clear(); f.session.replace('token', { userId: 71 });
  assert.equal(f.session.clear(old), false);
  assert.throws(() => f.session.replace('old', { userId: 70 }, old), { code: 'ERR_CANCELED' });
  assert.equal(f.session.updateUser({ userId: 70 }, old), false);
  assert.equal(JSON.parse(f.data.get('user')).userId, 71);
});
test('another tab switching account, logging out or clearing storage invalidates pending work', () => {
  const f = fixture(); let updates = 0; const off = f.session.subscribe(() => updates++);
  for (const key of ['token', 'user', null]) { const stamp = f.session.capture(); f.emit(key); assert.equal(f.session.isCurrent(stamp), false); }
  f.emit('unrelated-setting'); assert.equal(updates, 3); off(); f.emit('token'); assert.equal(updates, 3);
});

function interceptors(f) {
  const handlers = {};
  const client = { interceptors: { request: { use: callback => { handlers.request = callback; } },
    response: { use: (ok, fail) => { handlers.ok = ok; handlers.fail = fail; } } } };
  const source = fs.readFileSync(new URL('../src/services/axiosClient.js', import.meta.url), 'utf8')
    .replace(/^import .*\r?\n/gm, '').replaceAll('import.meta.env.VITE_API_URL', 'undefined').replace('export default axiosClient;', '');
  const toasts = [], redirects = [];
  vm.runInNewContext(source, { axios: { create: () => client }, webSession: f.session, sessionChangedError, localStorage: f.storage,
    message: { error: value => toasts.push(value) }, window: { location: { pathname: '/ca-nhan', assign: path => redirects.push(path) } } });
  return { ...handlers, toasts, redirects };
}
test('late protected response and 401 from previous account are cancelled without logging out the new account', async () => {
  const f = fixture(); f.session.replace('old-token', { userId: 70 }); const h = interceptors(f);
  const config = h.request({ url: '/elderly/me', headers: {} });
  f.session.replace('new-token', { userId: 71 });
  assert.throws(() => h.ok({ config, data: 'old medical data' }), { code: 'ERR_CANCELED' });
  await assert.rejects(h.fail({ config, response: { status: 401 } }), { code: 'ERR_CANCELED' });
  assert.equal(f.data.get('token'), 'new-token'); assert.equal(h.redirects.length, 0);
});
test('current expired token clears Web session; forbidden profile does not', async () => {
  const f = fixture(); f.session.replace('token', { userId: 70 }); const h = interceptors(f);
  const config = h.request({ url: '/elderly/me', headers: {}, elderlyPortalRequest: true });
  await assert.rejects(h.fail({ config, response: { status: 403, data: {} } })); assert.equal(f.data.get('token'), 'token');
  await assert.rejects(h.fail({ config, response: { status: 401, data: {} } }));
  assert.equal(f.data.size, 0); assert.deepEqual(h.redirects, ['/login']); assert.equal(h.toasts.length, 0);
});
test('invalid public login does not clear a newer authenticated session', async () => {
  const f = fixture(); f.session.replace('current', { userId: 70 }); const h = interceptors(f);
  const config = h.request({ url: '/auth/login', headers: {} });
  await assert.rejects(h.fail({ config, response: { status: 401, data: {} } })); assert.equal(f.data.get('token'), 'current');
});

test('public registrations, including relative, never invalidate another authenticated session on rejection', async () => {
  const f = fixture(); f.session.replace('current', { userId: 70 }); const h = interceptors(f);
  for (const url of ['/auth/register', '/auth/register-caregiver', '/auth/register-relative']) {
    const config = h.request({ url, headers: {} });
    await assert.rejects(h.fail({ config, response: { status: 401, data: {} } }));
    assert.equal(f.data.get('token'), 'current'); assert.equal(h.redirects.length, 0);
  }
});
test('Google public token rejection preserves CareSenior session, link JWT expiry clears it', async () => {
  const f = fixture(); f.session.replace('current', { userId: 70 }); const h = interceptors(f);
  for (const url of ['/auth/google/web/login', '/auth/google/web/login/challenge']) {
    const config = h.request({ url, headers: {}, googleWebRequest: true });
    await assert.rejects(h.fail({ config, response: { status: 401, data: {} } })); assert.equal(f.data.get('token'), 'current');
  }
  const link = h.request({ url: '/auth/google/web/link', headers: {}, googleWebRequest: true });
  await assert.rejects(h.fail({ config: link, response: { status: 422, data: { errorCode: 'INVALID_GOOGLE_TOKEN' } } })); assert.equal(f.data.get('token'), 'current');
  await assert.rejects(h.fail({ config: link, response: { status: 401, data: { errorCode: 'TOKEN_EXPIRED' } } })); assert.equal(f.data.size, 0);
});
