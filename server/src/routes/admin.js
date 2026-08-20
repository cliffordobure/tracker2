import { Router } from 'express';
import bcrypt from 'bcryptjs';
import {
  User,
  School,
  Route,
  Stop,
  Kid,
  Bus,
  DriverProfile,
  Trip,
  TripEvent,
  Announcement,
  LeaveRequest,
  Notification,
  AttendanceRecord,
  FeeStatement,
  TeacherNote,
  TripSchedule,
  SchoolClass,
  Conversation,
  Message,
  AcademicTerm,
} from '../models/index.js';
import { authenticate, requireSchoolStaff, requireSuperAdmin } from '../middleware/auth.js';
import adminTripOps from './adminTripOps.js';
import { createAndEmitNotifications, NOTIFICATION_TYPES } from '../services/notifications.js';
import { getIO } from '../socket.js';

const router = Router();
router.use(authenticate, requireSchoolStaff);
router.use(adminTripOps);

/** school_admin → their school; super_admin → query/body schoolId or null (all). */
function resolveSchoolId(req, { required = false } = {}) {
  if (req.user.role === 'school_admin') {
    return req.user.schoolId || null;
  }
  return req.query.schoolId || req.body.schoolId || null;
}

function schoolFilter(req, field = 'schoolId') {
  const schoolId = resolveSchoolId(req);
  if (schoolId) return { [field]: schoolId };
  return {};
}

function assertSchoolAccess(req, schoolId) {
  if (req.user.role === 'school_admin' && schoolId?.toString() !== req.user.schoolId) {
    return false;
  }
  return true;
}

function dayBounds(dateInput) {
  let d;
  if (!dateInput) d = new Date();
  else if (typeof dateInput === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(dateInput)) {
    const [y, m, day] = dateInput.split('-').map(Number);
    d = new Date(y, m - 1, day);
  } else d = new Date(dateInput);
  const start = new Date(d);
  start.setHours(0, 0, 0, 0);
  const end = new Date(d);
  end.setHours(23, 59, 59, 999);
  return { start, end, day: start };
}

