const { poolPromise, sql } = require("../config/db");
const { ok, fail } = require("../utils/response");
const { todayVietnam } = require("../utils/vietnamDate");
const { emitToUser, emitToAdmin } = require('../socket');

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const TIME_PATTERN = /^([01]\d|2[0-3]):[0-5]\d$/;
const MAX_PRESCRIPTION_DAYS = 366;

const isValidDate = (value) => {
  if (typeof value !== "string" || !DATE_PATTERN.test(value)) return false;
  const date = new Date(`${value}T00:00:00Z`);
  return (
    !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value
  );
};

const addUtcDays = (dateOnly, days) => {
  const date = new Date(`${dateOnly}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
};

const daysInclusive = (from, to) =>
  Math.floor(
    (Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) /
      86400000,
  ) + 1;

const validatePrescription = (body) => {
  const { bacSiKeDon, ngayBatDau, ngayKetThuc, ghiChu, danhSachThuoc } =
    body || {};
  if (bacSiKeDon != null && typeof bacSiKeDon !== "string") {
    return "bacSiKeDon phai la chuoi";
  }
  if (typeof bacSiKeDon === "string" && bacSiKeDon.trim().length > 100) {
    return "bacSiKeDon khong duoc qua 100 ky tu";
  }
  if (ghiChu != null && typeof ghiChu !== "string") {
    return "ghiChu phai la chuoi";
  }
  if (typeof ghiChu === "string" && ghiChu.trim().length > 500) {
    return "ghiChu khong duoc qua 500 ky tu";
  }
  if (!isValidDate(ngayBatDau)) {
    return "ngayBatDau la bat buoc va phai co dinh dang YYYY-MM-DD";
  }
  if (ngayBatDau < todayVietnam()) {
    return "Ngày bắt đầu lịch uống thuốc không được trước ngày hiện tại";
  }
  if (ngayKetThuc != null && ngayKetThuc !== "" && !isValidDate(ngayKetThuc)) {
    return "ngayKetThuc phai co dinh dang YYYY-MM-DD";
  }
  if (ngayKetThuc && ngayKetThuc < ngayBatDau) {
    return "ngayKetThuc khong duoc truoc ngayBatDau";
  }
  const effectiveEnd = ngayKetThuc || addUtcDays(ngayBatDau, 29);
  if (daysInclusive(ngayBatDau, effectiveEnd) > MAX_PRESCRIPTION_DAYS) {
    return `Khoang ke don khong duoc vuot qua ${MAX_PRESCRIPTION_DAYS} ngay`;
  }
  if (!Array.isArray(danhSachThuoc) || danhSachThuoc.length === 0) {
    return "danhSachThuoc phai co it nhat 1 thuoc";
  }
  if (danhSachThuoc.length > 50) {
    return "Moi don thuoc khong duoc vuot qua 50 dong thuoc";
  }

  const selectedMedicines = new Map();
  for (let index = 0; index < danhSachThuoc.length; index += 1) {
    const item = danhSachThuoc[index] || {};
    const position = index + 1;
    if (!Number.isInteger(Number(item.thuocId)) || Number(item.thuocId) < 1) {
      return `Thuoc dong ${position}: thuocId khong hop le`;
    }
    const medicineId = Number(item.thuocId);
    if (selectedMedicines.has(medicineId)) {
      return `Thuốc dòng ${position} đã được chọn ở dòng ${selectedMedicines.get(medicineId)}. Mỗi thuốc chỉ được chọn một lần trong đơn; nếu uống nhiều cữ, chỉnh số lần/ngày và giờ uống.`;
    }
    selectedMedicines.set(medicineId, position);
    if (typeof item.lieuDung !== "string" || !item.lieuDung.trim()) {
      return `Thuoc dong ${position}: lieuDung la bat buoc`;
    }
    if (item.lieuDung.trim().length > 100) {
      return `Thuoc dong ${position}: lieuDung khong duoc qua 100 ky tu`;
    }
    const timesPerDay = Number(item.soLanMoiNgay);
    if (!Number.isInteger(timesPerDay) || timesPerDay < 1 || timesPerDay > 24) {
      return `Thuoc dong ${position}: soLanMoiNgay phai tu 1 den 24`;
    }
    if (!Array.isArray(item.gioUong) || item.gioUong.length !== timesPerDay) {
      return `Thuoc dong ${position}: so luong gioUong phai khop soLanMoiNgay`;
    }
    if (
      item.gioUong.some(
        (time) => typeof time !== "string" || !TIME_PATTERN.test(time),
      )
    ) {
      return `Thuoc dong ${position}: moi gioUong phai dung dinh dang HH:mm`;
    }
    if (new Set(item.gioUong).size !== item.gioUong.length) {
      return `Thuoc dong ${position}: gioUong khong duoc trung nhau`;
    }
  }
  return null;
};

// POST /api/elderly/:id/prescriptions
const create = async (req, res, next) => {
  const elderlyId = Number(req.params.id);
  if (!Number.isInteger(elderlyId) || elderlyId < 1) {
    return fail(res, "ID nguoi cao tuoi khong hop le", "INVALID_ID", 400);
  }

  const validationError = validatePrescription(req.body);
  if (validationError) {
    return fail(res, validationError, "INVALID_PRESCRIPTION", 400);
  }

  const { bacSiKeDon, ngayBatDau, ngayKetThuc, ghiChu, danhSachThuoc } =
    req.body;
  const effectiveEnd = ngayKetThuc || addUtcDays(ngayBatDau, 29);

  let transaction;
  try {
    const pool = await poolPromise;
    transaction = new sql.Transaction(pool);
    await transaction.begin();

    const elderly = await new sql.Request(transaction).input(
      "elderlyId",
      sql.Int,
      elderlyId,
    ).query(`SELECT NguoiCaoTuoiID, UserID, DiUng, BenhNen
              FROM HoSoNguoiCaoTuoi
              WHERE NguoiCaoTuoiID=@elderlyId
                AND TrangThai IN (N'DangTheoDoi', N'CanChamSocDacBiet')`);
    if (!elderly.recordset.length) {
      await transaction.rollback();
      transaction = null;
      return fail(
        res,
        "Khong tim thay ho so nguoi cao tuoi dang theo doi",
        "ELDERLY_NOT_FOUND",
        404,
      );
    }

    const prescription = await new sql.Request(transaction)
      .input("elderlyId", sql.Int, elderlyId)
      .input("bacSiKeDon", sql.NVarChar(100), bacSiKeDon?.trim() || null)
      .input("ngayBatDau", sql.Date, ngayBatDau)
      .input("ngayKetThuc", sql.Date, ngayKetThuc || null)
      .input("ghiChu", sql.NVarChar(500), ghiChu?.trim() || null)
      .input("creatorId", sql.Int, req.user.userId).query(`
        INSERT INTO DonThuoc
          (NguoiCaoTuoiID, BacSiKeDon, NgayKeDon, NgayBatDau,
           NgayKetThuc, GhiChu, NguoiTaoID)
        OUTPUT INSERTED.DonThuocID AS id
        VALUES
          (@elderlyId, @bacSiKeDon, CONVERT(DATE, DATEADD(HOUR,7,SYSUTCDATETIME())), @ngayBatDau,
           @ngayKetThuc, @ghiChu, @creatorId)`);
    const prescriptionId = prescription.recordset[0].id;
    let generatedScheduleCount = 0;
    const createdDetails = [];

    for (const item of danhSachThuoc) {
      const medicine = await new sql.Request(transaction).input(
        "medicineId",
        sql.Int,
        Number(item.thuocId),
      ).query(`SELECT ThuocID AS id, TenThuoc AS tenThuoc, HoatChat AS hoatChat
                FROM DanhMucThuoc
                WHERE ThuocID=@medicineId AND TrangThai=1`);
      if (!medicine.recordset.length) {
        const error = new Error(
          `Khong tim thay thuoc dang su dung co ID ${item.thuocId}`,
        );
        error.statusCode = 400;
        error.errorCode = "MEDICATION_NOT_FOUND";
        throw error;
      }

      const rawAllergy = elderly.recordset[0].DiUng || '';
      if (rawAllergy.trim() && req.body.xacNhanDiUng !== true) {
        const normalize = (str) => (str || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim();
        const allergyTokens = rawAllergy.split(/[,;\n]+/).map(normalize).filter((t) => t.length > 1);
        const drugName = normalize(medicine.recordset[0].tenThuoc);
        const activeIng = normalize(medicine.recordset[0].hoatChat);
        const matched = allergyTokens.find((token) => drugName.includes(token) || (activeIng && activeIng.includes(token)) || token.includes(drugName));
        if (matched) {
          const error = new Error(`Cảnh báo dị ứng: Thuốc "${medicine.recordset[0].tenThuoc}" có nguy cơ dị ứng với tiền sử "${rawAllergy}". Vui lòng xác nhận để tiếp tục.`);
          error.statusCode = 422;
          error.errorCode = 'ALLERGY_WARNING';
          throw error;
        }
      }

      const normalizedTimes = [...item.gioUong].sort();
      const detail = await new sql.Request(transaction)
        .input("prescriptionId", sql.Int, prescriptionId)
        .input("medicineId", sql.Int, Number(item.thuocId))
        .input("dosage", sql.NVarChar(100), item.lieuDung.trim())
        .input("timesPerDay", sql.Int, Number(item.soLanMoiNgay))
        .input("times", sql.NVarChar(200), normalizedTimes.join(",")).query(`
          INSERT INTO DonThuocChiTiet
            (DonThuocID, ThuocID, LieuDung, SoLanMoiNgay, ThoiDiemUong)
          OUTPUT INSERTED.DonThuocChiTietID AS id
          VALUES (@prescriptionId, @medicineId, @dosage, @timesPerDay, @times)`);
      const detailId = detail.recordset[0].id;

      const scheduleRequest = new sql.Request(transaction);

      scheduleRequest
        .input("detailId", sql.Int, detailId)
        .input("elderlyId", sql.Int, elderlyId)
        .input("startDate", sql.Date, ngayBatDau)
        .input("endDate", sql.Date, effectiveEnd);

      const timeValues = normalizedTimes
        .map((time, index) => {
          scheduleRequest.input(`time${index}`, sql.VarChar(5), time);
          return `(@time${index})`;
        })
        .join(",");

      const schedules = await scheduleRequest.query(`
  ;WITH NgayUong AS (
    SELECT CONVERT(DATE, @startDate) AS Ngay

    UNION ALL

    SELECT DATEADD(DAY, 1, Ngay)
    FROM NgayUong
    WHERE Ngay < CONVERT(DATE, @endDate)
  ),
  ThoiGian AS (
    SELECT Gio
    FROM (VALUES ${timeValues}) AS T(Gio)
  ),
  Lich AS (
    SELECT
      DATEADD(
        MINUTE,
        CONVERT(INT, LEFT(t.Gio, 2)) * 60
          + CONVERT(INT, RIGHT(t.Gio, 2)),
        CONVERT(DATETIME2, n.Ngay)
      ) AS ThoiGianDuKien
    FROM NgayUong n
    CROSS JOIN ThoiGian t
  )
  INSERT INTO LichUongThuoc
    (
      DonThuocChiTietID,
      NguoiCaoTuoiID,
      ThoiGianDuKien,
      TrangThai
    )
  SELECT
    @detailId,
    @elderlyId,
    ThoiGianDuKien,
    N'ChuaDenGio'
  FROM Lich
  WHERE ThoiGianDuKien > DATEADD(HOUR,7,SYSUTCDATETIME())
  OPTION (MAXRECURSION ${MAX_PRESCRIPTION_DAYS});

  SELECT @@ROWCOUNT AS generatedCount;
`);
      const count = Number(schedules.recordset[0]?.generatedCount || 0);
      if (count === 0) {
        const error = new Error(
          `Thuốc ${medicine.recordset[0].tenThuoc}: không còn giờ uống hợp lệ trong khoảng ngày đã chọn. Vui lòng chọn giờ còn ở tương lai hoặc kéo dài ngày kết thúc.`,
        );
        error.statusCode = 422;
        error.errorCode = 'NO_FUTURE_DOSES';
        throw error;
      }
      generatedScheduleCount += count;
      createdDetails.push({
        id: detailId,
        thuocId: Number(item.thuocId),
        tenThuoc: medicine.recordset[0].tenThuoc,
        lieuDung: item.lieuDung.trim(),
        soLanMoiNgay: Number(item.soLanMoiNgay),
        gioUong: normalizedTimes,
        soLichDaTao: count,
      });
    }

    // A long request can cross a dose time or midnight after generating rows.
    // Recheck only this new prescription before committing; never edit old doses.
    const timing = await new sql.Request(transaction)
      .input('prescriptionId', sql.Int, prescriptionId).query(`
        SELECT COUNT(*) AS expiredCount
        FROM LichUongThuoc l
        JOIN DonThuocChiTiet ct ON ct.DonThuocChiTietID=l.DonThuocChiTietID
        WHERE ct.DonThuocID=@prescriptionId
          AND l.ThoiGianDuKien<=DATEADD(HOUR,7,SYSUTCDATETIME())`);
    if (Number(timing.recordset[0]?.expiredCount) > 0) {
      const error = new Error('Giờ uống đầu tiên đã qua trong lúc tạo đơn. Chưa lưu đơn thuốc; vui lòng kiểm tra lại ngày và giờ uống.');
      error.statusCode = 409;
      error.errorCode = 'PRESCRIPTION_TIME_CHANGED';
      throw error;
    }
    await transaction.commit();
    transaction = null;
    const eventData = { id: prescriptionId, nguoiCaoTuoiId: elderlyId, action: 'created' };
    emitToAdmin('donthuoc:created', eventData);
    if (elderly.recordset[0].UserID) {
      emitToUser(elderly.recordset[0].UserID, 'donthuoc:created', eventData);
    }
    return ok(
      res,
      {
        id: prescriptionId,
        nguoiCaoTuoiId: elderlyId,
        ngayBatDau,
        ngayKetThuc: ngayKetThuc || null,
        ngayKetThucSinhLich: effectiveEnd,
        danhSachThuoc: createdDetails,
        soLichDaTao: generatedScheduleCount,
      },
      "Tao don thuoc va lich uong thuoc thanh cong",
      201,
    );
  } catch (error) {
    if (transaction) {
      try {
        await transaction.rollback();
      } catch (_) {
        /* transaction da ket thuc */
      }
    }
    if (error.statusCode) {
      return fail(
        res,
        error.message,
        error.errorCode || "PRESCRIPTION_ERROR",
        error.statusCode,
      );
    }
    next(error);
  }
};

// GET /api/elderly/:id/prescriptions
const getByElderly = async (req, res, next) => {
  try {
    const elderlyId = Number(req.params.id);
    if (!Number.isInteger(elderlyId) || elderlyId < 1) {
      return fail(res, "ID nguoi cao tuoi khong hop le", "INVALID_ID", 400);
    }
    const pool = await poolPromise;
    const result = await pool.request().input("elderlyId", sql.Int, elderlyId)
      .query(`
        SELECT d.DonThuocID AS prescriptionId,
          d.NguoiCaoTuoiID AS nguoiCaoTuoiId,
          d.BacSiKeDon AS bacSiKeDon,
          CONVERT(VARCHAR(10), d.NgayKeDon, 23) AS ngayKeDon,
          CONVERT(VARCHAR(10), d.NgayBatDau, 23) AS ngayBatDau,
          CONVERT(VARCHAR(10), d.NgayKetThuc, 23) AS ngayKetThuc,
          d.GhiChu AS ghiChu,
          ct.DonThuocChiTietID AS detailId,
          ct.ThuocID AS thuocId,
          dm.TenThuoc AS tenThuoc,
          ct.LieuDung AS lieuDung,
          ct.SoLanMoiNgay AS soLanMoiNgay,
          ct.ThoiDiemUong AS thoiDiemUong
        FROM DonThuoc d
        LEFT JOIN DonThuocChiTiet ct ON ct.DonThuocID=d.DonThuocID
        LEFT JOIN DanhMucThuoc dm ON dm.ThuocID=ct.ThuocID
        WHERE d.NguoiCaoTuoiID=@elderlyId
        ORDER BY d.NgayKeDon DESC, d.DonThuocID DESC, ct.DonThuocChiTietID ASC`);

    const grouped = new Map();
    for (const row of result.recordset) {
      if (!grouped.has(row.prescriptionId)) {
        grouped.set(row.prescriptionId, {
          id: row.prescriptionId,
          nguoiCaoTuoiId: row.nguoiCaoTuoiId,
          bacSiKeDon: row.bacSiKeDon,
          ngayKeDon: row.ngayKeDon,
          ngayBatDau: row.ngayBatDau,
          ngayKetThuc: row.ngayKetThuc,
          ghiChu: row.ghiChu,
          danhSachThuoc: [],
        });
      }
      if (row.detailId) {
        grouped.get(row.prescriptionId).danhSachThuoc.push({
          id: row.detailId,
          thuocId: row.thuocId,
          tenThuoc: row.tenThuoc,
          lieuDung: row.lieuDung,
          soLanMoiNgay: row.soLanMoiNgay,
          gioUong: row.thoiDiemUong
            ? row.thoiDiemUong
                .split(",")
                .map((time) => time.trim())
                .filter(Boolean)
            : [],
        });
      }
    }
    return ok(res, [...grouped.values()]);
  } catch (error) {
    next(error);
  }
};

// PUT /api/elderly/:id/prescriptions/:prescriptionId/stop
const stop = async (req, res, next) => {
  const elderlyId = Number(req.params.id);
  const prescriptionId = Number(req.params.prescriptionId);
  if (!Number.isInteger(elderlyId) || elderlyId < 1 || !Number.isInteger(prescriptionId) || prescriptionId < 1) {
    return fail(res, "ID khong hop le", "INVALID_ID", 400);
  }

  const lyDo = typeof req.body?.lyDo === 'string' ? req.body.lyDo.trim() : '';
  if (lyDo.length > 300) {
    return fail(res, "Ly do dung don thuoc khong duoc vuot qua 300 ky tu", "INVALID_REASON", 400);
  }

  let transaction;
  try {
    const pool = await poolPromise;
    transaction = new sql.Transaction(pool);
    await transaction.begin();

    const prescriptionCheck = await new sql.Request(transaction)
      .input("prescriptionId", sql.Int, prescriptionId)
      .input("elderlyId", sql.Int, elderlyId)
      .query(`
        SELECT d.DonThuocID, d.NgayBatDau, d.NgayKetThuc, d.GhiChu, hs.UserID
        FROM DonThuoc d
        JOIN HoSoNguoiCaoTuoi hs ON hs.NguoiCaoTuoiID=d.NguoiCaoTuoiID
        WHERE d.DonThuocID=@prescriptionId AND d.NguoiCaoTuoiID=@elderlyId
      `);

    if (!prescriptionCheck.recordset.length) {
      await transaction.rollback();
      transaction = null;
      return fail(res, "Khong tim thay don thuoc cua nguoi cao tuoi", "PRESCRIPTION_NOT_FOUND", 404);
    }

    const currentPrescription = prescriptionCheck.recordset[0];
    const today = todayVietnam();
    const reasonText = lyDo ? ` [Đã dừng ngày ${today}: ${lyDo}]` : ` [Đã dừng ngày ${today}]`;
    const newNote = ((currentPrescription.GhiChu || '') + reasonText).slice(0, 500);

    await new sql.Request(transaction)
      .input("prescriptionId", sql.Int, prescriptionId)
      .input("today", sql.Date, today)
      .input("newNote", sql.NVarChar(500), newNote)
      .query(`
        UPDATE DonThuoc
        SET NgayKetThuc = CASE WHEN NgayKetThuc IS NULL OR NgayKetThuc > @today THEN @today ELSE NgayKetThuc END,
            GhiChu = @newNote
        WHERE DonThuocID = @prescriptionId
      `);

    const deleteFutureDoses = await new sql.Request(transaction)
      .input("prescriptionId", sql.Int, prescriptionId)
      .query(`
        DELETE l
        FROM LichUongThuoc l
        JOIN DonThuocChiTiet ct ON ct.DonThuocChiTietID = l.DonThuocChiTietID
        WHERE ct.DonThuocID = @prescriptionId
          AND l.TrangThai = N'ChuaDenGio'
          AND l.ThoiGianDuKien > DATEADD(HOUR, 7, SYSUTCDATETIME());

        SELECT @@ROWCOUNT AS deletedCount;
      `);

    const deletedCount = Number(deleteFutureDoses.recordset[0]?.deletedCount || 0);

    await transaction.commit();
    transaction = null;

    const eventData = { id: prescriptionId, nguoiCaoTuoiId: elderlyId, action: 'stopped', deletedCount };
    emitToAdmin('donthuoc:updated', eventData);
    if (currentPrescription.UserID) {
      emitToUser(currentPrescription.UserID, 'donthuoc:updated', eventData);
    }

    return ok(res, {
      id: prescriptionId,
      nguoiCaoTuoiId: elderlyId,
      daDung: true,
      soLieuDaHuy: deletedCount,
    }, "Đã dừng đơn thuốc thành công và hủy các cữ thuốc tương lai.");
  } catch (error) {
    if (transaction) {
      try {
        await transaction.rollback();
      } catch (_) {}
    }
    next(error);
  }
};

module.exports = { create, getByElderly, stop };
