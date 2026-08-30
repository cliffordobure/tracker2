import { useEffect, useMemo, useState } from 'react';
import { Link, useOutletContext } from 'react-router-dom';
import { api } from '../../lib/api';

const HOURS = Array.from({ length: 13 }, (_, i) => i + 6);
const SLOT = 44;
const DONUT = {
  completed: '#16a34a',
  active: '#f97316',
  cancelled: '#e11d48',
  scheduled: '#3b82f6',
};
const EVENT_TYPES = [
  { id: 'event', label: 'Event' },
  { id: 'meeting', label: 'Meeting' },
  { id: 'academic', label: 'Academic' },
  { id: 'holiday', label: 'Holiday' },
];

function pad(n) {
  return String(n).padStart(2, '0');
}

function dateInput(d) {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function startOfWeek(d) {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  x.setDate(x.getDate() - ((x.getDay() + 6) % 7));
  return x;
}

function addDays(d, n) {
  const x = new Date(d);
  x.setDate(x.getDate() + n);
  return x;
}

function monthStart(d) {
  return new Date(d.getFullYear(), d.getMonth(), 1);
}

function monthEnd(d) {
  return new Date(d.getFullYear(), d.getMonth() + 1, 0);
}

function sameDay(a, b) {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

function fmtDayHead(d) {
  const wd = d.toLocaleDateString(undefined, { weekday: 'short' });
  return `${d.getDate()} ${wd}`;
}

function fmtRange(from, to) {
  const a = from.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
  const b = to.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
  return `${a} – ${b}`;
}

function fmtTime(value) {
  if (!value) return '';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
}

const SCHOOL_TZ = 'Africa/Nairobi';

function tzParts(value) {
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) return null;
  const list = new Intl.DateTimeFormat('en-US', {
    timeZone: SCHOOL_TZ,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(d);
  const get = (type) => list.find((p) => p.type === type)?.value || '';
  return {
    year: get('year'),
    month: get('month'),
    day: get('day'),
    hour: Number(get('hour')),
    minute: Number(get('minute')),
  };
}

function dayKey(value) {
  if (value instanceof Date && Number.isNaN(value.getTime())) return '';
  if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)) return value;
  if (value instanceof Date) return dateInput(value);
  const p = tzParts(value);
  if (p) return `${p.year}-${p.month}-${p.day}`;
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '';
  return dateInput(d);
}

function inSchoolWindow(minutes) {
  return minutes >= 6 * 60 && minutes < 18 * 60;
}

function clockMinutes(value, timeZone) {
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) return null;
  if (!timeZone) return d.getHours() * 60 + d.getMinutes();
  const p = tzParts(d);
  return p ? p.hour * 60 + p.minute : null;
}

function eventMinutes(item) {
  const start = item?.startAt;
  const nairobi = start ? clockMinutes(start, SCHOOL_TZ) : null;
  const local = start ? clockMinutes(start) : null;
  if (nairobi != null && inSchoolWindow(nairobi)) return nairobi - 6 * 60;
  if (local != null && inSchoolWindow(local)) return local - 6 * 60;
  if (item?.period === 'afternoon' || item?.period === 'evening') return 9 * 60;
  return 90;
}

function eventDuration(item) {
  if (!item?.endAt || !item?.startAt) return 45;
  const mins = (new Date(item.endAt) - new Date(item.startAt)) / 60000;
  if (!Number.isFinite(mins) || mins < 20 || mins > 75) return 45;
  return mins;
}

function donutStyle(items, total) {
  if (!total) return { background: '#e2e8f0' };
  let acc = 0;
  const parts = items.filter((i) => i.count > 0).map((item) => {
    const start = acc;
    acc += (item.count / total) * 100;
    return `${item.color} ${start}% ${acc}%`;
  });
  return { background: parts.length ? `conic-gradient(${parts.join(', ')})` : '#e2e8f0' };
}

function daysUntil(value) {
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return null;
  const a = new Date();
  a.setHours(0, 0, 0, 0);
  const b = new Date(d);
  b.setHours(0, 0, 0, 0);
  return Math.round((b - a) / 86400000);
}

function hourLabel(h) {
  if (h === 12) return '12 PM';
  if (h > 12) return `${h - 12} PM`;
  return `${h} AM`;
}

