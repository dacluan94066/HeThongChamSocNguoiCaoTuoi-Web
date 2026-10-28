import { parseAlertTime } from './alertTime.js';

export const notificationIsRead = value => value === true || value === 1;
const positiveId = value => Number.isSafeInteger(Number(value)) && Number(value) > 0;

export function normalizeNotifications(rows, userId) {
  if (!Array.isArray(rows) || rows.some(row => !row || !positiveId(row.id)
    || (row.userId != null && Number(row.userId) !== Number(userId)))) {
    throw new Error('Dữ liệu thông báo không hợp lệ hoặc không thuộc tài khoản đang đăng nhập.');
  }
  const unique = new Map();
  for (const row of rows) {
    const id = Number(row.id);
    unique.set(id, {
      id, tieuDe: String(row.tieuDe || 'Thông báo'), noiDung: String(row.noiDung || ''),
      loaiThongBao: String(row.loaiThongBao || ''), lienKetBang: String(row.lienKetBang || ''),
      lienKetId: positiveId(row.lienKetId) ? Number(row.lienKetId) : null,
      ngayTao: typeof row.ngayTao === 'string' ? row.ngayTao : null,
      daDoc: notificationIsRead(row.daDoc) || unique.get(id)?.daDoc === true,
    });
  }
  return [...unique.values()].sort((a, b) => (parseAlertTime(b.ngayTao)?.getTime() || 0)
    - (parseAlertTime(a.ngayTao)?.getTime() || 0) || b.id - a.id);
}

// Routes come from the application, never from notification text or an arbitrary URL.
export function staffNotificationRoute(item, role, hasPermission) {
  if (!['QuanTriVien', 'NguoiChamSoc'].includes(role)) return null;
  const source = item.lienKetBang?.split(':')[0];
  const target = {
    CanhBaoKhanCap: ['QLCANHBAO', '/canh-bao?tab=sos'],
    CanhBao: ['QLCANHBAO', '/canh-bao?tab=health'],
    LichUongThuoc: ['QLLICHUONGTHUOC', '/lich-uong-thuoc'],
    DonThuoc: ['QLLICHUONGTHUOC', '/lich-uong-thuoc'],
    LichKhamBenh: ['QLLICHKHAM', '/lich-kham-benh'],
    ChiSoSucKhoe: ['QLCHISOSK', '/chi-so-suc-khoe'],
    HoSoNguoiCaoTuoi: ['QLHOSONCT', '/ho-so-nguoi-cao-tuoi'],
  }[source];
  return target && hasPermission(target[0], 'xem') ? target[1] : null;
}

export function createNotificationApi(client, userId, stamp) {
  const config = signal => ({ signal, webSessionStamp: stamp });
  return {
    async list(signal) {
      // This existing GET can materialize reminders. Browser tests must use a RAM API.
      const response = await client.get('/notifications/me', config(signal));
      if (response.data?.success !== true) throw new Error('Chưa tải được thông báo.');
      return normalizeNotifications(response.data.data, userId);
    },
    async read(id, signal) {
      if (!positiveId(id)) throw new Error('Mã thông báo không hợp lệ.');
      const response = await client.patch(`/notifications/${Number(id)}/read`, {}, config(signal));
      if (response.data?.success !== true || Number(response.data.data?.id) !== Number(id)
        || !notificationIsRead(response.data.data?.daDoc)) throw new Error('Máy chủ chưa xác nhận thông báo đã được đọc.');
    },
  };
}

