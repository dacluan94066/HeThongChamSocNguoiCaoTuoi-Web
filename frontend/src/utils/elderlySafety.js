import { parseAlertTime } from './alertTime.js';

const positiveId = value => Number.isSafeInteger(Number(value)) && Number(value) > 0;
const unique = rows => {
  const seen = new Set();
  return rows.filter(row => { const key = String(row.id ?? `${row.nguonBang}:${row.nguonId}`); if (seen.has(key)) return false; seen.add(key); return true; });
};
const project = (row, keys) => Object.fromEntries(keys.filter(key => row[key] !== undefined).map(key => [key, row[key]]));
const alertFields = ['id', 'nguoiCaoTuoiId', 'loaiCanhBao', 'noiDung', 'mucDo', 'trangThai', 'ngayTao', 'ngayXuLy', 'nguonBang', 'nguonId'];
const sosFields = ['id', 'nguoiCaoTuoiId', 'noiDung', 'moTa', 'trangThai', 'ngayGui', 'thoiGianPhatHien', 'ngayXuLy', 'viDo', 'kinhDo', 'canhBaoId'];
const noticeFields = ['id', 'tieuDe', 'noiDung', 'loaiThongBao', 'lienKetBang', 'lienKetId', 'daDoc', 'ngayTao'];

export function createElderlySafetyApi(client, owner, capture = () => undefined) {
  const config = signal => ({ signal, elderlyPortalRequest: true, webSessionStamp: capture() });
  const list = async (path, fields, signal, clinical) => {
    const response = await client.get(path, config(signal)), rows = response.data?.data;
    if (response.data?.success !== true || !Array.isArray(rows)) throw Error('Dữ liệu cảnh báo không hợp lệ. Vui lòng tải lại.');
    if (rows.some(row => !row || (clinical && Number(row.nguoiCaoTuoiId) !== Number(owner.profileId))
      || (row.userId != null && Number(row.userId) !== Number(owner.userId)))) throw Error('Dữ liệu không thuộc tài khoản đang đăng nhập.');
    return unique(rows.map(row => project(row, fields)));
  };
  return {
    sosHistory: signal => list('/emergency-alerts', sosFields, signal, true),
    alerts: signal => list('/elderly/me/alerts', alertFields, signal, true),
    // This existing GET may materialize reminders; tests must use the RAM API.
    notifications: signal => list('/notifications/me', noticeFields, signal, false),
    markRead: async (id, signal) => {
      if (!positiveId(id)) throw Error('Mã thông báo không hợp lệ.');
      const response = await client.patch(`/notifications/${Number(id)}/read`, {}, config(signal));
      if (response.data?.success !== true || Number(response.data.data?.id) !== Number(id) || !isRead(response.data.data?.daDoc)) throw Error('Chưa xác nhận thông báo đã được đánh dấu đọc.');
      return response.data.data;
    },
    sendSos: async (location, signal) => {
      const body = { noiDung: 'Cảnh báo SOS khẩn cấp' };
      if (location) {
        if (!validLocation(location)) throw Error('Vị trí không hợp lệ. Hãy lấy lại vị trí hoặc gửi không kèm vị trí.');
        Object.assign(body, { viDo: location.latitude, kinhDo: location.longitude });
      }
      const response = await client.post('/emergency-alerts', body, config(signal));
      const data = response.data?.data;
      if (response.data?.success !== true || !data || !positiveId(data.id) || Number(data.nguoiCaoTuoiId) !== Number(owner.profileId) || !parseAlertTime(data.ngayGui)) {
        throw Object.assign(Error('Chưa xác nhận được kết quả gửi SOS từ máy chủ.'), { uncertain: true });
      }
      return project(data, ['id', 'nguoiCaoTuoiId', 'ngayGui', 'trangThai', 'trungLap', 'soNguoiChamSocNhan', 'soNguoiChamSocDaThongBao']);
    },
  };
}

export const validLocation = location => Number.isFinite(location?.latitude) && Number.isFinite(location?.longitude)
  && Math.abs(location.latitude) <= 90 && Math.abs(location.longitude) <= 180;
