const { poolPromise, sql } = require('../config/db');
const { ok, fail } = require('../utils/response');
const { emitToAdmin, emitToUser } = require('../socket');
const { validateSupplement, supplementEligibility } = require('../utils/medicationSupplement');

// Separate from same-day confirmation: records a dose ALREADY TAKEN, never
// recommends catch-up dosing and never schedules another reminder.
const supplement = async (req, res, next) => {
  let transaction;
  let committed = false;
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0) return fail(res, 'ID lịch uống thuốc không hợp lệ.', 'INVALID_ID', 400);
    const values = validateSupplement(req.body);
    if (values.error) return fail(res, values.error, 'INVALID_SUPPLEMENT', 422);
    if (!['QuanTriVien', 'NguoiChamSoc', 'NguoiCaoTuoi'].includes(req.user.tenVaiTro)) {
      return fail(res, 'Bạn không có quyền ghi nhận bổ sung.', 'FORBIDDEN', 403);
    }
    transaction = new sql.Transaction(await poolPromise);
    await transaction.begin(sql.ISOLATION_LEVEL.SERIALIZABLE);
    const request = () => new sql.Request(transaction);
    const result = await request().input('id', sql.Int, id)
      .input('actor', sql.Int, req.user.userId)
      .input('role', sql.NVarChar(30), req.user.tenVaiTro).query(`
      SELECT l.LichUongThuocID AS id,l.NguoiCaoTuoiID AS nguoiCaoTuoiId,
        l.TrangThai AS trangThai, nct.UserID AS ownerUserId,
        CONVERT(VARCHAR(19),l.ThoiGianDuKien,126) AS thoiGianDuKien,
        CONVERT(VARCHAR(19),DATEADD(HOUR,7,SYSUTCDATETIME()),126) AS serverNow,
        CASE WHEN OBJECT_ID(N'dbo.LichSuGhiNhanUongThuoc',N'U') IS NULL THEN 0 ELSE 1 END AS auditAvailable,
        CASE WHEN @role=N'QuanTriVien'
          OR (@role=N'NguoiCaoTuoi' AND nct.UserID=@actor)
          OR (@role=N'NguoiChamSoc' AND EXISTS (
            SELECT 1 FROM NguoiChamSoc ncs
            JOIN NguoiCaoTuoi_NguoiChamSoc lk ON lk.NguoiChamSocID=ncs.NguoiChamSocID
            WHERE ncs.UserID=@actor AND ncs.TrangThai=N'DangLamViec'
              AND lk.NguoiCaoTuoiID=l.NguoiCaoTuoiID
              AND lk.NgayBatDau<=CAST(DATEADD(HOUR,7,SYSUTCDATETIME()) AS DATE)
              AND (lk.NgayKetThuc IS NULL OR lk.NgayKetThuc>CAST(DATEADD(HOUR,7,SYSUTCDATETIME()) AS DATE))
          )) THEN 1 ELSE 0 END AS canAccess
      FROM LichUongThuoc l WITH (UPDLOCK,HOLDLOCK)
      JOIN HoSoNguoiCaoTuoi nct ON nct.NguoiCaoTuoiID=l.NguoiCaoTuoiID
      WHERE l.LichUongThuocID=@id AND nct.TrangThai IN (N'DangTheoDoi',N'CanChamSocDacBiet')`);
    const dose = result.recordset[0];
    const abort = async (message, code, status) => {
      await transaction.rollback(); transaction = null;
      return fail(res, message, code, status);
    };
    if (!dose) return await abort('Không tìm thấy lịch uống thuốc.', 'NOT_FOUND', 404);
    const error = supplementEligibility(dose, values.takenAt);
    if (error) return await abort(error.message, error.code, error.status);
    if (!dose.auditAvailable) return await abort(
      'Chưa bật ghi nhận bổ sung. Quản trị viên cần chạy patch_medication_supplement.sql.',
      'SUPPLEMENT_NOT_INSTALLED', 503);

    const updated = await request().input('id', sql.Int, id)
      .input('actor', sql.Int, req.user.userId).input('role', sql.NVarChar(30), req.user.tenVaiTro)
      .input('takenAt', sql.VarChar(19), values.takenAt)
      .input('recordedAt', sql.VarChar(19), dose.serverNow)
      .input('reason', sql.NVarChar(300), values.reason).query(`
      IF EXISTS (SELECT 1 FROM dbo.LichSuGhiNhanUongThuoc WITH (UPDLOCK,HOLDLOCK) WHERE LichUongThuocID=@id)
        THROW 51001, N'Liều thuốc đã được ghi nhận bổ sung.', 1;
      INSERT INTO dbo.LichSuGhiNhanUongThuoc
        (LichUongThuocID,NguoiCaoTuoiID,ThoiGianDuKien,TrangThaiCu,ThoiGianThucTeCu,
         NguoiXacNhanCuID,TrangThaiMoi,ThoiGianThucTe,NguoiGhiNhanID,NguoiGhiNhanTen,VaiTro,NgayGhiNhan,LyDo)
      SELECT l.LichUongThuocID,l.NguoiCaoTuoiID,l.ThoiGianDuKien,l.TrangThai,l.ThoiGianThucTe,
        l.NguoiXacNhanID,N'DaUong',CONVERT(DATETIME2,@takenAt,126),@actor,nd.HoTen,@role,
        CONVERT(DATETIME2,@recordedAt,126),@reason
      FROM LichUongThuoc l JOIN NguoiDung nd ON nd.UserID=@actor WHERE l.LichUongThuocID=@id;
      UPDATE LichUongThuoc SET TrangThai=N'DaUong',ThoiGianThucTe=CONVERT(DATETIME2,@takenAt,126),NguoiXacNhanID=@actor
      WHERE LichUongThuocID=@id;
      -- Preserve delivered history; only unread pending reminders are retired.
      UPDATE ThongBao SET DaDoc=1 WHERE LienKetID=@id AND LoaiThongBao=N'NhacThuoc'
        AND (LienKetBang=N'LichUongThuoc' OR LienKetBang LIKE N'LichUongThuoc:%') AND DaDoc=0;
      SELECT l.LichUongThuocID AS id,l.NguoiCaoTuoiID AS nguoiCaoTuoiId,l.DonThuocChiTietID AS donThuocChiTietId,
        ct.ThuocID AS thuocId,dm.TenThuoc AS tenThuoc,ct.LieuDung AS lieuDung,ct.GhiChu AS cachDung,
        CONVERT(VARCHAR(19),l.ThoiGianDuKien,126) AS thoiGianDuKien,
        CONVERT(VARCHAR(19),l.ThoiGianThucTe,126) AS thoiGianThucTe,l.TrangThai AS trangThai,l.GhiChu AS ghiChu,
        h.TrangThaiCu AS trangThaiCu,CONVERT(VARCHAR(19),h.NgayGhiNhan,126) AS ngayGhiNhan,
        h.NguoiGhiNhanTen AS nguoiGhiNhanTen,h.VaiTro AS vaiTro,h.LyDo AS lyDo
      FROM LichUongThuoc l JOIN DonThuocChiTiet ct ON ct.DonThuocChiTietID=l.DonThuocChiTietID
      JOIN DanhMucThuoc dm ON dm.ThuocID=ct.ThuocID
      JOIN dbo.LichSuGhiNhanUongThuoc h ON h.LichUongThuocID=l.LichUongThuocID WHERE l.LichUongThuocID=@id;
    `);
    const { trangThaiCu, ngayGhiNhan, nguoiGhiNhanTen, vaiTro, lyDo, ...schedule } = updated.recordset[0];
    schedule.ghiNhanBoSung = { trangThaiCu, ngayGhiNhan, nguoiGhiNhanTen, vaiTro, lyDo, thoiGianThucTe: schedule.thoiGianThucTe };
    await transaction.commit();
    committed = true;
    // Never turn a committed write into an apparent failure if sockets fail.
    try {
      emitToAdmin('lichuongthuoc:updated', schedule);
      emitToUser(dose.ownerUserId, 'lichuongthuoc:updated', schedule);
    } catch (socketError) { console.error('[MEDICATION] Không gửi được realtime:', socketError.message); }
    return ok(res, schedule, 'Đã ghi nhận bổ sung liều thuốc đã uống.');
  } catch (error) {
    if (transaction && !committed) { try { await transaction.rollback(); } catch (_) { /* already rolled back */ } }
    if ([51001, 2601, 2627].includes(error.number)) {
      return fail(res, 'Liều thuốc đã được ghi nhận. Vui lòng tải lại lịch.', 'DOSE_CHANGED', 409);
    }
    return next(error);
  }
};

module.exports = { supplement };
