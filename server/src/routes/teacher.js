import { Router } from 'express';
import {
  User,
  Kid,
  Trip,
  TripEvent,
  Stop,
  DriverProfile,
  School,
  Announcement,
} from '../models/index.js';
import { authenticate, requireRole } from '../middleware/auth.js';

const router = Router();
router.use(authenticate, requireRole('teacher'));

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
  return { start, end };
}

function populateTrip(q) {
  return q
    .populate('routeId', 'name')
    .populate('schoolId', 'name location address')
    .populate('driverId', 'name phone')
    .populate('busId', 'plate label seats')
    .populate('kidIds', 'name grade house admissionNo');
}

function attendanceFromEvents(events, kidIds = []) {
  const picked = new Set(
    events.filter((e) => e.type === 'picked_up').map((e) => String(e.kidId?._id || e.kidId))
  );
  const dropped = new Set(
    events.filter((e) => e.type === 'dropped_off').map((e) => String(e.kidId?._id || e.kidId))
  );
  let checkedIn = 0;
  for (const id of picked) {
    if (!dropped.has(id)) checkedIn += 1;
  }
  return {
    checkedIn,
    checkedOut: dropped.size,
    waiting: Math.max(0, kidIds.length - picked.size),
    studentCount: kidIds.length,
  };
}

function kidTransportStatus(kidId, tripsWithEvents) {
  const id = kidId.toString();
  const involved = tripsWithEvents.filter((row) =>
    (row.trip.kidIds || []).some((k) => (k._id || k).toString() === id)
  );
  if (!involved.length) {
    return { status: 'not_scheduled', label: 'Not on today’s trips', trip: null };
  }

  const active = involved.find((row) => row.trip.status === 'active');
  const row =
    active ||
    [...involved].sort((a, b) => {
      const ta = new Date(a.trip.scheduledFor || a.trip.startedAt || 0).getTime();
      const tb = new Date(b.trip.scheduledFor || b.trip.startedAt || 0).getTime();
      return tb - ta;
    })[0];

  const events = row.events || [];
  const picked = events.some((e) => String(e.kidId?._id || e.kidId) === id && e.type === 'picked_up');
  const dropped = events.some(
    (e) => String(e.kidId?._id || e.kidId) === id && e.type === 'dropped_off'
  );
  const trip = row.trip;
  const direction = trip.direction === 'to_school' ? 'to school' : 'to home';

  if (dropped) {
    return {
      status: trip.direction === 'to_school' ? 'arrived' : 'dropped_off',
      label: trip.direction === 'to_school' ? 'Arrived at school' : 'Dropped off',
      trip,
    };
  }
  if (picked) {
    return { status: 'on_bus', label: `On bus (${direction})`, trip };
  }
  if (trip.status === 'active') {
    return { status: 'waiting', label: 'Waiting for pickup', trip };
  }
  if (trip.status === 'scheduled') {
    return { status: 'scheduled', label: `Scheduled ${direction}`, trip };
  }
  if (trip.status === 'cancelled') {
    return { status: 'cancelled', label: 'Trip cancelled', trip };
  }
  return { status: 'completed', label: 'Trip completed', trip };
}

async function teacherSchoolId(req) {
  const teacher = await User.findById(req.user.id).select('schoolId name');
  return { teacher, schoolId: teacher?.schoolId || null };
}

async function todayTripsForSchool(schoolId, dateInput) {
  const { start, end } = dayBounds(dateInput);
  return populateTrip(
    Trip.find({
      schoolId,
      $or: [
        { serviceDate: { $gte: start, $lte: end } },
        { serviceDate: null, scheduledFor: { $gte: start, $lte: end } },
        { serviceDate: null, scheduledFor: null, status: 'active' },
      ],
    }).sort({ period: 1, sequence: 1, scheduledFor: 1 })
  );
}

async function withEvents(trips) {
  return Promise.all(
    trips.map(async (trip) => {
      const events = await TripEvent.find({ tripId: trip._id }).sort({ at: 1 });
      const attendance = attendanceFromEvents(events, trip.kidIds || []);
      return { trip, events, attendance };
    })
  );
}

