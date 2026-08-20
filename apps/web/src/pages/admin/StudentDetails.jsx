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

function tripEventLabel(type) {
  if (type === 'picked_up') return 'Picked up';
  if (type === 'dropped_off') return 'Dropped off';
  if (type === 'not_picked_up') return 'Not picked up';
  return type || 'Trip event';
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

export default function StudentDetails() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState('overview');
  const [menuOpen, setMenuOpen] = useState(false);
  const [noteForm, setNoteForm] = useState({ title: '', body: '', category: 'general' });
  const [savingNote, setSavingNote] = useState(false);

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

  const saveNote = async (e) => {
    e.preventDefault();
    setSavingNote(true);
    setError('');
    try {
      await api(`/admin/kids/${kid._id}/notes`, { method: 'POST', body: noteForm });
      setNoteForm({ title: '', body: '', category: 'general' });
      await load();
    } catch (err) {
      setError(err.message);
    } finally {
      setSavingNote(false);
    }
  };

  const activity = useMemo(() => {
    const items = [];
    for (const ev of data?.tripEvents || []) {
      items.push({
        at: ev.at,
        title: tripEventLabel(ev.type),
        detail: [ev.routeName, ev.busLabel].filter(Boolean).join(' · '),
      });
    }
    for (const m of data?.attendanceHistory || []) {
      items.push({
        at: m.date,
        title: `Register: ${attendLabel(m.status)}`,
        detail: [m.teacherName, m.note].filter(Boolean).join(' · '),
      });
    }
    for (const n of data?.notes || []) {
      items.push({
        at: n.at,
        title: n.title || 'Note',
        detail: [n.author, n.category].filter(Boolean).join(' · '),
      });
    }
    items.sort((a, b) => new Date(b.at || 0) - new Date(a.at || 0));
    return items;
  }, [data]);

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

      {tab === 'transport' && (
        <section className="sa-card sa-sd-tab">
          <h3>Transport</h3>
          <dl className="sa-sd-dl">
            <div><dt>Route</dt><dd>{dash(data.transport?.routeName)}</dd></div>
            <div><dt>Bus</dt><dd>{dash(data.transport?.busLabel)}</dd></div>
            <div><dt>Driver</dt><dd>{dash(data.transport?.driverName)}</dd></div>
            <div>
              <dt>Pick up</dt>
              <dd>
                {dash(data.transport?.pickupStop)}
                {data.transport?.pickupTime ? <small>Scheduled {data.transport.pickupTime}</small> : null}
              </dd>
            </div>
            <div>
              <dt>Drop off</dt>
              <dd>
                {dash(data.transport?.dropoffStop)}
                {data.transport?.dropoffTime ? <small>Scheduled {data.transport.dropoffTime}</small> : null}
              </dd>
            </div>
          </dl>
          <h3>Pickup history</h3>
          {data.tripEvents?.length ? (
            <table className="sa-table">
              <thead>
                <tr>
                  <th>When</th>
                  <th>Event</th>
                  <th>Route</th>
                  <th>Bus</th>
                </tr>
              </thead>
              <tbody>
                {data.tripEvents.map((ev) => (
                  <tr key={ev.id}>
                    <td>{fmtStamp(ev.at)}</td>
                    <td>{tripEventLabel(ev.type)}</td>
                    <td>{dash(ev.routeName)}</td>
                    <td>{dash(ev.busLabel)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <p className="sa-muted">No pickup or drop-off events stored for this student.</p>
          )}
          <Link to="/school-admin/routes" className="sa-text-link">View routes</Link>
        </section>
      )}

      {tab === 'attendance' && (
        <section className="sa-card sa-sd-tab">
          <div className="sa-rd-card-head">
            <h3>Attendance</h3>
            <Link to="/school-admin/attendance" className="sa-btn sa-btn-outline">
              Class register
            </Link>
          </div>
          {data.attendanceHistory?.length ? (
            <table className="sa-table">
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Status</th>
                  <th>Marked by</th>
                  <th>Note</th>
                </tr>
              </thead>
              <tbody>
                {data.attendanceHistory.map((m) => (
                  <tr key={m.id}>
                    <td>{fmtDate(m.date) || '—'}</td>
                    <td>
                      <em className={`sa-stu-status is-${m.status === 'present' ? 'active' : m.status === 'absent' ? 'noroute' : 'inactive'}`}>
                        {attendLabel(m.status)}
                      </em>
                    </td>
                    <td>{dash(m.teacherName)}</td>
                    <td>{dash(m.note)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <p className="sa-muted">No class register marks stored for this student.</p>
          )}
        </section>
      )}

      {tab === 'payments' && (
        <section className="sa-card sa-sd-tab">
          <h3>Payments</h3>
          {data.fee ? (
            <>
              <dl className="sa-sd-dl">
                <div><dt>Term</dt><dd>{dash(data.fee.termLabel)}</dd></div>
                <div><dt>Year</dt><dd>{dash(data.fee.year)}</dd></div>
                <div><dt>Billed</dt><dd>{money(data.fee.billed)}</dd></div>
                <div><dt>Paid</dt><dd>{money(data.fee.paid)}</dd></div>
                <div><dt>Balance</dt><dd>{money(data.fee.balance)}</dd></div>
                <div><dt>Next due</dt><dd>{dash(fmtDate(data.fee.nextDueDate))}</dd></div>
              </dl>
              {data.fee.note ? <p className="sa-sd-remarks">{data.fee.note}</p> : null}
              {data.fee.lines?.length ? (
                <table className="sa-table">
                  <thead>
                    <tr>
                      <th>Item</th>
                      <th>Total</th>
                      <th>Paid</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.fee.lines.map((line, i) => (
                      <tr key={`${line.description}-${i}`}>
                        <td>{line.description}</td>
                        <td>{money(line.total)}</td>
                        <td>{money(line.paid)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              ) : null}
              {data.fee.payments?.length ? (
                <ul className="sa-sd-pays">
                  {data.fee.payments.map((p) => (
                    <li key={p._id}>
                      <div>
                        <strong>{p.description}</strong>
                        <span>{fmtDate(p.at)}{p.method ? ` · ${p.method}` : ''}{p.reference ? ` · ${p.reference}` : ''}</span>
                      </div>
                      <em className="sa-stu-status is-active">Paid {money(p.amount)}</em>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="sa-muted">No payment rows stored on this statement.</p>
              )}
            </>
          ) : (
            <p className="sa-muted">No fee statement is stored for this student.</p>
          )}
        </section>
      )}

      {tab === 'documents' && (
        <section className="sa-card sa-sd-tab">
          <h3>Documents</h3>
          {kid.documents?.length ? (
            <table className="sa-table">
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Kind</th>
                  <th>Type</th>
                </tr>
              </thead>
              <tbody>
                {kid.documents.map((doc, i) => (
                  <tr key={doc.publicId || doc.url || i}>
                    <td>
                      {doc.url ? (
                        <a href={doc.url} target="_blank" rel="noreferrer">
                          {doc.originalName || 'Document'}
                        </a>
                      ) : (
                        dash(doc.originalName)
                      )}
                    </td>
                    <td>{dash(doc.kind)}</td>
                    <td>{dash(doc.mimeType)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <p className="sa-muted">No documents are stored on this student record.</p>
          )}
        </section>
      )}

      {tab === 'health' && (
        <section className="sa-card sa-sd-tab">
          <h3>Health</h3>
          <dl className="sa-sd-dl">
            <div><dt>Blood group</dt><dd>{dash(kid.bloodGroup)}</dd></div>
            <div><dt>Allergies</dt><dd>{dash(kid.allergies)}</dd></div>
            <div><dt>Conditions</dt><dd>{dash(kid.health?.conditions)}</dd></div>
            <div><dt>Medication</dt><dd>{dash(kid.health?.medication)}</dd></div>
            <div><dt>Doctor</dt><dd>{dash(kid.health?.doctor)}</dd></div>
            <div><dt>Hospital</dt><dd>{dash(kid.health?.hospital)}</dd></div>
            <div><dt>Insurance</dt><dd>{dash(kid.health?.insurance)}</dd></div>
            <div><dt>Policy no.</dt><dd>{dash(kid.health?.policyNumber)}</dd></div>
          </dl>
          {kid.health?.notes ? <p className="sa-sd-remarks">{kid.health.notes}</p> : null}
          {kid.health?.immunizations?.length ? (
            <table className="sa-table">
              <thead>
                <tr>
                  <th>Immunization</th>
                  <th>Date</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {kid.health.immunizations.map((shot, i) => (
                  <tr key={`${shot.name}-${i}`}>
                    <td>{shot.name}</td>
                    <td>{dash(fmtDate(shot.date))}</td>
                    <td>{dash(shot.status)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <p className="sa-muted">No immunizations stored.</p>
          )}
        </section>
      )}

      {tab === 'notes' && (
        <section className="sa-card sa-sd-tab">
          <h3>Notes</h3>
          <form className="sa-note-form" onSubmit={saveNote}>
            <label>
              Title
              <input
                required
                value={noteForm.title}
                onChange={(e) => setNoteForm({ ...noteForm, title: e.target.value })}
              />
            </label>
            <label>
              Category
              <select
                value={noteForm.category}
                onChange={(e) => setNoteForm({ ...noteForm, category: e.target.value })}
              >
                <option value="general">General</option>
                <option value="academic">Academic</option>
                <option value="behaviour">Behaviour</option>
                <option value="health">Health</option>
                <option value="urgent">Urgent</option>
              </select>
            </label>
            <label>
              Note
              <textarea
                required
                rows={3}
                value={noteForm.body}
                onChange={(e) => setNoteForm({ ...noteForm, body: e.target.value })}
              />
            </label>
            <button className="sa-btn sa-btn-primary" type="submit" disabled={savingNote}>
              {savingNote ? 'Saving…' : 'Add note'}
            </button>
          </form>
          {kid.about ? <p className="sa-sd-remarks">{kid.about}</p> : null}
          {data.notes?.length ? (
            <ul className="sa-sd-notes-list">
              {data.notes.map((n) => (
                <li key={n._id}>
                  <strong>{n.title}</strong>
                  <span>{n.body}</span>
                  <small>{[n.author, n.category, fmtDate(n.at)].filter(Boolean).join(' · ')}</small>
                </li>
              ))}
            </ul>
          ) : !kid.about ? (
            <p className="sa-muted">No notes stored yet.</p>
          ) : null}
        </section>
      )}

      {tab === 'activity' && (
        <section className="sa-card sa-sd-tab">
          <h3>Activity log</h3>
          {activity.length ? (
            <ul className="sa-activity">
              {activity.map((item, i) => (
                <li key={`${item.at}-${i}`}>
                  <strong>{item.title}</strong>
                  {item.detail ? <span>{item.detail}</span> : null}
                  <small>{fmtStamp(item.at)}</small>
                </li>
              ))}
            </ul>
          ) : (
            <p className="sa-muted">No trip events, register marks, or notes stored yet.</p>
          )}
        </section>
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
