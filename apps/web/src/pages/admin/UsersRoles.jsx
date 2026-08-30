import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useOutletContext } from 'react-router-dom';
import { api } from '../../lib/api';
import { useAuth } from '../../context/AuthContext';

const PAGE_SIZES = [10, 25, 50];
const ROLE_COLORS = {
  school_admin: '#5d3fd3',
  teacher: '#d97706',
  driver: '#2563eb',
  parent: '#16a34a',
};
const ROLE_HELP = {
  school_admin: 'School admin console: students, fleet, trips, reports, and settings for this school.',
  teacher: 'Teacher app: register, diary, notes, assignments, and students.',
  driver: 'Driver app: assigned trips, live location, and incident reports.',
  parent: 'Parent app: children, live trip tracking, and messages.',
};
const ROLE_DEPT = {
  school_admin: 'School Admin',
  teacher: 'Academics',
  driver: 'Transport',
  parent: '',
};

const emptyForm = {
  name: '',
  email: '',
  phone: '',
  role: 'parent',
  department: '',
  password: 'password123',
  active: true,
};

function initials(name = '') {
  const parts = String(name).trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return '?';
  if (parts.length === 1) return parts[0][0].toUpperCase();
  return (parts[0][0] + parts[1][0]).toUpperCase();
}

function pct(part, total) {
  if (!total) return '0%';
  return `${((part / total) * 100).toFixed(1)}%`;
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

function departmentOf(u) {
  if (u?.department) return u.department;
  return ROLE_DEPT[u?.role] || '';
}

function fmtLogin(value) {
  if (!value) return { day: '—', time: '' };
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return { day: '—', time: '' };
  return {
    day: d.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' }),
    time: d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' }),
  };
}

function donutStyle(items, total) {
  if (!total) return { background: '#e2e8f0' };
  let acc = 0;
  const parts = items.filter((i) => i.count > 0).map((item) => {
    const start = acc;
    acc += (item.count / total) * 100;
    return `${item.color} ${start}% ${acc}%`;
  });
  return { background: parts.length ? `conic-gradient(${parts.join(', ')})` : '#e2e8f0' };
}

function profileTo(u) {
  if (u.role === 'teacher') return `/school-admin/teachers/${u.id}`;
  if (u.role === 'driver') return `/school-admin/drivers/${u.id}`;
  if (u.role === 'parent') return '/school-admin/parents';
  return '';
}

function parseCsv(text) {
  const lines = String(text || '')
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);
  if (!lines.length) return [];
  const headers = lines[0].split(',').map((h) => h.trim().toLowerCase().replace(/^"|"$/g, ''));
  return lines.slice(1).map((line) => {
    const cols = line.split(',').map((c) => c.trim().replace(/^"|"$/g, ''));
    const row = {};
    headers.forEach((h, i) => {
      row[h] = cols[i] || '';
    });
    return {
      name: row.name || '',
      email: row.email || '',
      phone: row.phone || '',
      role: row.role || '',
      department: row.department || '',
      password: row.password || '',
    };
  });
}