export const isRead = value => value === true || value === 1;
export const isSos = row => row.nguonBang === 'CanhBaoKhanCap';
export const statusLabel = status => ({ DangGui: 'Đã ghi nhận', CHUA_XU_LY: 'Chưa xử lý', ChuaXuLy: 'Chưa xử lý',
  DaTiepNhan: 'Đã tiếp nhận', DA_XEM: 'Đã tiếp nhận', DaXem: 'Đã tiếp nhận', DA_XU_LY: 'Đã xử lý', DaXuLy: 'Đã xử lý', BoQua: 'Đã kết thúc' })[status] || status || 'Chưa có dữ liệu';
export const levelLabel = level => ({ KhanCap: 'Khẩn cấp', KHAN_CAP: 'Khẩn cấp', Cao: 'Cao', CAO: 'Cao', TrungBinh: 'Trung bình', TRUNG_BINH: 'Trung bình', Thap: 'Thấp', THAP: 'Thấp' })[level] || level || 'Chưa có dữ liệu';
export function notificationRoute(row) {
  const source = row.lienKetBang;
  if (source === 'CanhBaoKhanCap') return '/ca-nhan/sos';
  if (source === 'CanhBao') return '/ca-nhan/canh-bao?tab=alerts';
  if (source === 'LichKhamBenh' || source?.startsWith('LichKhamBenh:')) return '/ca-nhan/lich-trinh?tab=kham';
  if (source === 'LichUongThuoc' || source?.startsWith('LichUongThuoc:')) return '/ca-nhan/lich-trinh?tab=thuoc';
  return null;
}

