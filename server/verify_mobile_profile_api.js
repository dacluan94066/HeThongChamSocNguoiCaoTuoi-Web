// Smoke test the self-service endpoints against SQL Server.
// Set TEST_USERNAME and TEST_PASSWORD (or SEED_PASSWORD) in the environment.
require('dotenv').config();
const { randomBytes } = require('crypto');
const app = require('./src/app');
const { poolPromise } = require('./src/config/db');

const username = process.env.TEST_USERNAME;
const originalPassword = process.env.TEST_PASSWORD || process.env.SEED_PASSWORD;
if (!username || !originalPassword) {
  console.error('Set TEST_USERNAME and TEST_PASSWORD (or SEED_PASSWORD).');
  process.exitCode = 1;
} else {
  run().catch((error) => {
    console.error('API smoke test failed:', error.message);
    process.exitCode = 1;
  });
}

async function run() {
  const server = await new Promise((resolve, reject) => {
    const listener = app.listen(0, '127.0.0.1', () => resolve(listener));
    listener.once('error', reject);
  });
  const base = `http://127.0.0.1:${server.address().port}/api`;
  let token;
  let previousAddress;
  let addressChanged = false;
  let passwordChanged = false;
  const temporaryPassword = `Tmp${randomBytes(12).toString('hex')}`;

  async function request(path, method = 'GET', body, bearer = token) {
    const response = await fetch(`${base}${path}`, {
      method,
      headers: {
        'content-type': 'application/json',
        ...(bearer ? { authorization: `Bearer ${bearer}` } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
    });
    return { status: response.status, json: await response.json() };
  }

  async function login(password) {
    const result = await request('/auth/login', 'POST', {
      tenDangNhap: username, matKhau: password, platform: 'mobile',
    }, null);
    if (result.status !== 200 || !result.json.data?.token) {
      throw new Error(`Login failed (${result.status}, ${result.json.errorCode})`);
    }
    return result.json.data.token;
  }

  try {
    token = await login(originalPassword);
    const initial = await request('/elderly/me');
    if (initial.status !== 200 || !initial.json.data?.id) {
      throw new Error(`GET /elderly/me failed (${initial.status})`);
    }
    previousAddress = initial.json.data.diaChi ?? null;
    const temporaryAddress = `API test ${randomBytes(6).toString('hex')}`;

    const update = await request('/elderly/me', 'PUT', { diaChi: temporaryAddress });
    if (update.status !== 200 || update.json.data?.diaChi !== temporaryAddress) {
      throw new Error(`PUT /elderly/me failed (${update.status})`);
    }
    addressChanged = true;
    const afterUpdate = await request('/elderly/me');
    if (afterUpdate.json.data?.diaChi !== temporaryAddress) {
      throw new Error('Updated profile was not persisted.');
    }
    const forbiddenField = await request('/elderly/me', 'PUT', { cccd: 'not-allowed' });
    if (forbiddenField.status !== 400) throw new Error('CCCD edit was not rejected.');
    console.log('PASS: GET/PUT /elderly/me, persistence, CCCD rejected');

    const wrongPassword = await request('/users/me/password', 'PUT', {
      matKhauCu: temporaryPassword, matKhauMoi: temporaryPassword + '2',
    });
    if (wrongPassword.status !== 400 || wrongPassword.json.errorCode !== 'INVALID_CURRENT_PASSWORD') {
      throw new Error('Wrong old password was not rejected.');
    }
    const change = await request('/users/me/password', 'PUT', {
      matKhauCu: originalPassword, matKhauMoi: temporaryPassword,
    });
    if (change.status !== 200) throw new Error(`Password change failed (${change.status})`);
    passwordChanged = true;
    token = await login(temporaryPassword);
    console.log('PASS: PUT /users/me/password, wrong password rejected, new login works');
  } finally {
    try {
      if (passwordChanged) {
        const restore = await request('/users/me/password', 'PUT', {
          matKhauCu: temporaryPassword, matKhauMoi: originalPassword,
        });
        if (restore.status !== 200) throw new Error('Could not restore original password.');
        token = await login(originalPassword);
      }
      if (addressChanged) {
        const restore = await request('/elderly/me', 'PUT', { diaChi: previousAddress });
        if (restore.status !== 200) throw new Error('Could not restore original address.');
      }
      if (passwordChanged || addressChanged) console.log('PASS: test account restored');
    } finally {
      await new Promise((resolve) => server.close(resolve));
      const pool = await poolPromise;
      await pool.close();
    }
  }
}
