export const STAFF_MENUS = [
  { key: 'dashboard', label: 'Dashboard', path: '/school-admin' },
  { key: 'live', label: 'Live Tracking', path: '/school-admin/live-tracking' },
  { key: 'campuses', label: 'Campuses', path: '/school-admin/campuses' },
  { key: 'teachers', label: 'Teachers', path: '/school-admin/teachers' },
  { key: 'classes', label: 'Classes', path: '/school-admin/classes' },
  { key: 'routes', label: 'Routes', path: '/school-admin/routes' },
  { key: 'stops', label: 'Stops', path: '/school-admin/stops' },
  { key: 'parents', label: 'Parents', path: '/school-admin/parents' },
  { key: 'students', label: 'Students', path: '/school-admin/students' },
  { key: 'buses', label: 'Buses / Vehicles', path: '/school-admin/buses' },
  { key: 'drivers', label: 'Drivers', path: '/school-admin/drivers' },
  { key: 'trips', label: 'Trips', path: '/school-admin/trip-instances' },
  { key: 'notifications', label: 'Notifications', path: '/school-admin/notifications' },
  { key: 'messages', label: 'Inbox/Outbox', path: '/school-admin/messages' },
  { key: 'noticeboard', label: 'Noticeboard', path: '/school-admin/noticeboard' },
  { key: 'leave', label: 'Leave Requests', path: '/school-admin/leave-requests' },
  { key: 'users', label: 'Users & Roles', path: '/school-admin/users' },
  { key: 'attendance', label: 'Attendance', path: '/school-admin/attendance' },
  { key: 'reports', label: 'Reports & Analytics', path: '/school-admin/reports' },
  { key: 'incidents', label: 'Incidents', path: '/school-admin/incidents' },
  { key: 'calendar', label: 'Calendar', path: '/school-admin/calendar' },
  { key: 'subjects', label: 'Subjects', path: '/school-admin/subjects' },
  { key: 'examinations', label: 'Examinations', path: '/school-admin/examinations' },
  { key: 'assignments', label: 'Assignments', path: '/school-admin/assignments' },
  { key: 'diary', label: 'Diary', path: '/school-admin/diary' },
  { key: 'settings', label: 'Settings', path: '/school-admin/school' },
];

export const ASSIGNABLE_ROLES = [
  { id: 'school_admin', label: 'Super Admin' },
  { id: 'staff', label: 'Staff' },
];

export function emptyMenuRights() {
  return Object.fromEntries(STAFF_MENUS.map((menu) => [menu.key, menu.key === 'dashboard' ? 'view' : '']));
}

export function menuKeyFromPath(pathname = '') {
  if (pathname === '/school-admin' || pathname === '/school-admin/') return 'dashboard';
  const hit = [...STAFF_MENUS]
    .filter((menu) => menu.path !== '/school-admin' && pathname.startsWith(menu.path))
    .sort((a, b) => b.path.length - a.path.length)[0];
  return hit?.key || '';
}

export function rightOf(user, key) {
  if (!user || !key) return '';
  if (user.role === 'super_admin' || user.role === 'school_admin') return 'edit';
  if (user.role !== 'staff') return '';
  const value = user.menuRights?.[key];
  if (value === 'edit' || value === 'view') return value;
  if (key === 'dashboard') return 'view';
  return '';
}

export function canViewMenu(user, key) {
  const right = rightOf(user, key);
  return right === 'view' || right === 'edit';
}

export function canEditMenu(user, key) {
  return rightOf(user, key) === 'edit';
}

export function canViewPath(user, pathname) {
  const key = menuKeyFromPath(pathname);
  if (!key) return user?.role === 'super_admin' || user?.role === 'school_admin';
  return canViewMenu(user, key);
}
