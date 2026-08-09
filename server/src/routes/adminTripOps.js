import { Router } from 'express';
import {
  TripSchedule,
  Trip,
  TripEvent,
  Route,
  Bus,
  User,
  Kid,
} from '../models/index.js';
import {
  generateInstancesForSchedule,
  startOfDay,
  endOfDay,
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

    const allowed = [
      'name',
      'scheduleType',
      'customDays',
      'period',
      'direction',
      'routeId',
      'busId',
      'driverId',
      'scheduledTime',
      'startDate',
      'endDate',
      'kidIds',
      'active',
    ];
    for (const key of allowed) {
      if (req.body[key] !== undefined) {
        if (key === 'startDate' || key === 'endDate') {
          existing[key] = req.body[key] ? startOfDay(req.body[key]) : null;
        } else {
          existing[key] = req.body[key];
        }
      }
    }
    await existing.save();
    const schedule = await populateSchedule(TripSchedule.findById(existing._id));
    res.json({ schedule });
  } catch (err) {
    res.status(400).json({ error: err.message });
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
    res.json({ trips });
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
    res.json({ trip, events });
  } catch (err) {
    res.status(500).json({ error: err.message });
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
