// controllers/chiSoSucKhoe.controller.js - Chi so suc khoe - dung schema that
// Bang ChiSoSucKhoe: ChiSoID, NguoiCaoTuoiID, LoaiChiSoID (FK), GiaTri,
//   GiaTriPhu, ThoiGianDo, NguoiDoID, LaBatThuong BIT, GhiChu
// Bang LoaiChiSoSucKhoe: LoaiChiSoID, TenChiSo, DonVi, GiaTriMin, GiaTriMax
const { poolPromise, sql } = require('../config/db');
const { ok, fail } = require('../utils/response');
const { scopedWhere, targetElderlyId, isMobileRole } = require('../middlewares/mobile-scope.middleware');

// Map TenChiSo trong DB -> loaiChiSo frontend
const MAP_LOAI = {
  'Huyết áp':         { ma: 'HUYET_AP',    donVi: 'mmHg' },
  'Nhịp tim':         { ma: 'NHIP_TIM',    donVi: 'lần/phút' },
  'Đường huyết':      { ma: 'DUONG_HUYET', donVi: 'mg/dL' },
  'Nhiệt độ cơ thể':  { ma: 'NHIET_DO',    donVi: '°C' },
  'SpO2':             { ma: 'SPO2',         donVi: '%' },
  'Cân nặng':         { ma: 'CAN_NANG',    donVi: 'kg' },
};

const evaluateMetric = ({ tenChiSo, giaTri, giaTriPhu, min, max, min2, max2, manuallyAbnormal }) => {
  const primaryOutOfRange = (min != null && giaTri < Number(min)) || (max != null && giaTri > Number(max));
  const secondaryOutOfRange = giaTriPhu != null
    && ((min2 != null && giaTriPhu < Number(min2)) || (max2 != null && giaTriPhu > Number(max2)));
  const abnormal = manuallyAbnormal || primaryOutOfRange || secondaryOutOfRange;

  if (!abnormal) return { abnormal: false, level: null, description: null };

  const farOutsidePrimary = (min != null && giaTri < Number(min) * 0.8)
    || (max != null && giaTri > Number(max) * 1.2);
  const farOutsideSecondary = giaTriPhu != null
    && ((min2 != null && giaTriPhu < Number(min2) * 0.8)
      || (max2 != null && giaTriPhu > Number(max2) * 1.2));
  const level = farOutsidePrimary || farOutsideSecondary ? 'Cao' : 'TrungBinh';
  const measuredValue = giaTriPhu != null ? `${giaTri}/${giaTriPhu}` : String(giaTri);
  const primaryRange = min != null || max != null ? `${min ?? '—'}–${max ?? '—'}` : 'chưa cấu hình';
  const secondaryRange = giaTriPhu != null && (min2 != null || max2 != null)
    ? `; ngưỡng phụ ${min2 ?? '—'}–${max2 ?? '—'}`
    : '';

  return {
    abnormal: true,
    level,
    description: `${tenChiSo} ghi nhận ${measuredValue}, ngoài ngưỡng theo dõi ${primaryRange}${secondaryRange}.`,
  };
};

const mapMetric = (row) => {
  const loaiInfo = MAP_LOAI[row.tenChiSo] || { ma: row.tenChiSo, donVi: row.donVi };
  // Gop GiaTri + GiaTriPhu thanh chuoi (VD huyet ap: "120/80")
  const giaTri = row.giaTriPhu != null
    ? `${row.giaTri}/${row.giaTriPhu}`
    : String(row.giaTri);

  return {
    id:              row.id,
    nguoiCaoTuoiId:  row.nguoiCaoTuoiId,
    nguoiCaoTuoiTen: row.nguoiCaoTuoiTen,
    loaiChiSo:       loaiInfo.ma,
    loaiChiSoLabel:  row.tenChiSo,
    giaTri,
    donVi:           row.donVi || loaiInfo.donVi,
    ngayDo:          row.thoiGianDo ? new Date(row.thoiGianDo).toISOString().slice(0, 10) : '',
    gioDo:           row.thoiGianDo ? new Date(row.thoiGianDo).toTimeString().slice(0, 5) : '',
    binhThuong:      !row.laBatThuong,
    ghiChu:          row.ghiChu,
  };
};

const getOwnElderlyId = async (pool, userId) => {
  const result = await pool.request()
    .input('userId', sql.Int, userId)
    .query(`
      SELECT NguoiCaoTuoiID AS id
      FROM HoSoNguoiCaoTuoi
      WHERE UserID = @userId
    `);
  return result.recordset[0]?.id ?? null;
};

