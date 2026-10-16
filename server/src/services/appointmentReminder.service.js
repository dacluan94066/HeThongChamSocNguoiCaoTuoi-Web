const { poolPromise } = require('../config/db');

const APPOINTMENT_REMINDER_INTERVAL_MS = 30_000;

// LienKetBang includes the appointment clock. A rescheduled appointment can
// therefore create a fresh reminder while an already-read reminder remains a
// truthful history item.
const MATERIALIZE_DUE_REMINDERS_SQL = `
  SET XACT_ABORT ON;
  BEGIN TRANSACTION;
  DECLARE @lockResult INT;
  EXEC @lockResult = sys.sp_getapplock
    @Resource=N'CareSenior.AppointmentReminderMaterializer',
    @LockMode=N'Exclusive', @LockOwner=N'Transaction', @LockTimeout=5000;
  IF @lockResult < 0
  BEGIN
    ROLLBACK TRANSACTION;
    THROW 51000, 'Khong the dong bo thong bao lich kham', 1;
  END;

  -- LichKhamBenh is stored as Vietnam wall-clock time. Do not depend on the
  -- SQL Server host's local timezone when deciding whether a reminder is due.
  DECLARE @now DATETIME2 = DATEADD(HOUR, 7, SYSUTCDATETIME());
  ;WITH Due AS (
    SELECT hs.UserID AS userId, lk.LichKhamID AS appointmentId,
      lk.TenBenhVien AS hospital, lk.ThoiGianKham AS appointmentTime,
      reminder.stage, reminder.hoursBefore,
      CONCAT(N'LichKhamBenh:', reminder.stage, N':',
        CONVERT(CHAR(8), lk.ThoiGianKham, 112),
        REPLACE(CONVERT(CHAR(5), lk.ThoiGianKham, 108), ':', '')) AS linkTable
    FROM LichKhamBenh lk
    JOIN HoSoNguoiCaoTuoi hs ON hs.NguoiCaoTuoiID=lk.NguoiCaoTuoiID
    CROSS APPLY (VALUES
      (N'24h', 24, DATEADD(HOUR, -24, lk.ThoiGianKham)),
      (N'2h',   2, DATEADD(HOUR,  -2, lk.ThoiGianKham))
    ) reminder(stage, hoursBefore, reminderAt)
    WHERE hs.UserID IS NOT NULL
      AND hs.TrangThai=N'DangTheoDoi'
      AND lk.TrangThai=N'ChuaDen'
      AND lk.ThoiGianKham > @now
      AND reminder.reminderAt <= @now
      AND ((reminder.stage=N'24h' AND @now < DATEADD(HOUR, -2, lk.ThoiGianKham))
        OR (reminder.stage=N'2h' AND @now >= DATEADD(HOUR, -2, lk.ThoiGianKham)))
  )
  INSERT INTO ThongBao
    (UserID,TieuDe,NoiDung,LoaiThongBao,LienKetBang,LienKetID,DaDoc,NgayTao)
  OUTPUT INSERTED.ThongBaoID AS id, INSERTED.UserID AS userId,
    INSERTED.LienKetID AS appointmentId, INSERTED.LienKetBang AS linkTable
  SELECT due.userId,
    CONCAT(N'Nhắc lịch khám trước ', due.hoursBefore, N' giờ'),
    CONCAT(N'Bạn có lịch khám tại ', due.hospital, N' lúc ',
      CONVERT(CHAR(5), due.appointmentTime, 108), N' ngày ',
      CONVERT(CHAR(10), due.appointmentTime, 103),
      N' (còn ', due.hoursBefore, N' giờ).'),
    N'NhacLichKham', due.linkTable, due.appointmentId, 0, @now
  FROM Due due
  WHERE NOT EXISTS (
    SELECT 1 FROM ThongBao existing WITH (UPDLOCK,HOLDLOCK)
    WHERE existing.UserID=due.userId
      AND existing.LoaiThongBao=N'NhacLichKham'
      AND existing.LienKetBang=due.linkTable
      AND existing.LienKetID=due.appointmentId
  );
  COMMIT TRANSACTION;
`;

const materializeDueAppointmentReminders = async (providedPool) => {
  const pool = providedPool || await poolPromise;
  const result = await pool.request().query(MATERIALIZE_DUE_REMINDERS_SQL);
  return result.recordset || [];
};

let timer = null;
let running = false;

const runWorker = async () => {
  if (running) return;
  running = true;
  try {
    const created = await materializeDueAppointmentReminders();
    if (created.length) {
      console.log(`[REMINDER] Da tao ${created.length} thong bao lich kham.`);
    }
  } catch (error) {
    console.error('[REMINDER] Khong the dong bo thong bao lich kham:', error.message);
  } finally {
    running = false;
  }
};

const startAppointmentReminderWorker = () => {
  if (timer) return timer;
  setImmediate(runWorker);
  timer = setInterval(runWorker, APPOINTMENT_REMINDER_INTERVAL_MS);
  timer.unref?.();
  return timer;
};

const stopAppointmentReminderWorker = () => {
  if (timer) clearInterval(timer);
  timer = null;
};

module.exports = {
  APPOINTMENT_REMINDER_INTERVAL_MS,
  MATERIALIZE_DUE_REMINDERS_SQL,
  materializeDueAppointmentReminders,
  startAppointmentReminderWorker,
  stopAppointmentReminderWorker,
};
