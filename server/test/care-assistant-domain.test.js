const test = require('node:test');
const assert = require('node:assert/strict');
const { classifyDomain, OUT_OF_SCOPE } = require('../src/services/careAssistant.context');
const { chat } = require('../src/services/careAssistant.ai');
const { answer } = require('../src/services/careAssistant.service');

const config = { configured: true, provider: 'groq', key: 'mock', model: 'mock-model' };
const user = { userId: 1, tenVaiTro: 'NguoiCaoTuoi' };
const profile = { id: 7, hoTen: 'Hồ sơ thử' };
function repository() {
  const reads = [];
  const authorizations = [];
  return { reads, authorizations,
    authorize: async needsProfile => authorizations.push(needsProfile),
    read: async section => { reads.push(section); return { rows: [], truncated: false }; } };
}
function tool(name) {
  return { choices: [{ finish_reason: 'tool_calls', message: { role: 'assistant', content: null,
    tool_calls: [{ id: 'call_1', type: 'function', function: { name, arguments: '{}' } }] } }] };
}
function reply(content) {
  return { choices: [{ finish_reason: 'stop', message: { role: 'assistant', content } }] };
}
function client(responses) {
  const requests = [];
  return { requests, chat: { completions: { create: async params => {
    requests.push(params);
    const next = responses.shift();
    if (next instanceof Error) throw next;
    return next;
  } } } };
}
const run = (question, overrides = {}) => chat({ question, history: [], user, profile, config,
  repository: repository(), ...overrides });

test('Reported code/web questions are OUT_OF_SCOPE in classifier and both fallback routes', async () => {
  for (const question of ['ban biet code ko', 'toi muon ban code cho toi 1 trang web']) {
    assert.equal(classifyDomain(question), 'OUT_OF_SCOPE');
    const repo = repository(); const ai = client([]);
    const routed = await run(question, { repository: repo, client: ai });
    const fallback = await answer({ question, profile, user, repository: repo });
    assert.equal(routed.domain, 'OUT_OF_SCOPE');
    assert.equal(routed.modeReason, 'out_of_scope');
    assert.equal(routed.text, OUT_OF_SCOPE);
    assert.equal(fallback.text, OUT_OF_SCOPE);
    assert.deepEqual(repo.reads, []);
    assert.equal(ai.requests.length, 0);
  }
});

test('Requested HEALTH and APP examples retain their respective routes', async () => {
  const health = 'tôi bị đau đầu thì nên làm gì';
  assert.equal(classifyDomain(health), 'HEALTH');
  const healthAI = client([reply('Bạn có thể nghỉ ngơi; nếu đau dữ dội hoặc kéo dài, hãy đi khám.')]);
  assert.equal((await run(health, { client: healthAI })).mode, 'ai');
  assert.equal(healthAI.requests.length, 1);
  const medication = 'thuốc của tôi hôm nay là gì';
  assert.equal(classifyDomain(medication), 'APP');
  const repo = repository();
  const app = await run(medication, { repository: repo, client: client([tool('care_medications')]) });
  assert.equal(app.domain, 'APP');
  assert.deepEqual(repo.reads, ['medications']);
  const sos = 'làm sao mở SOS';
  assert.equal(classifyDomain(sos), 'APP');
  const sosReply = await run(sos, { client: client([]) });
  assert.match(sosReply.text, /mở tab SOS.*nhấn giữ.*3 giây/i);
});

