import { useEffect, useMemo, useState } from 'react';
import { useOutletContext } from 'react-router-dom';
import { api } from '../../lib/api';

const PAGE_SIZES = [10, 25, 50];
const empty = { title: '', subject: '', grade: '', description: '', dueDate: '', teacherId: '', status: 'published' };

function fmt(value) {
  if (!value) return '—';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
}

function ymd(value) {
  if (!value) return '';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '';
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function AssignIcon({ name }) {
  const p = {
    width: 16,
    height: 16,
    viewBox: '0 0 24 24',
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth: 1.8,
    strokeLinecap: 'round',
    strokeLinejoin: 'round',
  };
  if (name === 'clip') {
    return (
      <svg {...p}>
        <path d="M8 7.2V5.6A2.6 2.6 0 0 1 10.6 3h2.8A2.6 2.6 0 0 1 16 5.6V7.2" />
        <rect x="5.5" y="6.6" width="13" height="14.4" rx="2.2" />
        <path d="M9 12.2h6M9 15.6h4.2" />
      </svg>
    );
  }
  if (name === 'plane') {
    return (
      <svg {...p}>
        <path d="m4.4 12 15.2-7.2-4.6 15.4-4.2-5.6-6.4-2.6Z" />
        <path d="m10.8 14.6 3.4 4.6" />
      </svg>
    );
  }
  if (name === 'clock') {
    return (
      <svg {...p}>
        <circle cx="12" cy="12" r="8" />
        <path d="M12 8.2V12l2.8 2.2" />
      </svg>
    );
  }
  if (name === 'cal') {
    return (
      <svg {...p}>
        <rect x="4" y="5.5" width="16" height="14.5" rx="2" />
        <path d="M4 10h16M8.2 3.8v3.4M15.8 3.8v3.4" />
      </svg>
    );
  }
  if (name === 'search') {
    return (
      <svg {...p} width={14} height={14}>
        <circle cx="11" cy="11" r="6.2" />
        <path d="m15.6 15.6 3.6 3.6" />
      </svg>
    );
  }
  if (name === 'filter') {
    return (
      <svg {...p} width={14} height={14}>
        <path d="M4 6h16M7 12h10M10 18h4" />
      </svg>
    );
  }
  if (name === 'plus') return <svg {...p}><path d="M12 5v14M5 12h14" /></svg>;
  if (name === 'caret') return <svg {...p} width={12} height={12}><path d="m6 9 5-6H1l5 6Z" fill="currentColor" stroke="none" /></svg>;
  if (name === 'sort') return <svg {...p} width={10} height={10}><path d="M5 1.6 7.6 5H2.4L5 1.6ZM5 8.4 2.4 5h5.2L5 8.4Z" fill="currentColor" stroke="none" /></svg>;
  if (name === 'more') return <svg {...p}><circle cx="12" cy="6" r="1.2" fill="currentColor" /><circle cx="12" cy="12" r="1.2" fill="currentColor" /><circle cx="12" cy="18" r="1.2" fill="currentColor" /></svg>;
  return null;
}

function EmptyArt() {
  return (
    <svg width="120" height="92" viewBox="0 0 120 92" fill="none" aria-hidden="true">
      <rect x="22" y="18" width="48" height="58" rx="8" fill="#eef2ff" stroke="#c7d2fe" strokeWidth="1.8" />
      <path d="M34 14.5h16a6 6 0 0 1 6 6V22H28v-1.5a6 6 0 0 1 6-6Z" fill="#fff" stroke="#a5b4fc" strokeWidth="1.6" />
      <path d="M34 40h24M34 48h18M34 56h14" stroke="#818cf8" strokeWidth="1.7" strokeLinecap="round" />
      <path d="M68 28 98 16l-10 34-12-14-8-8Z" fill="#6366f1" />
      <path d="m76 40 8 16" stroke="#fff" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  );
}

export default function AssignmentsAdmin() {
  const { schoolName = '', globalSearch = '' } = useOutletContext() || {};
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [q, setQ] = useState('');
  const [grade, setGrade] = useState('');
  const [subject, setSubject] = useState('');
  const [teacherId, setTeacherId] = useState('');
  const [status, setStatus] = useState('');
  const [dueFrom, setDueFrom] = useState('');
  const [dueTo, setDueTo] = useState('');
  const [kpi, setKpi] = useState('');
  const [more, setMore] = useState(false);
  const [sort, setSort] = useState({ key: 'dueDate', dir: 'asc' });
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(empty);
  const [saving, setSaving] = useState(false);
  const [showAddMenu, setShowAddMenu] = useState(false);
  const [menuId, setMenuId] = useState('');
  const year = new Date().getFullYear();

  const load = async () => {
    setData(await api('/admin/assignments'));
  };

  useEffect(() => {
    load().catch((e) => setError(e.message));
  }, []);

  useEffect(() => {
    if (globalSearch) setQ(globalSearch);
  }, [globalSearch]);

  useEffect(() => {
    const close = () => {
      setShowAddMenu(false);
      setMenuId('');
    };
    window.addEventListener('click', close);
    return () => window.removeEventListener('click', close);
  }, []);

  const startCreate = (nextStatus = 'published') => {
    setEditing(null);
    setForm({ ...empty, status: nextStatus });
    setShowAddMenu(false);
    setOpen(true);
  };

  const startEdit = (row) => {
    setEditing(row);
    setForm({
      title: row.title,
      subject: row.subject,
      grade: row.grade,
      description: row.description,
      dueDate: ymd(row.dueDate),
      teacherId: row.teacherId,
      status: row.status,
    });
    setMenuId('');
    setOpen(true);
  };

  const save = async (e) => {
    e.preventDefault();
    setSaving(true);
    setError('');
    try {
      if (editing) await api(`/admin/assignments/${editing.id}`, { method: 'PUT', body: form });
      else await api('/admin/assignments', { method: 'POST', body: form });
      setOpen(false);
      await load();
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  const remove = async (row) => {
    if (!window.confirm(`Remove ${row.title}?`)) return;
    try {
      await api(`/admin/assignments/${row.id}`, { method: 'DELETE' });
      setMenuId('');
      await load();
    } catch (err) {
      setError(err.message);
    }
  };

  const rows = data?.assignments || [];
  const subjects = useMemo(() => {
    const extra = rows.map((r) => r.subject).filter(Boolean);
    return [...new Set([...(data?.subjects || []), ...extra])].sort();
  }, [data, rows]);

  const filtered = useMemo(() => {
    const term = q.trim().toLowerCase();
    const list = rows.filter((r) => {
      if (grade && r.grade !== grade) return false;
      if (subject && r.subject !== subject) return false;
      if (teacherId && r.teacherId !== teacherId) return false;
      if (status && r.status !== status) return false;
      if (kpi === 'published' && r.status !== 'published') return false;
      if (kpi === 'overdue' && !r.overdue) return false;
      if (kpi === 'today' && !r.dueToday) return false;
      if (dueFrom && (!r.dueDate || ymd(r.dueDate) < dueFrom)) return false;
      if (dueTo && (!r.dueDate || ymd(r.dueDate) > dueTo)) return false;
      if (!term) return true;
      return [r.title, r.subject, r.grade, r.teacherName, r.status].some((v) =>
        String(v || '').toLowerCase().includes(term)
      );
    });
    const dir = sort.dir === 'desc' ? -1 : 1;
    list.sort((a, b) => {
      const av = sort.key === 'dueDate' ? new Date(a.dueDate || 0).getTime() : String(a[sort.key] || '').toLowerCase();
      const bv = sort.key === 'dueDate' ? new Date(b.dueDate || 0).getTime() : String(b[sort.key] || '').toLowerCase();
      if (av < bv) return -1 * dir;
      if (av > bv) return 1 * dir;
      return 0;
    });
    return list;
  }, [rows, q, grade, subject, teacherId, status, kpi, dueFrom, dueTo, sort]);

  const pages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const safePage = Math.min(page, pages);
  const slice = filtered.slice((safePage - 1) * pageSize, safePage * pageSize);
  const from = slice.length ? (safePage - 1) * pageSize + 1 : 0;
  const to = Math.min(filtered.length, safePage * pageSize);

  const resetFilters = () => {
    setQ('');
    setGrade('');
    setSubject('');
    setTeacherId('');
    setStatus('');
    setDueFrom('');
    setDueTo('');
    setKpi('');
    setPage(1);
  };

  const toggleSort = (key) => {
    setSort((s) => (s.key === key ? { key, dir: s.dir === 'asc' ? 'desc' : 'asc' } : { key, dir: 'asc' }));
  };

  const kpis = [
    { id: '', label: 'Total Assignments', value: data ? data.stats?.total ?? 0 : '…', hint: 'All time', tint: 'purple', icon: 'clip' },
    { id: 'published', label: 'Published', value: data ? data.stats?.published ?? 0 : '…', hint: 'Currently published', tint: 'green', icon: 'plane' },
    { id: 'overdue', label: 'Overdue', value: data ? data.stats?.overdue ?? 0 : '…', hint: 'Past due date', tint: 'orange', icon: 'clock' },
    { id: 'today', label: 'Due Today', value: data ? data.stats?.dueToday ?? 0 : '…', hint: 'Due today', tint: 'rose', icon: 'cal' },
  ];

  return (
    <div className="sa-students sa-users sa-assign">
      {error && <div className="alert">{error}</div>}

      <div className="sa-users-head">
        <p className="sa-muted">Assignments teachers have published for this school.</p>
        <div className="sa-users-add">
          <button
            type="button"
            className="sa-btn sa-btn-primary"
            onClick={(e) => {
              e.stopPropagation();
              setShowAddMenu((v) => !v);
            }}
          >
            <AssignIcon name="plus" />
            Add assignment
            <AssignIcon name="caret" />
          </button>
          {showAddMenu && (
            <div className="sa-users-add-menu" onClick={(e) => e.stopPropagation()}>
              <button type="button" onClick={() => startCreate('published')}>
                Published assignment
              </button>
              <button type="button" onClick={() => startCreate('draft')}>
                Draft assignment
              </button>
            </div>
          )}
        </div>
      </div>

      <section className="sa-stu-kpis sa-assign-kpis" aria-label="Assignment metrics">
        {kpis.map((m) => (
          <button
            key={m.label}
            type="button"
            className={`sa-stu-kpi tint-${m.tint}${kpi === m.id ? ' is-on' : ''}`}
            onClick={() => {
              setKpi((cur) => (cur === m.id ? '' : m.id));
              setPage(1);
            }}
          >
            <i className="sa-stu-kpi-icon" aria-hidden="true">
              <AssignIcon name={m.icon} />
            </i>
            <div>
              <span>{m.label}</span>
              <strong>{m.value}</strong>
              <em>{m.hint}</em>
            </div>
          </button>
        ))}
      </section>

      <article className="sa-card sa-stu-table-card">
        <div className="sa-assign-toolbar">
          <label className="sa-assign-search">
            <AssignIcon name="search" />
            <input
              value={q}
              onChange={(e) => {
                setQ(e.target.value);
                setPage(1);
              }}
              placeholder="Search assignments..."
              aria-label="Search assignments"
            />
          </label>
          <select
            value={grade}
            onChange={(e) => {
              setGrade(e.target.value);
              setPage(1);
            }}
            aria-label="Grade"
          >
            <option value="">All grades</option>
            {(data?.grades || []).map((g) => (
              <option key={g} value={g}>
                {g}
              </option>
            ))}
          </select>
          <select
            value={subject}
            onChange={(e) => {
              setSubject(e.target.value);
              setPage(1);
            }}
            aria-label="Subject"
          >
            <option value="">All subjects</option>
            {subjects.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
          <select
            value={teacherId}
            onChange={(e) => {
              setTeacherId(e.target.value);
              setPage(1);
            }}
            aria-label="Teacher"
          >
            <option value="">All teachers</option>
            {(data?.teachers || []).map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </select>
          <button type="button" className="sa-btn sa-btn-outline" onClick={() => setMore((v) => !v)}>
            <AssignIcon name="filter" />
            More filters
          </button>
          <button type="button" className="sa-assign-reset" onClick={resetFilters}>
            Reset
          </button>
        </div>

        {more && (
          <div className="sa-assign-more">
            <select value={status} onChange={(e) => setStatus(e.target.value)} aria-label="Status">
              <option value="">All statuses</option>
              <option value="published">Published</option>
              <option value="draft">Draft</option>
            </select>
            <label>
              Due from
              <input type="date" value={dueFrom} onChange={(e) => setDueFrom(e.target.value)} />
            </label>
            <label>
              Due to
              <input type="date" value={dueTo} onChange={(e) => setDueTo(e.target.value)} />
            </label>
          </div>
        )}

        <div className="sa-table-wrap">
          <table className="sa-table sa-stu-table sa-assign-table">
            <thead>
              <tr>
                {[
                  ['title', 'Title'],
                  ['subject', 'Subject'],
                  ['grade', 'Grade'],
                  ['teacherName', 'Teacher'],
                  ['dueDate', 'Due date'],
                  ['status', 'Status'],
                ].map(([key, label]) => (
                  <th key={key}>
                    <button type="button" className="sa-assign-sort" onClick={() => toggleSort(key)}>
                      {label}
                      <AssignIcon name="sort" />
                    </button>
                  </th>
                ))}
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {slice.map((r) => (
                <tr key={r.id}>
                  <td>
                    <strong>{r.title}</strong>
                  </td>
                  <td>{r.subject || '—'}</td>
                  <td>{r.grade || '—'}</td>
                  <td>{r.teacherName}</td>
                  <td>{fmt(r.dueDate)}</td>
                  <td>
                    <span className={`sa-assign-status is-${r.overdue ? 'overdue' : r.status}`}>
                      {r.overdue ? 'Overdue' : r.status === 'draft' ? 'Draft' : 'Published'}
                    </span>
                  </td>
                  <td>
                    <div className="sa-inc-row-actions">
                      <button
                        type="button"
                        className="sa-icon-btn"
                        aria-label={`Actions for ${r.title}`}
                        onClick={(e) => {
                          e.stopPropagation();
                          setMenuId((id) => (id === r.id ? '' : r.id));
                        }}
                      >
                        ⋮
                      </button>
                      {menuId === r.id && (
                        <div className="sa-inc-menu" onClick={(e) => e.stopPropagation()}>
                          <button type="button" onClick={() => startEdit(r)}>
                            Edit
                          </button>
                          <button type="button" onClick={() => remove(r)}>
                            Remove
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

        {!filtered.length && (
          <div className="sa-assign-empty">
            <EmptyArt />
            <strong>{rows.length ? 'No matching assignments' : 'No assignments yet'}</strong>
            <p>
              {rows.length
                ? 'Try another search or reset the filters.'
                : "Teachers haven't published any assignments."}
            </p>
            {!rows.length && (
              <button type="button" className="sa-btn sa-btn-primary" onClick={() => startCreate('published')}>
                <AssignIcon name="plus" />
                Add assignment
              </button>
            )}
          </div>
        )}

        <div className="sa-table-foot sa-stu-foot sa-inc-foot">
          <span>
            Showing {from} to {to} of {filtered.length} assignments
          </span>
          <div className="sa-inc-pager">
            <select
              value={pageSize}
              onChange={(e) => {
                setPageSize(Number(e.target.value));
                setPage(1);
              }}
              aria-label="Per page"
            >
              {PAGE_SIZES.map((n) => (
                <option key={n} value={n}>
                  {n} per page
                </option>
              ))}
            </select>
            <div className="sa-pager">
              <button type="button" disabled={safePage <= 1} onClick={() => setPage(safePage - 1)} aria-label="Previous page">
                ‹
              </button>
              <button type="button" disabled={safePage >= pages} onClick={() => setPage(safePage + 1)} aria-label="Next page">
                ›
              </button>
            </div>
          </div>
        </div>
      </article>

      {open && (
        <div className="sa-reports-modal" role="dialog">
          <form className="sa-card" onSubmit={save}>
            <h3>{editing ? 'Edit assignment' : 'Add assignment'}</h3>
            <label>
              Title
              <input required value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} />
            </label>
            <label>
              Subject
              <input value={form.subject} onChange={(e) => setForm({ ...form, subject: e.target.value })} />
            </label>
            <label>
              Grade
              <select value={form.grade} onChange={(e) => setForm({ ...form, grade: e.target.value })}>
                <option value="">All / unspecified</option>
                {(data?.grades || []).map((g) => (
                  <option key={g} value={g}>
                    {g}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Teacher
              <select required={!editing} value={form.teacherId} onChange={(e) => setForm({ ...form, teacherId: e.target.value })}>
                <option value="">Select…</option>
                {(data?.teachers || []).map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Due date
              <input type="date" value={form.dueDate} onChange={(e) => setForm({ ...form, dueDate: e.target.value })} />
            </label>
            <label>
              Status
              <select value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })}>
                <option value="published">Published</option>
                <option value="draft">Draft</option>
              </select>
            </label>
            <label>
              Description
              <textarea rows={3} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
            </label>
            <div className="sa-reports-actions">
              <button type="button" className="sa-btn sa-btn-outline" onClick={() => setOpen(false)}>
                Cancel
              </button>
              <button className="sa-btn sa-btn-primary" type="submit" disabled={saving}>
                {saving ? 'Saving…' : 'Save'}
              </button>
            </div>
          </form>
        </div>
      )}

      <footer className="sa-home-foot">
        <span>
          © {year} {schoolName || 'School'}. All rights reserved.
        </span>
        <span>Transport Management System v1.0.0</span>
      </footer>
    </div>
  );
}
