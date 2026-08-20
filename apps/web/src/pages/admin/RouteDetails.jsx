import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { api } from '../../lib/api';
import MapView from '../../components/MapView';
import { fetchDrivingRoute, formatEtaMinutes } from '../../lib/directions';
import { orderedStopsForDirection } from '../../lib/geo';

const TABS = [
  { id: 'overview', label: 'Overview' },
  { id: 'stops', label: 'Stops' },
  { id: 'schedule', label: 'Schedule' },
  { id: 'students', label: 'Students' },
  { id: 'trips', label: 'Trips' },
  { id: 'map', label: 'Map' },
  { id: 'notes', label: 'Notes' },
  { id: 'activity', label: 'Activity Log' },
];

const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const PIN_COLORS = ['#5d3fd3', '#0ea5e9', '#16a34a', '#f97316', '#e11d48', '#14b8a6'];

function dash(value) {
  if (value == null || value === 0) return value === 0 ? '0' : '—';
  const s = String(value).trim();
  return s || '—';
}

function initials(name = '') {
  const parts = String(name).trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return '?';
  if (parts.length === 1) return parts[0][0].toUpperCase();
  return (parts[0][0] + parts[1][0]).toUpperCase();
}

function fmtDate(value) {
  if (!value) return '';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
}

function fmtTime(value) {
  if (!value) return '';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
}

function fmtClock(hhmm) {
  if (!hhmm) return '';
  const [h, m] = String(hhmm).split(':').map(Number);
  if (!Number.isFinite(h)) return String(hhmm);
  const d = new Date();
  d.setHours(h, Number.isFinite(m) ? m : 0, 0, 0);
  return d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
}

function addMinutes(hhmm, extraMin) {
  if (!hhmm || extraMin == null) return '';
  const [h, m] = String(hhmm).split(':').map(Number);
  if (!Number.isFinite(h)) return '';
  const d = new Date();
  d.setHours(h, Number.isFinite(m) ? m : 0, 0, 0);
  d.setMinutes(d.getMinutes() + Number(extraMin));
  return d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
}

function pinColor(id) {
  const s = String(id || '');
  let n = 0;
  for (let i = 0; i < s.length; i += 1) n += s.charCodeAt(i);
  return PIN_COLORS[n % PIN_COLORS.length];
}

function directionLabel(value) {
  if (value === 'to_school') return 'To school';
  if (value === 'to_home') return 'To home';
  return '';
}

function periodLabel(value) {
  if (!value) return '';
  return value.charAt(0).toUpperCase() + value.slice(1);
}

function scheduleTypeLabel(type) {
  if (type === 'EVERY_DAY') return 'Every day';
  if (type === 'WEEKDAYS') return 'Weekdays';
  if (type === 'CUSTOM_DAYS') return 'Custom days';
  if (type === 'ONE_TIME') return 'One-time';
  return '';
}

function operatingDays(schedules) {
  const active = (schedules || []).filter((s) => s.active !== false);
  if (!active.length) return '';
  if (active.some((s) => s.scheduleType === 'EVERY_DAY')) return 'Every day';
  const set = new Set();
  for (const s of active) {
    if (s.scheduleType === 'WEEKDAYS') [1, 2, 3, 4, 5].forEach((d) => set.add(d));
    else if (s.scheduleType === 'CUSTOM_DAYS') (s.customDays || []).forEach((d) => set.add(d));
  }
  if (!set.size) {
    if (active.some((s) => s.scheduleType === 'ONE_TIME')) return 'One-time';
    return '';
  }
  return [...set]
    .sort((a, b) => a - b)
    .map((d) => DAY_NAMES[d])
    .join(', ');
}

function tripStatusMeta(status) {
  if (status === 'completed') return { key: 'active', label: 'Completed' };
  if (status === 'active') return { key: 'active', label: 'In progress' };
  if (status === 'scheduled') return { key: 'inactive', label: 'Scheduled' };
  if (status === 'cancelled') return { key: 'noroute', label: 'Cancelled' };
  return { key: 'muted', label: status || '—' };
}

function kmLabel(meters) {
  if (!Number.isFinite(meters) || meters <= 0) return '';
  const km = meters / 1000;
  return `${km.toFixed(km >= 10 ? 1 : 1)} km`;
}

