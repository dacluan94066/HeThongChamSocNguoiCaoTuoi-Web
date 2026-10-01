// controllers/auth.controller.js - Xu ly dang ky, dang nhap, lay thong tin ca nhan
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { poolPromise, sql } = require('../config/db');
const { ok, fail } = require('../utils/response');

// ─── DANG KY ────────────────────────────────────────────────────────────────
// POST /api/auth/register
// Nhan: { tenDangNhap, matKhau, hoTen, email, soDienThoai }
const register = async (req, res, next) => {
  try {
    const { tenDangNhap, matKhau, hoTen, email, soDienThoai } = req.body;

    // Validate cac truong bat buoc
    if (!tenDangNhap || !matKhau || !hoTen) {
      return fail(res, 'tenDangNhap, matKhau, hoTen la bat buoc', 'MISSING_FIELDS', 400);
    }
    if (matKhau.length < 6) {
      return fail(res, 'Mat khau phai co it nhat 6 ky tu', 'WEAK_PASSWORD', 400);
    }

    const pool = await poolPromise;

    // Kiem tra trung ten dang nhap
    const checkExist = await pool.request()
      .input('tenDangNhap', sql.NVarChar, tenDangNhap)
      .query(`SELECT UserID FROM NguoiDung WHERE TenDangNhap = @tenDangNhap`);

    if (checkExist.recordset.length > 0) {
      return fail(res, 'Ten dang nhap da duoc su dung', 'USERNAME_TAKEN', 409);
    }

    // Lay ID cua vai tro mac dinh "NguoiCaoTuoi"
    const vaiTroResult = await pool.request()
      .input('tenVaiTro', sql.NVarChar, 'NguoiCaoTuoi')
      .query(`SELECT VaiTroID FROM VaiTro WHERE TenVaiTro = @tenVaiTro`);

    if (vaiTroResult.recordset.length === 0) {
      return fail(res, 'Khong tim thay vai tro mac dinh trong he thong', 'ROLE_NOT_FOUND', 500);
    }
    const vaiTroId = vaiTroResult.recordset[0].VaiTroID;

    // Hash mat khau (10 rounds)
    const matKhauHash = await bcrypt.hash(matKhau, 10);

    // Them nguoi dung moi vao bang NguoiDung
    await pool.request()
      .input('tenDangNhap', sql.NVarChar, tenDangNhap)
      .input('matKhauHash', sql.NVarChar, matKhauHash)
      .input('hoTen', sql.NVarChar, hoTen)
      .input('email', sql.NVarChar, email || null)
      .input('soDienThoai', sql.NVarChar, soDienThoai || null)
      .input('vaiTroId', sql.Int, vaiTroId)
      .query(`
        INSERT INTO NguoiDung
          (TenDangNhap, MatKhauHash, HoTen, Email, SoDienThoai, VaiTroID, TrangThai, NgayTao)
        VALUES
          (@tenDangNhap, @matKhauHash, @hoTen, @email, @soDienThoai, @vaiTroId, 'HoatDong', SYSDATETIME())
      `);

    return ok(res, null, 'Dang ky tai khoan thanh cong', 201);
  } catch (err) {
    next(err);
  }
};