const mapMobileMetric = (row) => ({
  id: row.id,
  nguoiCaoTuoiId: row.nguoiCaoTuoiId,
  loaiChiSoId: row.loaiChiSoId,
  tenChiSo: row.tenChiSo,
  donVi: row.donVi,
  giaTri: Number(row.giaTri),
  giaTriPhu: row.giaTriPhu == null ? null : Number(row.giaTriPhu),
  thoiGianDo: row.thoiGianDo,
  laBatThuong: Boolean(row.laBatThuong),
  ghiChu: row.ghiChu,
});

// GET /api/health-metric-types
const getMetricTypes = async (req, res, next) => {
  try {
    const pool = await poolPromise;
    const result = await pool.request().query(`
      SELECT LoaiChiSoID AS id, TenChiSo AS tenChiSo, DonVi AS donVi,
        GiaTriMin AS giaTriMin, GiaTriMax AS giaTriMax,
        GiaTriMin2 AS giaTriMin2, GiaTriMax2 AS giaTriMax2, MoTa AS moTa
      FROM LoaiChiSoSucKhoe
      ORDER BY LoaiChiSoID
    `);
    return ok(res, result.recordset.map((row) => ({
      ...row,
      giaTriMin: row.giaTriMin == null ? null : Number(row.giaTriMin),
      giaTriMax: row.giaTriMax == null ? null : Number(row.giaTriMax),
      giaTriMin2: row.giaTriMin2 == null ? null : Number(row.giaTriMin2),
      giaTriMax2: row.giaTriMax2 == null ? null : Number(row.giaTriMax2),
    })));
  } catch (err) { next(err); }
};

// GET /api/elderly/me/health-metrics?loaiChiSoId=&tuNgay=&denNgay=
const getMine = async (req, res, next) => {
  try {
    const pool = await poolPromise;
    const elderlyId = await getOwnElderlyId(pool, req.user.userId);
    if (!elderlyId) {
      return fail(res, 'Tai khoan chua co ho so nguoi cao tuoi lien ket', 'ELDERLY_PROFILE_NOT_FOUND', 404);
    }

    const { loaiChiSoId, tuNgay, denNgay } = req.query;
    const typeId = loaiChiSoId == null || loaiChiSoId === '' ? null : Number(loaiChiSoId);
    if (typeId != null && (!Number.isInteger(typeId) || typeId < 1)) {
      return fail(res, 'loaiChiSoId khong hop le', 'INVALID_TYPE_ID', 400);
    }
    const datePattern = /^\d{4}-\d{2}-\d{2}$/;
    if ((tuNgay && !datePattern.test(tuNgay)) || (denNgay && !datePattern.test(denNgay))) {
      return fail(res, 'tuNgay va denNgay phai co dinh dang YYYY-MM-DD', 'INVALID_DATE', 400);
    }
    if (tuNgay && denNgay && tuNgay > denNgay) {
      return fail(res, 'tuNgay khong duoc lon hon denNgay', 'INVALID_DATE_RANGE', 400);
    }

    let query = `
      SELECT c.ChiSoID AS id, c.NguoiCaoTuoiID AS nguoiCaoTuoiId,
        c.LoaiChiSoID AS loaiChiSoId, l.TenChiSo AS tenChiSo, l.DonVi AS donVi,
        c.GiaTri AS giaTri, c.GiaTriPhu AS giaTriPhu,
        c.ThoiGianDo AS thoiGianDo, c.LaBatThuong AS laBatThuong,
        c.GhiChu AS ghiChu
      FROM ChiSoSucKhoe c
      JOIN LoaiChiSoSucKhoe l ON l.LoaiChiSoID = c.LoaiChiSoID
      WHERE c.NguoiCaoTuoiID = @elderlyId
    `;
    const request = pool.request().input('elderlyId', sql.Int, elderlyId);
    if (typeId != null) {
      query += ' AND c.LoaiChiSoID = @typeId';
      request.input('typeId', sql.Int, typeId);
    }
    if (tuNgay) {
      query += ' AND c.ThoiGianDo >= CAST(@fromDate AS DATE)';
      request.input('fromDate', sql.VarChar(10), tuNgay);
    }
    if (denNgay) {
      query += ' AND c.ThoiGianDo < DATEADD(DAY, 1, CAST(@toDate AS DATE))';
      request.input('toDate', sql.VarChar(10), denNgay);
    }
    query += ' ORDER BY c.ThoiGianDo DESC, c.ChiSoID DESC';

    const result = await request.query(query);
    return ok(res, result.recordset.map(mapMobileMetric));
  } catch (err) { next(err); }
};

