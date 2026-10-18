const {poolPromise,sql}=require('../config/db');
const {problem,validatePlan,day,occurrences}=require('./careToday.service');
const {vietnamNow}=require('./careAssistant.context');
const {authorizeWrite}=require('./alertWorkflow.service');
const request=(db)=>db instanceof sql.Transaction?new sql.Request(db):db.request();
async function authorizeRead(db,user,id){
 if(!['NguoiChamSoc','NguoiCaoTuoi'].includes(user.tenVaiTro))throw problem(403,'FORBIDDEN','Chỉ tài khoản mobile được dùng chức năng này.');
 const rows=(await request(db).input('uid',sql.Int,user.userId).input('eid',sql.Int,id).query(`SELECT n.UserID FROM NguoiDung n JOIN VaiTro v ON v.VaiTroID=n.VaiTroID
 WHERE n.UserID=@uid AND n.TrangThai=N'HoatDong' AND v.TenVaiTro=N'${user.tenVaiTro}' AND ${user.tenVaiTro==='NguoiCaoTuoi'?'EXISTS(SELECT 1 FROM HoSoNguoiCaoTuoi h WHERE h.UserID=@uid AND h.NguoiCaoTuoiID=@eid)':`EXISTS(SELECT 1 FROM NguoiChamSoc c JOIN NguoiCaoTuoi_NguoiChamSoc l ON l.NguoiChamSocID=c.NguoiChamSocID WHERE c.UserID=@uid AND c.TrangThai=N'DangLamViec' AND l.NguoiCaoTuoiID=@eid AND l.NgayBatDau<=CAST(DATEADD(HOUR,7,SYSUTCDATETIME()) AS DATE) AND (l.NgayKetThuc IS NULL OR l.NgayKetThuc>=CAST(DATEADD(HOUR,7,SYSUTCDATETIME()) AS DATE)))`}`)).recordset;
 if(!rows.length)throw problem(403,'FORBIDDEN_ELDERLY','Không còn quyền truy cập hồ sơ này.');
}
async function read(user,id,start,end){
 const pool=await poolPromise;await authorizeRead(pool,user,id);
 const result=await pool.request().input('eid',sql.Int,id).input('start',sql.Date,start).input('end',sql.Date,end).query(`
 SELECT KeHoachID AS id,Ten AS ten,MucTieu AS mucTieu,u.HoTen AS nguoiTao,CONVERT(VARCHAR(10),NgayBatDau,23) AS ngayBatDau,CONVERT(VARCHAR(10),NgayKetThuc,23) AS ngayKetThuc,NguoiTaoID AS nguoiTaoId,CONVERT(VARCHAR(19),KeHoachChamSoc.NgayTao,126) AS ngayTao FROM KeHoachChamSoc JOIN NguoiDung u ON u.UserID=KeHoachChamSoc.NguoiTaoID WHERE NguoiCaoTuoiID=@eid AND NgayBatDau<=@end AND NgayKetThuc>=@start;
 SELECT a.HoatDongID AS id,a.KeHoachID AS keHoachId,a.Loai AS loai,a.Ten AS ten,a.Gio AS gio,a.ThuTrongTuan AS thu FROM HoatDongKeHoach a JOIN KeHoachChamSoc p ON p.KeHoachID=a.KeHoachID WHERE p.NguoiCaoTuoiID=@eid AND p.NgayBatDau<=@end AND p.NgayKetThuc>=@start;
 SELECT c.HoatDongID AS hoatDongId,CONVERT(VARCHAR(10),c.Ngay,23) AS ngay,c.NguoiXacNhanID AS nguoiXacNhanId,u.HoTen AS nguoiXacNhan,CONVERT(VARCHAR(19),c.ThoiDiem,126) AS thoiDiem FROM LanHoanThanhChamSoc c JOIN NguoiDung u ON u.UserID=c.NguoiXacNhanID JOIN HoatDongKeHoach a ON a.HoatDongID=c.HoatDongID JOIN KeHoachChamSoc p ON p.KeHoachID=a.KeHoachID WHERE p.NguoiCaoTuoiID=@eid AND c.Ngay>=@start AND c.Ngay<=@end;`);
 await authorizeRead(pool,user,id);
 return {plans:result.recordsets[0].map(p=>({...p,hoatDong:result.recordsets[1].filter(a=>a.keHoachId===p.id)})),occurrences:occurrences(...result.recordsets,start,end),canWrite:user.tenVaiTro==='NguoiChamSoc'};
}
async function transaction(work){
 const tx=new sql.Transaction(await poolPromise);await tx.begin(sql.ISOLATION_LEVEL.SERIALIZABLE);
 try{const result=await work(tx);await tx.commit();return result;}catch(e){try{await tx.rollback();}catch(_){}if(e.number===1205||e.originalError?.info?.number===1205)throw problem(409,'CONCURRENT_UPDATE','Dữ liệu vừa được cập nhật ở lượt khác. Giữ bản nháp và tải lại trước khi lưu.');if([2601,2627].includes(e.number))throw problem(409,'ALREADY_COMPLETED','Lần thực hiện đã được xác nhận.');throw e;}
}
async function create(user,id,body){
 if(user.tenVaiTro!=='NguoiChamSoc')throw problem(403,'FORBIDDEN','Chỉ người chăm sóc được phân công được tạo kế hoạch.');
 const p=validatePlan(body);
 return transaction(async tx=>{
  await authorizeWrite(tx,user,id,'QLNHATKY');
  const existing=(await request(tx).input('eid',sql.Int,id).input('name',sql.NVarChar(120),p.ten).input('start',sql.Date,p.start).input('end',sql.Date,p.end).query('SELECT KeHoachID FROM KeHoachChamSoc WITH(UPDLOCK,HOLDLOCK) WHERE NguoiCaoTuoiID=@eid AND Ten=@name AND NgayBatDau<=@end AND NgayKetThuc>=@start')).recordset;
  if(existing.length)throw problem(409,'PLAN_OVERLAP','Kế hoạch cùng tên đã tồn tại trong khoảng ngày giao nhau.');
  const plan=(await request(tx).input('eid',sql.Int,id).input('name',sql.NVarChar(120),p.ten).input('goal',sql.NVarChar(500),p.mucTieu).input('start',sql.Date,p.start).input('end',sql.Date,p.end).input('uid',sql.Int,user.userId).query('INSERT INTO KeHoachChamSoc(NguoiCaoTuoiID,Ten,MucTieu,NgayBatDau,NgayKetThuc,NguoiTaoID) OUTPUT INSERTED.KeHoachID AS id VALUES(@eid,@name,@goal,@start,@end,@uid)')).recordset[0];
  for(const a of p.activities)await request(tx).input('pid',sql.Int,plan.id).input('type',sql.VarChar(20),a.loai).input('name',sql.NVarChar(120),a.ten).input('time',sql.Char(5),a.gio).input('days',sql.VarChar(13),a.thu).query('INSERT INTO HoatDongKeHoach(KeHoachID,Loai,Ten,Gio,ThuTrongTuan) VALUES(@pid,@type,@name,@time,@days)');
  return plan;
 });
}
async function complete(user,id,activityId,date){
 day(date);if(date>vietnamNow().slice(0,10))throw problem(400,'FUTURE_OCCURRENCE','Không xác nhận hoạt động của ngày tương lai.');
 if(user.tenVaiTro!=='NguoiChamSoc')throw problem(403,'FORBIDDEN','Chỉ người chăm sóc được phân công được xác nhận hoạt động.');
 return transaction(async tx=>{
  await authorizeWrite(tx,user,id,'QLNHATKY');
  const a=(await request(tx).input('aid',sql.Int,activityId).input('eid',sql.Int,id).query('SELECT a.HoatDongID AS id,a.KeHoachID AS keHoachId,a.Gio AS gio,a.ThuTrongTuan AS thu,p.KeHoachID AS planId,CONVERT(VARCHAR(10),p.NgayBatDau,23) AS ngayBatDau,CONVERT(VARCHAR(10),p.NgayKetThuc,23) AS ngayKetThuc FROM HoatDongKeHoach a WITH(UPDLOCK,HOLDLOCK) JOIN KeHoachChamSoc p ON p.KeHoachID=a.KeHoachID WHERE a.HoatDongID=@aid AND p.NguoiCaoTuoiID=@eid')).recordset[0];
  if(!a)throw problem(404,'NOT_FOUND','Không tìm thấy hoạt động của hồ sơ này.');
  if(!occurrences([{id:a.planId,ngayBatDau:a.ngayBatDau,ngayKetThuc:a.ngayKetThuc}],[a],[],date,date).length)throw problem(400,'NOT_SCHEDULED','Ngày này không có lần thực hiện trong lịch.');
  const exists=(await request(tx).input('aid',sql.Int,activityId).input('date',sql.Date,date).query('SELECT LanID FROM LanHoanThanhChamSoc WITH(UPDLOCK,HOLDLOCK) WHERE HoatDongID=@aid AND Ngay=@date')).recordset;
  if(exists.length)throw problem(409,'ALREADY_COMPLETED','Lần thực hiện đã được xác nhận; hãy tải lại.');
  await request(tx).input('aid',sql.Int,activityId).input('date',sql.Date,date).input('uid',sql.Int,user.userId).query('INSERT INTO LanHoanThanhChamSoc(HoatDongID,Ngay,NguoiXacNhanID) VALUES(@aid,@date,@uid)');
  return {hoatDongId:activityId,ngay:date,trangThai:'completed'};
 });
}
module.exports={read,create,complete,authorizeRead,transaction,request};
