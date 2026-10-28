const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { createRequire } = require('node:module');

const cases = [
  ['Huyết áp', 'HUYET_AP', 120, 80, 'mmHg'],
  ['Nhịp tim', 'NHIP_TIM', 72, null, 'lần/phút'],
  ['Đường huyết', 'DUONG_HUYET', 100, null, 'mg/dL'],
  ['Nhiệt độ cơ thể', 'NHIET_DO', 37.2, null, '°C'],
  ['SpO2', 'SPO2', 98, null, '%'],
  ['Cân nặng', 'CAN_NANG', 75, null, 'kg'],
];
function fixture(rows, type = cases[0], typeId = 1) {
  const queries = [], inputs = {}, events = [];
  const request = () => ({ input(key, _, value) { inputs[key] = value; return this; },
    async query(statement) {
      queries.push(statement);
      if (statement.includes('FROM LoaiChiSoSucKhoe') && statement.includes('WHERE'))
        return { recordset: [{ LoaiChiSoID: typeId, TenChiSo: type[0], DonVi: type[4] }] };
      if (statement.includes('FROM HoSoNguoiCaoTuoi') && statement.includes('WHERE UserID'))
        return { recordset: [{ id: 7 }] };
      return { recordset: rows };
    } });
  const filename = path.resolve(__dirname, '../src/controllers/chiSoSucKhoe.controller.js');
  const module = { exports: {} }, nativeRequire = createRequire(filename);
  const sql = { Int: 'Int', NVarChar: Object.assign(() => 'String', {}), DateTime2: 'DateTime2', Bit: 'Bit', Decimal: () => 'Decimal' };
  const stubs = {
    '../config/db': { poolPromise: Promise.resolve({ request }), sql },
    '../middlewares/mobile-scope.middleware': { scopedWhere: () => '', targetElderlyId: (_, id) => id, isMobileRole: () => false },
    '../socket': { emitToAdmin: (name, payload) => events.push({ name, payload }) },
    '../services/alertNotification.service': { notifyAlertRecipients: async () => ({}), emitAlertNotifications: () => {} },
  };
  vm.runInNewContext(fs.readFileSync(filename, 'utf8'), { module, exports: module.exports, Date, console,
    require: name => stubs[name] || nativeRequire(name) }, { filename });
  const response = { statusCode: 200, status(code) { this.statusCode = code; return this; }, json(body) { this.body = body; return this; } };
  return { controller: module.exports, response, queries, inputs, events };
}
const invoke = async (f, handler, req) => {
  await f.controller[handler](req, f.response, error => { throw error; });
  return f.response.body.data;
};

for (const [index, type] of cases.entries()) test(`own create resolves ${type[0]} by catalog ID, never by list position`, async () => {
  const typeId = 700 - index * 53;
  const f = fixture([{ id: 99, loaiChiSoId: typeId, tenChiSo: type[0], donVi: type[4],
    giaTri: type[2], giaTriPhu: type[3], thoiGianDo: new Date('2026-10-27T13:05:00Z'), alertId: null }], type, typeId);
  const row = await invoke(f, 'createMine', { body: { loaiChiSoId: typeId, giaTri: type[2],
    ...(type[3] == null ? {} : { giaTriPhu: type[3] }) }, user: { userId: 1 } });
  assert.equal(f.response.statusCode, 201); assert.equal(f.inputs.typeId, typeId);
  assert.equal(f.inputs.primaryValue, type[2]); assert.equal(f.inputs.secondaryValue, type[3]);
  assert.equal(row.loaiChiSoId, typeId); assert.equal(row.tenChiSo, type[0]);
});
test('heart-rate catalog ID with BP secondary value is rejected, not silently remapped to BP', async () => {
  const f = fixture([], cases[1], 73);
  await invoke(f, 'createMine', { body: { loaiChiSoId: 73, giaTri: 120, giaTriPhu: 80 }, user: { userId: 1 } });
  assert.equal(f.response.statusCode, 422); assert.equal(f.response.body.errorCode, 'INVALID_METRIC_VALUE');
  assert.ok(f.queries.every(query => !query.includes('INSERT INTO ChiSoSucKhoe')));
});

