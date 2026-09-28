// controllers/hoSoNguoiCaoTuoi.controller.js - CRUD ho so nguoi cao tuoi
// Bang: HoSoNguoiCaoTuoi (NguoiCaoTuoiID, HoTen, NgaySinh, GioiTinh, CCCD,
//       DiaChi, SoDienThoai, NhomMau, BenhNen, DiUng, TrangThai, NguoiTaoID, NgayTao)
const { poolPromise, sql } = require('../config/db');
const { ok, fail } = require('../utils/response');

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
        NguoiCaoTuoiID  AS id,
        HoTen           AS hoTen,
        NgaySinh        AS ngaySinh,
        GioiTinh        AS gioiTinh,
        CCCD            AS cccd,
        DiaChi          AS diaChi,
        SoDienThoai     AS soDienThoai,
        NhomMau         AS nhomMau,
        BenhNen         AS benhNen,
        DiUng           AS diUng,
        TrangThai       AS trangThai,
        NguoiTaoID      AS nguoiTaoId,
        NgayTao         AS ngayTao
      FROM HoSoNguoiCaoTuoi
    `;

    const request = pool.request();

    // Them dieu kien tim kiem neu co keyword
    if (keyword && keyword.trim()) {
      query += ` WHERE HoTen LIKE @keyword`;
      request.input('keyword', sql.NVarChar, `%${keyword.trim()}%`);
    }

    query += ` ORDER BY NgayTao DESC`;

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
          NguoiCaoTuoiID  AS id,
          HoTen           AS hoTen,
          NgaySinh        AS ngaySinh,
          GioiTinh        AS gioiTinh,
          CCCD            AS cccd,
          DiaChi          AS diaChi,
          SoDienThoai     AS soDienThoai,
          NhomMau         AS nhomMau,
          BenhNen         AS benhNen,
          DiUng           AS diUng,
          TrangThai       AS trangThai,
          NguoiTaoID      AS nguoiTaoId,
          NgayTao         AS ngayTao
        FROM HoSoNguoiCaoTuoi
        WHERE NguoiCaoTuoiID = @id
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
           @nhomMau, @benhNen, @diUng, 'DangTheoDoc', @nguoiTaoId, SYSDATETIME())
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
      .input('trangThai', sql.NVarChar, trangThai || 'DangTheoDoc')
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
// Khong xoa cung, chi cap nhat TrangThai = 'NgungTheoDoc'
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

    // Xoa mem: chi doi TrangThai thanh NgungTheoDoc
    await pool.request()
      .input('id', sql.Int, id)
      .query(`UPDATE HoSoNguoiCaoTuoi SET TrangThai = 'NgungTheoDoc' WHERE NguoiCaoTuoiID = @id`);

    return ok(res, { id: parseInt(id) }, 'Da ngung theo doi ho so nguoi cao tuoi');
  } catch (err) {
    next(err);
  }
};

module.exports = { getAll, getById, create, update, remove };
