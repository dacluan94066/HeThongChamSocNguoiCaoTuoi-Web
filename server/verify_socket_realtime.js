require('dotenv').config();

const assert = require('assert/strict');
const http = require('http');
const jwt = require('jsonwebtoken');
const { io: createClient } = require('socket.io-client');

const app = require('./src/app');
const { poolPromise, sql } = require('./src/config/db');
const { initSocket, getIO } = require('./src/socket');

const waitForEvent = (socket, eventName, timeoutMs = 5000) => new Promise((resolve, reject) => {
  const timer = setTimeout(() => {
    socket.off(eventName, handler);
    reject(new Error(`Qua thoi gian cho su kien ${eventName}`));
  }, timeoutMs);
  const handler = (data) => {
    clearTimeout(timer);
    resolve(data);
  };
  socket.once(eventName, handler);
});

const listen = (server) => new Promise((resolve, reject) => {
  server.once('error', reject);
  server.listen(0, '127.0.0.1', resolve);
});

const closeServer = (server) => new Promise((resolve) => server.close(resolve));

const run = async () => {
  if (!process.env.JWT_SECRET) {
    throw new Error('JWT_SECRET chua duoc cau hinh trong server/.env');
  }

  const pool = await poolPromise;
  const accounts = await pool.request().query(`
    SELECT TOP (1) nct.NguoiCaoTuoiID AS elderlyId, nct.UserID AS elderlyUserId,
      nct.HoTen AS elderlyName, nd.VaiTroID AS elderlyRoleId
    FROM HoSoNguoiCaoTuoi nct
    JOIN NguoiDung nd ON nd.UserID = nct.UserID
    WHERE nct.UserID IS NOT NULL AND nct.TrangThai = N'DangTheoDoi'
    ORDER BY nct.NguoiCaoTuoiID;

    SELECT TOP (1) nd.UserID AS adminUserId, nd.VaiTroID AS adminRoleId,
      vt.TenVaiTro AS adminRole
    FROM NguoiDung nd
    JOIN VaiTro vt ON vt.VaiTroID = nd.VaiTroID
    WHERE vt.TenVaiTro IN (N'QuanTriVien', N'BacSi')
    ORDER BY CASE WHEN vt.TenVaiTro = N'QuanTriVien' THEN 0 ELSE 1 END, nd.UserID;
  `);

  const elderly = accounts.recordsets[0][0];
  const admin = accounts.recordsets[1][0];
  if (!elderly || !admin) {
    throw new Error('Can it nhat 1 tai khoan NguoiCaoTuoi va 1 tai khoan QuanTriVien/BacSi de test');
  }

  const server = http.createServer(app);
  initSocket(server);
  await listen(server);
  const { port } = server.address();
  const baseUrl = `http://127.0.0.1:${port}`;
  let emergencyId = null;
  let alertId = null;
  let socket;
  let elderlySocket;
  let invalidSocket;
  let originalSchedule = null;
  let originalAppointment = null;

  try {
    const adminToken = jwt.sign({
      userId: admin.adminUserId,
      vaiTroId: admin.adminRoleId,
      tenVaiTro: admin.adminRole,
    }, process.env.JWT_SECRET, { expiresIn: '5m' });

    const elderlyToken = jwt.sign({
      userId: elderly.elderlyUserId,
      vaiTroId: elderly.elderlyRoleId,
      tenVaiTro: 'NguoiCaoTuoi',
    }, process.env.JWT_SECRET, { expiresIn: '5m' });

    invalidSocket = createClient(baseUrl, {
      auth: { token: 'invalid-token' },
      transports: ['websocket'],
      forceNew: true,
      reconnection: false,
    });
    const authError = await waitForEvent(invalidSocket, 'connect_error');
    assert.equal(authError.message, 'INVALID_TOKEN');

    socket = createClient(baseUrl, {
      auth: { token: adminToken },
      transports: ['websocket'],
      forceNew: true,
    });
    await waitForEvent(socket, 'connect');

    elderlySocket = createClient(baseUrl, {
      auth: { token: elderlyToken },
      transports: ['websocket'],
      forceNew: true,
    });
    await waitForEvent(elderlySocket, 'connect');
    let leakedToElderlyRoom = false;
    elderlySocket.once('canhbao:new', () => {
      leakedToElderlyRoom = true;
    });

    const alertEvent = waitForEvent(socket, 'canhbao:new');
    const response = await fetch(`${baseUrl}/api/emergency-alerts`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${elderlyToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ noiDung: '[SOCKET TEST] Kiem tra realtime SOS' }),
    });
    const body = await response.json();
    assert.equal(response.status, 201, JSON.stringify(body));
    emergencyId = body.data.id;
    alertId = body.data.canhBaoId;

    const received = await alertEvent;
    assert.equal(received.id, alertId);
    assert.equal(received.canhBaoId, alertId);
    assert.equal(received.nguoiCaoTuoiId, elderly.elderlyId);
    assert.equal(received.loaiCanhBao, 'KhanCap');
    assert.equal(received.mucDo, 'KHAN_CAP');
    await new Promise((resolve) => setTimeout(resolve, 150));
    assert.equal(leakedToElderlyRoom, false, 'Su kien admin bi gui nham sang room NguoiCaoTuoi');

    console.log('[SOCKET TEST] PASS: API SOS emit canhbao:new dung room admin_bacsi va khong ro ri sang room khac');

    const scheduleResult = await pool.request().query(`
      SELECT TOP (1) LichUongThuocID AS id, NguoiCaoTuoiID AS elderlyId,
        TrangThai AS status, ThoiGianThucTe AS actualTime,
        NguoiXacNhanID AS confirmedBy
      FROM LichUongThuoc
      ORDER BY LichUongThuocID DESC;
    `);
    originalSchedule = scheduleResult.recordset[0] || null;
    const scheduleStatus = {
      ChuaDenGio: 'CHUA_DEN_GIO',
      DaUong: 'DA_UONG',
      BoLo: 'BO_LO',
      TuChoi: 'TU_CHOI',
    }[originalSchedule?.status];
    if (originalSchedule && scheduleStatus) {
      const scheduleEvent = waitForEvent(socket, 'lichuongthuoc:updated');
      const response = await fetch(`${baseUrl}/api/medication-schedules/${originalSchedule.id}/status`, {
        method: 'PATCH',
        headers: {
          Authorization: `Bearer ${adminToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ trangThai: scheduleStatus }),
      });
      assert.equal(response.status, 200, await response.text());
      const receivedSchedule = await scheduleEvent;
      assert.equal(receivedSchedule.id, originalSchedule.id);
      assert.equal(receivedSchedule.nguoiCaoTuoiId, originalSchedule.elderlyId);
      console.log('[SOCKET TEST] PASS: cap nhat lich uong thuoc emit lichuongthuoc:updated');
    } else {
      console.log('[SOCKET TEST] SKIP: CSDL chua co lich uong thuoc de test event');
    }

    const appointmentResult = await pool.request().query(`
      SELECT TOP (1) LichKhamID AS id, TrangThai AS status,
        KetQuaKham AS resultText
      FROM LichKhamBenh
      WHERE TrangThai <> N'Huy'
      ORDER BY LichKhamID DESC;
    `);
    originalAppointment = appointmentResult.recordset[0] || null;
    if (originalAppointment) {
      const appointmentEvent = waitForEvent(socket, 'lichkham:updated');
      const response = await fetch(`${baseUrl}/api/appointments/${originalAppointment.id}/result`, {
        method: 'PATCH',
        headers: {
          Authorization: `Bearer ${adminToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ ketQuaKham: '[SOCKET TEST] Ket qua tam thoi' }),
      });
      assert.equal(response.status, 200, await response.text());
      const receivedAppointment = await appointmentEvent;
      assert.equal(receivedAppointment.id, originalAppointment.id);
      assert.equal(receivedAppointment.trangThai, 'DA_KHAM');
      console.log('[SOCKET TEST] PASS: ghi ket qua lich kham emit lichkham:updated');
    } else {
      console.log('[SOCKET TEST] SKIP: CSDL chua co lich kham phu hop de test event');
    }
  } finally {
    if (originalSchedule) {
      await pool.request()
        .input('id', sql.Int, originalSchedule.id)
        .input('status', sql.NVarChar(20), originalSchedule.status)
        .input('actualTime', sql.DateTime2, originalSchedule.actualTime)
        .input('confirmedBy', sql.Int, originalSchedule.confirmedBy)
        .query(`
          UPDATE LichUongThuoc
          SET TrangThai = @status, ThoiGianThucTe = @actualTime,
            NguoiXacNhanID = @confirmedBy
          WHERE LichUongThuocID = @id;
        `);
    }
    if (originalAppointment) {
      await pool.request()
        .input('id', sql.Int, originalAppointment.id)
        .input('status', sql.NVarChar(20), originalAppointment.status)
        .input('resultText', sql.NVarChar(500), originalAppointment.resultText)
        .query(`
          UPDATE LichKhamBenh
          SET TrangThai = @status, KetQuaKham = @resultText
          WHERE LichKhamID = @id;
        `);
    }
    if (originalSchedule || originalAppointment) {
      const restored = await pool.request()
        .input('scheduleId', sql.Int, originalSchedule?.id || null)
        .input('appointmentId', sql.Int, originalAppointment?.id || null)
        .query(`
          SELECT TrangThai AS status, ThoiGianThucTe AS actualTime,
            NguoiXacNhanID AS confirmedBy
          FROM LichUongThuoc WHERE LichUongThuocID = @scheduleId;
          SELECT TrangThai AS status, KetQuaKham AS resultText
          FROM LichKhamBenh WHERE LichKhamID = @appointmentId;
        `);
      if (originalSchedule) {
        const schedule = restored.recordsets[0][0];
        assert.equal(schedule.status, originalSchedule.status);
        assert.equal(schedule.confirmedBy, originalSchedule.confirmedBy);
        assert.equal(schedule.actualTime?.toISOString() || null, originalSchedule.actualTime?.toISOString() || null);
      }
      if (originalAppointment) {
        const appointment = restored.recordsets[1][0];
        assert.equal(appointment.status, originalAppointment.status);
        assert.equal(appointment.resultText, originalAppointment.resultText);
      }
      console.log('[SOCKET TEST] Cleanup: da khoi phuc nguyen trang lich thuoc va lich kham');
    }
    if (emergencyId || alertId) {
      const cleanup = new sql.Transaction(pool);
      await cleanup.begin();
      try {
        await new sql.Request(cleanup)
          .input('emergencyId', sql.Int, emergencyId)
          .input('alertId', sql.Int, alertId)
          .query(`
            DELETE FROM ThongBao
            WHERE LienKetBang = N'CanhBaoKhanCap' AND LienKetID = @emergencyId;
            DELETE FROM CanhBao
            WHERE CanhBaoID = @alertId
              OR (NguonBang = N'CanhBaoKhanCap' AND NguonID = @emergencyId);
            DELETE FROM CanhBaoKhanCap WHERE CanhBaoKhanCapID = @emergencyId;
          `);
        await cleanup.commit();
        const remaining = await pool.request()
          .input('content', sql.NVarChar(500), '[SOCKET TEST] Kiem tra realtime SOS')
          .query('SELECT COUNT(1) AS total FROM CanhBaoKhanCap WHERE NoiDung = @content');
        assert.equal(remaining.recordset[0].total, 0, 'Du lieu SOS test chua duoc don sach');
        console.log('[SOCKET TEST] Cleanup: khong con ban ghi SOS test trong CSDL');
      } catch (error) {
        await cleanup.rollback();
        throw error;
      }
    }
    socket?.disconnect();
    elderlySocket?.disconnect();
    invalidSocket?.disconnect();
    await new Promise((resolve) => getIO().close(resolve));
    await closeServer(server);
    await pool.close();
  }
};

run().catch((error) => {
  console.error('[SOCKET TEST] FAIL:', error.message);
  process.exitCode = 1;
});