test('Natural symptom and general medicine questions are HEALTH, including previously unknown wording', async () => {
  for (const question of ['Tôi bị đau đầu thì nên làm gì?', 'Tôi bị đau đầu hôm nay',
    'Thuốc paracetamol có tác dụng phụ gì?', 'Người cao tuổi nên vận động thế nào?',
    'co thuoc nao tri mat ngu ko', 'có thuốc nào giảm cân không',
    'có thuốc nào giảm độ cân không', 'Giảm cân lành mạnh thế nào?',
    'toi bi chong mat thi lam sao']) {
    assert.equal(classifyDomain(question), 'HEALTH');
  }
  const repo = repository();
  const ai = client([reply('Bạn nên nghỉ ngơi và uống đủ nước. Nếu đau đầu dữ dội hoặc kéo dài, hãy đi khám.')]);
  const result = await run('Tôi bị đau đầu thì nên làm gì?', { repository: repo, client: ai });
  assert.equal(result.domain, 'HEALTH');
  assert.equal(result.mode, 'ai');
  assert.equal(result.intent, 'health_general');
  assert.match(result.text, /nghỉ ngơi/);
  assert.deepEqual(repo.reads, []);
  assert.equal(ai.requests[0].tools, undefined);
});

test('General medicine question does not query the personal medication schedule', async () => {
  const repo = repository();
  const ai = client([reply('Thuốc điều trị mất ngủ cần được đánh giá theo nguyên nhân. Bạn nên trao đổi với nhân viên y tế trước khi dùng thuốc.')]);
  const result = await run('co thuoc nao tri mat ngu ko', { repository: repo, client: ai });
  assert.equal(result.domain, 'HEALTH');
  assert.equal(result.mode, 'ai');
  assert.deepEqual(repo.reads, []);
  assert.equal(ai.requests[0].tools, undefined);
});

test('HEALTH refusal is retried once and never shown as an AI health answer', async () => {
  const repo = repository();
  const ai = client([reply(OUT_OF_SCOPE), reply('Chóng mặt có nhiều nguyên nhân. Bạn bị bao lâu rồi, có kèm đau đầu hoặc buồn nôn không?')]);
  const result = await run('toi bi chong mat thi lam sao', { repository: repo, client: ai });
  assert.equal(result.mode, 'ai');
  assert.equal(result.domain, 'HEALTH');
  assert.match(result.text, /Chóng mặt/);
  assert.notEqual(result.text, OUT_OF_SCOPE);
  assert.equal(ai.requests.length, 2);
  assert.deepEqual(repo.reads, []);
  assert.doesNotMatch(ai.requests[0].messages[0].content, /chỉ trả lời: “Xin lỗi, tôi chỉ hỗ trợ/);

  const repeated = await run('toi bi chong mat thi lam sao', { client: client([reply(OUT_OF_SCOPE), reply(OUT_OF_SCOPE)]) });
  assert.equal(repeated.modeReason, 'ai_unavailable');
  assert.equal(repeated.aiFailureCode, 'AI_SCOPE_MISMATCH');
  assert.match(repeated.text, /AI hiện không khả dụng/);
  assert.notEqual(repeated.text, OUT_OF_SCOPE);
});

test('APP personal lookup prefers scoped API data, not an AI-authored patient fact', async () => {
  const repo = repository();
  const ai = client([tool('care_medications')]);
  const result = await run('Lịch thuốc hôm nay của tôi?', { repository: repo, client: ai });
  assert.equal(classifyDomain('Lịch thuốc hôm nay của tôi?'), 'APP');
  assert.equal(result.domain, 'APP');
  assert.equal(result.modeReason, 'grounded_data');
  assert.deepEqual(repo.reads, ['medications']);
  assert.deepEqual(ai.requests[0].tools.map(item => item.function.name), ['care_medications']);
  assert.ok(!ai.requests[0].tools.some(item => /(?:send|update|delete|confirm)/i.test(item.function.name)));
});

test('APP how-to uses the verified feature guide, without reading a patient record', async () => {
  const repo = repository();
  const ai = client([tool('care_general_help'), reply('Mở Trang chủ rồi chạm nút Đo & Cập nhật chỉ số mới để nhập số đo.')]);
  const result = await run('Làm sao nhập chỉ số sức khỏe trên CareSenior?', { repository: repo, client: ai });
  assert.equal(result.domain, 'APP');
  assert.equal(result.intent, 'app_guidance');
  assert.equal(result.mode, 'ai');
  assert.deepEqual(repo.reads, []);
  assert.deepEqual(ai.requests[0].tools.map(item => item.function.name), ['care_general_help']);
  const offline = await run('Làm sao nhập chỉ số sức khỏe trên CareSenior?',
    { repository: repository(), config: { configured: false } });
  assert.equal(offline.mode, 'functional');
  assert.match(offline.text, /Trang chủ.*Đo & Cập nhật/);
});

