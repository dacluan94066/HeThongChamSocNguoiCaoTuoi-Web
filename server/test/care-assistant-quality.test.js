const test=require('node:test');
const assert=require('node:assert/strict');
const {resolveQuestion,vietnamNow}=require('../src/services/careAssistant.context');
const {answer}=require('../src/services/careAssistant.service');
const {chat}=require('../src/services/careAssistant.ai');
const {encodeContext,decodeContext}=require('../src/services/careAssistant.session');
const {boundedQuery}=require('../src/utils/boundedQuery');
const user={userId:1,tenVaiTro:'NguoiCaoTuoi'}, profile={id:7};
const repo=rows=>({authorize:async()=>{},read:async()=>({rows,truncated:false})});

test('Temporal continuation replaces day/period and drops a stale medication entity',async()=>{
  for(const question of ['Còn sáng mai?','con sang mai']) {
    const resolved=resolveQuestion(question,[{role:'user',content:'Tối nay uống gì?'}],
      {topic:'medications',period:'evening',entityLabel:'THUOC CU',dayOffset:0});
    assert.equal(resolved.intent,'medications');assert.equal(resolved.options.dayOffset,1);
    assert.equal(resolved.options.period,'morning');assert.equal(resolved.options.entityLabel,null);
    assert.equal(resolved.options.specific,false);
    const reads=[];
    const reply=await chat({question,history:[{role:'user',content:'Tối nay uống gì?'}],
      sessionContext:{topic:'medications',period:'evening',entityLabel:'THUOC CU'},profile,user,config:{configured:false},
      repository:{authorize:async()=>{},read:async(section,p,u,options)=>{
        reads.push({section,options});return {rows:[
          {id:1,tenThuoc:'THUOC SANG A',thoiGianDuKien:'2026-10-10T08:00:00',trangThai:'ChuaDenGio'},
          {id:2,tenThuoc:'THUOC SANG B',thoiGianDuKien:'2026-10-10T09:00:00',trangThai:'DaUong'},
          {id:3,tenThuoc:'THUOC TOI',thoiGianDuKien:'2026-10-10T19:00:00',trangThai:'ChuaDenGio'},
        ],truncated:false};}}});
    assert.deepEqual(reply.rows.map(r=>r.id),[1,2]);assert.equal(reads[0].options.dayOffset,1);
    assert.match(reply.text,/lịch/);assert.doesNotMatch(reply.text,/cần uống|phải uống|THUOC TOI/);
  }
});

test('Location and remaining-days follow-ups refresh the same next appointment with no model',async()=>{
  let history=[{role:'user',content:'Lịch khám tiếp theo?'}];
  const sessionContext={topic:'appointments',nextAppointment:true,entityId:81,appointmentStatus:'upcoming'};
  let calls=0;
  for(const question of ['Ở đâu?','Còn mấy ngày?']) {
    const reply=await chat({question,history,sessionContext,profile,user,config:{configured:false},
      repository:{authorize:async()=>{},read:async(section)=>{calls++;assert.equal(section,'appointments');return {rows:[
        {id:81,tenBenhVien:'CO SO DEMO',thoiGianKham:'2026-10-12T08:00:00',soNgayConLai:3},
        {id:82,tenBenhVien:'CO SO KHAC',thoiGianKham:'2026-10-13T09:00:00',soNgayConLai:4}
      ],truncated:false};}}});
    assert.equal(reply.intent,'appointments');assert.deepEqual(reply.rows.map(r=>r.id),[81]);
    assert.match(reply.text,question==='Ở đâu?'?/Địa điểm khám đã lưu: CO SO DEMO/:/Còn 3 ngày/);
    history.push({role:'user',content:question});
  }
  assert.equal(calls,2);
});