export function createNotificationStore({ api, current, userId, schedule = setTimeout, unschedule = clearTimeout }) {
  const initial = () => ({ items: [], loaded: false, loading: false, error: '', readError: '', reading: [] });
  let state = initial(), disposed = true, generation = 0, timer, flight, rerun = false;
  const listeners = new Set(), controllers = new Set(), confirmedRead = new Set(), reading = new Map();
  const active = () => !disposed && current();
  const publish = values => { state = { ...state, ...values }; for (const listener of listeners) listener(); };
  const clear = () => {
    generation++; if (timer != null) unschedule(timer); timer = undefined;
    for (const controller of controllers) controller.abort();
    controllers.clear(); confirmedRead.clear(); reading.clear(); flight = undefined; rerun = false;
    state = initial(); for (const listener of listeners) listener();
  };
  const forbidden = error => [401, 403].includes(error.response?.status);
  const invalidate = () => {
    if (!active() || timer != null) return;
    timer = schedule(() => { timer = undefined; void refresh(); }, 120);
  };
  const refresh = () => {
    if (!active()) return Promise.resolve();
    if (timer != null) { unschedule(timer); timer = undefined; }
    if (flight) { rerun = true; return flight; }
    const version = generation, controller = new AbortController(); controllers.add(controller);
    publish({ loading: true, error: '' });
    const promise = (async () => {
      try {
        const items = normalizeNotifications(await api.list(controller.signal), userId)
          .map(item => confirmedRead.has(item.id) ? { ...item, daDoc: true } : item);
        if (active() && version === generation) publish({ items, loaded: true, error: '' });
      } catch (error) {
        if (!active() || version !== generation || controller.signal.aborted) return;
        if (forbidden(error)) clear();
        publish({ error: forbidden(error) ? 'Phiên đăng nhập hoặc quyền xem thông báo không còn hợp lệ.'
          : 'Không thể tải thông báo. Vui lòng kiểm tra kết nối và thử lại.' });
      } finally {
        controllers.delete(controller);
        if (active() && version === generation) {
          flight = undefined; publish({ loading: false });
          if (rerun) { rerun = false; invalidate(); }
        }
      }
    })();
    flight = promise; return promise;
  };
  return {
    getSnapshot: () => state,
    subscribe(listener) { listeners.add(listener); return () => listeners.delete(listener); },
    activate() { disposed = false; invalidate(); },
    dispose() { disposed = true; clear(); },
    clear, refresh, invalidate,
    read(id) {
      id = Number(id);
      if (!active() || !state.items.some(item => item.id === id)) return Promise.resolve(false);
      if (state.items.find(item => item.id === id).daDoc) return Promise.resolve(true);
      if (reading.has(id)) return reading.get(id);
      const version = generation, controller = new AbortController(); controllers.add(controller);
      publish({ reading: [...state.reading, id], readError: '' });
      const promise = (async () => {
        try {
          await api.read(id, controller.signal);
          if (!active() || version !== generation) return false;
          confirmedRead.add(id);
          publish({ items: state.items.map(item => item.id === id ? { ...item, daDoc: true } : item) });
          return true;
        } catch (error) {
          if (active() && version === generation && !controller.signal.aborted) {
            if (forbidden(error)) clear();
            publish({ readError: 'Chưa đánh dấu đã đọc được. Vui lòng thử lại; trạng thái thông báo chưa được thay đổi.' });
          }
          return false;
        } finally {
          controllers.delete(controller);
          if (active() && version === generation) { reading.delete(id); publish({ reading: state.reading.filter(value => value !== id) }); }
        }
      })();
      reading.set(id, promise); return promise;
    },
  };
}

export function subscribeNotificationEvents({ socket, store, userId, current, browser, document }) {
  const notice = payload => {
    if (!current() || !payload || !positiveId(payload.id)
      || (payload.userId != null && Number(payload.userId) !== Number(userId))) return;
    // Room payloads invalidate the owner API only; they are never displayed as private data.
    store.invalidate();
  };
  const foreground = () => { if (current() && document.visibilityState !== 'hidden') store.invalidate(); };
  socket.on('thongbao:new', notice); socket.on('connect', foreground);
  browser.addEventListener('focus', foreground); browser.addEventListener('online', foreground);
  document.addEventListener('visibilitychange', foreground);
  return () => {
    socket.off('thongbao:new', notice); socket.off('connect', foreground);
    browser.removeEventListener('focus', foreground); browser.removeEventListener('online', foreground);
    document.removeEventListener('visibilitychange', foreground);
  };
}
