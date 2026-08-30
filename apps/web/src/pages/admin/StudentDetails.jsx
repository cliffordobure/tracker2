import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { api } from '../../lib/api';

const TABS = [
  { id: 'overview', label: 'Overview', icon: 'home' },
  { id: 'transport', label: 'Transport', icon: 'bus' },
  { id: 'attendance', label: 'Attendance', icon: 'check' },
  { id: 'payments', label: 'Payments', icon: 'card' },
  { id: 'documents', label: 'Documents', icon: 'file' },
  { id: 'health', label: 'Health', icon: 'heart' },
  { id: 'notes', label: 'Notes', icon: 'note' },
  { id: 'activity', label: 'Activity Log', icon: 'clock' },
];

function TabIcon({ name }) {
  const p = { width: 13, height: 13, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 1.8, strokeLinecap: 'round', strokeLinejoin: 'round' };
  if (name === 'bus') return <svg {...p}><rect x="4" y="5" width="16" height="12" rx="2" /><path d="M4 12h16M8 17v2M16 17v2" /></svg>;
  if (name === 'check') return <svg {...p}><circle cx="12" cy="12" r="8" /><path d="m8.5 12.2 2.4 2.4 4.6-5" /></svg>;
  if (name === 'card') return <svg {...p}><rect x="3.5" y="6" width="17" height="12" rx="2" /><path d="M3.5 10h17" /></svg>;
  if (name === 'file') return <svg {...p}><path d="M7 4h7l5 5v11H7z" /><path d="M14 4v5h5" /></svg>;
  if (name === 'heart') return <svg {...p}><path d="M12 20s-7-4.4-7-10a4 4 0 0 1 7-2 4 4 0 0 1 7 2c0 5.6-7 10-7 10z" /></svg>;
  if (name === 'note') return <svg {...p}><path d="M8 4h8a2 2 0 0 1 2 2v14l-6-3-6 3V6a2 2 0 0 1 2-2z" /></svg>;
  if (name === 'clock') return <svg {...p}><circle cx="12" cy="12" r="8" /><path d="M12 8v4.2l2.4 1.6" /></svg>;
  return <svg {...p}><rect x="4" y="4" width="16" height="16" rx="2" /><path d="M8 10h8M8 14h5" /></svg>;
}

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

