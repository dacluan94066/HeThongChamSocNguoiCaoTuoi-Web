const { poolPromise, sql } = require('../config/db');
const { emitToUser } = require('../socket');

const configuredMinutes = Number(process.env.MEDICATION_MISSED_AFTER_MINUTES);
const MEDICATION_MISSED_AFTER_MINUTES = Number.isInteger(configuredMinutes)
  && configuredMinutes > 0 && configuredMinutes <= 525600
  ? configuredMinutes : 60;

// The status update, alert and recipient notifications must either all commit or
// all roll back. The application lock also serializes concurrent worker instances.
const MATERIALIZE_MISSED_MEDICATIONS_SQL = `
  SET XACT_ABORT ON;
  BEGIN TRANSACTION;
  DECLARE @lockResult INT;
  EXEC @lockResult = sys.sp_getapplock
    @Resource=N'CareSenior.MedicationMissedMaterializer',
    @LockMode=N'Exclusive', @LockOwner=N'Transaction', @LockTimeout=5000;
  IF @lockResult < 0
  BEGIN
    ROLLBACK TRANSACTION;
    THROW 51002, 'Khong the dong bo lieu thuoc bo lo', 1;
  END;

  DECLARE @now DATETIME2 = DATEADD(HOUR,7,SYSUTCDATETIME());
  DECLARE @missed TABLE(scheduleId INT PRIMARY KEY, elderlyId INT, scheduledAt DATETIME2);
  UPDATE lut
    SET TrangThai=N'BoLo'
    OUTPUT INSERTED.LichUongThuocID,INSERTED.NguoiCaoTuoiID,INSERTED.ThoiGianDuKien
      INTO @missed(scheduleId,elderlyId,scheduledAt)
  FROM LichUongThuoc lut
  JOIN HoSoNguoiCaoTuoi hs ON hs.NguoiCaoTuoiID=lut.NguoiCaoTuoiID
  WHERE lut.TrangThai=N'ChuaDenGio'
    AND hs.TrangThai IN (N'DangTheoDoi', N'CanChamSocDacBiet')
    AND lut.ThoiGianDuKien < DATEADD(MINUTE,-@minutes,@now);

  INSERT INTO CanhBao(NguoiCaoTuoiID,LoaiCanhBao,NoiDung,MucDo,NguonBang,NguonID)
  SELECT missed.elderlyId,N'NhacUongThuoc',
    LEFT(CONCAT(N'Đã bỏ lỡ liều ',dm.TenThuoc,N' (',ct.LieuDung,N') lúc ',
      CONVERT(CHAR(5),missed.scheduledAt,108),N' ngày ',
      CONVERT(CHAR(10),missed.scheduledAt,103),N'.'),500),
    N'TrungBinh',N'LichUongThuoc',missed.scheduleId
  FROM @missed missed
  JOIN LichUongThuoc lut ON lut.LichUongThuocID=missed.scheduleId
  JOIN DonThuocChiTiet ct ON ct.DonThuocChiTietID=lut.DonThuocChiTietID
  JOIN DanhMucThuoc dm ON dm.ThuocID=ct.ThuocID
  WHERE NOT EXISTS (SELECT 1 FROM CanhBao existing WITH(UPDLOCK,HOLDLOCK)
    WHERE existing.NguonBang=N'LichUongThuoc' AND existing.NguonID=missed.scheduleId);

  DECLARE @alertRows TABLE(alertId INT PRIMARY KEY, scheduleId INT, elderlyId INT);
  INSERT INTO @alertRows(alertId,scheduleId,elderlyId)
  SELECT linked.CanhBaoID,missed.scheduleId,missed.elderlyId
  FROM @missed missed
  CROSS APPLY (SELECT TOP(1) CanhBaoID FROM CanhBao
    WHERE NguonBang=N'LichUongThuoc' AND NguonID=missed.scheduleId
    ORDER BY CanhBaoID) linked;

  DECLARE @createdNotifications TABLE(id INT PRIMARY KEY,userId INT,scheduleId INT);
  ;WITH Recipients AS (
    SELECT DISTINCT a.alertId,a.scheduleId,hs.UserID AS userId,
      hs.HoTen AS elderlyName,c.NoiDung AS alertContent
    FROM @alertRows a
    JOIN HoSoNguoiCaoTuoi hs ON hs.NguoiCaoTuoiID=a.elderlyId
    JOIN CanhBao c ON c.CanhBaoID=a.alertId
    JOIN NguoiDung nd ON nd.UserID=hs.UserID AND nd.TrangThai=N'HoatDong'
    WHERE hs.UserID IS NOT NULL
    UNION
    SELECT DISTINCT a.alertId,a.scheduleId,ncs.UserID AS userId,
      hs.HoTen AS elderlyName,c.NoiDung AS alertContent
    FROM @alertRows a
    JOIN HoSoNguoiCaoTuoi hs ON hs.NguoiCaoTuoiID=a.elderlyId
    JOIN CanhBao c ON c.CanhBaoID=a.alertId
    JOIN NguoiCaoTuoi_NguoiChamSoc lk ON lk.NguoiCaoTuoiID=a.elderlyId
    JOIN NguoiChamSoc ncs ON ncs.NguoiChamSocID=lk.NguoiChamSocID
    JOIN NguoiDung nd ON nd.UserID=ncs.UserID AND nd.TrangThai=N'HoatDong'
    WHERE ncs.UserID IS NOT NULL AND ncs.TrangThai=N'DangLamViec'
      AND lk.NgayBatDau<=CAST(@now AS DATE)
      AND (lk.NgayKetThuc IS NULL OR lk.NgayKetThuc>CAST(@now AS DATE))
  )
  INSERT INTO ThongBao(UserID,TieuDe,NoiDung,LoaiThongBao,LienKetBang,LienKetID,DaDoc,NgayTao)
    OUTPUT INSERTED.ThongBaoID,INSERTED.UserID,INSERTED.LienKetID
      INTO @createdNotifications(id,userId,scheduleId)
  SELECT r.userId,N'Liều thuốc đã bỏ lỡ',
    LEFT(CONCAT(r.elderlyName,N': ',r.alertContent),500),
    N'NhacThuoc',N'LichUongThuoc:BoLo',r.scheduleId,0,@now
  FROM Recipients r
  WHERE NOT EXISTS (SELECT 1 FROM ThongBao existing WITH(UPDLOCK,HOLDLOCK)
    WHERE existing.UserID=r.userId AND existing.LienKetBang=N'LichUongThuoc:BoLo'
      AND existing.LienKetID=r.scheduleId);

  SELECT a.alertId AS canhBaoId,a.scheduleId AS nguonId,a.elderlyId AS nguoiCaoTuoiId,
    hs.HoTen AS nguoiCaoTuoiTen,c.NoiDung AS noiDung,
    CONVERT(VARCHAR(19),c.NgayTao,126) AS ngayTao
  FROM @alertRows a
  JOIN HoSoNguoiCaoTuoi hs ON hs.NguoiCaoTuoiID=a.elderlyId
  JOIN CanhBao c ON c.CanhBaoID=a.alertId;
  SELECT id,userId,scheduleId FROM @createdNotifications;
  COMMIT TRANSACTION;
`;

