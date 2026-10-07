const { poolPromise, sql } = require('../config/db');
const { ok, fail } = require('../utils/response');
const { scopedWhere } = require('../middlewares/mobile-scope.middleware');
const { emitToAdmin } = require('../socket');

const VALID_STATUSES = new Set(['DangGui', 'DaTiepNhan', 'DaXuLy', 'Huy']);

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
      .query('SELECT NguoiCaoTuoiID AS id, HoTen AS hoTen FROM HoSoNguoiCaoTuoi WHERE UserID = @userId');
    if (!profile.recordset.length) {
      return fail(res, 'Tai khoan chua co ho so nguoi cao tuoi lien ket', 'ELDERLY_PROFILE_NOT_FOUND', 404);
    }
    const elderlyId = profile.recordset[0].id;
    const elderlyName = profile.recordset[0].hoTen;
    transaction = new sql.Transaction(pool);
    await transaction.begin();
    const emergency = await new sql.Request(transaction)
      .input('elderlyId', sql.Int, elderlyId)
      .input('userId', sql.Int, req.user.userId)
      .input('viDo', sql.Decimal(9, 6), viDo)
      .input('kinhDo', sql.Decimal(9, 6), kinhDo)
      .input('noiDung', sql.NVarChar(500), noiDung || null)
      .query(`
        INSERT INTO CanhBaoKhanCap
          (NguoiCaoTuoiID, NguoiGuiID, ViDo, KinhDo, NoiDung, TrangThai)
        OUTPUT INSERTED.CanhBaoKhanCapID AS id, INSERTED.TrangThai AS trangThai,
          INSERTED.NgayGui AS ngayGui
        VALUES (@elderlyId, @userId, @viDo, @kinhDo, @noiDung, N'DangGui')
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
    const notificationContent = `${elderlyName} vừa gửi cảnh báo khẩn cấp, cần hỗ trợ ngay`;
    const notifications = await new sql.Request(transaction)
      .input('elderlyId', sql.Int, elderlyId)
      .input('emergencyId', sql.Int, emergencyId)
      .input('content', sql.NVarChar(500), notificationContent)
      .query(`
        INSERT INTO ThongBao
          (UserID, TieuDe, NoiDung, LoaiThongBao, LienKetBang, LienKetID, DaDoc)
        SELECT DISTINCT ncs.UserID, N'Cảnh báo khẩn cấp', @content,
          N'KhanCap', N'CanhBaoKhanCap', @emergencyId, 0
        FROM NguoiCaoTuoi_NguoiChamSoc lk
        INNER JOIN NguoiChamSoc ncs ON ncs.NguoiChamSocID = lk.NguoiChamSocID
        WHERE lk.NguoiCaoTuoiID = @elderlyId
          AND ncs.UserID IS NOT NULL
          AND lk.NgayBatDau <= CAST(GETDATE() AS DATE)
          AND (lk.NgayKetThuc IS NULL OR lk.NgayKetThuc >= CAST(GETDATE() AS DATE))
      `);
    await transaction.commit();
    transaction = null;
    emitToAdmin('canhbao:new', {
      id: alert.recordset[0].id,
      canhBaoId: alert.recordset[0].id,
      nguoiCaoTuoiId: elderlyId,
      nguoiCaoTuoiTen: elderlyName,
      loaiCanhBao: 'KhanCap',
      loaiCanhBaoLabel: 'Khẩn cấp',
      mucDo: 'KHAN_CAP',
      mucDoLabel: 'Khẩn cấp',
      moTa: noiDung || 'Người cao tuổi đã gửi cảnh báo SOS.',
      thoiGianPhatHien: emergency.recordset[0].ngayGui,
      trangThai: 'CHUA_XU_LY',
      trangThaiLabel: 'Chưa xử lý',
      nguonBang: 'CanhBaoKhanCap',
      nguonId: emergencyId,
    });
    return ok(res, {
      id: emergencyId,
      canhBaoId: alert.recordset[0].id,
      nguoiCaoTuoiId: elderlyId,
      trangThai: emergency.recordset[0].trangThai,
      ngayGui: emergency.recordset[0].ngayGui,
      soNguoiChamSocDaThongBao: notifications.rowsAffected[0] || 0,
    }, 'Da gui canh bao SOS', 201);
  } catch (error) {
    if (transaction) {
      try { await transaction.rollback(); } catch (_) { /* SQL da ket thuc transaction */ }
    }
    next(error);
  }
};

// GET /api/emergency-alerts?trangThai=
const getAll = async (req, res, next) => {
  const { trangThai } = req.query;
  if (trangThai && !VALID_STATUSES.has(trangThai)) {
    return fail(res, 'Trang thai canh bao khan cap khong hop le', 'INVALID_STATUS', 400);
  }

  try {
    const pool = await poolPromise;
    const request = pool.request();
    let query = `
      SELECT kc.CanhBaoKhanCapID AS id,
        kc.NguoiCaoTuoiID AS nguoiCaoTuoiId,
        nct.HoTen AS nguoiCaoTuoiTen,
        kc.NguoiGuiID AS nguoiGuiId,
        nguoiGui.HoTen AS nguoiGuiTen,
        kc.ViDo AS viDo,
        kc.KinhDo AS kinhDo,
        kc.NoiDung AS noiDung,
        kc.TrangThai AS trangThai,
        kc.NgayGui AS ngayGui,
        kc.NgayXuLy AS ngayXuLy,
        kc.NguoiXuLyID AS nguoiXuLyId,
        nguoiXuLy.HoTen AS nguoiXuLyTen
      FROM CanhBaoKhanCap kc
      INNER JOIN HoSoNguoiCaoTuoi nct ON nct.NguoiCaoTuoiID = kc.NguoiCaoTuoiID
      INNER JOIN NguoiDung nguoiGui ON nguoiGui.UserID = kc.NguoiGuiID
      LEFT JOIN NguoiDung nguoiXuLy ON nguoiXuLy.UserID = kc.NguoiXuLyID
      WHERE 1=1
    `;
    if (trangThai) {
      request.input('trangThai', sql.NVarChar(20), trangThai);
      query += ' AND kc.TrangThai = @trangThai';
    }
    query += scopedWhere(req, 'kc.NguoiCaoTuoiID');
    query += ' ORDER BY kc.NgayGui DESC, kc.CanhBaoKhanCapID DESC';
    const result = await request.query(query);
    return ok(res, result.recordset, `Tim thay ${result.recordset.length} canh bao khan cap`);
  } catch (error) { next(error); }
};

// PATCH /api/emergency-alerts/:id/handle
const handle = async (req, res, next) => {
  const id = Number(req.params.id);
  const trangThai = String(req.body.trangThai || 'DaTiepNhan').trim();
  if (!Number.isInteger(id) || id < 1) {
    return fail(res, 'ID canh bao khan cap khong hop le', 'INVALID_ID', 400);
  }
  if (!new Set(['DaTiepNhan', 'DaXuLy', 'Huy']).has(trangThai)) {
    return fail(res, 'Trang thai xu ly phai la DaTiepNhan, DaXuLy hoac Huy', 'INVALID_STATUS', 400);
  }

  let transaction;
  try {
    const pool = await poolPromise;
    transaction = new sql.Transaction(pool);
    await transaction.begin();
    const updated = await new sql.Request(transaction)
      .input('id', sql.Int, id)
      .input('userId', sql.Int, req.user.userId)
      .input('trangThai', sql.NVarChar(20), trangThai)
      .query(`
        UPDATE CanhBaoKhanCap
        SET TrangThai = @trangThai,
          NguoiXuLyID = @userId,
          NgayXuLy = CASE WHEN @trangThai IN (N'DaXuLy', N'Huy')
            THEN SYSDATETIME() ELSE NULL END
        OUTPUT INSERTED.CanhBaoKhanCapID AS id,
          INSERTED.TrangThai AS trangThai,
          INSERTED.NgayXuLy AS ngayXuLy,
          INSERTED.NguoiXuLyID AS nguoiXuLyId
        WHERE CanhBaoKhanCapID = @id
      `);
    if (!updated.recordset.length) {
      await transaction.rollback();
      transaction = null;
      return fail(res, 'Khong tim thay canh bao khan cap', 'NOT_FOUND', 404);
    }

    const genericStatus = trangThai === 'DaTiepNhan'
      ? 'DaXem'
      : (trangThai === 'Huy' ? 'BoQua' : 'DaXuLy');
    await new sql.Request(transaction)
      .input('id', sql.Int, id)
      .input('userId', sql.Int, req.user.userId)
      .input('genericStatus', sql.NVarChar(20), genericStatus)
      .query(`
        UPDATE CanhBao
        SET TrangThai = @genericStatus,
          NguoiXuLyID = @userId,
          NgayXuLy = CASE WHEN @genericStatus IN (N'DaXuLy', N'BoQua')
            THEN SYSDATETIME() ELSE NgayXuLy END
        WHERE NguonBang = N'CanhBaoKhanCap' AND NguonID = @id
      `);
    await transaction.commit();
    transaction = null;
    emitToAdmin('canhbao:updated', {
      ...updated.recordset[0],
      loaiCanhBao: 'KhanCap',
      nguonBang: 'CanhBaoKhanCap',
      nguonId: id,
    });
    return ok(res, updated.recordset[0], 'Cap nhat canh bao khan cap thanh cong');
  } catch (error) {
    if (transaction) {
      try { await transaction.rollback(); } catch (_) { /* transaction da ket thuc */ }
    }
    next(error);
  }
};

module.exports = { create, getAll, handle };
