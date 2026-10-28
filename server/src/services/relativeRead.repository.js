const { metricAssessmentSql } = require('../utils/metricAssessment');
const { ACCESS_JOINS, ACCESS_WHERE } = require('./relativeAccess.service');
const { requireRelativeSchema } = require('./relativeSchema');
const { RelativeError, id, readOptions } = require('../utils/relativeValidation');
const { alertTimestampSql } = require('../utils/alertTime');
const PROFILE = `nct.NguoiCaoTuoiID AS id,nct.HoTen AS hoTen,nct.GioiTinh AS gioiTinh,nct.NhomMau AS nhomMau,
  DATEDIFF(YEAR,nct.NgaySinh,CAST(DATEADD(HOUR,7,SYSUTCDATETIME()) AS DATE))
    - CASE WHEN DATEADD(YEAR,DATEDIFF(YEAR,nct.NgaySinh,CAST(DATEADD(HOUR,7,SYSUTCDATETIME()) AS DATE)),nct.NgaySinh)
      >CAST(DATEADD(HOUR,7,SYSUTCDATETIME()) AS DATE) THEN 1 ELSE 0 END AS tuoi,
  nct.TrangThai AS trangThai,lk.MoiQuanHe AS moiQuanHe,
  CASE WHEN lk.XemBenhNen=1 THEN nct.BenhNen END AS benhNen,
  CASE WHEN lk.XemDiUng=1 THEN nct.DiUng END AS diUng,
  lk.XemBenhNen AS xemBenhNen,lk.XemDiUng AS xemDiUng,lk.XemKetQuaKham AS xemKetQuaKham`;
const PAGE = 'OFFSET @offset ROWS FETCH NEXT @limit ROWS ONLY';
const DATE_FILTER = column => `AND (@from IS NULL OR ${column}>=@from)
  AND (@to IS NULL OR ${column}<DATEADD(DAY,1,@to))`;

