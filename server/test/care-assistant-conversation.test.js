const test = require('node:test');
const assert = require('node:assert/strict');
const { chat } = require('../src/services/careAssistant.ai');
const { OUT_OF_SCOPE } = require('../src/services/careAssistant.context');
const { healthMemory } = require('../src/services/careAssistant.router');
const { encodeContext, decodeContext } = require('../src/services/careAssistant.session');

const config = { configured: true, provider: 'groq', model: 'mock-model', key: 'mock-only' };
const user = { userId: 1, tenVaiTro: 'NguoiCaoTuoi' }, profile = { id: 7, hoTen: 'PRIVATE_PROFILE_NAME' };
const reportedQuestion = 'có tìm thông tin về một loại thuốc cụ thể';
const textResponse = content => ({ choices: [{ finish_reason: 'stop', message: { role: 'assistant', content } }] });
const routeResponse = (domain, intent, text = null) => textResponse(JSON.stringify({ domain, intent, text }));
const toolResponse = () => ({ choices: [{ finish_reason: 'tool_calls', message: { role: 'assistant', content: null,
  tool_calls: [{ id: 'one', type: 'function', function: { name: 'care_medications', arguments: '{}' } }] } }] });
function repository() {
  const reads = [];
  return { reads, authorize: async () => {}, read: async section => {
    reads.push(section); return { rows: [{ id: 1, tenThuoc: 'PRIVATE_SAVED_MEDICINE', lieuDung: 'Theo đơn',
      thoiGianDuKien: '2026-10-20T08:00:00', trangThai: 'ChuaDenGio' }], truncated: false };
  } };
}
function client(responses) {
  const requests = [];
  return { requests, chat: { completions: { create: async (params, options) => {
    requests.push({ params: structuredClone(params), options });
    const next = responses.shift();
    if (next instanceof Error) throw next;
    return typeof next === 'function' ? next(params, options) : next;
  } } } };
}
const run = (question, options = {}) => chat({ question, history: [], profile, user, config, repository: repository(), ...options });

test('Reported medicine-information question asks its name in one AI call with no schedule lookup', async () => {
  const repo = repository();
  const ai = client([routeResponse('HEALTH', 'health_general', 'Bạn muốn tìm hiểu thuốc nào?')]);
  const reply = await run(reportedQuestion, { repository: repo, client: ai });
  assert.equal(reply.domain, 'HEALTH'); assert.equal(reply.mode, 'ai');
  assert.equal(reply.text, 'Bạn muốn tìm hiểu thuốc nào?');
  assert.deepEqual(reply.rows, []); assert.deepEqual(reply.actions, []); assert.deepEqual(repo.reads, []);
  assert.equal(ai.requests.length, 1);
  assert.equal(ai.requests[0].params.tools, undefined);
  assert.equal(ai.requests[0].params.response_format.type, 'json_object');
  assert.ok(!JSON.stringify(ai.requests).includes(profile.hoTen));
});

test('Unknown natural health wording is classified semantically instead of rejected by default', async () => {
  for (const question of ['co tim thong tin ve mot loai thuoc cu the', 'tôi cứ thấy lâng lâng suốt',
    'ăn ít bữa có tốt không?', 'Paracetamol']) {
    const repo = repository();
    const ai = client([routeResponse('HEALTH', 'health_general', 'Bạn muốn mình giải thích thêm điều gì về vấn đề này?')]);
    const reply = await run(question, { repository: repo, client: ai });
    assert.equal(reply.mode, 'ai', question); assert.equal(reply.domain, 'HEALTH');
    assert.deepEqual(repo.reads, []); assert.equal(ai.requests.length, 1);
  }
});