function CalIcon({ name }) {
  const p = {
    width: 14,
    height: 14,
    viewBox: '0 0 24 24',
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth: 1.8,
    strokeLinecap: 'round',
    strokeLinejoin: 'round',
  };
  if (name === 'calendar') {
    return (
      <svg {...p}>
        <rect x="3.5" y="5" width="17" height="15.5" rx="2" />
        <path d="M8 3.5v3M16 3.5v3M3.5 10h17" />
      </svg>
    );
  }
  if (name === 'bus') {
    return (
      <svg {...p}>
        <rect x="4" y="4.5" width="16" height="12" rx="2" />
        <path d="M4 11.5h16M7.2 16.5v1.8M16.8 16.5v1.8M7 8.2h3M14 8.2h3" />
      </svg>
    );
  }
  if (name === 'people') {
    return (
      <svg {...p}>
        <circle cx="9" cy="8" r="2.6" />
        <path d="M4.6 17.2a4.4 4.4 0 0 1 8.8 0" />
        <circle cx="16.2" cy="8.4" r="2.1" />
        <path d="M15.2 13.1a3.8 3.8 0 0 1 4.6 4.1" />
      </svg>
    );
  }
  if (name === 'chart') {
    return (
      <svg {...p}>
        <path d="M4 18.5V5.5M4 18.5h16" />
        <path d="m7.2 13.2 3.4-3.6 2.8 2.2 4.4-5.2" />
      </svg>
    );
  }
  if (name === 'warn') {
    return (
      <svg {...p}>
        <path d="M12 4.2 20.4 18.5H3.6L12 4.2Z" />
        <path d="M12 9.4v4.2M12 16.2h.01" />
      </svg>
    );
  }
  if (name === 'chevron') return <svg {...p}><path d="m9 6 6 6-6 6" /></svg>;
  if (name === 'caret') return <svg {...p} width={12} height={12}><path d="m6 9 5-6H1l5 6Z" fill="currentColor" stroke="none" /></svg>;
  if (name === 'plus') return <svg {...p}><path d="M12 5v14M5 12h14" /></svg>;
  if (name === 'prev') return <svg {...p}><path d="M15 6 9 12l6 6" /></svg>;
  if (name === 'next') return <svg {...p}><path d="m9 6 6 6-6 6" /></svg>;
  return null;
}

function UpcomingEmpty() {
  return (
    <svg width="88" height="72" viewBox="0 0 88 72" fill="none" aria-hidden="true">
      <rect x="16" y="12" width="36" height="40" rx="6" fill="#eef2ff" stroke="#c7d2fe" strokeWidth="1.6" />
      <path d="M24 16.5v-4M44 16.5v-4M16 24h36" stroke="#818cf8" strokeWidth="1.6" strokeLinecap="round" />
      <path d="M26 32h16M26 38h12" stroke="#818cf8" strokeWidth="1.6" strokeLinecap="round" />
      <circle cx="58" cy="44" r="12" fill="#fff" stroke="#6366f1" strokeWidth="1.8" />
      <path d="M58 39.2v6.2l3.4 2" stroke="#6366f1" strokeWidth="1.7" strokeLinecap="round" />
    </svg>
  );
}

function ReminderEmpty() {
  return (
    <svg width="88" height="72" viewBox="0 0 88 72" fill="none" aria-hidden="true">
      <path d="M44 14c-7.4 0-13.4 6-13.4 13.4v8.2c0 3.4-1.4 6.6-3.8 8.9l-1.6 1.5h36.6l-1.6-1.5a12.2 12.2 0 0 1-3.8-8.9v-8.2C57.4 20 51.4 14 44 14Z" fill="#eef2ff" stroke="#c7d2fe" strokeWidth="1.6" />
      <path d="M38 54.2a6.2 6.2 0 0 0 12 0" stroke="#6366f1" strokeWidth="1.7" strokeLinecap="round" />
      <rect x="58" y="18" width="16" height="12" rx="3" fill="#fff" stroke="#a5b4fc" strokeWidth="1.4" />
      <path d="M62 22.2h8M62 25.6h5" stroke="#818cf8" strokeWidth="1.3" strokeLinecap="round" />
    </svg>
  );
}

const emptyEvent = {
  title: '',
  category: 'event',
  startAt: '',
  endAt: '',
  allDay: false,
  venue: '',
  body: '',
};

