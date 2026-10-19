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