// ─── DANG NHAP ───────────────────────────────────────────────────────────────
// POST /api/auth/login
// Nhan: { tenDangNhap, matKhau, platform?: 'web' | 'mobile' }
// Tra ve: { token, user }
const login = async (req, res, next) => {
  try {
    const { tenDangNhap, matKhau, platform = 'mobile' } = req.body;

    if (!tenDangNhap || !matKhau) {
      return fail(res, 'Vui long nhap ten dang nhap va mat khau', 'MISSING_FIELDS', 400);
    }

    const pool = await poolPromise;

    // Tim user kem vai tro (JOIN VaiTro de lay TenVaiTro)
    const result = await pool.request()
      .input('tenDangNhap', sql.NVarChar, tenDangNhap)
      .query(`
        SELECT
          nd.UserID,
          nd.TenDangNhap,
          nd.MatKhauHash,
          nd.HoTen,
          nd.Email,
          nd.SoDienThoai,
          nd.TrangThai,
          nd.VaiTroID,
          vt.TenVaiTro
        FROM NguoiDung nd
        INNER JOIN VaiTro vt ON nd.VaiTroID = vt.VaiTroID
        WHERE nd.TenDangNhap = @tenDangNhap
      `);

    if (result.recordset.length === 0) {
      return fail(res, 'Ten dang nhap hoac mat khau khong chinh xac', 'INVALID_CREDENTIALS', 401);
    }

    const user = result.recordset[0];

    // Kiem tra tai khoan co bi khoa khong
    if (user.TrangThai === 'KhoaTaiKhoan') {
      return fail(res, 'Tai khoan da bi khoa, lien he quan tri vien', 'ACCOUNT_LOCKED', 403);
    }

    // So sanh mat khau voi hash luu trong DB
    const matKhauDung = await bcrypt.compare(matKhau, user.MatKhauHash);
    if (!matKhauDung) {
      return fail(res, 'Ten dang nhap hoac mat khau khong chinh xac', 'INVALID_CREDENTIALS', 401);
    }

    // Web quan tri chi danh cho QuanTriVien va BacSi.
    if (platform === 'web' && !['QuanTriVien', 'BacSi'].includes(user.TenVaiTro)) {
      return fail(
        res,
        'Tài khoản này không có quyền truy cập hệ thống Web, vui lòng sử dụng ứng dụng Mobile',
        'WEB_ACCESS_DENIED',
        403
      );
    }

    // Tao JWT chua thong tin can thiet
    const token = jwt.sign(
      {
        userId: user.UserID,
        vaiTroId: user.VaiTroID,
        tenVaiTro: user.TenVaiTro,
      },
      process.env.JWT_SECRET,
      { expiresIn: process.env.JWT_EXPIRES_IN || '7d' }
    );

    // Cap nhat thoi gian dang nhap cuoi
    await pool.request()
      .input('nguoiDungId', sql.Int, user.UserID)
      .query(`UPDATE NguoiDung SET LanDangNhapCuoi = SYSDATETIME() WHERE UserID = @nguoiDungId`);

    // Tra ve token va thong tin user (khong tra MatKhauHash)
    return ok(res, {
      token,
      user: {
        userId: user.UserID,
        tenDangNhap: user.TenDangNhap,
        hoTen: user.HoTen,
        email: user.Email,
        soDienThoai: user.SoDienThoai,
        vaiTroId: user.VaiTroID,
        tenVaiTro: user.TenVaiTro,
      },
    }, 'Dang nhap thanh cong');
  } catch (err) {
    next(err);
  }
};

// ─── LAY THONG TIN CA NHAN ────────────────────────────────────────────────────
// GET /api/auth/me  (can authMiddleware)
// Dung req.user.userId tu JWT de lay thong tin moi nhat tu DB
const me = async (req, res, next) => {
  try {
    const pool = await poolPromise;

    const result = await pool.request()
      .input('nguoiDungId', sql.Int, req.user.userId)
      .query(`
        SELECT
          nd.UserID       AS userId,
          nd.TenDangNhap  AS tenDangNhap,
          nd.HoTen        AS hoTen,
          nd.Email        AS email,
          nd.SoDienThoai  AS soDienThoai,
          nd.TrangThai    AS trangThai,
          nd.NgayTao      AS ngayTao,
          nd.VaiTroID     AS vaiTroId,
          vt.TenVaiTro    AS tenVaiTro
        FROM NguoiDung nd
        INNER JOIN VaiTro vt ON nd.VaiTroID = vt.VaiTroID
        WHERE nd.UserID = @nguoiDungId
      `);

    if (result.recordset.length === 0) {
      return fail(res, 'Khong tim thay nguoi dung', 'USER_NOT_FOUND', 404);
    }

    return ok(res, result.recordset[0], 'Lay thong tin thanh cong');
  } catch (err) {
    next(err);
  }
};

module.exports = { register, login, me };
