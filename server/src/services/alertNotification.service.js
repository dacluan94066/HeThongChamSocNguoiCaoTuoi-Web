const { sql, poolPromise } = require('../config/db');
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

// Reuse the existing account/assignment rules. Permission gating here is SOS-only:
// ordinary health notifications keep their existing delivery behaviour.
async function getRecipients(connection, elderlyId, sos = false) {
  return requestFor(connection).input('elderlyId', sql.Int, elderlyId).query(`
    SELECT DISTINCT nd.UserID AS userId, vt.TenVaiTro AS role
    FROM NguoiDung nd JOIN VaiTro vt ON vt.VaiTroID=nd.VaiTroID
    LEFT JOIN NguoiChamSoc ncs ON ncs.UserID=nd.UserID AND ncs.TrangThai=N'DangLamViec'
    LEFT JOIN NguoiCaoTuoi_NguoiChamSoc lk ON lk.NguoiChamSocID=ncs.NguoiChamSocID
      AND lk.NguoiCaoTuoiID=@elderlyId
      AND lk.NgayBatDau<=CAST(DATEADD(HOUR,7,SYSUTCDATETIME()) AS DATE)
      AND (lk.NgayKetThuc IS NULL OR lk.NgayKetThuc>CAST(DATEADD(HOUR,7,SYSUTCDATETIME()) AS DATE))
    WHERE nd.TrangThai=N'HoatDong'
      AND (vt.TenVaiTro=N'QuanTriVien' OR (vt.TenVaiTro=N'NguoiChamSoc' AND lk.NguoiCaoTuoiID IS NOT NULL
        ${sos ? `AND EXISTS (
          SELECT 1 FROM PhanQuyen pq
          JOIN ChucNang cn ON cn.ChucNangID=pq.ChucNangID
          WHERE pq.VaiTroID=nd.VaiTroID AND cn.MaChucNang=N'QLCANHBAO' AND pq.ChoPhepXem=1
        )` : ''}))
  `);
}

async function notifyAlertRecipients(connection, {
  elderlyId, elderlyName, content, alertId, source, sourceId, emergency = false, latitude, longitude,
}) {
  const sos = emergency === true && source === 'CanhBaoKhanCap';
  const recipients = await getRecipients(connection, elderlyId, sos);
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
    ...(sos ? { sos: true, elderlyId } : {}),
  };
}

async function emitSosNotifications(delivery, payload) {
  try {
    const elderlyId = Number(delivery.elderlyId);
    if (!Number.isInteger(elderlyId) || elderlyId < 1) return false;
    // Called only after the SOS transaction commits. Re-read current eligibility:
    // sockets can remain connected after an account, assignment or permission changes.
    const pool = await poolPromise;
    const current = await getRecipients(pool, elderlyId, true);
    const eligible = new Set(current.recordset.map((item) => `${item.userId}:${item.role}`));
    const sent = new Set();
    for (const recipient of [...delivery.admins, ...delivery.caregivers]) {
      const userId = Number(recipient.userId);
      if (!Number.isInteger(userId) || userId < 1 || sent.has(userId)
        || !eligible.has(`${userId}:${recipient.role}`)) continue;
      sent.add(userId);
      emitToUser(userId, 'canhbao:new', payload);
      emitToUser(userId, 'thongbao:new', {
        id: recipient.notificationId,
        loaiThongBao: 'KhanCap',
        canhBaoId: payload.canhBaoId,
      });
    }
    return true;
  } catch (error) {
    // The SOS is already committed; a realtime failure must not fake a failed send
    // or leak to an unverified recipient. Persisted notifications remain available.
    console.error('[SOS] Khong the xac minh nguoi nhan realtime:', error.code || 'DELIVERY_FAILED');
    return false;
  } finally {
    await emitRelativeSos(delivery.elderlyId, payload, 'canhbao:new');
    await emitOwnSos(delivery.elderlyId, payload);
  }
}

