export const STAFF_MENUS = [
  { key: 'dashboard', label: 'Dashboard' },
  { key: 'live', label: 'Live Tracking' },
  { key: 'campuses', label: 'Campuses' },
  { key: 'teachers', label: 'Teachers' },
  { key: 'classes', label: 'Classes' },
  { key: 'routes', label: 'Routes' },
  { key: 'stops', label: 'Stops' },
  { key: 'parents', label: 'Parents' },
  { key: 'students', label: 'Students' },
  { key: 'buses', label: 'Buses / Vehicles' },
  { key: 'drivers', label: 'Drivers' },
  { key: 'trips', label: 'Trips' },
  { key: 'notifications', label: 'Notifications' },
  { key: 'messages', label: 'Inbox/Outbox' },
  { key: 'noticeboard', label: 'Noticeboard' },
  { key: 'leave', label: 'Leave Requests' },
  { key: 'users', label: 'Users & Roles' },
  { key: 'attendance', label: 'Attendance' },
  { key: 'reports', label: 'Reports & Analytics' },
  { key: 'incidents', label: 'Incidents' },
  { key: 'calendar', label: 'Calendar' },
  { key: 'subjects', label: 'Subjects' },
  { key: 'examinations', label: 'Examinations' },
  { key: 'assignments', label: 'Assignments' },
  { key: 'diary', label: 'Diary' },
  { key: 'settings', label: 'Settings' },
];

const WRITE_MAP = [
  { re: /^\/admin\/kids/, key: 'students' },
  { re: /^\/admin\/teachers/, key: 'teachers' },
  { re: /^\/admin\/drivers/, key: 'drivers' },
  { re: /^\/admin\/parents/, key: 'parents' },
  { re: /^\/admin\/buses/, key: 'buses' },
  { re: /^\/admin\/routes/, key: 'routes' },
  { re: /^\/admin\/stops/, key: 'stops' },
  { re: /^\/admin\/campuses/, key: 'campuses' },
  { re: /^\/admin\/trip/, key: 'trips' },
  { re: /^\/admin\/schedules/, key: 'trips' },
  { re: /^\/admin\/outings/, key: 'trips' },
  { re: /^\/admin\/announcements/, key: 'noticeboard' },
  { re: /^\/admin\/leave/, key: 'leave' },
  { re: /^\/admin\/users/, key: 'users' },
  { re: /^\/admin\/classes/, key: 'classes' },
  { re: /^\/admin\/subjects/, key: 'subjects' },
  { re: /^\/admin\/exam/, key: 'examinations' },
  { re: /^\/admin\/assignments/, key: 'assignments' },
  { re: /^\/admin\/diary/, key: 'diary' },
  { re: /^\/admin\/attendance/, key: 'attendance' },
  { re: /^\/admin\/incidents/, key: 'incidents' },
  { re: /^\/admin\/messages/, key: 'messages' },
  { re: /^\/admin\/notifications/, key: 'notifications' },
  { re: /^\/admin\/calendar/, key: 'calendar' },
  { re: /^\/admin\/reports/, key: 'reports' },
  { re: /^\/admin\/schools/, key: 'settings' },
];

export function isSchoolConsoleRole(role) {
  return role === 'school_admin' || role === 'staff';
}

export function normalizeMenuRights(raw) {
  const src = raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : {};
  const next = {};
  for (const menu of STAFF_MENUS) {
    const value = String(src[menu.key] || '').toLowerCase();
    if (value === 'edit' || value === 'view') next[menu.key] = value;
  }
  if (!next.dashboard) next.dashboard = 'view';
  return next;
}

export function menuRightOf(rights, key) {
  const value = rights?.[key];
  return value === 'edit' || value === 'view' ? value : '';
}

export function menuKeyForAdminPath(url = '') {
  const path = String(url).split('?')[0];
  const hit = WRITE_MAP.find((row) => row.re.test(path));
  return hit?.key || '';
}
