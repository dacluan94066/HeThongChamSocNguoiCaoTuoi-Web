// controllers/nguoiChamSoc.controller.js - CRUD nguoi cham soc - dung schema that
// Bang NguoiChamSoc: NguoiChamSocID, UserID (FK->NguoiDung), HoTen, SoDienThoai,
//   Email, DiaChi, NgheNghiep, GhiChu, NgayTao
// Bang NguoiCaoTuoi_NguoiChamSoc: lien ket NCT <-> NCS
const { poolPromise, sql } = require('../config/db');
const { ok, fail } = require('../utils/response');

const mapCaregiver = (row) => ({
  id:             row.id,
  maNhanVien:     `NCS${String(row.id).padStart(3, '0')}`,
  hoTen:          row.hoTen,
  soDienThoai:    row.soDienThoai,
  email:          row.email,
  trinhDoChuyenMon: row.ngheNghiep,
  namKinhNghiem:  0,
  trangThai:      'DANG_LAM_VIEC',
  trangThaiLabel: 'Đang làm việc',
  soNguoiPhuTrach: row.soNguoiPhuTrach || 0,
  nguoiCaoTuoiTen: row.nguoiCaoTuoiTen
    ? row.nguoiCaoTuoiTen.split('||').filter(Boolean)
    : [],
});

// GET /api/caregivers?keyword=
const getAll = async (req, res, next) => {
  try {
    const { keyword } = req.query;
    const pool = await poolPromise;

    let query = `
      SELECT ncs.NguoiChamSocID AS id, ncs.HoTen AS hoTen,
        ncs.SoDienThoai AS soDienThoai, ncs.Email AS email,
        ncs.NgheNghiep AS ngheNghiep,
        COUNT(DISTINCT lk.NguoiCaoTuoiID) AS soNguoiPhuTrach,
        STRING_AGG(nct.HoTen, '||') AS nguoiCaoTuoiTen
      FROM NguoiChamSoc ncs
      LEFT JOIN NguoiCaoTuoi_NguoiChamSoc lk ON ncs.NguoiChamSocID = lk.NguoiChamSocID
        AND (lk.NgayKetThuc IS NULL OR lk.NgayKetThuc >= CAST(GETDATE() AS DATE))
      LEFT JOIN HoSoNguoiCaoTuoi nct ON lk.NguoiCaoTuoiID = nct.NguoiCaoTuoiID
      WHERE 1=1
    `;
    const req2 = pool.request();
    if (keyword && keyword.trim()) {
      query += ` AND (ncs.HoTen LIKE @kw OR ncs.SoDienThoai LIKE @kw)`;
      req2.input('kw', sql.NVarChar, `%${keyword.trim()}%`);
    }
    query += ` GROUP BY ncs.NguoiChamSocID, ncs.HoTen, ncs.SoDienThoai, ncs.Email, ncs.NgheNghiep`;
    query += ` ORDER BY ncs.HoTen`;

    const result = await req2.query(query);
    return ok(res, result.recordset.map(mapCaregiver));
  } catch (err) { next(err); }
};

// GET /api/caregivers/:id
const getById = async (req, res, next) => {
  try {
    const pool = await poolPromise;
    const result = await pool.request().input('id', sql.Int, req.params.id).query(`
      SELECT NguoiChamSocID AS id, HoTen AS hoTen, SoDienThoai AS soDienThoai,
        Email AS email, NgheNghiep AS ngheNghiep
      FROM NguoiChamSoc WHERE NguoiChamSocID=@id`);
    if (!result.recordset.length) return fail(res, 'Khong tim thay', 'NOT_FOUND', 404);
    return ok(res, mapCaregiver({ ...result.recordset[0], soNguoiPhuTrach: 0, nguoiCaoTuoiTen: '' }));
  } catch (err) { next(err); }
};

// POST /api/caregivers - Tao NguoiChamSoc + NguoiDung moi
const create = async (req, res, next) => {
  try {
    const { hoTen, soDienThoai, email, ngheNghiep, ghiChu } = req.body;
    if (!hoTen || !soDienThoai) return fail(res, 'hoTen, soDienThoai la bat buoc', 'MISSING_FIELDS', 400);

    const pool = await poolPromise;
    // Them thang vao NguoiChamSoc (khong bat buoc co UserID)
    const r = await pool.request()
      .input('hoTen', sql.NVarChar, hoTen).input('sdt', sql.NVarChar, soDienThoai)
      .input('email', sql.NVarChar, email || null).input('ngheNghiep', sql.NVarChar, ngheNghiep || null)
      .input('ghiChu', sql.NVarChar, ghiChu || null)
      // UserID = NULL (NCS chua co tai khoan), can cap nhat sau neu muon
      .query(`INSERT INTO NguoiChamSoc (UserID,HoTen,SoDienThoai,Email,NgheNghiep,GhiChu)
              OUTPUT INSERTED.NguoiChamSocID AS id
              VALUES (NULL,@hoTen,@sdt,@email,@ngheNghiep,@ghiChu)`);
    return ok(res, { id: r.recordset[0].id }, 'Them nguoi cham soc thanh cong', 201);
  } catch (err) { next(err); }
};

// PUT /api/caregivers/:id
const update = async (req, res, next) => {
  try {
    const { hoTen, soDienThoai, email, ngheNghiep, ghiChu } = req.body;
    const pool = await poolPromise;
    await pool.request()
      .input('id', sql.Int, req.params.id).input('hoTen', sql.NVarChar, hoTen)
      .input('sdt', sql.NVarChar, soDienThoai || null).input('email', sql.NVarChar, email || null)
      .input('ngheNghiep', sql.NVarChar, ngheNghiep || null).input('ghiChu', sql.NVarChar, ghiChu || null)
      .query(`UPDATE NguoiChamSoc SET HoTen=@hoTen,SoDienThoai=@sdt,Email=@email,NgheNghiep=@ngheNghiep,GhiChu=@ghiChu WHERE NguoiChamSocID=@id`);
    return ok(res, { id: parseInt(req.params.id) }, 'Cap nhat thanh cong');
  } catch (err) { next(err); }
};

module.exports = { getAll, getById, create, update };
