// controllers/nguoiDung.controller.js - CRUD nguoi dung - dung dung schema
// Bang NguoiDung: UserID, TenDangNhap, MatKhauHash, HoTen, Email,
//   SoDienThoai, VaiTroID, TrangThai (HoatDong|KhoaTaiKhoan|ChoDuyet),
//   NgayTao, LanDangNhapCuoi
const { poolPromise, sql } = require('../config/db');
const { ok, fail } = require('../utils/response');
const bcrypt = require('bcryptjs');

// PUT /api/users/me/password - doi mat khau cua tai khoan trong JWT.
const changeMyPassword = async (req, res, next) => {
  try {
    const { matKhauCu, matKhauMoi } = req.body || {};
    if (typeof matKhauCu !== 'string' || !matKhauCu
      || typeof matKhauMoi !== 'string' || matKhauMoi.length < 6) {
      return fail(res, 'Can mat khau cu va mat khau moi it nhat 6 ky tu', 'INVALID_PASSWORD', 400);
    }
    if (matKhauCu === matKhauMoi) {
      return fail(res, 'Mat khau moi phai khac mat khau cu', 'SAME_PASSWORD', 400);
    }
    const pool = await poolPromise;
    const result = await pool.request().input('userId', sql.Int, req.user.userId)
      .query('SELECT MatKhauHash FROM NguoiDung WHERE UserID = @userId');
    if (!result.recordset.length) {
      return fail(res, 'Khong tim thay tai khoan', 'USER_NOT_FOUND', 404);
    }
    if (!await bcrypt.compare(matKhauCu, result.recordset[0].MatKhauHash)) {
      return fail(res, 'Mat khau cu khong chinh xac', 'INVALID_CURRENT_PASSWORD', 400);
    }
    const hash = await bcrypt.hash(matKhauMoi, 10);
    await pool.request().input('userId', sql.Int, req.user.userId)
      .input('matKhauHash', sql.NVarChar, hash)
      .query('UPDATE NguoiDung SET MatKhauHash = @matKhauHash WHERE UserID = @userId');
    return ok(res, null, 'Doi mat khau thanh cong');
  } catch (error) { next(error); }
};

const VAI_TRO_MAP = {
  QuanTriVien: { ma: 'QUAN_TRI', label: 'Quản trị viên' },
  NguoiChamSoc: { ma: 'NGUOI_CHAM_SOC', label: 'Người chăm sóc' },
  NguoiCaoTuoi: { ma: 'NGUOI_CAO_TUOI', label: 'Người cao tuổi' },
};

const findRoleNameByCode = (code) => Object.entries(VAI_TRO_MAP)
  .find(([, value]) => value.ma === code)?.[0];

const mapUser = (row) => {
  const vt = VAI_TRO_MAP[row.tenVaiTro] || { ma: '', label: row.tenVaiTro || '' };
  const statusMap = {
    HoatDong: { value: 'HOAT_DONG', label: 'Hoạt động' },
    KhoaTaiKhoan: { value: 'KHOA', label: 'Đã khóa' },
    ChoDuyet: { value: 'CHO_DUYET', label: 'Chờ duyệt' },
  };
  const status = statusMap[row.trangThai] || { value: row.trangThai, label: row.trangThai };
  return {
    id:            row.id,
    username:      row.tenDangNhap,
    hoTen:         row.hoTen,
    email:         row.email,
    soDienThoai:   row.soDienThoai,
    vaiTroId:      row.vaiTroId,
    vaiTro:        vt.ma,
    vaiTroLabel:   vt.label,
    trangThai:     status.value,
    trangThaiLabel: status.label,
    ngayTao:       row.ngayTao ? new Date(row.ngayTao).toISOString().slice(0, 10) : '',
    lanDangNhapCuoi: row.lanDangNhapCuoi ? new Date(row.lanDangNhapCuoi).toISOString() : null,
    avatar:        null,
  };
};

