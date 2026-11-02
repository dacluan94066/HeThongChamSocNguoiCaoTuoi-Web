// Presentation metadata only: never changes stored LaBatThuong, clinical limits
// or alert generation. Missing limits cannot be interpreted as a normal result.
const metricAssessmentSql = (type, metric) => `CASE
  WHEN ${metric}.LaBatThuong=1 THEN 'BAT_THUONG'
  WHEN (${type}.GiaTriMin IS NULL AND ${type}.GiaTriMax IS NULL)
    OR (${metric}.GiaTriPhu IS NOT NULL AND ${type}.GiaTriMin2 IS NULL AND ${type}.GiaTriMax2 IS NULL)
    THEN 'CHUA_CO_NGUONG'
  ELSE 'BINH_THUONG' END`;

const metricAssessment = row => row.laBatThuong ? 'BAT_THUONG'
  : row.trangThaiDanhGia === 'BINH_THUONG' ? 'BINH_THUONG' : 'CHUA_CO_NGUONG';

// Map TenChiSo trong DB -> loaiChiSo frontend
const MAP_LOAI = {
  'Huyết áp':         { ma: 'HUYET_AP',    donVi: 'mmHg' },
  'Nhịp tim':         { ma: 'NHIP_TIM',    donVi: 'lần/phút' },
  'Đường huyết':      { ma: 'DUONG_HUYET', donVi: 'mg/dL' },
  'Nhiệt độ cơ thể':  { ma: 'NHIET_DO',    donVi: '°C' },
  'SpO2':             { ma: 'SPO2',         donVi: '%' },
  'Cân nặng':         { ma: 'CAN_NANG',    donVi: 'kg' },
};

const checkCriticalMetric = ({ tenChiSo, giaTri, giaTriPhu }) => {
  const name = (tenChiSo || '').toLowerCase();
  const v1 = Number(giaTri);
  const v2 = giaTriPhu != null ? Number(giaTriPhu) : null;

  if (name.includes('huyết áp') || name.includes('huyet ap')) {
    // Huyết áp tâm thu >= 180 hoặc <= 70, hoặc tâm trương >= 120 hoặc <= 40
    if (v1 >= 180 || v1 <= 70) return true;
    if (v2 != null && (v2 >= 120 || v2 <= 40)) return true;
  } else if (name.includes('spo2') || name.includes('oxy')) {
    // SpO2 < 90% (suy hô hấp cấp)
    if (v1 < 90) return true;
  } else if (name.includes('đường huyết') || name.includes('duong huyet')) {
    // Đường huyết < 50 hoặc > 350 mg/dL (nguy kịch)
    if (v1 < 50 || v1 > 350) return true;
  } else if (name.includes('nhịp tim') || name.includes('nhip tim')) {
    // Nhịp tim > 160 hoặc < 40 lần/phút
    if (v1 > 160 || v1 < 40) return true;
  } else if (name.includes('nhiệt độ') || name.includes('nhiet do')) {
    // Sốt cao >= 39.5°C hoặc hạ thân nhiệt < 35°C
    if (v1 >= 39.5 || v1 < 35.0) return true;
  }
  return false;
};

const evaluateMetric = ({ tenChiSo, giaTri, giaTriPhu, min, max, min2, max2, manuallyAbnormal }) => {
  const primaryOutOfRange = (min != null && giaTri < Number(min)) || (max != null && giaTri > Number(max));
  const secondaryOutOfRange = giaTriPhu != null
    && ((min2 != null && giaTriPhu < Number(min2)) || (max2 != null && giaTriPhu > Number(max2)));
  const abnormal = manuallyAbnormal || primaryOutOfRange || secondaryOutOfRange;

  if (!abnormal) return { abnormal: false, level: null, description: null };

  const isCritical = checkCriticalMetric({ tenChiSo, giaTri, giaTriPhu });

  const farOutsidePrimary = (min != null && giaTri < Number(min) * 0.8)
    || (max != null && giaTri > Number(max) * 1.2);
  const farOutsideSecondary = giaTriPhu != null
    && ((min2 != null && giaTriPhu < Number(min2) * 0.8)
      || (max2 != null && giaTriPhu > Number(max2) * 1.2));
  const level = isCritical ? 'KhanCap' : (farOutsidePrimary || farOutsideSecondary ? 'Cao' : 'TrungBinh');
  const measuredValue = giaTriPhu != null ? `${giaTri}/${giaTriPhu}` : String(giaTri);
  const primaryRange = min != null || max != null ? `${min ?? '—'}–${max ?? '—'}` : 'chưa cấu hình';
  const secondaryRange = giaTriPhu != null && (min2 != null || max2 != null)
    ? `; ngưỡng phụ ${min2 ?? '—'}–${max2 ?? '—'}`
    : '';

  const prefix = isCritical ? '[CẤP CỨU NGUY KỊCH] ' : '';
  return {
    abnormal: true,
    level,
    description: `${prefix}${tenChiSo} ghi nhận ${measuredValue}, ngoài ngưỡng theo dõi ${primaryRange}${secondaryRange}.`,
  };
};

module.exports = { metricAssessmentSql, metricAssessment, MAP_LOAI, evaluateMetric, checkCriticalMetric };
