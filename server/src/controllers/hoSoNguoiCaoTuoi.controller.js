// controllers/hoSoNguoiCaoTuoi.controller.js - CRUD ho so nguoi cao tuoi
// Bang: HoSoNguoiCaoTuoi (NguoiCaoTuoiID, HoTen, NgaySinh, GioiTinh, CCCD,
//       DiaChi, SoDienThoai, NhomMau, BenhNen, DiUng, TrangThai, NguoiTaoID, NgayTao)
const { poolPromise, sql } = require('../config/db');
const { ok, fail } = require('../utils/response');
const { scopedWhere } = require('../middlewares/mobile-scope.middleware');
const { validateElderlyProfile } = require('../utils/elderlyProfileValidation');
const { validateElderlyPassword } = require('../utils/elderlyAccountValidation');
const { createElderlyProfile, ElderlyCreationError } = require('../services/elderlyCreation.service');
const bcrypt = require('bcryptjs');

// GET /api/elderly/me - chi tai khoan NguoiCaoTuoi co ho so lien ket.
const getMe = async (req, res, next) => {
  try {
    const pool = await poolPromise;
    const result = await pool.request().input('userId', sql.Int, req.user.userId).query(`
      SELECT nct.NguoiCaoTuoiID AS id, nct.UserID AS userId,
        nct.HoTen AS hoTen, nct.NgaySinh AS ngaySinh, nct.GioiTinh AS gioiTinh,
        nct.CCCD AS cccd, nct.DiaChi AS diaChi, nct.SoDienThoai AS soDienThoai,
        nd.Email AS email,
        nct.NhomMau AS nhomMau, nct.BenhNen AS benhNen, nct.DiUng AS diUng,
        nct.TrangThai AS trangThai, nct.NgayTao AS ngayTao,
        ncsMain.NguoiChamSocID AS nguoiChamSocId,
        ncsMain.HoTen AS nguoiChamSocTen
      FROM HoSoNguoiCaoTuoi nct
      JOIN NguoiDung nd ON nd.UserID=nct.UserID
      OUTER APPLY (
        SELECT TOP 1 ncs.NguoiChamSocID, ncs.HoTen
        FROM NguoiCaoTuoi_NguoiChamSoc lk
        JOIN NguoiChamSoc ncs ON ncs.NguoiChamSocID = lk.NguoiChamSocID
        WHERE lk.NguoiCaoTuoiID = nct.NguoiCaoTuoiID
          AND lk.LaChinh = 1
          AND lk.NgayBatDau <= CAST(DATEADD(HOUR,7,SYSUTCDATETIME()) AS DATE)
          AND (lk.NgayKetThuc IS NULL OR lk.NgayKetThuc > CAST(DATEADD(HOUR,7,SYSUTCDATETIME()) AS DATE))
        ORDER BY lk.ID DESC
      ) ncsMain
      WHERE nct.UserID = @userId
    `);
    if (!result.recordset.length) {
      return fail(res, 'Tai khoan chua co ho so nguoi cao tuoi lien ket', 'ELDERLY_PROFILE_NOT_FOUND', 404);
    }
    return ok(res, result.recordset[0], 'Lay ho so ca nhan thanh cong');
  } catch (error) { next(error); }
};

