const router=require('express').Router();
const auth=require('../middlewares/auth.middleware');
const {ok,fail}=require('../utils/response');
const {day,addDays,timeline,problem}=require('../services/careToday.service');
const {vietnamNow}=require('../services/careAssistant.context');
const plans=require('../services/carePlan.repository');
const {poolPromise,sql}=require('../config/db');
const {createScopedRepository}=require('../services/careAssistant.tools');
const lifestyle=require('../services/careLifestyle.repository');
const handoffs=require('../services/careHandoff.repository');
const reports=require('../services/careReport.repository');
const endpoint=fn=>async(req,res,next)=>{try{
 const id=Number(req.params.elderlyId);if(!Number.isInteger(id)||id<1||id>2147483647)throw problem(400,'INVALID_ID','Hồ sơ không hợp lệ.');
 const data=await fn(req,id);ok(res,data);
 }catch(e){if(e.status)return fail(res,e.message,e.code,e.status);if(e.number===208)return fail(res,'Chưa tải được dữ liệu chăm sóc. Hãy thử lại sau.','CARE_SCHEMA_REQUIRED',503);return fail(res,'Chưa xử lý được yêu cầu chăm sóc. Hãy tải lại và thử tiếp.','CARE_UNAVAILABLE',503);}};
router.use(auth);
router.get('/:elderlyId/today',endpoint(async(req,id)=>{
 const date=day(req.query.date||vietnamNow().slice(0,10));
 const pool=await poolPromise;const repository=createScopedRepository(pool,sql,req.user,{id});
 const care=await plans.read(req.user,id,date,date);
 const [meds,appointments]=await Promise.all([repository.read('medications',id,req.user.userId,{targetDate:date,explicitDay:true}),repository.read('todayAppointments',id,req.user.userId,{targetDate:date,explicitDay:true})]);
 const profile=(await pool.request().input('id',sql.Int,id).query('SELECT NguoiCaoTuoiID AS id,HoTen AS hoTen FROM HoSoNguoiCaoTuoi WHERE NguoiCaoTuoiID=@id')).recordset[0];
 await plans.authorizeRead(pool,req.user,id);
 return {...timeline(meds.rows,appointments.rows,care.occurrences),date,profile,canWrite:care.canWrite,truncated:meds.truncated||appointments.truncated};
}));
router.get('/:elderlyId/plans',endpoint((req,id)=>{
 const start=day(req.query.from||vietnamNow().slice(0,10)),end=day(req.query.to||addDays(start,6));
 if(end<start||end>addDays(start,30))throw problem(400,'INVALID_RANGE','Khoảng tra cứu tối đa 31 ngày.');
 return plans.read(req.user,id,start,end);
}));
router.get('/:elderlyId/lifestyle',endpoint((req,id)=>{
 const from=day(req.query.from||vietnamNow().slice(0,10)),to=day(req.query.to||from);
 return lifestyle.read(req.user,id,from,to);
}));
router.post('/:elderlyId/lifestyle',endpoint((req,id)=>lifestyle.write({user:req.user,id,body:req.body})));
router.patch('/:elderlyId/lifestyle/:recordId',endpoint((req,id)=>lifestyle.write({user:req.user,id,recordId:Number(req.params.recordId),body:req.body})));
router.delete('/:elderlyId/lifestyle/:recordId',endpoint((req,id)=>lifestyle.write({user:req.user,id,recordId:Number(req.params.recordId),body:req.body,remove:true})));
router.get('/:elderlyId/lifestyle/:recordId/history',endpoint((req,id)=>lifestyle.history(req.user,id,Number(req.params.recordId))));
router.get('/:elderlyId/handoffs',endpoint((req,id)=>{
 const to=day(req.query.to||vietnamNow().slice(0,10)),from=day(req.query.from||addDays(to,-6));
 return handoffs.read(req.user,id,from,to);
}));
router.post('/:elderlyId/handoffs',endpoint((req,id)=>handoffs.write({user:req.user,id,body:req.body})));
router.patch('/:elderlyId/handoffs/:handoffId',endpoint((req,id)=>handoffs.write({user:req.user,id,handoffId:Number(req.params.handoffId),body:req.body})));
router.post('/:elderlyId/handoffs/:handoffId/read',endpoint((req,id)=>handoffs.acknowledge(req.user,id,Number(req.params.handoffId),req.body.version)));
router.get('/:elderlyId/handoffs/:handoffId/history',endpoint((req,id)=>handoffs.history(req.user,id,Number(req.params.handoffId))));
router.get('/:elderlyId/report',endpoint((req,id)=>reports.read(req.user,id,Number(req.query.days||7),req.query.to||vietnamNow().slice(0,10))));
router.post('/:elderlyId/plans',endpoint((req,id)=>plans.create(req.user,id,req.body)));
router.post('/:elderlyId/activities/:activityId/complete',endpoint((req,id)=>{
 const activity=Number(req.params.activityId);if(!Number.isSafeInteger(activity)||activity<1)throw problem(400,'INVALID_ID','Hoạt động không hợp lệ.');
 return plans.complete(req.user,id,activity,req.body.ngay);
}));
module.exports=router;