export default function CalendarPage() {
  const { globalSearch = '' } = useOutletContext() || {};
  const [view, setView] = useState('week');
  const [cursor, setCursor] = useState(() => startOfWeek(new Date()));
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [q, setQ] = useState('');
  const [showAdd, setShowAdd] = useState(false);
  const [showAddMenu, setShowAddMenu] = useState(false);
  const [form, setForm] = useState(emptyEvent);
  const [saving, setSaving] = useState(false);
  const year = new Date().getFullYear();
  const today = useMemo(() => {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    return d;
  }, []);

  const range = useMemo(() => {
    if (view === 'day') {
      const d = new Date(cursor);
      d.setHours(0, 0, 0, 0);
      return { from: d, to: d };
    }
    if (view === 'month') {
      return { from: monthStart(cursor), to: monthEnd(cursor) };
    }
    const from = startOfWeek(cursor);
    return { from, to: addDays(from, 6) };
  }, [view, cursor]);

  const load = async () => {
    try {
      const params = new URLSearchParams({ from: dateInput(range.from), to: dateInput(range.to) });
      const next = await api(`/admin/calendar?${params.toString()}`);
      setData(next);
      setError('');
    } catch (e) {
      setError(e.message);
    }
  };

  useEffect(() => {
    load();
  }, [range.from.getTime(), range.to.getTime()]);

  useEffect(() => {
    if (globalSearch) setQ(globalSearch);
  }, [globalSearch]);

  useEffect(() => {
    if (!showAddMenu) return undefined;
    const close = () => setShowAddMenu(false);
    window.addEventListener('click', close);
    return () => window.removeEventListener('click', close);
  }, [showAddMenu]);

  const needle = q.trim().toLowerCase();
  const items = useMemo(() => {
    const rows = data?.items || [];
    if (!needle) return rows;
    return rows.filter((i) => `${i.title} ${i.busLabel || ''} ${i.period || ''} ${i.category || ''}`.toLowerCase().includes(needle));
  }, [data, needle]);

  const days = useMemo(() => {
    if (view === 'day') return [new Date(range.from)];
    if (view === 'month') return [];
    return Array.from({ length: 7 }, (_, i) => addDays(range.from, i));
  }, [view, range]);

  const monthCells = useMemo(() => {
    if (view !== 'month') return [];
    const start = startOfWeek(monthStart(cursor));
    return Array.from({ length: 42 }, (_, i) => addDays(start, i));
  }, [view, cursor]);

  const kpis = [
    { label: 'Scheduled Trips', value: data?.kpis?.trips ?? 0, hint: 'In this date range.', tint: 'purple', icon: 'calendar', to: '/school-admin/trip-instances' },
    { label: 'Vehicles on trips', value: data?.kpis?.vehicles ?? 0, hint: 'Currently in use.', tint: 'green', icon: 'bus', to: '/school-admin/live-tracking' },
    { label: 'Students listed', value: data?.kpis?.students ?? 0, hint: 'In this range.', tint: 'orange', icon: 'people', to: '/school-admin/students' },
    { label: 'On-time Performance', value: '—', hint: 'Not tracked.', tint: 'sky', icon: 'chart', to: '/school-admin/reports' },
    { label: 'Incidents', value: data?.kpis?.incidents ?? 0, hint: 'In this range.', tint: 'rose', icon: 'warn', to: '/school-admin/incidents' },
  ];
  const summary = data?.tripSummary || {};
  const donutItems = [
    { key: 'completed', label: 'Completed', count: summary.completed || 0, color: DONUT.completed },
    { key: 'active', label: 'In Progress', count: summary.active || 0, color: DONUT.active },
    { key: 'cancelled', label: 'Cancelled', count: summary.cancelled || 0, color: DONUT.cancelled },
    { key: 'scheduled', label: 'Scheduled', count: summary.scheduled || 0, color: DONUT.scheduled },
  ];
  const donutTotal = donutItems.reduce((s, i) => s + i.count, 0);
  const allDayItems = items.filter((i) => i.allDay);

  const shift = (dir) => {
    if (view === 'day') setCursor((c) => addDays(c, dir));
    else if (view === 'month') setCursor((c) => new Date(c.getFullYear(), c.getMonth() + dir, 1));
    else setCursor((c) => addDays(c, dir * 7));
  };

  const jumpToday = () => {
    setCursor(view === 'week' ? startOfWeek(new Date()) : new Date());
  };

  const jumpToDate = (value) => {
    if (!value) return;
    const d = new Date(`${value}T00:00:00`);
    if (Number.isNaN(d.getTime())) return;
    setCursor(view === 'week' ? startOfWeek(d) : d);
  };

  const openAdd = (category = 'event') => {
    setForm({ ...emptyEvent, category });
    setShowAddMenu(false);
    setShowAdd(true);
  };

  const saveEvent = async () => {
    setSaving(true);
    setError('');
    try {
      await api('/admin/calendar-events', {
        method: 'POST',
        body: {
          title: form.title,
          category: form.category,
          startAt: form.allDay ? `${form.startAt}T00:00:00` : form.startAt,
          endAt: form.endAt || null,
          allDay: form.allDay,
          venue: form.venue,
          body: form.body,
        },
      });
      setShowAdd(false);
      setForm(emptyEvent);
      await load();
    } catch (e) {
      setError(e.message);
    } finally {
      setSaving(false);
    }
  };

  const blockStyle = (item, lane = 0, lanes = 1) => {
    const startMin = Math.max(0, Math.min(11 * 60, eventMinutes(item)));
    const height = Math.max(22, (eventDuration(item) / 60) * SLOT);
    const gap = 3;
    const width = `calc((100% - ${(lanes + 1) * gap}px) / ${lanes})`;
    const left = `calc(${gap}px + ${lane} * (${width} + ${gap}px))`;
    return { top: `${(startMin / 60) * SLOT}px`, height: `${height}px`, left, width };
  };

  const layoutDay = (timed) => {
    const sorted = [...timed].sort((a, b) => eventMinutes(a) - eventMinutes(b) || String(a.id).localeCompare(String(b.id)));
    return sorted.map((item, index) => {
      const start = eventMinutes(item);
      const end = start + eventDuration(item);
      const cluster = sorted.filter((other) => {
        const os = eventMinutes(other);
        const oe = os + eventDuration(other);
        return os < end && oe > start;
      });
      return { item, lane: Math.max(0, cluster.findIndex((row) => row === item)), lanes: Math.max(1, cluster.length), index };
    });
  };

  const itemHref = (item) => {
    if (item.kind !== 'trip') return '';
    if (item.status === 'active' && item.tripId) return `/school-admin/live-tracking?trip=${item.tripId}`;
    if (item.routeId) return `/school-admin/routes/${item.routeId}`;
    return '/school-admin/trip-instances';
  };

  const renderBlock = (item, lane = 0, lanes = 1) => {
    const cls = `sa-cal-block is-${item.tone}${item.allDay ? ' is-allday' : ''}`;
    const href = itemHref(item);
    const inner = (
      <>
        <i className="sa-cal-dot" aria-hidden="true" />
        <strong>{item.title}</strong>
      </>
    );
    const style = item.allDay ? undefined : blockStyle(item, lane, lanes);
    if (href) {
      return (
        <Link key={`${item.kind}-${item.id}`} className={cls} style={style} to={href} title={fmtTime(item.startAt) || item.title}>
          {inner}
        </Link>
      );
    }
    return (
      <div key={`${item.kind}-${item.id}`} className={cls} style={style} title={fmtTime(item.startAt) || item.title}>
        {inner}
      </div>
    );
  };

  const rangeLabel = view === 'day' ? fmtDayHead(range.from) : fmtRange(range.from, range.to);

  return (
    <div className="sa-students sa-cal">
      {error && <div className="alert">{error}</div>}

      <section className="sa-stu-kpis sa-cal-kpis" aria-label="Calendar metrics">
        {kpis.map((m) => (
          <Link key={m.label} to={m.to} className={`sa-stu-kpi tint-${m.tint}`}>
            <i className="sa-stu-kpi-icon" aria-hidden="true">
              <CalIcon name={m.icon} />
            </i>
            <div>
              <span>{m.label}</span>
              <strong>{m.value}</strong>
              <em>{m.hint}</em>
            </div>
            <b className="sa-cal-kpi-go" aria-hidden="true">
              <CalIcon name="chevron" />
            </b>
          </Link>
        ))}
      </section>

      <section className="sa-card sa-cal-board">
        <div className="sa-cal-toolbar">
          <div className="sa-cal-nav">
            <button type="button" className="sa-btn sa-btn-outline" onClick={jumpToday}>
              Today
            </button>
            <button type="button" className="sa-cal-arrow" onClick={() => shift(-1)} aria-label="Previous">
              <CalIcon name="prev" />
            </button>
            <button type="button" className="sa-cal-arrow" onClick={() => shift(1)} aria-label="Next">
              <CalIcon name="next" />
            </button>
          </div>
          <label className="sa-cal-range">
            <span>{rangeLabel}</span>
            <CalIcon name="caret" />
            <input type="date" value={dateInput(range.from)} onChange={(e) => jumpToDate(e.target.value)} aria-label="Jump to date" />
          </label>
          <div className="sa-cal-tools">
            <div className="sa-cal-views">
              {['day', 'week', 'month'].map((v) => (
                <button key={v} type="button" className={view === v ? 'is-on' : ''} onClick={() => setView(v)}>
                  {v[0].toUpperCase() + v.slice(1)}
                </button>
              ))}
            </div>
            <div className="sa-cal-add">
              <button
                type="button"
                className="sa-btn sa-btn-primary"
                onClick={(e) => {
                  e.stopPropagation();
                  setShowAddMenu((open) => !open);
                }}
              >
                <CalIcon name="plus" />
                Add Event
                <CalIcon name="caret" />
              </button>
              {showAddMenu && (
                <div className="sa-cal-add-menu" onClick={(e) => e.stopPropagation()}>
                  {EVENT_TYPES.map((t) => (
                    <button key={t.id} type="button" onClick={() => openAdd(t.id)}>
                      {t.label}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>

        {view === 'month' ? (
          <div className="sa-cal-month">
            {['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map((d) => (
              <div key={d} className="sa-cal-month-head">
                {d}
              </div>
            ))}
            {monthCells.map((d) => {
              const key = dayKey(d);
              const inMonth = d.getMonth() === cursor.getMonth();
              const dayItems = items.filter((i) => (i.day || dayKey(i.startAt)) === key);
              return (
                <button
                  key={key}
                  type="button"
                  className={`sa-cal-month-cell${inMonth ? '' : ' is-out'}${sameDay(d, today) ? ' is-today' : ''}`}
                  onClick={() => {
                    setCursor(d);
                    setView('day');
                  }}
                >
                  <span>{d.getDate()}</span>
                  {dayItems.slice(0, 3).map((i) => (
                    <small key={`${i.kind}-${i.id}`} className={`is-${i.tone}`}>
                      {i.title}
                    </small>
                  ))}
                  {dayItems.length > 3 ? <em>+{dayItems.length - 3}</em> : null}
                </button>
              );
            })}
          </div>
        ) : (
          <>
            {allDayItems.length ? (
              <div className="sa-cal-allday" style={{ gridTemplateColumns: `56px repeat(${days.length}, minmax(0, 1fr))` }}>
                <span>All day</span>
                {days.map((d) => (
                  <div key={dayKey(d)}>
                    {items.filter((i) => i.allDay && (i.day || dayKey(i.startAt)) === dayKey(d)).map(renderBlock)}
                  </div>
                ))}
              </div>
            ) : null}
            <div className="sa-cal-grid" style={{ gridTemplateColumns: `56px repeat(${days.length}, minmax(0, 1fr))` }}>
              <div className="sa-cal-hours">
                <div className="sa-cal-dayhead" />
                {HOURS.map((h) => (
                  <div key={h} className="sa-cal-hour" style={{ height: SLOT }}>
                    {hourLabel(h)}
                  </div>
                ))}
              </div>
              {days.map((d) => {
                const key = dayKey(d);
                const isToday = sameDay(d, today);
                const timed = items.filter((i) => {
                  if (i.allDay) return false;
                  const itemDay = i.day || dayKey(i.startAt);
                  return itemDay === key && (i.startAt || i.day);
                });
                return (
                  <div key={key} className={`sa-cal-col${isToday ? ' is-today' : ''}`}>
                    <div className="sa-cal-dayhead">
                      <b>{d.getDate()}</b>
                      <span>{d.toLocaleDateString(undefined, { weekday: 'short' })}</span>
                    </div>
                    <div className="sa-cal-col-body" style={{ height: HOURS.length * SLOT }}>
                      {HOURS.map((h) => (
                        <div key={h} className="sa-cal-slot" style={{ height: SLOT }} />
                      ))}
                      {layoutDay(timed).map(({ item, lane, lanes }) => renderBlock(item, lane, lanes))}
                    </div>
                  </div>
                );
              })}
            </div>
          </>
        )}
      </section>

      <section className="sa-cal-bottom">
        <article className="sa-card">
          <div className="sa-cal-card-head">
            <h3>Upcoming Events</h3>
            <Link to="/school-admin/noticeboard" className="sa-text-link">
              View All
            </Link>
          </div>
          {data?.upcoming?.length ? (
            <ul className="sa-cal-upcoming">
              {data.upcoming.map((i) => {
                const n = daysUntil(i.startAt || i.day);
                return (
                  <li key={`${i.kind}-${i.id}`}>
                    <strong>{i.title}</strong>
                    <small>
                      {fmtTime(i.startAt) || 'All day'}
                      {n != null ? ` · ${n === 0 ? 'Today' : n === 1 ? '1 day' : `${n} days`}` : ''}
                    </small>
                  </li>
                );
              })}
            </ul>
          ) : (
            <div className="sa-cal-empty">
              <UpcomingEmpty />
              <strong>No upcoming calendar events.</strong>
              <p>You have no events in this date range.</p>
            </div>
          )}
        </article>
        <article className="sa-card">
          <div className="sa-cal-card-head">
            <h3>Trip Summary</h3>
          </div>
          <div className="sa-stops-donut-wrap sa-cal-donut">
            <div className="sa-live-donut-ring">
              <div className="sa-stops-donut" style={donutStyle(donutItems, donutTotal)} />
              <div className="sa-live-donut-center">
                <strong>{donutTotal}</strong>
              </div>
            </div>
            <ul className="sa-stops-donut-key">
              {donutItems.map((item) => (
                <li key={item.key}>
                  <i style={{ background: item.color }} />
                  {item.label}
                  <strong>{item.count}</strong>
                </li>
              ))}
            </ul>
          </div>
        </article>
        <article className="sa-card">
          <div className="sa-cal-card-head">
            <h3>Reminders</h3>
          </div>
          {data?.reminders?.length ? (
            <ul className="sa-cal-upcoming">
              {data.reminders.map((i, idx) => (
                <li key={i.id || idx}>
                  <strong>{i.title}</strong>
                  <small>{i.body || i.hint || ''}</small>
                </li>
              ))}
            </ul>
          ) : (
            <div className="sa-cal-empty">
              <ReminderEmpty />
              <strong>No reminders.</strong>
              <p>Reminders are not stored.</p>
            </div>
          )}
        </article>
      </section>

      {showAdd && (
        <div className="sa-reports-modal" role="dialog" aria-labelledby="sa-cal-add-title">
          <form
            className="sa-card"
            onSubmit={(e) => {
              e.preventDefault();
              saveEvent();
            }}
          >
            <h3 id="sa-cal-add-title">Add Event</h3>
            <label>
              Title
              <input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} required />
            </label>
            <label>
              Category
              <select value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })}>
                {EVENT_TYPES.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.label}
                  </option>
                ))}
              </select>
            </label>
            <label className="sa-cal-check">
              <input type="checkbox" checked={form.allDay} onChange={(e) => setForm({ ...form, allDay: e.target.checked })} /> All day
            </label>
            <label>
              Start
              <input
                type={form.allDay ? 'date' : 'datetime-local'}
                value={form.startAt}
                onChange={(e) => setForm({ ...form, startAt: e.target.value })}
                required
              />
            </label>
            <label>
              End
              <input
                type={form.allDay ? 'date' : 'datetime-local'}
                value={form.endAt}
                onChange={(e) => setForm({ ...form, endAt: e.target.value })}
              />
            </label>
            <label>
              Venue
              <input value={form.venue} onChange={(e) => setForm({ ...form, venue: e.target.value })} />
            </label>
            <label>
              Notes
              <textarea value={form.body} onChange={(e) => setForm({ ...form, body: e.target.value })} rows={3} />
            </label>
            <div className="sa-reports-actions">
              <button type="button" className="sa-btn sa-btn-outline" onClick={() => setShowAdd(false)}>
                Cancel
              </button>
              <button type="submit" className="sa-btn sa-btn-primary" disabled={saving}>
                Save
              </button>
            </div>
          </form>
        </div>
      )}

      <footer className="sa-home-foot">
        <span>© {year} Transport</span>
        <span>Transport Management System v1.0.0</span>
      </footer>
    </div>
  );
}