test('OUT_OF_SCOPE is refused without AI, patient reads or inherited medication context', async () => {
  for (const question of ['Tư vấn chứng khoán', 'Hãy viết bài văn về mùa hè',
    'Giải toán cho tôi', 'Gợi ý chuyến du lịch']) {
    assert.equal(classifyDomain(question), 'OUT_OF_SCOPE');
  }
  const repo = repository();
  const ai = client([new Error('AI must not run')]);
  const result = await run('Viết game bằng Python cho tôi', { repository: repo, client: ai,
    history: [{ role: 'user', content: 'Lịch thuốc hôm nay?' }] });
  assert.equal(classifyDomain('Viết game bằng Python cho tôi'), 'OUT_OF_SCOPE');
  assert.equal(result.domain, 'OUT_OF_SCOPE');
  assert.equal(result.text, OUT_OF_SCOPE);
  assert.deepEqual(repo.reads, []);
  assert.equal(ai.requests.length, 0);
});

test('Urgent symptoms give immediate safety guidance without waiting for AI or sending SOS', async () => {
  const repo = repository();
  const ai = client([]);
  const result = await run('Tôi đau ngực và khó thở', { repository: repo, client: ai });
  assert.equal(result.domain, 'HEALTH');
  assert.equal(result.modeReason, 'safety');
  assert.match(result.text, /hỗ trợ y tế ngay/);
  assert.deepEqual(result.actions, ['sos', 'caregivers']);
  assert.deepEqual(repo.reads, []);
  assert.equal(ai.requests.length, 0);
});

test('SOS question only explains tab SOS and holding three seconds', async () => {
  const repo = repository();
  const result = await run('Gửi SOS giúp tôi', { repository: repo, client: client([]) });
  assert.equal(result.domain, 'APP');
  assert.match(result.text, /mở tab SOS.*nhấn giữ.*3 giây/i);
  assert.match(result.text, /không thể tự gửi SOS/i);
  assert.deepEqual(repo.reads, []);
});

test('AI timeout and connection error are disclosed, never replaced by invented health advice', async () => {
  const question = 'Tôi bị đau đầu thì nên làm gì?';
  const timeoutClient = { chat: { completions: { create: () => new Promise(() => {}) } } };
  const timeout = await run(question, { client: timeoutClient, timeoutMs: 5 });
  assert.equal(timeout.modeReason, 'ai_unavailable');
  assert.equal(timeout.aiFailureCode, 'AI_TIMEOUT');
  assert.match(timeout.text, /AI hiện không khả dụng/);
  assert.doesNotMatch(timeout.text, /nghỉ ngơi|uống thuốc/);
  const offline = await run(question, { client: client([new Error('private connection detail')]) });
  assert.equal(offline.modeReason, 'ai_unavailable');
  assert.match(offline.text, /AI hiện không khả dụng/);
  assert.doesNotMatch(JSON.stringify(offline), /private connection detail/);
  const unconfigured = await run(question, { config: { configured: false } });
  assert.equal(unconfigured.modeReason, 'missing_config');
  assert.match(unconfigured.text, /AI hiện không khả dụng/);
});

test('AI cannot claim it confirmed a medication dose', async () => {
  const ai = client([reply('Tôi đã xác nhận uống thuốc cho bạn.')]);
  const result = await run('Tôi bị đau đầu thì nên làm gì?', { client: ai });
  assert.equal(result.aiFailureCode, 'AI_UNSAFE_OUTPUT');
  assert.doesNotMatch(result.text, /đã xác nhận uống thuốc/);
});
