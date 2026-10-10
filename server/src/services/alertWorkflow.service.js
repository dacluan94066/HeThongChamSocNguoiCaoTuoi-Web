const {poolPromise, sql}=require('../config/db');
const problem=(status,code,message)=>Object.assign(new Error(message),{status,code});
const positiveId=value=>Number.isInteger(Number(value))&&Number(value)>0&&Number(value)<=2147483647;

// Recheck identity, role, active caregiver and assignment inside the write transaction.
async function authorizeWrite(transaction,user,elderlyId,feature){
 const actor=(await new sql.Request(transaction).input('uid',sql.Int,user.userId).query(
  "SELECT v.TenVaiTro AS role FROM NguoiDung n JOIN VaiTro v ON v.VaiTroID=n.VaiTroID WHERE n.UserID=@uid AND n.TrangThai=N'HoatDong'")).recordset[0];
 if(!actor||actor.role!==user.tenVaiTro)throw problem(403,'FORBIDDEN','Tài khoản hoặc vai trò đã thay đổi.');
 if(actor.role==='QuanTriVien')return;
 if(actor.role==='NguoiChamSoc'){
  const assigned=await new sql.Request(transaction).input('uid',sql.Int,user.userId).input('eid',sql.Int,elderlyId).query(
   "SELECT TOP 1 n.NguoiChamSocID FROM NguoiChamSoc n JOIN NguoiCaoTuoi_NguoiChamSoc l ON l.NguoiChamSocID=n.NguoiChamSocID WHERE n.UserID=@uid AND n.TrangThai=N'DangLamViec' AND l.NguoiCaoTuoiID=@eid AND l.NgayBatDau<=CAST(DATEADD(HOUR,7,SYSUTCDATETIME()) AS DATE) AND (l.NgayKetThuc IS NULL OR l.NgayKetThuc>=CAST(DATEADD(HOUR,7,SYSUTCDATETIME()) AS DATE))");
  if(assigned.recordset.length)return;
 }else if(actor.role==='BacSi'&&feature==='QLCANHBAO'){
  const permission=await new sql.Request(transaction).input('uid',sql.Int,user.userId).query(
   "SELECT p.ChoPhepSua AS allowed FROM NguoiDung n JOIN PhanQuyen p ON p.VaiTroID=n.VaiTroID JOIN ChucNang c ON c.ChucNangID=p.ChucNangID WHERE n.UserID=@uid AND c.MaChucNang='QLCANHBAO'");
  if(permission.recordset.some(r=>r.allowed===true||r.allowed===1))return;
 }
 throw problem(403,'FORBIDDEN','Không có quyền thao tác với hồ sơ này.');
}
async function transition({user,alertId,emergencyId,action,note}){
 if(!positiveId(alertId??emergencyId))throw problem(400,'INVALID_ID','ID không hợp lệ.');
 if(action==='resolve'&&(typeof note!=='string'||!note.trim()||note.trim().length>500))throw problem(400,'VALIDATION_ERROR','Ghi chú xử lý phải có từ 1 đến 500 ký tự.');
 const transaction=new sql.Transaction(await poolPromise);
 await transaction.begin(sql.ISOLATION_LEVEL.SERIALIZABLE);
 try{
  // Both entrypoints lock CanhBao first, then its SOS, in the same order.
  const rows=(await new sql.Request(transaction).input('id',sql.Int,Number(alertId??emergencyId)).query(
   `SELECT CanhBaoID AS id,NguoiCaoTuoiID AS elderlyId,TrangThai AS status,NguonBang AS source,NguonID AS sourceId
    FROM CanhBao WITH(UPDLOCK,HOLDLOCK) WHERE ${alertId!=null?'CanhBaoID=@id':"NguonBang=N'CanhBaoKhanCap' AND NguonID=@id"}`)).recordset;
  if(!rows.length&&emergencyId!=null){
   const legacy=(await new sql.Request(transaction).input('id',sql.Int,Number(emergencyId)).query(
    'SELECT NguoiCaoTuoiID AS elderlyId,TrangThai AS status FROM CanhBaoKhanCap WITH(UPDLOCK,HOLDLOCK) WHERE CanhBaoKhanCapID=@id')).recordset[0];
   if(!legacy)throw problem(404,'ALERT_NOT_FOUND','Không tìm thấy SOS.');
   await authorizeWrite(transaction,user,legacy.elderlyId,'QLCANHBAO');
   if(!['DangGui','DaTiepNhan'].includes(legacy.status))throw problem(409,'INVALID_TRANSITION','SOS đã kết thúc.');
   // Legacy SOS gets its companion only during an authorized write; original ID/history stay intact.
   const created=await new sql.Request(transaction).input('sid',sql.Int,Number(emergencyId)).query(
    `INSERT INTO CanhBao(NguoiCaoTuoiID,LoaiCanhBao,NoiDung,MucDo,TrangThai,NguonBang,NguonID,NgayTao,NguoiXuLyID,NgayXuLy)
     OUTPUT INSERTED.CanhBaoID AS id,INSERTED.NguoiCaoTuoiID AS elderlyId,INSERTED.TrangThai AS status,INSERTED.NguonBang AS source,INSERTED.NguonID AS sourceId
     SELECT NguoiCaoTuoiID,N'KhanCap',COALESCE(NoiDung,N'SOS'),N'KhanCap',
       CASE TrangThai WHEN N'DangGui' THEN N'ChuaXuLy' ELSE N'DaXem' END,N'CanhBaoKhanCap',CanhBaoKhanCapID,NgayGui,NguoiXuLyID,NgayXuLy
     FROM CanhBaoKhanCap WHERE CanhBaoKhanCapID=@sid`);
   rows.push(created.recordset[0]);
  }
  if(!rows.length)throw problem(404,'ALERT_NOT_FOUND','Không tìm thấy cảnh báo liên quan.');
  const alert=rows[0];
  await authorizeWrite(transaction,user,alert.elderlyId,'QLCANHBAO');
  const linked=alert.source==='CanhBaoKhanCap';
  const expected=action==='seen'?'ChuaXuLy':'DaXem';
  const next=action==='seen'?'DaXem':'DaXuLy';
  if(linked){
   if(rows.some(r=>['DaXuLy','BoQua'].includes(r.status)))throw problem(409,'INVALID_TRANSITION','Cảnh báo đã kết thúc hoặc trạng thái cũ chưa đồng bộ. Không ghi đè lịch sử xử lý.');
   const sos=(await new sql.Request(transaction).input('sid',sql.Int,alert.sourceId).query(
    'SELECT NguoiCaoTuoiID AS elderlyId,TrangThai AS status FROM CanhBaoKhanCap WITH(UPDLOCK,HOLDLOCK) WHERE CanhBaoKhanCapID=@sid')).recordset[0];
   if(!sos||sos.elderlyId!==alert.elderlyId)throw problem(409,'INVALID_SOS_LINK','Liên kết SOS không hợp lệ.');
   const expectedSOS=action==='seen'?'DangGui':'DaTiepNhan';
   if(sos.status!==expectedSOS)throw problem(409,'INVALID_TRANSITION','SOS đã chuyển trạng thái. Hãy tải lại danh sách.');
   // SOS is authoritative; also repairs legacy drift in its linked regular alert.
   if(rows.some(r=>r.elderlyId!==sos.elderlyId))throw problem(409,'INVALID_SOS_LINK','Liên kết SOS không hợp lệ.');
   await new sql.Request(transaction).input('sid',sql.Int,alert.sourceId).input('uid',sql.Int,user.userId).input('state',sql.NVarChar(20),action==='seen'?'DaTiepNhan':'DaXuLy').query(
    'UPDATE CanhBaoKhanCap SET TrangThai=@state,NguoiXuLyID=@uid,NgayXuLy=DATEADD(HOUR,7,SYSUTCDATETIME()) WHERE CanhBaoKhanCapID=@sid');
  }else if(alert.status!==expected)throw problem(409,'INVALID_TRANSITION','Cảnh báo đã chuyển trạng thái. Hãy tải lại danh sách.');
  await new sql.Request(transaction).input('id',sql.Int,alert.id).input('sid',sql.Int,linked?alert.sourceId:null)
   .input('state',sql.NVarChar(20),next).input('uid',sql.Int,user.userId).input('note',sql.NVarChar(500),action==='resolve'?note.trim():null).query(
    `UPDATE CanhBao SET TrangThai=@state,NguoiXuLyID=@uid,NgayXuLy=DATEADD(HOUR,7,SYSUTCDATETIME()),GhiChuXuLy=CASE WHEN @state=N'DaXuLy' THEN @note ELSE GhiChuXuLy END
     WHERE ${linked?"NguonBang=N'CanhBaoKhanCap' AND NguonID=@sid":'CanhBaoID=@id'}`);
  await transaction.commit();
  return {id:emergencyId!=null?Number(emergencyId):alert.id,canhBaoId:alert.id,trangThai:linked?(action==='seen'?'DaTiepNhan':'DaXuLy'):next};
 }catch(error){try{await transaction.rollback();}catch(_){}throw error;}
}
const endpoint=options=>async(req,res,next)=>{
 try{const result=await transition({user:req.user,...options(req)});
  return require('../utils/response').ok(res,result,'Đã cập nhật trạng thái.');}
 catch(error){if(error.status)return require('../utils/response').fail(res,error.message,error.code,error.status);next(error);}
};
module.exports={transition,authorizeWrite,problem,positiveId,endpoint};
