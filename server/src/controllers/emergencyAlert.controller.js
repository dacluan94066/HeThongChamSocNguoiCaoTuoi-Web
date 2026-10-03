const { poolPromise, sql } = require('../config/db');
const { ok, fail } = require('../utils/response');

const create = async (req, res, next) => {
  if (req.user.tenVaiTro !== 'NguoiCaoTuoi') {
    return fail(res, 'Chi tai khoan nguoi cao tuoi duoc gui SOS cho ho so cua minh', 'FORBIDDEN', 403);
  }
  const noiDung = typeof req.body.noiDung === 'string' ? req.body.noiDung.trim() : '';
  if (noiDung.length > 500) return fail(res, 'Noi dung khong duoc qua 500 ky tu', 'INVALID_CONTENT', 400);
  const parseCoordinate = (value, min, max) => {
    if (value == null) return null;
    if (typeof value !== 'number' || !Number.isFinite(value) || value < min || value > max) return undefined;
    return value;
  };
  const viDo = parseCoordinate(req.body.viDo, -90, 90);
  const kinhDo = parseCoordinate(req.body.kinhDo, -180, 180);
  if (viDo === undefined || kinhDo === undefined || (viDo == null) !== (kinhDo == null)) {
    return fail(res, 'Vi do va kinh do phai la hai so hop le hoac cung duoc bo qua', 'INVALID_COORDINATES', 400);
  }

  let transaction;
  try {
    const pool = await poolPromise;
    // Lay lai ho so bang UserID ngay khi ghi, khong su dung ID do client gui.
    const profile = await pool.request().input('userId', sql.Int, req.user.userId)
      .query('SELECT NguoiCaoTuoiID AS id FROM HoSoNguoiCaoTuoi WHERE UserID = @userId');
    if (!profile.recordset.length) {
      return fail(res, 'Tai khoan chua co ho so nguoi cao tuoi lien ket', 'ELDERLY_PROFILE_NOT_FOUND', 404);
    }
    const elderlyId = profile.recordset[0].id;
    transaction = new sql.Transaction(pool);
    await transaction.begin();
    const emergency = await new sql.Request(transaction)
      .input('elderlyId', sql.Int, elderlyId)
      .input('userId', sql.Int, req.user.userId)
      .input('viDo', sql.Decimal(9, 6), viDo)
      .input('kinhDo', sql.Decimal(9, 6), kinhDo)
      .input('noiDung', sql.NVarChar(500), noiDung || null)
      .query(`
        INSERT INTO CanhBaoKhanCap (NguoiCaoTuoiID, NguoiGuiID, ViDo, KinhDo, NoiDung)
        OUTPUT INSERTED.CanhBaoKhanCapID AS id
        VALUES (@elderlyId, @userId, @viDo, @kinhDo, @noiDung)
      `);
    const emergencyId = emergency.recordset[0].id;
    const alert = await new sql.Request(transaction)
      .input('elderlyId', sql.Int, elderlyId)
      .input('emergencyId', sql.Int, emergencyId)
      .input('noiDung', sql.NVarChar(500), noiDung || 'Nguoi cao tuoi da gui canh bao SOS.')
      .query(`
        INSERT INTO CanhBao (NguoiCaoTuoiID, LoaiCanhBao, NoiDung, MucDo, NguonBang, NguonID)
        OUTPUT INSERTED.CanhBaoID AS id
        VALUES (@elderlyId, N'KhanCap', @noiDung, N'KhanCap', N'CanhBaoKhanCap', @emergencyId)
      `);
    await transaction.commit();
    transaction = null;
    return ok(res, { id: emergencyId, canhBaoId: alert.recordset[0].id, nguoiCaoTuoiId: elderlyId }, 'Da gui canh bao SOS', 201);
  } catch (error) {
    if (transaction) {
      try { await transaction.rollback(); } catch (_) { /* SQL da ket thuc transaction */ }
    }
    next(error);
  }
};

module.exports = { create };
