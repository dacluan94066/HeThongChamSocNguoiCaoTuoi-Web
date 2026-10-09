// Read/write smoke on the retained, explicitly synthetic database ONLY.
const assert=require('node:assert/strict'),path=require('node:path'),crypto=require('node:crypto');
const sql=require('mssql'),bcrypt=require('bcryptjs');
require('dotenv').config({path:path.resolve(__dirname,'../.env'),quiet:true});
const testDb=process.env.MOBILE_TEST_DATABASE||'CareAssistant_Test_1791560032538_c67e99';
let stage='verify_fixture';
async function main(){
 assert.match(testDb,/^CareAssistant_Test_[0-9]+_[a-f0-9]+$/);
 assert.notEqual(testDb,process.env.DB_DATABASE);
 if(process.argv.includes('--serve'))assert.ok(process.env.MOBILE_TEST_PASSWORD?.length>=8,'SET_PROCESS_ONLY_MOBILE_TEST_PASSWORD');
 process.env.DB_DATABASE=testDb;process.env.JWT_SECRET=crypto.randomBytes(32).toString('hex');process.env.AI_PROVIDER='mobile-functional-test';
 const pool=await require('../src/config/db').poolPromise;
 let server;
 try{
  const verified=await pool.request().query("SELECT HoTen,CCCD FROM HoSoNguoiCaoTuoi ORDER BY NguoiCaoTuoiID");
  assert.equal(verified.recordset.length,2);assert.deepEqual(verified.recordset.map(r=>r.CCCD),['TEST-ONLY-A','TEST-ONLY-B']);
  assert.ok(verified.recordset.every(r=>r.HoTen.startsWith('TEST ONLY')));
  stage='fixture_authentication';
  const password=process.env.MOBILE_TEST_PASSWORD||crypto.randomBytes(24).toString('base64url');
  assert.ok(password.length>=8);
  await pool.request().input('hash',sql.VarChar,await bcrypt.hash(password,10)).query("UPDATE NguoiDung SET MatKhauHash=@hash WHERE TenDangNhap IN ('test.elder.a','test.elder.b','test.caregiver')");
  stage='fixture_metadata';
  await pool.request().query(`
    IF NOT EXISTS(SELECT 1 FROM ChucNang WHERE MaChucNang='QLHOSONCT') INSERT INTO ChucNang(MaChucNang,TenChucNang) VALUES('QLHOSONCT',N'TEST PROFILE');
    INSERT INTO PhanQuyen(VaiTroID,ChucNangID,ChoPhepXem) SELECT v.VaiTroID,c.ChucNangID,1 FROM VaiTro v CROSS JOIN ChucNang c WHERE NOT EXISTS(SELECT 1 FROM PhanQuyen p WHERE p.VaiTroID=v.VaiTroID AND p.ChucNangID=c.ChucNangID);
    IF NOT EXISTS(SELECT 1 FROM LoaiChiSoSucKhoe) INSERT INTO LoaiChiSoSucKhoe(TenChiSo,DonVi) VALUES(N'Huyết áp',N'mmHg');
    IF NOT EXISTS(SELECT 1 FROM ChiSoSucKhoe) INSERT INTO ChiSoSucKhoe(NguoiCaoTuoiID,LoaiChiSoID,GiaTri,GiaTriPhu,ThoiGianDo) VALUES(1,1,120,80,DATEADD(HOUR,7,SYSUTCDATETIME()));
    IF NOT EXISTS(SELECT 1 FROM ThongBao WHERE TieuDe=N'TEST READ') INSERT INTO ThongBao(UserID,TieuDe,NoiDung) VALUES(1,N'TEST READ',N'SYNTHETIC ONLY');
    UPDATE NguoiCaoTuoi_NguoiChamSoc SET LaChinh=1 WHERE NguoiCaoTuoiID=1;
  `);
  stage='listen_test_api';
  server=require('../src/app').listen(5059,'127.0.0.1');await new Promise((resolve,reject)=>{server.once('listening',resolve);server.once('error',reject);});
  const send=async(route,token,body,method,expected=200)=>{
    stage=(method||(body?'POST':'GET'))+' '+route;
    const r=await fetch('http://127.0.0.1:5059/api'+route,{method:method||(body?'POST':'GET'),headers:{'Content-Type':'application/json',...(token?{Authorization:'Bearer '+token}:{})},...(body?{body:JSON.stringify(body)}:{}),signal:AbortSignal.timeout(20000)});
    const response=await r.json();if(!process.argv.includes('--before'))assert.equal(r.status,expected,stage);
    console.log(JSON.stringify({stage,status:r.status}));return response.data;
  };
  const auth=async name=>(await send('/auth/login',null,{tenDangNhap:name,matKhau:password,platform:'mobile'},'POST')).token;
  const a=await auth('test.elder.a'),b=await auth('test.elder.b'),caregiver=await auth('test.caregiver');
  if(process.argv.includes('--serve')){
    assert.ok(process.env.MOBILE_TEST_PASSWORD,'SET_PROCESS_ONLY_MOBILE_TEST_PASSWORD');
    console.log('MOBILE_TEST_SERVER: 127.0.0.1:5059; synthetic database only; Ctrl+C to stop');
    await new Promise(resolve=>{process.once('SIGINT',resolve);process.once('SIGTERM',resolve);});return;
  }
  await send('/elderly/me',a);await send('/elderly/me/health-metrics',a);
  const meds=await send('/elderly/me/medication-schedule',a);await send('/appointments',a);
  const notices=await send('/notifications/me',a);
  const caregivers=await send('/elderly/me/caregivers',a);
  assert.ok(caregivers.some(row=>row.laChinh===true||row.laChinh===1));
  const careSource=(await pool.request().query('SELECT NguoiChamSocID AS id,LaChinh AS main FROM NguoiCaoTuoi_NguoiChamSoc WHERE NguoiCaoTuoiID=1')).recordset;
  assert.ok(caregivers.every(row=>careSource.some(source=>source.id===row.id&&source.main===row.laChinh)));
  const list=await send('/caregivers/me/elderly',caregiver);
  if(!process.argv.includes('--before'))assert.equal(list.length,2);
  for(const id of [1,2])for(const part of ['','/medication-schedule','/health-metrics','/appointments/upcoming','/alerts']){
    const data=await send('/elderly/'+id+part,caregiver);
    if(!process.argv.includes('--before')&&part)assert.ok(data.every(row=>row.nguoiCaoTuoiId===id));
  }
  await send('/elderly/me/alerts',a);await send('/emergency-alerts',a);
  if(process.argv.includes('--before'))return;
  await send('/elderly/me/appointments',caregiver,null,'GET',404);
  for(const suffix of ['/medication-schedule','/health-metrics','/appointments/upcoming','/alerts'])await send('/elderly/2'+suffix,a,null,'GET',403);
  const upcoming=await send('/elderly/me/appointments/upcoming',a);
  const actualUpcoming=(await pool.request().query("SELECT TOP 1 LichKhamID AS id,CONVERT(VARCHAR(19),ThoiGianKham,126) AS at FROM LichKhamBenh WHERE NguoiCaoTuoiID=1 AND TrangThai=N'ChuaDen' AND ThoiGianKham>=DATEADD(HOUR,7,SYSUTCDATETIME()) ORDER BY ThoiGianKham,LichKhamID")).recordset[0];
  assert.equal(upcoming[0].id,actualUpcoming.id);assert.equal(upcoming[0].thoiGianKham,actualUpcoming.at);
  await pool.request().query("UPDATE NguoiCaoTuoi_NguoiChamSoc SET NgayKetThuc='2020-01-01' WHERE NguoiCaoTuoiID=2");
  try{await send('/elderly/2/medication-schedule',caregiver,null,'GET',403);}finally{await pool.request().query('UPDATE NguoiCaoTuoi_NguoiChamSoc SET NgayKetThuc=NULL WHERE NguoiCaoTuoiID=2');}
  const confirmed=await send('/medication-schedule/'+meds[0].id+'/confirm',a,{trangThai:'DaUong'},'PATCH');
  assert.equal(confirmed.trangThai,'DaUong');assert.ok(confirmed.thoiGianThucTe);
  assert.equal((await send('/elderly/me/medication-schedule',a)).find(r=>r.id===confirmed.id).trangThai,'DaUong');
  await send('/medication-schedule/'+meds[0].id+'/confirm',b,{trangThai:'DaUong'},'PATCH',403);
  await send('/notifications/'+notices[0].id+'/read',a,{},'PATCH');
  assert.equal((await send('/notifications/me',a)).find(r=>r.id===notices[0].id).daDoc,true);
  await send('/notifications/'+notices[0].id+'/read',b,{},'PATCH',404);
  await send('/elderly/me',a,{diaChi:'TEST ADDRESS UPDATED'},'PUT');
  assert.equal((await send('/elderly/me',a)).diaChi,'TEST ADDRESS UPDATED');
  assert.notEqual((await send('/elderly/me',b)).diaChi,'TEST ADDRESS UPDATED');
  await send('/elderly/me',a,{diaChi:'MUST NOT SAVE',email:'invalid'},'PUT',400);
  await send('/elderly/me',a,{diaChi:'MUST NOT SAVE',email:'x'.repeat(101)+'@example.invalid'},'PUT',400);
  await send('/auth/me',b,{hoTen:'TEST ONLY B',email:'test-only-b@example.invalid'},'PUT');
  await send('/elderly/me',a,{diaChi:'MUST NOT SAVE',email:'test-only-b@example.invalid'},'PUT',409);
  assert.equal((await send('/elderly/me',a)).diaChi,'TEST ADDRESS UPDATED');
  const sos=await send('/emergency-alerts',a,{noiDung:'TEST ONLY SOS - NO REAL RECIPIENT'},'POST',201);
  assert.equal(sos.nguoiCaoTuoiId,1);assert.equal(sos.soNguoiChamSocDaThongBao,1);
  const sourceSos=(await pool.request().input('id',sql.Int,sos.id).query('SELECT CONVERT(VARCHAR(19),NgayGui,126) AS at,TrangThai AS status FROM CanhBaoKhanCap WHERE CanhBaoKhanCapID=@id')).recordset[0];
  assert.equal(sos.ngayGui,sourceSos.at);assert.equal(sos.trangThai,sourceSos.status);
  assert.ok((await send('/notifications/me',caregiver)).some(r=>r.lienKetId===sos.id&&r.loaiThongBao==='KhanCap'));
  assert.ok((await send('/emergency-alerts',a)).some(r=>r.id===sos.id));
  assert.ok(!(await send('/emergency-alerts',b)).some(r=>r.id===sos.id));
  await send('/emergency-alerts',caregiver,{noiDung:'TEST'},'POST',403);
  console.log('MOBILE_API: PASS_READ_WRITE_SCOPE_SOS');
  if(process.argv.includes('--ui')){
    stage='ui';
    await pool.request().query("UPDATE LichUongThuoc SET TrangThai=N'ChuaDenGio',ThoiGianThucTe=NULL,NguoiXacNhanID=NULL WHERE LichUongThuocID=1 AND NguoiCaoTuoiID=1; UPDATE ThongBao SET DaDoc=0 WHERE UserID=1 AND TieuDe=N'TEST READ'");
    const priorSos=(await pool.request().query('SELECT COUNT(*) AS total FROM CanhBaoKhanCap WHERE NguoiCaoTuoiID=1')).recordset[0].total;
    const ui=require('./verify_care_assistant_ui');
    await ui.main({fixture:{password,user:'test.elder.a',database:testDb},flow:require('./verify_mobile_ui_flow').flow});
    const saved=await pool.request().query("SELECT TrangThai,ThoiGianThucTe FROM LichUongThuoc WHERE LichUongThuocID=1; SELECT DaDoc FROM ThongBao WHERE UserID=1 AND TieuDe=N'TEST READ'; SELECT DiaChi FROM HoSoNguoiCaoTuoi WHERE NguoiCaoTuoiID=1; SELECT COUNT(*) AS total FROM CanhBaoKhanCap WHERE NguoiCaoTuoiID=1");
    assert.equal(saved.recordsets[0][0].TrangThai,'DaUong');assert.ok(saved.recordsets[0][0].ThoiGianThucTe);
    assert.equal(saved.recordsets[1][0].DaDoc,true);assert.equal(saved.recordsets[2][0].DiaChi,'TEST UI ADDRESS');assert.equal(saved.recordsets[3][0].total,priorSos+1);
    assert.equal((await send('/elderly/me',a)).email,'test-only-a@example.invalid');
    assert.equal((await send('/auth/me',a)).email,'test-only-a@example.invalid');
    console.log('MOBILE_UI: SQL_CONFIRMED_MEDICATION_NOTIFICATION_PROFILE_SOS');
  }
 }finally{if(server){server.closeAllConnections();await new Promise(resolve=>server.close(resolve));}await pool.close();}
}
main().catch(error=>{console.log(JSON.stringify({result:'MOBILE_API_FAILED',stage,code:error.code||error.name,number:error.number||null,detail:/^(UI_|CHROME_|WEB_)/.test(error.message)?error.message:null}));process.exitCode=1;});