// PUT /api/elderly/me - chi cap nhat ho so gan voi JWT cua NguoiCaoTuoi.
const updateMe = async (req, res, next) => {
  let transaction;
  try {
    if (req.user.tenVaiTro !== 'NguoiCaoTuoi') {
      return fail(res, 'Chi nguoi cao tuoi duoc sua ho so cua minh', 'FORBIDDEN', 403);
    }

    const allowed = ['hoTen', 'ngaySinh', 'gioiTinh', 'soDienThoai', 'diaChi', 'nhomMau', 'benhNen', 'diUng', 'email'];
    const fields = Object.keys(req.body || {});
    if (!fields.length || fields.some((field) => !allowed.includes(field))) {
      return fail(res, 'Du lieu cap nhat khong hop le; khong duoc sua CCCD', 'INVALID_FIELDS', 400);
    }

    const validation = validateElderlyProfile(req.body, { partial: true });
    if (validation.error) return fail(res, validation.error.message, `INVALID_${validation.error.field.toUpperCase()}`, 422);
    const email = req.body.email;
    const normalizedEmail = typeof req.body.email === 'string'
      ? req.body.email.trim().toLowerCase()
      : '';
    if (req.body.email !== undefined
      && (!normalizedEmail || normalizedEmail.length > 100
        || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail))) {
      return fail(res, 'Email không hợp lệ', 'INVALID_EMAIL', 422);
    }

    const columns = {
      hoTen: 'HoTen', ngaySinh: 'NgaySinh', gioiTinh: 'GioiTinh',
      soDienThoai: 'SoDienThoai', diaChi: 'DiaChi', nhomMau: 'NhomMau',
      benhNen: 'BenhNen', diUng: 'DiUng',
    };
    const pool = await poolPromise;
    if (email !== undefined) {
      // Email belongs to the authenticated account; commit it with its own profile.
      transaction = new sql.Transaction(pool);
      await transaction.begin();
      const duplicate = await new sql.Request(transaction)
        .input('userId', sql.Int, req.user.userId).input('email', sql.VarChar(100), normalizedEmail)
        .query('SELECT UserID FROM NguoiDung WITH (UPDLOCK,HOLDLOCK) WHERE Email=@email AND UserID<>@userId');
      if (duplicate.recordset.length) {
        await transaction.rollback();
        transaction = null;
        return fail(res, 'Email đã được tài khoản khác sử dụng.', 'EMAIL_TAKEN', 409);
      }
    }
    const request = (transaction ? new sql.Request(transaction) : pool.request()).input('userId', sql.Int, req.user.userId);
    const profileFields = fields.filter(field => field !== 'email');
    for (const field of profileFields) {
      const value = validation.value[field];
      request.input(field, field === 'ngaySinh' ? sql.Date : sql.NVarChar,
        typeof value === 'string' ? value.trim() || null : value);
    }
    const setters = profileFields.map((field) => `${columns[field]} = @${field}`).join(', ');
    const result = await request.query(profileFields.length
      ? `UPDATE HoSoNguoiCaoTuoi SET ${setters} WHERE UserID = @userId`
      : 'SELECT NguoiCaoTuoiID FROM HoSoNguoiCaoTuoi WHERE UserID=@userId');
    if (profileFields.length ? !result.rowsAffected[0] : !result.recordset.length) {
      if (transaction) { await transaction.rollback(); transaction = null; }
      return fail(res, 'Tai khoan chua co ho so nguoi cao tuoi lien ket', 'ELDERLY_PROFILE_NOT_FOUND', 404);
    }
    if (transaction) {
      await new sql.Request(transaction)
        .input('userId', sql.Int, req.user.userId).input('email', sql.VarChar(100), normalizedEmail)
        .query('UPDATE NguoiDung SET Email=@email WHERE UserID=@userId');
      await transaction.commit();
      transaction = null;
    }
    return getMe(req, res, next);
  } catch (error) {
    if (transaction) { try { await transaction.rollback(); } catch (_) {} }
    if ([2601, 2627].includes(error.number)) {
      return fail(res, 'Email đã được tài khoản khác sử dụng.', 'EMAIL_TAKEN', 409);
    }
    next(error);
  }
};

