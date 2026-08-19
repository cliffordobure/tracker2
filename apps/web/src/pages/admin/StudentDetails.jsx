import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { api } from '../../lib/api';

const TABS = [
  { id: 'overview', label: 'Overview' },
  { id: 'transport', label: 'Transport' },
  { id: 'attendance', label: 'Attendance' },
  { id: 'payments', label: 'Payments' },
  { id: 'documents', label: 'Documents' },
  { id: 'health', label: 'Health' },
  { id: 'notes', label: 'Notes' },
  { id: 'activity', label: 'Activity Log' },
];

const TAB_COPY = {
  transport: 'Full transport history for this student will be added here.',
  attendance: 'A full attendance register will sit on this tab.',
  payments: 'Fee statements and payment history will be managed here.',
  documents: 'Student documents will be uploaded and reviewed here.',
  health: 'Health records will be expanded on this tab.',
  notes: 'Staff notes and follow-ups will live here.',
  activity: 'An activity log of changes and trip events is coming next.',
};

function dash(value) {
  if (value == null) return '—';
  const s = String(value).trim();
  return s || '—';
}

function initials(name = '') {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return '?';
  if (parts.length === 1) return parts[0][0].toUpperCase();
  return (parts[0][0] + parts[1][0]).toUpperCase();
}