function UsersIcon({ name }) {
  const p = {
    width: 14,
    height: 14,
    viewBox: '0 0 24 24',
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth: 1.8,
    strokeLinecap: 'round',
    strokeLinejoin: 'round',
  };
  if (name === 'users') {
    return (
      <svg {...p}>
        <circle cx="9" cy="8" r="2.6" />
        <path d="M4.6 17.2a4.4 4.4 0 0 1 8.8 0" />
        <circle cx="16.2" cy="8.4" r="2.1" />
        <path d="M15.2 13.1a3.8 3.8 0 0 1 4.6 4.1" />
      </svg>
    );
  }
  if (name === 'active') return <svg {...p}><circle cx="12" cy="12" r="8" /><path d="m8.6 12.2 2.5 2.4 4.4-4.8" /></svg>;
  if (name === 'inactive') return <svg {...p}><circle cx="12" cy="8" r="3.2" /><path d="M5.6 19a6.4 6.4 0 0 1 12.8 0" /><path d="M16 10.5h4" /></svg>;
  if (name === 'warn') return <svg {...p}><path d="M12 4.2 20.4 18.5H3.6L12 4.2Z" /><path d="M12 9.4v4.2M12 16.2h.01" /></svg>;
  if (name === 'search') return <svg {...p}><circle cx="11" cy="11" r="6.2" /><path d="m16 16 4 4" /></svg>;
  if (name === 'filters') return <svg {...p}><path d="M4 6h16M7 12h10M10 18h4" /></svg>;
  if (name === 'upload') return <svg {...p}><path d="M12 16V5M8.4 8.4 12 4.8l3.6 3.6M5 16.5V19a1.5 1.5 0 0 0 1.5 1.5h11A1.5 1.5 0 0 0 19 19v-2.5" /></svg>;
  if (name === 'plus') return <svg {...p}><path d="M12 5v14M5 12h14" /></svg>;
  if (name === 'caret') return <svg {...p} width={12} height={12}><path d="m6 9 5-6H1l5 6Z" fill="currentColor" stroke="none" /></svg>;
  if (name === 'chevron') return <svg {...p}><path d="m9 6 6 6-6 6" /></svg>;
  if (name === 'import') return <svg {...p}><path d="M12 4v10M8.5 10.5 12 14l3.5-3.5M5 16.5V19a1.5 1.5 0 0 0 1.5 1.5h11A1.5 1.5 0 0 0 19 19v-2.5" /></svg>;
  if (name === 'role') return <svg {...p}><circle cx="12" cy="8" r="3.2" /><path d="M5.6 19a6.4 6.4 0 0 1 12.8 0" /><path d="M17.2 6.2 20 9l-2.8 2.8" /></svg>;
  if (name === 'lock') return <svg {...p}><rect x="5.5" y="10.5" width="13" height="10" rx="2" /><path d="M8.5 10.5V8.2A3.5 3.5 0 0 1 15.5 8.2v2.3" /></svg>;
  if (name === 'report') return <svg {...p}><path d="M4 18.5V5.5M4 18.5h16" /><path d="m7.2 13.2 3.4-3.6 2.8 2.2 4.4-5.2" /></svg>;
  if (name === 'monitor') return <svg {...p}><rect x="3.5" y="4.5" width="17" height="11.5" rx="1.6" /><path d="M8 20h8M12 16v4" /></svg>;
  if (name === 'cap') return <svg {...p}><path d="M3 10.2 12 6l9 4.2-9 4.2L3 10.2Z" /><path d="M7.2 12.4v3.4c0 1.6 2.1 2.8 4.8 2.8s4.8-1.2 4.8-2.8v-3.4" /></svg>;
  if (name === 'wheel') return <svg {...p}><circle cx="12" cy="12" r="8" /><circle cx="12" cy="12" r="2.2" /><path d="M12 4.2V9.8M12 14.2v5.6M4.2 12H9.8M14.2 12h5.6" /></svg>;
  if (name === 'info') return <svg {...p}><circle cx="12" cy="12" r="8" /><path d="M12 10.6V16M12 7.6h.01" /></svg>;
  return null;
}

function roleGlyph(id) {
  if (id === 'teacher') return 'cap';
  if (id === 'driver') return 'wheel';
  if (id === 'parent') return 'users';
  return 'monitor';
}

