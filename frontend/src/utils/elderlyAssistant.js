// This adapter has no clinical mutation methods. Identity is captured by the
// workspace, never supplied by an input or by a model-generated action.
export function createElderlyAssistantApi(client, profileId, capture = () => undefined) {
  const config = signal => ({ signal, elderlyPortalRequest: true, webSessionStamp: capture() });
  const data = response => {
    if (response.data?.success !== true || !response.data.data) throw Error('INVALID_REPLY');
    return response.data.data;
  };
  return {
    async context(signal) {
      const [profiles, status] = await Promise.all([
        client.get('/care-assistant/profiles', config(signal)), client.get('/care-assistant/status', config(signal)),
      ]);
      const rows = data(profiles);
      if (!Array.isArray(rows) || rows.length !== 1 || Number(rows[0]?.id) !== Number(profileId)) throw Error('INVALID_OWNER');
      return { aiConfigured: data(status).aiConfigured === true };
    },
    async chat({ question, history, conversationToken }, signal) {
      const body = { question, elderlyId: Number(profileId), history };
      if (conversationToken) body.conversationToken = conversationToken;
      const reply = data(await client.post('/care-assistant/chat', body, { ...config(signal), timeout: 45000 }));
      if (Number(reply.profile?.id) !== Number(profileId) || !['ai', 'functional'].includes(reply.mode)
        || typeof reply.text !== 'string' || !reply.text.trim() || reply.text.length > 2200) throw Error('INVALID_REPLY');
      return { text: reply.text, mode: reply.mode, domain: reply.domain,
        modeReason: reply.modeReason, aiFailureCode: reply.aiFailureCode, truncated: reply.truncated === true,
        actions: assistantActions(reply.actions),
        conversationToken: typeof reply.conversationToken === 'string' && reply.conversationToken.length <= 4000 ? reply.conversationToken : null };
    },
  };
}

const destinations = {
  medications: ['Lịch thuốc', '/ca-nhan/lich-trinh?tab=thuoc'],
  appointments: ['Lịch khám', '/ca-nhan/lich-trinh?tab=kham'],
  health: ['Chỉ số sức khỏe', '/ca-nhan/suc-khoe'],
  caregivers: ['Người chăm sóc trong hồ sơ', '/ca-nhan/ho-so'],
  notifications: ['Thông báo', '/ca-nhan/canh-bao?tab=notifications'],
  sos: ['Mở màn SOS', '/ca-nhan/sos'],
  change_password: ['Tài khoản trong hồ sơ', '/ca-nhan/ho-so'],
};
export function assistantActions(actions) {
  if (!Array.isArray(actions)) return [];
  return [...new Set(actions.filter(id => typeof id === 'string' && Object.hasOwn(destinations, id)))].map(id => ({ id, label: destinations[id][0], to: destinations[id][1] }));
}
export function assistantHistory(messages) {
  const turns = messages.filter(message => ['user', 'assistant'].includes(message.role) && !message.failed)
    .map(message => ({ role: message.role, content: message.text.slice(0, message.role === 'user' ? 500 : 2200) }));
  const result = []; let length = 0;
  for (const turn of turns.slice(-8).reverse()) {
    if (length + turn.content.length > 6000) break;
    result.unshift(turn); length += turn.content.length;
  }
  return result;
}
const failureMessage = error => {
  if (error.response?.data?.errorCode === 'INVALID_CONTEXT') return 'Ngữ cảnh hội thoại không còn hợp lệ. Hãy tạo cuộc trò chuyện mới.';
  if (error.response?.status === 429) return 'Bạn đang gửi quá nhanh. Vui lòng chờ một phút rồi gửi lại khi sẵn sàng.';
  if (error.response?.status === 401 || error.response?.status === 403) return 'Phiên đăng nhập hoặc quyền truy cập đã thay đổi. Vui lòng đăng nhập lại.';
  if (['INVALID_OWNER', 'INVALID_REPLY'].includes(error.message)) return 'Phản hồi không hợp lệ hoặc không thuộc hồ sơ của bạn. Nội dung chưa được hiển thị.';
  return 'Không kết nối được với trợ lý hoặc yêu cầu đã hết thời gian chờ. Chưa nhận được câu trả lời; Web không tự gửi lại.';
};

