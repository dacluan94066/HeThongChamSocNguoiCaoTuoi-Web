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
 process.env.DB_DATABASE=testDb;process.env.JWT_SECRET=crypto.randomBytes(32).toString('hex');
 if(!(process.argv.includes('--serve')&&process.argv.includes('--live-ai')))process.env.AI_PROVIDER='mobile-functional-test';
 const pool=await require('../src/config/db').poolPromise;
 let server;
 try{
  const verified=await pool.request().query("SELECT HoTen,CCCD FROM HoSoNguoiCaoTuoi ORDER BY NguoiCaoTuoiID");
  assert.equal(verified.recordset.length,2);assert.deepEqual(verified.recordset.map(r=>r.CCCD),['TEST-ONLY-A','TEST-ONLY-B']);
  assert.ok(verified.recordset.every(r=>r.HoTen.startsWith('TEST ONLY')));
  const identities=await pool.request().query('SELECT TenDangNhap FROM NguoiDung ORDER BY UserID; SELECT HoTen,SoDienThoai FROM NguoiChamSoc ORDER BY NguoiChamSocID');
  assert.deepEqual(identities.recordsets[0].map(r=>r.TenDangNhap),['test.elder.a','test.elder.b','test.caregiver']);
  assert.equal(identities.recordsets[1].length,1);assert.equal(identities.recordsets[1][0].HoTen,'TEST ONLY CAREGIVER');assert.equal(identities.recordsets[1][0].SoDienThoai,'0000000000');
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
  const host=process.argv.includes('--serve')?(process.env.MOBILE_TEST_HOST||'127.0.0.1'):'127.0.0.1';
  assert.ok(['127.0.0.1','0.0.0.0'].includes(host),'INVALID_TEST_HOST');
  server=require('../src/app').listen(5059,host);await new Promise((resolve,reject)=>{server.once('listening',resolve);server.once('error',reject);});
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
    console.log('MOBILE_TEST_SERVER: '+host+':5059; synthetic database only; Ctrl+C to stop');
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
  const writeSources=await pool.request().input('med',sql.Int,meds[0].id).input('notice',sql.Int,notices[0].id).query('SELECT TrangThai,ThoiGianThucTe FROM LichUongThuoc WHERE LichUongThuocID=@med; SELECT DaDoc FROM ThongBao WHERE ThongBaoID=@notice; SELECT DiaChi FROM HoSoNguoiCaoTuoi WHERE NguoiCaoTuoiID=1');
  assert.equal(writeSources.recordsets[0][0].TrangThai,'DaUong');assert.ok(writeSources.recordsets[0][0].ThoiGianThucTe);
  assert.equal(writeSources.recordsets[1][0].DaDoc,true);assert.equal(writeSources.recordsets[2][0].DiaChi,'TEST ADDRESS UPDATED');
  const sos=await send('/emergency-alerts',a,{noiDung:'TEST ONLY SOS - NO REAL RECIPIENT'},'POST',201);
  assert.equal(sos.nguoiCaoTuoiId,1);assert.equal(sos.soNguoiChamSocDaThongBao,1);
  const sourceSos=(await pool.request().input('id',sql.Int,sos.id).query('SELECT CONVERT(VARCHAR(19),NgayGui,126) AS at,TrangThai AS status FROM CanhBaoKhanCap WHERE CanhBaoKhanCapID=@id')).recordset[0];
  assert.equal(sos.ngayGui,sourceSos.at);assert.equal(sos.trangThai,sourceSos.status);
  const sosRecipients=(await pool.request().input('id',sql.Int,sos.id).query("SELECT UserID FROM ThongBao WHERE LienKetID=@id AND LoaiThongBao=N'KhanCap'")).recordset;
  assert.deepEqual(sosRecipients.map(r=>r.UserID),[3]);
  assert.ok((await send('/notifications/me',caregiver)).some(r=>r.lienKetId===sos.id&&r.loaiThongBao==='KhanCap'));
  assert.ok((await send('/emergency-alerts',a)).some(r=>r.id===sos.id));
  assert.ok(!(await send('/emergency-alerts',b)).some(r=>r.id===sos.id));
  await send('/emergency-alerts',caregiver,{noiDung:'TEST'},'POST',403);
  stage='journal_write_and_source';
  const priorNotes=(await pool.request().query('SELECT COUNT(*) AS total FROM NhatKyChamSoc')).recordset[0].total;
  const note=await send('/care-notes',caregiver,{nguoiCaoTuoiId:1,tieuDe:'TEST JOURNAL',noiDung:'SYNTHETIC CARE NOTE'},'POST',201);
  const noteSource=(await pool.request().input('id',sql.Int,note.id).query('SELECT NguoiCaoTuoiID AS profile,NguoiChamSocID AS caregiver,HoatDong AS title,MoTaChiTiet AS content,CONVERT(VARCHAR(19),NgayGhi,126) AS at FROM NhatKyChamSoc WHERE NhatKyID=@id')).recordset[0];
  assert.equal(noteSource.profile,1);assert.equal(noteSource.caregiver,1);assert.equal(noteSource.title,'TEST JOURNAL');assert.equal(noteSource.content,'SYNTHETIC CARE NOTE');
  const listedNote=(await send('/care-notes?nguoiCaoTuoiId=1',caregiver)).find(r=>r.id===note.id);
  assert.equal(listedNote.ngay,noteSource.at.slice(0,10));assert.equal(listedNote.thoiGian,noteSource.at.slice(11,16));
  assert.ok(!(await send('/care-notes?nguoiCaoTuoiId=2',caregiver)).some(r=>r.id===note.id));
  await send('/care-notes?nguoiCaoTuoiId=2',a,null,'GET',403);
  await send('/care-notes',a,{nguoiCaoTuoiId:1,tieuDe:'TEST',noiDung:'TEST'},'POST',403);
  for(const title of ['   ','x'.repeat(201),{unexpected:true}]) await send('/care-notes',caregiver,{nguoiCaoTuoiId:1,tieuDe:title,noiDung:'TEST'},'POST',400);
  await send('/care-notes',caregiver,{nguoiCaoTuoiId:1,tieuDe:'TEST',noiDung:'x'.repeat(1001)},'POST',400);
  assert.equal((await pool.request().query('SELECT COUNT(*) AS total FROM NhatKyChamSoc')).recordset[0].total,priorNotes+1);
  await pool.request().query("UPDATE NguoiCaoTuoi_NguoiChamSoc SET NgayKetThuc='2020-01-01' WHERE NguoiCaoTuoiID=2");
  try{await send('/care-notes?nguoiCaoTuoiId=2',caregiver,null,'GET',403);await send('/care-notes',caregiver,{nguoiCaoTuoiId:2,tieuDe:'TEST',noiDung:'TEST'},'POST',403);}finally{await pool.request().query('UPDATE NguoiCaoTuoi_NguoiChamSoc SET NgayKetThuc=NULL WHERE NguoiCaoTuoiID=2');}
  stage='regular_alert_write_and_source';
  const alert=(await pool.request().query("INSERT INTO CanhBao(NguoiCaoTuoiID,LoaiCanhBao,NoiDung) OUTPUT INSERTED.CanhBaoID AS id VALUES(1,N'Khac',N'TEST ONLY ALERT')")).recordset[0];
  await send('/alerts/'+alert.id+'/seen',a,{},'PATCH',403);
  await send('/alerts/'+alert.id+'/seen',caregiver,{},'PATCH');
  assert.equal((await pool.request().input('id',sql.Int,alert.id).query('SELECT TrangThai AS status FROM CanhBao WHERE CanhBaoID=@id')).recordset[0].status,'DaXem');
  await send('/alerts/'+alert.id+'/resolve',caregiver,{ghiChu:'x'.repeat(501)},'PATCH',400);
  await send('/alerts/'+alert.id+'/resolve',caregiver,{ghiChu:{unexpected:true}},'PATCH',400);
  await send('/alerts/'+alert.id+'/resolve',caregiver,{ghiChu:'TEST ONLY RESOLVED'},'PATCH');
  const resolved=(await pool.request().input('id',sql.Int,alert.id).query('SELECT TrangThai AS status,NguoiXuLyID AS handler,GhiChuXuLy AS note,NgayXuLy AS at FROM CanhBao WHERE CanhBaoID=@id')).recordset[0];
  assert.equal(resolved.status,'DaXuLy');assert.equal(resolved.handler,3);assert.equal(resolved.note,'TEST ONLY RESOLVED');assert.ok(resolved.at);
  await send('/alerts/'+alert.id+'/resolve',caregiver,{ghiChu:'MUST NOT OVERWRITE'},'PATCH',409);
  stage='expired_token';
  const expired=require('jsonwebtoken').sign({userId:1},process.env.JWT_SECRET,{expiresIn:-10});
  await send('/auth/me',expired,null,'GET',401);
  stage='assistant_source_followup_profile';
  const appointmentReply=await send('/care-assistant/chat',a,{question:'Lịch khám tiếp theo?',history:[]});
  assert.equal(appointmentReply.intent,'appointments');assert.equal(appointmentReply.mode,'functional');
  assert.equal(appointmentReply.rows[0].id,actualUpcoming.id);
  const followup=await send('/care-assistant/chat',a,{question:'Còn mấy ngày nữa?',history:[{role:'user',content:'Lịch khám tiếp theo?'},{role:'assistant',content:appointmentReply.text}],conversationToken:appointmentReply.conversationToken});
  assert.equal(followup.intent,'appointments');assert.equal(followup.rows[0].id,actualUpcoming.id);
  const changed=await send('/care-assistant/chat',a,{question:'Thuốc hôm nay?',history:[{role:'user',content:'Lịch khám tiếp theo?'},{role:'assistant',content:appointmentReply.text}],conversationToken:appointmentReply.conversationToken});
  assert.equal(changed.intent,'medications');assert.equal(changed.rows[0].id,meds[0].id);
  const profileOne=await send('/care-assistant/chat',caregiver,{question:'Thuốc hôm nay?',elderlyId:1,history:[]});
  const profileTwo=await send('/care-assistant/chat',caregiver,{question:'Thuốc hôm nay?',elderlyId:2,history:[]});
  assert.equal(profileOne.profile.id,1);assert.equal(profileTwo.profile.id,2);assert.notEqual(profileOne.rows[0].id,profileTwo.rows[0].id);
  await send('/care-assistant/chat',caregiver,{question:'Còn mấy ngày nữa?',elderlyId:2,history:[],conversationToken:profileOne.conversationToken},'POST',400);
  stage='journal_edit_delete';
  const stored=(await send('/care-notes?nguoiCaoTuoiId=1',caregiver)).find(r=>r.id===note.id);
  assert.equal(stored.canEdit,true);assert.match(stored.version,/^[A-F0-9]{64}$/);
  await send('/care-notes/'+note.id,a,{version:stored.version,tieuDe:'TEST',noiDung:'TEST'},'PATCH',403);
  await send('/care-notes/'+note.id,caregiver,{version:stored.version,tieuDe:'x'.repeat(201),noiDung:'TEST'},'PATCH',400);
  await send('/care-notes/'+note.id,caregiver,{version:stored.version,tieuDe:'TEST JOURNAL EDITED',noiDung:'TEST CONTENT EDITED'},'PATCH');
  await send('/care-notes/'+note.id,caregiver,{version:stored.version,tieuDe:'STALE MUST NOT SAVE',noiDung:'TEST'},'PATCH',409);
  const edited=(await send('/care-notes?nguoiCaoTuoiId=1',caregiver)).find(r=>r.id===note.id);
  const editedSource=(await pool.request().input('id',sql.Int,note.id).query('SELECT HoatDong AS title,MoTaChiTiet AS content,NguoiCaoTuoiID AS profile,NguoiChamSocID AS author FROM NhatKyChamSoc WHERE NhatKyID=@id')).recordset[0];
  assert.deepEqual(editedSource,{title:'TEST JOURNAL EDITED',content:'TEST CONTENT EDITED',profile:1,author:1});
  await pool.request().query("UPDATE NguoiCaoTuoi_NguoiChamSoc SET NgayKetThuc='2020-01-01' WHERE NguoiCaoTuoiID=1");
  try{
    await send('/care-notes/'+note.id,caregiver,{version:edited.version},'DELETE',403);
    await send('/emergency-alerts/'+sos.id+'/seen',caregiver,{},'PATCH',403);
  }finally{await pool.request().query('UPDATE NguoiCaoTuoi_NguoiChamSoc SET NgayKetThuc=NULL WHERE NguoiCaoTuoiID=1');}
  await send('/care-notes/'+note.id,caregiver,{version:stored.version},'DELETE',409);
  await send('/care-notes/'+note.id,caregiver,{version:edited.version},'DELETE');
  assert.equal((await pool.request().input('id',sql.Int,note.id).query('SELECT TrangThai AS state FROM NhatKyChamSoc WHERE NhatKyID=@id')).recordset[0].state,'HUY');
  assert.ok(!(await send('/care-notes?nguoiCaoTuoiId=1',caregiver)).some(r=>r.id===note.id));
  const notesReply=await send('/care-assistant/chat',a,{question:'Nhật ký chăm sóc?',history:[]});
  assert.ok(!notesReply.rows.some(r=>r.id===note.id));
  await send('/care-notes/'+note.id,caregiver,{version:edited.version},'DELETE',404);
  const orphan=(await pool.request().query("INSERT INTO NhatKyChamSoc(NguoiCaoTuoiID,HoatDong,MoTaChiTiet) OUTPUT INSERTED.NhatKyID AS id VALUES(1,N'TEST OTHER AUTHOR',N'TEST ONLY')")).recordset[0];
  const other=(await send('/care-notes?nguoiCaoTuoiId=1',caregiver)).find(r=>r.id===orphan.id);
  assert.equal(other.canEdit,false);
  await send('/care-notes/'+orphan.id,caregiver,{version:other.version,tieuDe:'TEST',noiDung:'TEST'},'PATCH',403);
  stage='sos_synchronized_transitions';
  await send('/emergency-alerts/'+sos.id+'/resolve',caregiver,{ghiChu:'TEST'},'PATCH',409);
  await send('/emergency-alerts/'+sos.id+'/seen',a,{},'PATCH',403);
  await send('/emergency-alerts/'+sos.id+'/seen',b,{},'PATCH',403);
  await send('/alerts/'+sos.canhBaoId+'/seen',caregiver,{},'PATCH');
  const assertSos=async(record,state,alertState)=>{
    const pair=await pool.request().input('id',sql.Int,record.id).query("SELECT TrangThai AS state,NguoiXuLyID AS actor,NgayXuLy AS at FROM CanhBaoKhanCap WHERE CanhBaoKhanCapID=@id; SELECT TrangThai AS state,NguoiXuLyID AS actor,NgayXuLy AS at FROM CanhBao WHERE NguonBang=N'CanhBaoKhanCap' AND NguonID=@id");
    assert.equal(pair.recordsets[0][0].state,state);assert.equal(pair.recordsets[1][0].state,alertState);
    assert.equal(pair.recordsets[0][0].actor,3);assert.equal(pair.recordsets[1][0].actor,3);
    assert.ok(pair.recordsets[0][0].at);assert.ok(pair.recordsets[1][0].at);
  };
  await assertSos(sos,'DaTiepNhan','DaXem');
  // SQL trigger exists only in this verified synthetic database, to prove atomic rollback.
  await pool.request().batch("CREATE TRIGGER TEST_AlertRollback ON CanhBao AFTER UPDATE AS BEGIN IF EXISTS(SELECT 1 FROM inserted WHERE GhiChuXuLy=N'TEST FORCE ROLLBACK') THROW 51001,'TEST ROLLBACK',1; END");
  try{await send('/emergency-alerts/'+sos.id+'/resolve',caregiver,{ghiChu:'TEST FORCE ROLLBACK'},'PATCH',500);await assertSos(sos,'DaTiepNhan','DaXem');}
  finally{await pool.request().query('DROP TRIGGER TEST_AlertRollback');}
  await send('/emergency-alerts/'+sos.id+'/resolve',caregiver,{ghiChu:'TEST SOS RESOLVED'},'PATCH');
  await assertSos(sos,'DaXuLy','DaXuLy');
  await send('/alerts/'+sos.canhBaoId+'/resolve',caregiver,{ghiChu:'MUST NOT OVERWRITE'},'PATCH',409);
  const racing=await send('/emergency-alerts',a,{noiDung:'TEST RACE ONLY'},'POST',201);
  const race=await Promise.all(['/emergency-alerts/'+racing.id+'/seen','/alerts/'+racing.canhBaoId+'/seen'].map(async route=>{
    const response=await fetch('http://127.0.0.1:5059/api'+route,{method:'PATCH',headers:{Authorization:'Bearer '+caregiver,'Content-Type':'application/json'},body:'{}',signal:AbortSignal.timeout(20000)});
    await response.text();return response.status;
  }));
  assert.deepEqual(race.sort(),[200,409]);await assertSos(racing,'DaTiepNhan','DaXem');
  await send('/alerts/'+racing.canhBaoId+'/resolve',caregiver,{ghiChu:'TEST VIA EXISTING ROUTE'},'PATCH');
  await assertSos(racing,'DaXuLy','DaXuLy');
  const legacySOS=(await pool.request().query("INSERT INTO CanhBaoKhanCap(NguoiCaoTuoiID,NguoiGuiID,NoiDung) OUTPUT INSERTED.CanhBaoKhanCapID AS id VALUES(1,1,N'TEST LEGACY SOS')")).recordset[0];
  const legacyView=(await send('/elderly/1/alerts',caregiver)).find(r=>r.nguonBang==='CanhBaoKhanCap'&&r.nguonId===legacySOS.id);
  assert.equal(legacyView.id,null);
  await send('/emergency-alerts/'+legacySOS.id+'/resolve',caregiver,{ghiChu:'TEST INVALID STEP'},'PATCH',409);
  await send('/emergency-alerts/'+legacySOS.id+'/seen',b,{},'PATCH',403);
  assert.equal((await pool.request().input('id',sql.Int,legacySOS.id).query("SELECT COUNT(*) AS total FROM CanhBao WHERE NguonBang=N'CanhBaoKhanCap' AND NguonID=@id")).recordset[0].total,0);
  await send('/emergency-alerts/'+legacySOS.id+'/seen',caregiver,{},'PATCH');
  await assertSos(legacySOS,'DaTiepNhan','DaXem');
  await send('/emergency-alerts/'+legacySOS.id+'/resolve',caregiver,{ghiChu:'TEST LEGACY RESOLVED'},'PATCH');
  await assertSos(legacySOS,'DaXuLy','DaXuLy');
  console.log('MOBILE_API: PASS_SQL_EDIT_SOFT_DELETE_SOS_SYNC_ROLLBACK_RACE');
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
    const uiNote=(await pool.request().query("SELECT NguoiCaoTuoiID AS profile,NguoiChamSocID AS caregiver,MoTaChiTiet AS content,TrangThai AS state FROM NhatKyChamSoc WHERE HoatDong=N'TEST UI JOURNAL EDITED' ORDER BY NhatKyID DESC")).recordset[0];
    assert.equal(uiNote.profile,1);assert.equal(uiNote.caregiver,1);assert.equal(uiNote.content,'SYNTHETIC UI EDITED');assert.equal(uiNote.state,'HUY');
    const uiSOS=(await pool.request().query('SELECT TOP 1 CanhBaoKhanCapID AS id FROM CanhBaoKhanCap WHERE NguoiCaoTuoiID=1 ORDER BY CanhBaoKhanCapID DESC')).recordset[0];
    await assertSos(uiSOS,'DaXuLy','DaXuLy');
    console.log('MOBILE_UI: SQL_CONFIRMED_EDIT_SOFT_DELETE_SOS_RESOLVE');
  }
 }finally{if(server){server.closeAllConnections();await new Promise(resolve=>server.close(resolve));}await pool.close();}
}
main().catch(error=>{console.log(JSON.stringify({result:'MOBILE_API_FAILED',stage,code:error.code||error.name,number:error.number||null,detail:/^(UI_|CHROME_|WEB_)/.test(error.message)?error.message:null}));process.exitCode=1;});
