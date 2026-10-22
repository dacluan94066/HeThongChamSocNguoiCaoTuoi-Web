// Live provider check using only synthetic identity/data. No database writes.
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
require('dotenv').config({ path: require('node:path').resolve(__dirname, '../.env'), quiet: true });
const { chat, configuration, createAIClient } = require('../src/services/careAssistant.ai');
const { encodeContext, decodeContext } = require('../src/services/careAssistant.session');
const { OUT_OF_SCOPE } = require('../src/services/careAssistant.context');

async function main() {
  const config = configuration();
  assert.equal(config.configured, true, 'AI_CONFIG_REQUIRED');
  process.env.JWT_SECRET = crypto.randomBytes(32).toString('hex');
  const user = { userId: -1, tenVaiTro: 'NguoiCaoTuoi' }, profile = { id: -1 };
  const history = [], reads = [];
  const sdk = createAIClient(config);
  let lastGenerated, providerError;
  const client = { chat: { completions: { create: async (...args) => {
    try {
      const response = await sdk.chat.completions.create(...args);
      lastGenerated = response.choices?.[0]?.message?.content;
      return response;
    } catch (error) {
      providerError = { status: error.status, code: error.error?.code || error.code,
        message: error.error?.message?.slice(0, 300) };
      throw error;
    }
  } } } };
  const repository = { authorize: async () => {}, read: async section => {
    reads.push(section); return { rows: [], truncated: false };
  } };
  let sessionContext;
  for (const question of ['có tìm thông tin về một loại thuốc cụ thể', 'Paracetamol',
    'loại này có gây buồn ngủ không?', 'vậy có dùng liên tục được không?']) {
    const reply = await chat({ question, history: history.slice(-8), sessionContext, profile, user, repository, config, client });
    assert.equal(reply.domain, 'HEALTH', reply.aiFailureCode || reply.text);
    assert.equal(reply.mode, 'ai', JSON.stringify({ code: reply.aiFailureCode || reply.modeReason, providerError, syntheticOutput: lastGenerated }));
    assert.doesNotMatch(reply.text, /Chưa có lịch uống thuốc|Xin lỗi, tôi chỉ hỗ trợ/);
    assert.deepEqual(reads, []);
    const token = encodeContext(reply.conversationContext, user, profile);
    assert.ok(token); assert.ok(token.length <= 4000);
    sessionContext = decodeContext(token, user, profile);
    history.push({ role: 'user', content: question }, { role: 'assistant', content: reply.text });
    console.log(JSON.stringify({ question, mode: reply.mode, domain: reply.domain, sample: reply.text.slice(0, 240), passed: true }));
  }
  for (const question of ['ban biet code ko', 'toi muon ban code cho toi 1 trang web']) {
    const reply = await chat({ question, history: history.slice(-8), sessionContext, profile, user, repository, config });
    assert.equal(reply.domain, 'OUT_OF_SCOPE'); assert.equal(reply.text, OUT_OF_SCOPE);
    assert.deepEqual(reads, []);
    console.log(JSON.stringify({ question, domain: reply.domain, passed: true }));
  }
  const records = await chat({ question: 'thuốc của tôi hôm nay là gì', history: history.slice(-8), sessionContext,
    profile, user, repository, config });
  assert.equal(records.domain, 'APP'); assert.deepEqual(reads, ['medications']);
  console.log(JSON.stringify({ question: 'thuốc của tôi hôm nay là gì', domain: records.domain, passed: true }));
}
main().catch(error => { console.error(JSON.stringify({ result: 'FAIL', detail: error.message })); process.exitCode = 1; });
