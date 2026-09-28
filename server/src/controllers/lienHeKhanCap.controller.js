// controllers/lienHeKhanCap.controller.js - Lien he khan cap - dung schema that
// Bang LienHeKhanCap: LienHeID, NguoiCaoTuoiID, HoTen, MoiQuanHe,
//   SoDienThoai, DiaChi, ThuTuUuTien
const { poolPromise, sql } = require('../config/db');
const { ok, fail } = require('../utils/response');

const mapContact = (row) => ({
  id:              row.id,
  nguoiCaoTuoiId:  row.nguoiCaoTuoiId,
  nguoiCaoTuoiTen: row.nguoiCaoTuoiTen,
  hoTen:           row.hoTen,
  moiQuanHe:       row.moiQuanHe,
  soDienThoai:     row.soDienThoai,
  soDienThoaiPhu:  null, // bang khong co cot nay
  email:           null, // bang khong co cot nay
  uuTien:          row.thuTuUuTien,
  ghiChu:          row.diaChi,
});

// GET /api/emergency-contacts?nguoiCaoTuoiId=
const getAll = async (req, res, next) => {
  try {
    const { nguoiCaoTuoiId } = req.query;
    const pool = await poolPromise;
    let query = `
      SELECT l.LienHeID AS id, l.NguoiCaoTuoiID AS nguoiCaoTuoiId,
        nct.HoTen AS nguoiCaoTuoiTen, l.HoTen AS hoTen, l.MoiQuanHe AS moiQuanHe,
        l.SoDienThoai AS soDienThoai, l.DiaChi AS diaChi, l.ThuTuUuTien AS thuTuUuTien
      FROM LienHeKhanCap l
      JOIN HoSoNguoiCaoTuoi nct ON l.NguoiCaoTuoiID = nct.NguoiCaoTuoiID
      WHERE 1=1
    `;
    const req2 = pool.request();
    if (nguoiCaoTuoiId) { query += ` AND l.NguoiCaoTuoiID=@nctId`; req2.input('nctId', sql.Int, parseInt(nguoiCaoTuoiId)); }
    query += ` ORDER BY l.NguoiCaoTuoiID, l.ThuTuUuTien`;
    const result = await req2.query(query);
    return ok(res, result.recordset.map(mapContact));
  } catch (err) { next(err); }
};

// POST /api/emergency-contacts
const create = async (req, res, next) => {
  try {
    const { nguoiCaoTuoiId, hoTen, moiQuanHe, soDienThoai, uuTien, ghiChu } = req.body;
    if (!nguoiCaoTuoiId || !hoTen || !soDienThoai)
      return fail(res, 'nguoiCaoTuoiId, hoTen, soDienThoai la bat buoc', 'MISSING_FIELDS', 400);
    const pool = await poolPromise;
    const r = await pool.request()
      .input('nctId', sql.Int, nguoiCaoTuoiId).input('hoTen', sql.NVarChar, hoTen)
      .input('moiQuanHe', sql.NVarChar, moiQuanHe || null).input('sdt', sql.NVarChar, soDienThoai)
      .input('diaChi', sql.NVarChar, ghiChu || null).input('uuTien', sql.Int, uuTien || 1)
      .query(`INSERT INTO LienHeKhanCap (NguoiCaoTuoiID,HoTen,MoiQuanHe,SoDienThoai,DiaChi,ThuTuUuTien)
              OUTPUT INSERTED.LienHeID AS id
              VALUES (@nctId,@hoTen,@moiQuanHe,@sdt,@diaChi,@uuTien)`);
    return ok(res, { id: r.recordset[0].id }, 'Them lien he thanh cong', 201);
  } catch (err) { next(err); }
};

// PUT /api/emergency-contacts/:id
const update = async (req, res, next) => {
  try {
    const { nguoiCaoTuoiId, hoTen, moiQuanHe, soDienThoai, uuTien, ghiChu } = req.body;
    const pool = await poolPromise;
    await pool.request()
      .input('id', sql.Int, req.params.id).input('nctId', sql.Int, nguoiCaoTuoiId)
      .input('hoTen', sql.NVarChar, hoTen).input('moiQuanHe', sql.NVarChar, moiQuanHe || null)
      .input('sdt', sql.NVarChar, soDienThoai).input('diaChi', sql.NVarChar, ghiChu || null)
      .input('uuTien', sql.Int, uuTien || 1)
      .query(`UPDATE LienHeKhanCap SET NguoiCaoTuoiID=@nctId,HoTen=@hoTen,MoiQuanHe=@moiQuanHe,
              SoDienThoai=@sdt,DiaChi=@diaChi,ThuTuUuTien=@uuTien WHERE LienHeID=@id`);
    return ok(res, { id: parseInt(req.params.id) }, 'Cap nhat thanh cong');
  } catch (err) { next(err); }
};

// DELETE /api/emergency-contacts/:id
const remove = async (req, res, next) => {
  try {
    const pool = await poolPromise;
    await pool.request().input('id', sql.Int, req.params.id)
      .query(`DELETE FROM LienHeKhanCap WHERE LienHeID=@id`);
    return ok(res, { id: parseInt(req.params.id) }, 'Da xoa lien he');
  } catch (err) { next(err); }
};

module.exports = { getAll, create, update, remove };
