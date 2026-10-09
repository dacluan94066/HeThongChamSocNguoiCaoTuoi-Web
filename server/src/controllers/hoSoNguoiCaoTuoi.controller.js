// controllers/hoSoNguoiCaoTuoi.controller.js - CRUD ho so nguoi cao tuoi
// Bang: HoSoNguoiCaoTuoi (NguoiCaoTuoiID, HoTen, NgaySinh, GioiTinh, CCCD,
//       DiaChi, SoDienThoai, NhomMau, BenhNen, DiUng, TrangThai, NguoiTaoID, NgayTao)
const { poolPromise, sql } = require('../config/db');
const { ok, fail } = require('../utils/response');
const { scopedWhere } = require('../middlewares/mobile-scope.middleware');

// GET /api/elderly/me - chi tai khoan NguoiCaoTuoi co ho so lien ket.
const getMe = async (req, res, next) => {
  try {
    const pool = await poolPromise;
    const result = await pool.request().input('userId', sql.Int, req.user.userId).query(`
      SELECT nct.NguoiCaoTuoiID AS id, nct.UserID AS userId,
        nct.HoTen AS hoTen, nct.NgaySinh AS ngaySinh, nct.GioiTinh AS gioiTinh,
        nct.CCCD AS cccd, nct.DiaChi AS diaChi, nct.SoDienThoai AS soDienThoai,
        nct.NhomMau AS nhomMau, nct.BenhNen AS benhNen, nct.DiUng AS diUng,
        nct.TrangThai AS trangThai, nct.NgayTao AS ngayTao, nd.Email AS email,
        ncsMain.NguoiChamSocID AS nguoiChamSocId,
        ncsMain.HoTen AS nguoiChamSocTen
      FROM HoSoNguoiCaoTuoi nct
      JOIN NguoiDung nd ON nd.UserID=nct.UserID
      OUTER APPLY (
        SELECT TOP 1 ncs.NguoiChamSocID, ncs.HoTen
        FROM NguoiCaoTuoi_NguoiChamSoc lk
        JOIN NguoiChamSoc ncs ON ncs.NguoiChamSocID = lk.NguoiChamSocID
        WHERE lk.NguoiCaoTuoiID = nct.NguoiCaoTuoiID
          AND lk.NgayBatDau <= CAST(GETDATE() AS DATE)
          AND (lk.NgayKetThuc IS NULL OR lk.NgayKetThuc >= CAST(GETDATE() AS DATE))
        ORDER BY lk.LaChinh DESC, lk.ID DESC
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

    const { hoTen, ngaySinh, gioiTinh } = req.body;
    const email = req.body.email;
    if (email !== undefined && (typeof email !== 'string' || email.trim().length > 100
      || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim()))) {
      return fail(res, 'Email không hợp lệ.', 'INVALID_EMAIL', 400);
    }
    if (hoTen !== undefined && (typeof hoTen !== 'string' || !hoTen.trim())) {
      return fail(res, 'Ho ten khong duoc de trong', 'INVALID_NAME', 400);
    }
    if (ngaySinh !== undefined) {
      const date = typeof ngaySinh === 'string' ? new Date(`${ngaySinh}T00:00:00Z`) : new Date(NaN);
      if (!/^\d{4}-\d{2}-\d{2}$/.test(ngaySinh)
        || Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== ngaySinh
        || date > new Date()) {
        return fail(res, 'Ngay sinh phai theo YYYY-MM-DD va khong duoc o tuong lai', 'INVALID_BIRTH_DATE', 400);
      }
    }
    if (gioiTinh !== undefined && !['Nam', 'Nữ', 'Khác'].includes(gioiTinh)) {
      return fail(res, 'Gioi tinh khong hop le', 'INVALID_GENDER', 400);
    }
    for (const field of ['soDienThoai', 'diaChi', 'nhomMau', 'benhNen', 'diUng']) {
      if (req.body[field] !== undefined && req.body[field] !== null
        && typeof req.body[field] !== 'string') {
        return fail(res, `${field} phai la chuoi`, 'INVALID_FIELD_TYPE', 400);
      }
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
        .input('userId', sql.Int, req.user.userId).input('email', sql.VarChar(100), email.trim())
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
      const value = req.body[field];
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
        .input('userId', sql.Int, req.user.userId).input('email', sql.VarChar(100), email.trim())
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
      OUTER APPLY (
        SELECT TOP 1 ncs.NguoiChamSocID, ncs.HoTen
        FROM NguoiCaoTuoi_NguoiChamSoc lienKet
        INNER JOIN NguoiChamSoc ncs ON ncs.NguoiChamSocID = lienKet.NguoiChamSocID
        WHERE lienKet.NguoiCaoTuoiID = nct.NguoiCaoTuoiID
          AND (lienKet.NgayKetThuc IS NULL OR lienKet.NgayKetThuc >= CAST(GETDATE() AS DATE))
        ORDER BY lienKet.LaChinh DESC, lienKet.ID DESC
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
        OUTER APPLY (
          SELECT TOP 1 ncs.NguoiChamSocID, ncs.HoTen
          FROM NguoiCaoTuoi_NguoiChamSoc lienKet
          INNER JOIN NguoiChamSoc ncs ON ncs.NguoiChamSocID = lienKet.NguoiChamSocID
          WHERE lienKet.NguoiCaoTuoiID = nct.NguoiCaoTuoiID
            AND (lienKet.NgayKetThuc IS NULL OR lienKet.NgayKetThuc >= CAST(GETDATE() AS DATE))
          ORDER BY lienKet.LaChinh DESC, lienKet.ID DESC
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
// Nhan: { hoTen, ngaySinh, gioiTinh, cccd, diaChi, soDienThoai, nhomMau, benhNen, diUng }
const create = async (req, res, next) => {
  try {
    const {
      hoTen, ngaySinh, gioiTinh,
      cccd, diaChi, soDienThoai,
      nhomMau, benhNen, diUng,
    } = req.body;

    // Validate cac truong bat buoc
    if (!hoTen || !ngaySinh || !gioiTinh) {
      return fail(res, 'hoTen, ngaySinh, gioiTinh la bat buoc', 'MISSING_FIELDS', 400);
    }

    const pool = await poolPromise;

    // BenhNen va DiUng co the la mang, luu thanh chuoi JSON hoac CSV
    const benhNenStr = Array.isArray(benhNen) ? benhNen.join(', ') : (benhNen || '');
    const diUngStr = Array.isArray(diUng) ? diUng.join(', ') : (diUng || '');

    // Them ban ghi moi, lay lai ID vua tao qua OUTPUT
    const result = await pool.request()
      .input('hoTen', sql.NVarChar, hoTen)
      .input('ngaySinh', sql.Date, ngaySinh)
      .input('gioiTinh', sql.NVarChar, gioiTinh)
      .input('cccd', sql.NVarChar, cccd || null)
      .input('diaChi', sql.NVarChar, diaChi || null)
      .input('soDienThoai', sql.NVarChar, soDienThoai || null)
      .input('nhomMau', sql.NVarChar, nhomMau || null)
      .input('benhNen', sql.NVarChar, benhNenStr || null)
      .input('diUng', sql.NVarChar, diUngStr || null)
      .input('nguoiTaoId', sql.Int, req.user.userId)
      .query(`
        INSERT INTO HoSoNguoiCaoTuoi
          (HoTen, NgaySinh, GioiTinh, CCCD, DiaChi, SoDienThoai,
           NhomMau, BenhNen, DiUng, TrangThai, NguoiTaoID, NgayTao)
        OUTPUT INSERTED.NguoiCaoTuoiID AS id
        VALUES
          (@hoTen, @ngaySinh, @gioiTinh, @cccd, @diaChi, @soDienThoai,
           @nhomMau, @benhNen, @diUng, N'DangTheoDoi', @nguoiTaoId, SYSDATETIME())
      `);

    const newId = result.recordset[0].id;
    return ok(res, { id: newId }, 'Tao ho so nguoi cao tuoi thanh cong', 201);
  } catch (err) {
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

    const pool = await poolPromise;

    // Kiem tra ho so ton tai
    const checkExist = await pool.request()
      .input('id', sql.Int, id)
      .query(`SELECT NguoiCaoTuoiID FROM HoSoNguoiCaoTuoi WHERE NguoiCaoTuoiID = @id`);

    if (checkExist.recordset.length === 0) {
      return fail(res, 'Khong tim thay ho so nguoi cao tuoi', 'NOT_FOUND', 404);
    }

    const benhNenStr = Array.isArray(benhNen) ? benhNen.join(', ') : (benhNen || '');
    const diUngStr = Array.isArray(diUng) ? diUng.join(', ') : (diUng || '');

    // Cap nhat toan bo cac truong
    await pool.request()
      .input('id', sql.Int, id)
      .input('hoTen', sql.NVarChar, hoTen)
      .input('ngaySinh', sql.Date, ngaySinh)
      .input('gioiTinh', sql.NVarChar, gioiTinh)
      .input('cccd', sql.NVarChar, cccd || null)
      .input('diaChi', sql.NVarChar, diaChi || null)
      .input('soDienThoai', sql.NVarChar, soDienThoai || null)
      .input('nhomMau', sql.NVarChar, nhomMau || null)
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
          (SELECT COUNT(1) FROM NguoiChamSoc WHERE NguoiChamSocID = @nguoiChamSocId) AS caregiverCount
      `);

    const counts = existing.recordset[0];
    if (!counts.elderCount || !counts.caregiverCount) {
      await transaction.rollback();
      return fail(res, 'Ho so hoac nguoi cham soc khong ton tai', 'NOT_FOUND', 404);
    }

    await transaction.request()
      .input('id', sql.Int, id)
      .input('nguoiChamSocId', sql.Int, nguoiChamSocId)
      .query(`
        UPDATE NguoiCaoTuoi_NguoiChamSoc
        SET LaChinh = 0
        WHERE NguoiCaoTuoiID = @id;

        MERGE NguoiCaoTuoi_NguoiChamSoc WITH (HOLDLOCK) AS target
        USING (SELECT @id AS NguoiCaoTuoiID, @nguoiChamSocId AS NguoiChamSocID) AS source
          ON target.NguoiCaoTuoiID = source.NguoiCaoTuoiID
         AND target.NguoiChamSocID = source.NguoiChamSocID
        WHEN MATCHED THEN
          UPDATE SET LaChinh = 1, NgayKetThuc = NULL
        WHEN NOT MATCHED THEN
          INSERT (NguoiCaoTuoiID, NguoiChamSocID, MoiQuanHe, LaChinh, NgayBatDau)
          VALUES (source.NguoiCaoTuoiID, source.NguoiChamSocID, N'Người chăm sóc chính', 1, CAST(GETDATE() AS DATE));
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

module.exports = { getMe, updateMe, getAll, getById, create, update, remove, assignCaregiver };
