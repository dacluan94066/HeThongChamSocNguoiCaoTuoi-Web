const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { createRequire } = require('node:module');

// Validators are pure; these tests never load config/db or open a connection.
const validation = () => require('../src/utils/careNoteValidation');
const note = (change = {}) => ({
  tieuDe: 'Hỗ trợ sinh hoạt buổi sáng',
  noiDung: 'Đã hỗ trợ vệ sinh cá nhân. Ghi nhận tình trạng và việc cần theo dõi.',
  loaiNhatKy: 'CHAM_SOC_HANG_NGAY',
  thoiGianChamSoc: '2024-02-29T08:15:00+07:00',
  ...change,
});

test('care diary retains exactly the four existing categories', () => {
  assert.deepEqual(Object.keys(validation().NOTE_TYPE_LABELS).sort(),
    ['CANH_BAO', 'CHAM_SOC_HANG_NGAY', 'SU_CO', 'VAT_LY_TRI_LIEU']);
  for (const loaiNhatKy of Object.keys(validation().NOTE_TYPE_LABELS)) {
    assert.equal(validation().validateCareNote(note({ loaiNhatKy })).error, undefined);
  }
});

test('care note normalizes text and stores Vietnam actual-care time independently of creation time', () => {
  const result = validation().validateCareNote(note({
    tieuDe: '  Chăm sóc buổi sáng  ', noiDung: '  Nội dung chăm sóc thực tế.  ',
  }));
  assert.equal(result.error, undefined);
  assert.equal(result.value.tieuDe, 'Chăm sóc buổi sáng');
  assert.equal(result.value.noiDung, 'Nội dung chăm sóc thực tế.');
  assert.equal(result.value.thoiGianChamSoc, '2024-02-29T08:15:00');
  assert.equal(Object.hasOwn(result.value, 'ngayTao'), false);
});

test('explicit UTC and Vietnam timestamps normalize to the same care moment', () => {
  const local = validation().validateCareNote(note());
  const utc = validation().validateCareNote(note({ thoiGianChamSoc: '2024-02-29T01:15:00Z' }));
  assert.equal(local.error, undefined);
  assert.equal(utc.error, undefined);
  assert.equal(local.value.thoiGianChamSoc, utc.value.thoiGianChamSoc);
});

test('legacy create may omit actual-care timestamp so the server chooses its own current time', () => {
  const body = note();
  delete body.thoiGianChamSoc;
  const result = validation().validateCareNote(body);
  assert.equal(result.error, undefined);
  assert.equal(result.value.thoiGianChamSoc == null, true);
});

for (const field of ['tieuDe', 'noiDung']) {
  test(`care diary rejects missing/non-text/blank ${field} with a field-specific Vietnamese error`, () => {
    for (const value of [undefined, null, '', '   ', 12, {}, []]) {
      const result = validation().validateCareNote(note({ [field]: value }));
      assert.equal(result.error?.field, field, JSON.stringify(value));
      assert.equal(typeof result.error?.message, 'string');
      assert.ok(result.error.message.length > 0);
    }
  });
}

test('care diary field limits match existing SQL columns (200 title, 1000 description)', () => {
  assert.equal(validation().validateCareNote(note({ tieuDe: 'X'.repeat(200), noiDung: 'Y'.repeat(1000) })).error, undefined);
  assert.equal(validation().validateCareNote(note({ tieuDe: 'X'.repeat(201) })).error?.field, 'tieuDe');
  assert.equal(validation().validateCareNote(note({ noiDung: 'X'.repeat(1001) })).error?.field, 'noiDung');
});

test('care diary rejects invented categories rather than treating them as completed activities', () => {
  for (const loaiNhatKy of ['UNKNOWN', 'SOS', 'DaUong', '__proto__', {}, []]) {
    assert.equal(validation().validateCareNote(note({ loaiNhatKy })).error?.field, 'loaiNhatKy');
  }
});

test('edit/delete reason is required, trimmed and bounded to 5–300 characters', () => {
  for (const lyDo of [undefined, null, {}, [], '', '    ', '1234', 'X'.repeat(301)]) {
    const result = validation().validateCareNote(note({ lyDo }), { requireReason: true });
    assert.equal(result.error?.field, 'lyDo', JSON.stringify(lyDo));
  }
  for (const lyDo of ['12345', 'X'.repeat(300)]) {
    const result = validation().validateCareNote(note({ lyDo: ` ${lyDo} ` }), { requireReason: true });
    assert.equal(result.error, undefined);
    assert.equal(result.value.lyDo, lyDo);
  }
});

test('legacy mutation may omit reason but a supplied malformed reason is never silently accepted', () => {
  assert.equal(validation().validateCareNote(note()).error, undefined);
  for (const lyDo of [null, {}, [], '', '  ', '1234', 'X'.repeat(301)]) {
    assert.equal(validation().validateCareNote(note({ lyDo })).error?.field, 'lyDo');
  }
});

