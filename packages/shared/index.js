export const ROLES = {
  SUPER_ADMIN: 'super_admin',
  SCHOOL_ADMIN: 'school_admin',
  DRIVER: 'driver',
  PARENT: 'parent',
  TEACHER: 'teacher',
};

export const TRIP_DIRECTIONS = {
  TO_SCHOOL: 'to_school',
  TO_HOME: 'to_home',
};

export const TRIP_STATUS = {
  SCHEDULED: 'scheduled',
  ACTIVE: 'active',
  COMPLETED: 'completed',
  CANCELLED: 'cancelled',
};

export const SCHEDULE_TYPES = {
  ONE_TIME: 'ONE_TIME',
  EVERY_DAY: 'EVERY_DAY',
  WEEKDAYS: 'WEEKDAYS',
  CUSTOM_DAYS: 'CUSTOM_DAYS',
};

export const TRIP_PERIODS = {
  MORNING: 'morning',
  AFTERNOON: 'afternoon',
  EVENING: 'evening',
};

export const STOP_TYPES = {
  HOME: 'home',
  SCHOOL: 'school',
};

export const TRIP_EVENT_TYPES = {
  PICKED_UP: 'picked_up',
  DROPPED_OFF: 'dropped_off',
};

export const NOTIFICATION_TYPES = {
  TRIP_STARTED: 'trip_started',
  KID_PICKED_UP: 'kid_picked_up',
  KID_DROPPED_OFF: 'kid_dropped_off',
  TRIP_COMPLETED: 'trip_completed',
  TRIP_CANCELLED: 'trip_cancelled',
  TRIP_ASSIGNED: 'trip_assigned',
  LATE_PICKUP_REQUEST: 'late_pickup_request',
  ASSIGNMENT: 'assignment',
  TEACHER_NOTE: 'teacher_note',
  ATTENDANCE_ALERT: 'attendance_alert',
  DIARY: 'diary',
};

export const EDIT_SCOPES = {
  THIS_OCCURRENCE: 'THIS_OCCURRENCE',
  THIS_AND_FUTURE: 'THIS_AND_FUTURE',
  ENTIRE_SERIES: 'ENTIRE_SERIES',
};

export const EXCEPTION_TYPES = {
  SKIP: 'SKIP',
  OVERRIDE: 'OVERRIDE',
};
