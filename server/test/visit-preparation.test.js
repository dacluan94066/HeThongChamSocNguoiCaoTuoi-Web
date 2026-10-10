const test=require('node:test');
const assert=require('node:assert/strict');
const {chat,configuration}=require('../src/services/careAssistant.ai');
const {resolveQuestion,detectIntent}=require('../src/services/careAssistant.context');
const config={configured:true,provider:'groq',key:'mock-only',model:'mock-model'};
const user={userId:1,tenVaiTro:'NguoiCaoTuoi'};
const histories=[[],[{role:'user',content:'xem lịch khám'},{role:'assistant',content:'Chưa có lịch khám sắp tới.'}]];
const questions=['tôi nên chuẩn bị những gì trước khi đi khám','toi nen chuan bi nhung gi truoc khi di kham','Đi khám cần mang theo giấy tờ gì?','di kham can mang theo giay to gi'];
const text='Bạn mang giấy tờ/BHYT, hồ sơ và kết quả cũ, danh sách thuốc đang dùng, ghi chú triệu chứng/câu hỏi. Không tự ngừng thuốc hoặc nhịn ăn; làm theo hướng dẫn của cơ sở khám.';
function repo(hasAppointment){return {authorize:async()=>{},read:async()=>{throw Error('General guidance must not read personal data: '+hasAppointment);}};}
function ai(reply){const requests=[];return {requests,chat:{completions:{create:async p=>{requests.push(p);if(reply instanceof Error)throw reply;return {choices:[{finish_reason:'stop',message:{role:'assistant',content:reply}}]};}}}};}
for(const question of questions) test('Preparation is general: '+question,async()=>{
 for(const history of histories)for(const hasAppointment of [true,false]){
  assert.equal(resolveQuestion(question,history,{topic:'appointments'}).intent,'visit_preparation');
  const client=ai(text);
  const response=await chat({question,history,sessionContext:{topic:'appointments'},profile:hasAppointment?{id:7}:null,user,repository:repo(hasAppointment),config,client});
  assert.equal(response.mode,'ai');assert.equal(response.intent,'visit_preparation');
  assert.deepEqual(response.rows,[]);assert.deepEqual(response.actions,[]);
  assert.equal(client.requests.length,1);assert.equal(client.requests[0].tools,undefined);assert.equal(client.requests[0].tool_choice,undefined);
 }
});
test('Preparation and fasting fallback works without configuration, with no profile or appointments',async()=>{
 for(const question of [...questions,'có cần nhịn ăn không?','co can nhin an khong'])for(const history of histories){
  const response=await chat({question,history,user,profile:null,repository:repo(false),config:configuration({})});
  assert.equal(response.mode,'functional');assert.ok(!response.text.includes('Chưa có lịch khám'));
  if(response.intent==='visit_preparation')for(const word of ['BHYT','kết quả','thuốc','triệu chứng'])assert.ok(response.text.includes(word));
  else {assert.equal(response.intent,'visit_fasting');assert.ok(response.text.includes('?'));assert.ok(response.text.includes('xét nghiệm'));}
 }
});
test('Groq tool generation failure reports only safe diagnostic and correct fallback',async()=>{
 const error=Object.assign(new Error('secret private request must never be returned'),{status:400,error:{code:'tool_use_failed'}});
 const response=await chat({question:questions[0],history:histories[1],user,repository:repo(false),config,client:ai(error)});
 assert.equal(response.mode,'functional');assert.equal(response.aiFailureCode,'AI_TOOL_GENERATION_FAILED');
 assert.deepEqual(response.aiDiagnostic,{httpStatus:400,providerCode:'tool_use_failed',step:'provider_request',errorType:'Error'});
 assert.ok(response.text.includes('BHYT'));assert.ok(!JSON.stringify(response).includes('secret private'));
});
test('Quota does not retry or misroute guidance',async()=>{
 const client=ai(Object.assign(new Error('quota'),{status:429,code:'rate_limit_exceeded'}));
 const response=await chat({question:questions[0],user,repository:repo(false),config,client});
 assert.equal(client.requests.length,1);assert.equal(response.aiFailureCode,'AI_RATE_LIMITED');assert.ok(response.text.includes('BHYT'));
});
test('Fasting follow-up asks exam type, without tools or a fasting duration',async()=>{
 for(const question of ['có cần nhịn ăn không?','co can nhin an khong']){
  const client=ai('Bạn khám chuyên khoa nào hoặc làm xét nghiệm gì? Không tự nhịn ăn hay ngừng thuốc; hãy hỏi cơ sở khám.');
  const response=await chat({question,history:[{role:'user',content:questions[0]}],user,repository:repo(false),config,client});
  assert.equal(response.mode,'ai');assert.equal(response.intent,'visit_fasting');assert.equal(client.requests[0].tools,undefined);
 }
});
test('Unsafe AI fasting instruction becomes safe functional guidance',async()=>{
 for(const text of ['Bạn nên nhịn ăn 8 giờ và ngừng thuốc.','Bạn không cần nhịn ăn. Bạn khám gì?']) {
  const response=await chat({question:'có cần nhịn ăn không?',user,repository:repo(false),config,client:ai(text)});
  assert.equal(response.mode,'functional');assert.equal(response.aiFailureCode,'AI_UNSAFE_OUTPUT');assert.ok(response.text.includes('xét nghiệm gì?'));
 }
});
test('A timed-out general reply falls back to preparation, never appointment data',async()=>{
 const client={chat:{completions:{create:()=>new Promise(()=>{})}}};
 const response=await chat({question:questions[0],user,repository:repo(false),config,client,timeoutMs:5});
 assert.equal(response.aiFailureCode,'AI_TIMEOUT');assert.equal(response.aiDiagnostic.step,'timeout');assert.ok(response.text.includes('BHYT'));
});
test('Real appointment lookups and emergencies retain their intents',()=>{
 assert.equal(detectIntent('xem lịch khám'),'appointments');assert.equal(detectIntent('tôi đi khám ngày nào'),'appointments');
 assert.equal(detectIntent('khó thở trước khi đi khám cần chuẩn bị gì'),'emergency');
});
