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
  BacSi: { ma: 'BAC_SI', label: 'Bác sĩ' },
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
  try {
    const { username, password, hoTen, email, soDienThoai, vaiTro } = req.body;
    if (!username || !password || !hoTen || !vaiTro)
      return fail(res, 'username, password, hoTen, vaiTro la bat buoc', 'MISSING_FIELDS', 400);

    const pool = await poolPromise;
    const exists = await pool.request().input('u', sql.NVarChar, username)
      .query(`SELECT UserID FROM NguoiDung WHERE TenDangNhap = @u`);
    if (exists.recordset.length) return fail(res, 'Ten dang nhap da ton tai', 'DUPLICATE', 409);

    const roleName = findRoleNameByCode(vaiTro);
    if (!roleName) return fail(res, 'Vai tro khong hop le', 'INVALID_ROLE', 400);
    const roleResult = await pool.request().input('tenVaiTro', sql.NVarChar, roleName)
      .query('SELECT VaiTroID AS id FROM VaiTro WHERE TenVaiTro=@tenVaiTro');
    if (!roleResult.recordset.length) return fail(res, 'Khong tim thay vai tro', 'ROLE_NOT_FOUND', 400);
    const vaiTroId = roleResult.recordset[0].id;
    const hash = await bcrypt.hash(password, 10);

    const r = await pool.request()
      .input('ten', sql.NVarChar, username).input('hash', sql.NVarChar, hash)
      .input('hoTen', sql.NVarChar, hoTen).input('email', sql.NVarChar, email || null)
      .input('sdt', sql.NVarChar, soDienThoai || null).input('vaiTroId', sql.Int, vaiTroId)
      .query(`INSERT INTO NguoiDung (TenDangNhap,MatKhauHash,HoTen,Email,SoDienThoai,VaiTroID,TrangThai)
              OUTPUT INSERTED.UserID AS id
              VALUES (@ten,@hash,@hoTen,@email,@sdt,@vaiTroId,N'HoatDong')`);
    return ok(res, { id: r.recordset[0].id }, 'Tao nguoi dung thanh cong', 201);
  } catch (err) { next(err); }
};

// PUT /api/users/:id
const update = async (req, res, next) => {
  try {
    const { hoTen, email, soDienThoai, vaiTro } = req.body;
    const pool = await poolPromise;
    let vaiTroId;
    if (vaiTro) {
      const roleName = findRoleNameByCode(vaiTro);
      if (!roleName) return fail(res, 'Vai tro khong hop le', 'INVALID_ROLE', 400);
      const roleResult = await pool.request().input('tenVaiTro', sql.NVarChar, roleName)
        .query('SELECT VaiTroID AS id FROM VaiTro WHERE TenVaiTro=@tenVaiTro');
      if (!roleResult.recordset.length) return fail(res, 'Khong tim thay vai tro', 'ROLE_NOT_FOUND', 400);
      vaiTroId = roleResult.recordset[0].id;
    }
    const r = pool.request().input('id', sql.Int, req.params.id)
      .input('hoTen', sql.NVarChar, hoTen).input('email', sql.NVarChar, email || null)
      .input('sdt', sql.NVarChar, soDienThoai || null);
    let set = `HoTen=@hoTen, Email=@email, SoDienThoai=@sdt`;
    if (vaiTroId) { set += `, VaiTroID=@vaiTroId`; r.input('vaiTroId', sql.Int, vaiTroId); }
    await r.query(`UPDATE NguoiDung SET ${set} WHERE UserID=@id`);
    return ok(res, { id: parseInt(req.params.id) }, 'Cap nhat thanh cong');
  } catch (err) { next(err); }
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
