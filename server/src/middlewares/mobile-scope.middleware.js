const { poolPromise, sql } = require('../config/db');
const { fail } = require('../utils/response');

const isMobileRole = (req) => ['NguoiCaoTuoi', 'NguoiChamSoc'].includes(req.user?.tenVaiTro);

// IDs are loaded from the database, never taken from query/body parameters.
const loadMobileScope = async (req, res, next) => {
  if (!isMobileRole(req)) return next();

  try {
    const pool = await poolPromise;
    const result = req.user.tenVaiTro === 'NguoiCaoTuoi'
      ? await pool.request().input('userId', sql.Int, req.user.userId)
        .query('SELECT NguoiCaoTuoiID AS id FROM HoSoNguoiCaoTuoi WHERE UserID = @userId')
      : await pool.request().input('userId', sql.Int, req.user.userId)
        .query(`
          SELECT DISTINCT lk.NguoiCaoTuoiID AS id
          FROM NguoiChamSoc ncs
          JOIN NguoiCaoTuoi_NguoiChamSoc lk ON lk.NguoiChamSocID = ncs.NguoiChamSocID
          WHERE ncs.UserID = @userId
            AND lk.NgayBatDau <= CAST(GETDATE() AS DATE)
            AND (lk.NgayKetThuc IS NULL OR lk.NgayKetThuc >= CAST(GETDATE() AS DATE))
        `);

    req.mobileElderlyIds = result.recordset.map((row) => Number(row.id));
    next();
  } catch (error) {
    next(error);
  }
};

const scopedWhere = (req, column) => {
  if (!isMobileRole(req)) return '';
  const ids = req.mobileElderlyIds || [];
  return ids.length ? ` AND ${column} IN (${ids.join(',')})` : ' AND 1=0';
};

const ownsElderlyId = (req, id) => !isMobileRole(req)
  || (Number.isInteger(Number(id)) && (req.mobileElderlyIds || []).includes(Number(id)));

const targetElderlyId = (req, requestedId) => {
  if (req.user?.tenVaiTro === 'NguoiCaoTuoi') {
    const ownId = req.mobileElderlyIds?.[0];
    if (!ownId || (requestedId != null && Number(requestedId) !== ownId)) return null;
    return ownId;
  }
  if (req.user?.tenVaiTro === 'NguoiChamSoc') {
    return ownsElderlyId(req, requestedId) ? Number(requestedId) : null;
  }
  return requestedId;
};

// Applied before ID-based reads/updates/deletes. The table/column are fixed by route code.
const guardResource = (table, idColumn) => async (req, res, next) => {
  if (!isMobileRole(req)) return next();
  const resourceId = Number(req.params.id);
  if (!Number.isInteger(resourceId) || resourceId < 1) {
    return fail(res, 'ID khong hop le', 'INVALID_ID', 400);
  }
  try {
    const pool = await poolPromise;
    const result = await pool.request().input('id', sql.Int, resourceId)
      .query(`SELECT NguoiCaoTuoiID AS elderlyId FROM ${table} WHERE ${idColumn} = @id`);
    if (!result.recordset.length) return fail(res, 'Khong tim thay du lieu', 'NOT_FOUND', 404);
    if (!ownsElderlyId(req, result.recordset[0].elderlyId)) {
      return fail(res, 'Khong co quyen truy cap ho so nay', 'FORBIDDEN_ELDERLY', 403);
    }
    next();
  } catch (error) {
    next(error);
  }
};

const caregiverOnlyWrite = (req, res, next) => {
  if (req.user?.tenVaiTro === 'NguoiCaoTuoi') {
    return fail(res, 'Tai khoan khong co quyen thay doi du lieu nay', 'FORBIDDEN', 403);
  }
  next();
};

const webOnlyWrite = (req, res, next) => {
  if (isMobileRole(req)) {
    return fail(res, 'Tai khoan khong co quyen thay doi du lieu nay', 'FORBIDDEN', 403);
  }
  next();
};

module.exports = {
  isMobileRole, loadMobileScope, scopedWhere, ownsElderlyId,
  targetElderlyId, guardResource, caregiverOnlyWrite, webOnlyWrite,
};