// GET /api/users?keyword=&vaiTro=&trangThai=
const getAll = async (req, res, next) => {
  try {
    const { keyword, vaiTro, trangThai } = req.query;
    const pool = await poolPromise;

    let query = `
      SELECT nd.UserID AS id, nd.TenDangNhap AS tenDangNhap, nd.HoTen AS hoTen,
        nd.Email AS email, nd.SoDienThoai AS soDienThoai, nd.VaiTroID AS vaiTroId,
        vt.TenVaiTro AS tenVaiTro, nd.TrangThai AS trangThai, nd.NgayTao AS ngayTao,
        nd.LanDangNhapCuoi AS lanDangNhapCuoi
      FROM NguoiDung nd
      LEFT JOIN VaiTro vt ON nd.VaiTroID = vt.VaiTroID
      WHERE 1=1
    `;
    const req2 = pool.request();

    if (keyword && keyword.trim()) {
      query += ` AND (nd.HoTen LIKE @kw OR nd.TenDangNhap LIKE @kw OR nd.Email LIKE @kw)`;
      req2.input('kw', sql.NVarChar, `%${keyword.trim()}%`);
    }
    if (vaiTro) {
      const roleName = findRoleNameByCode(vaiTro);
      if (roleName) {
        query += ' AND vt.TenVaiTro = @tenVaiTro';
        req2.input('tenVaiTro', sql.NVarChar, roleName);
      }
    }
    if (trangThai) {
      const statusMap = { HOAT_DONG: 'HoatDong', KHOA: 'KhoaTaiKhoan', CHO_DUYET: 'ChoDuyet' };
      const dbVal = statusMap[trangThai];
      if (dbVal) {
        query += ' AND nd.TrangThai = @trangThai';
        req2.input('trangThai', sql.NVarChar, dbVal);
      }
    }
    query += ` ORDER BY nd.NgayTao DESC`;
    const result = await req2.query(query);
    return ok(res, result.recordset.map(mapUser));
  } catch (err) { next(err); }
};

// GET /api/users/:id
const getById = async (req, res, next) => {
  try {
    const pool = await poolPromise;
    const result = await pool.request().input('id', sql.Int, req.params.id).query(`
      SELECT nd.UserID AS id, nd.TenDangNhap AS tenDangNhap, nd.HoTen AS hoTen,
        nd.Email AS email, nd.SoDienThoai AS soDienThoai, nd.VaiTroID AS vaiTroId,
        vt.TenVaiTro AS tenVaiTro, nd.TrangThai AS trangThai, nd.NgayTao AS ngayTao,
        nd.LanDangNhapCuoi AS lanDangNhapCuoi
      FROM NguoiDung nd LEFT JOIN VaiTro vt ON nd.VaiTroID = vt.VaiTroID
      WHERE nd.UserID = @id`);
    if (!result.recordset.length) return fail(res, 'Khong tim thay nguoi dung', 'NOT_FOUND', 404);
    return ok(res, mapUser(result.recordset[0]));
  } catch (err) { next(err); }
};

