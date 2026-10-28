// Date/time form fields are Vietnam wall time, independent of the browser zone.
export const isFutureAppointment = (day, time, now = new Date()) => {
  if (typeof day !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(day)
    || typeof time !== 'string' || !/^([01]\d|2[0-3]):[0-5]\d$/.test(time)) return false;
  const calendar = new Date(`${day}T00:00:00Z`);
  if (!Number.isFinite(calendar.getTime()) || calendar.toISOString().slice(0, 10) !== day) return false;
  return Date.parse(`${day}T${time}:00+07:00`) > now.getTime();
};
