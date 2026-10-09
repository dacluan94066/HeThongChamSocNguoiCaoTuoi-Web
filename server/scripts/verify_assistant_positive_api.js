// Real Express HTTP + real SQL Server in a newly created, isolated test database.
// No production writes, seed/reset, raw records, credentials or tokens in output.
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const sql=require('mssql'),bcrypt=require('bcryptjs');
require('dotenv').config({path:path.resolve(__dirname,'../.env'),quiet:true});
const {vietnamNow}=require('../src/services/careAssistant.context');
const config=database=>({server:process.env.DB_SERVER||'localhost',database,user:process.env.DB_USER,password:process.env.DB_PASSWORD,
 port:Number(process.env.DB_PORT)||1433,options:{encrypt:process.env.DB_ENCRYPT==='true',trustServerCertificate:process.env.DB_TRUST_SERVER_CERTIFICATE==='true'}});
let stage='scan',testDatabase;
const check=(condition,label)=>{assert.ok(condition,label);console.log(JSON.stringify({stage:label,result:'PASS'}));};
async function main(){
 const sourceDatabase=process.env.DB_DATABASE||'QLSucKhoeNguoiCaoTuoi';
 const source=await new sql.ConnectionPool(config(sourceDatabase)).connect();
 try{
  const scan=await source.request().query(`DECLARE @d DATE=CAST(DATEADD(HOUR,7,SYSUTCDATETIME()) AS DATE);
   SELECT n.CCCD AS cccd,
    (SELECT COUNT(*) FROM LichUongThuoc l WHERE l.NguoiCaoTuoiID=n.NguoiCaoTuoiID AND CAST(l.ThoiGianDuKien AS DATE)=@d AND DATEPART(HOUR,l.ThoiGianDuKien)>=17) AS evening,
    (SELECT COUNT(*) FROM LichUongThuoc l WHERE l.NguoiCaoTuoiID=n.NguoiCaoTuoiID AND CAST(l.ThoiGianDuKien AS DATE)=DATEADD(DAY,1,@d) AND DATEPART(HOUR,l.ThoiGianDuKien)<12) AS morning,
    (SELECT COUNT(*) FROM LichKhamBenh l WHERE l.NguoiCaoTuoiID=n.NguoiCaoTuoiID AND l.TrangThai=N'ChuaDen' AND l.ThoiGianKham>=DATEADD(HOUR,7,SYSUTCDATETIME())) AS appointments
   FROM HoSoNguoiCaoTuoi n WHERE n.CCCD IN ('079047000101','079052000102','079044000103','079056000104','079050000105')`);
  console.log(JSON.stringify({stage:'verified_seed_scan',profiles:scan.recordset.length,eligible:scan.recordset.filter(r=>r.evening&&r.morning&&r.appointments).length,
    totals:scan.recordset.reduce((a,r)=>({evening:a.evening+r.evening,morning:a.morning+r.morning,appointments:a.appointments+r.appointments}),{evening:0,morning:0,appointments:0})}));
  if(process.argv.includes('--scan-only'))return;
  assert.ok(!scan.recordset.some(r=>r.evening&&r.morning&&r.appointments),'USE_EXISTING_DEMO_INSTEAD');
 }finally{await source.close();}
 stage='create_isolated_database';
 testDatabase='CareAssistant_Test_'+Date.now()+'_'+crypto.randomBytes(3).toString('hex');
 assert.match(testDatabase,/^CareAssistant_Test_[0-9]+_[a-f0-9]+$/);assert.notEqual(testDatabase,sourceDatabase);
 const master=await new sql.ConnectionPool(config('master')).connect();
 try{await master.request().query('CREATE DATABASE ['+testDatabase+']');}finally{await master.close();}
 console.log(JSON.stringify({stage:'isolated_database',database:testDatabase}));
 const fixture=await new sql.ConnectionPool(config(testDatabase)).connect();
 let server,pool;
 try{
  stage='schema';
  // Select only DDL batches. Never execute the file's DROP/CREATE DATABASE/USE preamble.
  const schema=fs.readFileSync(path.resolve(__dirname,'../../QLSucKhoeNguoiCaoTuoi_FINAL.sql'),'utf8');
  const batches=schema.split(/^GO\s*$/mi).map(b=>b.replace(/\/\*[\s\S]*?\*\//g,'').replace(/--[^\r\n]*/g,'').trim())
    .filter(b=>/^(SET ANSI_NULLS|SET QUOTED_IDENTIFIER|CREATE TABLE|CREATE (?:UNIQUE )?INDEX)\b/i.test(b));
  assert.ok(batches.length>20);
  for(const batch of batches){assert.ok(!/\b(?:DROP|USE|ALTER DATABASE|CREATE DATABASE)\b/i.test(batch));await fixture.request().batch(batch);}
  stage='synthetic_fixture';
  const password=crypto.randomBytes(24).toString('base64url'),hash=await bcrypt.hash(password,10);
  const today=vietnamNow().slice(0,10);
  const plus=days=>new Date(Date.parse(today+'T00:00:00Z')+days*86400000).toISOString().slice(0,10);
  await fixture.request().input('hash',sql.VarChar,hash).input('today',sql.VarChar,today).query(`
    INSERT INTO VaiTro(TenVaiTro) VALUES(N'NguoiCaoTuoi'),(N'NguoiChamSoc');
    INSERT INTO NguoiDung(TenDangNhap,MatKhauHash,HoTen,VaiTroID) VALUES
      ('test.elder.a',@hash,N'TEST ONLY A',1),('test.elder.b',@hash,N'TEST ONLY B',1),('test.caregiver',@hash,N'TEST ONLY CAREGIVER',2);
    INSERT INTO HoSoNguoiCaoTuoi(UserID,HoTen,NgaySinh,GioiTinh,CCCD) VALUES
      (1,N'TEST ONLY A','1950-01-01',N'Nam','TEST-ONLY-A'),(2,N'TEST ONLY B','1951-01-01',N'Nữ','TEST-ONLY-B');
    INSERT INTO NguoiChamSoc(UserID,HoTen,SoDienThoai) VALUES(3,N'TEST ONLY CAREGIVER','0000000000');
    INSERT INTO NguoiCaoTuoi_NguoiChamSoc(NguoiCaoTuoiID,NguoiChamSocID,NgayBatDau) VALUES(1,1,DATEADD(DAY,-1,CONVERT(DATE,@today))),(2,1,DATEADD(DAY,-1,CONVERT(DATE,@today)));
    INSERT INTO DanhMucThuoc(TenThuoc,DonViTinh) VALUES(N'TEST MED A EVENING',N'Đơn vị giả lập'),(N'TEST MED A MORNING',N'Đơn vị giả lập'),(N'TEST MED B EVENING',N'Đơn vị giả lập'),(N'TEST MED B MORNING',N'Đơn vị giả lập');
    INSERT INTO DonThuoc(NguoiCaoTuoiID,NgayBatDau,NgayKetThuc) VALUES(1,CONVERT(DATE,@today),DATEADD(DAY,10,CONVERT(DATE,@today))),(2,CONVERT(DATE,@today),DATEADD(DAY,12,CONVERT(DATE,@today)));
    INSERT INTO DonThuocChiTiet(DonThuocID,ThuocID,LieuDung) VALUES(1,1,N'LIỀU GIẢ LẬP A TỐI'),(1,2,N'LIỀU GIẢ LẬP A SÁNG'),(2,3,N'LIỀU GIẢ LẬP B TỐI'),(2,4,N'LIỀU GIẢ LẬP B SÁNG');
    DECLARE @d DATETIME2=CONVERT(DATE,@today);
    INSERT INTO LichUongThuoc(DonThuocChiTietID,NguoiCaoTuoiID,ThoiGianDuKien,TrangThai,ThoiGianThucTe) VALUES
      (1,1,DATEADD(HOUR,19,@d),N'ChuaDenGio',NULL),
      (2,1,DATEADD(HOUR,8,DATEADD(DAY,1,@d)),N'ChuaDenGio',NULL),
      (1,1,DATEADD(HOUR,19,DATEADD(DAY,1,@d)),N'ChuaDenGio',NULL),
      (3,2,DATEADD(HOUR,20,@d),N'DaUong',DATEADD(MINUTE,5,DATEADD(HOUR,20,@d))),
      (4,2,DATEADD(HOUR,9,DATEADD(DAY,1,@d)),N'ChuaDenGio',NULL);
    INSERT INTO LichKhamBenh(NguoiCaoTuoiID,TenBenhVien,ThoiGianKham,TrangThai) VALUES
      (1,N'TEST CLINIC A',DATEADD(HOUR,8,DATEADD(DAY,2,@d)),N'ChuaDen'),
      (1,N'TEST CLINIC A LATER',DATEADD(HOUR,10,DATEADD(DAY,5,@d)),N'ChuaDen'),
      (1,N'TEST CLINIC CANCELLED',DATEADD(HOUR,7,DATEADD(DAY,1,@d)),N'Huy'),
      (1,N'TEST CLINIC PAST',DATEADD(HOUR,8,DATEADD(DAY,-1,@d)),N'DaKham'),
      (2,N'TEST CLINIC B',DATEADD(HOUR,9,DATEADD(DAY,3,@d)),N'ChuaDen');
  `);
  process.env.DB_DATABASE=testDatabase;
  process.env.JWT_SECRET=crypto.randomBytes(32).toString('hex'); // Separate test authentication domain.
  if(!process.argv.includes('--live-ai'))process.env.AI_PROVIDER='isolated-functional-test';
  pool=await require('../src/config/db').poolPromise;
  server=require('../src/app').listen(0,'127.0.0.1');
  await new Promise(resolve=>server.once('listening',resolve));
  const base='http://127.0.0.1:'+server.address().port+'/api';
  console.log(JSON.stringify({stage:'real_test_http',port:server.address().port,liveAI:process.argv.includes('--live-ai')}));
  const send=async(route,token,body,expected=200)=>{
    const r=await fetch(base+route,{method:body?'POST':'GET',headers:{'Content-Type':'application/json',...(token?{Authorization:'Bearer '+token}:{})},...(body?{body:JSON.stringify(body)}:{}),signal:AbortSignal.timeout(40000)});
    assert.equal(r.status,expected,'HTTP_STATUS_'+route);return(await r.json()).data;
  };
  const login=async name=>(await send('/auth/login',null,{tenDangNhap:name,matKhau:password,platform:'mobile'})).token;
  const caregivers=await login('test.caregiver'),tokens=[await login('test.elder.a'),await login('test.elder.b')];
  const states=[];
  const rows=x=>Array.isArray(x)?x:x?.items||x?.rows||[];
  const readable=date=>date.slice(8,10)+'/'+date.slice(5,7)+'/'+date.slice(0,4);
  for(const [offset,token] of tokens.entries()){
    const id=offset+1;
    const all=rows(await send('/appointments?nguoiCaoTuoiId='+id,token));
    const upcoming=all.filter(r=>r.trangThai==='CHUA_DEN').sort((a,b)=>(a.ngayKham+a.gioKham).localeCompare(b.ngayKham+b.gioKham));
    const medicationSources=[rows(await send('/elderly/me/medication-schedule?tuNgay='+today+'&denNgay='+today,token)),
      rows(await send('/elderly/me/medication-schedule?tuNgay='+plus(1)+'&denNgay='+plus(1),token))];
    for(const plain of [false,true]){
      let history=[],context;
      const ask=async(question,intent)=>{
        if(plain)question=question.normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[đĐ]/g,'d').toLowerCase();
        const reply=await send('/care-assistant/chat',token,{question,history:history.slice(-8),...(context?{conversationToken:context}:{})});
        assert.equal(reply.intent,intent);assert.equal(reply.profile.id,id);
        history.push({role:'user',content:question},{role:'assistant',content:reply.text});context=reply.conversationToken||context;
        console.log(JSON.stringify({stage:'chat',profile:id,plain,question,intent:reply.intent,mode:reply.mode,reason:reply.modeReason,error:reply.aiFailureCode||null,records:reply.rows.length}));
        return reply;
      };
      for(const [index,q] of ['Tối nay uống gì?','Còn sáng mai?'].entries()){
        stage='medication_source_comparison';
        const reply=await ask(q,'medications');
        const expected=medicationSources[index].filter(r=>index?Number(r.thoiGianDuKien.slice(11,13))<12:Number(r.thoiGianDuKien.slice(11,13))>=17);
        check(expected.length>0 && reply.rows.length===expected.length,'nonempty_medication_count');
        for(const r of reply.rows){
          const s=expected.find(s=>s.id===r.id);assert.ok(s);
          for(const field of ['tenThuoc','lieuDung','thoiGianDuKien','trangThai','thoiGianThucTe'])assert.equal(r[field],s[field],field);
          check(reply.text.includes(s.tenThuoc)&&reply.text.includes(s.lieuDung)&&reply.text.includes(s.thoiGianDuKien.slice(11,16))&&reply.text.includes(readable(s.thoiGianDuKien)),'medication_answer_matches_source');
          check(reply.text.includes(s.trangThai==='DaUong'?'Đã xác nhận uống':'Chưa có xác nhận uống'),'confirmation_status_matches');
          if(s.thoiGianThucTe)assert.ok(reply.text.includes(s.thoiGianThucTe.slice(11,16)));
        }
        assert.ok(!/cần uống|phải uống|nên uống/.test(reply.text));
      }
      stage='appointment_source_comparison';
      const transition=await ask('Tôi muốn xem lịch khám','appointments');
      check(transition.text.includes(upcoming[0].noiKham)&&!transition.text.includes('TEST MED'),'topic_switch_from_medication');
      const next=await ask('Lịch khám tiếp theo?','appointments');
      assert.ok(next.rows.length>0);
      for(const r of next.rows){
        const s=upcoming.find(s=>s.id===r.id);assert.ok(s);
        assert.equal(r.tenBenhVien,s.noiKham);assert.equal(r.thoiGianKham,s.ngayKham+'T'+s.gioKham+':00');assert.equal(r.trangThai,'ChuaDen');
      }
      check(next.text.includes(upcoming[0].noiKham)&&next.text.includes(upcoming[0].gioKham)&&next.text.includes(readable(upcoming[0].ngayKham))&&next.text.includes('Chưa đến'),'next_appointment_answer_matches_source');
      const location=await ask('Ở đâu?','appointments');
      check(location.rows.length===1&&location.rows[0].id===upcoming[0].id&&location.text.includes(upcoming[0].noiKham),'location_same_appointment');
      const days=await ask('Còn mấy ngày?','appointments');
      const expectedDays=Math.round((Date.parse(upcoming[0].ngayKham+'T00:00:00Z')-Date.parse(today+'T00:00:00Z'))/86400000);
      check(days.rows.length===1&&days.rows[0].id===upcoming[0].id&&days.rows[0].soNgayConLai===expectedDays&&days.text.includes('Còn '+expectedDays+' ngày'),'days_match_source_date');
    }
    states.push({id,token});
  }
  stage='caregiver_profile_switch';
  const answers=[];
  for(const s of states){
    const reply=await send('/care-assistant/chat',caregivers,{question:'Tối nay uống gì?',elderlyId:s.id,history:[]});
    assert.equal(reply.profile.id,s.id);check(reply.rows.length===1,'caregiver_nonempty_profile');
    assert.ok(reply.rows[0].tenThuoc.includes(s.id===1?' A ':' B '));answers.push(reply);
  }
  check(answers[0].rows[0].tenThuoc!==answers[1].rows[0].tenThuoc,'profile_switch_distinct_medications');
  await send('/care-assistant/chat',caregivers,{question:'Còn sáng mai?',elderlyId:2,history:[],conversationToken:answers[0].conversationToken},400);
  check(true,'old_profile_context_rejected');
  await send('/care-assistant/chat',states[0].token,{question:'thuốc',elderlyId:2,history:[]},403);
  check(true,'cross_profile_permission_denied');
  console.log('POSITIVE_API: ALL_SOURCE_COMPARISONS_PASS');
 }finally{
  if(server){server.closeAllConnections();await new Promise(resolve=>server.close(resolve));}
  if(pool)await pool.close();await fixture.close();
  // Keep the uniquely named synthetic DB for inspection; never DROP any database.
  if(testDatabase)console.log(JSON.stringify({stage:'test_database_retained',database:testDatabase}));
 }
}
main().catch(()=>{console.log(JSON.stringify({result:'BLOCKED_OR_FAILED',stage,database:testDatabase||null}));process.exitCode=1;});
