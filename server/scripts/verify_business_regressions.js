// Real HTTP/SQL regressions. Creates a uniquely named temporary database from
// FINAL.sql and drops only that database in finally. Requires CREATE DATABASE.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { spawnSync } = require('node:child_process');
const sql = require('mssql');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const serverRoot = path.resolve(__dirname, '..');
require('dotenv').config({ path: path.join(serverRoot, '.env'), quiet: true });

const originalDatabase = process.env.DB_DATABASE;
const database = `CareSenior_Regression_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`;
const validateTarget = () => {
  assert.match(database, /^CareSenior_Regression_\d{13}_[a-f0-9]{8}$/);
  assert.notEqual(database, originalDatabase);
};
const config = { server: process.env.DB_SERVER || 'localhost', user: process.env.DB_USER,
  password: process.env.DB_PASSWORD, port: Number(process.env.DB_PORT) || 1433,
  options: { encrypt: process.env.DB_ENCRYPT === 'true', trustServerCertificate: process.env.DB_TRUST_SERVER_CERTIFICATE === 'true' } };
let master, pool, server, created = false, base;
const results = [];
async function check(name, run) {
  try { await run(); results.push({ name, result: 'PASS' }); }
  catch (error) { results.push({ name, result: 'FAIL', detail: error.message }); }
  console.log(JSON.stringify(results.at(-1)));
}
async function query(statement, values = []) {
  const request = pool.request();
  for (const [key, type, value] of values) request.input(key, type, value);
  return request.query(statement);
}
async function api(method, route, token, body) {
  const response = await fetch(`${base}/api${route}`, { method,
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }), signal: AbortSignal.timeout(15000) });
  return { status: response.status, ...await response.json() };
}
function expect(response, status) {
  assert.equal(response.status, status, `${response.errorCode || response.message}: HTTP ${response.status}, expected ${status}`);
  return response.data;
}

