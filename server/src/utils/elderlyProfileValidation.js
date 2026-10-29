const { todayVietnam } = require('./vietnamDate');

const MAX_LENGTH = Object.freeze({
  hoTen: 100, cccd: 20, diaChi: 255, soDienThoai: 15,
  nhomMau: 5, benhNen: 500, diUng: 300,
});

const calculateExactAge = (birthDateString, todayString = todayVietnam()) => {
  const [bYear, bMonth, bDay] = birthDateString.split('-').map(Number);
  const [tYear, tMonth, tDay] = todayString.split('-').map(Number);
  let age = tYear - bYear;
  const passedBirthday = (tMonth > bMonth) || (tMonth === bMonth && tDay >= bDay);
  if (!passedBirthday) age -= 1;
  return age;
};

const validateElderlyBirthDate = (value, today = todayVietnam()) => {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return 'Ngày sinh phải đúng định dạng YYYY-MM-DD';
  }
  const date = new Date(`${value}T00:00:00Z`);
  if (Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== value) {
    return 'Ngày sinh không hợp lệ';
  }
  if (value > today) {
    return 'Ngày sinh không được ở tương lai';
  }
  const [year] = value.split('-').map(Number);
  if (year < 1900) {
    return 'Ngày sinh không được trước năm 1900';
  }
  const age = calculateExactAge(value, today);
  if (age < 60) {
    return 'Người cao tuổi phải từ đủ 60 tuổi trở lên';
  }
  return null;
};

const isValidDate = (value) => validateElderlyBirthDate(value) === null;

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
    const birthError = validateElderlyBirthDate(body?.ngaySinh);
    if (birthError) {
      return { error: { field: 'ngaySinh', message: birthError } };
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

module.exports = { validateElderlyProfile, validateElderlyBirthDate, calculateExactAge, MAX_LENGTH };
