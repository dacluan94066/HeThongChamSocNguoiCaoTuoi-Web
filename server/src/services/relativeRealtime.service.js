const { createRelativeAccess, ACCESS_JOINS, ACCESS_WHERE } = require('./relativeAccess.service');
const { requireRelativeSchema } = require('./relativeSchema');
const { RelativeError, id } = require('../utils/relativeValidation');
const { alertTimestampSql } = require('../utils/alertTime');

// Post-commit delivery on existing user rooms. Room membership is never a capability.
function createRelativeRealtime(pool, sql, emitToUser) {
  const access = createRelativeAccess(pool, sql);
  const bind = (userId, elderlyId, sosId) => pool.request().input('userId', sql.Int, userId)
    .input('elderlyId', sql.Int, elderlyId).input('sosId', sql.Int, sosId)
    .input('feature', sql.VarChar(50), 'QLCANHBAO');
  const current = async (userId, elderlyId, sosId) => (await bind(userId, elderlyId, sosId).query(`
    SELECT sos.CanhBaoKhanCapID AS id,nct.HoTen AS name,
      ${alertTimestampSql('sos.NgayGui')} AS time,sos.TrangThai AS status,
      (SELECT TOP(1) c.CanhBaoID FROM dbo.CanhBao c WHERE c.NguonBang=N'CanhBaoKhanCap'
        AND c.NguonID=sos.CanhBaoKhanCapID AND c.NguoiCaoTuoiID=@elderlyId ORDER BY c.CanhBaoID DESC) AS alertId
    FROM dbo.NguoiCaoTuoi_NguoiThan lk ${ACCESS_JOINS}
    JOIN dbo.CanhBaoKhanCap sos ON sos.NguoiCaoTuoiID=lk.NguoiCaoTuoiID AND sos.CanhBaoKhanCapID=@sosId
    JOIN dbo.HoSoNguoiCaoTuoi nct ON nct.NguoiCaoTuoiID=lk.NguoiCaoTuoiID
    WHERE ${ACCESS_WHERE} AND lk.NguoiCaoTuoiID=@elderlyId`)).recordset[0];
  const persist = async (userId, elderlyId, sosId) => {
    // Own post-commit transaction: failure cannot roll back the Mobile SOS.
    const result = await bind(userId, elderlyId, sosId).query(`
      DECLARE @notificationId INT;
      BEGIN TRY
      BEGIN TRANSACTION;
      IF EXISTS(SELECT 1 FROM dbo.NguoiCaoTuoi_NguoiThan lk WITH(UPDLOCK,HOLDLOCK) ${ACCESS_JOINS}
        WHERE ${ACCESS_WHERE} AND lk.NguoiCaoTuoiID=@elderlyId)
      BEGIN
        SELECT TOP(1) @notificationId=ThongBaoID FROM dbo.ThongBao WITH(UPDLOCK,HOLDLOCK)
          WHERE UserID=@userId AND LienKetBang=N'CanhBaoKhanCap' AND LienKetID=@sosId ORDER BY ThongBaoID;
        IF @notificationId IS NULL
        BEGIN
          INSERT INTO dbo.ThongBao(UserID,TieuDe,NoiDung,LoaiThongBao,LienKetBang,LienKetID)
          SELECT @userId,N'Cảnh báo SOS',N'Người cao tuổi đã gửi SOS.',N'KhanCap',N'CanhBaoKhanCap',@sosId
          WHERE EXISTS(SELECT 1 FROM dbo.CanhBaoKhanCap WHERE CanhBaoKhanCapID=@sosId AND NguoiCaoTuoiID=@elderlyId);
          SET @notificationId=CONVERT(INT,SCOPE_IDENTITY());
        END
      END
      COMMIT TRANSACTION;
      END TRY
      BEGIN CATCH
        IF @@TRANCOUNT>0 ROLLBACK TRANSACTION;
        THROW;
      END CATCH;
      SELECT @notificationId AS id;`);
    return result.recordset[0]?.id || null;
  };
  return {
    async emitSos(elderlyId, payload, event = 'canhbao:new') {
      elderlyId = id(elderlyId);
      if (!payload || !['canhbao:new', 'canhbao:updated'].includes(event)
        || Number(payload.nguoiCaoTuoiId) !== elderlyId || payload.nguonBang !== 'CanhBaoKhanCap')
        throw new RelativeError('Sự kiện SOS không hợp lệ.');
      await requireRelativeSchema(pool);
      const explicitSosId = payload.canhBaoKhanCapId ?? payload.nguonId;
      const lookup = await pool.request().input('elderlyId', sql.Int, elderlyId)
        .input('sosId', sql.Int, explicitSosId == null ? null : id(explicitSosId))
        .input('alertId', sql.Int, payload.canhBaoId == null ? null : id(payload.canhBaoId)).query(`
          SELECT sos.CanhBaoKhanCapID AS id FROM dbo.CanhBaoKhanCap sos
          WHERE sos.NguoiCaoTuoiID=@elderlyId AND ((@sosId IS NOT NULL AND sos.CanhBaoKhanCapID=@sosId)
            OR (@sosId IS NULL AND EXISTS(SELECT 1 FROM dbo.CanhBao c WHERE c.CanhBaoID=@alertId
              AND c.NguonBang=N'CanhBaoKhanCap' AND c.NguonID=sos.CanhBaoKhanCapID AND c.NguoiCaoTuoiID=@elderlyId)))`);
      const sosId = lookup.recordset[0]?.id;
      if (!sosId) throw new RelativeError('Không tìm thấy SOS.', 'NOT_FOUND', 404);
      const recipients = await access.realtimeRecipients(elderlyId);
      const sent = new Set();
      for (const recipient of recipients) {
        const userId = id(recipient.userId);
        if (sent.has(userId)) continue;
        const notificationId = event === 'canhbao:new' ? await persist(userId, elderlyId, sosId) : null;
        // Recheck after persistence, immediately before emitting. Ignore names/content/status from the caller.
        const row = await current(userId, elderlyId, sosId);
        if (!row) continue;
        const safe = { nguoiCaoTuoiId: elderlyId, canhBaoKhanCapId: sosId, nguonId: sosId,
          nguonBang: 'CanhBaoKhanCap', loaiCanhBao: 'KhanCap', mucDo: 'KHAN_CAP',
          moTa: 'Người cao tuổi đã gửi SOS.', nguoiCaoTuoiTen: row.name, ngayGui: row.time, trangThai: row.status };
        if (row.alertId != null) safe.canhBaoId = row.alertId;
        emitToUser(userId, event, safe); sent.add(userId);
        if (notificationId) emitToUser(userId, 'thongbao:new', { id: notificationId, loaiThongBao: 'KhanCap',
          nguoiCaoTuoiId: elderlyId, canhBaoKhanCapId: sosId });
      }
      return sent.size;
    },
  };
}
module.exports = { createRelativeRealtime };
