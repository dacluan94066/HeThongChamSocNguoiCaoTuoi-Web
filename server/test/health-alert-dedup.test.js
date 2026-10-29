const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { createRequire } = require('node:module');

function setupTest(mockDbResponses) {
  const queries = [];
  const events = [];
  let notifiedAlert = null;

  const pool = {
    request: () => {
      const inputs = {};
      return {
        input(key, type, val) { inputs[key] = val; return this; },
        async query(statement) {
          queries.push({ statement, inputs: { ...inputs } });
          if (mockDbResponses) {
            for (const [pattern, resp] of mockDbResponses) {
              if (statement.includes(pattern)) return resp(inputs, statement);
            }
          }
          if (statement.includes('FROM LoaiChiSoSucKhoe')) {
            return {
              recordset: [{
                LoaiChiSoID: 1, TenChiSo: 'Nhịp tim', DonVi: 'lần/phút',
                GiaTriMin: 60, GiaTriMax: 100, GiaTriMin2: null, GiaTriMax2: null,
              }],
            };
          }
          if (statement.includes('FROM HoSoNguoiCaoTuoi WHERE UserID')) {
            return { recordset: [{ id: 10 }] };
          }
          return { recordset: [{ id: 101, alertId: null, thoiGianDoUtc: '2026-10-29T10:00:00Z', alertCreatedAt: null }] };
        },
      };
    },
  };

  const filename = path.resolve(__dirname, '../src/controllers/chiSoSucKhoe.controller.js');
  const module = { exports: {} }, local = createRequire(filename);
  vm.runInNewContext(fs.readFileSync(filename, 'utf8'), {
    module, exports: module.exports, console, Date,
    require: name => ({
      '../config/db': {
        poolPromise: Promise.resolve(pool),
        sql: { Int: 'Int', NVarChar: () => 'String', Decimal: () => 'Decimal', Bit: 'Bit', DateTime2: 'DateTime2' },
      },
      '../middlewares/mobile-scope.middleware': { targetElderlyId: () => 10, isMobileRole: () => false },
      '../socket': { emitToAdmin: (evt, payload) => events.push({ evt, payload }) },
      '../services/alertNotification.service': {
        notifyAlertRecipients: async () => ({}),
        emitAlertNotifications: (_delivery, payload) => { notifiedAlert = payload; },
      },
    }[name] || local(name)),
  }, { filename });

  const call = async (handler, body) => {
    const res = {
      statusCode: 200,
      status(code) { this.statusCode = code; return this; },
      json(body) { this.body = body; return this; },
    };
    await module.exports[handler]({ user: { userId: 1 }, body }, res, err => { throw err; });
    return res;
  };

  return { call, queries, events, getNotifiedAlert: () => notifiedAlert };
}

test('Health alert dedup: SQL query checks 10-minute window, same metric type, unhandled status, and severity escalation', async () => {
  const f = setupTest();
  await f.call('create', {
    nguoiCaoTuoiId: 10, loaiChiSo: 'NHIP_TIM', giaTri: 130,
    ngayDo: '2026-10-29', gioDo: '10:00',
  });

  const insertQuery = f.queries.find(q => q.statement.includes('INSERT INTO ChiSoSucKhoe'));
  assert.ok(insertQuery, 'ChiSoSucKhoe must always be inserted');
  assert.match(insertQuery.statement, /CanhBao cb WITH \(UPDLOCK, HOLDLOCK\)/);
  assert.match(insertQuery.statement, /cb\.TrangThai = N'ChuaXuLy'/);
  assert.match(insertQuery.statement, /DATEADD\(MINUTE, -10/);
  assert.match(insertQuery.statement, /prev\.LoaiChiSoID = @loaiId/);
  assert.match(insertQuery.statement, /@mucDoCanhBao = N'Cao' AND @existingMucDo = N'TrungBinh'/);
  assert.match(insertQuery.statement, /@mucDoCanhBao <> N'KhanCap'/);
});

test('Health alert dedup: when alert is merged, metric is still saved and emitted, but no new alert or notification is created', async () => {
  const mockResponses = [
    ['SELECT c.ChiSoID AS id, @canhBaoId AS alertId', () => ({
      recordset: [{
        id: 201, alertId: null, tenChiSo: 'Nhịp tim', donVi: 'lần/phút',
        giaTri: 130, giaTriPhu: null, thoiGianDo: new Date(),
        thoiGianDoUtc: '2026-10-29T10:00:00Z', laBatThuong: true, alertCreatedAt: null,
      }],
    })],
  ];

  const f = setupTest(mockResponses);
  const res = await f.call('create', {
    nguoiCaoTuoiId: 10, loaiChiSo: 'NHIP_TIM', giaTri: 130,
    ngayDo: '2026-10-29', gioDo: '10:00',
  });

  assert.equal(res.statusCode, 201);
  assert.equal(res.body.data.alertCreated, false);
  assert.equal(res.body.data.alertId, null);
  assert.equal(res.body.data.automaticAssessment, 'BAT_THUONG');
  assert.equal(f.getNotifiedAlert(), null, 'Should not notify when alert is merged');

  const metricEvent = f.events.find(e => e.evt === 'chisuckhoe:new');
  assert.ok(metricEvent, 'chisuckhoe:new must always be emitted');
  assert.equal(metricEvent.payload.id, 201);
});

test('Health alert dedup: Mobile createMine correctly preserves metric and handles merged alert without emitting alert notification', async () => {
  const mockResponses = [
    ['SELECT c.ChiSoID AS id, c.NguoiCaoTuoiID', () => ({
      recordset: [{
        id: 301, nguoiCaoTuoiId: 10, loaiChiSoId: 1, tenChiSo: 'Nhịp tim', donVi: 'lần/phút',
        trangThaiDanhGia: 'BAT_THUONG', giaTri: 130, giaTriPhu: null, thoiGianDo: new Date(),
        laBatThuong: true, thoiGianDoUtc: '2026-10-29T10:00:00Z', ghiChu: null, alertId: null, alertCreatedAt: null,
      }],
    })],
  ];

  const f = setupTest(mockResponses);
  const res = await f.call('createMine', { loaiChiSoId: 1, giaTri: 130 });

  assert.equal(res.statusCode, 201);
  assert.equal(res.body.data.alertCreated, false);
  assert.equal(res.body.data.alertId, null);
  assert.equal(f.getNotifiedAlert(), null);

  const metricEvent = f.events.find(e => e.evt === 'chisuckhoe:new');
  assert.ok(metricEvent, 'chisuckhoe:new must be emitted on mobile measurement');
  assert.equal(metricEvent.payload.id, 301);
});