// POST /api/elderly/me/health-metrics
const createMine = async (req, res, next) => {
  try {
    const typeId = Number(req.body.loaiChiSoId);
    const primaryValue = Number(req.body.giaTri);
    const secondaryRaw = req.body.giaTriPhu;
    const secondaryValue = secondaryRaw == null || secondaryRaw === '' ? null : Number(secondaryRaw);
    const note = req.body.ghiChu == null ? null : String(req.body.ghiChu).trim();

    if (!Number.isInteger(typeId) || typeId < 1) {
      return fail(res, 'loaiChiSoId khong hop le', 'INVALID_TYPE_ID', 400);
    }
    if (!Number.isFinite(primaryValue)) {
      return fail(res, 'giaTri phai la mot so hop le', 'INVALID_VALUE', 400);
    }
    if (secondaryValue != null && !Number.isFinite(secondaryValue)) {
      return fail(res, 'giaTriPhu phai la mot so hop le', 'INVALID_SECONDARY_VALUE', 400);
    }
    if (note && note.length > 300) {
      return fail(res, 'ghiChu khong duoc vuot qua 300 ky tu', 'NOTE_TOO_LONG', 400);
    }

    const pool = await poolPromise;
    const elderlyId = await getOwnElderlyId(pool, req.user.userId);
    if (!elderlyId) {
      return fail(res, 'Tai khoan chua co ho so nguoi cao tuoi lien ket', 'ELDERLY_PROFILE_NOT_FOUND', 404);
    }

    const typeResult = await pool.request()
      .input('typeId', sql.Int, typeId)
      .query(`
        SELECT LoaiChiSoID, TenChiSo, DonVi, GiaTriMin, GiaTriMax,
          GiaTriMin2, GiaTriMax2
        FROM LoaiChiSoSucKhoe
        WHERE LoaiChiSoID = @typeId
      `);
    if (!typeResult.recordset.length) {
      return fail(res, 'Khong tim thay loai chi so', 'METRIC_TYPE_NOT_FOUND', 404);
    }

    const metricType = typeResult.recordset[0];
    if ((metricType.GiaTriMin2 != null || metricType.GiaTriMax2 != null) && secondaryValue == null) {
      return fail(res, 'Loai chi so nay yeu cau giaTriPhu', 'SECONDARY_VALUE_REQUIRED', 400);
    }
    const assessment = evaluateMetric({
      tenChiSo: metricType.TenChiSo,
      giaTri: primaryValue,
      giaTriPhu: secondaryValue,
      min: metricType.GiaTriMin,
      max: metricType.GiaTriMax,
      min2: metricType.GiaTriMin2,
      max2: metricType.GiaTriMax2,
      manuallyAbnormal: false,
    });

    const result = await pool.request()
      .input('elderlyId', sql.Int, elderlyId)
      .input('typeId', sql.Int, typeId)
      .input('primaryValue', sql.Decimal(10, 2), primaryValue)
      .input('secondaryValue', sql.Decimal(10, 2), secondaryValue)
      .input('measuredBy', sql.Int, req.user.userId)
      .input('isAbnormal', sql.Bit, assessment.abnormal ? 1 : 0)
      .input('note', sql.NVarChar(300), note || null)
      .input('alertContent', sql.NVarChar(500), assessment.description)
      .input('alertLevel', sql.NVarChar(20), assessment.level)
      .query(`
        SET XACT_ABORT ON;
        BEGIN TRY
          BEGIN TRANSACTION;
          DECLARE @metricId INT;
          DECLARE @alertId INT = NULL;

          INSERT INTO ChiSoSucKhoe
            (NguoiCaoTuoiID, LoaiChiSoID, GiaTri, GiaTriPhu,
             ThoiGianDo, NguoiDoID, LaBatThuong, GhiChu)
          VALUES
            (@elderlyId, @typeId, @primaryValue, @secondaryValue,
             SYSDATETIME(), @measuredBy, @isAbnormal, @note);
          SET @metricId = SCOPE_IDENTITY();

          IF @isAbnormal = 1
          BEGIN
            INSERT INTO CanhBao
              (NguoiCaoTuoiID, LoaiCanhBao, NoiDung, MucDo, NguonBang, NguonID)
            VALUES
              (@elderlyId, N'ChiSoBatThuong', @alertContent, @alertLevel,
               N'ChiSoSucKhoe', @metricId);
            SET @alertId = SCOPE_IDENTITY();
          END;

          COMMIT TRANSACTION;

          SELECT c.ChiSoID AS id, c.NguoiCaoTuoiID AS nguoiCaoTuoiId,
            c.LoaiChiSoID AS loaiChiSoId, l.TenChiSo AS tenChiSo,
            l.DonVi AS donVi, c.GiaTri AS giaTri, c.GiaTriPhu AS giaTriPhu,
            c.ThoiGianDo AS thoiGianDo, c.LaBatThuong AS laBatThuong,
            c.GhiChu AS ghiChu, @alertId AS alertId
          FROM ChiSoSucKhoe c
          JOIN LoaiChiSoSucKhoe l ON l.LoaiChiSoID = c.LoaiChiSoID
          WHERE c.ChiSoID = @metricId;
        END TRY
        BEGIN CATCH
          IF @@TRANCOUNT > 0 ROLLBACK TRANSACTION;
          THROW;
        END CATCH
      `);

    const row = result.recordset[0];
    return ok(res, {
      ...mapMobileMetric(row),
      alertCreated: row.alertId != null,
      alertId: row.alertId,
      mucDoCanhBao: assessment.level,
    }, assessment.abnormal
      ? 'Da ghi nhan chi so bat thuong va tao canh bao'
      : 'Da ghi nhan chi so suc khoe', 201);
  } catch (err) { next(err); }
};