// A workspace-scoped coordinator survives route changes, but never persists
// medical/GPS/SOS data in storage. Only completing a fresh hold may POST.
export function createElderlySosController({ api, current = () => true, interactive = () => true,
  now = () => performance.now(), schedule = setInterval, unschedule = clearInterval, onRecorded = () => {} }) {
  const initial = () => ({ phase: 'idle', progress: 0, result: null, error: '', location: null, locationPhase: 'off', locationNote: 'Chưa chia sẻ vị trí.', reviewed: false });
  let state = initial();
  let timer, source, disposed = false, locationGeneration = 0, locationAt = 0, pending;
  const listeners = new Set();
  const active = () => !disposed && current();
  const update = values => { if (!active()) return; state = { ...state, ...values }; for (const fn of listeners) fn(); };
  const stopTimer = () => { if (timer != null) unschedule(timer); timer = null; source = null; };
  const cancel = () => { if (state.phase === 'holding') { stopTimer(); update({ phase: 'idle', progress: 0, error: 'Đã hủy thao tác giữ. Chưa gửi SOS.' }); } };
  const send = async () => {
    if (!active() || state.phase !== 'holding' || !interactive()) { cancel(); return; }
    stopTimer();
    const location = state.location && now() - locationAt <= 120000 ? state.location : null;
    if (state.location && !location) update({ location: null, locationPhase: 'off', locationNote: 'Vị trí đã cũ. SOS được gửi không kèm tọa độ.' });
    update({ phase: 'sending', progress: 1, result: null, error: '', reviewed: false });
    const controller = new AbortController(); pending = controller;
    try {
      const result = await api.sendSos(location, controller.signal);
      if (active()) { update({ phase: 'confirmed', result }); onRecorded(); }
    } catch (error) {
      if (!active()) return;
      const uncertain = error.uncertain || !error.response || error.response.status >= 500;
      update({ phase: uncertain ? 'uncertain' : 'error', error: uncertain
        ? 'Chưa xác định kết quả gửi SOS. Máy chủ có thể đã nhận yêu cầu. Web không tự gửi lại; hãy kiểm tra lịch sử hoặc liên hệ người chăm sóc.'
        : error.response?.data?.message || 'Máy chủ từ chối yêu cầu SOS. Vui lòng kiểm tra thông tin và quyền tài khoản.' });
    } finally { if (pending === controller) pending = null; }
  };
  return {
    getSnapshot: () => state,
    activate() { disposed = false; },
    subscribe(fn) { listeners.add(fn); return () => listeners.delete(fn); },
    start(input) {
      if (!active() || !interactive() || state.phase !== 'idle' || !input) return false;
      if (state.locationPhase === 'loading') {
        locationGeneration++;
        update({ location: null, locationPhase: 'off', locationNote: 'Chưa lấy được vị trí. Yêu cầu SOS này sẽ không kèm tọa độ.' });
      }
      const started = now(); source = input;
      update({ phase: 'holding', progress: 0, error: '' });
      timer = schedule(() => {
        if (!active() || !interactive()) { cancel(); return; }
        const progress = Math.min(1, Math.max(0, (now() - started) / 3000));
        update({ progress });
        if (progress >= 1) void send();
      }, 30);
      return true;
    },
    release(input) { if (input === source) cancel(); }, cancel,
    reset() {
      if (!active() || !['confirmed', 'error', 'uncertain'].includes(state.phase) || (state.phase === 'uncertain' && !state.reviewed)) return false;
      update({ phase: 'idle', progress: 0, result: null, error: '', reviewed: false }); return true;
    },
    async reviewHistory() {
      if (!active() || pending || state.phase !== 'uncertain') return;
      update({ reviewed: false });
      const controller = new AbortController(); pending = controller;
      try { await api.sosHistory(controller.signal); if (active()) update({ reviewed: true }); }
      catch (error) { if (active()) update({ reviewed: false, error: error.response?.data?.message || 'Chưa tải được lịch sử. Vui lòng kiểm tra kết nối và thử lại.' }); }
      finally { if (pending === controller) pending = null; }
    },
    async locate(geolocation) {
      if (!active() || ['sending', 'holding'].includes(state.phase) || state.locationPhase === 'loading') return;
      const generation = ++locationGeneration;
      update({ location: null, locationPhase: 'loading', locationNote: 'Đang xin quyền và lấy vị trí. Bạn vẫn có thể gửi SOS không kèm vị trí.' });
      if (!geolocation?.getCurrentPosition) { update({ locationPhase: 'unavailable', locationNote: 'Trình duyệt không hỗ trợ vị trí. SOS vẫn gửi được không kèm tọa độ.' }); return; }
      let timeout;
      try {
        const position = await new Promise((resolve, reject) => {
          timeout = setTimeout(() => reject({ code: 3 }), 8500);
          geolocation.getCurrentPosition(resolve, reject, { enableHighAccuracy: true, maximumAge: 0, timeout: 8000 });
        });
        if (!active() || generation !== locationGeneration || ['sending', 'holding'].includes(state.phase)) return;
        const coords = { latitude: position?.coords?.latitude, longitude: position?.coords?.longitude };
        if (!validLocation(coords)) throw Error('INVALID_LOCATION');
        locationAt = now(); update({ location: coords, locationPhase: 'ready', locationNote: 'Vị trí đã sẵn sàng để đính kèm SOS. Chỉ chia sẻ khi bạn gửi SOS.' });
      } catch (error) {
        if (active() && generation === locationGeneration) update({ location: null, locationPhase: 'unavailable', locationNote: error.code === 1
          ? 'Bạn chưa cho phép vị trí. SOS vẫn gửi được không kèm tọa độ.' : error.code === 3
            ? 'Lấy vị trí quá thời gian. SOS vẫn gửi được không kèm tọa độ.' : 'Không lấy được vị trí hợp lệ. SOS vẫn gửi được không kèm tọa độ.' });
      } finally { clearTimeout(timeout); }
    },
    clearLocation(note = 'Bạn đã chọn không chia sẻ vị trí.') { locationGeneration++; update({ location: null, locationPhase: 'off', locationNote: note }); },
    // Subscribers own their unsubscribe. Clearing the set here can erase a
    // useSyncExternalStore subscription during React StrictMode effect replay.
    dispose() { cancel(); stopTimer(); disposed = true; locationGeneration++; pending?.abort(); pending = null; state = initial(); },
  };
}
