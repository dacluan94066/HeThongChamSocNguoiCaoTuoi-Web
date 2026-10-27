const test = require('node:test');
const assert = require('node:assert/strict');
const { createGoogleFixture } = require('./fixtures/google-web-fixture.cjs');
const { createGoogleWebChallenges } = require('../src/services/googleWebChallenge.service');

async function setup(t, options = {}) {
  const fixture = await createGoogleFixture(options), server = fixture.app.listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  t.after(async () => { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); });
  const origin = `http://127.0.0.1:${server.address().port}`;
  const send = async (path, body, { auth, cookie, webOrigin = origin, query = '', method = 'POST' } = {}) => {
    const response = await fetch(`${origin}/api/auth/google/web${path}${query}`, { method, headers: { 'Content-Type': 'application/json',
      ...(webOrigin ? { Origin: webOrigin } : {}), ...(auth ? { Authorization: `Bearer ${fixture.authToken(auth)}` } : {}), ...(cookie ? { Cookie: cookie } : {}) },
      ...(method === 'GET' ? {} : { body: JSON.stringify(body) }) });
    return { status: response.status, headers: response.headers, ...await response.json() };
  };
  const challenge = async (mode = 'login', auth) => {
    const result = await send(`/${mode}/challenge`, {}, { auth });
    assert.equal(result.status, 200); return { data: result.data, cookie: result.headers.get('set-cookie').split(';')[0] };
  };
  return { ...fixture, send, challenge, origin };
}
test('linked NCT logs in by sub even when Google email matches a different account; no creation or relinking', async t => {
  const f = await setup(t), c = await f.challenge();
  const result = await f.send('/login', { challengeId: c.data.challengeId, idToken: f.credential(c.data.nonce, 'fixture-google-70', f.state.users[1].email) }, { cookie: c.cookie });
  assert.equal(result.status, 200); assert.equal(result.data.user.userId, 70); assert.equal(f.state.writes, 0); assert.deepEqual(f.state.sessions, [70]);
  assert.equal(result.data.user.googleSubject, undefined); assert.equal(result.data.user.passwordHash, undefined);
  assert.ok(f.state.sql.some(query => query.includes('WHERE nd.GoogleSubject=@googleSubject') && !query.includes('OR nd.Email')));
});
test('unlinked email cannot log in or auto-link, and Web cannot register another account', async t => {
  const f = await setup(t, { linked: false }), c = await f.challenge();
  const result = await f.send('/login', { challengeId: c.data.challengeId, idToken: f.credential(c.data.nonce, 'unlinked', f.state.users[0].email) }, { cookie: c.cookie });
  assert.equal(result.status, 409); assert.equal(result.errorCode, 'GOOGLE_LINK_REQUIRED'); assert.equal(f.state.users.length, 2); assert.equal(f.state.writes, 0); assert.equal(f.state.sessions.length, 0);
});
test('a case-insensitive SQL collation cannot authenticate a different opaque Google subject', async t => {
  const f = await setup(t, { caseInsensitiveSubject: true }); f.state.users[0].googleSubject = 'Mixed-Subject';
  const c = await f.challenge();
  const result = await f.send('/login', { challengeId: c.data.challengeId, idToken: f.credential(c.data.nonce, 'mixed-subject') }, { cookie: c.cookie });
  assert.equal(result.status, 409); assert.equal(result.errorCode, 'GOOGLE_ACCOUNT_CONFLICT'); assert.equal(f.state.sessions.length, 0);
});
test('password + Google proof links own account, then Web login uses that same ID without changing profile/email', async t => {
  const f = await setup(t, { linked: false }), before = { ...f.state.users[0] }, c = await f.challenge('link', 70);
  const result = await f.send('/link', { challengeId: c.data.challengeId, idToken: f.credential(c.data.nonce), currentPassword: 'fixture-password' }, { cookie: c.cookie, auth: 70 });
  assert.equal(result.status, 200); assert.deepEqual(result.data, { linked: true }); assert.equal(f.state.commits, 1);
  assert.deepEqual(f.state.users[0], { ...before, googleSubject: 'fixture-google-70' });
  const next = await f.challenge(); assert.equal((await f.send('/login', { challengeId: next.data.challengeId, idToken: f.credential(next.data.nonce) }, { cookie: next.cookie })).data.user.userId, 70);
});
test('after Web linking, the real Mobile controller logs into the same account/profile using the shared RAM database', async t => {
  const f = await setup(t, { linked: false }), c = await f.challenge('link', 70);
  const result = await f.send('/link', { challengeId: c.data.challengeId, idToken: f.credential(c.data.nonce), currentPassword: 'fixture-password' }, { cookie: c.cookie, auth: 70 });
  assert.equal(result.status, 200);
  const path = require('node:path'), vm = require('node:vm'), fs = require('node:fs'), { createRequire } = require('node:module');
  const filename = path.resolve(__dirname, '../src/controllers/auth.controller.js'), module = { exports: {} };
  const original = createRequire(filename), stubs = { '../config/db': { poolPromise: Promise.resolve(f.pool), sql: f.sql }, '../config/mailer': { sendMail: async () => { throw Error('No external mail'); } },
    '../services/googleAuth.service': { GoogleIdentityError: require('../src/services/googleAuth.service').GoogleIdentityError, verifyGoogleIdToken: async () => ({ subject: 'fixture-google-70', email: 'changed-google@example.invalid' }) } };
  vm.runInNewContext(fs.readFileSync(filename, 'utf8'), { module, exports: module.exports, require: name => stubs[name] ?? original(name), process: { env: { JWT_SECRET: 'cross-platform-fixture-secret' } }, console, Buffer }, { filename });
  const res = { statusCode: 200, status(code) { this.statusCode = code; return this; }, json(body) { this.body = body; return this; } };
  await module.exports.googleLogin({ body: { idToken: 'synthetic-mobile-proof' }, ip: '127.0.0.1' }, res, error => { throw error; });
  assert.equal(res.statusCode, 200); assert.equal(res.body.data.user.userId, 70); assert.equal(res.body.data.user.tenVaiTro, 'NguoiCaoTuoi');
  assert.equal(f.state.users.length, 2); assert.equal(f.state.writes, 1); assert.ok(!f.state.sql.some(query => /INSERT INTO (NguoiDung|HoSoNguoiCaoTuoi)/.test(query)));
});
test('wrong password cannot link and is checked before Google verification', async t => {
  const f = await setup(t, { linked: false }), c = await f.challenge('link', 70);
  const result = await f.send('/link', { challengeId: c.data.challengeId, idToken: f.credential(c.data.nonce), currentPassword: 'wrong' }, { cookie: c.cookie, auth: 70 });
  assert.equal(result.status, 403); assert.equal(result.errorCode, 'GOOGLE_REAUTH_FAILED'); assert.equal(f.state.verified, 0); assert.equal(f.state.writes, 0);
});
test('legacy Unicode/long passwords retain the existing bcrypt login semantics during reauthentication', async t => {
  const f = await setup(t, { linked: false });
  const password = 'Mật-khẩu-cũ-'.repeat(12); f.state.users[0].passwordHash = await require('bcryptjs').hash(password, 4);
  const c = await f.challenge('link', 70);
  assert.equal((await f.send('/link', { challengeId: c.data.challengeId, idToken: f.credential(c.data.nonce), currentPassword: password }, { cookie: c.cookie, auth: 70 })).status, 200);
});
test('one-time browser-bound challenge rejects replay, missing/wrong cookie, origin, nonce and wrong purpose', async t => {
  const f = await setup(t), c = await f.challenge(), body = { challengeId: c.data.challengeId, idToken: f.credential(c.data.nonce) };
  assert.equal((await f.send('/login', body)).status, 403);
  assert.equal((await f.send('/login', body, { cookie: 'caresenior_google_browser=' + 'x'.repeat(43) })).status, 403);
  assert.equal((await f.send('/login', body, { cookie: c.cookie, webOrigin: 'https://attacker.invalid' })).status, 403);
  assert.equal((await f.send('/login', body, { cookie: c.cookie })).status, 200);
  assert.equal((await f.send('/login', body, { cookie: c.cookie })).status, 403);
  const wrongNonce = await f.challenge(); assert.equal((await f.send('/login', { challengeId: wrongNonce.data.challengeId, idToken: f.credential('wrong-nonce') }, { cookie: wrongNonce.cookie })).status, 401);
  const link = await f.challenge('link', 70); assert.equal((await f.send('/login', { challengeId: link.data.challengeId, idToken: f.credential(link.data.nonce) }, { cookie: link.cookie })).status, 403);
});
test('challenge cannot be transferred to another authenticated NCT', async t => {
  const f = await setup(t, { linked: false }), c = await f.challenge('link', 70);
  const result = await f.send('/link', { challengeId: c.data.challengeId, idToken: f.credential(c.data.nonce), currentPassword: 'fixture-password' }, { cookie: c.cookie, auth: 71 });
  assert.equal(result.status, 403); assert.equal(f.state.writes, 0);
});
test('changing target ID, registering through Web or missing Origin is refused', async t => {
  const f = await setup(t), c = await f.challenge();
  for (const field of ['userId', 'elderlyId', 'email', 'loaiTaiKhoan']) assert.equal((await f.send('/login', { challengeId: c.data.challengeId, idToken: f.credential(c.data.nonce), [field]: 999 }, { cookie: c.cookie })).status, 400);
  assert.equal((await f.send('/login/challenge', {}, { webOrigin: null })).status, 403);
  assert.equal((await f.send('/config', null, { method: 'GET', query: '?idToken=secret' })).status, 400);
});
test('other roles and locked accounts cannot use Google Web or its linking/status endpoints', async t => {
  const f = await setup(t);
  for (const role of ['QuanTriVien', 'NguoiChamSoc', 'NguoiThan']) {
    f.state.users[0].tenVaiTro = role; const c = await f.challenge();
    assert.equal((await f.send('/login', { challengeId: c.data.challengeId, idToken: f.credential(c.data.nonce) }, { cookie: c.cookie })).status, 403);
    assert.equal((await f.send('/link/challenge', {}, { auth: 70 })).status, 403);
    assert.equal((await f.send('/status', null, { method: 'GET', auth: 70 })).status, 403);
  }
  f.state.users[0].tenVaiTro = 'NguoiCaoTuoi'; f.state.users[0].trangThai = 'ChoDuyet'; const c = await f.challenge();
  assert.equal((await f.send('/login', { challengeId: c.data.challengeId, idToken: f.credential(c.data.nonce) }, { cookie: c.cookie })).status, 403);
});
test('one Google subject cannot link to two accounts; existing bindings cannot be replaced', async t => {
  const f = await setup(t), c = await f.challenge('link', 71);
  assert.equal((await f.send('/link', { challengeId: c.data.challengeId, idToken: f.credential(c.data.nonce), currentPassword: 'fixture-password' }, { cookie: c.cookie, auth: 71 })).errorCode, 'GOOGLE_SUBJECT_IN_USE');
  const own = await f.challenge('link', 70);
  assert.equal((await f.send('/link', { challengeId: own.data.challengeId, idToken: f.credential(own.data.nonce, 'different-google'), currentPassword: 'fixture-password' }, { cookie: own.cookie, auth: 70 })).errorCode, 'GOOGLE_ALREADY_LINKED');
  assert.equal(f.state.rollbacks, 2); assert.equal(f.state.writes, 0);
});
test('concurrent links serialize, check affected rows and preserve unique ownership (SQL mock)', async t => {
  const f = await setup(t, { linked: false }), a = await f.challenge('link', 70), b = await f.challenge('link', 71);
  const results = await Promise.all([[70, a], [71, b]].map(([auth, c]) => f.send('/link', { challengeId: c.data.challengeId, idToken: f.credential(c.data.nonce), currentPassword: 'fixture-password' }, { cookie: c.cookie, auth })));
  assert.deepEqual(results.map(row => row.status).sort(), [200, 409]); assert.equal(f.state.users.filter(row => row.googleSubject === 'fixture-google-70').length, 1);
  assert.ok(f.state.sql.some(query => query.includes('UPDLOCK,HOLDLOCK'))); assert.ok(f.state.sql.some(query => query.includes('GoogleSubject IS NULL AND MatKhauHash=@passwordHash')));
});
test('zero affected rows rolls back, invalid Google link proof is 422 rather than expiring CareSenior JWT', async t => {
  const f = await setup(t, { linked: false }); f.state.zeroRows = true; const c = await f.challenge('link', 70);
  assert.equal((await f.send('/link', { challengeId: c.data.challengeId, idToken: f.credential(c.data.nonce), currentPassword: 'fixture-password' }, { cookie: c.cookie, auth: 70 })).status, 409);
  assert.equal(f.state.rollbacks, 1); assert.equal(f.state.users[0].googleSubject, null);
  const bad = await f.challenge('link', 70); assert.equal((await f.send('/link', { challengeId: bad.data.challengeId, idToken: 'invalid', currentPassword: 'fixture-password' }, { cookie: bad.cookie, auth: 70 })).status, 422);
  assert.equal((await f.send('/status', null, { auth: 70, method: 'GET' })).status, 200);
});
test('a password changed during Google verification requires reauthentication again', async t => {
  const f = await setup(t, { linked: false }), c = await f.challenge('link', 70);
  f.state.afterVerify = () => { f.state.users[0].passwordHash = 'changed-after-password-check'; };
  const result = await f.send('/link', { challengeId: c.data.challengeId, idToken: f.credential(c.data.nonce), currentPassword: 'fixture-password' }, { cookie: c.cookie, auth: 70 });
  assert.equal(result.status, 409); assert.equal(result.errorCode, 'GOOGLE_REAUTH_REQUIRED'); assert.equal(f.state.writes, 0); assert.equal(f.state.rollbacks, 1);
});
test('simultaneous use of the same login challenge creates only one session', async t => {
  const f = await setup(t), c = await f.challenge(), body = { challengeId: c.data.challengeId, idToken: f.credential(c.data.nonce) };
  const results = await Promise.all([f.send('/login', body, { cookie: c.cookie }), f.send('/login', body, { cookie: c.cookie })]);
  assert.deepEqual(results.map(row => row.status).sort(), [200, 403]); assert.equal(f.state.sessions.length, 1);
});
test('reconfirming an existing identical binding is idempotent; inconsistent duplicate subjects cannot log in', async t => {
  const f = await setup(t), c = await f.challenge('link', 70);
  assert.equal((await f.send('/link', { challengeId: c.data.challengeId, idToken: f.credential(c.data.nonce), currentPassword: 'fixture-password' }, { cookie: c.cookie, auth: 70 })).status, 200);
  assert.equal(f.state.writes, 0);
  f.state.users[1].googleSubject = 'fixture-google-70'; const login = await f.challenge();
  assert.equal((await f.send('/login', { challengeId: login.data.challengeId, idToken: f.credential(login.data.nonce) }, { cookie: login.cookie })).errorCode, 'GOOGLE_ACCOUNT_CONFLICT');
  assert.equal(f.state.sessions.length, 0);
});
test('unconfigured Google and database errors fail closed without revealing driver details', async t => {
  const f = await setup(t, { configured: false }); assert.equal((await f.send('/config', null, { method: 'GET' })).status, 503);
  const g = await setup(t); g.state.databaseFailure = true; const c = await g.challenge();
  const reply = await g.send('/login', { challengeId: c.data.challengeId, idToken: g.credential(c.data.nonce) }, { cookie: c.cookie });
  assert.equal(reply.status, 503); assert.doesNotMatch(JSON.stringify(reply), /Sensitive driver/);
});
test('a timed-out Google verification cannot later create a session or write a link', async t => {
  for (const mode of ['login', 'link']) {
    const f = await setup(t, { linked: mode === 'login', verificationTimeoutMs: 5 }); f.state.deferVerification = true;
    const c = await f.challenge(mode, mode === 'link' ? 70 : undefined);
    const body = { challengeId: c.data.challengeId, idToken: f.credential(c.data.nonce), ...(mode === 'link' ? { currentPassword: 'fixture-password' } : {}) };
    const result = await f.send(`/${mode}`, body, { cookie: c.cookie, auth: mode === 'link' ? 70 : undefined });
    assert.equal(result.status, 503); assert.equal(result.errorCode, 'GOOGLE_VERIFICATION_TIMEOUT');
    f.state.releaseVerification(); await new Promise(resolve => setImmediate(resolve));
    assert.equal(f.state.writes, 0); assert.equal(f.state.sessions.length, 0); assert.equal(f.state.commits, 0);
  }
});
test('challenge expiry/production cookie/security rate limit are enforced with a fixed clock', () => {
  let time = 1000, saved; const service = createGoogleWebChallenges({ now: () => time, env: { NODE_ENV: 'production', CORS_ORIGINS: 'https://care.example' } });
  const req = { ip: 'fixture-ip', headers: {}, get: () => 'https://care.example', body: {} }, res = { cookie(name, value, settings) { saved = { name, value, settings }; } };
  const c = service.issue(req, res, 'login'); assert.equal(saved.name, '__Host-caresenior-google'); assert.equal(saved.settings.secure, true); assert.equal(saved.settings.httpOnly, true); assert.equal(saved.settings.sameSite, 'lax');
  req.headers.cookie = `${saved.name}=${saved.value}`; req.body.challengeId = c.challengeId; time += 300001;
  assert.throws(() => service.consume(req, 'login'), error => error.code === 'GOOGLE_CHALLENGE_INVALID');
  for (let i = 0; i < 10; i++) service.issue(req, res, 'login');
  assert.throws(() => service.issue(req, res, 'login'), error => error.status === 429);
});
test('Google browser CORS allows credentials only for its routes and rejects a foreign explicit origin', async t => {
  const f = await setup(t);
  const preflight = await fetch(`${f.origin}/api/auth/google/web/login`, { method: 'OPTIONS', headers: { Origin: f.origin, 'Access-Control-Request-Method': 'POST', 'Access-Control-Request-Headers': 'content-type' } });
  assert.equal(preflight.status, 204); assert.equal(preflight.headers.get('access-control-allow-credentials'), 'true');
  const { isAllowedGoogleOrigin } = require('../src/middlewares/cors.middleware');
  assert.equal(isAllowedGoogleOrigin('http://localhost:7777', { NODE_ENV: 'test', GOOGLE_WEB_ORIGINS: 'http://localhost:5173' }), false);
  assert.equal(isAllowedGoogleOrigin('http://care.example', { NODE_ENV: 'production', GOOGLE_WEB_ORIGINS: 'http://care.example' }), false);
});
test('malformed Google JSON never logs tokens/passwords or parser stacks', async t => {
  const f = await setup(t); const errors = [], original = console.error; console.error = (...args) => errors.push(args.join(' '));
  try {
    const response = await fetch(`${f.origin}/api/auth/google/web/login`, { method: 'POST', headers: { Origin: f.origin, 'Content-Type': 'application/json' }, body: '{"idToken":"SECRET-TOKEN","currentPassword":"SECRET-PASSWORD",' });
    assert.equal(response.status, 400); const body = await response.text(); assert.doesNotMatch(body + errors.join(' '), /SECRET-TOKEN|SECRET-PASSWORD|SyntaxError/);
  } finally { console.error = original; }
});
