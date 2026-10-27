const { poolPromise, sql } = require('../config/db');
const { ok, fail } = require('../utils/response');
const {scopedWhere}=require('../middlewares/mobile-scope.middleware');
const { notifyAlertRecipients, emitAlertNotifications } = require('../services/alertNotification.service');
const { alertTimestampSql } = require('../utils/alertTime');
const getMine=async(req,res,next)=>{
 try{
  const pool=await poolPromise;
  const result=await pool.request().query(`
    SELECT sos.CanhBaoKhanCapID AS id,
      linked.CanhBaoID AS canhBaoId,
      sos.NguoiCaoTuoiID AS nguoiCaoTuoiId,
      nct.HoTen AS nguoiCaoTuoiTen,
      sos.NoiDung AS noiDung,
      sos.ViDo AS viDo,
      sos.KinhDo AS kinhDo,
      sos.TrangThai AS trangThai,
      ${alertTimestampSql('sos.NgayGui')} AS ngayGui,
      sos.NguoiXuLyID AS nguoiXuLyId,
      nd.HoTen AS nguoiXuLy,
      ${alertTimestampSql('sos.NgayXuLy')} AS ngayXuLy,
      ${alertTimestampSql('linked.NgayTao')} AS ngayTao,
      linked.GhiChuXuLy AS ghiChuXuLy
    FROM CanhBaoKhanCap sos
    INNER JOIN HoSoNguoiCaoTuoi nct ON nct.NguoiCaoTuoiID = sos.NguoiCaoTuoiID
    LEFT JOIN NguoiDung nd ON nd.UserID = sos.NguoiXuLyID
    OUTER APPLY (
      SELECT TOP 1 c.CanhBaoID, c.NgayTao, c.GhiChuXuLy
      FROM CanhBao c
      WHERE c.NguonBang = N'CanhBaoKhanCap'
        AND c.NguonID = sos.CanhBaoKhanCapID
      ORDER BY c.CanhBaoID DESC
    ) linked
    WHERE 1=1 ${scopedWhere(req,'sos.NguoiCaoTuoiID')}
    ORDER BY sos.NgayGui DESC, sos.CanhBaoKhanCapID DESC
  `);
  const statusMap={DangGui:'CHUA_XU_LY',DaTiepNhan:'DA_XEM',DaXuLy:'DA_XU_LY'};
  return ok(res,result.recordset.map(row=>({
    ...row,
    trangThai:statusMap[row.trangThai]||row.trangThai,
    mucDo:'KHAN_CAP',
    loaiCanhBao:'KhanCap',
    loaiCanhBaoLabel:'SOS khẩn cấp',
    moTa:row.noiDung||'Người cao tuổi đã gửi cảnh báo SOS.',
    thoiGianPhatHien:row.ngayGui,
    thoiGianXuLy:row.ngayXuLy,
    nguonBang:'CanhBaoKhanCap',
    nguonId:row.id,
  })));
 }catch(error){next(error);}
};

