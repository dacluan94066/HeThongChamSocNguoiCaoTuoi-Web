const medicineId = value => Number.isInteger(Number(value)) && Number(value) > 0 ? Number(value) : null;

// Preview the first actual future occurrence, not HH:mm in isolation.
// Backend rechecks using its own clock; this preview never authorizes a write.
export const prescriptionDosePreview = (start, end, times, now = new Date()) => {
  const validDay = value => typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)
    && Number.isFinite(Date.parse(`${value}T00:00:00Z`))
    && new Date(`${value}T00:00:00Z`).toISOString().slice(0, 10) === value;
  if (!validDay(start) || (end && !validDay(end)) || !Array.isArray(times) || !times.length
    || times.some(time => typeof time !== 'string' || !/^([01]\d|2[0-3]):[0-5]\d$/.test(time))
    || !Number.isFinite(now.getTime())) return null;
  const addDays = (day, count) => new Date(Date.parse(`${day}T00:00:00Z`) + count * 86400000).toISOString().slice(0, 10);
  const last = end || addDays(start, 29);
  const parts = Object.fromEntries(new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Ho_Chi_Minh', year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23',
  }).formatToParts(now).map(part => [part.type, part.value]));
  const today = `${parts.year}-${parts.month}-${parts.day}`;
  const wallNow = `${today}T${parts.hour}:${parts.minute}:${parts.second}`;
  if (start < today || last < start) return { firstDose: null, skippedToday: 0 };
  const hours = [...times].sort();
  const skippedToday = start === today ? hours.filter(time => `${start}T${time}:00` <= wallNow).length : 0;
  let firstDay = start;
  let hour = hours.find(time => `${firstDay}T${time}:00` > wallNow);
  if (!hour) { firstDay = addDays(start, 1); hour = hours[0]; }
  return { firstDose: firstDay <= last ? `${firstDay}T${hour}:00` : null, skippedToday };
};

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
