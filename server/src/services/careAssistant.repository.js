// All queries are fixed SELECTs. IDs are bound after server-side scope checks.
const { vietnamNow } = require('./careAssistant.context');
const { boundedQuery } = require('../utils/boundedQuery');
function createRepository(pool, sql, deadline = Date.now() + 30000) {
  const query = async (statement, elderlyId, userId, options = {}) => {
    const request = pool.request();
    request.timeout = 10000;
    if (elderlyId != null) request.input('elderlyId', sql.Int, elderlyId);
    if (userId != null) request.input('userId', sql.Int, userId);
    request.input('localTime', sql.VarChar, vietnamNow(options.now));
    request.input('dayOffset', sql.Int, [-1,0,1,2].includes(options.dayOffset) ? options.dayOffset : 0);
    request.input('targetDate', sql.VarChar, options.targetDate || null);
    request.input('explicitDay', sql.Int, options.explicitDay ? 1 : 0);
    request.input('appointmentStatus', sql.VarChar, ['past','cancelled'].includes(options.appointmentStatus) ? options.appointmentStatus : 'upcoming');
    return (await boundedQuery(request, `DECLARE @localNow DATETIME2 = CONVERT(DATETIME2,@localTime,126);
      DECLARE @targetDay DATE = COALESCE(CONVERT(DATE,@targetDate,23),DATEADD(DAY,@dayOffset,CAST(@localNow AS DATE)));\n` + statement, deadline)).recordset;
  };
  const notes = (today) => `SELECT TOP (51) NhatKyID AS id, HoatDong AS hoatDong, MoTaChiTiet AS moTaChiTiet,
    CONVERT(VARCHAR(19),NgayGhi,126) AS ngayGhi FROM NhatKyChamSoc WHERE NguoiCaoTuoiID=@elderlyId
    ${today ? 'AND NgayGhi >= @targetDay AND NgayGhi < DATEADD(DAY,1,@targetDay)' : ''}
    ORDER BY NgayGhi DESC,NhatKyID DESC`;
  const appointments = (today) => `SELECT TOP (51) LichKhamID AS id, TenBenhVien AS tenBenhVien,
    BacSiPhuTrach AS bacSiPhuTrach, ChuyenKhoa AS chuyenKhoa, LyDoKham AS lyDoKham,
    CONVERT(VARCHAR(19),ThoiGianKham,126) AS thoiGianKham, TrangThai AS trangThai,
    DATEDIFF(DAY,@localNow,ThoiGianKham) AS soNgayConLai
    FROM LichKhamBenh WHERE NguoiCaoTuoiID=@elderlyId
    ${today ? "AND TrangThai=N'ChuaDen' AND ThoiGianKham >= @targetDay AND ThoiGianKham < DATEADD(DAY,1,@targetDay)" : `
    AND ((@appointmentStatus='cancelled' AND TrangThai=N'Huy')
      OR (@appointmentStatus='past' AND TrangThai NOT IN (N'Huy',N'DaDoiLich') AND ThoiGianKham<@localNow)
      OR (@appointmentStatus='upcoming' AND TrangThai=N'ChuaDen' AND ThoiGianKham>=@localNow))
    AND (@explicitDay=0 OR (ThoiGianKham>=@targetDay AND ThoiGianKham<DATEADD(DAY,1,@targetDay)))`}
    ORDER BY ${today ? '' : "CASE WHEN @appointmentStatus='past' THEN ThoiGianKham END DESC,"} ThoiGianKham,LichKhamID`;
  const queries = {
    medications: `SELECT TOP (51) l.LichUongThuocID AS id,dm.TenThuoc AS tenThuoc,ct.LieuDung AS lieuDung,
      ct.GhiChu AS cachDung, CONVERT(VARCHAR(19),l.ThoiGianDuKien,126) AS thoiGianDuKien,
      CONVERT(VARCHAR(19),l.ThoiGianThucTe,126) AS thoiGianThucTe,l.TrangThai AS trangThai,
      CONVERT(VARCHAR(10),dt.NgayKetThuc,23) AS ngayKetThuc,
      DATEDIFF(DAY,@localNow,dt.NgayKetThuc) AS soNgayConLai
      FROM LichUongThuoc l JOIN DonThuocChiTiet ct ON ct.DonThuocChiTietID=l.DonThuocChiTietID
      JOIN DonThuoc dt ON dt.DonThuocID=ct.DonThuocID AND dt.NguoiCaoTuoiID=l.NguoiCaoTuoiID
      JOIN DanhMucThuoc dm ON dm.ThuocID=ct.ThuocID WHERE l.NguoiCaoTuoiID=@elderlyId
      AND l.ThoiGianDuKien >= @targetDay
      AND l.ThoiGianDuKien < DATEADD(DAY,1,@targetDay)
      ORDER BY l.ThoiGianDuKien,l.LichUongThuocID`,
    appointments: appointments(false), todayAppointments: appointments(true),
    health: `WITH latest AS (
      SELECT c.ChiSoID AS id,l.TenChiSo AS tenChiSo,l.DonVi AS donVi,c.GiaTri AS giaTri,c.GiaTriPhu AS giaTriPhu,
      CONVERT(VARCHAR(19),c.ThoiGianDo,126) AS thoiGianDo,c.LaBatThuong AS laBatThuong,
      ROW_NUMBER() OVER(PARTITION BY c.LoaiChiSoID ORDER BY c.ThoiGianDo DESC,c.ChiSoID DESC) AS rn
      FROM ChiSoSucKhoe c JOIN LoaiChiSoSucKhoe l ON l.LoaiChiSoID=c.LoaiChiSoID
      WHERE c.NguoiCaoTuoiID=@elderlyId AND c.ThoiGianDo<=@localNow
        AND (@explicitDay=0 OR (c.ThoiGianDo>=@targetDay AND c.ThoiGianDo<DATEADD(DAY,1,@targetDay))))
      SELECT TOP (51) id,tenChiSo,donVi,giaTri,giaTriPhu,thoiGianDo,laBatThuong FROM latest WHERE rn=1 ORDER BY thoiGianDo DESC,id DESC`,
    caregivers: `SELECT DISTINCT TOP (51) ncs.NguoiChamSocID AS id,ncs.HoTen AS hoTen,ncs.SoDienThoai AS soDienThoai
      FROM NguoiCaoTuoi_NguoiChamSoc lk JOIN NguoiChamSoc ncs ON ncs.NguoiChamSocID=lk.NguoiChamSocID
      WHERE lk.NguoiCaoTuoiID=@elderlyId AND lk.NgayBatDau <= CAST(@localNow AS DATE)
      AND (lk.NgayKetThuc IS NULL OR lk.NgayKetThuc >= CAST(@localNow AS DATE)) ORDER BY ncs.HoTen,ncs.NguoiChamSocID`,
    notifications: 'SELECT COUNT(*) AS soChuaDoc FROM ThongBao WHERE UserID=@userId AND DaDoc=0',
    notes: notes(false), todayNotes: notes(true),
  };
  return {
    read: async (section, elderlyId, userId, options) => {
      if (!Object.hasOwn(queries, section)) throw new Error('Unsupported section');
      const rows = await query(queries[section], elderlyId, userId, options);
      return { rows: rows.slice(0,50), truncated:rows.length > 50 };
    },
  };
}
module.exports = { createRepository };
