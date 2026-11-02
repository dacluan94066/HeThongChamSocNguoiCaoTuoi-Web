const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { createRequire } = require('node:module');

function fixture({ now = '2026-11-02T10:00:00', allergy = null } = {}) {
  const state = {
    committed: false,
    rolledBack: false,
    queries: [],
    events: [],
    deletedFutureDoses: 0,
    prescriptionUpdated: false,
  };

  class Transaction {
    async begin() {}
    async commit() { state.committed = true; }
    async rollback() { state.rolledBack = true; }
  }

  class Request {
    constructor() { this.values = {}; }
    input(key, _type, value) { this.values[key] = value; return this; }
    async query(query) {
      state.queries.push(query);
      if (query.includes('FROM HoSoNguoiCaoTuoi') && query.includes('DiUng')) {
        return { recordset: [{ NguoiCaoTuoiID: 6, UserID: 10, DiUng: allergy, BenhNen: 'Cao huyết áp' }] };
      }
      if (query.includes('FROM DanhMucThuoc') && query.includes('HoatChat')) {
        return {
          recordset: [{
            id: this.values.medicineId,
            tenThuoc: this.values.medicineId === 1 ? 'Aspirin 81mg' : 'Paracetamol 500mg',
            hoatChat: this.values.medicineId === 1 ? 'Aspirin' : 'Paracetamol',
          }],
        };
      }
      if (query.includes('INSERT INTO DonThuoc')) {
        return { recordset: [{ id: 99 }] };
      }
      if (query.includes('INSERT INTO DonThuocChiTiet')) {
        return { recordset: [{ id: 101 }] };
      }
      if (query.includes('generatedCount')) {
        return { recordset: [{ generatedCount: 10 }] };
      }
      if (query.includes('expiredCount')) {
        return { recordset: [{ expiredCount: 0 }] };
      }

      // Stop prescription queries
      if (query.includes('FROM DonThuoc d') && query.includes('hs.NguoiCaoTuoiID=d.NguoiCaoTuoiID')) {
        if (this.values.prescriptionId === 999) return { recordset: [] };
        return {
          recordset: [{
            DonThuocID: this.values.prescriptionId,
            NgayBatDau: '2026-11-01',
            NgayKetThuc: '2026-11-30',
            GhiChu: 'Uống sau ăn',
            UserID: 10,
          }],
        };
      }
      if (query.includes('UPDATE DonThuoc')) {
        state.prescriptionUpdated = true;
        return { rowsAffected: [1] };
      }
      if (query.includes('DELETE l') && query.includes('FROM LichUongThuoc l')) {
        state.deletedFutureDoses = 15;
        return { recordset: [{ deletedCount: 15 }] };
      }

      throw Error(`Unexpected isolated query in test fixture: ${query}`);
    }
  }

  const filename = path.resolve(__dirname, '../src/controllers/donThuoc.controller.js');
  const module = { exports: {} }, local = createRequire(filename);
  vm.runInNewContext(fs.readFileSync(filename, 'utf8'), {
    module, exports: module.exports, require: (name) => ({
      '../config/db': { poolPromise: Promise.resolve({}), sql: { Int: 1, Date: 2, Transaction, Request, NVarChar: () => 3, VarChar: () => 4 } },
      '../utils/vietnamDate': { todayVietnam: () => now.slice(0, 10) },
      '../socket': { emitToUser: (...args) => state.events.push(args), emitToAdmin: (...args) => state.events.push(args) },
    }[name] || local(name)),
  }, { filename });

  return {
    state,
    async create(body) {
      const response = { statusCode: 200, status(code) { this.statusCode = code; return this; }, json(val) { this.body = val; return this; } };
      await module.exports.create({ params: { id: '6' }, user: { userId: 1 }, body }, response, (err) => { throw err; });
      return response;
    },
    async stop(prescriptionId, body = {}) {
      const response = { statusCode: 200, status(code) { this.statusCode = code; return this; }, json(val) { this.body = val; return this; } };
      await module.exports.stop({ params: { id: '6', prescriptionId: String(prescriptionId) }, user: { userId: 1 }, body }, response, (err) => { throw err; });
      return response;
    },
  };
}

test('stop prescription updates end date to today and deletes future doses', async () => {
  const f = fixture();
  const res = await f.stop(12, { lyDo: 'Dị ứng thuốc' });

  assert.equal(res.statusCode, 200);
  assert.equal(res.body.success, true);
  assert.equal(res.body.data.daDung, true);
  assert.equal(res.body.data.soLieuDaHuy, 15);
  assert.equal(f.state.committed, true);
  assert.equal(f.state.prescriptionUpdated, true);
  assert.ok(f.state.events.length > 0);
});

test('stop prescription with not found prescription returns 404', async () => {
  const f = fixture();
  const res = await f.stop(999, { lyDo: 'Không có đơn' });

  assert.equal(res.statusCode, 404);
  assert.equal(res.body.success, false);
  assert.equal(res.body.errorCode, 'PRESCRIPTION_NOT_FOUND');
  assert.equal(f.state.rolledBack, true);
});

test('prescription with matching allergy returns 422 ALLERGY_WARNING when not confirmed', async () => {
  const f = fixture({ allergy: 'Aspirin' });
  const body = {
    ngayBatDau: '2026-11-02',
    ngayKetThuc: '2026-11-10',
    danhSachThuoc: [
      { thuocId: 1, lieuDung: '1 viên', soLanMoiNgay: 1, gioUong: ['20:00'] },
    ],
  };

  const res = await f.create(body);
  assert.equal(res.statusCode, 422);
  assert.equal(res.body.errorCode, 'ALLERGY_WARNING');
  assert.match(res.body.message, /Cảnh báo dị ứng/);
  assert.equal(f.state.rolledBack, true);
});

test('prescription with matching allergy succeeds when confirmed by caregiver', async () => {
  const f = fixture({ allergy: 'Aspirin' });
  const body = {
    ngayBatDau: '2026-11-02',
    ngayKetThuc: '2026-11-10',
    xacNhanDiUng: true,
    danhSachThuoc: [
      { thuocId: 1, lieuDung: '1 viên', soLanMoiNgay: 1, gioUong: ['20:00'] },
    ],
  };

  const res = await f.create(body);
  assert.equal(res.statusCode, 201);
  assert.equal(res.body.success, true);
  assert.equal(f.state.committed, true);
});

