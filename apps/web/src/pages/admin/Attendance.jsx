import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useOutletContext } from 'react-router-dom';
import { api } from '../../lib/api';

const PAGE_SIZES = [10, 25, 50];

const STATUSES = [
  { id: 'present', label: 'Present' },
  { id: 'absent', label: 'Absent' },
  { id: 'late', label: 'Late' },
  { id: 'excused', label: 'Excused' },
];

function ymd(value) {
  const d = value ? new Date(value) : new Date();
  if (Number.isNaN(d.getTime())) return '';
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function initials(name = '') {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return '?';
  if (parts.length === 1) return parts[0][0].toUpperCase();
  return (parts[0][0] + parts[1][0]).toUpperCase();
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

function busLabel(value) {
  if (value === 'picked_up') return 'Picked up';
  if (value === 'not_picked_up') return 'Not picked up';
  if (value === 'dropped_off') return 'Dropped off';
  return '—';
}

function gradeLabel(value) {
  const g = String(value || '').trim();
  if (!g) return '';
  const rest = g.replace(/^grade\s*/i, '');
  return rest ? `Grade ${rest}` : 'Grade';
}

function pct(part, total) {
  if (!total) return '0% of total';
  return `${Math.round((part / total) * 100)}% of total`;
}

function statusMeta(id) {
  return STATUSES.find((s) => s.id === id) || { id, label: id };
}

function prettyDate(value) {
  const d = value ? new Date(`${value}T00:00:00`) : new Date();
  if (Number.isNaN(d.getTime())) return value || '';
  return d.toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });
}

function StatusIcon({ id }) {
  const p = { width: 13, height: 13, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 2, strokeLinecap: 'round', strokeLinejoin: 'round' };
  if (id === 'absent') return <svg {...p}><circle cx="12" cy="12" r="8" /><path d="m9 9 6 6M15 9l-6 6" /></svg>;
  if (id === 'late') return <svg {...p}><circle cx="12" cy="12" r="8" /><path d="M12 8v4.2l2.4 1.6" /></svg>;
  if (id === 'excused') return <svg {...p}><path d="M12 3 20 7v5c0 5-3.4 8.4-8 9.5C7.4 20.4 4 17 4 12V7z" /><path d="m9 12 2.1 2.1L15.5 10" /></svg>;
  return <svg {...p}><circle cx="12" cy="12" r="8" /><path d="m8.6 12.2 2.4 2.4 4.6-5" /></svg>;
}

function KpiIcon({ id }) {
  const p = { width: 15, height: 15, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 1.8, strokeLinecap: 'round', strokeLinejoin: 'round' };
  if (id === 'absent') return <svg {...p}><circle cx="12" cy="8" r="3.2" /><path d="M5.6 19a6.4 6.4 0 0 1 12.8 0" /><path d="m16.2 6.2 4 4M20.2 6.2l-4 4" /></svg>;
  if (id === 'late') return <svg {...p}><circle cx="12" cy="12" r="8" /><path d="M12 8v4.2l2.4 1.6" /></svg>;
  if (id === 'unmarked') return <svg {...p}><circle cx="12" cy="12" r="8" /><path d="M12 16.2h.01M10.2 9.4a1.8 1.8 0 1 1 2.5 1.7c-.7.4-1.1.9-1.1 1.7V13" /></svg>;
  return <svg {...p}><circle cx="12" cy="8" r="3.2" /><path d="M5.6 19a6.4 6.4 0 0 1 12.8 0" /><path d="m16 11 1.6 1.6L21 9.2" /></svg>;
}

