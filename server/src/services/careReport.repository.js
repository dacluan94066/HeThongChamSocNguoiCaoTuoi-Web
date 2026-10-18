const {poolPromise,sql}=require('../config/db');
const {authorizeRead,request}=require('./carePlan.repository');
const {day,addDays,occurrences,problem}=require('./careToday.service');
const {vietnamNow}=require('./careAssistant.context');
const lifestyle=require('./careLifestyle.repository');
const {totals}=require('./careLifestyle.service');
function count(rows,predicate=()=>true){return rows.filter(predicate).reduce((n,r)=>n+Number(r.count),0);}
const statuses=rows=>Object.fromEntries([...new Set(rows.map(r=>r.status))].map(s=>[s,count(rows,r=>r.status===s)]));
async function data(db,id,from,to){
 const r=await request(db).input('eid',sql.Int,id).input('start',sql.Date,from).input('end',sql.Date,to).query(`
 SELECT CONVERT(VARCHAR(10),ThoiGianDuKien,23) AS day,TrangThai AS status,COUNT(*) AS count
 FROM LichUongThuoc WHERE NguoiCaoTuoiID=@eid AND ThoiGianDuKien>=@start AND ThoiGianDuKien<DATEADD(DAY,1,@end) GROUP BY CONVERT(VARCHAR(10),ThoiGianDuKien,23),TrangThai;
 SELECT TrangThai AS status,COUNT(*) AS count FROM LichKhamBenh WHERE NguoiCaoTuoiID=@eid AND ThoiGianKham>=@start AND ThoiGianKham<DATEADD(DAY,1,@end) GROUP BY TrangThai;
 SELECT KeHoachID AS id,CONVERT(VARCHAR(10),NgayBatDau,23) AS ngayBatDau,CONVERT(VARCHAR(10),NgayKetThuc,23) AS ngayKetThuc FROM KeHoachChamSoc WHERE NguoiCaoTuoiID=@eid AND NgayBatDau<=@end AND NgayKetThuc>=@start;
 SELECT a.HoatDongID AS id,a.KeHoachID AS keHoachId,a.Ten AS ten,a.Gio AS gio,a.ThuTrongTuan AS thu,a.Loai AS loai FROM HoatDongKeHoach a JOIN KeHoachChamSoc p ON p.KeHoachID=a.KeHoachID WHERE p.NguoiCaoTuoiID=@eid AND p.NgayBatDau<=@end AND p.NgayKetThuc>=@start;
 SELECT c.HoatDongID AS hoatDongId,CONVERT(VARCHAR(10),c.Ngay,23) AS ngay FROM LanHoanThanhChamSoc c JOIN HoatDongKeHoach a ON a.HoatDongID=c.HoatDongID JOIN KeHoachChamSoc p ON p.KeHoachID=a.KeHoachID WHERE p.NguoiCaoTuoiID=@eid AND c.Ngay>=@start AND c.Ngay<=@end;
 SELECT 'alert' AS source,TrangThai AS status,COUNT(*) AS count FROM CanhBao WHERE NguoiCaoTuoiID=@eid AND (NguonBang IS NULL OR NguonBang<>N'CanhBaoKhanCap') AND NgayTao>=@start AND NgayTao<DATEADD(DAY,1,@end) GROUP BY TrangThai
 UNION ALL SELECT 'sos',TrangThai,COUNT(*) FROM CanhBaoKhanCap WHERE NguoiCaoTuoiID=@eid AND NgayGui>=@start AND NgayGui<DATEADD(DAY,1,@end) GROUP BY TrangThai;
 SELECT COUNT(*) AS count FROM ChiSoSucKhoe WHERE NguoiCaoTuoiID=@eid AND ThoiGianDo>=@start AND ThoiGianDo<DATEADD(DAY,1,@end);
 SELECT NguoiCaoTuoiID AS id,HoTen AS hoTen FROM HoSoNguoiCaoTuoi WHERE NguoiCaoTuoiID=@eid;`);
 const [meds,appointments,plans,activities,completed,alerts,measurements,profile]=r.recordsets;
 const care=occurrences(plans,activities,completed,from,to);
 const life=await lifestyle.data(db,id,from,to);
 const medication={scheduled:count(meds),confirmed:count(meds,r=>r.status==='DaUong'),byStatus:statuses(meds)};
 medication.withoutConfirmation=medication.scheduled-medication.confirmed;
 const careSummary={scheduled:care.length,completed:care.filter(r=>r.trangThai==='completed').length};
 careSummary.withoutConfirmation=careSummary.scheduled-careSummary.completed;
 const daily=[];for(let d=from;d<=to;d=addDays(d,1)){
  const saved=meds.filter(r=>r.day===d),scheduled=care.filter(r=>r.ngay===d);
  daily.push({date:d,medicationScheduled:count(saved),medicationConfirmed:count(saved,r=>r.status==='DaUong'),careScheduled:scheduled.length,careCompleted:scheduled.filter(r=>r.trangThai==='completed').length});
 }
 return {profile:profile[0],from,to,timeZone:'Asia/Ho_Chi_Minh',generatedAt:vietnamNow(),medication,appointments:{total:count(appointments),byStatus:statuses(appointments)},activities:careSummary,
  lifestyle:{records:life.length,totals:totals(life,from,to),byKind:Object.fromEntries(['meal','water','sleep','exercise','mood'].map(k=>[k,life.filter(r=>r.loai===k).length]))},
  alerts:{total:count(alerts),bySource:alerts},measurementCount:Number(measurements[0].count),daily,
  hasData:count(meds)+count(appointments)+care.length+life.length+count(alerts)+Number(measurements[0].count)>0};
}
async function read(user,id,days=7,to=vietnamNow().slice(0,10)){
 if(![7,30].includes(days))throw problem(400,'INVALID_REPORT_RANGE','Chọn báo cáo 7 hoặc 30 ngày.');
 day(to);if(to>vietnamNow().slice(0,10))throw problem(400,'FUTURE_REPORT','Báo cáo chỉ tổng hợp đến hôm nay.');
 const from=addDays(to,-days+1),tx=new sql.Transaction(await poolPromise);
 await tx.begin(sql.ISOLATION_LEVEL.SERIALIZABLE);
 try{await authorizeRead(tx,user,id);const report=await data(tx,id,from,to);await authorizeRead(tx,user,id);await tx.commit();return {...report,days};}
 catch(e){try{await tx.rollback();}catch(_){}if(e.number===1205)throw problem(409,'REPORT_CHANGED','Dữ liệu vừa cập nhật. Hãy tải lại báo cáo.');throw e;}
}
module.exports={read,data};
