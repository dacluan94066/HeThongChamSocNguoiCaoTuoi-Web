// controllers/lienHeKhanCap.controller.js - Lien he khan cap - dung schema that
// Bang LienHeKhanCap: LienHeID, NguoiCaoTuoiID, HoTen, MoiQuanHe,
//   SoDienThoai, SoDienThoaiPhu, Email, DiaChi, GhiChu, ThuTuUuTien
const { poolPromise, sql } = require('../config/db');
const { ok, fail } = require('../utils/response');
const { scopedWhere, targetElderlyId, ownsElderlyId, isMobileRole } = require('../middlewares/mobile-scope.middleware');
const { validatePhoneNumber } = require('../utils/phoneValidation');

const phoneError = (primary, secondary) => {
  const primaryError = validatePhoneNumber(primary, { label: 'Số điện thoại chính' });
  if (primaryError) return { message: primaryError, code: 'INVALID_PHONE' };
  const secondaryError = validatePhoneNumber(secondary, { required: false, label: 'Số điện thoại phụ' });
  return secondaryError ? { message: secondaryError, code: 'INVALID_SECONDARY_PHONE' } : null;
};

const mapContact = (row) => ({
  id:              row.id,
  nguoiCaoTuoiId:  row.nguoiCaoTuoiId,
  nguoiCaoTuoiTen: row.nguoiCaoTuoiTen,
  hoTen:           row.hoTen,
  moiQuanHe:       row.moiQuanHe,
  soDienThoai:     row.soDienThoai,
  soDienThoaiPhu:  row.soDienThoaiPhu,
  email:           row.email,
  diaChi:          row.diaChi,
  uuTien:          row.thuTuUuTien,
  ghiChu:          row.ghiChu,
});

// GET /api/emergency-contacts?nguoiCaoTuoiId=
const getAll = async (req, res, next) => {
  try {
    const { nguoiCaoTuoiId } = req.query;
    const pool = await poolPromise;
    let query = `
      SELECT l.LienHeID AS id, l.NguoiCaoTuoiID AS nguoiCaoTuoiId,
        nct.HoTen AS nguoiCaoTuoiTen, l.HoTen AS hoTen, l.MoiQuanHe AS moiQuanHe,
        l.SoDienThoai AS soDienThoai, l.SoDienThoaiPhu AS soDienThoaiPhu,
        l.Email AS email, l.DiaChi AS diaChi, l.GhiChu AS ghiChu,
        l.ThuTuUuTien AS thuTuUuTien
      FROM LienHeKhanCap l
      JOIN HoSoNguoiCaoTuoi nct ON l.NguoiCaoTuoiID = nct.NguoiCaoTuoiID
      WHERE 1=1
    `;
    const req2 = pool.request();
    if (nguoiCaoTuoiId) { query += ` AND l.NguoiCaoTuoiID=@nctId`; req2.input('nctId', sql.Int, parseInt(nguoiCaoTuoiId)); }
    query += scopedWhere(req, 'l.NguoiCaoTuoiID');
    query += ` ORDER BY l.NguoiCaoTuoiID, l.ThuTuUuTien`;
    const result = await req2.query(query);
    return ok(res, result.recordset.map(mapContact));
  } catch (err) { next(err); }
};

// POST /api/emergency-contacts
const create = async (req, res, next) => {
  try {
    const { hoTen, moiQuanHe, soDienThoai, soDienThoaiPhu, email, diaChi, uuTien, ghiChu } = req.body;
    const nguoiCaoTuoiId = targetElderlyId(req, req.body.nguoiCaoTuoiId);
    if (isMobileRole(req) && nguoiCaoTuoiId == null) return fail(res, 'Khong co quyen them lien he cho ho so nay', 'FORBIDDEN_ELDERLY', 403);
    if (!nguoiCaoTuoiId || !hoTen || !soDienThoai)
      return fail(res, 'nguoiCaoTuoiId, hoTen, soDienThoai la bat buoc', 'MISSING_FIELDS', 400);
    const invalidPhone = phoneError(soDienThoai, soDienThoaiPhu);
    if (invalidPhone) return fail(res, invalidPhone.message, invalidPhone.code, 422);
    const pool = await poolPromise;
    const r = await pool.request()
      .input('nctId', sql.Int, nguoiCaoTuoiId).input('hoTen', sql.NVarChar, hoTen)
      .input('moiQuanHe', sql.NVarChar, moiQuanHe || null).input('sdt', sql.NVarChar, soDienThoai.trim())
      .input('sdtPhu', sql.NVarChar, soDienThoaiPhu?.trim() || null).input('email', sql.VarChar, email || null)
      .input('diaChi', sql.NVarChar, diaChi || null).input('ghiChu', sql.NVarChar, ghiChu || null)
      .input('uuTien', sql.Int, uuTien || 1)
      .query(`INSERT INTO LienHeKhanCap (NguoiCaoTuoiID,HoTen,MoiQuanHe,SoDienThoai,SoDienThoaiPhu,Email,DiaChi,GhiChu,ThuTuUuTien)
              OUTPUT INSERTED.LienHeID AS id
              VALUES (@nctId,@hoTen,@moiQuanHe,@sdt,@sdtPhu,@email,@diaChi,@ghiChu,@uuTien)`);
    return ok(res, { id: r.recordset[0].id }, 'Them lien he thanh cong', 201);
  } catch (err) { next(err); }
};

