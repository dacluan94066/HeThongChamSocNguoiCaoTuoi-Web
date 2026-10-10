const {poolPromise,sql}=require('../config/db');
const {authorizeWrite,problem,positiveId}=require('./alertWorkflow.service');
// An optimistic version from existing fields; no schema change or migration.
const versionSql=alias=>`CONVERT(VARCHAR(64),HASHBYTES('SHA2_256',CONCAT(DATALENGTH(${alias}.HoatDong),':',${alias}.HoatDong,':',DATALENGTH(${alias}.MoTaChiTiet),':',ISNULL(${alias}.MoTaChiTiet,''),':',${alias}.TrangThai)),2)`;
async function mutate({user,id,version,title,content,remove=false}){
 if(!positiveId(id))throw problem(400,'INVALID_ID','ID không hợp lệ.');
 if(typeof version!=='string'||!/^[A-F0-9]{64}$/.test(version))throw problem(400,'VERSION_REQUIRED','Hãy tải lại nhật ký trước khi thay đổi.');
 if(!remove&&(typeof title!=='string'||!title.trim()||title.trim().length>200||typeof content!=='string'||!content.trim()||content.trim().length>1000))throw problem(400,'INVALID_NOTE','Tiêu đề từ 1–200 và nội dung từ 1–1000 ký tự.');
 const transaction=new sql.Transaction(await poolPromise);await transaction.begin(sql.ISOLATION_LEVEL.SERIALIZABLE);
 try{
  const row=(await new sql.Request(transaction).input('id',sql.Int,Number(id)).query(
   `SELECT n.NguoiCaoTuoiID AS elderlyId,n.TrangThai AS status,c.UserID AS author,${versionSql('n')} AS version
    FROM NhatKyChamSoc n WITH(UPDLOCK,HOLDLOCK) LEFT JOIN NguoiChamSoc c ON c.NguoiChamSocID=n.NguoiChamSocID WHERE n.NhatKyID=@id`)).recordset[0];
  if(!row||row.status==='HUY')throw problem(404,'NOTE_NOT_FOUND','Nhật ký không tồn tại hoặc đã xóa.');
  await authorizeWrite(transaction,user,row.elderlyId,'QLNHATKY');
  if(user.tenVaiTro!=='QuanTriVien'&&row.author!==user.userId)throw problem(403,'NOTE_AUTHOR_ONLY','Chỉ người viết nhật ký hoặc Admin được sửa/xóa.');
  if(row.version!==version)throw problem(409,'NOTE_CHANGED','Nhật ký đã thay đổi. Bản nháp được giữ; tải lại dữ liệu trước khi lưu.');
  const request=new sql.Request(transaction).input('id',sql.Int,Number(id));
  if(remove)await request.query("UPDATE NhatKyChamSoc SET TrangThai=N'HUY' WHERE NhatKyID=@id");
  else await request.input('title',sql.NVarChar(200),title.trim()).input('content',sql.NVarChar(1000),content.trim()).query(
   'UPDATE NhatKyChamSoc SET HoatDong=@title,MoTaChiTiet=@content WHERE NhatKyID=@id');
  await transaction.commit();return {id:Number(id),deleted:remove};
 }catch(error){try{await transaction.rollback();}catch(_){}throw error;}
}
const endpoint=remove=>async(req,res,next)=>{
 try{return require('../utils/response').ok(res,await mutate({user:req.user,id:req.params.id,version:req.body.version,title:req.body.tieuDe,content:req.body.noiDung,remove}),'Đã cập nhật nhật ký.');}
 catch(error){if(error.status)return require('../utils/response').fail(res,error.message,error.code,error.status);next(error);}
};
module.exports={mutate,versionSql,endpoint};
