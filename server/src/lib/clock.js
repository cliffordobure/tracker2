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
  const list = parts(value, { hour: 'numeric', minute: '2-digit', hour12: true });
  if (!list) return '';
  const hour = part(list, 'hour');
  const minute = part(list, 'minute');
  const period = part(list, 'dayPeriod').toUpperCase();
  if (!hour || !minute) return '';
  return `${hour}:${minute} ${period}`;
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
