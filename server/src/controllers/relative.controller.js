const { poolPromise, sql } = require('../config/db');
const { ok, fail } = require('../utils/response');
const { RelativeError, readOptions } = require('../utils/relativeValidation');
const { createRelativeAccess } = require('../services/relativeAccess.service');
const { createRelativeReadRepository } = require('../services/relativeRead.repository');
const { emitToUser, emitToAdmin } = require('../socket');
const { notifyAlertRecipients } = require('../services/alertNotification.service');
const { validateMetricValues, validateMeasurementTime } = require('../utils/healthMetricValidation');
const { alertTimestampSql: vietnamTimestampSql } = require('../utils/alertTime');
const { MAP_LOAI, evaluateMetric } = require('../utils/metricAssessment');

const endpoint = (handler) => async(req,res) => {
  res.set('Cache-Control','no-store');
  try {
    const pool=await poolPromise;
    const access=createRelativeAccess(pool,sql,{onAccessChanged:(userId,payload)=>emitToUser(userId,'relatives:access-changed',payload)});
    return ok(res,await handler(req,access,createRelativeReadRepository(pool,sql)));
  } catch (error) {
    if (error instanceof RelativeError) return fail(res,error.message,error.code,error.status);
    // Never send SQL, consent proof, or user input through the general error logger.
    return fail(res,'Không thể xử lý dữ liệu Người thân. Vui lòng thử lại.','RELATIVES_UNAVAILABLE',503);
  }
};
module.exports = {
  listLinks:endpoint((req,access)=>access.list(req.user.userId,req.query)),
  grant:endpoint((req,access)=>access.grant(req.user.userId,req.body)),
  update:endpoint((req,access)=>access.update(req.user.userId,req.params.id,req.body)),
  revoke:endpoint((req,access)=>access.revoke(req.user.userId,req.params.id,req.body)),
  history:endpoint((req,access)=>access.history(req.user.userId,req.params.id,readOptions(req.query))),
  elderly:endpoint((req,_access,reads)=>reads.elderly(req.user.userId,req.query)),
  read:section=>endpoint((req,_access,reads)=>reads.read(req.user.userId,req.params.id,section,req.query)),
  notifications:endpoint((req,_access,reads)=>reads.notifications(req.user.userId,req.query)),
  createHealthMetric: async (req, res, next) => {
    res.set('Cache-Control', 'no-store');
    try {
      const pool = await poolPromise;
      const elderlyId = Number(req.params.id);
      const userId = Number(req.user.userId);
      if (!Number.isInteger(elderlyId) || elderlyId <= 0) {
        return fail(res, 'Mã người cao tuổi không hợp lệ.', 'INVALID_ELDERLY_ID', 400);
      }

      const linkCheck = await pool.request()
        .input('userId', sql.Int, userId)
        .input('elderlyId', sql.Int, elderlyId)
        .query(`
          SELECT lk.LienKetID, nct.HoTen AS nguoiCaoTuoiTen
          FROM dbo.NguoiCaoTuoi_NguoiThan lk
          JOIN dbo.NguoiDung nd ON nd.UserID = lk.NguoiThanUserID
          JOIN dbo.VaiTro vt ON vt.VaiTroID = nd.VaiTroID
          JOIN dbo.HoSoNguoiCaoTuoi nct ON nct.NguoiCaoTuoiID = lk.NguoiCaoTuoiID
          WHERE lk.NguoiThanUserID = @userId
            AND lk.NguoiCaoTuoiID = @elderlyId
            AND lk.ThuHoiLuc IS NULL
            AND lk.DongYChiaSe = 1
            AND nd.TrangThai = N'HoatDong'
            AND vt.TenVaiTro = N'NguoiThan'
        `);

      if (!linkCheck.recordset.length) {
        return fail(res, 'Người thân không có quyền ghi nhận chỉ số cho hồ sơ này.', 'FORBIDDEN', 403);
      }
      const elderlyName = linkCheck.recordset[0].nguoiCaoTuoiTen;

      const { loaiChiSoId, loaiChiSo, giaTri, ngayDo, gioDo, ghiChu } = req.body;
      if ((!loaiChiSoId && !loaiChiSo) || giaTri == null || giaTri === '') {
        return fail(res, 'Loại chỉ số và giá trị đo là bắt buộc.', 'MISSING_FIELDS', 400);
      }

      let metricType = null;
      if (loaiChiSoId) {
        const typeRes = await pool.request()
          .input('typeId', sql.Int, Number(loaiChiSoId))
          .query(`
            SELECT LoaiChiSoID, TenChiSo, DonVi, GiaTriMin, GiaTriMax, GiaTriMin2, GiaTriMax2
            FROM LoaiChiSoSucKhoe
            WHERE LoaiChiSoID = @typeId
          `);
        metricType = typeRes.recordset[0];
      } else {
        const tenChiSo = Object.entries(MAP_LOAI).find(([, v]) => v.ma === loaiChiSo)?.[0] || loaiChiSo;
        const typeRes = await pool.request()
          .input('ten', sql.NVarChar, tenChiSo)
          .query(`
            SELECT LoaiChiSoID, TenChiSo, DonVi, GiaTriMin, GiaTriMax, GiaTriMin2, GiaTriMax2
            FROM LoaiChiSoSucKhoe
            WHERE TenChiSo = @ten
          `);
        metricType = typeRes.recordset[0];
      }

      if (!metricType) {
        return fail(res, 'Loại chỉ số không hợp lệ.', 'INVALID_METRIC_TYPE', 400);
      }

      let giaTriNum = null, giaTriPhuNum = null;
      const numeric = /^\d+(?:\.\d+)?$/;
      const parts = String(giaTri).split('/');
      if (parts.length > 2 || !parts.every((part) => numeric.test(part.trim()))) {
        return fail(res, 'Giá trị chỉ số phải là số hợp lệ.', 'INVALID_VALUE', 422);
      }
      giaTriNum = Number(parts[0]);
      giaTriPhuNum = parts.length === 2 ? Number(parts[1]) : null;

      const valueError = validateMetricValues(metricType, giaTriNum, giaTriPhuNum);
      if (valueError) return fail(res, valueError, 'INVALID_METRIC_VALUE', 422);

      const timeError = validateMeasurementTime({ ngayDo, gioDo, thoiGianDo: req.body.thoiGianDo });
      if (timeError) return fail(res, timeError, 'INVALID_MEASUREMENT_TIME', 422);

      if (ghiChu && String(ghiChu).trim().length > 300) {
        return fail(res, 'Ghi chú không được vượt quá 300 ký tự.', 'NOTE_TOO_LONG', 400);
      }

      const assessment = evaluateMetric({
        tenChiSo: metricType.TenChiSo,
        giaTri: giaTriNum,
        giaTriPhu: giaTriPhuNum,
        min: metricType.GiaTriMin,
        max: metricType.GiaTriMax,
        min2: metricType.GiaTriMin2,
        max2: metricType.GiaTriMax2,
        manuallyAbnormal: false,
      });

      const thoiGianDo = ngayDo && gioDo ? new Date(`${ngayDo}T${gioDo}:00Z`) : new Date(Date.now() + 7 * 3600000);

      const r = await pool.request()
        .input('nctId', sql.Int, elderlyId)
        .input('loaiId', sql.Int, metricType.LoaiChiSoID)
        .input('giaTri', sql.Decimal(10, 2), giaTriNum)
        .input('giaTriPhu', sql.Decimal(10, 2), giaTriPhuNum)
        .input('thoiGian', sql.DateTime2, thoiGianDo)
        .input('laBatThuong', sql.Bit, assessment.abnormal ? 1 : 0)
        .input('ghiChu', sql.NVarChar(300), ghiChu ? String(ghiChu).trim() : null)
        .input('nguoiDoId', sql.Int, userId)
        .input('noiDungCanhBao', sql.NVarChar(500), assessment.description)
        .input('mucDoCanhBao', sql.NVarChar(20), assessment.level)
        .query(`
          SET XACT_ABORT ON;
          BEGIN TRANSACTION;
          DECLARE @ChiSoMoi TABLE (ChiSoID INT);
          DECLARE @chiSoId INT;
          DECLARE @canhBaoId INT = NULL;

          INSERT INTO ChiSoSucKhoe
            (NguoiCaoTuoiID, LoaiChiSoID, GiaTri, GiaTriPhu, ThoiGianDo, NguoiDoID, LaBatThuong, GhiChu)
          OUTPUT INSERTED.ChiSoID INTO @ChiSoMoi
          VALUES (@nctId, @loaiId, @giaTri, @giaTriPhu, @thoiGian, @nguoiDoId, @laBatThuong, @ghiChu);

          SELECT TOP 1 @chiSoId = ChiSoID FROM @ChiSoMoi;

          IF @laBatThuong = 1
          BEGIN
            DECLARE @existingAlertId INT = NULL;
            DECLARE @existingMucDo NVARCHAR(20) = NULL;

            SELECT TOP 1
              @existingAlertId = cb.CanhBaoID,
              @existingMucDo = cb.MucDo
            FROM CanhBao cb WITH (UPDLOCK, HOLDLOCK)
            JOIN ChiSoSucKhoe prev ON prev.ChiSoID = cb.NguonID
            WHERE cb.NguoiCaoTuoiID = @nctId
              AND cb.LoaiCanhBao = N'ChiSoBatThuong'
              AND cb.NguonBang = N'ChiSoSucKhoe'
              AND prev.LoaiChiSoID = @loaiId
              AND cb.TrangThai = N'ChuaXuLy'
              AND cb.NgayTao >= DATEADD(MINUTE, -10, DATEADD(HOUR, 7, SYSUTCDATETIME()))
            ORDER BY cb.CanhBaoID DESC;

            IF @existingAlertId IS NOT NULL
               AND @mucDoCanhBao <> N'KhanCap'
               AND NOT (@mucDoCanhBao = N'Cao' AND @existingMucDo = N'TrungBinh')
            BEGIN
              SET @canhBaoId = NULL;
            END
            ELSE
            BEGIN
              INSERT INTO CanhBao
                (NguoiCaoTuoiID, LoaiCanhBao, NoiDung, MucDo, NguonBang, NguonID)
              VALUES
                (@nctId, N'ChiSoBatThuong', @noiDungCanhBao, @mucDoCanhBao, N'ChiSoSucKhoe', @chiSoId);
              SET @canhBaoId = SCOPE_IDENTITY();
            END;
          END;

          COMMIT TRANSACTION;

          SELECT c.ChiSoID AS id, @canhBaoId AS alertId,
            ${vietnamTimestampSql('c.ThoiGianDo')} AS thoiGianDoUtc,
            ${vietnamTimestampSql('cb.NgayTao')} AS alertCreatedAt
          FROM ChiSoSucKhoe c
          LEFT JOIN CanhBao cb ON cb.CanhBaoID = @canhBaoId
          WHERE c.ChiSoID = @chiSoId;
        `);

      const inserted = r.recordset[0];

      emitToAdmin('chisuckhoe:new', {
        id: inserted.id,
        chiSoId: inserted.id,
        nguoiCaoTuoiId: elderlyId,
        loaiChiSoId: metricType.LoaiChiSoID,
        tenChiSo: metricType.TenChiSo,
        giaTri: giaTriNum,
        giaTriPhu: giaTriPhuNum,
        laBatThuong: assessment.abnormal,
        thoiGianDo: inserted.thoiGianDoUtc,
      });

      if (inserted.alertId != null) {
        await notifyAlertRecipients(pool, {
          elderlyId,
          elderlyName,
          content: assessment.description,
          alertId: inserted.alertId,
          alert: {
            id: inserted.alertId,
            canhBaoId: inserted.alertId,
            nguoiCaoTuoiId: elderlyId,
            loaiCanhBao: 'ChiSoBatThuong',
            loaiCanhBaoLabel: 'Chỉ số bất thường',
            mucDo: assessment.level === 'Cao' ? 'CAO' : 'TRUNG_BINH',
            mucDoLabel: assessment.level === 'Cao' ? 'Cao' : 'Trung bình',
            moTa: assessment.description,
            thoiGianPhatHien: inserted.alertCreatedAt,
            thoiGianDo: inserted.thoiGianDoUtc,
            trangThai: 'CHUA_XU_LY',
            trangThaiLabel: 'Chưa xử lý',
            nguonBang: 'ChiSoSucKhoe',
            nguonId: inserted.id,
          },
        });
      }

      return ok(res, {
        id: inserted.id,
        nguoiCaoTuoiId: elderlyId,
        loaiChiSoId: metricType.LoaiChiSoID,
        tenChiSo: metricType.TenChiSo,
        giaTri: giaTriPhuNum != null ? `${giaTriNum}/${giaTriPhuNum}` : String(giaTriNum),
        donVi: metricType.DonVi,
        thoiGianDo: inserted.thoiGianDoUtc,
        laBatThuong: assessment.abnormal,
        alertCreated: inserted.alertId != null,
        alertId: inserted.alertId,
      }, assessment.abnormal ? 'Ghi nhận chỉ số và tạo cảnh báo thành công' : 'Ghi nhận chỉ số sức khỏe thành công', 201);
    } catch (error) {
      next(error);
    }
  },
};
