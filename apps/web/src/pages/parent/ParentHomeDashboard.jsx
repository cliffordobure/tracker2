import '../../parent.css';

function greeting() {
  const h = new Date().getHours();
  if (h < 12) return 'Good morning';
  if (h < 17) return 'Good afternoon';
  return 'Good evening';
}

function fmtTime(v) {
  if (!v) return '';
  return new Date(v).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

function fmtWhen(v) {
  if (!v) return '';
  const d = new Date(v);
  const now = new Date();
  const startToday = new Date(now);
  startToday.setHours(0, 0, 0, 0);
  const startThat = new Date(d);
  startThat.setHours(0, 0, 0, 0);
  const diffDays = Math.round((startToday - startThat) / 86400000);
  const time = fmtTime(d);
  if (diffDays === 0) return `Today at ${time}`;
  if (diffDays === 1) return 'Yesterday';
  if (diffDays < 7) return `${diffDays} days ago`;
  return d.toLocaleDateString();
}

function periodLabel(trip) {
  if (trip?.period === 'morning' || trip?.direction === 'to_school') return 'Morning';
  if (trip?.period === 'evening' || trip?.direction === 'to_home') return 'Evening';
  if (trip?.period === 'afternoon') return 'Afternoon';
  return 'Trip';
}

function notifIcon(type) {
  if (type?.includes('pick') || type?.includes('trip') || type?.includes('bus')) return 'bus';
  if (type?.includes('assign') || type?.includes('homework') || type?.includes('diary')) return 'book';
  if (type?.includes('announce') || type?.includes('school')) return 'send';
  return 'bell';
}

function NotifIcon({ kind }) {
  if (kind === 'bus') {
    return (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden>
        <rect x="4" y="6" width="16" height="10" rx="2" stroke="currentColor" strokeWidth="1.8" />
        <path d="M7 16v2M17 16v2M4 11h16" stroke="currentColor" strokeWidth="1.8" />
      </svg>
    );
  }
  if (kind === 'book') {
    return (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden>
        <path d="M5 4h9a3 3 0 013 3v13H8a3 3 0 00-3 3V4z" stroke="currentColor" strokeWidth="1.8" />
        <path d="M8 4h8a3 3 0 013 3v13" stroke="currentColor" strokeWidth="1.8" />
      </svg>
    );
  }
  if (kind === 'send') {
    return (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden>
        <path d="M22 3L11 14M22 3l-7 18-4-7-7-4 18-7z" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" />
      </svg>
    );
  }
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path d="M18 8a6 6 0 10-12 0v4l-2 2v1h16v-1l-2-2V8z" stroke="currentColor" strokeWidth="1.8" />
    </svg>
  );
}

function GridIcon({ kind }) {
  const icons = {
    track: (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
        <path d="M12 21s6-5.2 6-10a6 6 0 10-12 0c0 4.8 6 10 6 10z" stroke="currentColor" strokeWidth="1.8" />
        <circle cx="12" cy="11" r="2.2" fill="currentColor" />
      </svg>
    ),
    children: (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
        <circle cx="9" cy="8" r="3" stroke="currentColor" strokeWidth="1.8" />
        <circle cx="17" cy="9" r="2.5" stroke="currentColor" strokeWidth="1.8" />
        <path d="M4 19c0-2.8 2.2-5 5-5M14 19c0-2.2 1.8-4 4-4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
      </svg>
    ),
    trips: (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
        <rect x="3" y="6" width="18" height="11" rx="2" stroke="currentColor" strokeWidth="1.8" />
        <path d="M7 17v2M17 17v2M3 11h18" stroke="currentColor" strokeWidth="1.8" />
      </svg>
    ),
    attendance: (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
        <rect x="4" y="5" width="16" height="16" rx="2" stroke="currentColor" strokeWidth="1.8" />
        <path d="M8 3v4M16 3v4M4 10h16M9 14l2 2 4-4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
      </svg>
    ),
    diary: (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
        <path d="M6 4h10a2 2 0 012 2v14H8a2 2 0 01-2-2V4z" stroke="currentColor" strokeWidth="1.8" />
        <path d="M6 4v16" stroke="currentColor" strokeWidth="1.8" />
      </svg>
    ),
    fees: (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
        <rect x="3" y="7" width="18" height="12" rx="2" stroke="currentColor" strokeWidth="1.8" />
        <path d="M3 11h18" stroke="currentColor" strokeWidth="1.8" />
      </svg>
    ),
    notify: (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
        <path d="M18 8a6 6 0 10-12 0v4l-2 2v1h16v-1l-2-2V8z" stroke="currentColor" strokeWidth="1.8" />
      </svg>
    ),
    contact: (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
        <path d="M22 16.9v3a2 2 0 01-2.2 2 19.8 19.8 0 01-8.7-3.1 19.5 19.5 0 01-6-6A19.8 19.8 0 012 4.2 2 2 0 014 2h3a2 2 0 012 1.7c.1.9.3 1.8.5 2.7a2 2 0 01-.5 2.1L8 9.8a16 16 0 006.2 6.2l1.4-1.1a2 2 0 012.1-.5c.9.2 1.8.4 2.7.5A2 2 0 0122 16.9z" stroke="currentColor" strokeWidth="1.8" />
      </svg>
    ),
  };
  return icons[kind] || icons.notify;
}

