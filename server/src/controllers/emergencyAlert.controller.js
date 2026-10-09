const { poolPromise, sql } = require('../config/db');
const { ok, fail } = require('../utils/response');
const {scopedWhere,isMobileRole}=require('../middlewares/mobile-scope.middleware');
const getMine=async(req,res,next)=>{
 try{
  if(!isMobileRole(req))return fail(res,'Đường dẫn này chỉ dành cho tài khoản mobile.','FORBIDDEN',403);
  const pool=await poolPromise;
  const result=await pool.request().query(`SELECT CanhBaoKhanCapID AS id,NguoiCaoTuoiID AS nguoiCaoTuoiId,NoiDung AS noiDung,TrangThai AS trangThai,
    CONVERT(VARCHAR(19),NgayGui,126) AS ngayGui FROM CanhBaoKhanCap WHERE 1=1 ${scopedWhere(req,'NguoiCaoTuoiID')} ORDER BY NgayGui DESC,CanhBaoKhanCapID DESC`);
  return ok(res,result.recordset);
 }catch(error){next(error);}
};

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
        OUTPUT INSERTED.CanhBaoKhanCapID AS id,
          CONVERT(VARCHAR(19),INSERTED.NgayGui,126) AS ngayGui,INSERTED.TrangThai AS trangThai
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
    const delivery=await new sql.Request(transaction)
      .input('elderlyId',sql.Int,elderlyId).input('emergencyId',sql.Int,emergencyId)
      .input('noiDung',sql.NVarChar(500),noiDung||'Người cao tuổi đã gửi SOS.')
      .query(`INSERT INTO ThongBao(UserID,TieuDe,NoiDung,LoaiThongBao,LienKetBang,LienKetID)
        OUTPUT INSERTED.ThongBaoID AS id
        SELECT DISTINCT nd.UserID,N'Cảnh báo SOS',@noiDung,N'KhanCap',N'CanhBaoKhanCap',@emergencyId
        FROM NguoiCaoTuoi_NguoiChamSoc lk JOIN NguoiChamSoc ncs ON ncs.NguoiChamSocID=lk.NguoiChamSocID
        JOIN NguoiDung nd ON nd.UserID=ncs.UserID
        WHERE lk.NguoiCaoTuoiID=@elderlyId AND nd.TrangThai=N'HoatDong' AND ncs.TrangThai=N'DangLamViec'
        AND lk.NgayBatDau<=CAST(DATEADD(HOUR,7,SYSUTCDATETIME()) AS DATE)
        AND (lk.NgayKetThuc IS NULL OR lk.NgayKetThuc>=CAST(DATEADD(HOUR,7,SYSUTCDATETIME()) AS DATE))`);
    await transaction.commit();
    transaction = null;
    return ok(res, { ...emergency.recordset[0], canhBaoId: alert.recordset[0].id, nguoiCaoTuoiId: elderlyId, soNguoiChamSocDaThongBao:delivery.recordset.length }, 'Da gui canh bao SOS', 201);
  } catch (error) {
    if (transaction) {
      try { await transaction.rollback(); } catch (_) { /* SQL da ket thuc transaction */ }
    }
    next(error);
  }
};

module.exports = { create, getMine };
