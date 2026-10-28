const { requireRelativeSchema } = require('./relativeSchema');
const { RelativeError, id, keys } = require('../utils/relativeValidation');

function createOwnRelativesReader({ poolPromise, sql }) {
  return async (user, query = {}) => {
    if (user?.tenVaiTro !== 'NguoiCaoTuoi') throw new RelativeError('Chỉ Người cao tuổi được xem Người thân của chính mình.', 'FORBIDDEN', 403);
    keys(query, []); // No foreign profile ID, filters or actor IDs are accepted.
    const userId = id(user.userId), pool = await poolPromise;
    const owner = await pool.request().input('userId', sql.Int, userId).query(`
      SELECT nct.NguoiCaoTuoiID AS id FROM dbo.HoSoNguoiCaoTuoi nct
      JOIN dbo.NguoiDung owner ON owner.UserID=nct.UserID
      JOIN dbo.VaiTro ownerRole ON ownerRole.VaiTroID=owner.VaiTroID
      WHERE owner.UserID=@userId AND owner.TrangThai=N'HoatDong' AND ownerRole.TenVaiTro=N'NguoiCaoTuoi'`);
    if (!owner.recordset.length) throw new RelativeError('Tài khoản chưa có hồ sơ Người cao tuổi hợp lệ.', 'ELDERLY_PROFILE_NOT_FOUND', 404);
    await requireRelativeSchema(pool);
    const rows = (await pool.request().input('userId', sql.Int, userId).query(`
      SELECT lk.LienKetID AS id,nct.NguoiCaoTuoiID AS nguoiCaoTuoiId,
        nd.HoTen AS hoTen,nd.SoDienThoai AS soDienThoai,lk.MoiQuanHe AS moiQuanHe,
        lk.XemBenhNen AS benhNen,lk.XemDiUng AS diUng,lk.XemKetQuaKham AS ketQuaKham,
        rights.profileRead,rights.healthRead,rights.medicationRead,rights.appointmentRead,rights.alertRead
      FROM dbo.HoSoNguoiCaoTuoi nct
      JOIN dbo.NguoiDung owner ON owner.UserID=nct.UserID
      JOIN dbo.VaiTro ownerRole ON ownerRole.VaiTroID=owner.VaiTroID
      JOIN dbo.NguoiCaoTuoi_NguoiThan lk ON lk.NguoiCaoTuoiID=nct.NguoiCaoTuoiID
      JOIN dbo.NguoiDung nd ON nd.UserID=lk.NguoiThanUserID
      JOIN dbo.VaiTro vt ON vt.VaiTroID=nd.VaiTroID
      OUTER APPLY (SELECT
        MAX(CASE WHEN cn.MaChucNang=N'QLHOSONCT' AND pq.ChoPhepXem=1 THEN 1 ELSE 0 END) AS profileRead,
        MAX(CASE WHEN cn.MaChucNang=N'QLCHISOSK' AND pq.ChoPhepXem=1 THEN 1 ELSE 0 END) AS healthRead,
        MAX(CASE WHEN cn.MaChucNang=N'QLLICHUONGTHUOC' AND pq.ChoPhepXem=1 THEN 1 ELSE 0 END) AS medicationRead,
        MAX(CASE WHEN cn.MaChucNang=N'QLLICHKHAM' AND pq.ChoPhepXem=1 THEN 1 ELSE 0 END) AS appointmentRead,
        MAX(CASE WHEN cn.MaChucNang=N'QLCANHBAO' AND pq.ChoPhepXem=1 THEN 1 ELSE 0 END) AS alertRead
        FROM dbo.PhanQuyen pq JOIN dbo.ChucNang cn ON cn.ChucNangID=pq.ChucNangID
        WHERE pq.VaiTroID=nd.VaiTroID) rights
      WHERE nct.UserID=@userId AND owner.TrangThai=N'HoatDong' AND ownerRole.TenVaiTro=N'NguoiCaoTuoi'
        AND lk.ThuHoiLuc IS NULL AND lk.DongYChiaSe=1 AND lk.TaoLuc<=SYSUTCDATETIME()
        AND nd.TrangThai=N'HoatDong' AND vt.TenVaiTro=N'NguoiThan'
      ORDER BY nd.HoTen,lk.LienKetID`)).recordset;
    return rows.map(row => ({ id: row.id, nguoiCaoTuoiId: row.nguoiCaoTuoiId,
      hoTen: row.hoTen, soDienThoai: row.soDienThoai, moiQuanHe: row.moiQuanHe,
      phamViChiaSe: { hoSoCoBan: row.profileRead === 1, chiSoSucKhoe: row.healthRead === 1,
        lichThuoc: row.medicationRead === 1, lichKham: row.appointmentRead === 1, canhBao: row.alertRead === 1,
        benhNen: row.profileRead === 1 && Boolean(row.benhNen), diUng: row.profileRead === 1 && Boolean(row.diUng),
        ketQuaKham: row.appointmentRead === 1 && Boolean(row.ketQuaKham) } }));
  };
}
module.exports = { createOwnRelativesReader };
