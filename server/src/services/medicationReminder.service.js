const { poolPromise } = require('../config/db');
const { emitToUser } = require('../socket');
const { materializeMissedMedications, emitMissedMedications } = require('./medicationMissed.service');

const MEDICATION_REMINDER_INTERVAL_MS = 30_000;

// ThoiGianDuKien is stored in Vietnam wall-clock time. A dose gets one
// persisted reminder in the 15 minutes before it is due, never after it has
// been taken, missed, or cancelled. A clock key permits a new reminder if a
// schedule is rescheduled without deleting already-read history.
const MATERIALIZE_DUE_MEDICATION_REMINDERS_SQL = `
  SET XACT_ABORT ON;
  BEGIN TRANSACTION;
  DECLARE @lockResult INT;
  EXEC @lockResult = sys.sp_getapplock
    @Resource=N'CareSenior.MedicationReminderMaterializer',
    @LockMode=N'Exclusive', @LockOwner=N'Transaction', @LockTimeout=5000;
  IF @lockResult < 0
  BEGIN
    ROLLBACK TRANSACTION;
    THROW 51001, 'Khong the dong bo thong bao uong thuoc', 1;
  END;

  DECLARE @now DATETIME2 = DATEADD(HOUR,7,SYSUTCDATETIME());
  ;WITH Due AS (
    SELECT hs.UserID AS userId, lut.LichUongThuocID AS scheduleId,
      dm.TenThuoc AS medicineName, ct.LieuDung AS dose,
      lut.ThoiGianDuKien AS scheduledAt,
      CONCAT(N'LichUongThuoc:',CONVERT(CHAR(8),lut.ThoiGianDuKien,112),
        REPLACE(CONVERT(CHAR(5),lut.ThoiGianDuKien,108),':','')) AS linkTable
    FROM LichUongThuoc lut
    JOIN HoSoNguoiCaoTuoi hs ON hs.NguoiCaoTuoiID=lut.NguoiCaoTuoiID
    JOIN DonThuocChiTiet ct ON ct.DonThuocChiTietID=lut.DonThuocChiTietID
    JOIN DanhMucThuoc dm ON dm.ThuocID=ct.ThuocID
    WHERE hs.UserID IS NOT NULL
      AND hs.TrangThai IN (N'DangTheoDoi',N'CanChamSocDacBiet')
      AND lut.TrangThai=N'ChuaDenGio'
      AND lut.ThoiGianDuKien>@now
      AND DATEADD(MINUTE,-15,lut.ThoiGianDuKien)<=@now
  )
  INSERT INTO ThongBao
    (UserID,TieuDe,NoiDung,LoaiThongBao,LienKetBang,LienKetID,DaDoc,NgayTao)
  OUTPUT INSERTED.ThongBaoID AS id, INSERTED.UserID AS userId,
    INSERTED.LienKetID AS scheduleId
  SELECT due.userId, N'Nhắc uống thuốc',
    CONCAT(N'Sắp đến giờ uống ',due.medicineName,N' (',due.dose,N') lúc ',
      CONVERT(CHAR(5),due.scheduledAt,108),N' ngày ',
      CONVERT(CHAR(10),due.scheduledAt,103),N'.'),
    N'NhacThuoc',due.linkTable,due.scheduleId,0,@now
  FROM Due due
  WHERE NOT EXISTS (
    SELECT 1 FROM ThongBao existing WITH (UPDLOCK,HOLDLOCK)
    WHERE existing.UserID=due.userId
      AND existing.LoaiThongBao=N'NhacThuoc'
      AND existing.LienKetBang=due.linkTable
      AND existing.LienKetID=due.scheduleId
  );
  COMMIT TRANSACTION;
`;

const materializeDueMedicationReminders = async (providedPool) => {
  const pool = providedPool || await poolPromise;
  const result = await pool.request().query(MATERIALIZE_DUE_MEDICATION_REMINDERS_SQL);
  return result.recordset || [];
};

let timer = null;
let running = false;

const runWorker = async () => {
  if (running) return;
  running = true;
  try {
    const missed = await materializeMissedMedications();
    emitMissedMedications(missed);
    if (missed.alerts.length) console.log(`[REMINDER] Da chuyen ${missed.alerts.length} lieu qua han thanh BoLo.`);
    const created = await materializeDueMedicationReminders();
    for (const reminder of created) {
      emitToUser(reminder.userId, 'thongbao:new', { id: reminder.id, loaiThongBao: 'NhacThuoc' });
    }
    if (created.length) console.log(`[REMINDER] Da tao ${created.length} thong bao uong thuoc.`);
  } catch (error) {
    console.error('[REMINDER] Khong the dong bo thong bao uong thuoc:', error.message);
  } finally {
    running = false;
  }
};

const startMedicationReminderWorker = () => {
  if (timer) return timer;
  setImmediate(runWorker);
  timer = setInterval(runWorker, MEDICATION_REMINDER_INTERVAL_MS);
  timer.unref?.();
  return timer;
};

const stopMedicationReminderWorker = () => {
  if (timer) clearInterval(timer);
  timer = null;
};

module.exports = {
  MEDICATION_REMINDER_INTERVAL_MS,
  MATERIALIZE_DUE_MEDICATION_REMINDERS_SQL,
  materializeDueMedicationReminders,
  startMedicationReminderWorker,
  stopMedicationReminderWorker,
};
