const { RelativeError, id, grant, update, revoke, keys } = require('../utils/relativeValidation');
const { requireRelativeSchema } = require('./relativeSchema');

// Reused by the reads and realtime eligibility. All values are SQL parameters.
const ACCESS_JOINS = `JOIN dbo.NguoiDung nd ON nd.UserID=lk.NguoiThanUserID
  JOIN dbo.VaiTro vt ON vt.VaiTroID=nd.VaiTroID`;
const ACCESS_WHERE = `lk.NguoiThanUserID=@userId AND lk.ThuHoiLuc IS NULL
  AND lk.DongYChiaSe=1 AND lk.TaoLuc<=SYSUTCDATETIME()
  AND nd.TrangThai=N'HoatDong' AND vt.TenVaiTro=N'NguoiThan'
  AND EXISTS(SELECT 1 FROM dbo.PhanQuyen pq JOIN dbo.ChucNang cn ON cn.ChucNangID=pq.ChucNangID
    WHERE pq.VaiTroID=nd.VaiTroID AND cn.MaChucNang=@feature AND pq.ChoPhepXem=1)`;
const versionOf = row => Buffer.from(row.PhienBan).toString('base64');
const adminLink = row => ({
  id: row.LienKetID, nguoiCaoTuoiId: row.NguoiCaoTuoiID, nguoiThanUserId: row.NguoiThanUserID,
  moiQuanHe: row.MoiQuanHe, dongYChiaSe: Boolean(row.DongYChiaSe), nguoiDongY: row.NguoiDongY,
  tuCachDongY: row.TuCachDongY, thoiDiemDongY: row.ThoiDiemDongY, canCuDongY: row.CanCuDongY,
  phamViChiaSe: {benhNen:Boolean(row.XemBenhNen),diUng:Boolean(row.XemDiUng),ketQuaKham:Boolean(row.XemKetQuaKham)},
  nguoiTaoId: row.NguoiTaoID, taoLuc: row.TaoLuc, capNhatLuc: row.CapNhatLuc,
  thuHoiLuc: row.ThuHoiLuc, nguoiThuHoiId: row.NguoiThuHoiID, lyDoThuHoi: row.LyDoThuHoi,
  version: versionOf(row),
});