// GET /api/health-metrics?nguoiCaoTuoiId=&loaiChiSo=
const getAll = async (req, res, next) => {
  try {
    const { nguoiCaoTuoiId, loaiChiSo } = req.query;
    const pool = await poolPromise;

    let query = `
      SELECT c.ChiSoID AS id, c.NguoiCaoTuoiID AS nguoiCaoTuoiId,
        nct.HoTen AS nguoiCaoTuoiTen, l.TenChiSo AS tenChiSo, l.DonVi AS donVi,
        c.GiaTri AS giaTri, c.GiaTriPhu AS giaTriPhu, c.ThoiGianDo AS thoiGianDo,
        c.LaBatThuong AS laBatThuong, c.GhiChu AS ghiChu
      FROM ChiSoSucKhoe c
      JOIN HoSoNguoiCaoTuoi nct ON c.NguoiCaoTuoiID = nct.NguoiCaoTuoiID
      JOIN LoaiChiSoSucKhoe l ON c.LoaiChiSoID = l.LoaiChiSoID
      WHERE 1=1
    `;
    const req2 = pool.request();
    if (nguoiCaoTuoiId) { query += ` AND c.NguoiCaoTuoiID=@nctId`; req2.input('nctId', sql.Int, parseInt(nguoiCaoTuoiId)); }
    if (loaiChiSo) {
      // Tim TenChiSo tuong ung voi ma frontend
      const tenChiSo = Object.entries(MAP_LOAI).find(([, v]) => v.ma === loaiChiSo)?.[0];
      if (tenChiSo) { query += ` AND l.TenChiSo=@tenChiSo`; req2.input('tenChiSo', sql.NVarChar, tenChiSo); }
    }
    query += scopedWhere(req, 'c.NguoiCaoTuoiID');
    query += ` ORDER BY c.ThoiGianDo DESC`;
    const result = await req2.query(query);
    return ok(res, result.recordset.map(mapMetric));
  } catch (err) { next(err); }
};

