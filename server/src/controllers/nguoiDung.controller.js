// controllers/nguoiDung.controller.js - CRUD nguoi dung - dung dung schema
// Bang NguoiDung: UserID, TenDangNhap, MatKhauHash, HoTen, Email,
//   SoDienThoai, VaiTroID, TrangThai (HoatDong|KhoaTaiKhoan|ChoDuyet), NgayTao
const { poolPromise, sql } = require('../config/db');
const { ok, fail } = require('../utils/response');
const bcrypt = require('bcryptjs');

const VAI_TRO_MAP = {
  1: { ma: 'QUAN_TRI',      label: 'Quản trị viên' },
  2: { ma: 'BAC_SI',        label: 'Bác sĩ' },
  3: { ma: 'NGUOI_CHAM_SOC',label: 'Người chăm sóc' },
  4: { ma: 'NGUOI_CAO_TUOI',label: 'Người cao tuổi' },
};

const mapUser = (row) => {
  const vt = VAI_TRO_MAP[row.vaiTroId] || { ma: '', label: '' };
  return {
    id:            row.id,
    username:      row.tenDangNhap,
    hoTen:         row.hoTen,
    email:         row.email,
    soDienThoai:   row.soDienThoai,
    vaiTroId:      row.vaiTroId,
    vaiTro:        vt.ma,
    vaiTroLabel:   row.tenVaiTro || vt.label,
    trangThai:     row.trangThai === 'HoatDong' ? 'HOAT_DONG' : 'KHOA',
    trangThaiLabel: row.trangThai === 'HoatDong' ? 'Hoạt động' : 'Đã khóa',
    ngayTao:       row.ngayTao ? new Date(row.ngayTao).toISOString().slice(0, 10) : '',
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
        vt.TenVaiTro AS tenVaiTro, nd.TrangThai AS trangThai, nd.NgayTao AS ngayTao
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
      const vaiTroId = Object.entries(VAI_TRO_MAP).find(([, v]) => v.ma === vaiTro)?.[0];
      if (vaiTroId) { query += ` AND nd.VaiTroID = @vaiTroId`; req2.input('vaiTroId', sql.Int, parseInt(vaiTroId)); }
    }
    if (trangThai) {
      const dbVal = trangThai === 'HOAT_DONG' ? 'HoatDong' : 'KhoaTaiKhoan';
      query += ` AND nd.TrangThai = @trangThai`; req2.input('trangThai', sql.NVarChar, dbVal);
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
        vt.TenVaiTro AS tenVaiTro, nd.TrangThai AS trangThai, nd.NgayTao AS ngayTao
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

    const vaiTroId = parseInt(Object.entries(VAI_TRO_MAP).find(([, v]) => v.ma === vaiTro)?.[0] || 3);
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
    const vaiTroId = vaiTro ? parseInt(Object.entries(VAI_TRO_MAP).find(([, v]) => v.ma === vaiTro)?.[0] || 3) : undefined;
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

module.exports = { getAll, getById, create, update, toggleStatus };
