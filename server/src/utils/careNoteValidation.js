const NOTE_TYPE_LABELS = Object.freeze({
  CHAM_SOC_HANG_NGAY: 'Chăm sóc hàng ngày',
  SU_CO: 'Sự cố',
  VAT_LY_TRI_LIEU: 'Vật lý trị liệu',
  CANH_BAO: 'Cảnh báo',
});

const invalid = (field, message, code = 'INVALID_NOTE') => ({ error: { field, message, code } });
const validDay = (value) => {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00Z`);
  return Number.isFinite(date.getTime()) && date.getUTCFullYear() >= 1
    && date.toISOString().slice(0, 10) === value;
};

function normalizeCareTime(value, now = Date.now()) {
  if (typeof value !== 'string'
    || !/^\d{4}-\d{2}-\d{2}T([01]\d|2[0-3]):[0-5]\d(?::[0-5]\d(?:\.\d{1,6})?)?(Z|\+07:00)$/.test(value)
    || !validDay(value.slice(0, 10))) return null;
  const date = new Date(value);
  if (!Number.isFinite(date.getTime()) || date.getTime() > now) return null;
  return new Date(date.getTime() + 7 * 3600000).toISOString().slice(0, 19);
}

function validateCareNote(body, { requireReason = false, partial = false } = {}) {
  const input = body && typeof body === 'object' && !Array.isArray(body) ? body : {};
  const value = {};
  for (const [field, max, label] of [['tieuDe', 200, 'Việc đã làm'], ['noiDung', 1000, 'Nội dung chăm sóc']]) {
    if (!partial || Object.hasOwn(input, field)) {
      if (typeof input[field] !== 'string' || !input[field].trim() || input[field].trim().length > max) {
        return invalid(field, `${label} phải có từ 1 đến ${max} ký tự.`);
      }
      value[field] = input[field].trim();
    }
  }
  if (Object.hasOwn(input, 'loaiNhatKy')) {
    if (typeof input.loaiNhatKy !== 'string' || !Object.hasOwn(NOTE_TYPE_LABELS, input.loaiNhatKy)) {
      return invalid('loaiNhatKy', 'Vui lòng chọn loại nhật ký hợp lệ.', 'INVALID_NOTE_TYPE');
    }
    value.loaiNhatKy = input.loaiNhatKy;
  }
  if (Object.hasOwn(input, 'thoiGianChamSoc')) {
    const careTime = normalizeCareTime(input.thoiGianChamSoc);
    if (!careTime) return invalid('thoiGianChamSoc', 'Ngày/giờ chăm sóc phải hợp lệ, có múi giờ Việt Nam hoặc UTC và không ở tương lai.', 'INVALID_CARE_TIME');
    value.thoiGianChamSoc = careTime;
  }
  if (Object.hasOwn(input, 'lyDo') || requireReason) {
    if (typeof input.lyDo !== 'string' || input.lyDo.trim().length < 5 || input.lyDo.trim().length > 300) {
      return invalid('lyDo', 'Lý do phải có từ 5 đến 300 ký tự.', 'INVALID_REASON');
    }
    value.lyDo = input.lyDo.trim();
  }
  return { value };
}

function validateCareNoteFilters(query = {}) {
  const value = { elderlyId: null, from: null, to: null, type: null, search: null };
  const supplied = (field) => query[field] != null && query[field] !== '';
  if (supplied('nguoiCaoTuoiId')) {
    const raw = String(query.nguoiCaoTuoiId).trim();
    if (!/^\d+$/.test(raw) || Number(raw) < 1 || Number(raw) > 2147483647) {
      return invalid('nguoiCaoTuoiId', 'Hồ sơ người cao tuổi không hợp lệ.', 'INVALID_PROFILE');
    }
    value.elderlyId = Number(raw);
  }
  for (const field of ['ngay', 'tuNgay', 'denNgay']) {
    if (supplied(field) && !validDay(query[field])) {
      return invalid(field, 'Ngày lọc phải hợp lệ, dạng YYYY-MM-DD.', 'INVALID_NOTE_DATE');
    }
  }
  if (supplied('ngay') && (supplied('tuNgay') || supplied('denNgay'))) {
    return invalid('ngay', 'Chỉ chọn một ngày hoặc khoảng ngày, không dùng đồng thời.', 'INVALID_NOTE_DATE');
  }
  value.from = query.ngay || query.tuNgay || null;
  value.to = query.ngay || query.denNgay || null;
  if (value.from && value.to && value.from > value.to) {
    return invalid('tuNgay', 'Ngày bắt đầu không được sau ngày kết thúc.', 'INVALID_NOTE_DATE');
  }
  if (supplied('loaiNhatKy')) {
    if (typeof query.loaiNhatKy !== 'string' || !Object.hasOwn(NOTE_TYPE_LABELS, query.loaiNhatKy)) {
      return invalid('loaiNhatKy', 'Loại nhật ký không hợp lệ.', 'INVALID_NOTE_TYPE');
    }
    value.type = query.loaiNhatKy;
  }
  if (supplied('search')) {
    if (typeof query.search !== 'string' || query.search.trim().length > 100) {
      return invalid('search', 'Từ khóa tìm kiếm tối đa 100 ký tự.', 'INVALID_NOTE_SEARCH');
    }
    value.search = query.search.trim() || null;
  }
  return { value };
}

module.exports = { NOTE_TYPE_LABELS, validateCareNote, validateCareNoteFilters, normalizeCareTime };