export default function UsersRoles() {
  const { user: me } = useAuth();
  const { globalSearch = '' } = useOutletContext() || {};
  const [tab, setTab] = useState('users');
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [q, setQ] = useState('');
  const [role, setRole] = useState('');
  const [status, setStatus] = useState('');
  const [department, setDepartment] = useState('');
  const [more, setMore] = useState(false);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [selected, setSelected] = useState(() => new Set());
  const [menuId, setMenuId] = useState('');
  const [roleMenuId, setRoleMenuId] = useState('');
  const [roleQuery, setRoleQuery] = useState('');
  const [roleDetail, setRoleDetail] = useState(null);
  const [showAddMenu, setShowAddMenu] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(emptyForm);
  const [showImport, setShowImport] = useState(false);
  const [saving, setSaving] = useState(false);
  const year = new Date().getFullYear();

  const load = useCallback(async () => {
    const next = await api('/admin/users');
    setData(next);
    setError('');
    return next;
  }, []);

  useEffect(() => {
    load().catch((err) => setError(err.message));
  }, [load]);

  useEffect(() => {
    if (globalSearch) setQ(globalSearch);
  }, [globalSearch]);

  useEffect(() => {
    if (!showAddMenu && !menuId && !roleMenuId) return undefined;
    const close = () => {
      setShowAddMenu(false);
      setMenuId('');
      setRoleMenuId('');
    };
    window.addEventListener('click', close);
    return () => window.removeEventListener('click', close);
  }, [showAddMenu, menuId, roleMenuId]);

  const users = data?.users || [];
  const stats = data?.stats || {};
  const roles = data?.roles || [];
  const departments = useMemo(() => {
    const set = new Set(data?.departments || []);
    users.forEach((u) => {
      const dept = departmentOf(u);
      if (dept) set.add(dept);
    });
    return [...set].sort();
  }, [data, users]);

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return users.filter((u) => {
      if (role && u.role !== role) return false;
      if (status === 'active' && u.active === false) return false;
      if (status === 'inactive' && u.active !== false) return false;
      const dept = departmentOf(u);
      if (department === '__none' && dept) return false;
      if (department && department !== '__none' && dept !== department) return false;
      if (!needle) return true;
      return [u.name, u.email, u.phone, u.roleLabel, dept, u.jobTitle]
        .filter(Boolean)
        .join(' ')
        .toLowerCase()
        .includes(needle);
    });
  }, [users, q, role, status, department]);

  useEffect(() => {
    setPage(1);
  }, [q, role, status, department, pageSize]);

  const pages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const safePage = Math.min(page, pages);
  const slice = filtered.slice((safePage - 1) * pageSize, safePage * pageSize);
  const from = slice.length ? (safePage - 1) * pageSize + 1 : 0;
  const to = Math.min(filtered.length, safePage * pageSize);
  const allOnPage = slice.length > 0 && slice.every((u) => selected.has(u.id));
  const donutItems = roles.map((r) => ({
    ...r,
    color: ROLE_COLORS[r.id] || '#64748b',
  }));
  const total = stats.total || 0;
  const added = stats.addedThisMonth || 0;
  const roleRows = useMemo(() => {
    const needle = roleQuery.trim().toLowerCase();
    return roles.filter((r) => {
      if (!needle) return true;
      return `${r.label} ${ROLE_HELP[r.id] || ''}`.toLowerCase().includes(needle);
    });
  }, [roles, roleQuery]);

  const kpis = [
    {
      label: 'Total Users',
      value: data ? total : '…',
      hint: added ? `↑ ${added} this month` : 'No new accounts this month',
      hintClass: added ? 'is-up' : '',
      tint: 'purple',
      icon: 'users',
    },
    {
      label: 'Active Users',
      value: data ? stats.active ?? 0 : '…',
      hint: total ? `${pct(stats.active, total)} of total` : '—',
      tint: 'green',
      icon: 'active',
    },
    {
      label: 'Inactive Users',
      value: data ? stats.inactive ?? 0 : '…',
      hint: total ? `${pct(stats.inactive, total)} of total` : '—',
      tint: 'orange',
      icon: 'inactive',
    },
    {
      label: 'Suspended Users',
      value: 0,
      hint: 'Not tracked.',
      tint: 'rose',
      icon: 'warn',
      outlined: true,
    },
  ];

  const resetFilters = () => {
    setQ('');
    setRole('');
    setStatus('');
    setDepartment('');
  };

  const toggleRow = (id) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const togglePage = () => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (allOnPage) slice.forEach((u) => next.delete(u.id));
      else slice.forEach((u) => next.add(u.id));
      return next;
    });
  };

  const openCreate = (nextRole = 'parent') => {
    setEditing(null);
    setForm({ ...emptyForm, role: nextRole, department: ROLE_DEPT[nextRole] || '' });
    setShowAddMenu(false);
    setShowForm(true);
  };

  const openEdit = (u) => {
    setEditing(u);
    setForm({
      name: u.name || '',
      email: u.email || '',
      phone: u.phone || '',
      role: u.role,
      department: departmentOf(u),
      password: '',
      active: u.active !== false,
    });
    setShowForm(true);
    setMenuId('');
  };

  const saveUser = async (e) => {
    e.preventDefault();
    setSaving(true);
    setError('');
    try {
      if (editing) {
        const body = { ...form };
        if (!body.password) delete body.password;
        await api(`/admin/users/${editing.id}`, { method: 'PUT', body });
        setSuccess('User updated.');
      } else {
        await api('/admin/users', { method: 'POST', body: form });
        setSuccess('User added.');
      }
      setShowForm(false);
      await load();
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  const bulkActive = async (active) => {
    if (!selected.size) return;
    setSaving(true);
    try {
      await api('/admin/users/bulk-active', { method: 'POST', body: { ids: [...selected], active } });
      setSelected(new Set());
      await load();
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  const onImportFile = async (file) => {
    const text = await file.text();
    const rows = parseCsv(text);
    if (!rows.length) {
      setError('CSV needs a header row with name, email, and role.');
      return;
    }
    setSaving(true);
    try {
      const result = await api('/admin/users/import', { method: 'POST', body: { rows } });
      setSuccess(`Imported ${result.created} user${result.created === 1 ? '' : 's'}.`);
      if (result.errors?.length) setError(result.errors.map((row) => `Row ${row.row}: ${row.error}`).join(' · '));
      setShowImport(false);
      await load();
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="sa-students sa-users">
      {error && <div className="alert">{error}</div>}
      {success && <div className="alert alert-ok">{success}</div>}

      <div className="sa-users-head">
        <div className="sa-tabs sa-users-tabs">
          {['users', 'roles', 'permissions'].map((id) => (
            <button key={id} type="button" className={`sa-tab${tab === id ? ' is-active' : ''}`} onClick={() => setTab(id)}>
              {id[0].toUpperCase() + id.slice(1)}
            </button>
          ))}
        </div>
        <div className="sa-users-actions">
          <button type="button" className="sa-btn sa-btn-outline" onClick={() => setShowImport(true)}>
            <UsersIcon name="upload" />
            Import Users
          </button>
          <div className="sa-users-add">
            <button
              type="button"
              className="sa-btn sa-btn-primary"
              onClick={(e) => {
                e.stopPropagation();
                setShowAddMenu((open) => !open);
              }}
            >
              <UsersIcon name="plus" />
              Add New User
              <UsersIcon name="caret" />
            </button>
            {showAddMenu && (
              <div className="sa-users-add-menu" onClick={(e) => e.stopPropagation()}>
                {roles.map((r) => (
                  <button key={r.id} type="button" onClick={() => openCreate(r.id)}>
                    {r.label}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      <section className="sa-stu-kpis sa-users-kpis" aria-label="User metrics">
        {kpis.map((m) => (
          <article key={m.label} className={`sa-stu-kpi tint-${m.tint}${m.outlined ? ' is-outlined' : ''}`}>
            <div>
              <span>{m.label}</span>
              <strong>{m.value}</strong>
              <em className={m.hintClass || ''}>{m.hint}</em>
            </div>
            <i className="sa-stu-kpi-icon" aria-hidden="true">
              <UsersIcon name={m.icon} />
            </i>
          </article>
        ))}
      </section>

      {tab === 'users' && (
        <section className="sa-inc-layout">
          <article className="sa-card sa-stu-table-card">
            <div className="sa-users-toolbar">
              <label className="sa-users-search">
                <UsersIcon name="search" />
                <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search users..." />
              </label>
              <select value={role} onChange={(e) => setRole(e.target.value)} aria-label="Role">
                <option value="">All roles</option>
                {roles.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.label}
                  </option>
                ))}
              </select>
              <select value={status} onChange={(e) => setStatus(e.target.value)} aria-label="Status">
                <option value="">All status</option>
                <option value="active">Active</option>
                <option value="inactive">Inactive</option>
              </select>
              <select value={department} onChange={(e) => setDepartment(e.target.value)} aria-label="Department">
                <option value="">All departments</option>
                <option value="__none">No department set</option>
                {departments.map((d) => (
                  <option key={d} value={d}>
                    {d}
                  </option>
                ))}
              </select>
              <button type="button" className="sa-btn sa-btn-outline" onClick={() => setMore((v) => !v)}>
                <UsersIcon name="filters" />
                More Filters
              </button>
              <button type="button" className="sa-text-link" onClick={resetFilters}>
                Reset
              </button>
            </div>
            {more && selected.size > 0 && (
              <div className="sa-tch-more">
                <button type="button" className="sa-btn sa-btn-outline" onClick={() => bulkActive(true)} disabled={saving}>
                  Activate selected
                </button>
                <button type="button" className="sa-btn sa-btn-outline" onClick={() => bulkActive(false)} disabled={saving}>
                  Deactivate selected
                </button>
              </div>
            )}
            {more && !selected.size && (
              <p className="sa-inc-status-note">Select rows to activate or deactivate accounts.</p>
            )}

            <div className="sa-table-wrap">
              <table className="sa-table sa-stu-table sa-users-table">
                <thead>
                  <tr>
                    <th>
                      <input type="checkbox" checked={allOnPage} onChange={togglePage} aria-label="Select page" />
                    </th>
                    <th>User</th>
                    <th>Role</th>
                    <th>Department</th>
                    <th>Status</th>
                    <th>Last Login</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {slice.map((u) => {
                    const dest = profileTo(u);
                    const login = fmtLogin(u.lastLoginAt || u.updatedAt || u.createdAt);
                    const dept = departmentOf(u);
                    return (
                      <tr key={u.id}>
                        <td>
                          <input
                            type="checkbox"
                            checked={selected.has(u.id)}
                            onChange={() => toggleRow(u.id)}
                            aria-label={`Select ${u.name}`}
                          />
                        </td>
                        <td>
                          <div className="sa-stu-person">
                            {u.photoUrl ? <img src={u.photoUrl} alt="" /> : <span>{initials(u.name)}</span>}
                            <div>
                              <strong>{u.name}</strong>
                              <small>{u.email}</small>
                              {u.phone ? <small className="sa-stu-phone">{u.phone}</small> : null}
                            </div>
                          </div>
                        </td>
                        <td>
                          <span className={`sa-users-role is-${u.role}`}>{u.roleLabel}</span>
                        </td>
                        <td>{dept || '—'}</td>
                        <td>
                          <span className={`sa-stu-status is-${u.active === false ? 'inactive' : 'active'}`}>
                            {u.active === false ? 'Inactive' : 'Active'}
                          </span>
                        </td>
                        <td>
                          <div className="sa-users-login">
                            <strong>{login.day}</strong>
                            {login.time ? <small>{login.time}</small> : null}
                          </div>
                        </td>
                        <td>
                          <div className="sa-inc-row-actions">
                            <button
                              type="button"
                              className="sa-icon-btn"
                              aria-label="More"
                              onClick={(e) => {
                                e.stopPropagation();
                                setMenuId(menuId === u.id ? '' : u.id);
                              }}
                            >
                              ⋮
                            </button>
                            {menuId === u.id && (
                              <div className="sa-inc-menu" onClick={(e) => e.stopPropagation()}>
                                <button type="button" onClick={() => openEdit(u)}>
                                  Edit
                                </button>
                                {dest ? (
                                  <Link to={dest} onClick={() => setMenuId('')}>
                                    Open profile
                                  </Link>
                                ) : null}
                                {u.id !== me?.id && (
                                  <button
                                    type="button"
                                    onClick={async () => {
                                      await api(`/admin/users/${u.id}`, { method: 'PUT', body: { active: u.active === false } });
                                      setMenuId('');
                                      await load();
                                    }}
                                  >
                                    {u.active === false ? 'Activate' : 'Deactivate'}
                                  </button>
                                )}
                              </div>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                  {!slice.length && (
                    <tr>
                      <td colSpan={7} className="sa-stu-empty">
                        No users match these filters.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
            <div className="sa-table-foot sa-stu-foot sa-inc-foot">
              <span>
                Showing {from} to {to} of {filtered.length} users
              </span>
              <div className="sa-inc-pager">
                <select value={pageSize} onChange={(e) => setPageSize(Number(e.target.value))} aria-label="Per page">
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

          <aside className="sa-inc-side">
            <article className="sa-card">
              <h3>Role Summary</h3>
              <div className="sa-inc-donut" style={donutStyle(donutItems, total)}>
                <div>
                  <strong>{total || 0}</strong>
                  <span>Total</span>
                </div>
              </div>
              <ul className="sa-inc-legend">
                {donutItems.map((r) => (
                  <li key={r.id}>
                    <i style={{ background: r.color }} />
                    <span>{r.label}</span>
                    <strong>
                      {r.count} · {pct(r.count, total)}
                    </strong>
                  </li>
                ))}
              </ul>
            </article>
            <article className="sa-card">
              <h3>Quick Actions</h3>
              <ul className="sa-inc-quick">
                <li>
                  <button type="button" onClick={() => setShowImport(true)}>
                    <UsersIcon name="import" />
                    Import Users
                    <UsersIcon name="chevron" />
                  </button>
                </li>
                <li>
                  <button type="button" onClick={() => openCreate()}>
                    <UsersIcon name="plus" />
                    Add New User
                    <UsersIcon name="chevron" />
                  </button>
                </li>
                <li>
                  <button type="button" onClick={() => setTab('roles')}>
                    <UsersIcon name="role" />
                    Manage Roles
                    <UsersIcon name="chevron" />
                  </button>
                </li>
                <li>
                  <button type="button" onClick={() => setTab('permissions')}>
                    <UsersIcon name="lock" />
                    Permissions
                    <UsersIcon name="chevron" />
                  </button>
                </li>
                <li>
                  <Link to="/school-admin/reports">
                    <UsersIcon name="report" />
                    User Activity Report
                    <UsersIcon name="chevron" />
                  </Link>
                </li>
              </ul>
            </article>
          </aside>
        </section>
      )}

      {tab === 'roles' && (
        <section className="sa-card sa-users-roles">
          <div className="sa-users-roles-head">
            <div>
              <h3>Stored roles</h3>
              <p className="sa-muted">Roles are the values saved on each account. Custom roles such as Transport Manager are not stored.</p>
            </div>
            <label className="sa-users-search">
              <UsersIcon name="search" />
              <input value={roleQuery} onChange={(e) => setRoleQuery(e.target.value)} placeholder="Search roles..." />
            </label>
          </div>
          <div className="sa-table-wrap">
            <table className="sa-table sa-users-roles-table">
              <thead>
                <tr>
                  <th>Role</th>
                  <th>Users</th>
                  <th>What it can do</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {roleRows.map((r) => (
                  <tr key={r.id}>
                    <td>
                      <span className={`sa-users-role is-${r.id}`}>{r.label}</span>
                    </td>
                    <td>{r.count === 1 ? '1 user' : `${r.count} users`}</td>
                    <td>
                      <div className="sa-users-help">
                        <i className={`is-${r.id}`} aria-hidden="true">
                          <UsersIcon name={roleGlyph(r.id)} />
                        </i>
                        <span>{ROLE_HELP[r.id]}</span>
                      </div>
                    </td>
                    <td>
                      <div className="sa-users-role-actions">
                        <button type="button" className="sa-btn sa-btn-outline" onClick={() => setRoleDetail(r)}>
                          View Details
                        </button>
                        <div className="sa-inc-row-actions">
                          <button
                            type="button"
                            className="sa-icon-btn"
                            aria-label={`${r.label} actions`}
                            onClick={(e) => {
                              e.stopPropagation();
                              setRoleMenuId(roleMenuId === r.id ? '' : r.id);
                            }}
                          >
                            ⋮
                          </button>
                          {roleMenuId === r.id && (
                            <div className="sa-inc-menu" onClick={(e) => e.stopPropagation()}>
                              <button type="button" onClick={() => { setRoleDetail(r); setRoleMenuId(''); }}>
                                View details
                              </button>
                              <button
                                type="button"
                                onClick={() => {
                                  setRole(r.id);
                                  setTab('users');
                                  setRoleMenuId('');
                                }}
                              >
                                View users
                              </button>
                            </div>
                          )}
                        </div>
                      </div>
                    </td>
                  </tr>
                ))}
                {!roleRows.length && (
                  <tr>
                    <td colSpan={4} className="sa-stu-empty">
                      No roles match this search.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
          <p className="sa-users-note">
            <UsersIcon name="info" />
            Change a person&apos;s role from Edit on the Users tab.
          </p>
        </section>
      )}

      {tab === 'permissions' && (
        <section className="sa-card">
          <h3>Permissions</h3>
          <p className="sa-muted">There is no custom permission matrix. Access follows the stored role on each user account.</p>
          <ul className="sa-users-perms">
            <li>
              <strong>School Admin</strong>
              <span>Full school admin web app for this school.</span>
            </li>
            <li>
              <strong>Teacher</strong>
              <span>Teacher web/app modules only.</span>
            </li>
            <li>
              <strong>Driver</strong>
              <span>Driver trips, GPS, and incident reporting.</span>
            </li>
            <li>
              <strong>Parent</strong>
              <span>Family tracking and parent messages.</span>
            </li>
          </ul>
        </section>
      )}

      {roleDetail && (
        <div className="sa-reports-modal" role="dialog" aria-labelledby="sa-users-role-title">
          <div className="sa-card sa-users-role-detail">
            <h3 id="sa-users-role-title">{roleDetail.label}</h3>
            <p className="sa-users-help">
              <i className={`is-${roleDetail.id}`} aria-hidden="true">
                <UsersIcon name={roleGlyph(roleDetail.id)} />
              </i>
              <span>{ROLE_HELP[roleDetail.id]}</span>
            </p>
            <p className="sa-muted">
              {roleDetail.count === 1 ? '1 user' : `${roleDetail.count} users`} with this role.
            </p>
            <ul className="sa-users-role-people">
              {users.filter((u) => u.role === roleDetail.id).map((u) => (
                <li key={u.id}>
                  <span>{initials(u.name)}</span>
                  <div>
                    <strong>{u.name}</strong>
                    <small>{u.email}</small>
                  </div>
                </li>
              ))}
              {!users.some((u) => u.role === roleDetail.id) && <li className="sa-muted">No users assigned.</li>}
            </ul>
            <div className="sa-reports-actions">
              <button type="button" className="sa-btn sa-btn-outline" onClick={() => setRoleDetail(null)}>
                Close
              </button>
              <button
                type="button"
                className="sa-btn sa-btn-primary"
                onClick={() => {
                  setRole(roleDetail.id);
                  setRoleDetail(null);
                  setTab('users');
                }}
              >
                View users
              </button>
            </div>
          </div>
        </div>
      )}

      {showForm && (
        <div className="sa-reports-modal" role="dialog">
          <form className="sa-card" onSubmit={saveUser}>
            <h3>{editing ? 'Edit user' : 'Add new user'}</h3>
            <label>
              Name
              <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required />
            </label>
            <label>
              Email
              <input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} required />
            </label>
            <label>
              Phone
              <input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
            </label>
            <label>
              Role
              <select value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value, department: ROLE_DEPT[e.target.value] || form.department })}>
                {roles.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.label}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Department
              <input value={form.department} onChange={(e) => setForm({ ...form, department: e.target.value })} />
            </label>
            <label>
              Password {editing ? '(leave blank to keep)' : ''}
              <input
                type="text"
                value={form.password}
                onChange={(e) => setForm({ ...form, password: e.target.value })}
                required={!editing}
              />
            </label>
            {editing && (
              <label className="sa-users-check">
                <input type="checkbox" checked={form.active} onChange={(e) => setForm({ ...form, active: e.target.checked })} />
                Active
              </label>
            )}
            <div className="sa-reports-actions">
              <button type="button" className="sa-btn sa-btn-outline" onClick={() => setShowForm(false)}>
                Cancel
              </button>
              <button type="submit" className="sa-btn sa-btn-primary" disabled={saving}>
                Save
              </button>
            </div>
          </form>
        </div>
      )}

      {showImport && (
        <div className="sa-reports-modal" role="dialog">
          <div className="sa-card">
            <h3>Import users</h3>
            <p className="sa-muted">
              CSV header must include <code>name</code>, <code>email</code>, and <code>role</code>. Role must be{' '}
              <code>school_admin</code>, <code>teacher</code>, <code>driver</code>, or <code>parent</code>. Optional:{' '}
              <code>phone</code>, <code>department</code>, <code>password</code>.
            </p>
            <input
              type="file"
              accept=".csv,text/csv"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) onImportFile(file);
              }}
            />
            <div className="sa-reports-actions">
              <button type="button" className="sa-btn sa-btn-outline" onClick={() => setShowImport(false)}>
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      <footer className="sa-home-foot">
        <span>© {year} Transport</span>
        <span>Transport Management System v1.0.0</span>
      </footer>
    </div>
  );
}
