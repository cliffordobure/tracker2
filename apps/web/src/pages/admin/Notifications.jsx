import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useOutletContext } from 'react-router-dom';
import { api } from '../../lib/api';
import MapView from '../../components/MapView';
import { getSocket } from '../../lib/socket';
import { notificationActionLabel, notificationHref } from '../../lib/notificationLinks';

const PAGE = 8;
const TABS = [
  { id: 'all', label: 'All' },
  { id: 'unread', label: 'Unread' },
  { id: 'alerts', label: 'Alerts' },
  { id: 'attendance', label: 'Attendance' },
  { id: 'routes', label: 'Routes' },
  { id: 'incidents', label: 'Incidents' },
  { id: 'announcements', label: 'Announcements' },
];

function pingInbox() {
  window.dispatchEvent(new Event('sa-inbox-refresh'));
}

function ago(value) {
  if (!value) return '';
  const ms = Date.now() - new Date(value).getTime();
  if (!Number.isFinite(ms) || ms < 0) return 'Just now';
  if (ms < 45000) return 'Just now';
  const mins = Math.round(ms / 60000);
  if (mins < 60) return `${mins} min ago`;
  const hrs = Math.round(mins / 60);
  if (hrs < 24) return `${hrs} hr ago`;
  const days = Math.round(hrs / 24);
  return `${days}d ago`;
}