function createRelativeAccess(pool, sql, { onAccessChanged = () => {} } = {}) {
  const assertAdmin = async (connection, actorId) => {
    const result = await new sql.Request(connection).input('actorId',sql.Int,id(actorId)).query(`
      SELECT nd.UserID FROM dbo.NguoiDung nd WITH (UPDLOCK,HOLDLOCK)
      JOIN dbo.VaiTro vt ON vt.VaiTroID=nd.VaiTroID
      WHERE nd.UserID=@actorId AND nd.TrangThai=N'HoatDong' AND vt.TenVaiTro=N'QuanTriVien'`);
    if (!result.recordset.length) throw new RelativeError('Chỉ Admin được quản lý liên kết Người thân.','FORBIDDEN',403);
  };
  const bindConsent = (request, value) => request
    .input('relationship',sql.NVarChar(50),value.moiQuanHe)
    .input('consenter',sql.NVarChar(100),value.nguoiDongY)
    .input('capacity',sql.NVarChar(100),value.tuCachDongY)
    .input('consentedAt',sql.DateTime2,value.thoiDiemDongY)
    .input('basis',sql.NVarChar(1000),value.canCuDongY)
    .input('history',sql.Bit,value.benhNen).input('allergies',sql.Bit,value.diUng).input('results',sql.Bit,value.ketQuaKham);
  const audit = async (transaction, row, before, actorId, action, reason) => {
    await new sql.Request(transaction).input('linkId',sql.Int,row.LienKetID)
      .input('actorId',sql.Int,actorId).input('action',sql.NVarChar(20),action)
      .input('reason',sql.NVarChar(500),reason)
      .input('before',sql.NVarChar(sql.MAX),before ? JSON.stringify(adminLink(before)) : null)
      .input('after',sql.NVarChar(sql.MAX),JSON.stringify(adminLink(row)))
      .query(`INSERT INTO dbo.LichSuLienKetNguoiThan(LienKetID,HanhDong,NguoiThucHienID,LyDo,DuLieuCu,DuLieuMoi)
        VALUES(@linkId,@action,@actorId,@reason,@before,@after)`);
  };
  const mutate = async (actorId, action, body, linkId) => {
    const value = action==='CAP' ? grant(body) : action==='CAP_NHAT' ? update(body) : revoke(body);
    if (linkId != null) linkId=id(linkId);
    await requireRelativeSchema(pool);
    const transaction = new sql.Transaction(pool);
    let begun=false, row;
    try {
      await transaction.begin(sql.ISOLATION_LEVEL.SERIALIZABLE); begun=true;
      await assertAdmin(transaction,actorId);
      let before=null;
      if (action==='CAP') {
        const target = await new sql.Request(transaction).input('relativeId',sql.Int,value.relativeId)
          .input('elderlyId',sql.Int,value.elderlyId).query(`
          SELECT nd.UserID FROM dbo.NguoiDung nd WITH (UPDLOCK,HOLDLOCK)
          JOIN dbo.VaiTro vt ON vt.VaiTroID=nd.VaiTroID
          WHERE nd.UserID=@relativeId AND nd.TrangThai=N'HoatDong' AND vt.TenVaiTro=N'NguoiThan'
            AND EXISTS(SELECT 1 FROM dbo.HoSoNguoiCaoTuoi WITH (UPDLOCK,HOLDLOCK) WHERE NguoiCaoTuoiID=@elderlyId)`);
        if (!target.recordset.length) throw new RelativeError('NCT không tồn tại hoặc tài khoản không phải Người thân đang hoạt động.');
        const result = await bindConsent(new sql.Request(transaction),value)
          .input('relativeId',sql.Int,value.relativeId).input('elderlyId',sql.Int,value.elderlyId)
          .input('actorId',sql.Int,actorId).query(`
          INSERT INTO dbo.NguoiCaoTuoi_NguoiThan(NguoiCaoTuoiID,NguoiThanUserID,MoiQuanHe,DongYChiaSe,
            NguoiDongY,TuCachDongY,ThoiDiemDongY,CanCuDongY,XemBenhNen,XemDiUng,XemKetQuaKham,NguoiTaoID)
          OUTPUT INSERTED.* VALUES(@elderlyId,@relativeId,@relationship,1,@consenter,@capacity,@consentedAt,@basis,
            @history,@allergies,@results,@actorId)`);
        row=result.recordset[0];
      } else {
        const current = await new sql.Request(transaction).input('linkId',sql.Int,linkId)
          .query('SELECT * FROM dbo.NguoiCaoTuoi_NguoiThan WITH (UPDLOCK,HOLDLOCK) WHERE LienKetID=@linkId');
        before=current.recordset[0];
        if (!before) throw new RelativeError('Không tìm thấy liên kết.','NOT_FOUND',404);
        if (before.ThuHoiLuc || !Buffer.from(before.PhienBan).equals(value.version))
          throw new RelativeError('Liên kết đã thay đổi hoặc đã thu hồi. Vui lòng tải lại.','LINK_CONFLICT',409);
        let request=new sql.Request(transaction).input('linkId',sql.Int,linkId).input('version',sql.VarBinary(8),value.version);
        if (action==='CAP_NHAT') {
          request=bindConsent(request,value);
          row=(await request.query(`UPDATE dbo.NguoiCaoTuoi_NguoiThan SET MoiQuanHe=@relationship,
            NguoiDongY=@consenter,TuCachDongY=@capacity,ThoiDiemDongY=@consentedAt,CanCuDongY=@basis,
            XemBenhNen=@history,XemDiUng=@allergies,XemKetQuaKham=@results,CapNhatLuc=SYSUTCDATETIME()
            OUTPUT INSERTED.* WHERE LienKetID=@linkId AND PhienBan=@version AND ThuHoiLuc IS NULL`)).recordset[0];
        } else {
          row=(await request.input('actorId',sql.Int,actorId).input('reason',sql.NVarChar(500),value.reason)
            .query(`UPDATE dbo.NguoiCaoTuoi_NguoiThan SET ThuHoiLuc=SYSUTCDATETIME(),NguoiThuHoiID=@actorId,
              LyDoThuHoi=@reason,CapNhatLuc=SYSUTCDATETIME() OUTPUT INSERTED.*
              WHERE LienKetID=@linkId AND PhienBan=@version AND ThuHoiLuc IS NULL`)).recordset[0];
        }
        if (!row) throw new RelativeError('Liên kết đã thay đổi. Vui lòng tải lại.','LINK_CONFLICT',409);
      }
      await audit(transaction,row,before,actorId,action,value.reason || 'Cấp quyền theo sự đồng ý đã ghi nhận.');
      await transaction.commit(); begun=false;
    } catch (error) {
      if (begun) await transaction.rollback().catch(()=>{});
      if ([2601,2627,1205].includes(error.number)) throw new RelativeError('Liên kết bị trùng hoặc đang được cập nhật. Vui lòng tải lại.','LINK_CONFLICT',409);
      throw error;
    }
    // A committed revocation stays successful even if a socket is offline.
    try { await onAccessChanged(row.NguoiThanUserID, {nguoiCaoTuoiId:row.NguoiCaoTuoiID,
      lienKetId:row.LienKetID,action,version:versionOf(row)}); } catch (_) { /* reads always recheck SQL */ }
    return adminLink(row);
  };
  return {
    grant: (actorId,body)=>mutate(actorId,'CAP',body),
    update: (actorId,linkId,body)=>mutate(actorId,'CAP_NHAT',body,linkId),
    revoke: (actorId,linkId,body)=>mutate(actorId,'THU_HOI',body,linkId),
    async list(actorId, query={}) {
      keys(query,['nguoiCaoTuoiId','nguoiThanUserId','includeRevoked','limit','offset']);
      if (query.includeRevoked!=null && !['true','false'].includes(query.includeRevoked)) throw new RelativeError('Bộ lọc trạng thái không hợp lệ.');
      const {readOptions}=require('../utils/relativeValidation');
      const options=readOptions({limit:query.limit,offset:query.offset});
      await requireRelativeSchema(pool); await assertAdmin(pool,actorId);
      const request=pool.request().input('elderlyId',sql.Int,query.nguoiCaoTuoiId==null ? null : id(query.nguoiCaoTuoiId))
        .input('relativeId',sql.Int,query.nguoiThanUserId==null ? null : id(query.nguoiThanUserId))
        .input('revoked',sql.Bit,query.includeRevoked==='true').input('limit',sql.Int,options.limit).input('offset',sql.Int,options.offset);
      const result=await request.query(`SELECT * FROM dbo.NguoiCaoTuoi_NguoiThan
        WHERE (@elderlyId IS NULL OR NguoiCaoTuoiID=@elderlyId) AND (@relativeId IS NULL OR NguoiThanUserID=@relativeId)
          AND (@revoked=1 OR ThuHoiLuc IS NULL)
        ORDER BY LienKetID DESC OFFSET @offset ROWS FETCH NEXT @limit ROWS ONLY`);
      return result.recordset.map(adminLink);
    },
    async history(actorId,linkId,options={limit:100,offset:0}) {
      await requireRelativeSchema(pool); await assertAdmin(pool,actorId);
      return (await pool.request().input('linkId',sql.Int,id(linkId)).input('limit',sql.Int,options.limit).input('offset',sql.Int,options.offset)
        .query(`SELECT LichSuID AS id,LienKetID AS lienKetId,HanhDong AS hanhDong,NguoiThucHienID AS nguoiThucHienId,
          ThoiGian AS thoiGian,LyDo AS lyDo,DuLieuCu AS duLieuCu,DuLieuMoi AS duLieuMoi
          FROM dbo.LichSuLienKetNguoiThan WHERE LienKetID=@linkId
          ORDER BY LichSuID DESC OFFSET @offset ROWS FETCH NEXT @limit ROWS ONLY`)).recordset;
    },
    async realtimeRecipients(elderlyId) {
      await requireRelativeSchema(pool);
      return (await pool.request().input('elderlyId',sql.Int,id(elderlyId)).query(`
        SELECT DISTINCT lk.NguoiThanUserID AS userId FROM dbo.NguoiCaoTuoi_NguoiThan lk ${ACCESS_JOINS}
        WHERE lk.NguoiCaoTuoiID=@elderlyId AND lk.ThuHoiLuc IS NULL AND lk.DongYChiaSe=1
          AND lk.TaoLuc<=SYSUTCDATETIME() AND nd.TrangThai=N'HoatDong' AND vt.TenVaiTro=N'NguoiThan'
          AND EXISTS(SELECT 1 FROM dbo.PhanQuyen pq JOIN dbo.ChucNang cn ON cn.ChucNangID=pq.ChucNangID
            WHERE pq.VaiTroID=nd.VaiTroID AND cn.MaChucNang=N'QLCANHBAO' AND pq.ChoPhepXem=1)`)).recordset;
    },
  };
}
module.exports = { createRelativeAccess, ACCESS_JOINS, ACCESS_WHERE, versionOf };
