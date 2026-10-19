const { todayVietnam } = require('./vietnamDate');

const MAX_LENGTH = Object.freeze({
  hoTen: 100, cccd: 20, diaChi: 255, soDienThoai: 15,
  nhomMau: 5, benhNen: 500, diUng: 300,
});

const isValidDate = (value) => {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value
    && value <= todayVietnam();
};

const validateElderlyProfile = (body, { partial = false } = {}) => {
  const value = {};
  for (const [field, max] of Object.entries(MAX_LENGTH)) {
    if (partial && body?.[field] === undefined) continue;
    const raw = body?.[field];
    if (raw == null || raw === '') {
      value[field] = null;
      continue;
    }
    if (typeof raw !== 'string' && !(Array.isArray(raw) && ['benhNen', 'diUng'].includes(field)
      && raw.every((item) => typeof item === 'string'))) {
      return { error: { field, message: `${field} phải là chuỗi hợp lệ` } };
    }
    value[field] = (Array.isArray(raw) ? raw.join(', ') : raw).trim() || null;
    if (value[field] && value[field].length > max) {
      const label = { hoTen: 'Họ tên', cccd: 'CCCD', diaChi: 'Địa chỉ',
        soDienThoai: 'Số điện thoại', nhomMau: 'Nhóm máu',
        benhNen: 'Bệnh nền', diUng: 'Dị ứng' }[field];
      return { error: { field, message: `${label} không được quá ${max} ký tự` } };
    }
  }
  if ((!partial || body?.hoTen !== undefined) && !value.hoTen) {
    return { error: { field: 'hoTen', message: 'Họ tên là bắt buộc' } };
  }
  if (!partial || body?.ngaySinh !== undefined) {
    if (!isValidDate(body?.ngaySinh)) {
      return { error: { field: 'ngaySinh', message: 'Ngày sinh phải đúng YYYY-MM-DD và không ở tương lai' } };
    }
    value.ngaySinh = body.ngaySinh;
  }
  if (!partial || body?.gioiTinh !== undefined) {
    if (!['Nam', 'Nữ', 'Khác'].includes(body?.gioiTinh)) {
      return { error: { field: 'gioiTinh', message: 'Giới tính chỉ nhận Nam, Nữ hoặc Khác' } };
    }
    value.gioiTinh = body.gioiTinh;
  }
  if (value.soDienThoai && !/^0\d{9}$/.test(value.soDienThoai)) {
    return { error: { field: 'soDienThoai', message: 'Số điện thoại phải có 10 số và bắt đầu bằng 0' } };
  }
  if (value.cccd && !/^\d{12}$/.test(value.cccd)) {
    return { error: { field: 'cccd', message: 'CCCD phải gồm đúng 12 số' } };
  }
  return { value };
};

module.exports = { validateElderlyProfile, MAX_LENGTH };