// A committed SOS created on Mobile also refreshes the same owner's Web.
// This is an invalidation signal, never the staff/internal payload or a new notification.
async function emitOwnSos(elderlyId, payload, event = 'canhbao:new') {
  if (!Number.isInteger(Number(elderlyId)) || Number(elderlyId) < 1) return false;
  if (!['canhbao:new', 'canhbao:updated'].includes(event) || !payload || payload.nguonBang !== 'CanhBaoKhanCap'
    || Number(payload.nguoiCaoTuoiId) !== Number(elderlyId)
    || !Number.isInteger(Number(payload.canhBaoKhanCapId)) || Number(payload.canhBaoKhanCapId) < 1) return false;
  try {
    const pool = await poolPromise;
    const rows = await pool.request().input('elderlyId', sql.Int, Number(elderlyId)).query(`
      SELECT nd.UserID AS sosOwnerUserId
      FROM HoSoNguoiCaoTuoi nct JOIN NguoiDung nd ON nd.UserID=nct.UserID
      JOIN VaiTro vt ON vt.VaiTroID=nd.VaiTroID
      WHERE nct.NguoiCaoTuoiID=@elderlyId AND nd.TrangThai=N'HoatDong'
        AND vt.TenVaiTro=N'NguoiCaoTuoi'
        AND EXISTS (SELECT 1 FROM PhanQuyen pq JOIN ChucNang cn ON cn.ChucNangID=pq.ChucNangID
          WHERE pq.VaiTroID=nd.VaiTroID AND cn.MaChucNang=N'QLCANHBAO' AND pq.ChoPhepXem=1)
    `);
    const userId = Number(rows.recordset[0]?.sosOwnerUserId);
    if (!Number.isInteger(userId) || userId < 1) return false;
    emitToUser(userId, event, {
      canhBaoId: payload.canhBaoId, canhBaoKhanCapId: payload.canhBaoKhanCapId,
      nguoiCaoTuoiId: Number(elderlyId), nguonBang: 'CanhBaoKhanCap',
      nguonId: payload.canhBaoKhanCapId, trangThai: payload.trangThai,
      thoiGianPhatHien: payload.thoiGianPhatHien,
    });
    return true;
  } catch (error) {
    console.error('[SOS] Không thể xác minh chủ hồ sơ nhận realtime:', error.code || 'OWNER_DELIVERY_FAILED');
    return false;
  }
}

async function emitRelativeSos(elderlyId, payload, event) {
  if (!Number.isInteger(Number(elderlyId)) || Number(elderlyId) < 1) return;
  try {
    const pool = await poolPromise;
    await require('./relativeRealtime.service').createRelativeRealtime(pool, sql, emitToUser)
      .emitSos(Number(elderlyId), { ...payload, nguoiCaoTuoiId: Number(elderlyId), nguonBang: 'CanhBaoKhanCap' }, event);
  } catch (error) {
    if (error.code !== 'RELATIVES_NOT_INSTALLED') console.error('[SOS] Khong gui duoc cho Nguoi than:', error.code || 'RELATIVE_DELIVERY_FAILED');
  }
}

function emitAlertNotifications(delivery, payload) {
  if (delivery.sos === true) return emitSosNotifications(delivery, payload);
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

async function emitSosAlertUpdate(elderlyId, payload) {
  try {
    const id = Number(elderlyId);
    if (!Number.isInteger(id) || id < 1) return false;
    const pool = await poolPromise;
    const current = await getRecipients(pool, id, true);
    const sent = new Set();
    for (const recipient of current.recordset) {
      const userId = Number(recipient.userId);
      if (!Number.isInteger(userId) || userId < 1 || sent.has(userId)) continue;
      sent.add(userId);
      emitToUser(userId, 'canhbao:updated', payload);
    }
    return true;
  } catch (error) {
    console.error('[SOS] Khong the xac minh nguoi nhan cap nhat realtime:', error.code || 'DELIVERY_FAILED');
    return false;
  } finally {
    await emitRelativeSos(elderlyId, payload, 'canhbao:updated');
  }
}

module.exports = { createNotification, notifyAlertRecipients, emitAlertNotifications, emitSosAlertUpdate, emitOwnSos };
