import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../../lib/api';

function todayLocal() {
  const d = new Date();
  d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
  return d.toISOString().slice(0, 16);
}

function toLocalInput(value) {
  if (!value) return '';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '';
  const local = new Date(d.getTime() - d.getTimezoneOffset() * 60000);
  return local.toISOString().slice(0, 16);
}

function fmtWhen(value) {
  if (!value) return '—';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleString(undefined, { day: 'numeric', month: 'short', year: 'numeric', hour: 'numeric', minute: '2-digit' });
}

function outingIdOf(o) {
  return String(o?._id || o?.id || '');
}

function statusMeta(status) {
  if (status === 'completed') return { key: 'completed', label: 'Completed' };
  if (status === 'cancelled') return { key: 'cancelled', label: 'Cancelled' };
  return { key: 'scheduled', label: 'Upcoming' };
}

const emptyForm = {
  title: '',
  location: '',
  notes: '',
  startAt: todayLocal(),
  endAt: '',
  grade: '',
  audience: '',
  busCount: 1,
  teacherCount: 1,
  routeId: '',
  busId: '',
  driverId: '',
};

function TourGlyph({ name }) {
  const common = {
    width: 16,
    height: 16,
    viewBox: '0 0 24 24',
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth: 1.8,
    strokeLinecap: 'round',
    strokeLinejoin: 'round',
  };
  if (name === 'flag') return <svg {...common}><path d="M5 21V4h9l-1.2 3.6L14 11H5" /></svg>;
  if (name === 'pin') return <svg {...common}><path d="M12 21s7-6.2 7-11.2A7 7 0 0 0 5 9.8C5 14.8 12 21 12 21Z" /><circle cx="12" cy="10" r="2.2" /></svg>;
  if (name === 'check') return <svg {...common}><circle cx="12" cy="12" r="8.2" /><path d="m8.5 12.2 2.4 2.4 4.6-5" /></svg>;
  if (name === 'x') return <svg {...common}><circle cx="12" cy="12" r="8.2" /><path d="m9 9 6 6M15 9l-6 6" /></svg>;
  return <svg {...common}><path d="M4 12h16M8 8l-4 4 4 4M16 8l4 4-4 4" /></svg>;
}

function Spark({ color }) {
  return (
    <svg className="sa-sched-spark" viewBox="0 0 120 18" preserveAspectRatio="none" aria-hidden="true">
      <path d="M0 12 C12 12 14 6 24 6 S36 14 48 11 S64 4 76 7 S96 16 120 8" fill="none" stroke={color} strokeWidth="1.8" />
    </svg>
  );
}

function alertCopy(message) {
  const text = String(message || '');
  if (/\b404\b/.test(text) || /not found/i.test(text)) {
    return {
      title: 'Request failed (404)',
      body: "We couldn't load the requested resource. Please try again or contact support if the issue persists.",
    };
  }
  return { title: text, body: '' };
}