function stopPlace(stop) {
  if (stop?.address) return stop.address;
  if (stop?.location?.lat != null && stop?.location?.lng != null) {
    return `${Number(stop.location.lat).toFixed(4)}, ${Number(stop.location.lng).toFixed(4)}`;
  }
  return '';
}

function stopKind(stop, startId, endId) {
  const id = String(stop?._id || '');
  if (startId && id === startId) return 'Start';
  if (endId && id === endId) return 'End';
  if (stop?.type === 'school') return 'School';
  return '';
}

export default function RouteDetails() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState('overview');
  const [menuOpen, setMenuOpen] = useState(false);
  const [mapEta, setMapEta] = useState(null);

  const load = async () => {
    setLoading(true);
    setError('');
    setMapEta(null);
    try {
      setData(await api(`/admin/routes/${id}`));
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, [id]);

  const route = data?.route;
  const stops = data?.stops || [];
  const students = data?.students || [];
  const schedules = data?.schedules || [];
  const year = new Date().getFullYear();
  const active = route?.active !== false;
  const todayLabel = new Date().toLocaleDateString(undefined, {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
  const todaySchedule = useMemo(
    () => (schedules || []).find((s) => s.appliesToday && s.active !== false) || (schedules || []).find((s) => s.appliesToday) || null,
    [schedules]
  );

  useEffect(() => {
    const list = data?.stops || [];
    const ordered = orderedStopsForDirection(list, todaySchedule?.direction || 'to_school');
    const points = ordered.map((s) => s.location).filter((loc) => loc?.lat != null && loc?.lng != null);
    if (points.length < 2) {
      setMapEta(null);
      return undefined;
    }
    let cancelled = false;
    fetchDrivingRoute(points).then((result) => {
      if (!cancelled) setMapEta(result || null);
    });
    return () => {
      cancelled = true;
    };
  }, [data?.stops, todaySchedule?.direction]);
  const startStop = stops.find((s) => s.type === 'home') || stops[0] || null;
  const endStop = stops.find((s) => s.type === 'school') || stops[stops.length - 1] || null;
  const mapDistance = kmLabel(mapEta?.distanceM);
  const mapDuration = formatEtaMinutes(mapEta?.durationSec);
  const savedDuration = route?.estimatedMinutes > 0 ? `${route.estimatedMinutes} min` : '';
  const assignedStudents = students.filter((s) => s.active !== false);

  const setActive = async (next) => {
    try {
      await api(`/admin/routes/${route._id}`, { method: 'PUT', body: { active: next } });
      setMenuOpen(false);
      await load();
    } catch (e) {
      setError(e.message);
    }
  };

  const remove = async () => {
    if (!confirm(`Remove ${route.name} and its stops?`)) return;
    try {
      await api(`/admin/routes/${route._id}`, { method: 'DELETE' });
      navigate('/school-admin/routes');
    } catch (e) {
      setError(e.message);
    }
  };

  if (loading) {
    return (
      <div className="sa-sd">
        <div className="sa-skeleton sa-skeleton-hero" />
      </div>
    );
  }

  if (error && !route) return <div className="alert">{error}</div>;
  if (!route) return <div className="sa-empty-panel"><h2>Route not found</h2></div>;

  const mapBlock = (className) => (
    <MapView
      center={startStop?.location || { lat: -1.3965, lng: 36.7542 }}
      stops={stops}
      direction={todaySchedule?.direction || 'to_school'}
      showRoute={stops.length >= 2}
      interactive={tab === 'map'}
      className={className}
    />
  );

  return (
    <div className="sa-sd sa-rd">
      {error && <div className="alert">{error}</div>}

      <div className="sa-sd-top">
        <Link to="/school-admin/routes" className="sa-text-link">
          ← Back to Routes
        </Link>
        <div className="sa-sd-top-actions">
          <Link to={`/school-admin/routes?edit=${route._id}`} className="sa-btn sa-btn-outline">
            Edit Route
          </Link>
          <div className="sa-sd-menu-wrap">
            <button type="button" className="sa-btn sa-btn-primary" onClick={() => setMenuOpen((v) => !v)}>
              Actions ▾
            </button>
            {menuOpen && (
              <div className="sa-stu-menu sa-sd-menu">
                <button type="button" onClick={() => navigate(`/school-admin/routes?stops=${route._id}`)}>
                  Manage stops
                </button>
                <button type="button" onClick={() => setActive(!active)}>
                  {active ? 'Deactivate' : 'Activate'}
                </button>
                <button type="button" onClick={() => navigate('/school-admin/trip-scheduling')}>
                  Trip scheduling
                </button>
                <button type="button" className="is-danger" onClick={remove}>
                  Delete
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      <section className="sa-card sa-sd-profile sa-rd-profile">
        <div className="sa-sd-identity">
          <span className="sa-route-pin sa-rd-pin" style={{ background: pinColor(route._id) }} />
          <div>
            <div className="sa-sd-name">
              <h2>{route.name}</h2>
              <em className={`sa-stu-status is-${active ? 'active' : 'muted'}`}>{active ? 'Active' : 'Inactive'}</em>
            </div>
            <p className="sa-sd-meta">{route.path || route.description || '—'}</p>
            <p className="sa-sd-meta">
              {[
                route.code ? `Route Code: ${route.code}` : null,
                route.createdAt ? `Added ${fmtDate(route.createdAt)}` : null,
              ]
                .filter(Boolean)
                .join('  ·  ') || '—'}
            </p>
          </div>
        </div>
        <div className="sa-sd-sidebits sa-rd-bits">
          <div>
            <strong>Total Stops</strong>
            <p>{route.stopCount ?? stops.length}</p>
          </div>
          <div>
            <strong>Total Distance</strong>
            <p>{mapDistance || '—'}</p>
            <p>{mapDistance ? 'Map estimate' : 'Not tracked'}</p>
          </div>
          <div>
            <strong>Est. Duration</strong>
            <p>{savedDuration || mapDuration || '—'}</p>
            <p>{savedDuration ? 'Saved estimate' : mapDuration ? 'Map estimate' : 'Not tracked'}</p>
          </div>
          <div>
            <strong>Students Assigned</strong>
            <p>{route.studentCount ?? assignedStudents.length}</p>
          </div>
          <div>
            <strong>Driver</strong>
            <p>{dash(route.driver?.name)}</p>
            <p>{route.driver?.phone || (route.extraDrivers ? `+${route.extraDrivers} more` : '—')}</p>
          </div>
          <div>
            <strong>Vehicle</strong>
            <p>{dash(route.vehicle?.label)}</p>
            <p>{route.vehicle?.plate || '—'}</p>
          </div>
        </div>
      </section>

      <nav className="sa-sd-tabs" aria-label="Route sections">
        {TABS.map((t) => (
          <button key={t.id} type="button" className={tab === t.id ? 'is-active' : ''} onClick={() => setTab(t.id)}>
            {t.label}
          </button>
        ))}
      </nav>

      {tab === 'notes' && (
        <section className="sa-card sa-sd-tab">
          <h3>Notes</h3>
          {route.description ? (
            <p className="sa-sd-remarks">{route.description}</p>
          ) : (
            <p className="sa-muted">No description is stored on this route.</p>
          )}
        </section>
      )}

      {tab === 'activity' && (
        <section className="sa-card sa-sd-tab">
          <h3>Activity log</h3>
          <ul className="sa-activity">
            <li>
              <strong>Route updated</strong>
              <small>{fmtDate(route.updatedAt) || '—'}</small>
            </li>
            {(data.recentTrips || []).map((t) => {
              const meta = tripStatusMeta(t.status);
              return (
                <li key={t.id}>
                  <strong>{meta.label} trip</strong>
                  <span>{[t.driverName, t.busLabel].filter(Boolean).join(' · ')}</span>
                  <small>{fmtDate(t.serviceDate || t.scheduledFor || t.startedAt) || '—'}</small>
                </li>
              );
            })}
          </ul>
          {!data.recentTrips?.length ? (
            <p className="sa-muted">No trips recorded for this route yet.</p>
          ) : null}
        </section>
      )}

      {tab === 'overview' && (
        <>
          <section className="sa-rd-overview">
            <article className="sa-card">
              <div className="sa-rd-card-head">
                <h3>Route Information</h3>
                <Link to={`/school-admin/routes?edit=${route._id}`} className="sa-icon-ghost is-edit" aria-label="Edit">
                  ✎
                </Link>
              </div>
              <dl className="sa-sd-dl">
                <div><dt>Route Name</dt><dd>{dash(route.name)}</dd></div>
                <div><dt>Route Code</dt><dd>{dash(route.code)}</dd></div>
                <div><dt>Start Point</dt><dd>{dash(route.startName)}</dd></div>
                <div><dt>End Point</dt><dd>{dash(route.endName)}</dd></div>
                <div><dt>Distance</dt><dd>{mapDistance || '—'}</dd></div>
                <div><dt>Estimated Duration</dt><dd>{savedDuration || mapDuration || '—'}</dd></div>
                <div><dt>Operating Days</dt><dd>{dash(operatingDays(schedules))}</dd></div>
                <div><dt>Status</dt><dd>{active ? 'Active' : 'Inactive'}</dd></div>
              </dl>
              {route.description ? (
                <p className="sa-sd-remarks">{route.description}</p>
              ) : (
                <p className="sa-muted">No description saved for this route.</p>
              )}
            </article>

            <article className="sa-card">
              <h3>Route Map</h3>
              {stops.length ? (
                <>
                  {mapBlock('map-canvas map-md sa-rd-map')}
                  <ul className="sa-rd-legend">
                    <li><i className="is-start" /> Start Point</li>
                    <li><i className="is-stop" /> Stops</li>
                    <li><i className="is-end" /> End Point</li>
                  </ul>
                </>
              ) : (
                <p className="sa-muted">Add stops to draw this route on the map.</p>
              )}
            </article>
          </section>

          <section className="sa-rd-bottom">
            <article className="sa-card">
              <h3>Today’s Schedule</h3>
              <p className="sa-rd-sub">{todayLabel}</p>
              {data.todayTrips?.length ? (
                <ul className="sa-rd-today-trips">
                  {data.todayTrips.map((t) => {
                    const meta = tripStatusMeta(t.status);
                    return (
                      <li key={t.id}>
                        <strong>{fmtTime(t.scheduledFor || t.startedAt) || periodLabel(t.period) || 'Trip'}</strong>
                        <span>{directionLabel(t.direction) || '—'}</span>
                        <em className={`sa-stu-status is-${meta.key}`}>{meta.label}</em>
                      </li>
                    );
                  })}
                </ul>
              ) : todaySchedule ? (
                <ol className="sa-rd-timeline">
                  <li>
                    <time>{fmtClock(todaySchedule.scheduledTime) || '—'}</time>
                    <div>
                      <strong>Depart {startStop?.name || 'start point'}</strong>
                      <small>
                        {[periodLabel(todaySchedule.period), directionLabel(todaySchedule.direction)]
                          .filter(Boolean)
                          .join(' · ') || 'Scheduled'}
                      </small>
                    </div>
                  </li>
                  {stops.slice(1, -1).map((s, i) => (
                    <li key={s._id}>
                      <time>
                        {todaySchedule.scheduledTime && mapEta?.legDurationsSec?.length
                          ? addMinutes(
                              todaySchedule.scheduledTime,
                              Math.round((mapEta.legDurationsSec.slice(0, i + 1).reduce((a, n) => a + n, 0) || 0) / 60)
                            )
                          : '—'}
                      </time>
                      <div>
                        <strong>{s.name}</strong>
                        <small>Stop</small>
                      </div>
                    </li>
                  ))}
                  {endStop && String(endStop._id) !== String(startStop?._id) ? (
                    <li>
                      <time>
                        {todaySchedule.scheduledTime && savedDuration
                          ? addMinutes(todaySchedule.scheduledTime, route.estimatedMinutes)
                          : todaySchedule.scheduledTime && mapEta?.durationSec
                            ? addMinutes(todaySchedule.scheduledTime, Math.round(mapEta.durationSec / 60))
                            : '—'}
                      </time>
                      <div>
                        <strong>Arrive {endStop.name}</strong>
                        <small>{savedDuration ? 'Saved estimate' : mapDuration ? 'Map estimate' : 'End point'}</small>
                      </div>
                    </li>
                  ) : null}
                </ol>
              ) : (
                <p className="sa-muted">No trip is scheduled for today.</p>
              )}
              <button type="button" className="sa-text-link" onClick={() => setTab('schedule')}>
                View Full Schedule
              </button>
            </article>

            <article className="sa-card">
              <h3>Stops on This Route</h3>
              {stops.length ? (
                <table className="sa-td-mini">
                  <thead>
                    <tr>
                      <th>#</th>
                      <th>Stop Name</th>
                      <th>Location</th>
                      <th>Est. Time</th>
                    </tr>
                  </thead>
                  <tbody>
                    {stops.map((s, i) => (
                      <tr key={s._id}>
                        <td>{stopKind(s, String(startStop?._id || ''), String(endStop?._id || '')) || i + 1}</td>
                        <td>{s.name}</td>
                        <td>{dash(stopPlace(s))}</td>
                        <td>
                          {todaySchedule?.scheduledTime && mapEta?.legDurationsSec?.length
                            ? addMinutes(
                                todaySchedule.scheduledTime,
                                Math.round((mapEta.legDurationsSec.slice(0, i).reduce((a, n) => a + n, 0) || 0) / 60)
                              )
                            : '—'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              ) : (
                <p className="sa-muted">No stops saved on this route yet.</p>
              )}
              <button type="button" className="sa-text-link" onClick={() => setTab('stops')}>
                View All Stops
              </button>
            </article>

            <article className="sa-card">
              <h3>Route Statistics (This Month)</h3>
              <ul className="sa-rd-stats">
                <li><span>Total Trips</span><strong>{data.monthStats?.trips ?? 0}</strong></li>
                <li><span>Completed</span><strong>{data.monthStats?.completed ?? 0}</strong></li>
                <li><span>Cancelled Trips</span><strong>{data.monthStats?.cancelled ?? 0}</strong></li>
                <li><span>Students Assigned</span><strong>{data.monthStats?.studentsAssigned ?? 0}</strong></li>
                <li><span>On-time Performance</span><strong>Not tracked</strong></li>
                <li><span>Average Delay</span><strong>Not tracked</strong></li>
                <li><span>Total Distance</span><strong>Not tracked</strong></li>
              </ul>
              <button type="button" className="sa-text-link" onClick={() => setTab('trips')}>
                View trip history
              </button>
            </article>
          </section>
        </>
      )}

      {tab === 'stops' && (
        <section className="sa-card">
          <div className="sa-rd-card-head">
            <h3>Stops</h3>
            <Link to={`/school-admin/routes?stops=${route._id}`} className="sa-btn sa-btn-outline">
              Manage stops
            </Link>
          </div>
          {stops.length ? (
            <table className="sa-table">
              <thead>
                <tr>
                  <th>Order</th>
                  <th>Stop Name</th>
                  <th>Type</th>
                  <th>Location</th>
                </tr>
              </thead>
              <tbody>
                {stops.map((s) => (
                  <tr key={s._id}>
                    <td>{s.order}</td>
                    <td>{s.name}</td>
                    <td>{s.type === 'school' ? 'School' : 'Home'}</td>
                    <td>{dash(stopPlace(s))}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <p className="sa-muted">No stops saved on this route yet.</p>
          )}
        </section>
      )}

      {tab === 'schedule' && (
        <section className="sa-card">
          <div className="sa-rd-card-head">
            <h3>Schedules</h3>
            <Link to="/school-admin/trip-scheduling" className="sa-btn sa-btn-outline">
              Open scheduling
            </Link>
          </div>
          {schedules.length ? (
            <table className="sa-table">
              <thead>
                <tr>
                  <th>Name</th>
                  <th>When</th>
                  <th>Direction</th>
                  <th>Driver</th>
                  <th>Vehicle</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {schedules.map((s) => (
                  <tr key={s.id}>
                    <td>
                      <strong>{s.name}</strong>
                      <small className="sa-stu-phone">{s.scheduledTime ? fmtClock(s.scheduledTime) : '—'}</small>
                    </td>
                    <td>
                      {[scheduleTypeLabel(s.scheduleType), periodLabel(s.period)].filter(Boolean).join(' · ') || '—'}
                    </td>
                    <td>{dash(directionLabel(s.direction))}</td>
                    <td>{dash(s.driverName)}</td>
                    <td>{dash(s.busLabel)}</td>
                    <td>
                      <em className={`sa-stu-status is-${s.active ? 'active' : 'muted'}`}>
                        {s.active ? (s.appliesToday ? 'Runs today' : 'Active') : 'Inactive'}
                      </em>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <p className="sa-muted">No trip schedules are linked to this route yet.</p>
          )}
        </section>
      )}

      {tab === 'students' && (
        <section className="sa-card">
          <h3>Students Assigned</h3>
          {students.length ? (
            <table className="sa-table">
              <thead>
                <tr>
                  <th>Student</th>
                  <th>Class</th>
                  <th>Admission no.</th>
                  <th>Home stop</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {students.map((s) => (
                  <tr key={s.id}>
                    <td>
                      <Link to={`/school-admin/students/${s.id}`} className="sa-stu-person">
                        {s.photoUrl ? <img src={s.photoUrl} alt="" /> : <span>{initials(s.name)}</span>}
                        <strong>{s.name}</strong>
                      </Link>
                    </td>
                    <td>{dash([s.grade, s.section].filter(Boolean).join(' '))}</td>
                    <td>{dash(s.admissionNo)}</td>
                    <td>{dash(s.homeStopName)}</td>
                    <td>
                      <em className={`sa-stu-status is-${s.active ? 'active' : 'muted'}`}>
                        {s.active ? 'Active' : 'Inactive'}
                      </em>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <p className="sa-muted">No students are assigned to this route yet.</p>
          )}
        </section>
      )}

      {tab === 'trips' && (
        <section className="sa-card">
          <div className="sa-rd-card-head">
            <h3>Trips</h3>
            <Link to="/school-admin/trip-instances" className="sa-btn sa-btn-outline">
              All trips
            </Link>
          </div>
          {data.recentTrips?.length ? (
            <table className="sa-table">
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Direction</th>
                  <th>Driver</th>
                  <th>Vehicle</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {data.recentTrips.map((t) => {
                  const meta = tripStatusMeta(t.status);
                  return (
                    <tr key={t.id}>
                      <td>{fmtDate(t.serviceDate || t.scheduledFor || t.startedAt) || '—'}</td>
                      <td>{dash(directionLabel(t.direction))}</td>
                      <td>{dash(t.driverName)}</td>
                      <td>{dash(t.busLabel)}</td>
                      <td><em className={`sa-stu-status is-${meta.key}`}>{meta.label}</em></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          ) : (
            <p className="sa-muted">No trips recorded for this route yet.</p>
          )}
        </section>
      )}

      {tab === 'map' && (
        <section className="sa-card">
          <h3>Route Map</h3>
          {stops.length ? (
            mapBlock('map-canvas sa-rd-map-lg')
          ) : (
            <p className="sa-muted">Add stops to draw this route on the map.</p>
          )}
        </section>
      )}

      <div className="sa-rd-nav">
        <span>
          {data.neighbors?.total
            ? `${(data.neighbors.index || 0) + 1} of ${data.neighbors.total}`
            : ''}
        </span>
        <div>
          <button
            type="button"
            className="sa-btn sa-btn-outline"
            disabled={!data.neighbors?.prevId}
            onClick={() => data.neighbors?.prevId && navigate(`/school-admin/routes/${data.neighbors.prevId}`)}
          >
            Previous Route
          </button>
          <button
            type="button"
            className="sa-btn sa-btn-outline"
            disabled={!data.neighbors?.nextId}
            onClick={() => data.neighbors?.nextId && navigate(`/school-admin/routes/${data.neighbors.nextId}`)}
          >
            Next Route
          </button>
        </div>
      </div>

      <footer className="sa-home-foot">
        <span>© {year} {data.schoolName || 'School'} Transport</span>
        <span>Transport Management System v1.0.0</span>
      </footer>
    </div>
  );
}