export default function Attendance() {
  const { schoolName = '' } = useOutletContext() || {};
  const navigate = useNavigate();
  const [date, setDate] = useState(ymd());
  const [grade, setGrade] = useState('');
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [busyId, setBusyId] = useState('');
  const [menuId, setMenuId] = useState('');
  const [editing, setEditing] = useState(null);
  const [editNote, setEditNote] = useState('');
  const [editStatus, setEditStatus] = useState('present');
  const [confirm, setConfirm] = useState(null);
  const [changingId, setChangingId] = useState('');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const year = new Date().getFullYear();

  const load = async () => {
    const query = new URLSearchParams({ date });
    if (grade) query.set('grade', grade);
    setData(await api(`/admin/attendance?${query}`));
  };

  useEffect(() => {
    load().catch((e) => setError(e.message));
  }, [date, grade]);

  useEffect(() => {
    setPage(1);
  }, [date, grade, pageSize]);

  useEffect(() => {
    const close = () => setMenuId('');
    window.addEventListener('click', close);
    return () => window.removeEventListener('click', close);
  }, []);

  const mark = async (kidId, status, note) => {
    setBusyId(kidId);
    setError('');
    try {
      await api('/admin/attendance', { method: 'POST', body: { kidId, status, date, note: note || '' } });
      await load();
      setEditing(null);
      setConfirm(null);
      setChangingId('');
    } catch (err) {
      setError(err.message);
    } finally {
      setBusyId('');
    }
  };

  const applyLocalClear = (kidId) => {
    setData((cur) => {
      if (!cur) return cur;
      const kids = (cur.kids || []).map((k) => (k.id === kidId ? { ...k, status: '', note: '' } : k));
      const counts = { present: 0, absent: 0, late: 0, excused: 0, unmarked: 0 };
      for (const r of kids) {
        if (!r.status) counts.unmarked += 1;
        else if (counts[r.status] != null) counts[r.status] += 1;
      }
      return { ...cur, kids, stats: { ...counts, total: kids.length } };
    });
  };

  const clearMark = async (kidId) => {
    setBusyId(kidId);
    setError('');
    try {
      await api('/admin/attendance', { method: 'POST', body: { kidId, date, status: 'unmarked', clear: true } });
      await load();
    } catch {
      applyLocalClear(kidId);
    } finally {
      setConfirm(null);
      setChangingId('');
      setBusyId('');
    }
  };

  const askMark = (kid, status) => {
    if (busyId) return;
    if (kid.status === status) {
      setConfirm({ kid, status, mode: 'undo' });
      return;
    }
    const locked = Boolean(kid.status) && changingId !== kid.id;
    if (locked) return;
    setConfirm({ kid, status, mode: kid.status ? 'change' : 'mark' });
  };

  const startChange = (kid) => {
    setMenuId('');
    setChangingId(kid.id);
  };

  const applyConfirm = () => {
    if (!confirm) return;
    if (confirm.mode === 'undo') return clearMark(confirm.kid.id);
    return mark(confirm.kid.id, confirm.status, confirm.kid.note);
  };

  const openEdit = (kid) => {
    setMenuId('');
    setChangingId(kid.id);
    setEditing(kid);
    setEditStatus(kid.status || 'present');
    setEditNote(kid.note || '');
  };

  const stats = data?.stats || {};
  const kids = data?.kids || [];
  const total = stats.total || kids.length;
  const pages = Math.max(1, Math.ceil(kids.length / pageSize));
  const safePage = Math.min(page, pages);
  const slice = kids.slice((safePage - 1) * pageSize, safePage * pageSize);

  const kpis = useMemo(
    () => [
      { id: 'present', label: 'Present', value: stats.present ?? 0, tint: 'green', hint: pct(stats.present ?? 0, total) },
      { id: 'absent', label: 'Absent', value: stats.absent ?? 0, tint: 'rose', hint: pct(stats.absent ?? 0, total) },
      { id: 'late', label: 'Late', value: stats.late ?? 0, tint: 'orange', hint: pct(stats.late ?? 0, total) },
      { id: 'unmarked', label: 'Unmarked', value: stats.unmarked ?? 0, tint: 'sky', hint: pct(stats.unmarked ?? 0, total) },
    ],
    [stats.present, stats.absent, stats.late, stats.unmarked, total]
  );

  return (
    <div className="sa-students sa-att">
      {error && <div className="alert">{error}</div>}

      <div className="sa-att-banner">
        <p>
          <i aria-hidden="true">i</i>
          Class register for the selected day. Bus column is from trip pickup events that day, not estimated.
        </p>
      </div>

      <section className="sa-stu-kpis sa-users-kpis sa-att-kpis" aria-label="Attendance metrics">
        {kpis.map((m) => (
          <article key={m.id} className={`sa-stu-kpi tint-${m.tint}`}>
            <i className="sa-stu-kpi-icon" aria-hidden="true">
              <KpiIcon id={m.id} />
            </i>
            <div>
              <span>{m.label}</span>
              <strong>{m.value}</strong>
              <em>{m.hint}</em>
            </div>
          </article>
        ))}
      </section>

      <article className={`sa-card sa-stu-table-card${menuId ? ' is-menu-open' : ''}`}>
        <div className="sa-att-filters">
          <label className="sa-field sa-att-date">
            <span>Date</span>
            <div className="sa-att-date-box">
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
                <rect x="3.5" y="5" width="17" height="15.5" rx="2" />
                <path d="M8 3.5v3M16 3.5v3M3.5 10h17" />
              </svg>
              <input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
            </div>
          </label>
          <label className="sa-field">
            <span>Filter by grade</span>
            <select value={grade} onChange={(e) => setGrade(e.target.value)}>
              <option value="">All grades</option>
              {(data?.grades || []).map((g) => (
                <option key={g} value={g}>
                  {gradeLabel(g)}
                </option>
              ))}
            </select>
          </label>
        </div>

        <div className="sa-table-wrap">
          <table className="sa-table sa-stu-table sa-att-table">
            <thead>
              <tr>
                <th>Student</th>
                <th>Grade</th>
                <th>Bus</th>
                <th>
                  Register
                  <span className="sa-att-info" title="Mark the class register for this day">i</span>
                </th>
                <th />
              </tr>
            </thead>
            <tbody>
              {slice.map((k, i) => (
                <tr key={k.id}>
                  <td>
                    <div className="sa-stu-person">
                      {k.photoUrl ? <img src={k.photoUrl} alt="" /> : <span>{initials(k.name)}</span>}
                      <div>
                        <strong>{k.name}</strong>
                        <small>{k.admissionNo || '—'}</small>
                      </div>
                    </div>
                  </td>
                  <td>
                    {k.grade ? <em className="sa-att-grade">{gradeLabel(k.grade)}</em> : '—'}
                  </td>
                  <td>{busLabel(k.bus)}</td>
                  <td>
                    {(() => {
                      const locked = Boolean(k.status) && changingId !== k.id;
                      const busy = busyId === k.id;
                      return (
                        <div className={`sa-att-register${locked ? ' is-locked' : ''}${changingId === k.id ? ' is-changing' : ''}${busy ? ' is-busy' : ''}`}>
                          <div className="sa-att-marks">
                            {STATUSES.map((s) => (
                              <button
                                key={s.id}
                                type="button"
                                className={`sa-att-mark is-${s.id}${k.status === s.id ? ' is-on' : ''}`}
                                disabled={busy || (locked && s.id !== k.status)}
                                onClick={() => askMark(k, s.id)}
                              >
                                <StatusIcon id={s.id} />
                                {s.label}
                              </button>
                            ))}
                          </div>
                          {k.status ? (
                            <div className="sa-att-lock-actions">
                              <button type="button" className="sa-text-link" disabled={busy} onClick={() => setConfirm({ kid: k, status: k.status, mode: 'undo' })}>
                                Undo
                              </button>
                              {locked ? (
                                <button type="button" className="sa-text-link" disabled={busy} onClick={() => startChange(k)}>
                                  Change
                                </button>
                              ) : (
                                <span>Pick a new mark</span>
                              )}
                            </div>
                          ) : null}
                        </div>
                      );
                    })()}
                  </td>
                  <td>
                    <div className={`sa-stu-more${menuId === k.id ? ' is-open' : ''}${i >= slice.length - 1 ? ' is-up' : ''}`}>
                      <button
                        type="button"
                        className="sa-icon-ghost"
                        aria-label="More"
                        aria-expanded={menuId === k.id}
                        onClick={(e) => {
                          e.stopPropagation();
                          e.nativeEvent.stopImmediatePropagation();
                          setMenuId((cur) => (cur === k.id ? '' : k.id));
                        }}
                      >
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                          <circle cx="12" cy="5" r="1.6" />
                          <circle cx="12" cy="12" r="1.6" />
                          <circle cx="12" cy="19" r="1.6" />
                        </svg>
                      </button>
                      {menuId === k.id && (
                        <div className="sa-stu-menu" role="menu" onClick={(e) => e.stopPropagation()}>
                          <button type="button" role="menuitem" onClick={() => navigate(`/school-admin/students/${k.id}`)}>
                            <i aria-hidden="true">
                              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="8" r="3.2" /><path d="M5.5 19a6.5 6.5 0 0 1 13 0" /></svg>
                            </i>
                            View profile
                          </button>
                          <button type="button" role="menuitem" onClick={() => { setMenuId(''); startChange(k); }}>
                            <i aria-hidden="true">
                              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M4 12h16M14 6l6 6-6 6" /></svg>
                            </i>
                            Change mark
                          </button>
                          <button type="button" role="menuitem" onClick={() => openEdit(k)}>
                            <i aria-hidden="true">
                              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 20h9" /><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z" /></svg>
                            </i>
                            Edit attendance
                          </button>
                          {k.status ? (
                            <button type="button" role="menuitem" onClick={() => { setMenuId(''); setConfirm({ kid: k, status: k.status, mode: 'undo' }); }}>
                              <i aria-hidden="true">
                                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M3 12a9 9 0 1 0 3-6.7" /><path d="M3 4v5h5" /></svg>
                              </i>
                              Undo mark
                            </button>
                          ) : null}
                          <span className="sa-stu-menu-sep" />
                          <button type="button" role="menuitem" onClick={() => navigate('/school-admin/messages')}>
                            <i aria-hidden="true">
                              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M4 6h16v10H7l-3 3V6Z" /></svg>
                            </i>
                            Notify parent
                          </button>
                        </div>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {!slice.length && <p className="sa-home-empty">No students in this view.</p>}
        <div className="sa-table-foot sa-stu-foot">
          <span>
            Showing {kids.length ? (safePage - 1) * pageSize + 1 : 0} to{' '}
            {Math.min(safePage * pageSize, kids.length)} of {kids.length} students
          </span>
          <label className="sa-stu-pagesize">
            <select value={pageSize} onChange={(e) => setPageSize(Number(e.target.value))}>
              {PAGE_SIZES.map((n) => (
                <option key={n} value={n}>
                  {n} per page
                </option>
              ))}
            </select>
          </label>
          <div className="sa-pager">
            <button type="button" disabled={safePage <= 1} onClick={() => setPage(safePage - 1)}>
              ‹
            </button>
            {pageItems(safePage, pages).map((item, i) =>
              item === '…' ? (
                <span key={`e${i}`}>…</span>
              ) : (
                <button
                  key={item}
                  type="button"
                  className={item === safePage ? 'is-current' : ''}
                  onClick={() => setPage(item)}
                >
                  {item}
                </button>
              )
            )}
            <button type="button" disabled={safePage >= pages} onClick={() => setPage(safePage + 1)}>
              ›
            </button>
          </div>
        </div>
      </article>

      <footer className="sa-home-foot">
        <span>
          © {year} {schoolName || 'School'}. All rights reserved.
        </span>
        <span>Transport Management System v1.0.0</span>
      </footer>

      {confirm && (
        <div className="sa-action-overlay" onClick={() => !busyId && setConfirm(null)} role="presentation">
          <div className={`sa-action-modal sa-att-confirm is-${confirm.mode === 'undo' ? 'undo' : confirm.status}`} onClick={(e) => e.stopPropagation()} role="dialog" aria-labelledby="att-confirm-title">
            <header className="sa-att-confirm-head">
              <i className={`sa-att-confirm-icon is-${confirm.mode === 'undo' ? 'undo' : confirm.status}`} aria-hidden="true">
                {confirm.mode === 'undo' ? (
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M3 12a9 9 0 1 0 3-6.7" /><path d="M3 4v5h5" /></svg>
                ) : (
                  <StatusIcon id={confirm.status} />
                )}
              </i>
              <div>
                <h2 id="att-confirm-title">
                  {confirm.mode === 'undo' ? 'Undo register mark' : confirm.mode === 'change' ? 'Change register mark' : 'Confirm register mark'}
                </h2>
                <p>{confirm.kid.name} · {prettyDate(date)}</p>
              </div>
              <button type="button" className="sa-icon-ghost" aria-label="Close" onClick={() => setConfirm(null)}>×</button>
            </header>
            <div className="sa-att-modal-body">
              <p className="sa-att-confirm-copy">
                {confirm.mode === 'undo'
                  ? `Undo ${statusMeta(confirm.status).label} for ${confirm.kid.name}? The register will go back to unmarked.`
                  : confirm.mode === 'change'
                    ? `Change ${confirm.kid.name} from ${statusMeta(confirm.kid.status).label} to ${statusMeta(confirm.status).label}?`
                    : `Mark ${confirm.kid.name} as ${statusMeta(confirm.status).label}? The other register options will lock until you undo or change.`}
              </p>
            </div>
            <footer className="sa-att-modal-foot">
              <button type="button" className="sa-btn" disabled={!!busyId} onClick={() => setConfirm(null)}>Cancel</button>
              <button
                type="button"
                className={`sa-btn ${confirm.mode === 'undo' ? '' : 'sa-btn-primary'}${confirm.mode === 'undo' ? ' sa-att-undo-btn' : ''}`}
                disabled={!!busyId}
                onClick={applyConfirm}
              >
                {confirm.mode === 'undo' ? 'Undo mark' : confirm.mode === 'change' ? 'Confirm change' : `Confirm ${statusMeta(confirm.status).label}`}
              </button>
            </footer>
          </div>
        </div>
      )}

      {editing && (
        <div className="sa-action-overlay" onClick={() => !busyId && setEditing(null)} role="presentation">
          <div className="sa-action-modal sa-att-modal" onClick={(e) => e.stopPropagation()} role="dialog" aria-labelledby="att-edit-title">
            <header className="sa-stop-detail-bar">
              <div>
                <h2 id="att-edit-title">Edit attendance</h2>
                <p className="sa-muted">{editing.name} · {date}</p>
              </div>
              <button type="button" className="sa-icon-ghost" aria-label="Close" onClick={() => setEditing(null)}>×</button>
            </header>
            <div className="sa-att-modal-body">
              <span className="sa-att-modal-label">Register</span>
              <div className="sa-att-marks">
                {STATUSES.map((s) => (
                  <button
                    key={s.id}
                    type="button"
                    className={`sa-att-mark is-${s.id}${editStatus === s.id ? ' is-on' : ''}`}
                    onClick={() => setEditStatus(s.id)}
                  >
                    <StatusIcon id={s.id} />
                    {s.label}
                  </button>
                ))}
              </div>
              <label className="sa-field">
                <span>Note</span>
                <textarea
                  rows={3}
                  maxLength={300}
                  value={editNote}
                  onChange={(e) => setEditNote(e.target.value)}
                  placeholder="Optional note for this mark"
                />
              </label>
            </div>
            <footer className="sa-att-modal-foot">
              <button type="button" className="sa-btn" onClick={() => setEditing(null)}>Cancel</button>
              <button
                type="button"
                className="sa-btn sa-btn-primary"
                disabled={!!busyId}
                onClick={() => mark(editing.id, editStatus, editNote)}
              >
                Save mark
              </button>
            </footer>
          </div>
        </div>
      )}
    </div>
  );
}
