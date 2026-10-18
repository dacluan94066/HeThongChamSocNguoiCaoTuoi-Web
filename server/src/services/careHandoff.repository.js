const {poolPromise,sql}=require('../config/db');
const {authorizeRead,transaction,request}=require('./carePlan.repository');
const {authorizeWrite,positiveId}=require('./alertWorkflow.service');
const {problem}=require('./careToday.service');
const {range}=require('./careLifestyle.service');
function caregiver(user){if(user.tenVaiTro!=='NguoiChamSoc')throw problem(403,'INTERNAL_CAREGIVERS_ONLY','Bàn giao nội bộ chỉ dành cho người chăm sóc đang được phân công.');}
function validate(body){
 const out={};for(const key of ['daLam','conCho','luuY']){
  if(typeof body?.[key]!=='string'||body[key].trim().length>1000)throw problem(400,'INVALID_HANDOFF','Mỗi phần bàn giao tối đa 1000 ký tự.');
  out[key]=body[key].trim();
 }
 if(!Object.values(out).some(Boolean))throw problem(400,'EMPTY_HANDOFF','Nhập ít nhất một phần bàn giao.');return out;
}
async function read(user,id,from,to){
 caregiver(user);range(from,to);const pool=await poolPromise;await authorizeRead(pool,user,id);
 const r=await pool.request().input('eid',sql.Int,id).input('start',sql.Date,from).input('end',sql.Date,to).query(`
 SELECT TOP(101) h.ID AS id,h.DaLam AS daLam,h.ConCho AS conCho,h.LuuY AS luuY,
 h.PhienBan AS version,h.NguoiTaoID AS nguoiTaoId,u.HoTen AS nguoiTao,
 CONVERT(VARCHAR(19),h.NgayTao,126) AS ngayTao,CONVERT(VARCHAR(19),h.NgaySua,126) AS ngaySua
 FROM BanGiaoChamSoc h JOIN NguoiDung u ON u.UserID=h.NguoiTaoID
 WHERE h.NguoiCaoTuoiID=@eid AND h.NgayTao>=@start AND h.NgayTao<DATEADD(DAY,1,@end) ORDER BY h.NgayTao DESC,h.ID DESC;
 SELECT d.BanGiaoID AS id,d.NguoiDocID AS nguoiDocId,u.HoTen AS nguoiDoc,d.PhienBan AS version,CONVERT(VARCHAR(19),d.ThoiDiem,126) AS thoiDiem
 FROM DocBanGiao d JOIN BanGiaoChamSoc h ON h.ID=d.BanGiaoID JOIN NguoiDung u ON u.UserID=d.NguoiDocID
 WHERE h.NguoiCaoTuoiID=@eid AND h.NgayTao>=@start AND h.NgayTao<DATEADD(DAY,1,@end);`);
 await authorizeRead(pool,user,id);
 return {rows:r.recordsets[0].slice(0,100).map(h=>({...h,canEdit:h.nguoiTaoId===user.userId,canAck:h.nguoiTaoId!==user.userId,
  hasRead:r.recordsets[1].some(a=>a.id===h.id&&a.nguoiDocId===user.userId&&a.version===h.version),
  readers:r.recordsets[1].filter(a=>a.id===h.id).map(a=>({...a,isCurrent:a.version===h.version}))})),truncated:r.recordsets[0].length>100,from,to};
}
const fields=(req,p)=>req.input('done',sql.NVarChar(1000),p.daLam).input('pending',sql.NVarChar(1000),p.conCho).input('attention',sql.NVarChar(1000),p.luuY);
async function write({user,id,handoffId,body}){
 caregiver(user);const p=validate(body),json=JSON.stringify(p);
 if(handoffId!=null&&!positiveId(handoffId))throw problem(400,'INVALID_ID','Bàn giao không hợp lệ.');
 if(handoffId==null&&(typeof body.requestId!=='string'||!/^[a-zA-Z0-9_-]{16,64}$/.test(body.requestId)))throw problem(400,'REQUEST_ID_REQUIRED','Thiếu mã chống gửi trùng.');
 if(handoffId!=null&&(!Number.isInteger(body.version)||body.version<1))throw problem(400,'VERSION_REQUIRED','Hãy tải lại phiên bản bàn giao.');
 return transaction(async tx=>{
  await authorizeWrite(tx,user,id,'QLNHATKY');let result;
  if(handoffId==null){
   const old=(await request(tx).input('uid',sql.Int,user.userId).input('key',sql.VarChar(64),body.requestId).query('SELECT ID AS id,DauVao AS payload,NguoiCaoTuoiID AS profileId FROM BanGiaoChamSoc WITH(UPDLOCK,HOLDLOCK) WHERE NguoiTaoID=@uid AND RequestID=@key')).recordset[0];
   if(old){if(old.profileId!==id||old.payload!==json)throw problem(409,'REQUEST_REUSED','Mã gửi đã dùng cho nội dung khác.');return {id:old.id,duplicate:true};}
   result=(await fields(request(tx),p).input('eid',sql.Int,id).input('uid',sql.Int,user.userId).input('key',sql.VarChar(64),body.requestId).input('json',sql.NVarChar(sql.MAX),json).query('INSERT INTO BanGiaoChamSoc(NguoiCaoTuoiID,NguoiTaoID,DaLam,ConCho,LuuY,RequestID,DauVao) OUTPUT INSERTED.ID AS id,INSERTED.PhienBan AS version VALUES(@eid,@uid,@done,@pending,@attention,@key,@json)')).recordset[0];
  }else{
   const old=(await request(tx).input('hid',sql.Int,handoffId).input('eid',sql.Int,id).query('SELECT NguoiTaoID AS author,PhienBan AS version FROM BanGiaoChamSoc WITH(UPDLOCK,HOLDLOCK) WHERE ID=@hid AND NguoiCaoTuoiID=@eid')).recordset[0];
   if(!old)throw problem(404,'NOT_FOUND','Không tìm thấy bàn giao của hồ sơ này.');
   if(old.author!==user.userId)throw problem(403,'AUTHOR_ONLY','Chỉ tác giả được sửa bàn giao.');
   if(old.version!==body.version)throw problem(409,'HANDOFF_CHANGED','Bàn giao đã thay đổi. Giữ bản nháp và tải lại trước khi lưu.');
   await fields(request(tx),p).input('hid',sql.Int,handoffId).query('UPDATE BanGiaoChamSoc SET DaLam=@done,ConCho=@pending,LuuY=@attention,PhienBan=PhienBan+1,NgaySua=DATEADD(HOUR,7,SYSUTCDATETIME()) WHERE ID=@hid');
   result={id:handoffId,version:old.version+1};
  }
  await request(tx).input('hid',sql.Int,result.id).input('v',sql.Int,result.version).input('uid',sql.Int,user.userId).input('json',sql.NVarChar(sql.MAX),json).query('INSERT INTO LichSuBanGiao(BanGiaoID,PhienBan,NguoiSuaID,DuLieu) VALUES(@hid,@v,@uid,@json)');
  return result;
 });
}
async function acknowledge(user,id,handoffId,version){
 caregiver(user);if(!positiveId(handoffId)||!Number.isInteger(version)||version<1)throw problem(400,'INVALID_ACK','Hãy tải lại bàn giao trước khi xác nhận đọc.');
 return transaction(async tx=>{
  await authorizeWrite(tx,user,id,'QLNHATKY');
  const row=(await request(tx).input('hid',sql.Int,handoffId).input('eid',sql.Int,id).query('SELECT NguoiTaoID AS author,PhienBan AS version FROM BanGiaoChamSoc WITH(UPDLOCK,HOLDLOCK) WHERE ID=@hid AND NguoiCaoTuoiID=@eid')).recordset[0];
  if(!row)throw problem(404,'NOT_FOUND','Không tìm thấy bàn giao của hồ sơ này.');
  if(row.author===user.userId)throw problem(403,'OTHER_READER_REQUIRED','Xác nhận đọc dành cho người chăm sóc khác.');
  if(row.version!==version)throw problem(409,'HANDOFF_CHANGED','Bàn giao vừa thay đổi. Hãy đọc phiên bản mới trước khi xác nhận.');
  await request(tx).input('hid',sql.Int,handoffId).input('uid',sql.Int,user.userId).input('v',sql.Int,version).query('IF NOT EXISTS(SELECT 1 FROM DocBanGiao WHERE BanGiaoID=@hid AND NguoiDocID=@uid AND PhienBan=@v) INSERT INTO DocBanGiao(BanGiaoID,NguoiDocID,PhienBan) VALUES(@hid,@uid,@v)');
  return {id:handoffId,version,read:true};
 });
}
async function history(user,id,handoffId){
 caregiver(user);if(!positiveId(handoffId))throw problem(400,'INVALID_ID','Bàn giao không hợp lệ.');
 const pool=await poolPromise;await authorizeRead(pool,user,id);
 const rows=(await pool.request().input('eid',sql.Int,id).input('hid',sql.Int,handoffId).query('SELECT h.PhienBan AS version,u.HoTen AS nguoiSua,CONVERT(VARCHAR(19),h.ThoiDiem,126) AS thoiDiem,h.DuLieu AS duLieu FROM LichSuBanGiao h JOIN BanGiaoChamSoc b ON b.ID=h.BanGiaoID JOIN NguoiDung u ON u.UserID=h.NguoiSuaID WHERE b.NguoiCaoTuoiID=@eid AND b.ID=@hid ORDER BY h.PhienBan DESC')).recordset;
 await authorizeRead(pool,user,id);return {rows:rows.map(r=>({...r,duLieu:JSON.parse(r.duLieu)}))};
}
module.exports={read,write,acknowledge,history,validate};
