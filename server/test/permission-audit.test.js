const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

test('SQL BIT false and zero both deny, true allows', async () => {
  const filename = path.resolve(__dirname, '../src/middlewares/permission.middleware.js');
  const module = { exports: {} };
  let bit;
  const pool = { request: () => ({
    input() { return this; },
    async query() { return { recordset: bit == null ? [] : [{ ChoPhepXoa: bit }] }; },
  }) };
  vm.runInNewContext(fs.readFileSync(filename, 'utf8'), {
    module, exports: module.exports,
    require: (name) => name === '../config/db'
      ? { poolPromise: Promise.resolve(pool), sql: { Int: 'Int', NVarChar: 'NVarChar' } }
      : { fail: (_res, _message, code, status) => ({ code, status }) },
  }, { filename });
  for (const value of [false, 0, null]) {
    bit = value;
    let nextCalled = false;
    const result = await module.exports.checkPermission('QLNHATKY', 'xoa')(
      { user: { tenVaiTro: 'NguoiChamSoc', vaiTroId: 2 } }, {}, () => { nextCalled = true; });
    assert.equal(nextCalled, false);
    assert.equal(result.status, 403);
  }
  bit = true;
  let nextCalled = false;
  await module.exports.checkPermission('QLNHATKY', 'xoa')(
    { user: { tenVaiTro: 'NguoiChamSoc', vaiTroId: 2 } }, {}, () => { nextCalled = true; });
  assert.equal(nextCalled, true);
});

test('all authenticated route modules invoke checkPermission', () => {
  const directory = path.resolve(__dirname, '../src/routes');
  const publicModules = new Set(['index.js']);
  for (const file of fs.readdirSync(directory).filter((name) => name.endsWith('.routes.js'))) {
    if (publicModules.has(file)) continue;
    const source = fs.readFileSync(path.join(directory, file), 'utf8');
    assert.match(source, /checkPermission/, `${file} has no feature permission check`);
  }
  const matrix = fs.readFileSync(path.resolve(__dirname, '../database/patch_phanquyen_audit.sql'), 'utf8');
  assert.match(matrix, /NguoiChamSoc.*QLLIENHEKC/);
  assert.match(matrix, /NguoiChamSoc.*QLNHATKY/);
  assert.match(matrix, /NguoiCaoTuoi.*QLHOSONCT/);
});

test('Permission reseed matches all 33 permissions in FINAL.sql on repeated runs', async () => {
  const finalSql = fs.readFileSync(path.resolve(__dirname, '../../QLSucKhoeNguoiCaoTuoi_FINAL.sql'), 'utf8');
  const expected = new Map([...finalSql.matchAll(/\(N'(QuanTriVien|NguoiChamSoc|NguoiCaoTuoi)','([^']+)',([01]),([01]),([01]),([01])\)/g)]
    .map(([, role, feature, ...flags]) => [`${role}:${feature}`, flags.map(Number)]));
  assert.equal(expected.size, 33);
  const roles = ['QuanTriVien', 'NguoiChamSoc', 'NguoiCaoTuoi'];
  const features = [...new Set([...expected.keys()].map(key => key.split(':')[1]))];
  const saved = new Map();
  class Transaction { async begin() {} async commit() {} async rollback() {} }
  class Request {
    constructor() { this.values = {}; }
    input(key, _type, value) { this.values[key] = value; return this; }
    async query(statement) {
      if (statement.includes('DELETE FROM PhanQuyen')) saved.clear();
      if (statement.includes('INSERT INTO PhanQuyen')) {
        const v = this.values;
        saved.set(`${roles[v.vaiTroId - 1]}:${features[v.chucNangId - 1]}`, [v.xem, v.them, v.sua, v.xoa]);
      }
      return { recordset: [] };
    }
  }
  const pool = { close: async () => {}, request: () => ({ query: async statement => ({ recordset:
    statement.includes('FROM VaiTro') ? roles.map((TenVaiTro, i) => ({ VaiTroID: i + 1, TenVaiTro }))
      : features.map((MaChucNang, i) => ({ ChucNangID: i + 1, MaChucNang })) }) }) };
  const filename = path.resolve(__dirname, '../seed_phanquyen.js');
  for (let run = 0; run < 2; run++) {
    const processStub = {};
    await vm.runInNewContext(fs.readFileSync(filename, 'utf8'), {
      require: name => name === 'dotenv' ? { config() {} }
        : { poolPromise: Promise.resolve(pool), sql: { Transaction, Request, Int: 'Int', Bit: 'Bit' } },
      console: { log() {}, error() {} }, process: processStub,
    }, { filename });
    assert.equal(processStub.exitCode, undefined);
    assert.deepEqual(saved, expected);
  }
});
