const test = require('node:test');
const assert = require('node:assert/strict');
const { generateKeyPairSync, sign } = require('node:crypto');
const { OAuth2Client } = require('google-auth-library');
const { createGoogleTokenVerifier } = require('../src/services/googleAuth.service');

// Real installed Google SDK/signature checks, with only certificate retrieval
// replaced by a local test public key. No Google network, account or SQL access.
const { privateKey, publicKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
const audience = 'isolated-stage5.apps.googleusercontent.com';
const instant = Date.parse('2026-10-27T06:05:00Z'), seconds = instant / 1000;
const encode = value => Buffer.from(JSON.stringify(value)).toString('base64url');
function token(patch = {}, key = privateKey) {
  const input = `${encode({ alg: 'RS256', kid: 'stage5-test-only' })}.${encode({
    sub: 'stage5-synthetic-subject', email: 'stage5@example.invalid', email_verified: true,
    iss: 'https://accounts.google.com', aud: audience, iat: seconds - 60, exp: seconds + 3600, ...patch,
  })}`;
  return `${input}.${sign('RSA-SHA256', Buffer.from(input), key).toString('base64url')}`;
}
function verifier() {
  const client = new OAuth2Client();
  client.getFederatedSignonCertsAsync = async () => ({ certs: { 'stage5-test-only': publicKey.export({ type: 'spki', format: 'pem' }) } });
  return createGoogleTokenVerifier({ client, getAudience: () => audience });
}
test('Google verifier accepts a cryptographically valid, verified synthetic identity', async t => {
  t.mock.timers.enable({ apis: ['Date'], now: instant });
  const result = await verifier()(token());
  assert.equal(result.subject, 'stage5-synthetic-subject'); assert.equal(result.email, 'stage5@example.invalid');
});
for (const [name, patch] of [
  ['wrong audience', { aud: 'another-client' }], ['wrong issuer', { iss: 'https://attacker.invalid' }],
  ['expired beyond SDK clock skew', { iat: seconds - 7200, exp: seconds - 3600 }], ['future issue time', { iat: seconds + 3600 }],
]) test(`Google SDK rejects ${name}, without exposing the token`, async t => {
  t.mock.timers.enable({ apis: ['Date'], now: instant });
  const value = token(patch);
  await assert.rejects(verifier()(value), error => error.code === 'INVALID_GOOGLE_TOKEN' && error.statusCode === 401 && !error.message.includes(value));
});
test('Google verifier rejects invalid signature and malformed token', async t => {
  t.mock.timers.enable({ apis: ['Date'], now: instant });
  const wrongKey = generateKeyPairSync('rsa', { modulusLength: 2048 }).privateKey;
  for (const value of [token({}, wrongKey), 'not-an-id-token']) await assert.rejects(verifier()(value), error => error.code === 'INVALID_GOOGLE_TOKEN');
});
test('verified signature does not bypass email_verified policy', async t => {
  t.mock.timers.enable({ apis: ['Date'], now: instant });
  for (const email_verified of [false, 'true', undefined]) await assert.rejects(verifier()(token({ email_verified })), error => error.code === 'GOOGLE_EMAIL_NOT_VERIFIED');
});
test('Web verifier binds the signed Google nonce; Mobile verification without nonce remains compatible', async t => {
  t.mock.timers.enable({ apis: ['Date'], now: instant });
  const verify = verifier();
  assert.equal((await verify(token({ nonce: 'browser-challenge' }), { nonce: 'browser-challenge' })).subject, 'stage5-synthetic-subject');
  for (const value of [token(), token({ nonce: 'different-challenge' }), token({ nonce: 123 })]) await assert.rejects(verify(value, { nonce: 'browser-challenge' }), error => error.code === 'INVALID_GOOGLE_NONCE');
  assert.equal((await verify(token())).subject, 'stage5-synthetic-subject');
});
