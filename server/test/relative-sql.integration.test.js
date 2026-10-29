// Opt-in ONLY. Creates a new disposable database; never USEs/migrates the configured application database.
// The fixture database is retained for review. No DROP/DELETE cleanup is performed.
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const http=require('node:http');
const {createRequire}=require('node:module');
const {randomBytes}=require('node:crypto');

test('isolated SQL Server: relatives schema, access, consent, audit, revocation, and legacy regression',
  {skip:process.env.CARESENIOR_RELATIVES_SQL_TEST!=='1',timeout:120000},async(t)=>{
  const sql=require('mssql'),bcrypt=require('bcryptjs'),jwt=require('jsonwebtoken');
  const {io:clientSocket}=require('socket.io-client');
  require('dotenv').config({path:path.resolve(__dirname,'../.env'),quiet:true});
  const configuredDatabase=process.env.DB_DATABASE || 'QLSucKhoeNguoiCaoTuoi';
  const database=`CareSeniorRelativesTest_${Date.now()}_${randomBytes(4).toString('hex')}`;
  assert.match(database,/^CareSeniorRelativesTest_\d+_[a-f0-9]{8}$/);
  assert.notEqual(database.toLowerCase(),configuredDatabase.toLowerCase());
  const config={server:process.env.DB_SERVER || 'localhost',user:process.env.DB_USER,password:process.env.DB_PASSWORD,
    port:Number(process.env.DB_PORT)||1433,connectionTimeout:12000,requestTimeout:20000,
    options:{encrypt:process.env.DB_ENCRYPT==='true',trustServerCertificate:process.env.DB_TRUST_SERVER_CERTIFICATE==='true'}};
  let master,pool,server,io;
  const sockets=[];
  const previousSecret=process.env.JWT_SECRET;process.env.JWT_SECRET='relative-isolated-tests-only';
  const sourceRoot=path.resolve(__dirname,'../src');
  const modules=new Map();
  function load(filename) {
    filename=path.resolve(filename);
    if (!filename.endsWith('.js')) filename+='.js';
    if (modules.has(filename)) return modules.get(filename).exports;
    if (filename===path.join(sourceRoot,'config/db.js')) return {sql,poolPromise:Promise.resolve(pool)};
    if (filename===path.join(sourceRoot,'config/mailer.js')) return {sendMail:async()=>{throw new Error('External email forbidden in SQL fixture');}};
    assert.ok(filename.startsWith(sourceRoot+path.sep),'Fixture loader cannot import arbitrary application code');
    const module={exports:{}};modules.set(filename,module);
    const realRequire=createRequire(filename);
    vm.runInThisContext(`(function(require,module,exports,__filename,__dirname){${fs.readFileSync(filename,'utf8')}\n})`,{filename})(
      name=>name.startsWith('.') ? load(path.resolve(path.dirname(filename),name)) : realRequire(name),
      module,module.exports,filename,path.dirname(filename));
    return module.exports;
  }
  const runBatches=async(source)=>{
    const withoutComments=source.replace(/\/\*[\s\S]*?\*\//g,'').replace(/--[^\r\n]*/g,'');
    assert.doesNotMatch(withoutComments,/\b(?:DROP\s|TRUNCATE\s|DELETE\s+FROM\b|USE\s)/i);
    for(const batch of source.split(/^\s*GO\s*$/mi).filter(s=>s.trim())) await pool.request().batch(batch);
  };
  const query=(statement,values={})=>{
    assert.equal(pool.config.database,database,'Every fixture write must target the isolated DB');
    const req=pool.request();for(const [key,value] of Object.entries(values)) req.input(key,value);
    return req.query(statement);
  };
  const call=async(method,url,token,body)=>{
    const response=await fetch(`http://127.0.0.1:${server.address().port}/api${url}`,{
      method,headers:{...(token?{Authorization:`Bearer ${token}`} : {}),'Content-Type':'application/json'},
      ...(body==null?{}:{body:JSON.stringify(body)})});
    return {status:response.status,...await response.json(),cache:response.headers.get('cache-control')};
  };
  const must=async(method,url,token,body,status=200)=>{
    const result=await call(method,url,token,body);assert.equal(result.status,status,`${method} ${url}: ${JSON.stringify(result)}`);return result.data;
  };
  try {
    master=await new sql.ConnectionPool({...config,database:'master'}).connect();
    // Name is generated internally and validated above, never supplied by .env or user input.
    await master.request().batch(`CREATE DATABASE [${database}]`);
    pool=await new sql.ConnectionPool({...config,database}).connect();
    console.log(`[RELATIVE SQL FIXTURE] ${database} (retained, synthetic data only)`);
    const final=fs.readFileSync(path.resolve(__dirname,'../../QLSucKhoeNguoiCaoTuoi_FINAL.sql'),'utf8');
    const patch=fs.readFileSync(path.resolve(__dirname,'../database/patch_nguoi_than.sql'),'utf8');
    const marker='-- RELATIVES_PATCH_BEGIN';assert.ok(final.includes(marker));
    const embedded=final.split(marker)[1].split('-- RELATIVES_PATCH_END')[0].trim().replace(/\s*GO\s*$/i,'').trim();
    assert.equal(embedded,patch.trim(),'FINAL and manual patch must install exactly the same schema');
    await runBatches(final.slice(final.indexOf('CREATE TABLE VaiTro ('),final.indexOf(marker)));
    const roles=(await query('SELECT VaiTroID,TenVaiTro FROM dbo.VaiTro')).recordset;
    const roleId=name=>roles.find(r=>r.TenVaiTro===name).VaiTroID;
    const hash=await bcrypt.hash('fixture-password',4);
    const account=async(name,role)=> (await query(`INSERT INTO dbo.NguoiDung(TenDangNhap,MatKhauHash,HoTen,Email,VaiTroID)
      OUTPUT INSERTED.UserID AS id VALUES(@name,@hash,@name,@email,@role)`,{name,hash,email:`${name}@fixture.invalid`,role})).recordset[0].id;
    const admin=await account('fixture.admin',roleId('QuanTriVien'));
    const eUser=await account('fixture.elder',roleId('NguoiCaoTuoi'));
    const caregiver=await account('fixture.caregiver',roleId('NguoiChamSoc'));
    const token=(userId,tenVaiTro,vaiTroId)=>jwt.sign({userId,tenVaiTro,vaiTroId,sessionVersion:2},process.env.JWT_SECRET,{expiresIn:'10m'});
    const adminToken=token(admin,'QuanTriVien',roleId('QuanTriVien'));
    const app=load(path.join(sourceRoot,'app.js'));
    server=http.createServer(app);io=load(path.join(sourceRoot,'socket.js')).initSocket(server);
    await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
    await t.test('unpatched database keeps legacy authentication/read APIs alive; new functionality is 503',async()=>{
      await must('GET','/auth/me',adminToken);
      await must('GET','/health-metrics',adminToken);
      const result=await call('GET','/relatives/links',adminToken);assert.equal(result.status,503);
      assert.equal(result.errorCode,'RELATIVES_NOT_INSTALLED');
      assert.equal((await query("SELECT COUNT(*) AS n FROM sys.tables WHERE name LIKE '%NguoiThan%'")).recordset[0].n,0);
    });
    const oldPermissions=(await query('SELECT * FROM dbo.PhanQuyen ORDER BY PhanQuyenID')).recordset;
    await runBatches(patch);
    const relativeRole=(await query("SELECT VaiTroID FROM dbo.VaiTro WHERE TenVaiTro=N'NguoiThan'")).recordset[0].VaiTroID;
    await t.test('patch applies twice, leaves old permissions unchanged, installs trusted constraints',async()=>{
      await runBatches(patch);
      assert.deepEqual((await query('SELECT * FROM dbo.PhanQuyen WHERE VaiTroID<>@role ORDER BY PhanQuyenID',{role:relativeRole})).recordset,oldPermissions);
      assert.equal((await query('SELECT COUNT(*) AS n FROM dbo.VaiTro')).recordset[0].n,4);
      assert.equal((await query('SELECT COUNT(*) AS n FROM dbo.PhanQuyen')).recordset[0].n,44);
      const invalid=(await query(`SELECT COUNT(*) AS n FROM sys.check_constraints WHERE parent_object_id IN
        (OBJECT_ID('dbo.NguoiCaoTuoi_NguoiThan'),OBJECT_ID('dbo.LichSuLienKetNguoiThan')) AND (is_disabled=1 OR is_not_trusted=1)`)).recordset[0].n;
      assert.equal(invalid,0);
    });
    const r1=await account('fixture.family1',relativeRole),r2=await account('fixture.family2',relativeRole),outsider=await account('fixture.outsider',relativeRole);
    const r1Token=token(r1,'NguoiThan',relativeRole),r2Token=token(r2,'NguoiThan',relativeRole),outToken=token(outsider,'NguoiThan',relativeRole);
    const elderIds=[];
    for(let i=1;i<=3;i++) elderIds.push((await query(`INSERT INTO dbo.HoSoNguoiCaoTuoi(UserID,HoTen,NgaySinh,GioiTinh,CCCD,DiaChi,BenhNen,DiUng)
      OUTPUT INSERTED.NguoiCaoTuoiID AS id VALUES(@user,@name,'1950-01-01',N'Nam',@cccd,N'PRIVATE_ADDRESS',N'PRIVATE_HISTORY',N'PRIVATE_ALLERGY')`,
      {user:i===1?eUser:null,name:`Fixture NCT ${i}`,cccd:`00000000000${i}`})).recordset[0].id);
    const [e1,e2,e3]=elderIds;
    const proof=(elderlyId,relativeId,scope={benhNen:false,diUng:false,ketQuaKham:false})=>({nguoiCaoTuoiId:elderlyId,nguoiThanUserId:relativeId,
      moiQuanHe:'Con gái',dongYChiaSe:true,nguoiDongY:'NCT fixture',tuCachDongY:'Bản thân NCT',
      thoiDiemDongY:new Date(Date.now()-60000).toISOString(),canCuDongY:'Biên bản fixture; không có dữ liệu thật',phamViChiaSe:scope});
    let link1,link2,link3;
    await t.test('many-to-many grants are Admin-only, require consent and reject duplicate active pairs',async()=>{
      assert.deepEqual(await must('GET','/relatives/me/elderly',r1Token),[]);
      await must('POST','/relatives/links',r1Token,proof(e1,r1),403);
      await must('POST','/relatives/links',adminToken,{...proof(e1,r1),dongYChiaSe:false},422);
      link1=await must('POST','/relatives/links',adminToken,proof(e1,r1));
      link2=await must('POST','/relatives/links',adminToken,proof(e2,r1));
      link3=await must('POST','/relatives/links',adminToken,proof(e1,r2));
      await must('POST','/relatives/links',adminToken,proof(e1,r1),409);
      assert.equal((await must('GET','/relatives/me/elderly',r1Token)).length,2);
      assert.equal((await must('GET','/relatives/me/elderly',r2Token)).length,1);
      assert.equal((await query('SELECT COUNT(*) AS n FROM dbo.LichSuLienKetNguoiThan')).recordset[0].n,3);
    });
    const metricType=(await query('SELECT TOP 1 LoaiChiSoID AS id FROM dbo.LoaiChiSoSucKhoe ORDER BY LoaiChiSoID')).recordset[0].id;
    const drug=(await query(`INSERT INTO dbo.DanhMucThuoc(TenThuoc,DonViTinh,CachDung) OUTPUT INSERTED.ThuocID AS id
      VALUES(N'Fixture drug',N'Viên',N'Hướng dẫn fixture')`)).recordset[0].id;
    let sosId;
    for(const elderlyId of elderIds) {
      await query(`INSERT INTO dbo.ChiSoSucKhoe(NguoiCaoTuoiID,LoaiChiSoID,GiaTri,GiaTriPhu,GhiChu)
        VALUES(@elderlyId,@type,120,80,N'PRIVATE_METRIC_NOTE')`,{elderlyId,type:metricType});
      await query(`INSERT INTO dbo.LichKhamBenh(NguoiCaoTuoiID,TenBenhVien,ThoiGianKham,TrangThai,KetQuaKham,LyDoKham)
        VALUES(@elderlyId,N'Fixture hospital',DATEADD(DAY,-1,SYSUTCDATETIME()),N'DaKham',N'PRIVATE_RESULT',N'PRIVATE_REASON')`,{elderlyId});
      const prescription=(await query(`INSERT INTO dbo.DonThuoc(NguoiCaoTuoiID,NgayBatDau) OUTPUT INSERTED.DonThuocID AS id
        VALUES(@elderlyId,CAST(SYSUTCDATETIME() AS DATE))`,{elderlyId})).recordset[0].id;
      const detail=(await query(`INSERT INTO dbo.DonThuocChiTiet(DonThuocID,ThuocID,LieuDung) OUTPUT INSERTED.DonThuocChiTietID AS id
        VALUES(@prescription,@drug,N'1 viên')`,{prescription,drug})).recordset[0].id;
      await query(`INSERT INTO dbo.LichUongThuoc(NguoiCaoTuoiID,DonThuocChiTietID,ThoiGianDuKien)
        VALUES(@elderlyId,@detail,SYSUTCDATETIME())`,{elderlyId,detail});
      await query(`INSERT INTO dbo.CanhBao(NguoiCaoTuoiID,LoaiCanhBao,NoiDung,MucDo,GhiChuXuLy)
        VALUES(@elderlyId,N'ChiSoBatThuong',N'PRIVATE_ALERT',N'TrungBinh',N'PRIVATE_INTERNAL')`,{elderlyId});
    }
    sosId=(await query(`INSERT INTO dbo.CanhBaoKhanCap(NguoiCaoTuoiID,NguoiGuiID,ViDo,KinhDo,NoiDung)
      OUTPUT INSERTED.CanhBaoKhanCapID AS id VALUES(@e1,@eUser,10.123456,106.123456,N'PRIVATE_SOS')`,{e1,eUser})).recordset[0].id;
    await query(`INSERT INTO dbo.ThongBao(UserID,TieuDe,NoiDung,LoaiThongBao,LienKetBang,LienKetID)
      VALUES(@r1,N'PRIVATE_TITLE',N'PRIVATE_SOS https://maps.example/10.123456',N'KhanCap',N'CanhBaoKhanCap',@sosId)`,{r1,sosId});
    await t.test('every read is linked and projected; changing IDs, query/body injection and private fields are blocked',async()=>{
      for(const suffix of ['', '/health-metrics','/medication-schedules','/appointments','/alerts','/sos']) {
        const url=`/relatives/me/elderly/${e1}${suffix}`;
        const result=await must('GET',url,r1Token);
        assert.doesNotMatch(JSON.stringify(result),/PRIVATE_|000000000001|10\.123456|106\.123456|cccd|diaChi|viDo|kinhDo|ghiChuXuLy/i);
        await must('GET',`/relatives/me/elderly/${e3}${suffix}`,r1Token,null,403);
        await must('GET',url,outToken,null,403);
        await must('GET',`${url}?nguoiCaoTuoiId=${e3}`,r1Token,null,422);
      }
      const profile=await must('GET',`/relatives/me/elderly/${e1}`,r1Token);
      assert.equal(profile.benhNen,null);assert.equal(profile.diUng,null);
      const notices=await must('GET','/relatives/me/notifications',r1Token);assert.equal(notices.length,1);
      assert.doesNotMatch(JSON.stringify(notices),/PRIVATE_|maps|10\.123456/);
      const cache=await call('GET',`/relatives/me/elderly/${e1}`,r1Token);assert.equal(cache.cache,'no-store');
    });
    await t.test('direct legacy read/write APIs are denied before clinical mutation, regardless of permission matrix mistakes',async()=>{
      await query('UPDATE dbo.PhanQuyen SET ChoPhepSua=1,ChoPhepThem=1,ChoPhepXoa=1 WHERE VaiTroID=@role',{role:relativeRole});
      for(const url of ['/elderly','/health-metrics','/appointments','/medication-schedules','/emergency-alerts','/care-notes','/users','/permissions/matrix'])
        for(const method of ['GET','POST','PUT','PATCH','DELETE']) {
          const result=await call(method,url,r1Token,method==='GET'?null:{nguoiCaoTuoiId:e3});
          // Some verbs have no route at all; 404 is also a denial, not an API authorization bypass.
          assert.ok([403,404].includes(result.status),`${method} ${url} must not succeed`);
        }
      for(const [method,url] of [['PATCH',`/medication-schedule/1/confirm`],['PATCH','/medication-schedule/1/supplement'],
        ['PUT',`/elderly/${e1}`],['DELETE',`/elderly/${e1}`],['PATCH','/emergency-alerts/1/seen'],
        ['PATCH','/emergency-alerts/1/resolve'],['PATCH','/appointments/1/result'],['PATCH','/appointments/1/cancel']])
        await must(method,url,r1Token,{nguoiCaoTuoiId:e3},403);
      const permissions=await must('GET','/permissions/me',r1Token);
      assert.ok(permissions.every(p=>!p.them&&!p.sua&&!p.xoa));
      await query('UPDATE dbo.PhanQuyen SET ChoPhepSua=0,ChoPhepThem=0,ChoPhepXoa=0 WHERE VaiTroID=@role',{role:relativeRole});
    });
    await t.test('family Web and Mobile login and own-password work without granting profile write',async()=>{
      await must('POST','/auth/login',null,{tenDangNhap:'fixture.family1',matKhau:'fixture-password',platform:'web'});
      await must('POST','/auth/login',null,{tenDangNhap:'fixture.family1',matKhau:'fixture-password',platform:'mobile'});
      await must('POST','/auth/change-password',r1Token,{matKhauHienTai:'fixture-password',matKhauMoi:'fixture-new',userId:r2},422);
      await must('POST','/auth/change-password',r1Token,{matKhauHienTai:'fixture-password',matKhauMoi:'fixture-new'});
      await must('PUT','/users/me/password',r1Token,{matKhauCu:'fixture-new',matKhauMoi:'fixture-password'});
      const unchanged=(await query('SELECT MatKhauHash FROM dbo.NguoiDung WHERE UserID=@r2',{r2})).recordset[0];
      assert.equal(await bcrypt.compare('fixture-password',unchanged.MatKhauHash),true);
      await must('PUT',`/elderly/${e1}`,r1Token,{hoTen:'Must not change'},403);
    });
    await t.test('Admin user creation supports the fourth single role without creating a caregiver profile',async()=>{
      const created=await must('POST','/users',adminToken,{username:'fixture.created',password:'fixture-password',hoTen:'Fixture new family',
        email:'created@fixture.invalid',vaiTro:'NGUOI_THAN'},201);
      assert.ok(created.id);
      assert.equal((await query('SELECT COUNT(*) AS n FROM dbo.NguoiChamSoc WHERE UserID=@user',{user:created.id})).recordset[0].n,0);
    });
    const connect=async(userToken)=>{
      const socket=clientSocket(`http://127.0.0.1:${server.address().port}`,{auth:{token:userToken},transports:['websocket'],reconnection:false});sockets.push(socket);
      await new Promise((resolve,reject)=>{socket.once('connect',resolve);socket.once('connect_error',reject);});return socket;
    };
    const socket1=await connect(r1Token),socket2=await connect(r2Token);
    const events1=[],events2=[],control=[];
    socket1.on('canhbao:new',e=>events1.push(e));socket2.on('canhbao:new',e=>events2.push(e));
    socket1.on('relatives:access-changed',e=>control.push(e));
    await t.test('audit failure rolls back the link change and emits no permission event',async()=>{
      await query(`CREATE TRIGGER dbo.FixtureRejectRelativeAudit ON dbo.LichSuLienKetNguoiThan AFTER INSERT AS
        BEGIN IF EXISTS(SELECT 1 FROM inserted WHERE LyDo=N'FIXTURE_REJECT_AUDIT')
          THROW 51999,N'Isolated fixture audit failure',1; END`);
      const before=(await must('GET',`/relatives/links?nguoiThanUserId=${r1}&nguoiCaoTuoiId=${e1}`,adminToken))[0];
      const historyBefore=await must('GET',`/relatives/links/${link1.id}/history`,adminToken);
      const value=proof(e1,r1,{benhNen:true,diUng:true,ketQuaKham:true});delete value.nguoiCaoTuoiId;delete value.nguoiThanUserId;
      await must('PUT',`/relatives/links/${link1.id}`,adminToken,{...value,version:link1.version,lyDo:'FIXTURE_REJECT_AUDIT'},503);
      const after=(await must('GET',`/relatives/links?nguoiThanUserId=${r1}&nguoiCaoTuoiId=${e1}`,adminToken))[0];
      assert.deepEqual(after,before);
      assert.equal((await must('GET',`/relatives/links/${link1.id}/history`,adminToken)).length,historyBefore.length);
      assert.equal(control.length,0);
    });
    await t.test('concurrent grants leave exactly one active pair and one creation history',async()=>{
      const results=await Promise.all([call('POST','/relatives/links',adminToken,proof(e2,r2)),call('POST','/relatives/links',adminToken,proof(e2,r2))]);
      assert.deepEqual(results.map(r=>r.status).sort(),[200,409]);
      const links=await must('GET',`/relatives/links?nguoiThanUserId=${r2}&nguoiCaoTuoiId=${e2}`,adminToken);
      assert.equal(links.length,1);
      assert.equal((await must('GET',`/relatives/links/${links[0].id}/history`,adminToken)).length,1);
    });
    await t.test('permission matrix accepts old 3-role clients without deleting family rights and rejects family write grants',async()=>{
      const matrix=await must('GET','/permissions/matrix',adminToken);
      assert.equal(matrix.roles.length,4);
      const relativeBefore=matrix.permissions.filter(row=>row.vaiTroId===relativeRole);
      await must('PUT','/permissions/matrix',adminToken,{permissions:matrix.permissions.filter(row=>row.vaiTroId!==relativeRole)});
      const after=await must('GET','/permissions/matrix',adminToken);
      assert.deepEqual(after.permissions.filter(row=>row.vaiTroId===relativeRole),relativeBefore);
      await must('PUT','/permissions/matrix',adminToken,{permissions:matrix.permissions.map(row=>row.vaiTroId===relativeRole ? {...row,sua:true} : row)},400);
    });
    await t.test('consent changes are audited, protected by version and reflected in the next read',async()=>{
      const value=proof(e1,r1,{benhNen:true,diUng:true,ketQuaKham:true});delete value.nguoiCaoTuoiId;delete value.nguoiThanUserId;
      const oldVersion=link1.version;
      link1=await must('PUT',`/relatives/links/${link1.id}`,adminToken,{...value,version:oldVersion,lyDo:'NCT mở rộng phạm vi chia sẻ'});
      await must('PUT',`/relatives/links/${link1.id}`,adminToken,{...value,version:oldVersion,lyDo:'Stale'},409);
      const profile=await must('GET',`/relatives/me/elderly/${e1}`,r1Token);
      assert.equal(profile.benhNen,'PRIVATE_HISTORY');assert.equal(profile.diUng,'PRIVATE_ALLERGY');
      assert.equal((await must('GET',`/relatives/me/elderly/${e1}/appointments`,r1Token))[0].ketQuaKham,'PRIVATE_RESULT');
      const other=await must('GET',`/relatives/me/elderly/${e1}`,r2Token);assert.equal(other.benhNen,null);
      const history=await must('GET',`/relatives/links/${link1.id}/history`,adminToken);assert.equal(history.length,2);
      assert.equal(history[0].hanhDong,'CAP_NHAT');assert.equal(history[1].hanhDong,'CAP');
      await must('GET',`/relatives/links/${link1.id}/history`,r1Token,null,403);
    });
    const realtime=load(path.join(sourceRoot,'services/relativeRealtime.service.js')).createRelativeRealtime(pool,sql,
      load(path.join(sourceRoot,'socket.js')).emitToUser);
    await t.test('prepared realtime primitive emits only safe fields to current authorized relatives',async()=>{
      assert.equal(await realtime.emitSos(e1,{nguoiCaoTuoiId:e1,nguonBang:'CanhBaoKhanCap',nguonId:sosId,
        viDo:10.123456,kinhDo:106.123456,moTa:'PRIVATE_SOS',ghiChuXuLy:'PRIVATE_INTERNAL'}),2);
      await new Promise(resolve=>setTimeout(resolve,80));
      assert.equal(events1.length,1);assert.equal(events2.length,1);
      assert.doesNotMatch(JSON.stringify(events1),/PRIVATE_|viDo|kinhDo|ghiChu|10\.123456/);
      assert.equal(io.sockets.adapter.rooms.get('admin')?.size || 0,0,'Family sockets are not in Admin room');
    });
    await t.test('revocation is immediate for an existing JWT/socket and invalidates persisted notifications',async()=>{
      const revoked=await must('POST',`/relatives/links/${link1.id}/revoke`,adminToken,{version:link1.version,lyDo:'NCT thu hồi đồng ý'});
      assert.ok(revoked.thuHoiLuc);
      await must('GET',`/relatives/me/elderly/${e1}`,r1Token,null,403);
      assert.equal((await must('GET','/relatives/me/elderly',r1Token)).length,1);
      assert.deepEqual(await must('GET','/relatives/me/notifications',r1Token),[]);
      assert.equal(await realtime.emitSos(e1,{nguoiCaoTuoiId:e1,nguonBang:'CanhBaoKhanCap',nguonId:sosId}),1);
      await new Promise(resolve=>setTimeout(resolve,80));
      assert.equal(events1.length,1);assert.equal(events2.length,2);
      assert.ok(control.some(e=>e.action==='THU_HOI'&&e.nguoiCaoTuoiId===e1));
      assert.doesNotMatch(JSON.stringify(control),/canCu|nguoiDongY|PRIVATE_/);
      assert.equal((await must('GET',`/relatives/links/${link1.id}/history`,adminToken)).length,3);
      const fresh=await must('POST','/relatives/links',adminToken,proof(e1,r1));
      assert.notEqual(fresh.id,link1.id,'Regrant creates a new lifecycle and preserves revoked history');
    });
    await t.test('missing read permission or locked account blocks data and realtime eligibility',async()=>{
      await query(`UPDATE dbo.PhanQuyen SET ChoPhepXem=0 WHERE VaiTroID=@role AND ChucNangID=(SELECT ChucNangID FROM dbo.ChucNang WHERE MaChucNang='QLCANHBAO')`,{role:relativeRole});
      await must('GET',`/relatives/me/elderly/${e1}/sos`,r1Token,null,403);
      assert.equal(await realtime.emitSos(e1,{nguoiCaoTuoiId:e1,nguonBang:'CanhBaoKhanCap',nguonId:sosId}),0);
      await query(`UPDATE dbo.PhanQuyen SET ChoPhepXem=1 WHERE VaiTroID=@role AND ChucNangID=(SELECT ChucNangID FROM dbo.ChucNang WHERE MaChucNang='QLCANHBAO')`,{role:relativeRole});
      await query("UPDATE dbo.NguoiDung SET TrangThai=N'KhoaTaiKhoan' WHERE UserID=@r1",{r1});
      await must('GET','/relatives/me/elderly',r1Token,null,401);
      assert.equal(await realtime.emitSos(e1,{nguoiCaoTuoiId:e1,nguonBang:'CanhBaoKhanCap',nguonId:sosId}),1);
    });
    await t.test('legacy Admin, caregiver and elderly remain authenticated after schema installation',async()=>{
      await must('GET','/auth/me',adminToken);
      await must('GET','/auth/me',token(caregiver,'NguoiChamSoc',roleId('NguoiChamSoc')));
      await must('GET','/elderly/me',token(eUser,'NguoiCaoTuoi',roleId('NguoiCaoTuoi')));
    });
  } finally {
    for(const socket of sockets) socket.close();
    if(io) await io.close();else if(server?.listening) await new Promise(resolve=>server.close(resolve));
    if(pool) await pool.close();if(master) await master.close();
    if(previousSecret==null) delete process.env.JWT_SECRET;else process.env.JWT_SECRET=previousSecret;
  }
});
