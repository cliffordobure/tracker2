import { Router } from 'express';
import {
  TripSchedule,
  Trip,
  TripEvent,
  Route,
  Bus,
  User,
  Kid,
  SchoolHoliday,
  ScheduleException,
} from '../models/index.js';
import {
  generateInstancesForSchedule,
  applyScheduleEdit,
  startOfDay,
  endOfDay,
  dateKey,
  scheduledForFrom,
  findPeriodConflict,
} from '../services/tripScheduleService.js';
import { notifyTripCancelled } from '../services/notifications.js';
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
    .populate('routeId', 'name')
    .populate('busId', 'plate label seats')
    .populate('driverId', 'name email phone')
    .populate('scheduleId', 'name period scheduleType scheduledTime')
    .populate('kidIds', 'name grade homeStopId');
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
    if (req.query.period) filter.period = req.query.period;
    if (req.query.date) {
      filter.serviceDate = {
        $gte: startOfDay(req.query.date),
        $lte: endOfDay(req.query.date),
      };
    }
    const trips = await populateTrip(Trip.find(filter).sort({ serviceDate: 1, period: 1, createdAt: 1 }));
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
      return { ...t.toObject(), exception };
    });
    res.json({ trips: enriched });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/trip-instances/:id', async (req, res) => {
  try {
    const trip = await populateTrip(Trip.findById(req.params.id));
    if (!trip) return res.status(404).json({ error: 'Trip instance not found' });
    if (!assertSchoolAccess(req, trip.schoolId)) {
      return res.status(403).json({ error: 'Cannot view trip from another school' });
    }
    const events = await TripEvent.find({ tripId: trip._id }).sort({ at: 1 });
    let exception = null;
    if (trip.scheduleId && trip.serviceDate) {
      exception = await ScheduleException.findOne({
        scheduleId: trip.scheduleId._id || trip.scheduleId,
        serviceDate: { $gte: startOfDay(trip.serviceDate), $lte: endOfDay(trip.serviceDate) },
      });
    }
    res.json({ trip, events, exception });
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
    if (!trip.scheduleId || !trip.serviceDate) {
      return res.status(400).json({ error: 'Trip is not linked to a schedule/service date' });
    }

    const schedule = await TripSchedule.findById(trip.scheduleId);
    if (!schedule) return res.status(404).json({ error: 'Schedule not found' });

    const busId = req.body.busId ?? trip.busId;
    const driverId = req.body.driverId ?? trip.driverId;
    const kidIds = req.body.kidIds ?? trip.kidIds;
    const scheduledTime = req.body.scheduledTime ?? schedule.scheduledTime;

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
        scheduledTime,
      },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );

    trip.busId = busId;
    trip.driverId = driverId;
    trip.kidIds = kidIds;
    trip.scheduledFor = scheduledForFrom(day, scheduledTime);
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

// ——— Live tracking ———
router.get('/live-tracking', async (req, res) => {
  try {
    const filter = { status: 'active' };
    const schoolId = resolveSchoolId(req);
    if (schoolId) filter.schoolId = schoolId;

    const trips = await Trip.find(filter)
      .populate('routeId', 'name')
      .populate('busId', 'plate label seats')
      .populate('driverId', 'name phone')
      .populate('schoolId', 'name')
      .populate('kidIds', 'name')
      .sort({ startedAt: -1 });

    const enriched = await Promise.all(
      trips.map(async (trip) => {
        const events = await TripEvent.find({ tripId: trip._id });
        const picked = new Set(
          events.filter((e) => e.type === 'picked_up').map((e) => e.kidId.toString())
        );
        const dropped = new Set(
          events.filter((e) => e.type === 'dropped_off').map((e) => e.kidId.toString())
        );
        let checkedIn = 0;
        for (const id of picked) {
          if (!dropped.has(id)) checkedIn += 1;
        }
        return {
          trip,
          checkedIn,
          checkedOut: dropped.size,
          studentCount: (trip.kidIds || []).length,
          lastGpsAt: trip.latestLocation?.at || null,
        };
      })
    );

    res.json({ buses: enriched });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
