const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

function load(relative, stubs, env = {}) {
  const filename = path.resolve(__dirname, relative);
  const module = { exports: {} };
  vm.runInNewContext(fs.readFileSync(filename, 'utf8'), {
    module, exports: module.exports,
    require: (name) => stubs[name] ?? require(name),
    process: { env },
  }, { filename });
  return module.exports;
}

test('missed-dose materializer marks only overdue pending doses and deduplicates alerts', async () => {
  let query = '';
  let minutes;
  let run = 0;
  const pool = { request: () => ({
    input(name, _type, value) { if (name === 'minutes') minutes = value; return this; },
    async query(statement) {
      query = statement;
      run += 1;
      return { recordsets: run === 1 ? [
        [{ canhBaoId: 4, nguonId: 8, nguoiCaoTuoiId: 2,
          nguoiCaoTuoiTen: 'Người thử nghiệm', noiDung: 'Đã bỏ lỡ liều', ngayTao: '2026-10-19T10:00:00' }],
        [{ id: 10, userId: 5, scheduleId: 8 }, { id: 11, userId: 6, scheduleId: 8 }],
      ] : [[], []] };
    },
  }) };
  const events = [];
  const service = load('../src/services/medicationMissed.service.js', {
    '../config/db': { sql: { Int: 'Int' }, poolPromise: Promise.resolve(pool) },
    '../socket': { emitToUser: (userId, name, payload) => events.push({ userId, name, payload }) },
  });
  const first = await service.materializeMissedMedications(pool);
  service.emitMissedMedications(first);
  const second = await service.materializeMissedMedications(pool);
  service.emitMissedMedications(second);

  assert.equal(minutes, 60);
  assert.match(query, /SET TrangThai=N'BoLo'/);
  assert.match(query, /lut\.TrangThai=N'ChuaDenGio'/);
  assert.match(query, /lut\.ThoiGianDuKien < DATEADD\(MINUTE,-@minutes,@now\)/);
  assert.match(query, /sp_getapplock/);
  assert.match(query, /N'NhacUongThuoc'/);
  assert.match(query, /N'TrungBinh',N'LichUongThuoc',missed\.scheduleId/);
  assert.match(query, /NOT EXISTS \(SELECT 1 FROM CanhBao existing/);
  assert.match(query, /existing\.NguonID=missed\.scheduleId/);
  assert.match(query, /NOT EXISTS \(SELECT 1 FROM ThongBao existing/);
  assert.deepEqual(events.filter((event) => event.name === 'canhbao:new').map((event) => event.userId), [5, 6]);
  assert.equal(events.filter((event) => event.name === 'thongbao:new').length, 2);
  assert.equal(events.filter((event) => event.name === 'lichuongthuoc:updated').length, 2);
  assert.equal(second.alerts.length, 0);
});

test('missed-dose threshold accepts a positive environment override', () => {
  const service = load('../src/services/medicationMissed.service.js', {
    '../config/db': { sql: { Int: 'Int' } },
    '../socket': { emitToUser: () => true },
  }, { MEDICATION_MISSED_AFTER_MINUTES: '90' });
  assert.equal(service.MEDICATION_MISSED_AFTER_MINUTES, 90);
});

test('report adherence denominator contains only due states, and upcoming means future', () => {
  const report = fs.readFileSync(path.resolve(__dirname, '../src/controllers/report.controller.js'), 'utf8');
  const kpiMedication = report.slice(report.indexOf('(SELECT COUNT_BIG(1) FROM LichUongThuoc lut'),
    report.indexOf('AS tongLieu,'));
  assert.match(kpiMedication, /TrangThai IN \(N'DaUong',N'BoLo',N'TuChoi'\)/);
  assert.match(report, /SUM\(CASE WHEN TrangThai IN \(N'DaUong',N'BoLo',N'TuChoi'\) THEN 1 ELSE 0 END\) AS tongLieu/);
  assert.match(report, /TrangThai=N'ChuaDenGio'\s+AND ThoiGianDuKien>DATEADD\(HOUR,7,SYSUTCDATETIME\(\)\)/);
  const page = fs.readFileSync(path.resolve(__dirname,
    '../../frontend/src/pages/MedicationSchedule/MedicationSchedulePage.jsx'), 'utf8');
  assert.match(page, /trangThaiHom_nay === 'CHUA_DEN_GIO'\s+&& getScheduleTime\(item\)\?\.isAfter\(dayjs\(\)\)/);
});
