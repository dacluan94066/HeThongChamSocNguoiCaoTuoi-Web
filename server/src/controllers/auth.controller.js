// controllers/auth.controller.js - Xu ly dang ky, dang nhap, lay thong tin ca nhan
const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const { poolPromise, sql } = require('../config/db');
const { sendMail } = require('../config/mailer');
const { ok, fail } = require('../utils/response');

const RESET_MESSAGE = 'Nếu email tồn tại, mã xác nhận đã được gửi';

const resetIdentity = (body = {}) => {
  const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : '';
  const tenDangNhap = typeof body.tenDangNhap === 'string' ? body.tenDangNhap.trim() : '';
  return email ? { email, tenDangNhap: '' } : { email: '', tenDangNhap };
};

const addResetIdentity = (request, identity) => {
  if (identity.email) {
    request.input('identity', sql.VarChar(100), identity.email);
    return 'Email = @identity';
  }
  request.input('identity', sql.VarChar(50), identity.tenDangNhap);
  return 'TenDangNhap = @identity';
};

const otpFingerprint = (otpHash) => crypto
  .createHash('sha256')
  .update(otpHash)
  .digest('hex');

const escapeHtml = (value) => String(value || '')
  .replaceAll('&', '&amp;')
  .replaceAll('<', '&lt;')
  .replaceAll('>', '&gt;')
  .replaceAll('"', '&quot;')
  .replaceAll("'", '&#039;');

// Ghi nhat ky dang nhap nhung khong lam hong luong xac thuc neu audit gap loi.
const writeLoginLog = async (pool, req, userId, ketQua, platform) => {
  if (!userId) return;

  try {
    await pool.request()
      .input('userId', sql.Int, userId)
      .input('diaChiIP', sql.VarChar, String(req.ip || req.socket?.remoteAddress || '').slice(0, 50) || null)
      .input('thietBi', sql.NVarChar, platform === 'web' ? 'Web' : 'Mobile')
      .input('ketQua', sql.NVarChar, ketQua)
      .query(`
        INSERT INTO NhatKyDangNhap (UserID, DiaChiIP, ThietBi, KetQua)
        VALUES (@userId, @diaChiIP, @thietBi, @ketQua)
      `);
  } catch (auditError) {
    console.error('[AUTH] Khong ghi duoc nhat ky dang nhap:', auditError.message);
  }
};

