// Run against a disposable database: PERMISSION_VERIFY_ALLOW_DB_WRITE=1 node verify_permission_matrix.js
// The script creates three accounts and one assigned elderly profile, calls real HTTP routes,
// then removes every fixture in finally. Never point it at production data.
require('dotenv').config();
if (process.env.PERMISSION_VERIFY_ALLOW_DB_WRITE !== '1') {
  throw new Error('Chỉ chạy trên CSDL thử nghiệm: đặt PERMISSION_VERIFY_ALLOW_DB_WRITE=1.');
}
const http = require('node:http');
const { randomUUID } = require('node:crypto');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const app = require('./src/app');
const { poolPromise, sql } = require('./src/config/db');

const roles = ['QuanTriVien', 'NguoiChamSoc', 'NguoiCaoTuoi'];
const cases = [
  ['GET', '/api/auth/me', 'QLHOSONCT', 'xem'],
  ['GET', '/api/elderly', 'QLHOSONCT', 'xem'],
  ['GET', '/api/caregivers', 'QLNGUOICHAMSOC', 'xem'],
  ['GET', '/api/medications', 'QLTHUOC', 'xem'],
  ['GET', '/api/medication-schedules', 'QLLICHUONGTHUOC', 'xem'],
  ['GET', '/api/appointments', 'QLLICHKHAM', 'xem'],
  ['GET', '/api/health-metrics', 'QLCHISOSK', 'xem'],
  ['GET', '/api/health-metric-types', 'QLCHISOSK', 'xem'],
  ['GET', '/api/alerts', 'QLCANHBAO', 'xem'],
  ['GET', '/api/emergency-alerts', 'QLCANHBAO', 'xem'],
  ['GET', '/api/emergency-contacts', 'QLLIENHEKC', 'xem'],
  ['GET', '/api/care-notes', 'QLNHATKY', 'xem'],
  ['GET', '/api/reports/health-summary', 'QLBAOCAO', 'xem'],
  ['GET', '/api/permissions/matrix', 'QLNGUOIDUNG', 'xem'],
  ['POST', '/api/emergency-contacts', 'QLLIENHEKC', 'them',
    (ids) => ({ nguoiCaoTuoiId: ids.elderly, hoTen: 'Liên hệ thử nghiệm', soDienThoai: '0900000000' })],
  ['POST', '/api/care-notes', 'QLNHATKY', 'them',
    (ids) => ({ nguoiCaoTuoiId: ids.elderly, tieuDe: 'Kiểm tra quyền', noiDung: 'Bản ghi tạm thời' })],
  ['POST', '/api/health-metrics', 'QLCHISOSK', 'them',
    (ids) => ({ nguoiCaoTuoiId: ids.elderly, loaiChiSo: ids.metricName,
      giaTri: ids.metricValue, binhThuong: true })],
  ['GET', '/api/elderly/me/health-metrics', 'QLCHISOSK', 'xem', null, 'NguoiCaoTuoi'],
  ['GET', '/api/elderly/me/medication-schedule', 'QLLICHUONGTHUOC', 'xem', null, 'NguoiCaoTuoi'],
  ['GET', '/api/elderly/me/appointments', 'QLLICHKHAM', 'xem', null, 'NguoiCaoTuoi'],
  ['GET', '/api/elderly/me/alerts', 'QLCANHBAO', 'xem', null, 'NguoiCaoTuoi'],
];

const request = (pool, statement, inputs = []) => {
  const command = pool.request();
  for (const [name, type, value] of inputs) command.input(name, type, value);
  return command.query(statement);
};

