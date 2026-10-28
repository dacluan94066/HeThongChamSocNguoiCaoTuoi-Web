const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { createRequire } = require('node:module');

test('only a committed account lock disconnects existing sockets; unlock and failed write do not', async () => {
  for (const [status, fail, expected] of [['HoatDong', false, [7]], ['KhoaTaiKhoan', false, []], ['HoatDong', true, []]]) {
    const disconnected = []; let queries = 0, caught;
    const pool = { request: () => ({ input() { return this; }, async query() {
      if (++queries === 1) return { recordset: [{ TrangThai: status }] };
      if (fail) throw Error('FIXTURE_WRITE_FAILURE'); return { recordset: [] };
    } }) };
    const filename = path.resolve(__dirname, '../src/controllers/nguoiDung.controller.js'), module = { exports: {} }, local = createRequire(filename);
    vm.runInNewContext(fs.readFileSync(filename, 'utf8'), { module, exports: module.exports,
      require: name => ({ '../config/db': { poolPromise: Promise.resolve(pool), sql: { Int: 'Int', NVarChar: 'NVarChar' } },
        '../socket': { disconnectUser: id => disconnected.push(id) } }[name] || local(name)),
    }, { filename });
    const response = { status() { return this; }, json() { return this; } };
    await module.exports.toggleStatus({ params: { id: '7' } }, response, error => { caught = error; });
    assert.deepEqual(disconnected, expected); assert.equal(Boolean(caught), fail);
  }
});