const create = async (req, res, next) => {
  if (req.user.tenVaiTro !== 'NguoiCaoTuoi') {
    return fail(res, 'Chi tai khoan nguoi cao tuoi duoc gui SOS cho ho so cua minh', 'FORBIDDEN', 403);
  }
  const noiDung = typeof req.body.noiDung === 'string' ? req.body.noiDung.trim() : '';
  const content = noiDung || 'Cảnh báo SOS khẩn cấp';
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
      .query('SELECT NguoiCaoTuoiID AS id, HoTen AS name FROM HoSoNguoiCaoTuoi WHERE UserID = @userId');
    if (!profile.recordset.length) {
      return fail(res, 'Tai khoan chua co ho so nguoi cao tuoi lien ket', 'ELDERLY_PROFILE_NOT_FOUND', 404);
    }
    const elderlyId = profile.recordset[0].id;
    const elderlyName = profile.recordset[0].name;
    transaction = new sql.Transaction(pool);
    await transaction.begin(sql.ISOLATION_LEVEL.SERIALIZABLE);
    const duplicate = await new sql.Request(transaction)
      .input('elderlyId', sql.Int, elderlyId)
      .query(`SELECT TOP (1) sos.CanhBaoKhanCapID AS id, sos.TrangThai AS trangThai,
        sos.ViDo AS viDo, sos.KinhDo AS kinhDo,
        ${alertTimestampSql('sos.NgayGui')} AS ngayGui,
        linked.CanhBaoID AS canhBaoId,
        (SELECT COUNT(DISTINCT tb.UserID) FROM ThongBao tb
          JOIN NguoiDung nd ON nd.UserID=tb.UserID
          JOIN VaiTro vt ON vt.VaiTroID=nd.VaiTroID
          WHERE tb.LienKetBang=N'CanhBaoKhanCap' AND tb.LienKetID=sos.CanhBaoKhanCapID
            AND vt.TenVaiTro=N'NguoiChamSoc') AS soNguoiChamSocNhan
        FROM CanhBaoKhanCap sos WITH (UPDLOCK, HOLDLOCK)
        OUTER APPLY (SELECT TOP (1) CanhBaoID FROM CanhBao
          WHERE NguonBang=N'CanhBaoKhanCap' AND NguonID=sos.CanhBaoKhanCapID
          ORDER BY CanhBaoID DESC) linked
        WHERE sos.NguoiCaoTuoiID=@elderlyId
          AND sos.NgayGui>=DATEADD(SECOND,-30,SYSDATETIME())
        ORDER BY sos.NgayGui DESC,sos.CanhBaoKhanCapID DESC`);
    if (duplicate.recordset.length) {
      await transaction.commit();
      transaction = null;
      const previous = duplicate.recordset[0];
      return ok(res, { ...previous, nguoiCaoTuoiId: elderlyId,
        soNguoiChamSocDaThongBao: previous.soNguoiChamSocNhan,
        trungLap: true }, 'SOS đã được ghi nhận trong 30 giây gần đây');
    }
    const emergency = await new sql.Request(transaction)
      .input('elderlyId', sql.Int, elderlyId)
      .input('userId', sql.Int, req.user.userId)
      .input('viDo', sql.Decimal(9, 6), viDo)
      .input('kinhDo', sql.Decimal(9, 6), kinhDo)
      .input('noiDung', sql.NVarChar(500), content)
      .query(`
        INSERT INTO CanhBaoKhanCap (NguoiCaoTuoiID, NguoiGuiID, ViDo, KinhDo, NoiDung)
        OUTPUT INSERTED.CanhBaoKhanCapID AS id,
          ${alertTimestampSql('INSERTED.NgayGui')} AS ngayGui,INSERTED.TrangThai AS trangThai,
          INSERTED.ViDo AS viDo, INSERTED.KinhDo AS kinhDo
        VALUES (@elderlyId, @userId, @viDo, @kinhDo, @noiDung)
      `);
    const emergencyId = emergency.recordset[0].id;
    const alert = await new sql.Request(transaction)
      .input('elderlyId', sql.Int, elderlyId)
      .input('emergencyId', sql.Int, emergencyId)
      .input('noiDung', sql.NVarChar(500), content)
      .query(`
        INSERT INTO CanhBao (NguoiCaoTuoiID, LoaiCanhBao, NoiDung, MucDo, NguonBang, NguonID)
        OUTPUT INSERTED.CanhBaoID AS id
        VALUES (@elderlyId, N'KhanCap', @noiDung, N'KhanCap', N'CanhBaoKhanCap', @emergencyId)
      `);
    const delivery = await notifyAlertRecipients(transaction, {
      elderlyId, elderlyName, content, alertId: alert.recordset[0].id,
      source: 'CanhBaoKhanCap', sourceId: emergencyId, emergency: true,
      latitude: viDo, longitude: kinhDo,
    });
    await transaction.commit();
    transaction = null;
    const payload = {
      id: alert.recordset[0].id,
      canhBaoId: alert.recordset[0].id,
      canhBaoKhanCapId: emergencyId,
      nguoiCaoTuoiId: elderlyId,
      nguoiCaoTuoiTen: elderlyName,
      tenNguoiCaoTuoi: elderlyName,
      noiDung: content,
      viDo,
      kinhDo,
      ngayGui: emergency.recordset[0].ngayGui,
      loaiCanhBao: 'KhanCap',
      loaiCanhBaoLabel: 'Khẩn cấp',
      mucDo: 'KHAN_CAP',
      mucDoLabel: 'Khẩn cấp',
      moTa: content,
      thoiGianPhatHien: emergency.recordset[0].ngayGui,
      trangThai: 'CHUA_XU_LY',
      trangThaiLabel: 'Chưa xử lý',
      nguonBang: 'CanhBaoKhanCap',
      nguonId: emergencyId,
    };
    emitAlertNotifications(delivery, payload);
    const count = delivery.caregivers.length;
    return ok(res, { ...emergency.recordset[0], canhBaoId: alert.recordset[0].id,
      nguoiCaoTuoiId: elderlyId, soNguoiChamSocNhan: count,
      soNguoiChamSocDaThongBao: count, trungLap: false }, 'Đã gửi cảnh báo SOS', 201);
  } catch (error) {
    if (transaction) {
      try { await transaction.rollback(); } catch (_) { /* SQL da ket thuc transaction */ }
    }
    next(error);
  }
};

const {endpoint}=require('../services/alertWorkflow.service');
const markSeen=endpoint(req=>({emergencyId:req.params.id,action:'seen'}));
const resolve=endpoint(req=>({emergencyId:req.params.id,action:'resolve',note:req.body.ghiChu}));
module.exports = { create, getMine, markSeen, resolve };
