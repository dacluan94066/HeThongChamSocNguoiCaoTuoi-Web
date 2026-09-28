// controllers/thuoc.controller.js - Danh muc thuoc - dung schema that
// Bang: DanhMucThuoc (ThuocID, TenThuoc, HoatChat, DonViTinh, NhaSanXuat,
//       CachDung, TacDungPhu, MoTa, TrangThai BIT)
const { poolPromise, sql } = require('../config/db');
const { ok, fail } = require('../utils/response');

const mapThuoc = (row) => ({
  id:             row.id,
  tenThuoc:       row.tenThuoc,
  hoatChat:       row.hoatChat,
  donViTinh:      row.donViTinh,
  nhaSanXuat:     row.nhaSanXuat,
  cachDung:       row.cachDung,
  tacDungPhu:     row.tacDungPhu,
  moTa:           row.moTa,
  trangThai:      row.trangThai ? 'DANG_SU_DUNG' : 'NGUNG_SU_DUNG',
  trangThaiLabel: row.trangThai ? 'Đang sử dụng' : 'Ngừng sử dụng',
});

// GET /api/medications?keyword=
const getAll = async (req, res, next) => {
  try {
    const { keyword } = req.query;
    const pool = await poolPromise;
    let query = `
      SELECT ThuocID AS id, TenThuoc AS tenThuoc, HoatChat AS hoatChat,
        DonViTinh AS donViTinh, NhaSanXuat AS nhaSanXuat, CachDung AS cachDung,
        TacDungPhu AS tacDungPhu, MoTa AS moTa, TrangThai AS trangThai
      FROM DanhMucThuoc WHERE 1=1
    `;
    const req2 = pool.request();
    if (keyword && keyword.trim()) {
      query += ` AND (TenThuoc LIKE @kw OR HoatChat LIKE @kw)`;
      req2.input('kw', sql.NVarChar, `%${keyword.trim()}%`);
    }
    query += ` ORDER BY TenThuoc`;
    const result = await req2.query(query);
    return ok(res, result.recordset.map(mapThuoc));
  } catch (err) { next(err); }
};

// GET /api/medications/:id
const getById = async (req, res, next) => {
  try {
    const pool = await poolPromise;
    const result = await pool.request().input('id', sql.Int, req.params.id).query(`
      SELECT ThuocID AS id, TenThuoc AS tenThuoc, HoatChat AS hoatChat,
        DonViTinh AS donViTinh, NhaSanXuat AS nhaSanXuat, CachDung AS cachDung,
        TacDungPhu AS tacDungPhu, MoTa AS moTa, TrangThai AS trangThai
      FROM DanhMucThuoc WHERE ThuocID=@id`);
    if (!result.recordset.length) return fail(res, 'Khong tim thay thuoc', 'NOT_FOUND', 404);
    return ok(res, mapThuoc(result.recordset[0]));
  } catch (err) { next(err); }
};

// POST /api/medications
const create = async (req, res, next) => {
  try {
    const { tenThuoc, hoatChat, donViTinh, nhaSanXuat, cachDung, tacDungPhu, moTa } = req.body;
    if (!tenThuoc || !donViTinh) return fail(res, 'tenThuoc, donViTinh la bat buoc', 'MISSING_FIELDS', 400);
    const pool = await poolPromise;
    const r = await pool.request()
      .input('tenThuoc', sql.NVarChar, tenThuoc).input('hoatChat', sql.NVarChar, hoatChat || null)
      .input('donViTinh', sql.NVarChar, donViTinh).input('nhaSanXuat', sql.NVarChar, nhaSanXuat || null)
      .input('cachDung', sql.NVarChar, cachDung || null).input('tacDungPhu', sql.NVarChar, tacDungPhu || null)
      .input('moTa', sql.NVarChar, moTa || null)
      .query(`INSERT INTO DanhMucThuoc (TenThuoc,HoatChat,DonViTinh,NhaSanXuat,CachDung,TacDungPhu,MoTa,TrangThai)
              OUTPUT INSERTED.ThuocID AS id
              VALUES (@tenThuoc,@hoatChat,@donViTinh,@nhaSanXuat,@cachDung,@tacDungPhu,@moTa,1)`);
    return ok(res, { id: r.recordset[0].id }, 'Them thuoc thanh cong', 201);
  } catch (err) { next(err); }
};

// PUT /api/medications/:id
const update = async (req, res, next) => {
  try {
    const { tenThuoc, hoatChat, donViTinh, nhaSanXuat, cachDung, tacDungPhu, moTa } = req.body;
    const pool = await poolPromise;
    await pool.request()
      .input('id', sql.Int, req.params.id)
      .input('tenThuoc', sql.NVarChar, tenThuoc).input('hoatChat', sql.NVarChar, hoatChat || null)
      .input('donViTinh', sql.NVarChar, donViTinh || null).input('nhaSanXuat', sql.NVarChar, nhaSanXuat || null)
      .input('cachDung', sql.NVarChar, cachDung || null).input('tacDungPhu', sql.NVarChar, tacDungPhu || null)
      .input('moTa', sql.NVarChar, moTa || null)
      .query(`UPDATE DanhMucThuoc SET TenThuoc=@tenThuoc,HoatChat=@hoatChat,DonViTinh=@donViTinh,
              NhaSanXuat=@nhaSanXuat,CachDung=@cachDung,TacDungPhu=@tacDungPhu,MoTa=@moTa WHERE ThuocID=@id`);
    return ok(res, { id: parseInt(req.params.id) }, 'Cap nhat thuoc thanh cong');
  } catch (err) { next(err); }
};

// DELETE /api/medications/:id — xoa mem (TrangThai=0)
const remove = async (req, res, next) => {
  try {
    const pool = await poolPromise;
    await pool.request().input('id', sql.Int, req.params.id)
      .query(`UPDATE DanhMucThuoc SET TrangThai=0 WHERE ThuocID=@id`);
    return ok(res, { id: parseInt(req.params.id) }, 'Da ngung su dung thuoc');
  } catch (err) { next(err); }
};

module.exports = { getAll, getById, create, update, remove };