test('care timestamp rejects ambiguous timezone, calendar rollovers and invalid clock values', () => {
  for (const thoiGianChamSoc of [
    '', {}, 12, 'not a date', '2024-02-29', '2024-02-29T08:15:00',
    '2024-02-29T08:15:00+08:00', '2023-02-29T08:15:00+07:00',
    '2024-02-30T08:15:00+07:00', '2024-13-01T08:15:00+07:00',
    '2024-02-29T24:00:00+07:00', '2024-02-29T08:60:00+07:00',
    '2024-02-29T08:15:60+07:00',
  ]) {
    const result = validation().validateCareNote(note({ thoiGianChamSoc }));
    assert.equal(result.error?.field, 'thoiGianChamSoc', JSON.stringify(thoiGianChamSoc));
  }
});

test('care timestamp cannot be in the future even when the client has a fast clock', () => {
  const future = new Date(Date.now() + 2 * 86400000).toISOString();
  const result = validation().validateCareNote(note({ thoiGianChamSoc: future }));
  assert.equal(result.error?.field, 'thoiGianChamSoc');
});

test('filters support default list and validated combined elderly/range/type/search', () => {
  const empty = validation().validateCareNoteFilters({});
  assert.equal(empty.error, undefined);
  assert.deepEqual(empty.value, { elderlyId: null, from: null, to: null, type: null, search: null });
  const result = validation().validateCareNoteFilters({
    nguoiCaoTuoiId: '12', tuNgay: '2024-02-28', denNgay: '2024-03-01',
    loaiNhatKy: 'SU_CO', search: '  ăn sáng  ',
  });
  assert.equal(result.error, undefined);
  assert.deepEqual(result.value, { elderlyId: 12, from: '2024-02-28', to: '2024-03-01', type: 'SU_CO', search: 'ăn sáng' });
});

test('legacy single-day filter is retained and includes the full Vietnam calendar day', () => {
  const result = validation().validateCareNoteFilters({ ngay: '2024-02-29' });
  assert.equal(result.error, undefined);
  assert.equal(result.value.from, '2024-02-29');
  assert.equal(result.value.to, '2024-02-29');
});

test('elderly filter rejects malformed IDs and SQL INT overflow', () => {
  for (const nguoiCaoTuoiId of ['0', '-1', '1.5', 'abc', '1 OR 1=1', '2147483648', {}, ['1', '2']]) {
    assert.ok(validation().validateCareNoteFilters({ nguoiCaoTuoiId }).error, JSON.stringify(nguoiCaoTuoiId));
  }
  assert.equal(validation().validateCareNoteFilters({ nguoiCaoTuoiId: '2147483647' }).error, undefined);
});

test('date filters reject invalid calendar dates, reverse ranges and invalid types/search lengths', () => {
  for (const query of [
    { ngay: '2023-02-29' }, { ngay: '2024-02-30' }, { ngay: '29/02/2024' },
    { tuNgay: '2024-03-02', denNgay: '2024-03-01' }, { tuNgay: '2024-13-01' },
    { denNgay: 'bad' }, { loaiNhatKy: 'SOS' }, { search: 'X'.repeat(101) },
  ]) {
    assert.ok(validation().validateCareNoteFilters(query).error, JSON.stringify(query));
  }
  assert.equal(validation().validateCareNoteFilters({ search: 'X'.repeat(100) }).error, undefined);
});

function loadController(stubs) {
  const filename = path.resolve(__dirname, '../src/controllers/nhatKyChamSoc.controller.js');
  const module = { exports: {} };
  vm.runInNewContext(fs.readFileSync(filename, 'utf8'), {
    module, exports: module.exports, console,
    require: (name) => stubs[name] ?? createRequire(filename)(name),
  }, { filename });
  return module.exports;
}

const response = {
  ok: (res, data, message, status = 200) => Object.assign(res, { data, message, status }),
  fail: (res, message, code, status) => Object.assign(res, { message, code, status }),
};

test('invalid diary filters fail before querying SQL, never appear as an empty success', async () => {
  const controller = loadController({
    '../config/db': { poolPromise: { then() { throw new Error('SQL must not be accessed'); } }, sql: {} },
    '../utils/response': response,
    '../services/careNoteMutation.service': { versionSql: () => 'VERSION', endpoint: () => () => {} },
    '../middlewares/mobile-scope.middleware': { scopedWhere: () => '', targetElderlyId: () => null, isMobileRole: () => false },
  });
  for (const query of [{ ngay: 'bad' }, { tuNgay: '2024-02-30' }, { loaiNhatKy: 'SOS' }, { nguoiCaoTuoiId: 'NaN' }]) {
    const res = {};
    await controller.getAll({ query, user: { userId: 1, tenVaiTro: 'QuanTriVien' } }, res, (error) => { throw error; });
    assert.ok(res.status >= 400 && res.status < 500);
  }
});