test('Signed health exchange supports a medicine-name answer and short follow-ups without replaying private assistant history', async () => {
  process.env.JWT_SECRET = 'conversation-tests-only';
  const ai = client([
    routeResponse('HEALTH', 'health_general', 'Bạn muốn tìm hiểu thuốc nào?'),
    routeResponse('HEALTH', 'health_general', 'Paracetamol là thuốc giảm đau, hạ sốt. Bạn muốn biết thêm về tác dụng phụ không?'),
    routeResponse('HEALTH', 'health_general', 'Mình có thể giải thích tác dụng phụ thường gặp của paracetamol.'),
  ]);
  const repo = repository();
  const first = await run(reportedQuestion, { repository: repo, client: ai });
  const firstContext = decodeContext(encodeContext(first.conversationContext, user, profile), user, profile);
  const second = await run('Paracetamol', { repository: repo, client: ai, sessionContext: firstContext,
    history: [{ role: 'user', content: reportedQuestion }, { role: 'assistant', content: 'PRIVATE_OLD_PATIENT_RECORD: take 999 tablets' }] });
  assert.equal(second.domain, 'HEALTH'); assert.equal(second.mode, 'ai');
  assert.ok(ai.requests[1].params.messages.some(turn => turn.role === 'assistant' && turn.content === first.text));
  assert.doesNotMatch(JSON.stringify(ai.requests), /PRIVATE_OLD_PATIENT_RECORD|PRIVATE_PROFILE_NAME|PRIVATE_SAVED_MEDICINE/);
  const secondContext = decodeContext(encodeContext(second.conversationContext, user, profile), user, profile);
  const third = await run('loại này có gây buồn ngủ không?', { repository: repo, client: ai, sessionContext: secondContext,
    history: [{ role: 'user', content: 'Paracetamol' }, { role: 'assistant', content: second.text }] });
  assert.equal(third.mode, 'ai'); assert.equal(third.domain, 'HEALTH');
  assert.deepEqual(repo.reads, []); assert.equal(ai.requests.length, 3);
});

test('Health context stays bounded, signed and bound to the same account/profile', () => {
  process.env.JWT_SECRET = 'conversation-tests-only';
  const context = { topic: 'health_general', question: 'thuốc '.repeat(200), reply: 'Sức khỏe '.repeat(500), unexpected: 123 };
  const token = encodeContext(context, user, profile);
  assert.ok(token.length <= 4000);
  const decoded = decodeContext(token, user, profile);
  assert.ok(Buffer.byteLength(decoded.question) <= 500); assert.ok(Buffer.byteLength(decoded.reply) <= 1200);
  assert.equal(decoded.unexpected, undefined);
  for (const [account, selected, value] of [[{ userId: 2 }, profile, token], [user, { id: 8 }, token], [user, profile, token + 'x']])
    assert.throws(() => decodeContext(value, account, selected), error => error.code === 'INVALID_CONTEXT');
  assert.equal(healthMemory(decoded, [{ role: 'user', content: 'ban biet code ko' }]), null);
});

test('Explicit unrelated requests remain refused after health context without any AI or SQL calls', async () => {
  const repo = repository(), ai = client([]);
  const reply = await run('toi muon ban code cho toi 1 trang web', { repository: repo, client: ai,
    sessionContext: { topic: 'health_general', question: 'Paracetamol', reply: 'Bạn muốn hỏi gì thêm?' },
    history: [{ role: 'user', content: 'Paracetamol' }] });
  assert.equal(reply.text, OUT_OF_SCOPE); assert.equal(reply.domain, 'OUT_OF_SCOPE');
  assert.deepEqual(repo.reads, []); assert.equal(ai.requests.length, 0);
});

test('Unrecognized unrelated topics and ambiguous homework are refused after semantic classification', async () => {
  for (const question of ['tóm tắt phim hoạt hình này', 'Làm bài tập cho tôi', 'dầu động cơ là gì']) {
    const repo = repository(), ai = client([routeResponse('OUT_OF_SCOPE', 'out_of_scope')]);
    const reply = await run(question, { repository: repo, client: ai });
    assert.equal(reply.text, OUT_OF_SCOPE); assert.deepEqual(repo.reads, []);
    assert.equal(ai.requests.length, 1);
  }
});

test('Medicine-education wording is not forced into personal records merely because it mentions today', async () => {
  const repo = repository(), ai = client([routeResponse('HEALTH', 'health_general', 'Bạn muốn tìm hiểu công dụng của thuốc nào?')]);
  const reply = await run('thuốc hôm nay có tác dụng gì', { repository: repo, client: ai });
  assert.equal(reply.domain, 'HEALTH'); assert.equal(reply.mode, 'ai');
  assert.deepEqual(repo.reads, []);
});

