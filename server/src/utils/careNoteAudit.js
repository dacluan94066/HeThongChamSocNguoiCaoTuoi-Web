// Receives the caller's pool/transaction; importing this module never connects DB.
const { createHash } = require('node:crypto');
const revisionVersion = (base, latestId) => Number(latestId) > 0
  ? createHash('sha256').update(`${base}:${latestId}`).digest('hex').toUpperCase() : base;
const snapshot = (row) => ({
  tieuDe: row.title,
  noiDung: row.content,
  loaiNhatKy: row.type,
  thoiGianChamSoc: row.careTime,
  trangThai: row.status,
});

async function requireAudit(transaction, sql, problem) {
  const result = await new sql.Request(transaction).query(`
    SELECT CASE WHEN OBJECT_ID(N'dbo.LichSuNhatKyChamSoc',N'U') IS NULL THEN 0 ELSE 1 END AS available`);
  if (Number(result.recordset[0]?.available) !== 1) {
    throw problem(503, 'CARE_NOTE_AUDIT_NOT_INSTALLED', 'Chưa bật lịch sử nhật ký. Quản trị viên cần chạy patch_care_note_audit.sql trước khi lưu.');
  }
}

async function appendAudit(transaction, sql, { id, elderlyId, action, user, reason, before, after }) {
  const result = await new sql.Request(transaction)
    .input('auditId', sql.Int, id).input('auditElderlyId', sql.Int, elderlyId)
    .input('auditAction', sql.NVarChar(10), action).input('auditActor', sql.Int, user.userId)
    .input('auditRole', sql.NVarChar(30), user.tenVaiTro)
    .input('auditReason', sql.NVarChar(300), reason ?? null)
    .input('auditBefore', sql.NVarChar(sql.MAX), before ? JSON.stringify(before) : null)
    .input('auditAfter', sql.NVarChar(sql.MAX), JSON.stringify(after))
    .query(`INSERT INTO dbo.LichSuNhatKyChamSoc
      (NhatKyID,NguoiCaoTuoiID,HanhDong,NguoiThucHienID,NguoiThucHienTen,VaiTro,ThoiGian,LyDo,DuLieuCu,DuLieuMoi)
      SELECT @auditId,@auditElderlyId,@auditAction,nd.UserID,nd.HoTen,@auditRole,
        DATEADD(HOUR,7,SYSUTCDATETIME()),@auditReason,@auditBefore,@auditAfter
      FROM NguoiDung nd WHERE nd.UserID=@auditActor`);
  if (result.rowsAffected?.[0] === 0) throw new Error('Không lưu được người thực hiện trong lịch sử nhật ký.');
}

async function attachNoteHistory(pool, rows) {
  if (!rows.length) return rows;
  const ids = [...new Set(rows.map((row) => Number(row.id)))].filter((id) => Number.isInteger(id) && id > 0 && id <= 2147483647);
  if (!ids.length) return rows;
  const result = await pool.request().query(`
    IF OBJECT_ID(N'dbo.LichSuNhatKyChamSoc',N'U') IS NOT NULL
      EXEC(N'SELECT ids.NhatKyID AS id,
        (SELECT COUNT(*) FROM dbo.LichSuNhatKyChamSoc h WHERE h.NhatKyID=ids.NhatKyID) AS lichSuCount,
        (SELECT MAX(LichSuID) FROM dbo.LichSuNhatKyChamSoc h WHERE h.NhatKyID=ids.NhatKyID) AS latestId,
        created.NguoiThucHienID AS nguoiGhiId,created.NguoiThucHienTen AS nguoiGhiTen,
        CONVERT(VARCHAR(19),changed.ThoiGian,126) AS chinhSuaLuc,changed.NguoiThucHienTen AS nguoiSuaTen
        FROM (SELECT DISTINCT NhatKyID FROM dbo.LichSuNhatKyChamSoc WHERE NhatKyID IN (${ids.join(',')})) ids
        OUTER APPLY (SELECT TOP(1) NguoiThucHienID,NguoiThucHienTen FROM dbo.LichSuNhatKyChamSoc
          WHERE NhatKyID=ids.NhatKyID AND HanhDong=N''TAO'' ORDER BY LichSuID) created
        OUTER APPLY (SELECT TOP(1) ThoiGian,NguoiThucHienTen FROM dbo.LichSuNhatKyChamSoc
          WHERE NhatKyID=ids.NhatKyID AND HanhDong=N''SUA'' ORDER BY LichSuID DESC) changed');
    ELSE SELECT CAST(NULL AS INT) AS id WHERE 1=0;
  `);
  const histories = new Map((result.recordset || []).map((row) => [Number(row.id), row]));
  return rows.map((row) => {
    const history = histories.get(Number(row.id));
    return {
      ...row,
      version: revisionVersion(row.version, history?.latestId),
      nguoiGhiId: history?.nguoiGhiId ?? row.authorUserId ?? null,
      nguoiGhiTen: history?.nguoiGhiTen || row.nguoiChamSocTen || null,
      lichSuCount: Number(history?.lichSuCount || 0),
      chinhSuaLanCuoi: history?.chinhSuaLuc ? { thoiGian: history.chinhSuaLuc, nguoiThucHienTen: history.nguoiSuaTen } : null,
    };
  });
}

module.exports = { snapshot, requireAudit, appendAudit, attachNoteHistory, revisionVersion };
