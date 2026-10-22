// Browser-only SOS sound coordination. Never writes medical data or SOS state.
export const SOS_AUDIO_SRC = '/audio/sos-bip-bip.mp3';
const PREFIX = 'caresenior:sos:v1:';
const KEEP_MS = 7 * 24 * 60 * 60 * 1000;
const MAX_SEEN = 1000;
const positiveId = (value) => (typeof value === 'number' || typeof value === 'string' && /^\d+$/.test(value))
  && Number.isSafeInteger(Number(value)) && Number(value) > 0 ? Number(value) : null;

export const formatSosTime = (value) => {
  if (typeof value !== 'string' || !value.trim()) return 'Chưa rõ thời gian';
  const text = value.trim();
  const parts = text.match(/^(\d{4})-(\d\d)-(\d\d)T(\d\d):(\d\d)(?::(\d\d)(?:\.\d+)?)?(Z|[+-]\d\d:\d\d)?$/);
  if (!parts || Number(parts[4]) > 23 || Number(parts[5]) > 59 || Number(parts[6] || 0) > 59) return 'Chưa rõ thời gian';
  const day = new Date(`${text.slice(0, 10)}T00:00:00Z`);
  if (!Number.isFinite(day.getTime()) || day.toISOString().slice(0, 10) !== text.slice(0, 10)) return 'Chưa rõ thời gian';
  const normalized = parts[7] ? text : `${text}+07:00`;
  const date = new Date(normalized);
  if (!Number.isFinite(date.getTime())) return 'Chưa rõ thời gian';
  return new Intl.DateTimeFormat('vi-VN', {
    timeZone: 'Asia/Ho_Chi_Minh', hour: '2-digit', minute: '2-digit', second: '2-digit',
    day: '2-digit', month: '2-digit', year: 'numeric', hourCycle: 'h23',
  }).format(date);
};

export function normalizeSos(alert) {
  if (!alert || typeof alert !== 'object' || Array.isArray(alert)) return null;
  const source = alert.nguonBang;
  // A severe health alert is not an SOS. A dedicated SOS ID is accepted only
  // when no contradictory source is supplied (legacy realtime payloads).
  if (source !== 'CanhBaoKhanCap' && !(source == null && positiveId(alert.canhBaoKhanCapId))) return null;
  const id = positiveId(alert.canhBaoKhanCapId ?? alert.nguonId);
  if (!id) return null;
  const status = String(alert.trangThai || 'CHUA_XU_LY');
  const labels = { CHUA_XU_LY: 'Chưa xử lý', DangGui: 'Chưa xử lý', DA_XEM: 'Đã tiếp nhận', DaTiepNhan: 'Đã tiếp nhận', DA_XU_LY: 'Đã xử lý', DaXuLy: 'Đã xử lý' };
  const text = (value, fallback, limit) => typeof value === 'string' && value.trim() ? value.trim().slice(0, limit) : fallback;
  return {
    id, key: `sos:${id}`, alertId: positiveId(alert.canhBaoId ?? alert.id),
    elderlyId: positiveId(alert.nguoiCaoTuoiId),
    name: text(alert.nguoiCaoTuoiTen ?? alert.tenNguoiCaoTuoi, 'Người cao tuổi', 100),
    content: text(alert.moTa ?? alert.noiDung, 'Người cao tuổi vừa gửi yêu cầu hỗ trợ khẩn cấp.', 500),
    time: alert.ngayGui ?? alert.thoiGianPhatHien ?? null,
    status, statusLabel: labels[status] || 'Chưa rõ trạng thái',
  };
}

const initialSnapshot = () => ({ enabled: false, ringing: false, blocked: false, error: null, coordinationAvailable: false });
const browserStorage = () => { try { return typeof window !== 'undefined' ? window.localStorage : null; } catch { return null; } };