async function createFixtures(pool, ids) {
  const roleRows = (await request(pool,
    "SELECT VaiTroID AS id,TenVaiTro AS name FROM VaiTro WHERE TenVaiTro IN (N'QuanTriVien',N'NguoiChamSoc',N'NguoiCaoTuoi')"
  )).recordset;
  if (roleRows.length !== 3) throw new Error('CSDL phải có đúng 3 vai trò trước khi kiểm thử.');
  const byRole = Object.fromEntries(roleRows.map((row) => [row.name, row.id]));
  const hash = await bcrypt.hash(randomUUID(), 10);
  for (const role of roles) {
    const created = await request(pool,
      `INSERT INTO NguoiDung(TenDangNhap,MatKhauHash,HoTen,Email,VaiTroID)
       OUTPUT INSERTED.UserID AS id VALUES(@username,@hash,@name,@email,@roleId)`, [
        ['username', sql.VarChar(50), `audit_${role}_${ids.tag}`.slice(0, 50)],
        ['hash', sql.VarChar(255), hash],
        ['name', sql.NVarChar(100), `Kiểm tra ${role}`],
        ['email', sql.VarChar(100), `audit-${role}-${ids.tag}@example.invalid`],
        ['roleId', sql.Int, byRole[role]],
      ]);
    ids.users[role] = { userId: created.recordset[0].id, vaiTroId: byRole[role], tenVaiTro: role };
  }
  ids.elderly = (await request(pool,
    `INSERT INTO HoSoNguoiCaoTuoi(UserID,HoTen,NgaySinh,GioiTinh)
     OUTPUT INSERTED.NguoiCaoTuoiID AS id VALUES(@uid,N'Người cao tuổi kiểm tra','1950-01-01',N'Nam')`,
    [['uid', sql.Int, ids.users.NguoiCaoTuoi.userId]])).recordset[0].id;
  ids.caregiver = (await request(pool,
    `INSERT INTO NguoiChamSoc(UserID,HoTen,SoDienThoai,Email)
     OUTPUT INSERTED.NguoiChamSocID AS id VALUES(@uid,N'Người chăm sóc kiểm tra',@phone,@email)`, [
      ['uid', sql.Int, ids.users.NguoiChamSoc.userId],
      ['phone', sql.VarChar(15), '0900000000'],
      ['email', sql.VarChar(100), `audit-NguoiChamSoc-${ids.tag}@example.invalid`],
    ])).recordset[0].id;
  await request(pool,
    `INSERT INTO NguoiCaoTuoi_NguoiChamSoc(NguoiCaoTuoiID,NguoiChamSocID,LaChinh,NgayBatDau)
     VALUES(@eid,@cid,1,CAST(DATEADD(HOUR,7,SYSUTCDATETIME()) AS DATE))`,
    [['eid', sql.Int, ids.elderly], ['cid', sql.Int, ids.caregiver]]);
  const metric = (await request(pool,
    `SELECT TOP(1) TenChiSo AS name, COALESCE(GiaTriMin,50) AS minValue,
       GiaTriMax AS maxValue FROM LoaiChiSoSucKhoe
     WHERE GiaTriMin2 IS NULL AND GiaTriMax2 IS NULL ORDER BY LoaiChiSoID`)).recordset[0];
  if (!metric) throw new Error('CSDL thiếu loại chỉ số đơn để thử POST /health-metrics.');
  ids.metricName = metric.name;
  ids.metricValue = Number(metric.minValue);
}

