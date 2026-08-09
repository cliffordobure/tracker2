export function homePathForRole(role) {
  switch (role) {
    case 'super_admin':
      return '/super-admin';
    case 'school_admin':
      return '/school-admin';
    case 'driver':
      return '/driver';
    case 'parent':
      return '/parent';
    case 'teacher':
      return '/teacher';
    case 'admin':
      // legacy
      return '/super-admin';
    default:
      return '/login';
  }
}

export function isStaffRole(role) {
  return role === 'super_admin' || role === 'school_admin' || role === 'admin';
}
