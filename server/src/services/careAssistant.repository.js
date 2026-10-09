// All queries are fixed SELECTs. IDs are bound after server-side scope checks.
function createRepository(pool, sql) {
  const query = async (statement, elderlyId, userId) => {
    const request = pool.request();
    request.timeout = 10000;
    if (elderlyId != null) request.input('elderlyId', sql.Int, elderlyId);
    if (userId != null) request.input('userId', sql.Int, userId);
    return (await request.query(statement)).recordset;
  };
  const notes = (today) => `SELECT TOP (51) NhatKyID AS id, HoatDong AS hoatDong, MoTaChiTiet AS moTaChiTiet,
    CONVERT(VARCHAR(19),NgayGhi,126) AS ngayGhi FROM NhatKyChamSoc WHERE NguoiCaoTuoiID=@elderlyId
    ${today ? 'AND NgayGhi >= CAST(GETDATE() AS DATE) AND NgayGhi < DATEADD(DAY,1,CAST(GETDATE() AS DATE))' : ''}
    ORDER BY NgayGhi DESC,NhatKyID DESC`;
  const appointments = (today) => `SELECT TOP (51) LichKhamID AS id, TenBenhVien AS tenBenhVien,
    BacSiPhuTrach AS bacSiPhuTrach, ChuyenKhoa AS chuyenKhoa, LyDoKham AS lyDoKham,
    CONVERT(VARCHAR(19),ThoiGianKham,126) AS thoiGianKham, TrangThai AS trangThai,
    DATEDIFF(DAY,GETDATE(),ThoiGianKham) AS soNgayConLai
    FROM LichKhamBenh WHERE NguoiCaoTuoiID=@elderlyId AND TrangThai=N'ChuaDen'
    AND ThoiGianKham >= ${today ? 'CAST(GETDATE() AS DATE)' : 'SYSDATETIME()'}
    ${today ? 'AND ThoiGianKham < DATEADD(DAY,1,CAST(GETDATE() AS DATE))' : ''}
    ORDER BY ThoiGianKham,LichKhamID`;
  const queries = {
    medications: `SELECT TOP (51) l.LichUongThuocID AS id,dm.TenThuoc AS tenThuoc,ct.LieuDung AS lieuDung,
      ct.GhiChu AS cachDung, CONVERT(VARCHAR(19),l.ThoiGianDuKien,126) AS thoiGianDuKien,l.TrangThai AS trangThai
      FROM LichUongThuoc l JOIN DonThuocChiTiet ct ON ct.DonThuocChiTietID=l.DonThuocChiTietID
      JOIN DanhMucThuoc dm ON dm.ThuocID=ct.ThuocID WHERE l.NguoiCaoTuoiID=@elderlyId
      AND l.ThoiGianDuKien >= CAST(GETDATE() AS DATE)
      AND l.ThoiGianDuKien < DATEADD(DAY,1,CAST(GETDATE() AS DATE))
      ORDER BY l.ThoiGianDuKien,l.LichUongThuocID`,
    appointments: appointments(false), todayAppointments: appointments(true),
    health: `WITH latest AS (
      SELECT c.ChiSoID AS id,l.TenChiSo AS tenChiSo,l.DonVi AS donVi,c.GiaTri AS giaTri,c.GiaTriPhu AS giaTriPhu,
      CONVERT(VARCHAR(19),c.ThoiGianDo,126) AS thoiGianDo,c.LaBatThuong AS laBatThuong,
      ROW_NUMBER() OVER(PARTITION BY c.LoaiChiSoID ORDER BY c.ThoiGianDo DESC,c.ChiSoID DESC) AS rn
      FROM ChiSoSucKhoe c JOIN LoaiChiSoSucKhoe l ON l.LoaiChiSoID=c.LoaiChiSoID
      WHERE c.NguoiCaoTuoiID=@elderlyId)
      SELECT TOP (51) id,tenChiSo,donVi,giaTri,giaTriPhu,thoiGianDo,laBatThuong FROM latest WHERE rn=1 ORDER BY thoiGianDo DESC`,
    caregivers: `SELECT DISTINCT TOP (51) ncs.NguoiChamSocID AS id,ncs.HoTen AS hoTen,ncs.SoDienThoai AS soDienThoai
      FROM NguoiCaoTuoi_NguoiChamSoc lk JOIN NguoiChamSoc ncs ON ncs.NguoiChamSocID=lk.NguoiChamSocID
      WHERE lk.NguoiCaoTuoiID=@elderlyId AND lk.NgayBatDau <= CAST(GETDATE() AS DATE)
      AND (lk.NgayKetThuc IS NULL OR lk.NgayKetThuc >= CAST(GETDATE() AS DATE)) ORDER BY ncs.HoTen`,
    notifications: 'SELECT COUNT(*) AS soChuaDoc FROM ThongBao WHERE UserID=@userId AND DaDoc=0',
    notes: notes(false), todayNotes: notes(true),
  };
  return {
    read: async (section, elderlyId, userId) => {
      if (!Object.hasOwn(queries, section)) throw new Error('Unsupported section');
      const rows = await query(queries[section], elderlyId, userId);
      return { rows: rows.slice(0,50), truncated:rows.length > 50 };
    },
  };
}
module.exports = { createRepository };
