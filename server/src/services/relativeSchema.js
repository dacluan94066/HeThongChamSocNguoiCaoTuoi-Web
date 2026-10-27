const { RelativeError } = require('../utils/relativeValidation');
async function requireRelativeSchema(pool) {
  // No startup migration and no negative cache: installing the patch needs no restart.
  const result = await pool.request().query(`SELECT CASE WHEN
    OBJECT_ID(N'dbo.NguoiCaoTuoi_NguoiThan',N'U') IS NOT NULL
    AND OBJECT_ID(N'dbo.LichSuLienKetNguoiThan',N'U') IS NOT NULL
    AND COL_LENGTH(N'dbo.NguoiCaoTuoi_NguoiThan',N'PhienBan')=8
    AND COL_LENGTH(N'dbo.NguoiCaoTuoi_NguoiThan',N'XemKetQuaKham') IS NOT NULL
    AND EXISTS(SELECT 1 FROM sys.indexes WHERE object_id=OBJECT_ID(N'dbo.NguoiCaoTuoi_NguoiThan')
      AND name=N'UX_NCT_NguoiThan_Active' AND is_unique=1 AND is_disabled=0)
    THEN 1 ELSE 0 END AS ready`);
  if (!result.recordset[0]?.ready) throw new RelativeError('Chức năng Người thân chưa được cài đặt trên cơ sở dữ liệu này.', 'RELATIVES_NOT_INSTALLED',503);
}
module.exports = { requireRelativeSchema };
