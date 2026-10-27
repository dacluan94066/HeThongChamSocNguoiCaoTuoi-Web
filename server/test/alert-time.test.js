const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const time=require('../src/utils/alertTime');
const NOW=Date.parse('2026-10-27T06:32:00.000Z');
function insights(){
 const module={exports:{}};const file=path.resolve(__dirname,'../src/controllers/canhBao.controller.js');
 vm.runInNewContext(fs.readFileSync(file,'utf8'),{module,exports:module.exports,Date,console,require:name=>{
  if(name==='../utils/alertTime')return time;
  if(name==='../config/db')return {};
  if(name==='../services/alertWorkflow.service')return {endpoint:()=>()=>{}};
  return {};
 }},{filename:file});return module.exports.getSmartInsights;
}
const get=insights();
const row=stamp=>({ngayTao:stamp,ngayXuLy:null,mucDo:'KhanCap',loaiCanhBao:'KhanCap',trangThai:'ChuaXuLy'});
for(const [name,stamp,minutes,over]of[
 ['new SOS','2026-10-27T06:32:00Z',0,false],
 ['12 minutes, Vietnam offset','2026-10-27T13:20:00+07:00',12,false],
 ['12 minutes, UTC','2026-10-27T06:20:00Z',12,false],
 ['over 60 minutes','2026-10-27T05:20:00Z',72,true],
 ['floor rounding','2026-10-27T06:19:59.500Z',12,false],
])test(`fixed clock SLA: ${name}`,()=>{const value=get(row(stamp),NOW);assert.equal(value.thoiGianChoPhut,minutes);assert.equal(value.quaSla,over);assert.equal(value.loiThoiGian,null);});
test('fixed clock crosses Vietnam midnight without resetting elapsed minutes',()=>{
 const value=get(row('2026-10-26T23:55:00+07:00'),Date.parse('2026-10-27T00:07:00+07:00'));
 assert.equal(value.thoiGianChoPhut,12);
});
test('handled interval is compared as instants, preserving existing completion rule',()=>{
 const value=get({...row('2026-10-27T06:20:00Z'),ngayXuLy:'2026-10-27T13:32:00+07:00',trangThai:'DaXuLy'},NOW+86400000);
 assert.equal(value.thoiGianChoPhut,12);assert.equal(value.quaSla,false);
});
for(const input of[null,'bad','2026-02-30T13:20:00+07:00','2026-10-27T25:20:00Z','2026-10-27T13:20:00','2026-10-27T06:20:00+07:99'])
 test(`invalid/unzoned SLA input is explicit, never hidden as zero: ${input}`,()=>{
  const value=get(row(input),NOW);assert.equal(value.thoiGianChoPhut,null);assert.equal(value.loiThoiGian,'INVALID_TIMESTAMP');assert.equal(value.quaSla,false);
 });
test('a genuine UTC 13:20 is not reinterpreted as Vietnam 13:20 or silently clamped',()=>{
 const future=get(row('2026-10-27T13:20:00Z'),NOW);assert.equal(future.thoiGianChoPhut,null);assert.equal(future.loiThoiGian,'FUTURE_TIMESTAMP');
 assert.equal(get(row('2026-10-27T13:20:00Z'),Date.parse('2026-10-27T13:32:00Z')).thoiGianChoPhut,12);
});
test('invalid or reversed handling time does not become zero or NaN',()=>{
 assert.equal(get({...row('2026-10-27T06:20:00Z'),ngayXuLy:'bad'},NOW).loiThoiGian,'INVALID_TIMESTAMP');
 assert.equal(get({...row('2026-10-27T06:20:00Z'),ngayXuLy:'2026-10-27T06:19:00Z'},NOW).loiThoiGian,'REVERSED_INTERVAL');
});
test('SQL projection attaches the verified storage zone and emits UTC instead of relying on driver Date',()=>{
 const sql=time.alertTimestampSql('c.NgayTao');assert.match(sql,/AT TIME ZONE 'SE Asia Standard Time' AT TIME ZONE 'UTC'/);
 assert.doesNotMatch(sql,/DATEADD|GETDATE|UPDATE/);assert.throws(()=>time.alertTimestampSql('c.NgayTao;DROP'),TypeError);
});
