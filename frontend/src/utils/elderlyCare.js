import { parseAlertTime, vietnamAlertParts } from './alertTime.js';

export const ownDay = (now = new Date()) => vietnamAlertParts(now.toISOString()).dayKey;
export const dayOf = value => vietnamAlertParts(value)?.dayKey || '';
export const instant = value => parseAlertTime(value)?.getTime() ?? NaN;
export const newestFirst = (rows, field) => [...rows].sort((a, b) => instant(b[field]) - instant(a[field]));
export const doseProgress = rows => ({ total: rows.length, done: rows.filter(row => row.trangThai === 'DaUong').length });
export const latestMetrics = rows => {
  const latest = new Map();
  for (const row of newestFirst(rows, 'thoiGianDo')) if (!latest.has(String(row.loaiChiSoId))) latest.set(String(row.loaiChiSoId), row);
  return [...latest.values()];
};
export const metricValue = row => row?.giaTri == null ? 'Chưa có dữ liệu' : `${row.giaTri}${row.giaTriPhu != null ? `/${row.giaTriPhu}` : ''}`;
export const inDays = (value, from, to) => { const day = dayOf(value); return Boolean(day) && (!from || day >= from) && (!to || day <= to); };
export const canRecordPastDose = (row, now = new Date()) => ['ChuaDenGio', 'BoLo'].includes(row.trangThai)
  && !row.ghiNhanBoSung && dayOf(row.thoiGianDuKien) < ownDay(now)
  && now.getTime() >= instant(row.thoiGianDuKien) && now.getTime() - instant(row.thoiGianDuKien) <= 48 * 3600000;
export const ownError = error => error.response?.data?.message || error.message || 'Không thể tải dữ liệu. Vui lòng thử lại.';

const editable = ['hoTen', 'ngaySinh', 'gioiTinh', 'soDienThoai', 'diaChi', 'nhomMau', 'benhNen', 'diUng', 'email'];
export const editableProfile = values => Object.fromEntries(editable.filter(key => values[key] !== undefined)
  .map(key => [key, key === 'ngaySinh' && values[key]?.format ? values[key].format('YYYY-MM-DD') : values[key]]));

// A synchronous lock, so two events in the same render cannot submit twice.
export function createSingleFlight() {
  let pending = false;
  return async work => {
    if (pending) return { ignored: true };
    pending = true;
    try { return { value: await work() }; } finally { pending = false; }
  };
}

export function createElderlyCareApi(client, captureSession = () => undefined) {
  const config = (signal, params) => ({ signal, params, elderlyPortalRequest: true, webSessionStamp: captureSession() });
  const data = response => response.data?.data;
  const list = async (path, signal, params) => {
    const rows = data(await client.get(path, config(signal, params)));
    if (!Array.isArray(rows)) throw Error('Dữ liệu trả về không hợp lệ. Vui lòng tải lại.');
    return rows;
  };
  const owned = async (path, owner, signal, params) => {
    const rows = await list(path, signal, params);
    if (rows.some(row => row.nguoiCaoTuoiId != null && Number(row.nguoiCaoTuoiId) !== Number(owner))) {
      throw Error('Dữ liệu không khớp hồ sơ đang đăng nhập.');
    }
    return rows;
  };
  const id = value => { if (!Number.isSafeInteger(Number(value)) || Number(value) < 1) throw Error('Mã liều thuốc không hợp lệ.'); return Number(value); };
  return {
    types: signal => list('/health-metric-types', signal),
    metrics: (owner, params, signal) => owned('/elderly/me/health-metrics', owner, signal, { loaiChiSoId: params?.loaiChiSoId, tuNgay: params?.tuNgay, denNgay: params?.denNgay }),
    medications: (owner, day, signal) => owned('/elderly/me/medication-schedule', owner, signal, { tuNgay: day, denNgay: day }),
    appointments: (owner, upcoming, signal) => owned(`/elderly/me/appointments${upcoming ? '/upcoming' : ''}`, owner, signal),
    caregivers: signal => list('/elderly/me/caregivers', signal),
    addMetric: async (values, signal) => data(await client.post('/elderly/me/health-metrics', {
      loaiChiSoId: values.loaiChiSoId, giaTri: values.giaTri, ...(values.giaTriPhu != null ? { giaTriPhu: values.giaTriPhu } : {}), ghiChu: values.ghiChu,
    }, config(signal))),
    updateProfile: async (values, signal) => data(await client.put('/elderly/me', editableProfile(values), config(signal))),
    confirmDose: async (doseId, status, signal) => {
      if (!['DaUong', 'BoLo', 'TuChoi'].includes(status)) throw Error('Trạng thái không hợp lệ.');
      return data(await client.patch(`/medication-schedule/${id(doseId)}/confirm`, { trangThai: status }, config(signal)));
    },
    supplementDose: async (doseId, values, signal) => data(await client.patch(`/medication-schedule/${id(doseId)}/supplement`, {
      thoiGianThucTe: values.thoiGianThucTe, lyDo: values.lyDo,
    }, config(signal))),
  };
}