// POST /api/health-metrics
const create = async (req, res, next) => {
  try {
    const { loaiChiSo, giaTri, ngayDo, gioDo, binhThuong, ghiChu } = req.body;
    const nguoiCaoTuoiId = targetElderlyId(req, req.body.nguoiCaoTuoiId);
    if (isMobileRole(req) && nguoiCaoTuoiId == null) return fail(res, 'Khong co quyen ghi chi so cho ho so nay', 'FORBIDDEN_ELDERLY', 403);
    if (!nguoiCaoTuoiId || !loaiChiSo || !giaTri)
      return fail(res, 'nguoiCaoTuoiId, loaiChiSo, giaTri la bat buoc', 'MISSING_FIELDS', 400);

    const pool = await poolPromise;
    // Lay LoaiChiSoID tu TenChiSo
    const tenChiSo = Object.entries(MAP_LOAI).find(([, v]) => v.ma === loaiChiSo)?.[0];
    const loaiRes = await pool.request().input('ten', sql.NVarChar, tenChiSo || loaiChiSo)
      .query(`
        SELECT LoaiChiSoID, TenChiSo, GiaTriMin, GiaTriMax, GiaTriMin2, GiaTriMax2
        FROM LoaiChiSoSucKhoe
        WHERE TenChiSo=@ten
      `);
    if (!loaiRes.recordset.length)
      return fail(res, 'Loai chi so khong hop le', 'INVALID_TYPE', 400);

    const metricType = loaiRes.recordset[0];
    const loaiChiSoId = metricType.LoaiChiSoID;

    // Parse GiaTri: co the la "120/80" (huyet ap) hoac so don
    let giaTriNum = null, giaTriPhuNum = null;
    if (String(giaTri).includes('/')) {
      const parts = String(giaTri).split('/');
      giaTriNum = parseFloat(parts[0]);
      giaTriPhuNum = parseFloat(parts[1]);
    } else {
      giaTriNum = parseFloat(giaTri);
    }

    if (!Number.isFinite(giaTriNum) || (giaTriPhuNum != null && !Number.isFinite(giaTriPhuNum)))
      return fail(res, 'Gia tri chi so khong hop le', 'INVALID_VALUE', 400);

    const assessment = evaluateMetric({
      tenChiSo: metricType.TenChiSo,
      giaTri: giaTriNum,
      giaTriPhu: giaTriPhuNum,
      min: metricType.GiaTriMin,
      max: metricType.GiaTriMax,
      min2: metricType.GiaTriMin2,
      max2: metricType.GiaTriMax2,
      manuallyAbnormal: binhThuong === false,
    });

    const thoiGianDo = ngayDo && gioDo ? new Date(`${ngayDo}T${gioDo}:00`) : new Date();
    const r = await pool.request()
      .input('nctId', sql.Int, nguoiCaoTuoiId)
      .input('loaiId', sql.Int, loaiChiSoId)
      .input('giaTri', sql.Decimal(10, 2), giaTriNum)
      .input('giaTriPhu', sql.Decimal(10, 2), giaTriPhuNum)
      .input('thoiGian', sql.DateTime2, thoiGianDo)
      .input('laBatThuong', sql.Bit, assessment.abnormal ? 1 : 0)
      .input('ghiChu', sql.NVarChar, ghiChu || null)
      .input('nguoiDoId', sql.Int, req.user.userId)
      .input('noiDungCanhBao', sql.NVarChar(500), assessment.description)
      .input('mucDoCanhBao', sql.NVarChar(20), assessment.level)
      .query(`
        DECLARE @ChiSoMoi TABLE (ChiSoID INT);
        DECLARE @chiSoId INT;
        DECLARE @canhBaoId INT = NULL;

        INSERT INTO ChiSoSucKhoe
          (NguoiCaoTuoiID,LoaiChiSoID,GiaTri,GiaTriPhu,ThoiGianDo,NguoiDoID,LaBatThuong,GhiChu)
        OUTPUT INSERTED.ChiSoID INTO @ChiSoMoi
        VALUES (@nctId,@loaiId,@giaTri,@giaTriPhu,@thoiGian,@nguoiDoId,@laBatThuong,@ghiChu);

        SELECT TOP 1 @chiSoId = ChiSoID FROM @ChiSoMoi;

        IF @laBatThuong = 1
        BEGIN
          INSERT INTO CanhBao
            (NguoiCaoTuoiID, LoaiCanhBao, NoiDung, MucDo, NguonBang, NguonID)
          VALUES
            (@nctId, N'ChiSoBatThuong', @noiDungCanhBao, @mucDoCanhBao, N'ChiSoSucKhoe', @chiSoId);
          SET @canhBaoId = SCOPE_IDENTITY();
        END;

        SELECT @chiSoId AS id, @canhBaoId AS alertId;
      `);
    return ok(res, {
      id: r.recordset[0].id,
      alertCreated: r.recordset[0].alertId != null,
      alertId: r.recordset[0].alertId,
      automaticAssessment: assessment.abnormal ? 'BAT_THUONG' : 'BINH_THUONG',
    }, assessment.abnormal ? 'Them chi so va tao canh bao thanh cong' : 'Them chi so thanh cong', 201);
  } catch (err) { next(err); }
};

module.exports = { getMetricTypes, getMine, createMine, getAll, create };
