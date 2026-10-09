// Running app5000 + real SQL/source APIs. Verified synthetic seed; no record/token logs.
const assert=require('node:assert/strict');
require('dotenv').config({path:require('node:path').resolve(__dirname,'../.env'),quiet:true});
const {vietnamNow}=require('../src/services/careAssistant.context');
async function main(){
 const pool=await require('../src/config/db').poolPromise;
 try{
  const demo=await pool.request().query("SELECT nct.NguoiCaoTuoiID AS id,nct.CCCD AS cccd FROM NguoiDung nd JOIN HoSoNguoiCaoTuoi nct ON nct.UserID=nd.UserID WHERE nd.TenDangNhap='nct.an'");
  assert.equal(demo.recordset[0]?.cccd,'079047000101');const id=demo.recordset[0].id;
  const base='http://127.0.0.1:5000/api';let token;
  const send=async(route,body)=>{const r=await fetch(base+route,{method:body?'POST':'GET',headers:{'Content-Type':'application/json',...(token?{Authorization:'Bearer '+token}:{})},...(body?{body:JSON.stringify(body)}:{}),signal:AbortSignal.timeout(40000)});assert.equal(r.status,200);return(await r.json()).data;};
  token=(await send('/auth/login',{tenDangNhap:'nct.an',matKhau:process.env.SEED_PASSWORD,platform:'mobile'})).token;
  const today=vietnamNow().slice(0,10),tomorrow=new Date(Date.parse(today+'T00:00:00Z')+86400000).toISOString().slice(0,10);
  const evening=await send('/elderly/me/medication-schedule?tuNgay='+today+'&denNgay='+today);
  const morning=await send('/elderly/me/medication-schedule?tuNgay='+tomorrow+'&denNgay='+tomorrow);
  const appointments=await send('/appointments?nguoiCaoTuoiId='+id);
  const rows=x=>Array.isArray(x)?x:x?.items||x?.rows||[];
  for(const plain of [false,true]){
   let history=[],context;
   const ask=async(question,expected,source)=>{
    if(plain)question=question.normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[đĐ]/g,'d').toLowerCase();
    const reply=await send('/care-assistant/chat',{question,history:history.slice(-8),...(context?{conversationToken:context}:{})});
    const passed=reply.intent===expected && (!source||JSON.stringify(reply.rows.map(r=>r.id).sort())===JSON.stringify(source.map(r=>r.id).sort()));
    console.log(JSON.stringify({question,plain,intent:reply.intent,mode:reply.mode,reason:reply.modeReason,error:reply.aiFailureCode||null,passed,sourceCompared:Boolean(source),records:reply.rows.length}));
    if(!process.argv.includes('--before'))assert.ok(passed,'INTENT_OR_SOURCE_MISMATCH');
    if(['clarification','capabilities'].includes(expected)&&!process.argv.includes('--before')){assert.deepEqual(reply.rows,[]);assert.deepEqual(reply.actions,[]);}
    if(expected==='medications'&&!process.argv.includes('--before'))assert.ok(!/cần uống|phải uống|nên uống/.test(reply.text));
    history.push({role:'user',content:question},{role:'assistant',content:reply.text});context=reply.conversationToken||context;return reply;
   };
   await ask('Bạn làm được những gì?','capabilities');
   await ask('Giúp tui với','clarification');
   history=[];context=null;
   await ask('Tối nay uống gì?','medications',rows(evening).filter(r=>Number(r.thoiGianDuKien.slice(11,13))>=17));
   await ask('Còn sáng mai?','medications',rows(morning).filter(r=>Number(r.thoiGianDuKien.slice(11,13))<12));
   await ask('Tôi muốn xem lịch khám','appointments');
   history=[];context=null;
   const source=rows(appointments).filter(r=>r.trangThai==='CHUA_DEN'&&r.ngayKham+'T'+r.gioKham>=vietnamNow()).sort((a,b)=>(a.ngayKham+a.gioKham).localeCompare(b.ngayKham+b.gioKham));
   await ask('Lịch khám tiếp theo?','appointments',source);
   await ask('Ở đâu?','appointments');
   await ask('Còn mấy ngày?','appointments');
   await ask('Cái đó sao rồi?','clarification');
   await ask('Đặt vé máy bay giúp tôi','clarification');
  }
 }finally{await pool.close();}
}
main().catch(()=>{console.log('LANGUAGE_API: FAILED');process.exitCode=1;});
