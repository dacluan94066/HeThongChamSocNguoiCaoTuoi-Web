const {poolPromise,sql}=require('../config/db');
const {transaction,request,authorizeRead}=require('./carePlan.repository');
const {authorizeWrite,positiveId}=require('./alertWorkflow.service');
const {validate,range,totals,labels}=require('./careLifestyle.service');
const {problem}=require('./careToday.service');
const select=`SELECT n.NhatKyID AS id,s.Loai AS loai,s.Luong AS luong,CONVERT(VARCHAR(19),n.NgayGhi,126) AS thoiGian,
 CONVERT(VARCHAR(19),s.KetThuc,126) AS ketThuc,n.HoatDong AS noiDung,n.MoTaChiTiet AS ghiChu,
 s.NguoiGhiID AS nguoiGhiId,u.HoTen AS nguoiGhi,s.PhienBan AS version,s.DaXoa AS deleted
 FROM SinhHoatChamSoc s JOIN NhatKyChamSoc n ON n.NhatKyID=s.NhatKyID JOIN NguoiDung u ON u.UserID=s.NguoiGhiID`;
async function data(db,id,from,to){
 range(from,to);
 return (await request(db).input('eid',sql.Int,id).input('start',sql.Date,from).input('end',sql.Date,to).query(select+`
 WHERE n.NguoiCaoTuoiID=@eid AND s.DaXoa=0 AND n.TrangThai<>N'HUY'
 AND n.NgayGhi<DATEADD(DAY,1,@end) AND (n.NgayGhi>=@start OR (s.Loai='sleep' AND s.KetThuc>@start))
 ORDER BY n.NgayGhi DESC,n.NhatKyID DESC`)).recordset;
}
async function read(user,id,from,to){
 const pool=await poolPromise;await authorizeRead(pool,user,id);
 const rows=await data(pool,id,from,to);await authorizeRead(pool,user,id);
 return {rows:rows.map(r=>({...r,canEdit:user.tenVaiTro==='NguoiChamSoc'&&r.nguoiGhiId===user.userId})),totals:totals(rows,from,to),from,to,timeZone:'Asia/Ho_Chi_Minh',canWrite:user.tenVaiTro==='NguoiChamSoc'};
}
function writer(user){if(user.tenVaiTro!=='NguoiChamSoc')throw problem(403,'FORBIDDEN','Chỉ người chăm sóc được phân công được ghi sinh hoạt.');}
async function write({user,id,recordId,body,remove=false}){
 writer(user);
 if(recordId!=null&&!positiveId(recordId))throw problem(400,'INVALID_ID','Bản ghi không hợp lệ.');
 const payload=remove?null:validate(body);
 const json=payload&&JSON.stringify(payload);
 const key=body?.requestId;
 if(recordId==null&&(typeof key!=='string'||!/^[a-zA-Z0-9_-]{16,64}$/.test(key)))throw problem(400,'REQUEST_ID_REQUIRED','Thiếu mã chống gửi trùng.');
 if(recordId!=null&&(!Number.isInteger(body?.version)||body.version<1))throw problem(400,'VERSION_REQUIRED','Tải lại phiên bản trước khi sửa.');
 return transaction(async tx=>{
  await authorizeWrite(tx,user,id,'QLNHATKY');
  if(recordId==null){
   const previous=(await request(tx).input('uid',sql.Int,user.userId).input('key',sql.VarChar(64),key).query('SELECT s.NhatKyID AS id,s.DauVao AS payload,n.NguoiCaoTuoiID AS profileId FROM SinhHoatChamSoc s WITH(UPDLOCK,HOLDLOCK) JOIN NhatKyChamSoc n ON n.NhatKyID=s.NhatKyID WHERE s.NguoiGhiID=@uid AND s.RequestID=@key')).recordset[0];
   if(previous){if(previous.profileId!==id||previous.payload!==json)throw problem(409,'REQUEST_REUSED','Mã gửi đã dùng cho nội dung khác.');return {id:previous.id,duplicate:true};}
   const caregiver=(await request(tx).input('uid',sql.Int,user.userId).query('SELECT NguoiChamSocID AS id FROM NguoiChamSoc WHERE UserID=@uid')).recordset[0];
   const created=(await fields(request(tx),payload).input('eid',sql.Int,id).input('cid',sql.Int,caregiver.id).query(`INSERT INTO NhatKyChamSoc(NguoiCaoTuoiID,NguoiChamSocID,NgayGhi,LoaiNhatKy,HoatDong,MoTaChiTiet,TrangThai)
    OUTPUT INSERTED.NhatKyID AS id VALUES(@eid,@cid,@at,N'CHAM_SOC_HANG_NGAY',@content,@notes,N'HOAN_THANH')`)).recordset[0];
   await fields(request(tx),payload).input('rid',sql.Int,created.id).input('uid',sql.Int,user.userId).input('key',sql.VarChar(64),key).input('json',sql.NVarChar(sql.MAX),json).query('INSERT INTO SinhHoatChamSoc(NhatKyID,Loai,Luong,KetThuc,NguoiGhiID,RequestID,DauVao) VALUES(@rid,@kind,@amount,@end,@uid,@key,@json)');
   await audit(tx,created.id,1,user.userId,json);return {id:created.id,version:1};
  }
  const current=(await request(tx).input('rid',sql.Int,recordId).input('eid',sql.Int,id).query(`SELECT s.NguoiGhiID AS author,s.PhienBan AS version,s.DaXoa AS deleted FROM SinhHoatChamSoc s WITH(UPDLOCK,HOLDLOCK) JOIN NhatKyChamSoc n ON n.NhatKyID=s.NhatKyID WHERE s.NhatKyID=@rid AND n.NguoiCaoTuoiID=@eid`)).recordset[0];
  if(!current||current.deleted)throw problem(404,'NOT_FOUND','Bản ghi không tồn tại hoặc đã xóa.');
  if(current.author!==user.userId)throw problem(403,'AUTHOR_ONLY','Chỉ người ghi được sửa/xóa.');
  if(current.version!==body.version)throw problem(409,'RECORD_CHANGED','Bản ghi đã thay đổi. Giữ bản nháp và tải lại trước khi lưu.');
  const version=current.version+1;
  if(remove){
   await request(tx).input('rid',sql.Int,recordId).query("UPDATE SinhHoatChamSoc SET DaXoa=1,PhienBan=PhienBan+1 WHERE NhatKyID=@rid; UPDATE NhatKyChamSoc SET TrangThai=N'HUY' WHERE NhatKyID=@rid");
  }else{
   await fields(request(tx),payload).input('rid',sql.Int,recordId).query('UPDATE SinhHoatChamSoc SET Loai=@kind,Luong=@amount,KetThuc=@end,PhienBan=PhienBan+1 WHERE NhatKyID=@rid; UPDATE NhatKyChamSoc SET NgayGhi=@at,HoatDong=@content,MoTaChiTiet=@notes WHERE NhatKyID=@rid');
  }
  await audit(tx,recordId,version,user.userId,remove?JSON.stringify({deleted:true}):json);
  return {id:recordId,version,deleted:remove};
 });
}
function fields(req,p){return req.input('kind',sql.VarChar(12),p.loai).input('amount',sql.Decimal(10,2),p.luong).input('at',sql.VarChar(19),p.thoiGian).input('end',sql.VarChar(19),p.ketThuc).input('content',sql.NVarChar(200),p.noiDung).input('notes',sql.NVarChar(1000),p.ghiChu);}
async function audit(tx,id,version,actor,json){await request(tx).input('rid',sql.Int,id).input('version',sql.Int,version).input('uid',sql.Int,actor).input('json',sql.NVarChar(sql.MAX),json).query('INSERT INTO LichSuSinhHoat(NhatKyID,PhienBan,NguoiSuaID,DuLieu) VALUES(@rid,@version,@uid,@json)');}
async function history(user,id,recordId){
 if(!positiveId(recordId))throw problem(400,'INVALID_ID','Bản ghi không hợp lệ.');
 const pool=await poolPromise;await authorizeRead(pool,user,id);
 const rows=(await pool.request().input('eid',sql.Int,id).input('rid',sql.Int,recordId).query(`SELECT h.PhienBan AS version,u.HoTen AS nguoiSua,CONVERT(VARCHAR(19),h.ThoiDiem,126) AS thoiDiem,h.DuLieu AS duLieu FROM LichSuSinhHoat h JOIN NhatKyChamSoc n ON n.NhatKyID=h.NhatKyID JOIN NguoiDung u ON u.UserID=h.NguoiSuaID WHERE n.NguoiCaoTuoiID=@eid AND h.NhatKyID=@rid ORDER BY h.PhienBan DESC`)).recordset;
 await authorizeRead(pool,user,id);return {rows:rows.map(r=>({...r,duLieu:JSON.parse(r.duLieu)}))};
}
module.exports={read,write,history,data};
