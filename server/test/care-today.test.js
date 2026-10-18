const test=require('node:test'),assert=require('node:assert/strict');
const {validatePlan,occurrences,timeline,day}=require('../src/services/careToday.service');
const {answer,detectIntent}=require('../src/services/careAssistant.service');
const {createTools}=require('../src/services/careAssistant.tools');
const body={ten:'Sinh hoạt',mucTieu:'Sinh hoạt đều đặn',ngayBatDau:'2026-10-05',ngayKetThuc:'2026-10-11',hoatDong:[{loai:'water',ten:'Uống nước',gio:'09:00',thu:[1,3,5]}]};
test('plan validation bounds dates, activity count, recurrence and medical instructions',()=>{
 assert.equal(validatePlan(body).activities[0].thu,'1,3,5');
 for(const mutation of [{ngayKetThuc:'2027-10-05'},{ngayBatDau:'2026-02-30'},{hoatDong:[]},{hoatDong:[{...body.hoatDong[0],gio:'24:00'}]},{hoatDong:[{...body.hoatDong[0],thu:[1,1]}]},{hoatDong:[body.hoatDong[0],body.hoatDong[0]]},{mucTieu:'Tăng liều thuốc để điều trị'}])assert.throws(()=>validatePlan({...body,...mutation}),e=>e.status===400);
 assert.throws(()=>day('2026-2-3'));
});
test('weekly recurrence is inclusive, does not fabricate days and completion affects one occurrence',()=>{
 const p=[{id:1,ngayBatDau:body.ngayBatDau,ngayKetThuc:body.ngayKetThuc}];
 const a=[{id:4,keHoachId:1,thu:'1,3,5',gio:'09:00',ten:'Nước'}];
 const rows=occurrences(p,a,[{hoatDongId:4,ngay:'2026-10-07',nguoiXacNhanId:3,thoiDiem:'2026-10-07T10:00:00'}],'2026-10-04','2026-10-12',new Date('2026-10-07T03:00:00Z'));
 assert.deepEqual(rows.map(r=>r.ngay),['2026-10-05','2026-10-07','2026-10-09']);assert.deepEqual(rows.map(r=>r.trangThai),['unconfirmed','completed','upcoming']);assert.equal(rows[1].nguoiXacNhanId,3);
});
test('daily overlap keeps independent plans and progress uses actual confirmations',()=>{
 const p=[{id:1,ngayBatDau:'2026-10-10',ngayKetThuc:'2026-10-10'},{id:2,ngayBatDau:'2026-10-10',ngayKetThuc:'2026-10-10'}];
 const a=p.map(r=>({id:r.id,keHoachId:r.id,thu:'1,2,3,4,5,6,7',gio:'10:00'}));
 assert.equal(occurrences(p,a,[],'2026-10-10','2026-10-10').length,2);
 const t=timeline([{id:2,tenThuoc:'Test',thoiGianDuKien:'2026-10-10T08:00:00',trangThai:'ChuaDenGio'},{id:3,thoiGianDuKien:'2026-10-10T09:00:00',trangThai:'DaUong'}],[],[],new Date('2026-10-10T05:00:00Z'));
 assert.equal(t.items[0].trangThai,'unconfirmed');assert.equal(t.progress.completed,1);assert.equal(t.progress.total,2);assert.ok(t.items.every(r=>r.trangThai!=='missed'));
});
test('assistant today and week tools only read scoped data and never complete/create',async()=>{
 const calls=[];const repo={authorize:async()=>{},read:async(section)=>{calls.push(section);return {rows:section==='careActivities'||section==='weeklyCare'?[{ten:'Vệ sinh',keHoachTen:'Sinh hoạt',thoiGian:'2026-10-10T09:00:00',trangThai:'unconfirmed'}]:[],truncated:false};}};
 for(const question of ['Hôm nay cần làm gì?','viec nao chua xong','kế hoạch tuần này?','ke hoach tuan nay']){
  const r=await answer({question,profile:{id:1},user:{userId:3},repository:repo});assert.ok(r.actions.includes(detectIntent(question)==='plans'?'plans':'today'));assert.match(r.text,/Vệ sinh/);
 }
 const tools=createTools(repo,{options:{}});const result=await tools.execute('care_today','{}');assert.equal(result.carePlanAvailable,true);await tools.execute('care_plans','{}');await assert.rejects(()=>tools.execute('care_complete','{}'));assert.ok(calls.includes('weeklyCare'));
});
test('Unfinished question excludes actual confirmations across all three sources',async()=>{
 const repo={authorize:async()=>{},read:async s=>({rows:({
  medications:[{tenThuoc:'DONE MED',trangThai:'DaUong'},{tenThuoc:'WAIT MED',trangThai:'ChuaDenGio'}],
  todayAppointments:[{tenBenhVien:'DONE VISIT',trangThai:'DaKham'},{tenBenhVien:'WAIT VISIT',trangThai:'ChuaDen'}],
  careActivities:[{ten:'DONE CARE',trangThai:'completed'},{ten:'WAIT CARE',trangThai:'unconfirmed'}],
 })[s]||[],truncated:false})};
 const reply=await answer({question:'việc nào chưa xong',user:{userId:3},profile:{id:1},repository:repo});
 assert.doesNotMatch(reply.text,/DONE/);for(const label of ['WAIT MED','WAIT VISIT','WAIT CARE'])assert.ok(reply.text.includes(label));
});
