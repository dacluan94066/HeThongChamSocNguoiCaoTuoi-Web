const { poolPromise, sql } = require('../config/db');
const { authorizeWrite, problem, positiveId } = require('./alertWorkflow.service');
const { validateCareNote } = require('../utils/careNoteValidation');
const { snapshot, requireAudit, appendAudit, revisionVersion } = require('../utils/careNoteAudit');

// Include every editable field and latest audit ID: changing A -> B -> A must
// still invalidate an old editor, including a concurrent legacy Mobile editor.
const versionSql = (alias) => `CONVERT(VARCHAR(64),HASHBYTES('SHA2_256',CONCAT(
  DATALENGTH(${alias}.HoatDong),':',${alias}.HoatDong,':',
  DATALENGTH(${alias}.MoTaChiTiet),':',ISNULL(${alias}.MoTaChiTiet,''),':',${alias}.TrangThai,':',
  ${alias}.LoaiNhatKy,':',CONVERT(VARCHAR(27),${alias}.NgayGhi,126),':',
  ${alias}.NguoiCaoTuoiID)),2)`;

function checked(body, options) {
  const result = validateCareNote(body, options);
  if (result.error) throw problem(422, result.error.code, result.error.message);
  return result.value;
}

async function authorizeNoteWrite(transaction, user, elderlyId, action) {
  await authorizeWrite(transaction, user, elderlyId, 'QLNHATKY');
  if (user.tenVaiTro === 'QuanTriVien') return;
  const column = { them: 'ChoPhepThem', sua: 'ChoPhepSua', xoa: 'ChoPhepXoa' }[action];
  const result = await new sql.Request(transaction).input('uid', sql.Int, user.userId).query(`
    SELECT p.${column} AS allowed FROM PhanQuyen p
    JOIN ChucNang cn ON cn.ChucNangID=p.ChucNangID
    JOIN NguoiDung nd ON nd.VaiTroID=p.VaiTroID
    WHERE nd.UserID=@uid AND cn.MaChucNang=N'QLNHATKY'`);
  if (!result.recordset[0]?.allowed) throw problem(403, 'FORBIDDEN', 'Bạn không có quyền thực hiện thao tác nhật ký này.');
}

async function createNote({ user, elderlyId, body }) {
  if (!positiveId(elderlyId)) throw problem(422, 'INVALID_PROFILE', 'Hồ sơ người cao tuổi không hợp lệ.');
  const value = checked(body);
  const transaction = new sql.Transaction(await poolPromise);
  await transaction.begin(sql.ISOLATION_LEVEL.SERIALIZABLE);
  try {
    await authorizeNoteWrite(transaction, user, Number(elderlyId), 'them');
    await requireAudit(transaction, sql, problem);
    const caregiver = (await new sql.Request(transaction).input('uid', sql.Int, user.userId).query(
      'SELECT NguoiChamSocID FROM NguoiChamSoc WHERE UserID=@uid')).recordset[0]?.NguoiChamSocID || null;
    if (user.tenVaiTro === 'NguoiChamSoc' && !caregiver) throw problem(403, 'PROFILE_REQUIRED', 'Tài khoản chưa liên kết người chăm sóc.');
    const created = await new sql.Request(transaction)
      .input('elderlyId', sql.Int, Number(elderlyId)).input('caregiver', sql.Int, caregiver)
      .input('title', sql.NVarChar(200), value.tieuDe).input('content', sql.NVarChar(1000), value.noiDung)
      .input('type', sql.NVarChar(30), value.loaiNhatKy || 'CHAM_SOC_HANG_NGAY')
      .input('careTime', sql.VarChar(19), value.thoiGianChamSoc ?? null).query(`
        INSERT INTO NhatKyChamSoc (NguoiCaoTuoiID,NguoiChamSocID,NgayGhi,NgayTao,LoaiNhatKy,HoatDong,MoTaChiTiet)
        OUTPUT INSERTED.NhatKyID AS id
        VALUES(@elderlyId,@caregiver,COALESCE(CONVERT(DATETIME2,@careTime,126),DATEADD(HOUR,7,SYSUTCDATETIME())),
          DATEADD(HOUR,7,SYSUTCDATETIME()),@type,@title,@content)`);
    const id = created.recordset[0].id;
    const row = (await new sql.Request(transaction).input('id', sql.Int, id).query(`
      SELECT HoatDong AS title,MoTaChiTiet AS content,LoaiNhatKy AS type,TrangThai AS status,
        CONVERT(VARCHAR(27),NgayGhi,126) AS careTime FROM NhatKyChamSoc WHERE NhatKyID=@id`)).recordset[0];
    await appendAudit(transaction, sql, { id, elderlyId: Number(elderlyId), action: 'TAO', user,
      before: null, after: snapshot(row), reason: value.lyDo });
    await transaction.commit();
    return { id };
  } catch (error) {
    try { await transaction.rollback(); } catch (_) { /* already rolled back */ }
    throw error;
  }
}