test('diary endpoints keep feature permissions and scope middleware; history is read-only', () => {
  const route = fs.readFileSync(path.resolve(__dirname, '../src/routes/nhatKyChamSoc.routes.js'), 'utf8');
  assert.match(route, /router\.use\(auth\)/);
  assert.match(route, /router\.use\(loadMobileScope\)/);
  for (const action of ['xem', 'them', 'sua', 'xoa']) {
    assert.match(route, new RegExp(`checkPermission\\('QLNHATKY',\\s*'${action}'\\)`));
  }
  assert.match(route, /router\.get\('\/:id\/history',\s*checkPermission\('QLNHATKY',\s*'xem'\)/);
});

test('care diary code never generates medication confirmation, SOS or measurement writes', () => {
  const source = ['../src/controllers/nhatKyChamSoc.controller.js', '../src/services/careNoteMutation.service.js']
    .map((file) => fs.readFileSync(path.resolve(__dirname, file), 'utf8')).join('\n');
  assert.doesNotMatch(source, /UPDATE\s+(?:dbo\.)?LichUongThuoc|INSERT\s+INTO\s+(?:dbo\.)?(?:CanhBaoKhanCap|ChiSoSucKhoe|LichUongThuoc)/i);
});

test('audit schema is additive and idempotent, with no patient data mutations or automatic startup migration', () => {
  const patch = fs.readFileSync(path.resolve(__dirname, '../database/patch_care_note_audit.sql'), 'utf8');
  const statements = patch.replace(/--[^\r\n]*/g, '');
  assert.match(patch, /OBJECT_ID\(N?'dbo\.LichSuNhatKyChamSoc'/i);
  assert.match(patch, /CREATE\s+TABLE\s+dbo\.LichSuNhatKyChamSoc/i);
  assert.match(patch, /BEGIN\s+TRANSACTION/i);
  assert.match(patch, /COMMIT\s+TRANSACTION/i);
  assert.doesNotMatch(statements, /\b(?:DROP|TRUNCATE|DELETE|UPDATE|INSERT|MERGE)\b/i);
  const startup = fs.readFileSync(path.resolve(__dirname, '../src/server.js'), 'utf8');
  assert.doesNotMatch(startup, /patch_care_note_audit|CREATE\s+TABLE\s+dbo\.LichSuNhatKyChamSoc/i);
  const service = fs.readFileSync(path.resolve(__dirname, '../src/services/careNoteMutation.service.js'), 'utf8');
  assert.doesNotMatch(service, /(?:DELETE\s+FROM|UPDATE)\s+dbo\.LichSuNhatKyChamSoc/i);
});

function mutationFixture({ role = 'NguoiChamSoc', actorRole = role, assigned = true,
  allowed = true, installed = true, caregiverId = 5, failAudit = false, failUpdate = false,
  latestAuditId = 0, status = 'HOAN_THANH' } = {}) {
  const initial = { elderlyId: 1, status, author: 77, title: 'Nội dung ban đầu',
    content: 'Nội dung chăm sóc ban đầu.', type: 'CHAM_SOC_HANG_NGAY', careTime: '2024-02-29T08:15:00', version: 'F'.repeat(64) };
  const trace = { begun: 0, committed: 0, rolledBack: 0, noteWrites: 0, auditAttempts: 0, queries: [], audits: [], note: { ...initial } };
  const problem = (statusCode, code, message) => Object.assign(new Error(message), { status: statusCode, code });
  class Transaction {
    async begin() { trace.begun++; this.before = { ...trace.note }; this.auditLength = trace.audits.length; }
    async commit() { trace.committed++; }
    async rollback() { trace.rolledBack++; trace.note = { ...this.before }; trace.audits.length = this.auditLength; }
  }
  class Request {
    constructor() { this.values = {}; }
    input(key, _type, value) { this.values[key] = value; return this; }
    async query(statement) {
      const values = { ...this.values };
      trace.queries.push({ statement, values });
      if (statement.includes('SELECT v.TenVaiTro')) return { recordset: actorRole ? [{ role: actorRole }] : [] };
      if (statement.includes('SELECT TOP 1 n.NguoiChamSocID')) return { recordset: assigned ? [{ NguoiChamSocID: caregiverId }] : [] };
      if (statement.includes('SELECT p.ChoPhep')) return { recordset: [{ allowed }] };
      if (statement.includes('AS available')) return { recordset: [{ available: installed ? 1 : 0 }] };
      if (statement.includes('AS latestId')) return { recordset: [{ latestId: latestAuditId }] };
      if (statement.includes('SELECT NguoiChamSocID FROM NguoiChamSoc')) {
        return { recordset: caregiverId ? [{ NguoiChamSocID: caregiverId }] : [] };
      }
      if (statement.includes('INSERT INTO NhatKyChamSoc')) {
        trace.noteWrites++;
        trace.note = { ...initial, title: values.title, content: values.content, type: values.type,
          careTime: values.careTime || '2026-10-23T08:00:00' };
        return { recordset: [{ id: 8 }], rowsAffected: [1] };
      }
      if (statement.includes('INSERT INTO dbo.LichSuNhatKyChamSoc')) {
        trace.auditAttempts++;
        if (failAudit) throw new Error('SYNTHETIC_AUDIT_FAILURE');
        trace.audits.push(values);
        return { recordset: [], rowsAffected: [1] };
      }
      if (statement.includes('UPDATE NhatKyChamSoc')) {
        trace.noteWrites++;
        if (failUpdate) throw new Error('SYNTHETIC_UPDATE_FAILURE');
        if (statement.includes("TrangThai=N'HUY'")) trace.note.status = 'HUY';
        else Object.assign(trace.note, { title: values.title, content: values.content, type: values.type, careTime: values.careTime });
        return { recordset: [], rowsAffected: [1] };
      }
      if (statement.includes('FROM NhatKyChamSoc')) return { recordset: [{ ...trace.note }] };
      throw new Error(`UNEXPECTED_MOCK_QUERY: ${statement}`);
    }
  }
  const sql = { Transaction, Request, Int: 'Int', NVarChar: () => 'NVarChar', VarChar: () => 'VarChar',
    MAX: 'MAX', ISOLATION_LEVEL: { SERIALIZABLE: 4 } };
  const db = { poolPromise: Promise.resolve({}), sql };
  const load = (relative, stubs) => {
    const filename = path.resolve(__dirname, relative);
    const module = { exports: {} };
    vm.runInNewContext(fs.readFileSync(filename, 'utf8'), {
      module, exports: module.exports, console,
      require: (name) => stubs[name] ?? createRequire(filename)(name),
    }, { filename });
    return module.exports;
  };
  const workflow = load('../src/services/alertWorkflow.service.js', {
    '../config/db': db, '../socket': { emitToAdmin() {}, emitToUser() {} },
  });
  const service = load('../src/services/careNoteMutation.service.js', {
    '../config/db': db, './alertWorkflow.service': workflow,
  });
  return { service, trace, user: { userId: 3, tenVaiTro: role }, initial, problem };
}

test('create derives the caregiver and actor from authenticated identity, not forged body metadata', async () => {
  const { service, trace, user } = mutationFixture();
  const result = await service.createNote({ user, elderlyId: 1, body: note({
    nguoiChamSocId: 999, nguoiChamSocTen: 'Giả mạo', nguoiGhiId: 999,
    ngayTao: '2000-01-01T00:00:00', trangThai: 'HUY',
  }) });
  assert.equal(result.id, 8);
  assert.equal(trace.committed, 1); assert.equal(trace.rolledBack, 0);
  const insert = trace.queries.find((query) => query.statement.includes('INSERT INTO NhatKyChamSoc'));
  assert.equal(insert.values.caregiver, 5);
  assert.equal(insert.values.careTime, '2024-02-29T08:15:00');
  assert.match(insert.statement, /DATEADD\(HOUR,7,SYSUTCDATETIME\(\)\)/);
  assert.equal(trace.audits.length, 1);
  assert.equal(trace.audits[0].auditActor, 3);
  assert.equal(trace.audits[0].auditRole, 'NguoiChamSoc');
  assert.equal(trace.audits[0].auditAction, 'TAO');
  assert.equal(trace.audits[0].auditBefore, null);
  assert.equal(JSON.parse(trace.audits[0].auditAfter).trangThai, 'HOAN_THANH');
});

test('Admin may create a note without pretending to be a caregiver, audit still records Admin identity', async () => {
  const { service, trace, user } = mutationFixture({ role: 'QuanTriVien', caregiverId: null });
  await service.createNote({ user, elderlyId: 1, body: note() });
  const insert = trace.queries.find((query) => query.statement.includes('INSERT INTO NhatKyChamSoc'));
  assert.equal(insert.values.caregiver, null);
  assert.equal(trace.audits[0].auditActor, 3);
  assert.equal(trace.audits[0].auditRole, 'QuanTriVien');
});

test('legacy create omitting actual time lets SQL choose Vietnam now, not a client date or creation time', async () => {
  const { service, trace, user } = mutationFixture();
  const body = note(); delete body.thoiGianChamSoc;
  await service.createNote({ user, elderlyId: 1, body });
  const insert = trace.queries.find((query) => query.statement.includes('INSERT INTO NhatKyChamSoc'));
  assert.equal(insert.values.careTime, null);
  assert.match(insert.statement, /COALESCE\(CONVERT\(DATETIME2,@careTime,126\),DATEADD\(HOUR,7,SYSUTCDATETIME\(\)\)\)/);
});

for (const options of [{ assigned: false }, { allowed: false }, { role: 'NguoiCaoTuoi' },
  { actorRole: 'QuanTriVien' }, { actorRole: null }, { caregiverId: null }]) {
  test(`create rechecks current identity, permission and assignment before writes: ${JSON.stringify(options)}`, async () => {
    const { service, trace, user } = mutationFixture(options);
    await assert.rejects(service.createNote({ user, elderlyId: 1, body: note() }), (error) => error.status === 403);
    assert.equal(trace.noteWrites, 0); assert.equal(trace.auditAttempts, 0); assert.equal(trace.rolledBack, 1);
  });
}

test('uninstalled audit schema blocks create/edit/delete safely before any diary write', async () => {
  for (const action of ['create', 'edit', 'delete']) {
    const { service, trace, user } = mutationFixture({ installed: false });
    const operation = action === 'create' ? service.createNote({ user, elderlyId: 1, body: note() })
      : service.mutate({ user, id: 8, version: 'F'.repeat(64), title: 'Tiêu đề mới', content: 'Nội dung mới', remove: action === 'delete' });
    await assert.rejects(operation, (error) => error.status === 503 && error.code === 'CARE_NOTE_AUDIT_NOT_INSTALLED');
    assert.equal(trace.noteWrites, 0); assert.equal(trace.audits.length, 0); assert.equal(trace.rolledBack, 1);
  }
});

test('assigned caregiver edits another author note without changing the original author or elderly', async () => {
  const { service, trace, user } = mutationFixture();
  await service.mutate({ user, id: 8, version: 'F'.repeat(64), title: 'Việc đã làm mới', content: 'Tình trạng cập nhật.',
    type: 'SU_CO', careTime: '2024-02-29T09:30:00+07:00', reason: 'Bổ sung tình trạng sau chăm sóc', elderlyId: 999, author: 999 });
  assert.equal(trace.note.author, 77); assert.equal(trace.note.elderlyId, 1);
  assert.equal(trace.note.type, 'SU_CO'); assert.equal(trace.note.careTime, '2024-02-29T09:30:00');
  const update = trace.queries.find((query) => query.statement.includes('UPDATE NhatKyChamSoc'));
  assert.doesNotMatch(update.statement, /SET\s+NguoiCaoTuoiID|NguoiChamSocID\s*=/);
  const audit = trace.audits[0];
  assert.equal(audit.auditActor, 3); assert.equal(audit.auditAction, 'SUA');
  assert.equal(audit.auditElderlyId, 1);
  assert.equal(JSON.parse(audit.auditBefore).tieuDe, 'Nội dung ban đầu');
  assert.equal(JSON.parse(audit.auditAfter).tieuDe, 'Việc đã làm mới');
  assert.equal(audit.auditReason, 'Bổ sung tình trạng sau chăm sóc');
});

test('legacy Mobile edit omitting type/time/reason preserves old fields and audits the change', async () => {
  const { service, trace, user, initial } = mutationFixture();
  await service.mutate({ user, id: 8, version: 'F'.repeat(64), title: 'Cập nhật từ Mobile', content: 'Nội dung mới từ Mobile.' });
  assert.equal(trace.note.type, initial.type);
  assert.equal(trace.note.careTime, initial.careTime);
  assert.equal(trace.audits[0].auditReason, null);
  assert.equal(trace.audits[0].auditAction, 'SUA');
});

for (const [name, careTime, changeCareTime, expected] of [
  ['legacy omitted timestamp', undefined, 0, '2024-02-29T08:15:00.1234567'],
  ['explicit same-second timestamp', '2024-02-29T08:15:00+07:00', 0, '2024-02-29T08:15:00.1234567'],
  ['explicit changed timestamp', '2024-02-29T09:30:00+07:00', 1, '2024-02-29T09:30:00'],
]) {
  test(`DATETIME2 audit retains exact old fractions for ${name}`, async () => {
    const { service, trace, user } = mutationFixture();
    const original = '2024-02-29T08:15:00.1234567';
    trace.note.careTime = original;
    await service.mutate({ user, id: 8, version: 'F'.repeat(64), title: 'Cập nhật nội dung',
      content: 'Không làm tròn giờ chăm sóc cũ khi chỉ sửa nội dung.', careTime });
    const update = trace.queries.find((query) => query.statement.includes('UPDATE NhatKyChamSoc'));
    assert.equal(update.values.changeCareTime, changeCareTime);
    assert.equal(update.values.careTime, expected);
    assert.match(update.statement, /NgayGhi=CASE WHEN @changeCareTime=1 THEN CONVERT\(DATETIME2,@careTime,126\) ELSE NgayGhi END/);
    const lockedRead = trace.queries.find((query) => query.statement.includes('FROM NhatKyChamSoc n WITH'));
    assert.match(lockedRead.statement, /CONVERT\(VARCHAR\(27\),n\.NgayGhi,126\) AS careTime/);
    assert.equal(JSON.parse(trace.audits[0].auditBefore).thoiGianChamSoc, original);
    assert.equal(JSON.parse(trace.audits[0].auditAfter).thoiGianChamSoc, expected);
    assert.equal(trace.note.careTime, expected);
    assert.equal(trace.committed, 1);
  });
}

test('soft delete retains diary row and an immutable before/after audit, never physically deletes', async () => {
  const { service, trace, user } = mutationFixture();
  const result = await service.mutate({ user, id: 8, version: 'F'.repeat(64), remove: true, reason: 'Ghi nhầm hoạt động chăm sóc' });
  assert.equal(result.deleted, true); assert.equal(trace.note.status, 'HUY');
  assert.equal(trace.audits[0].auditAction, 'XOA');
  assert.equal(JSON.parse(trace.audits[0].auditBefore).trangThai, 'HOAN_THANH');
  assert.equal(JSON.parse(trace.audits[0].auditAfter).trangThai, 'HUY');
  assert.ok(trace.queries.every((query) => !/DELETE\s+FROM/i.test(query.statement)));
});

test('audit insertion failure rolls back create/edit/delete and never returns apparent success', async () => {
  for (const action of ['create', 'edit', 'delete']) {
    const { service, trace, user, initial } = mutationFixture({ failAudit: true });
    const operation = action === 'create' ? service.createNote({ user, elderlyId: 1, body: note() })
      : service.mutate({ user, id: 8, version: 'F'.repeat(64), title: 'Tiêu đề mới', content: 'Nội dung mới', remove: action === 'delete' });
    await assert.rejects(operation, /SYNTHETIC_AUDIT_FAILURE/);
    assert.equal(trace.committed, 0); assert.equal(trace.rolledBack, 1); assert.equal(trace.audits.length, 0);
    assert.deepEqual(trace.note, initial);
  }
});

test('version conflicts and already deleted notes do not write an update or audit', async () => {
  for (const options of [{}, { status: 'HUY' }]) {
    const { service, trace, user } = mutationFixture(options);
    await assert.rejects(service.mutate({ user, id: 8, version: 'A'.repeat(64), title: 'Mới', content: 'Mới' }),
      (error) => error.status === (options.status === 'HUY' ? 404 : 409));
    assert.equal(trace.noteWrites, 0); assert.equal(trace.auditAttempts, 0); assert.equal(trace.rolledBack, 1);
  }
});

test('no-op save does not manufacture a new edit audit', async () => {
  const { service, trace, user, initial } = mutationFixture();
  const result = await service.mutate({ user, id: 8, version: 'F'.repeat(64), title: initial.title, content: initial.content });
  assert.equal(result.unchanged, true); assert.equal(trace.noteWrites, 0); assert.equal(trace.auditAttempts, 0);
  assert.equal(trace.committed, 1);
});

test('history reader parses exact before/after snapshots and fails clearly if patch is absent', async () => {
  const { service } = mutationFixture();
  const queries = [];
  const payload = { tieuDe: 'Ví dụ', noiDung: 'Nội dung', loaiNhatKy: 'SU_CO', thoiGianChamSoc: '2024-02-29T08:15:00', trangThai: 'HUY' };
  for (const installed of [false, true]) {
    const pool = { request: () => ({ input() { return this; }, async query(statement) {
      queries.push(statement);
      return { recordset: statement.includes('AS available') ? [{ available: installed ? 1 : 0 }]
        : [{ id: 3, hanhDong: 'XOA', nguoiThucHienTen: 'Người kiểm thử', thoiGian: '2024-02-29T09:00:00',
          lyDo: 'Ghi nhầm', truoc: JSON.stringify({ ...payload, trangThai: 'HOAN_THANH' }), sau: JSON.stringify(payload) }] };
    } }) };
    if (!installed) await assert.rejects(service.history(pool, 8), (error) => error.status === 503);
    else {
      const rows = await service.history(pool, 8);
      assert.equal(rows[0].truoc.trangThai, 'HOAN_THANH');
      assert.equal(rows[0].sau.trangThai, 'HUY');
      assert.equal(rows[0].nguoiThucHienTen, 'Người kiểm thử');
    }
  }
  assert.ok(queries.every((statement) => !/\b(?:UPDATE|INSERT|DELETE)\b/i.test(statement)));
});

test('optimistic revision includes type, care time and latest history ID to prevent A→B→A overwrites', async () => {
  const { revisionVersion } = require('../src/utils/careNoteAudit');
  const base = 'F'.repeat(64);
  assert.equal(revisionVersion(base, 0), base);
  assert.equal(revisionVersion(base, undefined), base);
  assert.match(revisionVersion(base, 1), /^[A-F0-9]{64}$/);
  assert.notEqual(revisionVersion(base, 1), revisionVersion(base, 2));
  assert.notEqual(revisionVersion(base, 1), base);
  const { service } = mutationFixture();
  const expression = service.versionSql('n');
  for (const column of ['HoatDong', 'MoTaChiTiet', 'TrangThai', 'LoaiNhatKy', 'NgayGhi', 'NguoiCaoTuoiID']) {
    assert.ok(expression.includes(`n.${column}`), column);
  }
});

test('stale base revision fails even after content reverts; latest composed revision may update', async () => {
  const { revisionVersion } = require('../src/utils/careNoteAudit');
  const f = mutationFixture({ latestAuditId: 4 });
  await assert.rejects(f.service.mutate({ user: f.user, id: 8, version: 'F'.repeat(64), title: 'Mới', content: 'Mới' }),
    (error) => error.status === 409 && error.code === 'NOTE_CHANGED');
  assert.equal(f.trace.noteWrites, 0);
  const current = mutationFixture({ latestAuditId: 4 });
  await current.service.mutate({ user: current.user, id: 8, version: revisionVersion('F'.repeat(64), 4), title: 'Mới', content: 'Mới' });
  assert.equal(current.trace.committed, 1);
  const lock = current.trace.queries.find((query) => query.statement.includes('AS latestId'));
  assert.match(lock.statement, /UPDLOCK,HOLDLOCK/);
});

test('combined list filters remain parameterized and scoped while retaining legacy Mobile fields and recorded identity', async () => {
  const { revisionVersion } = require('../src/utils/careNoteAudit');
  const queries = [];
  const row = { id: 8, nguoiCaoTuoiId: 1, nguoiCaoTuoiTen: 'NCT kiểm thử',
    nguoiChamSocId: null, nguoiChamSocTen: null, authorUserId: null,
    loaiNhatKy: 'SU_CO', hoatDong: 'Hoạt động kiểm thử', moTaChiTiet: 'Nội dung kiểm thử',
    ngayGhi: '2024-02-29T08:15:00', ngayTao: '2024-03-01T09:00:00', trangThai: 'HOAN_THANH', version: 'F'.repeat(64) };
  const pool = { request: () => ({ values: {}, input(key, _type, value) { this.values[key] = value; return this; }, async query(statement) {
    queries.push({ statement, values: this.values });
    return { recordset: statement.includes('IF OBJECT_ID') ? [{ id: 8, lichSuCount: 3, latestId: 5,
      nguoiGhiId: 3, nguoiGhiTen: 'Quản trị viên kiểm thử', chinhSuaLuc: '2024-03-01T10:00:00', nguoiSuaTen: 'Người sửa kiểm thử' }] : [row] };
  } }) };
  const controller = loadController({
    '../config/db': { poolPromise: Promise.resolve(pool), sql: { Int: '', VarChar: () => '', NVarChar: () => '' } },
    '../utils/response': response,
    '../services/careNoteMutation.service': { versionSql: () => 'VERSION', endpoint: () => () => {} },
    '../middlewares/mobile-scope.middleware': { scopedWhere: () => ' AND n.NguoiCaoTuoiID IN (1)',
      targetElderlyId: () => 1, isMobileRole: () => true },
  });
  const keyword = "ăn sáng' OR 1=1--";
  const res = {};
  await controller.getAll({ query: { nguoiCaoTuoiId: '1', tuNgay: '2024-02-28', denNgay: '2024-03-01',
    loaiNhatKy: 'SU_CO', search: keyword }, user: { userId: 3, tenVaiTro: 'NguoiChamSoc' } }, res, (error) => { throw error; });
  assert.equal(res.status, 200);
  const list = queries[0];
  assert.equal(list.values.elderlyId, 1); assert.equal(list.values.search, keyword);
  assert.equal(list.values.type, 'SU_CO');
  assert.match(list.statement, /n\.NgayGhi>=CONVERT\(DATE,@from,23\)/);
  assert.match(list.statement, /n\.NgayGhi<DATEADD\(DAY,1,CONVERT\(DATE,@to,23\)\)/);
  assert.match(list.statement, /CHARINDEX\(@search/);
  assert.match(list.statement, /AND n\.NguoiCaoTuoiID IN \(1\)/);
  assert.ok(!list.statement.includes(keyword));
  const result = res.data[0];
  assert.equal(result.ngay, '2024-02-29'); assert.equal(result.thoiGian, '08:15');
  assert.equal(result.trangThai, 'HoanThanh'); assert.equal(result.trangThaiLabel, 'Đã ghi nhận');
  assert.equal(result.thoiGianChamSoc, '2024-02-29T08:15:00');
  assert.equal(result.ngayTao, '2024-03-01T09:00:00');
  assert.equal(result.nguoiGhiTen, 'Quản trị viên kiểm thử');
  assert.equal(result.chinhSuaLanCuoi.nguoiThucHienTen, 'Người sửa kiểm thử');
  assert.equal(result.version, revisionVersion('F'.repeat(64), 5));
});

test('maximum SQL end date keeps lower bound and scope without overflowing DATEADD', async () => {
  const queries = [];
  const pool = { request: () => ({ values: {}, input(key, _type, value) { this.values[key] = value; return this; }, async query(statement) {
    queries.push({ statement, values: this.values });
    return { recordset: [] };
  } }) };
  const controller = loadController({
    '../config/db': { poolPromise: Promise.resolve(pool), sql: { Int: '', VarChar: () => '', NVarChar: () => '' } },
    '../utils/response': response,
    '../services/careNoteMutation.service': { versionSql: () => 'VERSION', endpoint: () => () => {} },
    '../middlewares/mobile-scope.middleware': { scopedWhere: () => ' AND n.NguoiCaoTuoiID IN (1)',
      targetElderlyId: () => 1, isMobileRole: () => true },
  });
  const res = {};
  await controller.getAll({ query: { nguoiCaoTuoiId: '1', tuNgay: '2024-02-29', denNgay: '9999-12-31' },
    user: { userId: 3, tenVaiTro: 'NguoiChamSoc' } }, res, (error) => { throw error; });
  assert.equal(res.status, 200);
  assert.equal(queries[0].values.from, '2024-02-29');
  assert.match(queries[0].statement, /n\.NgayGhi>=CONVERT\(DATE,@from,23\)/);
  assert.match(queries[0].statement, /n\.NguoiCaoTuoiID IN \(1\)/);
  assert.doesNotMatch(queries[0].statement, /DATEADD\(DAY,1,CONVERT\(DATE,@to,23\)\)/);
});

test('legacy notes without audit retain known author; unknown Admin author is not fabricated', async () => {
  const { attachNoteHistory } = require('../src/utils/careNoteAudit');
  const pool = { request: () => ({ async query() { return { recordset: [] }; } }) };
  const rows = await attachNoteHistory(pool, [
    { id: 8, version: 'F'.repeat(64), authorUserId: 3, nguoiChamSocTen: 'Người chăm sóc cũ' },
    { id: 9, version: 'F'.repeat(64), authorUserId: null, nguoiChamSocTen: null },
  ]);
  assert.equal(rows[0].nguoiGhiTen, 'Người chăm sóc cũ');
  assert.equal(rows[0].nguoiGhiId, 3); assert.equal(rows[0].lichSuCount, 0);
  assert.equal(rows[1].nguoiGhiTen, null); assert.equal(rows[1].nguoiGhiId, null);
  assert.equal(rows[1].chinhSuaLanCuoi, null);
  assert.equal(rows[1].version, 'F'.repeat(64));
});

test('history endpoint checks the owning elderly scope before exposing snapshots, including deleted notes', async () => {
  for (const allowed of [false, true]) {
    let historyCalls = 0;
    const pool = { request: () => ({ input() { return this; }, async query() { return { recordset: [{ elderlyId: 1 }] }; } }) };
    const controller = loadController({
      '../config/db': { poolPromise: Promise.resolve(pool), sql: { Int: '' } },
      '../utils/response': response,
      '../services/careNoteMutation.service': { versionSql: () => 'VERSION', endpoint: () => () => {},
        history: async (_pool, id) => { historyCalls++; return [{ id, hanhDong: 'XOA' }]; } },
      '../middlewares/mobile-scope.middleware': { scopedWhere: () => '', isMobileRole: () => true,
        targetElderlyId: () => null, ownsElderlyId: () => allowed },
    });
    const res = {};
    await controller.getHistory({ params: { id: '8' }, user: { userId: 3, tenVaiTro: 'NguoiChamSoc' } }, res, (error) => { throw error; });
    assert.equal(res.status, allowed ? 200 : 403);
    assert.equal(historyCalls, allowed ? 1 : 0);
    if (allowed) assert.equal(res.data[0].hanhDong, 'XOA');
  }
});

test('history of a missing/orphan diary is not exposed even if old audit snapshots exist', async () => {
  let historyCalls = 0;
  const pool = { request: () => ({ input() { return this; }, async query() { return { recordset: [] }; } }) };
  const controller = loadController({
    '../config/db': { poolPromise: Promise.resolve(pool), sql: { Int: '' } },
    '../utils/response': response,
    '../services/careNoteMutation.service': { versionSql: () => 'VERSION', endpoint: () => () => {},
      history: async () => { historyCalls++; return [{ noiDung: 'Không được lộ' }]; } },
    '../middlewares/mobile-scope.middleware': { ownsElderlyId: () => true },
  });
  const res = {};
  await controller.getHistory({ params: { id: '8' }, user: { userId: 3, tenVaiTro: 'QuanTriVien' } }, res, (error) => { throw error; });
  assert.equal(res.status, 404); assert.equal(historyCalls, 0);
});