// ─── LAY DANH SACH ────────────────────────────────────────────────────────────
// GET /api/elderly?keyword=<tu_khoa>
// Ho tro tim kiem theo HoTen, sap xep NgayTao giam dan
const getAll = async (req, res, next) => {
  try {
    const { keyword } = req.query;
    const pool = await poolPromise;

    // Xay dung query: co hoac khong co dieu kien tim kiem
    let query = `
      SELECT
        nct.NguoiCaoTuoiID  AS id,
        nct.UserID          AS userId,
        nd.TenDangNhap      AS tenDangNhap,
        nd.Email           AS email,
        nct.HoTen           AS hoTen,
        nct.NgaySinh        AS ngaySinh,
        nct.GioiTinh        AS gioiTinh,
        nct.CCCD            AS cccd,
        nct.DiaChi          AS diaChi,
        nct.SoDienThoai     AS soDienThoai,
        nct.NhomMau         AS nhomMau,
        nct.BenhNen         AS benhNen,
        nct.DiUng           AS diUng,
        nct.TrangThai       AS trangThai,
        nct.NguoiTaoID      AS nguoiTaoId,
        nct.NgayTao         AS ngayTao,
        ncsMain.NguoiChamSocID AS nguoiChamSocId,
        ncsMain.HoTen           AS nguoiChamSocTen
      FROM HoSoNguoiCaoTuoi nct
      LEFT JOIN NguoiDung nd ON nd.UserID=nct.UserID
      OUTER APPLY (
        SELECT TOP 1 ncs.NguoiChamSocID, ncs.HoTen
        FROM NguoiCaoTuoi_NguoiChamSoc lienKet
          INNER JOIN NguoiChamSoc ncs ON ncs.NguoiChamSocID = lienKet.NguoiChamSocID
          WHERE lienKet.NguoiCaoTuoiID = nct.NguoiCaoTuoiID
          AND lienKet.LaChinh = 1
          AND (lienKet.NgayKetThuc IS NULL OR lienKet.NgayKetThuc > CAST(DATEADD(HOUR,7,SYSUTCDATETIME()) AS DATE))
        ORDER BY lienKet.ID DESC
      ) ncsMain
      WHERE 1=1
    `;

    const request = pool.request();

    // Them dieu kien tim kiem neu co keyword
    if (keyword && keyword.trim()) {
      query += ` AND nct.HoTen LIKE @keyword`;
      request.input('keyword', sql.NVarChar, `%${keyword.trim()}%`);
    }

    query += scopedWhere(req, 'nct.NguoiCaoTuoiID');
    query += ` ORDER BY nct.NgayTao DESC`;

    const result = await request.query(query);
    return ok(res, result.recordset, `Tim thay ${result.recordset.length} ho so`);
  } catch (err) {
    next(err);
  }
};

// ─── LAY CHI TIET MOT HO SO ───────────────────────────────────────────────────
// GET /api/elderly/:id
const getById = async (req, res, next) => {
  try {
    const { id } = req.params;
    const pool = await poolPromise;

    const result = await pool.request()
      .input('id', sql.Int, id)
      .query(`
        SELECT
          nct.NguoiCaoTuoiID  AS id,
          nct.UserID          AS userId,
          nd.TenDangNhap      AS tenDangNhap,
          nd.Email           AS email,
          nct.HoTen           AS hoTen,
          nct.NgaySinh        AS ngaySinh,
          nct.GioiTinh        AS gioiTinh,
          nct.CCCD            AS cccd,
          nct.DiaChi          AS diaChi,
          nct.SoDienThoai     AS soDienThoai,
          nct.NhomMau         AS nhomMau,
          nct.BenhNen         AS benhNen,
          nct.DiUng           AS diUng,
          nct.TrangThai       AS trangThai,
          nct.NguoiTaoID      AS nguoiTaoId,
          nct.NgayTao         AS ngayTao,
          ncsMain.NguoiChamSocID AS nguoiChamSocId,
          ncsMain.HoTen           AS nguoiChamSocTen
        FROM HoSoNguoiCaoTuoi nct
        LEFT JOIN NguoiDung nd ON nd.UserID=nct.UserID
        OUTER APPLY (
          SELECT TOP 1 ncs.NguoiChamSocID, ncs.HoTen
          FROM NguoiCaoTuoi_NguoiChamSoc lienKet
          INNER JOIN NguoiChamSoc ncs ON ncs.NguoiChamSocID = lienKet.NguoiChamSocID
          WHERE lienKet.NguoiCaoTuoiID = nct.NguoiCaoTuoiID
            AND lienKet.LaChinh = 1
            AND (lienKet.NgayKetThuc IS NULL OR lienKet.NgayKetThuc > CAST(DATEADD(HOUR,7,SYSUTCDATETIME()) AS DATE))
          ORDER BY lienKet.ID DESC
        ) ncsMain
        WHERE nct.NguoiCaoTuoiID = @id
      `);

    if (result.recordset.length === 0) {
      return fail(res, 'Khong tim thay ho so nguoi cao tuoi', 'NOT_FOUND', 404);
    }

    return ok(res, result.recordset[0], 'Lay ho so thanh cong');
  } catch (err) {
    next(err);
  }
};

