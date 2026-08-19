import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useOutletContext, useSearchParams } from 'react-router-dom';
import { api } from '../../lib/api';
import MediaPicker from '../../components/MediaPicker';

const PAGE_SIZES = [10, 25, 50];
const emptyForm = {
  name: '',
  email: '',
  phone: '',
  password: 'password123',
  employeeId: '',
  department: '',
  qualification: '',
  jobTitle: '',
  gender: '',
  active: true,
  photo: null,
};

function initials(name = '') {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return '?';
  if (parts.length === 1) return parts[0][0].toUpperCase();
  return (parts[0][0] + parts[1][0]).toUpperCase();
}

function pct(part, total) {
  if (!total) return '0%';
  return `${((part / total) * 100).toFixed(1)}%`;
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

function teacherId(t) {
  return t.id || t._id;
}

function employeeNo(t) {
  return t.employeeId || t.idNumber || '';
}

function teacherStatus(t) {
  if (t.active === false) return { key: 'inactive', label: 'Inactive' };
  return { key: 'active', label: 'Active' };
}

export default function Teachers() {
  const { globalSearch = '' } = useOutletContext() || {};
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const openedEdit = useRef('');
  const [teachers, setTeachers] = useState([]);
  const [stats, setStats] = useState(null);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [q, setQ] = useState('');
  const [department, setDepartment] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [qualification, setQualification] = useState('');
  const [genderFilter, setGenderFilter] = useState('');
  const [moreFilters, setMoreFilters] = useState(false);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [selected, setSelected] = useState(() => new Set());
  const [menuId, setMenuId] = useState('');
  const [panel, setPanel] = useState(null);
  const [editingId, setEditingId] = useState(null);
  const [form, setForm] = useState(emptyForm);

  const load = async () => {
    const data = await api('/admin/teachers');
    setTeachers(data.teachers || []);
    setStats(data.stats || null);
  };

  useEffect(() => {
    load().catch((e) => setError(e.message));
  }, []);

  useEffect(() => {
    if (globalSearch) setQ(globalSearch);
  }, [globalSearch]);

  useEffect(() => {
    const close = () => setMenuId('');
    window.addEventListener('click', close);
    return () => window.removeEventListener('click', close);
  }, []);

  const departments = useMemo(
    () => [...new Set(teachers.map((t) => t.department).filter(Boolean))].sort(),
    [teachers]
  );
  const qualifications = useMemo(
    () => [...new Set(teachers.map((t) => t.qualification).filter(Boolean))].sort(),
    [teachers]
  );

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return teachers.filter((t) => {
      if (department && t.department !== department) return false;
      if (qualification && t.qualification !== qualification) return false;
      if (genderFilter && t.gender !== genderFilter) return false;
      const status = teacherStatus(t).key;
      if (statusFilter && status !== statusFilter) return false;
      if (!needle) return true;
      const hay = [t.name, t.email, t.phone, employeeNo(t), t.department, t.qualification, t.jobTitle]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();
      return hay.includes(needle);
    });
  }, [teachers, q, department, qualification, genderFilter, statusFilter]);

  const pages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const safePage = Math.min(page, pages);
  const slice = filtered.slice((safePage - 1) * pageSize, safePage * pageSize);

  useEffect(() => {
    setPage(1);
  }, [q, department, qualification, genderFilter, statusFilter, pageSize]);

  const allOnPageSelected = slice.length > 0 && slice.every((t) => selected.has(teacherId(t)));

  const toggleAllPage = () => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (allOnPageSelected) slice.forEach((t) => next.delete(teacherId(t)));
      else slice.forEach((t) => next.add(teacherId(t)));
      return next;
    });
  };

  const toggleRow = (id) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const closePanel = () => {
    setPanel(null);
    setEditingId(null);
    setForm(emptyForm);
    if (params.get('edit')) {
      openedEdit.current = '';
      navigate('/school-admin/teachers', { replace: true });
    }
  };

  const startCreate = () => {
    setError('');
    setSuccess('');
    setEditingId(null);
    setForm(emptyForm);
    setPanel('form');
  };

  const startEdit = (t) => {
    setError('');
    setSuccess('');
    setEditingId(teacherId(t));
    setForm({
      name: t.name || '',
      email: t.email || '',
      phone: t.phone || '',
      password: '',
      employeeId: employeeNo(t),
      department: t.department || '',
      qualification: t.qualification || '',
      jobTitle: t.jobTitle || '',
      gender: t.gender || '',
      active: t.active !== false,
      photo: t.photoUrl ? { url: t.photoUrl, publicId: t.photoPublicId || '' } : null,
    });
    setPanel('form');
  };

  useEffect(() => {
    const editId = params.get('edit');
    if (!editId || !teachers.length || openedEdit.current === editId) return;
    const teacher = teachers.find((t) => teacherId(t) === editId);
    if (teacher) {
      openedEdit.current = editId;
      startEdit(teacher);
    }
  }, [params, teachers]);

  const submit = async () => {
    setError('');
    setSuccess('');
    try {
      const body = {
        name: form.name,
        email: form.email,
        phone: form.phone,
        employeeId: form.employeeId,
        department: form.department,
        qualification: form.qualification,
        jobTitle: form.jobTitle,
        gender: form.gender,
        active: form.active,
        photoUrl: form.photo?.url || '',
        photoPublicId: form.photo?.publicId || '',
      };
      if (form.password) body.password = form.password;
      if (editingId) {
        await api(`/admin/teachers/${editingId}`, { method: 'PUT', body });
        setSuccess(`${form.name} updated.`);
      } else {
        await api('/admin/teachers', { method: 'POST', body: { ...body, password: form.password || 'password123' } });
        setSuccess(`${form.name} added.`);
      }
      closePanel();
      await load();
    } catch (e) {
      setError(e.message);
    }
  };

  const setActive = async (t, next) => {
    try {
      await api(`/admin/teachers/${teacherId(t)}`, { method: 'PUT', body: { active: next } });
      await load();
    } catch (e) {
      setError(e.message);
    }
  };

  const remove = async (t) => {
    if (!confirm(`Remove ${t.name}?`)) return;
    try {
      await api(`/admin/teachers/${teacherId(t)}`, { method: 'DELETE' });
      if (editingId === teacherId(t)) closePanel();
      setSuccess(`${t.name} removed.`);
      await load();
    } catch (e) {
      setError(e.message);
    }
  };

  const exportRows = () => {
    const rows = selected.size ? filtered.filter((t) => selected.has(teacherId(t))) : filtered;
    const header = ['Name', 'Email', 'Phone', 'Employee ID', 'Department', 'Qualification', 'Status'];
    const lines = [
      header.join(','),
      ...rows.map((t) =>
        [
          csvEscape(t.name),
          csvEscape(t.email),
          csvEscape(t.phone),
          csvEscape(employeeNo(t)),
          csvEscape(t.department),
          csvEscape(t.qualification),
          csvEscape(teacherStatus(t).label),
        ].join(',')
      ),
    ];
    const blob = new Blob([lines.join('\n')], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'teachers.csv';
    a.click();
    URL.revokeObjectURL(url);
  };

  const kpis = [
    {
      label: 'Total Teachers',
      value: stats?.total ?? teachers.length,
      hint: stats?.addedThisMonth ? `↑ ${stats.addedThisMonth} this month` : 'No change this month',
      up: Boolean(stats?.addedThisMonth),
      tint: 'purple',
    },
    {
      label: 'Active Teachers',
      value: stats?.active ?? teachers.filter((t) => t.active !== false).length,
      hint: pct(stats?.active ?? 0, stats?.total || teachers.length),
      up: true,
      tint: 'green',
    },
    {
      label: 'On Duty Today',
      value: stats?.onDutyToday ?? 0,
      hint: `${pct(stats?.onDutyToday ?? 0, stats?.total || teachers.length)} marked register`,
      tint: 'orange',
    },
    {
      label: 'Female Teachers',
      value: stats?.female ?? 0,
      hint: pct(stats?.female ?? 0, stats?.total || teachers.length),
      tint: 'violet',
    },
    {
      label: 'Male Teachers',
      value: stats?.male ?? 0,
      hint: pct(stats?.male ?? 0, stats?.total || teachers.length),
      tint: 'rose',
    },
  ];

  const canSave = Boolean(form.name.trim() && form.email.trim() && (editingId || form.password));

  return (
    <div className="sa-students">
      {error && <div className="alert">{error}</div>}
      {success && <div className="alert alert-ok">{success}</div>}

      <div className="sa-sd-top">
        <span />
        <div className="sa-sd-top-actions">
          <button type="button" className="sa-btn sa-btn-outline sa-stu-export" onClick={exportRows}>
            Export
          </button>
          <button type="button" className="sa-btn sa-btn-primary" onClick={startCreate}>
            + Add Teacher
          </button>
        </div>
      </div>

      <section className="sa-stu-kpis sa-tch-kpis" aria-label="Teacher metrics">
        {kpis.map((m) => (
          <article key={m.label} className={`sa-stu-kpi tint-${m.tint}`}>
            <div>
              <span>{m.label}</span>
              <strong>{m.value}</strong>
              <em className={m.up ? 'is-up' : ''}>{m.hint}</em>
            </div>
            <i className="sa-stu-kpi-icon" aria-hidden="true" />
          </article>
        ))}
      </section>

      <section className="sa-card sa-stu-table-card">
        <div className="sa-stu-toolbar sa-tch-toolbar">
          <label className="sa-stu-search">
            <span aria-hidden="true">⌕</span>
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Search by name, email or phone..."
            />
          </label>
          <select value={department} onChange={(e) => setDepartment(e.target.value)} aria-label="Department">
            <option value="">All Departments</option>
            {departments.map((d) => (
              <option key={d} value={d}>
                {d}
              </option>
            ))}
          </select>
          <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} aria-label="Status">
            <option value="">All Status</option>
            <option value="active">Active</option>
            <option value="inactive">Inactive</option>
          </select>
          <select value={qualification} onChange={(e) => setQualification(e.target.value)} aria-label="Qualification">
            <option value="">All Qualifications</option>
            {qualifications.map((d) => (
              <option key={d} value={d}>
                {d}
              </option>
            ))}
          </select>
          <button type="button" className="sa-btn sa-btn-outline" onClick={() => setMoreFilters((v) => !v)}>
            More Filters
          </button>
        </div>
        {moreFilters && (
          <div className="sa-tch-more">
            <select value={genderFilter} onChange={(e) => setGenderFilter(e.target.value)} aria-label="Gender">
              <option value="">All genders</option>
              <option value="female">Female</option>
              <option value="male">Male</option>
              <option value="other">Other</option>
            </select>
          </div>
        )}

        <div className="sa-table-wrap">
          <table className="sa-table sa-stu-table">
            <thead>
              <tr>
                <th>
                  <input type="checkbox" checked={allOnPageSelected} onChange={toggleAllPage} aria-label="Select page" />
                </th>
                <th>Teacher</th>
                <th>Employee ID</th>
                <th>Department</th>
                <th>Qualification</th>
                <th>Phone / Email</th>
                <th>Status</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {slice.map((t) => {
                const status = teacherStatus(t);
                const id = teacherId(t);
                return (
                  <tr key={id}>
                    <td>
                      <input
                        type="checkbox"
                        checked={selected.has(id)}
                        onChange={() => toggleRow(id)}
                        aria-label={`Select ${t.name}`}
                      />
                    </td>
                    <td>
                      <div className="sa-stu-person">
                        {t.photoUrl ? <img src={t.photoUrl} alt="" /> : <span>{initials(t.name)}</span>}
                        <div>
                          <strong>{t.name}</strong>
                          <small>{t.email}</small>
                        </div>
                      </div>
                    </td>
                    <td>{employeeNo(t) || '—'}</td>
                    <td>{t.department || '—'}</td>
                    <td>{t.qualification || '—'}</td>
                    <td>
                      {t.phone || t.email ? (
                        <span>
                          {t.phone || '—'}
                          {t.email ? <small className="sa-stu-phone">{t.email}</small> : null}
                        </span>
                      ) : (
                        '—'
                      )}
                    </td>
                    <td>
                      <span className={`sa-stu-status is-${status.key}`}>{status.label}</span>
                    </td>
                    <td>
                      <div className="sa-stu-actions">
                        <button
                          type="button"
                          className="sa-icon-ghost is-view"
                          aria-label="View"
                          onClick={() => navigate(`/school-admin/teachers/${id}`)}
                        >
                          ◉
                        </button>
                        <button type="button" className="sa-icon-ghost is-edit" aria-label="Edit" onClick={() => startEdit(t)}>
                          ✎
                        </button>
                        <div className="sa-stu-more">
                          <button
                            type="button"
                            className="sa-icon-ghost"
                            aria-label="More"
                            onClick={(e) => {
                              e.stopPropagation();
                              e.nativeEvent.stopImmediatePropagation();
                              setMenuId((cur) => (cur === id ? '' : id));
                            }}
                          >
                            ⋮
                          </button>
                          {menuId === id && (
                            <div className="sa-stu-menu" onClick={(e) => e.stopPropagation()}>
                              <button type="button" onClick={() => { setActive(t, t.active === false); setMenuId(''); }}>
                                {t.active === false ? 'Activate' : 'Deactivate'}
                              </button>
                              <button type="button" className="is-danger" onClick={() => { setMenuId(''); remove(t); }}>
                                Delete
                              </button>
                            </div>
                          )}
                        </div>
                      </div>
                    </td>
                  </tr>
                );
              })}
              {!slice.length && (
                <tr>
                  <td colSpan={8} className="sa-stu-empty">
                    No teachers match these filters.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        <div className="sa-table-foot sa-stu-foot">
          <span>
            Showing {filtered.length ? (safePage - 1) * pageSize + 1 : 0} to{' '}
            {Math.min(safePage * pageSize, filtered.length)} of {filtered.length} teachers
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
      </section>

      {panel === 'form' && (
        <aside className="sa-drawer sa-drawer-wide" aria-label={editingId ? 'Edit teacher' : 'Add teacher'}>
          <div className="sa-drawer-head">
            <h2>{editingId ? 'Edit teacher' : 'Add teacher'}</h2>
            <button type="button" className="sa-btn sa-btn-ghost" onClick={closePanel}>
              Close
            </button>
          </div>
          {error && <div className="alert">{error}</div>}
          <label className="sa-field">
            <span>Name</span>
            <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required />
          </label>
          <label className="sa-field">
            <span>Email</span>
            <input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} required />
          </label>
          <div className="sa-stu-form-row">
            <label className="sa-field">
              <span>Phone</span>
              <input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
            </label>
            <label className="sa-field">
              <span>Employee ID</span>
              <input value={form.employeeId} onChange={(e) => setForm({ ...form, employeeId: e.target.value })} />
            </label>
          </div>
          <div className="sa-stu-form-row">
            <label className="sa-field">
              <span>Department</span>
              <input value={form.department} onChange={(e) => setForm({ ...form, department: e.target.value })} placeholder="e.g. Mathematics" />
            </label>
            <label className="sa-field">
              <span>Qualification</span>
              <input value={form.qualification} onChange={(e) => setForm({ ...form, qualification: e.target.value })} />
            </label>
          </div>
          <div className="sa-stu-form-row">
            <label className="sa-field">
              <span>Job title</span>
              <input value={form.jobTitle} onChange={(e) => setForm({ ...form, jobTitle: e.target.value })} />
            </label>
            <label className="sa-field">
              <span>Gender</span>
              <select value={form.gender} onChange={(e) => setForm({ ...form, gender: e.target.value })}>
                <option value="">Not set</option>
                <option value="female">Female</option>
                <option value="male">Male</option>
                <option value="other">Other</option>
              </select>
            </label>
          </div>
          <label className="sa-field">
            <span>{editingId ? 'New password (optional)' : 'Password'}</span>
            <input value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} />
          </label>
          <MediaPicker
            label="Photo"
            folder="staff"
            accept="image/*"
            value={form.photo}
            onChange={(photo) => setForm({ ...form, photo })}
          />
          {editingId && (
            <label className="check">
              <input type="checkbox" checked={form.active} onChange={(e) => setForm({ ...form, active: e.target.checked })} />
              Active
            </label>
          )}
          <div className="row-actions">
            <button type="button" className="sa-btn sa-btn-outline" onClick={closePanel}>
              Cancel
            </button>
            <button type="button" className="sa-btn sa-btn-primary" disabled={!canSave} onClick={submit}>
              {editingId ? 'Save teacher' : 'Create teacher'}
            </button>
          </div>
        </aside>
      )}
    </div>
  );
}
