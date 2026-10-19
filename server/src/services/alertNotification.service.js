const { sql } = require('../config/db');
const { emitToAdminOnly, emitToUser } = require('../socket');

const requestFor = (connection) => connection instanceof sql.Transaction
  ? new sql.Request(connection) : connection.request();

async function createNotification(connection, { userId, title, content, type, source, sourceId }) {
  const result = await requestFor(connection)
    .input('userId', sql.Int, userId)
    .input('title', sql.NVarChar(150), title)
    .input('content', sql.NVarChar(500), content.slice(0, 500))
    .input('type', sql.NVarChar(30), type)
    .input('source', sql.NVarChar(50), source)
    .input('sourceId', sql.Int, sourceId)
    .query(`INSERT INTO ThongBao(UserID,TieuDe,NoiDung,LoaiThongBao,LienKetBang,LienKetID)
      OUTPUT INSERTED.ThongBaoID AS id
      VALUES(@userId,@title,@content,@type,@source,@sourceId)`);
  return result.recordset[0].id;
}

async function notifyAlertRecipients(connection, {
  elderlyId, elderlyName, content, alertId, source, sourceId, emergency = false, latitude, longitude,
}) {
  const recipients = await requestFor(connection).input('elderlyId', sql.Int, elderlyId).query(`
    SELECT DISTINCT nd.UserID AS userId, vt.TenVaiTro AS role
    FROM NguoiDung nd JOIN VaiTro vt ON vt.VaiTroID=nd.VaiTroID
    LEFT JOIN NguoiChamSoc ncs ON ncs.UserID=nd.UserID AND ncs.TrangThai=N'DangLamViec'
    LEFT JOIN NguoiCaoTuoi_NguoiChamSoc lk ON lk.NguoiChamSocID=ncs.NguoiChamSocID
      AND lk.NguoiCaoTuoiID=@elderlyId
      AND lk.NgayBatDau<=CAST(DATEADD(HOUR,7,SYSUTCDATETIME()) AS DATE)
      AND (lk.NgayKetThuc IS NULL OR lk.NgayKetThuc>CAST(DATEADD(HOUR,7,SYSUTCDATETIME()) AS DATE))
    WHERE nd.TrangThai=N'HoatDong'
      AND (vt.TenVaiTro=N'QuanTriVien' OR (vt.TenVaiTro=N'NguoiChamSoc' AND lk.NguoiCaoTuoiID IS NOT NULL))
  `);
  const prefix = `${elderlyName}: `;
  const location = latitude != null && longitude != null
    ? ` https://www.google.com/maps?q=${latitude},${longitude}` : '';
  const message = `${prefix}${content.slice(0, Math.max(0, 500 - prefix.length - location.length))}${location}`;
  const deliveries = [];
  for (const recipient of recipients.recordset) {
    const notificationId = await createNotification(connection, {
      userId: recipient.userId,
      title: emergency ? 'Cảnh báo SOS khẩn cấp' : 'Chỉ số sức khỏe bất thường',
      content: message,
      type: emergency ? 'KhanCap' : 'CanhBaoChiSo',
      source,
      sourceId,
    });
    deliveries.push({ ...recipient, notificationId });
  }
  return {
    caregivers: deliveries.filter((item) => item.role === 'NguoiChamSoc'),
    admins: deliveries.filter((item) => item.role === 'QuanTriVien'),
    alertId,
  };
}

function emitAlertNotifications(delivery, payload) {
  emitToAdminOnly('canhbao:new', payload);
  for (const caregiver of delivery.caregivers) emitToUser(caregiver.userId, 'canhbao:new', payload);
  for (const recipient of [...delivery.caregivers, ...delivery.admins]) {
    emitToUser(recipient.userId, 'thongbao:new', {
      id: recipient.notificationId,
      loaiThongBao: payload.loaiCanhBao === 'KhanCap' ? 'KhanCap' : 'CanhBaoChiSo',
      canhBaoId: payload.canhBaoId,
    });
  }
}

module.exports = { createNotification, notifyAlertRecipients, emitAlertNotifications };