// ─── TAO HO SO MOI ────────────────────────────────────────────────────────────
// POST /api/elderly
// Optional taiKhoan: { tenDangNhap, email, matKhau } creates a linked Mobile user.
const create = async (req, res, next) => {
  try {
    const created = await createElderlyProfile(req.body, req.user.userId, { poolPromise, sql });
    return ok(res, created, created.coTaiKhoanMobile
      ? 'Đã tạo hồ sơ và tài khoản Mobile cho người cao tuổi' : 'Tao ho so nguoi cao tuoi thanh cong', 201);
  } catch (err) {
    if (err instanceof ElderlyCreationError) return fail(res, err.message, err.errorCode, err.statusCode);
    next(err);
  }
};

// ─── CAP NHAT HO SO ───────────────────────────────────────────────────────────
// PUT /api/elderly/:id
// Cap nhat toan bo cac field cho phep
const update = async (req, res, next) => {
  try {
    const { id } = req.params;
    const {
      hoTen, ngaySinh, gioiTinh,
      cccd, diaChi, soDienThoai,
      nhomMau, benhNen, diUng, trangThai,
    } = req.body;

    const validation = validateElderlyProfile(req.body);
    if (validation.error) return fail(res, validation.error.message, `INVALID_${validation.error.field.toUpperCase()}`, 422);
    if (trangThai != null && !['DangTheoDoi', 'CanChamSocDacBiet', 'NgungTheoDoi'].includes(trangThai)) {
      return fail(res, 'Trạng thái hồ sơ không hợp lệ', 'INVALID_TRANGTHAI', 422);
    }

    const pool = await poolPromise;

    // Kiem tra ho so ton tai
    const checkExist = await pool.request()
      .input('id', sql.Int, id)
      .query(`SELECT NguoiCaoTuoiID FROM HoSoNguoiCaoTuoi WHERE NguoiCaoTuoiID = @id`);

    if (checkExist.recordset.length === 0) {
      return fail(res, 'Khong tim thay ho so nguoi cao tuoi', 'NOT_FOUND', 404);
    }

    const benhNenStr = validation.value.benhNen;
    const diUngStr = validation.value.diUng;

    // Cap nhat toan bo cac truong
    await pool.request()
      .input('id', sql.Int, id)
      .input('hoTen', sql.NVarChar, validation.value.hoTen)
      .input('ngaySinh', sql.Date, ngaySinh)
      .input('gioiTinh', sql.NVarChar, gioiTinh)
      .input('cccd', sql.VarChar, validation.value.cccd)
      .input('diaChi', sql.NVarChar, validation.value.diaChi)
      .input('soDienThoai', sql.VarChar, validation.value.soDienThoai)
      .input('nhomMau', sql.VarChar, validation.value.nhomMau)
      .input('benhNen', sql.NVarChar, benhNenStr || null)
      .input('diUng', sql.NVarChar, diUngStr || null)
      .input('trangThai', sql.NVarChar, trangThai || 'DangTheoDoi')
      .query(`
        UPDATE HoSoNguoiCaoTuoi SET
          HoTen       = @hoTen,
          NgaySinh    = @ngaySinh,
          GioiTinh    = @gioiTinh,
          CCCD        = @cccd,
          DiaChi      = @diaChi,
          SoDienThoai = @soDienThoai,
          NhomMau     = @nhomMau,
          BenhNen     = @benhNen,
          DiUng       = @diUng,
          TrangThai   = @trangThai
        WHERE NguoiCaoTuoiID = @id
      `);

    return ok(res, { id: parseInt(id) }, 'Cap nhat ho so thanh cong');
  } catch (err) {
    next(err);
  }
};

