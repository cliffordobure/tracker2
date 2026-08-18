import { useEffect, useMemo, useState } from 'react';
import { api } from '../../lib/api';
import { useAuth } from '../../context/AuthContext';

const TABS = [
  { id: 'all', label: 'All Requests' },
  { id: 'pending', label: 'Pending' },
  { id: 'approved', label: 'Approved' },
  { id: 'rejected', label: 'Rejected' },
];

const TYPE_LABEL = {
  vacation: 'Vacation / Holiday',
  sick: 'Sick Leave',
  family: 'Family Emergency',
  other: 'Other',
};

function fmtDate(value) {
  if (!value) return '—';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleDateString(undefined, {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
}

function fmtDateTime(value) {
  if (!value) return '—';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '—';
  return `${fmtDate(d)} ${d.toLocaleTimeString(undefined, {
    hour: '2-digit',
    minute: '2-digit',
  })}`;
}

function weekday(value) {
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleDateString(undefined, { weekday: 'long' });
}

function initials(name = '') {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return '?';
  if (parts.length === 1) return parts[0][0].toUpperCase();
  return (parts[0][0] + parts[1][0]).toUpperCase();
}

export default function LeaveRequests() {
  const { showToast } = useAuth();
  const [requests, setRequests] = useState([]);
  const [stats, setStats] = useState({ pending: 0, approved: 0, rejected: 0, total: 0 });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [tab, setTab] = useState('all');
  const [selectedId, setSelectedId] = useState(null);
  const [busy, setBusy] = useState(false);
  const [filters, setFilters] = useState({
    q: '',
    grade: '',
    leaveType: '',
    status: '',
    from: '',
    to: '',
  });
  const [page, setPage] = useState(1);
  const pageSize = 5;

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
          total: rows.length,
        });
      }
      if (!selectedId && rows[0]) setSelectedId(rows[0]._id);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
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
    return requests.filter((r) => {
      if (tab !== 'all' && r.status !== tab) return false;
      if (filters.status && r.status !== filters.status) return false;
      if (filters.leaveType && r.leaveType !== filters.leaveType) return false;
      if (filters.grade && r.kidId?.grade !== filters.grade) return false;
      if (filters.from) {
        const start = new Date(r.startDate);
        if (start < new Date(filters.from)) return false;
      }
      if (filters.to) {
        const start = new Date(r.startDate);
        const to = new Date(filters.to);
        to.setHours(23, 59, 59, 999);
        if (start > to) return false;
      }
      if (filters.q.trim()) {
        const q = filters.q.trim().toLowerCase();
        const hay = [
          r.kidId?.name,
          r.kidId?.admissionNo,
          r.parentId?.name,
          r.reason,
          r.leaveType,
        ]
          .filter(Boolean)
          .join(' ')
          .toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [requests, tab, filters]);

  const pageCount = Math.max(1, Math.ceil(filtered.length / pageSize));
  const pageRows = filtered.slice((page - 1) * pageSize, page * pageSize);
  const selected = requests.find((r) => r._id === selectedId) || null;

  useEffect(() => {
    setPage(1);
  }, [tab, filters]);

  const setStatus = async (status) => {
    if (!selected) return;
    setBusy(true);
    try {
      const { request } = await api(`/admin/leave-requests/${selected._id}`, {
        method: 'PATCH',
        body: { status },
      });
      setRequests((prev) => prev.map((r) => (r._id === request._id ? request : r)));
      setStats((s) => {
        const next = { ...s };
        if (selected.status !== status) {
          if (next[selected.status] != null) next[selected.status] = Math.max(0, next[selected.status] - 1);
          if (next[status] != null) next[status] += 1;
        }
        return next;
      });
      showToast?.(`Request ${status}`, 'success');
    } catch (e) {
      showToast?.(e.message, 'error');
    } finally {
      setBusy(false);
    }
  };

  const exportCsv = () => {
    const header = [
      'Student',
      'Admission',
      'Class',
      'Leave Type',
      'Start',
      'End',
      'Days',
      'Status',
      'Requested On',
    ];
    const lines = filtered.map((r) =>
      [
        r.kidId?.name || '',
        r.kidId?.admissionNo || '',
        r.kidId?.grade || '',
        TYPE_LABEL[r.leaveType] || r.leaveType,
        fmtDate(r.startDate),
        fmtDate(r.endDate),
        r.days ?? '',
        r.status,
        fmtDateTime(r.createdAt),
      ]
        .map((v) => `"${String(v).replace(/"/g, '""')}"`)
        .join(',')
    );
    const blob = new Blob([[header.join(','), ...lines].join('\n')], {
      type: 'text/csv;charset=utf-8;',
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'leave-requests.csv';
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className={`sa-page sa-leave-page${selected ? ' has-drawer' : ''}`}>
      <div className="sa-page-head">
        <div>
          <h1>Leave Requests</h1>
          <p>Review and manage student leave requests.</p>
        </div>
      </div>

      {error && <div className="sa-error-banner">{error}</div>}

      <div className="sa-stat-grid">
        <button type="button" className="sa-stat-card is-pending" onClick={() => setTab('pending')}>
          <div>
            <span>Pending Requests</span>
            <strong>{stats.pending}</strong>
            <em>View all pending</em>
          </div>
          <span className="sa-stat-icon">⏱</span>
        </button>
        <button type="button" className="sa-stat-card is-approved" onClick={() => setTab('approved')}>
          <div>
            <span>Approved</span>
            <strong>{stats.approved}</strong>
            <em>View all approved</em>
          </div>
          <span className="sa-stat-icon">✓</span>
        </button>
        <button type="button" className="sa-stat-card is-rejected" onClick={() => setTab('rejected')}>
          <div>
            <span>Rejected</span>
            <strong>{stats.rejected}</strong>
            <em>View all rejected</em>
          </div>
          <span className="sa-stat-icon">✕</span>
        </button>
        <button type="button" className="sa-stat-card is-total" onClick={() => setTab('all')}>
          <div>
            <span>Total Requests</span>
            <strong>{stats.total}</strong>
            <em>View all requests</em>
          </div>
          <span className="sa-stat-icon">▦</span>
        </button>
      </div>

      <div className="sa-card sa-leave-panel">
        <div className="sa-tabs">
          {TABS.map((t) => (
            <button
              key={t.id}
              type="button"
              className={`sa-tab${tab === t.id ? ' is-active' : ''}`}
              onClick={() => setTab(t.id)}
            >
              {t.label}
            </button>
          ))}
        </div>

        <div className="sa-filter-bar">
          <label className="sa-filter-search">
            <span>⌕</span>
            <input
              value={filters.q}
              onChange={(e) => setFilters((f) => ({ ...f, q: e.target.value }))}
              placeholder="Search student / admission no."
            />
          </label>
          <select
            value={filters.grade}
            onChange={(e) => setFilters((f) => ({ ...f, grade: e.target.value }))}
          >
            <option value="">All Classes</option>
            {grades.map((g) => (
              <option key={g} value={g}>
                {g}
              </option>
            ))}
          </select>
          <select
            value={filters.leaveType}
            onChange={(e) => setFilters((f) => ({ ...f, leaveType: e.target.value }))}
          >
            <option value="">All Types</option>
            <option value="vacation">Vacation</option>
            <option value="sick">Sick</option>
            <option value="family">Family</option>
            <option value="other">Other</option>
          </select>
          <select
            value={filters.status}
            onChange={(e) => setFilters((f) => ({ ...f, status: e.target.value }))}
          >
            <option value="">All Status</option>
            <option value="pending">Pending</option>
            <option value="approved">Approved</option>
            <option value="rejected">Rejected</option>
            <option value="cancelled">Cancelled</option>
          </select>
          <input
            type="date"
            value={filters.from}
            onChange={(e) => setFilters((f) => ({ ...f, from: e.target.value }))}
          />
          <input
            type="date"
            value={filters.to}
            onChange={(e) => setFilters((f) => ({ ...f, to: e.target.value }))}
          />
          <button type="button" className="sa-btn sa-btn-outline" onClick={exportCsv}>
            Export
          </button>
        </div>

        <div className="sa-table-wrap">
          {loading ? (
            <p className="sa-muted" style={{ padding: '1.5rem' }}>
              Loading leave requests…
            </p>
          ) : pageRows.length === 0 ? (
            <p className="sa-muted" style={{ padding: '1.5rem' }}>
              No leave requests match these filters.
            </p>
          ) : (
            <table className="sa-table">
              <thead>
                <tr>
                  <th>Student</th>
                  <th>Class</th>
                  <th>Leave Type</th>
                  <th>Start Date</th>
                  <th>End Date</th>
                  <th>Days</th>
                  <th>Status</th>
                  <th>Requested On</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {pageRows.map((r) => {
                  const kid = r.kidId || {};
                  const active = selectedId === r._id;
                  return (
                    <tr
                      key={r._id}
                      className={active ? 'is-selected' : ''}
                      onClick={() => setSelectedId(r._id)}
                    >
                      <td>
                        <div className="sa-person-cell">
                          <span className="sa-avatar">{initials(kid.name)}</span>
                          <div>
                            <strong>{kid.name || 'Student'}</strong>
                            <small>{kid.admissionNo || '—'}</small>
                          </div>
                        </div>
                      </td>
                      <td>{kid.grade || '—'}</td>
                      <td>
                        <span className="sa-type-chip">
                          {r.leaveType === 'sick' ? '✚' : r.leaveType === 'vacation' ? '🌴' : '•'}{' '}
                          {TYPE_LABEL[r.leaveType] || r.leaveType}
                        </span>
                      </td>
                      <td>{fmtDate(r.startDate)}</td>
                      <td>{fmtDate(r.endDate)}</td>
                      <td>{r.days ?? '—'}</td>
                      <td>
                        <span className={`sa-status sa-status-${r.status}`}>{r.status}</span>
                      </td>
                      <td>{fmtDateTime(r.createdAt)}</td>
                      <td>
                        <button
                          type="button"
                          className="sa-icon-ghost"
                          onClick={(e) => {
                            e.stopPropagation();
                            setSelectedId(r._id);
                          }}
                          aria-label="View"
                        >
                          👁
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>

        <div className="sa-table-foot">
          <span>
            Showing {filtered.length === 0 ? 0 : (page - 1) * pageSize + 1} to{' '}
            {Math.min(page * pageSize, filtered.length)} of {filtered.length} entries
          </span>
          <div className="sa-pager">
            <button type="button" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>
              Previous
            </button>
            <span>{page}</span>
            <button
              type="button"
              disabled={page >= pageCount}
              onClick={() => setPage((p) => p + 1)}
            >
              Next
            </button>
          </div>
        </div>
      </div>

      {selected && (
        <aside className="sa-drawer" aria-label="Request details">
          <div className="sa-drawer-head">
            <h2>Request Details</h2>
            <button type="button" className="sa-icon-ghost" onClick={() => setSelectedId(null)}>
              ✕
            </button>
          </div>

          <div className="sa-drawer-student">
            <span className="sa-avatar lg">{initials(selected.kidId?.name)}</span>
            <div>
              <strong>{selected.kidId?.name || 'Student'}</strong>
              <small>
                {selected.kidId?.admissionNo || '—'}
                {selected.kidId?.grade ? ` · ${selected.kidId.grade}` : ''}
                {selected.kidId?.house ? ` - ${selected.kidId.house}` : ''}
              </small>
            </div>
          </div>

          <dl className="sa-drawer-fields">
            <div>
              <dt>Leave Type</dt>
              <dd>{TYPE_LABEL[selected.leaveType] || selected.leaveType}</dd>
            </div>
            {selected.durationType && (
              <div>
                <dt>Duration</dt>
                <dd>
                  {selected.durationType === 'long'
                    ? 'Long Leave'
                    : selected.durationType === 'emergency'
                      ? 'Emergency Leave'
                      : 'Short Leave'}
                </dd>
              </div>
            )}
            <div>
              <dt>Start Date</dt>
              <dd>
                {fmtDate(selected.startDate)}
                <small>{weekday(selected.startDate)}</small>
              </dd>
            </div>
            <div>
              <dt>End Date</dt>
              <dd>
                {fmtDate(selected.endDate)}
                <small>{weekday(selected.endDate)}</small>
              </dd>
            </div>
            <div>
              <dt>Number of Days</dt>
              <dd>{selected.days ?? '—'} Days</dd>
            </div>
            <div>
              <dt>Reason</dt>
              <dd>{selected.reason || '—'}</dd>
            </div>
            <div>
              <dt>Additional Notes</dt>
              <dd>{selected.notes || '—'}</dd>
            </div>
            {selected.extensionReason ? (
              <div>
                <dt>Return Date Change</dt>
                <dd>{selected.extensionReason}</dd>
              </div>
            ) : null}
            {(selected.attachmentName || selected.attachmentUrl) && (
              <div>
                <dt>Attachment</dt>
                <dd>
                  {selected.attachmentUrl ? (
                    <a href={selected.attachmentUrl} target="_blank" rel="noreferrer">
                      {selected.attachmentName || 'Download'}
                    </a>
                  ) : (
                    selected.attachmentName
                  )}
                </dd>
              </div>
            )}
            <div>
              <dt>Requested On</dt>
              <dd>{fmtDateTime(selected.createdAt)}</dd>
            </div>
            <div>
              <dt>Parent</dt>
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

          <div className="sa-drawer-actions">
            <button
              type="button"
              className="sa-btn sa-btn-success"
              disabled={busy || selected.status === 'approved'}
              onClick={() => setStatus('approved')}
            >
              Approve
            </button>
            <button
              type="button"
              className="sa-btn sa-btn-danger"
              disabled={busy || selected.status === 'rejected'}
              onClick={() => setStatus('rejected')}
            >
              Reject
            </button>
            <button type="button" className="sa-btn sa-btn-outline" onClick={() => setSelectedId(null)}>
              Close
            </button>
          </div>

          <div className="sa-history">
            <h3>Request History</h3>
            <ul>
              <li>
                <strong>{fmtDateTime(selected.createdAt)}</strong>
                <span>Leave request submitted by parent</span>
              </li>
              {selected.reviewedAt && (
                <li>
                  <strong>{fmtDateTime(selected.reviewedAt)}</strong>
                  <span>
                    Marked {selected.status}
                    {selected.reviewedBy?.name ? ` by ${selected.reviewedBy.name}` : ''}
                  </span>
                </li>
              )}
            </ul>
          </div>
        </aside>
      )}
    </div>
  );
}
