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

function fmtDay(value) {
  if (!value) return '—';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
}

function fmtWhen(value) {
  if (!value) return '';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleString(undefined, { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' });
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

  const users = data?.users || [];
  const stats = data?.stats || {};
  const roles = data?.roles || [];
  const departments = data?.departments || [];
  const activity = data?.activity || [];

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return users.filter((u) => {
      if (role && u.role !== role) return false;
      if (status === 'active' && u.active === false) return false;
      if (status === 'inactive' && u.active !== false) return false;
      if (department === '__none' && u.department) return false;
      if (department && department !== '__none' && u.department !== department) return false;
      if (!needle) return true;
      return [u.name, u.email, u.phone, u.roleLabel, u.department, u.jobTitle]
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

  const kpis = [
    {
      label: 'Total Users',
      value: data ? total : '…',
      hint: stats.addedThisMonth ? `+${stats.addedThisMonth} this month` : 'No new accounts this month',
      hintClass: stats.addedThisMonth ? 'is-up' : '',
      tint: 'purple',
    },
    {
      label: 'Active Users',
      value: data ? stats.active ?? 0 : '…',
      hint: total ? `${pct(stats.active, total)} of total` : '—',
      tint: 'green',
    },
    {
      label: 'Inactive Users',
      value: data ? stats.inactive ?? 0 : '…',
      hint: total ? `${pct(stats.inactive, total)} of total` : '—',
      tint: 'orange',
    },
    { label: 'Suspended Users', value: '—', hint: 'Not tracked', tint: 'rose' },
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

  const openCreate = () => {
    setEditing(null);
    setForm(emptyForm);
    setShowForm(true);
  };

  const openEdit = (u) => {
    setEditing(u);
    setForm({
      name: u.name || '',
      email: u.email || '',
      phone: u.phone || '',
      role: u.role,
      department: u.department || '',
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
      if (result.errors?.length) setError(result.errors.map((e) => `Row ${e.row}: ${e.error}`).join(' · '));
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
        <div className="sa-reports-actions">
          <button type="button" className="sa-btn sa-btn-outline" onClick={() => setShowImport(true)}>
            Import Users
          </button>
          <button type="button" className="sa-btn sa-btn-primary" onClick={openCreate}>
            + Add New User
          </button>
        </div>
      </div>

      <section className="sa-stu-kpis sa-users-kpis" aria-label="User metrics">
        {kpis.map((m) => (
          <article key={m.label} className={`sa-stu-kpi tint-${m.tint}`}>
            <div>
              <span>{m.label}</span>
              <strong>{m.value}</strong>
              <em className={m.hintClass || ''}>{m.hint}</em>
            </div>
            <i className="sa-stu-kpi-icon" aria-hidden="true" />
          </article>
        ))}
      </section>

      {tab === 'users' && (
        <section className="sa-inc-layout">
          <article className="sa-card sa-stu-table-card">
            <div className="sa-stu-toolbar sa-drv-toolbar sa-users-toolbar">
              <label className="sa-stu-search">
                <span aria-hidden="true">⌕</span>
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
              <p className="sa-inc-status-note">Suspended is not a stored status. Select rows to activate or deactivate.</p>
            )}

            <p className="sa-inc-status-note">
              Showing {from} to {to} of {filtered.length} users
            </p>
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
                    <th>Joined On</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {slice.map((u) => {
                    const to = profileTo(u);
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
                        <td>{u.department || '—'}</td>
                        <td>
                          <span className={`sa-stu-status is-${u.active === false ? 'inactive' : 'active'}`}>
                            {u.active === false ? 'Inactive' : 'Active'}
                          </span>
                        </td>
                        <td>—</td>
                        <td>{fmtDay(u.createdAt)}</td>
                        <td>
                          <div className="sa-inc-row-actions">
                            <button type="button" className="sa-icon-btn" aria-label="More" onClick={() => setMenuId(menuId === u.id ? '' : u.id)}>
                              ⋮
                            </button>
                            {menuId === u.id && (
                              <div className="sa-inc-menu">
                                <button type="button" onClick={() => openEdit(u)}>
                                  Edit
                                </button>
                                {to ? (
                                  <Link to={to} onClick={() => setMenuId('')}>
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
                      <td colSpan={8} className="sa-stu-empty">
                        No users match these filters.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
            <div className="sa-table-foot sa-stu-foot">
              <label className="sa-stu-pagesize">
                Rows per page
                <select value={pageSize} onChange={(e) => setPageSize(Number(e.target.value))}>
                  {PAGE_SIZES.map((n) => (
                    <option key={n} value={n}>
                      {n}
                    </option>
                  ))}
                </select>
              </label>
              <div className="sa-pager">
                {pageItems(safePage, pages).map((item, i) =>
                  item === '…' ? (
                    <span key={`e${i}`}>…</span>
                  ) : (
                    <button key={item} type="button" className={item === safePage ? 'is-on' : ''} onClick={() => setPage(item)}>
                      {item}
                    </button>
                  )
                )}
              </div>
            </div>
            <p className="sa-muted" style={{ padding: '0 1rem 0.85rem' }}>
              Last login is not stored. Joined on is the account created date.
            </p>
          </article>

          <aside className="sa-inc-side">
            <article className="sa-card">
              <h3>Role summary</h3>
              <div className="sa-inc-donut" style={donutStyle(donutItems, total)}>
                <div>
                  <strong>{total}</strong>
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
              <h3>Quick actions</h3>
              <ul className="sa-inc-quick">
                <li>
                  <button type="button" onClick={openCreate}>
                    Add New User
                  </button>
                </li>
                <li>
                  <button type="button" onClick={() => setTab('roles')}>
                    Assign Role
                  </button>
                </li>
                <li>
                  <button type="button" onClick={() => setShowImport(true)}>
                    Bulk Import Users
                  </button>
                </li>
                <li>
                  <button type="button" onClick={() => setTab('permissions')}>
                    Manage Permissions
                  </button>
                </li>
              </ul>
            </article>
            <article className="sa-card">
              <h3>Recent activity</h3>
              {activity.length ? (
                <ul className="sa-users-activity">
                  {activity.map((a) => (
                    <li key={a.id}>
                      <strong>{a.text}</strong>
                      <small>{fmtWhen(a.at)}</small>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="sa-muted">No new accounts in this school yet.</p>
              )}
              <p className="sa-muted">This list is accounts created, not a full audit log.</p>
            </article>
          </aside>
        </section>
      )}

      {tab === 'roles' && (
        <section className="sa-card">
          <h3>Stored roles</h3>
          <p className="sa-muted">Roles are the values saved on each account. Custom roles such as Transport Manager are not stored.</p>
          <div className="sa-table-wrap">
            <table className="sa-table">
              <thead>
                <tr>
                  <th>Role</th>
                  <th>Users</th>
                  <th>What it can do</th>
                </tr>
              </thead>
              <tbody>
                {roles.map((r) => (
                  <tr key={r.id}>
                    <td>
                      <span className={`sa-users-role is-${r.id}`}>{r.label}</span>
                    </td>
                    <td>{r.count}</td>
                    <td>{ROLE_HELP[r.id]}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="sa-muted" style={{ padding: '0.75rem 0 0' }}>
            Change a person&apos;s role from Edit on the Users tab.
          </p>
        </section>
      )}

      {tab === 'permissions' && (
        <section className="sa-card">
          <h3>Permissions</h3>
          <p className="sa-muted">
            There is no custom permission matrix. Access follows the stored role on each user account.
          </p>
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
              <select value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })}>
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
              <label>
                <input
                  type="checkbox"
                  checked={form.active}
                  onChange={(e) => setForm({ ...form, active: e.target.checked })}
                />{' '}
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
