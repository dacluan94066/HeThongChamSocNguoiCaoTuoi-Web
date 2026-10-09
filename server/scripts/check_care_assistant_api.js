// Opt-in end-to-end check: demo login + real HTTP chat, no personal-data questions.
// All credentials, token and response text remain only in memory.
require('dotenv').config({ path: require('node:path').resolve(__dirname, '../.env') });
async function main() {
  if (!process.env.SEED_PASSWORD) {
    console.log('DEMO_API_CHECK: SKIPPED_NO_DEMO_PASSWORD'); process.exitCode = 2; return;
  }
  const base = 'http://localhost:' + (process.env.PORT || '5000') + '/api';
  const send = async (path, body, token) => {
    const response = await fetch(base + path, { method: body ? 'POST' : 'GET',
      headers: { 'Content-Type': 'application/json', Origin: 'http://localhost:63002',
        ...(token ? { Authorization: 'Bearer ' + token } : {}) },
      ...(body ? { body: JSON.stringify(body) } : {}), signal: AbortSignal.timeout(45000) });
    return { status: response.status, body: await response.json() };
  };
  const login = await send('/auth/login', { tenDangNhap: 'caregiver01',
    matKhau: process.env.SEED_PASSWORD, platform: 'mobile' });
  console.log(JSON.stringify({ stage: 'demo_login', status: login.status }));
  const token = login.body.data?.token;
  if (login.status !== 200 || !token) { process.exitCode = 1; return; }
  const runtime = await send('/care-assistant/status', null, token);
  const status = runtime.body.data;
  console.log(JSON.stringify({ stage: 'runtime_config', status: runtime.status,
    provider: status?.provider, model: status?.model, keyConfigured: status?.keyConfigured,
    aiConfigured: status?.aiConfigured }));
  const history = [];
  for (const [stage, question] of [['greeting', 'Xin chào'], ['followup', 'Bạn vừa giới thiệu những gì?']]) {
    const reply = await send('/care-assistant/chat', { question, history }, token);
    const data = reply.body.data;
    console.log(JSON.stringify({ stage, status: reply.status, mode: data?.mode,
      modeReason: data?.modeReason, aiFailureCode: data?.aiFailureCode }));
    if (reply.status !== 200 || data?.mode !== 'ai' || typeof data.text !== 'string' || !data.text.trim()) {
      process.exitCode = 1; return;
    }
    history.push({ role: 'user', content: question }, { role: 'assistant', content: data.text });
  }
  console.log('DEMO_API_CHECK: OK_GREETING_AND_FOLLOWUP');
}
if (require.main === module) {
  main().catch(() => { console.log('DEMO_API_CHECK: FAILED_TRANSPORT'); process.exitCode = 1; });
}
