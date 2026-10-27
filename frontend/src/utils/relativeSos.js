import { normalizeSos } from './sosAlarm.js';
import { relativeLocalDate } from './relativePortalData.js';

const KEEP_MS = 7 * 86400000, FRESH_MS = 5 * 60000;
const initial = () => ({ alerts: [], detailTarget: null, detail: null, checking: false, error: null });
const browserStorage = () => { try { return window.localStorage; } catch { return null; } };
export const createRelativeSosController = ({ api, alarm, storage = browserStorage(), now = Date.now,
  onNotice = () => {}, onDestroy = () => {}, onChanged = () => {} }) => {
  let state = initial(), userId = null, authorized = false, epoch = 0, detailSequence = 0;
  let callbacks = { onNotice, onDestroy, onChanged };
  let seen = new Map();
  const versions = new Map(), eventSequences = new Map(), alerts = new Map(), requests = new Map(), subscribers = new Set();
  const publish = patch => { state = { ...state, ...patch }; for (const fn of subscribers) fn(); };
  const ledgerKey = () => `caresenior:relative-sos-events:v1:${userId}`;
  const loadSeen = () => {
    try { return new Map(JSON.parse(storage?.getItem(ledgerKey()) || '[]').filter(row => Array.isArray(row)
      && Number.isSafeInteger(row[0]) && row[0] > 0 && Number.isFinite(row[1]) && row[1] <= now() + 60000 && now() - row[1] <= KEEP_MS).slice(-1000)); }
    catch { return new Map(); }
  };
  const remember = id => {
    for (const [key, time] of seen) if (now() - time > KEEP_MS) seen.delete(key);
    seen.set(id, now()); if (seen.size > 1000) seen.delete(seen.keys().next().value);
    // IDs/times only, never names, content, health data, relationship or coordinates.
    try { storage?.setItem(ledgerKey(), JSON.stringify([...seen])); } catch { /* Audio controller still prevents overlapping playback. */ }
  };
  const changed = () => publish({ alerts: [...alerts.values()] });
  const purge = elderlyId => {
    versions.set(elderlyId, (versions.get(elderlyId) || 0) + 1);
    for (const [request, id] of requests) if (id === elderlyId) { request.abort(); requests.delete(request); }
    for (const [id, sos] of alerts) if (sos.elderlyId === elderlyId) { alerts.delete(id); callbacks.onDestroy(id); }
    alarm.retainElderly([...alerts.values()].map(sos => sos.elderlyId));
    if (state.detail?.elderlyId === elderlyId || state.detailTarget && !alerts.has(state.detailTarget)) {
      detailSequence++; publish({ detailTarget: null, detail: null, checking: false });
    }
    changed();
  };
  const clear = () => {
    epoch++; detailSequence++;
    for (const request of requests.keys()) request.abort(); requests.clear(); versions.clear(); eventSequences.clear();
    for (const id of alerts.keys()) callbacks.onDestroy(id);
    alerts.clear(); publish(initial());
  };
  const verify = async input => {
    const candidate = normalizeSos(input);
    if (!authorized || input?.nguonBang !== 'CanhBaoKhanCap' || !candidate?.elderlyId) return null;
    const elderlyId = candidate.elderlyId, generation = epoch, version = versions.get(elderlyId) || 0;
    const controller = new AbortController(); requests.set(controller, elderlyId);
    const valid = () => authorized && epoch === generation && (versions.get(elderlyId) || 0) === version;
    try {
      const profile = await api.profile(elderlyId, controller.signal);
      const rows = await api.read(elderlyId, 'sos', profile, { limit: 200, offset: 0 }, controller.signal);
      if (!valid()) return null;
      const row = rows.find(item => Number(item.id) === candidate.id && item.nguoiCaoTuoiId === elderlyId);
      if (!row) { purge(elderlyId); return null; }
      const safe = { nguonBang: 'CanhBaoKhanCap', nguonId: candidate.id, canhBaoKhanCapId: candidate.id,
        nguoiCaoTuoiId: elderlyId, nguoiCaoTuoiTen: profile.hoTen.slice(0, 100),
        ngayGui: row.ngayGui, trangThai: row.trangThai, mucDo: 'KHAN_CAP', moTa: 'Người cao tuổi đã gửi SOS.' };
      const normalized = normalizeSos(safe);
      return { safe, sos: normalized };
    } catch (error) {
      if (!valid()) return null;
      if (error?.response?.status === 401) { clear(); authorized = false; alarm.configure({ userId, authorized: false }); }
      else purge(elderlyId);
      publish({ error: [401, 403, 404].includes(error?.response?.status)
        ? 'Quyền xem SOS đã thay đổi hoặc phiên đăng nhập đã hết hạn. Dữ liệu không còn quyền đã được đóng.'
        : 'Chưa kiểm tra được quyền xem SOS. Chưa phát chuông; hãy tải lại khi kết nối ổn định.' });
      callbacks.onChanged(elderlyId); return null;
    } finally { requests.delete(controller); }
  };
  const receive = async (input, event = 'canhbao:new') => {
    if (!['canhbao:new', 'canhbao:updated'].includes(event)) return false;
    const candidate = normalizeSos(input);
    if (!candidate) return false;
    const sequence = (eventSequences.get(candidate.id) || 0) + 1;
    eventSequences.set(candidate.id, sequence);
    const verified = await verify(input); if (!verified) return false;
    if (eventSequences.get(candidate.id) !== sequence) return false;
    const { safe, sos } = verified;
    const previous = alerts.has(sos.id), duplicate = seen.has(sos.id) || loadSeen().has(sos.id);
    const time = relativeLocalDate(sos.time)?.getTime();
    const fresh = Number.isFinite(time) && now() - time <= FRESH_MS && time <= now() + 60000;
    const pending = ['DangGui', 'CHUA_XU_LY', 'DaTiepNhan', 'DA_XEM'].includes(sos.status);
    if (event === 'canhbao:updated') {
      if (previous) { alerts.set(sos.id, sos); alarm.update(safe); callbacks.onNotice(sos); changed(); }
    } else if (fresh && pending) {
      if (!duplicate) remember(sos.id);
      alerts.set(sos.id, sos); alarm.receive(safe);
      if (alerts.size > 50) { const oldest = alerts.keys().next().value; alerts.delete(oldest); callbacks.onDestroy(oldest); }
      if (!duplicate) callbacks.onNotice(sos);
      changed();
    } else if (previous) { alerts.set(sos.id, sos); alarm.update(safe); changed(); }
    else remember(sos.id);
    callbacks.onChanged(sos.elderlyId);
    return !duplicate && event === 'canhbao:new' && fresh && pending;
  };
  return Object.freeze({
    setCallbacks(next) { callbacks = { ...callbacks, ...next }; },
    subscribe(fn) { subscribers.add(fn); return () => subscribers.delete(fn); }, getSnapshot: () => state,
    configure(id, allowed) {
      if (userId === id && authorized === Boolean(allowed)) return;
      clear(); userId = id; authorized = Boolean(id && allowed); seen = authorized ? loadSeen() : new Map();
      alarm.configure({ userId, authorized, maxRingMs: 120000 });
    },
    receive,
    async revalidate() {
      for (const previous of [...alerts.values()]) {
        const sequence = eventSequences.get(previous.id);
        const verified = await verify({ nguonBang: 'CanhBaoKhanCap', canhBaoKhanCapId: previous.id, nguoiCaoTuoiId: previous.elderlyId });
        if (verified && alerts.has(previous.id) && eventSequences.get(previous.id) === sequence) {
          alerts.set(previous.id, verified.sos); alarm.update(verified.safe); changed();
        }
      }
    },
    accessChanged(payload) { const id = Number(payload?.nguoiCaoTuoiId); if (Number.isSafeInteger(id) && id > 0) { purge(id); callbacks.onChanged(id); } },
    async openDetail(id) {
      const previous = alerts.get(id); if (!previous) return;
      const sequence = ++detailSequence;
      publish({ detailTarget: id, detail: null, checking: true, error: null });
      const verified = await verify({ nguonBang: 'CanhBaoKhanCap', canhBaoKhanCapId: id, nguoiCaoTuoiId: previous.elderlyId });
      if (sequence !== detailSequence) return;
      publish({ detailTarget: verified ? id : null, detail: verified?.sos || null, checking: false });
    },
    closeDetail() { detailSequence++; publish({ detailTarget: null, detail: null, checking: false }); },
    async enable() {
      // Unlock audio synchronously in the click. Old pending data must not ring before rechecking access.
      alarm.retainElderly([]);
      const unlocked = alarm.enable();
      const generation = epoch;
      if (!await unlocked || !authorized || generation !== epoch) return;
      for (const previous of [...alerts.values()]) {
        const sequence = eventSequences.get(previous.id);
        const verified = await verify({ nguonBang: 'CanhBaoKhanCap', canhBaoKhanCapId: previous.id, nguoiCaoTuoiId: previous.elderlyId });
        if (!authorized || generation !== epoch) return;
        if (verified && eventSequences.get(previous.id) === sequence
          && now() - (relativeLocalDate(verified.sos.time)?.getTime() || 0) <= FRESH_MS) alarm.receive(verified.safe);
      }
    },
    disable: () => alarm.disable(), silence: () => alarm.silence(),
    clear() { clear(); authorized = false; alarm.configure({ userId: null, authorized: false }); },
  });
};
