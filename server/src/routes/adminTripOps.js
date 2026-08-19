import { Router } from 'express';
import {
  TripSchedule,
  Trip,
  TripEvent,
  Route,
  Bus,
  User,
  Kid,
  Stop,
  SchoolHoliday,
  ScheduleException,
  CalendarEvent,
} from '../models/index.js';
import {
  generateInstancesForSchedule,
  applyScheduleEdit,
  startOfDay,
  endOfDay,
  dateKey,
  scheduledForFrom,
  findPeriodConflict,
  nextTripCode,
} from '../services/tripScheduleService.js';
import { notifyTripCancelled, createAndEmitNotifications } from '../services/notifications.js';
import { getIO } from '../socket.js';

const router = Router();

function resolveSchoolId(req) {
  if (req.user.role === 'school_admin') return req.user.schoolId || null;
  return req.query.schoolId || req.body.schoolId || null;
}

function assertSchoolAccess(req, schoolId) {
  if (req.user.role === 'school_admin' && schoolId?.toString() !== req.user.schoolId) {
    return false;
  }
  return true;
}

function populateSchedule(q) {
  return q
    .populate('routeId', 'name')
    .populate('busId', 'plate label seats')
    .populate('driverId', 'name email phone')
    .populate('kidIds', 'name grade homeStopId');
}

