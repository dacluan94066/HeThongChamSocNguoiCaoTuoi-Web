// A second presentation allowlist: the server remains the authorization boundary.
export const PORTAL_SECTIONS = Object.freeze({ health: 'health-metrics', medications: 'medication-schedules',
  appointments: 'appointments', alerts: 'alerts', sos: 'sos' });
export const PORTAL_FEATURES = Object.freeze({ health: 'QLCHISOSK', medications: 'QLLICHUONGTHUOC',
  appointments: 'QLLICHKHAM', alerts: 'QLCANHBAO', sos: 'QLCANHBAO' });
export const portalId = value => {
  if (!['number', 'string'].includes(typeof value) || !/^[1-9]\d*$/.test(String(value)) || Number(value) > 2147483647)
    throw new Error('Mã NCT không hợp lệ.');
  return Number(value);
};
const text = value => ['string', 'number'].includes(typeof value) ? String(value) : '';
const flag = value => value === true || value === 1;
const number = value => value != null && value !== '' && Number.isFinite(Number(value)) ? Number(value) : null;
export const projectRelativeProfile = raw => {
  if (!raw || typeof raw !== 'object') throw new Error('Chưa nhận được hồ sơ hợp lệ từ máy chủ.');
  const result = { id: portalId(raw.id), hoTen: text(raw.hoTen), tuoi: number(raw.tuoi), gioiTinh: text(raw.gioiTinh),
    nhomMau: text(raw.nhomMau), trangThai: text(raw.trangThai), moiQuanHe: text(raw.moiQuanHe),
    xemBenhNen: flag(raw.xemBenhNen), xemDiUng: flag(raw.xemDiUng), xemKetQuaKham: flag(raw.xemKetQuaKham) };
  if (result.xemBenhNen) result.benhNen = text(raw.benhNen);
  if (result.xemDiUng) result.diUng = text(raw.diUng);
  return result;
};
const FIELDS = {
  health: ['id', 'loaiChiSoId', 'tenChiSo', 'donVi', 'giaTri', 'giaTriPhu', 'thoiGianDo', 'laBatThuong'],
  medications: ['id', 'tenThuoc', 'lieuDung', 'donViTinh', 'cachDung', 'thoiGianDuKien', 'thoiGianThucTe', 'trangThai'],
  appointments: ['id', 'tenBenhVien', 'bacSiPhuTrach', 'chuyenKhoa', 'thoiGianKham', 'trangThai'],
  alerts: ['id', 'loaiCanhBao', 'mucDo', 'trangThai', 'ngayTao', 'noiDung'],
  sos: ['id', 'trangThai', 'ngayGui', 'ngayXuLy', 'noiDung'],
};
export const projectRelativeRows = (section, rows, profile) => {
  if (!FIELDS[section] || !Array.isArray(rows)) throw new Error('Phản hồi dữ liệu không hợp lệ.');
  return rows.map(raw => {
    if (!raw || Number(raw.nguoiCaoTuoiId) !== profile.id) throw new Error('Phản hồi không khớp hồ sơ đang xem. Vui lòng tải lại.');
    const result = Object.fromEntries(FIELDS[section].map(key => [key,
      ['giaTri', 'giaTriPhu'].includes(key) ? number(raw[key])
        : key === 'laBatThuong' ? raw[key] == null ? null : flag(raw[key]) : text(raw[key])]));
    result.nguoiCaoTuoiId = profile.id;
    if (section === 'appointments' && profile.xemKetQuaKham) result.ketQuaKham = text(raw.ketQuaKham);
    return result;
  });
};
export const portalError = error => {
  const status = error?.response?.status, code = error?.response?.data?.errorCode;
  if (status === 401) return { kind: 'expired', message: 'Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại.' };
  if (status === 403 || status === 404) return { kind: 'denied', message: 'Quyền theo dõi đã thay đổi hoặc liên kết không còn hiệu lực. Dữ liệu đang xem đã được đóng.' };
  if (code === 'RELATIVES_NOT_INSTALLED') return { kind: 'unavailable', message: 'Chức năng Người thân chưa sẵn sàng trên cơ sở dữ liệu này. Vui lòng liên hệ Quản trị viên.' };
  return { kind: 'error', message: 'Chưa tải được dữ liệu từ máy chủ. Vui lòng thử lại.' };
};
export const relativeLocalDate = value => {
  if (typeof value !== 'string' || !value) return null;
  const withZone = /(?:Z|[+-]\d\d:\d\d)$/.test(value) ? value : `${value}+07:00`;
  const date = new Date(withZone); return Number.isFinite(date.getTime()) ? date : null;
};
export const formatPortalTime = value => {
  const date = relativeLocalDate(value);
  return date ? new Intl.DateTimeFormat('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh', day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(date) : 'Chưa có dữ liệu';
};
export const metricGroups = rows => {
  const groups = new Map();
  for (const row of rows) {
    if (!groups.has(row.loaiChiSoId)) groups.set(row.loaiChiSoId, []);
    groups.get(row.loaiChiSoId).push(row);
  }
  return [...groups].map(([id, values]) => ({ id, values: [...values].sort((a, b) =>
    (relativeLocalDate(b.thoiGianDo)?.getTime() || 0) - (relativeLocalDate(a.thoiGianDo)?.getTime() || 0)) }));
};
export const sevenDayTrend = (rows, now = new Date()) => {
  const day = new Date(now.getTime() + 7 * 3600000).toISOString().slice(0, 10);
  const start = new Date(`${day}T00:00:00+07:00`).getTime() - 6 * 86400000;
  return rows.filter(row => { const time = relativeLocalDate(row.thoiGianDo)?.getTime();
    return row.giaTri != null && time >= start && time <= now.getTime(); })
    .sort((a, b) => relativeLocalDate(a.thoiGianDo) - relativeLocalDate(b.thoiGianDo));
};

// Dependency-injected GET-only API adapter, used with the existing authenticated axios client.
export const createRelativePortalApi = client => {
  const data = response => response.data?.data;
  const query = options => Object.fromEntries(['tuNgay', 'denNgay', 'loaiChiSoId', 'limit', 'offset']
    .filter(key => options[key] !== undefined).map(key => [key, options[key]]));
  return Object.freeze({
    async list(options = {}, signal) {
      const rows = data(await client.get('/relatives/me/elderly', { params: query(options), signal, relativePortalRead: true }));
      if (!Array.isArray(rows)) throw new Error('Phản hồi danh sách không hợp lệ.');
      return rows.map(projectRelativeProfile);
    },
    async profile(id, signal) {
      id = portalId(id);
      const profile = projectRelativeProfile(data(await client.get(`/relatives/me/elderly/${id}`, { signal, relativePortalRead: true })));
      if (profile.id !== id) throw new Error('Phản hồi không khớp hồ sơ đang xem.');
      return profile;
    },
    async read(id, section, profile, options = {}, signal) {
      id = portalId(id);
      if (!Object.hasOwn(PORTAL_SECTIONS, section) || profile.id !== id) throw new Error('Loại dữ liệu hoặc hồ sơ không hợp lệ.');
      return projectRelativeRows(section, data(await client.get(`/relatives/me/elderly/${id}/${PORTAL_SECTIONS[section]}`,
        { params: query(options), signal, relativePortalRead: true })), profile);
    },
  });
};