async function mutate({ user, id, version, title, content, type, careTime, reason, remove = false }) {
  if (!positiveId(id)) throw problem(400, 'INVALID_ID', 'ID không hợp lệ.');
  if (typeof version !== 'string' || !/^[A-F0-9]{64}$/.test(version)) throw problem(400, 'VERSION_REQUIRED', 'Hãy tải lại nhật ký trước khi thay đổi.');
  const body = remove ? {} : { tieuDe: title, noiDung: content };
  // Omitted optional fields preserve the legacy Mobile request contract.
  if (type !== undefined) body.loaiNhatKy = type;
  if (careTime !== undefined) body.thoiGianChamSoc = careTime;
  if (reason !== undefined) body.lyDo = reason;
  const value = checked(body, { partial: remove });
  const transaction = new sql.Transaction(await poolPromise);
  await transaction.begin(sql.ISOLATION_LEVEL.SERIALIZABLE);
  try {
    const row = (await new sql.Request(transaction).input('id', sql.Int, Number(id)).query(`
      SELECT n.NguoiCaoTuoiID AS elderlyId,n.TrangThai AS status,c.UserID AS author,
        n.HoatDong AS title,n.MoTaChiTiet AS content,n.LoaiNhatKy AS type,
        CONVERT(VARCHAR(27),n.NgayGhi,126) AS careTime,${versionSql('n')} AS version
      FROM NhatKyChamSoc n WITH(UPDLOCK,HOLDLOCK)
      LEFT JOIN NguoiChamSoc c ON c.NguoiChamSocID=n.NguoiChamSocID WHERE n.NhatKyID=@id`)).recordset[0];
    if (!row || row.status === 'HUY') throw problem(404, 'NOTE_NOT_FOUND', 'Nhật ký không tồn tại hoặc đã xóa.');
    await authorizeNoteWrite(transaction, user, row.elderlyId, remove ? 'xoa' : 'sua');
    await requireAudit(transaction, sql, problem);
    const latest = (await new sql.Request(transaction).input('id', sql.Int, Number(id)).query(`
      SELECT TOP(1) LichSuID AS latestId FROM dbo.LichSuNhatKyChamSoc WITH(UPDLOCK,HOLDLOCK)
      WHERE NhatKyID=@id ORDER BY LichSuID DESC`)).recordset[0]?.latestId;
    if (revisionVersion(row.version, latest) !== version) throw problem(409, 'NOTE_CHANGED', 'Nhật ký đã thay đổi. Bản nháp được giữ; tải lại dữ liệu trước khi lưu.');
    // A minute/second-level editor must not round untouched legacy DATETIME2
    // fractions, nor should an old Mobile payload rewrite an omitted date.
    const changeCareTime = value.thoiGianChamSoc !== undefined
      && value.thoiGianChamSoc !== row.careTime?.slice(0, 19);
    const after = remove ? { ...row, status: 'HUY' } : {
      ...row, title: value.tieuDe, content: value.noiDung,
      type: value.loaiNhatKy ?? row.type, careTime: changeCareTime ? value.thoiGianChamSoc : row.careTime,
    };
    if (!remove && JSON.stringify(snapshot(row)) === JSON.stringify(snapshot(after))) {
      await transaction.commit();
      return { id: Number(id), deleted: false, unchanged: true };
    }
    const request = new sql.Request(transaction).input('id', sql.Int, Number(id));
    if (remove) await request.query("UPDATE NhatKyChamSoc SET TrangThai=N'HUY' WHERE NhatKyID=@id");
    else await request.input('title', sql.NVarChar(200), after.title).input('content', sql.NVarChar(1000), after.content)
      .input('type', sql.NVarChar(30), after.type).input('careTime', sql.VarChar(27), after.careTime)
      .input('changeCareTime', sql.Int, changeCareTime ? 1 : 0).query(`
        UPDATE NhatKyChamSoc SET HoatDong=@title,MoTaChiTiet=@content,LoaiNhatKy=@type,
          NgayGhi=CASE WHEN @changeCareTime=1 THEN CONVERT(DATETIME2,@careTime,126) ELSE NgayGhi END WHERE NhatKyID=@id`);
    await appendAudit(transaction, sql, { id: Number(id), elderlyId: row.elderlyId,
      action: remove ? 'XOA' : 'SUA', user, reason: value.lyDo, before: snapshot(row), after: snapshot(after) });
    await transaction.commit();
    return { id: Number(id), deleted: remove };
  } catch (error) {
    try { await transaction.rollback(); } catch (_) { /* already rolled back */ }
    throw error;
  }
}

async function history(pool, id) {
  const available = await pool.request().query("SELECT CASE WHEN OBJECT_ID(N'dbo.LichSuNhatKyChamSoc',N'U') IS NULL THEN 0 ELSE 1 END AS available");
  if (!available.recordset[0]?.available) throw problem(503, 'CARE_NOTE_AUDIT_NOT_INSTALLED', 'Chưa có bảng lịch sử nhật ký. Cần chạy patch_care_note_audit.sql.');
  const result = await pool.request().input('id', sql.Int, Number(id)).query(`
    SELECT LichSuID AS id,HanhDong AS hanhDong,NguoiThucHienTen AS nguoiThucHienTen,
      CONVERT(VARCHAR(19),ThoiGian,126) AS thoiGian,LyDo AS lyDo,DuLieuCu AS truoc,DuLieuMoi AS sau
    FROM dbo.LichSuNhatKyChamSoc WHERE NhatKyID=@id ORDER BY LichSuID DESC`);
  return result.recordset.map((row) => ({ ...row, truoc: row.truoc ? JSON.parse(row.truoc) : null, sau: row.sau ? JSON.parse(row.sau) : null }));
}

const endpoint = (remove) => async (req, res, next) => {
  try {
    const body = req.body || {};
    const result = await mutate({ user: req.user, id: req.params.id, version: body.version,
      title: body.tieuDe, content: body.noiDung, type: body.loaiNhatKy,
      careTime: body.thoiGianChamSoc, reason: body.lyDo, remove });
    return require('../utils/response').ok(res, result, 'Đã cập nhật nhật ký.');
  } catch (error) {
    if (error.status) return require('../utils/response').fail(res, error.message, error.code, error.status);
    return next(error);
  }
};

module.exports = { mutate, versionSql, endpoint, createNote, history };
