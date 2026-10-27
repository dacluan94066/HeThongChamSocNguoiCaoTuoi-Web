import dayjs from 'dayjs';
import utc from 'dayjs/plugin/utc.js';
import timezone from 'dayjs/plugin/timezone.js';
import { parseAlertTime } from './alertTime.js';

dayjs.extend(utc);
dayjs.extend(timezone);
const VIETNAM_ZONE = 'Asia/Ho_Chi_Minh';

// UTC/offset strings identify instants; legacy unzoned measurements are Vietnam wall time.
export const metricTime = (metric) => {
  const instant = parseAlertTime(metric.thoiGianDo || `${metric.ngayDo}T${metric.gioDo || '00:00'}`);
  return instant ? dayjs(instant).tz(VIETNAM_ZONE) : dayjs(NaN);
};

// Per-value timezone only: do not change Day.js's or the host's default timezone.
export const metricNow = (now = Date.now()) => dayjs(now).tz(VIETNAM_ZONE);
