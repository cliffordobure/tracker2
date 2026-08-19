import { useCallback, useEffect, useState } from 'react';
import { Link, useOutletContext } from 'react-router-dom';
import { api } from '../../lib/api';
import MapView from '../../components/MapView';

const PAGE_SIZES = [10, 25, 50];
const TYPE_COLORS = {
  accident: '#dc2626',
  breakdown: '#d97706',
  traffic: '#ea580c',
  road_block: '#c2410c',
  weather: '#0284c7',
  passenger: '#2563eb',
  unsafe: '#7c3aed',
  other: '#64748b',
};

function monthStartInput() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`;
}

function todayInput() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function csvEscape(value) {
  const s = String(value ?? '');
  if (/[",\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

function pageItems(page, pages) {
  if (pages <= 7) return Array.from({ length: pages }, (_, i) => i + 1);
  const items = [1];
  const start = Math.max(2, page - 1);
  const end = Math.min(pages - 1, page + 1);
  if (start > 2) items.push('…');
  for (let i = start; i <= end; i += 1) items.push(i);
  if (end < pages - 1) items.push('…');
  items.push(pages);
  return items;
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

function pct(part, total) {
  if (!total) return '0%';
  return `${Math.round((part / total) * 100)}%`;
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

function typeGlyph(type) {
  if (type === 'accident') return '🚗';
  if (type === 'breakdown') return '🔧';
  if (type === 'passenger' || type === 'unsafe') return '👤';
  if (type === 'weather') return '🌦';
  if (type === 'traffic' || type === 'road_block') return '!';
  return '⚠';
}

function vehicleLabel(row) {
  const plate = row.bus?.plate || row.bus?.label || '';
  const route = row.route?.name || '';
  if (plate && route) return `${plate} · ${route}`;
  return plate || route || row.tripCode || '—';
}

const emptyForm = {
  tripId: '',
  type: 'other',
  severity: 'medium',
  details: '',
  occurredAt: '',
};

export default function Incidents() {
  const { globalSearch = '' } = useOutletContext() || {};
  const [from, setFrom] = useState(monthStartInput);
  const [to, setTo] = useState(todayInput);
  const [type, setType] = useState('');
  const [severity, setSeverity] = useState('');
  const [q, setQ] = useState('');
  const [showFilters, setShowFilters] = useState(true);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [selected, setSelected] = useState(null);
  const [menuId, setMenuId] = useState('');
  const [showReport, setShowReport] = useState(false);
  const [showCategories, setShowCategories] = useState(false);
  const [showTemplates, setShowTemplates] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);
  const year = new Date().getFullYear();

  const load = useCallback(async () => {
    const params = new URLSearchParams({ from, to });
    if (type) params.set('type', type);
    if (severity) params.set('severity', severity);
    if (q.trim()) params.set('q', q.trim());
    const next = await api(`/admin/incidents?${params}`);
    setData(next);
    setError('');
    return next;
  }, [from, to, type, severity, q]);

  useEffect(() => {
    load().catch((err) => setError(err.message));
  }, [load]);

  useEffect(() => {
    if (globalSearch) setQ(globalSearch);
  }, [globalSearch]);

  useEffect(() => {
    setPage(1);
  }, [from, to, type, severity, q, pageSize]);

  const rows = data?.incidents || [];
  const stats = data?.stats || {};
  const types = data?.types || [];
  const trips = data?.trips || [];
  const pages = Math.max(1, Math.ceil(rows.length / pageSize));
  const safePage = Math.min(page, pages);
  const slice = rows.slice((safePage - 1) * pageSize, safePage * pageSize);
  const total = stats.total ?? rows.length;
  const bySeverity = stats.bySeverity || { high: 0, medium: 0, low: 0 };
  const typeBars = stats.typeBars || [];
  const donutItems = typeBars.map((t) => ({
    ...t,
    color: TYPE_COLORS[t.id] || '#64748b',
  }));

  const kpis = [
    {
      label: 'Total Incidents',
      value: data ? total : '…',
      hint: stats.thisMonth ? `${stats.thisMonth} this month` : 'In this date range',
      tint: 'rose',
    },
    { label: 'Open', value: '—', hint: 'Status is not tracked', tint: 'orange' },
    { label: 'In Progress', value: '—', hint: 'Status is not tracked', tint: 'orange' },
    { label: 'Resolved', value: '—', hint: 'Status is not tracked', tint: 'green' },
    { label: 'Closed', value: '—', hint: 'Status is not tracked', tint: 'purple' },
  ];

  const exportRows = () => {
    const lines = [
      ['ID', 'Type', 'Description', 'Vehicle', 'Route', 'Location', 'Severity', 'Status', 'Reported At'].join(','),
      ...rows.map((r) =>
        [
          r.shortId,
          r.label,
          csvEscape(r.details),
          csvEscape(r.bus?.plate || r.bus?.label || ''),
          csvEscape(r.route?.name || ''),
          csvEscape(r.locationLabel),
          r.severity,
          '',
          r.occurredAt ? new Date(r.occurredAt).toISOString() : '',
        ].join(',')
      ),
    ];
    const blob = new Blob([lines.join('\n')], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `incidents-${from}-to-${to}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const submitReport = async (e) => {
    e.preventDefault();
    setSaving(true);
    setError('');
    try {
      await api('/admin/incidents', {
        method: 'POST',
        body: {
          ...form,
          occurredAt: form.occurredAt ? new Date(form.occurredAt).toISOString() : undefined,
        },
      });
      setShowReport(false);
      setForm(emptyForm);
      setSuccess('Incident saved.');
      await load();
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  const fromLabel = slice.length ? (safePage - 1) * pageSize + 1 : 0;
  const toLabel = Math.min(rows.length, safePage * pageSize);

  return (
    <div className="sa-students sa-incidents">
      {error && <div className="alert">{error}</div>}
      {success && <div className="alert alert-ok">{success}</div>}

      <section className="sa-stu-kpis sa-tch-kpis sa-inc-kpis" aria-label="Incident metrics">
        {kpis.map((m) => (
          <article key={m.label} className={`sa-stu-kpi tint-${m.tint}`}>
            <div>
              <span>{m.label}</span>
              <strong>{m.value}</strong>
              <em>{m.hint}</em>
            </div>
            <i className="sa-stu-kpi-icon" aria-hidden="true" />
          </article>
        ))}
      </section>

      <section className="sa-inc-layout">
        <article className="sa-card sa-stu-table-card">
          {showFilters && (
            <div className="sa-stu-toolbar sa-drv-toolbar sa-inc-toolbar">
              <select value="" disabled aria-label="Status">
                <option>All Status</option>
              </select>
              <select value={severity} onChange={(e) => setSeverity(e.target.value)} aria-label="Severity">
                <option value="">All Severity</option>
                <option value="high">High</option>
                <option value="medium">Medium</option>
                <option value="low">Low</option>
              </select>
              <select value={type} onChange={(e) => setType(e.target.value)} aria-label="Type">
                <option value="">All Types</option>
                {types.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.label}
                  </option>
                ))}
              </select>
              <label className="sa-reports-dates">
                <span>From</span>
                <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
              </label>
              <label className="sa-reports-dates">
                <span>To</span>
                <input type="date" value={to} onChange={(e) => setTo(e.target.value)} />
              </label>
              <label className="sa-stu-search">
                <span aria-hidden="true">⌕</span>
                <input
                  value={q}
                  onChange={(e) => setQ(e.target.value)}
                  placeholder="Search incidents..."
                />
              </label>
              <button type="button" className="sa-btn sa-btn-outline" onClick={() => setShowFilters(false)}>
                Filters
              </button>
            </div>
          )}
          {!showFilters && (
            <div className="sa-inc-filter-collapsed">
              <button type="button" className="sa-btn sa-btn-outline" onClick={() => setShowFilters(true)}>
                Filters
              </button>
            </div>
          )}
          <p className="sa-inc-status-note">Incident workflow status (open / in progress / resolved / closed) is not stored.</p>

          <div className="sa-table-wrap">
            <table className="sa-table sa-stu-table sa-inc-table">
              <thead>
                <tr>
                  <th>Incident ID</th>
                  <th>Type</th>
                  <th>Description</th>
                  <th>Vehicle / Route</th>
                  <th>Location</th>
                  <th>Severity</th>
                  <th>Status</th>
                  <th>Reported At</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {slice.map((row) => (
                  <tr key={row.id}>
                    <td>
                      <code title={row.id}>{row.shortId}</code>
                    </td>
                    <td>
                      <span className={`sa-inc-type is-${row.type}`}>
                        <i aria-hidden="true">{typeGlyph(row.type)}</i>
                        {row.label}
                      </span>
                    </td>
                    <td className="sa-inc-desc">{row.details || '—'}</td>
                    <td>{vehicleLabel(row)}</td>
                    <td>{row.locationLabel || '—'}</td>
                    <td>
                      <span className={`sa-inc-sev is-${row.severity}`}>{row.severity}</span>
                    </td>
                    <td>—</td>
                    <td>{fmtStamp(row.occurredAt)}</td>
                    <td>
                      <div className="sa-inc-row-actions">
                        <button type="button" className="sa-icon-btn" aria-label="View" onClick={() => setSelected(row)}>
                          👁
                        </button>
                        <button
                          type="button"
                          className="sa-icon-btn"
                          aria-label="More"
                          onClick={() => setMenuId(menuId === row.id ? '' : row.id)}
                        >
                          ⋮
                        </button>
                        {menuId === row.id && (
                          <div className="sa-inc-menu">
                            <button type="button" onClick={() => { setSelected(row); setMenuId(''); }}>
                              View details
                            </button>
                            <Link to={`/school-admin/trip-instances`} onClick={() => setMenuId('')}>
                              View trips
                            </Link>
                            {row.tripId ? (
                              <Link to={`/school-admin/live-tracking?trip=${row.tripId}`} onClick={() => setMenuId('')}>
                                Live tracking
                              </Link>
                            ) : null}
                            {row.driver?._id ? (
                              <Link to={`/school-admin/drivers/${row.driver._id}`} onClick={() => setMenuId('')}>
                                Driver
                              </Link>
                            ) : null}
                          </div>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
                {!slice.length && (
                  <tr>
                    <td colSpan={9} className="sa-stu-empty">
                      No incident reports in this date range.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
          <div className="sa-table-foot sa-stu-foot">
            <span>
              Showing {fromLabel} to {toLabel} of {rows.length} incidents
            </span>
            <label>
              <select value={pageSize} onChange={(e) => setPageSize(Number(e.target.value))} aria-label="Per page">
                {PAGE_SIZES.map((n) => (
                  <option key={n} value={n}>
                    {n} per page
                  </option>
                ))}
              </select>
            </label>
            <div className="sa-pager">
              {pageItems(safePage, pages).map((item, i) =>
                item === '…' ? (
                  <span key={`e${i}`}>…</span>
                ) : (
                  <button key={item} type="button" className={item === safePage ? 'is-on' : ''} onClick={() => setPage(item)}>
                    {item}
                  </button>
                )
              )}
            </div>
          </div>
        </article>

        <aside className="sa-inc-side">
          <button type="button" className="sa-btn sa-btn-primary sa-inc-report" onClick={() => setShowReport(true)}>
            + Report New Incident
          </button>

          <article className="sa-card">
            <h3>Incident Summary</h3>
            <div className="sa-inc-donut" style={donutStyle(donutItems, total)} aria-hidden="true">
              <div>
                <strong>{total}</strong>
                <span>Total</span>
              </div>
            </div>
            {donutItems.length ? (
              <ul className="sa-inc-legend">
                {donutItems.map((item) => (
                  <li key={item.id}>
                    <i style={{ background: item.color }} />
                    <span>{item.label}</span>
                    <strong>{item.count}</strong>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="sa-muted">No reports in this range to chart.</p>
            )}
            <p className="sa-muted">Charted by type. Open / resolved status is not stored.</p>
          </article>

          <article className="sa-card">
            <h3>By Severity</h3>
            {['high', 'medium', 'low'].map((key) => (
              <div key={key} className="sa-inc-bar">
                <span>{key}</span>
                <b>
                  <i className={`is-${key}`} style={{ width: total ? pct(bySeverity[key] || 0, total) : '0%' }} />
                </b>
                <em>
                  {bySeverity[key] || 0} · {pct(bySeverity[key] || 0, total)}
                </em>
              </div>
            ))}
            <p className="sa-muted">Info severity is not used. Stored values are high, medium, and low.</p>
          </article>

          <article className="sa-card">
            <h3>Quick Actions</h3>
            <ul className="sa-inc-quick">
              <li>
                <button type="button" onClick={() => setShowReport(true)}>
                  Report New Incident
                </button>
              </li>
              <li>
                <button type="button" onClick={() => setShowCategories(true)}>
                  Incident Categories
                </button>
              </li>
              <li>
                <button type="button" onClick={() => setShowTemplates(true)}>
                  Resolution Templates
                </button>
              </li>
              <li>
                <button type="button" onClick={exportRows} disabled={!rows.length}>
                  Export Report
                </button>
              </li>
            </ul>
          </article>
        </aside>
      </section>

      {selected && (
        <div className="sa-reports-modal" role="dialog" aria-labelledby="sa-inc-detail">
          <div className="sa-card sa-inc-detail">
            <h3 id="sa-inc-detail">{selected.label}</h3>
            <p className="sa-muted">
              {selected.shortId} · {fmtStamp(selected.occurredAt)}
              <span className={`sa-inc-sev is-${selected.severity}`}>{selected.severity}</span>
            </p>
            <p>{selected.details || '—'}</p>
            <dl className="sa-notify-grid">
              <div>
                <dt>Vehicle</dt>
                <dd>{selected.bus?.plate || selected.bus?.label || '—'}</dd>
              </div>
              <div>
                <dt>Route</dt>
                <dd>{selected.route?.name || '—'}</dd>
              </div>
              <div>
                <dt>Driver</dt>
                <dd>{selected.driver?.name || '—'}</dd>
              </div>
              <div>
                <dt>Status</dt>
                <dd>—</dd>
              </div>
              <div>
                <dt>Location</dt>
                <dd>{selected.locationLabel || '—'}</dd>
              </div>
              <div>
                <dt>Trip</dt>
                <dd>{selected.tripCode || '—'}</dd>
              </div>
            </dl>
            {selected.location ? (
              <div className="sa-notify-map-wrap">
                <MapView
                  center={selected.location}
                  zoom={14}
                  driverLocation={selected.location}
                  followDriver
                  className="sa-notify-map"
                />
              </div>
            ) : (
              <p className="sa-muted">No GPS point was saved with this report.</p>
            )}
            {selected.photoUrls?.length ? (
              <div className="sa-inc-photos">
                {selected.photoUrls.map((url) => (
                  <a key={url} href={url} target="_blank" rel="noreferrer">
                    <img src={url} alt="" />
                  </a>
                ))}
              </div>
            ) : null}
            <div className="sa-reports-actions">
              <button type="button" className="sa-btn sa-btn-outline" onClick={() => setSelected(null)}>
                Close
              </button>
              {selected.tripId ? (
                <Link className="sa-btn sa-btn-primary" to={`/school-admin/live-tracking?trip=${selected.tripId}`}>
                  View Live Tracking
                </Link>
              ) : null}
            </div>
          </div>
        </div>
      )}

      {showReport && (
        <div className="sa-reports-modal" role="dialog" aria-labelledby="sa-inc-report">
          <form className="sa-card" onSubmit={submitReport}>
            <h3 id="sa-inc-report">Report new incident</h3>
            <label>
              Trip
              <select
                value={form.tripId}
                onChange={(e) => setForm({ ...form, tripId: e.target.value })}
                required
              >
                <option value="">Select a trip</option>
                {trips.map((t) => (
                  <option key={t._id} value={t._id}>
                    {(t.tripCode || 'Trip') +
                      (t.route?.name ? ` · ${t.route.name}` : '') +
                      (t.bus?.plate ? ` · ${t.bus.plate}` : '')}
                  </option>
                ))}
              </select>
            </label>
            {!trips.length && <p className="sa-muted">No recent trips are available to attach a report to.</p>}
            <label>
              Type
              <select value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value })}>
                {types.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.label}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Severity
              <select value={form.severity} onChange={(e) => setForm({ ...form, severity: e.target.value })}>
                <option value="low">Low</option>
                <option value="medium">Medium</option>
                <option value="high">High</option>
              </select>
            </label>
            <label>
              When
              <input
                type="datetime-local"
                value={form.occurredAt}
                onChange={(e) => setForm({ ...form, occurredAt: e.target.value })}
              />
            </label>
            <label>
              What happened
              <textarea
                rows={4}
                value={form.details}
                onChange={(e) => setForm({ ...form, details: e.target.value })}
                required
                maxLength={500}
              />
            </label>
            <p className="sa-muted">
              Location is taken from the trip&apos;s last GPS point when one exists. Status (open / closed) is not stored.
            </p>
            <div className="sa-reports-actions">
              <button type="button" className="sa-btn sa-btn-outline" onClick={() => setShowReport(false)}>
                Cancel
              </button>
              <button type="submit" className="sa-btn sa-btn-primary" disabled={saving || !trips.length}>
                Save incident
              </button>
            </div>
          </form>
        </div>
      )}

      {showCategories && (
        <div className="sa-reports-modal" role="dialog" aria-labelledby="sa-inc-cats">
          <div className="sa-card">
            <h3 id="sa-inc-cats">Incident categories</h3>
            <p className="sa-muted">Categories are the stored report types. Custom category lists are not saved.</p>
            <ul className="sa-inc-cats">
              {types.map((t) => (
                <li key={t.id}>
                  <span>{t.label}</span>
                  <strong>{stats.byType?.[t.id] || 0}</strong>
                </li>
              ))}
            </ul>
            <div className="sa-reports-actions">
              <button type="button" className="sa-btn sa-btn-primary" onClick={() => setShowCategories(false)}>
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {showTemplates && (
        <div className="sa-reports-modal" role="dialog" aria-labelledby="sa-inc-tpl">
          <div className="sa-card">
            <h3 id="sa-inc-tpl">Resolution templates</h3>
            <p className="sa-muted">Resolution templates are not stored yet.</p>
            <div className="sa-reports-actions">
              <button type="button" className="sa-btn sa-btn-primary" onClick={() => setShowTemplates(false)}>
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      <footer className="sa-home-foot">
        <span>© {year} Transport</span>
        <span>Transport Management System v1.0.0</span>
      </footer>
    </div>
  );
}