// This unverified claim is used ONLY to erase the ephemeral chat cache early.
// It never authorizes a request or changes the server/session JWT policy.
export function assistantSessionExpiry(token) {
  try {
    if (typeof token !== 'string' || token.length > 10000 || token.split('.').length !== 3) return Infinity;
    const { exp } = JSON.parse(atob(token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/')));
    return typeof exp === 'number' && Number.isFinite(exp) && exp >= 0 && exp * 1000 <= Number.MAX_SAFE_INTEGER ? exp * 1000 : Infinity;
  } catch { return Infinity; }
}

// Deliberately RAM-only, scoped to one authenticated workspace. No browser
// storage, SQL, background retries or automatic model/clinical actions.
export function createElderlyAssistantStore({ api, current = () => true, now = Date.now, expiresAt = Infinity,
  schedule = setTimeout, unschedule = clearTimeout }) {
  let sequence = 0, generation = 0, disposed = false, pending, contextPending, expiryTimer;
  const listeners = new Set();
  const fresh = () => ({ id: ++sequence, title: 'Cuộc trò chuyện mới', draft: '', messages: [], error: '', pending: false, token: null, tokenAt: 0 });
  const initial = () => { const conversation = fresh(); return { conversations: [conversation], selectedId: conversation.id, contextPhase: 'idle', aiConfigured: false, contextError: '' }; };
  let state = initial();
  const active = () => !disposed && current() && now() < expiresAt;
  const notify = () => { for (const listener of listeners) listener(); };
  const update = patch => { if (!active()) return; state = { ...state, ...patch }; notify(); };
  const selected = () => state.conversations.find(item => item.id === state.selectedId);
  const change = (id, patch) => update({ conversations: state.conversations.map(item => item.id === id ? { ...item, ...patch } : item) });
  const cancel = (note = 'Đã dừng chờ phản hồi. Bạn có thể tự gửi câu hỏi mới.') => {
    generation++; pending?.abort(); pending = null;
    const item = state.conversations.find(item => item.pending);
    if (item) change(item.id, { pending: false, error: note, messages: item.messages.map(message => message.pending ? { ...message, pending: false, failed: true } : message) });
  };
  const clearExpiryTimer = () => { if (expiryTimer != null) unschedule(expiryTimer); expiryTimer = null; };
  const reset = expired => {
    clearExpiryTimer(); generation++; pending?.abort(); contextPending?.abort(); pending = contextPending = null;
    disposed = true; state = initial();
    if (expired) state = { ...state, contextPhase: 'expired', contextError: 'Phiên trò chuyện đã hết hạn. Vui lòng đăng xuất rồi đăng nhập lại.' };
    notify();
  };
  const armExpiry = () => {
    clearExpiryTimer(); if (!Number.isFinite(expiresAt)) return;
    if (now() >= expiresAt) { reset(true); return; }
    // Long sessions must not overflow the browser's signed 32-bit timer delay.
    expiryTimer = schedule(() => { expiryTimer = null; armExpiry(); }, Math.min(expiresAt - now(), 2147483647));
  };
  return {
    getSnapshot: () => state,
    subscribe(listener) { listeners.add(listener); return () => listeners.delete(listener); },
    activate() { disposed = false; armExpiry(); },
    dispose() { reset(false); },
    async loadContext() {
      if (!active() || contextPending || state.contextPhase === 'ready') return;
      const controller = new AbortController(); contextPending = controller;
      update({ contextPhase: 'loading', contextError: '' });
      try {
        const result = await api.context(controller.signal);
        if (active() && contextPending === controller && !controller.signal.aborted) update({ contextPhase: 'ready', aiConfigured: result.aiConfigured });
      } catch (error) {
        if (active() && !controller.signal.aborted) update({ contextPhase: 'error', contextError: failureMessage(error) });
      } finally { if (contextPending === controller) contextPending = null; }
    },
    setDraft(value) { if (active()) change(state.selectedId, { draft: value.slice(0, 500) }); },
    select(id) {
      if (!active() || !state.conversations.some(item => item.id === id) || id === state.selectedId) return;
      cancel(); update({ selectedId: id });
    },
    create() {
      if (!active()) return;
      if (!selected().messages.length) { change(state.selectedId, { draft: '', error: '' }); return; }
      if (state.conversations.length >= 12) { change(state.selectedId, { error: 'Phiên này có tối đa 12 cuộc trò chuyện. Hãy xóa một cuộc trò chuyện trước khi tạo mới.' }); return; }
      cancel(); const conversation = fresh();
      update({ conversations: [...state.conversations, conversation], selectedId: conversation.id });
    },
    remove(id) {
      if (!active() || !state.conversations.some(item => item.id === id)) return;
      cancel(); const conversations = state.conversations.filter(item => item.id !== id);
      if (!conversations.length) conversations.push(fresh());
      update({ conversations, selectedId: state.selectedId === id ? conversations[0].id : state.selectedId });
    },
    cancel,
    async send() {
      if (!active() || pending || state.contextPhase !== 'ready') return false;
      const item = selected(), question = item.draft.trim();
      if (!question) return false;
      if (item.messages.length >= 40) { change(item.id, { error: 'Cuộc trò chuyện đã đạt giới hạn nội dung của phiên. Hãy tạo cuộc trò chuyện mới.' }); return false; }
      const history = assistantHistory(item.messages);
      const conversationToken = item.token && now() - item.tokenAt < 25 * 60000 ? item.token : null;
      const controller = new AbortController(), request = ++generation; pending = controller;
      change(item.id, { title: item.messages.length ? item.title : question.slice(0, 50), draft: '', error: '', pending: true,
        messages: [...item.messages, { id: ++sequence, role: 'user', text: question, pending: true }] });
      try {
        const reply = await api.chat({ question, history, conversationToken }, controller.signal);
        if (!active() || controller.signal.aborted || request !== generation) return false;
        const latest = selected();
        change(item.id, { pending: false, token: reply.conversationToken, tokenAt: now(),
          messages: [...latest.messages.map(message => ({ ...message, pending: false })), { id: ++sequence, role: 'assistant', ...reply, conversationToken: undefined }] });
        return true;
      } catch (error) {
        if (active() && !controller.signal.aborted && request === generation) {
          const latest = selected();
          change(item.id, { pending: false, error: failureMessage(error), draft: question,
            messages: latest.messages.map(message => message.pending ? { ...message, pending: false, failed: true } : message) });
        }
        return false;
      } finally { if (pending === controller) pending = null; }
    },
  };
}
