// CanhBao/SOS datetime2 values are Vietnam wall time, unlike the UTC consent/audit tables.
// Resolve that storage zone inside SQL before the driver can label an unzoned value as UTC.
const alertTimestampSql = expression => {
  if (!/^(?:[A-Za-z]+\.)?[A-Za-z][A-Za-z0-9]*$/.test(expression)) throw new TypeError('Invalid timestamp column');
  return `CONVERT(VARCHAR(33),CAST(${expression} AS datetime2(3)) AT TIME ZONE 'SE Asia Standard Time' AT TIME ZONE 'UTC',127)`;
};

function instantMilliseconds(value) {
  if (typeof value !== 'string') return null;
  const match = value.match(/^(\d{4}-\d{2}-\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.\d{1,7})?(Z|[+-]\d{2}:\d{2})$/);
  if (!match || +match[2] > 23 || +match[3] > 59 || +match[4] > 59) return null;
  const day = new Date(`${match[1]}T00:00:00Z`);
  if (!Number.isFinite(day.getTime()) || day.toISOString().slice(0, 10) !== match[1]) return null;
  const time = Date.parse(value);
  return Number.isFinite(time) ? time : null;
}

function alertTiming(created, handled, now = Date.now()) {
  const start = instantMilliseconds(created);
  const end = handled == null ? now : instantMilliseconds(handled);
  if (start == null || !Number.isFinite(end)) return { minutes: null, error: 'INVALID_TIMESTAMP' };
  if (end < start) return { minutes: null, error: handled == null ? 'FUTURE_TIMESTAMP' : 'REVERSED_INTERVAL' };
  return { minutes: Math.floor((end - start) / 60000), error: null };
}

module.exports = { alertTimestampSql, instantMilliseconds, alertTiming };
