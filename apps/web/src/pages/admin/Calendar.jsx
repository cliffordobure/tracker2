import { useEffect, useMemo, useState } from 'react';
import { Link, useOutletContext } from 'react-router-dom';
import { api } from '../../lib/api';

const HOURS = Array.from({ length: 13 }, (_, i) => i + 6);
const SLOT = 52;
const DONUT = {
  completed: '#16a34a',
  active: '#f97316',
  cancelled: '#e11d48',
  scheduled: '#64748b',
};

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

function fmtDay(d) {
  return d.toLocaleDateString(undefined, { weekday: 'short', day: 'numeric' });
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

function dayKey(value) {
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) return '';
  return dateInput(d);
}

function minutesSinceSix(value) {
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return 0;
  return d.getHours() * 60 + d.getMinutes() - 6 * 60;
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
  const [form, setForm] = useState(emptyEvent);
  const [saving, setSaving] = useState(false);
  const year = new Date().getFullYear();

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
    { label: 'Scheduled Trips', value: data?.kpis?.trips ?? 0, tint: 'purple' },
    { label: 'Vehicles on trips', value: data?.kpis?.vehicles ?? 0, tint: 'green' },
    { label: 'Students listed', value: data?.kpis?.students ?? 0, tint: 'orange' },
    { label: 'On-time Performance', value: '—', hint: 'Not tracked', tint: 'sky' },
    { label: 'Incidents', value: data?.kpis?.incidents ?? 0, hint: 'In this range', tint: 'rose' },
  ];
  const summary = data?.tripSummary || {};
  const donutItems = [
    { key: 'completed', label: 'Completed', count: summary.completed || 0, color: DONUT.completed },
    { key: 'active', label: 'In Progress', count: summary.active || 0, color: DONUT.active },
    { key: 'cancelled', label: 'Cancelled', count: summary.cancelled || 0, color: DONUT.cancelled },
    { key: 'scheduled', label: 'Scheduled', count: summary.scheduled || 0, color: DONUT.scheduled },
  ];
  const donutTotal = donutItems.reduce((s, i) => s + i.count, 0);

  const shift = (dir) => {
    if (view === 'day') setCursor((c) => addDays(c, dir));
    else if (view === 'month') setCursor((c) => new Date(c.getFullYear(), c.getMonth() + dir, 1));
    else setCursor((c) => addDays(c, dir * 7));
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

  const blockStyle = (item) => {
    const startMin = Math.max(0, minutesSinceSix(item.startAt));
    const endMin = item.endAt ? Math.max(startMin + 20, minutesSinceSix(item.endAt)) : startMin + 40;
    const top = (startMin / 60) * SLOT;
    const height = Math.max(28, ((endMin - startMin) / 60) * SLOT);
    return { top: `${top}px`, height: `${height}px` };
  };

  const renderBlock = (item) => {
    const cls = `sa-cal-block is-${item.tone}${item.allDay ? ' is-allday' : ''}`;
    const inner = (
      <>
        <strong>{item.title}</strong>
        <small>
          {item.allDay ? 'All day' : [fmtTime(item.startAt), fmtTime(item.endAt)].filter(Boolean).join(' – ')}
        </small>
      </>
    );
    if (item.kind === 'trip' && item.routeId) {
      return (
        <Link key={`${item.kind}-${item.id}`} className={cls} style={item.allDay ? undefined : blockStyle(item)} to={`/school-admin/routes/${item.routeId}`}>
          {inner}
        </Link>
      );
    }
    return (
      <div key={`${item.kind}-${item.id}`} className={cls} style={item.allDay ? undefined : blockStyle(item)}>
        {inner}
      </div>
    );
  };

  return (
    <div className="sa-students sa-cal">
      {error && <div className="alert">{error}</div>}

      <section className="sa-stu-kpis sa-tch-kpis sa-cal-kpis" aria-label="Calendar metrics">
        {kpis.map((m) => (
          <article key={m.label} className={`sa-stu-kpi tint-${m.tint}`}>
            <div>
              <span>{m.label}</span>
              <strong>{m.value}</strong>
              {m.hint ? <em>{m.hint}</em> : null}
            </div>
            <i className="sa-stu-kpi-icon" aria-hidden="true" />
          </article>
        ))}
      </section>

      <section className="sa-card sa-cal-board">
        <div className="sa-cal-toolbar">
          <div className="sa-cal-nav">
            <button type="button" className="sa-btn sa-btn-outline" onClick={() => setCursor(view === 'week' ? startOfWeek(new Date()) : new Date())}>
              Today
            </button>
            <button type="button" className="sa-btn sa-btn-outline" onClick={() => shift(-1)} aria-label="Previous">
              ‹
            </button>
            <button type="button" className="sa-btn sa-btn-outline" onClick={() => shift(1)} aria-label="Next">
              ›
            </button>
            <strong>{view === 'day' ? fmtDay(range.from) : fmtRange(range.from, range.to)}</strong>
          </div>
          <div className="sa-cal-views">
            {['day', 'week', 'month'].map((v) => (
              <button key={v} type="button" className={view === v ? 'is-on' : ''} onClick={() => setView(v)}>
                {v[0].toUpperCase() + v.slice(1)}
              </button>
            ))}
          </div>
          <button type="button" className="sa-btn sa-btn-primary" onClick={() => setShowAdd(true)}>
            Add Event
          </button>
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
              const dayItems = items.filter((i) => i.day === key || dayKey(i.startAt) === key);
              return (
                <button
                  key={key}
                  type="button"
                  className={`sa-cal-month-cell${inMonth ? '' : ' is-out'}`}
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
            <div className="sa-cal-allday" style={{ gridTemplateColumns: `72px repeat(${days.length}, minmax(0, 1fr))` }}>
              <span>All day</span>
              {days.map((d) => (
                <div key={dayKey(d)}>
                  {items.filter((i) => i.allDay && (i.day === dayKey(d) || dayKey(i.startAt) === dayKey(d))).map(renderBlock)}
                </div>
              ))}
            </div>
            <div className="sa-cal-grid" style={{ gridTemplateColumns: `72px repeat(${days.length}, minmax(0, 1fr))` }}>
              <div className="sa-cal-hours">
                <div className="sa-cal-dayhead" />
                {HOURS.map((h) => (
                  <div key={h} className="sa-cal-hour" style={{ height: SLOT }}>
                    {h === 12 ? '12 PM' : h > 12 ? `${h - 12} PM` : `${h} AM`}
                  </div>
                ))}
              </div>
              {days.map((d) => {
                const key = dayKey(d);
                const timed = items.filter((i) => !i.allDay && (i.day === key || dayKey(i.startAt) === key) && i.startAt);
                return (
                  <div key={key} className="sa-cal-col">
                    <div className="sa-cal-dayhead">{fmtDay(d)}</div>
                    <div className="sa-cal-col-body" style={{ height: HOURS.length * SLOT }}>
                      {HOURS.map((h) => (
                        <div key={h} className="sa-cal-slot" style={{ height: SLOT }} />
                      ))}
                      {timed.map(renderBlock)}
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
          <div className="sa-rd-card-head">
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
            <p className="sa-muted">No upcoming calendar events in this range.</p>
          )}
        </article>
        <article className="sa-card">
          <h3>Trip Summary</h3>
          {donutTotal ? (
            <div className="sa-stops-donut-wrap">
              <div className="sa-live-donut-ring">
                <div className="sa-stops-donut" style={donutStyle(donutItems, donutTotal)} />
                <div className="sa-live-donut-center">
                  <strong>{donutTotal}</strong>
                  <span>Trips</span>
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
          ) : (
            <p className="sa-muted">No trips in this range.</p>
          )}
        </article>
        <article className="sa-card">
          <h3>Reminders</h3>
          <p className="sa-muted">Reminders are not stored.</p>
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
                <option value="event">Event</option>
                <option value="meeting">Meeting</option>
                <option value="academic">Academic</option>
                <option value="holiday">Holiday</option>
              </select>
            </label>
            <label>
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