function fmtStamp(value) {
  if (!value) return '—';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleString(undefined, {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

function fmtTime(value) {
  if (!value) return '';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
}

function deltaLabel(delta, suffix) {
  if (!delta || delta.dir === 'flat') return suffix;
  if (delta.pct == null) {
    const sign = delta.abs > 0 ? '+' : '';
    return `${sign}${delta.abs} ${suffix}`;
  }
  const arrow = delta.dir === 'down' ? '↓' : '↑';
  return `${arrow} ${Math.abs(delta.pct)}% ${suffix}`;
}

function tripStatus(status) {
  if (status === 'active') return 'Active';
  if (status === 'scheduled') return 'Scheduled';
  if (status === 'completed') return 'Completed';
  if (status === 'cancelled') return 'Cancelled';
  return '';
}

function tone(n) {
  if (n.incident || n.type === 'trip_cancelled' || n.important) return 'alert';
  if (['late_pickup_request', 'attendance_alert', 'reminder'].includes(n.type)) return 'warning';
  if (n.type === 'announcement') return 'announce';
  if (['kid_picked_up', 'kid_dropped_off', 'assignment', 'teacher_note', 'diary'].includes(n.type)) return 'person';
  if (ROUTE_ICON.has(n.type)) return 'bus';
  if (n.type === 'message') return 'mail';
  return 'bell';
}

const ROUTE_ICON = new Set(['trip_started', 'trip_completed', 'trip_cancelled', 'trip_assigned']);

function glyph(kind) {
  if (kind === 'alert') return '!';
  if (kind === 'warning') return '⚠';
  if (kind === 'announce') return '📣';
  if (kind === 'person') return '👤';
  if (kind === 'bus') return '🚌';
  if (kind === 'mail') return '✉';
  return '🔔';
}

function BtnIcon({ name }) {
  const p = { width: 13, height: 13, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 1.8, strokeLinecap: 'round', strokeLinejoin: 'round' };
  if (name === 'gear') return <svg {...p}><circle cx="12" cy="12" r="3" /><path d="M12 3.5v2.2M12 18.3V20.5M4.6 6.5l1.6 1.6M17.8 15.9l1.6 1.6M3.5 12h2.2M18.3 12H20.5M4.6 17.5l1.6-1.6M17.8 8.1l1.6-1.6" /></svg>;
  if (name === 'map') return <svg {...p}><path d="M9 4.5 3.8 6.4v13.1L9 17.6l6 1.9 5.2-1.9V4.5L15 6.4 9 4.5Z" /><path d="M9 4.5v13.1M15 6.4v13.1" /></svg>;
  if (name === 'phone') return <svg {...p}><path d="M8 3.5h3.2l1.2 3.2-2 1.4a12 12 0 0 0 5.5 5.5l1.4-2 3.2 1.2V16a2 2 0 0 1-2.2 2 16 16 0 0 1-14-14A2 2 0 0 1 8 3.5Z" /></svg>;
  if (name === 'flag') return <svg {...p}><path d="M5 21V4.5h9.2l-.8 3.4H19L17.4 14H5" /></svg>;
  return <svg {...p}><path d="M5 7h14M10 7V5h4v2M8 7l.7 12h6.6L16 7" /></svg>;
}

export default function Notifications() {
  const navigate = useNavigate();
  const { schoolName = '', globalSearch = '' } = useOutletContext() || {};
  const [tab, setTab] = useState('all');
  const [sort, setSort] = useState('latest');
  const [q, setQ] = useState('');
  const [page, setPage] = useState(1);
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [selectedId, setSelectedId] = useState('');
  const [detail, setDetail] = useState(null);
  const [busy, setBusy] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const year = new Date().getFullYear();

  const load = useCallback(async () => {
    const params = new URLSearchParams({ tab, sort });
    if (q.trim()) params.set('q', q.trim());
    const next = await api(`/admin/notifications?${params}`);
    setData(next);
    setError('');
    return next;
  }, [tab, sort, q]);

  useEffect(() => {
    load().catch((err) => setError(err.message));
  }, [load]);

  useEffect(() => {
    if (globalSearch) setQ(globalSearch);
  }, [globalSearch]);

  useEffect(() => {
    setPage(1);
  }, [tab, sort, q]);

  useEffect(() => {
    const s = getSocket();
    const onNew = () => {
      load().catch(() => {});
      pingInbox();
    };
    s?.on('notification:new', onNew);
    return () => {
      s?.off('notification:new', onNew);
    };
  }, [load]);

  const rows = data?.notifications || [];
  const counts = data?.counts || {};
  const stats = data?.stats || {};
  const pages = Math.max(1, Math.ceil(rows.length / PAGE));
  const safePage = Math.min(page, pages);
  const slice = rows.slice((safePage - 1) * PAGE, safePage * PAGE);

  useEffect(() => {
    if (!slice.length) {
      setSelectedId('');
      setDetail(null);
      return;
    }
    if (selectedId && slice.some((n) => String(n._id) === selectedId)) return;
    setSelectedId(String(slice[0]._id));
  }, [slice, selectedId]);

  const selected = useMemo(
    () => rows.find((n) => String(n._id) === selectedId) || null,
    [rows, selectedId]
  );

  useEffect(() => {
    if (!selectedId) {
      setDetail(null);
      return undefined;
    }
    let alive = true;
    api(`/admin/notifications/${selectedId}`)
      .then((d) => {
        if (alive) setDetail(d);
      })
      .catch(() => {
        if (alive) setDetail(null);
      });
    return () => {
      alive = false;
    };
  }, [selectedId]);

  const markRead = async (n) => {
    const id = String(n._id);
    if (n.read) return;
    try {
      await api(`/admin/notifications/${id}/read`, { method: 'POST', body: {} });
      setData((prev) => {
        if (!prev) return prev;
        const notifications =
          tab === 'unread'
            ? prev.notifications.filter((row) => String(row._id) !== id)
            : prev.notifications.map((row) =>
                String(row._id) === id ? { ...row, read: true } : row
              );
        const unread = Math.max(0, (prev.stats?.unread || 0) - 1);
        return {
          ...prev,
          notifications,
          counts: { ...prev.counts, unread: Math.max(0, (prev.counts?.unread || 0) - 1) },
          stats: { ...prev.stats, unread },
        };
      });
      pingInbox();
    } catch {
      /* keep unread if the request fails */
    }
  };

  const openItem = (n) => {
    setSelectedId(String(n._id));
    markRead(n);
    const href = notificationHref(n);
    if (href) navigate(href);
  };

  const markAll = async () => {
    if (!stats.unread) return;
    setBusy(true);
    try {
      await api('/admin/notifications/read', { method: 'POST', body: {} });
      await load();
      pingInbox();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  const dismiss = async () => {
    if (!selectedId) return;
    setBusy(true);
    try {
      await api(`/admin/notifications/${selectedId}/archive`, { method: 'POST', body: { archived: true } });
      setSelectedId('');
      await load();
      pingInbox();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  const kpis = [
    {
      label: 'Unread Notifications',
      value: stats.unread ?? (data ? 0 : '…'),
      hint: 'Not marked read',
      tint: 'violet',
    },
    {
      label: 'Total Today',
      value: stats.today ?? (data ? 0 : '…'),
      hint: stats.todayDelta ? deltaLabel(stats.todayDelta, 'vs yesterday') : 'vs yesterday',
      hintClass:
        stats.todayDelta?.dir === 'up' ? 'is-up' : stats.todayDelta?.dir === 'down' ? 'is-down' : '',
      tint: 'green',
    },
    {
      label: 'High Priority',
      value: stats.important ?? (data ? 0 : '…'),
      hint: stats.important ? 'Marked important' : 'None marked important',
      hintClass: stats.important ? 'is-bad' : '',
      tint: 'rose',
    },
    {
      label: 'Announcements',
      value: stats.announcementsWeek ?? (data ? 0 : '…'),
      hint: 'In your inbox this week',
      tint: 'orange',
    },
  ];

  const note = selected || detail?.notification;
  const trip = detail?.notification?.trip || note?.trip;
  const loc = trip?.latestLocation;
  const driver = trip?.driverId;
  const vehicle = trip?.busId;
  const from = rows.length ? (safePage - 1) * PAGE + 1 : 0;
  const to = Math.min(rows.length, safePage * PAGE);

  return (
    <div className="sa-students sa-notify">
      {error && <div className="alert">{error}</div>}

      <div className="sa-reports-actions">
        <button type="button" className="sa-btn sa-btn-outline" onClick={markAll} disabled={busy || !stats.unread}>
          Mark All Read
        </button>
        <button type="button" className="sa-btn sa-btn-primary" onClick={() => setShowSettings(true)}>
          <BtnIcon name="gear" />
          Settings
        </button>
      </div>

      <section className="sa-stu-kpis sa-notify-kpis" aria-label="Notification metrics">
        {kpis.map((m) => (
          <article key={m.label} className={`sa-stu-kpi tint-${m.tint}`}>
            <div>
              <span>{m.label}</span>
              <strong>{m.value}</strong>
              <em className={m.hintClass || ''}>{m.hint}</em>
            </div>
            <i className="sa-stu-kpi-icon" aria-hidden="true" />
          </article>
        ))}
      </section>

      <section className="sa-notify-board">
        <div className="sa-card sa-notify-list">
          <div className="sa-notify-chips">
            {TABS.map((t) => (
              <button
                key={t.id}
                type="button"
                className={tab === t.id ? 'is-on' : ''}
                onClick={() => setTab(t.id)}
              >
                {t.label} ({counts[t.id] ?? 0})
              </button>
            ))}
          </div>
          <div className="sa-notify-toolbar">
            <label className="sa-notify-search">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
                <circle cx="11" cy="11" r="6.5" />
                <path d="m16 16 4.2 4.2" />
              </svg>
              <input
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="Search notifications..."
                aria-label="Search notifications"
              />
            </label>
            <select value={sort} onChange={(e) => setSort(e.target.value)} aria-label="Sort">
              <option value="latest">Latest First</option>
              <option value="oldest">Oldest First</option>
            </select>
          </div>
          <ul>
            {slice.map((n) => {
              const kind = tone(n);
              return (
                <li key={n._id}>
                  <button
                    type="button"
                    className={`sa-notify-item${String(n._id) === selectedId ? ' is-on' : ''}${n.read ? '' : ' is-unread'}`}
                    onClick={() => openItem(n)}
                    title={notificationHref(n) ? `Open ${notificationActionLabel(n) || 'related page'}` : undefined}
                  >
                    <i className={`sa-notify-glyph is-${kind}`} aria-hidden="true">
                      {glyph(kind)}
                    </i>
                    <div>
                      <strong>
                        {n.title}
                        {!n.read ? <em>New</em> : null}
                      </strong>
                      <p>{n.body}</p>
                    </div>
                    <time>{ago(n.createdAt)}</time>
                    {!n.read && <b aria-label="Unread" />}
                  </button>
                </li>
              );
            })}
          </ul>
          {!slice.length && (
            <p className="sa-home-empty">
              {tab === 'incidents'
                ? 'No driver incident alerts in your inbox.'
                : 'No notifications in this view.'}
            </p>
          )}
          <div className="sa-notify-pager">
            <span>
              Showing {from}-{to} of {rows.length}
            </span>
            <div>
              {Array.from({ length: pages }, (_, i) => i + 1).map((p) => (
                <button key={p} type="button" className={p === safePage ? 'is-on' : ''} onClick={() => setPage(p)}>
                  {p}
                </button>
              ))}
            </div>
          </div>
        </div>

        <article className="sa-card sa-notify-detail">
          {note ? (
            <>
              <header>
                <i className={`sa-notify-glyph is-${tone(note)}`} aria-hidden="true">
                  {glyph(tone(note))}
                </i>
                <div>
                  <h3>
                    {note.title}
                    {!note.read ? <span className="sa-notify-tag is-new">New</span> : null}
                    {note.important ? <span className="sa-notify-tag">High Priority</span> : null}
                  </h3>
                  <p>{fmtStamp(note.createdAt)}</p>
                </div>
              </header>
              <p className="sa-notify-body">{note.body}</p>
              {(trip || note.kid) && (
                <dl className="sa-notify-grid">
                  <div>
                    <dt>Vehicle</dt>
                    <dd>{vehicle?.plate || vehicle?.label || '—'}</dd>
                  </div>
                  <div>
                    <dt>Driver</dt>
                    <dd>{driver?.name || '—'}</dd>
                  </div>
                  <div>
                    <dt>Route</dt>
                    <dd>{trip?.routeId?.name || '—'}</dd>
                  </div>
                  <div>
                    <dt>Current Status</dt>
                    <dd>
                      {trip?.status ? (
                        <span className={`sa-notify-status is-${trip.status}`}>{tripStatus(trip.status)}</span>
                      ) : (
                        '—'
                      )}
                    </dd>
                  </div>
                  {note.kid?.name ? (
                    <div>
                      <dt>Student</dt>
                      <dd>{note.kid.name}</dd>
                    </div>
                  ) : null}
                </dl>
              )}
              {loc ? (
                <div className="sa-notify-map-wrap">
                  <MapView
                    center={{ lat: loc.lat, lng: loc.lng }}
                    zoom={14}
                    driverLocation={loc}
                    followDriver
                    className="sa-notify-map"
                  />
                </div>
              ) : trip ? (
                <p className="sa-muted">No live GPS is stored for this trip.</p>
              ) : null}
              <div className="sa-notify-actions">
                {notificationHref(note) ? (
                  <Link className="sa-btn sa-btn-primary" to={notificationHref(note)}>
                    <BtnIcon name="map" />
                    {notificationActionLabel(note) || 'Open'}
                  </Link>
                ) : (
                  <Link className="sa-btn sa-btn-primary" to="/school-admin/live-tracking">
                    <BtnIcon name="map" />
                    View Live Tracking
                  </Link>
                )}
                {driver?._id ? (
                  <Link className="sa-btn sa-btn-outline" to={`/school-admin/drivers/${driver._id}`}>
                    <BtnIcon name="phone" />
                    Contact Driver
                  </Link>
                ) : (
                  <button type="button" className="sa-btn sa-btn-outline" disabled>
                    <BtnIcon name="phone" />
                    Contact Driver
                  </button>
                )}
                <Link className="sa-btn sa-btn-outline" to="/school-admin/incidents">
                  <BtnIcon name="flag" />
                  Create Incident
                </Link>
                <button type="button" className="sa-btn sa-btn-outline" onClick={dismiss} disabled={busy}>
                  <BtnIcon name="trash" />
                  Dismiss
                </button>
              </div>
              <div className="sa-notify-activity">
                <h4>Related activity</h4>
                {detail?.activity?.length ? (
                  <ol>
                    {detail.activity.map((a, i) => (
                      <li key={`${a.at}-${i}`}>
                        <strong>{fmtTime(a.at) || '—'}</strong>
                        <span>
                          {a.title}
                          {a.body ? ` — ${a.body}` : ''}
                        </span>
                      </li>
                    ))}
                  </ol>
                ) : (
                  <p className="sa-muted">No related trip events are stored for this item.</p>
                )}
              </div>
            </>
          ) : (
            <p className="sa-home-empty">Select a notification to read it.</p>
          )}
        </article>
      </section>

      {showSettings && (
        <div className="sa-reports-modal" role="dialog" aria-labelledby="sa-notify-settings">
          <div className="sa-card">
            <h3 id="sa-notify-settings">Notification settings</h3>
            <p className="sa-muted">
              Delivery preferences such as email, SMS, and quiet hours are not stored yet. School profile settings are
              available from Settings.
            </p>
            <div className="sa-reports-actions">
              <button type="button" className="sa-btn sa-btn-outline" onClick={() => setShowSettings(false)}>
                Close
              </button>
              <Link className="sa-btn sa-btn-primary" to="/school-admin/school">
                Open Settings
              </Link>
            </div>
          </div>
        </div>
      )}

      <footer className="sa-home-foot">
        <span>© {year} {schoolName || 'School'}. All rights reserved.</span>
        <span>Transport Management System v1.0.0</span>
      </footer>
    </div>
  );
}
