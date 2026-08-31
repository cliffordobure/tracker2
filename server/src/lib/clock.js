/** School clocks: Kenya time, independent of the host (Render is UTC). */
const APP_TZ = process.env.APP_TIMEZONE || 'Africa/Nairobi';

function asDate(value) {
  const d = value instanceof Date ? value : value ? new Date(value) : null;
  if (!d || Number.isNaN(d.getTime())) return null;
  return d;
}

function parts(value, options) {
  const d = asDate(value);
  if (!d) return null;
  return new Intl.DateTimeFormat('en-US', { timeZone: APP_TZ, ...options }).formatToParts(d);
}

function part(list, type) {
  return list?.find((p) => p.type === type)?.value || '';
}

export function toIso(value) {
  const d = asDate(value);
  return d ? d.toISOString() : '';
}

export function formatClock(value) {
  const list = parts(value, { hour: '2-digit', minute: '2-digit', hour12: false, hourCycle: 'h23' });
  if (!list) return '';
  const hour = part(list, 'hour');
  const minute = part(list, 'minute');
  if (!hour || !minute) return '';
  return `${hour}:${minute}`;
}

export function formatDateKey(value) {
  const list = parts(value, { year: 'numeric', month: '2-digit', day: '2-digit' });
  if (!list) return '';
  return `${part(list, 'year')}-${part(list, 'month')}-${part(list, 'day')}`;
}

export function formatDateLabel(value) {
  const d = asDate(value);
  if (!d) return '';
  return new Intl.DateTimeFormat('en-GB', {
    timeZone: APP_TZ,
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  }).format(d);
}

export function formatDayClock(value) {
  const d = asDate(value);
  if (!d) return '';
  const that = formatDateKey(d);
  const today = formatDateKey(new Date());
  const yest = formatDateKey(new Date(Date.now() - 86400000));
  if (that === today) return formatClock(d);
  if (that === yest) return 'Yesterday';
  return new Intl.DateTimeFormat('en-GB', {
    timeZone: APP_TZ,
    day: 'numeric',
    month: 'short',
  }).format(d);
}

export function calendarGroup(value) {
  const that = formatDateKey(value);
  if (!that) return 'earlier';
  const today = formatDateKey(new Date());
  const yest = formatDateKey(new Date(Date.now() - 86400000));
  if (that === today) return 'today';
  if (that === yest) return 'yesterday';
  return 'earlier';
}

/** Offset of APP_TZ at `date`, in ms (Nairobi is always +3h). */
function offsetMsAt(date) {
  const list = parts(date, {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
  });
  if (!list) return 0;
  const asIfUtc = Date.UTC(
    Number(part(list, 'year')),
    Number(part(list, 'month')) - 1,
    Number(part(list, 'day')),
    Number(part(list, 'hour')),
    Number(part(list, 'minute')),
    Number(part(list, 'second'))
  );
  return asIfUtc - date.getTime();
}

/**
 * Build a Date for a school-local wall clock (YYYY-MM-DD + HH:mm),
 * independent of whether the host is UTC (Render) or not.
 */
export function fromAppZonedDateTime(ymd, hour = 0, minute = 0, second = 0) {
  const match = String(ymd || '').match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return null;
  const y = Number(match[1]);
  const mo = Number(match[2]);
  const d = Number(match[3]);
  const hh = Number.isFinite(Number(hour)) ? Number(hour) : 0;
  const mm = Number.isFinite(Number(minute)) ? Number(minute) : 0;
  const ss = Number.isFinite(Number(second)) ? Number(second) : 0;
  let utcMs = Date.UTC(y, mo - 1, d, hh, mm, ss);
  for (let i = 0; i < 2; i += 1) {
    const offset = offsetMsAt(new Date(utcMs));
    utcMs = Date.UTC(y, mo - 1, d, hh, mm, ss) - offset;
  }
  return new Date(utcMs);
}