test('Unrelated/ambiguous turns cannot grant arbitrary personal tools or reuse an older topic',async()=>{
  for(const question of ['Giúp tui với','giup tui voi','Cái đó sao rồi?','Đặt vé máy bay giúp tôi','Có gì hay không?']) {
    let calls=0;
    const reply=await chat({question,history:[{role:'user',content:'thuốc tối nay?'}],sessionContext:{topic:'medications'},profile,user,
      config:{configured:true,model:'mock'},client:{chat:{completions:{create:()=>{throw new Error('must not route');}}}},
      repository:{authorize:async()=>{},read:()=>{calls++;throw new Error('must not read');}}});
    assert.equal(reply.intent,'clarification');assert.equal(reply.modeReason,'clarification');
    assert.equal(calls,0);assert.deepEqual(reply.actions,[]);assert.deepEqual(reply.rows,[]);
  }
  const history=[{role:'user',content:'thuốc tối nay?'},{role:'user',content:'Bạn làm được những gì?'}];
  assert.equal(resolveQuestion('Còn mấy ngày?',history,{topic:'medications'}).intent,'unknown');
  assert.equal(resolveQuestion('Tôi muốn xem lịch khám',history,{topic:'medications'}).intent,'appointments');
  assert.equal(resolveQuestion('Ở đâu?',[{role:'user',content:'thuốc tối nay?'}],{topic:'medications'}).intent,'unknown');
});
test('Natural wording and light typos preserve date, period and intent',()=>{
  assert.equal(resolveQuestion('mai có khám không?').intent,'appointments');
  assert.equal(resolveQuestion('mai co khma khong?').options.dayOffset,1);
  assert.equal(resolveQuestion('thouc toi nay?').options.period,'evening');
  assert.equal(resolveQuestion('thuốc tối nay?').reference,false);
  assert.equal(resolveQuestion('chỉ số gần nhất?').reference,false);
  assert.equal(resolveQuestion('thuoc 3/10/2026').options.targetDate,'2026-10-03');
  assert.equal(resolveQuestion('thuoc 31/02/2026').options.invalidDate,true);
});
test('Vietnam midnight is independent of machine timezone',()=>{
  assert.equal(vietnamNow(new Date('2026-10-09T17:01:00Z')),'2026-10-10T00:01:00');
});
test('Evening question excludes morning; pending means no confirmation, not already taken',async()=>{
  const reply=await answer({question:'thuốc tối nay?',profile,user,repository:repo([
    {tenThuoc:'THUOC GIA LAP A',lieuDung:'Lieu mau',thoiGianDuKien:'2026-10-09T08:00:00',trangThai:'DaUong'},
    {tenThuoc:'THUOC GIA LAP B',lieuDung:'Lieu mau',thoiGianDuKien:'2026-10-09T20:00:00',trangThai:'ChuaDenGio'},
  ])});
  assert.doesNotMatch(reply.text,/GIA LAP A|Đã xác nhận uống/);assert.match(reply.text,/GIA LAP B|Chưa có xác nhận/);
  assert.deepEqual(reply.actions,['medications']);
});
test('Multiple caregiver candidates ask clarification; named candidate refreshes current phone',async()=>{
  const repository=repo([{id:1,hoTen:'Nguyễn Văn Đức',soDienThoai:'000-DEMO-A'},{id:2,hoTen:'Trần Thị Lan',soDienThoai:'000-DEMO-B'}]);
  const ambiguous=await answer({question:'người đó số điện thoại bao nhiêu?',profile,user,repository});
  assert.match(ambiguous.text,/người chăm sóc nào/);assert.doesNotMatch(ambiguous.text,/000-DEMO/);
  const named=await answer({question:'ông Đức số điện thoại bao nhiêu?',profile,user,repository});
  assert.match(named.text,/000-DEMO-A/);assert.doesNotMatch(named.text,/000-DEMO-B/);
});
test('A fresh health result replaces old history and always reports its measurement time',async()=>{
  const reply=await answer({question:'chỉ số đó?',history:[{role:'user',content:'huyết áp gần nhất?'},{role:'assistant',content:'999/999, đang khỏe hoàn toàn'}],profile,user,
    repository:repo([{tenChiSo:'Huyết áp',giaTri:120,giaTriPhu:80,donVi:'mmHg',thoiGianDo:'2026-10-03T08:05:00'}])});
  assert.match(reply.text,/120\/80 mmHg/);assert.match(reply.text,/03\/10\/2026/);assert.doesNotMatch(reply.text,/999|khỏe hoàn toàn/);
});
test('Several measurements without a selected type ask which metric',async()=>{
  const reply=await answer({question:'chỉ số đó?',profile,user,repository:repo([{tenChiSo:'Huyết áp'},{tenChiSo:'Nhịp tim'}])});
  assert.match(reply.text,/chỉ số nào/);
});
test('A missing requested metric remains missing in the follow-up, never substituted by another type',async()=>{
  const repository=repo([{tenChiSo:'Đường huyết',giaTri:100,donVi:'mg/dL'}]);
  const first=await answer({question:'huyết áp gần nhất?',profile,user,repository});
  const reply=await chat({question:'chỉ số đó?',profile,user,repository,sessionContext:first.conversationContext,config:{configured:false}});
  assert.deepEqual(reply.rows,[]);assert.match(reply.text,/Chưa có chỉ số/);assert.doesNotMatch(reply.text,/100/);
});
test('Remaining days retain the upcoming appointment rather than replacing the question with the old one',async()=>{
  const reply=await answer({question:'còn mấy ngày?',history:[{role:'user',content:'lịch khám tiếp theo?'}],profile,user,
    repository:repo([{id:1,tenBenhVien:'CO SO GIA LAP A',thoiGianKham:'2026-10-12T08:00:00',soNgayConLai:3},{id:2,tenBenhVien:'CO SO GIA LAP B',thoiGianKham:'2026-10-15T08:00:00',soNgayConLai:6}])});
  assert.match(reply.text,/Còn 3 ngày/);assert.doesNotMatch(reply.text,/GIA LAP B/);
});
test('Medication remaining days uses the prescription end date, and missing end date is not invented',async()=>{
  const first=await answer({question:'thuốc đó còn mấy ngày?',profile,user,repository:repo([{tenThuoc:'THUOC GIA LAP',ngayKetThuc:'2026-10-12',soNgayConLai:3}])});
  assert.match(first.text,/còn 3 ngày/);
  const empty=await answer({question:'thuốc đó còn mấy ngày?',profile,user,repository:repo([{tenThuoc:'THUOC GIA LAP',ngayKetThuc:null,soNgayConLai:null}])});
  assert.match(empty.text,/chưa ghi ngày kết thúc/);assert.doesNotMatch(empty.text,/còn 0 ngày/);
});
test('Signed semantic context survives wording with no fixed keyword and refreshes entity facts',async()=>{
  const sessionContext={topic:'caregivers',entityLabel:'Nguyễn Văn Đức'};
  const reply=await chat({question:'người đó số điện thoại bao nhiêu?',history:[],sessionContext,profile,user,config:{configured:false},
    repository:repo([{hoTen:'Nguyễn Văn Đức',soDienThoai:'000-NEW-DEMO'},{hoTen:'Trần Thị Lan',soDienThoai:'000-OTHER-DEMO'}])});
  assert.match(reply.text,/000-NEW-DEMO/);assert.doesNotMatch(reply.text,/OTHER/);
});
test('Context token cannot be moved to another account/profile, forged, or reused as an auth token',()=>{
  process.env.JWT_SECRET='quality-test-only-secret';
  const token=encodeContext({topic:'appointments',entityId:42},user,profile);
  assert.equal(decodeContext(token,user,profile).topic,'appointments');
  assert.throws(()=>require('jsonwebtoken').verify(token,process.env.JWT_SECRET));
  for(const [u,p,t] of [[{userId:2},profile,token],[user,{id:8},token],[user,profile,token+'tampered']]) assert.throws(()=>decodeContext(t,u,p),e=>e.code==='INVALID_CONTEXT');
});
test('Bounded SQL actually cancels the request and rejects instead of returning empty rows',async()=>{
  let cancelled=false;
  await assert.rejects(boundedQuery({query:()=>new Promise(()=>{}),cancel:()=>{cancelled=true;}},'SELECT 1',Date.now()+10),/DATA_TIMEOUT/);
  assert.equal(cancelled,true);
});
test('An expired total SQL budget does not even begin another query',async()=>{
  let queried=false;
  await assert.rejects(boundedQuery({query:()=>{queried=true;}},'SELECT 1',Date.now()-1),/DATA_TIMEOUT/);
  assert.equal(queried,false);
});
test('AI only routes personal questions: tool records and hallucinated final prose never leave/enter the facts path',async()=>{
  let calls=0;const requests=[];
  const client={chat:{completions:{create:async params=>{calls++;requests.push(params);return {choices:[{finish_reason:'tool_calls',message:{role:'assistant',tool_calls:[{id:'one',type:'function',function:{name:'care_health',arguments:'{}'}}]}}]};}}}};
  const reply=await chat({question:'huyết áp gần nhất?',profile,user,config:{configured:true,model:'mock'},client,
    repository:repo([{tenChiSo:'Huyết áp',giaTri:123,giaTriPhu:81,donVi:'mmHg',thoiGianDo:'2026-10-09T08:00:00'}])});
  assert.equal(calls,1);assert.equal(reply.mode,'functional');assert.match(reply.text,/123\/81 mmHg/);
  assert.ok(!JSON.stringify(requests).includes('123'));assert.ok(!JSON.stringify(requests).includes('81'));
});