const materializeMissedMedications = async (providedPool) => {
  const pool = providedPool || await poolPromise;
  const result = await pool.request()
    .input('minutes', sql.Int, MEDICATION_MISSED_AFTER_MINUTES)
    .query(MATERIALIZE_MISSED_MEDICATIONS_SQL);
  return {
    alerts: result.recordsets?.[0] || [],
    notifications: result.recordsets?.[1] || [],
  };
};

const emitMissedMedications = ({ alerts, notifications }) => {
  const recipients = new Map();
  for (const notification of notifications) {
    if (!recipients.has(notification.scheduleId)) recipients.set(notification.scheduleId, new Set());
    recipients.get(notification.scheduleId).add(notification.userId);
    emitToUser(notification.userId, 'thongbao:new', {
      id: notification.id, loaiThongBao: 'NhacThuoc',
    });
  }
  for (const alert of alerts) {
    const payload = {
      id: alert.canhBaoId, canhBaoId: alert.canhBaoId,
      nguoiCaoTuoiId: alert.nguoiCaoTuoiId,
      nguoiCaoTuoiTen: alert.nguoiCaoTuoiTen,
      loaiCanhBao: 'NhacUongThuoc', mucDo: 'TrungBinh',
      noiDung: alert.noiDung, ngayTao: alert.ngayTao,
      nguonBang: 'LichUongThuoc', nguonId: alert.nguonId,
      trangThai: 'ChuaXuLy',
    };
    for (const userId of recipients.get(alert.nguonId) || []) {
      emitToUser(userId, 'canhbao:new', payload);
      emitToUser(userId, 'lichuongthuoc:updated', { id: alert.nguonId, trangThai: 'BoLo' });
    }
  }
};

module.exports = {
  MEDICATION_MISSED_AFTER_MINUTES,
  MATERIALIZE_MISSED_MEDICATIONS_SQL,
  materializeMissedMedications,
  emitMissedMedications,
};
