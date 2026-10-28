const { requireRelativeSchema } = require('./relativeSchema');
const { RelativeError, id, keys } = require('../utils/relativeValidation');

// A contact suggestion is not a grant of access, a consent record or a live link.
// Repeat the actor's current assignment in SQL; a caller-supplied elderly ID is
// never sufficient, even if the caller already passed the route's scope loader.
const actorScope = `EXISTS (
  SELECT 1 FROM dbo.NguoiDung actor JOIN dbo.VaiTro actorRole ON actorRole.VaiTroID=actor.VaiTroID
  WHERE actor.UserID=@actorId AND actor.TrangThai=N'HoatDong' AND actorRole.TenVaiTro=@actorRole
    AND (@actorRole=N'QuanTriVien' OR (@actorRole=N'NguoiChamSoc' AND EXISTS (
      SELECT 1 FROM dbo.NguoiChamSoc ncs
      JOIN dbo.NguoiCaoTuoi_NguoiChamSoc care ON care.NguoiChamSocID=ncs.NguoiChamSocID
      WHERE ncs.UserID=@actorId AND ncs.TrangThai=N'DangLamViec' AND care.NguoiCaoTuoiID=@elderlyId
        AND care.NgayBatDau<=CAST(DATEADD(HOUR,7,SYSUTCDATETIME()) AS DATE)
        AND (care.NgayKetThuc IS NULL OR care.NgayKetThuc>CAST(DATEADD(HOUR,7,SYSUTCDATETIME()) AS DATE))
    )))
)`;

function createLinkedRelativeContacts({ poolPromise, sql }) {
  return async (user, query) => {
    if (!['QuanTriVien', 'NguoiChamSoc'].includes(user?.tenVaiTro)) {
      throw new RelativeError('Chỉ Admin hoặc người chăm sóc được phân công mới được chọn liên hệ.', 'FORBIDDEN', 403);
    }
    keys(query, ['nguoiCaoTuoiId']);
    const elderlyId = id(query.nguoiCaoTuoiId), actorId = id(user.userId);
    const pool = await poolPromise;
    const request = () => pool.request().input('elderlyId', sql.Int, elderlyId)
      .input('actorId', sql.Int, actorId).input('actorRole', sql.NVarChar(30), user.tenVaiTro);
    const allowed = await request().query(`SELECT NguoiCaoTuoiID AS id FROM dbo.HoSoNguoiCaoTuoi
      WHERE NguoiCaoTuoiID=@elderlyId AND ${actorScope}`);
    if (!allowed.recordset.length) throw new RelativeError('Không có quyền truy cập hồ sơ đã chọn.', 'FORBIDDEN_ELDERLY', 403);
    await requireRelativeSchema(pool);
    const result = await request().query(`
      SELECT lk.LienKetID AS id, nd.HoTen AS hoTen, lk.MoiQuanHe AS moiQuanHe,
        nd.SoDienThoai AS soDienThoai, nd.Email AS email
      FROM dbo.NguoiCaoTuoi_NguoiThan lk
      JOIN dbo.NguoiDung nd ON nd.UserID=lk.NguoiThanUserID
      JOIN dbo.VaiTro vt ON vt.VaiTroID=nd.VaiTroID
      WHERE lk.NguoiCaoTuoiID=@elderlyId AND lk.ThuHoiLuc IS NULL AND lk.DongYChiaSe=1
        AND lk.TaoLuc<=SYSUTCDATETIME() AND nd.TrangThai=N'HoatDong' AND vt.TenVaiTro=N'NguoiThan'
        AND ${actorScope}
      ORDER BY nd.HoTen,lk.LienKetID`);
    return result.recordset.map(row => ({ id: row.id, hoTen: row.hoTen, moiQuanHe: row.moiQuanHe,
      soDienThoai: row.soDienThoai, email: row.email }));
  };
}

module.exports = { createLinkedRelativeContacts };