test('Explicit personal-medication question still uses current scoped API, never health conversation memory', async () => {
  const repo = repository(), ai = client([toolResponse()]);
  const reply = await run('thuốc của tôi hôm nay là gì', { repository: repo, client: ai,
    sessionContext: { topic: 'health_general', question: 'Paracetamol', reply: 'GENERAL_HEALTH_MEMORY' },
    history: [{ role: 'user', content: 'Paracetamol' }] });
  assert.equal(reply.domain, 'APP'); assert.equal(reply.modeReason, 'grounded_data');
  assert.match(reply.text, /PRIVATE_SAVED_MEDICINE/); assert.deepEqual(repo.reads, ['medications']);
  assert.equal(ai.requests.length, 1); assert.equal(ai.requests[0].params.response_format, undefined);
  assert.doesNotMatch(JSON.stringify(ai.requests), /GENERAL_HEALTH_MEMORY|PRIVATE_SAVED_MEDICINE/);
});

test('A semantically understood record request can only choose an existing scoped read', async () => {
  const repo = repository(), ai = client([routeResponse('APP', 'medications'), toolResponse()]);
  const reply = await run('đọc giúp mình các viên đang phải dùng', { repository: repo, client: ai });
  assert.equal(reply.domain, 'APP'); assert.equal(reply.modeReason, 'grounded_data');
  assert.deepEqual(repo.reads, ['medications']);
  assert.equal(ai.requests[1].params.tools[0].function.name, 'care_medications');
  assert.doesNotMatch(JSON.stringify(ai.requests), /PRIVATE_SAVED_MEDICINE/);
});

test('App usage can be answered naturally using the verified feature guide without patient reads', async () => {
  const repo = repository(), ai = client([routeResponse('APP', 'app_guidance', 'Bạn mở tab Lịch khám để xem lịch do người chăm sóc đã nhập.')]);
  const reply = await run('ứng dụng này giúp mình làm những việc nào nhỉ', { repository: repo, client: ai });
  assert.equal(reply.mode, 'ai'); assert.equal(reply.intent, 'app_guidance');
  assert.match(ai.requests[0].params.messages[0].content, /Verified feature guide/);
  assert.deepEqual(repo.reads, []); assert.equal(ai.requests.length, 1);
});

for (const invalid of [
  { domain: 'OTHER', intent: 'health_general', text: 'x' },
  { domain: 'HEALTH', intent: 'send_sos', text: null },
  { domain: 'APP', intent: 'medications', text: 'A fabricated personal medication' },
  { domain: 'HEALTH', intent: 'health_general', text: 'x', elderlyId: 99 },
]) test('Invalid semantic route cannot read or mutate data: ' + JSON.stringify(invalid), async () => {
  const repo = repository(), ai = client([textResponse(JSON.stringify(invalid))]);
  const reply = await run(reportedQuestion, { repository: repo, client: ai });
  assert.equal(reply.aiFailureCode, 'AI_INVALID_ROUTE'); assert.equal(reply.intent, 'conversation');
  assert.match(reply.text, /AI hiện không khả dụng/);
  assert.deepEqual(repo.reads, []); assert.deepEqual(reply.actions, []);
});

test('Semantic answer passes the same unsafe-action guard and never sends SOS or confirms a dose', async () => {
  const repo = repository(), ai = client([routeResponse('HEALTH', 'health_general', 'Tôi đã xác nhận uống thuốc cho bạn.')]);
  const reply = await run(reportedQuestion, { repository: repo, client: ai });
  assert.equal(reply.aiFailureCode, 'AI_UNSAFE_OUTPUT');
  assert.deepEqual(repo.reads, []); assert.doesNotMatch(reply.text, /đã xác nhận/);
});

test('A generated medication regimen is corrected once and never shown as a new prescription', async () => {
  const repo = repository();
  const unsafe = 'Bạn có thể dùng paracetamol liên tục trong 5 ngày.';
  const ai = client([routeResponse('HEALTH', 'health_general', unsafe),
    textResponse('Việc dùng liên tục cần theo đơn và được bác sĩ hoặc dược sĩ kiểm tra, nhất là khi có bệnh gan hoặc dùng thuốc khác.')]);
  const reply = await run('vậy có dùng liên tục được không?', { repository: repo, client: ai,
    sessionContext: { topic: 'health_general', question: 'Paracetamol', reply: 'Bạn muốn hỏi thêm điều gì về paracetamol?' } });
  assert.equal(reply.mode, 'ai'); assert.doesNotMatch(reply.text, /5 ngày/);
  assert.equal(ai.requests.length, 2); assert.deepEqual(repo.reads, []);
  for (const unsafeText of [unsafe, 'Bạn có thể dùng thuốc trong thời gian ngắn khoảng 4–6 giờ.',
    'Bạn không nên dùng liên tục quá 24 giờ.']) {
    const rejected = await run(reportedQuestion, { client: client([
      routeResponse('HEALTH', 'health_general', unsafeText), textResponse(unsafeText),
    ]) });
    assert.equal(rejected.aiFailureCode, 'AI_UNSAFE_OUTPUT');
    assert.doesNotMatch(rejected.text, /5 ngày|24 giờ|4–6 giờ/);
  }
});