// PUT /api/emergency-contacts/:id
const update = async (req, res, next) => {
  try {
    const { nguoiCaoTuoiId, hoTen, moiQuanHe, soDienThoai, soDienThoaiPhu, email, diaChi, uuTien, ghiChu } = req.body;
    if (isMobileRole(req) && !ownsElderlyId(req, nguoiCaoTuoiId))
      return fail(res, 'Khong co quyen chuyen lien he sang ho so nay', 'FORBIDDEN_ELDERLY', 403);
    if (!nguoiCaoTuoiId || !hoTen || !soDienThoai)
      return fail(res, 'nguoiCaoTuoiId, hoTen, soDienThoai la bat buoc', 'MISSING_FIELDS', 400);
    const invalidPhone = phoneError(soDienThoai, soDienThoaiPhu);
    if (invalidPhone) return fail(res, invalidPhone.message, invalidPhone.code, 422);
    const pool = await poolPromise;
    await pool.request()
      .input('id', sql.Int, req.params.id).input('nctId', sql.Int, nguoiCaoTuoiId)
      .input('hoTen', sql.NVarChar, hoTen).input('moiQuanHe', sql.NVarChar, moiQuanHe || null)
      .input('sdt', sql.NVarChar, soDienThoai.trim()).input('sdtPhu', sql.NVarChar, soDienThoaiPhu?.trim() || null)
      .input('email', sql.VarChar, email || null).input('diaChi', sql.NVarChar, diaChi || null)
      .input('ghiChu', sql.NVarChar, ghiChu || null)
      .input('uuTien', sql.Int, uuTien || 1)
      .query(`UPDATE LienHeKhanCap SET NguoiCaoTuoiID=@nctId,HoTen=@hoTen,MoiQuanHe=@moiQuanHe,
              SoDienThoai=@sdt,SoDienThoaiPhu=@sdtPhu,Email=@email,DiaChi=@diaChi,
              GhiChu=@ghiChu,ThuTuUuTien=@uuTien WHERE LienHeID=@id`);
    return ok(res, { id: parseInt(req.params.id) }, 'Cap nhat thanh cong');
  } catch (err) { next(err); }
};

// PATCH /api/emergency-contacts/priorities
const reorder = async (req, res, next) => {
  const nguoiCaoTuoiId = targetElderlyId(req, req.body.nguoiCaoTuoiId);
  const orderedIds = Array.isArray(req.body.orderedIds)
    ? req.body.orderedIds.map(Number)
    : [];
  if (!nguoiCaoTuoiId || !orderedIds.length || orderedIds.some((id) => !Number.isInteger(id) || id < 1)) {
    return fail(res, 'Danh sach thu tu uu tien khong hop le', 'INVALID_PRIORITY_ORDER', 400);
  }
  if (new Set(orderedIds).size !== orderedIds.length) {
    return fail(res, 'Danh sach lien he bi trung lap', 'DUPLICATE_CONTACT_ID', 400);
  }

  let transaction;
  try {
    const pool = await poolPromise;
    transaction = new sql.Transaction(pool);
    await transaction.begin(sql.ISOLATION_LEVEL.SERIALIZABLE);
    const request = new sql.Request(transaction).input('nctId', sql.Int, nguoiCaoTuoiId);
    const placeholders = orderedIds.map((id, index) => {
      request.input(`id${index}`, sql.Int, id);
      return `@id${index}`;
    });
    const existing = await request.query(`
      SELECT LienHeID AS id
      FROM LienHeKhanCap WITH (UPDLOCK, HOLDLOCK)
      WHERE NguoiCaoTuoiID=@nctId AND LienHeID IN (${placeholders.join(',')})
    `);
    if (existing.recordset.length !== orderedIds.length) {
      await transaction.rollback();
      transaction = null;
      return fail(res, 'Co lien he khong thuoc ho so da chon', 'CONTACT_SCOPE_MISMATCH', 409);
    }
    for (let index = 0; index < orderedIds.length; index += 1) {
      await new sql.Request(transaction)
        .input('id', sql.Int, orderedIds[index])
        .input('priority', sql.Int, index + 1)
        .query('UPDATE LienHeKhanCap SET ThuTuUuTien=@priority WHERE LienHeID=@id');
    }
    await transaction.commit();
    transaction = null;
    return ok(res, { nguoiCaoTuoiId: Number(nguoiCaoTuoiId), orderedIds }, 'Cap nhat thu tu uu tien thanh cong');
  } catch (err) {
    if (transaction) {
      try { await transaction.rollback(); } catch (_) { /* transaction da ket thuc */ }
    }
    next(err);
  }
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

module.exports = { getAll, create, update, remove, reorder };
