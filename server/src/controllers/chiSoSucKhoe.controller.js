// controllers/chiSoSucKhoe.controller.js - Chi so suc khoe - dung schema that
// Bang ChiSoSucKhoe: ChiSoID, NguoiCaoTuoiID, LoaiChiSoID (FK), GiaTri,
//   GiaTriPhu, ThoiGianDo, NguoiDoID, LaBatThuong BIT, GhiChu
// Bang LoaiChiSoSucKhoe: LoaiChiSoID, TenChiSo, DonVi, GiaTriMin, GiaTriMax
const { poolPromise, sql } = require('../config/db');
const { ok, fail } = require('../utils/response');

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
    query += ` ORDER BY c.ThoiGianDo DESC`;
    const result = await req2.query(query);
    return ok(res, result.recordset.map(mapMetric));
  } catch (err) { next(err); }
};

// POST /api/health-metrics
const create = async (req, res, next) => {
  try {
    const { nguoiCaoTuoiId, loaiChiSo, giaTri, ngayDo, gioDo, binhThuong, ghiChu } = req.body;
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

module.exports = { getAll, create };
