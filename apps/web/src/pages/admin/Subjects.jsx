import { useEffect, useMemo, useState } from 'react';
import { useOutletContext } from 'react-router-dom';
import { api } from '../../lib/api';

const PAGE_SIZES = [10, 25, 50];
const empty = { name: '', classId: '', teacherName: '' };

function SubjIcon({ name }) {
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
  if (name === 'book') {
    return (
      <svg {...p}>
        <path d="M5 5.4A3.4 3.4 0 0 1 8.4 4H19v16H8.4A3.4 3.4 0 0 0 5 20.4V5.4Z" />
        <path d="M8.4 4v16" />
      </svg>
    );
  }
  if (name === 'school') {
    return (
      <svg {...p}>
        <path d="M3 10.2 12 5l9 5.2v7.3H3V10.2Z" />
        <path d="M7.5 22V12.8h9V22" />
      </svg>
    );
  }
  if (name === 'user') {
    return (
      <svg {...p}>
        <circle cx="12" cy="8.2" r="3.2" />
        <path d="M5.4 19.2c.8-3 3.4-4.8 6.6-4.8s5.8 1.8 6.6 4.8" />
      </svg>
    );
  }
  if (name === 'people') {
    return (
      <svg {...p}>
        <circle cx="9" cy="8.4" r="2.6" />
        <circle cx="16.2" cy="9" r="2.2" />
        <path d="M4.6 18.6c.7-2.6 2.8-4.1 5.4-4.1 2.6 0 4.7 1.5 5.4 4.1" />
        <path d="M15.2 14.8c1.8 0 3.4 1 4.1 2.8" />
      </svg>
    );
  }
  if (name === 'clip') {
    return (
      <svg {...p}>
        <path d="M8 7.2V5.6A2.6 2.6 0 0 1 10.6 3h2.8A2.6 2.6 0 0 1 16 5.6V7.2" />
        <rect x="5.5" y="6.6" width="13" height="14.4" rx="2.2" />
        <path d="M9 12.2h6M9 15.6h4.2" />
      </svg>
    );
  }
  if (name === 'chart') {
    return (
      <svg {...p}>
        <path d="M12 4.4A7.6 7.6 0 1 0 19.6 12H12V4.4Z" />
        <path d="M13.4 4.6A7.6 7.6 0 0 1 19.4 10.6H13.4V4.6Z" />
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
  if (name === 'info') return <svg {...p}><circle cx="12" cy="12" r="8" /><path d="M12 10.6V16M12 7.6h.01" /></svg>;
  if (name === 'plus') return <svg {...p}><path d="M12 5v14M5 12h14" /></svg>;
  if (name === 'caret') return <svg {...p} width={12} height={12}><path d="m6 9 5-6H1l5 6Z" fill="currentColor" stroke="none" /></svg>;
  if (name === 'sort') return <svg {...p} width={10} height={10}><path d="M5 1.6 7.6 5H2.4L5 1.6ZM5 8.4 2.4 5h5.2L5 8.4Z" fill="currentColor" stroke="none" /></svg>;
  return null;
}

function EmptyArt() {
  return (
    <svg width="120" height="92" viewBox="0 0 120 92" fill="none" aria-hidden="true">
      <path d="M28 26c8-5 16-5 24 0v42c-8-4-16-4-24 0V26Z" fill="#eef2ff" stroke="#c7d2fe" strokeWidth="1.8" />
      <path d="M76 26c-8-5-16-5-24 0v42c8-4 16-4 24 0V26Z" fill="#fff" stroke="#a5b4fc" strokeWidth="1.8" />
      <circle cx="82" cy="58" r="16" fill="#fff" stroke="#6366f1" strokeWidth="1.8" />
      <circle cx="82" cy="58" r="8.2" stroke="#818cf8" strokeWidth="1.6" />
      <path d="m93 69 10 10" stroke="#6366f1" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

export default function Subjects() {
  const { schoolName = '', globalSearch = '' } = useOutletContext() || {};
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [q, setQ] = useState('');
  const [klass, setKlass] = useState('');
  const [teacher, setTeacher] = useState('');
  const [more, setMore] = useState(false);
  const [hasStudents, setHasStudents] = useState(false);
  const [sort, setSort] = useState({ key: 'name', dir: 'asc' });
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(empty);
  const [saving, setSaving] = useState(false);
  const [showAddMenu, setShowAddMenu] = useState('');
  const [menuId, setMenuId] = useState('');
  const year = new Date().getFullYear();

  const load = async () => {
    setData(await api('/admin/subjects'));
  };

  useEffect(() => {
    load().catch((e) => setError(e.message));
  }, []);

  useEffect(() => {
    if (globalSearch) setQ(globalSearch);
  }, [globalSearch]);

  useEffect(() => {
    const close = () => {
      setShowAddMenu('');
      setMenuId('');
    };
    window.addEventListener('click', close);
    return () => window.removeEventListener('click', close);
  }, []);

  const startCreate = (classId = '') => {
    setForm({ ...empty, classId });
    setShowAddMenu('');
    setOpen(true);
  };

  const save = async (e) => {
    e.preventDefault();
    setSaving(true);
    setError('');
    try {
      await api('/admin/subjects', { method: 'POST', body: form });
      setOpen(false);
      setForm(empty);
      await load();
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  const remove = async (name, classId) => {
    if (!window.confirm(`Remove ${name} from this class?`)) return;
    try {
      await api('/admin/subjects', { method: 'DELETE', body: { name, classId } });
      setMenuId('');
      await load();
    } catch (err) {
      setError(err.message);
    }
  };

  const rows = data?.subjects || [];
  const classes = data?.classes || [];
  const teacherNames = useMemo(() => {
    const extra = rows.flatMap((r) => r.teachers || []);
    return [...new Set(extra)].sort();
  }, [rows]);

  const filtered = useMemo(() => {
    const term = q.trim().toLowerCase();
    const list = rows.filter((r) => {
      if (klass && !(r.classes || []).includes(klass)) return false;
      if (teacher && !(r.teachers || []).includes(teacher)) return false;
      if (hasStudents && !r.studentCount) return false;
      if (!term) return true;
      return (
        r.name.toLowerCase().includes(term) ||
        (r.classes || []).join(' ').toLowerCase().includes(term) ||
        (r.teachers || []).join(' ').toLowerCase().includes(term)
      );
    });
    const dir = sort.dir === 'desc' ? -1 : 1;
    list.sort((a, b) => {
      const rawA = a[sort.key];
      const rawB = b[sort.key];
      const av = Array.isArray(rawA) ? rawA.join(', ').toLowerCase() : typeof rawA === 'number' ? rawA : String(rawA || '').toLowerCase();
      const bv = Array.isArray(rawB) ? rawB.join(', ').toLowerCase() : typeof rawB === 'number' ? rawB : String(rawB || '').toLowerCase();
      if (av < bv) return -1 * dir;
      if (av > bv) return 1 * dir;
      return 0;
    });
    return list;
  }, [rows, q, klass, teacher, hasStudents, sort]);

  const pages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const safePage = Math.min(page, pages);
  const slice = filtered.slice((safePage - 1) * pageSize, safePage * pageSize);
  const from = slice.length ? (safePage - 1) * pageSize + 1 : 0;
  const to = Math.min(filtered.length, safePage * pageSize);

  const resetFilters = () => {
    setQ('');
    setKlass('');
    setTeacher('');
    setHasStudents(false);
    setPage(1);
  };

  const toggleSort = (key) => {
    setSort((s) => (s.key === key ? { key, dir: s.dir === 'asc' ? 'desc' : 'asc' } : { key, dir: 'asc' }));
  };

  const stats = data?.stats || {};
  const kpis = [
    { label: 'Total Subjects', value: data ? stats.total ?? rows.length : '…', hint: 'All time', tint: 'purple', icon: 'book' },
    { label: 'Classes', value: data ? stats.classes ?? classes.length : '…', hint: 'Active classes', tint: 'green', icon: 'school' },
    { label: 'Teachers', value: data ? stats.teachers ?? 0 : '…', hint: 'Assigned', tint: 'orange', icon: 'user' },
    { label: 'Students', value: data ? stats.students ?? 0 : '…', hint: 'Enrolled', tint: 'sky', icon: 'people' },
    { label: 'Assignments', value: data ? stats.assignments ?? 0 : '…', hint: 'Created', tint: 'rose', icon: 'clip' },
    { label: 'Assessments', value: data ? stats.assessments ?? 0 : '…', hint: 'Recorded', tint: 'teal', icon: 'chart' },
  ];

  const addButton = (id) => (
    <div className="sa-users-add sa-subj-split">
      <button type="button" className="sa-btn sa-btn-primary" onClick={() => startCreate()}>
        <SubjIcon name="plus" />
        Add to class
      </button>
      <button
        type="button"
        className="sa-btn sa-btn-primary sa-subj-split-caret"
        aria-label="Choose class"
        onClick={(e) => {
          e.stopPropagation();
          setShowAddMenu((cur) => (cur === id ? '' : id));
        }}
      >
        <SubjIcon name="caret" />
      </button>
      {showAddMenu === id && (
        <div className="sa-users-add-menu" onClick={(e) => e.stopPropagation()}>
          {classes.length ? (
            classes.map((c) => (
              <button key={c.id} type="button" onClick={() => startCreate(c.id)}>
                {c.grade || c.name || 'Class'}
              </button>
            ))
          ) : (
            <button type="button" onClick={() => startCreate()}>
              Create a class first
            </button>
          )}
        </div>
      )}
    </div>
  );

  return (
    <div className="sa-students sa-users sa-subj">
      {error && <div className="alert">{error}</div>}

      <div className="sa-subj-top">
        <p className="sa-set-alert sa-subj-banner">
          <SubjIcon name="info" />
          Subjects come from class lists, student records, assignments, and assessments. Nothing here is invented.
        </p>
        {addButton('head')}
      </div>

      <section className="sa-stu-kpis sa-subj-kpis" aria-label="Subject metrics">
        {kpis.map((m) => (
          <article key={m.label} className={`sa-stu-kpi tint-${m.tint}`}>
            <i className="sa-stu-kpi-icon" aria-hidden="true">
              <SubjIcon name={m.icon} />
            </i>
            <div>
              <span>{m.label}</span>
              <strong>{m.value}</strong>
              <em>{m.hint}</em>
            </div>
          </article>
        ))}
      </section>

      <article className="sa-card sa-stu-table-card">
        <div className="sa-subj-toolbar">
          <label className="sa-assign-search">
            <SubjIcon name="search" />
            <input
              value={q}
              onChange={(e) => {
                setQ(e.target.value);
                setPage(1);
              }}
              placeholder="Search subjects..."
              aria-label="Search subjects"
            />
          </label>
          <select
            value={klass}
            onChange={(e) => {
              setKlass(e.target.value);
              setPage(1);
            }}
            aria-label="Class"
          >
            <option value="">All classes</option>
            {classes.map((c) => (
              <option key={c.id} value={c.grade}>
                {c.grade}
              </option>
            ))}
          </select>
          <select
            value={teacher}
            onChange={(e) => {
              setTeacher(e.target.value);
              setPage(1);
            }}
            aria-label="Teacher"
          >
            <option value="">All teachers</option>
            {teacherNames.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
          <button type="button" className="sa-btn sa-btn-outline" onClick={() => setMore((v) => !v)}>
            <SubjIcon name="filter" />
            Filters
          </button>
          <button type="button" className="sa-assign-reset" onClick={resetFilters}>
            Reset
          </button>
        </div>

        {more && (
          <div className="sa-subj-more">
            <label className="sa-set-check">
              <input type="checkbox" checked={hasStudents} onChange={(e) => setHasStudents(e.target.checked)} />
              <span>Only subjects with enrolled students</span>
            </label>
          </div>
        )}

        <div className="sa-table-wrap">
          <table className="sa-table sa-stu-table sa-subj-table">
            <thead>
              <tr>
                {[
                  ['name', 'Subject'],
                  ['classes', 'Classes'],
                  ['teachers', 'Teachers'],
                  ['studentCount', 'Students'],
                  ['assignmentCount', 'Assignments'],
                  ['assessmentCount', 'Assessments'],
                ].map(([key, label]) => (
                  <th key={key}>
                    <button type="button" className="sa-assign-sort" onClick={() => toggleSort(key)}>
                      {label}
                      <SubjIcon name="sort" />
                    </button>
                  </th>
                ))}
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {slice.map((r) => (
                <tr key={r.name}>
                  <td>
                    <strong>{r.name}</strong>
                  </td>
                  <td>{r.classes.length ? r.classes.join(', ') : '—'}</td>
                  <td>{r.teachers.length ? r.teachers.join(', ') : '—'}</td>
                  <td>{r.studentCount}</td>
                  <td>{r.assignmentCount}</td>
                  <td>{r.assessmentCount}</td>
                  <td>
                    <div className="sa-inc-row-actions">
                      <button
                        type="button"
                        className="sa-icon-btn"
                        aria-label={`Actions for ${r.name}`}
                        onClick={(e) => {
                          e.stopPropagation();
                          setMenuId((id) => (id === r.name ? '' : r.name));
                        }}
                      >
                        ⋮
                      </button>
                      {menuId === r.name && (
                        <div className="sa-inc-menu" onClick={(e) => e.stopPropagation()}>
                          {classes
                            .filter((c) => r.classes.includes(c.grade))
                            .map((c) => (
                              <button key={c.id} type="button" onClick={() => remove(r.name, c.id)}>
                                Remove from {c.grade}
                              </button>
                            ))}
                          {!classes.some((c) => r.classes.includes(c.grade)) && (
                            <button type="button" disabled>
                              Not attached to a class
                            </button>
                          )}
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
            <strong>{rows.length ? 'No matching subjects' : 'No subjects available'}</strong>
            <p>{rows.length ? 'Try another search or reset the filters.' : 'Add subjects to classes to get started.'}</p>
            {!rows.length && addButton('empty')}
          </div>
        )}

        <div className="sa-table-foot sa-stu-foot sa-inc-foot">
          <span>
            Showing {from} to {to} of {filtered.length} subjects
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
            <h3>Add subject to a class</h3>
            <label>
              Subject name
              <input required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
            </label>
            <label>
              Class
              <select required value={form.classId} onChange={(e) => setForm({ ...form, classId: e.target.value })}>
                <option value="">Select…</option>
                {classes.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.grade}
                  </option>
                ))}
              </select>
            </label>
            {!classes.length && <p className="sa-muted">Create a class first, then attach subjects to it.</p>}
            <label>
              Teacher name (optional)
              <input value={form.teacherName} onChange={(e) => setForm({ ...form, teacherName: e.target.value })} />
            </label>
            <div className="sa-reports-actions">
              <button type="button" className="sa-btn sa-btn-outline" onClick={() => setOpen(false)}>
                Cancel
              </button>
              <button className="sa-btn sa-btn-primary" type="submit" disabled={saving || !classes.length}>
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
