// Real running app API; verified fictitious seed account only. Never log records/tokens.
const assert=require('node:assert/strict');
require('dotenv').config({path:require('node:path').resolve(__dirname,'../.env'),quiet:true});
async function main() {
  const {poolPromise}=require('../src/config/db');const pool=await poolPromise;
  try {
    const demo=await pool.request().query("SELECT nct.NguoiCaoTuoiID AS id,nct.CCCD AS cccd FROM NguoiDung nd JOIN HoSoNguoiCaoTuoi nct ON nct.UserID=nd.UserID WHERE nd.TenDangNhap='nct.an'");
    assert.equal(demo.recordset[0]?.cccd,'079047000101');
    const base='http://127.0.0.1:5000/api';
    const send=async(route,body,token)=>{
      const r=await fetch(base+route,{method:'POST',headers:{'Content-Type':'application/json',...(token?{Authorization:'Bearer '+token}:{})},body:JSON.stringify(body),signal:AbortSignal.timeout(40000)});
      assert.equal(r.status,200);return (await r.json()).data;
    };
    const auth=await send('/auth/login',{tenDangNhap:'nct.an',matKhau:process.env.SEED_PASSWORD,platform:'mobile'});
    const token=auth.token;
    const medication=await send('/care-assistant/chat',{question:'thuốc ngày 2026-10-03?',history:[]},token);
    for(const history of [[],[{role:'user',content:'thuốc ngày 2026-10-03?'},{role:'assistant',content:medication.text}]]) {
      for(const question of ['bạn có thể hỗ trợ tôi được gì','ban co the ho tro toi duoc gi']) {
        const reply=await send('/care-assistant/chat',{question,history,conversationToken:history.length?medication.conversationToken:undefined},token);
        console.log(JSON.stringify({stage:history.length?'after_medication':'new_chat',accented:question.startsWith('bạn'),intent:reply.intent,mode:reply.mode,modeReason:reply.modeReason,aiFailureCode:reply.aiFailureCode||null,personalRows:reply.rows.length}));
        if(!process.argv.includes('--before')) {
          assert.equal(reply.intent,'capabilities');assert.equal(reply.rows.length,0);assert.deepEqual(reply.actions,[]);
          assert.ok(!/Metformin|Amlodipine|Losartan|\d{2}:\d{2}/i.test(reply.text));
          assert.ok(reply.text.includes('lịch thuốc')&&reply.text.includes('lịch khám'));
          console.log('CAPABILITY_ANSWER: '+reply.text);
        }
      }
    }
  } finally {await pool.close();}
}
main().catch(()=>{console.log('CAPABILITY_API: FAILED');process.exitCode=1;});