test('A greeting after a personal lookup cannot replay private assistant records to AI', async () => {
  const ai = client([textResponse('Chào bạn!')]);
  const reply = await run('Xin chào', { client: ai, history: [
    { role: 'user', content: 'thuốc hôm nay' },
    { role: 'assistant', content: 'PRIVATE_API_RECORD_FROM_OLD_REPLY' },
  ] });
  assert.equal(reply.mode, 'ai');
  assert.doesNotMatch(JSON.stringify(ai.requests), /PRIVATE_API_RECORD_FROM_OLD_REPLY/);
});

test('Semantically detected danger returns immediate local safety guidance rather than a generated diagnosis', async () => {
  const repo = repository(), ai = client([routeResponse('HEALTH', 'emergency')]);
  const reply = await run('đột nhiên tôi không cử động được một bên người', { repository: repo, client: ai });
  assert.equal(reply.modeReason, 'safety'); assert.match(reply.text, /hỗ trợ y tế ngay/);
  assert.deepEqual(reply.actions, ['sos', 'caregivers']); assert.deepEqual(repo.reads, []);
  assert.equal(ai.requests.length, 1);
});

test('Missing config, network error and quota never turn ambiguous health questions into API lookups', async () => {
  for (const options of [{ config: { configured: false } },
    { client: client([new Error('private upstream detail')]) },
    { client: client([Object.assign(new Error('private quota detail'), { status: 429 })]) }]) {
    const repo = repository();
    const reply = await run(reportedQuestion, { ...options, repository: repo });
    assert.equal(reply.intent, 'conversation'); assert.match(reply.text, /AI hiện không khả dụng/);
    assert.deepEqual(repo.reads, []); assert.deepEqual(reply.actions, []);
    assert.doesNotMatch(JSON.stringify(reply), /private|Chưa có lịch uống thuốc/);
  }
});

test('One total timeout covers semantic routing; timeout aborts without any personal-data fallback', async () => {
  const repo = repository(); let signal;
  const ai = { chat: { completions: { create: (_params, options) => { signal = options.signal; return new Promise(() => {}); } } } };
  const reply = await run(reportedQuestion, { repository: repo, client: ai, timeoutMs: 5 });
  assert.equal(reply.aiFailureCode, 'AI_TIMEOUT'); assert.equal(signal.aborted, true);
  assert.deepEqual(repo.reads, []); assert.match(reply.text, /AI hiện không khả dụng/);
});

test('Provider JSON-generation failure gets one bounded retry without replaying failed output', async () => {
  const invalidJson = () => Object.assign(new Error('private failed generation'), {
    status: 400, error: { code: 'json_validate_failed', failed_generation: 'UNTRUSTED_PROVIDER_OUTPUT' },
  });
  const repo = repository(), ai = client([invalidJson(),
    routeResponse('HEALTH', 'health_general', 'Bạn muốn tìm hiểu thuốc nào?')]);
  const reply = await run(reportedQuestion, { repository: repo, client: ai });
  assert.equal(reply.mode, 'ai'); assert.equal(ai.requests.length, 2);
  assert.doesNotMatch(JSON.stringify(ai.requests), /UNTRUSTED_PROVIDER_OUTPUT/);
  assert.deepEqual(repo.reads, []);
  const unavailableAI = client([invalidJson(), invalidJson()]);
  const unavailable = await run(reportedQuestion, { repository: repo, client: unavailableAI });
  assert.equal(unavailableAI.requests.length, 2);
  assert.equal(unavailable.aiFailureCode, 'AI_HTTP_400');
  assert.match(unavailable.text, /AI hiện không khả dụng/);
  assert.deepEqual(repo.reads, []);
});