export default function ParentHomeDashboard({
  user,
  kids,
  selected,
  active,
  notifications,
  schoolFeed,
  onOpenLive,
  onOpenPanel,
  onDismissBanner,
  bannerDismissed,
  menuOpen,
  setMenuOpen,
  logout,
  error,
}) {
  const unread = notifications.filter((n) => !n.read).length;
  const primaryKid = kids[0];
  const school = primaryKid?.schoolId;
  const tripWrap = selected || active[0];
  const trip = tripWrap?.trip;
  const myKids = tripWrap?.myKids || kids;
  const focusKid = myKids[0] || primaryKid;

  const pickupEvent = (tripWrap?.events || []).find(
    (e) =>
      e.type === 'picked_up' &&
      myKids.some((k) => String(k._id) === String(e.kidId?._id || e.kidId))
  );

  const pickupStop =
    focusKid?.homeStopId?.name ||
    tripWrap?.stops?.find((s) => s.type !== 'school')?.name ||
    'Pickup stop';
  const dropStop =
    trip?.direction === 'to_home'
      ? focusKid?.homeStopId?.name || 'Home'
      : school?.name || tripWrap?.stops?.find((s) => s.type === 'school')?.name || 'School';

  const busPlate = trip?.busId?.plate || trip?.busId?.label || 'Bus';
  const routeName = trip?.routeId?.name || 'Route';
  const scheduledStart = trip?.scheduledFor || trip?.startedAt;
  const scheduledEnd = trip?.endedAt || null;

  const quickLinks = [
    { id: 'live', label: 'Live Tracking', icon: 'track', tint: 'blue', action: onOpenLive },
    { id: 'children', label: 'My Children', icon: 'children', tint: 'orange', action: () => onOpenPanel('children') },
    { id: 'trips', label: 'Trips', icon: 'trips', tint: 'purple', action: () => onOpenPanel('trips') },
    { id: 'attendance', label: 'Attendance', icon: 'attendance', tint: 'green', action: () => onOpenPanel('attendance') },
    { id: 'diary', label: 'Diary / Homework', icon: 'diary', tint: 'pink', action: () => onOpenPanel('diary') },
    { id: 'fees', label: 'Fees & Payments', icon: 'fees', tint: 'green', action: () => onOpenPanel('fees') },
    { id: 'notify', label: 'Notifications', icon: 'notify', tint: 'orange', badge: unread, action: () => onOpenPanel('notifications') },
    { id: 'contact', label: 'Contact School', icon: 'contact', tint: 'blue', action: () => onOpenPanel('contact') },
  ];

  const recentNotifs = notifications.slice(0, 3);

  return (
    <div className="ph-shell">
      {error && <div className="alert ph-alert">{error}</div>}

      <header className="ph-header">
        <div className="ph-header-top">
          <button type="button" className="ph-icon-btn" aria-label="Menu" onClick={() => setMenuOpen(!menuOpen)}>
            <span className="ph-menu" />
          </button>
          <button type="button" className="ph-icon-btn ph-bell" aria-label="Notifications" onClick={() => onOpenPanel('notifications')}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden>
              <path d="M18 8a6 6 0 10-12 0v4l-2 2v1h16v-1l-2-2V8z" stroke="currentColor" strokeWidth="1.8" />
            </svg>
            {unread ? <span className="ph-bell-badge">{unread > 9 ? '9+' : unread}</span> : null}
          </button>
        </div>

        {menuOpen && (
          <div className="ph-menu-panel">
            <button type="button" onClick={() => { setMenuOpen(false); onOpenPanel('children'); }}>My children</button>
            <button type="button" onClick={() => { setMenuOpen(false); onOpenPanel('notifications'); }}>Notifications</button>
            <button type="button" onClick={() => { setMenuOpen(false); onOpenPanel('contact'); }}>Contact school</button>
            <button type="button" className="ph-menu-signout" onClick={logout}>Sign out</button>
          </div>
        )}

        <div className="ph-profile">
          <div className="ph-avatar">
            {primaryKid?.photoUrl ? (
              <img src={primaryKid.photoUrl} alt="" />
            ) : (
              <span>{(user?.name || 'P').charAt(0)}</span>
            )}
          </div>
          <div className="ph-greeting">
            <small>{greeting()},</small>
            <h1>
              {user?.name || 'Parent'} <span aria-hidden>👋</span>
            </h1>
            {focusKid ? (
              <p>
                Parent of <strong>{focusKid.name}</strong>
                {focusKid.grade ? ` (${focusKid.grade})` : ''}
              </p>
            ) : (
              <p>No children linked yet</p>
            )}
          </div>
          {school ? (
            <div className="ph-school">
              {school.logoUrl ? <img src={school.logoUrl} alt="" className="ph-school-logo" /> : <span className="ph-school-mark">🏫</span>}
              <span>{school.name}</span>
            </div>
          ) : null}
        </div>
      </header>

      <main className="ph-main">
        {trip ? (
          <section className="ph-trip-card">
            <div className="ph-trip-head">
              <h2>Today&apos;s Trip – {periodLabel(trip)}</h2>
              <span className="ph-status-pill">IN PROGRESS</span>
            </div>
            <div className="ph-trip-bus">
              <div className="ph-bus-icon">🚌</div>
              <div>
                <strong>{busPlate}</strong>
                <span>{routeName}</span>
              </div>
              <button type="button" className="ph-live-btn" onClick={onOpenLive}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden>
                  <path d="M12 21s6-5.2 6-10a6 6 0 10-12 0c0 4.8 6 10 6 10z" stroke="currentColor" strokeWidth="2" />
                  <circle cx="12" cy="11" r="2" fill="currentColor" />
                </svg>
                Live Tracking
              </button>
            </div>
            <div className="ph-timeline">
              <div className="ph-timeline-track">
                <span className="ph-dot is-done" />
                <span className="ph-line is-done" />
                <span className={`ph-dot ${pickupEvent ? 'is-done' : ''}`} />
              </div>
              <div className="ph-timeline-labels">
                <div>
                  <strong>Pick-up: {fmtTime(pickupEvent?.at || scheduledStart) || '—'}</strong>
                  <span>{pickupStop}</span>
                </div>
                <div className="ph-timeline-end">
                  <strong>Drop-off: {fmtTime(scheduledEnd) || '—'}</strong>
                  <span>{dropStop}</span>
                </div>
              </div>
            </div>
            {pickupEvent && focusKid ? (
              <button type="button" className="ph-pickup-banner" onClick={onOpenLive}>
                <span className="ph-pickup-check">✓</span>
                <span>
                  <strong>{focusKid.name.split(' ')[0]} has been picked up</strong>
                  <small>{fmtWhen(pickupEvent.at)}</small>
                </span>
                <span className="ph-chevron">›</span>
              </button>
            ) : null}
          </section>
        ) : (
          <section className="ph-trip-card ph-trip-card--empty">
            <h2>Today&apos;s Trip</h2>
            <p>No active trip right now. You&apos;ll see morning or evening transport here when it starts.</p>
          </section>
        )}

        <section className="ph-grid" aria-label="Quick links">
          {quickLinks.map((item) => (
            <button key={item.id} type="button" className={`ph-grid-item tint-${item.tint}`} onClick={item.action}>
              <span className="ph-grid-icon">
                <GridIcon kind={item.icon} />
                {item.badge ? <em>{item.badge}</em> : null}
              </span>
              <span>{item.label}</span>
            </button>
          ))}
        </section>

        <section className="ph-notifs">
          <div className="ph-notifs-head">
            <h2>Recent Notifications</h2>
            <button type="button" onClick={() => onOpenPanel('notifications')}>View all</button>
          </div>
          <ul>
            {recentNotifs.map((n, i) => {
              const kind = notifIcon(n.type);
              return (
                <li key={n.id || n._id}>
                  <span className={`ph-notif-icon kind-${kind}`}>
                    <NotifIcon kind={kind} />
                  </span>
                  <div>
                    <strong>{n.title}</strong>
                    <span>{n.body}</span>
                  </div>
                  <div className="ph-notif-meta">
                    {!n.read && i === 0 ? <em className="ph-new">NEW</em> : null}
                    <small>{fmtWhen(n.createdAt)}</small>
                    <span className="ph-chevron">›</span>
                  </div>
                </li>
              );
            })}
            {!recentNotifs.length && <li className="ph-empty">No notifications yet.</li>}
          </ul>
        </section>

        {!bannerDismissed && (
          <aside className="ph-promo">
            <div className="ph-promo-art" aria-hidden>📱</div>
            <div>
              <strong>Stay updated in real-time</strong>
              <p>Receive real-time alerts for pick-up, drop-off and important school updates.</p>
            </div>
            <button type="button" className="ph-promo-close" aria-label="Dismiss" onClick={onDismissBanner}>
              ×
            </button>
          </aside>
        )}
      </main>
    </div>
  );
}
