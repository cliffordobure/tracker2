import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { api } from '../../lib/api';
import { fmtSchoolDate, fmtSchoolTime, tripStartLabel } from '../../lib/schoolTime';

const TABS = [
  { id: 'overview', label: 'Overview' },
  { id: 'schedule', label: 'Schedule' },
  { id: 'trips', label: 'Trips' },
  { id: 'documents', label: 'Documents' },
  { id: 'attendance', label: 'Attendance' },
  { id: 'incidents', label: 'Incidents' },
  { id: 'performance', label: 'Performance' },
  { id: 'notes', label: 'Notes' },
  { id: 'activity', label: 'Activity Log' },
];

function dash(value) {
  if (value == null || value === 0) return value === 0 ? '0' : '—';
  const s = String(value).trim();
  return s || '—';
}

function initials(name = '') {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return '?';
  if (parts.length === 1) return parts[0][0].toUpperCase();
  return (parts[0][0] + parts[1][0]).toUpperCase();
}

function fmtDate(value) {
  return fmtSchoolDate(value);
}

function fmtTime(value) {
  return fmtSchoolTime(value);
}

function genderLabel(value) {
  if (!value) return '';
  return value.charAt(0).toUpperCase() + value.slice(1);
}

function employeeNo(d) {
  return d?.employeeId || d?.idNumber || '';
}

function daysUntil(value) {
  if (!value) return null;
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return null;
  d.setHours(0, 0, 0, 0);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return Math.round((d.getTime() - today.getTime()) / 86400000);
}

function busOf(profile) {
  const bus = profile?.busId;
  return bus && typeof bus === 'object' ? bus : null;
}

