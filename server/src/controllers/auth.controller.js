const { AccountIdentityError, reserveAccountIdentifiers } = require('../utils/accountIdentity');
// controllers/auth.controller.js - Xu ly dang ky, dang nhap, lay thong tin ca nhan
const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const { poolPromise, sql } = require('../config/db');
const { sendMail } = require('../config/mailer');
const { ok, fail } = require('../utils/response');
const { validateElderlyProfile } = require('../utils/elderlyProfileValidation');
const { createRelativeRegistration } = require('../services/relativeRegistration.service');
const registerRelative = createRelativeRegistration({ poolPromise, sql });
const {
  GoogleIdentityError,
  verifyGoogleIdToken,
} = require('../services/googleAuth.service');

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

const PUBLIC_MOBILE_ROLES = new Set(['NguoiCaoTuoi', 'NguoiThan']);
const PUBLIC_MOBILE_REGISTER_ROLES = new Set(['NguoiCaoTuoi']);

const googleUsername = (subject) => `google_${crypto
  .createHash('sha256')
  .update(subject)
  .digest('hex')
  .slice(0, 32)}`;

const publicUser = (user) => ({
  userId: user.userId,
  tenDangNhap: user.tenDangNhap,
  hoTen: user.hoTen,
  email: user.email,
  soDienThoai: user.soDienThoai,
  vaiTroId: user.vaiTroId,
  tenVaiTro: user.tenVaiTro,
});

