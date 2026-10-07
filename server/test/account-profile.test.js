const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const express = require('express');

function load(file, dependencies) {
  const module = { exports: {} };
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, '..', file), 'utf8'), {
    module, require: name => {
      if (!(name in dependencies)) throw new Error('Unexpected dependency: ' + name);
      return dependencies[name];
    },
  });
  return module.exports;
}
const response = load('src/utils/response.js', {});

function fixture(kind, options = {}) {
  const state = {
    profile: { UserID: null, HoTen: 'Existing profile', SoDienThoai: '0900000000', Email: null },
    users: [{ UserID: 7, TrangThai: 'HoatDong', TenVaiTro: kind === 'elderly' ? 'NguoiCaoTuoi' : 'NguoiChamSoc' }],
    created: 0,
  };
  Object.assign(state.profile, options.profile);
  Object.assign(state.users[0], options.user);
  const log = [];
  let rolledBack = 0, committed = 0;
  class Transaction {
    async begin(level) {
      assert.equal(level, 'SERIALIZABLE');
      this.draft = structuredClone(state);
      log.push('begin');
    }
    async commit() { Object.assign(state, this.draft); committed++; log.push('commit'); }
    async rollback() { rolledBack++; log.push('rollback'); }
  }
  class Request {
    constructor(transaction) { this.transaction = transaction; this.params = {}; }
    input(name, type, value) { this.params[name] = value; return this; }
    async query(query) {
      log.push(query);
      const draft = this.transaction.draft;
      if (query.includes('FROM NguoiDung u')) {
        assert.match(query, /UPDLOCK, HOLDLOCK/);
        return { recordset: options.noUser ? [] : draft.users };
      }
      if (query.includes('SELECT UserID, HoTen')) {
        assert.match(query, /UPDLOCK, HOLDLOCK/);
        return { recordset: options.noProfile ? [] : [draft.profile] };
      }
      if (query.includes('SELECT VaiTroID')) return { recordset: [{ VaiTroID: kind === 'elderly' ? 4 : 3 }] };
      if (query.includes('INSERT INTO NguoiDung')) {
        assert.notEqual(this.params.hash, 'demo-password');
        if (options.duplicateAccount) throw { number: 2627 };
        draft.created++;
        return { recordset: [{ userId: 8 }] };
      }
      if (query.includes('SELECT NguoiCaoTuoiID') || query.includes('SELECT NguoiChamSocID')) {
        assert.match(query, /UPDLOCK, HOLDLOCK/);
        const other = query.includes(kind === 'elderly' ? 'FROM NguoiChamSoc' : 'FROM HoSoNguoiCaoTuoi');
        return { recordset: (other ? options.otherLinked : options.sameLinked) ? [{ id: 3 }] : [] };
      }
      if (query.includes('UPDATE ')) {
        assert.match(query, /SET UserID=@userId/);
        assert.match(query, /AND UserID IS NULL/);
        if (options.updateError) throw options.updateError;
        if (options.race) return { recordset: [] };
        draft.profile.UserID = this.params.userId;
        return { recordset: [{ profileId: this.params.profileId }] };
      }
      throw new Error('Unexpected SQL: ' + query);
    }
  }
  const sizedType = () => 'sized';
  const service = load('src/services/account-profile.service.js', {
    bcryptjs: { hash: async () => 'bcrypt-test-hash' },
    '../config/db': { poolPromise: Promise.resolve({}), sql: {
      Transaction, Request, Int: 'Int', VarChar: sizedType, NVarChar: sizedType,
      ISOLATION_LEVEL: { SERIALIZABLE: 'SERIALIZABLE' },
    } },
  });
  return { service, state, log, get rolledBack() { return rolledBack; }, get committed() { return committed; } };
}

