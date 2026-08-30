import { useEffect, useMemo, useState } from 'react';
import { useOutletContext } from 'react-router-dom';
import { api } from '../../lib/api';

const PAGE_SIZES = [10, 25, 50];
const empty = {
  grade: '',
  classCode: '',
  classroom: '',
  section: '',
  academicYear: '',
  teacherId: '',
  assistantName: '',
  capacity: 30,
  description: '',
};

function initials(text = '') {
  const parts = String(text).trim().split(/\s+/).filter(Boolean);
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
  const compact = String(text).replace(/[^A-Za-z0-9]/g, '');
  return (compact.slice(0, 2) || '?').toUpperCase();
}

function classLabel(c) {
  return [c.grade, c.section].filter(Boolean).join(' ');
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

function ClsIcon({ name }) {
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
  if (name === 'board') {
    return (
      <svg {...p}>
        <rect x="4" y="5" width="16" height="11" rx="1.6" />
        <path d="M8 20h8M12 16v4" />
        <path d="M8 9.2h8M8 12.2h5" />
      </svg>
    );
  }
  if (name === 'house') {
    return (
      <svg {...p}>
        <path d="M4 11.2 12 5l8 6.2V20H4v-8.8Z" />
        <path d="M10 20v-6h4v6" />
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
  if (name === 'pencil') return <svg {...p}><path d="M4 16.8 15.6 5.2a1.8 1.8 0 0 1 2.5 0l.7.7a1.8 1.8 0 0 1 0 2.5L7.2 20H4v-3.2Z" /></svg>;
  if (name === 'caret') return <svg {...p} width={12} height={12}><path d="m6 9 5-6H1l5 6Z" fill="currentColor" stroke="none" /></svg>;
  if (name === 'sort') return <svg {...p} width={10} height={10}><path d="M5 1.6 7.6 5H2.4L5 1.6ZM5 8.4 2.4 5h5.2L5 8.4Z" fill="currentColor" stroke="none" /></svg>;
  return null;
}

export default function Classes() {
  const { schoolName = '', globalSearch = '' } = useOutletContext() || {};
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [q, setQ] = useState('');
  const [teacherId, setTeacherId] = useState('');
  const [level, setLevel] = useState('');
  const [more, setMore] = useState(false);
  const [onlyAssigned, setOnlyAssigned] = useState(false);
  const [sort, setSort] = useState({ key: 'grade', dir: 'asc' });
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [form, setForm] = useState(empty);
  const [editing, setEditing] = useState(null);
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [showAddMenu, setShowAddMenu] = useState(false);
  const [menuId, setMenuId] = useState('');
  const year = new Date().getFullYear();

  const load = async () => {
    setData(await api('/admin/classes'));
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

  const startCreate = (preset = {}) => {
    setEditing(null);
    setForm({ ...empty, ...preset });
    setShowAddMenu(false);
    setOpen(true);
  };

  const startEdit = (c) => {
    setEditing(c);
    setForm({
      grade: c.grade,
      classCode: c.classCode,
      classroom: c.classroom,
      section: c.section,
      academicYear: c.academicYear,
      teacherId: c.teacherId,
      assistantName: c.assistantName,
      capacity: c.capacity,
      description: c.description,
    });
    setMenuId('');
    setOpen(true);
  };

  const save = async (e) => {
    e.preventDefault();
    setSaving(true);
    setError('');
    try {
      if (editing) await api(`/admin/classes/${editing.id}`, { method: 'PUT', body: form });
      else await api('/admin/classes', { method: 'POST', body: form });
      setOpen(false);
      setNotice(editing ? 'Class updated.' : 'Class created.');
      await load();
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  const remove = async (c) => {
    if (!window.confirm(`Deactivate ${c.grade}? Students are not deleted.`)) return;
    try {
      await api(`/admin/classes/${c.id}`, { method: 'DELETE' });
      setMenuId('');
      await load();
    } catch (err) {
      setError(err.message);
    }
  };

  const rows = data?.classes || [];
  const teachers = data?.teachers || [];
  const levels = useMemo(() => [...new Set(rows.map((c) => c.grade).filter(Boolean))].sort(), [rows]);
  const missingGrades = useMemo(() => {
    const have = new Set(rows.map((c) => c.grade));
    return (data?.grades || []).filter((g) => !have.has(g));
  }, [data, rows]);

  const filtered = useMemo(() => {
    const term = q.trim().toLowerCase();
    const list = rows.filter((c) => {
      if (teacherId && c.teacherId !== teacherId) return false;
      if (level && c.grade !== level) return false;
      if (onlyAssigned && !c.teacherId) return false;
      if (!term) return true;
      return [c.grade, c.section, c.classCode, c.classroom, c.teacherName, classLabel(c)]
        .some((v) => String(v || '').toLowerCase().includes(term));
    });
    const dir = sort.dir === 'desc' ? -1 : 1;
    list.sort((a, b) => {
      const rawA = sort.key === 'label' ? classLabel(a) : a[sort.key];
      const rawB = sort.key === 'label' ? classLabel(b) : b[sort.key];
      const av = Array.isArray(rawA) ? rawA.join(', ').toLowerCase() : typeof rawA === 'number' ? rawA : String(rawA || '').toLowerCase();
      const bv = Array.isArray(rawB) ? rawB.join(', ').toLowerCase() : typeof rawB === 'number' ? rawB : String(rawB || '').toLowerCase();
      if (av < bv) return -1 * dir;
      if (av > bv) return 1 * dir;
      return 0;
    });
    return list;
  }, [rows, q, teacherId, level, onlyAssigned, sort]);

  const pages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const safePage = Math.min(page, pages);
  const slice = filtered.slice((safePage - 1) * pageSize, safePage * pageSize);
  const from = slice.length ? (safePage - 1) * pageSize + 1 : 0;
  const to = Math.min(filtered.length, safePage * pageSize);

  const resetFilters = () => {
    setQ('');
    setTeacherId('');
    setLevel('');
    setOnlyAssigned(false);
    setPage(1);
  };

  const toggleSort = (key) => {
    setSort((s) => (s.key === key ? { key, dir: s.dir === 'asc' ? 'desc' : 'asc' } : { key, dir: 'asc' }));
  };

  const stats = data?.stats || {};
  const houseCount = data ? stats.houses ?? data.houses?.length ?? 0 : null;
  const kpis = [
    { label: 'Total Classes', value: data ? stats.total ?? rows.length : '…', hint: 'All classes', tint: 'purple', icon: 'people' },
    { label: 'Teachers', value: data ? stats.teachers ?? 0 : '…', hint: 'Assigned to classes', tint: 'green', icon: 'board' },
    { label: 'Houses on records', value: data ? houseCount : '…', hint: houseCount ? `${houseCount} stored` : 'None stored', tint: 'orange', icon: 'house' },
  ];

  return (
    <div className="sa-students sa-users sa-cls">
      {error && <div className="alert">{error}</div>}
      {notice && <div className="alert alert-ok">{notice}</div>}

      <div className="sa-subj-top">
        <p className="sa-set-alert sa-subj-banner">
          <ClsIcon name="info" />
          Classes match student grades. Grades already on student records are added here automatically.
        </p>
        <div className="sa-users-add sa-subj-split">
          <button type="button" className="sa-btn sa-btn-primary" onClick={() => startCreate()}>
            <ClsIcon name="plus" />
            Add class
          </button>
          <button
            type="button"
            className="sa-btn sa-btn-primary sa-subj-split-caret"
            aria-label="More class options"
            onClick={(e) => {
              e.stopPropagation();
              setShowAddMenu((v) => !v);
            }}
          >
            <ClsIcon name="caret" />
          </button>
          {showAddMenu && (
            <div className="sa-users-add-menu" onClick={(e) => e.stopPropagation()}>
              <button type="button" onClick={() => startCreate()}>
                New class
              </button>
              {missingGrades.map((g) => (
                <button key={g} type="button" onClick={() => startCreate({ grade: g })}>
                  Add {g}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      <section className="sa-stu-kpis sa-cls-kpis" aria-label="Class metrics">
        {kpis.map((m) => (
          <article key={m.label} className={`sa-stu-kpi tint-${m.tint}`}>
            <i className="sa-stu-kpi-icon" aria-hidden="true">
              <ClsIcon name={m.icon} />
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
        <div className="sa-cls-toolbar">
          <label className="sa-assign-search">
            <ClsIcon name="search" />
            <input
              value={q}
              onChange={(e) => {
                setQ(e.target.value);
                setPage(1);
              }}
              placeholder="Search classes..."
              aria-label="Search classes"
            />
          </label>
          <select
            value={teacherId}
            onChange={(e) => {
              setTeacherId(e.target.value);
              setPage(1);
            }}
            aria-label="Teacher"
          >
            <option value="">All teachers</option>
            {teachers.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </select>
          <select
            value={level}
            onChange={(e) => {
              setLevel(e.target.value);
              setPage(1);
            }}
            aria-label="Level"
          >
            <option value="">All levels</option>
            {levels.map((g) => (
              <option key={g} value={g}>
                {g}
              </option>
            ))}
          </select>
          <button type="button" className="sa-btn sa-btn-outline" onClick={() => setMore((v) => !v)}>
            <ClsIcon name="filter" />
            Filters
          </button>
        </div>

        {more && (
          <div className="sa-subj-more">
            <label className="sa-set-check">
              <input type="checkbox" checked={onlyAssigned} onChange={(e) => setOnlyAssigned(e.target.checked)} />
              <span>Only classes with a teacher</span>
            </label>
            <button type="button" className="sa-assign-reset" onClick={resetFilters}>
              Reset
            </button>
          </div>
        )}

        <div className="sa-table-wrap">
          <table className="sa-table sa-stu-table sa-cls-table">
            <thead>
              <tr>
                {[
                  ['label', 'Class'],
                  ['classCode', 'Code'],
                  ['classroom', 'Room'],
                  ['teacherName', 'Teacher'],
                  ['studentCount', 'Students'],
                  ['houses', 'Houses'],
                ].map(([key, label]) => (
                  <th key={key}>
                    <button type="button" className="sa-assign-sort" onClick={() => toggleSort(key)}>
                      {label}
                      <ClsIcon name="sort" />
                    </button>
                  </th>
                ))}
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {slice.map((c) => {
                const label = classLabel(c);
                const n = c.studentCount ?? 0;
                return (
                  <tr key={c.id}>
                    <td>
                      <div className="sa-cls-person">
                        <span className="sa-cls-avatar" aria-hidden="true">
                          {initials(label)}
                        </span>
                        <div>
                          <strong>{label}</strong>
                          <span className={`sa-stu-status is-${c.active === false ? 'inactive' : 'active'}`}>
                            {c.active === false ? 'Inactive' : 'Active'}
                          </span>
                        </div>
                      </div>
                    </td>
                    <td>{c.classCode || '—'}</td>
                    <td>{c.classroom || '—'}</td>
                    <td>
                      {c.teacherName ? (
                        <div className="sa-cls-person">
                          <span className="sa-cls-avatar is-teacher" aria-hidden="true">
                            {c.teacherPhotoUrl ? <img src={c.teacherPhotoUrl} alt="" /> : initials(c.teacherName)}
                          </span>
                          <strong>{c.teacherName}</strong>
                        </div>
                      ) : (
                        '—'
                      )}
                    </td>
                    <td>
                      <span className="sa-cls-students">
                        <ClsIcon name="people" />
                        {n} {n === 1 ? 'Student' : 'Students'}
                      </span>
                    </td>
                    <td className="sa-cls-houses">
                      {c.houses?.length ? c.houses.join(', ') : '— None assigned'}
                    </td>
                    <td>
                      <div className="sa-cls-actions">
                        <button type="button" className="sa-btn sa-btn-outline sa-cls-edit" onClick={() => startEdit(c)}>
                          <ClsIcon name="pencil" />
                          Edit
                        </button>
                        <div className="sa-inc-row-actions">
                          <button
                            type="button"
                            className="sa-icon-btn"
                            aria-label={`More for ${label}`}
                            onClick={(e) => {
                              e.stopPropagation();
                              setMenuId((id) => (id === c.id ? '' : c.id));
                            }}
                          >
                            ⋮
                          </button>
                          {menuId === c.id && (
                            <div className="sa-inc-menu" onClick={(e) => e.stopPropagation()}>
                              <button type="button" onClick={() => startEdit(c)}>
                                Edit
                              </button>
                              <button type="button" onClick={() => remove(c)}>
                                Deactivate
                              </button>
                            </div>
                          )}
                        </div>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {!filtered.length && (
          <div className="sa-assign-empty">
            <strong>{rows.length ? 'No matching classes' : 'No classes yet'}</strong>
            <p>
              {rows.length
                ? 'Try another search or reset the filters.'
                : 'Grades on student records appear here automatically, or add a class.'}
            </p>
            {!rows.length && (
              <button type="button" className="sa-btn sa-btn-primary" onClick={() => startCreate()}>
                <ClsIcon name="plus" />
                Add class
              </button>
            )}
          </div>
        )}

        <div className="sa-table-foot sa-stu-foot sa-inc-foot">
          <span>
            Showing {from} to {to} of {filtered.length} {filtered.length === 1 ? 'class' : 'classes'}
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
              {pageItems(safePage, pages).map((item, i) =>
                item === '…' ? (
                  <span key={`e${i}`}>…</span>
                ) : (
                  <button key={item} type="button" className={item === safePage ? 'is-on' : ''} onClick={() => setPage(item)}>
                    {item}
                  </button>
                )
              )}
              <button type="button" disabled={safePage >= pages} onClick={() => setPage(safePage + 1)} aria-label="Next page">
                ›
              </button>
            </div>
          </div>
        </div>
      </article>

      {open && (
        <div className="sa-reports-modal" role="dialog" aria-modal="true" aria-labelledby="class-form-title">
          <form className="sa-card sa-modal-form" onSubmit={save}>
            <header className="sa-modal-head">
              <h3 id="class-form-title">{editing ? 'Edit class' : 'Add class'}</h3>
              <p className="sa-muted">Define the grade, section, room, and class teacher.</p>
            </header>
            <div className="sa-modal-body">
              <label>
                Grade / class name
                <input
                  required
                  value={form.grade}
                  onChange={(e) => setForm({ ...form, grade: e.target.value })}
                  placeholder="e.g. Grade 4"
                />
              </label>
              <div className="sa-modal-grid2">
                <label>
                  Class code
                  <input
                    value={form.classCode}
                    onChange={(e) => setForm({ ...form, classCode: e.target.value })}
                    placeholder="e.g. G4"
                  />
                </label>
                <label>
                  Classroom
                  <input
                    value={form.classroom}
                    onChange={(e) => setForm({ ...form, classroom: e.target.value })}
                    placeholder="e.g. Room 1"
                  />
                </label>
              </div>
              <div className="sa-modal-grid2">
                <label>
                  Section
                  <input
                    value={form.section}
                    onChange={(e) => setForm({ ...form, section: e.target.value })}
                    placeholder="e.g. A"
                  />
                </label>
                <label>
                  Academic year
                  <input
                    value={form.academicYear}
                    onChange={(e) => setForm({ ...form, academicYear: e.target.value })}
                    placeholder={`e.g. ${year}`}
                  />
                </label>
              </div>
              <label>
                Class teacher
                <select value={form.teacherId} onChange={(e) => setForm({ ...form, teacherId: e.target.value })}>
                  <option value="">Not assigned</option>
                  {teachers.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.name}
                    </option>
                  ))}
                </select>
              </label>
              <div className="sa-modal-grid2">
                <label>
                  Assistant
                  <input
                    value={form.assistantName}
                    onChange={(e) => setForm({ ...form, assistantName: e.target.value })}
                    placeholder="Optional"
                  />
                </label>
                <label>
                  Capacity
                  <input
                    type="number"
                    min="1"
                    max="80"
                    value={form.capacity}
                    onChange={(e) => setForm({ ...form, capacity: e.target.value })}
                  />
                </label>
              </div>
              <label>
                Description
                <textarea
                  rows={3}
                  value={form.description}
                  onChange={(e) => setForm({ ...form, description: e.target.value })}
                  placeholder="Optional notes about this class"
                />
              </label>
            </div>
            <div className="sa-reports-actions">
              <button type="button" className="sa-btn sa-btn-outline" onClick={() => setOpen(false)}>
                Cancel
              </button>
              <button className="sa-btn sa-btn-primary" type="submit" disabled={saving}>
                {saving ? 'Saving…' : 'Save class'}
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
