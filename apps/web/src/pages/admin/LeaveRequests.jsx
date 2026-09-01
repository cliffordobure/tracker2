import { useEffect, useMemo, useState } from 'react';
import { useOutletContext } from 'react-router-dom';
import { api } from '../../lib/api';
import { useAuth } from '../../context/AuthContext';

const PAGE_SIZES = [10, 25, 50];
const TABS = [
  { id: 'all', label: 'All Requests' },
  { id: 'pending', label: 'Pending' },
  { id: 'approved', label: 'Approved' },
  { id: 'rejected', label: 'Rejected' },
  { id: 'cancelled', label: 'Cancelled' },
];
const TYPE_LABEL = {
  vacation: 'Vacation / Holiday',
  sick: 'Sick Leave',
  family: 'Family Emergency',
  other: 'Other',
};
const emptyFilters = { q: '', grade: '', leaveType: '', status: '', from: '', to: '' };

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

function fmtDate(value) {
  if (!value) return '—';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
}

function fmtDateTime(value) {
  if (!value) return '—';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '—';
  return `${fmtDate(d)} ${d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}`;
}

function weekday(value) {
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleDateString(undefined, { weekday: 'long' });
}

function initials(name = '') {
  const parts = String(name).trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return '?';
  if (parts.length === 1) return parts[0][0].toUpperCase();
  return (parts[0][0] + parts[1][0]).toUpperCase();
}

function rowId(row) {
  return String(row.id || row._id || '');
}

function startOfDay(value) {
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return null;
  d.setHours(0, 0, 0, 0);
  return d;
}

function isLeaveInProgress(row) {
  if (row?.status !== 'approved') return false;
  const start = startOfDay(row.startDate);
  const end = startOfDay(row.endDate);
  const today = startOfDay(new Date());
  if (!start || !end || !today) return false;
  return start.getTime() <= today.getTime() && today.getTime() <= end.getTime();
}

function canCancelLeave(row) {
  return row?.status === 'pending' || row?.status === 'approved';
}

function cancelLeaveLabel(row) {
  return isLeaveInProgress(row) ? 'Stop leave' : 'Cancel leave';
}