function chunk(arr, size) {
  const out = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

function combineServiceTime(serviceDate, scheduledTime, scheduledFor) {
  if (scheduledFor) {
    const d = new Date(scheduledFor);
    if (!Number.isNaN(d.getTime())) return d;
  }
  const base = serviceDate ? new Date(serviceDate) : new Date();
  if (Number.isNaN(base.getTime())) return null;
  if (!scheduledTime) return base;
  const [hh, mm] = String(scheduledTime).split(':').map(Number);
  const d = new Date(base);
  d.setHours(Number.isFinite(hh) ? hh : 0, Number.isFinite(mm) ? mm : 0, 0, 0);
  return d;
}

function monthStart() {
  const d = new Date();
  d.setDate(1);
  d.setHours(0, 0, 0, 0);
  return d;
}

function routePathLabel(routeStops) {
  if (!routeStops?.length) return '';
  const school = routeStops.find((s) => s.type === 'school');
  const first = routeStops.find((s) => s.type === 'home') || routeStops[0];
  const last = school || routeStops[routeStops.length - 1];
  if (!last || String(last._id) === String(first._id)) return first.name || '';
  return `${first.name} → ${last.name}`;
}

function scheduleAppliesOn(schedule, date = new Date()) {
  if (schedule.active === false) return false;
  const day = new Date(date);
  day.setHours(0, 0, 0, 0);
  if (schedule.startDate) {
    const start = new Date(schedule.startDate);
    start.setHours(0, 0, 0, 0);
    if (day < start) return false;
  }
  if (schedule.endDate) {
    const end = new Date(schedule.endDate);
    end.setHours(0, 0, 0, 0);
    if (day > end) return false;
  }
  const dow = day.getDay();
  if (schedule.scheduleType === 'EVERY_DAY') return true;
  if (schedule.scheduleType === 'WEEKDAYS') return dow >= 1 && dow <= 5;
  if (schedule.scheduleType === 'CUSTOM_DAYS') return (schedule.customDays || []).includes(dow);
  if (schedule.scheduleType === 'ONE_TIME') {
    if (!schedule.startDate) return false;
    const start = new Date(schedule.startDate);
    start.setHours(0, 0, 0, 0);
    return start.getTime() === day.getTime();
  }
  return false;
}

function weekStart() {
  const d = new Date();
  const day = (d.getDay() + 6) % 7;
  d.setDate(d.getDate() - day);
  d.setHours(0, 0, 0, 0);
  return d;
}

// ——— Dashboard ———
router.get('/dashboard', async (req, res) => {
  try {
    const filter = schoolFilter(req);
    const schoolId = resolveSchoolId(req);
    const { start, end } = dayBounds();
    const sinceMonth = monthStart();

    const routeDocs = await Route.find(filter).select('_id');
    const routeIds = routeDocs.map((r) => r._id);

    const [
      schools,
      routes,
      kids,
      parents,
      drivers,
      teachers,
      buses,
      stops,
      activeTrips,
      scheduledTrips,
      school,
      addedKids,
      addedTeachers,
      addedBuses,
      addedRoutes,
      addedStops,
      addedDrivers,
      todayTrips,
      announcements,
      alerts,
      unread,
    ] = await Promise.all([
      schoolId ? School.countDocuments({ _id: schoolId }) : School.countDocuments(),
      Route.countDocuments(filter),
      Kid.countDocuments({ ...filter, active: true }),
      User.countDocuments({ role: 'parent', active: true, ...filter }),
      User.countDocuments({ role: 'driver', active: true, ...filter }),
      User.countDocuments({ role: 'teacher', active: true, ...filter }),
      Bus.countDocuments({ ...filter, active: true }),
      routeIds.length ? Stop.countDocuments({ routeId: { $in: routeIds } }) : 0,
      Trip.countDocuments({ ...filter, status: 'active' }),
      Trip.countDocuments({ ...filter, status: 'scheduled' }),
      schoolId ? School.findById(schoolId).select('name logoUrl') : School.findOne().select('name logoUrl'),
      Kid.countDocuments({ ...filter, createdAt: { $gte: sinceMonth } }),
      User.countDocuments({ role: 'teacher', ...filter, createdAt: { $gte: sinceMonth } }),
      Bus.countDocuments({ ...filter, createdAt: { $gte: sinceMonth } }),
      Route.countDocuments({ ...filter, createdAt: { $gte: sinceMonth } }),
      routeIds.length ? Stop.countDocuments({ routeId: { $in: routeIds }, createdAt: { $gte: sinceMonth } }) : 0,
      User.countDocuments({ role: 'driver', ...filter, createdAt: { $gte: sinceMonth } }),
      Trip.find({
        ...filter,
        $or: [
          { serviceDate: { $gte: start, $lte: end } },
          { scheduledFor: { $gte: start, $lte: end } },
          { status: 'active' },
        ],
      })
        .populate('routeId', 'name')
        .populate('busId', 'plate label')
        .populate('driverId', 'name')
        .populate('scheduleId', 'scheduledTime')
        .select('status startedAt endedAt scheduledFor serviceDate period direction kidIds busId driverId routeId scheduleId latestLocation tripCode'),
      Announcement.find({ ...filter, active: { $ne: false }, archived: { $ne: true } })
        .sort({ publishedAt: -1, createdAt: -1 })
        .limit(4)
        .select('title publishedAt createdAt category icon'),
      Notification.find({ userId: req.user.id, archived: { $ne: true } })
        .sort({ createdAt: -1 })
        .limit(8)
        .select('title body type createdAt important read'),
      Notification.countDocuments({ userId: req.user.id, read: { $ne: true }, archived: { $ne: true } }),
    ]);

    const tripIds = todayTrips.map((t) => t._id);
    const events = tripIds.length
      ? await TripEvent.find({ tripId: { $in: tripIds } }).select('tripId kidId type')
      : [];

    const kidSet = new Set();
    const picked = new Set();
    const absent = new Set();
    for (const t of todayTrips) {
      for (const id of t.kidIds || []) kidSet.add(String(id._id || id));
    }
    for (const e of events) {
      if (!e.kidId) continue;
      const id = String(e.kidId);
      if (e.type === 'picked_up') picked.add(id);
      if (e.type === 'not_picked_up') absent.add(id);
    }
    const checkTotal = kidSet.size;
    const checkPicked = [...picked].filter((id) => kidSet.has(id)).length;
    const checkAbsent = [...absent].filter((id) => kidSet.has(id) && !picked.has(id)).length;
    const checkPending = Math.max(0, checkTotal - checkPicked - checkAbsent);

    let onTime = 0;
    let delayed = 0;
    let notStarted = 0;
    let completed = 0;
    let cancelled = 0;
    let inProgress = 0;
    for (const trip of todayTrips) {
      if (trip.status === 'cancelled') {
        cancelled += 1;
        continue;
      }
      if (trip.status === 'completed') {
        completed += 1;
        continue;
      }
      if (trip.status === 'scheduled') {
        notStarted += 1;
        continue;
      }
      if (trip.status === 'active') {
        inProgress += 1;
        const scheduled = combineServiceTime(trip.serviceDate, trip.scheduleId?.scheduledTime, trip.scheduledFor);
        if (!trip.startedAt || !scheduled) {
          onTime += 1;
          continue;
        }
        const delayMin = (new Date(trip.startedAt) - scheduled) / 60000;
        if (Number.isFinite(delayMin) && delayMin > 5) delayed += 1;
        else onTime += 1;
      }
    }

    const busesOnRoute = new Set(
      todayTrips.filter((t) => t.status === 'active').map((t) => String(t.busId?._id || t.busId || '')).filter(Boolean)
    ).size;

    const upcoming = todayTrips
      .filter((t) => t.status === 'scheduled')
      .map((t) => ({
        trip: t,
        at: combineServiceTime(t.serviceDate, t.scheduleId?.scheduledTime, t.scheduledFor),
      }))
      .filter((x) => x.at)
      .sort((a, b) => a.at - b.at);
    const next = upcoming[0] || null;
    const minutesUntil = next ? Math.round((next.at - Date.now()) / 60000) : null;

    return res.json({
      schools,
      routes,
      kids,
      parents,
      drivers,
      buses,
      activeTrips,
      scheduledTrips,
      teachers,
      stops,
      school: school ? { name: school.name || '', logoUrl: school.logoUrl || '' } : null,
      addedThisMonth: {
        kids: addedKids,
        teachers: addedTeachers,
        buses: addedBuses,
        routes: addedRoutes,
        stops: addedStops,
        drivers: addedDrivers,
      },
      today: {
        trips: { completed, inProgress, upcoming: notStarted, cancelled },
        transport: { onTime, delayed, notStarted, completed, inProgress },
        busesOnRoute,
        busTotal: buses,
        checkins: { picked: checkPicked, pending: checkPending, absent: checkAbsent, total: checkTotal },
        nextTrip: next
          ? {
              routeName: next.trip.routeId?.name || '',
              driverName: next.trip.driverId?.name || '',
              plate: next.trip.busId?.plate || next.trip.busId?.label || '',
              startsAt: next.at,
              minutesUntil,
            }
          : null,
      },
      announcements: announcements.map((a) => ({
        _id: a._id,
        title: a.title,
        at: a.publishedAt || a.createdAt,
        category: a.category || '',
      })),
      alerts: alerts.map((n) => ({
        _id: n._id,
        title: n.title,
        body: n.body,
        type: n.type,
        important: n.important === true,
        read: n.read === true,
        at: n.createdAt,
      })),
      unread,
    });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

function isOid(id) {
  return /^[a-f0-9]{24}$/i.test(String(id || ''));
}

function startOfWeek(date = new Date()) {
  const x = new Date(date);
  x.setHours(0, 0, 0, 0);
  x.setDate(x.getDate() - ((x.getDay() + 6) % 7));
  return x;
}

function pctDelta(curr, prev) {
  if (!prev) {
    if (!curr) return { pct: 0, dir: 'flat' };
    return { pct: null, dir: 'up', abs: curr };
  }
  const pct = Math.round(((curr - prev) / prev) * 100);
  return { pct, dir: pct > 0 ? 'up' : pct < 0 ? 'down' : 'flat' };
}

const ATTENDANCE_TYPES = ['kid_picked_up', 'kid_dropped_off', 'attendance_alert', 'late_pickup_request'];
const ROUTE_TYPES = ['trip_started', 'trip_completed', 'trip_cancelled', 'trip_assigned'];
const ALERT_TYPES = ['trip_cancelled', 'late_pickup_request', 'attendance_alert'];

function isIncidentNotification(n) {
  return String(n.key || '').includes(':incident:');
}

function isAlertNotification(n) {
  return Boolean(n.important) || ALERT_TYPES.includes(n.type) || isIncidentNotification(n);
}

function notificationMatchesTab(n, tab) {
  if (tab === 'unread') return n.read !== true;
  if (tab === 'alerts') return isAlertNotification(n);
  if (tab === 'attendance') return ATTENDANCE_TYPES.includes(n.type);
  if (tab === 'routes') return ROUTE_TYPES.includes(n.type);
  if (tab === 'incidents') return isIncidentNotification(n);
  if (tab === 'announcements') return n.type === 'announcement';
  return true;
}

function serializeAdminTrip(trip) {
  if (!trip) return null;
  const t = typeof trip.toObject === 'function' ? trip.toObject() : trip;
  const loc = t.latestLocation || null;
  return {
    _id: t._id,
    status: t.status || '',
    tripCode: t.tripCode || '',
    direction: t.direction || '',
    period: t.period || '',
    startedAt: t.startedAt || null,
    endedAt: t.endedAt || null,
    latestLocation: loc?.lat != null && loc?.lng != null ? loc : null,
    busId: t.busId
      ? { _id: t.busId._id, plate: t.busId.plate || '', label: t.busId.label || '' }
      : null,
    driverId: t.driverId
      ? { _id: t.driverId._id, name: t.driverId.name || '', phone: t.driverId.phone || '' }
      : null,
    routeId: t.routeId ? { _id: t.routeId._id, name: t.routeId.name || '' } : null,
  };
}

function serializeAdminNotification(n) {
  const obj = typeof n.toObject === 'function' ? n.toObject() : n;
  const trip = obj.tripId && typeof obj.tripId === 'object' && obj.tripId._id ? serializeAdminTrip(obj.tripId) : null;
  const kid = obj.kidId && typeof obj.kidId === 'object' && obj.kidId._id
    ? { _id: obj.kidId._id, name: obj.kidId.name || '', grade: obj.kidId.grade || '' }
    : null;
  return {
    _id: obj._id,
    type: obj.type,
    title: obj.title,
    body: obj.body,
    tripId: trip?._id || obj.tripId || null,
    kidId: kid?._id || obj.kidId || null,
    key: obj.key || '',
    link: obj.link || '',
    authorName: obj.authorName || '',
    important: Boolean(obj.important),
    archived: Boolean(obj.archived),
    read: Boolean(obj.read),
    createdAt: obj.createdAt,
    trip,
    kid,
    incident: isIncidentNotification(obj),
  };
}

router.get('/inbox', async (req, res) => {
  try {
    const unread = await Notification.countDocuments({
      userId: req.user.id,
      read: { $ne: true },
      archived: { $ne: true },
    });
    res.json({ unread });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/notifications', async (req, res) => {
  try {
    const tab = String(req.query.tab || 'all').toLowerCase();
    const q = String(req.query.q || '').trim();
    const sort = String(req.query.sort || 'latest').toLowerCase() === 'oldest' ? 1 : -1;
    const { start: todayStart, end: todayEnd } = dayBounds();
    const yesterday = new Date(todayStart);
    yesterday.setDate(yesterday.getDate() - 1);
    const { start: yStart, end: yEnd } = dayBounds(yesterday);
    const weekStart = startOfWeek();

    const base = { userId: req.user.id, archived: { $ne: true } };
    const rows = await Notification.find(base)
      .sort({ createdAt: -1 })
      .limit(300)
      .populate({
        path: 'tripId',
        select: 'status tripCode direction period startedAt endedAt latestLocation busId driverId routeId',
        populate: [
          { path: 'busId', select: 'plate label' },
          { path: 'driverId', select: 'name phone' },
          { path: 'routeId', select: 'name' },
        ],
      })
      .populate('kidId', 'name grade');

    const all = rows.map(serializeAdminNotification);
    const counts = {
      all: all.length,
      unread: all.filter((n) => !n.read).length,
      alerts: all.filter((n) => isAlertNotification(n)).length,
      attendance: all.filter((n) => ATTENDANCE_TYPES.includes(n.type)).length,
      routes: all.filter((n) => ROUTE_TYPES.includes(n.type)).length,
      incidents: all.filter((n) => n.incident).length,
      announcements: all.filter((n) => n.type === 'announcement').length,
    };

    let list = all;
    if (q) {
      const needle = q.toLowerCase();
      list = list.filter((n) =>
        [
          n.title,
          n.body,
          n.authorName,
          n.kid?.name,
          n.trip?.busId?.plate,
          n.trip?.busId?.label,
          n.trip?.driverId?.name,
          n.trip?.routeId?.name,
          n.trip?.tripCode,
        ]
          .filter(Boolean)
          .join(' ')
          .toLowerCase()
          .includes(needle)
      );
    }

    const filtered = list.filter((n) => notificationMatchesTab(n, tab));
    if (sort === 1) filtered.reverse();

    const [today, yesterdayCount, important, announcementsWeek] = await Promise.all([
      Notification.countDocuments({ ...base, createdAt: { $gte: todayStart, $lte: todayEnd } }),
      Notification.countDocuments({ ...base, createdAt: { $gte: yStart, $lte: yEnd } }),
      Notification.countDocuments({ ...base, important: true }),
      Notification.countDocuments({ ...base, type: 'announcement', createdAt: { $gte: weekStart } }),
    ]);

    res.json({
      notifications: filtered,
      counts,
      stats: {
        unread: counts.unread,
        today,
        yesterday: yesterdayCount,
        todayDelta: pctDelta(today, yesterdayCount),
        important,
        announcementsWeek,
      },
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/notifications/read', async (req, res) => {
  try {
    const { ids } = req.body || {};
    if (Array.isArray(ids) && ids.length) {
      await Notification.updateMany(
        { _id: { $in: ids }, userId: req.user.id },
        { $set: { read: true } }
      );
    } else {
      await Notification.updateMany(
        { userId: req.user.id, read: { $ne: true }, archived: { $ne: true } },
        { $set: { read: true } }
      );
    }
    const unread = await Notification.countDocuments({
      userId: req.user.id,
      read: { $ne: true },
      archived: { $ne: true },
    });
    res.json({ ok: true, unread });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/notifications/:id/read', async (req, res) => {
  try {
    if (!isOid(req.params.id)) return res.status(400).json({ error: 'Invalid notification' });
    const row = await Notification.findOneAndUpdate(
      { _id: req.params.id, userId: req.user.id },
      { $set: { read: true } },
      { new: true }
    );
    if (!row) return res.status(404).json({ error: 'Notification not found' });
    res.json({ notification: serializeAdminNotification(row), ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/notifications/:id/archive', async (req, res) => {
  try {
    if (!isOid(req.params.id)) return res.status(400).json({ error: 'Invalid notification' });
    const archived = req.body?.archived === false ? false : true;
    const row = await Notification.findOneAndUpdate(
      { _id: req.params.id, userId: req.user.id },
      { $set: { archived, read: true } },
      { new: true }
    );
    if (!row) return res.status(404).json({ error: 'Notification not found' });
    res.json({ notification: serializeAdminNotification(row), ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/notifications/:id', async (req, res) => {
  try {
    if (!isOid(req.params.id)) return res.status(400).json({ error: 'Invalid notification' });
    const row = await Notification.findOne({ _id: req.params.id, userId: req.user.id })
      .populate({
        path: 'tripId',
        select: 'status tripCode direction period startedAt endedAt latestLocation busId driverId routeId incidents',
        populate: [
          { path: 'busId', select: 'plate label' },
          { path: 'driverId', select: 'name phone' },
          { path: 'routeId', select: 'name' },
        ],
      })
      .populate('kidId', 'name grade');
    if (!row) return res.status(404).json({ error: 'Notification not found' });

    const notification = serializeAdminNotification(row);
    const tripDoc = row.tripId && typeof row.tripId === 'object' ? row.tripId : null;
    const activity = [];
    if (tripDoc?.startedAt) {
      activity.push({ at: tripDoc.startedAt, title: 'Trip started', body: '' });
    }
    if (tripDoc?.endedAt) {
      activity.push({ at: tripDoc.endedAt, title: 'Trip ended', body: '' });
    }
    for (const inc of tripDoc?.incidents || []) {
      activity.push({
        at: inc.occurredAt || inc.createdAt,
        title: `Incident · ${inc.type || 'other'}`,
        body: inc.details || '',
      });
    }
    if (tripDoc?._id) {
      const events = await TripEvent.find({ tripId: tripDoc._id })
        .sort({ at: -1 })
        .limit(12)
        .populate('kidId', 'name');
      for (const e of events) {
        const label =
          e.type === 'picked_up' ? 'Picked up' : e.type === 'dropped_off' ? 'Dropped off' : 'Not picked up';
        activity.push({
          at: e.at,
          title: `${label}${e.kidId?.name ? ` · ${e.kidId.name}` : ''}`,
          body: '',
        });
      }
    }
    activity.sort((a, b) => new Date(b.at || 0) - new Date(a.at || 0));

    res.json({
      notification,
      activity: activity.slice(0, 12),
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

function messageClockLabel(value) {
  const d = value ? new Date(value) : null;
  if (!d || Number.isNaN(d.getTime())) return '';
  return d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
}

function messageTimeLabel(value) {
  const d = value ? new Date(value) : null;
  if (!d || Number.isNaN(d.getTime())) return '';
  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const then = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const days = Math.round((start - then) / 86400000);
  if (days <= 0) return messageClockLabel(d);
  if (days === 1) return 'Yesterday';
  if (days < 7) return d.toLocaleDateString(undefined, { weekday: 'short' });
  return d.toLocaleDateString(undefined, { day: 'numeric', month: 'short' });
}

function messageDateKey(value) {
  const d = value ? new Date(value) : null;
  if (!d || Number.isNaN(d.getTime())) return '';
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function messageDateLabel(value) {
  const d = value ? new Date(value) : null;
  if (!d || Number.isNaN(d.getTime())) return '';
  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const then = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const days = Math.round((start - then) / 86400000);
  if (days <= 0) return 'Today';
  if (days === 1) return 'Yesterday';
  return d.toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' });
}

function asPerson(ref) {
  if (!ref || typeof ref !== 'object' || !ref.name) return null;
  return ref;
}

function personPayload(ref, role) {
  if (!ref?._id) return null;
  return {
    _id: ref._id,
    name: ref.name || '',
    photoUrl: ref.photoUrl || '',
    phone: ref.phone || '',
    role: role || ref.role || '',
  };
}

function memberRoleLabel(role) {
  if (role === 'school_admin' || role === 'super_admin') return 'Admin';
  if (role === 'driver') return 'Driver';
  if (role === 'teacher') return 'Teacher';
  if (role === 'parent') return 'Parent';
  return role || 'Staff';
}

function serializeAdminConversation(row) {
  const doc = typeof row.toObject === 'function' ? row.toObject() : row;
  const parent = asPerson(doc.parentId);
  const driver = asPerson(doc.driverId);
  const counterpart = asPerson(doc.counterpartUserId);
  const createdBy = asPerson(doc.createdByUserId);
  const members = Array.isArray(doc.memberIds) ? doc.memberIds.map((m) => asPerson(m)).filter(Boolean) : [];
  return {
    _id: doc._id,
    type: doc.type || 'direct',
    title: doc.title,
    roleLabel: doc.roleLabel || '',
    subtitle: doc.subtitle || '',
    description: doc.description || '',
    avatarKind: doc.avatarKind || 'admin',
    photoUrl: doc.photoUrl || parent?.photoUrl || driver?.photoUrl || counterpart?.photoUrl || '',
    phone: doc.phone || parent?.phone || driver?.phone || counterpart?.phone || '',
    lastMessage: doc.lastMessage || '',
    lastMessageAt: doc.lastMessageAt,
    timeLabel: messageTimeLabel(doc.lastMessageAt),
    unreadCount: doc.staffUnreadCount || 0,
    archived: doc.archived === true,
    muted: doc.muted === true,
    createdAt: doc.createdAt,
    updatedAt: doc.updatedAt || doc.lastMessageAt || doc.createdAt,
    createdBy: createdBy ? personPayload(createdBy, createdBy.role) : null,
    parentId: parent?._id || doc.parentId || null,
    driverId: driver?._id || doc.driverId || null,
    counterpartUserId: counterpart?._id || doc.counterpartUserId || null,
    parent: personPayload(parent, 'parent'),
    driver: personPayload(driver, 'driver'),
    counterpart: personPayload(counterpart, counterpart?.role),
    storedMembers: members.map((m) => personPayload(m, m.role)).filter(Boolean),
  };
}

function serializeAdminChatMessage(row, user) {
  const doc = typeof row.toObject === 'function' ? row.toObject() : row;
  const senderId = doc.senderUserId ? String(doc.senderUserId) : '';
  const mine = senderId
    ? senderId === String(user.id)
    : doc.sender === 'staff' && String(doc.senderName || '') === String(user.name || '');
  return {
    _id: doc._id,
    sender: doc.sender,
    senderName: doc.senderName || '',
    senderUserId: doc.senderUserId || null,
    body: doc.body,
    createdAt: doc.createdAt,
    timeLabel: messageClockLabel(doc.createdAt) || messageTimeLabel(doc.createdAt),
    dateKey: messageDateKey(doc.createdAt),
    dateLabel: messageDateLabel(doc.createdAt),
    mine,
  };
}

function populateConversation(q) {
  return q
    .populate('parentId', 'name photoUrl phone role')
    .populate('driverId', 'name photoUrl phone role')
    .populate('counterpartUserId', 'name photoUrl phone role')
    .populate('createdByUserId', 'name photoUrl phone role')
    .populate('memberIds', 'name photoUrl phone role');
}

function uniqueMembers(convo, currentUser) {
  const map = new Map();
  const add = (person, roleLabel) => {
    if (!person?._id) return;
    const id = String(person._id);
    if (map.has(id)) return;
    map.set(id, {
      _id: person._id,
      name: person.name || '',
      photoUrl: person.photoUrl || '',
      roleLabel: roleLabel || memberRoleLabel(person.role),
    });
  };
  add(convo.parent, 'Parent');
  add(convo.driver, 'Driver');
  if (convo.counterpart) add(convo.counterpart, memberRoleLabel(convo.counterpart.role) || convo.roleLabel || 'Staff');
  if (convo.createdBy) add(convo.createdBy, memberRoleLabel(convo.createdBy.role));
  for (const m of convo.storedMembers || []) add(m, memberRoleLabel(m.role));
  if (currentUser?.id) {
    add(
      { _id: currentUser.id, name: currentUser.name || 'You', photoUrl: currentUser.photoUrl || '', role: currentUser.role },
      memberRoleLabel(currentUser.role)
    );
  }
  return [...map.values()];
}

router.get('/messages', async (req, res) => {
  try {
    const schoolId = resolveSchoolId(req);
    if (!schoolId) return res.status(400).json({ error: 'schoolId is required' });
    const tab = String(req.query.tab || 'all').toLowerCase();
    const q = String(req.query.q || '').trim();
    const filter = { schoolId };
    if (tab === 'archived') filter.archived = true;
    else filter.archived = { $ne: true };
    if (tab === 'groups') filter.type = 'group';
    if (tab === 'unread') filter.staffUnreadCount = { $gt: 0 };
    if (tab === 'parents') filter.parentId = { $ne: null };
    if (tab === 'drivers') filter.driverId = { $ne: null };

    if (q) {
      const rx = new RegExp(q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
      filter.$or = [{ title: rx }, { lastMessage: rx }, { roleLabel: rx }, { subtitle: rx }];
    }

    const [rows, parents, drivers, teachers, admins, allCount, unreadCount, groupCount, archivedCount] = await Promise.all([
      populateConversation(Conversation.find(filter).sort({ lastMessageAt: -1 }).limit(120)),
      User.find({ schoolId, role: 'parent', active: { $ne: false } }).select('name photoUrl phone').sort({ name: 1 }).limit(200),
      User.find({ schoolId, role: 'driver', active: { $ne: false } }).select('name photoUrl phone').sort({ name: 1 }).limit(100),
      User.find({ schoolId, role: 'teacher', active: { $ne: false } }).select('name photoUrl phone jobTitle').sort({ name: 1 }).limit(100),
      User.find({ schoolId, role: 'school_admin', active: { $ne: false } }).select('name photoUrl phone').sort({ name: 1 }).limit(50),
      Conversation.countDocuments({ schoolId, archived: { $ne: true } }),
      Conversation.countDocuments({ schoolId, archived: { $ne: true }, staffUnreadCount: { $gt: 0 } }),
      Conversation.countDocuments({ schoolId, archived: { $ne: true }, type: 'group' }),
      Conversation.countDocuments({ schoolId, archived: true }),
    ]);

    const conversations = rows.map(serializeAdminConversation);
    res.json({
      conversations,
      counts: { all: allCount, unread: unreadCount, groups: groupCount, archived: archivedCount },
      contacts: [
        ...admins.map((u) => ({ _id: u._id, name: u.name, photoUrl: u.photoUrl || '', phone: u.phone || '', kind: 'admin', roleLabel: 'Admin' })),
        ...parents.map((u) => ({ _id: u._id, name: u.name, photoUrl: u.photoUrl || '', phone: u.phone || '', kind: 'parent', roleLabel: 'Parent' })),
        ...drivers.map((u) => ({ _id: u._id, name: u.name, photoUrl: u.photoUrl || '', phone: u.phone || '', kind: 'driver', roleLabel: 'Driver' })),
        ...teachers.map((u) => ({
          _id: u._id,
          name: u.name,
          photoUrl: u.photoUrl || '',
          phone: u.phone || '',
          kind: 'teacher',
          roleLabel: u.jobTitle || 'Teacher',
        })),
      ],
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/messages', async (req, res) => {
  try {
    const schoolId = resolveSchoolId(req);
    if (!schoolId) return res.status(400).json({ error: 'schoolId is required' });
    const kind = String(req.body?.kind || 'parent');
    const contactId = String(req.body?.contactId || '');
    const title = String(req.body?.title || '').trim();
    const body = String(req.body?.body || '').trim();
    const type = req.body?.type === 'group' ? 'group' : 'direct';

    if (type === 'group') {
      if (!title) return res.status(400).json({ error: 'Group name is required' });
      const convo = await Conversation.create({
        schoolId,
        type: 'group',
        title,
        roleLabel: 'Group',
        avatarKind: 'group',
        counterpartUserId: req.user.id,
        createdByUserId: req.user.id,
        memberIds: [req.user.id],
        lastMessage: body || '',
        lastMessageAt: new Date(),
        unreadCount: 0,
        staffUnreadCount: 0,
      });
      if (body) {
        await Message.create({
          conversationId: convo._id,
          sender: 'staff',
          senderUserId: req.user.id,
          senderName: req.user.name || 'Admin',
          body,
        });
        convo.lastMessage = body;
        await convo.save();
      }
      const populated = await populateConversation(Conversation.findById(convo._id));
      return res.status(201).json({ conversation: serializeAdminConversation(populated) });
    }

    if (!isOid(contactId)) return res.status(400).json({ error: 'Choose a contact' });
    const role = kind === 'driver' ? 'driver' : kind === 'teacher' ? 'teacher' : 'parent';
    const contact = await User.findOne({ _id: contactId, schoolId, role, active: { $ne: false } }).select(
      'name photoUrl phone role jobTitle'
    );
    if (!contact) return res.status(404).json({ error: 'Contact not found' });

    let query;
    if (kind === 'driver') {
      query = { schoolId, driverId: contact._id, counterpartUserId: req.user.id, type: 'direct' };
    } else if (kind === 'teacher') {
      query = { schoolId, counterpartUserId: contact._id, parentId: null, driverId: null, type: 'direct' };
    } else {
      query = { schoolId, parentId: contact._id, counterpartUserId: req.user.id, type: 'direct' };
    }

    let convo = await Conversation.findOne(query);
    if (!convo) {
      convo = await Conversation.create({
        schoolId,
        parentId: kind === 'parent' ? contact._id : null,
        driverId: kind === 'driver' ? contact._id : null,
        counterpartUserId: kind === 'teacher' ? contact._id : req.user.id,
        createdByUserId: req.user.id,
        type: 'direct',
        title: contact.name,
        roleLabel: kind === 'parent' ? 'Parent' : kind === 'driver' ? 'Driver' : contact.jobTitle || 'Teacher',
        avatarKind: kind === 'parent' ? 'parent' : kind === 'driver' ? 'driver' : 'teacher',
        photoUrl: contact.photoUrl || '',
        phone: contact.phone || '',
        lastMessage: body || '',
        lastMessageAt: new Date(),
        sourceKey: `admin:${req.user.id}:${kind}:${contact._id}`,
      });
    }

    if (body) {
      await Message.create({
        conversationId: convo._id,
        sender: 'staff',
        senderUserId: req.user.id,
        senderName: req.user.name || 'Admin',
        body,
      });
      convo.lastMessage = body;
      convo.lastMessageAt = new Date();
      convo.archived = false;
      convo.staffUnreadCount = 0;
      if (kind === 'parent') convo.unreadCount = (convo.unreadCount || 0) + 1;
      if (kind === 'driver') convo.driverUnreadCount = (convo.driverUnreadCount || 0) + 1;
      await convo.save();
      await createAndEmitNotifications(getIO(), [
        {
          userId: contact._id,
          type: NOTIFICATION_TYPES.MESSAGE,
          title: req.user.name || 'Admin',
          body,
        },
      ]);
    }

    const populated = await populateConversation(Conversation.findById(convo._id));
    res.status(201).json({ conversation: serializeAdminConversation(populated) });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/messages/:id', async (req, res) => {
  try {
    if (!isOid(req.params.id)) return res.status(400).json({ error: 'Invalid conversation' });
    const schoolId = resolveSchoolId(req);
    const convo = await populateConversation(Conversation.findOne({ _id: req.params.id, ...(schoolId ? { schoolId } : {}) }));
    if (!convo) return res.status(404).json({ error: 'Conversation not found' });
    if (convo.staffUnreadCount) {
      convo.staffUnreadCount = 0;
      await convo.save();
    }
    const messages = await Message.find({ conversationId: convo._id }).sort({ createdAt: 1 }).limit(200);
    const serialized = serializeAdminConversation(convo);
    res.json({
      conversation: serialized,
      messages: messages.map((m) => serializeAdminChatMessage(m, req.user)),
      members: uniqueMembers(serialized, req.user),
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/messages/:id', async (req, res) => {
  try {
    const body = String(req.body?.body || '').trim();
    if (!body) return res.status(400).json({ error: 'Message cannot be empty' });
    if (!isOid(req.params.id)) return res.status(400).json({ error: 'Invalid conversation' });
    const schoolId = resolveSchoolId(req);
    const convo = await Conversation.findOne({ _id: req.params.id, ...(schoolId ? { schoolId } : {}) });
    if (!convo) return res.status(404).json({ error: 'Conversation not found' });
    const message = await Message.create({
      conversationId: convo._id,
      sender: 'staff',
      senderUserId: req.user.id,
      senderName: req.user.name || 'Admin',
      body,
    });
    convo.lastMessage = body;
    convo.lastMessageAt = message.createdAt;
    convo.archived = false;
    convo.staffUnreadCount = 0;
    if (convo.parentId) convo.unreadCount = (convo.unreadCount || 0) + 1;
    if (convo.driverId) convo.driverUnreadCount = (convo.driverUnreadCount || 0) + 1;
    await convo.save();

    const targets = [convo.parentId, convo.driverId, convo.counterpartUserId]
      .map((id) => (id ? String(id) : ''))
      .filter((id) => id && id !== String(req.user.id));
    const unique = [...new Set(targets)];
    if (unique.length) {
      await createAndEmitNotifications(
        getIO(),
        unique.map((userId) => ({
          userId,
          type: NOTIFICATION_TYPES.MESSAGE,
          title: req.user.name || 'Admin',
          body,
        }))
      );
    }

    res.status(201).json({
      message: serializeAdminChatMessage(message, req.user),
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/messages/:id/archive', async (req, res) => {
  try {
    if (!isOid(req.params.id)) return res.status(400).json({ error: 'Invalid conversation' });
    const schoolId = resolveSchoolId(req);
    const convo = await Conversation.findOne({ _id: req.params.id, ...(schoolId ? { schoolId } : {}) });
    if (!convo) return res.status(404).json({ error: 'Conversation not found' });
    convo.archived = req.body?.archived !== false;
    await convo.save();
    const populated = await populateConversation(Conversation.findById(convo._id));
    res.json({ conversation: serializeAdminConversation(populated) });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.put('/messages/:id', async (req, res) => {
  try {
    if (!isOid(req.params.id)) return res.status(400).json({ error: 'Invalid conversation' });
    const schoolId = resolveSchoolId(req);
    const convo = await Conversation.findOne({ _id: req.params.id, ...(schoolId ? { schoolId } : {}) });
    if (!convo) return res.status(404).json({ error: 'Conversation not found' });
    if (req.body.title !== undefined) {
      const title = String(req.body.title || '').trim().slice(0, 120);
      if (!title) return res.status(400).json({ error: 'Title is required' });
      convo.title = title;
    }
    if (req.body.description !== undefined) {
      convo.description = String(req.body.description || '').trim().slice(0, 400);
    }
    if (req.body.muted !== undefined) convo.muted = req.body.muted === true;
    await convo.save();
    const populated = await populateConversation(Conversation.findById(convo._id));
    const serialized = serializeAdminConversation(populated);
    res.json({ conversation: serialized, members: uniqueMembers(serialized, req.user) });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.post('/messages/:id/members', async (req, res) => {
  try {
    if (!isOid(req.params.id)) return res.status(400).json({ error: 'Invalid conversation' });
    const userId = String(req.body?.userId || '');
    if (!isOid(userId)) return res.status(400).json({ error: 'Choose a person to add' });
    const schoolId = resolveSchoolId(req);
    const convo = await Conversation.findOne({ _id: req.params.id, ...(schoolId ? { schoolId } : {}) });
    if (!convo) return res.status(404).json({ error: 'Conversation not found' });
    if (convo.type !== 'group') {
      return res.status(400).json({ error: 'Members can only be added to group conversations' });
    }
    const person = await User.findOne({
      _id: userId,
      schoolId,
      role: { $in: ['school_admin', 'teacher', 'driver', 'parent'] },
      active: { $ne: false },
    }).select('_id');
    if (!person) return res.status(404).json({ error: 'User not found' });
    const already = (convo.memberIds || []).some((id) => String(id) === String(person._id));
    if (!already) {
      convo.memberIds = [...(convo.memberIds || []), person._id];
      await convo.save();
    }
    const populated = await populateConversation(Conversation.findById(convo._id));
    const serialized = serializeAdminConversation(populated);
    res.json({ conversation: serialized, members: uniqueMembers(serialized, req.user) });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.delete('/messages/:id/members/:userId', async (req, res) => {
  try {
    if (!isOid(req.params.id) || !isOid(req.params.userId)) {
      return res.status(400).json({ error: 'Invalid conversation or member' });
    }
    const schoolId = resolveSchoolId(req);
    const convo = await Conversation.findOne({ _id: req.params.id, ...(schoolId ? { schoolId } : {}) });
    if (!convo) return res.status(404).json({ error: 'Conversation not found' });
    if (convo.type !== 'group') {
      return res.status(400).json({ error: 'Members can only be removed from group conversations' });
    }
    convo.memberIds = (convo.memberIds || []).filter((id) => String(id) !== String(req.params.userId));
    await convo.save();
    const populated = await populateConversation(Conversation.findById(convo._id));
    const serialized = serializeAdminConversation(populated);
    res.json({ conversation: serialized, members: uniqueMembers(serialized, req.user) });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.delete('/messages/:id', async (req, res) => {
  try {
    if (!isOid(req.params.id)) return res.status(400).json({ error: 'Invalid conversation' });
    const schoolId = resolveSchoolId(req);
    const convo = await Conversation.findOne({ _id: req.params.id, ...(schoolId ? { schoolId } : {}) });
    if (!convo) return res.status(404).json({ error: 'Conversation not found' });
    await Message.deleteMany({ conversationId: convo._id });
    await Conversation.deleteOne({ _id: convo._id });
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

const SCHOOL_ROLES = ['school_admin', 'teacher', 'driver', 'parent'];
const ROLE_LABELS = {
  super_admin: 'Super Admin',
  school_admin: 'School Admin',
  teacher: 'Teacher',
  driver: 'Driver',
  parent: 'Parent',
};

function serializeSchoolUser(row) {
  const u = typeof row.toSafeJSON === 'function' ? row.toSafeJSON() : row;
  return {
    ...u,
    roleLabel: ROLE_LABELS[u.role] || u.role,
  };
}

async function ensureDriverProfile(userId) {
  const existing = await DriverProfile.findOne({ userId });
  if (existing) return existing;
  return DriverProfile.create({ userId });
}

router.get('/users', async (req, res) => {
  try {
    const schoolId = resolveSchoolId(req);
    if (!schoolId) return res.status(400).json({ error: 'schoolId is required' });
    const users = await User.find({
      schoolId,
      role: { $in: SCHOOL_ROLES },
    }).sort({ name: 1 });

    const sinceMonth = monthStart();
    const byRole = { school_admin: 0, teacher: 0, driver: 0, parent: 0 };
    let active = 0;
    let addedThisMonth = 0;
    const departments = new Set();
    const recent = [];

    for (const u of users) {
      if (u.active !== false) active += 1;
      if (u.createdAt && u.createdAt >= sinceMonth) addedThisMonth += 1;
      if (byRole[u.role] != null) byRole[u.role] += 1;
      if (u.department) departments.add(u.department);
      recent.push({
        id: String(u._id),
        name: u.name,
        at: u.createdAt,
        text: `User ${u.name} added`,
      });
    }
    recent.sort((a, b) => new Date(b.at || 0) - new Date(a.at || 0));

    res.json({
      users: users.map(serializeSchoolUser),
      roles: SCHOOL_ROLES.map((id) => ({
        id,
        label: ROLE_LABELS[id],
        count: byRole[id] || 0,
      })),
      departments: [...departments].sort(),
      stats: {
        total: users.length,
        active,
        inactive: users.length - active,
        addedThisMonth,
        byRole,
      },
      activity: recent.slice(0, 8),
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/users', async (req, res) => {
  try {
    const schoolId = resolveSchoolId(req);
    if (!schoolId) return res.status(400).json({ error: 'schoolId is required' });
    const name = String(req.body?.name || '').trim();
    const email = String(req.body?.email || '').toLowerCase().trim();
    const role = String(req.body?.role || '');
    if (!name || !email) return res.status(400).json({ error: 'name and email are required' });
    if (!SCHOOL_ROLES.includes(role)) return res.status(400).json({ error: 'Choose a stored role.' });

    const passwordHash = await bcrypt.hash(String(req.body?.password || 'password123'), 10);
    const user = await User.create({
      name,
      email,
      phone: String(req.body?.phone || '').trim(),
      role,
      schoolId,
      department: String(req.body?.department || '').trim(),
      jobTitle: String(req.body?.jobTitle || '').trim(),
      passwordHash,
      active: req.body?.active === false ? false : true,
    });
    if (role === 'driver') await ensureDriverProfile(user._id);
    res.status(201).json({ user: serializeSchoolUser(user) });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.post('/users/import', async (req, res) => {
  try {
    const schoolId = resolveSchoolId(req);
    if (!schoolId) return res.status(400).json({ error: 'schoolId is required' });
    const rows = Array.isArray(req.body?.rows) ? req.body.rows : [];
    if (!rows.length) return res.status(400).json({ error: 'No rows to import' });
    const created = [];
    const errors = [];
    for (let i = 0; i < Math.min(rows.length, 200); i += 1) {
      const row = rows[i] || {};
      const name = String(row.name || '').trim();
      const email = String(row.email || '').toLowerCase().trim();
      const role = String(row.role || '').trim();
      if (!name || !email) {
        errors.push({ row: i + 1, error: 'name and email are required' });
        continue;
      }
      if (!SCHOOL_ROLES.includes(role)) {
        errors.push({ row: i + 1, error: 'role must be school_admin, teacher, driver, or parent' });
        continue;
      }
      try {
        const passwordHash = await bcrypt.hash(String(row.password || 'password123'), 10);
        const user = await User.create({
          name,
          email,
          phone: String(row.phone || '').trim(),
          role,
          schoolId,
          department: String(row.department || '').trim(),
          passwordHash,
        });
        if (role === 'driver') await ensureDriverProfile(user._id);
        created.push(serializeSchoolUser(user));
      } catch (err) {
        errors.push({ row: i + 1, error: err.message });
      }
    }
    res.status(201).json({ created: created.length, users: created, errors });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.put('/users/:id', async (req, res) => {
  try {
    if (!isOid(req.params.id)) return res.status(400).json({ error: 'Invalid user' });
    const existing = await User.findById(req.params.id);
    if (!existing) return res.status(404).json({ error: 'User not found' });
    if (!assertSchoolAccess(req, existing.schoolId)) {
      return res.status(403).json({ error: 'Cannot edit a user from another school' });
    }
    if (!SCHOOL_ROLES.includes(existing.role)) {
      return res.status(403).json({ error: 'Cannot edit this account here' });
    }
    if (String(existing._id) === String(req.user.id) && req.body?.active === false) {
      return res.status(400).json({ error: 'You cannot deactivate your own account' });
    }

    const updates = {};
    if (req.body.name !== undefined) updates.name = String(req.body.name).trim();
    if (req.body.phone !== undefined) updates.phone = String(req.body.phone).trim();
    if (req.body.department !== undefined) updates.department = String(req.body.department).trim();
    if (req.body.jobTitle !== undefined) updates.jobTitle = String(req.body.jobTitle).trim();
    if (req.body.active !== undefined) updates.active = Boolean(req.body.active);
    if (req.body.email) {
      const email = String(req.body.email).toLowerCase().trim();
      const taken = await User.findOne({ email, _id: { $ne: existing._id } });
      if (taken) return res.status(400).json({ error: 'That email is already in use' });
      updates.email = email;
    }
    if (req.body.role && SCHOOL_ROLES.includes(req.body.role)) {
      if (String(existing._id) === String(req.user.id) && req.body.role !== existing.role) {
        return res.status(400).json({ error: 'You cannot change your own role' });
      }
      updates.role = req.body.role;
    }
    if (req.body.password) {
      updates.passwordHash = await bcrypt.hash(String(req.body.password), 10);
    }
    const user = await User.findByIdAndUpdate(existing._id, updates, { new: true });
    if (user.role === 'driver') await ensureDriverProfile(user._id);
    res.json({ user: serializeSchoolUser(user) });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.post('/users/bulk-active', async (req, res) => {
  try {
    const schoolId = resolveSchoolId(req);
    if (!schoolId) return res.status(400).json({ error: 'schoolId is required' });
    const ids = Array.isArray(req.body?.ids)
      ? req.body.ids.filter((id) => isOid(id) && String(id) !== String(req.user.id))
      : [];
    if (!ids.length) return res.status(400).json({ error: 'Select users' });
    const active = req.body?.active !== false;
    await User.updateMany(
      {
        _id: { $in: ids },
        schoolId,
        role: { $in: SCHOOL_ROLES },
      },
      { $set: { active } }
    );
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

function serializeAcademicTerm(term) {
  if (!term) return null;
  return {
    id: String(term._id),
    year: term.year,
    name: term.name,
    startDate: term.startDate,
    endDate: term.endDate,
    active: term.active !== false,
  };
}

function pickCurrentTerm(terms) {
  const now = Date.now();
  const covering = terms.find((t) => {
    const start = t.startDate ? new Date(t.startDate).getTime() : NaN;
    const end = t.endDate ? new Date(t.endDate).getTime() : NaN;
    return Number.isFinite(start) && Number.isFinite(end) && now >= start && now <= end;
  });
  if (covering) return covering;
  return terms.find((t) => t.active !== false) || terms[0] || null;
}

function daysRemaining(endDate) {
  if (!endDate) return null;
  const end = new Date(endDate);
  if (Number.isNaN(end.getTime())) return null;
  end.setHours(23, 59, 59, 999);
  return Math.ceil((end.getTime() - Date.now()) / 86400000);
}

function parseSchoolSettings(raw) {
  const s = raw && typeof raw === 'object' ? raw : {};
  const items = Number(s.itemsPerPage);
  return {
    dateFormat: ['dmy', 'mdy', 'ymd'].includes(s.dateFormat) ? s.dateFormat : '',
    currency: String(s.currency || '').trim().slice(0, 8),
    itemsPerPage: Number.isFinite(items) && items > 0 ? Math.min(100, Math.round(items)) : null,
    autoArchiveTrips: s.autoArchiveTrips === true,
    maskParentPhones: s.maskParentPhones === true,
    allowDataExport: s.allowDataExport === true,
    enableAuditLogs: s.enableAuditLogs === true,
  };
}

function schoolProfilePatch(body) {
  const patch = {};
  if (body.name !== undefined) {
    const name = String(body.name || '').trim();
    if (!name) throw new Error('name is required');
    patch.name = name.slice(0, 120);
  }
  if (body.address !== undefined) patch.address = String(body.address || '').trim().slice(0, 400);
  if (body.logoUrl !== undefined) patch.logoUrl = String(body.logoUrl || '').trim();
  if (body.logoPublicId !== undefined) patch.logoPublicId = String(body.logoPublicId || '').trim();
  if (body.supportEmail !== undefined) patch.supportEmail = String(body.supportEmail || '').trim().slice(0, 120);
  if (body.supportPhone !== undefined) patch.supportPhone = String(body.supportPhone || '').trim().slice(0, 40);
  if (body.supportHours !== undefined) patch.supportHours = String(body.supportHours || '').trim().slice(0, 80);
  if (body.schoolCode !== undefined) patch.schoolCode = String(body.schoolCode || '').trim().slice(0, 40);
  if (body.website !== undefined) patch.website = String(body.website || '').trim().slice(0, 160);
  if (body.schoolType !== undefined) patch.schoolType = String(body.schoolType || '').trim().slice(0, 80);
  if (body.timezone !== undefined) patch.timezone = String(body.timezone || '').trim().slice(0, 80);
  if (body.location && typeof body.location === 'object') {
    const lat = Number(body.location.lat);
    const lng = Number(body.location.lng);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) throw new Error('location lat and lng are required');
    patch.location = { lat, lng };
  }
  if (body.settings !== undefined) patch.settings = parseSchoolSettings(body.settings);
  return patch;
}

// ——— Schools ———
router.get('/schools', async (req, res) => {
  const schoolId = resolveSchoolId(req);
  const schools = schoolId
    ? await School.find({ _id: schoolId }).sort({ name: 1 })
    : await School.find().sort({ name: 1 });
  res.json({ schools });
});

router.get('/settings', async (req, res) => {
  try {
    const schoolId = resolveSchoolId(req);
    if (!schoolId) return res.status(400).json({ error: 'schoolId is required' });

    const [school, terms, me, buses, routes] = await Promise.all([
      School.findById(schoolId),
      AcademicTerm.find({ schoolId }).sort({ year: -1, startDate: 1 }),
      User.findById(req.user.id),
      Bus.countDocuments({ schoolId }),
      Route.find({ schoolId }).select('_id'),
    ]);
    if (!school) return res.status(404).json({ error: 'School not found' });

    const routeIds = routes.map((r) => r._id);
    const stops = routeIds.length ? await Stop.countDocuments({ routeId: { $in: routeIds } }) : 0;
    const currentTerm = pickCurrentTerm(terms);

    res.json({
      school,
      terms: terms.map(serializeAcademicTerm),
      currentTerm: serializeAcademicTerm(currentTerm),
      daysRemaining: daysRemaining(currentTerm?.endDate),
      counts: { buses, routes: routes.length, stops },
      me: me ? me.toSafeJSON() : null,
      system: {
        version: '1.0.0',
        lastUpdated: school.updatedAt || null,
        status: 'operational',
        lastBackup: null,
        storageTracked: false,
      },
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.put('/settings/term', async (req, res) => {
  try {
    const schoolId = resolveSchoolId(req);
    if (!schoolId) return res.status(400).json({ error: 'schoolId is required' });

    const year = Number(req.body.year);
    const name = String(req.body.name || '').trim().slice(0, 80);
    const startDate = req.body.startDate ? new Date(req.body.startDate) : null;
    const endDate = req.body.endDate ? new Date(req.body.endDate) : null;
    if (!Number.isFinite(year) || year < 2000 || year > 2100) {
      return res.status(400).json({ error: 'A valid academic year is required' });
    }
    if (!name) return res.status(400).json({ error: 'Term name is required' });
    if (!startDate || Number.isNaN(startDate.getTime()) || !endDate || Number.isNaN(endDate.getTime())) {
      return res.status(400).json({ error: 'Term start and end dates are required' });
    }
    if (endDate < startDate) return res.status(400).json({ error: 'Term end date must be after start date' });

    let term = req.body.id ? await AcademicTerm.findOne({ _id: req.body.id, schoolId }) : null;
    if (!term) {
      term = await AcademicTerm.findOne({ schoolId, year, name });
    }
    if (term) {
      term.year = year;
      term.name = name;
      term.startDate = startDate;
      term.endDate = endDate;
      term.active = req.body.active !== false;
      await term.save();
    } else {
      term = await AcademicTerm.create({
        schoolId,
        year,
        name,
        startDate,
        endDate,
        active: req.body.active !== false,
      });
    }

    if (term.active) {
      await AcademicTerm.updateMany(
        { schoolId, _id: { $ne: term._id } },
        { $set: { active: false } }
      );
    }

    const terms = await AcademicTerm.find({ schoolId }).sort({ year: -1, startDate: 1 });
    const currentTerm = pickCurrentTerm(terms);
    res.json({
      term: serializeAcademicTerm(term),
      terms: terms.map(serializeAcademicTerm),
      currentTerm: serializeAcademicTerm(currentTerm),
      daysRemaining: daysRemaining(currentTerm?.endDate),
    });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.post('/schools', requireSuperAdmin, async (req, res) => {
  try {
    const school = await School.create(req.body);
    res.status(201).json({ school });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.put('/schools/:id', async (req, res) => {
  try {
    if (!assertSchoolAccess(req, req.params.id)) {
      return res.status(403).json({ error: 'Cannot edit another school' });
    }
    const patch = schoolProfilePatch(req.body);
    const school = await School.findByIdAndUpdate(req.params.id, { $set: patch }, { new: true });
    if (!school) return res.status(404).json({ error: 'School not found' });
    res.json({ school });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.delete('/schools/:id', requireSuperAdmin, async (req, res) => {
  await School.findByIdAndDelete(req.params.id);
  res.json({ ok: true });
});

// ——— School admins (super only) ———
router.get('/school-admins', requireSuperAdmin, async (req, res) => {
  const filter = { role: 'school_admin' };
  if (req.query.schoolId) filter.schoolId = req.query.schoolId;
  const admins = await User.find(filter).sort({ name: 1 });
  res.json({ schoolAdmins: admins.map((a) => a.toSafeJSON()) });
});

router.post('/school-admins', requireSuperAdmin, async (req, res) => {
  try {
    const { email, password, name, phone, schoolId } = req.body;
    if (!email || !password || !name || !schoolId) {
      return res.status(400).json({ error: 'email, password, name, and schoolId are required' });
    }
    const school = await School.findById(schoolId);
    if (!school) return res.status(404).json({ error: 'School not found' });

    const passwordHash = await bcrypt.hash(password, 10);
    const admin = await User.create({
      email: email.toLowerCase().trim(),
      passwordHash,
      name,
      phone: phone || '',
      role: 'school_admin',
      schoolId,
    });
    res.status(201).json({ schoolAdmin: admin.toSafeJSON() });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

function busOperationalStatus(bus) {
  if (bus.serviceStatus === 'maintenance') return 'maintenance';
  if (bus.serviceStatus === 'out_of_service' || bus.active === false) return 'out_of_service';
  return 'active';
}

function serializeAssignedDriver(profile) {
  const user = profile?.userId;
  if (!user) return null;
  return {
    id: String(user._id || user.id || ''),
    name: user.name || '',
    phone: user.phone || '',
    photoUrl: user.photoUrl || '',
    licenseNumber: profile.licenseNumber || '',
  };
}

// ——— Buses ———
router.get('/buses', async (req, res) => {
  try {
    const buses = await Bus.find(schoolFilter(req)).populate('schoolId', 'name').sort({ label: 1, plate: 1 });
    const profiles = await DriverProfile.find({ busId: { $in: buses.map((b) => b._id) } }).populate(
      'userId',
      'name phone photoUrl active'
    );
    const extraByBus = {};
    const driverByBus = {};
    for (const p of profiles) {
      const bid = String(p.busId);
      const driver = serializeAssignedDriver(p);
      if (!driver) continue;
      if (!driverByBus[bid]) driverByBus[bid] = driver;
      else extraByBus[bid] = (extraByBus[bid] || 0) + 1;
    }

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const soon = new Date(today);
    soon.setDate(soon.getDate() + 30);
    const sinceMonth = monthStart();

    let active = 0;
    let maintenance = 0;
    let outOfService = 0;
    let insuranceValid = 0;
    let addedThisMonth = 0;
    const list = buses.map((b) => {
      const status = busOperationalStatus(b);
      if (status === 'active') active += 1;
      else if (status === 'maintenance') maintenance += 1;
      else outOfService += 1;
      const insuranceStatus = licenseStatusOf(b.insuranceExpiry, today, soon);
      if (insuranceStatus === 'valid' || insuranceStatus === 'expiring') insuranceValid += 1;
      if (b.createdAt && b.createdAt >= sinceMonth) addedThisMonth += 1;
      const json = b.toObject();
      json.status = status;
      json.insuranceStatus = insuranceStatus;
      json.driver = driverByBus[String(b._id)] || null;
      json.extraDrivers = extraByBus[String(b._id)] || 0;
      return json;
    });

    res.json({
      buses: list,
      stats: {
        total: buses.length,
        active,
        maintenance,
        outOfService,
        insuranceValid,
        addedThisMonth,
      },
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/buses/:id', async (req, res) => {
  try {
    if (!/^[a-f0-9]{24}$/i.test(String(req.params.id || ''))) {
      return res.status(400).json({ error: 'Invalid vehicle' });
    }
    const bus = await Bus.findById(req.params.id).populate('schoolId', 'name');
    if (!bus) return res.status(404).json({ error: 'Vehicle not found' });
    if (!assertSchoolAccess(req, bus.schoolId?._id || bus.schoolId)) {
      return res.status(403).json({ error: 'Cannot view vehicle from another school' });
    }

    const profiles = await DriverProfile.find({ busId: bus._id }).populate(
      'userId',
      'name phone photoUrl employeeId'
    );
    const drivers = profiles.map(serializeAssignedDriver).filter(Boolean);

    const trips = await Trip.find({ busId: bus._id })
      .populate('routeId', 'name')
      .populate('driverId', 'name')
      .sort({ serviceDate: -1, scheduledFor: -1, startedAt: -1, createdAt: -1 })
      .limit(5);

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const soon = new Date(today);
    soon.setDate(soon.getDate() + 30);
    const status = busOperationalStatus(bus);

    res.json({
      bus: {
        ...bus.toObject(),
        status,
        insuranceStatus: licenseStatusOf(bus.insuranceExpiry, today, soon),
      },
      schoolName: bus.schoolId?.name || '',
      drivers,
      recentTrips: trips.map((t) => ({
        id: String(t._id),
        status: t.status,
        direction: t.direction,
        period: t.period || '',
        scheduledFor: t.scheduledFor || null,
        startedAt: t.startedAt || null,
        endedAt: t.endedAt || null,
        serviceDate: t.serviceDate || null,
        routeName: t.routeId?.name || '',
        driverName: t.driverId?.name || '',
      })),
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/buses', async (req, res) => {
  try {
    let schoolId = resolveSchoolId(req, { required: true });
    if (req.user.role === 'super_admin') schoolId = req.body.schoolId;
    if (!schoolId) return res.status(400).json({ error: 'schoolId is required' });

    const seats = Number(req.body.seats);
    if (!Number.isFinite(seats) || seats < 1) {
      return res.status(400).json({ error: 'seats must be a positive number' });
    }

    const bus = await Bus.create({
      schoolId,
      plate: req.body.plate,
      label: req.body.label || '',
      model: req.body.model || '',
      color: req.body.color || '',
      seats,
      assistantName: req.body.assistantName || '',
      assistantPhone: req.body.assistantPhone || '',
      year: req.body.year ? Number(req.body.year) : null,
      safetyFeatures: req.body.safetyFeatures || '',
      code: req.body.code || '',
      photoUrl: req.body.photoUrl || '',
      photoPublicId: req.body.photoPublicId || '',
      vehicleType: req.body.vehicleType || '',
      fuelType: req.body.fuelType || '',
      serviceStatus: ['active', 'maintenance', 'out_of_service'].includes(req.body.serviceStatus)
        ? req.body.serviceStatus
        : 'active',
      insuranceExpiry: parseOptionalDate(req.body.insuranceExpiry) || null,
      insuranceProvider: req.body.insuranceProvider || '',
      insurancePolicyNo: req.body.insurancePolicyNo || '',
      nextServiceAt: parseOptionalDate(req.body.nextServiceAt) || null,
      lastServiceAt: parseOptionalDate(req.body.lastServiceAt) || null,
      chassisNumber: req.body.chassisNumber || '',
      engineNumber: req.body.engineNumber || '',
      mileage: Number.isFinite(Number(req.body.mileage)) && Number(req.body.mileage) >= 0
        ? Number(req.body.mileage)
        : null,
      active: req.body.serviceStatus
        ? req.body.serviceStatus === 'active'
        : req.body.active !== false,
    });
    res.status(201).json({ bus });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.put('/buses/:id', async (req, res) => {
  try {
    const existing = await Bus.findById(req.params.id);
    if (!existing) return res.status(404).json({ error: 'Bus not found' });
    if (!assertSchoolAccess(req, existing.schoolId)) {
      return res.status(403).json({ error: 'Cannot edit bus from another school' });
    }

    const updates = {};
    if (req.body.plate !== undefined) updates.plate = req.body.plate;
    if (req.body.label !== undefined) updates.label = req.body.label;
    if (req.body.model !== undefined) updates.model = req.body.model;
    if (req.body.color !== undefined) updates.color = req.body.color;
    if (req.body.assistantName !== undefined) updates.assistantName = req.body.assistantName;
    if (req.body.assistantPhone !== undefined) updates.assistantPhone = req.body.assistantPhone;
    if (req.body.safetyFeatures !== undefined) updates.safetyFeatures = req.body.safetyFeatures;
    if (req.body.code !== undefined) updates.code = String(req.body.code || '').trim();
    if (req.body.photoUrl !== undefined) updates.photoUrl = req.body.photoUrl || '';
    if (req.body.photoPublicId !== undefined) updates.photoPublicId = req.body.photoPublicId || '';
    if (req.body.vehicleType !== undefined) {
      updates.vehicleType = ['', 'school_bus', 'bus', 'minibus', 'van'].includes(req.body.vehicleType)
        ? req.body.vehicleType
        : existing.vehicleType || '';
    }
    if (req.body.fuelType !== undefined) {
      updates.fuelType = ['', 'diesel', 'petrol', 'hybrid', 'electric'].includes(req.body.fuelType)
        ? req.body.fuelType
        : existing.fuelType || '';
    }
    if (req.body.year !== undefined) {
      const year = req.body.year === '' || req.body.year == null ? null : Number(req.body.year);
      updates.year = year && Number.isFinite(year) ? year : null;
    }
    if (req.body.insuranceExpiry !== undefined) updates.insuranceExpiry = parseOptionalDate(req.body.insuranceExpiry) || null;
    if (req.body.insuranceProvider !== undefined) updates.insuranceProvider = String(req.body.insuranceProvider || '').trim();
    if (req.body.insurancePolicyNo !== undefined) updates.insurancePolicyNo = String(req.body.insurancePolicyNo || '').trim();
    if (req.body.nextServiceAt !== undefined) updates.nextServiceAt = parseOptionalDate(req.body.nextServiceAt) || null;
    if (req.body.lastServiceAt !== undefined) updates.lastServiceAt = parseOptionalDate(req.body.lastServiceAt) || null;
    if (req.body.chassisNumber !== undefined) updates.chassisNumber = String(req.body.chassisNumber || '').trim();
    if (req.body.engineNumber !== undefined) updates.engineNumber = String(req.body.engineNumber || '').trim();
    if (req.body.mileage !== undefined) {
      const mileage = req.body.mileage === '' || req.body.mileage == null ? null : Number(req.body.mileage);
      updates.mileage = mileage != null && Number.isFinite(mileage) && mileage >= 0 ? mileage : null;
    }
    if (req.body.seats != null) {
      const seats = Number(req.body.seats);
      if (!Number.isFinite(seats) || seats < 1) {
        return res.status(400).json({ error: 'seats must be a positive number' });
      }
      updates.seats = seats;
    }
    if (req.body.serviceStatus !== undefined) {
      if (!['active', 'maintenance', 'out_of_service'].includes(req.body.serviceStatus)) {
        return res.status(400).json({ error: 'Invalid status' });
      }
      updates.serviceStatus = req.body.serviceStatus;
      updates.active = req.body.serviceStatus === 'active';
    } else if (req.body.active !== undefined) {
      updates.active = req.body.active;
      updates.serviceStatus = req.body.active ? 'active' : 'out_of_service';
    }

    const bus = await Bus.findByIdAndUpdate(req.params.id, updates, { new: true });
    res.json({ bus });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.delete('/buses/:id', async (req, res) => {
  const existing = await Bus.findById(req.params.id);
  if (!existing) return res.status(404).json({ error: 'Bus not found' });
  if (!assertSchoolAccess(req, existing.schoolId)) {
    return res.status(403).json({ error: 'Cannot delete bus from another school' });
  }
  await Bus.findByIdAndDelete(req.params.id);
  res.json({ ok: true });
});

// ——— Routes ———
router.get('/routes', async (req, res) => {
  try {
    const routes = await Route.find(schoolFilter(req)).populate('schoolId', 'name').sort({ name: 1 });
    const ids = routes.map((r) => r._id);
    const [stops, kids, profiles, schedules] = await Promise.all([
      ids.length ? Stop.find({ routeId: { $in: ids } }).sort({ order: 1, name: 1 }) : [],
      ids.length ? Kid.find({ routeId: { $in: ids }, active: { $ne: false } }).select('routeId createdAt') : [],
      ids.length
        ? DriverProfile.find({ assignedRouteIds: { $in: ids } })
            .populate('userId', 'name phone photoUrl')
            .populate('busId', 'plate label')
        : [],
      ids.length
        ? TripSchedule.find({ routeId: { $in: ids }, active: { $ne: false } })
            .populate('driverId', 'name phone photoUrl')
            .populate('busId', 'plate label')
        : [],
    ]);

    const stopsByRoute = {};
    for (const s of stops) {
      const key = String(s.routeId);
      if (!stopsByRoute[key]) stopsByRoute[key] = [];
      stopsByRoute[key].push(s);
    }
    const kidsByRoute = {};
    for (const k of kids) {
      const key = String(k.routeId);
      kidsByRoute[key] = (kidsByRoute[key] || 0) + 1;
    }
    const extraDrivers = {};
    const driverByRoute = {};
    const vehicleByRoute = {};
    for (const p of profiles) {
      const driver = p.userId
        ? {
            id: String(p.userId._id || p.userId.id),
            name: p.userId.name || '',
            phone: p.userId.phone || '',
            photoUrl: p.userId.photoUrl || '',
          }
        : null;
      const vehicle =
        p.busId && typeof p.busId === 'object'
          ? { _id: String(p.busId._id), plate: p.busId.plate || '', label: p.busId.label || '' }
          : null;
      for (const rid of p.assignedRouteIds || []) {
        const key = String(rid);
        if (driver) {
          if (!driverByRoute[key]) driverByRoute[key] = driver;
          else extraDrivers[key] = (extraDrivers[key] || 0) + 1;
        }
        if (vehicle && !vehicleByRoute[key]) vehicleByRoute[key] = vehicle;
      }
    }
    for (const sch of schedules) {
      const key = String(sch.routeId);
      if (!driverByRoute[key] && sch.driverId) {
        const d = sch.driverId;
        driverByRoute[key] = {
          id: String(d._id || d.id),
          name: d.name || '',
          phone: d.phone || '',
          photoUrl: d.photoUrl || '',
        };
      }
      if (!vehicleByRoute[key] && sch.busId && typeof sch.busId === 'object') {
        vehicleByRoute[key] = {
          _id: String(sch.busId._id),
          plate: sch.busId.plate || '',
          label: sch.busId.label || '',
        };
      }
    }

    const sinceMonth = monthStart();
    let active = 0;
    let addedThisMonth = 0;
    let durationSum = 0;
    let durationCount = 0;
    let addedStopsThisMonth = 0;
    let addedStudentsThisMonth = 0;
    const list = routes.map((r) => {
      const key = String(r._id);
      const routeStops = stopsByRoute[key] || [];
      if (r.active !== false) active += 1;
      if (r.createdAt && r.createdAt >= sinceMonth) addedThisMonth += 1;
      if (r.estimatedMinutes > 0) {
        durationSum += r.estimatedMinutes;
        durationCount += 1;
      }
      const json = r.toObject();
      json.stopCount = routeStops.length;
      json.studentCount = kidsByRoute[key] || 0;
      json.path = routePathLabel(routeStops);
      json.driver = driverByRoute[key] || null;
      json.extraDrivers = extraDrivers[key] || 0;
      json.vehicle = vehicleByRoute[key] || null;
      return json;
    });
    for (const s of stops) {
      if (s.createdAt && s.createdAt >= sinceMonth) addedStopsThisMonth += 1;
    }
    for (const k of kids) {
      if (k.createdAt && k.createdAt >= sinceMonth) addedStudentsThisMonth += 1;
    }

    res.json({
      routes: list,
      stats: {
        total: routes.length,
        active,
        addedThisMonth,
        totalStops: stops.length,
        addedStopsThisMonth,
        studentsAssigned: kids.length,
        addedStudentsThisMonth,
        avgDurationMinutes: durationCount ? Math.round(durationSum / durationCount) : null,
      },
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/routes', async (req, res) => {
  try {
    let schoolId = resolveSchoolId(req);
    if (req.user.role === 'super_admin') schoolId = req.body.schoolId || schoolId;
    if (!schoolId) return res.status(400).json({ error: 'schoolId is required' });

    const route = await Route.create({
      schoolId,
      name: req.body.name,
      description: req.body.description || '',
      code: req.body.code || '',
      estimatedMinutes: Number.isFinite(Number(req.body.estimatedMinutes)) && Number(req.body.estimatedMinutes) >= 0
        ? Number(req.body.estimatedMinutes)
        : null,
      active: req.body.active !== false,
    });
    res.status(201).json({ route });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.get('/routes/:id', async (req, res) => {
  try {
    if (!/^[a-f0-9]{24}$/i.test(String(req.params.id || ''))) {
      return res.status(400).json({ error: 'Invalid route' });
    }
    const route = await Route.findById(req.params.id).populate('schoolId', 'name');
    if (!route) return res.status(404).json({ error: 'Route not found' });
    if (!assertSchoolAccess(req, route.schoolId?._id || route.schoolId)) {
      return res.status(403).json({ error: 'Cannot view route from another school' });
    }

    const { start: todayStart, end: todayEnd } = dayBounds();
    const sinceMonth = monthStart();

    const [stops, kids, profiles, schedules, monthTrips, todayTrips, recentTrips, siblings] = await Promise.all([
      Stop.find({ routeId: route._id }).sort({ order: 1, name: 1 }),
      Kid.find({ routeId: route._id })
        .populate('homeStopId', 'name')
        .select('name photoUrl grade section admissionNo active homeStopId createdAt')
        .sort({ name: 1 }),
      DriverProfile.find({ assignedRouteIds: route._id })
        .populate('userId', 'name phone photoUrl')
        .populate('busId', 'plate label'),
      TripSchedule.find({ routeId: route._id })
        .populate('driverId', 'name phone photoUrl')
        .populate('busId', 'plate label')
        .sort({ scheduledTime: 1, name: 1 }),
      Trip.find({
        routeId: route._id,
        $or: [
          { serviceDate: { $gte: sinceMonth } },
          { scheduledFor: { $gte: sinceMonth } },
          { startedAt: { $gte: sinceMonth } },
        ],
      }).select('status kidIds'),
      Trip.find({
        routeId: route._id,
        $or: [
          { serviceDate: { $gte: todayStart, $lte: todayEnd } },
          { scheduledFor: { $gte: todayStart, $lte: todayEnd } },
        ],
      })
        .populate('driverId', 'name')
        .populate('busId', 'plate label')
        .sort({ scheduledFor: 1, startedAt: 1 }),
      Trip.find({ routeId: route._id })
        .populate('driverId', 'name')
        .populate('busId', 'plate label')
        .sort({ serviceDate: -1, scheduledFor: -1, startedAt: -1, createdAt: -1 })
        .limit(12),
      Route.find(schoolFilter(req)).select('_id').sort({ name: 1 }),
    ]);

    const serializeTrip = (t) => ({
      id: String(t._id),
      status: t.status,
      direction: t.direction,
      period: t.period || '',
      tripCode: t.tripCode || '',
      scheduledFor: t.scheduledFor || null,
      startedAt: t.startedAt || null,
      endedAt: t.endedAt || null,
      serviceDate: t.serviceDate || null,
      driverName: t.driverId?.name || '',
      busLabel:
        t.busId && typeof t.busId === 'object'
          ? [t.busId.label, t.busId.plate].filter(Boolean).join(' · ')
          : '',
      kidCount: Array.isArray(t.kidIds) ? t.kidIds.length : 0,
    });

    const serializeSchedule = (s) => ({
      id: String(s._id),
      name: s.name || '',
      active: s.active !== false,
      scheduleType: s.scheduleType,
      customDays: s.customDays || [],
      period: s.period || '',
      direction: s.direction || '',
      scheduledTime: s.scheduledTime || '',
      startDate: s.startDate || null,
      endDate: s.endDate || null,
      appliesToday: scheduleAppliesOn(s, todayStart),
      driverId: s.driverId?._id ? String(s.driverId._id) : '',
      driverName: s.driverId?.name || '',
      driverPhone: s.driverId?.phone || '',
      busId: s.busId?._id ? String(s.busId._id) : '',
      busLabel:
        s.busId && typeof s.busId === 'object'
          ? [s.busId.label, s.busId.plate].filter(Boolean).join(' · ')
          : '',
      kidCount: Array.isArray(s.kidIds) ? s.kidIds.length : 0,
    });

    const extraDrivers = Math.max(0, profiles.length - 1);
    let driver = null;
    let vehicle = null;
    for (const p of profiles) {
      if (!driver && p.userId) {
        driver = {
          id: String(p.userId._id || p.userId.id),
          name: p.userId.name || '',
          phone: p.userId.phone || '',
          photoUrl: p.userId.photoUrl || '',
        };
      }
      if (!vehicle && p.busId && typeof p.busId === 'object') {
        vehicle = { _id: String(p.busId._id), plate: p.busId.plate || '', label: p.busId.label || '' };
      }
    }
    if (!driver || !vehicle) {
      for (const sch of schedules) {
        if (!driver && sch.driverId) {
          driver = {
            id: String(sch.driverId._id || sch.driverId.id),
            name: sch.driverId.name || '',
            phone: sch.driverId.phone || '',
            photoUrl: sch.driverId.photoUrl || '',
          };
        }
        if (!vehicle && sch.busId && typeof sch.busId === 'object') {
          vehicle = {
            _id: String(sch.busId._id),
            plate: sch.busId.plate || '',
            label: sch.busId.label || '',
          };
        }
      }
    }

    const schoolStop = stops.find((s) => s.type === 'school');
    const firstHome = stops.find((s) => s.type === 'home') || stops[0] || null;
    const endStop = schoolStop || stops[stops.length - 1] || null;
    const assignedKids = kids.filter((k) => k.active !== false);
    const idx = siblings.findIndex((r) => String(r._id) === String(route._id));

    const monthStatus = { trips: 0, completed: 0, cancelled: 0, scheduled: 0, active: 0 };
    for (const t of monthTrips) {
      monthStatus.trips += 1;
      if (t.status === 'completed') monthStatus.completed += 1;
      else if (t.status === 'cancelled') monthStatus.cancelled += 1;
      else if (t.status === 'scheduled') monthStatus.scheduled += 1;
      else if (t.status === 'active') monthStatus.active += 1;
    }

    res.json({
      route: {
        ...route.toObject(),
        path: routePathLabel(stops),
        startName: firstHome?.name || '',
        endName: endStop && String(endStop._id) !== String(firstHome?._id) ? endStop.name : '',
        stopCount: stops.length,
        studentCount: assignedKids.length,
        driver,
        extraDrivers,
        vehicle,
      },
      schoolName: route.schoolId?.name || '',
      stops,
      students: kids.map((k) => ({
        id: String(k._id),
        name: k.name || '',
        photoUrl: k.photoUrl || '',
        grade: k.grade || '',
        section: k.section || '',
        admissionNo: k.admissionNo || '',
        active: k.active !== false,
        homeStopName: k.homeStopId?.name || '',
      })),
      schedules: schedules.map(serializeSchedule),
      todayTrips: todayTrips.map(serializeTrip),
      recentTrips: recentTrips.map(serializeTrip),
      monthStats: {
        ...monthStatus,
        studentsAssigned: assignedKids.length,
      },
      neighbors: {
        index: idx < 0 ? 0 : idx,
        total: siblings.length,
        prevId: idx > 0 ? String(siblings[idx - 1]._id) : '',
        nextId: idx >= 0 && idx < siblings.length - 1 ? String(siblings[idx + 1]._id) : '',
      },
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.put('/routes/:id', async (req, res) => {
  try {
    const existing = await Route.findById(req.params.id);
    if (!existing) return res.status(404).json({ error: 'Route not found' });
    if (!assertSchoolAccess(req, existing.schoolId)) {
      return res.status(403).json({ error: 'Cannot edit route from another school' });
    }
    const updates = {};
    if (req.body.name !== undefined) updates.name = req.body.name;
    if (req.body.description !== undefined) updates.description = req.body.description;
    if (req.body.code !== undefined) updates.code = String(req.body.code || '').trim();
    if (req.body.active !== undefined) updates.active = req.body.active;
    if (req.body.estimatedMinutes !== undefined) {
      const mins =
        req.body.estimatedMinutes === '' || req.body.estimatedMinutes == null
          ? null
          : Number(req.body.estimatedMinutes);
      updates.estimatedMinutes = mins != null && Number.isFinite(mins) && mins >= 0 ? mins : null;
    }
    const route = await Route.findByIdAndUpdate(req.params.id, updates, { new: true });
    res.json({ route });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.delete('/routes/:id', async (req, res) => {
  const existing = await Route.findById(req.params.id);
  if (!existing) return res.status(404).json({ error: 'Route not found' });
  if (!assertSchoolAccess(req, existing.schoolId)) {
    return res.status(403).json({ error: 'Cannot delete route from another school' });
  }
  await Stop.deleteMany({ routeId: req.params.id });
  await Route.findByIdAndDelete(req.params.id);
  res.json({ ok: true });
});

// ——— Stops ———
router.get('/stops', async (req, res) => {
  try {
    const routes = await Route.find(schoolFilter(req)).sort({ name: 1 });
    const routeIds = routes.map((r) => r._id);
    const PIN_COLORS = ['#5d3fd3', '#0ea5e9', '#16a34a', '#f97316', '#e11d48', '#14b8a6'];
    const colorByRoute = {};
    routes.forEach((r, i) => {
      colorByRoute[String(r._id)] = PIN_COLORS[i % PIN_COLORS.length];
    });

    const [stops, kids, profiles, schedules] = await Promise.all([
      routeIds.length ? Stop.find({ routeId: { $in: routeIds } }).sort({ order: 1, name: 1 }) : [],
      Kid.find({ ...schoolFilter(req), active: { $ne: false } }).select('routeId homeStopId createdAt'),
      routeIds.length
        ? DriverProfile.find({ assignedRouteIds: { $in: routeIds } }).populate('busId', 'plate label')
        : [],
      routeIds.length
        ? TripSchedule.find({ routeId: { $in: routeIds }, active: { $ne: false } }).populate('busId', 'plate label')
        : [],
    ]);

    const routeIdSet = new Set(routeIds.map(String));
    const stopIdSet = new Set(stops.map((s) => String(s._id)));

    const busRoutes = new Set();
    for (const p of profiles) {
      if (!p.busId) continue;
      for (const rid of p.assignedRouteIds || []) busRoutes.add(String(rid));
    }
    for (const sch of schedules) {
      if (sch.busId) busRoutes.add(String(sch.routeId));
    }

    const homeCount = {};
    const routeKidIds = {};
    const studentIds = new Set();
    let addedStudentsThisMonth = 0;
    const sinceMonth = monthStart();
    for (const k of kids) {
      const kidId = String(k._id);
      const rid = k.routeId ? String(k.routeId) : '';
      const hid = k.homeStopId ? String(k.homeStopId) : '';
      const onRoute = rid && routeIdSet.has(rid);
      const onStop = hid && stopIdSet.has(hid);
      if (!onRoute && !onStop) continue;
      studentIds.add(kidId);
      if (onRoute) {
        if (!routeKidIds[rid]) routeKidIds[rid] = new Set();
        routeKidIds[rid].add(kidId);
      }
      if (onStop) homeCount[hid] = (homeCount[hid] || 0) + 1;
      if (k.createdAt && k.createdAt >= sinceMonth) addedStudentsThisMonth += 1;
    }

    const byRoute = {};
    for (const s of stops) {
      const key = String(s.routeId);
      if (!byRoute[key]) byRoute[key] = [];
      byRoute[key].push(s);
    }
    const startIds = new Set();
    const endIds = new Set();
    for (const list of Object.values(byRoute)) {
      const first = list.find((s) => s.type === 'home') || list[0];
      const school = list.find((s) => s.type === 'school');
      const last = school || list[list.length - 1];
      if (first) startIds.add(String(first._id));
      if (last && String(last._id) !== String(first?._id)) endIds.add(String(last._id));
    }

    const routeName = Object.fromEntries(routes.map((r) => [String(r._id), r.name]));
    const routeActive = Object.fromEntries(routes.map((r) => [String(r._id), r.active !== false]));

    let active = 0;
    let addedThisMonth = 0;
    let withBus = 0;
    const areaCounts = {};
    const typeCounts = { home: 0, school: 0 };
    const busiest = [];
    const alerts = [];
    let missingAddress = 0;
    let inactiveRouteStops = 0;
    let emptyHomes = 0;

    const list = stops.map((s) => {
      const rid = String(s.routeId);
      const id = String(s._id);
      const isStart = startIds.has(id);
      const isEnd = endIds.has(id);
      const studentCount =
        s.type === 'school' ? routeKidIds[rid]?.size || 0 : homeCount[id] || 0;
      const stopActive = s.active !== false && routeActive[rid] !== false;
      if (stopActive) active += 1;
      if (s.createdAt && s.createdAt >= sinceMonth) addedThisMonth += 1;
      if (busRoutes.has(rid)) withBus += 1;
      if (s.area) areaCounts[s.area] = (areaCounts[s.area] || 0) + 1;
      typeCounts[s.type === 'school' ? 'school' : 'home'] += 1;
      if (!s.address) missingAddress += 1;
      if (routeActive[rid] === false) inactiveRouteStops += 1;
      if (s.type === 'home' && !studentCount) emptyHomes += 1;
      busiest.push({ id, name: s.name, routeName: routeName[rid] || '', studentCount });
      return {
        ...s.toObject(),
        routeName: routeName[rid] || '',
        routeActive: routeActive[rid] !== false,
        studentCount,
        hasBus: busRoutes.has(rid),
        pinColor: colorByRoute[rid] || PIN_COLORS[0],
        kind: isStart ? 'start' : isEnd ? 'end' : s.type === 'school' ? 'school' : '',
      };
    });

    busiest.sort((a, b) => b.studentCount - a.studentCount);
    if (emptyHomes) {
      alerts.push({
        tone: 'warn',
        text: `${emptyHomes} home stop${emptyHomes === 1 ? '' : 's'} have no students assigned`,
      });
    }
    if (inactiveRouteStops) {
      alerts.push({
        tone: 'warn',
        text: `${inactiveRouteStops} stop${inactiveRouteStops === 1 ? '' : 's'} sit on an inactive route`,
      });
    }
    if (missingAddress) {
      alerts.push({
        tone: 'muted',
        text: `${missingAddress} stop${missingAddress === 1 ? '' : 's'} have no address saved`,
      });
    }

    const areasFilled = Object.keys(areaCounts).length;
    res.json({
      stops: list,
      routes: routes.map((r) => ({
        _id: String(r._id),
        name: r.name,
        active: r.active !== false,
        pinColor: colorByRoute[String(r._id)],
      })),
      stats: {
        total: stops.length,
        active,
        addedThisMonth,
        studentsAssigned: studentIds.size,
        addedStudentsThisMonth,
        withBus,
        avgWaitMinutes: null,
      },
      busiest: busiest.filter((s) => s.studentCount > 0).slice(0, 5),
      breakdown: areasFilled
        ? { kind: 'area', items: Object.entries(areaCounts).map(([label, count]) => ({ label, count })) }
        : {
            kind: 'type',
            items: [
              { label: 'Home', count: typeCounts.home },
              { label: 'School', count: typeCounts.school },
            ].filter((i) => i.count > 0),
          },
      alerts: alerts.slice(0, 6),
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/stops', async (req, res) => {
  try {
    const route = await Route.findById(req.body.routeId);
    if (!route) return res.status(404).json({ error: 'Route not found' });
    if (!assertSchoolAccess(req, route.schoolId)) {
      return res.status(403).json({ error: 'Cannot add stop to another school' });
    }
    const order =
      Number.isFinite(Number(req.body.order)) && Number(req.body.order) >= 0
        ? Number(req.body.order)
        : (await Stop.countDocuments({ routeId: route._id })) + 1;
    const stop = await Stop.create({
      routeId: route._id,
      name: req.body.name,
      type: req.body.type === 'school' ? 'school' : 'home',
      order,
      location: req.body.location,
      address: req.body.address || '',
      area: req.body.area || '',
      active: req.body.active !== false,
    });
    res.status(201).json({ stop });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.get('/routes/:routeId/stops', async (req, res) => {
  const route = await Route.findById(req.params.routeId);
  if (!route) return res.status(404).json({ error: 'Route not found' });
  if (!assertSchoolAccess(req, route.schoolId)) {
    return res.status(403).json({ error: 'Cannot view stops from another school' });
  }
  const stops = await Stop.find({ routeId: req.params.routeId }).sort({ order: 1 });
  res.json({ stops });
});

router.post('/routes/:routeId/stops', async (req, res) => {
  try {
    const route = await Route.findById(req.params.routeId);
    if (!route) return res.status(404).json({ error: 'Route not found' });
    if (!assertSchoolAccess(req, route.schoolId)) {
      return res.status(403).json({ error: 'Cannot add stop to another school' });
    }
    const stop = await Stop.create({
      routeId: req.params.routeId,
      name: req.body.name,
      type: req.body.type,
      order: req.body.order,
      location: req.body.location,
      address: req.body.address || '',
      area: req.body.area || '',
      active: req.body.active !== false,
    });
    res.status(201).json({ stop });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.put('/stops/:id', async (req, res) => {
  try {
    const stop = await Stop.findById(req.params.id);
    if (!stop) return res.status(404).json({ error: 'Stop not found' });
    const route = await Route.findById(stop.routeId);
    if (!assertSchoolAccess(req, route?.schoolId)) {
      return res.status(403).json({ error: 'Cannot edit stop from another school' });
    }
    const updates = {};
    if (req.body.name !== undefined) updates.name = req.body.name;
    if (req.body.type !== undefined) updates.type = req.body.type === 'school' ? 'school' : 'home';
    if (req.body.order !== undefined) {
      const order = Number(req.body.order);
      updates.order = Number.isFinite(order) && order >= 0 ? order : stop.order;
    }
    if (req.body.location !== undefined) updates.location = req.body.location;
    if (req.body.address !== undefined) updates.address = String(req.body.address || '').trim();
    if (req.body.area !== undefined) updates.area = String(req.body.area || '').trim();
    if (req.body.active !== undefined) updates.active = req.body.active;
    if (req.body.routeId !== undefined && String(req.body.routeId) !== String(stop.routeId)) {
      const nextRoute = await Route.findById(req.body.routeId);
      if (!nextRoute) return res.status(404).json({ error: 'Route not found' });
      if (!assertSchoolAccess(req, nextRoute.schoolId)) {
        return res.status(403).json({ error: 'Cannot move stop to another school' });
      }
      updates.routeId = nextRoute._id;
    }
    const updated = await Stop.findByIdAndUpdate(req.params.id, updates, { new: true });
    res.json({ stop: updated });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.delete('/stops/:id', async (req, res) => {
  const stop = await Stop.findById(req.params.id);
  if (!stop) return res.status(404).json({ error: 'Stop not found' });
  const route = await Route.findById(stop.routeId);
  if (!assertSchoolAccess(req, route?.schoolId)) {
    return res.status(403).json({ error: 'Cannot delete stop from another school' });
  }
  await Kid.updateMany({ homeStopId: stop._id }, { $unset: { homeStopId: 1 } });
  await Stop.findByIdAndDelete(req.params.id);
  res.json({ ok: true });
});

// ——— Parents ———
router.get('/parents', async (req, res) => {
  const parents = await User.find({ role: 'parent', ...schoolFilter(req) }).sort({ name: 1 });
  res.json({ parents: parents.map((p) => p.toSafeJSON()) });
});

router.post('/parents', async (req, res) => {
  try {
    let schoolId = resolveSchoolId(req);
    if (req.user.role === 'super_admin') schoolId = req.body.schoolId || schoolId;
    if (!schoolId) return res.status(400).json({ error: 'schoolId is required' });

    const { email, password, name, phone } = req.body;
    const passwordHash = await bcrypt.hash(password || 'parent123', 10);
    const parent = await User.create({
      email: email.toLowerCase().trim(),
      passwordHash,
      name,
      phone: phone || '',
      role: 'parent',
      schoolId,
    });
    res.status(201).json({ parent: parent.toSafeJSON() });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.put('/parents/:id', async (req, res) => {
  try {
    const existing = await User.findOne({ _id: req.params.id, role: 'parent' });
    if (!existing) return res.status(404).json({ error: 'Parent not found' });
    if (!assertSchoolAccess(req, existing.schoolId)) {
      return res.status(403).json({ error: 'Cannot edit parent from another school' });
    }

    const updates = { ...req.body };
    delete updates.password;
    delete updates.passwordHash;
    delete updates.role;
    delete updates.schoolId;
    if (req.body.password) {
      updates.passwordHash = await bcrypt.hash(req.body.password, 10);
    }
    const parent = await User.findByIdAndUpdate(req.params.id, updates, { new: true });
    res.json({ parent: parent.toSafeJSON() });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

function parseOptionalDate(value) {
  if (value === undefined) return undefined;
  if (!value) return null;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

function licenseStatusOf(expiry, today, soon) {
  if (!expiry) return 'missing';
  const d = new Date(expiry);
  d.setHours(0, 0, 0, 0);
  if (d < today) return 'expired';
  if (d <= soon) return 'expiring';
  return 'valid';
}

// ——— Drivers ———
router.get('/drivers', async (req, res) => {
  try {
    const users = await User.find({ role: 'driver', ...schoolFilter(req) }).sort({ name: 1 });
    const profiles = await DriverProfile.find({ userId: { $in: users.map((u) => u._id) } })
      .populate('assignedRouteIds', 'name')
      .populate('busId', 'plate label seats');
    const byUser = Object.fromEntries(profiles.map((p) => [p.userId.toString(), p]));
    const schoolId = resolveSchoolId(req);
    const { start, end } = dayBounds();
    const sinceMonth = monthStart();
    const dutyFilter = {
      serviceDate: { $gte: start, $lte: end },
      status: { $in: ['scheduled', 'active'] },
    };
    if (schoolId) dutyFilter.schoolId = schoolId;
    const dutyIds = await Trip.distinct('driverId', dutyFilter);
    const dutySet = new Set(dutyIds.map((id) => String(id)));

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const soon = new Date(today);
    soon.setDate(soon.getDate() + 30);

    let active = 0;
    let addedThisMonth = 0;
    let onDutyToday = 0;
    let withValidLicense = 0;
    let licenseExpiringSoon = 0;
    const drivers = users.map((u) => {
      const profile = byUser[u._id.toString()] || null;
      const licenseStatus = licenseStatusOf(profile?.licenseExpiry, today, soon);
      if (u.active !== false) active += 1;
      if (u.createdAt && u.createdAt >= sinceMonth) addedThisMonth += 1;
      if (u.active !== false && dutySet.has(String(u._id))) onDutyToday += 1;
      if (licenseStatus === 'valid' || licenseStatus === 'expiring') withValidLicense += 1;
      if (licenseStatus === 'expiring') licenseExpiringSoon += 1;
      return {
        ...u.toSafeJSON(),
        profile,
        licenseStatus,
        onDutyToday: dutySet.has(String(u._id)),
      };
    });

    res.json({
      drivers,
      stats: {
        total: users.length,
        active,
        inactive: users.length - active,
        addedThisMonth,
        onDutyToday,
        withValidLicense,
        licenseExpiringSoon,
      },
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/drivers/:id', async (req, res) => {
  try {
    if (!/^[a-f0-9]{24}$/i.test(String(req.params.id || ''))) {
      return res.status(400).json({ error: 'Invalid driver' });
    }
    const driver = await User.findOne({ _id: req.params.id, role: 'driver' }).populate('schoolId', 'name');
    if (!driver) return res.status(404).json({ error: 'Driver not found' });
    if (!assertSchoolAccess(req, driver.schoolId?._id || driver.schoolId)) {
      return res.status(403).json({ error: 'Cannot view driver from another school' });
    }

    const profile = await DriverProfile.findOne({ userId: driver._id })
      .populate('assignedRouteIds', 'name')
      .populate('busId', 'plate label seats model color');

    const { start } = dayBounds();
    const monday = weekStart();
    const friday = new Date(monday);
    friday.setDate(monday.getDate() + 4);
    friday.setHours(23, 59, 59, 999);

    const weekTrips = await Trip.find({
      driverId: driver._id,
      $or: [
        { serviceDate: { $gte: monday, $lte: friday } },
        { scheduledFor: { $gte: monday, $lte: friday } },
      ],
    })
      .populate('routeId', 'name')
      .populate('busId', 'plate label')
      .sort({ scheduledFor: 1, startedAt: 1, createdAt: 1 });

    const dateKey = (value) => {
      if (!value) return '';
      const d = new Date(value);
      if (Number.isNaN(d.getTime())) return '';
      return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    };

    const serializeTrip = (t) => ({
      id: String(t._id),
      status: t.status,
      direction: t.direction,
      period: t.period || '',
      tripCode: t.tripCode || '',
      scheduledFor: t.scheduledFor || null,
      startedAt: t.startedAt || null,
      endedAt: t.endedAt || null,
      serviceDate: t.serviceDate || null,
      routeName: t.routeId?.name || '',
      busLabel:
        t.busId && typeof t.busId === 'object'
          ? [t.busId.plate, t.busId.label].filter(Boolean).join(' · ')
          : '',
    });

    const todayKey = dateKey(start);
    const todaySchedule = weekTrips
      .filter((t) => {
        const key = dateKey(t.serviceDate) || dateKey(t.scheduledFor) || dateKey(t.startedAt);
        return key === todayKey || (t.status === 'active' && dateKey(t.startedAt) === todayKey);
      })
      .map(serializeTrip);

    const week = [];
    for (let i = 0; i < 5; i += 1) {
      const d = new Date(monday);
      d.setDate(monday.getDate() + i);
      const key = dateKey(d);
      const dayTrips = weekTrips.filter(
        (t) => dateKey(t.serviceDate) === key || dateKey(t.scheduledFor) === key
      );
      const statuses = [...new Set(dayTrips.map((t) => t.status))];
      week.push({
        date: key,
        weekday: d.toLocaleDateString(undefined, { weekday: 'short' }),
        tripCount: dayTrips.length,
        status: statuses.length === 1 ? statuses[0] : statuses.length ? 'mixed' : '',
      });
    }

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const soon = new Date(today);
    soon.setDate(soon.getDate() + 30);

    res.json({
      driver: driver.toSafeJSON(),
      schoolName: driver.schoolId?.name || '',
      profile,
      licenseStatus: licenseStatusOf(profile?.licenseExpiry, today, soon),
      todaySchedule,
      week,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/drivers', async (req, res) => {
  try {
    let schoolId = resolveSchoolId(req);
    if (req.user.role === 'super_admin') schoolId = req.body.schoolId || schoolId;
    if (!schoolId) return res.status(400).json({ error: 'schoolId is required' });

    const {
      email,
      password,
      name,
      phone,
      vehiclePlate,
      vehicleModel,
      vehicleColor,
      assignedRouteIds,
      busId,
      licenseNumber,
      licenseExpiry,
      employeeId,
    } = req.body;
    if (!email || !name) return res.status(400).json({ error: 'name and email are required' });
    const passwordHash = await bcrypt.hash(password || 'driver123', 10);
    const user = await User.create({
      email: email.toLowerCase().trim(),
      passwordHash,
      name,
      phone: phone || '',
      role: 'driver',
      schoolId,
      photoUrl: req.body.photoUrl || '',
      photoPublicId: req.body.photoPublicId || '',
      employeeId: employeeId || '',
    });
    const profile = await DriverProfile.create({
      userId: user._id,
      vehiclePlate: vehiclePlate || '',
      vehicleModel: vehicleModel || '',
      vehicleColor: vehicleColor || '',
      assignedRouteIds: assignedRouteIds || [],
      busId: busId || null,
      licenseNumber: licenseNumber || '',
      licenseExpiry: parseOptionalDate(licenseExpiry) || null,
    });
    res.status(201).json({ driver: { ...user.toSafeJSON(), profile } });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.put('/drivers/:id', async (req, res) => {
  try {
    const existing = await User.findOne({ _id: req.params.id, role: 'driver' });
    if (!existing) return res.status(404).json({ error: 'Driver not found' });
    if (!assertSchoolAccess(req, existing.schoolId)) {
      return res.status(403).json({ error: 'Cannot edit driver from another school' });
    }

    const updates = {};
    if (req.body.name !== undefined) updates.name = req.body.name;
    if (req.body.phone !== undefined) updates.phone = req.body.phone;
    if (req.body.active !== undefined) updates.active = req.body.active;
    if (req.body.employeeId !== undefined) updates.employeeId = String(req.body.employeeId || '').trim();
    if (req.body.email) {
      const email = req.body.email.toLowerCase().trim();
      const taken = await User.findOne({ email, _id: { $ne: existing._id } });
      if (taken) return res.status(400).json({ error: 'That email is already in use' });
      updates.email = email;
    }
    if (req.body.password) {
      updates.passwordHash = await bcrypt.hash(req.body.password, 10);
    }
    if (req.body.photoUrl !== undefined) updates.photoUrl = req.body.photoUrl || '';
    if (req.body.photoPublicId !== undefined) updates.photoPublicId = req.body.photoPublicId || '';
    const user = await User.findByIdAndUpdate(req.params.id, updates, { new: true });

    const profileUpdates = {};
    if (req.body.vehiclePlate != null) profileUpdates.vehiclePlate = req.body.vehiclePlate;
    if (req.body.vehicleModel != null) profileUpdates.vehicleModel = req.body.vehicleModel;
    if (req.body.vehicleColor != null) profileUpdates.vehicleColor = req.body.vehicleColor;
    if (req.body.assignedRouteIds != null) profileUpdates.assignedRouteIds = req.body.assignedRouteIds;
    if (req.body.busId !== undefined) profileUpdates.busId = req.body.busId || null;
    if (req.body.licenseNumber !== undefined) profileUpdates.licenseNumber = String(req.body.licenseNumber || '').trim();
    if (req.body.licenseExpiry !== undefined) profileUpdates.licenseExpiry = parseOptionalDate(req.body.licenseExpiry) || null;

    const profile = await DriverProfile.findOneAndUpdate({ userId: user._id }, profileUpdates, {
      new: true,
      upsert: true,
    })
      .populate('assignedRouteIds', 'name')
      .populate('busId', 'plate label seats');

    res.json({ driver: { ...user.toSafeJSON(), profile } });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.delete('/drivers/:id', async (req, res) => {
  const existing = await User.findOne({ _id: req.params.id, role: 'driver' });
  if (!existing) return res.status(404).json({ error: 'Driver not found' });
  if (!assertSchoolAccess(req, existing.schoolId)) {
    return res.status(403).json({ error: 'Cannot delete driver from another school' });
  }
  await DriverProfile.deleteOne({ userId: existing._id });
  await User.findByIdAndDelete(existing._id);
  res.json({ ok: true });
});

// ——— Teachers ———
router.get('/teachers', async (req, res) => {
  try {
    const filter = { role: 'teacher', ...schoolFilter(req) };
    const teachers = await User.find(filter).sort({ name: 1 });
    const schoolId = resolveSchoolId(req);
    const { start, end } = dayBounds();
    const sinceMonth = monthStart();
    const dutyFilter = { date: { $gte: start, $lte: end } };
    if (schoolId) dutyFilter.schoolId = schoolId;
    const dutyIds = await AttendanceRecord.distinct('teacherId', dutyFilter);
    const dutySet = new Set(dutyIds.map((id) => String(id)));

    let active = 0;
    let female = 0;
    let male = 0;
    let addedThisMonth = 0;
    let onDutyToday = 0;
    for (const t of teachers) {
      if (t.active !== false) active += 1;
      if (t.gender === 'female') female += 1;
      if (t.gender === 'male') male += 1;
      if (t.createdAt && t.createdAt >= sinceMonth) addedThisMonth += 1;
      if (t.active !== false && dutySet.has(String(t._id))) onDutyToday += 1;
    }

    res.json({
      teachers: teachers.map((t) => t.toSafeJSON()),
      stats: {
        total: teachers.length,
        active,
        inactive: teachers.length - active,
        addedThisMonth,
        onDutyToday,
        female,
        male,
      },
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/teachers/:id', async (req, res) => {
  try {
    if (!/^[a-f0-9]{24}$/i.test(String(req.params.id || ''))) {
      return res.status(400).json({ error: 'Invalid teacher' });
    }
    const teacher = await User.findOne({ _id: req.params.id, role: 'teacher' }).populate('schoolId', 'name');
    if (!teacher) return res.status(404).json({ error: 'Teacher not found' });
    if (!assertSchoolAccess(req, teacher.schoolId?._id || teacher.schoolId)) {
      return res.status(403).json({ error: 'Cannot view teacher from another school' });
    }

    const schoolId = teacher.schoolId?._id || teacher.schoolId;
    const classes = schoolId
      ? await SchoolClass.find({ schoolId, teacherId: teacher._id, active: { $ne: false } }).sort({ grade: 1, section: 1 })
      : [];

    const subjects = [];
    const seen = new Set();
    for (const c of classes) {
      for (const s of c.subjects || []) {
        const name = String(s.name || '').trim();
        if (!name || seen.has(name.toLowerCase())) continue;
        seen.add(name.toLowerCase());
        subjects.push(name);
      }
    }

    const dayName = new Date().toLocaleDateString('en-US', { weekday: 'long' });
    const now = new Date();
    const nowMins = now.getHours() * 60 + now.getMinutes();
    const schedule = [];
    for (const c of classes) {
      for (const slot of c.timetable || []) {
        if (slot.day !== dayName || slot.kind === 'break' || slot.kind === 'lunch') continue;
        const [sh, sm] = String(slot.startTime || '00:00').split(':').map(Number);
        const [eh, em] = String(slot.endTime || '00:00').split(':').map(Number);
        const startMins = (Number.isFinite(sh) ? sh : 0) * 60 + (Number.isFinite(sm) ? sm : 0);
        const endMins = (Number.isFinite(eh) ? eh : 0) * 60 + (Number.isFinite(em) ? em : 0);
        schedule.push({
          startTime: slot.startTime || '',
          endTime: slot.endTime || '',
          subject: slot.subject || '',
          room: slot.room || '',
          className: [c.grade, c.section].filter(Boolean).join(' ') || c.classCode || 'Class',
          ongoing: nowMins >= startMins && nowMins < endMins,
        });
      }
    }
    schedule.sort((a, b) => String(a.startTime).localeCompare(String(b.startTime)));

    const monday = new Date();
    const weekday = (monday.getDay() + 6) % 7;
    monday.setDate(monday.getDate() - weekday);
    monday.setHours(0, 0, 0, 0);
    const friday = new Date(monday);
    friday.setDate(monday.getDate() + 4);
    friday.setHours(23, 59, 59, 999);
    const marks = await AttendanceRecord.find({
      teacherId: teacher._id,
      date: { $gte: monday, $lte: friday },
    }).select('date');
    const markedDays = new Set(
      marks.map((m) => {
        const d = new Date(m.date);
        return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
      })
    );
    const register = [];
    for (let i = 0; i < 5; i += 1) {
      const d = new Date(monday);
      d.setDate(monday.getDate() + i);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
      register.push({
        date: key,
        weekday: d.toLocaleDateString(undefined, { weekday: 'short' }),
        marked: markedDays.has(key),
      });
    }

    res.json({
      teacher: teacher.toSafeJSON(),
      schoolName: teacher.schoolId?.name || '',
      classes: classes.map((c) => ({
        _id: c._id,
        grade: c.grade,
        section: c.section,
        classCode: c.classCode,
        classroom: c.classroom,
        role: 'Class Teacher',
      })),
      subjects,
      schedule,
      register,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/teachers', async (req, res) => {
  try {
    let schoolId = resolveSchoolId(req);
    if (req.user.role === 'super_admin') schoolId = req.body.schoolId || schoolId;
    if (!schoolId) return res.status(400).json({ error: 'schoolId is required' });

    const { email, password, name, phone, gender, department, qualification, employeeId, jobTitle, idNumber } = req.body;
    if (!email || !name) return res.status(400).json({ error: 'name and email are required' });
    const passwordHash = await bcrypt.hash(password || 'password123', 10);
    const allowedGender = ['', 'female', 'male', 'other'];
    const teacher = await User.create({
      email: email.toLowerCase().trim(),
      passwordHash,
      name,
      phone: phone || '',
      role: 'teacher',
      schoolId,
      photoUrl: req.body.photoUrl || '',
      photoPublicId: req.body.photoPublicId || '',
      gender: allowedGender.includes(gender) ? gender : '',
      department: department || '',
      qualification: qualification || '',
      employeeId: employeeId || '',
      jobTitle: jobTitle || '',
      idNumber: idNumber || '',
    });
    res.status(201).json({ teacher: teacher.toSafeJSON() });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.put('/teachers/:id', async (req, res) => {
  try {
    const existing = await User.findOne({ _id: req.params.id, role: 'teacher' });
    if (!existing) return res.status(404).json({ error: 'Teacher not found' });
    if (!assertSchoolAccess(req, existing.schoolId)) {
      return res.status(403).json({ error: 'Cannot edit teacher from another school' });
    }

    const updates = {};
    if (req.body.name !== undefined) updates.name = req.body.name;
    if (req.body.phone !== undefined) updates.phone = req.body.phone;
    if (req.body.active !== undefined) updates.active = req.body.active;
    if (req.body.email) {
      const email = req.body.email.toLowerCase().trim();
      const taken = await User.findOne({ email, _id: { $ne: existing._id } });
      if (taken) return res.status(400).json({ error: 'That email is already in use' });
      updates.email = email;
    }
    if (req.body.password) {
      updates.passwordHash = await bcrypt.hash(req.body.password, 10);
    }
    if (req.body.photoUrl !== undefined) updates.photoUrl = req.body.photoUrl || '';
    if (req.body.photoPublicId !== undefined) updates.photoPublicId = req.body.photoPublicId || '';
    if (req.body.gender !== undefined) {
      updates.gender = ['', 'female', 'male', 'other'].includes(req.body.gender) ? req.body.gender : existing.gender;
    }
    if (req.body.department !== undefined) updates.department = String(req.body.department || '').trim();
    if (req.body.qualification !== undefined) updates.qualification = String(req.body.qualification || '').trim();
    if (req.body.employeeId !== undefined) updates.employeeId = String(req.body.employeeId || '').trim();
    if (req.body.jobTitle !== undefined) updates.jobTitle = String(req.body.jobTitle || '').trim();
    if (req.body.idNumber !== undefined) updates.idNumber = String(req.body.idNumber || '').trim();
    const teacher = await User.findByIdAndUpdate(req.params.id, updates, { new: true });
    res.json({ teacher: teacher.toSafeJSON() });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.delete('/teachers/:id', async (req, res) => {
  const existing = await User.findOne({ _id: req.params.id, role: 'teacher' });
  if (!existing) return res.status(404).json({ error: 'Teacher not found' });
  if (!assertSchoolAccess(req, existing.schoolId)) {
    return res.status(403).json({ error: 'Cannot delete teacher from another school' });
  }
  await User.findByIdAndDelete(req.params.id);
  res.json({ ok: true });
});

// ——— Kids ———
router.get('/kids', async (req, res) => {
  try {
    const filter = schoolFilter(req);
    const kids = await Kid.find(filter)
      .populate('schoolId', 'name')
      .populate('routeId', 'name')
      .populate('homeStopId', 'name location address')
      .populate('parentIds', 'name email phone')
      .sort({ name: 1 });

    const activeTrips = await Trip.find({ ...filter, status: 'active' }).select('_id');
    const tripIds = activeTrips.map((t) => t._id);
    const events = tripIds.length
      ? await TripEvent.find({ tripId: { $in: tripIds } }).select('kidId type')
      : [];
    const riding = new Set();
    const dropped = new Set();
    for (const e of events) {
      if (!e.kidId) continue;
      const id = String(e.kidId);
      if (e.type === 'dropped_off') dropped.add(id);
      if (e.type === 'picked_up') riding.add(id);
    }
    for (const id of dropped) riding.delete(id);

    const sinceMonth = monthStart();
    const sinceWeek = weekStart();
    let active = 0;
    let inactive = 0;
    let withoutRoute = 0;
    let addedThisMonth = 0;
    let addedThisWeek = 0;
    let onBus = 0;
    for (const kid of kids) {
      if (kid.active === false) inactive += 1;
      else active += 1;
      if (!kid.routeId) withoutRoute += 1;
      if (kid.createdAt && kid.createdAt >= sinceMonth) addedThisMonth += 1;
      if (kid.createdAt && kid.createdAt >= sinceWeek) addedThisWeek += 1;
      if (riding.has(String(kid._id))) onBus += 1;
    }

    res.json({
      kids,
      stats: {
        total: kids.length,
        active,
        inactive,
        addedThisMonth,
        addedThisWeek,
        onBus,
        withoutRoute,
      },
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/kids/:id', async (req, res) => {
  try {
    if (!/^[a-f0-9]{24}$/i.test(String(req.params.id || ''))) {
      return res.status(400).json({ error: 'Invalid student' });
    }
    const kid = await Kid.findById(req.params.id)
      .populate('schoolId', 'name address')
      .populate('routeId', 'name')
      .populate('homeStopId', 'name address location type')
      .populate('parentIds', 'name email phone photoUrl');
    if (!kid) return res.status(404).json({ error: 'Student not found' });
    if (!assertSchoolAccess(req, kid.schoolId?._id || kid.schoolId)) {
      return res.status(403).json({ error: 'Cannot view student from another school' });
    }

    const schoolId = kid.schoolId?._id || kid.schoolId;
    const routeId = kid.routeId?._id || kid.routeId;
    const { start, end } = dayBounds();

    const monday = new Date();
    const weekday = (monday.getDay() + 6) % 7;
    monday.setDate(monday.getDate() - weekday);
    monday.setHours(0, 0, 0, 0);
    const friday = new Date(monday);
    friday.setDate(monday.getDate() + 4);
    friday.setHours(23, 59, 59, 999);

    const [klass, schedules, todayTrips, weekMarks, statement, notes, schoolStop] = await Promise.all([
      kid.grade
        ? SchoolClass.findOne({ schoolId, grade: kid.grade, active: { $ne: false } }).populate('teacherId', 'name')
        : null,
      routeId
        ? TripSchedule.find({ routeId, active: true })
            .populate('busId', 'plate label')
            .populate('driverId', 'name phone')
        : [],
      Trip.find({
        kidIds: kid._id,
        $or: [
          { serviceDate: { $gte: start, $lte: end } },
          { scheduledFor: { $gte: start, $lte: end } },
          { status: 'active' },
        ],
      })
        .populate('busId', 'plate label')
        .populate('driverId', 'name phone')
        .populate('routeId', 'name')
        .sort({ startedAt: -1, scheduledFor: -1 }),
      AttendanceRecord.find({ kidId: kid._id, date: { $gte: monday, $lte: friday } }).sort({ date: 1 }),
      FeeStatement.findOne({ kidId: kid._id }).sort({ updatedAt: -1, createdAt: -1 }),
      TeacherNote.find({ kidId: kid._id })
        .populate('teacherId', 'name')
        .sort({ createdAt: -1 })
        .limit(5)
        .select('title body category createdAt teacherId'),
      routeId ? Stop.findOne({ routeId, type: 'school' }).select('name address') : null,
    ]);

    const morning = schedules.find((s) => s.period === 'morning' || s.direction === 'to_school') || null;
    const afternoon = schedules.find((s) => s.period === 'afternoon' || s.direction === 'to_home') || null;
    const liveTrip = todayTrips.find((t) => t.status === 'active') || todayTrips[0] || null;
    const bus = liveTrip?.busId || morning?.busId || afternoon?.busId || null;
    const driver = liveTrip?.driverId || morning?.driverId || afternoon?.driverId || null;

    const todayEvents = liveTrip
      ? await TripEvent.find({ tripId: liveTrip._id, kidId: kid._id }).sort({ at: 1 })
      : [];
    const pickupEv = todayEvents.find((e) => e.type === 'picked_up');
    const dropEv = todayEvents.find((e) => e.type === 'dropped_off');
    const missEv = todayEvents.find((e) => e.type === 'not_picked_up');
    let todayStatus = 'none';
    let todayAt = null;
    if (dropEv) {
      todayStatus = 'dropped_off';
      todayAt = dropEv.at;
    } else if (pickupEv) {
      todayStatus = 'checked_in';
      todayAt = pickupEv.at;
    } else if (missEv) {
      todayStatus = 'missed';
      todayAt = missEv.at;
    } else if (liveTrip) {
      todayStatus = liveTrip.status === 'active' ? 'in_progress' : 'pending';
    }

    const marksByDay = new Map(
      weekMarks.map((m) => {
        const d = new Date(m.date);
        const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
        return [key, m.status];
      })
    );
    const attendance = [];
    for (let i = 0; i < 5; i += 1) {
      const d = new Date(monday);
      d.setDate(monday.getDate() + i);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
      attendance.push({
        date: key,
        weekday: d.toLocaleDateString(undefined, { weekday: 'short' }),
        status: marksByDay.get(key) || '',
      });
    }

    const payments = (statement?.payments || [])
      .slice()
      .sort((a, b) => new Date(b.at) - new Date(a.at))
      .slice(0, 4)
      .map((p) => ({
        _id: p._id,
        description: p.description,
        amount: p.amount,
        at: p.at,
        method: p.method || '',
        reference: p.reference || '',
      }));

    res.json({
      kid,
      classTeacher: klass?.teacherId?.name || klass?.assistantName || '',
      transport: {
        routeName: kid.routeId?.name || liveTrip?.routeId?.name || '',
        busLabel: bus?.plate || bus?.label || '',
        driverName: driver?.name || '',
        driverPhone: driver?.phone || '',
        pickupStop: kid.homeStopId?.name || '',
        dropoffStop: schoolStop?.name || kid.schoolId?.name || '',
        pickupTime: morning?.scheduledTime || '',
        dropoffTime: afternoon?.scheduledTime || '',
      },
      today: {
        status: todayStatus,
        at: todayAt,
        stopName: kid.homeStopId?.name || '',
        tripId: liveTrip?._id || null,
        tripActive: liveTrip?.status === 'active',
      },
      attendance,
      payments,
      notes: notes.map((n) => ({
        _id: n._id,
        title: n.title,
        body: n.body,
        category: n.category,
        at: n.createdAt,
        author: n.teacherId?.name || '',
      })),
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/kids', async (req, res) => {
  try {
    let schoolId = resolveSchoolId(req);
    if (req.user.role === 'super_admin') schoolId = req.body.schoolId || schoolId;
    if (!schoolId) return res.status(400).json({ error: 'schoolId is required' });

    const kid = await Kid.create({ ...req.body, schoolId });
    const populated = await Kid.findById(kid._id)
      .populate('schoolId', 'name')
      .populate('routeId', 'name')
      .populate('homeStopId', 'name location')
      .populate('parentIds', 'name email phone');
    res.status(201).json({ kid: populated });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

/** One-shot student onboarding: route + boarding map point + parent. */
router.post('/kids/onboard', async (req, res) => {
  try {
    let schoolId = resolveSchoolId(req);
    if (req.user.role === 'super_admin') schoolId = req.body.schoolId || schoolId;
    if (!schoolId) return res.status(400).json({ error: 'schoolId is required' });

    const {
      name,
      grade,
      section,
      admissionNo,
      gender,
      dateOfBirth,
      routeId,
      routeName,
      boarding,
      parent,
      parentIds,
    } = req.body;
    if (!name) return res.status(400).json({ error: 'name is required' });
    if (!boarding?.lat || !boarding?.lng) {
      return res.status(400).json({ error: 'boarding.lat and boarding.lng are required' });
    }

    let route;
    if (routeId) {
      route = await Route.findById(routeId);
      if (!route) return res.status(404).json({ error: 'Route not found' });
      if (route.schoolId.toString() !== schoolId.toString()) {
        return res.status(403).json({ error: 'Route belongs to another school' });
      }
    } else if (routeName) {
      route = await Route.create({
        schoolId,
        name: routeName,
        description: req.body.routeDescription || '',
      });
      // School stop at school location
      const school = await School.findById(schoolId);
      if (school?.location?.lat != null) {
        await Stop.create({
          routeId: route._id,
          name: `${school.name} Gate`,
          type: 'school',
          order: 0,
          location: { lat: school.location.lat, lng: school.location.lng },
        });
      }
    } else {
      return res.status(400).json({ error: 'routeId or routeName is required' });
    }

    const maxOrder = await Stop.findOne({ routeId: route._id }).sort({ order: -1 });
    const order = (maxOrder?.order ?? 0) + 1;
    const stop = await Stop.create({
      routeId: route._id,
      name: boarding.stopName || `${name} boarding`,
      type: 'home',
      order,
      location: { lat: Number(boarding.lat), lng: Number(boarding.lng) },
    });

    const linkedParentIds = [...(parentIds || [])];
    let createdParent = null;
    if (parent?.email && parent?.name && parent?.password) {
      const passwordHash = await bcrypt.hash(parent.password, 10);
      createdParent = await User.create({
        email: parent.email.toLowerCase().trim(),
        passwordHash,
        name: parent.name,
        phone: parent.phone || '',
        role: 'parent',
        schoolId,
      });
      linkedParentIds.push(createdParent._id);
    }

    if (!linkedParentIds.length) {
      return res.status(400).json({ error: 'Provide parentIds or parent { name, email, password }' });
    }

    const allowedGender = ['male', 'female', 'other'];
    const kid = await Kid.create({
      name,
      grade: grade || '',
      section: section || '',
      admissionNo: admissionNo || '',
      gender: allowedGender.includes(gender) ? gender : '',
      dateOfBirth: dateOfBirth || null,
      schoolId,
      routeId: route._id,
      homeStopId: stop._id,
      parentIds: linkedParentIds,
      photoUrl: req.body.photoUrl || '',
      photoPublicId: req.body.photoPublicId || '',
    });

    const populated = await Kid.findById(kid._id)
      .populate('schoolId', 'name')
      .populate('routeId', 'name')
      .populate('homeStopId', 'name location')
      .populate('parentIds', 'name email phone');

    res.status(201).json({
      kid: populated,
      route,
      stop,
      parent: createdParent ? createdParent.toSafeJSON() : null,
    });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.put('/kids/:id', async (req, res) => {
  try {
    const existing = await Kid.findById(req.params.id);
    if (!existing) return res.status(404).json({ error: 'Kid not found' });
    if (!assertSchoolAccess(req, existing.schoolId)) {
      return res.status(403).json({ error: 'Cannot edit kid from another school' });
    }

    const { boarding, routeName, ...rest } = req.body;
    const updates = { ...rest };
    delete updates.schoolId;
    delete updates.boarding;
    delete updates.routeName;
    delete updates.parent;
    if (updates.dateOfBirth === '') updates.dateOfBirth = null;
    if (updates.gender != null && !['', 'male', 'female', 'other'].includes(updates.gender)) {
      delete updates.gender;
    }

    let routeId = updates.routeId || existing.routeId;
    if (routeName && !updates.routeId) {
      const createdRoute = await Route.create({
        schoolId: existing.schoolId,
        name: routeName,
        description: '',
      });
      routeId = createdRoute._id;
      updates.routeId = routeId;
    }

    if (routeId) {
      const route = await Route.findById(routeId);
      if (!route) return res.status(404).json({ error: 'Route not found' });
      if (route.schoolId.toString() !== existing.schoolId.toString()) {
        return res.status(403).json({ error: 'Route belongs to another school' });
      }
      updates.routeId = routeId;
    }

    if (boarding?.lat != null && boarding?.lng != null && routeId) {
      const lat = Number(boarding.lat);
      const lng = Number(boarding.lng);
      const stopName = String(boarding.stopName || `${existing.name} boarding`).trim();
      const routeChanged = existing.routeId?.toString() !== String(routeId);

      let stop = existing.homeStopId ? await Stop.findById(existing.homeStopId) : null;
      const sharedCount = stop
        ? await Kid.countDocuments({ _id: { $ne: existing._id }, homeStopId: stop._id })
        : 0;
      const reuseStop = Boolean(stop) && !routeChanged && sharedCount === 0;

      if (reuseStop) {
        stop.name = stopName;
        stop.type = 'home';
        stop.routeId = routeId;
        stop.location = { lat, lng };
        await stop.save();
        updates.homeStopId = stop._id;
      } else {
        const maxOrder = await Stop.findOne({ routeId }).sort({ order: -1 });
        stop = await Stop.create({
          routeId,
          name: stopName,
          type: 'home',
          order: (maxOrder?.order ?? 0) + 1,
          location: { lat, lng },
        });
        updates.homeStopId = stop._id;
      }
    }

    const kid = await Kid.findByIdAndUpdate(req.params.id, updates, { new: true })
      .populate('schoolId', 'name')
      .populate('routeId', 'name')
      .populate('homeStopId', 'name location')
      .populate('parentIds', 'name email phone');
    res.json({ kid });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.delete('/kids/:id', async (req, res) => {
  const existing = await Kid.findById(req.params.id);
  if (!existing) return res.status(404).json({ error: 'Kid not found' });
  if (!assertSchoolAccess(req, existing.schoolId)) {
    return res.status(403).json({ error: 'Cannot delete kid from another school' });
  }
  await Kid.findByIdAndDelete(req.params.id);
  res.json({ ok: true });
});

// ——— Dispatch ———
router.get('/dispatch', async (req, res) => {
  try {
    const { start, end } = dayBounds(req.query.date);
    const filter = {
      ...schoolFilter(req),
      scheduledFor: { $gte: start, $lte: end },
    };
    const trips = await Trip.find(filter)
      .populate('routeId', 'name')
      .populate('busId', 'plate label seats')
      .populate('driverId', 'name email phone')
      .populate('kidIds', 'name grade')
      .sort({ sequence: 1, createdAt: 1 });
    res.json({ trips });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/dispatch/preview', async (req, res) => {
  try {
    const { routeId, busId } = req.body;
    if (!routeId || !busId) {
      return res.status(400).json({ error: 'routeId and busId are required' });
    }
    const route = await Route.findById(routeId);
    const bus = await Bus.findById(busId);
    if (!route || !bus) return res.status(404).json({ error: 'Route or bus not found' });
    if (!assertSchoolAccess(req, route.schoolId) || !assertSchoolAccess(req, bus.schoolId)) {
      return res.status(403).json({ error: 'Cross-school dispatch not allowed' });
    }

    const kids = await Kid.find({ routeId, active: true }).sort({ name: 1 });
    const seats = bus.seats;
    const tripCount = Math.max(1, Math.ceil(kids.length / seats) || 1);
    res.json({
      kidCount: kids.length,
      seats,
      tripCount: kids.length === 0 ? 0 : tripCount,
      kids: kids.map((k) => ({ id: k._id, name: k.name, grade: k.grade })),
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/dispatch', async (req, res) => {
  try {
    const { routeId, busId, driverId, direction, date } = req.body;
    if (!routeId || !busId || !driverId || !['to_school', 'to_home'].includes(direction)) {
      return res
        .status(400)
        .json({ error: 'routeId, busId, driverId, and valid direction are required' });
    }

    const route = await Route.findById(routeId);
    const bus = await Bus.findById(busId);
    const driver = await User.findOne({ _id: driverId, role: 'driver' });
    if (!route || !bus || !driver) {
      return res.status(404).json({ error: 'Route, bus, or driver not found' });
    }
    if (
      !assertSchoolAccess(req, route.schoolId) ||
      !assertSchoolAccess(req, bus.schoolId) ||
      !assertSchoolAccess(req, driver.schoolId)
    ) {
      return res.status(403).json({ error: 'Cross-school dispatch not allowed' });
    }
    if (
      route.schoolId.toString() !== bus.schoolId.toString() ||
      route.schoolId.toString() !== driver.schoolId?.toString()
    ) {
      return res.status(400).json({ error: 'Route, bus, and driver must belong to the same school' });
    }

    const kids = await Kid.find({ routeId, active: true }).sort({ name: 1 });
    if (!kids.length) {
      return res.status(400).json({ error: 'No active students on this route' });
    }

    const { day } = dayBounds(date);
    const groups = chunk(kids, bus.seats);
    const trips = [];
    for (let i = 0; i < groups.length; i += 1) {
      const trip = await Trip.create({
        routeId,
        busId,
        driverId,
        schoolId: route.schoolId,
        direction,
        status: 'scheduled',
        sequence: i + 1,
        scheduledFor: day,
        kidIds: groups[i].map((k) => k._id),
      });
      trips.push(trip);
    }

    const populated = await Trip.find({ _id: { $in: trips.map((t) => t._id) } })
      .populate('routeId', 'name')
      .populate('busId', 'plate label seats')
      .populate('driverId', 'name email phone')
      .populate('kidIds', 'name grade')
      .sort({ sequence: 1 });

    res.status(201).json({
      trips: populated,
      summary: {
        kidCount: kids.length,
        seats: bus.seats,
        tripCount: groups.length,
      },
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/announcements', async (req, res) => {
  try {
    const filter = { ...schoolFilter(req), active: true };
    const announcements = await Announcement.find(filter).sort({ publishedAt: -1 }).limit(200);
    res.json({ announcements });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/announcements', async (req, res) => {
  try {
    const schoolId = resolveSchoolId(req, { required: true });
    if (!schoolId) return res.status(400).json({ error: 'schoolId is required' });
    const { title, body, category, authorName, attachmentName, attachmentUrl, attachmentPublicId } =
      req.body || {};
    if (!title?.trim() || !body?.trim()) {
      return res.status(400).json({ error: 'title and body are required' });
    }
    const announcement = await Announcement.create({
      schoolId,
      title: title.trim(),
      body: body.trim(),
      category: ['general', 'class', 'transport', 'events', 'urgent'].includes(category)
        ? category
        : 'general',
      kind:
        category === 'urgent'
          ? 'important'
          : category === 'events'
            ? 'event'
            : category === 'transport'
              ? 'information'
              : 'general',
      icon:
        category === 'urgent'
          ? 'megaphone'
          : category === 'events'
            ? 'trophy'
            : category === 'transport'
              ? 'bus'
              : 'calendar',
      scope: 'school',
      audience: 'All Teachers, Parents & Students',
      authorName: authorName?.trim() || req.user.name || 'Admin',
      attachmentName: attachmentName || '',
      attachmentUrl: attachmentUrl || '',
      attachmentPublicId: attachmentPublicId || '',
      publishedAt: new Date(),
    });
    const teachers = await User.find({ schoolId, role: 'teacher', active: true }).select('_id');
    if (teachers.length) {
      await createAndEmitNotifications(
        getIO(),
        teachers.map((t) => ({
          userId: t._id,
          type: NOTIFICATION_TYPES.ANNOUNCEMENT,
          key: `announcement:${announcement._id}`,
          title: announcement.title,
          body: String(announcement.body || '').slice(0, 400),
          link: 'announcements',
        }))
      );
    }
    res.status(201).json({ announcement });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

function leaveDays(startDate, endDate) {
  const start = new Date(startDate);
  const end = new Date(endDate);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return 0;
  const ms = end.setHours(12, 0, 0, 0) - start.setHours(12, 0, 0, 0);
  return Math.max(1, Math.round(ms / 86400000) + 1);
}

router.get('/leave-requests/stats', async (req, res) => {
  try {
    const filter = schoolFilter(req);
    const [pending, approved, rejected, cancelled, total] = await Promise.all([
      LeaveRequest.countDocuments({ ...filter, status: 'pending' }),
      LeaveRequest.countDocuments({ ...filter, status: 'approved' }),
      LeaveRequest.countDocuments({ ...filter, status: 'rejected' }),
      LeaveRequest.countDocuments({ ...filter, status: 'cancelled' }),
      LeaveRequest.countDocuments(filter),
    ]);
    res.json({ stats: { pending, approved, rejected, cancelled, total } });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/leave-requests', async (req, res) => {
  try {
    const filter = schoolFilter(req);
    if (req.query.status) filter.status = req.query.status;
    if (req.query.leaveType) filter.leaveType = req.query.leaveType;
    if (req.query.from || req.query.to) {
      filter.startDate = {};
      if (req.query.from) filter.startDate.$gte = new Date(req.query.from);
      if (req.query.to) {
        const to = new Date(req.query.to);
        to.setHours(23, 59, 59, 999);
        filter.startDate.$lte = to;
      }
    }
    const requests = await LeaveRequest.find(filter)
      .populate('kidId', 'name grade house admissionNo')
      .populate('parentId', 'name phone email')
      .populate('reviewedBy', 'name email')
      .sort({ createdAt: -1 })
      .limit(200);
    res.json({
      requests: requests.map((r) => {
        const obj = r.toObject();
        return { ...obj, days: leaveDays(obj.startDate, obj.endDate) };
      }),
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.patch('/leave-requests/:id', async (req, res) => {
  try {
    const request = await LeaveRequest.findById(req.params.id);
    if (!request) return res.status(404).json({ error: 'Leave request not found' });
    if (!assertSchoolAccess(req, request.schoolId)) {
      return res.status(403).json({ error: 'Not allowed' });
    }
    const { status, reviewNote } = req.body || {};
    if (!['pending', 'approved', 'rejected', 'cancelled'].includes(status)) {
      return res.status(400).json({ error: 'Invalid status' });
    }
    request.status = status;
    if (reviewNote !== undefined) request.reviewNote = String(reviewNote || '').slice(0, 500);
    if (['approved', 'rejected'].includes(status)) {
      request.reviewedBy = req.user.id;
      request.reviewedAt = new Date();
    }
    await request.save();
    const populated = await LeaveRequest.findById(request._id)
      .populate('kidId', 'name grade house admissionNo')
      .populate('parentId', 'name phone email')
      .populate('reviewedBy', 'name email');
    const obj = populated.toObject();
    res.json({ request: { ...obj, days: leaveDays(obj.startDate, obj.endDate) } });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