// ─── DANG KY ────────────────────────────────────────────────────────────────
// POST /api/auth/register
// Nhan: { tenDangNhap, matKhau, hoTen, loaiTaiKhoan?, ngaySinh?, gioiTinh?, ... }
const register = async (req, res, next) => {
  let transaction;
  try {
    const {
      tenDangNhap, matKhau, hoTen, ngaySinh, gioiTinh,
      email, soDienThoai, cccd, diaChi, nhomMau, benhNen, diUng,
      loaiTaiKhoan,
    } = req.body;
    const accountType = loaiTaiKhoan === undefined
      ? 'NguoiCaoTuoi'
      : loaiTaiKhoan;
    const normalizedEmail = typeof email === 'string'
      ? email.trim().toLowerCase()
      : '';

    // Chi hai vai tro Mobile nay duoc phep tu dang ky cong khai. Khong suy dien
    // VaiTroID tu gia tri bat ky do client gui.
    if (typeof accountType !== 'string'
      || !['NguoiCaoTuoi', 'NguoiChamSoc'].includes(accountType)) {
      return fail(
        res,
        'loaiTaiKhoan chi duoc la NguoiCaoTuoi hoac NguoiChamSoc',
        'INVALID_PUBLIC_ACCOUNT_TYPE',
        400
      );
    }

    if (typeof tenDangNhap !== 'string' || !tenDangNhap.trim()
      || typeof matKhau !== 'string' || !matKhau
      || typeof hoTen !== 'string' || !hoTen.trim()) {
      return fail(res, 'tenDangNhap, matKhau va hoTen la bat buoc', 'MISSING_FIELDS', 400);
    }
    if (matKhau.length < 6) {
      return fail(res, 'Mat khau phai co it nhat 6 ky tu', 'WEAK_PASSWORD', 400);
    }
    for (const [field, value] of Object.entries({ email, soDienThoai, cccd, diaChi, nhomMau })) {
      if (value != null && typeof value !== 'string') {
        return fail(res, `${field} phai la chuoi`, 'INVALID_FIELD_TYPE', 400);
      }
    }

    if (accountType === 'NguoiCaoTuoi') {
      if (!normalizedEmail) {
        return fail(res, 'Email la bat buoc voi nguoi cao tuoi', 'MISSING_ELDERLY_EMAIL', 400);
      }
      if (!ngaySinh || !gioiTinh) {
        return fail(res, 'ngaySinh va gioiTinh la bat buoc voi nguoi cao tuoi', 'MISSING_ELDERLY_FIELDS', 400);
      }
      const date = new Date(`${ngaySinh}T00:00:00Z`);
      if (!/^\d{4}-\d{2}-\d{2}$/.test(ngaySinh) || Number.isNaN(date.getTime())
        || date.toISOString().slice(0, 10) !== ngaySinh || date > new Date()
        || !['Nam', 'Nữ', 'Khác'].includes(gioiTinh)) {
        return fail(res, 'ngaySinh phai theo YYYY-MM-DD va gioiTinh la Nam, Nữ hoac Khác', 'INVALID_PROFILE', 400);
      }
    }

    if (accountType === 'NguoiChamSoc'
      && (typeof soDienThoai !== 'string' || !soDienThoai.trim())) {
      return fail(res, 'soDienThoai la bat buoc voi nguoi cham soc', 'MISSING_CAREGIVER_PHONE', 400);
    }
    if (normalizedEmail
      && (normalizedEmail.length > 100
        || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail))) {
      return fail(res, 'Email khong hop le', 'INVALID_EMAIL', 400);
    }

    const normalizedUsername = tenDangNhap.trim();
    const pool = await poolPromise;

    // Kiem tra trung ten dang nhap
    const checkExist = await pool.request()
      .input('tenDangNhap', sql.NVarChar, normalizedUsername)
      .query(`SELECT UserID FROM NguoiDung WHERE TenDangNhap = @tenDangNhap`);

    if (checkExist.recordset.length > 0) {
      return fail(res, 'Ten dang nhap da duoc su dung', 'USERNAME_TAKEN', 409);
    }

    if (normalizedEmail) {
      const emailExists = await pool.request()
        .input('email', sql.VarChar(100), normalizedEmail)
        .query('SELECT UserID FROM NguoiDung WHERE Email = @email');
      if (emailExists.recordset.length > 0) {
        return fail(res, 'Email da duoc tai khoan khac su dung', 'EMAIL_TAKEN', 409);
      }
    }

    // accountType da duoc whitelist nghiem ngat o tren.
    const vaiTroResult = await pool.request()
      .input('tenVaiTro', sql.NVarChar, accountType)
      .query(`SELECT VaiTroID FROM VaiTro WHERE TenVaiTro = @tenVaiTro`);

    if (vaiTroResult.recordset.length === 0) {
      return fail(res, 'Khong tim thay vai tro dang ky trong he thong', 'ROLE_NOT_FOUND', 500);
    }
    const vaiTroId = vaiTroResult.recordset[0].VaiTroID;

    // Hash mat khau (10 rounds)
    const matKhauHash = await bcrypt.hash(matKhau, 10);

    // Tai khoan va ho so tuong ung luon duoc tao trong cung transaction.
    transaction = new sql.Transaction(pool);
    await transaction.begin();
    const userResult = await new sql.Request(transaction)
      .input('tenDangNhap', sql.NVarChar, normalizedUsername)
      .input('matKhauHash', sql.NVarChar, matKhauHash)
      .input('hoTen', sql.NVarChar, hoTen.trim())
      .input('email', sql.VarChar(100), normalizedEmail || null)
      .input('soDienThoai', sql.NVarChar, soDienThoai || null)
      .input('vaiTroId', sql.Int, vaiTroId)
      .query(`
        INSERT INTO NguoiDung
          (TenDangNhap, MatKhauHash, HoTen, Email, SoDienThoai, VaiTroID, TrangThai, NgayTao)
        OUTPUT INSERTED.UserID AS userId
        VALUES
          (@tenDangNhap, @matKhauHash, @hoTen, @email, @soDienThoai, @vaiTroId, 'HoatDong', SYSDATETIME())
      `);

    const userId = userResult.recordset[0].userId;
    let linkedProfile;
    if (accountType === 'NguoiCaoTuoi') {
      const profileResult = await new sql.Request(transaction)
        .input('userId', sql.Int, userId)
        .input('hoTen', sql.NVarChar, hoTen.trim())
        .input('ngaySinh', sql.Date, ngaySinh)
        .input('gioiTinh', sql.NVarChar, gioiTinh)
        .input('cccd', sql.VarChar, cccd || null)
        .input('diaChi', sql.NVarChar, diaChi || null)
        .input('soDienThoai', sql.VarChar, soDienThoai || null)
        .input('nhomMau', sql.VarChar, nhomMau || null)
        .input('benhNen', sql.NVarChar, Array.isArray(benhNen) ? benhNen.join(', ') : benhNen || null)
        .input('diUng', sql.NVarChar, Array.isArray(diUng) ? diUng.join(', ') : diUng || null)
        .query(`
          INSERT INTO HoSoNguoiCaoTuoi
            (UserID, HoTen, NgaySinh, GioiTinh, CCCD, DiaChi, SoDienThoai,
             NhomMau, BenhNen, DiUng, NguoiTaoID)
          OUTPUT INSERTED.NguoiCaoTuoiID AS nguoiCaoTuoiId
          VALUES
            (@userId, @hoTen, @ngaySinh, @gioiTinh, @cccd, @diaChi,
             @soDienThoai, @nhomMau, @benhNen, @diUng, @userId)
        `);
      linkedProfile = {
        nguoiCaoTuoiId: profileResult.recordset[0].nguoiCaoTuoiId,
      };
    } else {
      const caregiverResult = await new sql.Request(transaction)
        .input('userId', sql.Int, userId)
        .input('hoTen', sql.NVarChar(100), hoTen.trim())
        .input('soDienThoai', sql.VarChar(15), soDienThoai.trim())
        .input('email', sql.VarChar(100), normalizedEmail || null)
        .input('diaChi', sql.NVarChar(255), diaChi?.trim() || null)
        .query(`
          INSERT INTO NguoiChamSoc
            (UserID, HoTen, SoDienThoai, Email, DiaChi)
          OUTPUT INSERTED.NguoiChamSocID AS nguoiChamSocId
          VALUES
            (@userId, @hoTen, @soDienThoai, @email, @diaChi)
        `);
      linkedProfile = {
        nguoiChamSocId: caregiverResult.recordset[0].nguoiChamSocId,
      };
    }

    await transaction.commit();
    transaction = null;
    return ok(
      res,
      { userId, loaiTaiKhoan: accountType, ...linkedProfile },
      'Dang ky tai khoan thanh cong',
      201
    );
  } catch (err) {
    if (transaction) {
      try { await transaction.rollback(); } catch (_) { /* SQL da ket thuc transaction */ }
    }
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
      await writeLoginLog(pool, req, user.UserID, 'ThatBai', platform);
      return fail(res, 'Tai khoan da bi khoa, lien he quan tri vien', 'ACCOUNT_LOCKED', 403);
    }

    // So sanh mat khau voi hash luu trong DB
    const matKhauDung = await bcrypt.compare(matKhau, user.MatKhauHash);
    if (!matKhauDung) {
      await writeLoginLog(pool, req, user.UserID, 'ThatBai', platform);
      return fail(res, 'Ten dang nhap hoac mat khau khong chinh xac', 'INVALID_CREDENTIALS', 401);
    }

    // Web quan tri chi danh cho QuanTriVien va BacSi.
    if (platform === 'web' && !['QuanTriVien', 'BacSi'].includes(user.TenVaiTro)) {
      await writeLoginLog(pool, req, user.UserID, 'ThatBai', platform);
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

    await writeLoginLog(pool, req, user.UserID, 'ThanhCong', platform);

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

// PUT /api/auth/me - Cap nhat thong tin tai khoan dang dang nhap
const updateMe = async (req, res, next) => {
  try {
    const { hoTen, email, soDienThoai } = req.body;

    if (!hoTen?.trim()) {
      return fail(res, 'Ho ten la bat buoc', 'MISSING_FULL_NAME', 400);
    }

    const pool = await poolPromise;
    const duplicateEmail = await pool.request()
      .input('userId', sql.Int, req.user.userId)
      .input('email', sql.VarChar, email?.trim() || null)
      .query(`
        SELECT UserID
        FROM NguoiDung
        WHERE Email = @email AND UserID <> @userId
      `);

    if (duplicateEmail.recordset.length > 0) {
      return fail(res, 'Email da duoc tai khoan khac su dung', 'EMAIL_TAKEN', 409);
    }

    const result = await pool.request()
      .input('userId', sql.Int, req.user.userId)
      .input('hoTen', sql.NVarChar, hoTen.trim())
      .input('email', sql.VarChar, email?.trim() || null)
      .input('soDienThoai', sql.VarChar, soDienThoai?.trim() || null)
      .query(`
        UPDATE NguoiDung
        SET HoTen = @hoTen, Email = @email, SoDienThoai = @soDienThoai
        WHERE UserID = @userId;

        SELECT nd.UserID AS userId, nd.TenDangNhap AS tenDangNhap,
          nd.HoTen AS hoTen, nd.Email AS email, nd.SoDienThoai AS soDienThoai,
          nd.TrangThai AS trangThai, nd.NgayTao AS ngayTao,
          nd.VaiTroID AS vaiTroId, vt.TenVaiTro AS tenVaiTro
        FROM NguoiDung nd
        INNER JOIN VaiTro vt ON nd.VaiTroID = vt.VaiTroID
        WHERE nd.UserID = @userId
      `);

    return ok(res, result.recordset[0], 'Cap nhat tai khoan thanh cong');
  } catch (err) {
    next(err);
  }
};

// POST /api/auth/change-password
const changePassword = async (req, res, next) => {
  try {
    const { matKhauHienTai, matKhauMoi } = req.body;

    if (!matKhauHienTai || !matKhauMoi) {
      return fail(res, 'Vui long nhap day du mat khau', 'MISSING_FIELDS', 400);
    }
    if (matKhauMoi.length < 6) {
      return fail(res, 'Mat khau moi phai co it nhat 6 ky tu', 'WEAK_PASSWORD', 400);
    }

    const pool = await poolPromise;
    const result = await pool.request()
      .input('userId', sql.Int, req.user.userId)
      .query(`SELECT MatKhauHash FROM NguoiDung WHERE UserID = @userId`);

    if (!result.recordset.length) {
      return fail(res, 'Khong tim thay tai khoan', 'USER_NOT_FOUND', 404);
    }

    const passwordMatches = await bcrypt.compare(matKhauHienTai, result.recordset[0].MatKhauHash);
    if (!passwordMatches) {
      return fail(res, 'Mat khau hien tai khong chinh xac', 'INVALID_CURRENT_PASSWORD', 400);
    }

    const newHash = await bcrypt.hash(matKhauMoi, 10);
    await pool.request()
      .input('userId', sql.Int, req.user.userId)
      .input('matKhauHash', sql.VarChar, newHash)
      .query(`UPDATE NguoiDung SET MatKhauHash = @matKhauHash WHERE UserID = @userId`);

    return ok(res, null, 'Doi mat khau thanh cong');
  } catch (err) {
    next(err);
  }
};

// GET /api/auth/login-history
const getLoginHistory = async (req, res, next) => {
  try {
    const pool = await poolPromise;
    const result = await pool.request()
      .input('userId', sql.Int, req.user.userId)
      .query(`
        SELECT TOP 50 LogID AS id, ThoiGianDangNhap AS thoiGianDangNhap,
          DiaChiIP AS diaChiIP, ThietBi AS thietBi, KetQua AS ketQua
        FROM NhatKyDangNhap
        WHERE UserID = @userId
        ORDER BY ThoiGianDangNhap DESC, LogID DESC
      `);

    return ok(res, result.recordset, 'Lay lich su dang nhap thanh cong');
  } catch (err) {
    next(err);
  }
};

// POST /api/auth/forgot-password
const forgotPassword = async (req, res, next) => {
  let transaction;
  try {
    const identity = resetIdentity(req.body);
    if (!identity.email && !identity.tenDangNhap) {
      return fail(res, 'Vui lòng nhập email hoặc tên đăng nhập', 'MISSING_RESET_IDENTITY', 400);
    }

    const pool = await poolPromise;
    transaction = new sql.Transaction(pool);
    await transaction.begin();
    const lookup = new sql.Request(transaction);
    const where = addResetIdentity(lookup, identity);
    const result = await lookup.query(`
      SELECT UserID, HoTen, Email, MaOTPHetHan, MaOTPGuiLuc,
        MaOTPCuaSoBatDau, SoLanGuiOTP
      FROM NguoiDung WITH (UPDLOCK, ROWLOCK)
      WHERE ${where}
    `);

    if (!result.recordset.length || !result.recordset[0].Email) {
      await transaction.commit();
      transaction = null;
      return ok(res, null, RESET_MESSAGE);
    }

    const user = result.recordset[0];
    const now = new Date();
    const lastSent = user.MaOTPGuiLuc ? new Date(user.MaOTPGuiLuc) : null;
    const currentWindow = user.MaOTPCuaSoBatDau ? new Date(user.MaOTPCuaSoBatDau) : null;

    if (lastSent && now.getTime() - lastSent.getTime() < 60 * 1000) {
      await transaction.rollback();
      transaction = null;
      return fail(res, 'Vui lòng đợi 1 phút trước khi gửi lại mã', 'OTP_RESEND_TOO_SOON', 429);
    }

    const windowIsActive = currentWindow
      && now.getTime() - currentWindow.getTime() < 15 * 60 * 1000;
    const sendCount = windowIsActive ? Number(user.SoLanGuiOTP || 0) : 0;
    if (sendCount >= 3) {
      await transaction.rollback();
      transaction = null;
      return fail(res, 'Vui lòng thử lại sau', 'OTP_RATE_LIMITED', 429);
    }

    const otp = crypto.randomInt(100000, 1000000).toString();
    const otpHash = await bcrypt.hash(otp, 10);
    const expiresAt = new Date(now.getTime() + 10 * 60 * 1000);
    const windowStart = windowIsActive ? currentWindow : now;

    await new sql.Request(transaction)
      .input('userId', sql.Int, user.UserID)
      .input('otpHash', sql.VarChar(255), otpHash)
      .input('expiresAt', sql.DateTime2, expiresAt)
      .input('sentAt', sql.DateTime2, now)
      .input('windowStart', sql.DateTime2, windowStart)
      .input('sendCount', sql.Int, sendCount + 1)
      .query(`
        UPDATE NguoiDung SET
          MaOTP = @otpHash,
          MaOTPHetHan = @expiresAt,
          MaOTPGuiLuc = @sentAt,
          MaOTPCuaSoBatDau = @windowStart,
          SoLanGuiOTP = @sendCount
        WHERE UserID = @userId
      `);

    await sendMail({
      to: user.Email,
      subject: 'Mã xác nhận đặt lại mật khẩu CareSenior',
      html: `
        <div style="font-family:Arial,sans-serif;max-width:560px;margin:auto;color:#172b36">
          <div style="background:#07856d;color:white;padding:20px 24px;border-radius:12px 12px 0 0">
            <h2 style="margin:0">CareSenior</h2>
          </div>
          <div style="border:1px solid #dce8e4;border-top:0;padding:24px;border-radius:0 0 12px 12px">
            <p>Xin chào <strong>${escapeHtml(user.HoTen)}</strong>,</p>
            <p>Mã xác nhận đặt lại mật khẩu của bạn là:</p>
            <div style="font-size:32px;font-weight:700;letter-spacing:8px;text-align:center;color:#07856d;padding:18px;background:#eef9f5;border-radius:10px">${otp}</div>
            <p>Mã này chỉ có hiệu lực trong <strong>10 phút</strong>. Không chia sẻ mã này với bất kỳ ai.</p>
            <p style="color:#667b84;font-size:13px">Nếu bạn không yêu cầu đặt lại mật khẩu, hãy bỏ qua email này.</p>
          </div>
        </div>
      `,
    });

    await transaction.commit();
    transaction = null;
    return ok(res, null, RESET_MESSAGE);
  } catch (err) {
    if (transaction) {
      try { await transaction.rollback(); } catch (_) { /* transaction da ket thuc */ }
    }
    next(err);
  }
};

// POST /api/auth/verify-otp
const verifyOtp = async (req, res, next) => {
  try {
    const identity = resetIdentity(req.body);
    const otp = typeof req.body.otp === 'string' ? req.body.otp.trim() : '';
    if ((!identity.email && !identity.tenDangNhap) || !/^\d{6}$/.test(otp)) {
      return fail(res, 'Thông tin xác nhận không hợp lệ', 'INVALID_OTP_INPUT', 400);
    }

    const pool = await poolPromise;
    const request = pool.request();
    const where = addResetIdentity(request, identity);
    const result = await request.query(`
      SELECT UserID, MaOTP, MaOTPHetHan
      FROM NguoiDung
      WHERE ${where}
    `);
    const user = result.recordset[0];
    const valid = user?.MaOTP
      && user.MaOTPHetHan
      && new Date(user.MaOTPHetHan) > new Date()
      && await bcrypt.compare(otp, user.MaOTP);
    if (!valid) {
      return fail(res, 'Mã OTP không đúng hoặc đã hết hạn', 'OTP_INVALID_OR_EXPIRED', 400);
    }

    const resetToken = jwt.sign(
      {
        userId: user.UserID,
        purpose: 'reset_password',
        otpFingerprint: otpFingerprint(user.MaOTP),
      },
      process.env.JWT_SECRET,
      { expiresIn: '10m' }
    );
    return ok(res, { resetToken }, 'Xác nhận OTP thành công');
  } catch (err) {
    next(err);
  }
};

// POST /api/auth/reset-password-with-token
const resetPasswordWithToken = async (req, res, next) => {
  try {
    const { resetToken, matKhauMoi } = req.body;
    if (typeof resetToken !== 'string' || !resetToken
      || typeof matKhauMoi !== 'string' || matKhauMoi.length < 6) {
      return fail(res, 'Token và mật khẩu mới tối thiểu 6 ký tự là bắt buộc', 'INVALID_RESET_INPUT', 400);
    }

    let payload;
    try {
      payload = jwt.verify(resetToken, process.env.JWT_SECRET);
    } catch (_) {
      return fail(res, 'Phiên đặt lại mật khẩu không hợp lệ hoặc đã hết hạn', 'INVALID_RESET_TOKEN', 400);
    }
    if (payload.purpose !== 'reset_password' || !payload.userId || !payload.otpFingerprint) {
      return fail(res, 'Phiên đặt lại mật khẩu không hợp lệ', 'INVALID_RESET_TOKEN', 400);
    }

    const pool = await poolPromise;
    const result = await pool.request()
      .input('userId', sql.Int, payload.userId)
      .query('SELECT MaOTP, MaOTPHetHan FROM NguoiDung WHERE UserID = @userId');
    const user = result.recordset[0];
    const tokenStillUsable = user?.MaOTP
      && user.MaOTPHetHan
      && new Date(user.MaOTPHetHan) > new Date()
      && otpFingerprint(user.MaOTP) === payload.otpFingerprint;
    if (!tokenStillUsable) {
      return fail(res, 'Phiên đặt lại mật khẩu đã được sử dụng hoặc hết hạn', 'RESET_TOKEN_ALREADY_USED', 400);
    }

    const passwordHash = await bcrypt.hash(matKhauMoi, 10);
    await pool.request()
      .input('userId', sql.Int, payload.userId)
      .input('passwordHash', sql.VarChar(255), passwordHash)
      .query(`
        UPDATE NguoiDung SET
          MatKhauHash = @passwordHash,
          MaOTP = NULL,
          MaOTPHetHan = NULL,
          MaOTPGuiLuc = NULL,
          MaOTPCuaSoBatDau = NULL,
          SoLanGuiOTP = 0
        WHERE UserID = @userId
      `);
    return ok(res, null, 'Đặt lại mật khẩu thành công');
  } catch (err) {
    next(err);
  }
};

module.exports = {
  register,
  login,
  me,
  updateMe,
  changePassword,
  getLoginHistory,
  forgotPassword,
  verifyOtp,
  resetPasswordWithToken,
};