for (const kind of ['elderly', 'caregiver']) {
  test(kind + ': links explicit IDs without creating or changing profile details', async () => {
    const f = fixture(kind);
    const result = await f.service.linkProfile(kind, '2', { userId: 7 });
    assert.equal(result.profileId, 2);
    assert.equal(result.userId, 7);
    assert.equal(f.state.profile.UserID, 7);
    assert.equal(f.state.profile.HoTen, 'Existing profile');
    assert.equal(f.state.created, 0);
    assert.equal(f.committed, 1);
  });
  const cases = [
    ['wrong role', { user: { TenVaiTro: 'BacSi' } }, 'ROLE_MISMATCH', 409],
    ['inactive user', { user: { TrangThai: 'KhoaTaiKhoan' } }, 'USER_INACTIVE', 409],
    ['profile linked', { profile: { UserID: 9 } }, 'PROFILE_ALREADY_LINKED', 409],
    ['user linked same type', { sameLinked: true }, 'USER_ALREADY_LINKED', 409],
    ['user linked other type', { otherLinked: true }, 'USER_LINKED_OTHER_PROFILE', 409],
    ['profile missing', { noProfile: true }, 'PROFILE_NOT_FOUND', 404],
    ['user missing', { noUser: true }, 'USER_NOT_FOUND', 404],
    ['conditional update loses race', { race: true }, 'PROFILE_ALREADY_LINKED', 409],
    ['unique conflict', { updateError: { number: 2601 } }, 'ACCOUNT_PROFILE_CONFLICT', 409],
    ['deadlock', { updateError: { number: 1205 } }, 'LINK_CONCURRENT_CONFLICT', 409],
  ];
  for (const [label, options, code, status] of cases) {
    test(kind + ': ' + label + ' rejects and rolls back', async () => {
      const f = fixture(kind, options);
      const before = structuredClone(f.state);
      await assert.rejects(f.service.linkProfile(kind, 2, { userId: 7 }), err => err.errorCode === code && err.statusCode === status);
      assert.deepEqual(f.state, before);
      assert.equal(f.rolledBack, 1);
      assert.equal(f.committed, 0);
    });
  }
  test(kind + ': creates account and links existing profile atomically', async () => {
    const f = fixture(kind);
    const result = await f.service.linkProfile(kind, 2, { username: 'new.account', password: 'demo-password' }, true);
    assert.equal(result.userId, 8);
    assert.equal(f.state.profile.UserID, 8);
    assert.equal(f.state.created, 1);
    assert.equal(f.committed, 1);
  });
  test(kind + ': failure after account insert leaves no account or link', async () => {
    const error = new Error('update failed');
    const f = fixture(kind, { updateError: error });
    await assert.rejects(f.service.linkProfile(kind, 2, { username: 'new.account', password: 'demo-password' }, true), err => err === error);
    assert.equal(f.state.created, 0);
    assert.equal(f.state.profile.UserID, null);
    assert.equal(f.rolledBack, 1);
  });
  test(kind + ': duplicate new account rolls back', async () => {
    const f = fixture(kind, { duplicateAccount: true });
    await assert.rejects(f.service.linkProfile(kind, 2, { username: 'new.account', password: 'demo-password' }, true), err => err.errorCode === 'ACCOUNT_PROFILE_CONFLICT');
    assert.equal(f.state.created, 0);
    assert.equal(f.rolledBack, 1);
  });
  for (const [label, options, code] of [
    ['missing profile', { noProfile: true }, 'PROFILE_NOT_FOUND'],
    ['linked profile', { profile: { UserID: 9 } }, 'PROFILE_ALREADY_LINKED'],
  ]) {
    test(kind + ': account creation rejects ' + label + ' without inserting user', async () => {
      const f = fixture(kind, options);
      await assert.rejects(f.service.linkProfile(kind, 2, { username: 'new.account', password: 'demo-password' }, true), err => err.errorCode === code);
      assert.equal(f.state.created, 0);
      assert.equal(f.rolledBack, 1);
    });
  }
}

test('invalid IDs, credentials, extra fields rejected before transaction', async () => {
  const f = fixture('elderly');
  for (const id of [0, -1, '1junk', true, 2147483648]) {
    await assert.rejects(f.service.linkProfile('elderly', id, { userId: 7 }), err => err.statusCode === 400);
  }
  await assert.rejects(f.service.linkProfile('elderly', 2, { userId: 7, hoTen: 'auto-match' }), err => err.statusCode === 400);
  await assert.rejects(f.service.linkProfile('elderly', 2, { username: 'new', password: 'short' }, true), err => err.statusCode === 400);
  assert.equal(f.log.length, 0);
});

