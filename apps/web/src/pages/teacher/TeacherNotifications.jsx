import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../../lib/api';

const TABS = [
  { id: 'all', label: 'All' },
  { id: 'announcement', label: 'Announcements' },
  { id: 'message', label: 'Messages' },
  { id: 'reminder', label: 'Reminders' },
  { id: 'system', label: 'System' },
];

function linkFor(n) {
  const link = String(n.link || '');
  if (link.startsWith('messages')) return `/teacher/${link}`;
  if (link === 'announcements') return '/teacher/announcements';
  if (link === 'register') return '/teacher/register';
  if (link === 'diary') return '/teacher/diary';
  if (link === 'work') return '/teacher/assignments';
  return '';
}

export default function TeacherNotifications() {
  const navigate = useNavigate();
  const [items, setItems] = useState([]);
  const [counts, setCounts] = useState({});
  const [tab, setTab] = useState('all');
  const [q, setQ] = useState('');
  const [unreadOnly, setUnreadOnly] = useState(false);
  const [error, setError] = useState('');

  const load = async () => {
    const data = await api('/teacher/notifications');
    setItems(data.notifications || []);
    setCounts(data.counts || {});
  };

  useEffect(() => {
    load().catch((e) => setError(e.message));
  }, []);

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return items.filter((n) => {
      if (tab !== 'all' && n.category !== tab) return false;
      if (unreadOnly && n.read) return false;
      if (!needle) return true;
      return `${n.title} ${n.body}`.toLowerCase().includes(needle);
    });
  }, [items, tab, q, unreadOnly]);

  const open = async (n) => {
    if (!n.read) {
      try {
        await api(`/teacher/notifications/${n._id}/read`, { method: 'POST' });
        setItems((prev) => prev.map((x) => (x._id === n._id ? { ...x, read: true } : x)));
      } catch (_) {}
    }
    const to = linkFor(n);
    if (to) navigate(to);
  };

  const markAll = async () => {
    await api('/teacher/notifications/read', { method: 'POST', body: {} });
    setItems((prev) => prev.map((n) => ({ ...n, read: true })));
    setCounts((c) => ({ ...c, unread: 0 }));
  };

  return (
    <div className="tw-page">
      <div>
        <h2>Notifications</h2>
        <p className="tw-lede">Register reminders, diary due notices, parent messages, and school announcements.</p>
      </div>
      {error && <div className="tw-alert">{error}</div>}

      <div className="tw-toolbar">
        <label>
          Search
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search notifications" />
        </label>
        <label className="tw-check">
          <input type="checkbox" checked={unreadOnly} onChange={(e) => setUnreadOnly(e.target.checked)} />
          Unread only
        </label>
        <button type="button" className="tw-btn tw-btn-secondary" onClick={markAll}>
          Mark all read
        </button>
      </div>

      <div className="tw-tabs">
        {TABS.map((t) => (
          <button key={t.id} type="button" className={`tw-tab ${tab === t.id ? 'is-on' : ''}`} onClick={() => setTab(t.id)}>
            {t.label}
            {counts[t.id] != null ? <small>{counts[t.id]}</small> : null}
          </button>
        ))}
      </div>

      <ul className="tw-list">
        {filtered.map((n) => (
          <li key={n._id}>
            <button type="button" className="tw-note-btn" onClick={() => open(n)}>
              <span className={`tw-dot ${n.read ? '' : 'is-on'}`} />
              <div>
                <strong>{n.title}</strong>
                <p className="tw-muted">{n.body}</p>
                <small className="tw-muted">{n.createdAt ? new Date(n.createdAt).toLocaleString() : ''}</small>
              </div>
            </button>
          </li>
        ))}
        {!filtered.length && <p className="tw-empty">No notifications in this view.</p>}
      </ul>
    </div>
  );
}
