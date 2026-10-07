const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const express = require('express');

// Load production code with an isolated DB stub: tests never connect to SQL.
function load(relativePath, dependencies) {
  const filename = path.join(__dirname, '..', relativePath);
  const module = { exports: {} };
  vm.runInNewContext(fs.readFileSync(filename, 'utf8'), {
    module,
    require(name) {
      if (!(name in dependencies)) throw new Error(`Unexpected dependency: ${name}`);
      return dependencies[name];
    },
  }, { filename });
  return module.exports;
}

function permissionModule(rows, inputs = [], queryError) {
  const request = {
    input(name, type, value) { inputs.push({ name, value }); return this; },
    async query() { if (queryError) throw queryError; return { recordset: rows }; },
  };
  return load('src/middlewares/permission.middleware.js', {
    '../config/db': { poolPromise: Promise.resolve({ request: () => request }), sql: { Int: 'Int', NVarChar: 'NVarChar' } },
    '../utils/response': { fail: (res, message, errorCode, status) => res.status(status).json({ message, errorCode }) },
  });
}

const columns = { xem: 'ChoPhepXem', them: 'ChoPhepThem', sua: 'ChoPhepSua', xoa: 'ChoPhepXoa' };
for (const [action, column] of Object.entries(columns)) {
  for (const [label, value, allowed] of [['true', true, true], ['false', false, false], ['1', 1, true], ['0', 0, false], ['null', null, false], ['undefined', undefined, false], ['string 1', '1', false], ['missing row', undefined, false]]) {
    test(`${action}: ${label} ${allowed ? 'allows' : 'returns 403'}`, async () => {
      const inputs = [];
      const rows = label === 'missing row' ? [] : [{ [column]: value }];
      const { checkPermission } = permissionModule(rows, inputs);
      let status, body, nextCalls = 0;
      const res = { status(code) { status = code; return this; }, json(data) { body = data; } };
      await checkPermission('QLNGUOIDUNG', action)({ user: { vaiTroId: 2, tenVaiTro: 'BacSi' } }, res, (error) => { assert.equal(error, undefined); nextCalls++; });
      assert.equal(nextCalls, allowed ? 1 : 0);
      assert.equal(status, allowed ? undefined : 403);
      if (!allowed) assert.equal(body.errorCode, 'FORBIDDEN');
      assert.deepEqual(inputs, [{ name: 'vaiTroId', value: 2 }, { name: 'maChucNang', value: 'QLNGUOIDUNG' }]);
    });
  }
}

test('QuanTriVien retains existing full access without querying permissions', async () => {
  const inputs = [];
  let calls = 0;
  await permissionModule([], inputs).checkPermission('QLNGUOIDUNG', 'them')({ user: { tenVaiTro: 'QuanTriVien' } }, {}, () => calls++);
  assert.equal(calls, 1);
  assert.equal(inputs.length, 0);
});

test('database error reaches error handler instead of granting access', async () => {
  const error = new Error('DB unavailable');
  let forwarded;
  await permissionModule([], [], error).checkPermission('QLNGUOIDUNG', 'xem')({ user: { vaiTroId: 2, tenVaiTro: 'BacSi' } }, {}, (err) => { forwarded = err; });
  assert.equal(forwarded, error);
});

test('account routes enforce permissions while preserving self-service password access', async (t) => {
  const roles = { QuanTriVien: 1, BacSi: 2, NguoiChamSoc: 3, NguoiCaoTuoi: 4 };
  const controllerCalls = [];
  const ctrl = Object.fromEntries(['getAll', 'getById', 'create', 'update', 'toggleStatus', 'changeMyPassword'].map(name => [name, (req, res) => { controllerCalls.push(name); res.json({ handler: name }); }]));
  const router = load('src/routes/nguoiDung.routes.js', {
    express,
    '../controllers/nguoiDung.controller': ctrl,
    '../middlewares/auth.middleware': (req, res, next) => {
      const role = req.headers['x-test-role'];
      if (!roles[role]) return res.status(401).json({ errorCode: 'NO_TOKEN' });
      req.user = { tenVaiTro: role, vaiTroId: roles[role] };
      next();
    },
    '../middlewares/permission.middleware': permissionModule([{ ChoPhepXem: false, ChoPhepThem: false, ChoPhepSua: false, ChoPhepXoa: false }]),
    '../middlewares/mobile-scope.middleware': { isMobileRole: req => ['NguoiCaoTuoi', 'NguoiChamSoc'].includes(req.user.tenVaiTro) },
    '../utils/response': { fail: (res, message, errorCode, status) => res.status(status).json({ errorCode }) },
  });
  const app = express();
  app.use(express.json());
  app.use('/api/users', router);
  const server = app.listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  t.after(() => new Promise(resolve => server.close(resolve)));
  const base = `http://127.0.0.1:${server.address().port}/api/users`;
  const endpoints = [['GET', '', 'getAll'], ['GET', '/1', 'getById'], ['POST', '', 'create'], ['PUT', '/1', 'update'], ['PATCH', '/1/toggle-status', 'toggleStatus']];
  for (const role of Object.keys(roles)) {
    for (const [method, suffix, handler] of endpoints) {
      const before = controllerCalls.length;
      const res = await fetch(base + suffix, { method, headers: { 'x-test-role': role } });
      assert.equal(res.status, role === 'QuanTriVien' ? 200 : 403, `${role} ${method} ${suffix}`);
      assert.equal(controllerCalls.length, before + (role === 'QuanTriVien' ? 1 : 0));
      if (role === 'QuanTriVien') assert.equal((await res.json()).handler, handler);
    }
    const password = await fetch(base + '/me/password', { method: 'PUT', headers: { 'x-test-role': role } });
    assert.equal(password.status, 200, `${role} self password`);
    assert.equal((await password.json()).handler, 'changeMyPassword');
  }
  assert.equal((await fetch(base)).status, 401);
});