// ─── XOA MEM HO SO ────────────────────────────────────────────────────────────
// DELETE /api/elderly/:id
// Khong xoa cung, chi cap nhat TrangThai = 'NgungTheoDoi'
const remove = async (req, res, next) => {
  try {
    const { id } = req.params;
    const pool = await poolPromise;

    // Kiem tra ho so ton tai
    const checkExist = await pool.request()
      .input('id', sql.Int, id)
      .query(`SELECT NguoiCaoTuoiID FROM HoSoNguoiCaoTuoi WHERE NguoiCaoTuoiID = @id`);

    if (checkExist.recordset.length === 0) {
      return fail(res, 'Khong tim thay ho so nguoi cao tuoi', 'NOT_FOUND', 404);
    }

    // Xoa mem: chi doi TrangThai thanh NgungTheoDoi
    await pool.request()
      .input('id', sql.Int, id)
      .query(`UPDATE HoSoNguoiCaoTuoi SET TrangThai = N'NgungTheoDoi' WHERE NguoiCaoTuoiID = @id`);

    return ok(res, { id: parseInt(id) }, 'Da ngung theo doi ho so nguoi cao tuoi');
  } catch (err) {
    next(err);
  }
};

// PUT /api/elderly/:id/caregiver
// Gan nhanh mot nguoi cham soc chinh cho ho so nguoi cao tuoi.
const assignCaregiver = async (req, res, next) => {
  const transaction = new sql.Transaction(await poolPromise);

  try {
    const { id } = req.params;
    const { nguoiChamSocId } = req.body;

    if (!nguoiChamSocId) {
      return fail(res, 'Vui long chon nguoi cham soc', 'MISSING_CAREGIVER', 400);
    }

    await transaction.begin();

    const existing = await transaction.request()
      .input('id', sql.Int, id)
      .input('nguoiChamSocId', sql.Int, nguoiChamSocId)
      .query(`
        SELECT
          (SELECT COUNT(1) FROM HoSoNguoiCaoTuoi WHERE NguoiCaoTuoiID = @id) AS elderCount,
          (SELECT COUNT(1) FROM NguoiChamSoc
            WHERE NguoiChamSocID = @nguoiChamSocId AND TrangThai=N'DangLamViec') AS caregiverCount
      `);

    const counts = existing.recordset[0];
    if (!counts.elderCount || !counts.caregiverCount) {
      await transaction.rollback();
      return fail(res, 'Ho so khong ton tai hoac nguoi cham soc khong dang lam viec', 'NOT_FOUND', 404);
    }

    await transaction.request()
      .input('id', sql.Int, id)
      .input('nguoiChamSocId', sql.Int, nguoiChamSocId)
      .query(`
        DECLARE @today DATE = CAST(DATEADD(HOUR,7,SYSUTCDATETIME()) AS DATE);

        -- NgayKetThuc la moc het hieu luc (khong tinh ngay nay), vi vay
        -- chuyen giao trong cung ngay van thu hoi quyen ma giu duoc lich su.
        UPDATE NguoiCaoTuoi_NguoiChamSoc
        SET LaChinh = 0,
            NgayKetThuc = @today,
            MoiQuanHe = CASE
              WHEN MoiQuanHe = N'Người chăm sóc chính' THEN N'Người chăm sóc'
              ELSE MoiQuanHe
            END
        WHERE NguoiCaoTuoiID = @id
          AND NguoiChamSocID <> @nguoiChamSocId
          AND LaChinh = 1;

        MERGE NguoiCaoTuoi_NguoiChamSoc WITH (HOLDLOCK) AS target
        USING (SELECT @id AS NguoiCaoTuoiID, @nguoiChamSocId AS NguoiChamSocID) AS source
          ON target.NguoiCaoTuoiID = source.NguoiCaoTuoiID
         AND target.NguoiChamSocID = source.NguoiChamSocID
        WHEN MATCHED THEN
          UPDATE SET LaChinh = 1,
            MoiQuanHe = N'Người chăm sóc chính',
            NgayKetThuc = NULL
        WHEN NOT MATCHED THEN
          INSERT (NguoiCaoTuoiID, NguoiChamSocID, MoiQuanHe, LaChinh, NgayBatDau)
          VALUES (source.NguoiCaoTuoiID, source.NguoiChamSocID, N'Người chăm sóc chính', 1, @today);
      `);

    await transaction.commit();
    return ok(res, { id: Number(id), nguoiChamSocId: Number(nguoiChamSocId) }, 'Gan nguoi cham soc thanh cong');
  } catch (err) {
    try {
      await transaction.rollback();
    } catch (_) {
      // Transaction chua bat dau hoac da ket thuc.
    }
    next(err);
  }
};

