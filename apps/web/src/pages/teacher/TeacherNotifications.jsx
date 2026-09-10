import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { api } from '../../lib/api';

const TABS = [
  { id: 'all', label: 'All' },
  { id: 'announcement', label: 'Announcements' },
  { id: 'message', label: 'Messages' },
  { id: 'reminder', label: 'Reminders' },
  { id: 'system', label: 'System' },
];

const iconProps = {
  width: 16,
  height: 16,
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.8,
  strokeLinecap: 'round',
  strokeLinejoin: 'round',
};

function Icon({ name }) {
  switch (name) {
    case 'bell':
      return (
        <svg {...iconProps}>
          <path d="M6 17h12l-1.2-2.2V10a4.8 4.8 0 0 0-9.6 0v4.8L6 17Z" />
          <path d="M10 19a2 2 0 0 0 4 0" />
        </svg>
      );
    case 'search':
      return (
        <svg {...iconProps}>
          <circle cx="11" cy="11" r="6.5" />
          <path d="m16 16 4 4" />
        </svg>
      );
    case 'check':
      return (
        <svg {...iconProps}>
          <path d="m6 12 4 4 8-8" />
        </svg>
      );
    case 'cal':
      return (
        <svg {...iconProps}>
          <rect x="3.5" y="5" width="17" height="15.5" rx="2" />
          <path d="M8 3.5v3M16 3.5v3M3.5 10h17" />
        </svg>
      );
    case 'people':
      return (
        <svg {...iconProps}>
          <circle cx="9" cy="8" r="3" />
          <path d="M3.5 18c.6-3 2.6-4.5 5.5-4.5s4.9 1.5 5.5 4.5" />
        </svg>
      );
    case 'megaphone':
      return (
        <svg {...iconProps}>
          <path d="M5 10v4h3l5 4V6L8 10H5Z" />
          <path d="M16 9.5a3 3 0 0 1 0 5" />
        </svg>
      );
    case 'chat':
      return (
        <svg {...iconProps}>
          <path d="M21 12a8.5 8.5 0 0 1-8.5 8.5H8l-4 3v-5.2A8.5 8.5 0 1 1 21 12Z" />
        </svg>
      );
    case 'gear':
      return (
        <svg {...iconProps}>
          <circle cx="12" cy="12" r="3" />
          <path d="M12 4.5v2M12 17.5v2M4.5 12h2M17.5 12h2M6.4 6.4l1.4 1.4M16.2 16.2l1.4 1.4M17.6 6.4l-1.4 1.4M7.8 16.2 6.4 17.6" />
        </svg>
      );
    case 'chart':
      return (
        <svg {...iconProps}>
          <path d="M5 19V9.5M10 19V5M15 19v-6.5M20 19V8" />
        </svg>
      );
    case 'filter':
      return (
        <svg {...iconProps}>
          <path d="M4 6h16l-6.2 7.4V19l-3.6 2v-7.6L4 6Z" />
        </svg>
      );
    case 'arrow':
      return (
        <svg {...iconProps}>
          <path d="M9 6l6 6-6 6" />
        </svg>
      );
    default:
      return null;
  }
}

function linkFor(n) {
  const link = String(n.link || '');
  if (link.startsWith('messages')) return `/teacher/${link}`;
  if (link === 'announcements') return '/teacher/announcements';
  if (link === 'register') return '/teacher/register';
  if (link === 'diary') return '/teacher/diary';
  if (link === 'work') return '/teacher/assignments';
  return '';
}

function tagFor(n) {
  switch (n.type) {
    case 'attendance_alert':
      return 'Attendance';
    case 'announcement':
      return 'Announcement';
    case 'message':
    case 'teacher_note':
      return 'Message';
    case 'system':
      return 'System';
    default:
      return n.category === 'system' ? 'System' : 'Reminder';
  }
}

function toneFor(n) {
  const tag = tagFor(n);
  if (tag === 'Announcement') return 'orange';
  if (tag === 'Message') return 'rose';
  if (tag === 'System') return 'slate';
  if (tag === 'Attendance') return 'mint';
  return 'blue';
}

function iconFor(n) {
  const tag = tagFor(n);
  if (tag === 'Announcement') return 'megaphone';
  if (tag === 'Message') return 'chat';
  if (tag === 'System') return 'gear';
  if (tag === 'Attendance') return 'people';
  return 'cal';
}

