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

const evaluateMetric = ({ tenChiSo, giaTri, giaTriPhu, min, max, min2, max2, manuallyAbnormal }) => {
  const primaryOutOfRange = (min != null && giaTri < Number(min)) || (max != null && giaTri > Number(max));
  const secondaryOutOfRange = giaTriPhu != null
    && ((min2 != null && giaTriPhu < Number(min2)) || (max2 != null && giaTriPhu > Number(max2)));
  const abnormal = manuallyAbnormal || primaryOutOfRange || secondaryOutOfRange;

  if (!abnormal) return { abnormal: false, level: null, description: null };

  const farOutsidePrimary = (min != null && giaTri < Number(min) * 0.8)
    || (max != null && giaTri > Number(max) * 1.2);
  const farOutsideSecondary = giaTriPhu != null
    && ((min2 != null && giaTriPhu < Number(min2) * 0.8)
      || (max2 != null && giaTriPhu > Number(max2) * 1.2));
  const level = farOutsidePrimary || farOutsideSecondary ? 'Cao' : 'TrungBinh';
  const measuredValue = giaTriPhu != null ? `${giaTri}/${giaTriPhu}` : String(giaTri);
  const primaryRange = min != null || max != null ? `${min ?? '—'}–${max ?? '—'}` : 'chưa cấu hình';
  const secondaryRange = giaTriPhu != null && (min2 != null || max2 != null)
    ? `; ngưỡng phụ ${min2 ?? '—'}–${max2 ?? '—'}`
    : '';

  return {
    abnormal: true,
    level,
    description: `${tenChiSo} ghi nhận ${measuredValue}, ngoài ngưỡng theo dõi ${primaryRange}${secondaryRange}.`,
  };
};

module.exports = { metricAssessmentSql, metricAssessment, MAP_LOAI, evaluateMetric };
