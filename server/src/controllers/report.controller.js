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

const reportRequest = (pool, { fromDate, toDate, elderlyId, caregiverUserId, ageGroup, gender, careStatus }) => pool.request()
  .input('fromDate', sql.VarChar(10), fromDate)
  .input('toDate', sql.VarChar(10), toDate)
  .input('elderlyId', sql.Int, elderlyId)
  .input('caregiverUserId', sql.Int, caregiverUserId)
  .input('ageGroup', sql.VarChar(20), ageGroup)
  .input('gender', sql.NVarChar(10), gender)
  .input('careStatus', sql.VarChar(25), careStatus);

const assignedScope = (elderlyColumn) => ` AND (@caregiverUserId IS NULL OR EXISTS (
  SELECT 1 FROM NguoiCaoTuoi_NguoiChamSoc scopeLink
  JOIN NguoiChamSoc scopeCaregiver ON scopeCaregiver.NguoiChamSocID=scopeLink.NguoiChamSocID
  WHERE scopeLink.NguoiCaoTuoiID=${elderlyColumn} AND scopeCaregiver.UserID=@caregiverUserId
    AND scopeCaregiver.TrangThai=N'DangLamViec'
    AND scopeLink.NgayBatDau<=CAST(DATEADD(HOUR,7,SYSUTCDATETIME()) AS DATE)
    AND (scopeLink.NgayKetThuc IS NULL OR scopeLink.NgayKetThuc>CAST(DATEADD(HOUR,7,SYSUTCDATETIME()) AS DATE))
))`;

const profileScope = (elderlyColumn) => `${assignedScope(elderlyColumn)} AND EXISTS (
  SELECT 1 FROM HoSoNguoiCaoTuoi filteredProfile
  WHERE filteredProfile.NguoiCaoTuoiID=${elderlyColumn}
    AND (@gender IS NULL OR filteredProfile.GioiTinh=@gender)
    AND (@careStatus IS NULL OR filteredProfile.TrangThai=@careStatus)
    AND (@ageGroup IS NULL OR
      CASE
        WHEN DATEDIFF(YEAR,filteredProfile.NgaySinh,CAST(@toDate AS DATE))
          - CASE WHEN DATEADD(YEAR,DATEDIFF(YEAR,filteredProfile.NgaySinh,CAST(@toDate AS DATE)),filteredProfile.NgaySinh)
              > CAST(@toDate AS DATE) THEN 1 ELSE 0 END < 60 THEN 'under60'
        WHEN DATEDIFF(YEAR,filteredProfile.NgaySinh,CAST(@toDate AS DATE))
          - CASE WHEN DATEADD(YEAR,DATEDIFF(YEAR,filteredProfile.NgaySinh,CAST(@toDate AS DATE)),filteredProfile.NgaySinh)
              > CAST(@toDate AS DATE) THEN 1 ELSE 0 END < 70 THEN '60to69'
        WHEN DATEDIFF(YEAR,filteredProfile.NgaySinh,CAST(@toDate AS DATE))
          - CASE WHEN DATEADD(YEAR,DATEDIFF(YEAR,filteredProfile.NgaySinh,CAST(@toDate AS DATE)),filteredProfile.NgaySinh)
              > CAST(@toDate AS DATE) THEN 1 ELSE 0 END < 80 THEN '70to79'
        ELSE '80plus'
      END=@ageGroup)
)`;

const numberOrZero = (value) => Number(value || 0);

