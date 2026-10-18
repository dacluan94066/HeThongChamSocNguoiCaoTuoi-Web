const {normalize,vietnamNow}=require('./careAssistant.context');
const categories=new Set(['nutrition','water','exercise','rest','hygiene','monitoring']);
const problem=(status,code,message)=>Object.assign(new Error(message),{status,code});
const day=raw=>{
 if(typeof raw!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(raw))throw problem(400,'INVALID_DATE','Ngày phải có dạng YYYY-MM-DD.');
 const d=new Date(raw+'T00:00:00Z');
 if(!Number.isFinite(d.getTime())||d.toISOString().slice(0,10)!==raw)throw problem(400,'INVALID_DATE','Ngày không hợp lệ.');
 return raw;
};
const addDays=(date,n)=>new Date(new Date(day(date)+'T00:00:00Z').getTime()+n*86400000).toISOString().slice(0,10);
function validatePlan(body){
 if(!body||typeof body!=='object'||Array.isArray(body))throw problem(400,'INVALID_PLAN','Kế hoạch không hợp lệ.');
 const text=(v,max)=>typeof v==='string'&&v.trim().length>0&&v.trim().length<=max;
 if(!text(body.ten,120)||!text(body.mucTieu,500))throw problem(400,'INVALID_PLAN','Nhập tên tối đa 120 và mục tiêu tối đa 500 ký tự.');
 const start=day(body.ngayBatDau),end=day(body.ngayKetThuc);
 if(end<start||end>=addDays(start,90))throw problem(400,'INVALID_RANGE','Kế hoạch kéo dài tối đa 90 ngày.');
 if(!Array.isArray(body.hoatDong)||body.hoatDong.length<1||body.hoatDong.length>20)throw problem(400,'INVALID_ACTIVITIES','Kế hoạch có từ 1 đến 20 hoạt động.');
 const unique=new Set();
 const activities=body.hoatDong.map(a=>{
  if(!a||!categories.has(a.loai)||!text(a.ten,120)||typeof a.gio!=='string'||!/^([01]\d|2[0-3]):[0-5]\d$/.test(a.gio)||!Array.isArray(a.thu)||!a.thu.length||a.thu.length>7||a.thu.some(x=>!Number.isInteger(x)||x<1||x>7)||new Set(a.thu).size!==a.thu.length)throw problem(400,'INVALID_ACTIVITY','Loại, tên, giờ hoặc ngày lặp không hợp lệ (1=thứ hai, 7=chủ nhật).');
  const weekdays=[...a.thu].sort((a,b)=>a-b).join(',');
  const key=normalize(a.ten)+'|'+a.gio+'|'+weekdays;
  if(unique.has(key))throw problem(400,'DUPLICATE_ACTIVITY','Hoạt động trùng trong kế hoạch.');unique.add(key);
  return {loai:a.loai,ten:a.ten.trim(),gio:a.gio,thu:weekdays};
 });
 if(/(ke don|them thuoc|uong thuoc|doi lieu|tang lieu|giam lieu|ngung thuoc|dieu tri|ha huyet ap|ha duong huyet)/.test(normalize(body.ten+' '+body.mucTieu+' '+activities.map(a=>a.ten).join(' '))))throw problem(400,'MEDICAL_PLAN_NOT_ALLOWED','Chỉ lập hoạt động chăm sóc sinh hoạt; thuốc hoặc mục tiêu điều trị cần chỉ định của bác sĩ.');
 return {ten:body.ten.trim(),mucTieu:body.mucTieu.trim(),start,end,activities};
}
function occurrences(plans,activities,completions,start,end,now=new Date()){
 day(start);day(end);
 if(end<start||end>addDays(start,30))throw problem(400,'INVALID_RANGE','Khoảng tra cứu tối đa 31 ngày.');
 const local=vietnamNow(now);const result=[];
 for(let date=start;date<=end;date=addDays(date,1)){
  const weekday=(new Date(date+'T00:00:00Z').getUTCDay()+6)%7+1;
  for(const a of activities){
   const p=plans.find(p=>p.id===a.keHoachId);
   if(!p||date<p.ngayBatDau||date>p.ngayKetThuc||!a.thu.split(',').includes(String(weekday)))continue;
   const done=completions.find(c=>c.hoatDongId===a.id&&c.ngay===date);
   const at=date+'T'+a.gio+':00';
   result.push({id:`care:${a.id}:${date}`,kind:'care',hoatDongId:a.id,keHoachId:p.id,ten:a.ten,loai:a.loai,keHoachTen:p.ten,thoiGian:at,ngay:date,trangThai:done?'completed':at>local?'upcoming':'unconfirmed',nguoiXacNhanId:done?.nguoiXacNhanId??null,nguoiXacNhan:done?.nguoiXacNhan??null,thoiDiemXacNhan:done?.thoiDiem??null});
  }
 }
 return result.sort((a,b)=>a.thoiGian.localeCompare(b.thoiGian)||a.hoatDongId-b.hoatDongId);
}
function timeline(medications,appointments,care,now=new Date()){
 const local=vietnamNow(now);
 const items=[...medications.map(r=>({id:'medication:'+r.id,kind:'medication',sourceId:r.id,ten:r.tenThuoc,thoiGian:r.thoiGianDuKien,trangThai:r.trangThai==='DaUong'?'completed':r.thoiGianDuKien>local?'upcoming':'unconfirmed',sourceStatus:r.trangThai})),...appointments.filter(r=>!['Huy','DaHuy','DaDoiLich'].includes(r.trangThai)).map(r=>({id:'appointment:'+r.id,kind:'appointment',sourceId:r.id,ten:r.tenBenhVien,thoiGian:r.thoiGianKham,trangThai:r.trangThai==='DaKham'?'completed':r.thoiGianKham>local?'upcoming':'unconfirmed'})),...care].sort((a,b)=>a.thoiGian.localeCompare(b.thoiGian)||a.id.localeCompare(b.id));
 return {items,progress:{total:items.length,completed:items.filter(r=>r.trangThai==='completed').length},timeZone:'Asia/Ho_Chi_Minh'};
}
module.exports={day,addDays,validatePlan,occurrences,timeline,problem};
