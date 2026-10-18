const {day,addDays,problem}=require('./careToday.service');
const {vietnamNow}=require('./careAssistant.context');
const kinds=new Set(['meal','water','sleep','exercise','mood']);
const labels={meal:'Bữa ăn',water:'Uống nước',sleep:'Giấc ngủ',exercise:'Vận động',mood:'Tâm trạng'};
function wall(raw){
 if(typeof raw!=='string'||!/^\d{4}-\d{2}-\d{2}T([01]\d|2[0-3]):[0-5]\d(?::[0-5]\d)?$/.test(raw))throw problem(400,'INVALID_TIME','Nhập ngày và giờ hợp lệ theo giờ Việt Nam.');
 day(raw.slice(0,10));return raw.length===16?raw+':00':raw;
}
const instant=raw=>Date.parse(raw+'+07:00');
function validate(body,now=vietnamNow()){
 if(!body||!kinds.has(body.loai))throw problem(400,'INVALID_LIFESTYLE','Chọn loại sinh hoạt.');
 const at=wall(body.thoiGian);
 if(at>now)throw problem(400,'FUTURE_RECORD','Chỉ ghi sinh hoạt đã diễn ra.');
 const content=typeof body.noiDung==='string'?body.noiDung.trim():'';
 const notes=typeof body.ghiChu==='string'?body.ghiChu.trim():'';
 if(!content||content.length>200||notes.length>500)throw problem(400,'INVALID_CONTENT','Nội dung từ 1–200, ghi chú tối đa 500 ký tự.');
 let amount=null,end=null;
 if(['water','exercise'].includes(body.loai)){
  amount=body.luong;
  if(typeof amount!=='number'||!Number.isFinite(amount)||amount<0||amount>(body.loai==='water'?10000:1440)||Math.abs(Math.round(amount*100)-amount*100)>1e-7)throw problem(400,'INVALID_AMOUNT','Nhập lượng hợp lệ (ml nước hoặc phút vận động), tối đa 2 chữ số thập phân.');
 }
 if(body.loai==='sleep'){
  end=wall(body.ketThuc);
  if(end>now||instant(end)<=instant(at)||instant(end)-instant(at)>86400000)throw problem(400,'INVALID_SLEEP','Giờ kết thúc phải sau giờ bắt đầu, không ở tương lai và cách tối đa 24 giờ.');
 }
 return {loai:body.loai,thoiGian:at,noiDung:content,ghiChu:notes,luong:amount,ketThuc:end};
}
function range(from,to=from){
 day(from);day(to);if(to<from||to>addDays(from,30))throw problem(400,'INVALID_RANGE','Khoảng tra cứu tối đa 31 ngày.');
 return {from,to};
}
function totals(rows,from,to){
 range(from,to);const start=instant(from+'T00:00:00'),end=instant(addDays(to,1)+'T00:00:00');
 const out={mealCount:null,waterMl:null,sleepMinutes:null,exerciseMinutes:null,moodCount:null};
 for(const r of rows){
  const key={meal:'mealCount',water:'waterMl',sleep:'sleepMinutes',exercise:'exerciseMinutes',mood:'moodCount'}[r.loai];
  if(!key)continue;
  const n=r.loai==='sleep'?Math.max(0,Math.min(instant(r.ketThuc),end)-Math.max(instant(r.thoiGian),start))/60000:['water','exercise'].includes(r.loai)?Number(r.luong):1;
  out[key]=(out[key]??0)+n;
 }
 return Object.fromEntries(Object.entries(out).map(([k,v])=>[k,v==null?null:Math.round(v*100)/100]));
}
module.exports={validate,range,totals,labels,wall,instant};