test('controller returns structured linking errors and forwards unexpected errors', async () => {
  const service = fixture('elderly').service;
  let failure = new service.LinkingError('Profile missing', 'PROFILE_NOT_FOUND', 404);
  const controller = load('src/controllers/accountProfile.controller.js', {
    '../services/account-profile.service': { LinkingError: service.LinkingError, linkProfile: async () => { throw failure; } },
    '../utils/response': response,
  });
  let status, body, forwarded;
  const res = { status(value) { status = value; return this; }, json(value) { body = value; } };
  await controller.linkElderly({ params: { id: '2' }, body: { userId: 7 } }, res, error => { forwarded = error; });
  assert.equal(status, 404);
  assert.equal(body.success, false);
  assert.equal(body.errorCode, 'PROFILE_NOT_FOUND');
  assert.equal(forwarded, undefined);
  failure = new Error('Unexpected SQL failure');
  await controller.createCaregiverUser({ params: { id: '2' }, body: {} }, res, error => { forwarded = error; });
  assert.equal(forwarded, failure);
});

test('real linking routes require Admin; use existing response format', async (t) => {
  let calls = 0;
  const linking = load('src/controllers/accountProfile.controller.js', {
    '../services/account-profile.service': {
      LinkingError: class extends Error {},
      linkProfile: async (kind, id, body, create) => { calls++; return { profileId: Number(id), userId: create ? 8 : body.userId, tenVaiTro: kind === 'elderly' ? 'NguoiCaoTuoi' : 'NguoiChamSoc' }; },
    },
    '../utils/response': response,
  });
  const admin = load('src/middlewares/admin.middleware.js', { '../utils/response': response });
  const app = express();
  app.use(express.json());
  const noop = (req, res, next) => next();
  const controllers = new Proxy({}, { get: () => (req, res) => res.json({ existing: true }) });
  const common = {
    express, '../middlewares/auth.middleware': (req, res, next) => {
      if (!req.headers['x-role']) return res.sendStatus(401);
      req.user = { tenVaiTro: req.headers['x-role'] }; next();
    },
    '../middlewares/mobile-scope.middleware': { loadMobileScope: noop, webOnlyWrite: noop, caregiverOnlyWrite: noop, guardResource: () => noop, isMobileRole: () => false },
    '../middlewares/permission.middleware': { checkPermission: () => noop },
    '../middlewares/admin.middleware': admin,
    '../controllers/accountProfile.controller': linking,
  };
  for (const [prefix, file, controller] of [
    ['elderly', 'hoSoNguoiCaoTuoi.routes.js', 'hoSoNguoiCaoTuoi'],
    ['caregivers', 'nguoiChamSoc.routes.js', 'nguoiChamSoc'],
  ]) {
    const deps = { ...common, ['../controllers/' + controller + '.controller']: controllers };
    for (const name of ['chiSoSucKhoe', 'lichUongThuoc', 'donThuoc', 'lichKhamBenh', 'nguoiChamSoc', 'canhBao']) deps['../controllers/' + name + '.controller'] = controllers;
    app.use('/api/' + prefix, load('src/routes/' + file, deps));
  }
  const server = app.listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  t.after(() => new Promise(resolve => server.close(resolve)));
  for (const prefix of ['elderly', 'caregivers']) {
    for (const [method, suffix, status] of [['PATCH', 'link-user', 200], ['POST', 'user', 201]]) {
      const url = 'http://127.0.0.1:' + server.address().port + '/api/' + prefix + '/2/' + suffix;
      for (const role of ['BacSi', 'NguoiCaoTuoi', 'NguoiChamSoc', 'QuanTriVien']) {
        const before = calls;
        const res = await fetch(url, { method, headers: { 'Content-Type': 'application/json', 'x-role': role }, body: JSON.stringify({ userId: 7 }) });
        assert.equal(res.status, role === 'QuanTriVien' ? status : 403);
        const body = await res.json();
        assert.equal(body.success, role === 'QuanTriVien');
        assert.equal(calls, before + (role === 'QuanTriVien' ? 1 : 0));
        if (role !== 'QuanTriVien') assert.equal(body.errorCode, 'ADMIN_REQUIRED');
      }
      assert.equal((await fetch(url, { method })).status, 401);
    }
  }
});
