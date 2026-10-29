// controllers/permission.controller.js - Quyen tai khoan va ma tran phan quyen
const { poolPromise, sql } = require('../config/db');
const { ok, fail } = require('../utils/response');
const { READ_FEATURES } = require('../utils/relativePolicy');

const requireAdministrator = (req, res) => {
  if (req.user?.tenVaiTro === 'QuanTriVien') return true;
  fail(res, 'Chi quan tri vien duoc thay doi ma tran phan quyen', 'FORBIDDEN', 403);
  return false;
};

// GET /api/permissions/me
const getMyPermissions = async (req, res, next) => {
  try {
    const pool = await poolPromise;
    const result = await pool.request()
      .input('VaiTroID', sql.Int, req.user.vaiTroId)
      .query(`
        SELECT
          cn.MaChucNang,
          cn.TenChucNang,
          pq.ChoPhepXem,
          pq.ChoPhepThem,
          pq.ChoPhepSua,
          pq.ChoPhepXoa
        FROM PhanQuyen pq
        INNER JOIN ChucNang cn ON cn.ChucNangID = pq.ChucNangID
        WHERE pq.VaiTroID = @VaiTroID
        ORDER BY cn.ChucNangID
      `);

    const permissions = result.recordset.map((row) => ({
      maChucNang: row.MaChucNang,
      tenChucNang: row.TenChucNang,
      xem: Boolean(row.ChoPhepXem) && (req.user.tenVaiTro!=='NguoiThan' || READ_FEATURES.includes(row.MaChucNang)),
      them: (req.user.tenVaiTro !== 'NguoiThan' || row.MaChucNang === 'QLCHISOSK') && Boolean(row.ChoPhepThem),
      sua: req.user.tenVaiTro!=='NguoiThan' && Boolean(row.ChoPhepSua),
      xoa: req.user.tenVaiTro!=='NguoiThan' && Boolean(row.ChoPhepXoa),
    }));

    return ok(res, permissions, 'Lay danh sach quyen thanh cong');
  } catch (err) {
    next(err);
  }
};

// GET /api/permissions/matrix
const getPermissionMatrix = async (req, res, next) => {
  if (!requireAdministrator(req, res)) return;
  try {
    const pool = await poolPromise;
    const [rolesResult, functionsResult, permissionsResult] = await Promise.all([
      pool.request().query(`
        SELECT VaiTroID AS id, TenVaiTro AS tenVaiTro, MoTa AS moTa
        FROM VaiTro
        WHERE TenVaiTro IN (N'QuanTriVien',N'NguoiChamSoc',N'NguoiCaoTuoi',N'NguoiThan')
        ORDER BY CASE TenVaiTro
          WHEN N'QuanTriVien' THEN 1
          WHEN N'NguoiChamSoc' THEN 2 WHEN N'NguoiCaoTuoi' THEN 3 ELSE 4 END
      `),
      pool.request().query(`
        SELECT ChucNangID AS id, MaChucNang AS maChucNang,
          TenChucNang AS tenChucNang, NhomChucNang AS nhomChucNang
        FROM ChucNang
        ORDER BY ChucNangID
      `),
      pool.request().query(`
        SELECT pq.VaiTroID AS vaiTroId, pq.ChucNangID AS chucNangId,
          pq.ChoPhepXem AS xem, pq.ChoPhepThem AS them,
          pq.ChoPhepSua AS sua, pq.ChoPhepXoa AS xoa
        FROM PhanQuyen pq
        INNER JOIN VaiTro vt ON vt.VaiTroID=pq.VaiTroID
        WHERE vt.TenVaiTro IN (N'QuanTriVien',N'NguoiChamSoc',N'NguoiCaoTuoi',N'NguoiThan')
      `),
    ]);
    const permissions = permissionsResult.recordset.map((row) => ({
      vaiTroId: row.vaiTroId,
      chucNangId: row.chucNangId,
      xem: Boolean(row.xem),
      them: Boolean(row.them),
      sua: Boolean(row.sua),
      xoa: Boolean(row.xoa),
    }));
    return ok(res, {
      roles: rolesResult.recordset,
      functions: functionsResult.recordset,
      permissions,
    }, 'Lay ma tran phan quyen thanh cong');
  } catch (err) {
    next(err);
  }
};

