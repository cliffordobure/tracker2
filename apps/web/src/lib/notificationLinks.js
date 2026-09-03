function oid(value) {
  if (!value) return '';
  if (typeof value === 'object') return String(value._id || '');
  return String(value);
}

function idFromKey(key, prefix) {
  const m = String(key || '').match(new RegExp(`${prefix}:([a-f0-9]{24})`, 'i'));
  return m?.[1] || '';
}

function idFromPath(value, segment) {
  const m = String(value || '').match(new RegExp(`${segment}/([a-f0-9]{24})`, 'i'));
  return m?.[1] || '';
}

function tripHref(n) {
  const tripId = oid(n.tripId || n.trip);
  const status = n.trip?.status || '';
  if (!tripId) return '/school-admin/live-tracking';
  if (status === 'completed' || status === 'cancelled' || status === 'scheduled') {
    return '/school-admin/trip-instances';
  }
  return `/school-admin/live-tracking?trip=${tripId}`;
}

export function notificationHref(n) {
  if (!n) return '';
  const link = String(n.link || '').trim();
  if (link.startsWith('/school-admin')) return link;
  if (link.startsWith('/')) return `/school-admin${link}`;

  const tripId = oid(n.tripId || n.trip);
  const kidId = oid(n.kidId || n.kid);
  const type = n.type;
  const incidentId = idFromKey(n.key, 'incident');
  const conversationId = idFromKey(n.key, 'message') || idFromPath(link, 'messages');

  if (n.incident || incidentId) {
    return incidentId ? `/school-admin/incidents?id=${incidentId}` : '/school-admin/incidents';
  }
  if (conversationId) return `/school-admin/messages/${conversationId}`;

  if (link === 'announcements') return '/school-admin/noticeboard';
  if (link === 'register') return '/school-admin/attendance';
  if (link === 'diary') return kidId ? `/school-admin/students/${kidId}` : '/school-admin/noticeboard';
  if (link === 'work') return '/school-admin/assignments';
  if (link === 'leave') return '/school-admin/leave-requests';

  switch (type) {
    case 'trip_started':
    case 'late_pickup_request':
      return tripHref(n);
    case 'trip_completed':
    case 'trip_cancelled':
    case 'trip_assigned':
      return '/school-admin/trip-instances';
    case 'kid_picked_up':
    case 'kid_dropped_off':
      if (tripId && (n.trip?.status === 'active' || !n.trip?.status)) {
        return `/school-admin/live-tracking?trip=${tripId}`;
      }
      return kidId ? `/school-admin/students/${kidId}` : tripHref(n);
    case 'attendance_alert':
      return '/school-admin/attendance';
    case 'assignment':
      return '/school-admin/assignments';
    case 'diary':
    case 'teacher_note':
      return kidId ? `/school-admin/students/${kidId}` : '/school-admin/students';
    case 'announcement':
      return '/school-admin/noticeboard';
    case 'message':
      return conversationId ? `/school-admin/messages/${conversationId}` : '/school-admin/messages';
    case 'leave_request':
      return '/school-admin/leave-requests';
    case 'reminder':
      if (tripId) return tripHref(n);
      if (kidId) return `/school-admin/students/${kidId}`;
      return '';
    default:
      if (tripId) return tripHref(n);
      if (kidId) return `/school-admin/students/${kidId}`;
      return '';
  }
}

export function notificationActionLabel(n) {
  const href = notificationHref(n);
  if (!href) return '';
  if (href.includes('live-tracking')) return 'View Live Tracking';
  if (href.includes('/students/')) return 'View Student';
  if (href.includes('trip-instances')) return 'View Trip';
  if (href.includes('incidents')) return 'View Incident';
  if (href.includes('messages')) return 'Open Message';
  if (href.includes('leave-requests')) return 'View Leave Request';
  if (href.includes('noticeboard')) return 'View Noticeboard';
  if (href.includes('attendance')) return 'View Attendance';
  if (href.includes('assignments')) return 'View Assignment';
  if (href.includes('drivers')) return 'View Driver';
  return 'Open';
}
