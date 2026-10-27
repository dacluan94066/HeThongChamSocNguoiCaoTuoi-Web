import test from 'node:test';
import assert from 'node:assert/strict';
import { acceptGoogleSession, createGoogleWebApi } from '../src/utils/googleWebAuth.js';
import { createWebSession } from '../src/utils/webSession.js';

const envelope = data => ({ data: { success: true, data } });
const challenge = { challengeId: 'x'.repeat(32), nonce: 'n'.repeat(43), clientId: '123-fixture.apps.googleusercontent.com', expiresAt: '2026-10-27T13:05:00Z' };
test('Google adapter uses browser credentials and only the explicit proof fields, never caller-supplied target identity', async () => {
  const calls = [], client = { get: async (url, config) => { calls.push({ url, config }); return envelope(url.endsWith('config') ? { clientId: challenge.clientId } : { linked: false }); },
    post: async (url, body, config) => { calls.push({ url, body, config }); return envelope(url.endsWith('challenge') ? challenge : url.endsWith('link') ? { linked: true } : { token: 'care-jwt', user: { userId: 70, tenVaiTro: 'NguoiCaoTuoi' } }); } };
  const api = createGoogleWebApi(client, () => 'captured-session');
  await api.config(); assert.deepEqual(await api.status(), { linked: false });
  await api.challenge('link', undefined, 'originating-session'); await api.link({ ...challenge, userId: 999 }, 'google-proof', 'current-password', undefined, 'originating-session');
  await api.login(challenge, 'google-proof');
  assert.ok(calls.every(call => call.config.withCredentials === true && call.config.googleWebRequest === true));
  assert.equal(calls[2].config.webSessionStamp, 'originating-session'); assert.equal(calls[3].config.webSessionStamp, 'originating-session');
  assert.deepEqual(calls[3].body, { challengeId: challenge.challengeId, idToken: 'google-proof', currentPassword: 'current-password' });
  assert.deepEqual(calls[4].body, { challengeId: challenge.challengeId, idToken: 'google-proof' });
  assert.equal(calls.some(call => /register|emergency|medication/.test(call.url)), false);
});
test('Google session completion cannot overwrite a newer account; only CareSenior JWT/user are persisted', () => {
  const data = new Map(), storage = { getItem: key => data.get(key), setItem: (key, value) => data.set(key, value), removeItem: key => data.delete(key) };
  const session = createWebSession(storage), old = session.capture(); session.replace('newer-jwt', { userId: 71 });
  assert.throws(() => acceptGoogleSession({ token: 'older-result', user: { userId: 70, tenVaiTro: 'NguoiCaoTuoi' } }, old, session), { code: 'ERR_CANCELED' });
  assert.equal(data.get('token'), 'newer-jwt');
  const current = session.capture(); acceptGoogleSession({ token: 'care-jwt', user: { userId: 70, tenVaiTro: 'NguoiCaoTuoi' }, idToken: 'NEVER-PERSIST' }, current, session);
  assert.deepEqual([...data.keys()], ['token', 'user']); assert.equal(JSON.stringify([...data]).includes('NEVER-PERSIST'), false);
});
test('unexpected roles, malformed challenge, bad response and unknown operations fail closed', async () => {
  const api = createGoogleWebApi({ get: async () => envelope({ clientId: 'bad-client', linked: 'yes' }), post: async () => envelope({ token: 'jwt', user: { userId: 70, tenVaiTro: 'QuanTriVien' } }) }, () => null);
  await assert.rejects(api.config()); await assert.rejects(api.status()); await assert.rejects(api.challenge('delete'));
  await assert.rejects(api.login(challenge, 'proof')); await assert.rejects(api.login({}, 'proof')); await assert.rejects(api.link(challenge, 'proof', ''));
});
test('transport timeout/401 does not retry a Google login or link', async () => {
  for (const kind of ['login', 'link']) {
    let requests = 0; const error = Object.assign(Error('timeout'), { code: 'ECONNABORTED' });
    const api = createGoogleWebApi({ post: async () => { requests++; throw error; } }, () => null);
    await assert.rejects(kind === 'login' ? api.login(challenge, 'proof') : api.link(challenge, 'proof', 'password'), { code: 'ECONNABORTED' }); assert.equal(requests, 1);
  }
});