router.get('/overview', async (req, res) => {
  try {
    const { schoolId } = await teacherSchoolId(req);
    if (!schoolId) {
      return res.json({
        school: null,
        stats: { students: 0, scheduledToday: 0, activeTrips: 0, onboard: 0, arrived: 0 },
        kids: [],
        activeTrips: [],
        todayTrips: [],
      });
    }

    const school = await School.findById(schoolId);
    const kids = await Kid.find({ schoolId, active: true })
      .populate('routeId', 'name')
      .populate('homeStopId', 'name')
      .populate('parentIds', 'name phone')
      .sort({ name: 1 });

    const trips = await todayTripsForSchool(schoolId, req.query.date);
    const rows = await withEvents(trips);
    const activeRows = rows.filter((r) => r.trip.status === 'active');

    let onboard = 0;
    let arrived = 0;
    for (const kid of kids) {
      const st = kidTransportStatus(kid._id, rows);
      if (st.status === 'on_bus') onboard += 1;
      if (st.status === 'arrived') arrived += 1;
    }

    res.json({
      school,
      stats: {
        students: kids.length,
        scheduledToday: rows.filter((r) => r.trip.status === 'scheduled').length,
        activeTrips: activeRows.length,
        onboard,
        arrived,
      },
      kids: kids.map((kid) => {
        const st = kidTransportStatus(kid._id, rows);
        return {
          ...kid.toObject(),
          transport: {
            status: st.status,
            label: st.label,
            tripCode: st.trip?.tripCode || '',
            tripId: st.trip?._id || null,
            period: st.trip?.period || null,
            direction: st.trip?.direction || null,
          },
        };
      }),
      activeTrips: activeRows.map((r) => ({
        trip: r.trip,
        events: r.events,
        ...r.attendance,
      })),
      todayTrips: rows.map((r) => ({
        trip: r.trip,
        ...r.attendance,
      })),
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/kids', async (req, res) => {
  try {
    const { schoolId } = await teacherSchoolId(req);
    if (!schoolId) return res.json({ kids: [] });

    const kids = await Kid.find({ schoolId, active: true })
      .populate('routeId', 'name')
      .populate('homeStopId', 'name location')
      .populate('parentIds', 'name phone email')
      .sort({ name: 1 });

    const trips = await todayTripsForSchool(schoolId, req.query.date);
    const rows = await withEvents(trips);

    res.json({
      kids: kids.map((kid) => {
        const st = kidTransportStatus(kid._id, rows);
        return {
          ...kid.toObject(),
          transport: {
            status: st.status,
            label: st.label,
            tripCode: st.trip?.tripCode || '',
            tripId: st.trip?._id || null,
            period: st.trip?.period || null,
            direction: st.trip?.direction || null,
            bus: st.trip?.busId || null,
            driver: st.trip?.driverId || null,
          },
        };
      }),
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/trips/today', async (req, res) => {
  try {
    const { schoolId } = await teacherSchoolId(req);
    if (!schoolId) return res.json({ trips: [] });

    const trips = await todayTripsForSchool(schoolId, req.query.date);
    const rows = await withEvents(trips);
    const enriched = await Promise.all(
      rows.map(async (r) => {
        const stops = await Stop.find({ routeId: r.trip.routeId?._id || r.trip.routeId }).sort({
          order: 1,
        });
        return {
          trip: r.trip,
          events: r.events,
          stops,
          ...r.attendance,
        };
      })
    );
    res.json({ trips: enriched });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/trips/active', async (req, res) => {
  try {
    const { schoolId } = await teacherSchoolId(req);
    if (!schoolId) return res.json({ trips: [] });

    const kids = await Kid.find({ schoolId, active: true });
    const kidIds = kids.map((k) => k._id);
    const trips = await populateTrip(
      Trip.find({ status: 'active', schoolId, kidIds: { $in: kidIds } }).sort({ startedAt: -1 })
    );

    const enriched = await Promise.all(
      trips.map(async (trip) => {
        const [events, stops, profile] = await Promise.all([
          TripEvent.find({ tripId: trip._id }).sort({ at: 1 }),
          Stop.find({ routeId: trip.routeId._id || trip.routeId }).sort({ order: 1 }),
          DriverProfile.findOne({ userId: trip.driverId._id || trip.driverId }),
        ]);
        const attendance = attendanceFromEvents(events, trip.kidIds || []);
        return { trip, events, stops, driverProfile: profile, kids, ...attendance };
      })
    );

    res.json({ trips: enriched });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/trips/:id', async (req, res) => {
  try {
    const { schoolId } = await teacherSchoolId(req);
    const trip = await populateTrip(Trip.findById(req.params.id));
    if (!trip) return res.status(404).json({ error: 'Trip not found' });
    if (schoolId && trip.schoolId?._id?.toString() !== schoolId.toString()) {
      return res.status(403).json({ error: 'Not authorized for this trip' });
    }

    const [events, stops] = await Promise.all([
      TripEvent.find({ tripId: trip._id }).sort({ at: 1 }),
      Stop.find({ routeId: trip.routeId._id || trip.routeId }).sort({ order: 1 }),
    ]);
    const attendance = attendanceFromEvents(events, trip.kidIds || []);
    res.json({ trip, events, stops, ...attendance });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/live-tracking', async (req, res) => {
  try {
    const { schoolId } = await teacherSchoolId(req);
    if (!schoolId) return res.json({ buses: [] });

    const trips = await Trip.find({ status: 'active', schoolId })
      .populate('routeId', 'name')
      .populate('busId', 'plate label seats')
      .populate('driverId', 'name phone')
      .populate('schoolId', 'name')
      .populate('kidIds', 'name grade')
      .sort({ startedAt: -1 });

    const enriched = await Promise.all(
      trips.map(async (trip) => {
        const events = await TripEvent.find({ tripId: trip._id });
        const attendance = attendanceFromEvents(events, trip.kidIds || []);
        return {
          trip,
          ...attendance,
          lastGpsAt: trip.latestLocation?.at || trip.startLocation?.at || null,
        };
      })
    );

    res.json({ buses: enriched });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/announcements', async (req, res) => {
  try {
    const { schoolId } = await teacherSchoolId(req);
    if (!schoolId) return res.json({ announcements: [] });
    const announcements = await Announcement.find({ schoolId, active: true })
      .sort({ publishedAt: -1 })
      .limit(100);
    res.json({ announcements });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