// POST /api/elderly/:id/reset-password — Admin only; never creates/relinks a user.
const resetMobilePassword = async (req, res, next) => {
  if (req.user?.tenVaiTro !== 'QuanTriVien') {
    return fail(res, 'Chỉ quản trị viên được đặt lại mật khẩu Mobile của người cao tuổi', 'FORBIDDEN', 403);
  }
  const id = Number(req.params.id);
  if (!/^\d+$/.test(String(req.params.id)) || !Number.isSafeInteger(id) || id < 1 || id > 2147483647) {
    return fail(res, 'Mã hồ sơ người cao tuổi không hợp lệ', 'INVALID_ID', 422);
  }
  if (!req.body || typeof req.body !== 'object' || Array.isArray(req.body)
    || Object.keys(req.body).some(key => key !== 'matKhauMoi')) {
    return fail(res, 'Chỉ được gửi mật khẩu mới, không được thay đổi tài khoản liên kết', 'INVALID_FIELDS', 422);
  }
  const passwordError = validateElderlyPassword(req.body.matKhauMoi);
  if (passwordError) return fail(res, passwordError.message, passwordError.code, 422);

  let transaction;
  try {
    const hash = await bcrypt.hash(req.body.matKhauMoi, 10);
    transaction = new sql.Transaction(await poolPromise);
    await transaction.begin(sql.ISOLATION_LEVEL.SERIALIZABLE);
    const linked = (await new sql.Request(transaction)
      .input('id', sql.Int, id)
      .query(`SELECT nct.NguoiCaoTuoiID AS id,nct.UserID AS userId,vt.TenVaiTro AS role
        FROM HoSoNguoiCaoTuoi nct WITH(UPDLOCK,HOLDLOCK)
        LEFT JOIN NguoiDung nd WITH(UPDLOCK,HOLDLOCK) ON nd.UserID=nct.UserID
        LEFT JOIN VaiTro vt ON vt.VaiTroID=nd.VaiTroID
        WHERE nct.NguoiCaoTuoiID=@id`)).recordset[0];
    if (!linked || !linked.userId || linked.role !== 'NguoiCaoTuoi') {
      await transaction.rollback(); transaction = null;
      return !linked ? fail(res, 'Không tìm thấy hồ sơ người cao tuổi', 'NOT_FOUND', 404)
        : !linked.userId ? fail(res, 'Hồ sơ chưa có tài khoản Mobile để đặt lại mật khẩu', 'ACCOUNT_NOT_FOUND', 409)
          : fail(res, 'Tài khoản liên kết không phải Người cao tuổi; chưa thay đổi mật khẩu', 'ACCOUNT_ROLE_MISMATCH', 409);
    }
    const updated = await new sql.Request(transaction)
      .input('userId', sql.Int, linked.userId)
      .input('hash', sql.VarChar(255), hash)
      .query(`UPDATE nd SET MatKhauHash=@hash,MaOTP=NULL,MaOTPHetHan=NULL,
          MaOTPGuiLuc=NULL,MaOTPCuaSoBatDau=NULL,SoLanGuiOTP=0
        FROM NguoiDung nd JOIN VaiTro vt ON vt.VaiTroID=nd.VaiTroID
        WHERE nd.UserID=@userId AND vt.TenVaiTro=N'NguoiCaoTuoi'`);
    if (updated.rowsAffected[0] !== 1) throw new Error('Không thể cập nhật mật khẩu tài khoản NCT');
    await transaction.commit(); transaction = null;
    return ok(res, { id, userId: linked.userId }, 'Đã đặt lại mật khẩu Mobile cho người cao tuổi');
  } catch (error) {
    if (transaction) { try { await transaction.rollback(); } catch (_) { /* SQL already rolled back. */ } }
    return next(error);
  }
};

module.exports = { getMe, updateMe, getAll, getById, create, update, remove, assignCaregiver, resetMobilePassword };