async function main() {
  validateTarget();
  master = await new sql.ConnectionPool({ ...config, database: 'master' }).connect();
  await master.request().query(`CREATE DATABASE [${database}]`);
  created = true;
  const source = fs.readFileSync(path.resolve(serverRoot, '../QLSucKhoeNguoiCaoTuoi_FINAL.sql'), 'utf8');
  const marker = /USE QLSucKhoeNguoiCaoTuoi;\s*GO\s*/i.exec(source);
  assert.ok(marker);
  const schema = source.slice(marker.index + marker[0].length);
  assert.doesNotMatch(schema, /(?:CREATE|DROP|ALTER) DATABASE/i);
  const schemaPool = await new sql.ConnectionPool({ ...config, database }).connect();
  try {
    for (const batch of schema.split(/^\s*GO\s*$/mi).filter(text => text.trim())) {
      await schemaPool.request().query(`SET ANSI_NULLS ON; SET QUOTED_IDENTIFIER ON;\n${batch}`);
    }
  } finally { await schemaPool.close(); }

  process.env.DB_DATABASE = database;
  process.env.JWT_SECRET = crypto.randomBytes(32).toString('hex');
  process.env.AI_PROVIDER = 'business-regression-functional';
  pool = await require('../src/config/db').poolPromise;
  const expectedPermissions = new Map([...source.matchAll(/\(N'(QuanTriVien|NguoiChamSoc|NguoiCaoTuoi)','([^']+)',([01]),([01]),([01]),([01])\)/g)]
    .map(([, role, feature, ...flags]) => [`${role}:${feature}`, flags.map(Number)]));
  await check('Reseeding twice preserves all 33 permissions from FINAL.sql', async () => {
    assert.equal(expectedPermissions.size, 33);
    for (let run = 0; run < 2; run++) {
      const child = spawnSync(process.execPath, ['seed_phanquyen.js'], {
        cwd: serverRoot, env: { ...process.env }, encoding: 'utf8', timeout: 30000 });
      assert.equal(child.status, 0, 'Permission reseed failed');
      const rows = (await query(`SELECT v.TenVaiTro AS role,c.MaChucNang AS feature,
        p.ChoPhepXem AS viewFlag,p.ChoPhepThem AS addFlag,p.ChoPhepSua AS editFlag,p.ChoPhepXoa AS deleteFlag
        FROM PhanQuyen p JOIN VaiTro v ON v.VaiTroID=p.VaiTroID JOIN ChucNang c ON c.ChucNangID=p.ChucNangID`)).recordset;
      const actual = new Map(rows.map(row => [`${row.role}:${row.feature}`,
        [row.viewFlag, row.addFlag, row.editFlag, row.deleteFlag].map(Number)]));
      assert.deepEqual(actual, expectedPermissions);
    }
  });

  const identities = {};
  const hash = await bcrypt.hash(crypto.randomBytes(20).toString('hex'), 10);
  for (const role of ['QuanTriVien', 'NguoiChamSoc', 'NguoiCaoTuoi']) {
    const row = (await query(`INSERT INTO NguoiDung(TenDangNhap,MatKhauHash,HoTen,Email,VaiTroID)
      OUTPUT INSERTED.UserID AS id,INSERTED.VaiTroID AS roleId
      SELECT @name,@hash,@name,@email,VaiTroID FROM VaiTro WHERE TenVaiTro=@role`, [
      ['name', sql.NVarChar(50), `regression.${role}`], ['hash', sql.VarChar(255), hash],
      ['email', sql.VarChar(100), `regression-${role}@example.invalid`], ['role', sql.NVarChar(50), role],
    ])).recordset[0];
    assert.ok(row);
    identities[role] = { ...row, token: jwt.sign({ userId: row.id, vaiTroId: row.roleId, tenVaiTro: role, sessionVersion: 2 },
      process.env.JWT_SECRET, { expiresIn: '5m' }) };
  }
  const admin = identities.QuanTriVien.token;
  const caregiverToken = identities.NguoiChamSoc.token;
  const elderlyToken = identities.NguoiCaoTuoi.token;
  const caregiverId = (await query(`INSERT INTO NguoiChamSoc(UserID,HoTen,SoDienThoai,Email)
    OUTPUT INSERTED.NguoiChamSocID AS id VALUES(@user,N'TEST ONLY CAREGIVER','0900000001','regression-caregiver@example.invalid')`,
  [['user', sql.Int, identities.NguoiChamSoc.id]])).recordset[0].id;
  const elderlyId = (await query(`INSERT INTO HoSoNguoiCaoTuoi(UserID,HoTen,NgaySinh,GioiTinh,TrangThai)
    OUTPUT INSERTED.NguoiCaoTuoiID AS id VALUES(@user,N'TEST ONLY SPECIAL CARE','1950-01-01',N'Nam',N'CanChamSocDacBiet')`,
  [['user', sql.Int, identities.NguoiCaoTuoi.id]])).recordset[0].id;
  await query(`INSERT INTO NguoiCaoTuoi_NguoiChamSoc(NguoiCaoTuoiID,NguoiChamSocID,LaChinh,NgayBatDau)
    VALUES(@elderly,@caregiver,1,CAST(DATEADD(HOUR,7,SYSUTCDATETIME()) AS DATE))`,
  [['elderly', sql.Int, elderlyId], ['caregiver', sql.Int, caregiverId]]);
  server = require('../src/app').listen(0, '127.0.0.1');
  await new Promise((resolve, reject) => { server.once('listening', resolve); server.once('error', reject); });
  base = `http://127.0.0.1:${server.address().port}`;

  await check('Special-care elderly receives prescription and schedules; stopped profile stays blocked', async () => {
    const medicineId = expect(await api('POST', '/medications', caregiverToken,
      { tenThuoc: 'TEST ONLY MEDICINE', donViTinh: 'Viên' }), 201).id;
    const tomorrow = new Date(Date.now() + 7 * 3600000 + 86400000).toISOString().slice(0, 10);
    const body = { ngayBatDau: tomorrow, ngayKetThuc: tomorrow,
      danhSachThuoc: [{ thuocId: medicineId, lieuDung: 'TEST DOSAGE', soLanMoiNgay: 2, gioUong: ['08:00', '20:00'] }] };
    const prescriptionCounts = async () => (await query(`SELECT (SELECT COUNT(*) FROM DonThuoc) AS prescriptions,
      (SELECT COUNT(*) FROM DonThuocChiTiet) AS details,(SELECT COUNT(*) FROM LichUongThuoc) AS doses`)).recordset[0];
    const countsBeforeDuplicate = await prescriptionCounts();
    const duplicate = await api('POST', `/elderly/${elderlyId}/prescriptions`, caregiverToken, {
      ...body, danhSachThuoc: [body.danhSachThuoc[0], { ...body.danhSachThuoc[0], thuocId: String(medicineId) }],
    });
    expect(duplicate, 400); assert.equal(duplicate.errorCode, 'INVALID_PRESCRIPTION');
    assert.match(duplicate.message, /đã được chọn ở dòng 1/);
    assert.deepEqual(await prescriptionCounts(), countsBeforeDuplicate);
    const prescription = expect(await api('POST', `/elderly/${elderlyId}/prescriptions`, caregiverToken, body), 201);
    assert.equal(prescription.soLichDaTao, 2);
    const schedules = expect(await api('GET', `/elderly/me/medication-schedule?tuNgay=${tomorrow}&denNgay=${tomorrow}`, elderlyToken), 200);
    assert.equal(schedules.length, 2);
    assert.ok(schedules.every(row => row.thuocId === medicineId && row.trangThai === 'ChuaDenGio'));
    expect(await api('POST', `/elderly/${elderlyId}/prescriptions`, elderlyToken, body), 403);
    await query("UPDATE HoSoNguoiCaoTuoi SET TrangThai=N'NgungTheoDoi' WHERE NguoiCaoTuoiID=@id", [['id', sql.Int, elderlyId]]);
    expect(await api('POST', `/elderly/${elderlyId}/prescriptions`, caregiverToken, body), 404);
    await query("UPDATE HoSoNguoiCaoTuoi SET TrangThai=N'CanChamSocDacBiet' WHERE NguoiCaoTuoiID=@id", [['id', sql.Int, elderlyId]]);
  });

  await check('Exercise questions are HEALTH; homework and coding remain OUT_OF_SCOPE over HTTP', async () => {
    for (const question of ['Bài tập nào tốt cho người cao tuổi?', 'toi nen tap bai tap gi de giam dau lung']) {
      const reply = expect(await api('POST', '/care-assistant/chat', elderlyToken, { question }), 200);
      assert.equal(reply.domain, 'HEALTH'); assert.equal(reply.intent, 'health_general');
      assert.match(reply.text, /AI hiện không khả dụng/); assert.deepEqual(reply.rows, []);
    }
    for (const question of ['Giải bài tập toán cho người cao tuổi', 'ban biet code ko']) {
      const reply = expect(await api('POST', '/care-assistant/chat', elderlyToken, { question }), 200);
      assert.equal(reply.domain, 'OUT_OF_SCOPE');
    }
  });

  await check('Emergency contact validates primary/secondary phone on both create and update', async () => {
    const body = { nguoiCaoTuoiId: elderlyId, hoTen: 'TEST CONTACT', soDienThoai: '0900000002' };
    for (const invalid of [{ soDienThoai: 'abc' }, { soDienThoai: '1901234567' }, { soDienThoaiPhu: 'abc' }])
      expect(await api('POST', '/emergency-contacts', caregiverToken, { ...body, ...invalid }), 422);
    const id = expect(await api('POST', '/emergency-contacts', caregiverToken, body), 201).id;
    for (const invalid of [{ soDienThoai: 'abc' }, { soDienThoai: '09012345678' }, { soDienThoaiPhu: 'abc' }])
      expect(await api('PUT', `/emergency-contacts/${id}`, caregiverToken, { ...body, ...invalid }), 422);
    const before = (await query('SELECT SoDienThoai AS phone FROM LienHeKhanCap WHERE LienHeID=@id', [['id', sql.Int, id]])).recordset[0];
    assert.equal(before.phone, body.soDienThoai);
    expect(await api('PUT', `/emergency-contacts/${id}`, caregiverToken, { ...body, soDienThoai: ' 0900000003 ', soDienThoaiPhu: '' }), 200);
    const after = (await query('SELECT SoDienThoai AS phone,SoDienThoaiPhu AS secondary FROM LienHeKhanCap WHERE LienHeID=@id', [['id', sql.Int, id]])).recordset[0];
    assert.equal(after.phone, '0900000003'); assert.equal(after.secondary, null);
  });

  await check('Caregiver profile validates phone on both create and update', async () => {
    const body = { hoTen: 'TEST NEW CAREGIVER', email: 'regression-new@example.invalid', soDienThoai: '0900000004' };
    for (const phone of ['abc', '1901234567', '09012345678'])
      expect(await api('POST', '/caregivers', admin, { ...body, soDienThoai: phone }), 422);
    const id = expect(await api('POST', '/caregivers', admin, body), 201).id;
    for (const phone of ['abc', '1901234567', '09012345678'])
      expect(await api('PUT', `/caregivers/${id}`, admin, { ...body, soDienThoai: phone }), 422);
    expect(await api('PUT', `/caregivers/${id}`, admin, { ...body, soDienThoai: ' 0900000005 ' }), 200);
    const saved = (await query('SELECT SoDienThoai AS phone FROM NguoiChamSoc WHERE NguoiChamSocID=@id', [['id', sql.Int, id]])).recordset[0];
    assert.equal(saved.phone, '0900000005');
  });

  const newElderBody = { hoTen: 'TEST ONLY MOBILE ELDER', ngaySinh: '1950-01-01', gioiTinh: 'Nữ',
    soDienThoai: '0899999911', taiKhoan: { tenDangNhap: 'regression.mobile.elder',
      email: 'regression-mobile-elder@example.invalid', matKhau: 'Test-Only-Mobile-123' } };
  await check('Admin creates an elderly profile with Mobile login; username/email/phone all resolve to the same authorized profile', async () => {
    expect(await api('POST', '/elderly', caregiverToken, newElderBody), 403);
    expect(await api('POST', '/elderly', elderlyToken, newElderBody), 403);
    const created = expect(await api('POST', '/elderly', admin, newElderBody), 201);
    assert.ok(created.userId); assert.equal(created.coTaiKhoanMobile, true);
    const saved = (await query(`SELECT nct.UserID AS profileUserId,nd.MatKhauHash AS hash,vt.TenVaiTro AS role
      FROM HoSoNguoiCaoTuoi nct JOIN NguoiDung nd ON nd.UserID=nct.UserID JOIN VaiTro vt ON vt.VaiTroID=nd.VaiTroID
      WHERE nct.NguoiCaoTuoiID=@id`, [['id', sql.Int, created.id]])).recordset[0];
    assert.equal(saved.profileUserId, created.userId); assert.equal(saved.role, 'NguoiCaoTuoi');
    assert.notEqual(saved.hash, newElderBody.taiKhoan.matKhau);
    assert.equal(await bcrypt.compare(newElderBody.taiKhoan.matKhau, saved.hash), true);
    for (const identifier of [newElderBody.taiKhoan.tenDangNhap, newElderBody.taiKhoan.email, newElderBody.soDienThoai]) {
      const login = expect(await api('POST', '/auth/login', '', {
        tenDangNhap: identifier, matKhau: newElderBody.taiKhoan.matKhau, platform: 'mobile' }), 200);
      assert.equal(login.user.userId, created.userId); assert.equal(login.user.tenVaiTro, 'NguoiCaoTuoi');
      const own = expect(await api('GET', '/elderly/me', login.token), 200);
      assert.equal(own.id, created.id);
      const visible = expect(await api('GET', '/elderly', login.token), 200);
      assert.equal(visible.length, 1); assert.equal(visible[0].id, created.id);
      expect(await api('GET', `/elderly/${elderlyId}`, login.token), 403);
      assert.doesNotMatch(JSON.stringify({ login, own, visible }), /MatKhauHash|Test-Only-Mobile-123/);
    }
    expect(await api('POST', '/auth/login', '', { tenDangNhap: newElderBody.taiKhoan.tenDangNhap,
      matKhau: newElderBody.taiKhoan.matKhau, platform: 'web' }), 403);
    expect(await api('POST', '/auth/login', '', { tenDangNhap: newElderBody.taiKhoan.tenDangNhap,
      matKhau: 'Wrong-Test-Password', platform: 'mobile' }), 401);
    const detail = expect(await api('GET', `/elderly/${created.id}`, admin), 200);
    assert.equal(detail.userId, created.userId); assert.equal(detail.tenDangNhap, newElderBody.taiKhoan.tenDangNhap);
    expect(await api('PUT', `/elderly/${created.id}`, admin, { ...newElderBody,
      taiKhoan: { ...newElderBody.taiKhoan, matKhau: 'MUST-NOT-RESET-123' } }), 200);
    const after = (await query('SELECT MatKhauHash AS hash FROM NguoiDung WHERE UserID=@id', [['id', sql.Int, created.userId]])).recordset[0];
    assert.equal(after.hash, saved.hash);
  });

  await check('Mobile-account duplicate/validation failures write nothing; profile-only creation still works', async () => {
    const counts = async () => (await query(`SELECT (SELECT COUNT(*) FROM NguoiDung) AS users,
      (SELECT COUNT(*) FROM HoSoNguoiCaoTuoi) AS profiles`)).recordset[0];
    const before = await counts();
    for (const [body, code] of [
      [{ ...newElderBody, soDienThoai: '0899999912', taiKhoan: { ...newElderBody.taiKhoan, email: 'different@example.invalid' } }, 'USERNAME_TAKEN'],
      [{ ...newElderBody, soDienThoai: '0899999912', taiKhoan: { ...newElderBody.taiKhoan, tenDangNhap: 'regression.mobile.other' } }, 'EMAIL_TAKEN'],
      [{ ...newElderBody, taiKhoan: { ...newElderBody.taiKhoan, tenDangNhap: 'regression.mobile.other', email: 'different@example.invalid' } }, 'PHONE_TAKEN'],
    ]) {
      const rejected = await api('POST', '/elderly', admin, body); expect(rejected, 409); assert.equal(rejected.errorCode, code);
    }
    expect(await api('POST', '/elderly', admin, { ...newElderBody, taiKhoan: { ...newElderBody.taiKhoan, matKhau: '123' } }), 422);
    expect(await api('POST', '/elderly', admin, { ...newElderBody, taiKhoan: { ...newElderBody.taiKhoan, email: '' } }), 422);
    assert.deepEqual(await counts(), before);
    const profileOnly = expect(await api('POST', '/elderly', admin, {
      hoTen: 'TEST ONLY NO ACCOUNT', ngaySinh: '1950-01-01', gioiTinh: 'Nam' }), 201);
    assert.equal(profileOnly.userId, null); assert.equal(profileOnly.coTaiKhoanMobile, false);
  });

  await check('A real profile SQL failure rolls back its newly inserted Mobile account', async () => {
    await query("ALTER TABLE HoSoNguoiCaoTuoi ADD CONSTRAINT CK_TEST_ProfileRollback CHECK(HoTen<>N'TEST ONLY FORCE PROFILE ROLLBACK')");
    try {
      expect(await api('POST', '/elderly', admin, { ...newElderBody, hoTen: 'TEST ONLY FORCE PROFILE ROLLBACK',
        soDienThoai: '0899999913', taiKhoan: { ...newElderBody.taiKhoan,
          tenDangNhap: 'regression.mobile.rollback', email: 'regression-mobile-rollback@example.invalid' } }), 500);
      const remains = (await query(`SELECT COUNT(*) AS count FROM NguoiDung
        WHERE TenDangNhap='regression.mobile.rollback'`)).recordset[0];
      assert.equal(remains.count, 0);
    } finally { await query('ALTER TABLE HoSoNguoiCaoTuoi DROP CONSTRAINT CK_TEST_ProfileRollback'); }
  });

  await check('Concurrent Mobile-account creation with one email yields exactly one account and profile', async () => {
    const responses = await Promise.all(['a', 'b'].map(suffix => api('POST', '/elderly', admin, {
      hoTen: 'TEST ONLY CONCURRENT MOBILE', ngaySinh: '1950-01-01', gioiTinh: 'Nam',
      taiKhoan: { ...newElderBody.taiKhoan, tenDangNhap: `regression.mobile.race.${suffix}`,
        email: 'regression-mobile-race@example.invalid' },
    })));
    assert.deepEqual(responses.map(response => response.status).sort(), [201, 409]);
    const linked = (await query(`SELECT COUNT(*) AS count FROM NguoiDung nd
      JOIN HoSoNguoiCaoTuoi nct ON nct.UserID=nd.UserID WHERE nd.Email='regression-mobile-race@example.invalid'`)).recordset[0];
    assert.equal(linked.count, 1);
  });

  await check('Admin resets only an elderly account; old password and recovery token fail, new Mobile password works', async () => {
    const linked = (await query(`SELECT nct.NguoiCaoTuoiID AS id,nct.UserID AS userId
      FROM HoSoNguoiCaoTuoi nct JOIN NguoiDung nd ON nd.UserID=nct.UserID
      WHERE nd.TenDangNhap=@username`, [['username', sql.VarChar(50), newElderBody.taiKhoan.tenDangNhap]])).recordset[0];
    assert.ok(linked);
    const route = `/elderly/${linked.id}/reset-password`;
    const newPassword = 'New-Test-Only-Mobile-456';
    expect(await api('POST', route, caregiverToken, { matKhauMoi: newPassword }), 403);
    expect(await api('POST', route, elderlyToken, { matKhauMoi: newPassword }), 403);
    expect(await api('POST', route, admin, { matKhauMoi: '123' }), 422);
    expect(await api('POST', route, admin, { matKhauMoi: newPassword, userId: identities.QuanTriVien.id }), 422);
    expect(await api('POST', '/elderly/2147483600/reset-password', admin, { matKhauMoi: newPassword }), 404);
    const unlinked = (await query("SELECT TOP(1) NguoiCaoTuoiID AS id FROM HoSoNguoiCaoTuoi WHERE UserID IS NULL")).recordset[0];
    assert.ok(unlinked);
    expect(await api('POST', `/elderly/${unlinked.id}/reset-password`, admin, { matKhauMoi: newPassword }), 409);

    const oldOtp = '123456'; const oldOtpHash = await bcrypt.hash(oldOtp, 10);
    await query('UPDATE NguoiDung SET MaOTP=@otp,MaOTPHetHan=@expires,SoLanGuiOTP=2 WHERE UserID=@id', [
      ['otp', sql.VarChar(255), oldOtpHash], ['expires', sql.DateTime2, new Date(Date.now() + 600000)],
      ['id', sql.Int, linked.userId],
    ]);
    const oldRecovery = expect(await api('POST', '/auth/verify-otp', '', {
      email: newElderBody.taiKhoan.email, otp: oldOtp }), 200);
    const reset = expect(await api('POST', route, admin, { matKhauMoi: newPassword }), 200);
    assert.equal(reset.userId, linked.userId); assert.doesNotMatch(JSON.stringify(reset), /New-Test|MatKhauHash/);
    const saved = (await query(`SELECT MatKhauHash AS hash,MaOTP AS otp,MaOTPHetHan AS expires,
      SoLanGuiOTP AS sent,VaiTroID AS roleId,TrangThai AS status FROM NguoiDung WHERE UserID=@id`,
    [['id', sql.Int, linked.userId]])).recordset[0];
    assert.equal(await bcrypt.compare(newPassword, saved.hash), true);
    assert.equal(saved.otp, null); assert.equal(saved.expires, null); assert.equal(saved.sent, 0);
    assert.equal(saved.status, 'HoatDong');
    expect(await api('POST', '/auth/login', '', { tenDangNhap: newElderBody.taiKhoan.tenDangNhap,
      matKhau: newElderBody.taiKhoan.matKhau, platform: 'mobile' }), 401);
    const login = expect(await api('POST', '/auth/login', '', { tenDangNhap: newElderBody.taiKhoan.email,
      matKhau: newPassword, platform: 'mobile' }), 200);
    assert.equal(login.user.userId, linked.userId); assert.equal(login.user.tenVaiTro, 'NguoiCaoTuoi');
    const own = expect(await api('GET', '/elderly/me', login.token), 200); assert.equal(own.id, linked.id);
    expect(await api('POST', '/auth/reset-password-with-token', '', {
      resetToken: oldRecovery.resetToken, matKhauMoi: 'MUST-NOT-WORK-789' }), 400);

    // Even a malformed old link must never let this endpoint reset an Admin/NCS.
    const mismatch = expect(await api('POST', '/elderly', admin, {
      hoTen: 'TEST ONLY WRONG ACCOUNT ROLE', ngaySinh: '1950-01-01', gioiTinh: 'Nam' }), 201);
    await query('UPDATE HoSoNguoiCaoTuoi SET UserID=@userId WHERE NguoiCaoTuoiID=@id', [
      ['userId', sql.Int, identities.NguoiChamSoc.id], ['id', sql.Int, mismatch.id],
    ]);
    expect(await api('POST', `/elderly/${mismatch.id}/reset-password`, admin, { matKhauMoi: newPassword }), 409);
    const caregiver = (await query('SELECT MatKhauHash AS hash FROM NguoiDung WHERE UserID=@id',
      [['id', sql.Int, identities.NguoiChamSoc.id]])).recordset[0];
    assert.equal(caregiver.hash, hash);
  });

  await check('User-management NCT creation requires the full profile, links it atomically, and preserves other role workflows', async () => {
    const body = { vaiTro: 'NGUOI_CAO_TUOI', username: 'regression.users.elderly', password: 'TEST-Users-Mobile-123',
      email: 'regression-users-elderly@example.invalid', hoTen: 'TEST ONLY USER MANAGEMENT ELDER',
      ngaySinh: '1950-02-01', gioiTinh: 'Nữ', cccd: '123456789012', soDienThoai: '0899999920',
      diaChi: 'TEST ADDRESS', nhomMau: 'AB+', benhNen: ['TEST CONDITION A', 'TEST CONDITION B'], diUng: ['TEST ALLERGY'] };
    expect(await api('POST', '/users', caregiverToken, body), 403);
    expect(await api('POST', '/users', elderlyToken, body), 403);
    const before = (await query('SELECT COUNT(*) AS count FROM NguoiDung')).recordset[0].count;
    const bare = { ...body }; delete bare.ngaySinh;
    expect(await api('POST', '/users', admin, bare), 422);
    assert.equal((await query('SELECT COUNT(*) AS count FROM NguoiDung')).recordset[0].count, before);
    const created = expect(await api('POST', '/users', admin, body), 201);
    assert.equal(created.id, created.userId); assert.ok(created.nguoiCaoTuoiId);
    const login = expect(await api('POST', '/auth/login', '', { tenDangNhap: body.username,
      matKhau: body.password, platform: 'mobile' }), 200);
    assert.equal(login.user.userId, created.id); assert.equal(login.user.tenVaiTro, 'NguoiCaoTuoi');
    const profile = expect(await api('GET', '/elderly/me', login.token), 200);
    assert.equal(profile.id, created.nguoiCaoTuoiId); assert.equal(profile.userId, created.id);
    assert.equal(profile.hoTen, body.hoTen); assert.equal(profile.cccd, body.cccd);
    assert.equal(profile.diaChi, body.diaChi); assert.equal(profile.nhomMau, body.nhomMau);
    assert.equal(profile.benhNen, body.benhNen.join(', ')); assert.equal(profile.diUng, body.diUng.join(', '));
    assert.equal(expect(await api('GET', '/users', admin), 200).some(row => row.id === created.id), true);
    assert.equal(expect(await api('GET', '/elderly', admin), 200).some(row => row.id === created.nguoiCaoTuoiId), true);
    const duplicate = await api('POST', '/users', admin, body); expect(duplicate, 409);
    const cccdDuplicate = await api('POST', '/users', admin, { ...body, username: 'regression.users.cccd',
      email: 'regression-users-cccd@example.invalid', soDienThoai: '0899999923' });
    expect(cccdDuplicate, 409); assert.equal(cccdDuplicate.errorCode, 'CCCD_TAKEN');
    assert.equal((await query("SELECT COUNT(*) AS count FROM NguoiDung WHERE TenDangNhap='regression.users.cccd'")).recordset[0].count, 0);

    await query("ALTER TABLE HoSoNguoiCaoTuoi ADD CONSTRAINT CK_TEST_UserProfileRollback CHECK(HoTen<>N'TEST ONLY USER PROFILE ROLLBACK')");
    try {
      expect(await api('POST', '/users', admin, { ...body, hoTen: 'TEST ONLY USER PROFILE ROLLBACK',
        username: 'regression.users.rollback', email: 'regression-users-rollback@example.invalid', soDienThoai: '0899999921',
        cccd: '123456789013' }), 500);
      assert.equal((await query("SELECT COUNT(*) AS count FROM NguoiDung WHERE TenDangNhap='regression.users.rollback'")).recordset[0].count, 0);
    } finally { await query('ALTER TABLE HoSoNguoiCaoTuoi DROP CONSTRAINT CK_TEST_UserProfileRollback'); }

    for (const [vaiTro, roleName, platform, suffix] of [
      ['QUAN_TRI', 'QuanTriVien', 'web', 'admin'], ['NGUOI_CHAM_SOC', 'NguoiChamSoc', 'web', 'caregiver'],
    ]) {
      const other = { username: `regression.users.${suffix}`, password: 'TEST-Users-Web-123',
        hoTen: 'TEST ONLY OTHER ROLE', email: `regression-users-${suffix}@example.invalid`, vaiTro,
        ...(suffix === 'caregiver' ? { soDienThoai: '0899999922' } : {}) };
      const user = expect(await api('POST', '/users', admin, other), 201);
      const signed = expect(await api('POST', '/auth/login', '', {
        tenDangNhap: other.username, matKhau: other.password, platform }), 200);
      assert.equal(signed.user.userId, user.id); assert.equal(signed.user.tenVaiTro, roleName);
      if (suffix === 'caregiver') {
        const linked = (await query('SELECT COUNT(*) AS count FROM NguoiChamSoc WHERE UserID=@id', [['id', sql.Int, user.id]])).recordset[0];
        assert.equal(linked.count, 1);
      }
    }
  });
  await check('User-management Admin reset works for all 3 roles, rejects unauthorized requests and invalidates old credentials', async () => {
    const password = 'TEST-Users-Reset-456';
    const invalidRoute = '/users/2147483600/reset-password';
    expect(await api('POST', invalidRoute, '', { matKhauMoi: password }), 401);
    for (const token of [caregiverToken, elderlyToken]) {
      expect(await api('POST', invalidRoute, token, { matKhauMoi: password }), 403);
    }
    expect(await api('POST', invalidRoute, admin, { matKhauMoi: password }), 404);
    expect(await api('POST', '/users/invalid/reset-password', admin, { matKhauMoi: password }), 422);
    const recoveryFields = ['MatKhauHash', 'MaOTP', 'MaOTPHetHan', 'MaOTPGuiLuc', 'MaOTPCuaSoBatDau', 'SoLanGuiOTP'];
    const unchangedFields = row => Object.fromEntries(Object.entries(row).filter(([key]) => !recoveryFields.includes(key)));
    for (const [username, oldPassword, platform, role] of [
      ['regression.users.elderly', 'TEST-Users-Mobile-123', 'mobile', 'NguoiCaoTuoi'],
      ['regression.users.caregiver', 'TEST-Users-Web-123', 'web', 'NguoiChamSoc'],
      ['regression.users.admin', 'TEST-Users-Web-123', 'web', 'QuanTriVien'],
    ]) {
      const before = (await query('SELECT * FROM NguoiDung WHERE TenDangNhap=@username',
        [['username', sql.VarChar(50), username]])).recordset[0];
      assert.ok(before);
      const route = `/users/${before.UserID}/reset-password`;
      for (const body of [{ matKhauMoi: '12345' }, { matKhauMoi: 'ắ'.repeat(25) },
        { matKhauMoi: password, vaiTro: 'QUAN_TRI' }]) {
        expect(await api('POST', route, admin, body), 422);
      }
      const recoveryOtp = '123456';
      await query('UPDATE NguoiDung SET MaOTP=@otp,MaOTPHetHan=@expires,SoLanGuiOTP=2 WHERE UserID=@id', [
        ['otp', sql.VarChar(255), await bcrypt.hash(recoveryOtp, 10)],
        ['expires', sql.DateTime2, new Date(Date.now() + 600000)], ['id', sql.Int, before.UserID],
      ]);
      const oldRecovery = expect(await api('POST', '/auth/verify-otp', '', { email: before.Email, otp: recoveryOtp }), 200);
      const reset = expect(await api('POST', route, admin, { matKhauMoi: password }), 200);
      assert.equal(reset.id, before.UserID); assert.doesNotMatch(JSON.stringify(reset), /TEST-Users-Reset|MatKhauHash/);
      const after = (await query('SELECT * FROM NguoiDung WHERE UserID=@id', [['id', sql.Int, before.UserID]])).recordset[0];
      assert.deepEqual(unchangedFields(after), unchangedFields(before));
      assert.equal(await bcrypt.compare(password, after.MatKhauHash), true);
      for (const key of recoveryFields.slice(1, -1)) assert.equal(after[key], null);
      assert.equal(after.SoLanGuiOTP, 0);
      expect(await api('POST', '/auth/login', '', { tenDangNhap: username, matKhau: oldPassword, platform }), 401);
      const login = expect(await api('POST', '/auth/login', '', { tenDangNhap: username, matKhau: password, platform }), 200);
      assert.equal(login.user.userId, before.UserID); assert.equal(login.user.tenVaiTro, role);
      expect(await api('POST', '/auth/reset-password-with-token', '', {
        resetToken: oldRecovery.resetToken, matKhauMoi: 'MUST-NOT-WORK-789' }), 400);
      if (role === 'NguoiCaoTuoi') {
        const own = expect(await api('GET', '/elderly/me', login.token), 200);
        assert.equal(own.userId, before.UserID);
      }
      if (role === 'NguoiChamSoc') {
        await query("UPDATE NguoiDung SET TrangThai=N'KhoaTaiKhoan' WHERE UserID=@id", [['id', sql.Int, before.UserID]]);
        expect(await api('POST', route, admin, { matKhauMoi: 'TEST-Locked-Reset-789' }), 200);
        const locked = (await query('SELECT TrangThai FROM NguoiDung WHERE UserID=@id', [['id', sql.Int, before.UserID]])).recordset[0];
        assert.equal(locked.TrangThai, 'KhoaTaiKhoan');
        expect(await api('POST', '/auth/login', '', {
          tenDangNhap: username, matKhau: 'TEST-Locked-Reset-789', platform }), 403);
      }
    }
  });
}

async function verifyMobileOnboarding() {
  await check('Unlinked elderly completes own Mobile profile exactly once; scopes, conflicts and rollback stay safe', async () => {
    const makeAccount = async (suffix, phone) => {
      const record = (await query(`INSERT INTO NguoiDung(TenDangNhap,MatKhauHash,HoTen,Email,SoDienThoai,VaiTroID)
        OUTPUT INSERTED.UserID AS id,INSERTED.VaiTroID AS roleId
        SELECT @username,@hash,N'TEST ONLY ONBOARDING',@email,@phone,VaiTroID FROM VaiTro WHERE TenVaiTro=N'NguoiCaoTuoi'`, [
        ['username', sql.VarChar(50), `regression.onboarding.${suffix}`], ['hash', sql.VarChar(255), await bcrypt.hash('TEST-Onboarding-123', 10)],
        ['email', sql.VarChar(100), `onboarding-${suffix}@example.invalid`], ['phone', sql.VarChar(15), phone],
      ])).recordset[0];
      return { ...record, token: jwt.sign({ userId: record.id, vaiTroId: record.roleId, tenVaiTro: 'NguoiCaoTuoi', sessionVersion: 2 },
        process.env.JWT_SECRET, { expiresIn: '5m' }) };
    };
    const own = await makeAccount('own', '0899999930');
    const other = await makeAccount('other', '0899999931');
    const body = { hoTen: 'TEST ONLY COMPLETED PROFILE', ngaySinh: '1950-01-01', gioiTinh: 'Nữ', cccd: '123456789030',
      diaChi: 'TEST ONLY ADDRESS', benhNen: 'TEST CONDITION', diUng: 'TEST ALLERGY' };
    const missing = await api('GET', '/elderly/me', own.token); expect(missing, 404);
    assert.equal(missing.errorCode, 'ELDERLY_PROFILE_NOT_FOUND');
    expect(await api('POST', '/elderly/me', '', body), 401);
    // Admin/caregiver are never allowed to use this self-registration endpoint.
    const roleRows = (await query(`SELECT nd.UserID AS id,nd.VaiTroID AS roleId,vt.TenVaiTro AS role
      FROM NguoiDung nd JOIN VaiTro vt ON vt.VaiTroID=nd.VaiTroID
      WHERE nd.TenDangNhap IN ('regression.QuanTriVien','regression.NguoiChamSoc')`)).recordset;
    for (const row of roleRows) {
      const token = jwt.sign({ userId: row.id, vaiTroId: row.roleId, tenVaiTro: row.role, sessionVersion: 2 }, process.env.JWT_SECRET);
      expect(await api('POST', '/elderly/me', token, body), 403);
    }
    for (const input of [{ ...body, ngaySinh: '9999-01-01' }, { ...body, userId: other.id },
      { ...body, nguoiChamSocId: 1 }, { ...body, soDienThoai: '123' }]) {
      expect(await api('POST', '/elderly/me', own.token, input), 422);
    }
    const responses = await Promise.all([body, { ...body, hoTen: 'MUST NOT OVERWRITE FIRST PROFILE' }]
      .map(input => api('POST', '/elderly/me', own.token, input)));
    assert.deepEqual(responses.map(row => row.status).sort(), [200, 201]);
    const created = responses.find(row => row.status === 201).data;
    assert.equal(created.userId, own.id);
    const profile = expect(await api('GET', '/elderly/me', own.token), 200);
    assert.equal(profile.id, created.id); assert.equal(profile.hoTen, created.hoTen);
    assert.equal(profile.soDienThoai, '0899999930'); assert.equal(profile.cccd, body.cccd);
    assert.equal(profile.nguoiChamSocId, null);
    const count = (await query('SELECT COUNT(*) AS total FROM HoSoNguoiCaoTuoi WHERE UserID=@id', [['id', sql.Int, own.id]])).recordset[0];
    assert.equal(count.total, 1);
    expect(await api('GET', `/elderly/${created.id}`, other.token), 403);
    expect(await api('GET', '/elderly/me', other.token), 404);
    const cccdConflict = await api('POST', '/elderly/me', other.token, body);
    expect(cccdConflict, 409); assert.equal(cccdConflict.errorCode, 'CCCD_TAKEN');
    const phoneConflict = await api('POST', '/elderly/me', other.token, { ...body, cccd: '', soDienThoai: '0899999930' });
    expect(phoneConflict, 409); assert.equal(phoneConflict.errorCode, 'PHONE_TAKEN');
    expect(await api('GET', '/elderly/me', other.token), 404);
    const sync = (await query('SELECT HoTen,SoDienThoai FROM NguoiDung WHERE UserID=@id', [['id', sql.Int, own.id]])).recordset[0];
    assert.equal(sync.HoTen, created.hoTen); assert.equal(sync.SoDienThoai, '0899999930');
    await query("ALTER TABLE NguoiDung ADD CONSTRAINT CK_TEST_OnboardingRollback CHECK(HoTen<>N'TEST ONLY ONBOARDING SYNC FAILURE')");
    try {
      expect(await api('POST', '/elderly/me', other.token, { ...body, cccd: '', hoTen: 'TEST ONLY ONBOARDING SYNC FAILURE' }), 500);
      expect(await api('GET', '/elderly/me', other.token), 404);
    } finally { await query('ALTER TABLE NguoiDung DROP CONSTRAINT CK_TEST_OnboardingRollback'); }
  });
}

main().then(verifyMobileOnboarding).catch(error => { console.error(JSON.stringify({ fatal: error.code || error.name, detail: error.message })); process.exitCode = 1; })
  .finally(async () => {
    try {
      if (server) { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); }
      if (pool) await pool.close();
      if (master && created) {
        validateTarget();
        await master.request().query(`ALTER DATABASE [${database}] SET SINGLE_USER WITH ROLLBACK IMMEDIATE; DROP DATABASE [${database}]`);
        console.log(JSON.stringify({ temporaryDatabaseRemoved: database }));
      }
    } catch (error) { console.error(JSON.stringify({ cleanupFailed: database, code: error.code || error.name })); process.exitCode = 1; }
    finally { if (master) await master.close(); }
    const failed = results.filter(row => row.result === 'FAIL').length;
    console.log(JSON.stringify({ passed: results.length - failed, failed }));
    if (failed) process.exitCode = 1;
  });