// POST /api/users
const create = async (req, res, next) => {
  let transaction;
  try {
    const { username, password, hoTen, email, soDienThoai, vaiTro } = req.body;
    if (!username || !password || !hoTen || !vaiTro)
      return fail(res, 'username, password, hoTen, vaiTro la bat buoc', 'MISSING_FIELDS', 400);

    const normalizedEmail = typeof email === 'string' ? email.trim().toLowerCase() : '';
    const normalizedPhone = typeof soDienThoai === 'string' ? soDienThoai.trim() : '';
    if (!normalizedEmail || normalizedEmail.length > 100 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail))
      return fail(res, 'Can email hop le de khoi phuc mat khau', 'INVALID_EMAIL', 400);
    if (typeof password !== 'string' || password.length < 6)
      return fail(res, 'Mat khau phai co it nhat 6 ky tu', 'INVALID_PASSWORD', 400);

    const pool = await poolPromise;
    const exists = await pool.request().input('u', sql.NVarChar, username)
      .query(`SELECT UserID FROM NguoiDung WHERE TenDangNhap = @u`);
    if (exists.recordset.length) return fail(res, 'Ten dang nhap da ton tai', 'DUPLICATE', 409);

    const roleName = findRoleNameByCode(vaiTro);
    if (!roleName) return fail(res, 'Vai tro khong hop le', 'INVALID_ROLE', 400);
    if (roleName === 'NguoiChamSoc' && !/^[0-9]{10,11}$/.test(normalizedPhone))
      return fail(res, 'Nguoi cham soc can so dien thoai 10-11 chu so', 'INVALID_PHONE', 400);
    const roleResult = await pool.request().input('tenVaiTro', sql.NVarChar, roleName)
      .query('SELECT VaiTroID AS id FROM VaiTro WHERE TenVaiTro=@tenVaiTro');
    if (!roleResult.recordset.length) return fail(res, 'Khong tim thay vai tro', 'ROLE_NOT_FOUND', 400);
    const vaiTroId = roleResult.recordset[0].id;
    const hash = await bcrypt.hash(password, 10);

    transaction = new sql.Transaction(pool);
    await transaction.begin();
    const caregiverMatch = await new sql.Request(transaction)
      .input('email', sql.VarChar(100), normalizedEmail)
      .query(`SELECT NguoiChamSocID AS id, UserID AS userId
              FROM NguoiChamSoc WITH (UPDLOCK, HOLDLOCK)
              WHERE LOWER(LTRIM(RTRIM(Email)))=@email`);
    if (caregiverMatch.recordset.length > 1 ||
        (caregiverMatch.recordset.length &&
          (roleName !== 'NguoiChamSoc' || caregiverMatch.recordset[0].userId))) {
      await transaction.rollback();
      transaction = null;
      return fail(res, 'Email da duoc su dung', 'EMAIL_TAKEN', 409);
    }
    const existingEmail = await new sql.Request(transaction)
      .input('email', sql.VarChar(100), normalizedEmail)
      .query(`SELECT UserID FROM NguoiDung WITH (UPDLOCK, HOLDLOCK)
              WHERE LOWER(LTRIM(RTRIM(Email)))=@email`);
    if (existingEmail.recordset.length) {
      await transaction.rollback();
      transaction = null;
      return fail(res, 'Email da duoc su dung', 'EMAIL_TAKEN', 409);
    }

    const r = await new sql.Request(transaction)
      .input('ten', sql.NVarChar, username).input('hash', sql.NVarChar, hash)
      .input('hoTen', sql.NVarChar, hoTen).input('email', sql.VarChar(100), normalizedEmail)
      .input('sdt', sql.VarChar(15), normalizedPhone || null).input('vaiTroId', sql.Int, vaiTroId)
      .query(`INSERT INTO NguoiDung (TenDangNhap,MatKhauHash,HoTen,Email,SoDienThoai,VaiTroID,TrangThai)
              OUTPUT INSERTED.UserID AS id
              VALUES (@ten,@hash,@hoTen,@email,@sdt,@vaiTroId,N'HoatDong')`);
    if (roleName === 'NguoiChamSoc') {
      const caregiver = new sql.Request(transaction)
        .input('userId', sql.Int, r.recordset[0].id)
        .input('hoTen', sql.NVarChar(100), hoTen.trim())
        .input('email', sql.VarChar(100), normalizedEmail)
        .input('sdt', sql.VarChar(15), normalizedPhone);
      if (caregiverMatch.recordset.length) {
        await caregiver.input('id', sql.Int, caregiverMatch.recordset[0].id)
          .query(`UPDATE NguoiChamSoc SET UserID=@userId, HoTen=@hoTen,
                  Email=@email, SoDienThoai=@sdt WHERE NguoiChamSocID=@id`);
      } else {
        await caregiver.query(`INSERT INTO NguoiChamSoc (UserID, HoTen, SoDienThoai, Email)
                               VALUES (@userId, @hoTen, @sdt, @email)`);
      }
    }
    await transaction.commit();
    transaction = null;
    return ok(res, { id: r.recordset[0].id }, 'Tao nguoi dung thanh cong', 201);
  } catch (err) {
    if (transaction) {
      try { await transaction.rollback(); } catch (_) { /* Transaction already closed. */ }
    }
    next(err);
  }
};

