const { poolPromise, sql } = require('../config/db');
const { ok, fail } = require('../utils/response');

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

const formatDate = (date) => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

const isValidDate = (value) => {
  if (!DATE_PATTERN.test(value || '')) return false;
  const parsed = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
};

const reportRequest = (pool, { fromDate, toDate, elderlyId }) => pool.request()
  .input('fromDate', sql.VarChar(10), fromDate)
  .input('toDate', sql.VarChar(10), toDate)
  .input('elderlyId', sql.Int, elderlyId);

const numberOrZero = (value) => Number(value || 0);

// GET /api/reports/health-summary?from=YYYY-MM-DD&to=YYYY-MM-DD&nguoiCaoTuoiId=
const getHealthSummary = async (req, res, next) => {
  try {
    const today = new Date();
    const defaultFrom = new Date(today.getFullYear(), today.getMonth(), today.getDate() - 29);
    const fromDate = req.query.from || formatDate(defaultFrom);
    const toDate = req.query.to || formatDate(today);
    const elderlyRaw = req.query.nguoiCaoTuoiId;
    const elderlyId = elderlyRaw == null || elderlyRaw === '' ? null : Number(elderlyRaw);

    if (!isValidDate(fromDate) || !isValidDate(toDate) || fromDate > toDate) {
      return fail(res, 'Khoang ngay bao cao khong hop le', 'INVALID_REPORT_DATE_RANGE', 400);
    }
    if (elderlyId != null && (!Number.isInteger(elderlyId) || elderlyId < 1)) {
      return fail(res, 'ID nguoi cao tuoi khong hop le', 'INVALID_ELDERLY_ID', 400);
    }

    const pool = await poolPromise;
    const [kpiResult, weeklyResult, monthlyResult, metricResult, elderlyResult, subjectResult] = await Promise.all([
      reportRequest(pool, { fromDate, toDate, elderlyId }).query(`
        SELECT
          (SELECT COUNT_BIG(1) FROM LichUongThuoc lut
            WHERE lut.ThoiGianDuKien >= CAST(@fromDate AS DATE)
              AND lut.ThoiGianDuKien < DATEADD(DAY,1,CAST(@toDate AS DATE))
              AND (@elderlyId IS NULL OR lut.NguoiCaoTuoiID=@elderlyId)) AS tongLieu,
          (SELECT COUNT_BIG(1) FROM LichUongThuoc lut
            WHERE lut.ThoiGianDuKien >= CAST(@fromDate AS DATE)
              AND lut.ThoiGianDuKien < DATEADD(DAY,1,CAST(@toDate AS DATE))
              AND lut.TrangThai=N'DaUong'
              AND (@elderlyId IS NULL OR lut.NguoiCaoTuoiID=@elderlyId)) AS daUong,
          (SELECT COUNT_BIG(1) FROM CanhBao cb
            WHERE cb.NgayTao >= CAST(@fromDate AS DATE)
              AND cb.NgayTao < DATEADD(DAY,1,CAST(@toDate AS DATE))
              AND (@elderlyId IS NULL OR cb.NguoiCaoTuoiID=@elderlyId)) AS tongCanhBao,
          (SELECT COUNT_BIG(1) FROM CanhBao cb
            WHERE cb.NgayTao >= CAST(@fromDate AS DATE)
              AND cb.NgayTao < DATEADD(DAY,1,CAST(@toDate AS DATE))
              AND cb.TrangThai=N'DaXuLy'
              AND (@elderlyId IS NULL OR cb.NguoiCaoTuoiID=@elderlyId)) AS canhBaoDaXuLy,
          (SELECT COUNT_BIG(1) FROM CanhBaoKhanCap sos
            WHERE sos.NgayGui >= CAST(@fromDate AS DATE)
              AND sos.NgayGui < DATEADD(DAY,1,CAST(@toDate AS DATE))
              AND (@elderlyId IS NULL OR sos.NguoiCaoTuoiID=@elderlyId)) AS soSOS,
          (SELECT COUNT_BIG(1) FROM ChiSoSucKhoe cs
            WHERE cs.ThoiGianDo >= CAST(@fromDate AS DATE)
              AND cs.ThoiGianDo < DATEADD(DAY,1,CAST(@toDate AS DATE))
              AND cs.LaBatThuong=1
              AND (@elderlyId IS NULL OR cs.NguoiCaoTuoiID=@elderlyId)) AS chiSoBatThuong
      `),
      reportRequest(pool, { fromDate, toDate, elderlyId }).query(`
        WITH ThuocTheoTuan AS (
          SELECT
            DATEADD(DAY,-(DATEDIFF(DAY,'19000101',CAST(lut.ThoiGianDuKien AS DATE)) % 7),
              CAST(lut.ThoiGianDuKien AS DATE)) AS tuanBatDau,
            lut.TrangThai
          FROM LichUongThuoc lut
          WHERE lut.ThoiGianDuKien >= CAST(@fromDate AS DATE)
            AND lut.ThoiGianDuKien < DATEADD(DAY,1,CAST(@toDate AS DATE))
            AND (@elderlyId IS NULL OR lut.NguoiCaoTuoiID=@elderlyId)
        )
        SELECT CONVERT(VARCHAR(10),tuanBatDau,23) AS tuanBatDau,
          COUNT_BIG(1) AS tongLieu,
          SUM(CASE WHEN TrangThai=N'DaUong' THEN 1 ELSE 0 END) AS daUong,
          SUM(CASE WHEN TrangThai IN (N'BoLo',N'TuChoi') THEN 1 ELSE 0 END) AS boLoTuChoi,
          SUM(CASE WHEN TrangThai=N'ChuaDenGio' THEN 1 ELSE 0 END) AS chuaDenGio
        FROM ThuocTheoTuan
        GROUP BY tuanBatDau
        ORDER BY tuanBatDau
      `),
      reportRequest(pool, { fromDate, toDate, elderlyId }).query(`
        SELECT YEAR(cb.NgayTao) AS nam, MONTH(cb.NgayTao) AS thang, cb.MucDo AS mucDo,
          COUNT_BIG(1) AS soLuong
        FROM CanhBao cb
        WHERE cb.NgayTao >= CAST(@fromDate AS DATE)
          AND cb.NgayTao < DATEADD(DAY,1,CAST(@toDate AS DATE))
          AND (@elderlyId IS NULL OR cb.NguoiCaoTuoiID=@elderlyId)
        GROUP BY YEAR(cb.NgayTao),MONTH(cb.NgayTao),cb.MucDo
        ORDER BY nam,thang
      `),
      reportRequest(pool, { fromDate, toDate, elderlyId }).query(`
        SELECT l.LoaiChiSoID AS loaiChiSoId, l.TenChiSo AS tenChiSo,
          l.DonVi AS donVi, l.GiaTriMin AS giaTriMin, l.GiaTriMax AS giaTriMax,
          l.GiaTriMin2 AS giaTriMin2, l.GiaTriMax2 AS giaTriMax2,
          cs.ChiSoID AS chiSoId, cs.GiaTri AS giaTri, cs.GiaTriPhu AS giaTriPhu,
          CONVERT(VARCHAR(19),cs.ThoiGianDo,126) AS thoiGianDo,
          cs.LaBatThuong AS laBatThuong
        FROM LoaiChiSoSucKhoe l
        LEFT JOIN ChiSoSucKhoe cs ON cs.LoaiChiSoID=l.LoaiChiSoID
          AND cs.ThoiGianDo >= CAST(@fromDate AS DATE)
          AND cs.ThoiGianDo < DATEADD(DAY,1,CAST(@toDate AS DATE))
          AND (@elderlyId IS NULL OR cs.NguoiCaoTuoiID=@elderlyId)
        ORDER BY l.LoaiChiSoID,cs.ThoiGianDo,cs.ChiSoID
      `),
      reportRequest(pool, { fromDate, toDate, elderlyId }).query(`
        SELECT nct.NguoiCaoTuoiID AS id, nct.HoTen AS hoTen,
          nct.NgaySinh AS ngaySinh, nct.GioiTinh AS gioiTinh,
          COALESCE(thuoc.daUong,0) AS daUong,
          COALESCE(thuoc.boLoTuChoi,0) AS boLoTuChoi,
          COALESCE(canhBao.soCanhBao,0) AS soCanhBao,
          batThuong.tenChiSo AS chiSoBatThuongTen,
          batThuong.giaTri AS chiSoBatThuongGiaTri,
          batThuong.giaTriPhu AS chiSoBatThuongGiaTriPhu,
          batThuong.donVi AS chiSoBatThuongDonVi,
          CONVERT(VARCHAR(19),batThuong.thoiGianDo,126) AS chiSoBatThuongThoiGian
        FROM HoSoNguoiCaoTuoi nct
        OUTER APPLY (
          SELECT
            SUM(CASE WHEN lut.TrangThai=N'DaUong' THEN 1 ELSE 0 END) AS daUong,
            SUM(CASE WHEN lut.TrangThai IN (N'BoLo',N'TuChoi') THEN 1 ELSE 0 END) AS boLoTuChoi
          FROM LichUongThuoc lut
          WHERE lut.NguoiCaoTuoiID=nct.NguoiCaoTuoiID
            AND lut.ThoiGianDuKien >= CAST(@fromDate AS DATE)
            AND lut.ThoiGianDuKien < DATEADD(DAY,1,CAST(@toDate AS DATE))
        ) thuoc
        OUTER APPLY (
          SELECT COUNT_BIG(1) AS soCanhBao
          FROM CanhBao cb
          WHERE cb.NguoiCaoTuoiID=nct.NguoiCaoTuoiID
            AND cb.NgayTao >= CAST(@fromDate AS DATE)
            AND cb.NgayTao < DATEADD(DAY,1,CAST(@toDate AS DATE))
        ) canhBao
        OUTER APPLY (
          SELECT TOP (1) l.TenChiSo AS tenChiSo, cs.GiaTri AS giaTri,
            cs.GiaTriPhu AS giaTriPhu, l.DonVi AS donVi, cs.ThoiGianDo AS thoiGianDo
          FROM ChiSoSucKhoe cs
          JOIN LoaiChiSoSucKhoe l ON l.LoaiChiSoID=cs.LoaiChiSoID
          WHERE cs.NguoiCaoTuoiID=nct.NguoiCaoTuoiID
            AND cs.LaBatThuong=1
            AND cs.ThoiGianDo >= CAST(@fromDate AS DATE)
            AND cs.ThoiGianDo < DATEADD(DAY,1,CAST(@toDate AS DATE))
          ORDER BY cs.ThoiGianDo DESC,cs.ChiSoID DESC
        ) batThuong
        WHERE (@elderlyId IS NULL OR nct.NguoiCaoTuoiID=@elderlyId)
        ORDER BY nct.HoTen,nct.NguoiCaoTuoiID
      `),
      pool.request().query(`
        SELECT NguoiCaoTuoiID AS id, HoTen AS hoTen
        FROM HoSoNguoiCaoTuoi
        ORDER BY HoTen,NguoiCaoTuoiID
      `),
    ]);

    const rawKpis = kpiResult.recordset[0] || {};
    const medicationTotal = numberOrZero(rawKpis.tongLieu);
    const medicationTaken = numberOrZero(rawKpis.daUong);
    const alertTotal = numberOrZero(rawKpis.tongCanhBao);
    const alertResolved = numberOrZero(rawKpis.canhBaoDaXuLy);

    const metricTypes = new Map();
    metricResult.recordset.forEach((row) => {
      if (!metricTypes.has(row.loaiChiSoId)) {
        metricTypes.set(row.loaiChiSoId, {
          id: row.loaiChiSoId,
          ten: row.tenChiSo,
          donVi: row.donVi,
          giaTriMin: row.giaTriMin == null ? null : Number(row.giaTriMin),
          giaTriMax: row.giaTriMax == null ? null : Number(row.giaTriMax),
          giaTriMin2: row.giaTriMin2 == null ? null : Number(row.giaTriMin2),
          giaTriMax2: row.giaTriMax2 == null ? null : Number(row.giaTriMax2),
          duLieu: [],
        });
      }
      if (row.chiSoId != null) {
        metricTypes.get(row.loaiChiSoId).duLieu.push({
          id: row.chiSoId,
          thoiGian: row.thoiGianDo,
          giaTri: Number(row.giaTri),
          giaTriPhu: row.giaTriPhu == null ? null : Number(row.giaTriPhu),
          laBatThuong: Boolean(row.laBatThuong),
        });
      }
    });

    return ok(res, {
      boLoc: { tuNgay: fromDate, denNgay: toDate, nguoiCaoTuoiId: elderlyId },
      doiTuong: subjectResult.recordset,
      kpi: {
        tongLieu: medicationTotal,
        daUong: medicationTaken,
        tyLeTuanThu: medicationTotal ? Math.round((medicationTaken / medicationTotal) * 1000) / 10 : 0,
        tongCanhBao: alertTotal,
        canhBaoDaXuLy: alertResolved,
        tyLeCanhBaoDaXuLy: alertTotal ? Math.round((alertResolved / alertTotal) * 1000) / 10 : 0,
        soSOS: numberOrZero(rawKpis.soSOS),
        chiSoBatThuong: numberOrZero(rawKpis.chiSoBatThuong),
      },
      tuanThuTheoTuan: weeklyResult.recordset.map((row) => {
        const total = numberOrZero(row.tongLieu);
        const taken = numberOrZero(row.daUong);
        return {
          tuanBatDau: row.tuanBatDau,
          tongLieu: total,
          daUong: taken,
          boLoTuChoi: numberOrZero(row.boLoTuChoi),
          chuaDenGio: numberOrZero(row.chuaDenGio),
          tyLe: total ? Math.round((taken / total) * 1000) / 10 : 0,
        };
      }),
      canhBaoTheoThang: monthlyResult.recordset.map((row) => ({
        nam: Number(row.nam),
        thang: Number(row.thang),
        mucDo: row.mucDo,
        soLuong: numberOrZero(row.soLuong),
      })),
      xuHuongChiSo: Array.from(metricTypes.values()),
      tongHopNguoiCaoTuoi: elderlyResult.recordset.map((row) => ({
        id: row.id,
        hoTen: row.hoTen,
        ngaySinh: row.ngaySinh,
        gioiTinh: row.gioiTinh,
        daUong: numberOrZero(row.daUong),
        boLoTuChoi: numberOrZero(row.boLoTuChoi),
        soCanhBao: numberOrZero(row.soCanhBao),
        chiSoBatThuongGanNhat: row.chiSoBatThuongTen ? {
          ten: row.chiSoBatThuongTen,
          giaTri: Number(row.chiSoBatThuongGiaTri),
          giaTriPhu: row.chiSoBatThuongGiaTriPhu == null ? null : Number(row.chiSoBatThuongGiaTriPhu),
          donVi: row.chiSoBatThuongDonVi,
          thoiGian: row.chiSoBatThuongThoiGian,
        } : null,
      })),
    });
  } catch (error) {
    next(error);
  }
};

module.exports = { getHealthSummary };
