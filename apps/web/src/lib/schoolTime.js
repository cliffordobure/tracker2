/** School wall clock (Kenya). Dates from the API are UTC; do not shift them in the browser. */
export const SCHOOL_TZ = 'Africa/Nairobi';

function pad(n) {
  return String(n).padStart(2, '0');
}

export function fmtSchoolDate(value) {
  if (!value) return '';
  if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}/.test(value)) {
    const [y, m, d] = value.slice(0, 10).split('-').map(Number);
    const local = new Date(y, m - 1, d);
    if (Number.isNaN(local.getTime())) return '';
    return local.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
  }
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '';
  if (
    d.getUTCHours() === 0 &&
    d.getUTCMinutes() === 0 &&
    d.getUTCSeconds() === 0 &&
    d.getUTCMilliseconds() === 0
  ) {
    return d.toLocaleDateString(undefined, {
      timeZone: 'UTC',
      day: 'numeric',
      month: 'short',
      year: 'numeric',
    });
  }
  return d.toLocaleDateString(undefined, {
    timeZone: SCHOOL_TZ,
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}

export function fmtSchoolTime(value) {
  if (!value) return '';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleTimeString(undefined, {
    timeZone: SCHOOL_TZ,
    hour: 'numeric',
    minute: '2-digit',
  });
}

export function fmtClock(hhmm) {
  if (!hhmm) return '';
  const [h, m] = String(hhmm).split(':').map(Number);
  if (!Number.isFinite(h)) return String(hhmm);
  const d = new Date();
  d.setHours(h, Number.isFinite(m) ? m : 0, 0, 0);
  return d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
}

export function plannedTripClock(t) {
  const named = t?.scheduledTime || t?.scheduleId?.scheduledTime;
  if (named) return fmtClock(named);
  if (!t?.scheduledFor) return '';
  const d = new Date(t.scheduledFor);
  if (Number.isNaN(d.getTime())) return '';
  return fmtClock(`${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}`);
}

export function tripStartLabel(t) {
  if (t?.startedAt) return fmtSchoolTime(t.startedAt);
  return plannedTripClock(t);
}