export function createSosAlarmController(options = {}) {
  const storage = Object.hasOwn(options, 'storage') ? options.storage : browserStorage();
  const locks = Object.hasOwn(options, 'locks') ? options.locks : (typeof navigator !== 'undefined' ? navigator.locks : null);
  const createAudio = options.createAudio || ((src) => new Audio(src));
  const now = options.now || Date.now;
  const schedule = options.setTimeout || globalThis.setTimeout;
  const cancel = options.clearTimeout || globalThis.clearTimeout;
  const createChannel = Object.hasOwn(options, 'createChannel') ? options.createChannel
    : (typeof window !== 'undefined' && typeof BroadcastChannel !== 'undefined' ? (name) => new BroadcastChannel(name) : null);
  const addStorageListener = options.addStorageListener || ((fn) => {
    if (typeof window === 'undefined') return () => {};
    window.addEventListener('storage', fn);
    return () => window.removeEventListener('storage', fn);
  });
  let snapshot = initialSnapshot();
  let userId = null;
  let authorized = false;
  let generation = 0;
  let disposed = false;
  let audio = null;
  let previewTimer = null;
  let releaseLock = null;
  let attempting = false;
  let channel = null;
  let sequence = 0;
  let seen = new Set();
  let pending = new Map();
  let failedIds = new Set();
  let knownSos = new Map();
  let alertToSos = new Map();
  const instanceId = `${now()}-${Math.random().toString(36).slice(2)}`;
  const subscribers = new Set();
  const key = (suffix) => `${PREFIX}${userId}:${suffix}`;
  const publish = (next) => {
    const updated = { ...snapshot, ...next };
    if (Object.keys(updated).every((k) => updated[k] === snapshot[k])) return;
    snapshot = updated;
    for (const fn of subscribers) fn();
  };
  const read = (suffix) => { try { return storage?.getItem(key(suffix)); } catch { return null; } };
  const write = (suffix, value) => { try { storage.setItem(key(suffix), value); return true; } catch { return false; } };
  const storageWorks = () => {
    if (!storage) return false;
    const probe = `${PREFIX}probe:${instanceId}`;
    try { storage.setItem(probe, '1'); const valid = storage.getItem(probe) === '1'; storage.removeItem(probe); return valid; } catch { return false; }
  };
  const readLedger = () => {
    try {
      const values = JSON.parse(read('seen') || '[]');
      return new Map((Array.isArray(values) ? values : []).filter((row) => Array.isArray(row)
        && positiveId(row[0]) && Number.isFinite(row[1]) && row[1] <= now() + 60000 && now() - row[1] <= KEEP_MS)
        .slice(-MAX_SEEN));
    } catch { return new Map(); }
  };
  const remember = (ids) => {
    const ledger = readLedger();
    for (const id of ids) ledger.set(id, now());
    return write('seen', JSON.stringify([...ledger].slice(-MAX_SEEN)));
  };
  const broadcast = (kind, ids = []) => {
    if (!authorized || !userId) return;
    const signal = { kind, ids, at: now(), from: instanceId, sequence: ++sequence };
    // Only user/SOS identifiers and preferences leave this controller; no names,
    // content, coordinates or clinical information are persisted/broadcast.
    write('signal', JSON.stringify(signal));
    try { channel?.postMessage(signal); } catch { /* storage event is the fallback */ }
  };
  const stopAudio = () => {
    if (previewTimer != null) { cancel(previewTimer); previewTimer = null; }
    const current = audio;
    audio = null;
    try { current?.pause(); if (current) current.currentTime = 0; } catch { /* best effort */ }
    const release = releaseLock;
    releaseLock = null;
    release?.();
    publish({ ringing: false });
  };
  const rememberSilenced = (ids) => {
    if (!ids.length || !snapshot.coordinationAvailable || !authorized) return;
    const version = generation;
    // Serialize ledger updates with the alarm owner's lock. A stop signal first
    // releases that owner; this never acquires a lock to start sound.
    const lockName = key('sound');
    Promise.resolve().then(() => locks.request(lockName, {}, () => {
      if (version === generation && authorized) remember(ids);
    })).catch(() => {});
  };
  const silenceLocal = () => {
    const ids = [...pending.keys()];
    pending.clear();
    generation++;
    attempting = false;
    stopAudio();
    rememberSilenced(ids);
    return ids;
  };
  const handleSignal = (signal) => {
    if (!authorized || !signal || signal.from === instanceId) return;
    if (signal.kind === 'disable') {
      silenceLocal();
      publish({ enabled: false, blocked: false, error: null });
    } else if (signal.kind === 'enable') {
      publish({ enabled: true, blocked: false, error: null });
    } else if (signal.kind === 'silence') {
      silenceLocal();
      rememberSilenced(Array.isArray(signal.ids) ? signal.ids.map(positiveId).filter(Boolean) : []);
    } else if (signal.kind === 'sos' && snapshot.ringing && releaseLock) {
      const ids = Array.isArray(signal.ids) ? signal.ids.map(positiveId).filter(Boolean) : [];
      if (ids.length) remember(ids);
    } else if (signal.kind === 'handoff') {
      attemptSound();
    }
  };
  const removeStorageListener = addStorageListener((event) => {
    if (!authorized || event.key !== key('signal') || !event.newValue) return;
    try { handleSignal(JSON.parse(event.newValue)); } catch { /* untrusted storage */ }
  });
  const play = async (loop, version) => {
    let current;
    try {
      current = createAudio(SOS_AUDIO_SRC);
      current.loop = loop;
      current.volume = 0.65;
      audio = current;
      const failed = () => {
        if (audio !== current || version !== generation) return;
        stopAudio();
        publish({ blocked: false, error: 'Không phát được tệp âm thanh SOS. Cảnh báo vẫn hiển thị trên màn hình.' });
      };
      current.addEventListener?.('error', failed, { once: true });
      await current.play();
      if (version !== generation || !authorized || !snapshot.enabled || audio !== current) {
        try { current.pause(); current.currentTime = 0; } catch { /* disposed audio */ }
        return false;
      }
      publish({ ringing: loop, blocked: false, error: null });
      if (!loop) previewTimer = schedule(() => {
        if (audio === current) stopAudio();
      }, 350);
      return true;
    } catch (error) {
      try { current?.pause(); } catch { /* disposed audio */ }
      if (version !== generation || !authorized) return false;
      if (audio === current) audio = null;
      const blocked = error?.name === 'NotAllowedError';
      publish({ ringing: false, blocked, error: blocked
        ? 'Trình duyệt đang chặn phát âm thanh. Nhấn “Cho phép âm thanh” để thử lại; SOS vẫn hiển thị.'
        : 'Không phát được âm thanh SOS. Kiểm tra âm lượng và tệp âm thanh; SOS vẫn hiển thị.' });
      return false;
    }
  };
  const attemptSound = () => {
    if (!authorized || !snapshot.enabled || !pending.size) return;
    if (!snapshot.coordinationAvailable) {
      publish({ error: 'Chưa thể phối hợp chuông giữa các tab. Hãy dùng Chrome trên HTTPS/localhost và cho phép lưu trữ; cảnh báo vẫn hiển thị.' });
      return;
    }
    if (snapshot.ringing && releaseLock) {
      if (!remember([...pending.keys()])) {
        stopAudio();
        publish({ coordinationAvailable: false, error: 'Không thể lưu chống trùng chuông. SOS vẫn hiển thị trên màn hình.' });
      }
      return;
    }
    if (attempting) return;
    attempting = true;
    const version = generation;
    const lockName = key('sound');
    let handoff = false;
    Promise.resolve().then(() => locks.request(lockName, { ifAvailable: true }, async (lock) => {
      if (!lock || version !== generation || !authorized || !snapshot.enabled) return;
      const ledger = readLedger();
      const candidates = [...pending.keys()].filter((id) => !ledger.has(id) && !failedIds.has(id));
      for (const id of pending.keys()) if (ledger.has(id)) pending.delete(id);
      if (!candidates.length) return;
      // Confirm storage is writable, but do not mark an SOS as heard before
      // play succeeds: a blocked tab must not suppress an unlocked tab.
      if (!write('seen', JSON.stringify([...ledger]))) {
        publish({ coordinationAvailable: false, error: 'Không thể lưu chống trùng chuông. SOS vẫn hiển thị trên màn hình.' });
        return;
      }
      let release;
      const held = new Promise((resolve) => { release = resolve; });
      releaseLock = release;
      stopPreview();
      const played = await play(true, version);
      if (!played) {
        if (version === generation && authorized) {
          for (const id of candidates) failedIds.add(id);
          handoff = true;
        }
        if (releaseLock === release) releaseLock = null;
        release();
        return;
      }
      // Other SOS may arrive while play() is pending. The one continuous alarm
      // covers them too; remember all pending IDs once playback really starts.
      if (!remember([...pending.keys()])) {
        stopAudio();
        publish({ coordinationAvailable: false, error: 'Không thể lưu chống trùng chuông. SOS vẫn hiển thị trên màn hình.' });
        return;
      }
      await held;
    })).catch(() => {
      if (version === generation && authorized) publish({ coordinationAvailable: false, error: 'Không thể phối hợp chuông giữa các tab. SOS vẫn hiển thị.' });
    }).finally(() => {
      if (version === generation) {
        attempting = false;
        if (handoff) broadcast('handoff');
      }
    });
  };
  const stopPreview = () => {
    if (previewTimer != null) { cancel(previewTimer); previewTimer = null; }
    if (audio && !audio.loop) {
      try { audio.pause(); audio.currentTime = 0; } catch { /* best effort */ }
      audio = null;
    }
  };
  const controller = {
    configure({ userId: nextUser, authorized: nextAuthorized }) {
      const id = positiveId(nextUser);
      const allowed = Boolean(id && nextAuthorized && !disposed);
      if (userId === id && authorized === allowed) return;
      generation++;
      attempting = false;
      stopAudio();
      channel?.close(); channel = null;
      userId = id; authorized = allowed; seen = new Set(); pending = new Map(); failedIds = new Set();
      knownSos = new Map(); alertToSos = new Map();
      const available = allowed && Boolean(locks?.request) && storageWorks();
      publish({ ...initialSnapshot(), enabled: allowed && read('enabled') === '1', coordinationAvailable: available });
      if (allowed && createChannel) {
        try { channel = createChannel(key('channel')); channel.onmessage = (event) => handleSignal(event.data); } catch { channel = null; }
      }
    },
    receive(alert) {
      const sos = authorized && !disposed ? normalizeSos(alert) : null;
      if (!sos || seen.has(sos.id)) return null;
      seen.add(sos.id);
      knownSos.set(sos.id, sos);
      if (sos.alertId) alertToSos.set(sos.alertId, sos.id);
      if (seen.size > MAX_SEEN) {
        const oldest = seen.values().next().value;
        seen.delete(oldest);
        const previous = knownSos.get(oldest);
        if (previous?.alertId) alertToSos.delete(previous.alertId);
        knownSos.delete(oldest);
      }
      if (['CHUA_XU_LY', 'DangGui', 'DA_XEM', 'DaTiepNhan'].includes(sos.status)) {
        pending.set(sos.id, true);
        broadcast('sos', [sos.id]);
        attemptSound();
      }
      return sos;
    },
    update(alert) {
      if (!authorized || disposed || !alert || typeof alert !== 'object' || Array.isArray(alert)) return null;
      // Generic CanhBao updates do not contain a trusted SOS source. Only use
      // the alert-to-SOS relationship learned from a previous SOS event.
      const alertId = positiveId(alert.canhBaoId);
      const sosId = alertId && alertToSos.get(alertId);
      const previous = sosId && knownSos.get(sosId);
      if (!previous || (alert.nguoiCaoTuoiId != null && positiveId(alert.nguoiCaoTuoiId) !== previous.elderlyId)) return null;
      const labels = { CHUA_XU_LY: 'Chưa xử lý', DangGui: 'Chưa xử lý', DA_XEM: 'Đã tiếp nhận', DaTiepNhan: 'Đã tiếp nhận', DA_XU_LY: 'Đã xử lý', DaXuLy: 'Đã xử lý' };
      const status = typeof alert.trangThai === 'string' ? alert.trangThai : '';
      if (!Object.hasOwn(labels, status)) return null;
      const updated = { ...previous, status, statusLabel: labels[status] };
      knownSos.set(sosId, updated);
      if (status === 'DA_XU_LY' || status === 'DaXuLy') {
        pending.delete(sosId);
        failedIds.delete(sosId);
        if (!pending.size) {
          generation++;
          attempting = false;
          stopAudio();
          publish({ blocked: false, error: null });
        }
        rememberSilenced([sosId]);
      }
      return updated;
    },
    async enable() {
      if (!authorized || disposed) return false;
      publish({ enabled: true, blocked: false, error: null });
      write('enabled', '1');
      broadcast('enable');
      if (!snapshot.coordinationAvailable) { attemptSound(); publish({ error: 'Không thể bật chuông an toàn giữa các tab. Hãy dùng Chrome trên HTTPS/localhost và cho phép lưu trữ; SOS vẫn hiển thị.' }); return false; }
      if (snapshot.ringing) return true;
      failedIds.clear();
      const version = generation;
      // Call play directly inside the click handler to establish Chrome's user
      // activation. This brief confirmation tone is not a fabricated SOS.
      const played = await play(false, version);
      if (played && version === generation && pending.size) attemptSound();
      return played;
    },
    disable() {
      if (!authorized) return;
      const ids = silenceLocal();
      write('enabled', '0');
      publish({ enabled: false, blocked: false, error: null });
      broadcast('disable', ids);
    },
    silence() {
      if (!authorized) return;
      const ids = silenceLocal();
      publish({ blocked: false, error: null });
      broadcast('silence', ids);
    },
    subscribe(fn) { subscribers.add(fn); return () => subscribers.delete(fn); },
    getSnapshot() { return snapshot; },
    dispose() {
      generation++; authorized = false; disposed = true;
      stopAudio(); publish(initialSnapshot()); channel?.close(); removeStorageListener(); pending.clear(); seen.clear();
      knownSos.clear(); alertToSos.clear(); subscribers.clear();
    },
  };
  return controller;
}

let singleton;
export const getSosAlarmController = () => singleton ||= createSosAlarmController();
