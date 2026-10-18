const test=require('node:test'),assert=require('node:assert/strict');
const {validate,totals}=require('../src/services/careLifestyle.service');
const base={loai:'water',thoiGian:'2026-10-10T10:00',noiDung:'Nước',ghiChu:'',luong:0};
test('lifestyle rejects invalid units, future, missing data and impossible sleep',()=>{
 assert.equal(validate(base,'2026-10-11T12:00:00').luong,0);
 assert.equal(validate({...base,luong:0.29},'2026-10-11T12:00:00').luong,0.29);
 for(const changed of [{loai:'medication'},{luong:null},{luong:-1},{luong:Infinity},{thoiGian:'2026-02-30T10:00'},{thoiGian:'2026-10-12T10:00'},{noiDung:''},{loai:'sleep',ketThuc:'2026-10-10T09:00'},{loai:'sleep',ketThuc:'2026-10-11T11:00'}])assert.throws(()=>validate({...base,...changed},'2026-10-11T12:00:00'),e=>e.status===400);
});
test('overnight sleep is clipped to days, missing quantity stays null while zero remains zero',()=>{
 const sleep={loai:'sleep',thoiGian:'2026-10-10T23:00:00',ketThuc:'2026-10-11T01:00:00'};
 assert.equal(totals([sleep],'2026-10-10','2026-10-10').sleepMinutes,60);assert.equal(totals([sleep],'2026-10-11','2026-10-11').sleepMinutes,60);assert.equal(totals([sleep],'2026-10-10','2026-10-11').sleepMinutes,120);
 assert.equal(totals([],'2026-10-10','2026-10-10').waterMl,null);assert.equal(totals([base],'2026-10-10','2026-10-10').waterMl,0);
});