function routeNames(profile) {
  return (profile?.assignedRouteIds || [])
    .map((r) => (typeof r === 'object' ? r.name : ''))
    .filter(Boolean);
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

function tripStatusMeta(status) {
  if (status === 'completed') return { key: 'active', label: 'Completed' };
  if (status === 'active') return { key: 'active', label: 'In progress' };
  if (status === 'scheduled') return { key: 'inactive', label: 'Scheduled' };
  if (status === 'cancelled') return { key: 'noroute', label: 'Cancelled' };
  if (status === 'mixed') return { key: 'muted', label: 'Mixed' };
  return { key: 'muted', label: 'No trips' };
}

export default function DriverDetails() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState('overview');
  const [menuOpen, setMenuOpen] = useState(false);

  const load = async () => {
    setLoading(true);
    setError('');
    try {
      setData(await api(`/admin/drivers/${id}`));
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, [id]);

  const driver = data?.driver;
  const profile = data?.profile;
  const bus = busOf(profile);
  const routes = routeNames(profile);
  const year = new Date().getFullYear();
  const statusKey = driver?.active === false ? 'inactive' : 'active';
  const statusLabel = driver?.active === false ? 'Inactive' : 'Active';
  const experience =
    driver?.yearsOfService > 0
      ? `${driver.yearsOfService} year${driver.yearsOfService === 1 ? '' : 's'}`
      : '';
  const licenseDays = daysUntil(profile?.licenseExpiry);

  const setActive = async (next) => {
    try {
      await api(`/admin/drivers/${driver.id}`, { method: 'PUT', body: { active: next } });
      setMenuOpen(false);
      await load();
    } catch (e) {
      setError(e.message);
    }
  };

  const remove = async () => {
    if (!confirm(`Remove ${driver.name}?`)) return;
    try {
      await api(`/admin/drivers/${driver.id}`, { method: 'DELETE' });
      navigate('/school-admin/drivers');
    } catch (e) {
      setError(e.message);
    }
  };

  const resetPassword = async () => {
    const password = window.prompt(`New password for ${driver.name}`);
    if (!password) return;
    try {
      await api(`/admin/drivers/${driver.id}`, { method: 'PUT', body: { password } });
      setError('');
      setMenuOpen(false);
      alert('Password updated.');
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

  if (error && !driver) return <div className="alert">{error}</div>;
  if (!driver) return <div className="sa-empty-panel"><h2>Driver not found</h2></div>;

  return (
    <div className="sa-sd sa-dd">
      {error && <div className="alert">{error}</div>}

      <div className="sa-sd-top">
        <Link to="/school-admin/drivers" className="sa-text-link">
          ← Back to Drivers
        </Link>
        <div className="sa-sd-top-actions">
          <Link to={`/school-admin/drivers?edit=${driver.id}`} className="sa-btn sa-btn-outline">
            Edit Driver
          </Link>
          <div className="sa-sd-menu-wrap">
            <button type="button" className="sa-btn sa-btn-primary" onClick={() => setMenuOpen((v) => !v)}>
              Actions ▾
            </button>
            {menuOpen && (
              <div className="sa-stu-menu sa-sd-menu">
                <button type="button" onClick={() => navigate(`/school-admin/live-tracking?driver=${driver.id}`)}>
                  Live map
                </button>
                <button type="button" onClick={() => setActive(driver.active === false)}>
                  {driver.active === false ? 'Activate' : 'Deactivate'}
                </button>
                <button type="button" onClick={resetPassword}>
                  Reset password
                </button>
                <button type="button" className="is-danger" onClick={remove}>
                  Delete
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      <section className="sa-card sa-sd-profile sa-dd-profile">
        <div className="sa-sd-identity">
          {driver.photoUrl ? <img src={driver.photoUrl} alt="" /> : <span>{initials(driver.name)}</span>}
          <div>
            <div className="sa-sd-name">
              <h2>{driver.name}</h2>
              <em className={`sa-stu-status is-${statusKey}`}>{statusLabel}</em>
              <span className="sa-role-pill">Driver</span>
            </div>
            <p className="sa-sd-meta">
              {[
                employeeNo(driver) ? `ID ${employeeNo(driver)}` : null,
                driver.createdAt ? `Joined ${fmtDate(driver.createdAt)}` : null,
              ]
                .filter(Boolean)
                .join('  ·  ') || '—'}
            </p>
            <p className="sa-sd-meta">
              {[driver.email, driver.phone].filter(Boolean).join('  ·  ') || 'No contact saved'}
            </p>
          </div>
        </div>
        <div className="sa-sd-sidebits sa-dd-bits">
          <div>
            <strong>License</strong>
            <p>{dash(profile?.licenseNumber)}</p>
            <p>
              {profile?.licenseExpiry ? (
                <>
                  Expires {fmtDate(profile.licenseExpiry)}
                  {licenseDays != null && licenseDays >= 0 ? (
                    <small className="sa-dd-days">{licenseDays === 0 ? 'Expires today' : `${licenseDays} days left`}</small>
                  ) : licenseDays != null ? (
                    <small className="sa-drv-expiry is-expired">Expired</small>
                  ) : null}
                </>
              ) : (
                'No expiry on file'
              )}
            </p>
          </div>
          <div>
            <strong>Assigned vehicle</strong>
            <p>{dash(bus?.plate || profile?.vehiclePlate)}</p>
            <p>
              {[bus?.model || profile?.vehicleModel, bus?.seats ? `${bus.seats} seats` : null]
                .filter(Boolean)
                .join(' · ') || '—'}
            </p>
          </div>
          <div>
            <strong>Assigned route</strong>
            {routes.length ? routes.map((name) => <p key={name}>{name}</p>) : <p>—</p>}
          </div>
        </div>
      </section>

      <nav className="sa-sd-tabs" aria-label="Driver sections">
        {TABS.map((t) => (
          <button key={t.id} type="button" className={tab === t.id ? 'is-active' : ''} onClick={() => setTab(t.id)}>
            {t.label}
          </button>
        ))}
      </nav>

      {tab === 'schedule' && (
        <section className="sa-card sa-sd-tab">
          <div className="sa-rd-card-head">
            <h3>Schedules</h3>
            <Link to="/school-admin/trip-instances?tab=schedules" className="sa-btn sa-btn-outline">
              Open scheduling
            </Link>
          </div>
          {data.schedules?.length ? (
            <table className="sa-table">
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Time</th>
                  <th>Route</th>
                  <th>Vehicle</th>
                </tr>
              </thead>
              <tbody>
                {data.schedules.map((s) => (
                  <tr key={s.id}>
                    <td>
                      <strong>{s.name || 'Schedule'}</strong>
                      <div className="sa-muted">
                        {[periodLabel(s.period), directionLabel(s.direction)].filter(Boolean).join(' · ') || '—'}
                      </div>
                    </td>
                    <td>{s.scheduledTime || '—'}</td>
                    <td>{s.routeName || '—'}</td>
                    <td>{s.busLabel || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <p className="sa-muted">No trip schedules are assigned to this driver.</p>
          )}
        </section>
      )}

      {tab === 'trips' && (
        <section className="sa-card sa-sd-tab">
          <div className="sa-rd-card-head">
            <h3>Trips</h3>
            <Link to="/school-admin/trip-instances" className="sa-btn sa-btn-outline">
              All trips
            </Link>
          </div>
          {data.trips?.length ? (
            <table className="sa-table">
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Route</th>
                  <th>Vehicle</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {data.trips.map((t) => {
                  const meta = tripStatusMeta(t.status);
                  return (
                    <tr key={t.id}>
                      <td>{fmtDate(t.serviceDate || t.scheduledFor || t.startedAt) || '—'}</td>
                      <td>{t.routeName || '—'}</td>
                      <td>{t.busLabel || '—'}</td>
                      <td><em className={`sa-stu-status is-${meta.key}`}>{meta.label}</em></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          ) : (
            <p className="sa-muted">No trips recorded for this driver.</p>
          )}
        </section>
      )}

      {tab === 'documents' && (
        <section className="sa-card sa-sd-tab">
          <h3>Documents</h3>
          <dl className="sa-sd-dl">
            <div><dt>License no.</dt><dd>{dash(profile?.licenseNumber)}</dd></div>
            <div><dt>License expiry</dt><dd>{dash(fmtDate(profile?.licenseExpiry))}</dd></div>
            <div>
              <dt>Profile photo</dt>
              <dd>
                {driver.photoUrl ? (
                  <a href={driver.photoUrl} target="_blank" rel="noreferrer">Open</a>
                ) : (
                  '—'
                )}
              </dd>
            </div>
          </dl>
          <p className="sa-muted">Licence files are not stored beyond the number and expiry on this profile.</p>
        </section>
      )}

      {tab === 'attendance' && (
        <section className="sa-card sa-sd-tab">
          <h3>Attendance</h3>
          <p className="sa-muted">Driver attendance is not recorded in this system. Trip days this week are shown instead.</p>
          <ul className="sa-sd-week">
            {(data.week || []).map((d) => {
              const meta = tripStatusMeta(d.status);
              return (
                <li key={d.date}>
                  <span>
                    {d.weekday}
                    <small className="sa-stu-phone">
                      {d.tripCount ? `${d.tripCount} trip${d.tripCount === 1 ? '' : 's'}` : 'No trips'}
                    </small>
                  </span>
                  <em className={`sa-stu-status is-${meta.key}`}>{meta.label}</em>
                </li>
              );
            })}
          </ul>
        </section>
      )}

      {tab === 'incidents' && (
        <section className="sa-card sa-sd-tab">
          <div className="sa-rd-card-head">
            <h3>Incidents</h3>
            <Link to="/school-admin/incidents" className="sa-btn sa-btn-outline">
              All incidents
            </Link>
          </div>
          {data.incidents?.length ? (
            <table className="sa-table">
              <thead>
                <tr>
                  <th>When</th>
                  <th>Type</th>
                  <th>Route</th>
                  <th>Details</th>
                </tr>
              </thead>
              <tbody>
                {data.incidents.map((inc) => (
                  <tr key={inc.id}>
                    <td>{fmtDate(inc.occurredAt) || '—'}</td>
                    <td>
                      {inc.type}
                      {inc.severity ? ` · ${inc.severity}` : ''}
                    </td>
                    <td>{inc.routeName || inc.tripCode || '—'}</td>
                    <td>{inc.details}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <p className="sa-muted">No incidents stored on this driver&apos;s trips.</p>
          )}
        </section>
      )}

      {tab === 'performance' && (
        <section className="sa-card sa-sd-tab">
          <h3>Trip counts (last 90 days)</h3>
          <dl className="sa-sd-dl">
            <div><dt>Total</dt><dd>{data.tripCounts?.total ?? 0}</dd></div>
            <div><dt>Completed</dt><dd>{data.tripCounts?.completed ?? 0}</dd></div>
            <div><dt>Cancelled</dt><dd>{data.tripCounts?.cancelled ?? 0}</dd></div>
            <div><dt>Scheduled</dt><dd>{data.tripCounts?.scheduled ?? 0}</dd></div>
            <div><dt>In progress</dt><dd>{data.tripCounts?.active ?? 0}</dd></div>
          </dl>
          <p className="sa-muted">Ratings and reviews are not stored.</p>
        </section>
      )}

      {tab === 'notes' && (
        <section className="sa-card sa-sd-tab">
          <h3>Notes</h3>
          {driver.aboutMe ? (
            <p className="sa-sd-remarks">{driver.aboutMe}</p>
          ) : (
            <p className="sa-muted">No notes stored on this driver profile.</p>
          )}
        </section>
      )}

      {tab === 'activity' && (
        <section className="sa-card sa-sd-tab">
          <h3>Activity log</h3>
          <ul className="sa-activity">
            <li>
              <strong>Profile updated</strong>
              <small>{fmtDate(driver.updatedAt) || '—'}</small>
            </li>
            {(data.trips || []).slice(0, 12).map((t) => (
              <li key={t.id}>
                <strong>{tripStatusMeta(t.status).label} trip</strong>
                <span>{[t.routeName, t.busLabel].filter(Boolean).join(' · ')}</span>
                <small>{fmtDate(t.serviceDate || t.scheduledFor || t.startedAt) || '—'}</small>
              </li>
            ))}
          </ul>
        </section>
      )}

      {tab === 'overview' && (
        <>
          <section className="sa-dd-grid">
            <article className="sa-card">
              <h3>Personal Information</h3>
              <dl className="sa-sd-dl">
                <div><dt>Full name</dt><dd>{dash(driver.name)}</dd></div>
                <div><dt>Date of birth</dt><dd>{dash(fmtDate(driver.dateOfBirth))}</dd></div>
                <div><dt>Gender</dt><dd>{dash(genderLabel(driver.gender))}</dd></div>
                <div><dt>Nationality</dt><dd>{dash(driver.nationality)}</dd></div>
                <div><dt>ID / Passport no.</dt><dd>{dash(driver.idNumber)}</dd></div>
                <div><dt>Phone</dt><dd>{dash(driver.phone)}</dd></div>
                <div><dt>Email</dt><dd>{dash(driver.email)}</dd></div>
              </dl>
            </article>

            <article className="sa-card">
              <h3>Employment Information</h3>
              <dl className="sa-sd-dl">
                <div><dt>Employee ID</dt><dd>{dash(employeeNo(driver))}</dd></div>
                <div><dt>Department</dt><dd>{dash(driver.department)}</dd></div>
                <div><dt>Position</dt><dd>{dash(driver.jobTitle)}</dd></div>
                <div><dt>Date of joining</dt><dd>{dash(fmtDate(driver.createdAt))}</dd></div>
                <div>
                  <dt>Status</dt>
                  <dd><span className={`sa-stu-status is-${statusKey}`}>{statusLabel}</span></dd>
                </div>
              </dl>
            </article>

            <article className="sa-card">
              <h3>Driving & Safety</h3>
              <dl className="sa-sd-dl">
                <div><dt>Years of service</dt><dd>{experience || '—'}</dd></div>
                <div><dt>License no.</dt><dd>{dash(profile?.licenseNumber)}</dd></div>
                <div><dt>License expiry</dt><dd>{dash(fmtDate(profile?.licenseExpiry))}</dd></div>
                <div><dt>Vehicle</dt><dd>{dash(bus?.plate || profile?.vehiclePlate)}</dd></div>
                <div><dt>Remarks</dt><dd>{dash(driver.aboutMe)}</dd></div>
              </dl>
            </article>

            <article className="sa-card sa-sd-actions-card">
              <h3>Quick Actions</h3>
              <div className="sa-sd-quick">
                <Link to={`/school-admin/drivers?edit=${driver.id}`}>Edit Driver Profile</Link>
                <Link to={`/school-admin/live-tracking?driver=${driver.id}`}>Live map</Link>
                <Link to={`/school-admin/drivers?edit=${driver.id}`}>Assign / Change Vehicle</Link>
                <Link to="/school-admin/trip-instances">View Trips</Link>
                <button type="button" onClick={() => setTab('schedule')}>View Schedule</button>
                <button type="button" onClick={() => setTab('documents')}>View Documents</button>
                <button type="button" onClick={() => setTab('notes')}>Add Note</button>
                <Link to={`/school-admin/messages?to=${driver.id}&kind=driver`}>Send Message</Link>
                <button
                  type="button"
                  className="is-danger"
                  onClick={() => setActive(driver.active === false)}
                >
                  {driver.active === false ? 'Activate Driver' : 'Deactivate Driver'}
                </button>
              </div>
            </article>
          </section>

          <section className="sa-dd-bottom">
            <article className="sa-card">
              <h3>Today&apos;s Schedule</h3>
              {data.todaySchedule?.length ? (
                <ul className="sa-td-sched">
                  {data.todaySchedule.map((t) => (
                    <li key={t.id}>
                      <div>
                        <strong>
                          {tripStartLabel(t) || periodLabel(t.period) || 'Trip'}
                          {t.endedAt ? ` – ${fmtTime(t.endedAt)}` : ''}
                        </strong>
                        <span>
                          {[directionLabel(t.direction), t.routeName, t.busLabel].filter(Boolean).join(' · ') || '—'}
                        </span>
                      </div>
                      {t.status === 'active' ? <em className="sa-stu-status is-active">Ongoing</em> : (
                        <em className={`sa-stu-status is-${tripStatusMeta(t.status).key}`}>
                          {tripStatusMeta(t.status).label}
                        </em>
                      )}
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="sa-muted">No trips scheduled for today.</p>
              )}
              <button type="button" className="sa-text-link" onClick={() => setTab('schedule')}>
                View full timetable
              </button>
            </article>

            <article className="sa-card">
              <h3>Recent Trips (This Week)</h3>
              <ul className="sa-sd-week">
                {(data.week || []).map((d) => {
                  const meta = tripStatusMeta(d.status);
                  return (
                    <li key={d.date}>
                      <span>
                        {d.weekday}
                        <small className="sa-stu-phone">
                          {d.tripCount ? `${d.tripCount} trip${d.tripCount === 1 ? '' : 's'}` : 'No trips'}
                        </small>
                      </span>
                      <em className={`sa-stu-status is-${meta.key}`}>{meta.label}</em>
                    </li>
                  );
                })}
              </ul>
              <Link to="/school-admin/trip-instances" className="sa-text-link">
                View trip history
              </Link>
            </article>

            <article className="sa-card">
              <h3>Attendance (This Month)</h3>
              <p className="sa-muted">Driver attendance is not recorded in this system yet.</p>
              <button type="button" className="sa-text-link" onClick={() => setTab('attendance')}>
                View attendance
              </button>
            </article>

            <article className="sa-card">
              <h3>Recent Documents</h3>
              <p className="sa-muted">No staff documents are stored for this driver yet.</p>
              <button type="button" className="sa-text-link" onClick={() => setTab('documents')}>
                Upload new document
              </button>
            </article>
          </section>
        </>
      )}

      <footer className="sa-home-foot">
        <span>© {year} {data.schoolName || 'School'} Transport</span>
        <span>Transport Management System v1.0.0</span>
      </footer>
    </div>
  );
}
