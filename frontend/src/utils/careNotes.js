export const CARE_NOTE_TYPES = {
  CHAM_SOC_HANG_NGAY: 'Chăm sóc hàng ngày', SU_CO: 'Sự cố',
  VAT_LY_TRI_LIEU: 'Vật lý trị liệu', CANH_BAO: 'Cảnh báo',
};
export const vietnamNowWall = (now = new Date()) => new Date(now.getTime() + 7 * 3600000).toISOString().slice(0, 19);
export const careNoteMoment = (note) => note?.thoiGianChamSoc
  || (note?.ngay ? `${note.ngay}T${note.thoiGian || '00:00'}${note.thoiGian?.length > 5 ? '' : ':00'}` : null);
export function buildCareNoteQuery({ elderlyId, from, to, type, search } = {}) {
  const query = {};
  if (elderlyId != null && elderlyId !== '') query.nguoiCaoTuoiId = elderlyId;
  if (from) query.tuNgay = from;
  if (to) query.denNgay = to;
  if (type) query.loaiNhatKy = type;
  if (search?.trim()) query.search = search.trim();
  return query;
}
export function groupCareNotesByDay(notes) {
  const grouped = new Map();
  const sorted = [...notes].sort((a, b) => (careNoteMoment(b) || '').localeCompare(careNoteMoment(a) || '') || Number(b.id) - Number(a.id));
  sorted.forEach((note) => {
    const moment = careNoteMoment(note);
    const key = moment && /^\d{4}-\d{2}-\d{2}T/.test(moment) ? moment.slice(0, 10) : 'unknown';
    if (!grouped.has(key)) grouped.set(key, []);
    grouped.get(key).push(note);
  });
  return [...grouped.entries()].map(([day, entries]) => ({ day, entries }));
}
// Identity, creation timestamp and business state are authoritative on the server.
export function buildCareNotePayload(values, record = null) {
  const payload = { tieuDe: values.tieuDe.trim(), noiDung: values.noiDung.trim(), loaiNhatKy: values.loaiNhatKy,
    thoiGianChamSoc: `${values.thoiGianChamSoc.length >= 19 ? values.thoiGianChamSoc.slice(0, 19) : values.thoiGianChamSoc.slice(0, 16) + ':00'}+07:00` };
  if (record) { payload.version = record.version; payload.lyDo = values.lyDo.trim(); }
  else payload.nguoiCaoTuoiId = values.nguoiCaoTuoiId;
  return payload;
}
export const careNoteError = (error, fallback = 'Không thể tải nhật ký. Vui lòng thử lại.') => error?.response?.data?.message || fallback;
export const isCareNoteConflict = (error) => error?.response?.status === 409;
export function isValidCareTime(value, nowWall = vietnamNowWall()) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2})?$/.test(value)) return false;
  const normalized = value.length === 16 ? `${value}:00` : value;
  const date = new Date(`${normalized}Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 19) === normalized && normalized <= nowWall;
}