const createGoogleSession = async (pool, req, user, platform = 'mobile') => {
  const token = jwt.sign(
    {
      userId: user.userId,
      vaiTroId: user.vaiTroId,
      tenVaiTro: user.tenVaiTro,
      sessionVersion: 2,
    },
    process.env.JWT_SECRET,
    { expiresIn: process.env.JWT_EXPIRES_IN || '7d' },
  );
  await pool.request()
    .input('userId', sql.Int, user.userId)
    .query('UPDATE NguoiDung SET LanDangNhapCuoi=SYSDATETIME() WHERE UserID=@userId');
  await writeLoginLog(pool, req, user.userId, 'ThanhCong', platform);
  return { token, user: publicUser(user) };
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

    // Chi nguoi cao tuoi duoc tu dang ky tren Mobile. Khong suy dien
    // VaiTroID tu gia tri bat ky do client gui.
    if (typeof accountType !== 'string'
      || !PUBLIC_MOBILE_REGISTER_ROLES.has(accountType)) {
      return fail(
        res,
        'Chi nguoi cao tuoi duoc tu dang ky tren Mobile',
        'INVALID_PUBLIC_ACCOUNT_TYPE',
        400
      );
    }

    if (typeof tenDangNhap !== 'string' || !tenDangNhap.trim()
      || typeof matKhau !== 'string' || !matKhau) {
      return fail(res, 'Tên đăng nhập và mật khẩu là bắt buộc', 'MISSING_FIELDS', 400);
    }
    if (matKhau.length < 6) {
      return fail(res, 'Mat khau phai co it nhat 6 ky tu', 'WEAK_PASSWORD', 400);
    }
    for (const [field, value] of Object.entries({ email, soDienThoai, cccd, diaChi, nhomMau })) {
      if (value != null && typeof value !== 'string') {
        return fail(res, `${field} phai la chuoi`, 'INVALID_FIELD_TYPE', 400);
      }
    }

    if (!normalizedEmail) {
      return fail(res, 'Email la bat buoc de khoi phuc mat khau', 'MISSING_EMAIL', 400);
    }

    const profileValidation = validateElderlyProfile(req.body);
    if (profileValidation.error) {
      return fail(res, profileValidation.error.message,
        `INVALID_${profileValidation.error.field.toUpperCase()}`, 422);
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
        return fail(res, 'Email đã được sử dụng', 'EMAIL_TAKEN', 409);
      }
    }

    if (typeof soDienThoai === 'string' && soDienThoai.trim()) {
      const phoneExists = await pool.request()
        .input('phone', sql.VarChar(15), soDienThoai.trim())
        .query(`SELECT 1 AS used WHERE
          EXISTS(SELECT 1 FROM NguoiDung WHERE SoDienThoai=@phone)
          OR EXISTS(SELECT 1 FROM HoSoNguoiCaoTuoi WHERE SoDienThoai=@phone)
          OR EXISTS(SELECT 1 FROM NguoiChamSoc WHERE SoDienThoai=@phone)`);
      if (phoneExists.recordset.length) {
        return fail(res, 'Số điện thoại đã được sử dụng', 'PHONE_TAKEN', 409);
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
    await reserveAccountIdentifiers(transaction, sql, { phone: soDienThoai, username: normalizedUsername });
    const caregiverMatch = await new sql.Request(transaction)
      .input('email', sql.VarChar(100), normalizedEmail)
      .query(`
        SELECT TOP (2) NguoiChamSocID AS id, UserID AS userId
        FROM NguoiChamSoc WITH (UPDLOCK, HOLDLOCK)
        WHERE LOWER(LTRIM(RTRIM(Email)))=@email
        ORDER BY NguoiChamSocID
      `);
    if (accountType !== 'NguoiChamSoc' && caregiverMatch.recordset.length) {
      await transaction.rollback();
      transaction = null;
      return fail(
        res,
        'Email đã được sử dụng',
        'EMAIL_TAKEN_BY_CAREGIVER',
        409,
      );
    }

    let existingCaregiver = null;
    if (accountType === 'NguoiChamSoc') {
      if (caregiverMatch.recordset.length > 1) {
        await transaction.rollback();
        transaction = null;
        return fail(res, 'Email dang gan voi nhieu ho so nguoi cham soc', 'DUPLICATE_CAREGIVER_EMAIL', 409);
      }
      existingCaregiver = caregiverMatch.recordset[0] || null;
      if (existingCaregiver?.userId) {
        await transaction.rollback();
        transaction = null;
        return fail(res, 'Email da duoc lien ket voi tai khoan nguoi cham soc', 'EMAIL_TAKEN', 409);
      }
    }

    const userResult = await new sql.Request(transaction)
      .input('tenDangNhap', sql.NVarChar, normalizedUsername)
      .input('matKhauHash', sql.NVarChar, matKhauHash)
      .input('hoTen', sql.NVarChar, profileValidation.value.hoTen)
      .input('email', sql.VarChar(100), normalizedEmail || null)
      .input('soDienThoai', sql.NVarChar, profileValidation.value.soDienThoai)
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
        .input('hoTen', sql.NVarChar, profileValidation.value.hoTen)
        .input('ngaySinh', sql.Date, ngaySinh)
        .input('gioiTinh', sql.NVarChar, gioiTinh)
        .input('cccd', sql.VarChar, profileValidation.value.cccd)
        .input('diaChi', sql.NVarChar, profileValidation.value.diaChi)
        .input('soDienThoai', sql.VarChar, profileValidation.value.soDienThoai)
        .input('nhomMau', sql.VarChar, profileValidation.value.nhomMau)
        .input('benhNen', sql.NVarChar, profileValidation.value.benhNen)
        .input('diUng', sql.NVarChar, profileValidation.value.diUng)
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
      const caregiverRequest = new sql.Request(transaction)
        .input('userId', sql.Int, userId)
        .input('hoTen', sql.NVarChar(100), hoTen.trim())
        .input('soDienThoai', sql.VarChar(15), soDienThoai.trim())
        .input('email', sql.VarChar(100), normalizedEmail)
        .input('diaChi', sql.NVarChar(255), diaChi?.trim() || null);
      const caregiverResult = existingCaregiver
        ? await caregiverRequest
          .input('caregiverId', sql.Int, existingCaregiver.id)
          .query(`
            UPDATE NguoiChamSoc
            SET UserID=@userId, HoTen=@hoTen, SoDienThoai=@soDienThoai,
                Email=@email, DiaChi=COALESCE(@diaChi, DiaChi)
            OUTPUT INSERTED.NguoiChamSocID AS nguoiChamSocId
            WHERE NguoiChamSocID=@caregiverId AND UserID IS NULL
          `)
        : await caregiverRequest.query(`
            INSERT INTO NguoiChamSoc
              (UserID, HoTen, SoDienThoai, Email, DiaChi)
            OUTPUT INSERTED.NguoiChamSocID AS nguoiChamSocId
            VALUES
              (@userId, @hoTen, @soDienThoai, @email, @diaChi)
          `);
      if (!caregiverResult.recordset.length) {
        throw new Error('Khong the lien ket ho so nguoi cham soc');
      }
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
    if (err instanceof AccountIdentityError) return fail(res, err.message, err.errorCode, err.statusCode);
    next(err);
  }
};

