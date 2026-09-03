import { useEffect, useMemo, useState } from 'react';
import { Link, useOutletContext } from 'react-router-dom';
import { api } from '../../lib/api';

const PAGE_SIZES = [10, 25, 50];
const empty = { name: '', email: '', phone: '', password: '', active: true };

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

function splitNames(value) {
  return [...new Set(String(value || '').split(',').map((s) => s.trim()).filter(Boolean))];
}

function MultiCell({ value }) {
  const items = splitNames(value);
  if (!items.length) return '—';
  if (items.length === 1) return items[0];
  return (
    <div className="sa-par-kids">
      {items.map((item) => (
        <span key={item}>{item}</span>
      ))}
    </div>
  );
}

function FieldIcon({ name }) {
  const p = { width: 16, height: 16, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 1.8, strokeLinecap: 'round', strokeLinejoin: 'round' };
  if (name === 'mail') return <svg {...p}><rect x="3.5" y="5.5" width="17" height="13" rx="2" /><path d="m4 7 8 6 8-6" /></svg>;
  if (name === 'phone') return <svg {...p}><path d="M8 3.5h3.2l1.2 3.2-2 1.4a12 12 0 0 0 5.5 5.5l1.4-2 3.2 1.2V16a2 2 0 0 1-2.2 2 16 16 0 0 1-14-14A2 2 0 0 1 8 3.5Z" /></svg>;
  if (name === 'lock') return <svg {...p}><rect x="5" y="11" width="14" height="10" rx="2" /><path d="M8 11V8a4 4 0 0 1 8 0" /></svg>;
  return <svg {...p}><circle cx="12" cy="8" r="3.2" /><path d="M5.5 19a6.5 6.5 0 0 1 13 0" /></svg>;
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
  const [menuId, setMenuId] = useState('');
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
      return [p.name, p.email, p.phone, kids, p.routeName, p.stopName, p.driverName]
        .filter(Boolean)
        .join(' ')
        .toLowerCase()
        .includes(needle);
    });
  }, [parents, q, statusFilter]);

  const pages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const safePage = Math.min(page, pages);
  const slice = filtered.slice((safePage - 1) * pageSize, safePage * pageSize);

  useEffect(() => {
    setPage(1);
  }, [q, statusFilter, pageSize]);

  useEffect(() => {
    const close = () => setMenuId('');
    window.addEventListener('click', close);
    return () => window.removeEventListener('click', close);
  }, []);

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
        if (!String(form.password || '').trim()) {
          setError('Password is required');
          return;
        }
        await api('/admin/parents', { method: 'POST', body: { ...body, password: form.password.trim() } });
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
      {error && !open && <div className="alert">{error}</div>}
      {notice && <div className="alert alert-ok">{notice}</div>}
      <p className="sa-muted sa-par-lead">Parent accounts for this school. Students stay linked from their own records.</p>
      <section className="sa-stu-kpis sa-users-kpis">
        {kpis.map((m) => (
          <article key={m.label} className={`sa-stu-kpi tint-${m.tint}`}>
            <i className="sa-stu-kpi-icon" aria-hidden="true" />
            <div>
              <span>{m.label}</span>
              <strong>{m.value}</strong>
              {m.hint ? <em>{m.hint}</em> : null}
            </div>
            <svg className="sa-stu-spark" viewBox="0 0 120 18" preserveAspectRatio="none" aria-hidden="true">
              <path d="M0 12 C12 12 14 6 24 6 S36 14 48 11 S64 4 76 7 S96 16 120 8" fill="none" stroke="currentColor" strokeWidth="1.8" />
            </svg>
          </article>
        ))}
      </section>
      <article className={`sa-card sa-stu-table-card${menuId ? ' is-menu-open' : ''}`}>
        <div className="sa-stu-toolbar sa-par-toolbar">
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
          <button type="button" className="sa-btn sa-btn-primary" onClick={startCreate}>
            + Add parent
          </button>
        </div>
        <div className="sa-table-wrap">
          <table className="sa-table sa-stu-table">
            <thead>
              <tr>
                <th>Parent</th>
                <th>Students</th>
                <th>Route</th>
                <th>Stop</th>
                <th>Driver</th>
                <th>Status</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {slice.map((p, i) => {
                const id = parentId(p);
                return (
                  <tr key={id}>
                    <td>
                      <div className="sa-stu-person">
                        {p.photoUrl ? <img src={p.photoUrl} alt="" /> : <span>{initials(p.name)}</span>}
                        <div>
                          <strong>{p.name}</strong>
                          <small>{p.email || '—'}</small>
                          {p.phone ? (
                            <span className="sa-stu-phone">
                              <a href={`tel:${p.phone}`}>{p.phone}</a>
                            </span>
                          ) : null}
                        </div>
                      </div>
                    </td>
                    <td>
                      {(p.children || []).length ? (
                        <div className="sa-par-kids">
                          {p.children.map((c) => (
                            <Link key={c.id} to={`/school-admin/students/${c.id}`}>
                              {c.name}{c.grade ? ` · ${c.grade}` : ''}
                            </Link>
                          ))}
                        </div>
                      ) : (
                        '—'
                      )}
                    </td>
                    <td><MultiCell value={p.routeName} /></td>
                    <td><MultiCell value={p.stopName} /></td>
                    <td><MultiCell value={p.driverName} /></td>
                    <td>
                      <span className={`sa-stu-status is-${p.active === false ? 'inactive' : 'active'}`}>
                        {p.active === false ? 'Inactive' : 'Active'}
                      </span>
                    </td>
                    <td>
                      <div className="sa-par-actions">
                        <button type="button" className="sa-text-link" onClick={() => startEdit(p)}>
                          Edit
                        </button>
                        <button
                          type="button"
                          className="sa-text-link"
                          onClick={() => setActive(p, p.active === false)}
                        >
                          {p.active === false ? 'Activate' : 'Deactivate'}
                        </button>
                        <div className={`sa-stu-more${menuId === id ? ' is-open' : ''}${i >= slice.length - 1 ? ' is-up' : ''}`}>
                          <button
                            type="button"
                            className="sa-icon-ghost"
                            aria-label="More"
                            aria-expanded={menuId === id}
                            onClick={(e) => {
                              e.stopPropagation();
                              e.nativeEvent.stopImmediatePropagation();
                              setMenuId((cur) => (cur === id ? '' : id));
                            }}
                          >
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                              <circle cx="12" cy="5" r="1.6" />
                              <circle cx="12" cy="12" r="1.6" />
                              <circle cx="12" cy="19" r="1.6" />
                            </svg>
                          </button>
                          {menuId === id && (
                            <div className="sa-stu-menu" role="menu" onClick={(e) => e.stopPropagation()}>
                              <button type="button" role="menuitem" className="is-danger" onClick={() => { setMenuId(''); remove(p); }}>
                                <i aria-hidden="true">
                                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M5 7h14M10 7V5h4v2M8 7l.7 12h6.6L16 7" /></svg>
                                </i>
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
        <div className="sa-action-overlay" onClick={() => !saving && setOpen(false)} role="presentation">
          <form className="sa-action-modal sa-par-modal" role="dialog" aria-label={editing ? 'Edit parent' : 'Add parent'} onClick={(e) => e.stopPropagation()} onSubmit={save}>
            <header className="sa-par-head">
              <i aria-hidden="true">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
                  <circle cx="9" cy="8" r="3" />
                  <path d="M3.6 18.5a5.4 5.4 0 0 1 10.8 0" />
                  <circle cx="17" cy="9" r="2.4" />
                  <path d="M21.6 18.2a4.4 4.4 0 0 0-6.2-3.2" />
                </svg>
              </i>
              <div>
                <h2>{editing ? 'Edit parent' : 'Add parent'}</h2>
                <p>{editing ? 'Update this parent account and optional new password.' : 'Fill in the parent details below to create an account.'}</p>
              </div>
              <button type="button" className="sa-icon-ghost" aria-label="Close" onClick={() => !saving && setOpen(false)}>×</button>
            </header>
            <div className="sa-par-body">
              {error ? <div className="alert">{error}</div> : null}
              <div className="sa-par-field">
                <i aria-hidden="true"><FieldIcon name="user" /></i>
                <label className="sa-field">
                  <span>Name <em>*</em></span>
                  <input required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="e.g. Jane Mwangi" />
                </label>
              </div>
              <div className="sa-par-field">
                <i aria-hidden="true"><FieldIcon name="mail" /></i>
                <label className="sa-field">
                  <span>Email <em>*</em></span>
                  <input required type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} placeholder="parent@email.com" />
                </label>
              </div>
              <div className="sa-par-field">
                <i aria-hidden="true"><FieldIcon name="phone" /></i>
                <label className="sa-field">
                  <span>Phone <em>*</em></span>
                  <input required value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} placeholder="07..." />
                </label>
              </div>
              <div className="sa-par-field">
                <i aria-hidden="true"><FieldIcon name="lock" /></i>
                <label className="sa-field">
                  <span>{editing ? 'New password (optional)' : <>Temporary password <em>*</em></>}</span>
                  <input
                    required={!editing}
                    value={form.password}
                    onChange={(e) => setForm({ ...form, password: e.target.value })}
                    placeholder={editing ? 'Leave blank to keep current' : 'Enter a password'}
                  />
                </label>
              </div>
              {editing ? (
                <label className="check sa-par-active">
                  <input
                    type="checkbox"
                    checked={form.active}
                    onChange={(e) => setForm({ ...form, active: e.target.checked })}
                  />
                  Active
                </label>
              ) : null}
            </div>
            <div className="sa-par-foot">
              <button type="button" className="sa-btn sa-btn-outline" onClick={() => !saving && setOpen(false)}>
                Cancel
              </button>
              <button className="sa-btn sa-btn-primary" type="submit" disabled={saving}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
                  <path d="M5 5h12l3 3v11H5z" />
                  <path d="M8 5v5h8V5M8 19v-6h8v6" />
                </svg>
                {saving ? 'Saving…' : editing ? 'Save changes' : 'Save parent'}
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