for (const [wall, utc] of [['2026-10-27T13:05:00', '2026-10-27T06:05:00.000Z'],
  ['2026-10-27T23:55:00', '2026-10-27T16:55:00.000Z']]) {
  test(`Web API keeps Vietnam form fields while returning a real UTC instant: ${wall}`, async () => {
    const f = fixture([{ id: 1, tenChiSo: 'Huyết áp', giaTri: 120, giaTriPhu: 80,
      thoiGianDo: utc, thoiGianDoDiaPhuong: wall, laBatThuong: false }]);
    const rows = await invoke(f, 'getAll', { query: {}, user: { userId: 1 } });
    assert.equal(rows[0].thoiGianDo, utc);
    assert.equal(rows[0].ngayDo, wall.slice(0, 10)); assert.equal(rows[0].gioDo, wall.slice(11, 16));
    assert.equal(rows[0].giaTri, '120/80'); assert.equal(rows[0].binhThuong, true);
    assert.match(f.queries[0], /AT TIME ZONE 'SE Asia Standard Time' AT TIME ZONE 'UTC'/);
    assert.match(f.queries[0], /CONVERT\(VARCHAR\(19\),c.ThoiGianDo,126\) AS thoiGianDoDiaPhuong/);
  });
}

for (const type of cases) test(`existing ${type[0]} values and abnormal flags are unchanged`, async () => {
  const f = fixture([{ id: 1, tenChiSo: type[0], donVi: type[4], giaTri: type[2], giaTriPhu: type[3],
    thoiGianDo: '2026-10-27T16:55:00Z', thoiGianDoDiaPhuong: '2026-10-27T23:55:00', laBatThuong: true }], type);
  const [row] = await invoke(f, 'getAll', { query: {}, user: { userId: 1 } });
  assert.equal(row.loaiChiSo, type[1]); assert.equal(row.giaTriChinh, type[2]); assert.equal(row.giaTriPhu, type[3]);
  assert.equal(row.donVi, type[4]); assert.equal(row.laBatThuong, true); assert.equal(row.binhThuong, false);
});

test('Web creation preserves the entered wall time and emits SQL-projected UTC without modifying stored input', async () => {
  const original = Date.now; Date.now = () => Date.parse('2026-10-27T17:30:00Z');
  try {
    for (const clock of ['13:05', '23:55']) {
      const utc = clock === '13:05' ? '2026-10-27T06:05:00Z' : '2026-10-27T16:55:00Z';
      const f = fixture([{ id: 11, alertId: null, thoiGianDoUtc: utc }]);
      const result = await invoke(f, 'create', { body: { nguoiCaoTuoiId: 7, loaiChiSo: 'HUYET_AP', giaTri: '120/80',
        ngayDo: '2026-10-27', gioDo: clock }, user: { userId: 1 } });
      assert.equal(f.inputs.thoiGian.toISOString(), `2026-10-27T${clock}:00.000Z`); // Driver transports these wall fields unchanged.
      assert.equal(f.events[0].payload.thoiGianDo, utc); assert.equal(f.events[0].payload.giaTri, 120);
      assert.equal(result.automaticAssessment, 'BINH_THUONG'); assert.equal(result.alertCreated, false);
    }
  } finally { Date.now = original; }
});

test('Mobile GET response keeps its existing unzoned wall-time contract', async () => {
  const f = fixture([{ id: 1, giaTri: 120, giaTriPhu: 80, thoiGianDo: '2026-10-27T23:55:00' }]);
  const rows = await invoke(f, 'getMine', { query: {}, user: { userId: 1 } });
  assert.equal(rows[0].thoiGianDo, '2026-10-27T23:55:00');
});

test('Mobile creation keeps wall time in its response and uses canonical UTC only for Web realtime', async () => {
  const f = fixture([{ id: 1, tenChiSo: 'Huyết áp', giaTri: 120, giaTriPhu: 80,
    thoiGianDo: new Date('2026-10-27T13:05:00Z'), thoiGianDoUtc: '2026-10-27T06:05:00Z', alertId: null }]);
  const row = await invoke(f, 'createMine', { body: { loaiChiSoId: 1, giaTri: 120, giaTriPhu: 80 }, user: { userId: 1 } });
  assert.equal(row.thoiGianDo, '2026-10-27T13:05:00'); assert.equal(f.events[0].payload.thoiGianDo, '2026-10-27T06:05:00Z');
  assert.match(f.queries.at(-1), /DATEADD\(HOUR,7,SYSUTCDATETIME\(\)\)/);
});

// A false abnormal flag alone does not prove that a catalog threshold exists.
test('AUD-13 read models retain unknown assessment instead of claiming normal', async () => {
  for (const handler of ['getAll', 'getMine']) {
    const f = fixture([{ id: 98, giaTri: 75, tenChiSo: 'Cân nặng', laBatThuong: false,
      trangThaiDanhGia: 'CHUA_CO_NGUONG' }]);
    const rows = await invoke(f, handler, { query: {}, user: { userId: 1 } });
    assert.equal(rows[0].trangThaiDanhGia, 'CHUA_CO_NGUONG');
    assert.match(f.queries.join(' '), /GiaTriMin.*GiaTriMax/s);
  }
});