function LeaveIcon({ name }) {
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
  if (name === 'clock') {
    return (
      <svg {...p}>
        <circle cx="12" cy="12" r="8" />
        <path d="M12 8v4.4l2.8 1.6" />
      </svg>
    );
  }
  if (name === 'check') return <svg {...p}><circle cx="12" cy="12" r="8" /><path d="m8.6 12.2 2.5 2.4 4.4-4.8" /></svg>;
  if (name === 'x') return <svg {...p}><circle cx="12" cy="12" r="8" /><path d="m9 9 6 6M15 9l-6 6" /></svg>;
  if (name === 'stop') {
    return (
      <svg {...p}>
        <circle cx="12" cy="12" r="8" />
        <rect x="9" y="9" width="6" height="6" rx="1" />
      </svg>
    );
  }
  if (name === 'chart') {
    return (
      <svg {...p}>
        <path d="M5 19V9.5M10 19V5M15 19v-6.5M20 19V8" />
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
  if (name === 'export') {
    return (
      <svg {...p}>
        <path d="M12 4v10M8.5 7.5 12 4l3.5 3.5M5 14.5V19a1.5 1.5 0 0 0 1.5 1.5h11A1.5 1.5 0 0 0 19 19v-4.5" />
      </svg>
    );
  }
  if (name === 'sort') return <svg {...p} width={10} height={10}><path d="M5 1.6 7.6 5H2.4L5 1.6ZM5 8.4 2.4 5h5.2L5 8.4Z" fill="currentColor" stroke="none" /></svg>;
  if (name === 'eye') {
    return (
      <svg {...p}>
        <path d="M3 12s3.4-6.5 9-6.5S21 12 21 12s-3.4 6.5-9 6.5S3 12 3 12Z" />
        <circle cx="12" cy="12" r="2.4" />
      </svg>
    );
  }
  return null;
}

function EmptyIllustration() {
  return (
    <svg width="88" height="72" viewBox="0 0 88 72" fill="none" aria-hidden="true">
      <rect x="14" y="10" width="42" height="52" rx="6" fill="#eef2ff" stroke="#c7d2fe" strokeWidth="1.6" />
      <path d="M24 24h22M24 32h16M24 40h20" stroke="#818cf8" strokeWidth="1.7" strokeLinecap="round" />
      <circle cx="60" cy="46" r="13" fill="#fff" stroke="#6366f1" strokeWidth="1.8" />
      <path d="m69 55 8 8" stroke="#6366f1" strokeWidth="2" strokeLinecap="round" />
      <circle cx="28" cy="14" r="1.4" fill="#a5b4fc" />
      <circle cx="70" cy="18" r="1.2" fill="#c4b5fd" />
      <circle cx="76" cy="38" r="1" fill="#a5b4fc" />
    </svg>
  );
}

export default function LeaveRequests() {
  const { showToast } = useAuth();
  const { globalSearch = '' } = useOutletContext() || {};
  const [requests, setRequests] = useState([]);
  const [stats, setStats] = useState({ pending: 0, approved: 0, rejected: 0, cancelled: 0, total: 0 });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [tab, setTab] = useState('all');
  const [selectedId, setSelectedId] = useState('');
  const [busy, setBusy] = useState(false);
  const [filters, setFilters] = useState(emptyFilters);
  const [sort, setSort] = useState({ key: 'createdAt', dir: 'desc' });
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [menuId, setMenuId] = useState('');

  const load = async () => {
    setLoading(true);
    setError('');
    try {
      const [listRes, statsRes] = await Promise.all([
        api('/admin/leave-requests'),
        api('/admin/leave-requests/stats').catch(() => null),
      ]);
      const rows = listRes.requests || [];
      setRequests(rows);
      if (statsRes?.stats) {
        setStats(statsRes.stats);
      } else {
        setStats({
          pending: rows.filter((r) => r.status === 'pending').length,
          approved: rows.filter((r) => r.status === 'approved').length,
          rejected: rows.filter((r) => r.status === 'rejected').length,
          cancelled: rows.filter((r) => r.status === 'cancelled').length,
          total: rows.length,
        });
      }
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  useEffect(() => {
    if (globalSearch) setFilters((f) => ({ ...f, q: globalSearch }));
  }, [globalSearch]);

  useEffect(() => {
    const close = () => setMenuId('');
    window.addEventListener('click', close);
    return () => window.removeEventListener('click', close);
  }, []);

  const grades = useMemo(() => {
    const set = new Set();
    requests.forEach((r) => {
      const g = r.kidId?.grade;
      if (g) set.add(g);
    });
    return [...set].sort();
  }, [requests]);

  const filtered = useMemo(() => {
    const rows = requests.filter((r) => {
      if (tab !== 'all' && r.status !== tab) return false;
      if (filters.status && r.status !== filters.status) return false;
      if (filters.leaveType && r.leaveType !== filters.leaveType) return false;
      if (filters.grade && r.kidId?.grade !== filters.grade) return false;
      if (filters.from) {
        const start = new Date(r.startDate);
        if (start < new Date(`${filters.from}T00:00:00`)) return false;
      }
      if (filters.to) {
        const start = new Date(r.startDate);
        if (start > new Date(`${filters.to}T23:59:59`)) return false;
      }
      if (filters.q.trim()) {
        const q = filters.q.trim().toLowerCase();
        const hay = [r.kidId?.name, r.kidId?.admissionNo, r.parentId?.name, r.reason, r.leaveType, r.status]
          .filter(Boolean)
          .join(' ')
          .toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
    const dir = sort.dir === 'asc' ? 1 : -1;
    const valueOf = (r) => {
      if (sort.key === 'student') return r.kidId?.name || r.parentId?.name || '';
      if (sort.key === 'class') return r.kidId?.grade || '';
      if (sort.key === 'type') return r.leaveType || '';
      if (sort.key === 'from') return r.startDate || '';
      if (sort.key === 'to') return r.endDate || '';
      if (sort.key === 'reason') return r.reason || '';
      if (sort.key === 'status') return r.status || '';
      return r.createdAt || '';
    };
    return [...rows].sort((a, b) => {
      const av = valueOf(a);
      const bv = valueOf(b);
      if (av < bv) return -1 * dir;
      if (av > bv) return 1 * dir;
      return 0;
    });
  }, [requests, tab, filters, sort]);

  const pages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const safePage = Math.min(page, pages);
  const slice = filtered.slice((safePage - 1) * pageSize, safePage * pageSize);
  const from = filtered.length ? (safePage - 1) * pageSize + 1 : 0;
  const to = Math.min(safePage * pageSize, filtered.length);
  const selected = requests.find((r) => rowId(r) === selectedId) || null;

  useEffect(() => {
    setPage(1);
  }, [tab, filters, pageSize, sort]);

  const resetFilters = () => {
    setFilters(emptyFilters);
    setTab('all');
    setPage(1);
  };

  const showTab = (next) => {
    setTab(next);
    setFilters((f) => ({ ...f, status: '' }));
    setPage(1);
  };

  const toggleSort = (key) => {
    setSort((s) => (s.key === key ? { key, dir: s.dir === 'asc' ? 'desc' : 'asc' } : { key, dir: 'asc' }));
  };

  const setStatus = async (row, status) => {
    if (status === 'cancelled') {
      const stop = isLeaveInProgress(row);
      const name = row.kidId?.name || 'this student';
      const ok = window.confirm(
        stop
          ? `Stop ${name}'s leave? They will be expected back at school from today.`
          : `Cancel ${name}'s leave request?`
      );
      if (!ok) return;
    }
    setBusy(true);
    setMenuId('');
    try {
      const { request } = await api(`/admin/leave-requests/${rowId(row)}`, {
        method: 'PATCH',
        body: { status },
      });
      setRequests((prev) => prev.map((r) => (rowId(r) === rowId(request) ? request : r)));
      setStats((s) => {
        const next = { ...s };
        if (row.status !== status) {
          if (next[row.status] != null) next[row.status] = Math.max(0, next[row.status] - 1);
          if (next[status] != null) next[status] += 1;
        }
        return next;
      });
      const done =
        status === 'cancelled'
          ? request?.stoppedEarly || isLeaveInProgress(row)
            ? 'Leave stopped'
            : 'Leave cancelled'
          : `Request ${status}`;
      showToast?.(done, 'success');
      window.dispatchEvent(new Event('sa-inbox-refresh'));
    } catch (e) {
      showToast?.(e.message, 'error');
    } finally {
      setBusy(false);
    }
  };

  const exportCsv = () => {
    const header = ['Student', 'Admin / Parent', 'Admission', 'Class', 'Type', 'From', 'To', 'Reason', 'Status', 'Requested On'];
    const lines = filtered.map((r) =>
      [
        r.kidId?.name || '',
        r.parentId?.name || '',
        r.kidId?.admissionNo || '',
        r.kidId?.grade || '',
        TYPE_LABEL[r.leaveType] || r.leaveType,
        fmtDate(r.startDate),
        fmtDate(r.endDate),
        r.reason || '',
        r.status,
        fmtDateTime(r.createdAt),
      ]
        .map((v) => `"${String(v).replace(/"/g, '""')}"`)
        .join(',')
    );
    const blob = new Blob([[header.join(','), ...lines].join('\n')], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'leave-requests.csv';
    a.click();
    URL.revokeObjectURL(url);
  };

  const kpis = [
    { id: 'pending', label: 'Pending Requests', value: loading ? '…' : stats.pending, hint: 'Awaiting review', link: 'View all pending', tint: 'orange', icon: 'clock' },
    { id: 'approved', label: 'Approved', value: loading ? '…' : stats.approved, hint: 'Requests approved', link: 'View all approved', tint: 'green', icon: 'check' },
    { id: 'rejected', label: 'Rejected', value: loading ? '…' : stats.rejected, hint: 'Requests rejected', link: 'View all rejected', tint: 'rose', icon: 'x' },
    { id: 'all', label: 'Total Requests', value: loading ? '…' : stats.total, hint: 'All time', link: 'View all requests', tint: 'sky', icon: 'chart' },
  ];

  const columns = [
    { key: 'student', label: 'Student / Admin' },
    { key: 'class', label: 'Class' },
    { key: 'type', label: 'Type' },
    { key: 'from', label: 'From' },
    { key: 'to', label: 'To' },
    { key: 'reason', label: 'Reason' },
    { key: 'status', label: 'Status' },
    { key: 'createdAt', label: 'Requested On' },
  ];

  return (
    <div className="sa-students sa-users sa-leave">
      {error && <div className="alert">{error}</div>}

      <header className="sa-leave-intro">
        <h2>Leave Requests</h2>
        <p>Review and manage student leave requests.</p>
      </header>

      <section className="sa-leave-kpis" aria-label="Leave request metrics">
        {kpis.map((m) => (
          <article key={m.id} className={`sa-leave-kpi tint-${m.tint}`}>
            <i aria-hidden="true">
              <LeaveIcon name={m.icon} />
            </i>
            <div>
              <span>{m.label}</span>
              <strong>{m.value}</strong>
              <em>{m.hint}</em>
              <button type="button" onClick={() => showTab(m.id)}>
                {m.link} ›
              </button>
            </div>
          </article>
        ))}
      </section>

      <article className="sa-card sa-stu-table-card sa-leave-panel">
        <div className="sa-tabs sa-users-tabs sa-leave-tabs">
          {TABS.map((t) => (
            <button
              key={t.id}
              type="button"
              className={`sa-tab${tab === t.id ? ' is-active' : ''}`}
              onClick={() => showTab(t.id)}
            >
              {t.label}
            </button>
          ))}
        </div>

        <div className="sa-leave-toolbar">
          <label className="sa-assign-search">
            <LeaveIcon name="search" />
            <input
              value={filters.q}
              onChange={(e) => setFilters((f) => ({ ...f, q: e.target.value }))}
              placeholder="Search student / admin name..."
            />
          </label>
          <select value={filters.grade} onChange={(e) => setFilters((f) => ({ ...f, grade: e.target.value }))} aria-label="Class">
            <option value="">All Classes</option>
            {grades.map((g) => (
              <option key={g} value={g}>
                {g}
              </option>
            ))}
          </select>
          <select value={filters.leaveType} onChange={(e) => setFilters((f) => ({ ...f, leaveType: e.target.value }))} aria-label="Type">
            <option value="">All Types</option>
            <option value="vacation">Vacation / Holiday</option>
            <option value="sick">Sick Leave</option>
            <option value="family">Family Emergency</option>
            <option value="other">Other</option>
          </select>
          <select value={filters.status} onChange={(e) => setFilters((f) => ({ ...f, status: e.target.value }))} aria-label="Status">
            <option value="">All Status</option>
            <option value="pending">Pending</option>
            <option value="approved">Approved</option>
            <option value="rejected">Rejected</option>
            <option value="cancelled">Cancelled</option>
          </select>
          <input type="date" value={filters.from} onChange={(e) => setFilters((f) => ({ ...f, from: e.target.value }))} aria-label="From date" />
          <input type="date" value={filters.to} onChange={(e) => setFilters((f) => ({ ...f, to: e.target.value }))} aria-label="To date" />
          <button type="button" className="sa-btn sa-btn-outline sa-leave-export" onClick={exportCsv}>
            <LeaveIcon name="export" />
            Export
          </button>
        </div>

        <div className="sa-table-wrap">
          <table className="sa-table sa-leave-table">
            <thead>
              <tr>
                {columns.map((col) => (
                  <th key={col.key}>
                    <button type="button" className="sa-assign-sort" onClick={() => toggleSort(col.key)}>
                      {col.label}
                      <LeaveIcon name="sort" />
                    </button>
                  </th>
                ))}
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {!loading &&
                slice.map((r) => {
                  const id = rowId(r);
                  const kid = r.kidId || {};
                  return (
                    <tr key={id}>
                      <td>
                        <div className="sa-person-cell sa-leave-person">
                          <span className="sa-avatar">{initials(kid.name || r.parentId?.name)}</span>
                          <div>
                            <strong>{kid.name || r.parentId?.name || 'Student'}</strong>
                            <small>{[kid.admissionNo, r.parentId?.name].filter(Boolean).join(' · ') || '—'}</small>
                          </div>
                        </div>
                      </td>
                      <td>{kid.grade || '—'}</td>
                      <td>{TYPE_LABEL[r.leaveType] || r.leaveType || '—'}</td>
                      <td>{fmtDate(r.startDate)}</td>
                      <td>{fmtDate(r.endDate)}</td>
                      <td className="sa-leave-reason">{r.reason || '—'}</td>
                      <td>
                        <span className={`sa-status sa-status-${r.status}`}>{r.status}</span>
                      </td>
                      <td>{fmtDateTime(r.createdAt)}</td>
                      <td>
                        <div className="sa-inc-row-actions" onClick={(e) => e.stopPropagation()}>
                          <button type="button" className="sa-icon-btn" aria-label="View" onClick={() => setSelectedId(id)}>
                            <LeaveIcon name="eye" />
                          </button>
                          <button
                            type="button"
                            className="sa-icon-btn"
                            aria-label="More"
                            onClick={(e) => {
                              e.stopPropagation();
                              setMenuId(menuId === id ? '' : id);
                            }}
                          >
                            ⋮
                          </button>
                          {menuId === id && (
                            <div className="sa-inc-menu" onClick={(e) => e.stopPropagation()}>
                              <button type="button" onClick={() => setSelectedId(id)}>
                                View details
                              </button>
                              <button type="button" disabled={busy || r.status === 'approved'} onClick={() => setStatus(r, 'approved')}>
                                Approve
                              </button>
                              <button type="button" disabled={busy || r.status === 'rejected'} onClick={() => setStatus(r, 'rejected')}>
                                Reject
                              </button>
                            </div>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
            </tbody>
          </table>
        </div>

        {(loading || !slice.length) && (
          <div className="sa-inc-empty sa-leave-empty">
            {loading ? (
              <p>Loading leave requests…</p>
            ) : (
              <>
                <EmptyIllustration />
                <strong>No leave requests found</strong>
                <p>There are no leave requests that match your current filters.</p>
                <button type="button" className="sa-btn sa-btn-primary" onClick={resetFilters}>
                  Clear filters
                </button>
              </>
            )}
          </div>
        )}

        <div className="sa-table-foot sa-stu-foot sa-inc-foot">
          <span>
            Showing {from} to {to} of {filtered.length} entries
          </span>
          <div className="sa-inc-pager">
            <select
              value={pageSize}
              onChange={(e) => setPageSize(Number(e.target.value))}
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

      {selected && (
        <div className="sa-reports-modal" role="dialog" aria-modal="true" aria-labelledby="leave-detail-title">
          <div className="sa-card sa-modal-form sa-leave-detail">
            <header className="sa-modal-head">
              <h3 id="leave-detail-title">Request Details</h3>
              <p className="sa-muted">Review this leave request and approve or reject it.</p>
            </header>
            <div className="sa-modal-body">
              <div className="sa-drawer-student">
                <span className="sa-avatar lg">{initials(selected.kidId?.name)}</span>
                <div>
                  <strong>{selected.kidId?.name || 'Student'}</strong>
                  <small>
                    {selected.kidId?.admissionNo || '—'}
                    {selected.kidId?.grade ? ` · ${selected.kidId.grade}` : ''}
                    {selected.kidId?.house ? ` · ${selected.kidId.house}` : ''}
                  </small>
                </div>
              </div>
              <dl className="sa-drawer-fields">
                <div>
                  <dt>Leave Type</dt>
                  <dd>{TYPE_LABEL[selected.leaveType] || selected.leaveType}</dd>
                </div>
                <div className="sa-modal-grid2">
                  <div>
                    <dt>From</dt>
                    <dd>
                      {fmtDate(selected.startDate)}
                      <small>{weekday(selected.startDate)}</small>
                    </dd>
                  </div>
                  <div>
                    <dt>To</dt>
                    <dd>
                      {fmtDate(selected.endDate)}
                      <small>{weekday(selected.endDate)}</small>
                    </dd>
                  </div>
                </div>
                <div>
                  <dt>Reason</dt>
                  <dd>{selected.reason || '—'}</dd>
                </div>
                {selected.notes ? (
                  <div>
                    <dt>Additional Notes</dt>
                    <dd>{selected.notes}</dd>
                  </div>
                ) : null}
                <div>
                  <dt>Requested On</dt>
                  <dd>{fmtDateTime(selected.createdAt)}</dd>
                </div>
                <div>
                  <dt>Parent / Admin</dt>
                  <dd>
                    {selected.parentId?.name || '—'}
                    {selected.parentId?.phone ? ` · ${selected.parentId.phone}` : ''}
                  </dd>
                </div>
                <div>
                  <dt>Status</dt>
                  <dd>
                    <span className={`sa-status sa-status-${selected.status}`}>{selected.status}</span>
                  </dd>
                </div>
              </dl>
            </div>
            <div className="sa-reports-actions">
              <button type="button" className="sa-btn sa-btn-outline" onClick={() => setSelectedId('')}>
                Close
              </button>
              <button
                type="button"
                className="sa-btn sa-btn-danger"
                disabled={busy || selected.status === 'rejected'}
                onClick={() => setStatus(selected, 'rejected')}
              >
                Reject
              </button>
              <button
                type="button"
                className="sa-btn sa-btn-success"
                disabled={busy || selected.status === 'approved'}
                onClick={() => setStatus(selected, 'approved')}
              >
                Approve
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
