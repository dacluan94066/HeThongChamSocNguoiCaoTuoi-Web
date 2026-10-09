const test = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
const { createCorsMiddleware, isAllowedOrigin } = require('../src/middlewares/cors.middleware');

test('Development permits loopback ports but rejects lookalikes, null and arbitrary sites', () => {
  for (const origin of ['http://localhost:63002', 'http://localhost:5173', 'http://127.0.0.1:8000', 'http://[::1]:63002']) {
    assert.equal(isAllowedOrigin(origin, {}), true);
  }
  for (const origin of ['null', '*', 'https://localhost.evil.example', 'http://localhost:63002/path', 'http://user@localhost:63002', 'https://evil.example']) {
    assert.equal(isAllowedOrigin(origin, {}), false);
  }
});
test('Production requires an exact allowlist; wildcard never grants access', () => {
  const env = { NODE_ENV: 'production', CORS_ORIGINS: 'https://care.example.com, https://admin.example.com,*' };
  assert.equal(isAllowedOrigin('https://care.example.com', env), true);
  for (const origin of ['http://localhost:63002', 'https://care.example.com:444', 'https://care.example.com.evil.example', 'http://care.example.com']) {
    assert.equal(isAllowedOrigin(origin, env), false);
  }
  assert.equal(isAllowedOrigin('https://care.example.com', { NODE_ENV: 'production' }), false);
  assert.equal(isAllowedOrigin(undefined, { NODE_ENV: 'production' }), true);
});
test('Auth preflight and HTTP errors carry correct development CORS headers', async () => {
  const app = express(); app.use(createCorsMiddleware({ NODE_ENV: 'development' })); app.use(express.json());
  app.post(['/api/auth/login', '/api/auth/register'], (_, res) => res.status(400).json({ success: false, errorCode: 'MISSING_FIELDS' }));
  const server = app.listen(0, '127.0.0.1'); await new Promise(resolve => server.once('listening', resolve));
  const base = 'http://127.0.0.1:' + server.address().port;
  try {
    for (const path of ['/api/auth/login', '/api/auth/register']) {
      const pre = await fetch(base + path, { method: 'OPTIONS', headers: {
        Origin: 'http://localhost:63002', 'Access-Control-Request-Method': 'POST',
        'Access-Control-Request-Headers': 'content-type,authorization',
      } });
      assert.equal(pre.status, 204); assert.equal(pre.headers.get('access-control-allow-origin'), 'http://localhost:63002');
      assert.match(pre.headers.get('access-control-allow-headers'), /Authorization/);
      assert.notEqual(pre.headers.get('access-control-allow-credentials'), 'true');
      const post = await fetch(base + path, { method: 'POST', headers: { Origin: 'http://localhost:63002', 'Content-Type': 'application/json' }, body: '{}' });
      assert.equal(post.status, 400); assert.equal(post.headers.get('access-control-allow-origin'), 'http://localhost:63002');
      assert.equal((await post.json()).errorCode, 'MISSING_FIELDS');
    }
    const denied = await fetch(base + '/api/auth/login', { method: 'OPTIONS', headers: { Origin: 'https://evil.example' } });
    assert.equal(denied.status, 403); assert.equal(denied.headers.get('access-control-allow-origin'), null);
  } finally { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); }
});
test('Production preflight denies localhost and reflects only an explicitly allowed origin', async () => {
  const app = express();
  app.use(createCorsMiddleware({ NODE_ENV: 'production', CORS_ORIGINS: 'https://care.example.com' }));
  const server = app.listen(0, '127.0.0.1'); await new Promise(resolve => server.once('listening', resolve));
  try {
    for (const [origin, status] of [['http://localhost:63002', 403], ['https://care.example.com', 204]]) {
      const result = await fetch('http://127.0.0.1:' + server.address().port + '/api/auth/login', {
        method: 'OPTIONS', headers: { Origin: origin, 'Access-Control-Request-Method': 'POST' },
      });
      assert.equal(result.status, status);
      assert.equal(result.headers.get('access-control-allow-origin'), status === 204 ? origin : null);
    }
  } finally { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); }
});
