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

module.exports = { metricAssessmentSql, metricAssessment };
