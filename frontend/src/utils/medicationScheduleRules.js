const medicineId = value => Number.isInteger(Number(value)) && Number(value) > 0 ? Number(value) : null;

export const selectedMedicineIds = (rows = [], exceptIndex = -1) => new Set(
  rows.filter((_, index) => index !== exceptIndex).map(row => medicineId(row?.thuocId)).filter(id => id !== null),
);

export const findDuplicateMedicine = (rows = []) => {
  const first = new Map();
  for (const [index, row] of rows.entries()) {
    const id = medicineId(row?.thuocId);
    if (id === null) continue;
    if (first.has(id)) return { index, firstIndex: first.get(id), id };
    first.set(id, index);
  }
  return null;
};

// SQL API supplies Vietnam wall-clock DATETIME2 as YYYY-MM-DDTHH:mm:ss,
// without a timezone. Compare its calendar date, never convert it through UTC.
export const scheduledDate = schedule => {
  const date = typeof schedule?.thoiGianDuKien === 'string' ? schedule.thoiGianDuKien.slice(0, 10) : '';
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return null;
  const parsed = new Date(`${date}T00:00:00Z`);
  return Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== date ? null : date;
};

export const matchesScheduleDateRange = (schedule, from, to) => {
  if (!from && !to) return true;
  const date = scheduledDate(schedule);
  return Boolean(date && (!from || date >= from) && (!to || date <= to));
};