function createRelativeReadRepository(pool, sql) {
  const request = (userId,feature,options) => pool.request().input('userId',sql.Int,id(userId))
    .input('feature',sql.VarChar(50),feature).input('from',sql.Date,options.tuNgay || null)
    .input('to',sql.Date,options.denNgay || null).input('typeId',sql.Int,options.typeId || null)
    .input('limit',sql.Int,options.limit).input('offset',sql.Int,options.offset);
  const from = `FROM dbo.NguoiCaoTuoi_NguoiThan lk ${ACCESS_JOINS}`;
  const scoped = `${ACCESS_WHERE} AND lk.NguoiCaoTuoiID=@elderlyId`;
  const joins = {
    health: `JOIN dbo.ChiSoSucKhoe c ON c.NguoiCaoTuoiID=lk.NguoiCaoTuoiID
      JOIN dbo.LoaiChiSoSucKhoe t ON t.LoaiChiSoID=c.LoaiChiSoID`,
    medications: `JOIN dbo.LichUongThuoc l ON l.NguoiCaoTuoiID=lk.NguoiCaoTuoiID
      JOIN dbo.DonThuocChiTiet ct ON ct.DonThuocChiTietID=l.DonThuocChiTietID
      JOIN dbo.DonThuoc d ON d.DonThuocID=ct.DonThuocID AND d.NguoiCaoTuoiID=lk.NguoiCaoTuoiID
      JOIN dbo.DanhMucThuoc dm ON dm.ThuocID=ct.ThuocID`,
  };
  const definitions = {
    profile: { feature:'QLHOSONCT', sql:`SELECT ${PROFILE} ${from}
      JOIN dbo.HoSoNguoiCaoTuoi nct ON nct.NguoiCaoTuoiID=lk.NguoiCaoTuoiID WHERE ${scoped}` },
    health: {feature:'QLCHISOSK',sql:`SELECT c.ChiSoID AS id,c.NguoiCaoTuoiID AS nguoiCaoTuoiId,
      t.LoaiChiSoID AS loaiChiSoId,t.TenChiSo AS tenChiSo,t.DonVi AS donVi,${metricAssessmentSql('t','c')} AS trangThaiDanhGia,c.GiaTri AS giaTri,c.GiaTriPhu AS giaTriPhu,
      CONVERT(VARCHAR(19),c.ThoiGianDo,126) AS thoiGianDo,c.LaBatThuong AS laBatThuong
      ${from} ${joins.health} WHERE ${scoped} AND (@typeId IS NULL OR c.LoaiChiSoID=@typeId)
      ${DATE_FILTER('c.ThoiGianDo')} ORDER BY c.ThoiGianDo DESC,c.ChiSoID DESC ${PAGE}`},
    medications: {feature:'QLLICHUONGTHUOC',sql:`SELECT l.LichUongThuocID AS id,l.NguoiCaoTuoiID AS nguoiCaoTuoiId,
      dm.TenThuoc AS tenThuoc,ct.LieuDung AS lieuDung,dm.DonViTinh AS donViTinh,dm.CachDung AS cachDung,
      CONVERT(VARCHAR(19),l.ThoiGianDuKien,126) AS thoiGianDuKien,
      CONVERT(VARCHAR(19),l.ThoiGianThucTe,126) AS thoiGianThucTe,l.TrangThai AS trangThai
      ${from} ${joins.medications} WHERE ${scoped} ${DATE_FILTER('l.ThoiGianDuKien')}
      ORDER BY l.ThoiGianDuKien DESC,l.LichUongThuocID DESC ${PAGE}`},
    appointments: {feature:'QLLICHKHAM',sql:`SELECT l.LichKhamID AS id,l.NguoiCaoTuoiID AS nguoiCaoTuoiId,
      l.TenBenhVien AS tenBenhVien,l.BacSiPhuTrach AS bacSiPhuTrach,l.ChuyenKhoa AS chuyenKhoa,
      CONVERT(VARCHAR(19),l.ThoiGianKham,126) AS thoiGianKham,l.TrangThai AS trangThai,
      CASE WHEN lk.XemKetQuaKham=1 THEN l.KetQuaKham END AS ketQuaKham
      ${from} JOIN dbo.LichKhamBenh l ON l.NguoiCaoTuoiID=lk.NguoiCaoTuoiID
      WHERE ${scoped} ${DATE_FILTER('l.ThoiGianKham')} ORDER BY l.ThoiGianKham DESC,l.LichKhamID DESC ${PAGE}`},
    alerts: {feature:'QLCANHBAO',sql:`SELECT c.CanhBaoID AS id,c.NguoiCaoTuoiID AS nguoiCaoTuoiId,
      c.LoaiCanhBao AS loaiCanhBao,c.MucDo AS mucDo,c.TrangThai AS trangThai,
      ${alertTimestampSql('c.NgayTao')} AS ngayTao,
      CASE c.LoaiCanhBao WHEN N'KhanCap' THEN N'Người cao tuổi đã gửi SOS.'
        WHEN N'ChiSoBatThuong' THEN N'Có chỉ số sức khỏe ngoài ngưỡng theo dõi.'
        WHEN N'NhacUongThuoc' THEN N'Có cảnh báo về lịch uống thuốc.'
        WHEN N'NhacLichKham' THEN N'Có nhắc lịch khám.' ELSE N'Có cảnh báo cần theo dõi.' END AS noiDung
      ${from} JOIN dbo.CanhBao c ON c.NguoiCaoTuoiID=lk.NguoiCaoTuoiID
      WHERE ${scoped} ${DATE_FILTER('c.NgayTao')} ORDER BY c.NgayTao DESC,c.CanhBaoID DESC ${PAGE}`},
    sos: {feature:'QLCANHBAO',sql:`SELECT s.CanhBaoKhanCapID AS id,s.NguoiCaoTuoiID AS nguoiCaoTuoiId,
      s.TrangThai AS trangThai,${alertTimestampSql('s.NgayGui')} AS ngayGui,
      ${alertTimestampSql('s.NgayXuLy')} AS ngayXuLy,N'Người cao tuổi đã gửi SOS.' AS noiDung
      ${from} JOIN dbo.CanhBaoKhanCap s ON s.NguoiCaoTuoiID=lk.NguoiCaoTuoiID
      WHERE ${scoped} ${DATE_FILTER('s.NgayGui')} ORDER BY s.NgayGui DESC,s.CanhBaoKhanCapID DESC ${PAGE}`},
  };
  return {
    async elderly(userId,query={}) {
      const options=readOptions(query); await requireRelativeSchema(pool);
      return (await request(userId,'QLHOSONCT',options).query(`SELECT ${PROFILE} ${from}
        JOIN dbo.HoSoNguoiCaoTuoi nct ON nct.NguoiCaoTuoiID=lk.NguoiCaoTuoiID
        WHERE ${ACCESS_WHERE} ORDER BY nct.HoTen,nct.NguoiCaoTuoiID ${PAGE}`)).recordset;
    },
    async read(userId,elderlyId,section,query={}) {
      const definition=definitions[section];
      if (!definition) throw new RelativeError('Loại dữ liệu không hợp lệ.');
      elderlyId=id(elderlyId); const options=readOptions(query); await requireRelativeSchema(pool);
      const check=await request(userId,definition.feature,options).input('elderlyId',sql.Int,elderlyId)
        .query(`SELECT lk.LienKetID FROM dbo.NguoiCaoTuoi_NguoiThan lk ${ACCESS_JOINS} WHERE ${scoped}`);
      if (!check.recordset.length) throw new RelativeError('Không có quyền xem hồ sơ này.','FORBIDDEN_ELDERLY',403);
      // Do not use the earlier check as a cached capability: every SELECT rechecks the link and consent.
      const rows=(await request(userId,definition.feature,options).input('elderlyId',sql.Int,elderlyId).query(definition.sql)).recordset;
      return section==='profile' ? rows[0] || null : rows;
    },
    async notifications(userId,query={}) {
      const options=readOptions(query); await requireRelativeSchema(pool);
      // Never return previously stored free text or a GPS URL. Old notifications lose access on revocation too.
      return (await request(userId,'QLCANHBAO',options).query(`SELECT tb.ThongBaoID AS id,
        lk.NguoiCaoTuoiID AS nguoiCaoTuoiId,s.CanhBaoKhanCapID AS canhBaoKhanCapId,
        N'Cảnh báo SOS' AS tieuDe,N'Người cao tuổi đã gửi SOS.' AS noiDung,
        tb.DaDoc AS daDoc,${alertTimestampSql('tb.NgayTao')} AS ngayTao
        ${from} JOIN dbo.CanhBaoKhanCap s ON s.NguoiCaoTuoiID=lk.NguoiCaoTuoiID
        JOIN dbo.ThongBao tb ON tb.LienKetBang=N'CanhBaoKhanCap' AND tb.LienKetID=s.CanhBaoKhanCapID
          AND tb.UserID=lk.NguoiThanUserID
        WHERE ${ACCESS_WHERE} ${DATE_FILTER('tb.NgayTao')}
        ORDER BY tb.NgayTao DESC,tb.ThongBaoID DESC ${PAGE}`)).recordset;
    },
  };
}
module.exports = { createRelativeReadRepository };
