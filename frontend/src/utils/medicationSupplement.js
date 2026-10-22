// Schedule API serializes SQL DATETIME2 in Vietnam wall time, without an offset.
export function canSupplementDose(dose, now = new Date()) {
  if (!['BO_LO', 'CHUA_DEN_GIO'].includes(dose?.trangThaiHom_nay) || dose.ghiNhanBoSung) return false;
  const value = dose.thoiGianDuKien;
  if (typeof value !== 'string') return false;
  const scheduled = new Date(`${value.slice(0, 19)}+07:00`);
  const today = new Date(now.getTime() + 7 * 3600000).toISOString().slice(0, 10);
  return Number.isFinite(scheduled.getTime()) && value.slice(0, 10) < today
    && now - scheduled >= 0 && now - scheduled <= 48 * 3600000;
}
