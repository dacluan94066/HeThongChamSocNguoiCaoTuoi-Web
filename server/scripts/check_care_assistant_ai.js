// Opt-in check: synthetic records only, no database, secrets, prompts or outputs logged.
const { chat, configuration, createAIClient } = require('../src/services/careAssistant.ai');
async function checkConnection({ config, client = createAIClient(config) }) {
  let status;
  const original = client.chat.completions.create.bind(client.chat.completions);
  const wrapped = { chat: { completions: { create: async (...args) => {
    try { return await original(...args); }
    catch (error) { status = Number.isInteger(error.status) ? error.status : undefined; throw error; }
  } } } };
  const repository = { authorize: async () => {}, read: async section => ({
    rows: section === 'appointments' ? [{ thoiGianKham: '2099-01-03T08:00:00',
      tenBenhVien: 'CO SO GIA LAP - KHONG PHAI DU LIEU NGUOI THAT', soNgayConLai: 2 }] : [],
    truncated: false,
  }) };
  const base = { config, client: wrapped, repository, profile: { id: -1 },
    user: { userId: -1, tenVaiTro: 'NguoiCaoTuoi' }, now: new Date('2099-01-01T00:00:00Z') };
  const first = await chat({ ...base, question: 'Lịch khám tiếp theo?' });
  if (first.modeReason !== 'grounded_data') return { ok: false, status, code: first.modeReason };
  const second = await chat({ ...base, question: 'Còn mấy ngày nữa?',
    history: [{ role: 'user', content: 'Lịch khám tiếp theo?' }, { role: 'assistant', content: first.text }] });
  return { ok: second.modeReason === 'grounded_data' && second.text.includes('Còn 2 ngày'), status, code: second.modeReason };
}
if (require.main === module) {
  require('dotenv').config({ path: require('node:path').resolve(__dirname, '../.env') });
  const env = { ...process.env };
  const modelIndex = process.argv.indexOf('--model');
  // Temporary non-secret diagnostic override; never modifies .env.
  if (modelIndex !== -1) env.GROQ_MODEL = process.argv[modelIndex + 1];
  const config = configuration(env);
  console.log('AI_PROVIDER: ' + (config.provider === 'groq' ? 'groq' : 'missing_or_unsupported'));
  console.log('GROQ_API_KEY: ' + (config.key ? 'configured' : 'missing'));
  console.log('GROQ_MODEL: ' + (config.model ? 'configured' : 'missing'));
  if (!config.configured) {
    console.log('Live Groq check: SKIPPED_MISSING_CONFIG');
    process.exitCode = 2;
  } else {
    checkConnection({ config }).then(result => {
      console.log('Live Groq check: ' + (result.ok ? 'OK_SYNTHETIC_TOOLS_AND_FOLLOWUP' :
        'FAILED_' + (result.status ? 'HTTP_' + result.status : 'AI_UNAVAILABLE')));
      if (!result.ok) process.exitCode = 1;
    }).catch(() => { console.log('Live Groq check: FAILED'); process.exitCode = 1; });
  }
}
module.exports = { checkConnection };
