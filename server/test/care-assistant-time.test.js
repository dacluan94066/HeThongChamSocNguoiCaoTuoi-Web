const test=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm');
const fs=require('node:fs'),path=require('node:path'),{createRequire}=require('node:module');
function controller(file,recordset,inputs={}) {
  const filename=path.resolve(__dirname,'../src/controllers',file),module={exports:{}};
  const pool={request:()=>({input(name,_,value){inputs[name]=value;return this;},query:async statement=>({recordset:statement.includes('FROM HoSoNguoiCaoTuoi')?[{id:7}]:recordset})})};
  const stubs={'../config/db':{poolPromise:Promise.resolve(pool),sql:{Int:'Int',NVarChar:'String',DateTime2:'DateTime2'}},
    '../middlewares/mobile-scope.middleware':{targetElderlyId:(_,id)=>id,isMobileRole:()=>false,scopedWhere:()=>''}};
  vm.runInNewContext(fs.readFileSync(filename,'utf8'),{module,exports:module.exports,Date,console,require:id=>stubs[id]||createRequire(filename)(id)},{filename});
  return module.exports;
}
const response=()=>({body:null,status(){return this;},json(body){this.body=body;return this;}});
test('Appointment creation preserves the entered Vietnam clock when host timezone is different',async()=>{
  const previous=process.env.TZ;process.env.TZ='America/New_York';
  try {
    const inputs={},handler=controller('lichKhamBenh.controller.js',[{id:1}],inputs);
    await handler.create({body:{nguoiCaoTuoiId:7,ngayKham:'2026-10-09',gioKham:'08:30',noiKham:'CO SO GIA LAP'},user:{userId:1}},response(),error=>{throw error;});
    assert.equal(inputs.thoiGian.toISOString(),'2026-10-09T08:30:00.000Z');
  } finally {if(previous===undefined)delete process.env.TZ;else process.env.TZ=previous;}
});
test('Mobile health timestamps have no false UTC suffix that would add seven hours in Flutter',async()=>{
  const handler=controller('chiSoSucKhoe.controller.js',[{id:1,giaTri:120,giaTriPhu:80,donVi:'mmHg',thoiGianDo:new Date('2026-10-03T13:55:00Z')}]);
  const res=response();await handler.getMine({query:{},user:{userId:1}},res,error=>{throw error;});
  assert.equal(res.body.data[0].thoiGianDo,'2026-10-03T13:55:00');
});
test('Appointment source API clock matches SQL wall time rather than the process timezone',async()=>{
  const previous=process.env.TZ;process.env.TZ='America/New_York';
  try {
    const handler=controller('lichKhamBenh.controller.js',[{id:1,thoiGianKham:'2026-10-09T08:30:00',trangThai:'ChuaDen'}]);
    const res=response();await handler.getAll({query:{},user:{userId:1}},res,error=>{throw error;});
    assert.equal(res.body.data[0].gioKham,'08:30');assert.equal(res.body.data[0].ngayKham,'2026-10-09');
  } finally {if(previous===undefined)delete process.env.TZ;else process.env.TZ=previous;}
});