export default function TripOutings() {
  const [outings, setOutings] = useState([]);
  const [stats, setStats] = useState(null);
  const [routes, setRoutes] = useState([]);
  const [buses, setBuses] = useState([]);
  const [drivers, setDrivers] = useState([]);
  const [grades, setGrades] = useState([]);
  const [q, setQ] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [error, setError] = useState('');
  const [info, setInfo] = useState('');
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(emptyForm);
  const [busy, setBusy] = useState(false);
  const [detail, setDetail] = useState(null);
  const [permissions, setPermissions] = useState([]);
  const [menuId, setMenuId] = useState('');

  const load = async () => {
    const settled = await Promise.allSettled([
      api('/admin/outings'),
      api('/admin/routes'),
      api('/admin/buses'),
      api('/admin/drivers'),
      api('/admin/kids'),
    ]);
    const [o, r, b, d, k] = settled;
    if (o.status === 'rejected') setError(o.reason?.message || 'Could not load tour data.');
    else setError('');
    if (o.status === 'fulfilled') {
      setOutings(o.value.outings || []);
      setStats(o.value.stats || null);
    }
    if (r.status === 'fulfilled') setRoutes(r.value.routes || []);
    if (b.status === 'fulfilled') setBuses((b.value.buses || []).filter((x) => x.active !== false));
    if (d.status === 'fulfilled') setDrivers((d.value.drivers || []).filter((x) => x.active !== false));
    if (k.status === 'fulfilled') {
      setGrades([...new Set((k.value.kids || []).map((kid) => kid.grade).filter(Boolean))].sort());
    }
  };

  useEffect(() => {
    load().catch((e) => setError(e.message));
  }, []);

  useEffect(() => {
    if (!menuId && !detail && !formOpen) return undefined;
    const onKey = (e) => {
      if (e.key !== 'Escape') return;
      if (menuId) setMenuId('');
      else if (detail) setDetail(null);
      else setFormOpen(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [menuId, detail, formOpen]);

  const rows = useMemo(() => {
    const needle = q.trim().toLowerCase();
    const list = outings.filter((o) => {
      if (statusFilter && o.status !== statusFilter) return false;
      if (!needle) return true;
      const hay = [o.title, o.location, o.grade, o.audience, o.routeId?.name, o.driverId?.name, o.status]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();
      return hay.includes(needle);
    });
    return [...list].sort((a, b) => new Date(a.startAt || 0) - new Date(b.startAt || 0) || String(a.title || '').localeCompare(String(b.title || '')));
  }, [outings, q, statusFilter]);

  const menuOuting = outings.find((o) => outingIdOf(o) === menuId);

  const startCreate = () => {
    setEditing(null);
    setForm({ ...emptyForm, startAt: todayLocal() });
    setError('');
    setFormOpen(true);
  };

  const startEdit = (o) => {
    setEditing(o);
    setForm({
      title: o.title || '',
      location: o.location || '',
      notes: o.notes || '',
      startAt: toLocalInput(o.startAt) || todayLocal(),
      endAt: toLocalInput(o.endAt),
      grade: o.grade || '',
      audience: o.audience || '',
      busCount: o.busCount ?? 1,
      teacherCount: o.teacherCount ?? 1,
      routeId: o.routeId?._id || o.routeId || '',
      busId: o.busId?._id || o.busId || '',
      driverId: o.driverId?._id || o.driverId || '',
    });
    setError('');
    setFormOpen(true);
  };

  const openDetail = async (o) => {
    setDetail(o);
    setPermissions([]);
    try {
      const data = await api(`/admin/outings/${outingIdOf(o)}`);
      setDetail(data.outing || o);
      setPermissions(data.permissions || []);
    } catch (e) {
      setError(e.message);
    }
  };

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    setError('');
    setInfo('');
    try {
      const body = {
        ...form,
        endAt: form.endAt || null,
        routeId: form.routeId || null,
        busId: form.busId || null,
        driverId: form.driverId || null,
      };
      if (editing) {
        await api(`/admin/outings/${outingIdOf(editing)}`, { method: 'PUT', body });
        setInfo('Tour updated. Assigned transport stays linked to Daily trips.');
      } else {
        await api('/admin/outings', { method: 'POST', body });
        setInfo(form.routeId && form.driverId
          ? 'Tour created and a transport trip was generated.'
          : 'Tour created. Parents can grant permission.');
      }
      setFormOpen(false);
      setEditing(null);
      await load();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  const cancelOuting = async (o) => {
    if (!confirm('Cancel this educational tour? Linked transport will be cancelled too.')) return;
    setError('');
    try {
      await api(`/admin/outings/${outingIdOf(o)}/cancel`, { method: 'POST', body: {} });
      setInfo('Tour cancelled.');
      setMenuId('');
      setDetail(null);
      await load();
    } catch (err) {
      setError(err.message);
    }
  };

  const kpis = [
    { key: 'total', label: 'Tours', value: stats?.total ?? outings.length, hint: 'Educational outings', tint: 'purple', icon: 'flag', spark: '#6366f1' },
    { key: 'upcoming', label: 'Upcoming', value: stats?.upcoming ?? 0, hint: 'Awaiting the trip day', tint: 'sky', icon: 'pin', spark: '#2563eb' },
    { key: 'completed', label: 'Completed', value: stats?.completed ?? 0, hint: 'Finished tours', tint: 'green', icon: 'check', spark: '#22c55e' },
    { key: 'cancelled', label: 'Cancelled', value: stats?.cancelled ?? 0, hint: 'Called off', tint: 'rose', icon: 'x', spark: '#e11d48' },
  ];
  const notice = error ? alertCopy(error) : null;

  const canSave = form.title.trim() && form.startAt;

  return (
    <div className="sa-trips-outings">
      {notice && (
        <div className="sa-tour-alert" role="alert">
          <i aria-hidden="true">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9">
              <path d="m12 4.4 8.6 15.2H3.4L12 4.4Z" />
              <path d="M12 10v4.2M12 16.8h.01" />
            </svg>
          </i>
          <div>
            <strong>{notice.title}</strong>
            {notice.body ? <p>{notice.body}</p> : null}
          </div>
          <button type="button" className="sa-icon-ghost" aria-label="Dismiss" onClick={() => setError('')}>×</button>
        </div>
      )}
      {info && <div className="alert alert-ok">{info}</div>}

      <section className="sa-bus-kpis sa-trips-tour-kpis" aria-label="Tour metrics">
        {kpis.map((m) => (
          <article key={m.key} className={`sa-bus-kpi tint-${m.tint}`}>
            <i className="sa-bus-kpi-icon" aria-hidden="true"><TourGlyph name={m.icon} /></i>
            <div className="sa-bus-kpi-copy">
              <span>{m.label}</span>
              <strong>{m.value}</strong>
              <em>{m.hint}</em>
            </div>
            <Spark color={m.spark} />
          </article>
        ))}
      </section>

      <article className="sa-card sa-bus-table-card sa-tour-table-card">
        <div className="sa-tour-toolbar">
          <label className="sa-stu-search">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
              <circle cx="11" cy="11" r="7" />
              <path d="m20 20-3.2-3.2" />
            </svg>
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search tours, destination, grade or driver..." />
          </label>
          <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} aria-label="Status">
            <option value="">All Status</option>
            <option value="upcoming">Upcoming</option>
            <option value="completed">Completed</option>
            <option value="cancelled">Cancelled</option>
          </select>
          <button type="button" className="sa-btn sa-btn-primary" onClick={startCreate}>+ New Tour</button>
        </div>
        <div className="sa-table-wrap">
          <table className="sa-table sa-trips-table">
            <thead>
              <tr>
                <th>Tour</th>
                <th>When</th>
                <th>Audience</th>
                <th>Transport</th>
                <th>Permissions</th>
                <th>Status</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((o) => {
                const meta = statusMeta(o.status);
                const perms = o.permissions || {};
                const trip = o.tripId && typeof o.tripId === 'object' ? o.tripId : null;
                return (
                  <tr key={outingIdOf(o)}>
                    <td>
                      <div className="sa-rt-name">
                        <strong>
                          <button type="button" className="sa-text-link" onClick={() => openDetail(o)}>{o.title}</button>
                        </strong>
                        <small>{o.location || 'Destination not set'}</small>
                      </div>
                    </td>
                    <td>
                      <div className="sa-rt-name">
                        <strong>{fmtWhen(o.startAt)}</strong>
                        {o.endAt ? <small>Until {fmtWhen(o.endAt)}</small> : null}
                      </div>
                    </td>
                    <td>
                      <div className="sa-rt-name">
                        <strong>{o.audience || o.grade || 'Whole school'}</strong>
                        <small>{o.grade || 'All grades'}</small>
                      </div>
                    </td>
                    <td>
                      {o.driverId?.name || o.busId?.label || trip ? (
                        <div className="sa-rt-vehicle">
                          <i className="sa-rt-vehicle-icon" aria-hidden="true"><TourGlyph name="flag" /></i>
                          <div>
                            <strong>{o.busId?.label || o.busId?.plate || trip?.tripCode || 'Assigned'}</strong>
                            <small>{[o.driverId?.name, o.routeId?.name].filter(Boolean).join(' · ') || 'Linked trip'}</small>
                          </div>
                        </div>
                      ) : (
                        <span className="sa-bus-muted">Permissions only</span>
                      )}
                    </td>
                    <td>
                      <strong>{perms.granted || 0}</strong>
                      <span className="sa-bus-muted"> / {perms.total || 0} granted</span>
                    </td>
                    <td><span className={`sa-stu-status is-${meta.key}`}>{meta.label}</span></td>
                    <td>
                      <button type="button" className="sa-icon-ghost" aria-label="More" onClick={() => setMenuId((cur) => (cur === outingIdOf(o) ? '' : outingIdOf(o)))}>
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                          <circle cx="12" cy="5" r="1.4" />
                          <circle cx="12" cy="12" r="1.4" />
                          <circle cx="12" cy="19" r="1.4" />
                        </svg>
                      </button>
                    </td>
                  </tr>
                );
              })}
              {!rows.length && (
                <tr>
                  <td colSpan={7}>
                    <div className="sa-tour-empty">
                      <i aria-hidden="true">
                        <svg width="58" height="58" viewBox="0 0 58 58" fill="none">
                          <path d="M20 22.5c0-5.1 4-9.2 9-9.2s9 4.1 9 9.2" stroke="#6366f1" strokeWidth="1.8" strokeLinecap="round" />
                          <rect x="15" y="20" width="28" height="30" rx="8" fill="#eef2ff" stroke="#6366f1" strokeWidth="1.8" />
                          <path d="M15 31h28" stroke="#818cf8" strokeWidth="1.5" />
                          <rect x="24" y="33.5" width="10" height="8" rx="2.2" fill="#c7d2fe" stroke="#6366f1" strokeWidth="1.4" />
                          <path d="M21.5 20v-2.2a7.5 7.5 0 0 1 15 0V20" stroke="#6366f1" strokeWidth="1.8" />
                        </svg>
                      </i>
                      <strong>No educational tours match these filters.</strong>
                      <p>Try adjusting your filters or create a new tour to get started.</p>
                      <button type="button" className="sa-btn sa-btn-primary" onClick={startCreate}>+ New Tour</button>
                    </div>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </article>

      {detail && (
        <div className="sa-action-overlay" onClick={() => setDetail(null)} role="presentation">
          <div className="sa-action-modal sa-stop-detail sa-trip-detail" role="dialog" aria-modal="true" aria-labelledby="sa-tour-detail-title" onClick={(e) => e.stopPropagation()}>
            <header className="sa-stop-detail-bar">
              <h2>Tour details</h2>
              <button type="button" className="sa-icon-ghost" aria-label="Close" onClick={() => setDetail(null)}>×</button>
            </header>
            <div className="sa-stop-detail-id">
              <i aria-hidden="true"><TourGlyph name="flag" /></i>
              <div>
                <h3 id="sa-tour-detail-title">{detail.title}</h3>
                <em className={`sa-stu-status is-${statusMeta(detail.status).key}`}>{statusMeta(detail.status).label}</em>
              </div>
            </div>
            <dl className="sa-stop-detail-grid">
              <div className="sa-stop-detail-field"><div><dt>Destination</dt><dd>{detail.location || '—'}</dd></div></div>
              <div className="sa-stop-detail-field"><div><dt>Starts</dt><dd>{fmtWhen(detail.startAt)}</dd></div></div>
              <div className="sa-stop-detail-field"><div><dt>Ends</dt><dd>{fmtWhen(detail.endAt)}</dd></div></div>
              <div className="sa-stop-detail-field"><div><dt>Audience</dt><dd>{detail.audience || detail.grade || 'Whole school'}</dd></div></div>
              <div className="sa-stop-detail-field"><div><dt>Route</dt><dd>{detail.routeId?.name || '—'}</dd></div></div>
              <div className="sa-stop-detail-field"><div><dt>Driver</dt><dd>{detail.driverId?.name || '—'}</dd></div></div>
              <div className="sa-stop-detail-field"><div><dt>Vehicle</dt><dd>{[detail.busId?.label, detail.busId?.plate].filter(Boolean).join(' · ') || '—'}</dd></div></div>
              <div className="sa-stop-detail-field"><div><dt>Linked trip</dt><dd>{detail.tripId?.tripCode || 'Not generated'}</dd></div></div>
            </dl>
            {detail.notes ? <p className="sa-tour-notes">{detail.notes}</p> : null}
            {permissions.length ? (
              <ul className="sa-tour-perms">
                {permissions.slice(0, 8).map((p) => (
                  <li key={p._id}>
                    <span>{p.kidId?.name || 'Student'} · {p.parentId?.name || 'Parent'}</span>
                    <em className={`sa-stu-status is-${p.status === 'granted' ? 'completed' : p.status === 'denied' ? 'cancelled' : 'scheduled'}`}>{p.status}</em>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="sa-muted sa-tour-notes">Parent permissions will appear here after they respond.</p>
            )}
            <div className="sa-stop-detail-foot">
              {detail.status === 'upcoming' ? (
                <button type="button" className="sa-btn sa-btn-primary" onClick={() => { setDetail(null); startEdit(detail); }}>Edit tour</button>
              ) : (
                <button type="button" className="sa-btn sa-btn-outline" onClick={() => setDetail(null)}>Close</button>
              )}
              {detail.tripId ? (
                <Link to="/school-admin/trip-instances" className="sa-btn sa-btn-outline">View daily trips</Link>
              ) : (
                <button type="button" className="sa-btn sa-btn-outline" onClick={() => setDetail(null)}>Close</button>
              )}
            </div>
          </div>
        </div>
      )}

      {menuOuting && (
        <div className="sa-action-overlay" onClick={() => setMenuId('')} role="presentation">
          <div className="sa-action-modal" role="dialog" aria-modal="true" onClick={(e) => e.stopPropagation()}>
            <header className="sa-action-head">
              <div>
                <p className="sa-action-kicker">Tour actions</p>
                <h3>{menuOuting.title}</h3>
                <small>{menuOuting.location || 'No destination'} · {statusMeta(menuOuting.status).label}</small>
              </div>
              <button type="button" className="sa-icon-ghost" aria-label="Close" onClick={() => setMenuId('')}>×</button>
            </header>
            <div className="sa-action-list">
              <button type="button" onClick={() => { setMenuId(''); openDetail(menuOuting); }}>
                <span><strong>View details</strong><em>Destination, transport, and permissions</em></span>
              </button>
              {menuOuting.status === 'upcoming' ? (
                <button type="button" onClick={() => { setMenuId(''); startEdit(menuOuting); }}>
                  <span><strong>Edit tour</strong><em>Change time, audience, or bus assignment</em></span>
                </button>
              ) : null}
              {menuOuting.status === 'upcoming' ? (
                <button type="button" className="is-danger" onClick={() => cancelOuting(menuOuting)}>
                  <span><strong>Cancel tour</strong><em>Also cancels the linked transport trip</em></span>
                </button>
              ) : null}
            </div>
            <div className="sa-action-foot">
              <button type="button" className="sa-btn sa-btn-outline" onClick={() => setMenuId('')}>Close</button>
            </div>
          </div>
        </div>
      )}

      {formOpen && (
        <div className="sa-action-overlay" onClick={() => setFormOpen(false)} role="presentation">
          <form className="sa-action-modal sa-stop-form" role="dialog" aria-modal="true" aria-labelledby="sa-tour-form-title" onClick={(e) => e.stopPropagation()} onSubmit={submit}>
            <header className="sa-stop-detail-bar">
              <h2 id="sa-tour-form-title">{editing ? 'Edit tour' : 'New educational tour'}</h2>
              <button type="button" className="sa-icon-ghost" aria-label="Close" onClick={() => setFormOpen(false)}>×</button>
            </header>
            <div className="sa-stop-form-body">
              {error && <div className="alert">{error}</div>}
              <label className="sa-field">
                <span>Tour title <b className="sa-req">*</b></span>
                <input required value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder="Wildlife park visit" />
              </label>
              <label className="sa-field">
                <span>Destination</span>
                <input value={form.location} onChange={(e) => setForm({ ...form, location: e.target.value })} placeholder="Nairobi National Park" />
              </label>
              <div className="sa-stu-form-row">
                <label className="sa-field">
                  <span>Starts <b className="sa-req">*</b></span>
                  <input type="datetime-local" required value={form.startAt} onChange={(e) => setForm({ ...form, startAt: e.target.value })} />
                </label>
                <label className="sa-field">
                  <span>Ends</span>
                  <input type="datetime-local" value={form.endAt} onChange={(e) => setForm({ ...form, endAt: e.target.value })} />
                </label>
              </div>
              <div className="sa-stu-form-row">
                <label className="sa-field">
                  <span>Grade</span>
                  <input list="sa-tour-grades" value={form.grade} onChange={(e) => setForm({ ...form, grade: e.target.value })} placeholder="Grade 4" />
                  <datalist id="sa-tour-grades">
                    {grades.map((g) => <option key={g} value={g} />)}
                  </datalist>
                </label>
                <label className="sa-field">
                  <span>Audience label</span>
                  <input value={form.audience} onChange={(e) => setForm({ ...form, audience: e.target.value })} placeholder="Grade 4 Students" />
                </label>
              </div>
              <div className="sa-stu-form-row">
                <label className="sa-field">
                  <span>Buses</span>
                  <input type="number" min="0" max="50" value={form.busCount} onChange={(e) => setForm({ ...form, busCount: e.target.value })} />
                </label>
                <label className="sa-field">
                  <span>Teachers</span>
                  <input type="number" min="0" max="50" value={form.teacherCount} onChange={(e) => setForm({ ...form, teacherCount: e.target.value })} />
                </label>
              </div>
              <p className="sa-muted sa-tour-hint">Optional transport — assign a route and driver to generate a Daily trip parents and drivers can track.</p>
              <label className="sa-field">
                <span>Route</span>
                <select value={form.routeId} onChange={(e) => setForm({ ...form, routeId: e.target.value })}>
                  <option value="">No transport trip</option>
                  {routes.map((r) => <option key={r._id} value={r._id}>{r.name}</option>)}
                </select>
              </label>
              <div className="sa-stu-form-row">
                <label className="sa-field">
                  <span>Driver {form.routeId ? <b className="sa-req">*</b> : null}</span>
                  <select value={form.driverId} onChange={(e) => setForm({ ...form, driverId: e.target.value })} required={Boolean(form.routeId)}>
                    <option value="">{form.routeId ? 'Select a driver' : 'Optional'}</option>
                    {drivers.map((d) => <option key={d.id || d._id} value={d.id || d._id}>{d.name}</option>)}
                  </select>
                </label>
                <label className="sa-field">
                  <span>Vehicle</span>
                  <select value={form.busId} onChange={(e) => setForm({ ...form, busId: e.target.value })}>
                    <option value="">Optional</option>
                    {buses.map((b) => <option key={b._id} value={b._id}>{[b.label, b.plate].filter(Boolean).join(' · ')}</option>)}
                  </select>
                </label>
              </div>
              <label className="sa-field">
                <span>Notes for parents</span>
                <textarea rows={3} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} placeholder="Uniform, packed lunch, consent deadline..." />
              </label>
            </div>
            <div className="sa-stop-form-foot">
              <button type="button" className="sa-btn sa-btn-outline" onClick={() => setFormOpen(false)}>Cancel</button>
              <button type="submit" className="sa-btn sa-btn-primary" disabled={busy || !canSave}>
                {busy ? 'Saving...' : editing ? 'Save tour' : 'Create tour'}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}