// Dang ky nguoi cham soc tren Web. Chi Admin duyet va phan cong NCT sau khi
// kiem tra thong tin; client khong duoc tu chon vai tro hay kich hoat tai khoan.
const registerCaregiver = async (req, res, next) => {
  let transaction;
  try {
    const { tenDangNhap, matKhau, hoTen, email, soDienThoai } = req.body || {};
    if ([tenDangNhap, matKhau, hoTen, email, soDienThoai].some((value) => typeof value !== 'string' || !value.trim())) {
      return fail(res, 'Vui lòng nhập đầy đủ tên đăng nhập, mật khẩu, họ tên, email và số điện thoại', 'MISSING_FIELDS', 400);
    }

    const username = tenDangNhap.trim();
    const name = hoTen.trim();
    const normalizedEmail = email.trim().toLowerCase();
    const phone = soDienThoai.trim();
    if (!/^[A-Za-z0-9._-]{3,50}$/.test(username) || name.length > 100) {
      return fail(res, 'Tên đăng nhập cần 3–50 ký tự (chữ, số, dấu . _ -); họ tên tối đa 100 ký tự', 'INVALID_NAME', 400);
    }
    if (matKhau.length < 6 || matKhau.length > 128) {
      return fail(res, 'Mật khẩu phải có từ 6 đến 128 ký tự', 'WEAK_PASSWORD', 400);
    }
    if (normalizedEmail.length > 100 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail)) {
      return fail(res, 'Email không hợp lệ', 'INVALID_EMAIL', 400);
    }
    if (!/^0\d{9,10}$/.test(phone)) {
      return fail(res, 'Số điện thoại phải có 10–11 chữ số và bắt đầu bằng 0', 'INVALID_PHONE', 400);
    }

    const pool = await poolPromise;
    const hash = await bcrypt.hash(matKhau, 10);
    transaction = new sql.Transaction(pool);
    await transaction.begin(sql.ISOLATION_LEVEL.SERIALIZABLE);

    const existing = await new sql.Request(transaction)
      .input('username', sql.VarChar(50), username)
      .input('email', sql.VarChar(100), normalizedEmail)
      .input('phone', sql.VarChar(15), phone)
      .query(`
        SELECT TOP (1)
          CASE WHEN TenDangNhap=@username THEN 'USERNAME_TAKEN'
               WHEN LOWER(Email)=@email THEN 'EMAIL_TAKEN'
               ELSE 'PHONE_TAKEN' END AS reason
        FROM NguoiDung WITH (UPDLOCK, HOLDLOCK)
        WHERE TenDangNhap=@username OR LOWER(Email)=@email OR SoDienThoai=@phone
        ORDER BY CASE WHEN TenDangNhap=@username THEN 0 WHEN LOWER(Email)=@email THEN 1 ELSE 2 END
      `);
    if (existing.recordset.length) {
      const reason = existing.recordset[0].reason;
      await transaction.rollback();
      transaction = null;
      const messages = {
        USERNAME_TAKEN: 'Tên đăng nhập đã được sử dụng',
        EMAIL_TAKEN: 'Email đã được sử dụng',
        PHONE_TAKEN: 'Số điện thoại đã được sử dụng',
      };
      return fail(res, messages[reason], reason, 409);
    }

    // Khong tu dong chiem ho so da duoc Admin tao: ho so do co the da
    // duoc phan cong NCT va can Admin xac minh chu so huu truoc khi lien ket.
    const profileExists = await new sql.Request(transaction)
      .input('email', sql.VarChar(100), normalizedEmail)
      .input('phone', sql.VarChar(15), phone)
      .query(`
        SELECT TOP (1) NguoiChamSocID
        FROM NguoiChamSoc WITH (UPDLOCK, HOLDLOCK)
        WHERE LOWER(Email)=@email OR SoDienThoai=@phone
      `);
    if (profileExists.recordset.length) {
      await transaction.rollback();
      transaction = null;
      return fail(res, 'Email hoặc số điện thoại đã có trong hồ sơ người chăm sóc. Vui lòng liên hệ quản trị viên để tạo tài khoản.', 'CAREGIVER_PROFILE_EXISTS', 409);
    }

    const role = await new sql.Request(transaction)
      .query("SELECT VaiTroID FROM VaiTro WHERE TenVaiTro=N'NguoiChamSoc'");
    if (!role.recordset.length) throw new Error('Thieu vai tro NguoiChamSoc trong co so du lieu');

    const created = await new sql.Request(transaction)
      .input('username', sql.VarChar(50), username)
      .input('hash', sql.VarChar(255), hash)
      .input('name', sql.NVarChar(100), name)
      .input('email', sql.VarChar(100), normalizedEmail)
      .input('phone', sql.VarChar(15), phone)
      .input('roleId', sql.Int, role.recordset[0].VaiTroID)
      .query(`
        INSERT INTO NguoiDung
          (TenDangNhap, MatKhauHash, HoTen, Email, SoDienThoai, VaiTroID, TrangThai)
        OUTPUT INSERTED.UserID AS userId
        VALUES (@username, @hash, @name, @email, @phone, @roleId, N'ChoDuyet')
      `);
    const userId = created.recordset[0].userId;
    await new sql.Request(transaction)
      .input('userId', sql.Int, userId)
      .input('name', sql.NVarChar(100), name)
      .input('email', sql.VarChar(100), normalizedEmail)
      .input('phone', sql.VarChar(15), phone)
      .query(`
        INSERT INTO NguoiChamSoc (UserID, HoTen, Email, SoDienThoai)
        VALUES (@userId, @name, @email, @phone)
      `);

    await transaction.commit();
    transaction = null;
    return ok(res, null, 'Đăng ký thành công. Vui lòng chờ quản trị viên duyệt tài khoản.', 201);
  } catch (err) {
    if (transaction) {
      try { await transaction.rollback(); } catch (_) { /* Transaction da ket thuc. */ }
    }
    if (err.number === 2601 || err.number === 2627) {
      return fail(res, 'Tên đăng nhập, email hoặc số điện thoại đã được sử dụng', 'DUPLICATE_ACCOUNT', 409);
    }
    if (err instanceof AccountIdentityError) return fail(res, err.message, err.errorCode, err.statusCode);
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
    const identity = typeof tenDangNhap === 'string' ? tenDangNhap.trim() : '';

    if (!identity || !matKhau) {
      return fail(res, 'Vui lòng nhập tên đăng nhập, email hoặc số điện thoại và mật khẩu', 'MISSING_FIELDS', 400);
    }

    const pool = await poolPromise;

    // Mot dinh danh co the trung giua username va SDT cua hai tai khoan.
    // Khong tu chon mot tai khoan trong truong hop mo ho.
    const result = await pool.request()
      .input('tenDangNhap', sql.NVarChar(100), identity)
      .input('email', sql.VarChar(100), identity.toLowerCase())
      .input('phone', sql.VarChar(100), identity)
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
          OR LOWER(LTRIM(RTRIM(nd.Email))) = @email
          OR LTRIM(RTRIM(nd.SoDienThoai)) = @phone
      `);

    if (result.recordset.length !== 1) {
      return fail(res, 'Tên đăng nhập, email, số điện thoại hoặc mật khẩu không chính xác', 'INVALID_CREDENTIALS', 401);
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
      return fail(res, 'Tên đăng nhập, email, số điện thoại hoặc mật khẩu không chính xác', 'INVALID_CREDENTIALS', 401);
    }

    if (user.TrangThai === 'ChoDuyet') {
      await writeLoginLog(pool, req, user.UserID, 'ThatBai', platform);
      return fail(res, 'Tài khoản đang chờ quản trị viên duyệt', 'ACCOUNT_PENDING_APPROVAL', 403);
    }

    // Web workspaces share the same identity; resource permissions remain role-scoped.
    if (platform === 'web' && !['QuanTriVien', 'NguoiChamSoc', 'NguoiThan', 'NguoiCaoTuoi'].includes(user.TenVaiTro)) {
      await writeLoginLog(pool, req, user.UserID, 'ThatBai', platform);
      return fail(
        res,
        'Tài khoản này không có quyền truy cập hệ thống Web, vui lòng sử dụng ứng dụng Mobile',
        'WEB_ACCESS_DENIED',
        403
      );
    }
    if (platform !== 'web' && (platform !== 'mobile' || !PUBLIC_MOBILE_ROLES.has(user.TenVaiTro))) {
      await writeLoginLog(pool, req, user.UserID, 'ThatBai', platform);
      return fail(res, 'Tai khoan nay khong duoc dang nhap tren Mobile', 'MOBILE_ACCESS_DENIED', 403);
    }

    // Tao JWT chua thong tin can thiet
    const token = jwt.sign(
      {
        userId: user.UserID,
        vaiTroId: user.VaiTroID,
        tenVaiTro: user.TenVaiTro,
        sessionVersion: 2,
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
    if (err instanceof AccountIdentityError) return fail(res, err.message, err.errorCode, err.statusCode);
    next(err);
  }
};

// POST /api/auth/google - Google Sign-In chi danh cho ung dung Mobile.
// Lan dau voi email moi: tra requiresRegistration de Mobile thu thap vai tro
// va cac truong ho so bat buoc, sau do gui lai cung Google ID token.
const googleLogin = async (req, res, next) => {
  let transaction;
  try {
    let identity;
    try {
      identity = await verifyGoogleIdToken(req.body?.idToken);
    } catch (error) {
      if (error instanceof GoogleIdentityError) {
        return fail(res, error.message, error.code, error.statusCode);
      }
      throw error;
    }

    const pool = await poolPromise;
    const lookup = (bySubject) => pool.request()
      .input('googleSubject', sql.VarChar(255), identity.subject)
      .input('email', sql.VarChar(100), identity.email)
      .query(`
        SELECT nd.UserID AS userId, nd.TenDangNhap AS tenDangNhap,
          nd.HoTen AS hoTen, nd.Email AS email, nd.SoDienThoai AS soDienThoai,
          nd.VaiTroID AS vaiTroId, nd.TrangThai AS trangThai,
          nd.GoogleSubject AS googleSubject, vt.TenVaiTro AS tenVaiTro
        FROM NguoiDung nd
        INNER JOIN VaiTro vt ON vt.VaiTroID=nd.VaiTroID
        WHERE ${bySubject ? 'nd.GoogleSubject=@googleSubject' : 'nd.Email=@email'}
      `);

    // A returning Google identity is always resolved by subject first. Email
    // is checked only to prevent duplicate registration / require safe linking.
    let existing = await lookup(true);
    if (!existing.recordset.length) existing = await lookup(false);

    const distinctUsers = new Set(existing.recordset.map((row) => row.userId));
    if (distinctUsers.size > 1) {
      return fail(
        res,
        'Tai khoan Google dang xung dot voi mot email da lien ket. Vui long lien he quan tri vien.',
        'GOOGLE_ACCOUNT_CONFLICT',
        409,
      );
    }

    if (existing.recordset.length) {
      const user = existing.recordset[0];
      if (user.googleSubject && user.googleSubject !== identity.subject) {
        return fail(
          res,
          'Email nay da lien ket voi mot tai khoan Google khac',
          'GOOGLE_ACCOUNT_CONFLICT',
          409,
        );
      }
      if (user.trangThai === 'KhoaTaiKhoan') {
        await writeLoginLog(pool, req, user.userId, 'ThatBai', 'mobile');
        return fail(res, 'Tai khoan da bi khoa, lien he quan tri vien', 'ACCOUNT_LOCKED', 403);
      }
      if (!PUBLIC_MOBILE_ROLES.has(user.tenVaiTro)) {
        await writeLoginLog(pool, req, user.userId, 'ThatBai', 'mobile');
        return fail(
          res,
          'Tai khoan nay khong ho tro tren Mobile, vui long dung he thong Web',
          'MOBILE_ACCESS_DENIED',
          403,
        );
      }

      if (!user.googleSubject) {
        return fail(res,
          'Google chưa liên kết với CareSenior. Hãy đăng nhập bằng mật khẩu trên Web, mở Hồ sơ → Liên kết Google và xác minh mật khẩu. Sau đó có thể đăng nhập Google trên cả Web và Mobile.',
          'GOOGLE_LINK_REQUIRED', 409);
      }

      return ok(
        res,
        await createGoogleSession(pool, req, user),
        'Dang nhap Google thanh cong',
      );
    }

    const accountType = req.body?.loaiTaiKhoan;
    if (accountType == null || accountType === '') {
      return ok(res, {
        requiresRegistration: true,
        googleProfile: {
          hoTen: identity.displayName,
          email: identity.email,
          anhDaiDien: identity.photoUrl,
        },
      }, 'Vui long bo sung thong tin de tao tai khoan');
    }
    if (typeof accountType !== 'string' || !PUBLIC_MOBILE_REGISTER_ROLES.has(accountType)) {
      return fail(
        res,
        'Chi nguoi cao tuoi duoc tao tai khoan qua Mobile',
        'INVALID_PUBLIC_ACCOUNT_TYPE',
        400,
      );
    }

    const hoTen = typeof req.body?.hoTen === 'string' && req.body.hoTen.trim()
      ? req.body.hoTen.trim()
      : identity.displayName;
    const soDienThoai = typeof req.body?.soDienThoai === 'string'
      ? req.body.soDienThoai.trim()
      : '';
    const ngaySinh = req.body?.ngaySinh;
    const gioiTinh = req.body?.gioiTinh;
    if (!hoTen || hoTen.length > 100) {
      return fail(res, 'Ho ten khong hop le', 'INVALID_NAME', 400);
    }
    if (soDienThoai.length < 8 || soDienThoai.length > 15
      || !/^[0-9+]+$/.test(soDienThoai)) {
      return fail(res, 'So dien thoai phai co tu 8 den 15 chu so', 'INVALID_PHONE', 400);
    }
    if (accountType === 'NguoiCaoTuoi') {
      const birthDate = typeof ngaySinh === 'string'
        ? new Date(`${ngaySinh}T00:00:00Z`)
        : new Date(NaN);
      if (!/^\d{4}-\d{2}-\d{2}$/.test(ngaySinh || '')
        || Number.isNaN(birthDate.getTime())
        || birthDate.toISOString().slice(0, 10) !== ngaySinh
        || birthDate > new Date()
        || !['Nam', 'Nữ', 'Khác'].includes(gioiTinh)) {
        return fail(
          res,
          'Ngay sinh va gioi tinh cua nguoi cao tuoi khong hop le',
          'INVALID_PROFILE',
          400,
        );
      }
    }

    const roleResult = await pool.request()
      .input('tenVaiTro', sql.NVarChar(50), accountType)
      .query('SELECT VaiTroID AS vaiTroId FROM VaiTro WHERE TenVaiTro=@tenVaiTro');
    if (!roleResult.recordset.length) {
      return fail(res, 'Khong tim thay vai tro dang ky', 'ROLE_NOT_FOUND', 500);
    }
    const vaiTroId = roleResult.recordset[0].vaiTroId;
    const username = googleUsername(identity.subject);
    const unusablePasswordHash = await bcrypt.hash(crypto.randomBytes(32).toString('hex'), 10);

    transaction = new sql.Transaction(pool);
    await transaction.begin();
    const duplicate = await new sql.Request(transaction)
      .input('googleSubject', sql.VarChar(255), identity.subject)
      .input('email', sql.VarChar(100), identity.email)
      .query(`
        SELECT UserID FROM NguoiDung WITH (UPDLOCK,HOLDLOCK)
        WHERE GoogleSubject=@googleSubject OR Email=@email
      `);
    if (duplicate.recordset.length) {
      await transaction.rollback();
      transaction = null;
      return fail(
        res,
        'Tai khoan vua duoc tao hoac lien ket o phien khac. Vui long dang nhap lai.',
        'GOOGLE_ACCOUNT_ALREADY_EXISTS',
        409,
      );
    }

    const caregiverMatch = await new sql.Request(transaction)
      .input('email', sql.VarChar(100), identity.email.toLowerCase())
      .query(`
        SELECT TOP (2) NguoiChamSocID AS id, UserID AS userId
        FROM NguoiChamSoc WITH (UPDLOCK, HOLDLOCK)
        WHERE LOWER(LTRIM(RTRIM(Email)))=@email
        ORDER BY NguoiChamSocID
      `);
    if (accountType !== 'NguoiChamSoc' && caregiverMatch.recordset.length) {
      await transaction.rollback();
      transaction = null;
      return fail(
        res,
        'Email da duoc dung cho ho so nguoi cham soc',
        'EMAIL_TAKEN_BY_CAREGIVER',
        409,
      );
    }

    let existingCaregiver = null;
    if (accountType === 'NguoiChamSoc') {
      if (caregiverMatch.recordset.length > 1 || caregiverMatch.recordset[0]?.userId) {
        await transaction.rollback();
        transaction = null;
        return fail(
          res,
          'Email nguoi cham soc da duoc lien ket hoac bi trung. Vui long lien he quan tri vien.',
          'CAREGIVER_EMAIL_CONFLICT',
          409,
        );
      }
      existingCaregiver = caregiverMatch.recordset[0] || null;
    }

    const userResult = await new sql.Request(transaction)
      .input('tenDangNhap', sql.VarChar(50), username)
      .input('matKhauHash', sql.VarChar(255), unusablePasswordHash)
      .input('hoTen', sql.NVarChar(100), hoTen)
      .input('email', sql.VarChar(100), identity.email)
      .input('soDienThoai', sql.VarChar(15), soDienThoai)
      .input('photoUrl', sql.NVarChar(255), identity.photoUrl?.slice(0, 255) || null)
      .input('googleSubject', sql.VarChar(255), identity.subject)
      .input('vaiTroId', sql.Int, vaiTroId)
      .query(`
        INSERT INTO NguoiDung
          (TenDangNhap,MatKhauHash,HoTen,Email,SoDienThoai,AnhDaiDien,
           GoogleSubject,VaiTroID,TrangThai,NgayTao)
        OUTPUT INSERTED.UserID AS userId
        VALUES
          (@tenDangNhap,@matKhauHash,@hoTen,@email,@soDienThoai,@photoUrl,
           @googleSubject,@vaiTroId,N'HoatDong',SYSDATETIME())
      `);
    const userId = userResult.recordset[0].userId;

    if (accountType === 'NguoiCaoTuoi') {
      await new sql.Request(transaction)
        .input('userId', sql.Int, userId)
        .input('hoTen', sql.NVarChar(100), hoTen)
        .input('ngaySinh', sql.Date, ngaySinh)
        .input('gioiTinh', sql.NVarChar(10), gioiTinh)
        .input('soDienThoai', sql.VarChar(15), soDienThoai)
        .query(`
          INSERT INTO HoSoNguoiCaoTuoi
            (UserID,HoTen,NgaySinh,GioiTinh,SoDienThoai,NguoiTaoID)
          VALUES (@userId,@hoTen,@ngaySinh,@gioiTinh,@soDienThoai,@userId)
        `);
    } else {
      const caregiverRequest = new sql.Request(transaction)
        .input('userId', sql.Int, userId)
        .input('hoTen', sql.NVarChar(100), hoTen)
        .input('soDienThoai', sql.VarChar(15), soDienThoai)
        .input('email', sql.VarChar(100), identity.email.toLowerCase());
      if (existingCaregiver) {
        const linked = await caregiverRequest
          .input('caregiverId', sql.Int, existingCaregiver.id)
          .query(`
            UPDATE NguoiChamSoc
            SET UserID=@userId, HoTen=@hoTen, SoDienThoai=@soDienThoai, Email=@email
            OUTPUT INSERTED.NguoiChamSocID AS id
            WHERE NguoiChamSocID=@caregiverId AND UserID IS NULL
          `);
        if (!linked.recordset.length) throw new Error('Khong the lien ket ho so nguoi cham soc');
      } else {
        await caregiverRequest.query(`
            INSERT INTO NguoiChamSoc (UserID,HoTen,SoDienThoai,Email)
            VALUES (@userId,@hoTen,@soDienThoai,@email)
          `);
      }
    }
    await transaction.commit();
    transaction = null;

    const user = {
      userId,
      tenDangNhap: username,
      hoTen,
      email: identity.email,
      soDienThoai,
      vaiTroId,
      tenVaiTro: accountType,
    };
    return ok(
      res,
      await createGoogleSession(pool, req, user),
      'Tao tai khoan va dang nhap Google thanh cong',
      201,
    );
  } catch (error) {
    if (transaction) {
      try { await transaction.rollback(); } catch (_) { /* transaction da ket thuc */ }
    }
    if ([2601, 2627].includes(error.number)) {
      return fail(
        res,
        'Email hoac tai khoan Google da duoc su dung',
        'GOOGLE_ACCOUNT_ALREADY_EXISTS',
        409,
      );
    }
    next(error);
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
  let transaction;
  try {
    const { hoTen, email, soDienThoai } = req.body;
    const normalizedEmail = typeof email === 'string' ? email.trim().toLowerCase() : '';

    if (!hoTen?.trim()) {
      return fail(res, 'Ho ten la bat buoc', 'MISSING_FULL_NAME', 400);
    }
    if (!normalizedEmail) {
      return fail(res, 'Email la bat buoc de khoi phuc mat khau', 'MISSING_EMAIL', 400);
    }
    if (normalizedEmail.length > 100 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail)) {
      return fail(res, 'Email khong hop le', 'INVALID_EMAIL', 400);
    }

    const pool = await poolPromise;
    transaction = new sql.Transaction(pool);
    await transaction.begin();
    await reserveAccountIdentifiers(transaction, sql, { userId: req.user.userId, phone: soDienThoai });
    const duplicateEmail = await new sql.Request(transaction)
      .input('userId', sql.Int, req.user.userId)
      .input('email', sql.VarChar, normalizedEmail)
      .query(`
        SELECT UserID
        FROM NguoiDung
        WHERE Email = @email AND UserID <> @userId
        UNION ALL
        SELECT COALESCE(UserID, -1) AS UserID
        FROM NguoiChamSoc
        WHERE LOWER(LTRIM(RTRIM(Email)))=@email
          AND (UserID IS NULL OR UserID<>@userId)
      `);

    if (duplicateEmail.recordset.length > 0) {
      await transaction.rollback(); transaction = null;
      return fail(res, 'Email da duoc tai khoan khac su dung', 'EMAIL_TAKEN', 409);
    }

    const result = await new sql.Request(transaction)
      .input('userId', sql.Int, req.user.userId)
      .input('hoTen', sql.NVarChar, hoTen.trim())
      .input('email', sql.VarChar, normalizedEmail)
      .input('soDienThoai', sql.VarChar, soDienThoai?.trim() || null)
      .query(`
        UPDATE NguoiDung
        SET HoTen = @hoTen, Email = @email, SoDienThoai = @soDienThoai
        WHERE UserID = @userId;

        UPDATE NguoiChamSoc
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

    await transaction.commit(); transaction = null;
    return ok(res, result.recordset[0], 'Cap nhat tai khoan thanh cong');
  } catch (err) {
    if (transaction) { try { await transaction.rollback(); } catch (_) { /* Already closed. */ } }
    if (err instanceof AccountIdentityError) return fail(res, err.message, err.errorCode, err.statusCode);
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

const { createGoogleWebController } = require('./googleWeb.controller');
const googleWeb = createGoogleWebController({ poolPromise, sql, verifyGoogleIdToken,
  createSession: (pool, req, user) => createGoogleSession(pool, req, user, 'web') });

module.exports = {
  googleWeb,
  register,
  registerCaregiver,
  registerRelative,
  login,
  googleLogin,
  me,
  updateMe,
  changePassword,
  getLoginHistory,
  forgotPassword,
  verifyOtp,
  resetPasswordWithToken,
};
