const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { createRequire } = require('node:module');
const { validatePhoneNumber } = require('../src/utils/phoneValidation');

function fixture(filename) {
  const writes = [];
  let requests = 0;
  const pool = { request: () => {
    requests++;
    const values = {};
    return { input(key, _type, value) { values[key] = value; return this; },
      async query(statement) {
        if (/INSERT INTO|UPDATE /.test(statement)) writes.push({ ...values });
        return { recordset: statement.includes('SELECT Email') ? [] : [{ id: 1 }] };
      } };
  } };
  const stubs = {
    '../config/db': { poolPromise: Promise.resolve(pool), sql: { Int: 'Int', NVarChar: () => 'NVarChar', VarChar: () => 'VarChar' } },
    '../utils/response': {
      ok: (res, data, _message, status = 200) => Object.assign(res, { status, data }),
      fail: (res, message, code, status) => Object.assign(res, { status, message, code }),
    },
    '../middlewares/mobile-scope.middleware': { isMobileRole: () => false, ownsElderlyId: () => true,
      targetElderlyId: (_req, id) => id, scopedWhere: () => '' },
  };
  const fullPath = path.resolve(__dirname, '../src/controllers', filename);
  const module = { exports: {} };
  vm.runInNewContext(fs.readFileSync(fullPath, 'utf8'), { module, exports: module.exports,
    require: name => stubs[name] ?? createRequire(fullPath)(name) }, { filename: fullPath });
  return { controller: module.exports, writes, get requests() { return requests; } };
}
const body = () => ({ nguoiCaoTuoiId: 1, hoTen: 'Liên hệ thử', email: 'contact@example.invalid', soDienThoai: '0901234567' });
const next = error => { throw error; };

test('Phone validation requires a ten-digit string beginning with zero, and allows omitted optional numbers', () => {
  for (const phone of ['abc', '09123', '09012345678', '1901234567', 901234567, {}, true]) {
    assert.match(validatePhoneNumber(phone), /10 số.*bắt đầu bằng 0/);
  }
  assert.equal(validatePhoneNumber(' 0901234567 '), null);
  for (const phone of [undefined, null, '', '  ']) {
    assert.equal(validatePhoneNumber(phone, { required: false }), null);
    assert.match(validatePhoneNumber(phone), /bắt buộc/);
  }
});

for (const filename of ['nguoiChamSoc.controller.js', 'lienHeKhanCap.controller.js']) {
  for (const method of ['create', 'update']) {
    test(`${filename} ${method} rejects invalid primary phone before SQL`, async () => {
      const f = fixture(filename);
      for (const phone of ['abc', '09123', '09012345678', '1901234567', '  ', 901234567]) {
        const res = {};
        await f.controller[method]({ params: { id: '1' }, body: { ...body(), soDienThoai: phone } }, res, next);
        assert.equal(res.status, 422, String(phone));
        assert.equal(res.code, 'INVALID_PHONE');
      }
      assert.equal(f.requests, 0);
    });
  }
}

test('Contact create/update validates optional secondary phone before SQL', async () => {
  const f = fixture('lienHeKhanCap.controller.js');
  for (const method of ['create', 'update']) {
    for (const phone of ['abc', '1234567890', '09012345678', 901234567]) {
      const res = {};
      await f.controller[method]({ params: { id: '1' }, body: { ...body(), soDienThoaiPhu: phone } }, res, next);
      assert.equal(res.status, 422);
      assert.equal(res.code, 'INVALID_SECONDARY_PHONE');
    }
  }
  assert.equal(f.requests, 0);
});

test('Valid create/update stores trimmed numbers and allows empty secondary phone', async () => {
  for (const filename of ['nguoiChamSoc.controller.js', 'lienHeKhanCap.controller.js']) {
    const f = fixture(filename);
    for (const method of ['create', 'update']) {
      const res = {};
      await f.controller[method]({ params: { id: '1' }, body: { ...body(), soDienThoai: ' 0901234567 ', soDienThoaiPhu: '  ' } }, res, next);
      assert.ok(res.status >= 200 && res.status < 300);
      assert.equal(f.writes.at(-1).sdt, '0901234567');
      if (filename.startsWith('lienHe')) assert.equal(f.writes.at(-1).sdtPhu, null);
    }
  }
});