async function cleanup(pool, ids) {
  if (ids.elderly) {
    await request(pool, `DELETE FROM ThongBao WHERE
      (LienKetBang=N'CanhBaoKhanCap' AND LienKetID IN
        (SELECT CanhBaoKhanCapID FROM CanhBaoKhanCap WHERE NguoiCaoTuoiID=@eid))
      OR (LienKetBang=N'CanhBao' AND LienKetID IN
        (SELECT CanhBaoID FROM CanhBao WHERE NguoiCaoTuoiID=@eid))`,
    [['eid', sql.Int, ids.elderly]]);
    for (const table of ['NhatKyChamSoc', 'ChiSoSucKhoe', 'LienHeKhanCap',
      'CanhBao', 'CanhBaoKhanCap', 'NguoiCaoTuoi_NguoiChamSoc']) {
      await request(pool, `DELETE FROM ${table} WHERE NguoiCaoTuoiID=@eid`,
        [['eid', sql.Int, ids.elderly]]);
    }
    await request(pool, 'DELETE FROM HoSoNguoiCaoTuoi WHERE NguoiCaoTuoiID=@eid',
      [['eid', sql.Int, ids.elderly]]);
  }
  if (ids.caregiver) await request(pool, 'DELETE FROM NguoiChamSoc WHERE NguoiChamSocID=@cid',
    [['cid', sql.Int, ids.caregiver]]);
  for (const user of Object.values(ids.users)) {
    await request(pool, 'DELETE FROM ThongBao WHERE UserID=@uid', [['uid', sql.Int, user.userId]]);
    await request(pool, 'DELETE FROM NhatKyDangNhap WHERE UserID=@uid', [['uid', sql.Int, user.userId]]);
    await request(pool, 'DELETE FROM NguoiDung WHERE UserID=@uid', [['uid', sql.Int, user.userId]]);
  }
}

async function main() {
  if (!process.env.JWT_SECRET) throw new Error('Thiếu JWT_SECRET.');
  const pool = await poolPromise;
  const ids = { tag: randomUUID().replaceAll('-', '').slice(0, 10), users: {} };
  let server;
  let failed = 0;
  try {
    await createFixtures(pool, ids);
    const matrixRows = (await request(pool, `SELECT vt.TenVaiTro AS role,cn.MaChucNang AS feature,
      pq.ChoPhepXem AS xem,pq.ChoPhepThem AS them,pq.ChoPhepSua AS sua,pq.ChoPhepXoa AS xoa
      FROM PhanQuyen pq JOIN VaiTro vt ON vt.VaiTroID=pq.VaiTroID
      JOIN ChucNang cn ON cn.ChucNangID=pq.ChucNangID`)).recordset;
    const matrix = new Map(matrixRows.map((row) => [`${row.role}:${row.feature}`, row]));
    server = http.createServer(app);
    await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
    const url = `http://127.0.0.1:${server.address().port}`;
    console.log('Vai trò | Endpoint | Quyền | HTTP | Kết quả');
    for (const role of roles) {
      const token = jwt.sign({ ...ids.users[role], sessionVersion: 2 },
        process.env.JWT_SECRET, { expiresIn: '5m' });
      for (const [method, route, feature, action, body, onlyRole] of cases) {
        if (onlyRole && onlyRole !== role) continue;
        const allowed = role === 'QuanTriVien' || Boolean(matrix.get(`${role}:${feature}`)?.[action]);
        const response = await fetch(`${url}${route}`, {
          method, headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
          ...(body ? { body: JSON.stringify(body(ids)) } : {}),
        });
        const passed = allowed ? response.status >= 200 && response.status < 300 : response.status === 403;
        if (!passed) failed += 1;
        console.log(`${role} | ${method} ${route} | ${allowed ? 'cho phép' : 'cấm'} | ${response.status} | ${passed ? 'PASS' : 'FAIL'}`);
      }
    }
    for (const [role, feature, action] of [
      ['NguoiChamSoc', 'QLLIENHEKC', 'xoa'], ['NguoiChamSoc', 'QLNHATKY', 'xoa'],
      ['NguoiCaoTuoi', 'QLHOSONCT', 'sua'],
    ]) {
      const passed = Boolean(matrix.get(`${role}:${feature}`)?.[action]);
      if (!passed) failed += 1;
      console.log(`${role} | ma trận ${feature}.${action} | bắt buộc | — | ${passed ? 'PASS' : 'FAIL (chạy patch SQL thủ công)'}`);
    }
  } finally {
    if (server) await new Promise((resolve) => server.close(resolve));
    await cleanup(pool, ids);
    await pool.close();
  }
  if (failed) throw new Error(`${failed} kiểm tra quyền không đạt.`);
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
