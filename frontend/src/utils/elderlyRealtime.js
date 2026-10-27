export const LIVE_TOPICS = ['alerts', 'sos', 'notifications', 'health', 'medications', 'appointments', 'caregivers'];
export const resourceTopic = key => ({ 'home-health': 'health', health: 'health', types: 'health', 'home-meds': 'medications', doses: 'medications',
  'home-visits': 'appointments', visits: 'appointments', 'home-care': 'caregivers', 'profile-care': 'caregivers', alerts: 'alerts', 'sos-history': 'sos', notifications: 'notifications' })[key.split(':')[0]];

// Reuse the authenticated socket. Events only invalidate owner-scoped API reads;
// never render a room payload as medical data or a confirmed send result.
export function subscribeElderlyRealtime({ socket, userId, profileId, canAlerts, current, onChange, onConnection,
  browser, document, now = Date.now, schedule = setTimeout, unschedule = clearTimeout }) {
  let disposed = false, timer;
  const seen = new Map(), dirty = new Set();
  const active = () => !disposed && current();
  const flush = () => {
    timer = null;
    if (!active() || document.visibilityState === 'hidden' || !dirty.size) return;
    const topics = [...dirty]; dirty.clear(); onChange(topics);
  };
  const invalidate = topics => {
    if (!active()) return;
    for (const topic of topics) dirty.add(topic);
    if (timer == null) timer = schedule(flush, 100);
  };
  const event = (name, topics, requireProfile) => payload => {
    if (!active() || !payload || typeof payload !== 'object' || (requireProfile && !canAlerts)) return;
    if (payload.userId != null && Number(payload.userId) !== Number(userId)) return;
    if (payload.nguoiCaoTuoiId != null && Number(payload.nguoiCaoTuoiId) !== Number(profileId)) return;
    if (requireProfile && Number(payload.nguoiCaoTuoiId) !== Number(profileId)) return;
    const id = Number(payload.canhBaoId || payload.id || payload.donThuocId);
    if (!Number.isSafeInteger(id) || id < 1) return;
    const key = JSON.stringify([name, id, payload.trangThai, payload.action, payload.ngayTao, payload.thoiGianPhatHien, payload.thoiGianDuKien]);
    if (seen.has(key) && now() - seen.get(key) < 60000) return;
    seen.delete(key); seen.set(key, now());
    while (seen.size > 512) seen.delete(seen.keys().next().value);
    invalidate(topics);
  };
  const handlers = {
    'canhbao:new': event('canhbao:new', ['alerts', 'sos'], true),
    'canhbao:updated': event('canhbao:updated', ['alerts', 'sos'], true),
    'thongbao:new': event('thongbao:new', ['notifications'], false),
    'lichuongthuoc:updated': event('lichuongthuoc:updated', ['medications'], false),
    'donthuoc:created': event('donthuoc:created', ['medications'], false),
    'lichkham:updated': event('lichkham:updated', ['appointments'], false),
    'chisuckhoe:new': event('chisuckhoe:new', ['health'], true),
    connect: () => { if (active()) { onConnection('connected'); invalidate(LIVE_TOPICS); } },
    disconnect: () => { if (active()) onConnection('disconnected'); },
    connect_error: () => { if (active()) onConnection('error'); },
  };
  const foreground = () => {
    if (active() && document.visibilityState !== 'hidden') {
      onConnection(browser.navigator?.onLine === false ? 'offline' : socket.connected ? 'connected' : 'connecting');
      invalidate(LIVE_TOPICS);
    }
  };
  const offline = () => { if (active()) onConnection('offline'); };
  for (const [name, handler] of Object.entries(handlers)) socket.on(name, handler);
  browser.addEventListener('online', foreground); browser.addEventListener('offline', offline); browser.addEventListener('focus', foreground);
  document.addEventListener('visibilitychange', foreground);
  if (socket.connected) handlers.connect(); else onConnection('connecting');
  return {
    refresh: foreground,
    dispose() {
      disposed = true; if (timer != null) unschedule(timer); dirty.clear(); seen.clear();
      for (const [name, handler] of Object.entries(handlers)) socket.off(name, handler);
      browser.removeEventListener('online', foreground); browser.removeEventListener('offline', offline); browser.removeEventListener('focus', foreground);
      document.removeEventListener('visibilitychange', foreground);
    },
  };
}