// PUT /api/permissions/matrix
const updatePermissionMatrix = async (req, res, next) => {
  if (!requireAdministrator(req, res)) return;
  const entries = Array.isArray(req.body?.permissions) ? req.body.permissions : [];
  let transaction;
  try {
    const pool = await poolPromise;
    const [rolesResult, functionsResult] = await Promise.all([
      pool.request().query(`
        SELECT VaiTroID AS id, TenVaiTro AS tenVaiTro FROM VaiTro
        WHERE TenVaiTro IN (N'QuanTriVien',N'NguoiChamSoc',N'NguoiCaoTuoi',N'NguoiThan')
      `),
      pool.request().query('SELECT ChucNangID AS id, MaChucNang AS maChucNang FROM ChucNang'),
    ]);
    const roleIds = new Set(rolesResult.recordset.map((row) => Number(row.id)));
    const relativeId=rolesResult.recordset.find(row=>row.tenVaiTro==='NguoiThan')?.id;
    const featureNames=new Map(functionsResult.recordset.map(row=>[Number(row.id),row.maChucNang]));
    const functionIds = new Set(functionsResult.recordset.map((row) => Number(row.id)));
    // Old Web clients still submit the complete 3-role matrix. Preserve the new
    // role when it is absent from that payload, rather than resetting it.
    const includesRelative=relativeId!=null && entries.some(row=>Number(row.vaiTroId)===Number(relativeId));
    const expectedCount = (roleIds.size-(relativeId!=null && !includesRelative ? 1 : 0)) * functionIds.size;
    const normalized = entries.map((entry) => ({
      vaiTroId: Number(entry.vaiTroId),
      chucNangId: Number(entry.chucNangId),
      xem: Boolean(entry.xem),
      them: Boolean(entry.them),
      sua: Boolean(entry.sua),
      xoa: Boolean(entry.xoa),
    }));
    const uniqueKeys = new Set(normalized.map((entry) => `${entry.vaiTroId}:${entry.chucNangId}`));
    const invalid = normalized.some((entry) => (
      !roleIds.has(entry.vaiTroId) || !functionIds.has(entry.chucNangId)
    ));
    const unsafeRelative=normalized.some(entry=>entry.vaiTroId===Number(relativeId)
      && (((entry.them && featureNames.get(entry.chucNangId) !== 'QLCHISOSK')) || entry.sua || entry.xoa || (entry.xem && !READ_FEATURES.includes(featureNames.get(entry.chucNangId)))));
    if (![3,4].includes(roleIds.size) || unsafeRelative || !expectedCount || normalized.length !== expectedCount
      || uniqueKeys.size !== expectedCount || invalid) {
      return fail(res, 'Ma tran phan quyen khong day du hoac khong hop le', 'INVALID_PERMISSION_MATRIX', 400);
    }

    transaction = new sql.Transaction(pool);
    await transaction.begin(sql.ISOLATION_LEVEL.SERIALIZABLE);
    for (const entry of normalized) {
      await new sql.Request(transaction)
        .input('vaiTroId', sql.Int, entry.vaiTroId)
        .input('chucNangId', sql.Int, entry.chucNangId)
        .input('xem', sql.Bit, entry.xem)
        .input('them', sql.Bit, entry.them)
        .input('sua', sql.Bit, entry.sua)
        .input('xoa', sql.Bit, entry.xoa)
        .query(`
          MERGE PhanQuyen WITH (HOLDLOCK) AS target
          USING (SELECT @vaiTroId AS VaiTroID, @chucNangId AS ChucNangID) AS source
          ON target.VaiTroID=source.VaiTroID AND target.ChucNangID=source.ChucNangID
          WHEN MATCHED THEN UPDATE SET
            ChoPhepXem=@xem, ChoPhepThem=@them, ChoPhepSua=@sua, ChoPhepXoa=@xoa
          WHEN NOT MATCHED THEN
            INSERT (VaiTroID,ChucNangID,ChoPhepXem,ChoPhepThem,ChoPhepSua,ChoPhepXoa)
            VALUES (@vaiTroId,@chucNangId,@xem,@them,@sua,@xoa);
        `);
    }
    await transaction.commit();
    transaction = null;
    return ok(res, { updated: normalized.length }, 'Luu ma tran phan quyen thanh cong');
  } catch (err) {
    if (transaction) {
      try { await transaction.rollback(); } catch (_) { /* transaction da ket thuc */ }
    }
    next(err);
  }
};

module.exports = { getMyPermissions, getPermissionMatrix, updatePermissionMatrix };
