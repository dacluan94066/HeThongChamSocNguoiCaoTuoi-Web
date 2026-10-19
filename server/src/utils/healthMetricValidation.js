const LIMITS = Object.freeze({
  'Huyết áp': Object.freeze({ min: 50, max: 300, secondaryMin: 30, secondaryMax: 200 }),
  'Nhịp tim': Object.freeze({ min: 20, max: 250 }),
  'Đường huyết': Object.freeze({ min: 20, max: 800, unit: 'mg/dL' }),
  'Nhiệt độ cơ thể': Object.freeze({ min: 30, max: 45 }),
  'SpO2': Object.freeze({ min: 50, max: 100 }),
  'Cân nặng': Object.freeze({ min: 10, max: 300 }),
});

const validateMetricValues = (type, primary, secondary) => {
  const limit = LIMITS[type.TenChiSo];
  if (!limit) return 'Loại chỉ số sức khỏe chưa có giới hạn hợp lệ';
  if (limit.unit && type.DonVi !== limit.unit) {
    return `Đơn vị ${type.TenChiSo} phải là ${limit.unit}`;
  }
  if (!Number.isFinite(primary) || primary < limit.min || primary > limit.max) {
    return `${type.TenChiSo} phải từ ${limit.min} đến ${limit.max} ${type.DonVi || ''}`.trim();
  }
  if (limit.secondaryMin != null) {
    if (!Number.isFinite(secondary) || secondary < limit.secondaryMin || secondary > limit.secondaryMax) {
      return `Huyết áp tâm trương phải từ ${limit.secondaryMin} đến ${limit.secondaryMax} mmHg`;
    }
    if (primary <= secondary) return 'Huyết áp tâm thu phải lớn hơn tâm trương';
  } else if (secondary != null) {
    return `${type.TenChiSo} không có giá trị phụ`;
  }
  return null;
};

const validateMeasurementTime = ({ ngayDo, gioDo, thoiGianDo } = {}) => {
  const nowVietnam = Date.now() + 7 * 60 * 60 * 1000;
  if (ngayDo != null || gioDo != null) {
    if (typeof ngayDo !== 'string' || typeof gioDo !== 'string'
      || !/^\d{4}-\d{2}-\d{2}$/.test(ngayDo)
      || !/^([01]\d|2[0-3]):[0-5]\d$/.test(gioDo)) {
      return 'Ngày và giờ đo phải đúng định dạng YYYY-MM-DD, HH:mm';
    }
    const parsed = new Date(`${ngayDo}T${gioDo}:00Z`);
    if (Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 16) !== `${ngayDo}T${gioDo}`) {
      return 'Ngày giờ đo không hợp lệ';
    }
    if (parsed.getTime() > nowVietnam) return 'Thời điểm đo không được ở tương lai';
  }
  if (thoiGianDo != null) {
    if (typeof thoiGianDo !== 'string') return 'Thời điểm đo không hợp lệ';
    const parsed = new Date(thoiGianDo);
    if (Number.isNaN(parsed.getTime())) return 'Thời điểm đo không hợp lệ';
    if (parsed.getTime() > Date.now()) return 'Thời điểm đo không được ở tương lai';
  }
  return null;
};

module.exports = { LIMITS, validateMetricValues, validateMeasurementTime };