// PUT /api/users/:id
const update = async (req, res, next) => {
  let transaction;
  try {
    const { hoTen, email, soDienThoai, vaiTro } = req.body;
    const pool = await poolPromise;
    const current = await pool.request().input('id', sql.Int, req.params.id)
      .query(`SELECT nd.UserID, vt.TenVaiTro FROM NguoiDung nd
              JOIN VaiTro vt ON vt.VaiTroID=nd.VaiTroID WHERE nd.UserID=@id`);
    if (!current.recordset.length) return fail(res, 'Khong tim thay nguoi dung', 'NOT_FOUND', 404);
    const roleName = current.recordset[0].TenVaiTro;
    if (vaiTro) {
      const requestedRole = findRoleNameByCode(vaiTro);
      if (!requestedRole) return fail(res, 'Vai tro khong hop le', 'INVALID_ROLE', 400);
      if (requestedRole !== roleName)
        return fail(res, 'Khong the doi vai tro tai khoan da tao; can tao tai khoan moi voi ho so phu hop', 'ROLE_CHANGE_NOT_SUPPORTED', 409);
    }
    const normalizedEmail = typeof email === 'string' ? email.trim().toLowerCase() : '';
    const normalizedPhone = typeof soDienThoai === 'string' ? soDienThoai.trim() : '';
    if (!hoTen?.trim() || !normalizedEmail || normalizedEmail.length > 100
      || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail)) {
      return fail(res, 'Can ho ten va email hop le', 'INVALID_CONTACT', 400);
    }
    if (roleName === 'NguoiChamSoc' && !/^[0-9]{10,11}$/.test(normalizedPhone))
      return fail(res, 'Nguoi cham soc can so dien thoai 10-11 chu so', 'INVALID_PHONE', 400);

    transaction = new sql.Transaction(pool);
    await transaction.begin();
    const emailTaken = await new sql.Request(transaction)
      .input('id', sql.Int, req.params.id)
      .input('email', sql.VarChar(100), normalizedEmail)
      .query(`SELECT 1 AS taken FROM NguoiDung WITH (UPDLOCK, HOLDLOCK)
              WHERE LOWER(LTRIM(RTRIM(Email)))=@email AND UserID<>@id
              UNION ALL
              SELECT 1 FROM NguoiChamSoc WITH (UPDLOCK, HOLDLOCK)
              WHERE LOWER(LTRIM(RTRIM(Email)))=@email
                AND (UserID IS NULL OR UserID<>@id)`);
    if (emailTaken.recordset.length) {
      await transaction.rollback();
      transaction = null;
      return fail(res, 'Email da duoc su dung', 'EMAIL_TAKEN', 409);
    }
    await new sql.Request(transaction)
      .input('id', sql.Int, req.params.id)
      .input('hoTen', sql.NVarChar(100), hoTen.trim())
      .input('email', sql.VarChar(100), normalizedEmail)
      .input('sdt', sql.VarChar(15), normalizedPhone || null)
      .query(`UPDATE NguoiDung SET HoTen=@hoTen, Email=@email,
              SoDienThoai=@sdt WHERE UserID=@id`);
    if (roleName === 'NguoiChamSoc') {
      await new sql.Request(transaction)
        .input('id', sql.Int, req.params.id)
        .input('hoTen', sql.NVarChar(100), hoTen.trim())
        .input('email', sql.VarChar(100), normalizedEmail)
        .input('sdt', sql.VarChar(15), normalizedPhone)
        .query(`IF EXISTS (SELECT 1 FROM NguoiChamSoc WHERE UserID=@id)
                  UPDATE NguoiChamSoc SET HoTen=@hoTen, Email=@email,
                    SoDienThoai=@sdt WHERE UserID=@id
                ELSE
                  INSERT INTO NguoiChamSoc (UserID, HoTen, SoDienThoai, Email)
                  VALUES (@id, @hoTen, @sdt, @email)`);
    }
    await transaction.commit();
    transaction = null;
    return ok(res, { id: parseInt(req.params.id) }, 'Cap nhat thanh cong');
  } catch (err) {
    if (transaction) {
      try { await transaction.rollback(); } catch (_) { /* Transaction already closed. */ }
    }
    next(err);
  }
};

// PATCH /api/users/:id/toggle-status
const toggleStatus = async (req, res, next) => {
  try {
    const pool = await poolPromise;
    const check = await pool.request().input('id', sql.Int, req.params.id)
      .query(`SELECT TrangThai FROM NguoiDung WHERE UserID=@id`);
    if (!check.recordset.length) return fail(res, 'Khong tim thay', 'NOT_FOUND', 404);
    const newStatus = check.recordset[0].TrangThai === 'HoatDong' ? 'KhoaTaiKhoan' : 'HoatDong';
    await pool.request().input('id', sql.Int, req.params.id).input('s', sql.NVarChar, newStatus)
      .query(`UPDATE NguoiDung SET TrangThai=@s WHERE UserID=@id`);
    return ok(res, { id: parseInt(req.params.id), trangThai: newStatus === 'HoatDong' ? 'HOAT_DONG' : 'KHOA' });
  } catch (err) { next(err); }
};

module.exports = { changeMyPassword, getAll, getById, create, update, toggleStatus };
