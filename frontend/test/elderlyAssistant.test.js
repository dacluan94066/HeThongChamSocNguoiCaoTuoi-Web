import test from 'node:test';
import assert from 'node:assert/strict';
import { assistantActions, assistantHistory, assistantSessionExpiry, createElderlyAssistantApi, createElderlyAssistantStore } from '../src/utils/elderlyAssistant.js';

const deferred = () => { let resolve, reject; const promise = new Promise((yes, no) => { resolve = yes; reject = no; }); return { promise, resolve, reject }; };
const envelope = data => ({ data: { success: true, data } });
const reply = patch => ({ mode: 'ai', domain: 'HEALTH', text: 'Phản hồi từ AI', profile: { id: 170 }, actions: [], ...patch });
const setup = async (chat = async () => reply(), extra = {}) => {
  const calls = [], api = { context: async () => ({ aiConfigured: true }), chat: async (body, signal) => { calls.push({ body, signal }); return chat(body, signal); } };
  const store = createElderlyAssistantStore({ api, ...extra }); await store.loadContext();
  return { store, calls, item: () => store.getSnapshot().conversations.find(item => item.id === store.getSnapshot().selectedId) };
};

test('AI adapter uses existing read-only routes, captured own ID and 45s chat timeout', async () => {
  const calls = [], client = { get: async (path, config) => { calls.push({ path, config }); return envelope(path.endsWith('profiles') ? [{ id: 170 }] : { aiConfigured: false }); },
    post: async (path, body, config) => { calls.push({ path, body, config }); return envelope(reply({ rows: [{ secret: true }], actions: ['sos', 'medications', 'https://bad.invalid', 'confirm', { url: '/emergency-alerts' }] })); } };
  const api = createElderlyAssistantApi(client, 170, () => 'session-stamp');
  assert.deepEqual(await api.context(), { aiConfigured: false });
  const answer = await api.chat({ question: 'đau đầu', history: [], conversationToken: 'signed' });
  assert.deepEqual(calls.map(call => call.path), ['/care-assistant/profiles', '/care-assistant/status', '/care-assistant/chat']);
  assert.deepEqual(calls[2].body, { question: 'đau đầu', elderlyId: 170, history: [], conversationToken: 'signed' });
  assert.equal(calls[2].config.timeout, 45000); assert.equal(calls[2].config.webSessionStamp, 'session-stamp');
  assert.equal('rows' in answer, false); assert.deepEqual(answer.actions.map(action => action.to), ['/ca-nhan/sos', '/ca-nhan/lich-trinh?tab=thuoc']);
});
test('foreign profile list or chat response never reaches the UI', async () => {
  for (const profiles of [[{ id: 171 }], [{ id: 170 }, { id: 171 }], []]) {
    const api = createElderlyAssistantApi({ get: async path => envelope(path.endsWith('profiles') ? profiles : { aiConfigured: true }) }, 170);
    await assert.rejects(api.context(), /INVALID_OWNER/);
  }
  const api = createElderlyAssistantApi({ post: async () => envelope(reply({ profile: { id: 171 } })) }, 170);
  await assert.rejects(api.chat({ question: 'thuốc của tôi', history: [] }), /INVALID_REPLY/);
});
test('action allowlist cannot mutate, navigate outside own Web or open external resources', () => {
  assert.equal(assistantActions(['sos', 'sos', 'notes', 'confirm_medication', 'javascript:alert(1)', '/dashboard', '__proto__', 'constructor']).length, 1);
  assert.equal(assistantActions(['sos'])[0].to, '/ca-nhan/sos');
  assert.deepEqual(assistantActions(null), []);
});
test('APP / HEALTH / OUT_OF_SCOPE are backend decisions and fallback mode remains honest', async () => {
  for (const domain of ['APP', 'HEALTH', 'OUT_OF_SCOPE']) {
    const { store, item } = await setup(async () => reply({ domain, mode: domain === 'HEALTH' ? 'ai' : 'functional' }));
    store.setDraft('Câu hỏi tự nhiên'); await store.send();
    assert.equal(item().messages[1].domain, domain); assert.equal(item().messages[1].mode, domain === 'HEALTH' ? 'ai' : 'functional');
  }
});
test('history obeys backend bounds, excludes failed turns, only passes role/content', () => {
  const history = assistantHistory(Array.from({ length: 20 }, (_, index) => ({ role: index % 2 ? 'assistant' : 'user', text: 'x'.repeat(2400), private: 'never forwarded', failed: index === 19 })));
  assert.ok(history.length <= 8); assert.ok(history.reduce((sum, row) => sum + row.content.length, 0) <= 6000);
  assert.ok(history.every(row => Object.keys(row).join(',') === 'role,content' && row.content.length <= (row.role === 'user' ? 500 : 2200)));
});
test('new/select preserve separate conversations and signed context in RAM only', async () => {
  const { store, calls, item } = await setup(async () => reply({ conversationToken: 'signed-context' }));
  store.setDraft('Tôi bị đau đầu'); await store.send(); const first = item().id;
  store.setDraft('hai ngày rồi'); await store.send();
  assert.equal(calls[1].body.conversationToken, 'signed-context'); assert.equal(calls[1].body.history.length, 2);
  store.create(); const second = item().id; assert.notEqual(first, second); assert.equal(item().messages.length, 0);
  store.setDraft('lịch khám'); await store.send(); assert.equal(calls[2].body.history.length, 0); assert.equal(calls[2].body.conversationToken, null);
  store.select(first); assert.equal(item().messages.length, 4); store.remove(first); assert.equal(item().id, second);
});
test('single flight; cancelling/switching ignores late model response and does not resend', async () => {
  const slow = deferred(), { store, calls, item } = await setup(() => slow.promise);
  store.setDraft('đau đầu'); const request = store.send(); assert.equal(await store.send(), false);
  store.create(); const id = item().id; slow.resolve(reply()); await request;
  assert.equal(item().id, id); assert.equal(item().messages.length, 0); assert.equal(calls.length, 1); assert.equal(calls[0].signal.aborted, true);
});
test('session change/dispose clear content and context, and reject late responses', async () => {
  const slow = deferred(); let current = true;
  const { store, item } = await setup(() => slow.promise, { current: () => current });
  store.setDraft('Thông tin sức khỏe riêng'); const request = store.send(); current = false; store.dispose();
  slow.resolve(reply()); await request;
  assert.equal(item().messages.length, 0); assert.equal(item().token, null); assert.equal(item().draft, '');
  store.activate(); store.setDraft('stale'); assert.equal(item().draft, ''); assert.equal(await store.send(), false);
});
test('StrictMode cleanup/reactivation reloads context without losing subscribers', async () => {
  const { store } = await setup(); let updates = 0; const off = store.subscribe(() => updates++);
  store.dispose(); store.activate(); await store.loadContext(); store.setDraft('mới');
  assert.equal(store.getSnapshot().contextPhase, 'ready'); assert.ok(updates >= 3); off();
});
test('timeout/network errors are explicit, no fabricated assistant and no automatic retries', async () => {
  for (const error of [Error('offline'), Object.assign(Error('timeout'), { code: 'ECONNABORTED' })]) {
    const { store, calls, item } = await setup(async () => { throw error; });
    store.setDraft('câu hỏi'); assert.equal(await store.send(), false);
    assert.equal(item().messages.length, 1); assert.equal(item().messages[0].failed, true); assert.match(item().error, /không tự gửi lại/);
    assert.equal(item().draft, 'câu hỏi'); assert.equal(calls.length, 1);
  }
});
test('expired conversation token is omitted without changing history or retrying', async () => {
  let time = 1000; const { store, calls } = await setup(async () => reply({ conversationToken: 'signed' }), { now: () => time });
  store.setDraft('đau đầu'); await store.send(); time += 26 * 60000; store.setDraft('hai ngày'); await store.send();
  assert.equal(calls[1].body.conversationToken, null); assert.equal(calls[1].body.history.length, 2);
});
test('invalid context requires an explicit new conversation; no automatic fallback retry', async () => {
  const { store, calls, item } = await setup(async () => { throw { response: { status: 400, data: { errorCode: 'INVALID_CONTEXT' } } }; });
  store.setDraft('câu hỏi'); await store.send(); assert.match(item().error, /cuộc trò chuyện mới/); assert.equal(calls.length, 1);
});
test('missing AI configuration still permits backend functional answers', async () => {
  let asked = 0;
  const store = createElderlyAssistantStore({ api: { context: async () => ({ aiConfigured: false }), chat: async () => { asked++; return reply({ mode: 'functional', modeReason: 'missing_config' }); } } });
  await store.loadContext(); store.setDraft('lịch thuốc'); await store.send(); assert.equal(asked, 1); assert.equal(store.getSnapshot().aiConfigured, false);
});
test('context errors fail closed until explicit reload', async () => {
  let reads = 0, chats = 0;
  const store = createElderlyAssistantStore({ api: { context: async () => { reads++; throw Error('INVALID_OWNER'); }, chat: async () => { chats++; } } });
  await store.loadContext(); store.setDraft('câu hỏi'); assert.equal(await store.send(), false); assert.equal(reads, 1); assert.equal(chats, 0); assert.equal(store.getSnapshot().contextPhase, 'error');
});
test('memory is bounded and removing conversations requires no persistence API', async () => {
  const { store, item } = await setup();
  for (let index = 0; index < 12; index++) { store.setDraft(`Câu ${index}`); await store.send(); store.create(); }
  assert.equal(store.getSnapshot().conversations.length, 12); assert.match(item().error, /12 cuộc/);
  for (const conversation of [...store.getSnapshot().conversations]) store.remove(conversation.id);
  assert.equal(store.getSnapshot().conversations.length, 1); assert.equal(item().messages.length, 0);
});
test('JWT expiry is read only for cache erasure, never to grant authorization', () => {
  const token = exp => `header.${Buffer.from(JSON.stringify({ exp })).toString('base64url')}.signature`;
  assert.equal(assistantSessionExpiry(token(1793081100)), 1793081100000);
  for (const value of ['fixture-token', 'a.invalid.b', token('1793081100'), token(null), token(-1)]) assert.equal(assistantSessionExpiry(value), Infinity);
});
test('an idle session deadline clears all conversations/context and aborts pending reads, without changing JWTs', async () => {
  let time = 1000, timer, delay; const slow = deferred();
  const { store, calls, item } = await setup(() => slow.promise, { expiresAt: 2000, now: () => time,
    schedule: (callback, ms) => { timer = callback; delay = ms; return 1; }, unschedule: () => {} });
  store.activate(); assert.equal(delay, 1000);
  store.setDraft('Sức khỏe nhạy cảm'); const request = store.send(); time = 2000; timer();
  assert.equal(store.getSnapshot().contextPhase, 'expired'); assert.equal(item().messages.length, 0); assert.equal(item().token, null); assert.equal(calls[0].signal.aborted, true);
  slow.resolve(reply()); await request; assert.equal(item().messages.length, 0); assert.equal(await store.send(), false);
  store.activate(); assert.equal(store.getSnapshot().contextPhase, 'expired'); store.dispose();
});
test('cache expiry timers rearm rather than overflowing for very long sessions', async () => {
  let time = 0, timer, delay; const { store } = await setup(undefined, { now: () => time, expiresAt: 4000000000,
    schedule: (callback, ms) => { timer = callback; delay = ms; return 1; }, unschedule: () => {} });
  store.activate(); assert.equal(delay, 2147483647); time = 2147483647; timer(); assert.equal(delay, 1852516353);
  assert.equal(store.getSnapshot().contextPhase, 'ready'); time = 4000000000; timer(); assert.equal(store.getSnapshot().contextPhase, 'expired');
});
