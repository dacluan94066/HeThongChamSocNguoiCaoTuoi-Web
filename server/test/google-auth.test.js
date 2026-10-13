const test = require('node:test');
const assert = require('node:assert/strict');
const {
  GoogleIdentityError,
  createGoogleTokenVerifier,
} = require('../src/services/googleAuth.service');

test('Google verifier binds the ID token to the configured Web client audience', async () => {
  let receivedOptions;
  const verifier = createGoogleTokenVerifier({
    getAudience: () => 'care-senior.apps.googleusercontent.com',
    client: {
      async verifyIdToken(options) {
        receivedOptions = options;
        return {
          getPayload: () => ({
            sub: 'google-subject-123',
            email: 'USER@Example.com',
            email_verified: true,
            name: 'Nguyen Van A',
          }),
        };
      },
    },
  });

  const identity = await verifier('signed-id-token');
  assert.deepEqual(receivedOptions, {
    idToken: 'signed-id-token',
    audience: 'care-senior.apps.googleusercontent.com',
  });
  assert.equal(identity.subject, 'google-subject-123');
  assert.equal(identity.email, 'user@example.com');
});

test('Google verifier rejects missing configuration and unverified email', async () => {
  const withoutConfig = createGoogleTokenVerifier({ getAudience: () => '' });
  await assert.rejects(
    () => withoutConfig('token'),
    (error) => error instanceof GoogleIdentityError
      && error.code === 'GOOGLE_AUTH_NOT_CONFIGURED'
      && error.statusCode === 503,
  );

  const unverified = createGoogleTokenVerifier({
    getAudience: () => 'client-id',
    client: {
      async verifyIdToken() {
        return {
          getPayload: () => ({
            sub: 'subject',
            email: 'user@example.com',
            email_verified: false,
          }),
        };
      },
    },
  });
  await assert.rejects(
    () => unverified('token'),
    (error) => error instanceof GoogleIdentityError
      && error.code === 'GOOGLE_EMAIL_NOT_VERIFIED',
  );
});
