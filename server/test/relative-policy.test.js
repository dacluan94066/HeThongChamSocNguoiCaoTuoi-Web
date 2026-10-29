const test=require('node:test');
const assert=require('node:assert/strict');
const {allowedRelativeRequest,relativePermission,READ_FEATURES}=require('../src/utils/relativePolicy');
const validation=require('../src/utils/relativeValidation');
const {requireRelativeSchema}=require('../src/services/relativeSchema');
const {createRelativeReadRepository}=require('../src/services/relativeRead.repository');
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');

const proof=()=>({nguoiCaoTuoiId:1,nguoiThanUserId:2,moiQuanHe:'Con gái',dongYChiaSe:true,
  nguoiDongY:'NCT fixture',tuCachDongY:'Bản thân NCT',thoiDiemDongY:new Date(Date.now()-60000).toISOString(),
  canCuDongY:'Biên bản đồng ý fixture',phamViChiaSe:{benhNen:false,diUng:false,ketQuaKham:false}});
for(const path of ['/api/elderly/1','/api/health-metrics','/api/medication-schedule/1/confirm',
  '/api/appointments','/api/emergency-alerts','/api/notifications/me','/api/care-notes','/api/users','/api/care-assistant/chat']) {
  test(`family cannot use legacy endpoint ${path}`,()=>{
    for(const method of ['GET','POST','PUT','PATCH','DELETE']) assert.equal(allowedRelativeRequest({method,originalUrl:path}),false);
  });
}
test('family allowlist includes read API, metric type lookup, health metric creation and own-password only',()=>{
  for(const method of ['GET','HEAD']) assert.equal(allowedRelativeRequest({method,originalUrl:'/api/relatives/me/elderly/1?limit=5'}),true);
  for(const method of ['POST','PUT','PATCH','DELETE']) assert.equal(allowedRelativeRequest({method,originalUrl:'/api/relatives/links'}),false);
  assert.equal(allowedRelativeRequest({method:'GET',originalUrl:'/api/health-metric-types'}),true);
  assert.equal(allowedRelativeRequest({method:'POST',originalUrl:'/api/relatives/me/elderly/1/health-metrics'}),true);
  assert.equal(allowedRelativeRequest({method:'POST',originalUrl:'/api/auth/change-password'}),true);
  assert.equal(allowedRelativeRequest({method:'PUT',originalUrl:'/api/users/me/password'}),true);
  assert.equal(allowedRelativeRequest({method:'PUT',originalUrl:'/api/auth/me'}),false);
  assert.equal(allowedRelativeRequest({method:'POST',originalUrl:'/api/auth/change-password/other'}),false);
});
test('family permissions allow health metric entry and bounded reads only',()=>{
  for(const feature of READ_FEATURES) {
    assert.equal(relativePermission(feature,'xem'),true);
    for(const action of ['sua','xoa']) assert.equal(relativePermission(feature,action),false);
    if (feature !== 'QLCHISOSK') assert.equal(relativePermission(feature,'them'),false);
  }
  assert.equal(relativePermission('QLCHISOSK','them'),true);
  for(const feature of ['QLNGUOIDUNG','QLNGUOICHAMSOC','QLLIENHEKC','QLBAOCAO']) assert.equal(relativePermission(feature,'xem'),false);
});
test('personal-password guard preserves legacy permissions and limits relatives to their own password fields',async()=>{
  const filename=path.resolve(__dirname,'../src/middlewares/permission.middleware.js');
  let allowed=false;const module={exports:{}};
  vm.runInNewContext(fs.readFileSync(filename,'utf8'),{module,exports:module.exports,Buffer,
    require:name=>name==='../config/db' ? {sql:{Int:'Int',NVarChar:'String'},poolPromise:Promise.resolve({request:()=>({
      input(){return this;},query:async()=>({recordset:[{ChoPhepSua:allowed}]})})})}
      : name==='../utils/relativePolicy' ? require('../src/utils/relativePolicy')
        : {fail:(_res,_message,code,status)=>({code,status})},
  },{filename});
  const guard=module.exports.checkOwnPasswordPermission;
  for(const role of ['NguoiChamSoc','NguoiCaoTuoi']) {
    let next=false;const request={user:{tenVaiTro:role,vaiTroId:2}};
    assert.equal((await guard(request,{},()=>next=true)).status,403);assert.equal(next,false);
    allowed=true;await guard(request,{},()=>next=true);assert.equal(next,true);allowed=false;
  }
  let next=false;
  guard({user:{tenVaiTro:'NguoiThan'},method:'POST',body:{matKhauHienTai:'old',matKhauMoi:'new-secret'}},{},()=>next=true);
  assert.equal(next,true);
  assert.equal(guard({user:{tenVaiTro:'NguoiThan'},method:'POST',body:{matKhauHienTai:'old',matKhauMoi:'new-secret',userId:55}},{},()=>{}).status,422);
});
test('grant requires complete explicit consent and rejects invented GPS scope',()=>{
  assert.equal(validation.grant(proof()).elderlyId,1);
  for(const mutation of [v=>v.dongYChiaSe=false,v=>v.canCuDongY='',v=>v.nguoiDongY='',
    v=>v.phamViChiaSe.diUng=1,v=>delete v.phamViChiaSe.benhNen,v=>v.phamViChiaSe.gps=true,
    v=>v.thoiDiemDongY=new Date(Date.now()+86400000).toISOString(),v=>v.thoiDiemDongY='2026-02-30T10:00:00Z',
    v=>v.thoiDiemDongY='2026-01-01T10:00:00',v=>v.adminId=99]) {
    const value=proof();mutation(value);assert.throws(()=>validation.grant(value),validation.RelativeError);
  }
});
test('update and revoke require reason, optimistic version, and cannot switch identities',()=>{
  const value=proof();delete value.nguoiCaoTuoiId;delete value.nguoiThanUserId;
  value.version=Buffer.alloc(8,1).toString('base64');value.lyDo='Cập nhật đồng ý';
  assert.equal(validation.update(value).version.length,8);
  assert.throws(()=>validation.update({...value,nguoiThanUserId:3}));
  assert.throws(()=>validation.revoke({version:value.version,lyDo:''}));
  assert.throws(()=>validation.revoke({version:'invalid',lyDo:'Thu hồi'}));
});
test('IDs, pagination, field injection and calendar dates are validated',()=>{
  for(const value of [0,-1,'1 OR 1=1','1.1',2147483648]) assert.throws(()=>validation.id(value));
  for(const query of [{limit:201},{offset:-1},{tuNgay:'2026-02-30'}, {tuNgay:'2026-02-02',denNgay:'2026-01-01'},
    {nguoiCaoTuoiId:2},{gps:true}]) assert.throws(()=>validation.readOptions(query));
});
test('missing additive schema fails closed with 503 without touching legacy tables',async()=>{
  const queries=[];const pool={request:()=>({query:async q=>{queries.push(q);return {recordset:[{ready:0}]};}})};
  await assert.rejects(()=>requireRelativeSchema(pool),e=>e.status===503&&e.code==='RELATIVES_NOT_INSTALLED');
  assert.equal(queries.length,1);assert.doesNotMatch(queries[0],/INSERT|UPDATE|DELETE|CREATE|DROP/);
});
test('reads repeat SQL link and consent checks; forbidden IDs never query clinical data',async()=>{
  const queries=[];
  const pool={request:()=>({input(){return this;},query:async q=>{
    queries.push(q);return {recordset:q.includes(' AS ready') ? [{ready:1}] : []};
  }})};
  const sql={Int:'Int',VarChar:()=>'',Date:'Date'};
  const repo=createRelativeReadRepository(pool,sql);
  await assert.rejects(()=>repo.read(7,999,'health'),e=>e.status===403);
  assert.equal(queries.length,2);
  assert.match(queries[1],/lk.NguoiThanUserID=@userId/);
  assert.match(queries[1],/lk.NguoiCaoTuoiID=@elderlyId/);
  assert.match(queries[1],/lk.ThuHoiLuc IS NULL/);
  assert.doesNotMatch(queries.join('\n'),/FROM dbo.ChiSoSucKhoe/);
});
test('permission seed only installs missing defaults, preserving customized and unknown-role permissions',async()=>{
  const filename=path.resolve(__dirname,'../seed_phanquyen.js');
  const roles=['QuanTriVien','NguoiChamSoc','NguoiCaoTuoi','NguoiThan','FutureRole'];
  const features=[...READ_FEATURES,'QLNGUOIDUNG'];
  const saved=new Map([['2:1',[0,0,0,0]],['5:1',[1,1,1,1]]]);
  class Transaction {async begin(){}async commit(){}async rollback(){}}
  class Request {
    constructor(){this.values={};}input(key,_type,value){this.values[key]=value;return this;}
    async query(statement){
      assert.doesNotMatch(statement,/DELETE\s+FROM|TRUNCATE/i);
      assert.match(statement,/IF NOT EXISTS/);
      const v=this.values,key=`${v.vaiTroId}:${v.chucNangId}`;
      if(!saved.has(key)) saved.set(key,[v.xem,v.them,v.sua,v.xoa]);
      return {recordset:[]};
    }
  }
  const pool={close:async()=>{},request:()=>({query:async statement=>({recordset:statement.includes('FROM VaiTro')
    ? roles.map((TenVaiTro,i)=>({TenVaiTro,VaiTroID:i+1}))
    : features.map((MaChucNang,i)=>({MaChucNang,ChucNangID:i+1}))})})};
  for(let i=0;i<2;i++) await vm.runInNewContext(fs.readFileSync(filename,'utf8'),{
    require:name=>name==='dotenv'?{config(){}}:{poolPromise:Promise.resolve(pool),sql:{Transaction,Request,Int:'Int',Bit:'Bit'}},
    console:{log(){},error(){throw new Error('Unexpected seed failure');}},process:{},
  },{filename});
  assert.deepEqual(saved.get('2:1'),[0,0,0,0]);assert.deepEqual(saved.get('5:1'),[1,1,1,1]);
  for(let i=1;i<=READ_FEATURES.length;i++) assert.deepEqual(saved.get(`4:${i}`),[1,0,0,0]);
  assert.deepEqual(saved.get(`4:${READ_FEATURES.length+1}`),[0,0,0,0]);assert.equal(saved.size,29);
});