// GET /api/reports/health-summary?from=YYYY-MM-DD&to=YYYY-MM-DD&nguoiCaoTuoiId=&nhomTuoi=&gioiTinh=&trangThai=
const getHealthSummary = async (req, res, next) => {
  try {
    const today = new Date();
    const defaultFrom = new Date(today.getFullYear(), today.getMonth(), today.getDate() - 29);
    const fromDate = req.query.from || formatDate(defaultFrom);
    const toDate = req.query.to || formatDate(today);
    const elderlyRaw = req.query.nguoiCaoTuoiId;
    const elderlyId = elderlyRaw == null || elderlyRaw === '' ? null : Number(elderlyRaw);
    const ageGroup = req.query.nhomTuoi || null;
    const gender = req.query.gioiTinh || null;
    const careStatus = req.query.trangThai || null;

    if (!isValidDate(fromDate) || !isValidDate(toDate) || fromDate > toDate) {
      return fail(res, 'Khoang ngay bao cao khong hop le', 'INVALID_REPORT_DATE_RANGE', 400);
    }
    if (elderlyId != null && (!Number.isInteger(elderlyId) || elderlyId < 1)) {
      return fail(res, 'ID nguoi cao tuoi khong hop le', 'INVALID_ELDERLY_ID', 400);
    }
    if (ageGroup && !['under60', '60to69', '70to79', '80plus'].includes(ageGroup)) {
      return fail(res, 'Nhom tuoi khong hop le', 'INVALID_AGE_GROUP', 400);
    }
    if (gender && !['Nam', 'Nữ', 'Khác'].includes(gender)) {
      return fail(res, 'Gioi tinh khong hop le', 'INVALID_GENDER', 400);
    }
    if (careStatus && !['DangTheoDoi', 'CanChamSocDacBiet', 'NgungTheoDoi'].includes(careStatus)) {
      return fail(res, 'Tinh trang cham soc khong hop le', 'INVALID_CARE_STATUS', 400);
    }

    const pool = await poolPromise;
    const caregiverUserId = req.user.tenVaiTro === 'NguoiChamSoc' ? req.user.userId : null;
    const params = { fromDate, toDate, elderlyId, caregiverUserId, ageGroup, gender, careStatus };
    const [kpiResult, weeklyResult, monthlyResult, metricResult, elderlyResult, subjectResult, careNoteResult, caregiverResult] = await Promise.all([
      reportRequest(pool, params).query(`
        SELECT
          (SELECT COUNT_BIG(1) FROM LichUongThuoc lut
            WHERE lut.ThoiGianDuKien >= CAST(@fromDate AS DATE)
              AND lut.ThoiGianDuKien < DATEADD(DAY,1,CAST(@toDate AS DATE))
              AND lut.TrangThai IN (N'DaUong',N'BoLo',N'TuChoi')
              AND (@elderlyId IS NULL OR lut.NguoiCaoTuoiID=@elderlyId)
              ${profileScope('lut.NguoiCaoTuoiID')}) AS tongLieu,
          (SELECT COUNT_BIG(1) FROM LichUongThuoc lut
            WHERE lut.ThoiGianDuKien >= CAST(@fromDate AS DATE)
              AND lut.ThoiGianDuKien < DATEADD(DAY,1,CAST(@toDate AS DATE))
              AND lut.TrangThai=N'DaUong'
              AND (@elderlyId IS NULL OR lut.NguoiCaoTuoiID=@elderlyId)
              ${profileScope('lut.NguoiCaoTuoiID')}) AS daUong,
          (SELECT COUNT_BIG(1) FROM CanhBao cb
            WHERE cb.NgayTao >= CAST(@fromDate AS DATE)
              AND cb.NgayTao < DATEADD(DAY,1,CAST(@toDate AS DATE))
              AND (@elderlyId IS NULL OR cb.NguoiCaoTuoiID=@elderlyId)
              ${profileScope('cb.NguoiCaoTuoiID')}) AS tongCanhBao,
          (SELECT COUNT_BIG(1) FROM CanhBao cb
            WHERE cb.NgayTao >= CAST(@fromDate AS DATE)
              AND cb.NgayTao < DATEADD(DAY,1,CAST(@toDate AS DATE))
              AND cb.TrangThai=N'DaXuLy'
              AND (@elderlyId IS NULL OR cb.NguoiCaoTuoiID=@elderlyId)
              ${profileScope('cb.NguoiCaoTuoiID')}) AS canhBaoDaXuLy,
          (SELECT COUNT_BIG(1) FROM CanhBaoKhanCap sos
            WHERE sos.NgayGui >= CAST(@fromDate AS DATE)
              AND sos.NgayGui < DATEADD(DAY,1,CAST(@toDate AS DATE))
              AND (@elderlyId IS NULL OR sos.NguoiCaoTuoiID=@elderlyId)
              ${profileScope('sos.NguoiCaoTuoiID')}) AS soSOS,
          (SELECT COUNT_BIG(1) FROM ChiSoSucKhoe cs
            WHERE cs.ThoiGianDo >= CAST(@fromDate AS DATE)
              AND cs.ThoiGianDo < DATEADD(DAY,1,CAST(@toDate AS DATE))
              AND cs.LaBatThuong=1
              AND (@elderlyId IS NULL OR cs.NguoiCaoTuoiID=@elderlyId)
              ${profileScope('cs.NguoiCaoTuoiID')}) AS chiSoBatThuong
      `),
      reportRequest(pool, params).query(`
        WITH ThuocTheoTuan AS (
          SELECT
            DATEADD(DAY,-(DATEDIFF(DAY,'19000101',CAST(lut.ThoiGianDuKien AS DATE)) % 7),
              CAST(lut.ThoiGianDuKien AS DATE)) AS tuanBatDau,
            lut.TrangThai,lut.ThoiGianDuKien
          FROM LichUongThuoc lut
          WHERE lut.ThoiGianDuKien >= CAST(@fromDate AS DATE)
            AND lut.ThoiGianDuKien < DATEADD(DAY,1,CAST(@toDate AS DATE))
            AND (@elderlyId IS NULL OR lut.NguoiCaoTuoiID=@elderlyId)
            ${profileScope('lut.NguoiCaoTuoiID')}
        )
        SELECT CONVERT(VARCHAR(10),tuanBatDau,23) AS tuanBatDau,
          SUM(CASE WHEN TrangThai IN (N'DaUong',N'BoLo',N'TuChoi') THEN 1 ELSE 0 END) AS tongLieu,
          SUM(CASE WHEN TrangThai=N'DaUong' THEN 1 ELSE 0 END) AS daUong,
          SUM(CASE WHEN TrangThai IN (N'BoLo',N'TuChoi') THEN 1 ELSE 0 END) AS boLoTuChoi,
          SUM(CASE WHEN TrangThai=N'ChuaDenGio'
            AND ThoiGianDuKien>DATEADD(HOUR,7,SYSUTCDATETIME()) THEN 1 ELSE 0 END) AS chuaDenGio
        FROM ThuocTheoTuan
        GROUP BY tuanBatDau
        ORDER BY tuanBatDau
      `),
      reportRequest(pool, params).query(`
        SELECT YEAR(cb.NgayTao) AS nam, MONTH(cb.NgayTao) AS thang, cb.MucDo AS mucDo,
          COUNT_BIG(1) AS soLuong
        FROM CanhBao cb
        WHERE cb.NgayTao >= CAST(@fromDate AS DATE)
          AND cb.NgayTao < DATEADD(DAY,1,CAST(@toDate AS DATE))
          AND (@elderlyId IS NULL OR cb.NguoiCaoTuoiID=@elderlyId)
          ${profileScope('cb.NguoiCaoTuoiID')}
        GROUP BY YEAR(cb.NgayTao),MONTH(cb.NgayTao),cb.MucDo
        ORDER BY nam,thang
      `),
      reportRequest(pool, params).query(`
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
          ${profileScope('cs.NguoiCaoTuoiID')}
        ORDER BY l.LoaiChiSoID,cs.ThoiGianDo,cs.ChiSoID
      `),
      reportRequest(pool, params).query(`
        SELECT nct.NguoiCaoTuoiID AS id, nct.HoTen AS hoTen,
          nct.NgaySinh AS ngaySinh, nct.GioiTinh AS gioiTinh,
          nct.TrangThai AS trangThai,
          DATEDIFF(YEAR,nct.NgaySinh,CAST(@toDate AS DATE))
            - CASE WHEN DATEADD(YEAR,DATEDIFF(YEAR,nct.NgaySinh,CAST(@toDate AS DATE)),nct.NgaySinh)
                > CAST(@toDate AS DATE) THEN 1 ELSE 0 END AS tuoi,
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
          ${profileScope('nct.NguoiCaoTuoiID')}
        ORDER BY nct.HoTen,nct.NguoiCaoTuoiID
      `),
      reportRequest(pool, params).query(`
        SELECT NguoiCaoTuoiID AS id, HoTen AS hoTen
        FROM HoSoNguoiCaoTuoi nct
        WHERE 1=1 ${profileScope('nct.NguoiCaoTuoiID')}
        ORDER BY HoTen,NguoiCaoTuoiID
      `),
      reportRequest(pool, params).query(`
        SELECT CONVERT(VARCHAR(10),CAST(nk.NgayGhi AS DATE),23) AS ngay,
          COUNT_BIG(1) AS soNhatKy,
          COUNT(DISTINCT nk.NguoiCaoTuoiID) AS soNguoiDuocChamSoc
        FROM NhatKyChamSoc nk
        WHERE nk.NgayGhi >= CAST(@fromDate AS DATE)
          AND nk.NgayGhi < DATEADD(DAY,1,CAST(@toDate AS DATE))
          AND nk.TrangThai <> N'HUY'
          AND (@elderlyId IS NULL OR nk.NguoiCaoTuoiID=@elderlyId)
          ${profileScope('nk.NguoiCaoTuoiID')}
        GROUP BY CAST(nk.NgayGhi AS DATE)
        ORDER BY ngay
      `),
      reportRequest(pool, params).query(`
        SELECT ncs.NguoiChamSocID AS id, ncs.HoTen AS hoTen,
          ncs.TrangThai AS trangThai, ncs.UserID AS userId,
          COALESCE(assigned.soNguoiPhuTrach,0) AS soNguoiPhuTrach,
          COALESCE(notes.soNhatKy,0) AS soNhatKy
        FROM NguoiChamSoc ncs
        OUTER APPLY (
          SELECT COUNT(DISTINCT lk.NguoiCaoTuoiID) AS soNguoiPhuTrach
          FROM NguoiCaoTuoi_NguoiChamSoc lk
          WHERE lk.NguoiChamSocID=ncs.NguoiChamSocID
            AND lk.NgayBatDau<=CAST(DATEADD(HOUR,7,SYSUTCDATETIME()) AS DATE)
            AND (lk.NgayKetThuc IS NULL OR lk.NgayKetThuc>CAST(DATEADD(HOUR,7,SYSUTCDATETIME()) AS DATE))
            AND (@elderlyId IS NULL OR lk.NguoiCaoTuoiID=@elderlyId)
            ${profileScope('lk.NguoiCaoTuoiID')}
        ) assigned
        OUTER APPLY (
          SELECT COUNT_BIG(1) AS soNhatKy
          FROM NhatKyChamSoc nk
          WHERE nk.NguoiChamSocID=ncs.NguoiChamSocID
            AND nk.NgayGhi>=CAST(@fromDate AS DATE)
            AND nk.NgayGhi<DATEADD(DAY,1,CAST(@toDate AS DATE))
            AND nk.TrangThai<>N'HUY'
            AND (@elderlyId IS NULL OR nk.NguoiCaoTuoiID=@elderlyId)
            ${profileScope('nk.NguoiCaoTuoiID')}
        ) notes
        WHERE (@caregiverUserId IS NULL OR ncs.UserID=@caregiverUserId)
          AND ((@elderlyId IS NULL AND @ageGroup IS NULL AND @gender IS NULL AND @careStatus IS NULL)
            OR assigned.soNguoiPhuTrach>0 OR notes.soNhatKy>0)
        ORDER BY ncs.HoTen,ncs.NguoiChamSocID
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

    const demographics = {
      tongHoSo: elderlyResult.recordset.length,
      theoDoTuoi: { duoi60: 0, tu60Den69: 0, tu70Den79: 0, tu80TroLen: 0 },
      theoGioiTinh: { Nam: 0, Nu: 0, Khac: 0 },
      theoTrangThai: { DangTheoDoi: 0, CanChamSocDacBiet: 0, NgungTheoDoi: 0 },
    };
    elderlyResult.recordset.forEach((row) => {
      const age = Number(row.tuoi);
      if (age < 60) demographics.theoDoTuoi.duoi60 += 1;
      else if (age < 70) demographics.theoDoTuoi.tu60Den69 += 1;
      else if (age < 80) demographics.theoDoTuoi.tu70Den79 += 1;
      else demographics.theoDoTuoi.tu80TroLen += 1;
      const gender = row.gioiTinh === 'Nữ' ? 'Nu' : row.gioiTinh === 'Nam' ? 'Nam' : 'Khac';
      demographics.theoGioiTinh[gender] += 1;
      if (Object.hasOwn(demographics.theoTrangThai, row.trangThai)) {
        demographics.theoTrangThai[row.trangThai] += 1;
      }
    });

    const careNotes = careNoteResult.recordset.map((row) => ({
      ngay: row.ngay,
      soNhatKy: numberOrZero(row.soNhatKy),
      soNguoiDuocChamSoc: numberOrZero(row.soNguoiDuocChamSoc),
    }));
    const caregivers = caregiverResult.recordset.map((row) => ({
      id: row.id,
      hoTen: row.hoTen,
      trangThai: row.trangThai,
      coTaiKhoan: row.userId != null,
      soNguoiPhuTrach: numberOrZero(row.soNguoiPhuTrach),
      soNhatKy: numberOrZero(row.soNhatKy),
    }));

    return ok(res, {
      boLoc: { tuNgay: fromDate, denNgay: toDate, nguoiCaoTuoiId: elderlyId, nhomTuoi: ageGroup, gioiTinh: gender, trangThai: careStatus },
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
      thongKeHoSo: demographics,
      thongKeChamSoc: {
        tongNhatKy: careNotes.reduce((sum, row) => sum + row.soNhatKy, 0),
        soNgayCoChamSoc: careNotes.length,
        theoNgay: careNotes,
      },
      thongKeNguoiChamSoc: {
        tongNguoiChamSoc: caregivers.length,
        daCoTaiKhoan: caregivers.filter((row) => row.coTaiKhoan).length,
        chuaPhuTrach: caregivers.filter((row) => row.soNguoiPhuTrach === 0).length,
        danhSach: caregivers,
      },
      tongHopNguoiCaoTuoi: elderlyResult.recordset.map((row) => ({
        id: row.id,
        hoTen: row.hoTen,
        ngaySinh: row.ngaySinh,
        gioiTinh: row.gioiTinh,
        trangThai: row.trangThai,
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