function populateTrip(q) {
  return q
    .populate('routeId', 'name estimatedMinutes')
    .populate('busId', 'plate label seats')
    .populate('driverId', 'name email phone photoUrl')
    .populate('scheduleId', 'name period scheduleType scheduledTime')
    .populate('kidIds', 'name grade homeStopId photoUrl');
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

function durationMinutesOf(trip) {
  if (!trip.startedAt || !trip.endedAt) return null;
  const mins = Math.round((new Date(trip.endedAt) - new Date(trip.startedAt)) / 60000);
  return Number.isFinite(mins) && mins >= 0 ? mins : null;
}

function hourBucket(date) {
  if (!date) return '';
  const h = new Date(date).getHours();
  if (h < 6) return '12–6 AM';
  if (h < 8) return '6–8 AM';
  if (h < 12) return '8 AM–12 PM';
  if (h < 15) return '12–3 PM';
  if (h < 17) return '3–5 PM';
  return '5 PM–12 AM';
}

const HOUR_BUCKETS = ['12–6 AM', '6–8 AM', '8 AM–12 PM', '12–3 PM', '3–5 PM', '5 PM–12 AM'];

function serializeTrip(t, pathByRoute = {}) {
  const json = t.toObject ? t.toObject() : t;
  const rid = String(json.routeId?._id || json.routeId || '');
  return {
    ...json,
    path: pathByRoute[rid] || '',
    studentCount: Array.isArray(json.kidIds) ? json.kidIds.length : 0,
    durationMinutes: durationMinutesOf(json),
  };
}

// ——— Trip schedules ———
router.get('/trip-schedules', async (req, res) => {
  try {
    const filter = {};
    const schoolId = resolveSchoolId(req);
    if (schoolId) filter.schoolId = schoolId;
    const schedules = await populateSchedule(TripSchedule.find(filter).sort({ createdAt: -1 }));
    res.json({ schedules });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/trip-schedules', async (req, res) => {
  try {
    let schoolId = resolveSchoolId(req);
    if (req.user.role === 'super_admin') schoolId = req.body.schoolId || schoolId;
    if (!schoolId) return res.status(400).json({ error: 'schoolId is required' });

    const {
      name,
      scheduleType,
      customDays,
      period,
      direction,
      routeId,
      busId,
      driverId,
      scheduledTime,
      startDate,
      endDate,
      kidIds,
      active,
      generate,
    } = req.body;

    if (!name || !scheduleType || !period || !direction || !routeId || !busId || !driverId || !startDate) {
      return res.status(400).json({
        error: 'name, scheduleType, period, direction, routeId, busId, driverId, and startDate are required',
      });
    }

    const [route, bus, driver] = await Promise.all([
      Route.findById(routeId),
      Bus.findById(busId),
      User.findOne({ _id: driverId, role: 'driver' }),
    ]);
    if (!route || !bus || !driver) {
      return res.status(404).json({ error: 'Route, bus, or driver not found' });
    }
    if (
      route.schoolId.toString() !== schoolId.toString() ||
      bus.schoolId.toString() !== schoolId.toString() ||
      driver.schoolId?.toString() !== schoolId.toString()
    ) {
      return res.status(400).json({ error: 'Route, bus, and driver must belong to the school' });
    }

    let resolvedKids = kidIds;
    if (!resolvedKids?.length) {
      const routeKids = await Kid.find({ routeId, schoolId, active: true }).select('_id');
      resolvedKids = routeKids.map((k) => k._id);
    }

    const schedule = await TripSchedule.create({
      schoolId,
      name,
      scheduleType,
      customDays: customDays || [],
      period,
      direction,
      routeId,
      busId,
      driverId,
      scheduledTime: scheduledTime || '06:30',
      startDate: startOfDay(startDate),
      endDate: endDate ? startOfDay(endDate) : null,
      kidIds: resolvedKids,
      active: active !== false,
    });

    let generation = null;
    if (generate !== false) {
      generation = await generateInstancesForSchedule(schedule._id);
    }

    const populated = await populateSchedule(TripSchedule.findById(schedule._id));
    res.status(201).json({
      schedule: populated,
      generation: generation
        ? {
            created: generation.created.length,
            skipped: generation.skipped.length,
            conflicts: generation.conflicts,
          }
        : null,
    });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.get('/trip-schedules/:id', async (req, res) => {
  try {
    const schedule = await populateSchedule(TripSchedule.findById(req.params.id));
    if (!schedule) return res.status(404).json({ error: 'Schedule not found' });
    if (!assertSchoolAccess(req, schedule.schoolId)) {
      return res.status(403).json({ error: 'Cannot view schedule from another school' });
    }
    res.json({ schedule });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.put('/trip-schedules/:id', async (req, res) => {
  try {
    const existing = await TripSchedule.findById(req.params.id);
    if (!existing) return res.status(404).json({ error: 'Schedule not found' });
    if (!assertSchoolAccess(req, existing.schoolId)) {
      return res.status(403).json({ error: 'Cannot edit schedule from another school' });
    }

    const result = await applyScheduleEdit(existing._id, req.body);
    const schedule = await populateSchedule(TripSchedule.findById(result.schedule._id));
    res.json({
      schedule,
      exception: result.exception,
      updatedCount: result.updated.length,
      conflicts: result.conflicts,
      generation: result.generation
        ? {
            created: result.generation.created.length,
            skipped: result.generation.skipped.length,
            conflicts: result.generation.conflicts,
          }
        : null,
    });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// ——— Exceptions ———
router.get('/trip-schedules/:id/exceptions', async (req, res) => {
  try {
    const schedule = await TripSchedule.findById(req.params.id);
    if (!schedule) return res.status(404).json({ error: 'Schedule not found' });
    if (!assertSchoolAccess(req, schedule.schoolId)) {
      return res.status(403).json({ error: 'Cannot view exceptions from another school' });
    }
    const exceptions = await ScheduleException.find({ scheduleId: schedule._id })
      .populate('busId', 'plate label')
      .populate('driverId', 'name')
      .sort({ serviceDate: 1 });
    res.json({ exceptions });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/trip-schedules/:id/exceptions', async (req, res) => {
  try {
    const schedule = await TripSchedule.findById(req.params.id);
    if (!schedule) return res.status(404).json({ error: 'Schedule not found' });
    if (!assertSchoolAccess(req, schedule.schoolId)) {
      return res.status(403).json({ error: 'Cannot edit exceptions from another school' });
    }

    const { serviceDate, type, busId, driverId, kidIds, scheduledTime } = req.body;
    if (!serviceDate || !type) {
      return res.status(400).json({ error: 'serviceDate and type are required' });
    }
    if (!['SKIP', 'OVERRIDE'].includes(type)) {
      return res.status(400).json({ error: 'type must be SKIP or OVERRIDE' });
    }

    const day = startOfDay(serviceDate);
    const exception = await ScheduleException.findOneAndUpdate(
      { scheduleId: schedule._id, serviceDate: day },
      {
        scheduleId: schedule._id,
        schoolId: schedule.schoolId,
        serviceDate: day,
        type,
        busId: type === 'OVERRIDE' ? busId || null : null,
        driverId: type === 'OVERRIDE' ? driverId || null : null,
        kidIds: type === 'OVERRIDE' ? kidIds || [] : [],
        scheduledTime: type === 'OVERRIDE' ? scheduledTime || null : null,
      },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );

    let trip = await Trip.findOne({
      scheduleId: schedule._id,
      period: schedule.period,
      serviceDate: { $gte: day, $lte: endOfDay(day) },
    });

    if (type === 'SKIP') {
      if (trip && trip.status === 'scheduled') {
        trip.status = 'cancelled';
        await trip.save();
        await notifyTripCancelled(getIO(), trip);
      }
    } else if (type === 'OVERRIDE' && trip && trip.status === 'scheduled') {
      const nextBus = busId || schedule.busId;
      const nextDriver = driverId || schedule.driverId;
      const conflict = await findPeriodConflict({
        schoolId: schedule.schoolId,
        busId: nextBus,
        driverId: nextDriver,
        serviceDate: day,
        period: schedule.period,
        excludeTripId: trip._id,
      });
      if (conflict) {
        return res.status(409).json({
          error: 'Override conflicts with another trip that day/period',
          exception,
          conflictTripCode: conflict.tripCode,
        });
      }
      trip.busId = nextBus;
      trip.driverId = nextDriver;
      if (Array.isArray(kidIds) && kidIds.length) trip.kidIds = kidIds;
      trip.scheduledFor = scheduledForFrom(day, scheduledTime || schedule.scheduledTime);
      await trip.save();
    }

    res.status(201).json({ exception, trip });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.delete('/trip-schedules/:id/exceptions/:exceptionId', async (req, res) => {
  try {
    const schedule = await TripSchedule.findById(req.params.id);
    if (!schedule) return res.status(404).json({ error: 'Schedule not found' });
    if (!assertSchoolAccess(req, schedule.schoolId)) {
      return res.status(403).json({ error: 'Cannot delete exceptions from another school' });
    }
    const exception = await ScheduleException.findOneAndDelete({
      _id: req.params.exceptionId,
      scheduleId: schedule._id,
    });
    if (!exception) return res.status(404).json({ error: 'Exception not found' });
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ——— Holidays ———
router.get('/holidays', async (req, res) => {
  try {
    const filter = { active: true };
    const schoolId = resolveSchoolId(req);
    if (schoolId) filter.schoolId = schoolId;
    const holidays = await SchoolHoliday.find(filter).sort({ date: 1 });
    res.json({ holidays });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/holidays', async (req, res) => {
  try {
    let schoolId = resolveSchoolId(req);
    if (req.user.role === 'super_admin') schoolId = req.body.schoolId || schoolId;
    if (!schoolId) return res.status(400).json({ error: 'schoolId is required' });
    const { date, name } = req.body;
    if (!date || !name) return res.status(400).json({ error: 'date and name are required' });

    const day = startOfDay(date);
    const holiday = await SchoolHoliday.findOneAndUpdate(
      { schoolId, date: day },
      { schoolId, date: day, name, active: true },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );

    // Cancel scheduled instances on this holiday for the school
    const trips = await Trip.find({
      schoolId,
      status: 'scheduled',
      serviceDate: { $gte: day, $lte: endOfDay(day) },
    });
    for (const trip of trips) {
      trip.status = 'cancelled';
      await trip.save();
      await notifyTripCancelled(getIO(), trip);
    }

    res.status(201).json({ holiday, cancelledTrips: trips.length });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.delete('/holidays/:id', async (req, res) => {
  try {
    const holiday = await SchoolHoliday.findById(req.params.id);
    if (!holiday) return res.status(404).json({ error: 'Holiday not found' });
    if (!assertSchoolAccess(req, holiday.schoolId)) {
      return res.status(403).json({ error: 'Cannot delete holiday from another school' });
    }
    holiday.active = false;
    await holiday.save();
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.delete('/trip-schedules/:id', async (req, res) => {
  try {
    const existing = await TripSchedule.findById(req.params.id);
    if (!existing) return res.status(404).json({ error: 'Schedule not found' });
    if (!assertSchoolAccess(req, existing.schoolId)) {
      return res.status(403).json({ error: 'Cannot delete schedule from another school' });
    }
    // Cancel future scheduled instances; keep history
    await Trip.updateMany(
      {
        scheduleId: existing._id,
        status: 'scheduled',
        serviceDate: { $gte: startOfDay(new Date()) },
      },
      { $set: { status: 'cancelled' } }
    );
    existing.active = false;
    await existing.save();
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/trip-schedules/:id/generate', async (req, res) => {
  try {
    const existing = await TripSchedule.findById(req.params.id);
    if (!existing) return res.status(404).json({ error: 'Schedule not found' });
    if (!assertSchoolAccess(req, existing.schoolId)) {
      return res.status(403).json({ error: 'Cannot generate for another school' });
    }
    const result = await generateInstancesForSchedule(existing._id, {
      from: req.body.from,
      to: req.body.to,
    });
    res.json({
      created: result.created.length,
      skipped: result.skipped.length,
      conflicts: result.conflicts,
      trips: result.created,
    });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// ——— Trip instances ———
router.get('/trip-instances', async (req, res) => {
  try {
    const filter = {};
    const schoolId = resolveSchoolId(req);
    if (schoolId) filter.schoolId = schoolId;
    if (req.query.status) filter.status = req.query.status;
    if (req.query.routeId) filter.routeId = req.query.routeId;
    if (req.query.driverId) filter.driverId = req.query.driverId;
    if (req.query.period) filter.period = req.query.period;
    const sinceMonth = monthStart();
    if (req.query.date) {
      filter.serviceDate = {
        $gte: startOfDay(req.query.date),
        $lte: endOfDay(req.query.date),
      };
    } else {
      filter.$or = [
        { serviceDate: { $gte: sinceMonth } },
        { serviceDate: null, scheduledFor: { $gte: sinceMonth } },
        { serviceDate: null, scheduledFor: null, createdAt: { $gte: sinceMonth } },
      ];
    }

    const monthFilter = schoolId ? { schoolId } : {};
    monthFilter.$or = [
      { serviceDate: { $gte: sinceMonth } },
      { serviceDate: null, scheduledFor: { $gte: sinceMonth } },
      { serviceDate: null, scheduledFor: null, createdAt: { $gte: sinceMonth } },
    ];

    const [trips, monthTrips] = await Promise.all([
      populateTrip(Trip.find(filter).sort({ serviceDate: -1, scheduledFor: -1, createdAt: -1 })),
      Trip.find(monthFilter).select('status startedAt endedAt routeId scheduledFor serviceDate period createdAt'),
    ]);

    const routeIds = [
      ...new Set(
        [...trips, ...monthTrips]
          .map((t) => String(t.routeId?._id || t.routeId || ''))
          .filter(Boolean)
      ),
    ];
    const stops = routeIds.length ? await Stop.find({ routeId: { $in: routeIds } }).sort({ order: 1 }) : [];
    const stopsByRoute = {};
    for (const s of stops) {
      const key = String(s.routeId);
      if (!stopsByRoute[key]) stopsByRoute[key] = [];
      stopsByRoute[key].push(s);
    }
    const pathByRoute = {};
    for (const rid of routeIds) pathByRoute[rid] = routePathLabel(stopsByRoute[rid] || []);
    const routeNames = {};
    if (routeIds.length) {
      const routes = await Route.find({ _id: { $in: routeIds } }).select('name');
      for (const r of routes) routeNames[String(r._id)] = r.name || '';
    }

    const scheduleIds = [...new Set(trips.map((t) => t.scheduleId?._id || t.scheduleId).filter(Boolean))];
    const exceptions = scheduleIds.length
      ? await ScheduleException.find({ scheduleId: { $in: scheduleIds } }).lean()
      : [];
    const exMap = new Map(
      exceptions.map((e) => [`${e.scheduleId.toString()}:${dateKey(e.serviceDate)}`, e])
    );
    const enriched = trips.map((t) => {
      const sid = (t.scheduleId?._id || t.scheduleId)?.toString();
      const key = sid && t.serviceDate ? `${sid}:${dateKey(t.serviceDate)}` : null;
      const exception = key ? exMap.get(key) || null : null;
      return { ...serializeTrip(t, pathByRoute), exception };
    });

    let completed = 0;
    let active = 0;
    let cancelled = 0;
    let scheduled = 0;
    let durationSum = 0;
    let durationCount = 0;
    const routeCounts = {};
    const hourCounts = Object.fromEntries(HOUR_BUCKETS.map((b) => [b, 0]));
    const dayCounts = {};
    const daysInMonth = new Date(sinceMonth.getFullYear(), sinceMonth.getMonth() + 1, 0).getDate();
    for (let d = 1; d <= daysInMonth; d += 1) dayCounts[d] = 0;

    for (const t of monthTrips) {
      if (t.status === 'completed') completed += 1;
      else if (t.status === 'active') active += 1;
      else if (t.status === 'cancelled') cancelled += 1;
      else scheduled += 1;
      const mins = durationMinutesOf(t);
      if (mins != null) {
        durationSum += mins;
        durationCount += 1;
      }
      const rid = String(t.routeId || '');
      if (rid) routeCounts[rid] = (routeCounts[rid] || 0) + 1;
      const when = t.scheduledFor || t.startedAt || t.serviceDate;
      const bucket = hourBucket(when);
      if (bucket) hourCounts[bucket] += 1;
      const daySrc = t.serviceDate || t.scheduledFor || t.createdAt;
      if (daySrc) {
        const day = new Date(daySrc).getDate();
        if (dayCounts[day] != null) dayCounts[day] += 1;
      }
    }

    const topRoutes = Object.entries(routeCounts)
      .map(([id, count]) => ({ id, name: routeNames[id] || 'Route', count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 5);

    res.json({
      trips: enriched,
      stats: {
        total: monthTrips.length,
        completed,
        active,
        cancelled,
        scheduled,
        avgDurationMinutes: durationCount ? Math.round(durationSum / durationCount) : null,
        totalDistanceKm: null,
      },
      analytics: {
        trend: Object.entries(dayCounts).map(([day, count]) => ({ day: Number(day), count })),
        byStatus: { completed, active, scheduled, cancelled },
        topRoutes,
        byHour: HOUR_BUCKETS.map((label) => ({ label, count: hourCounts[label] || 0 })),
      },
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/trip-instances', async (req, res) => {
  try {
    let schoolId = resolveSchoolId(req);
    if (req.user.role === 'super_admin') schoolId = req.body.schoolId || schoolId;
    if (!schoolId) return res.status(400).json({ error: 'schoolId is required' });

    const route = await Route.findById(req.body.routeId);
    if (!route) return res.status(404).json({ error: 'Route not found' });
    if (!assertSchoolAccess(req, route.schoolId)) {
      return res.status(403).json({ error: 'Cannot create trip for another school' });
    }

    const serviceDate = startOfDay(req.body.serviceDate || new Date());
    const scheduledTime = req.body.scheduledTime || '06:30';
    const period = ['morning', 'afternoon', 'evening'].includes(req.body.period) ? req.body.period : 'morning';
    const direction = req.body.direction === 'to_home' ? 'to_home' : 'to_school';
    const busId = req.body.busId || null;
    const driverId = req.body.driverId;
    if (!driverId) return res.status(400).json({ error: 'driverId is required' });

    const conflict = await findPeriodConflict({
      schoolId,
      busId,
      driverId,
      serviceDate,
      period,
    });
    if (conflict) {
      return res.status(409).json({
        error: 'Conflict with another trip that day/period',
        conflictTripCode: conflict.tripCode,
      });
    }

    let kidIds = Array.isArray(req.body.kidIds) ? req.body.kidIds.filter(Boolean) : [];
    if (!kidIds.length) {
      const kids = await Kid.find({ schoolId, routeId: route._id, active: { $ne: false } }).select('_id');
      kidIds = kids.map((k) => k._id);
    }

    const trip = await Trip.create({
      schoolId,
      routeId: route._id,
      driverId,
      busId,
      period,
      direction,
      serviceDate,
      scheduledFor: scheduledForFrom(serviceDate, scheduledTime),
      kidIds,
      tripCode: await nextTripCode(),
      status: 'scheduled',
    });
    const populated = await populateTrip(Trip.findById(trip._id));
    res.status(201).json({ trip: populated });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.get('/trip-instances/:id', async (req, res) => {
  try {
    const trip = await populateTrip(Trip.findById(req.params.id));
    if (!trip) return res.status(404).json({ error: 'Trip instance not found' });
    if (!assertSchoolAccess(req, trip.schoolId)) {
      return res.status(403).json({ error: 'Cannot view trip from another school' });
    }
    const [events, stops] = await Promise.all([
      TripEvent.find({ tripId: trip._id }).sort({ at: 1 }),
      Stop.find({ routeId: trip.routeId?._id || trip.routeId }).sort({ order: 1 }),
    ]);
    let exception = null;
    if (trip.scheduleId && trip.serviceDate) {
      exception = await ScheduleException.findOne({
        scheduleId: trip.scheduleId._id || trip.scheduleId,
        serviceDate: { $gte: startOfDay(trip.serviceDate), $lte: endOfDay(trip.serviceDate) },
      });
    }
    const pickedUp = new Set(events.filter((e) => e.type === 'picked_up').map((e) => String(e.kidId))).size;
    const droppedOff = new Set(events.filter((e) => e.type === 'dropped_off').map((e) => String(e.kidId))).size;
    const json = serializeTrip(trip, {
      [String(trip.routeId?._id || trip.routeId || '')]: routePathLabel(stops),
    });
    res.json({
      trip: json,
      events,
      exception,
      stops,
      pickedUp,
      droppedOff,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/** Edit a scheduled instance → OVERRIDE exception + update trip. */
router.put('/trip-instances/:id', async (req, res) => {
  try {
    const trip = await Trip.findById(req.params.id);
    if (!trip) return res.status(404).json({ error: 'Trip instance not found' });
    if (!assertSchoolAccess(req, trip.schoolId)) {
      return res.status(403).json({ error: 'Cannot edit trip from another school' });
    }
    if (trip.status !== 'scheduled') {
      return res.status(400).json({ error: 'Only scheduled trips can be edited' });
    }

    const busId = req.body.busId ?? trip.busId;
    const driverId = req.body.driverId ?? trip.driverId;
    const kidIds = req.body.kidIds ?? trip.kidIds;
    const scheduledTime = req.body.scheduledTime;

    if (!trip.scheduleId || !trip.serviceDate) {
      const conflict = await findPeriodConflict({
        schoolId: trip.schoolId,
        busId,
        driverId,
        serviceDate: trip.serviceDate || trip.scheduledFor || new Date(),
        period: trip.period,
        excludeTripId: trip._id,
      });
      if (conflict) {
        return res.status(409).json({
          error: 'Conflict with another trip that day/period',
          conflictTripCode: conflict.tripCode,
        });
      }
      trip.busId = busId;
      trip.driverId = driverId;
      trip.kidIds = kidIds;
      if (scheduledTime && trip.serviceDate) {
        trip.scheduledFor = scheduledForFrom(trip.serviceDate, scheduledTime);
      }
      await trip.save();
      const populated = await populateTrip(Trip.findById(trip._id));
      return res.json({ trip: populated });
    }

    const schedule = await TripSchedule.findById(trip.scheduleId);
    if (!schedule) return res.status(404).json({ error: 'Schedule not found' });
    const overrideTime = scheduledTime ?? schedule.scheduledTime;

    const conflict = await findPeriodConflict({
      schoolId: trip.schoolId,
      busId,
      driverId,
      serviceDate: trip.serviceDate,
      period: trip.period || schedule.period,
      excludeTripId: trip._id,
    });
    if (conflict) {
      return res.status(409).json({
        error: 'Conflict with another trip that day/period',
        conflictTripCode: conflict.tripCode,
      });
    }

    const day = startOfDay(trip.serviceDate);
    const exception = await ScheduleException.findOneAndUpdate(
      { scheduleId: schedule._id, serviceDate: day },
      {
        scheduleId: schedule._id,
        schoolId: schedule.schoolId,
        serviceDate: day,
        type: 'OVERRIDE',
        busId,
        driverId,
        kidIds,
        scheduledTime: overrideTime,
      },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );

    trip.busId = busId;
    trip.driverId = driverId;
    trip.kidIds = kidIds;
    trip.scheduledFor = scheduledForFrom(day, overrideTime);
    await trip.save();

    const populated = await populateTrip(Trip.findById(trip._id));
    res.json({ trip: populated, exception });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.post('/trip-instances/:id/cancel', async (req, res) => {
  try {
    const trip = await Trip.findById(req.params.id);
    if (!trip) return res.status(404).json({ error: 'Trip instance not found' });
    if (!assertSchoolAccess(req, trip.schoolId)) {
      return res.status(403).json({ error: 'Cannot cancel trip from another school' });
    }
    if (trip.status === 'completed') {
      return res.status(400).json({ error: 'Completed trips cannot be cancelled' });
    }
    if (trip.status === 'active') {
      return res.status(400).json({ error: 'Active trips must be completed by the driver' });
    }
    trip.status = 'cancelled';
    await trip.save();
    if (trip.scheduleId && trip.serviceDate) {
      await ScheduleException.findOneAndUpdate(
        { scheduleId: trip.scheduleId, serviceDate: startOfDay(trip.serviceDate) },
        {
          scheduleId: trip.scheduleId,
          schoolId: trip.schoolId,
          serviceDate: startOfDay(trip.serviceDate),
          type: 'SKIP',
          busId: null,
          driverId: null,
          kidIds: [],
          scheduledTime: null,
        },
        { upsert: true, new: true, setDefaultsOnInsert: true }
      );
    }
    await notifyTripCancelled(getIO(), trip);
    const populated = await populateTrip(Trip.findById(trip._id));
    res.json({ trip: populated });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

function tripWhen(t) {
  return t.serviceDate || t.scheduledFor || t.createdAt;
}

function inDateRange(start, end) {
  return {
    $or: [
      { serviceDate: { $gte: start, $lte: end } },
      {
        $and: [
          { $or: [{ serviceDate: null }, { serviceDate: { $exists: false } }] },
          { scheduledFor: { $gte: start, $lte: end } },
        ],
      },
      {
        $and: [
          { $or: [{ serviceDate: null }, { serviceDate: { $exists: false } }] },
          { $or: [{ scheduledFor: null }, { scheduledFor: { $exists: false } }] },
          { createdAt: { $gte: start, $lte: end } },
        ],
      },
    ],
  };
}

function eachDayKey(start, end) {
  const days = [];
  const d = startOfDay(start);
  const last = startOfDay(end);
  while (d.getTime() <= last.getTime()) {
    days.push(dateKey(d));
    d.setDate(d.getDate() + 1);
  }
  return days;
}

function shiftMonth(date, months) {
  const src = new Date(date);
  const day = src.getDate();
  const d = new Date(src.getFullYear(), src.getMonth() + months, 1);
  const last = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
  d.setDate(Math.min(day, last));
  d.setHours(src.getHours(), src.getMinutes(), src.getSeconds(), src.getMilliseconds());
  return d;
}

function deltaMeta(curr, prev) {
  if (curr == null || prev == null) return { pct: null, abs: null, dir: null };
  const abs = curr - prev;
  const dir = abs > 0 ? 'up' : abs < 0 ? 'down' : 'flat';
  if (prev === 0) return { pct: null, abs, dir };
  return { pct: Math.round((abs / prev) * 1000) / 10, abs, dir };
}

const INCIDENT_LABELS = {
  breakdown: 'Breakdown',
  accident: 'Traffic Accident',
  traffic: 'Vehicle Delay',
  road_block: 'Road block',
  weather: 'Weather',
  passenger: 'Passenger',
  unsafe: 'Unsafe',
  other: 'Other',
};

function uniqueKids(trips) {
  const ids = new Set();
  for (const t of trips) {
    if (t.status === 'cancelled') continue;
    for (const id of t.kidIds || []) ids.add(String(id._id || id));
  }
  return ids;
}

function summarizeTrips(trips, dayKeys) {
  const byStatus = { completed: 0, active: 0, scheduled: 0, cancelled: 0 };
  const trendMap = Object.fromEntries(dayKeys.map((k) => [k, { completed: 0, active: 0, cancelled: 0 }]));
  const byRoute = {};
  const byDriver = {};
  const incidentCounts = {};
  let incidentTotal = 0;

  for (const t of trips) {
    const status = t.status || 'scheduled';
    if (byStatus[status] != null) byStatus[status] += 1;
    else byStatus.scheduled += 1;
    const day = dateKey(tripWhen(t));
    if (trendMap[day]) {
      if (status === 'completed') trendMap[day].completed += 1;
      else if (status === 'active') trendMap[day].active += 1;
      else if (status === 'cancelled') trendMap[day].cancelled += 1;
    }
    const rid = String(t.routeId?._id || t.routeId || '');
    if (rid) {
      if (!byRoute[rid]) {
        byRoute[rid] = {
          id: rid,
          name: t.routeId?.name || 'Route',
          trips: 0,
          kidIds: new Set(),
          dayCounts: Object.fromEntries(dayKeys.map((k) => [k, 0])),
        };
      }
      byRoute[rid].trips += 1;
      if (byRoute[rid].dayCounts[day] != null) byRoute[rid].dayCounts[day] += 1;
      if (t.status !== 'cancelled') {
        for (const id of t.kidIds || []) byRoute[rid].kidIds.add(String(id._id || id));
      }
    }
    const did = String(t.driverId?._id || t.driverId || '');
    if (did) {
      if (!byDriver[did]) {
        byDriver[did] = {
          id: did,
          name: t.driverId?.name || 'Driver',
          photoUrl: t.driverId?.photoUrl || '',
          trips: 0,
          kidIds: new Set(),
        };
      }
      byDriver[did].trips += 1;
      if (t.status !== 'cancelled') {
        for (const id of t.kidIds || []) byDriver[did].kidIds.add(String(id._id || id));
      }
    }
    for (const inc of t.incidents || []) {
      const key = inc.type || 'other';
      incidentCounts[key] = (incidentCounts[key] || 0) + 1;
      incidentTotal += 1;
    }
  }

  const sparkDays = dayKeys.slice(-7);
  const routes = Object.values(byRoute)
    .map((r) => ({
      id: r.id,
      name: r.name,
      trips: r.trips,
      students: r.kidIds.size,
      onTimePct: null,
      avgDelayMinutes: null,
      spark: sparkDays.map((k) => r.dayCounts[k] || 0),
    }))
    .sort((a, b) => b.trips - a.trips);

  const drivers = Object.values(byDriver)
    .map((d) => ({
      id: d.id,
      name: d.name,
      photoUrl: d.photoUrl,
      trips: d.trips,
      students: d.kidIds.size,
      onTimePct: null,
    }))
    .sort((a, b) => b.trips - a.trips)
    .slice(0, 8);

  const incidents = Object.entries(incidentCounts)
    .map(([type, count]) => ({ type, label: INCIDENT_LABELS[type] || type, count }))
    .sort((a, b) => b.count - a.count);

  return {
    byStatus,
    trend: dayKeys.map((day) => ({ day, ...trendMap[day] })),
    routes,
    drivers,
    incidents,
    incidentTotal,
    studentsRode: uniqueKids(trips).size,
  };
}

function incidentPlace(inc) {
  if (inc.nextStopName) return inc.nextStopName;
  if (inc.location?.lat != null && inc.location?.lng != null) {
    return `${Number(inc.location.lat).toFixed(4)}, ${Number(inc.location.lng).toFixed(4)}`;
  }
  return '';
}

function collectSafety(trips, dayKeys) {
  const trendMap = Object.fromEntries(dayKeys.map((k) => [k, { total: 0, accident: 0, other: 0 }]));
  const bySeverity = { high: 0, medium: 0, low: 0 };
  const byLocation = {};
  const byDriver = {};
  const rows = [];
  let accidents = 0;

  for (const t of trips) {
    const driverId = String(t.driverId?._id || t.driverId || '');
    const driverName = t.driverId?.name || 'Driver';
    const photoUrl = t.driverId?.photoUrl || '';
    for (const inc of t.incidents || []) {
      const at = inc.occurredAt || t.serviceDate || t.createdAt;
      const day = at ? dateKey(at) : '';
      if (day && trendMap[day]) {
        trendMap[day].total += 1;
        if (inc.type === 'accident') trendMap[day].accident += 1;
        else trendMap[day].other += 1;
      }
      const severity = ['high', 'medium', 'low'].includes(inc.severity) ? inc.severity : 'medium';
      bySeverity[severity] += 1;
      if (inc.type === 'accident') accidents += 1;
      const location = incidentPlace(inc);
      if (location) byLocation[location] = (byLocation[location] || 0) + 1;
      if (driverId) {
        if (!byDriver[driverId]) {
          byDriver[driverId] = {
            id: driverId,
            name: driverName,
            photoUrl,
            incidents: 0,
            high: 0,
          };
        }
        byDriver[driverId].incidents += 1;
        if (severity === 'high') byDriver[driverId].high += 1;
      }
      rows.push({
        id: String(inc._id || `${t._id}-${rows.length}`),
        tripId: String(t._id),
        tripCode: t.tripCode || '',
        at,
        type: inc.type || 'other',
        label: INCIDENT_LABELS[inc.type] || inc.type || 'Other',
        details: inc.details || '',
        location,
        severity,
        driverName,
        driverId: driverId || '',
        busLabel: t.busId?.label || t.busId?.plate || '',
        routeName: t.routeId?.name || '',
        status: null,
      });
    }
  }

  rows.sort((a, b) => new Date(b.at || 0) - new Date(a.at || 0));
  const total = rows.length;
  const locations = Object.entries(byLocation)
    .map(([name, count]) => ({
      name,
      count,
      pct: total ? Math.round((count / total) * 1000) / 10 : 0,
    }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 8);
  const drivers = Object.values(byDriver)
    .sort((a, b) => b.incidents - a.incidents || b.high - a.high)
    .slice(0, 8);

  return {
    total,
    accidents,
    bySeverity,
    trend: dayKeys.map((day) => ({ day, ...trendMap[day] })),
    locations,
    rows,
    drivers,
    safetyScore: null,
    complianceRate: null,
    pendingActions: null,
    policyViolations: null,
  };
}

function collectAttendance({ events, tripsById, kidsById, dayKeys, todayKey, focusDay, gradeFilter }) {
  const marks = {};
  for (const e of events) {
    if (e.type !== 'picked_up' && e.type !== 'not_picked_up') continue;
    const trip = tripsById[String(e.tripId)];
    const at = e.at || trip?.serviceDate;
    if (!at) continue;
    const day = dateKey(at);
    const kidId = String(e.kidId);
    const kid = kidsById[kidId];
    if (gradeFilter && (kid?.grade || '') !== gradeFilter) continue;
    const key = `${day}:${kidId}`;
    const existing = marks[key];
    if (existing && new Date(existing.at).getTime() >= new Date(at).getTime()) continue;
    const route = trip?.routeId && typeof trip.routeId === 'object' ? trip.routeId : null;
    const kidRoute = kid?.routeId && typeof kid.routeId === 'object' ? kid.routeId : null;
    marks[key] = {
      day,
      kidId,
      type: e.type,
      at,
      tripId: String(e.tripId),
      routeName: route?.name || kidRoute?.name || '',
      routeId: String(route?._id || trip?.routeId || kidRoute?._id || kid?.routeId || ''),
    };
  }

  const trendMap = Object.fromEntries(dayKeys.map((k) => [k, { present: 0, absent: 0 }]));
  const byGrade = {};
  const byRoute = {};
  const pickupMins = [];
  let presentTotal = 0;
  let absentTotal = 0;
  let todayPresent = 0;
  let todayAbsent = 0;

  for (const mark of Object.values(marks)) {
    const present = mark.type === 'picked_up';
    if (trendMap[mark.day]) {
      if (present) trendMap[mark.day].present += 1;
      else trendMap[mark.day].absent += 1;
    }
    if (mark.day === todayKey) {
      if (present) todayPresent += 1;
      else todayAbsent += 1;
    }
    if (!dayKeys.includes(mark.day)) continue;
    if (present) presentTotal += 1;
    else absentTotal += 1;
    if (present) {
      const mins = new Date(mark.at);
      if (!Number.isNaN(mins.getTime())) pickupMins.push(mins.getHours() * 60 + mins.getMinutes());
    }
    const kid = kidsById[mark.kidId];
    const grade = kid?.grade || 'Unassigned';
    if (!byGrade[grade]) byGrade[grade] = { present: 0, absent: 0 };
    if (present) byGrade[grade].present += 1;
    else byGrade[grade].absent += 1;
    const routeName = mark.routeName || 'Unassigned';
    if (!byRoute[routeName]) byRoute[routeName] = { present: 0, absent: 0, id: mark.routeId };
    if (present) byRoute[routeName].present += 1;
    else byRoute[routeName].absent += 1;
  }

  const dailyRates = dayKeys
    .map((day) => {
      const row = trendMap[day];
      const marked = row.present + row.absent;
      return marked ? { day, rate: Math.round((row.present / marked) * 1000) / 10, marked, present: row.present } : null;
    })
    .filter(Boolean);
  const avgRate = dailyRates.length
    ? Math.round((dailyRates.reduce((s, d) => s + d.rate, 0) / dailyRates.length) * 10) / 10
    : null;
  const markedTotal = presentTotal + absentTotal;
  const periodRate = markedTotal ? Math.round((presentTotal / markedTotal) * 1000) / 10 : null;
  const best = dailyRates.length ? dailyRates.reduce((a, b) => (b.rate > a.rate ? b : a)) : null;
  const worst = dailyRates.length ? dailyRates.reduce((a, b) => (b.rate < a.rate ? b : a)) : null;
  const todayMarked = todayPresent + todayAbsent;

  const list = Object.values(marks)
    .filter((m) => m.day === focusDay)
    .map((m) => {
      const kid = kidsById[m.kidId] || {};
      return {
        id: m.kidId,
        name: kid.name || 'Student',
        admissionNo: kid.admissionNo || '',
        photoUrl: kid.photoUrl || '',
        grade: kid.grade || '',
        routeName: m.routeName || kid.routeId?.name || '',
        status: m.type === 'picked_up' ? 'present' : 'absent',
        pickupAt: m.type === 'picked_up' ? m.at : null,
      };
    })
    .sort((a, b) => a.name.localeCompare(b.name));

  const grades = Object.entries(byGrade)
    .map(([name, row]) => {
      const marked = row.present + row.absent;
      return {
        name,
        present: row.present,
        absent: row.absent,
        marked,
        rate: marked ? Math.round((row.present / marked) * 1000) / 10 : null,
      };
    })
    .sort((a, b) => b.present - a.present);

  const routes = Object.entries(byRoute)
    .map(([name, row]) => {
      const marked = row.present + row.absent;
      return {
        id: row.id,
        name,
        present: row.present,
        absent: row.absent,
        marked,
        rate: marked ? Math.round((row.present / marked) * 1000) / 10 : null,
      };
    })
    .sort((a, b) => (b.rate ?? -1) - (a.rate ?? -1));

  return {
    avgRate,
    periodRate,
    presentTotal,
    absentTotal,
    markedTotal,
    todayPresent,
    todayAbsent,
    todayMarked,
    late: null,
    trend: dayKeys.map((day) => ({ day, present: trendMap[day].present, absent: trendMap[day].absent, late: 0 })),
    grades,
    routes,
    list,
    focusDay,
    bestDay: best,
    worstDay: worst,
    avgPickupMinutes: pickupMins.length
      ? Math.round(pickupMins.reduce((a, b) => a + b, 0) / pickupMins.length)
      : null,
  };
}

// ——— Reports ———
router.get('/reports', async (req, res) => {
  try {
    const schoolId = resolveSchoolId(req);
    const from = req.query.from ? startOfDay(req.query.from) : monthStart();
    const to = req.query.to ? endOfDay(req.query.to) : endOfDay(new Date());
    const compare = req.query.compare === 'none' ? 'none' : 'previous_month';
    const prevFrom = startOfDay(shiftMonth(from, -1));
    const prevTo = endOfDay(shiftMonth(to, -1));

    const base = {};
    if (schoolId) base.schoolId = schoolId;
    if (req.query.routeId) base.routeId = req.query.routeId;
    if (req.query.busId) base.busId = req.query.busId;

    const todayStart = startOfDay(new Date());
    const todayEnd = endOfDay(new Date());
    const gradeFilter = req.query.grade ? String(req.query.grade) : '';

    const kidFilter = schoolId ? { schoolId } : {};
    const [trips, prevTrips, kids, fleetBuses, todayTrips] = await Promise.all([
      Trip.find({ ...base, ...inDateRange(from, to) })
        .select('status routeId busId driverId kidIds incidents tripCode serviceDate scheduledFor createdAt')
        .populate('routeId', 'name')
        .populate('driverId', 'name photoUrl')
        .populate('busId', 'label plate'),
      compare === 'none'
        ? Promise.resolve([])
        : Trip.find({ ...base, ...inDateRange(prevFrom, prevTo) })
            .select('status kidIds incidents busId routeId serviceDate scheduledFor createdAt')
            .populate('routeId', 'name'),
      Kid.find(kidFilter).select('createdAt active routeId name grade photoUrl admissionNo').populate('routeId', 'name'),
      Bus.find(schoolId ? { schoolId } : {}).select('label plate fuelType mileage serviceStatus active'),
      Trip.find({ ...base, ...inDateRange(todayStart, todayEnd) })
        .select('_id kidIds routeId serviceDate')
        .populate('routeId', 'name'),
    ]);
    const eventTripIds = [...new Set([...trips, ...prevTrips, ...todayTrips].map((t) => t._id))];
    const events = eventTripIds.length
      ? await TripEvent.find({
          tripId: { $in: eventTripIds },
          type: { $in: ['picked_up', 'not_picked_up'] },
        }).select('tripId kidId type at')
      : [];
    const routeIds = [...new Set(trips.map((t) => String(t.routeId?._id || t.routeId || '')).filter(Boolean))];
    const stops = routeIds.length
      ? await Stop.find({ routeId: { $in: routeIds } }).select('routeId name type order').sort({ order: 1 })
      : [];

    const stopsByRoute = {};
    for (const s of stops) {
      const key = String(s.routeId);
      if (!stopsByRoute[key]) stopsByRoute[key] = [];
      stopsByRoute[key].push(s);
    }

    const dayKeys = eachDayKey(from, to);
    const current = summarizeTrips(trips, dayKeys);
    const previous = compare === 'none' ? null : summarizeTrips(prevTrips, eachDayKey(prevFrom, prevTo));
    const safety = collectSafety(trips, dayKeys);
    const prevSafety = compare === 'none' ? null : collectSafety(prevTrips, eachDayKey(prevFrom, prevTo));

    const tripsById = {};
    for (const t of [...trips, ...prevTrips, ...todayTrips]) tripsById[String(t._id)] = t;
    const kidsById = {};
    for (const k of kids) kidsById[String(k._id)] = k;
    const todayKey = dateKey(new Date());
    const focusDay = dayKeys.includes(todayKey) ? todayKey : dateKey(to);
    const attendance = collectAttendance({
      events,
      tripsById,
      kidsById,
      dayKeys,
      todayKey,
      focusDay,
      gradeFilter,
    });
    const prevTripIds = new Set(prevTrips.map((t) => String(t._id)));
    const prevAttendance =
      compare === 'none'
        ? null
        : collectAttendance({
            events: events.filter((e) => prevTripIds.has(String(e.tripId))),
            tripsById,
            kidsById,
            dayKeys: eachDayKey(prevFrom, prevTo),
            todayKey: '',
            focusDay: dateKey(prevTo),
            gradeFilter,
          });
    const gradeOptions = [...new Set(kids.map((k) => k.grade).filter(Boolean))].sort();

    for (const r of current.routes) {
      r.path = routePathLabel(stopsByRoute[r.id] || []);
    }

    const rosterAt = (end) =>
      kids.filter((k) => k.active !== false && new Date(k.createdAt).getTime() <= end.getTime()).length;
    const studentsNow = rosterAt(to);
    const studentsPrev = compare === 'none' ? null : rosterAt(prevTo);

    const rode = uniqueKids(trips);
    let used = 0;
    let noTrip = 0;
    let added = 0;
    let inactive = 0;
    for (const k of kids) {
      const id = String(k._id);
      const created = new Date(k.createdAt).getTime();
      const isNew = created >= from.getTime() && created <= to.getTime();
      if (k.active === false) {
        inactive += 1;
        continue;
      }
      if (isNew) {
        added += 1;
        continue;
      }
      if (rode.has(id)) used += 1;
      else noTrip += 1;
    }

    const busFilterId = req.query.busId ? String(req.query.busId) : '';
    const scopedBuses = busFilterId
      ? fleetBuses.filter((b) => String(b._id) === busFilterId)
      : fleetBuses;
    const tripKidsByBus = {};
    const tripCountByBus = {};
    const usedBusIds = new Set();
    const prevUsedBusIds = new Set();
    for (const t of trips) {
      const bid = String(t.busId?._id || t.busId || '');
      if (!bid) continue;
      usedBusIds.add(bid);
      tripCountByBus[bid] = (tripCountByBus[bid] || 0) + 1;
      if (!tripKidsByBus[bid]) tripKidsByBus[bid] = new Set();
      if (t.status !== 'cancelled') {
        for (const id of t.kidIds || []) tripKidsByBus[bid].add(String(id._id || id));
      }
    }
    for (const t of prevTrips) {
      const bid = String(t.busId?._id || t.busId || '');
      if (bid) prevUsedBusIds.add(bid);
    }
    const vehicles = scopedBuses
      .map((b) => {
        const id = String(b._id);
        return {
          id,
          label: b.label || '',
          plate: b.plate || '',
          fuelType: b.fuelType || '',
          mileage: b.mileage ?? null,
          serviceStatus: b.serviceStatus || 'active',
          trips: tripCountByBus[id] || 0,
          students: tripKidsByBus[id]?.size || 0,
          liters: null,
          fuelCost: null,
          km: null,
          lPer100: null,
        };
      })
      .sort((a, b) => b.trips - a.trips || (a.label || a.plate).localeCompare(b.label || b.plate));
    const totalVehicles = scopedBuses.length;
    const usedVehicles = scopedBuses.filter((b) => usedBusIds.has(String(b._id))).length;
    const prevUsedVehicles = scopedBuses.filter((b) => prevUsedBusIds.has(String(b._id))).length;
    const utilizationPct = totalVehicles ? Math.round((usedVehicles / totalVehicles) * 1000) / 10 : null;
    const prevUtilizationPct =
      compare === 'none' || !totalVehicles ? null : Math.round((prevUsedVehicles / totalVehicles) * 1000) / 10;

    res.json({
      range: {
        from: dateKey(from),
        to: dateKey(to),
        compare,
        compareFrom: compare === 'none' ? null : dateKey(prevFrom),
        compareTo: compare === 'none' ? null : dateKey(prevTo),
      },
      kpis: {
        trips: {
          value: trips.length,
          prev: previous ? prevTrips.length : null,
          delta: previous ? deltaMeta(trips.length, prevTrips.length) : null,
        },
        students: {
          value: studentsNow,
          prev: studentsPrev,
          delta: previous ? deltaMeta(studentsNow, studentsPrev) : null,
        },
        onTime: { value: null, prev: null, delta: null },
        incidents: {
          value: current.incidentTotal,
          prev: previous ? previous.incidentTotal : null,
          delta: previous ? deltaMeta(current.incidentTotal, previous.incidentTotal) : null,
        },
        distanceKm: { value: null, prev: null, delta: null },
      },
      tripOverview: current.trend,
      routes: current.routes,
      students: {
        used,
        noTrip,
        added,
        inactive,
        rode: rode.size,
      },
      drivers: current.drivers,
      incidents: current.incidents,
      schedules: [],
      fleet: {
        totalVehicles,
        usedVehicles,
        utilizationPct,
        prevUtilizationPct,
        utilizationDelta: prevUtilizationPct == null ? null : deltaMeta(utilizationPct, prevUtilizationPct),
        maintenanceCount: scopedBuses.filter((b) => b.serviceStatus === 'maintenance').length,
        trips: trips.length,
        prevTrips: previous ? prevTrips.length : null,
        tripsDelta: previous ? deltaMeta(trips.length, prevTrips.length) : null,
        distanceKm: null,
        engineHours: null,
        fuelLiters: null,
        fuelCost: null,
        co2Ton: null,
        maintenanceCost: null,
        costPerKm: null,
      },
      vehicles,
      safety: {
        ...safety,
        prevTotal: prevSafety ? prevSafety.total : null,
        totalDelta: prevSafety ? deltaMeta(safety.total, prevSafety.total) : null,
        prevAccidents: prevSafety ? prevSafety.accidents : null,
        accidentDelta: prevSafety ? deltaMeta(safety.accidents, prevSafety.accidents) : null,
      },
      attendance: {
        ...attendance,
        avgRateDelta: prevAttendance ? deltaMeta(attendance.avgRate, prevAttendance.avgRate) : null,
        periodRateDelta: prevAttendance ? deltaMeta(attendance.periodRate, prevAttendance.periodRate) : null,
        gradesFilter: gradeOptions,
      },
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

function speedToKmh(speed) {
  const n = Number(speed);
  if (!Number.isFinite(n) || n < 0) return null;
  return n > 40 ? Math.round(n) : Math.round(n * 3.6);
}

const GPS_STALE_MS = 2 * 60 * 1000;

function gpsStatus(lastGpsAt, speedKmh) {
  if (!lastGpsAt) return 'no_gps';
  const age = Date.now() - new Date(lastGpsAt).getTime();
  if (!Number.isFinite(age) || age > GPS_STALE_MS) return 'stale';
  if (speedKmh != null && speedKmh < 3) return 'stopped';
  return 'live';
}

// ——— Live tracking ———
router.get('/live-tracking', async (req, res) => {
  try {
    const schoolId = resolveSchoolId(req);
    const filter = { status: 'active' };
    if (schoolId) filter.schoolId = schoolId;
    const busFilter = schoolId ? { schoolId } : {};

    const [trips, fleetTotal] = await Promise.all([
      Trip.find(filter)
        .populate('routeId', 'name')
        .populate('busId', 'plate label seats')
        .populate('driverId', 'name phone')
        .populate('schoolId', 'name')
        .populate('kidIds', 'name')
        .sort({ startedAt: -1 }),
      Bus.countDocuments(busFilter),
    ]);

    const tripIds = trips.map((t) => t._id);
    const routeIds = [...new Set(trips.map((t) => t.routeId?._id || t.routeId).filter(Boolean))];
    const [events, stops] = await Promise.all([
      tripIds.length ? TripEvent.find({ tripId: { $in: tripIds } }) : [],
      routeIds.length ? Stop.find({ routeId: { $in: routeIds } }).sort({ order: 1 }) : [],
    ]);
    const eventsByTrip = {};
    for (const e of events) {
      const key = String(e.tripId);
      if (!eventsByTrip[key]) eventsByTrip[key] = [];
      eventsByTrip[key].push(e);
    }
    const stopsByRoute = {};
    for (const s of stops) {
      const key = String(s.routeId);
      if (!stopsByRoute[key]) stopsByRoute[key] = [];
      stopsByRoute[key].push(s);
    }

    const statusCounts = { live: 0, stopped: 0, stale: 0, no_gps: 0 };
    let studentsOnBoard = 0;
    let speedSum = 0;
    let speedCount = 0;
    const alerts = [];
    const activity = [];

    const enriched = trips.map((trip) => {
      const tripEvents = eventsByTrip[String(trip._id)] || [];
      const picked = new Set(
        tripEvents.filter((e) => e.type === 'picked_up').map((e) => e.kidId.toString())
      );
      const dropped = new Set(
        tripEvents.filter((e) => e.type === 'dropped_off').map((e) => e.kidId.toString())
      );
      let checkedIn = 0;
      for (const id of picked) {
        if (!dropped.has(id)) checkedIn += 1;
      }
      const lastGpsAt = trip.latestLocation?.at || null;
      const speedKmh = speedToKmh(trip.latestLocation?.speed);
      const gps = gpsStatus(lastGpsAt, speedKmh);
      statusCounts[gps] += 1;
      studentsOnBoard += checkedIn;
      if (speedKmh != null && gps === 'live') {
        speedSum += speedKmh;
        speedCount += 1;
      }
      const busLabel = trip.busId?.label || trip.busId?.plate || 'Bus';
      const routeName = trip.routeId?.name || '';
      if (trip.startedAt) {
        activity.push({
          tone: 'good',
          text: `${busLabel} started trip`,
          at: trip.startedAt,
        });
      }
      for (const inc of trip.incidents || []) {
        alerts.push({
          tone: inc.severity === 'high' ? 'bad' : 'warn',
          text: `${routeName || 'Route'} — ${busLabel} (${inc.details || inc.type})`,
          at: inc.occurredAt || inc.at,
        });
        activity.push({
          tone: inc.severity === 'high' ? 'bad' : 'warn',
          text: `${busLabel}: ${inc.details || inc.type}`,
          at: inc.occurredAt || inc.at,
        });
      }
      return {
        trip,
        checkedIn,
        checkedOut: dropped.size,
        studentCount: (trip.kidIds || []).length,
        lastGpsAt,
        speedKmh,
        gpsStatus: gps,
        path: routePathLabel(stopsByRoute[String(trip.routeId?._id || trip.routeId)] || []),
      };
    });

    const byTime = (a, b) => new Date(b.at || 0) - new Date(a.at || 0);
    res.json({
      buses: enriched,
      stats: {
        fleetTotal,
        onRoute: trips.length,
        online: statusCounts.live + statusCounts.stopped,
        studentsOnBoard,
        avgSpeedKmh: speedCount ? Math.round(speedSum / speedCount) : null,
        arrivingSoon: null,
        gps: statusCounts,
      },
      alerts: alerts.sort(byTime).slice(0, 8),
      activity: activity.sort(byTime).slice(0, 8),
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

function tripStartAt(t) {
  if (t.scheduledFor) return new Date(t.scheduledFor);
  if (t.scheduleId?.scheduledTime && (t.serviceDate || t.scheduledFor)) {
    return scheduledForFrom(t.serviceDate || t.scheduledFor, t.scheduleId.scheduledTime);
  }
  if (t.startedAt) return new Date(t.startedAt);
  return null;
}

function tripEndAt(start, t) {
  if (t.endedAt) return new Date(t.endedAt);
  const mins = durationMinutesOf(t) || (t.routeId?.estimatedMinutes > 0 ? t.routeId.estimatedMinutes : null);
  if (start && mins) return new Date(start.getTime() + Number(mins) * 60000);
  return null;
}

function periodTone(period) {
  if (period === 'afternoon') return 'blue';
  if (period === 'evening') return 'teal';
  return 'green';
}

function eventTone(category) {
  if (category === 'meeting') return 'purple';
  if (category === 'holiday') return 'orange';
  if (category === 'academic') return 'sky';
  return 'violet';
}

function serializeCalEvent(row) {
  return {
    kind: 'event',
    id: String(row._id),
    title: row.title,
    body: row.body || '',
    category: row.category || 'event',
    venue: row.venue || '',
    startAt: row.startAt,
    endAt: row.endAt || null,
    allDay: Boolean(row.allDay),
    tone: eventTone(row.category),
    routeId: null,
  };
}

// ——— Calendar ———
router.get('/calendar', async (req, res) => {
  try {
    const schoolId = resolveSchoolId(req);
    const from = req.query.from ? startOfDay(req.query.from) : startOfDay(new Date());
    const to = req.query.to ? endOfDay(req.query.to) : endOfDay(new Date());
    const filter = {};
    if (schoolId) filter.schoolId = schoolId;

    const [trips, events, holidays] = await Promise.all([
      Trip.find({ ...filter, ...inDateRange(from, to) })
        .select('status routeId busId driverId kidIds period serviceDate scheduledFor startedAt endedAt incidents')
        .populate('routeId', 'name estimatedMinutes')
        .populate('scheduleId', 'scheduledTime period name')
        .populate('busId', 'label plate'),
      CalendarEvent.find({
        ...filter,
        active: { $ne: false },
        $or: [
          { startAt: { $gte: from, $lte: to } },
          { endAt: { $gte: from, $lte: to } },
          { startAt: { $lte: from }, endAt: { $gte: to } },
        ],
      }).sort({ startAt: 1 }),
      SchoolHoliday.find({
        ...filter,
        active: { $ne: false },
        date: { $gte: from, $lte: to },
      }).sort({ date: 1 }),
    ]);

    const items = [];
    const buses = new Set();
    const kids = new Set();
    const byStatus = { completed: 0, active: 0, cancelled: 0, scheduled: 0 };
    let incidentCount = 0;

    for (const t of trips) {
      if (byStatus[t.status] != null) byStatus[t.status] += 1;
      else byStatus.scheduled += 1;
      incidentCount += (t.incidents || []).length;
      const bid = String(t.busId?._id || t.busId || '');
      if (bid) buses.add(bid);
      if (t.status !== 'cancelled') {
        for (const id of t.kidIds || []) kids.add(String(id._id || id));
      }
      const start = tripStartAt(t);
      const end = tripEndAt(start, t);
      const day = t.serviceDate || start || t.scheduledFor;
      const routeName = t.routeId?.name || 'Route';
      const period = t.period || t.scheduleId?.period || '';
      items.push({
        kind: 'trip',
        id: String(t._id),
        tripId: String(t._id),
        routeId: t.routeId?._id ? String(t.routeId._id) : null,
        title: [period === 'afternoon' ? 'Afternoon' : period === 'evening' ? 'Evening' : period === 'morning' ? 'Morning' : '', routeName]
          .filter(Boolean)
          .join(' '),
        period,
        status: t.status,
        startAt: start,
        endAt: end,
        allDay: !start,
        day: day ? dateKey(day) : start ? dateKey(start) : null,
        tone: t.status === 'cancelled' ? 'muted' : periodTone(period),
        busLabel: t.busId?.label || t.busId?.plate || '',
      });
    }

    for (const row of events) {
      items.push({
        ...serializeCalEvent(row),
        day: dateKey(row.startAt),
      });
    }
    for (const h of holidays) {
      items.push({
        kind: 'holiday',
        id: String(h._id),
        title: h.name || 'Holiday',
        startAt: h.date,
        endAt: null,
        allDay: true,
        day: dateKey(h.date),
        tone: 'orange',
        routeId: null,
      });
    }

    const now = Date.now();
    const upcoming = items
      .filter((i) => {
        const at = i.startAt || i.day;
        return at && new Date(at).getTime() >= now && i.kind !== 'trip';
      })
      .sort((a, b) => new Date(a.startAt || a.day) - new Date(b.startAt || b.day))
      .slice(0, 8);

    res.json({
      range: { from: dateKey(from), to: dateKey(to) },
      kpis: {
        trips: trips.length,
        vehicles: buses.size,
        students: kids.size,
        onTime: null,
        incidents: incidentCount,
      },
      items,
      tripSummary: byStatus,
      upcoming,
      reminders: [],
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/calendar-events', async (req, res) => {
  try {
    const schoolId = resolveSchoolId(req);
    if (!schoolId) return res.status(400).json({ error: 'schoolId is required' });
    const title = String(req.body.title || '').trim();
    if (!title) return res.status(400).json({ error: 'title is required' });
    const startAt = req.body.startAt ? new Date(req.body.startAt) : null;
    if (!startAt || Number.isNaN(startAt.getTime())) {
      return res.status(400).json({ error: 'startAt is required' });
    }
    const category = ['academic', 'event', 'holiday', 'meeting'].includes(req.body.category)
      ? req.body.category
      : 'event';
    const endAt = req.body.endAt ? new Date(req.body.endAt) : null;
    const row = await CalendarEvent.create({
      schoolId,
      title,
      body: String(req.body.body || '').trim().slice(0, 1000),
      category,
      startAt,
      endAt: endAt && !Number.isNaN(endAt.getTime()) ? endAt : null,
      allDay: Boolean(req.body.allDay),
      venue: String(req.body.venue || '').trim().slice(0, 160),
    });
    res.status(201).json({ event: serializeCalEvent(row) });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

const INCIDENT_TYPE_OPTIONS = [
  { id: 'accident', label: 'Accident' },
  { id: 'breakdown', label: 'Breakdown' },
  { id: 'traffic', label: 'Traffic Jam' },
  { id: 'road_block', label: 'Road Block' },
  { id: 'weather', label: 'Weather Hazard' },
  { id: 'passenger', label: 'Passenger Issue' },
  { id: 'unsafe', label: 'Unsafe Behavior' },
  { id: 'other', label: 'Other' },
];

function shortIncidentId(id) {
  return String(id || '').slice(-6).toUpperCase();
}

function serializeIncidentRow(inc, trip) {
  const at = inc.occurredAt || trip.serviceDate || trip.createdAt || null;
  const loc = inc.location;
  const hasGps = Number.isFinite(Number(loc?.lat)) && Number.isFinite(Number(loc?.lng));
  return {
    id: String(inc._id),
    shortId: shortIncidentId(inc._id),
    tripId: String(trip._id),
    tripCode: trip.tripCode || '',
    tripStatus: trip.status || '',
    type: inc.type || 'other',
    label: INCIDENT_LABELS[inc.type] || inc.type || 'Other',
    details: inc.details || '',
    severity: ['high', 'medium', 'low'].includes(inc.severity) ? inc.severity : 'medium',
    occurredAt: at,
    locationLabel: incidentPlace(inc) || '',
    location: hasGps ? { lat: Number(loc.lat), lng: Number(loc.lng), at: loc.at || null } : null,
    nextStopName: inc.nextStopName || '',
    nextStopKm: inc.nextStopKm ?? null,
    photoUrls: Array.isArray(inc.photoUrls) ? inc.photoUrls.filter(Boolean) : [],
    bus: trip.busId
      ? { _id: trip.busId._id, plate: trip.busId.plate || '', label: trip.busId.label || '' }
      : null,
    driver: trip.driverId
      ? { _id: trip.driverId._id, name: trip.driverId.name || '', phone: trip.driverId.phone || '' }
      : null,
    route: trip.routeId ? { _id: trip.routeId._id, name: trip.routeId.name || '' } : null,
    status: null,
  };
}

router.get('/incidents', async (req, res) => {
  try {
    const schoolId = resolveSchoolId(req);
    const from = req.query.from ? startOfDay(req.query.from) : monthStart();
    const to = req.query.to ? endOfDay(req.query.to) : endOfDay(new Date());
    const type = String(req.query.type || '');
    const severity = String(req.query.severity || '');
    const q = String(req.query.q || '').trim().toLowerCase();

    const filter = { 'incidents.0': { $exists: true } };
    if (schoolId) filter.schoolId = schoolId;

    const monthFrom = monthStart();

    const tripSelect =
      'incidents tripCode status serviceDate scheduledFor createdAt busId driverId routeId latestLocation';
    const withTrip = (query) =>
      query
        .populate('busId', 'plate label')
        .populate('driverId', 'name phone')
        .populate('routeId', 'name');

    const [trips, recentTrips] = await Promise.all([
      withTrip(Trip.find(filter).select(tripSelect)),
      withTrip(
        Trip.find(schoolId ? { schoolId } : {})
          .sort({ serviceDate: -1, scheduledFor: -1, createdAt: -1 })
          .limit(60)
          .select('tripCode status serviceDate scheduledFor busId driverId routeId latestLocation')
      ),
    ]);

    const inRange = [];
    let thisMonth = 0;
    for (const t of trips) {
      for (const inc of t.incidents || []) {
        const row = serializeIncidentRow(inc, t);
        const at = row.occurredAt ? new Date(row.occurredAt) : null;
        if (at && at >= monthFrom) thisMonth += 1;
        if (at && (at < from || at > to)) continue;
        inRange.push(row);
      }
    }

    const byType = {};
    const bySeverity = { high: 0, medium: 0, low: 0 };
    for (const row of inRange) {
      byType[row.type] = (byType[row.type] || 0) + 1;
      bySeverity[row.severity] += 1;
    }

    let rows = inRange;
    if (type) rows = rows.filter((r) => r.type === type);
    if (severity) rows = rows.filter((r) => r.severity === severity);
    if (q) {
      rows = rows.filter((r) =>
        [
          r.shortId,
          r.details,
          r.label,
          r.tripCode,
          r.locationLabel,
          r.bus?.plate,
          r.bus?.label,
          r.driver?.name,
          r.route?.name,
        ]
          .filter(Boolean)
          .join(' ')
          .toLowerCase()
          .includes(q)
      );
    }
    rows.sort((a, b) => new Date(b.occurredAt || 0) - new Date(a.occurredAt || 0));

    const typeBars = INCIDENT_TYPE_OPTIONS.map((opt) => ({
      id: opt.id,
      label: opt.label,
      count: byType[opt.id] || 0,
    })).filter((item) => item.count > 0);

    res.json({
      incidents: rows,
      types: INCIDENT_TYPE_OPTIONS,
      stats: {
        total: inRange.length,
        thisMonth,
        byType,
        bySeverity,
        typeBars,
      },
      trips: recentTrips.map((t) => ({
        _id: t._id,
        tripCode: t.tripCode || '',
        status: t.status || '',
        serviceDate: t.serviceDate || t.scheduledFor || null,
        bus: t.busId ? { plate: t.busId.plate || '', label: t.busId.label || '' } : null,
        driver: t.driverId ? { name: t.driverId.name || '' } : null,
        route: t.routeId ? { name: t.routeId.name || '' } : null,
        hasGps:
          Number.isFinite(Number(t.latestLocation?.lat)) &&
          Number.isFinite(Number(t.latestLocation?.lng)),
      })),
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/incidents', async (req, res) => {
  try {
    const schoolId = resolveSchoolId(req);
    const tripId = String(req.body?.tripId || '');
    if (!/^[a-f0-9]{24}$/i.test(tripId)) return res.status(400).json({ error: 'Choose a trip.' });
    const typeIds = INCIDENT_TYPE_OPTIONS.map((t) => t.id);
    const type = String(req.body?.type || '').trim();
    if (!typeIds.includes(type)) return res.status(400).json({ error: 'Choose an incident type.' });
    const severity = ['low', 'medium', 'high'].includes(req.body?.severity) ? req.body.severity : 'medium';
    const details = String(req.body?.details || '').trim().slice(0, 500);
    if (!details) return res.status(400).json({ error: 'Describe what happened.' });
    const occurredAt = req.body?.occurredAt ? new Date(req.body.occurredAt) : new Date();
    if (Number.isNaN(occurredAt.getTime())) return res.status(400).json({ error: 'Invalid date and time.' });

    const trip = await Trip.findById(tripId);
    if (!trip) return res.status(404).json({ error: 'Trip not found' });
    if (!assertSchoolAccess(req, trip.schoolId)) {
      return res.status(403).json({ error: 'Cannot add an incident on another school' });
    }

    const lat = Number(req.body?.lat);
    const lng = Number(req.body?.lng);
    const location =
      Number.isFinite(lat) && Number.isFinite(lng)
        ? { lat, lng, at: new Date() }
        : trip.latestLocation?.lat != null
          ? {
              lat: trip.latestLocation.lat,
              lng: trip.latestLocation.lng,
              at: trip.latestLocation.at || new Date(),
            }
          : null;

    if (!Array.isArray(trip.incidents)) trip.incidents = [];
    trip.incidents.push({
      type,
      severity,
      details,
      occurredAt,
      location,
      nextStopName: String(req.body?.nextStopName || '').trim().slice(0, 120),
      nextStopKm: Number.isFinite(Number(req.body?.nextStopKm)) ? Number(req.body.nextStopKm) : null,
      photoUrls: [],
    });
    await trip.save();
    const incident = trip.incidents[trip.incidents.length - 1];
    const typeLabel = INCIDENT_TYPE_OPTIONS.find((t) => t.id === type)?.label || type;

    const admins = await User.find({
      schoolId: trip.schoolId || schoolId,
      role: 'school_admin',
      active: { $ne: false },
    }).select('_id');
    if (admins.length) {
      await createAndEmitNotifications(
        getIO(),
        admins.map((a) => ({
          userId: a._id,
          type: 'reminder',
          title: `Incident reported · ${typeLabel}`,
          body: details.slice(0, 200),
          tripId: trip._id,
          important: severity === 'high',
          key: `${a._id}:incident:${incident._id}`,
        }))
      );
    }

    const populated = await Trip.findById(trip._id)
      .populate('busId', 'plate label')
      .populate('driverId', 'name phone')
      .populate('routeId', 'name');
    res.status(201).json({ incident: serializeIncidentRow(incident, populated) });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.delete('/calendar-events/:id', async (req, res) => {
  try {
    const row = await CalendarEvent.findById(req.params.id);
    if (!row) return res.status(404).json({ error: 'Event not found' });
    if (!assertSchoolAccess(req, row.schoolId)) {
      return res.status(403).json({ error: 'Cannot delete event from another school' });
    }
    row.active = false;
    await row.save();
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
