import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useOutletContext, useSearchParams } from 'react-router-dom';
import { api } from '../../lib/api';
import MapView from '../../components/MapView';
import MediaPicker from '../../components/MediaPicker';
import LocationSearch from '../../components/LocationSearch';

const emptyParent = { name: '', email: '', phone: '', password: 'parent123' };
const PAGE_SIZES = [10, 25, 50];

function coordsFromStop(stop) {
  const loc = stop?.location;
  if (!loc) return null;
  if (loc.lat != null && loc.lng != null) {
    return { lat: Number(loc.lat), lng: Number(loc.lng) };
  }
  if (Array.isArray(loc.coordinates) && loc.coordinates.length >= 2) {
    return { lat: Number(loc.coordinates[1]), lng: Number(loc.coordinates[0]) };
  }
  return null;
}

function parentKey(p) {
  return String(p?.id || p?._id || '');
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

function genderLabel(value) {
  if (!value) return '';
  return value.charAt(0).toUpperCase() + value.slice(1);
}

function classLabel(kid) {
  return [kid.grade, kid.section].filter(Boolean).join(' ') || '—';
}

function studentStatus(kid) {
  if (kid.active === false) return { key: 'inactive', label: 'Inactive' };
  if (!kid.routeId) return { key: 'noroute', label: 'No Route' };
  return { key: 'active', label: 'Active' };
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

export default function Kids() {
  const { globalSearch = '' } = useOutletContext() || {};
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const openedEdit = useRef('');
  const [kids, setKids] = useState([]);
  const [stats, setStats] = useState(null);
  const [routes, setRoutes] = useState([]);
  const [parents, setParents] = useState([]);
  const [school, setSchool] = useState(null);
  const [mode, setMode] = useState('create');
  const [panel, setPanel] = useState(null);
  const [viewing, setViewing] = useState(null);
  const [editingId, setEditingId] = useState(null);
  const [step, setStep] = useState(1);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [q, setQ] = useState('');
  const [gradeFilter, setGradeFilter] = useState('');
  const [routeFilter, setRouteFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [selected, setSelected] = useState(() => new Set());
  const [menuId, setMenuId] = useState('');

  const [name, setName] = useState('');
  const [grade, setGrade] = useState('');
  const [section, setSection] = useState('');
  const [admissionNo, setAdmissionNo] = useState('');
  const [gender, setGender] = useState('');
  const [dateOfBirth, setDateOfBirth] = useState('');
  const [active, setActive] = useState(true);
  const [routeMode, setRouteMode] = useState('existing');
  const [routeId, setRouteId] = useState('');
  const [routeName, setRouteName] = useState('');
  const [boarding, setBoarding] = useState({ lat: -1.39, lng: 36.74, stopName: '' });
  const [mapFocus, setMapFocus] = useState(null);
  const [parentMode, setParentMode] = useState('new');
  const [parent, setParent] = useState(emptyParent);
  const [parentIds, setParentIds] = useState([]);
  const [photo, setPhoto] = useState(null);

  const load = async () => {
    const [k, r, p, s] = await Promise.all([
      api('/admin/kids'),
      api('/admin/routes'),
      api('/admin/parents'),
      api('/admin/schools'),
    ]);
    setKids(k.kids || []);
    setStats(k.stats || null);
    setRoutes(r.routes || []);
    setParents(p.parents || []);
    setSchool(s.schools[0] || null);
    setRouteId((id) => id || r.routes[0]?._id || '');
    if (s.schools[0]?.location) {
      setBoarding((b) => ({
        ...b,
        lat: b.lat ?? s.schools[0].location.lat,
        lng: b.lng ?? s.schools[0].location.lng,
      }));
    }
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

  const resetForm = () => {
    setMode('create');
    setEditingId(null);
    setStep(1);
    setName('');
    setGrade('');
    setSection('');
    setAdmissionNo('');
    setGender('');
    setDateOfBirth('');
    setActive(true);
    setRouteMode('existing');
    setRouteName('');
    setBoarding({
      lat: school?.location?.lat ?? -1.39,
      lng: school?.location?.lng ?? 36.74,
      stopName: '',
    });
    setParentMode('new');
    setParent(emptyParent);
    setParentIds([]);
    setPhoto(null);
    setMapFocus(null);
  };

  const startCreate = () => {
    setError('');
    setSuccess('');
    resetForm();
    setPanel('form');
  };

  const startEdit = (kid) => {
    setError('');
    setSuccess('');
    setMode('edit');
    setEditingId(kid._id);
    setStep(1);
    setName(kid.name || '');
    setGrade(kid.grade || '');
    setSection(kid.section || '');
    setAdmissionNo(kid.admissionNo || '');
    setGender(kid.gender || '');
    setDateOfBirth(kid.dateOfBirth ? String(kid.dateOfBirth).slice(0, 10) : '');
    setActive(kid.active !== false);
    setRouteMode('existing');
    setRouteId(kid.routeId?._id || kid.routeId || routes[0]?._id || '');
    setRouteName('');
    const loc = coordsFromStop(kid.homeStopId);
    setBoarding({
      lat: loc?.lat ?? school?.location?.lat ?? -1.39,
      lng: loc?.lng ?? school?.location?.lng ?? 36.74,
      stopName: kid.homeStopId?.name || '',
    });
    setParentMode('existing');
    setParent(emptyParent);
    setParentIds((kid.parentIds || []).map(parentKey).filter(Boolean));
    setPhoto(kid.photoUrl ? { url: kid.photoUrl, publicId: kid.photoPublicId || '' } : null);
    setViewing(null);
    setPanel('form');
  };

  useEffect(() => {
    const editId = params.get('edit');
    if (!editId || !kids.length || openedEdit.current === editId) return;
    const kid = kids.find((k) => k._id === editId);
    if (kid) {
      openedEdit.current = editId;
      startEdit(kid);
    }
  }, [params, kids]);

  const closePanel = () => {
    resetForm();
    setPanel(null);
    setViewing(null);
    if (params.get('edit')) {
      openedEdit.current = '';
      navigate('/school-admin/students', { replace: true });
    }
  };

  const extraFields = () => ({
    section,
    admissionNo,
    gender,
    dateOfBirth: dateOfBirth || null,
  });

  const submitCreate = async () => {
    setError('');
    setSuccess('');
    try {
      const body = {
        name,
        grade,
        ...extraFields(),
        boarding: {
          lat: boarding.lat,
          lng: boarding.lng,
          stopName: boarding.stopName || `${name} boarding`,
        },
        photoUrl: photo?.url || '',
        photoPublicId: photo?.publicId || '',
      };
      if (routeMode === 'existing') body.routeId = routeId;
      else body.routeName = routeName;
      if (parentMode === 'new') body.parent = parent;
      else body.parentIds = parentIds;
      await api('/admin/kids/onboard', { method: 'POST', body });
      setSuccess(`${name} onboarded successfully.`);
      closePanel();
      await load();
    } catch (err) {
      setError(err.message);
    }
  };

  const submitEdit = async () => {
    setError('');
    setSuccess('');
    try {
      const body = {
        name,
        grade,
        ...extraFields(),
        active,
        routeId,
        parentIds,
        boarding: {
          lat: boarding.lat,
          lng: boarding.lng,
          stopName: boarding.stopName || `${name} boarding`,
        },
        photoUrl: photo?.url || '',
        photoPublicId: photo?.publicId || '',
      };
      await api(`/admin/kids/${editingId}`, { method: 'PUT', body });
      setSuccess(`${name} updated.`);
      closePanel();
      await load();
    } catch (err) {
      setError(err.message);
    }
  };

  const remove = async (kid) => {
    if (!confirm(`Remove ${kid.name}?`)) return;
    setError('');
    try {
      await api(`/admin/kids/${kid._id}`, { method: 'DELETE' });
      if (editingId === kid._id) resetForm();
      if (viewing?._id === kid._id) setViewing(null);
      setPanel(null);
      setSuccess(`${kid.name} removed.`);
      await load();
    } catch (err) {
      setError(err.message);
    }
  };

  const setKidActive = async (kid, next) => {
    try {
      await api(`/admin/kids/${kid._id}`, { method: 'PUT', body: { active: next } });
      await load();
    } catch (err) {
      setError(err.message);
    }
  };

  const toggleParent = (id) => {
    setParentIds((ids) => (ids.includes(id) ? ids.filter((x) => x !== id) : [...ids, id]));
  };

  const maxStep = mode === 'edit' ? 3 : 4;
  const canNext = () => {
    if (step === 1) return Boolean(name.trim());
    if (step === 2) {
      if (mode === 'edit') return Boolean(routeId);
      return routeMode === 'existing' ? Boolean(routeId) : Boolean(routeName.trim());
    }
    if (step === 3) return boarding.lat != null && boarding.lng != null;
    if (step === 4) {
      if (parentMode === 'new') return Boolean(parent.name && parent.email && parent.password);
      return parentIds.length > 0;
    }
    return false;
  };
  const canSaveEdit = () => Boolean(name.trim() && routeId && boarding.lat != null && boarding.lng != null);

  const grades = useMemo(
    () => [...new Set(kids.map((k) => k.grade).filter(Boolean))].sort(),
    [kids]
  );

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return kids.filter((k) => {
      if (gradeFilter && k.grade !== gradeFilter) return false;
      if (routeFilter === 'none' && k.routeId) return false;
      if (routeFilter && routeFilter !== 'none') {
        const id = k.routeId?._id || k.routeId;
        if (String(id) !== routeFilter) return false;
      }
      const status = studentStatus(k).key;
      if (statusFilter && status !== statusFilter) return false;
      if (!needle) return true;
      const hay = [
        k.name,
        k.admissionNo,
        k.grade,
        k.section,
        k.routeId?.name,
        k.homeStopId?.name,
        ...(k.parentIds || []).flatMap((p) => [p.name, p.phone, p.email]),
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();
      return hay.includes(needle);
    });
  }, [kids, q, gradeFilter, routeFilter, statusFilter]);

  const pages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const safePage = Math.min(page, pages);
  const slice = filtered.slice((safePage - 1) * pageSize, safePage * pageSize);

  useEffect(() => {
    setPage(1);
  }, [q, gradeFilter, routeFilter, statusFilter, pageSize]);

  const allOnPageSelected = slice.length > 0 && slice.every((k) => selected.has(k._id));

  const toggleAllPage = () => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (allOnPageSelected) slice.forEach((k) => next.delete(k._id));
      else slice.forEach((k) => next.add(k._id));
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

  const exportRows = () => {
    const rows = selected.size ? filtered.filter((k) => selected.has(k._id)) : filtered;
    const header = ['Name', 'Admission No', 'Class', 'Route', 'Stop', 'Parent', 'Phone', 'Status'];
    const lines = [
      header.join(','),
      ...rows.map((k) => {
        const p = k.parentIds?.[0];
        return [
          csvEscape(k.name),
          csvEscape(k.admissionNo || ''),
          csvEscape(classLabel(k)),
          csvEscape(k.routeId?.name || ''),
          csvEscape(k.homeStopId?.name || ''),
          csvEscape(p?.name || ''),
          csvEscape(p?.phone || ''),
          csvEscape(studentStatus(k).label),
        ].join(',');
      }),
    ];
    const blob = new Blob([lines.join('\n')], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'students.csv';
    a.click();
    URL.revokeObjectURL(url);
  };

  const kpis = [
    {
      label: 'Total Students',
      value: stats?.total ?? kids.length,
      hint: stats?.addedThisMonth ? `↑ ${stats.addedThisMonth} this month` : 'No change this month',
      up: Boolean(stats?.addedThisMonth),
      tint: 'purple',
    },
    {
      label: 'Active Students',
      value: stats?.active ?? kids.filter((k) => k.active !== false).length,
      hint: pct(stats?.active ?? 0, stats?.total || kids.length),
      up: true,
      tint: 'green',
    },
    {
      label: 'Inactive Students',
      value: stats?.inactive ?? kids.filter((k) => k.active === false).length,
      hint: pct(stats?.inactive ?? 0, stats?.total || kids.length),
      tint: 'orange',
    },
    {
      label: 'New This Month',
      value: stats?.addedThisMonth ?? 0,
      hint: stats?.addedThisWeek ? `↑ ${stats.addedThisWeek} this week` : 'None this week',
      up: Boolean(stats?.addedThisWeek),
      tint: 'sky',
    },
    {
      label: 'Students On Bus',
      value: stats?.onBus ?? 0,
      hint: `${pct(stats?.onBus ?? 0, stats?.total || kids.length)} currently riding`,
      tint: 'violet',
    },
    {
      label: 'Without Route',
      value: stats?.withoutRoute ?? kids.filter((k) => !k.routeId).length,
      hint: pct(stats?.withoutRoute ?? 0, stats?.total || kids.length),
      tint: 'rose',
    },
  ];

  return (
    <div className="sa-students">
      {error && <div className="alert">{error}</div>}
      {success && <div className="alert alert-ok">{success}</div>}

      <section className="sa-stu-kpis" aria-label="Student metrics">
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
        <div className="sa-stu-toolbar">
          <label className="sa-stu-search">
            <span aria-hidden="true">⌕</span>
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Search by name, admission no. or parent..."
            />
          </label>
          <select value={gradeFilter} onChange={(e) => setGradeFilter(e.target.value)} aria-label="Class">
            <option value="">All Classes</option>
            {grades.map((g) => (
              <option key={g} value={g}>
                {g}
              </option>
            ))}
          </select>
          <select value={routeFilter} onChange={(e) => setRouteFilter(e.target.value)} aria-label="Route">
            <option value="">All Routes</option>
            <option value="none">No route</option>
            {routes.map((r) => (
              <option key={r._id} value={r._id}>
                {r.name}
              </option>
            ))}
          </select>
          <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} aria-label="Status">
            <option value="">All Status</option>
            <option value="active">Active</option>
            <option value="inactive">Inactive</option>
            <option value="noroute">No Route</option>
          </select>
          <button type="button" className="sa-btn sa-btn-outline sa-stu-export" onClick={exportRows}>
            Export
          </button>
          <button type="button" className="sa-btn sa-btn-primary" onClick={startCreate}>
            + Add Student
          </button>
        </div>

        <div className="sa-table-wrap">
          <table className="sa-table sa-stu-table">
            <thead>
              <tr>
                <th>
                  <input type="checkbox" checked={allOnPageSelected} onChange={toggleAllPage} aria-label="Select page" />
                </th>
                <th>Student</th>
                <th>Admission No.</th>
                <th>Class</th>
                <th>Route / Stop</th>
                <th>Parent / Guardian</th>
                <th>Status</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {slice.map((k) => {
                const status = studentStatus(k);
                const age = ageYears(k.dateOfBirth);
                const parent = k.parentIds?.[0];
                const meta = [
                  age != null ? `Age ${age} years` : null,
                  genderLabel(k.gender),
                ]
                  .filter(Boolean)
                  .join(' • ');
                return (
                  <tr key={k._id}>
                    <td>
                      <input
                        type="checkbox"
                        checked={selected.has(k._id)}
                        onChange={() => toggleRow(k._id)}
                        aria-label={`Select ${k.name}`}
                      />
                    </td>
                    <td>
                      <div className="sa-stu-person">
                        {k.photoUrl ? (
                          <img src={k.photoUrl} alt="" />
                        ) : (
                          <span>{initials(k.name)}</span>
                        )}
                        <div>
                          <strong>{k.name}</strong>
                          {meta ? <small>{meta}</small> : null}
                        </div>
                      </div>
                    </td>
                    <td>{k.admissionNo || '—'}</td>
                    <td>{classLabel(k)}</td>
                    <td>
                      {k.routeId?.name ? (
                        <span>
                          {k.routeId.name}
                          {k.homeStopId?.name ? `, ${k.homeStopId.name}` : ''}
                        </span>
                      ) : (
                        <em className="sa-stu-missing">No Route Assigned</em>
                      )}
                    </td>
                    <td>
                      {parent ? (
                        <span>
                          {parent.name}
                          {parent.phone ? <small className="sa-stu-phone">{parent.phone}</small> : null}
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
                        <button type="button" className="sa-icon-ghost is-view" aria-label="View" onClick={() => navigate(`/school-admin/students/${k._id}`)}>
                          ◉
                        </button>
                        <button type="button" className="sa-icon-ghost is-edit" aria-label="Edit" onClick={() => startEdit(k)}>
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
                              setMenuId((id) => (id === k._id ? '' : k._id));
                            }}
                          >
                            ⋮
                          </button>
                          {menuId === k._id && (
                            <div className="sa-stu-menu" onClick={(e) => e.stopPropagation()}>
                              <button type="button" onClick={() => { setKidActive(k, k.active === false); setMenuId(''); }}>
                                {k.active === false ? 'Activate' : 'Deactivate'}
                              </button>
                              <button type="button" className="is-danger" onClick={() => { setMenuId(''); remove(k); }}>
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
                    No students match these filters.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        <div className="sa-table-foot sa-stu-foot">
          <span>
            Showing {filtered.length ? (safePage - 1) * pageSize + 1 : 0} to{' '}
            {Math.min(safePage * pageSize, filtered.length)} of {filtered.length} students
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

      {panel === 'view' && viewing && (
        <aside className="sa-drawer" aria-label="Student details">
          <div className="sa-drawer-head">
            <h2>Student details</h2>
            <button type="button" className="sa-btn sa-btn-ghost" onClick={() => setPanel(null)}>
              Close
            </button>
          </div>
          <div className="sa-drawer-student">
            {viewing.photoUrl ? <img src={viewing.photoUrl} alt="" /> : <span className="sa-user-avatar">{initials(viewing.name)}</span>}
            <div>
              <strong>{viewing.name}</strong>
              <small>{classLabel(viewing)}</small>
            </div>
          </div>
          <dl className="sa-drawer-fields">
            <div>
              <dt>Admission no.</dt>
              <dd>{viewing.admissionNo || '—'}</dd>
            </div>
            <div>
              <dt>Status</dt>
              <dd>{studentStatus(viewing).label}</dd>
            </div>
            <div>
              <dt>Route / stop</dt>
              <dd>
                {viewing.routeId?.name || 'No route assigned'}
                {viewing.homeStopId?.name ? <small>{viewing.homeStopId.name}</small> : null}
              </dd>
            </div>
            {(viewing.parentIds || []).map((p) => (
              <div key={parentKey(p)}>
                <dt>Parent / guardian</dt>
                <dd>
                  {p.name}
                  {p.phone ? <small>{p.phone}</small> : null}
                  {p.email ? <small>{p.email}</small> : null}
                </dd>
              </div>
            ))}
          </dl>
          <div className="sa-drawer-actions">
            <button type="button" className="sa-btn sa-btn-primary" onClick={() => startEdit(viewing)}>
              Edit student
            </button>
          </div>
        </aside>
      )}

      {panel === 'form' && (
        <aside className="sa-drawer sa-drawer-wide" aria-label={mode === 'edit' ? 'Edit student' : 'Add student'}>
          <div className="sa-drawer-head">
            <h2>{mode === 'edit' ? 'Edit student' : 'Add student'}</h2>
            <button
              type="button"
              className="sa-btn sa-btn-ghost"
              onClick={closePanel}
            >
              Close
            </button>
          </div>
          {error && <div className="alert">{error}</div>}

          <div className="wizard-steps">
            {Array.from({ length: maxStep }, (_, i) => i + 1).map((n) => (
              <button
                key={n}
                type="button"
                className={`wizard-step ${step === n ? 'active' : ''} ${step > n ? 'done' : ''}`}
                onClick={() => (mode === 'edit' || n <= step) && setStep(n)}
              >
                {n}
              </button>
            ))}
          </div>

          {step === 1 && (
            <>
              <h3>Student details</h3>
              <label className="sa-field">
                <span>Name</span>
                <input required value={name} onChange={(e) => setName(e.target.value)} />
              </label>
              <label className="sa-field">
                <span>Admission no.</span>
                <input value={admissionNo} onChange={(e) => setAdmissionNo(e.target.value)} />
              </label>
              <div className="sa-stu-form-row">
                <label className="sa-field">
                  <span>Class / grade</span>
                  <input value={grade} onChange={(e) => setGrade(e.target.value)} placeholder="e.g. Grade 5" />
                </label>
                <label className="sa-field">
                  <span>Section</span>
                  <input value={section} onChange={(e) => setSection(e.target.value)} placeholder="e.g. A" />
                </label>
              </div>
              <div className="sa-stu-form-row">
                <label className="sa-field">
                  <span>Gender</span>
                  <select value={gender} onChange={(e) => setGender(e.target.value)}>
                    <option value="">Not set</option>
                    <option value="female">Female</option>
                    <option value="male">Male</option>
                    <option value="other">Other</option>
                  </select>
                </label>
                <label className="sa-field">
                  <span>Date of birth</span>
                  <input type="date" value={dateOfBirth} onChange={(e) => setDateOfBirth(e.target.value)} />
                </label>
              </div>
              <MediaPicker
                label="Student photo"
                folder="kids"
                accept="image/*"
                value={photo}
                onChange={setPhoto}
                hint="Used on registers and parent views."
              />
              {mode === 'edit' && (
                <label className="check">
                  <input type="checkbox" checked={active} onChange={(e) => setActive(e.target.checked)} />
                  Active on routes
                </label>
              )}
            </>
          )}

          {step === 2 && (
            <>
              <h3>Route</h3>
              {mode === 'create' && (
                <div className="segmented">
                  <button type="button" className={routeMode === 'existing' ? 'active' : ''} onClick={() => setRouteMode('existing')}>
                    Existing route
                  </button>
                  <button type="button" className={routeMode === 'new' ? 'active' : ''} onClick={() => setRouteMode('new')}>
                    Create route
                  </button>
                </div>
              )}
              {mode === 'edit' || routeMode === 'existing' ? (
                <label className="sa-field">
                  <span>Select route</span>
                  <select value={routeId} onChange={(e) => setRouteId(e.target.value)}>
                    {routes.map((r) => (
                      <option key={r._id} value={r._id}>
                        {r.name}
                      </option>
                    ))}
                  </select>
                </label>
              ) : (
                <label className="sa-field">
                  <span>New route name</span>
                  <input required value={routeName} onChange={(e) => setRouteName(e.target.value)} placeholder="Route name" />
                </label>
              )}
            </>
          )}

          {step === 3 && (
            <>
              <h3>Boarding / drop-off point</h3>
              <p className="hint">Search an area to zoom in, then click the map to mark the boarding point.</p>
              <label className="sa-field">
                <span>Stop name</span>
                <input
                  value={boarding.stopName}
                  onChange={(e) => setBoarding((b) => ({ ...b, stopName: e.target.value }))}
                  placeholder={`${name || 'Student'} boarding`}
                />
              </label>
              <LocationSearch
                proximity={school?.location || boarding}
                placeholder="Search estate, road, or landmark…"
                onSelect={(place) => {
                  setBoarding((b) => ({
                    ...b,
                    lat: place.lat,
                    lng: place.lng,
                    stopName: b.stopName.trim() ? b.stopName : place.name,
                  }));
                  setMapFocus({ lat: place.lat, lng: place.lng, zoom: 16.4, at: Date.now() });
                }}
              />
              <MapView
                center={{ lat: boarding.lat, lng: boarding.lng }}
                zoom={14}
                focus={mapFocus}
                onMapClick={(loc) => setBoarding((b) => ({ ...b, ...loc }))}
                stops={[
                  ...(school?.location ? [{ name: school.name, type: 'school', location: school.location }] : []),
                  {
                    name: boarding.stopName || 'Boarding',
                    type: 'home',
                    location: { lat: boarding.lat, lng: boarding.lng },
                  },
                ]}
                className="map-canvas map-sm"
              />
              {mode === 'edit' && (
                <>
                  <h3 style={{ marginTop: '1rem' }}>Parents</h3>
                  <fieldset className="checkbox-set">
                    <legend>Linked parents</legend>
                    {parents.map((p) => (
                      <label key={p.id} className="check">
                        <input type="checkbox" checked={parentIds.includes(p.id)} onChange={() => toggleParent(p.id)} />
                        {p.name} <span className="muted">({p.email})</span>
                      </label>
                    ))}
                  </fieldset>
                </>
              )}
            </>
          )}

          {step === 4 && mode === 'create' && (
            <>
              <h3>Parent</h3>
              <div className="segmented">
                <button type="button" className={parentMode === 'new' ? 'active' : ''} onClick={() => setParentMode('new')}>
                  Create parent
                </button>
                <button type="button" className={parentMode === 'existing' ? 'active' : ''} onClick={() => setParentMode('existing')}>
                  Existing parent
                </button>
              </div>
              {parentMode === 'new' ? (
                <>
                  <label className="sa-field">
                    <span>Name</span>
                    <input required value={parent.name} onChange={(e) => setParent({ ...parent, name: e.target.value })} />
                  </label>
                  <label className="sa-field">
                    <span>Email</span>
                    <input required type="email" value={parent.email} onChange={(e) => setParent({ ...parent, email: e.target.value })} />
                  </label>
                  <label className="sa-field">
                    <span>Phone</span>
                    <input value={parent.phone} onChange={(e) => setParent({ ...parent, phone: e.target.value })} />
                  </label>
                  <label className="sa-field">
                    <span>Password</span>
                    <input required value={parent.password} onChange={(e) => setParent({ ...parent, password: e.target.value })} />
                  </label>
                </>
              ) : (
                <fieldset className="checkbox-set">
                  <legend>Select parents</legend>
                  {parents.map((p) => (
                    <label key={p.id} className="check">
                      <input type="checkbox" checked={parentIds.includes(p.id)} onChange={() => toggleParent(p.id)} />
                      {p.name} <span className="muted">({p.email})</span>
                    </label>
                  ))}
                </fieldset>
              )}
            </>
          )}

          <div className="row-actions">
            {step > 1 && (
              <button type="button" className="sa-btn sa-btn-outline" onClick={() => setStep(step - 1)}>
                Back
              </button>
            )}
            {step < maxStep && (
              <button type="button" className="sa-btn sa-btn-primary" disabled={!canNext()} onClick={() => setStep(step + 1)}>
                Next
              </button>
            )}
            {mode === 'edit' ? (
              <button type="button" className="sa-btn sa-btn-primary" disabled={!canSaveEdit()} onClick={submitEdit}>
                Save student
              </button>
            ) : (
              step >= maxStep && (
                <button type="button" className="sa-btn sa-btn-primary" disabled={!canNext()} onClick={submitCreate}>
                  Create student
                </button>
              )
            )}
          </div>
        </aside>
      )}
    </div>
  );
}
