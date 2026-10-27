const VIETNAM_ZONE = 'Asia/Ho_Chi_Minh';
// Explicit Z/offset timestamps are instants. Unzoned legacy SOS strings mean Vietnam wall time.
export function parseAlertTime(value) {
  if (typeof value !== 'string' || !value.trim()) return null;
  const text = value.trim();
  const match = text.match(/^(\d{4}-\d{2}-\d{2})T(\d{2}):(\d{2})(?::(\d{2})(?:\.\d{1,7})?)?(Z|[+-]\d{2}:\d{2})?$/);
  if (!match || +match[2] > 23 || +match[3] > 59 || +(match[4] || 0) > 59) return null;
  const day = new Date(`${match[1]}T00:00:00Z`);
  if (!Number.isFinite(day.getTime()) || day.toISOString().slice(0, 10) !== match[1]) return null;
  const date = new Date(match[5] ? text : `${text}+07:00`);
  return Number.isFinite(date.getTime()) ? date : null;
}

export function vietnamAlertParts(value) {
  const date = parseAlertTime(value);
  if (!date) return null;
  const parts = Object.fromEntries(new Intl.DateTimeFormat('en-GB', {
    timeZone: VIETNAM_ZONE, year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
  }).formatToParts(date).map(part => [part.type, part.value]));
  return { date: `${parts.day}/${parts.month}/${parts.year}`, time: `${parts.hour}:${parts.minute}`,
    dayKey: `${parts.year}-${parts.month}-${parts.day}` };
}

export function formatAlertTime(value, dashboard = false) {
  const parts = vietnamAlertParts(value);
  return parts ? dashboard ? `${parts.time} · ${parts.date}` : `${parts.date} ${parts.time}` : '—';
}

export function alertElapsedMinutes(created, handled = null, now = Date.now()) {
  const start = parseAlertTime(created)?.getTime();
  const end = handled == null ? now : parseAlertTime(handled)?.getTime();
  if (!Number.isFinite(start) || !Number.isFinite(end) || end < start) return null;
  return Math.floor((end - start) / 60000);
}

export function formatAlertWaiting(minutes) {
  if (!Number.isFinite(minutes) || minutes < 0) return 'Chưa rõ thời gian';
  if (minutes < 1) return 'Vừa ghi nhận';
  if (minutes < 60) return `${minutes} phút`;
  if (minutes < 1440) return `${Math.floor(minutes / 60)} giờ ${minutes % 60} phút`;
  const hours = Math.floor((minutes % 1440) / 60);
  return `${Math.floor(minutes / 1440)} ngày${hours ? ` ${hours} giờ` : ''}`;
}