function ageYears(dob) {
  if (!dob) return null;
  const d = new Date(dob);
  if (Number.isNaN(d.getTime())) return null;
  const now = new Date();
  let age = now.getFullYear() - d.getFullYear();
  const m = now.getMonth() - d.getMonth();
  if (m < 0 || (m === 0 && now.getDate() < d.getDate())) age -= 1;
  return age >= 0 ? age : null;
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
  return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

function genderLabel(value) {
  if (!value) return '';
  return value.charAt(0).toUpperCase() + value.slice(1);
}

function classLabel(kid) {
  return [kid?.grade, kid?.section].filter(Boolean).join(' ');
}

function studentStatus(kid) {
  if (kid?.active === false) return { key: 'inactive', label: 'Inactive' };
  if (!kid?.routeId) return { key: 'noroute', label: 'No Route' };
  return { key: 'active', label: 'Active' };
}

function todayLabel(status) {
  switch (status) {
    case 'checked_in':
      return { title: 'Checked In', tone: 'good' };
    case 'dropped_off':
      return { title: 'Dropped Off', tone: 'info' };
    case 'missed':
      return { title: 'Not Picked Up', tone: 'bad' };
    case 'in_progress':
      return { title: 'Trip In Progress', tone: 'warn' };
    case 'pending':
      return { title: 'Trip Scheduled', tone: 'warn' };
    default:
      return { title: 'No Trip Today', tone: 'muted' };
  }
}

function attendLabel(status) {
  if (status === 'present') return 'Present';
  if (status === 'absent') return 'Absent';
  if (status === 'late') return 'Late';
  if (status === 'excused') return 'Excused';
  return 'No record';
}

function money(amount) {
  const n = Number(amount);
  if (!Number.isFinite(n)) return '—';
  return `KES ${n.toLocaleString()}`;
}

export default function StudentDetails() {
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
      const d = await api(`/admin/kids/${id}`);
      setData(d);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, [id]);

  const kid = data?.kid;
  const parent = kid?.parentIds?.[0];
  const status = studentStatus(kid);
  const age = ageYears(kid?.dateOfBirth);
  const address = kid?.homeStopId?.address || kid?.schoolAddress || kid?.schoolId?.address || '';
  const today = todayLabel(data?.today?.status);
  const year = new Date().getFullYear();

  const headerBits = useMemo(() => {
    if (!kid) return [];
    return [
      kid.admissionNo ? `ID ${kid.admissionNo}` : null,
      classLabel(kid) ? `Grade ${classLabel(kid)}` : null,
      age != null ? `Age ${age} years` : null,
      genderLabel(kid.gender),
      kid.dateOfBirth ? `DOB ${fmtDate(kid.dateOfBirth)}` : null,
      kid.bloodGroup ? `Blood ${kid.bloodGroup}` : null,
    ].filter(Boolean);
  }, [kid, age]);

  const setActive = async (next) => {
    try {
      await api(`/admin/kids/${kid._id}`, { method: 'PUT', body: { active: next } });
      setMenuOpen(false);
      await load();
    } catch (e) {
      setError(e.message);
    }
  };

  const remove = async () => {
    if (!confirm(`Remove ${kid.name}?`)) return;
    try {
      await api(`/admin/kids/${kid._id}`, { method: 'DELETE' });
      navigate('/school-admin/students');
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

  if (error && !kid) return <div className="alert">{error}</div>;
  if (!kid) return <div className="sa-empty-panel"><h2>Student not found</h2></div>;

  return (
    <div className="sa-sd">
      {error && <div className="alert">{error}</div>}

      <div className="sa-sd-top">
        <Link to="/school-admin/students" className="sa-text-link">
          ← Back to Students
        </Link>
        <div className="sa-sd-top-actions">
          <Link to={`/school-admin/students?edit=${kid._id}`} className="sa-btn sa-btn-outline">
            Edit Student
          </Link>
          <div className="sa-sd-menu-wrap">
            <button type="button" className="sa-btn sa-btn-primary" onClick={() => setMenuOpen((v) => !v)}>
              Actions ▾
            </button>
            {menuOpen && (
              <div className="sa-stu-menu sa-sd-menu">
                <button type="button" onClick={() => setActive(kid.active === false)}>
                  {kid.active === false ? 'Activate' : 'Deactivate'}
                </button>
                <button type="button" className="is-danger" onClick={remove}>
                  Delete
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      <section className="sa-card sa-sd-profile">
        <div className="sa-sd-identity">
          {kid.photoUrl ? <img src={kid.photoUrl} alt="" /> : <span>{initials(kid.name)}</span>}
          <div>
            <div className="sa-sd-name">
              <h2>{kid.name}</h2>
              <em className={`sa-stu-status is-${status.key}`}>{status.label}</em>
            </div>
            {headerBits.length ? <p className="sa-sd-meta">{headerBits.join('  ·  ')}</p> : null}
          </div>
        </div>
        <div className="sa-sd-sidebits">
          <div>
            <strong>Parent / Guardian</strong>
            {parent ? (
              <>
                <p>{parent.name}</p>
                {parent.phone ? <p>{parent.phone}</p> : null}
                {parent.email ? <p>{parent.email}</p> : null}
              </>
            ) : (
              <p className="sa-muted">No parent linked</p>
            )}
          </div>
          <div>
            <strong>Address</strong>
            {address ? <p className="sa-sd-address">{address}</p> : <p className="sa-muted">No address saved</p>}
          </div>
        </div>
      </section>

      <nav className="sa-sd-tabs" aria-label="Student sections">
        {TABS.map((t) => (
          <button key={t.id} type="button" className={tab === t.id ? 'is-active' : ''} onClick={() => setTab(t.id)}>
            {t.label}
          </button>
        ))}
      </nav>

      {tab !== 'overview' && (
        <div className="sa-empty-panel">
          <div className="sa-empty-icon" aria-hidden="true">◈</div>
          <h2>Coming Soon</h2>
          <p>{TAB_COPY[tab]}</p>
        </div>
      )}

      {tab === 'overview' && (
        <>
          <section className="sa-sd-grid">
            <article className="sa-card">
              <h3>Personal Information</h3>
              <dl className="sa-sd-dl">
                <div><dt>Admission No</dt><dd>{dash(kid.admissionNo)}</dd></div>
                <div><dt>Year of admission</dt><dd>{dash(kid.yearOfAdmission)}</dd></div>
                <div><dt>Blood group</dt><dd>{dash(kid.bloodGroup)}</dd></div>
                <div><dt>Allergies</dt><dd>{dash(kid.allergies)}</dd></div>
                <div><dt>Medical conditions</dt><dd>{dash(kid.health?.conditions)}</dd></div>
                <div>
                  <dt>Emergency contact</dt>
                  <dd>
                    {(kid.parentIds || []).filter((p) => p.phone).length
                      ? (kid.parentIds || []).filter((p) => p.phone).map((p) => (
                          <span key={p._id || p.phone} className="sa-sd-stack">
                            {p.name} · {p.phone}
                          </span>
                        ))
                      : '—'}
                  </dd>
                </div>
              </dl>
            </article>

            <article className="sa-card">
              <h3>Academic Information</h3>
              <dl className="sa-sd-dl">
                <div><dt>Class</dt><dd>{dash(classLabel(kid))}</dd></div>
                <div><dt>Class teacher</dt><dd>{dash(data.classTeacher)}</dd></div>
                <div><dt>Roll number</dt><dd>{dash(kid.rollNo)}</dd></div>
                <div><dt>Academic year</dt><dd>{dash(kid.academicYear)}</dd></div>
                <div><dt>Term</dt><dd>{dash(kid.term)}</dd></div>
                <div><dt>House / stream</dt><dd>{dash([kid.house, kid.stream].filter(Boolean).join(' · '))}</dd></div>
              </dl>
              {kid.about ? <p className="sa-sd-remarks">{kid.about}</p> : null}
            </article>

            <article className="sa-card">
              <h3>Transport Information</h3>
              <dl className="sa-sd-dl">
                <div><dt>Route</dt><dd>{dash(data.transport?.routeName)}</dd></div>
                <div><dt>Bus</dt><dd>{dash(data.transport?.busLabel)}</dd></div>
                <div><dt>Driver</dt><dd>{dash(data.transport?.driverName)}</dd></div>
                <div><dt>Pick up</dt><dd>{dash(data.transport?.pickupStop)}{data.transport?.pickupTime ? <small>Scheduled {data.transport.pickupTime}</small> : null}</dd></div>
                <div><dt>Drop off</dt><dd>{dash(data.transport?.dropoffStop)}{data.transport?.dropoffTime ? <small>Scheduled {data.transport.dropoffTime}</small> : null}</dd></div>
              </dl>
              <Link to="/school-admin/routes" className="sa-text-link">View routes</Link>
            </article>

            <article className="sa-card sa-sd-actions-card">
              <h3>Quick Actions</h3>
              <div className="sa-sd-quick">
                <Link to={`/school-admin/students?edit=${kid._id}`}>Edit Student</Link>
                <Link to={`/school-admin/students?edit=${kid._id}`}>Assign / Change Route</Link>
                <button type="button" onClick={() => setTab('attendance')}>View Attendance</button>
                <button type="button" onClick={() => setTab('payments')}>View Payments</button>
                <button type="button" onClick={() => setTab('documents')}>Upload Document</button>
                <button type="button" onClick={() => setTab('notes')}>Add Note</button>
              </div>
            </article>
          </section>

          <section className="sa-sd-bottom">
            <article className="sa-card">
              <h3>Today&apos;s Transport Status</h3>
              <div className={`sa-sd-today tone-${today.tone}`}>
                <strong>{today.title}</strong>
                {data.today?.at ? <p>{fmtTime(data.today.at)}{data.today.stopName ? ` · ${data.today.stopName}` : ''}</p> : null}
                {!data.today?.at && data.today?.status === 'none' ? <p>This student is not on a trip today.</p> : null}
              </div>
              {data.today?.tripActive ? (
                <Link to="/school-admin/live-tracking" className="sa-btn sa-btn-outline">
                  View Live Tracking
                </Link>
              ) : (
                <Link to="/school-admin/trip-instances" className="sa-text-link">
                  View trips
                </Link>
              )}
            </article>

            <article className="sa-card">
              <h3>Recent Attendance</h3>
              <ul className="sa-sd-week">
                {(data.attendance || []).map((d) => (
                  <li key={d.date}>
                    <span>{d.weekday}</span>
                    <em className={`sa-stu-status is-${d.status === 'present' ? 'active' : d.status === 'absent' ? 'noroute' : d.status ? 'inactive' : 'muted'}`}>
                      {attendLabel(d.status)}
                    </em>
                  </li>
                ))}
              </ul>
              <button type="button" className="sa-text-link" onClick={() => setTab('attendance')}>
                View all
              </button>
            </article>

            <article className="sa-card">
              <h3>Recent Payments</h3>
              {data.payments?.length ? (
                <ul className="sa-sd-pays">
                  {data.payments.map((p) => (
                    <li key={p._id}>
                      <div>
                        <strong>{p.description}</strong>
                        <span>{fmtDate(p.at)}{p.method ? ` · ${p.method}` : ''}</span>
                      </div>
                      <em className="sa-stu-status is-active">Paid {money(p.amount)}</em>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="sa-muted">No payments recorded for this student.</p>
              )}
              <button type="button" className="sa-text-link" onClick={() => setTab('payments')}>
                View payment history
              </button>
            </article>

            <article className="sa-card sa-sd-notes">
              <h3>Important Notes</h3>
              {kid.about ? <p>{kid.about}</p> : null}
              {data.notes?.length ? (
                <ul>
                  {data.notes.map((n) => (
                    <li key={n._id}>
                      <strong>{n.title}</strong>
                      <span>{n.body}</span>
                      <small>{[n.author, fmtDate(n.at)].filter(Boolean).join(' · ')}</small>
                    </li>
                  ))}
                </ul>
              ) : !kid.about ? (
                <p className="sa-muted">No notes yet.</p>
              ) : null}
            </article>

            <article className="sa-card sa-sd-emerg">
              <h3>Emergency Contact</h3>
              {(kid.parentIds || []).length ? (
                <ul>
                  {(kid.parentIds || []).map((p) => (
                    <li key={p._id || p.email}>
                      <strong>{p.name}</strong>
                      <span>{p.phone || 'No phone saved'}</span>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="sa-muted">No parent contacts saved.</p>
              )}
            </article>
          </section>
        </>
      )}

      <footer className="sa-home-foot">
        <span>© {year} {kid.schoolId?.name || 'School'} Transport</span>
        <span>Transport Management System v1.0.0</span>
      </footer>
    </div>
  );
}
