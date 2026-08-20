import { useEffect, useMemo, useState } from 'react';
import { Link, useOutletContext } from 'react-router-dom';
import { api } from '../../lib/api';

const PAGE_SIZES = [10, 25, 50];
const empty = { name: '', email: '', phone: '', password: 'parent123', active: true };

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

function parentId(p) {
  return p.id || p._id;
}

export default function Parents() {
  const { schoolName = '', globalSearch = '' } = useOutletContext() || {};
  const [parents, setParents] = useState([]);
  const [stats, setStats] = useState(null);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [q, setQ] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [form, setForm] = useState(empty);
  const [editing, setEditing] = useState(null);
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const year = new Date().getFullYear();

  const load = async () => {
    const data = await api('/admin/parents');
    setParents(data.parents || []);
    setStats(data.stats || null);
  };

  useEffect(() => {
    load().catch((e) => setError(e.message));
  }, []);

  useEffect(() => {
    if (globalSearch) setQ(globalSearch);
  }, [globalSearch]);

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return parents.filter((p) => {
      const active = p.active !== false;
      if (statusFilter === 'active' && !active) return false;
      if (statusFilter === 'inactive' && active) return false;
      if (statusFilter === 'linked' && !(p.children || []).length) return false;
      if (statusFilter === 'unlinked' && (p.children || []).length) return false;
      if (!needle) return true;
      const kids = (p.children || []).map((c) => c.name).join(' ');
      return [p.name, p.email, p.phone, kids].filter(Boolean).join(' ').toLowerCase().includes(needle);
    });
  }, [parents, q, statusFilter]);

  const pages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const safePage = Math.min(page, pages);
  const slice = filtered.slice((safePage - 1) * pageSize, safePage * pageSize);

  useEffect(() => {
    setPage(1);
  }, [q, statusFilter, pageSize]);

  const startCreate = () => {
    setEditing(null);
    setForm(empty);
    setOpen(true);
    setError('');
  };

  const startEdit = (p) => {
    setEditing(p);
    setForm({
      name: p.name || '',
      email: p.email || '',
      phone: p.phone || '',
      password: '',
      active: p.active !== false,
    });
    setOpen(true);
    setError('');
  };

  const save = async (e) => {
    e.preventDefault();
    setSaving(true);
    setError('');
    setNotice('');
    try {
      const body = { name: form.name, email: form.email, phone: form.phone, active: form.active };
      if (form.password) body.password = form.password;
      if (editing) {
        await api(`/admin/parents/${parentId(editing)}`, { method: 'PUT', body });
        setNotice(`${form.name} updated.`);
      } else {
        await api('/admin/parents', { method: 'POST', body: { ...body, password: form.password || 'parent123' } });
        setNotice(`${form.name} added.`);
      }
      setOpen(false);
      await load();
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  const setActive = async (p, next) => {
    try {
      await api(`/admin/parents/${parentId(p)}`, { method: 'PUT', body: { active: next } });
      await load();
    } catch (err) {
      setError(err.message);
    }
  };

  const remove = async (p) => {
    if (!window.confirm(`Remove ${p.name}? Linked students are kept.`)) return;
    try {
      await api(`/admin/parents/${parentId(p)}`, { method: 'DELETE' });
      setNotice(`${p.name} removed.`);
      await load();
    } catch (err) {
      setError(err.message);
    }
  };

  const kpis = [
    { label: 'Parents', value: stats?.total ?? parents.length, tint: 'purple' },
    {
      label: 'Active',
      value: stats?.active ?? parents.filter((p) => p.active !== false).length,
      hint: pct(stats?.active ?? 0, stats?.total || parents.length),
      tint: 'green',
    },
    { label: 'With students', value: stats?.withKids ?? 0, tint: 'sky' },
    { label: 'No students linked', value: stats?.withoutKids ?? 0, tint: 'orange' },
  ];

  return (
    <div className="sa-students">
      {error && <div className="alert">{error}</div>}
      {notice && <div className="alert alert-ok">{notice}</div>}
      <div className="sa-users-head">
        <p className="sa-muted">Parent accounts for this school. Students stay linked from their own records.</p>
        <button type="button" className="sa-btn sa-btn-primary" onClick={startCreate}>
          + Add parent
        </button>
      </div>
      <section className="sa-stu-kpis sa-users-kpis">
        {kpis.map((m) => (
          <article key={m.label} className={`sa-stu-kpi tint-${m.tint}`}>
            <div>
              <span>{m.label}</span>
              <strong>{m.value}</strong>
              {m.hint ? <em>{m.hint}</em> : null}
            </div>
          </article>
        ))}
      </section>
      <article className="sa-card sa-stu-table-card">
        <div className="sa-stu-toolbar">
          <label className="sa-stu-search">
            <span aria-hidden="true">⌕</span>
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search by name, email, phone, or student..." />
          </label>
          <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} aria-label="Filter">
            <option value="">All parents</option>
            <option value="active">Active</option>
            <option value="inactive">Inactive</option>
            <option value="linked">With students</option>
            <option value="unlinked">No students linked</option>
          </select>
        </div>
        <div className="sa-table-wrap">
          <table className="sa-table sa-stu-table">
            <thead>
              <tr>
                <th>Parent</th>
                <th>Phone</th>
                <th>Students</th>
                <th>Status</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {slice.map((p) => (
                <tr key={parentId(p)}>
                  <td>
                    <div className="sa-stu-person">
                      {p.photoUrl ? <img src={p.photoUrl} alt="" /> : <span>{initials(p.name)}</span>}
                      <div>
                        <strong>{p.name}</strong>
                        <small>{p.email || '—'}</small>
                      </div>
                    </div>
                  </td>
                  <td>{p.phone || '—'}</td>
                  <td>
                    {(p.children || []).length ? (
                      <div className="sa-muted">
                        {p.children.map((c) => (
                          <div key={c.id}>
                            <Link to={`/school-admin/students/${c.id}`}>{c.name}</Link>
                            {c.grade ? ` · ${c.grade}` : ''}
                          </div>
                        ))}
                      </div>
                    ) : (
                      '—'
                    )}
                  </td>
                  <td>
                    <span className={`sa-stu-status is-${p.active === false ? 'inactive' : 'active'}`}>
                      {p.active === false ? 'Inactive' : 'Active'}
                    </span>
                  </td>
                  <td>
                    <button type="button" className="sa-text-link" onClick={() => startEdit(p)}>
                      Edit
                    </button>{' '}
                    <button
                      type="button"
                      className="sa-text-link"
                      onClick={() => setActive(p, p.active === false)}
                    >
                      {p.active === false ? 'Activate' : 'Deactivate'}
                    </button>{' '}
                    <button type="button" className="sa-text-link" onClick={() => remove(p)}>
                      Remove
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {!slice.length && <p className="sa-home-empty">No parents in this view.</p>}
        <div className="sa-table-foot sa-stu-foot">
          <span>
            Showing {filtered.length ? (safePage - 1) * pageSize + 1 : 0} to{' '}
            {Math.min(safePage * pageSize, filtered.length)} of {filtered.length} parents
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
      {open && (
        <div className="sa-reports-modal" role="dialog">
          <form className="sa-card" onSubmit={save}>
            <h3>{editing ? 'Edit parent' : 'Add parent'}</h3>
            <label>
              Name
              <input required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
            </label>
            <label>
              Email
              <input required type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
            </label>
            <label>
              Phone
              <input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
            </label>
            <label>
              {editing ? 'New password (optional)' : 'Temp password'}
              <input value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} />
            </label>
            {editing ? (
              <label className="check">
                <input
                  type="checkbox"
                  checked={form.active}
                  onChange={(e) => setForm({ ...form, active: e.target.checked })}
                />
                Active
              </label>
            ) : null}
            <div className="sa-reports-actions">
              <button type="button" className="sa-btn sa-btn-outline" onClick={() => setOpen(false)}>
                Cancel
              </button>
              <button className="sa-btn sa-btn-primary" type="submit" disabled={saving}>
                Save
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