function blankFeeForm(fee) {
  return {
    termLabel: fee?.termLabel || '',
    nextDueDate: fee?.nextDueDate ? String(fee.nextDueDate).slice(0, 10) : '',
    note: fee?.note || '',
    statementUrl: fee?.statementUrl || '',
    lines: fee?.lines?.length
      ? fee.lines.map((line) => ({
          description: line.description || '',
          total: line.total ?? '',
          paid: line.paid ?? '',
        }))
      : [{ description: '', total: '', paid: '' }],
  };
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
  const [feeForm, setFeeForm] = useState(null);
  const [savingFee, setSavingFee] = useState(false);
  const [payOpen, setPayOpen] = useState(false);

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

  useEffect(() => {
    setFeeForm(blankFeeForm(data?.fee));
  }, [data?.fee]);

  const openPayModal = () => {
    setFeeForm(blankFeeForm(data?.fee));
    setError('');
    setPayOpen(true);
  };

  const closePayModal = () => {
    if (savingFee) return;
    setPayOpen(false);
    setFeeForm(blankFeeForm(data?.fee));
  };

  const patchFeeLine = (i, key, value) => {
    setFeeForm((f) => ({
      ...f,
      lines: f.lines.map((row, idx) => (idx === i ? { ...row, [key]: value } : row)),
    }));
  };

  const saveFeeStatement = async (e) => {
    e.preventDefault();
    if (!feeForm) return;
    if (!String(feeForm.termLabel || '').trim()) {
      setError('Term label is required.');
      return;
    }
    if (!feeForm.nextDueDate) {
      setError('Next due date is required.');
      return;
    }
    const lines = feeForm.lines
      .filter((line) => String(line.description || '').trim())
      .map((line) => ({
        description: line.description,
        total: Number(line.total) || 0,
        paid: Number(line.paid) || 0,
      }));
    if (!lines.length) {
      setError('Add at least one fee line with a description.');
      return;
    }
    setSavingFee(true);
    setError('');
    try {
      const res = await api(`/admin/kids/${id}/fee-statement`, {
        method: 'PUT',
        body: {
          termLabel: feeForm.termLabel,
          nextDueDate: feeForm.nextDueDate || null,
          note: feeForm.note,
          statementUrl: feeForm.statementUrl,
          lines,
          payments: (data?.fee?.payments || []).map((p) => ({
            at: p.at,
            description: p.description,
            method: p.method,
            amount: p.amount,
            reference: p.reference,
          })),
          upcoming: data?.fee?.upcoming || [],
        },
      });
      setData((prev) => (prev ? { ...prev, fee: res.fee } : prev));
      setPayOpen(false);
    } catch (err) {
      setError(err.message);
    } finally {
      setSavingFee(false);
    }
  };

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
      {error && !payOpen && <div className="alert">{error}</div>}

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
                  <i aria-hidden="true">
                    {kid.active === false ? (
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="8" /><path d="m9 12 2.2 2.2L15.5 10" /></svg>
                    ) : (
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="8" /><path d="M10 9v6M14 9v6" /></svg>
                    )}
                  </i>
                  {kid.active === false ? 'Activate' : 'Deactivate'}
                </button>
                <span className="sa-stu-menu-sep" />
                <button type="button" className="is-danger" onClick={remove}>
                  <i aria-hidden="true">
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M5 7h14M10 7V5h4v2M8 7l.7 12h6.6L16 7" /></svg>
                  </i>
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
              <span className="sa-role-pill">Student</span>
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
            <TabIcon name={t.icon} />
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
        <section className="sa-card sa-sd-tab sa-pay-tab">
          <header className="sa-pay-tab-head">
            <div>
              <h3>Payments</h3>
              <p>{data.fee ? dash(data.fee.termLabel) : 'No fee statement published yet.'}</p>
            </div>
            <button type="button" className="sa-btn sa-btn-primary" onClick={openPayModal}>
              {data.fee ? 'Edit payment details' : 'Add payment details'}
            </button>
          </header>

          {data.fee ? (
            <>
              <div className="sa-pay-summary">
                <article>
                  <span>Billed</span>
                  <strong>{money(data.fee.billed)}</strong>
                </article>
                <article>
                  <span>Paid</span>
                  <strong>{money(data.fee.paid)}</strong>
                </article>
                <article>
                  <span>Balance</span>
                  <strong>{money(data.fee.balance)}</strong>
                </article>
                <article>
                  <span>Next due</span>
                  <strong>{dash(fmtDate(data.fee.nextDueDate))}</strong>
                </article>
              </div>
              {data.fee.note ? <p className="sa-sd-remarks">{data.fee.note}</p> : null}
              {data.fee.statementUrl ? (
                <a className="sa-text-link" href={data.fee.statementUrl} target="_blank" rel="noreferrer">
                  Open statement PDF
                </a>
              ) : null}
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
            <div className="sa-pay-empty">
              <i aria-hidden="true">
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
                  <rect x="3.5" y="6" width="17" height="12" rx="2" />
                  <path d="M3.5 10h17" />
                </svg>
              </i>
              <strong>No fee statement published yet</strong>
              <p>Create one for this student so parents can see billed, paid, and balance.</p>
              <button type="button" className="sa-btn sa-btn-primary" onClick={openPayModal}>
                Add payment details
              </button>
            </div>
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
          <section className="sa-sd-overview-grid">
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
          </section>

          <section className="sa-card">
            <div className="sa-rd-card-head">
              <h3>Recent Activity</h3>
              <button type="button" className="sa-btn sa-btn-outline" onClick={() => setTab('activity')}>View all activity</button>
            </div>
            {activity.length ? (
              <ul className="sa-sd-activity-row">
                {activity.slice(0, 4).map((item, i) => (
                  <li key={`${item.at}-${i}`}>
                    <i className={`sa-sd-act-icon ${i % 4 === 0 ? 'is-green' : i % 4 === 1 ? 'is-blue' : i % 4 === 2 ? 'is-orange' : 'is-purple'}`} aria-hidden="true" />
                    <strong>{item.title}</strong>
                    <small>{fmtDate(item.at)}{item.detail ? ` · ${item.detail}` : ''}</small>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="sa-muted">No recent activity yet.</p>
            )}
          </section>

          <section className="sa-sd-grid">
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

      {payOpen && feeForm && (
        <div className="sa-action-overlay" onClick={closePayModal} role="presentation">
          <aside className="sa-action-modal sa-pay-modal" aria-label="Payments" onClick={(e) => e.stopPropagation()}>
            <header className="sa-stop-detail-bar">
              <h2>Payments</h2>
              <button type="button" className="sa-icon-ghost" aria-label="Close" onClick={closePayModal}>×</button>
            </header>
            <form className="sa-pay-form" onSubmit={saveFeeStatement}>
              {error ? <div className="alert">{error}</div> : null}
              <div className="sa-pay-grid">
                <label className="sa-field">
                  <span>Term label <em>*</em></span>
                  <input
                    required
                    value={feeForm.termLabel}
                    onChange={(e) => setFeeForm((f) => ({ ...f, termLabel: e.target.value }))}
                    placeholder="e.g. Term 2 2025"
                  />
                </label>
                <label className="sa-field">
                  <span>Next due date <em>*</em></span>
                  <input
                    required
                    type="date"
                    value={feeForm.nextDueDate}
                    onChange={(e) => setFeeForm((f) => ({ ...f, nextDueDate: e.target.value }))}
                  />
                </label>
              </div>

              <div className="sa-pay-lines">
                <div className="sa-pay-lines-head">
                  <span>Description <em>*</em></span>
                  <span>Total (KES) <em>*</em></span>
                  <span>Paid (KES)</span>
                  <span>Actions</span>
                </div>
                {feeForm.lines.map((line, i) => (
                  <div key={`fee-line-${i}`} className="sa-pay-line">
                    <input
                      value={line.description}
                      onChange={(e) => patchFeeLine(i, 'description', e.target.value)}
                      placeholder="e.g. Tuition Fees"
                    />
                    <input
                      type="number"
                      min="0"
                      value={line.total}
                      onChange={(e) => patchFeeLine(i, 'total', e.target.value)}
                      placeholder="e.g. 10000"
                    />
                    <input
                      type="number"
                      min="0"
                      value={line.paid}
                      onChange={(e) => patchFeeLine(i, 'paid', e.target.value)}
                      placeholder="e.g. 2500"
                    />
                    <button
                      type="button"
                      className="sa-pay-trash"
                      aria-label="Remove fee line"
                      disabled={feeForm.lines.length === 1}
                      onClick={() =>
                        setFeeForm((f) => ({
                          ...f,
                          lines: f.lines.filter((_, idx) => idx !== i),
                        }))
                      }
                    >
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
                        <path d="M5 7h14M10 7V5h4v2M8 7l.7 12h6.6L16 7" />
                      </svg>
                    </button>
                  </div>
                ))}
                <button
                  type="button"
                  className="sa-pay-add"
                  onClick={() =>
                    setFeeForm((f) => ({
                      ...f,
                      lines: [...f.lines, { description: '', total: '', paid: '' }],
                    }))
                  }
                >
                  + Add fee line
                </button>
              </div>

              <label className="sa-field">
                <span>Note for parents</span>
                <textarea
                  rows={3}
                  value={feeForm.note}
                  onChange={(e) => setFeeForm((f) => ({ ...f, note: e.target.value }))}
                  placeholder="Add a note for parents..."
                />
              </label>

              <label className="sa-field">
                <span>Statement PDF URL (optional)</span>
                <span className="sa-pay-url">
                  <i aria-hidden="true">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
                      <path d="M10 13a5 5 0 0 0 7.1 0l2.1-2.1a5 5 0 0 0-7.1-7.1L10.6 5.3" />
                      <path d="M14 11a5 5 0 0 0-7.1 0L4.8 13.1a5 5 0 0 0 7.1 7.1l1.5-1.5" />
                    </svg>
                  </i>
                  <input
                    value={feeForm.statementUrl}
                    onChange={(e) => setFeeForm((f) => ({ ...f, statementUrl: e.target.value }))}
                    placeholder="https://..."
                  />
                </span>
              </label>

              {!data.fee ? (
                <div className="sa-pay-info">
                  <p>
                    <i aria-hidden="true">i</i>
                    No fee statement published yet. Use the form above to create one for this student.
                  </p>
                  <button type="submit" className="sa-btn sa-btn-outline" disabled={savingFee}>
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
                      <path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z" />
                      <path d="M14 3v5h5M12 17v-6M9.5 13.5 12 11l2.5 2.5" />
                    </svg>
                    {savingFee ? 'Publishing…' : 'Publish fee statement'}
                  </button>
                </div>
              ) : null}

              <div className="sa-pay-foot">
                <button type="button" className="sa-btn sa-btn-outline" onClick={closePayModal} disabled={savingFee}>
                  Cancel
                </button>
                <button type="submit" className="sa-btn sa-btn-primary" disabled={savingFee}>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
                    <path d="M5 5h12l3 3v11H5z" />
                    <path d="M8 5v5h8V5M8 19v-6h8v6" />
                  </svg>
                  {savingFee ? 'Saving…' : 'Save Payment Details'}
                </button>
              </div>
            </form>
          </aside>
        </div>
      )}
    </div>
  );
}