export default function TeacherNotifications() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const [items, setItems] = useState([]);
  const [counts, setCounts] = useState({});
  const [tab, setTab] = useState('all');
  const [q, setQ] = useState('');
  const [unreadOnly, setUnreadOnly] = useState(false);
  const [error, setError] = useState('');

  const headerQ = (params.get('q') || '').trim().toLowerCase();

  const load = async () => {
    const data = await api('/teacher/notifications');
    setItems(data.notifications || []);
    setCounts(data.counts || {});
  };

  useEffect(() => {
    load().catch((e) => setError(e.message));
  }, []);

  const filtered = useMemo(() => {
    const needle = (q.trim() || headerQ).toLowerCase();
    return items.filter((n) => {
      if (tab !== 'all' && n.category !== tab) return false;
      if (unreadOnly && n.read) return false;
      if (!needle) return true;
      return `${n.title} ${n.body} ${tagFor(n)}`.toLowerCase().includes(needle);
    });
  }, [items, tab, q, unreadOnly, headerQ]);

  const open = async (n) => {
    if (!n.read) {
      try {
        await api(`/teacher/notifications/${n._id}/read`, { method: 'POST' });
        setItems((prev) => prev.map((x) => (x._id === n._id ? { ...x, read: true } : x)));
        setCounts((c) => ({ ...c, unread: Math.max(0, (c.unread || 1) - 1) }));
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
    <div className="tnot">
      <div className="tnot-main">
        <div className="tnot-head">
          <div>
            <p className="tw-kicker">Teacher / Notifications</p>
            <div className="tnot-title">
              <span className="tnot-title-ico"><Icon name="bell" /></span>
              <div>
                <h2>Notifications</h2>
                <p>Stay updated with reminders, diary due notices, parent messages, and school announcements.</p>
              </div>
            </div>
          </div>
          <div className="tnot-art" aria-hidden="true">
            <svg width="132" height="72" viewBox="0 0 132 72" fill="none">
              <path d="M86 46c10-2 16 6 12 14H62c-4-8 2-16 12-14" fill="#e8f7f1" />
              <path d="M74 22c0-8 6-14 14-14s14 6 14 14c0 8 3 12 5 16H55c2-4 5-8 5-16Z" fill="#0f766e" />
              <circle cx="88" cy="52" r="4" fill="#14b8a6" />
              <circle cx="28" cy="22" r="10" fill="#e6f0ff" />
              <path d="M23 22h10M28 17v10" stroke="#3b6ea5" strokeWidth="1.8" />
              <rect x="108" y="16" width="16" height="12" rx="3" fill="#fdeeee" />
              <path d="M111 22h10" stroke="#b45353" strokeWidth="1.6" />
            </svg>
            <strong>Never miss what matters.</strong>
            <small>“Informed teams build brighter futures.”</small>
          </div>
        </div>

        {error && <div className="tw-alert">{error}</div>}

        <div className="tnot-toolbar">
          <label className="tnot-search">
            <Icon name="search" />
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search notifications..." />
          </label>
          <label className="tnot-check">
            <input type="checkbox" checked={unreadOnly} onChange={(e) => setUnreadOnly(e.target.checked)} />
            Unread only
          </label>
          <button type="button" className="tnot-btn tnot-btn--teal" onClick={markAll}>
            <Icon name="check" /> Mark all read
          </button>
        </div>

        <div className="tnot-pills">
          {TABS.map((t) => (
            <button key={t.id} type="button" className={tab === t.id ? 'is-on' : ''} onClick={() => setTab(t.id)}>
              {t.label}
              <em>{counts[t.id] ?? 0}</em>
            </button>
          ))}
        </div>

        <section className="tnot-list">
          {filtered.map((n) => (
            <button key={n._id} type="button" className={`tnot-row${n.read ? '' : ' is-unread'}`} onClick={() => open(n)}>
              <i className={n.read ? '' : 'is-on'} />
              <span className={`tnot-ico is-${toneFor(n)}`}>
                <Icon name={iconFor(n)} />
              </span>
              <div>
                <strong>{n.title}</strong>
                <p>{n.body}</p>
                <small>{n.createdAt ? new Date(n.createdAt).toLocaleString() : ''}</small>
              </div>
              <em className={`is-${toneFor(n)}`}>{tagFor(n)}</em>
              <b className={n.read ? '' : 'is-on'} />
              <Icon name="arrow" />
            </button>
          ))}
          {!filtered.length && <p className="tw-empty">No notifications in this view.</p>}
        </section>
      </div>

      <aside className="tnot-side">
        <section className="tnot-card">
          <div className="tnot-card-head">
            <span className="is-mint"><Icon name="chart" /></span>
            <div>
              <h3>Notification summary</h3>
              <p>Overview of your notifications</p>
            </div>
          </div>
          <div className="tnot-summary">
            <article>
              <span className="is-blue"><Icon name="bell" /></span>
              <strong>{counts.all || 0}</strong>
              <small>Total</small>
            </article>
            <article>
              <span className="is-orange"><Icon name="megaphone" /></span>
              <strong>{counts.announcement || 0}</strong>
              <small>Announcements</small>
            </article>
            <article>
              <span className="is-rose"><Icon name="chat" /></span>
              <strong>{counts.message || 0}</strong>
              <small>Messages</small>
            </article>
            <article>
              <span className="is-purple"><Icon name="cal" /></span>
              <strong>{counts.reminder || 0}</strong>
              <small>Reminders</small>
            </article>
          </div>
        </section>

        <section className="tnot-card">
          <div className="tnot-card-head">
            <span className="is-blue"><Icon name="filter" /></span>
            <div>
              <h3>Quick filters</h3>
              <p>Filter notifications by type</p>
            </div>
          </div>
          <div className="tnot-filters">
            {TABS.map((t) => (
              <button key={t.id} type="button" className={tab === t.id ? 'is-on' : ''} onClick={() => setTab(t.id)}>
                <span>{t.id === 'all' ? 'All notifications' : t.label}</span>
                <em>{counts[t.id] ?? 0}</em>
              </button>
            ))}
          </div>
        </section>

        <div className="tnot-tip">
          <span aria-hidden="true">💡</span>
          Tip: Mark notifications as read to keep your inbox organized.
        </div>
      </aside>
    </div>
  );
}
