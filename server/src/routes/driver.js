import { Router } from 'express';
import { DriverProfile, Route, Stop, Kid, Trip, TripEvent, LocationPing, Notification, DeviceToken, User, Conversation, Message, TripSchedule, School, MediaAsset } from '../models/index.js';
import { authenticate, requireRole } from '../middleware/auth.js';
import { getIO } from '../socket.js';
import { createAndEmitNotifications } from '../services/notifications.js';
import { datesForSchedule } from '../services/tripScheduleService.js';
import { isCloudinaryConfigured } from '../services/cloudinary.js';

const router = Router();
router.use(authenticate, requireRole('driver'));

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

function kmBetweenStops(a, b) {
  const lat1 = Number(a?.location?.lat);
  const lng1 = Number(a?.location?.lng);
  const lat2 = Number(b?.location?.lat);
  const lng2 = Number(b?.location?.lng);
  if (![lat1, lng1, lat2, lng2].every((n) => Number.isFinite(n))) return 0;
  const toRad = (d) => (d * Math.PI) / 180;
  const R = 6371;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const s =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(s)));
}

function orderStopsForDirection(stops, direction) {
  const list = [...stops];
  const school = list.filter((s) => s.type === 'school').sort((a, b) => (a.order || 0) - (b.order || 0));
  const homes = list.filter((s) => s.type !== 'school').sort((a, b) => (a.order || 0) - (b.order || 0));
  const schoolOne = school.slice(0, 1);
  return direction === 'to_home' ? [...schoolOne, ...homes] : [...homes, ...schoolOne];
}

function studentsAtStop(stop, kids) {
  if (stop.type === 'school') return kids.length;
  const id = String(stop._id);
  return kids.filter((k) => String(k.homeStopId?._id || k.homeStopId) === id).length;
}

function daysOfOperation(schedule) {
  if (!schedule) return '';
  if (schedule.scheduleType === 'EVERY_DAY') return 'Daily';
  if (schedule.scheduleType === 'WEEKDAYS') return 'Mon - Fri';
  if (schedule.scheduleType === 'CUSTOM_DAYS') {
    const names = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    const days = (schedule.customDays || []).map((d) => names[d]).filter(Boolean);
    return days.join(', ');
  }
  if (schedule.scheduleType === 'ONE_TIME') return 'One-time';
  return '';
}

function buildRouteDirectionPlan({ stops, kids, trip, direction, school, label, description }) {
  const ordered = orderStopsForDirection(stops, direction);
  const start = trip
    ? trip.startedAt
      ? new Date(trip.startedAt)
      : combineServiceTime(trip.serviceDate, trip.scheduleId?.scheduledTime, trip.scheduledFor)
    : null;
  const durationMins = tripDurationMins(trip || {}, ordered.length);
  let distanceKm = 0;
  for (let i = 1; i < ordered.length; i += 1) {
    distanceKm += kmBetweenStops(ordered[i - 1], ordered[i]);
  }
  const schoolAddress = typeof school?.address === 'string' ? school.address.trim() : '';
  const mapped = ordered.map((stop, index) => {
    const doc = typeof stop.toObject === 'function' ? stop.toObject() : stop;
    const eta = start ? new Date(start.getTime() + index * 8 * 60000) : null;
    const isSchool = doc.type === 'school';
    return {
      ...doc,
      index: index + 1,
      studentCount: studentsAtStop(doc, kids),
      time: formatDriverClock(eta),
      address: doc.address || (isSchool ? schoolAddress : '') || doc.name || '',
    };
  });
  const schedule = trip?.scheduleId && typeof trip.scheduleId === 'object' ? trip.scheduleId : null;
  return {
    label,
    direction,
    trip: trip
      ? {
          _id: trip._id,
          status: trip.status,
          direction: trip.direction,
          period: trip.period,
          scheduledFor: trip.scheduledFor,
          startedAt: trip.startedAt,
        }
      : null,
    stops: mapped,
    stats: {
      distanceKm: distanceKm > 0 ? Math.round(distanceKm * 10) / 10 : 0,
      stopCount: mapped.length,
      studentCount: kids.length,
      durationMins,
    },
    info: {
      routeName: label,
      schoolName: school?.name || '',
      days: daysOfOperation(schedule),
      startTime: mapped[0]?.time || formatDriverClock(start),
      dropOffTime: mapped[mapped.length - 1]?.time || '',
      status: trip?.status === 'active' ? 'Active' : trip ? 'Scheduled' : 'Idle',
      notes: typeof description === 'string' ? description.trim() : '',
    },
  };
}

router.get('/routes', async (req, res) => {
  try {
    const profile = await DriverProfile.findOne({ userId: req.user.id }).populate(
      'busId',
      'plate label seats'
    );

    // Prefer routes from today's scheduled/active trips; fall back to assigned preferences
    const { start, end } = dayBounds();
    const todayTrips = await Trip.find({
      driverId: req.user.id,
      status: { $in: ['scheduled', 'active'] },
      $or: [
        { serviceDate: { $gte: start, $lte: end } },
        { scheduledFor: { $gte: start, $lte: end } },
        { scheduledFor: null, serviceDate: null, status: 'active' },
      ],
    }).select('routeId');

    const routeIds = new Set(todayTrips.map((t) => t.routeId.toString()));
    for (const id of profile?.assignedRouteIds || []) {
      routeIds.add(id.toString());
    }

    const routes = await Route.find({
      _id: { $in: [...routeIds] },
      active: true,
    }).populate('schoolId', 'name location address');

    const enriched = await Promise.all(
      routes.map(async (route) => {
        const [stops, kids, activeTrip, scheduledTrips] = await Promise.all([
          Stop.find({ routeId: route._id }).sort({ order: 1 }),
          Kid.find({ routeId: route._id, active: true })
            .select('name grade house photoUrl homeStopId')
            .populate('parentIds', 'name phone'),
          Trip.findOne({ routeId: route._id, driverId: req.user.id, status: 'active' })
            .populate('scheduleId', 'name scheduledTime scheduleType customDays period direction')
            .populate('busId', 'plate label seats')
            .populate('kidIds', 'name grade homeStopId'),
          Trip.find({
            routeId: route._id,
            driverId: req.user.id,
            status: 'scheduled',
            $or: [
              { serviceDate: { $gte: start, $lte: end } },
              { scheduledFor: { $gte: start, $lte: end } },
            ],
          })
            .populate('scheduleId', 'name scheduledTime scheduleType customDays period direction')
            .populate('busId', 'plate label seats')
            .populate('kidIds', 'name grade homeStopId')
            .sort({ sequence: 1 }),
        ]);
        const school = route.schoolId && typeof route.schoolId === 'object' ? route.schoolId : null;
        const allTrips = [...(activeTrip ? [activeTrip] : []), ...scheduledTrips];
        const morningTrip =
          allTrips.find((t) => t.direction === 'to_school' || t.period === 'morning') || null;
        const afternoonTrip =
          allTrips.find((t) => t.direction === 'to_home' || t.period === 'afternoon' || t.period === 'evening') ||
          null;
        return {
          ...route.toObject(),
          stops,
          kids,
          activeTrip,
          scheduledTrips,
          morning: buildRouteDirectionPlan({
            stops,
            kids,
            trip: morningTrip,
            direction: 'to_school',
            school,
            label: 'Morning Route',
            description: route.description,
          }),
          afternoon: buildRouteDirectionPlan({
            stops,
            kids,
            trip: afternoonTrip,
            direction: 'to_home',
            school,
            label: 'Afternoon Route',
            description: route.description,
          }),
        };
      })
    );

    const bus = profile?.busId && typeof profile.busId === 'object' ? profile.busId : null;
    res.json({
      routes: enriched,
      profile,
      vehicle: {
        name: bus?.label || profile?.vehicleModel || 'School Bus',
        plate: bus?.plate || profile?.vehiclePlate || '',
        active: Boolean(enriched.some((r) => r.activeTrip)),
      },
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

async function enrichTripsWithStopCounts(trips) {
  const routeIds = [
    ...new Set(
      trips
        .map((t) => (t.routeId?._id || t.routeId)?.toString())
        .filter(Boolean)
    ),
  ];
  const counts = {};
  await Promise.all(
    routeIds.map(async (routeId) => {
      counts[routeId] = await Stop.countDocuments({ routeId });
    })
  );
  return trips.map((t) => {
    const obj = typeof t.toObject === 'function' ? t.toObject() : { ...t };
    const rid = (obj.routeId?._id || obj.routeId)?.toString();
    return {
      ...obj,
      stopCount: rid ? counts[rid] || 0 : 0,
      studentCount: Array.isArray(obj.kidIds) ? obj.kidIds.length : 0,
    };
  });
}

function formatDriverClock(d) {
  if (!d) return '';
  const x = new Date(d);
  if (Number.isNaN(x.getTime())) return '';
  let h = x.getHours();
  const m = String(x.getMinutes()).padStart(2, '0');
  const ampm = h >= 12 ? 'PM' : 'AM';
  h = h % 12 || 12;
  return `${h}:${m} ${ampm}`;
}

function combineServiceTime(serviceDate, scheduledTime, scheduledFor) {
  if (scheduledFor) {
    const d = new Date(scheduledFor);
    if (!Number.isNaN(d.getTime())) return d;
  }
  const base = serviceDate ? new Date(serviceDate) : new Date();
  if (!scheduledTime) return Number.isNaN(base.getTime()) ? null : base;
  const [hh, mm] = String(scheduledTime).split(':').map(Number);
  const d = new Date(base);
  d.setHours(Number.isFinite(hh) ? hh : 0, Number.isFinite(mm) ? mm : 0, 0, 0);
  return d;
}

function tripDurationMins(trip, stopCount) {
  if (trip.startedAt && trip.endedAt) {
    const mins = Math.round((new Date(trip.endedAt) - new Date(trip.startedAt)) / 60000);
    if (Number.isFinite(mins) && mins > 0) return mins;
  }
  const n = Number(stopCount) || 0;
  if (n > 0) return Math.max(30, Math.min(90, n * 8));
  return 60;
}

async function routeEnds(routeId, direction) {
  if (!routeId) return { originName: '', destinationName: '', stopCount: 0 };
  const stops = await Stop.find({ routeId }).sort({ order: 1 });
  const school = stops.find((s) => s.type === 'school');
  const homes = stops.filter((s) => s.type !== 'school');
  const toHome = direction === 'to_home';
  const origin = toHome ? school?.name || 'School' : homes[0]?.name || 'Pickup';
  const dest = toHome
    ? homes[homes.length - 1]?.name || homes[0]?.name || 'Home'
    : school?.name || 'School';
  return { originName: origin, destinationName: dest, stopCount: stops.length };
}

async function boardingForTrip(trip) {
  const kidIds = (trip.kidIds || []).map((k) => (k?._id || k)?.toString()).filter(Boolean);
  const studentCount = kidIds.length;
  if (trip.status !== 'active') {
    return { studentCount, studentsOnBoard: 0, pendingCheckouts: 0 };
  }
  const events = await TripEvent.find({ tripId: trip._id }).select('kidId type');
  const picked = new Set(events.filter((e) => e.type === 'picked_up').map((e) => e.kidId.toString()));
  const dropped = new Set(events.filter((e) => e.type === 'dropped_off').map((e) => e.kidId.toString()));
  let onBoard = 0;
  for (const id of picked) {
    if (!dropped.has(id)) onBoard += 1;
  }
  return { studentCount, studentsOnBoard: onBoard, pendingCheckouts: onBoard };
}

async function serializeDriverTripCard(trip) {
  const obj = typeof trip.toObject === 'function' ? trip.toObject() : { ...trip };
  const routeId = obj.routeId?._id || obj.routeId;
  const ends = await routeEnds(routeId, obj.direction);
  const board = await boardingForTrip(obj);
  const start = obj.startedAt
    ? new Date(obj.startedAt)
    : combineServiceTime(obj.serviceDate, obj.scheduleId?.scheduledTime, obj.scheduledFor);
  const durationMins = tripDurationMins(obj, ends.stopCount);
  const end = obj.endedAt
    ? new Date(obj.endedAt)
    : start
      ? new Date(start.getTime() + durationMins * 60000)
      : null;
  const startLabel = formatDriverClock(start);
  const endLabel = formatDriverClock(end);
  return {
    ...obj,
    originName: ends.originName,
    destinationName: ends.destinationName,
    stopCount: ends.stopCount,
    studentCount: board.studentCount,
    studentsOnBoard: board.studentsOnBoard,
    pendingCheckouts: board.pendingCheckouts,
    durationMins,
    startAt: start,
    endAt: end,
    startTime: startLabel,
    endTime: endLabel,
    timeRange: startLabel && endLabel ? `${startLabel} - ${endLabel}` : startLabel || endLabel || '',
  };
}

router.get('/overview', async (req, res) => {
  try {
    const { start, end } = dayBounds(req.query.date);
    const [user, profile, unread, todayDocs] = await Promise.all([
      User.findById(req.user.id).select('name photoUrl'),
      DriverProfile.findOne({ userId: req.user.id }).populate('busId', 'plate label seats'),
      Notification.countDocuments({ userId: req.user.id, read: { $ne: true } }),
      Trip.find({
        driverId: req.user.id,
        status: { $in: ['scheduled', 'active'] },
        $or: [
          { serviceDate: { $gte: start, $lte: end } },
          { serviceDate: null, scheduledFor: { $gte: start, $lte: end } },
          { serviceDate: null, scheduledFor: null, status: 'active' },
        ],
      })
        .populate('routeId', 'name')
        .populate('schoolId', 'name location address')
        .populate('busId', 'plate label seats')
        .populate('scheduleId', 'name scheduledTime')
        .populate('kidIds', 'name grade')
        .sort({ period: 1, sequence: 1, scheduledFor: 1 }),
    ]);

    const trips = await Promise.all(todayDocs.map((t) => serializeDriverTripCard(t)));
    const currentTrip = trips.find((t) => t.status === 'active') || trips.find((t) => t.status === 'scheduled') || null;
    const nextTrip =
      trips.find((t) => currentTrip && String(t._id) !== String(currentTrip._id) && t.status === 'scheduled') || null;

    res.json({
      user: user
        ? { _id: user._id, name: user.name || '', photoUrl: user.photoUrl || '' }
        : { name: req.user.name || 'Driver', photoUrl: '' },
      profile,
      unread,
      trips,
      currentTrip,
      nextTrip,
      stats: {
        tripsScheduled: trips.length,
        studentsOnBoard: currentTrip?.studentsOnBoard || 0,
        stopsTotal: currentTrip?.stopCount || nextTrip?.stopCount || 0,
        pendingCheckouts: currentTrip?.pendingCheckouts || 0,
        studentCount: currentTrip?.studentCount || 0,
      },
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/settings', async (req, res) => {
  try {
    const { start, end } = dayBounds();
    const [profile, activeTrip, scheduledTrip, devices, user, contacts] = await Promise.all([
      DriverProfile.findOne({ userId: req.user.id }).populate('busId', 'plate label seats'),
      Trip.findOne({ driverId: req.user.id, status: 'active' })
        .populate('routeId', 'name')
        .populate('schoolId', 'name supportPhone supportEmail supportHours')
        .populate('scheduleId', 'scheduledTime period direction')
        .populate('busId', 'plate label seats'),
      Trip.findOne({
        driverId: req.user.id,
        status: 'scheduled',
        $or: [
          { serviceDate: { $gte: start, $lte: end } },
          { scheduledFor: { $gte: start, $lte: end } },
        ],
      })
        .populate('routeId', 'name')
        .populate('schoolId', 'name supportPhone supportEmail supportHours')
        .populate('scheduleId', 'scheduledTime period direction')
        .populate('busId', 'plate label seats')
        .sort({ scheduledFor: 1, sequence: 1 }),
      DeviceToken.find({ userId: req.user.id }).select('platform userAgent updatedAt createdAt').sort({ updatedAt: -1 }).limit(8),
      User.findById(req.user.id).select('schoolId'),
      driverMessageContacts(req.user.id),
    ]);
    const trip = activeTrip || scheduledTrip;
    let school = trip?.schoolId && typeof trip.schoolId === 'object' ? trip.schoolId : null;
    if (!school && user?.schoolId) {
      school = await School.findById(user.schoolId).select('name supportPhone supportEmail supportHours');
    }
    const bus = trip?.busId || profile?.busId;
    const ends = trip ? await routeEnds(trip.routeId?._id || trip.routeId, trip.direction) : { originName: '', destinationName: '' };
    const startAt = trip
      ? trip.startedAt
        ? new Date(trip.startedAt)
        : combineServiceTime(trip.serviceDate, trip.scheduleId?.scheduledTime, trip.scheduledFor)
      : null;
    const endAt = trip?.endedAt ? new Date(trip.endedAt) : null;
    const timeWindow = [formatDriverClock(startAt), formatDriverClock(endAt)].filter(Boolean).join(' - ');
    const period = trip?.period || (trip?.direction === 'to_home' ? 'afternoon' : trip ? 'morning' : '');
    res.json({
      vehicle: {
        name: bus?.label || profile?.vehicleModel || 'School Bus',
        plate: bus?.plate || profile?.vehiclePlate || '',
      },
      trip: trip
        ? {
            status: trip.status,
            onRoute: trip.status === 'active',
            period,
            timeWindow,
            origin: ends.originName || '',
            destination: ends.destinationName || '',
            routeName: trip.routeId?.name || '',
          }
        : null,
      school: school
        ? {
            name: school.name || '',
            supportPhone: school.supportPhone || '',
            supportEmail: school.supportEmail || '',
            supportHours: school.supportHours || '',
          }
        : { name: '', supportPhone: '', supportEmail: '', supportHours: '' },
      devices: devices.map((d) => ({
        platform: d.platform || '',
        userAgent: d.userAgent || '',
        lastSeen: d.updatedAt || d.createdAt,
      })),
      admins: contacts?.admins || [],
      app: { name: 'SchoolKids Tracker', version: '1.0.0' },
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/vehicle', async (req, res) => {
  try {
    const since = new Date();
    since.setDate(since.getDate() - 90);
    const [profile, activeTrip, user, contacts] = await Promise.all([
      DriverProfile.findOne({ userId: req.user.id }).populate(
        'busId',
        'plate label model color seats year safetyFeatures assistantName assistantPhone active updatedAt'
      ),
      Trip.findOne({ driverId: req.user.id, status: 'active' })
        .populate('schoolId', 'name supportPhone supportEmail supportHours')
        .populate('routeId', 'name')
        .populate('busId', 'plate label'),
      User.findById(req.user.id).select('schoolId'),
      driverMessageContacts(req.user.id),
    ]);
    const bus = profile?.busId && typeof profile.busId === 'object' ? profile.busId : null;
    const busId = bus?._id || null;
    const tripFilter = {
      driverId: req.user.id,
      $or: [{ startedAt: { $gte: since } }, { serviceDate: { $gte: since } }, { status: 'active' }],
    };
    if (busId) tripFilter.busId = busId;
    const trips = await Trip.find(tripFilter)
      .select('status startedAt endedAt latestLocation stopNotes tripCode busId routeId')
      .sort({ startedAt: -1, scheduledFor: -1 })
      .limit(120);
    const tripIds = trips.map((t) => t._id);
    const [pings, lastPing] = await Promise.all([
      tripIds.length ? LocationPing.find({ tripId: { $in: tripIds } }).select('tripId lat lng at').sort({ at: 1 }) : [],
      tripIds.length ? LocationPing.findOne({ tripId: { $in: tripIds } }).sort({ at: -1 }).select('at') : null,
    ]);
    const pingsByTrip = new Map();
    for (const p of pings) {
      const key = String(p.tripId);
      if (!pingsByTrip.has(key)) pingsByTrip.set(key, []);
      pingsByTrip.get(key).push(p);
    }
    let gpsKm = 0;
    for (const list of pingsByTrip.values()) gpsKm += pingPathKm(list);
    gpsKm = round1(gpsKm);

    const notes = [];
    for (const t of trips) {
      for (const n of t.stopNotes || []) {
        const text = String(n.text || '').trim();
        if (!text) continue;
        notes.push({
          text,
          at: n.at || null,
          tripCode: t.tripCode || '',
          tripId: t._id,
          incident: /^incident\b/i.test(text),
        });
      }
    }
    notes.sort((a, b) => new Date(b.at || 0) - new Date(a.at || 0));
    const incidents = notes.filter((n) => n.incident);

    const liveAt = activeTrip?.latestLocation?.at || lastPing?.at || null;
    const liveAgeMs = liveAt ? Date.now() - new Date(liveAt).getTime() : null;
    const gpsLive = Boolean(activeTrip && liveAgeMs != null && liveAgeMs >= 0 && liveAgeMs <= 120000);

    let school = activeTrip?.schoolId && typeof activeTrip.schoolId === 'object' ? activeTrip.schoolId : null;
    if (!school && user?.schoolId) {
      school = await School.findById(user.schoolId).select('name supportPhone supportEmail supportHours');
    }

    const lastTrip = trips.find((t) => t.startedAt || t.endedAt) || null;
    const lastUpdatedAt = [bus?.updatedAt, lastPing?.at, lastTrip?.endedAt, lastTrip?.startedAt]
      .filter(Boolean)
      .map((d) => new Date(d))
      .sort((a, b) => b - a)[0] || null;

    res.json({
      vehicle: {
        assigned: Boolean(bus),
        name: bus?.label || profile?.vehicleModel || '',
        plate: bus?.plate || profile?.vehiclePlate || '',
        model: bus?.model || profile?.vehicleModel || '',
        color: bus?.color || profile?.vehicleColor || '',
        seats: Number.isFinite(Number(bus?.seats)) ? Number(bus.seats) : null,
        year: Number.isFinite(Number(bus?.year)) ? Number(bus.year) : null,
        safetyFeatures: bus?.safetyFeatures || '',
        assistantName: bus?.assistantName || '',
        assistantPhone: bus?.assistantPhone || '',
        active: bus ? bus.active !== false : null,
      },
      stats: {
        gpsKm: gpsKm && gpsKm > 0 ? gpsKm : null,
        windowDays: 90,
        tripCount: trips.length,
        completedCount: trips.filter((t) => t.status === 'completed').length,
        pingCount: pings.length,
      },
      status: {
        gpsLive,
        lastPingAt: lastPing?.at || liveAt || null,
        onTrip: Boolean(activeTrip),
        lastUpdatedAt,
        incidentCount: incidents.length,
        noteCount: notes.length,
      },
      trip: activeTrip
        ? {
            _id: activeTrip._id,
            status: activeTrip.status,
            routeName: activeTrip.routeId?.name || '',
          }
        : null,
      notes: notes.slice(0, 20),
      school: school
        ? {
            name: school.name || '',
            supportPhone: school.supportPhone || '',
            supportEmail: school.supportEmail || '',
            supportHours: school.supportHours || '',
          }
        : { name: '', supportPhone: '', supportEmail: '', supportHours: '' },
      admins: contacts?.admins || [],
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/vehicle/note', async (req, res) => {
  try {
    const text = String(req.body?.text || '').trim().slice(0, 500);
    if (!text) return res.status(400).json({ error: 'Note text is required' });
    const kind = req.body?.kind === 'note' ? 'note' : 'incident';
    const trip =
      (await Trip.findOne({ driverId: req.user.id, status: 'active' })) ||
      (await Trip.findOne({ driverId: req.user.id, status: 'scheduled' }).sort({ scheduledFor: 1, sequence: 1 }));
    if (!trip) return res.status(400).json({ error: 'Start a trip to attach this note to the vehicle.' });
    const stops = await Stop.find({ routeId: trip.routeId }).sort({ order: 1 }).select('_id');
    const stopId = stops[0]?._id;
    if (!stopId) return res.status(400).json({ error: 'No stop on this route to attach the note.' });
    const prefixed =
      kind === 'incident' && !/^incident\b/i.test(text) ? `Incident: ${text}` : text;
    if (!Array.isArray(trip.stopNotes)) trip.stopNotes = [];
    trip.stopNotes.push({ stopId, text: prefixed, at: new Date() });
    await trip.save();
    const note = trip.stopNotes[trip.stopNotes.length - 1];
    if (kind === 'incident') {
      await createAndEmitNotifications(getIO(), [
        {
          userId: req.user.id,
          type: 'reminder',
          title: 'Incident reported',
          body: prefixed.replace(/^Incident:\s*/i, '').slice(0, 200) || 'An incident note was saved on this trip.',
          tripId: trip._id,
          key: `${req.user.id}:incident:${note._id}`,
        },
      ]);
    }
    res.status(201).json({ note, tripId: trip._id });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

const INCIDENT_TYPES = [
  { id: 'accident', label: 'Accident' },
  { id: 'breakdown', label: 'Breakdown' },
  { id: 'traffic', label: 'Traffic Jam' },
  { id: 'road_block', label: 'Road Block' },
  { id: 'weather', label: 'Weather Hazard' },
  { id: 'passenger', label: 'Passenger Issue' },
  { id: 'unsafe', label: 'Unsafe Behavior' },
  { id: 'other', label: 'Other' },
];

function remainingStopsForIncident(trip, stops, kids, events) {
  const direction = trip.direction;
  const ordered = orderStopsForDirection(stops, direction);
  const remaining = [];
  if (direction === 'to_home') {
    for (const stop of ordered) {
      if (stop.type === 'school') {
        if (kids.some((k) => !hasKidEvent(events, kidIdOf(k), 'picked_up') && !hasKidEvent(events, kidIdOf(k), 'dropped_off'))) {
          remaining.push(stop);
        }
        continue;
      }
      const atStop = kids.filter((k) => kidHomeId(k) === String(stop._id));
      if (!atStop.length) continue;
      if (atStop.some((k) => !hasKidEvent(events, kidIdOf(k), 'dropped_off'))) remaining.push(stop);
    }
    return remaining;
  }
  for (const stop of ordered) {
    if (stop.type === 'school') {
      if (kids.some((k) => !hasKidEvent(events, kidIdOf(k), 'dropped_off'))) remaining.push(stop);
      continue;
    }
    const atStop = kids.filter((k) => kidHomeId(k) === String(stop._id));
    if (!atStop.length) continue;
    if (atStop.some((k) => !hasKidEvent(events, kidIdOf(k), 'picked_up') && !hasKidEvent(events, kidIdOf(k), 'dropped_off'))) {
      remaining.push(stop);
    }
  }
  return remaining;
}

router.get('/incidents/context', async (req, res) => {
  try {
    const trip =
      (await Trip.findOne({ driverId: req.user.id, status: 'active' })
        .populate('schoolId', 'name supportPhone supportEmail')
        .populate('routeId', 'name')
        .populate('busId', 'plate label')) ||
      (await Trip.findOne({ driverId: req.user.id, status: 'scheduled' })
        .populate('schoolId', 'name supportPhone supportEmail')
        .populate('routeId', 'name')
        .populate('busId', 'plate label')
        .sort({ scheduledFor: 1, sequence: 1 }));

    let school = trip?.schoolId && typeof trip.schoolId === 'object' ? trip.schoolId : null;
    if (!school) {
      const user = await User.findById(req.user.id).select('schoolId');
      if (user?.schoolId) school = await School.findById(user.schoolId).select('name supportPhone supportEmail');
    }

    let location = null;
    let nextStop = null;
    if (trip) {
      const loc = trip.latestLocation;
      if (Number.isFinite(Number(loc?.lat)) && Number.isFinite(Number(loc?.lng))) {
        location = { lat: Number(loc.lat), lng: Number(loc.lng), at: loc.at || null };
      }
      const [stops, kids, events] = await Promise.all([
        Stop.find({ routeId: trip.routeId?._id || trip.routeId }),
        Kid.find({ _id: { $in: trip.kidIds || [] } }).select('name homeStopId'),
        TripEvent.find({ tripId: trip._id }),
      ]);
      const remaining = remainingStopsForIncident(trip, stops, kids, events);
      const stop = remaining[0] || stops[0] || null;
      if (stop) {
        const slat = Number(stop.location?.lat);
        const slng = Number(stop.location?.lng);
        let km = null;
        if (location && Number.isFinite(slat) && Number.isFinite(slng)) {
          km = round1(kmBetweenLatLng(location.lat, location.lng, slat, slng));
        }
        nextStop = {
          _id: stop._id,
          name: stop.name || 'Stop',
          lat: Number.isFinite(slat) ? slat : null,
          lng: Number.isFinite(slng) ? slng : null,
          km,
        };
      }
    }

    res.json({
      types: INCIDENT_TYPES,
      severities: [
        { id: 'low', label: 'Low' },
        { id: 'medium', label: 'Medium' },
        { id: 'high', label: 'High' },
      ],
      trip: trip
        ? {
            _id: trip._id,
            status: trip.status,
            tripCode: trip.tripCode || '',
            routeName: trip.routeId?.name || '',
            plate: trip.busId?.plate || '',
          }
        : null,
      location,
      nextStop,
      school: school
        ? { name: school.name || '', supportPhone: school.supportPhone || '', supportEmail: school.supportEmail || '' }
        : { name: '', supportPhone: '', supportEmail: '' },
      emergencyPhone: '999',
      uploadsConfigured: isCloudinaryConfigured(),
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/incidents', async (req, res) => {
  try {
    const typeIds = INCIDENT_TYPES.map((t) => t.id);
    const type = String(req.body?.type || '').trim();
    if (!typeIds.includes(type)) return res.status(400).json({ error: 'Choose an incident type.' });
    const severity = ['low', 'medium', 'high'].includes(req.body?.severity) ? req.body.severity : 'medium';
    const details = String(req.body?.details || '').trim().slice(0, 500);
    if (!details) return res.status(400).json({ error: 'Describe what happened.' });
    const occurredAt = req.body?.occurredAt ? new Date(req.body.occurredAt) : new Date();
    if (Number.isNaN(occurredAt.getTime())) return res.status(400).json({ error: 'Invalid date and time.' });

    const trip =
      (await Trip.findOne({ driverId: req.user.id, status: 'active' })) ||
      (await Trip.findOne({ driverId: req.user.id, status: 'scheduled' }).sort({ scheduledFor: 1, sequence: 1 }));
    if (!trip) return res.status(400).json({ error: 'Start a trip before submitting an incident report.' });

    const lat = Number(req.body?.lat);
    const lng = Number(req.body?.lng);
    const location =
      Number.isFinite(lat) && Number.isFinite(lng)
        ? { lat, lng, at: new Date() }
        : trip.latestLocation?.lat != null
          ? { lat: trip.latestLocation.lat, lng: trip.latestLocation.lng, at: trip.latestLocation.at || new Date() }
          : null;

    const photoIds = Array.isArray(req.body?.photoIds) ? req.body.photoIds.map(String).filter(Boolean).slice(0, 4) : [];
    let photoUrls = [];
    if (photoIds.length) {
      const assets = await MediaAsset.find({ _id: { $in: photoIds }, uploadedBy: req.user.id }).select('url');
      photoUrls = assets.map((a) => a.url).filter(Boolean);
    }

    const nextStopName = String(req.body?.nextStopName || '').trim().slice(0, 120);
    const nextStopKm = Number.isFinite(Number(req.body?.nextStopKm)) ? Number(req.body.nextStopKm) : null;

    if (!Array.isArray(trip.incidents)) trip.incidents = [];
    trip.incidents.push({
      type,
      severity,
      details,
      occurredAt,
      location,
      nextStopName,
      nextStopKm,
      photoUrls,
    });

    const stops = await Stop.find({ routeId: trip.routeId }).sort({ order: 1 }).select('_id name');
    const stopId = stops[0]?._id;
    const typeLabel = INCIDENT_TYPES.find((t) => t.id === type)?.label || type;
    const noteText = `Incident (${typeLabel}, ${severity}): ${details}`.slice(0, 500);
    if (stopId) {
      if (!Array.isArray(trip.stopNotes)) trip.stopNotes = [];
      trip.stopNotes.push({ stopId, text: noteText, at: new Date() });
    }
    await trip.save();
    const incident = trip.incidents[trip.incidents.length - 1];

    const admins = await User.find({
      schoolId: trip.schoolId,
      role: 'school_admin',
      active: { $ne: false },
    }).select('_id');
    const driver = await User.findById(req.user.id).select('name');
    const items = [
      {
        userId: req.user.id,
        type: 'reminder',
        title: `Incident reported · ${typeLabel}`,
        body: details.slice(0, 200),
        tripId: trip._id,
        important: severity === 'high',
        key: `${req.user.id}:incident:${incident._id}`,
      },
      ...admins.map((a) => ({
        userId: a._id,
        type: 'reminder',
        title: `Driver incident · ${typeLabel}`,
        body: `${driver?.name || 'Driver'}: ${details}`.slice(0, 200),
        tripId: trip._id,
        important: true,
        key: `${a._id}:incident:${incident._id}`,
      })),
    ];
    await createAndEmitNotifications(getIO(), items);

    res.status(201).json({ incident, tripId: trip._id, notifiedAdmins: admins.length });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/trips/today', async (req, res) => {
  try {
    const { start, end } = dayBounds(req.query.date);
    const trips = await Trip.find({
      driverId: req.user.id,
      status: { $in: ['scheduled', 'active'] },
      $or: [
        { serviceDate: { $gte: start, $lte: end } },
        { serviceDate: null, scheduledFor: { $gte: start, $lte: end } },
        { serviceDate: null, scheduledFor: null, status: 'active' },
      ],
    })
      .populate('routeId', 'name')
      .populate('schoolId', 'name location address')
      .populate('busId', 'plate label seats')
      .populate('scheduleId', 'name scheduledTime')
      .populate('kidIds', 'name grade')
      .sort({ period: 1, sequence: 1, scheduledFor: 1 });
    res.json({ trips: await Promise.all(trips.map((t) => serializeDriverTripCard(t))) });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/trips/scheduled', async (req, res) => {
  try {
    const { start, end } = dayBounds(req.query.date);
    const trips = await Trip.find({
      driverId: req.user.id,
      status: 'scheduled',
      $or: [
        { serviceDate: { $gte: start, $lte: end } },
        { scheduledFor: { $gte: start, $lte: end } },
      ],
    })
      .populate('routeId', 'name')
      .populate('schoolId', 'name location address')
      .populate('busId', 'plate label seats')
      .populate('kidIds', 'name grade')
      .sort({ sequence: 1 });
    res.json({ trips: await enrichTripsWithStopCounts(trips) });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/trips/completed', async (req, res) => {
  try {
    const limit = Math.min(Number(req.query.limit) || 50, 100);
    const trips = await Trip.find({
      driverId: req.user.id,
      status: 'completed',
    })
      .populate('routeId', 'name')
      .populate('schoolId', 'name location address')
      .populate('busId', 'plate label seats')
      .populate('scheduleId', 'name scheduledTime')
      .populate('kidIds', 'name grade')
      .sort({ endedAt: -1, updatedAt: -1 })
      .limit(limit);
    res.json({ trips: await enrichTripsWithStopCounts(trips) });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

function formatMinsLabel(mins) {
  if (!Number.isFinite(mins) || mins <= 0) return null;
  const h = Math.floor(mins / 60);
  const m = Math.round(mins % 60);
  if (h <= 0) return `${m}m`;
  if (m === 0) return `${h}h`;
  return `${h}h ${m}m`;
}

function mondayYmd(d = new Date()) {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  const day = x.getDay();
  x.setDate(x.getDate() + (day === 0 ? -6 : 1 - day));
  return ymdLocal(x);
}

router.get('/trips/history', async (req, res) => {
  try {
    const toBounds = dayBounds(req.query.to);
    let fromBounds = dayBounds(req.query.from || mondayYmd());
    if (toBounds.end - fromBounds.start > 31 * 86400000) {
      const clipped = new Date(toBounds.end);
      clipped.setDate(clipped.getDate() - 30);
      fromBounds = dayBounds(ymdLocal(clipped));
    }
    const from = fromBounds.start;
    const to = toBounds.end;
    const newest = req.query.sort !== 'oldest';

    const trips = await Trip.find({
      driverId: req.user.id,
      status: { $in: ['completed', 'cancelled', 'active'] },
      $or: [
        { serviceDate: { $gte: from, $lte: to } },
        { scheduledFor: { $gte: from, $lte: to } },
        { startedAt: { $gte: from, $lte: to } },
        { endedAt: { $gte: from, $lte: to } },
      ],
    })
      .populate('routeId', 'name')
      .populate('schoolId', 'name')
      .populate('busId', 'plate label')
      .populate('scheduleId', 'scheduledTime period')
      .populate('kidIds', 'name homeStopId')
      .sort(newest ? { endedAt: -1, startedAt: -1, serviceDate: -1 } : { startedAt: 1, serviceDate: 1, endedAt: 1 })
      .limit(80);

    const tripIds = trips.map((t) => t._id);
    const routeIds = [...new Set(trips.map((t) => String(t.routeId?._id || t.routeId)).filter((id) => id && id !== 'undefined'))];
    const [events, stops, pings] = await Promise.all([
      tripIds.length ? TripEvent.find({ tripId: { $in: tripIds } }).select('tripId kidId type at') : [],
      routeIds.length ? Stop.find({ routeId: { $in: routeIds } }).sort({ order: 1 }) : [],
      tripIds.length ? LocationPing.find({ tripId: { $in: tripIds } }).select('tripId lat lng at').sort({ at: 1 }) : [],
    ]);
    const eventsByTrip = new Map();
    for (const e of events) {
      const key = String(e.tripId);
      if (!eventsByTrip.has(key)) eventsByTrip.set(key, []);
      eventsByTrip.get(key).push(e);
    }
    const stopsByRoute = new Map();
    for (const s of stops) {
      const key = String(s.routeId);
      if (!stopsByRoute.has(key)) stopsByRoute.set(key, []);
      stopsByRoute.get(key).push(s);
    }
    const pingsByTrip = new Map();
    for (const p of pings) {
      const key = String(p.tripId);
      if (!pingsByTrip.has(key)) pingsByTrip.set(key, []);
      pingsByTrip.get(key).push(p);
    }

    const rows = trips.map((trip) => {
      const kids = (trip.kidIds || []).filter((k) => k && typeof k === 'object');
      const tripEvents = eventsByTrip.get(String(trip._id)) || [];
      const routeStops = stopsByRoute.get(String(trip.routeId?._id || trip.routeId)) || [];
      const ordered = orderedStopsForTrip(trip, kids, routeStops, trip.direction);
      const origin = ordered[0] || null;
      const dest = ordered.length ? ordered[ordered.length - 1] : null;
      const via = ordered.length >= 3 ? ordered[Math.floor(ordered.length / 2)] : null;
      const kidIds = kids.map(kidIdOf).filter(Boolean);
      const dropped = kidIds.filter((id) => hasKidEvent(tripEvents, id, 'dropped_off')).length;
      const missed = kidIds.filter((id) => hasKidEvent(tripEvents, id, 'not_picked_up')).length;
      let completion = { status: trip.status, label: trip.status };
      if (trip.status === 'cancelled') completion = { status: 'cancelled', label: 'Cancelled' };
      else if (trip.status === 'active') completion = { status: 'active', label: 'In Progress' };
      else if (trip.status === 'completed') {
        if (kidIds.length && dropped + missed < kidIds.length && (dropped > 0 || missed > 0)) {
          completion = { status: 'partial', label: 'Partially Completed' };
        } else {
          completion = { status: 'completed', label: 'Completed' };
        }
      }

      const durationMins =
        trip.startedAt && trip.endedAt
          ? Math.round((new Date(trip.endedAt) - new Date(trip.startedAt)) / 60000)
          : null;
      const realDuration = Number.isFinite(durationMins) && durationMins > 0 ? durationMins : null;

      const tripPings = pingsByTrip.get(String(trip._id)) || [];
      let distanceKm = null;
      let distanceSource = null;
      if (tripPings.length >= 2) {
        const km = pingPathKm(tripPings);
        if (km > 0.05) {
          distanceKm = round1(km);
          distanceSource = 'gps';
        }
      }
      if (distanceKm == null && ordered.length >= 2) {
        const km = stopPathKm(ordered);
        if (km > 0.05) {
          distanceKm = round1(km);
          distanceSource = 'stops';
        }
      }

      let onTime = null;
      if (trip.startedAt) {
        const scheduled = combineServiceTime(trip.serviceDate, trip.scheduleId?.scheduledTime, trip.scheduledFor);
        if (scheduled) {
          const delayMin = (new Date(trip.startedAt) - scheduled) / 60000;
          if (Number.isFinite(delayMin)) onTime = delayMin <= 5;
        }
      }

      const day = trip.serviceDate || trip.startedAt || trip.scheduledFor || trip.endedAt;
      return {
        _id: trip._id,
        date: day,
        period: trip.period || (trip.direction === 'to_home' ? 'afternoon' : 'morning'),
        direction: trip.direction,
        tripCode: trip.tripCode || '',
        routeName: trip.routeId?.name || '',
        plate: trip.busId?.plate || '',
        originName: origin?.name || '',
        originTime: trip.startedAt ? formatDriverClock(trip.startedAt) : '',
        destinationName: dest?.name || '',
        destinationTime: trip.endedAt ? formatDriverClock(trip.endedAt) : '',
        viaName: via && via !== origin && via !== dest ? via.name || '' : '',
        durationMins: realDuration,
        durationLabel: formatMinsLabel(realDuration),
        distanceKm,
        distanceSource,
        onTime,
        status: completion.status,
        statusLabel: completion.label,
        studentCount: kidIds.length,
        droppedCount: dropped,
      };
    });

    const durationMins = rows.reduce((n, r) => n + (r.durationMins || 0), 0);
    const distanceKm = round1(rows.reduce((n, r) => n + (Number(r.distanceKm) || 0), 0));
    const onTimeSample = rows.filter((r) => r.onTime === true || r.onTime === false).length;
    const onTimeCount = rows.filter((r) => r.onTime === true).length;

    res.json({
      from: ymdLocal(from),
      to: ymdLocal(to),
      sort: newest ? 'newest' : 'oldest',
      trips: rows,
      summary: {
        tripCount: rows.length,
        completedCount: rows.filter((r) => r.status === 'completed').length,
        partialCount: rows.filter((r) => r.status === 'partial').length,
        cancelledCount: rows.filter((r) => r.status === 'cancelled').length,
        durationMins,
        durationLabel: formatMinsLabel(durationMins) || '—',
        distanceKm: distanceKm && distanceKm > 0 ? distanceKm : null,
        onTimeCount,
        onTimeSample,
        onTimePct: onTimeSample ? Math.round((onTimeCount / onTimeSample) * 1000) / 10 : null,
      },
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/trips/active', async (req, res) => {
  try {
    const trip = await Trip.findOne({ driverId: req.user.id, status: 'active' })
      .populate('routeId', 'name')
      .populate('schoolId', 'name location address supportPhone')
      .populate('busId', 'plate label seats')
      .populate('kidIds');
    res.json({ trip: trip ? await serializeDriverTripCard(trip) : null });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/device-tokens', async (req, res) => {
  try {
    const { platform, token, keys, userAgent } = req.body || {};
    if (!platform || !token) {
      return res.status(400).json({ error: 'platform and token are required' });
    }
    if (!['fcm', 'web_push'].includes(platform)) {
      return res.status(400).json({ error: 'platform must be fcm or web_push' });
    }
    if (platform === 'web_push' && (!keys?.p256dh || !keys?.auth)) {
      return res.status(400).json({ error: 'web_push requires keys.p256dh and keys.auth' });
    }

    const doc = await DeviceToken.findOneAndUpdate(
      { userId: req.user.id, platform, token },
      {
        userId: req.user.id,
        platform,
        token,
        keys: keys || undefined,
        userAgent: userAgent || req.get('user-agent') || '',
      },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );
    res.json({ ok: true, id: doc._id.toString() });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.delete('/device-tokens', async (req, res) => {
  try {
    const { platform, token } = req.body || {};
    const filter = { userId: req.user.id };
    if (platform) filter.platform = platform;
    if (token) filter.token = token;
    const result = await DeviceToken.deleteMany(filter);
    res.json({ ok: true, deleted: result.deletedCount });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

function driverNotificationCategory(type) {
  switch (String(type || '')) {
    case 'late_pickup_request':
    case 'trip_cancelled':
    case 'trip_started':
    case 'trip_completed':
    case 'attendance_alert':
    case 'reminder':
      return 'alerts';
    case 'kid_picked_up':
    case 'kid_dropped_off':
    case 'trip_assigned':
      return 'students';
    case 'message':
      return 'messages';
    default:
      return 'system';
  }
}

router.get('/notifications', async (req, res) => {
  try {
    const { start, end } = dayBounds();
    const [rows, profile, activeDoc, scheduledDoc] = await Promise.all([
      Notification.find({ userId: req.user.id }).sort({ createdAt: -1 }).limit(80),
      DriverProfile.findOne({ userId: req.user.id }).populate('busId', 'plate label seats'),
      Trip.findOne({ driverId: req.user.id, status: 'active' })
        .populate('routeId', 'name')
        .populate('schoolId', 'name location address')
        .populate('busId', 'plate label seats')
        .populate('scheduleId', 'name scheduledTime')
        .populate('kidIds', 'name grade'),
      Trip.findOne({
        driverId: req.user.id,
        status: 'scheduled',
        $or: [
          { serviceDate: { $gte: start, $lte: end } },
          { scheduledFor: { $gte: start, $lte: end } },
        ],
      })
        .populate('routeId', 'name')
        .populate('schoolId', 'name location address')
        .populate('busId', 'plate label seats')
        .populate('scheduleId', 'name scheduledTime')
        .populate('kidIds', 'name grade')
        .sort({ sequence: 1, scheduledFor: 1 }),
    ]);

    const tripDoc = activeDoc || scheduledDoc;
    const trip = tripDoc ? await serializeDriverTripCard(tripDoc) : null;
    const bus = trip?.busId || profile?.busId;
    const notifications = rows.map((n) => {
      const obj = typeof n.toObject === 'function' ? n.toObject() : n;
      const category = driverNotificationCategory(obj.type);
      return { ...obj, category };
    });
    const counts = {
      all: notifications.length,
      alerts: notifications.filter((n) => n.category === 'alerts').length,
      students: notifications.filter((n) => n.category === 'students').length,
      system: notifications.filter((n) => n.category === 'system').length,
      messages: notifications.filter((n) => n.category === 'messages').length,
    };
    res.json({
      notifications,
      counts,
      trip,
      vehicle: {
        name: bus?.label || profile?.vehicleModel || 'School Bus',
        plate: bus?.plate || profile?.vehiclePlate || '',
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
      await Notification.updateMany({ userId: req.user.id, read: false }, { $set: { read: true } });
    }
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

function ymdLocal(value) {
  if (!value) return '';
  const x = new Date(value);
  if (Number.isNaN(x.getTime())) return '';
  const y = x.getFullYear();
  const m = String(x.getMonth() + 1).padStart(2, '0');
  const d = String(x.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function eachYmd(from, to) {
  const out = [];
  const d = new Date(from);
  d.setHours(0, 0, 0, 0);
  const end = new Date(to);
  end.setHours(0, 0, 0, 0);
  while (d <= end) {
    out.push(ymdLocal(d));
    d.setDate(d.getDate() + 1);
  }
  return out;
}

function kidHomeId(kid) {
  const raw = kid?.homeStopId;
  if (raw && typeof raw === 'object') return String(raw._id || raw.id || '');
  return raw ? String(raw) : '';
}

function kidsForStop(stop, kids) {
  if (stop.type === 'school') return kids;
  const id = String(stop._id);
  return kids.filter((k) => kidHomeId(k) === id);
}

function kidIdOf(kid) {
  return String(kid?._id || kid?.id || '');
}

function hasKidEvent(events, kidId, type) {
  return events.some((e) => String(e.kidId) === String(kidId) && e.type === type);
}

function firstEventTime(events, kidIds, types) {
  const set = new Set(kidIds.map(String));
  let first = null;
  for (const e of events) {
    if (!set.has(String(e.kidId)) || !types.includes(e.type)) continue;
    const t = e.at ? new Date(e.at) : null;
    if (!t || Number.isNaN(t.getTime())) continue;
    if (!first || t < first) first = t;
  }
  return first;
}

function tripDayKey(trip) {
  return ymdLocal(trip.serviceDate || trip.startedAt || trip.scheduledFor);
}

function stopAttendance(stop, kids, events, toHome) {
  const atStop = kidsForStop(stop, kids);
  const pickupStop = toHome ? stop.type === 'school' : stop.type !== 'school';
  let picked = 0;
  let missed = 0;
  let pending = 0;
  const students = [];
  for (const kid of atStop) {
    const id = kidIdOf(kid);
    const boarded = hasKidEvent(events, id, 'picked_up');
    const missedKid = hasKidEvent(events, id, 'not_picked_up');
    const dropped = hasKidEvent(events, id, 'dropped_off');
    let status = 'pending';
    if (pickupStop) {
      if (missedKid) status = 'missed';
      else if (boarded) status = 'picked';
    } else if (missedKid) status = 'missed';
    else if (dropped) status = 'picked';
    else status = 'pending';
    if (status === 'picked') picked += 1;
    else if (status === 'missed') missed += 1;
    else pending += 1;
    const event = events.find(
      (e) =>
        String(e.kidId) === id &&
        (pickupStop
          ? e.type === 'picked_up' || e.type === 'not_picked_up'
          : e.type === 'dropped_off' || e.type === 'not_picked_up')
    );
    students.push({
      _id: id,
      name: kid.name || 'Student',
      photoUrl: kid.photoUrl || '',
      grade: kid.grade || '',
      section: kid.section || '',
      status,
      at: event?.at || null,
    });
  }
  const types = pickupStop ? ['picked_up', 'not_picked_up'] : ['dropped_off', 'not_picked_up'];
  const timeAt = firstEventTime(events, atStop.map(kidIdOf), types);
  return {
    _id: stop._id,
    name: stop.name || 'Stop',
    type: stop.type,
    address: stop.address || '',
    pickedUp: picked,
    pending,
    notPickedUp: missed,
    studentCount: atStop.length,
    done: atStop.length > 0 && pending === 0,
    time: formatDriverClock(timeAt),
    students,
  };
}

router.get('/attendance', async (req, res) => {
  try {
    const toHome = req.query.direction === 'to_home';
    const direction = toHome ? 'to_home' : 'to_school';
    const toBounds = dayBounds(req.query.to);
    let fromBounds = dayBounds(req.query.from || ymdLocal(new Date(Date.now() - 6 * 86400000)));
    if (toBounds.end - fromBounds.start > 31 * 86400000) {
      const clipped = new Date(toBounds.end);
      clipped.setDate(clipped.getDate() - 30);
      fromBounds = dayBounds(ymdLocal(clipped));
    }
    const from = fromBounds.start;
    const to = toBounds.end;

    const [profile, trips] = await Promise.all([
      DriverProfile.findOne({ userId: req.user.id }).populate('busId', 'plate label seats'),
      Trip.find({
        driverId: req.user.id,
        direction,
        status: { $in: ['scheduled', 'active', 'completed'] },
        $or: [
          { serviceDate: { $gte: from, $lte: to } },
          { scheduledFor: { $gte: from, $lte: to } },
          { startedAt: { $gte: from, $lte: to } },
        ],
      })
        .populate('routeId', 'name')
        .populate('busId', 'plate label seats')
        .populate('scheduleId', 'scheduledTime')
        .populate('kidIds', 'name grade section photoUrl homeStopId')
        .sort({ serviceDate: 1, scheduledFor: 1, startedAt: 1 }),
    ]);

    const tripIds = trips.map((t) => t._id);
    const routeIds = [...new Set(trips.map((t) => String(t.routeId?._id || t.routeId)).filter((id) => id && id !== 'undefined'))];
    const [events, stops] = await Promise.all([
      tripIds.length ? TripEvent.find({ tripId: { $in: tripIds } }).sort({ at: 1 }) : [],
      routeIds.length ? Stop.find({ routeId: { $in: routeIds } }).sort({ order: 1 }) : [],
    ]);

    const eventsByTrip = new Map();
    for (const e of events) {
      const key = String(e.tripId);
      if (!eventsByTrip.has(key)) eventsByTrip.set(key, []);
      eventsByTrip.get(key).push(e);
    }
    const stopsByRoute = new Map();
    for (const s of stops) {
      const key = String(s.routeId);
      if (!stopsByRoute.has(key)) stopsByRoute.set(key, []);
      stopsByRoute.get(key).push(s);
    }

    const tripByDay = new Map();
    for (const trip of trips) {
      const key = tripDayKey(trip);
      if (!key) continue;
      const prev = tripByDay.get(key);
      if (!prev || (trip.status === 'active' && prev.status !== 'active') || (trip.status === 'completed' && prev.status === 'scheduled')) {
        tripByDay.set(key, trip);
      }
    }

    const studentDays = new Map();
    const days = eachYmd(from, to).map((date) => {
      const trip = tripByDay.get(date);
      if (!trip) {
        return { date, trip: null, stops: [], missed: [], stats: { studentCount: 0, pickedUp: 0, pending: 0, notPickedUp: 0 } };
      }
      const kids = (trip.kidIds || []).filter((k) => k && typeof k === 'object');
      const tripEvents = eventsByTrip.get(String(trip._id)) || [];
      const routeStops = stopsByRoute.get(String(trip.routeId?._id || trip.routeId)) || [];
      const kidHomeIds = new Set(kids.map(kidHomeId).filter(Boolean));
      const school = routeStops.filter((s) => s.type === 'school');
      const homes = routeStops.filter((s) => s.type !== 'school' && kidHomeIds.has(String(s._id)));
      const ordered = orderStopsForDirection(
        [...(school[0] ? [school[0]] : []), ...homes],
        direction
      );
      const stopRows = ordered.map((stop) => stopAttendance(stop, kids, tripEvents, toHome));
      const missed = [];
      for (const kid of kids) {
        const id = kidIdOf(kid);
        if (!hasKidEvent(tripEvents, id, 'not_picked_up')) continue;
        const home = ordered.find((s) => s.type !== 'school' && String(s._id) === kidHomeId(kid));
        const ev = tripEvents.find((e) => String(e.kidId) === id && e.type === 'not_picked_up');
        missed.push({
          _id: id,
          name: kid.name || 'Student',
          photoUrl: kid.photoUrl || '',
          grade: kid.grade || '',
          section: kid.section || '',
          stopName: home?.name || 'Stop',
          at: ev?.at || null,
        });
      }
      let pickedUp = 0;
      let pending = 0;
      let notPickedUp = 0;
      for (const kid of kids) {
        const id = kidIdOf(kid);
        const boarded = hasKidEvent(tripEvents, id, 'picked_up');
        const miss = hasKidEvent(tripEvents, id, 'not_picked_up');
        if (miss) notPickedUp += 1;
        else if (boarded) pickedUp += 1;
        else pending += 1;
        const rec = studentDays.get(id) || {
          _id: id,
          name: kid.name || 'Student',
          photoUrl: kid.photoUrl || '',
          grade: kid.grade || '',
          section: kid.section || '',
          stopName: ordered.find((s) => s.type !== 'school' && String(s._id) === kidHomeId(kid))?.name || '',
          picked: 0,
          pending: 0,
          missed: 0,
          days: [],
        };
        const status = miss ? 'missed' : boarded ? 'picked' : 'pending';
        if (status === 'picked') rec.picked += 1;
        else if (status === 'missed') rec.missed += 1;
        else rec.pending += 1;
        rec.days.push({ date, status, tripId: String(trip._id) });
        studentDays.set(id, rec);
      }
      return {
        date,
        trip: {
          _id: trip._id,
          status: trip.status,
          startedAt: trip.startedAt,
          endedAt: trip.endedAt,
          scheduledFor: trip.scheduledFor,
          routeName: trip.routeId?.name || '',
        },
        stops: stopRows,
        missed,
        stats: {
          studentCount: kids.length,
          pickedUp,
          pending,
          notPickedUp,
        },
      };
    });

    const stats = days.reduce(
      (acc, day) => {
        acc.pickedUp += day.stats.pickedUp;
        acc.pending += day.stats.pending;
        acc.notPickedUp += day.stats.notPickedUp;
        return acc;
      },
      { totalStudents: studentDays.size, pickedUp: 0, pending: 0, notPickedUp: 0 }
    );

    const byStop = new Map();
    for (const day of days) {
      for (const stop of day.stops) {
        const key = String(stop._id);
        const rec = byStop.get(key) || {
          _id: stop._id,
          name: stop.name,
          pickedUp: 0,
          pending: 0,
          notPickedUp: 0,
        };
        rec.pickedUp += stop.pickedUp;
        rec.pending += stop.pending;
        rec.notPickedUp += stop.notPickedUp;
        byStop.set(key, rec);
      }
    }

    const bus = trips.find((t) => t.busId)?.busId || profile?.busId;
    res.json({
      from: ymdLocal(from),
      to: ymdLocal(to),
      direction,
      vehicle: {
        name: bus?.label || profile?.vehicleModel || 'School Bus',
        plate: bus?.plate || profile?.vehiclePlate || '',
      },
      stats,
      days,
      students: [...studentDays.values()].sort((a, b) => String(a.name).localeCompare(String(b.name))),
      summary: {
        byDay: days.map((d) => ({ date: d.date, ...d.stats, hasTrip: Boolean(d.trip) })),
        byStop: [...byStop.values()],
      },
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

function round1(n) {
  if (!Number.isFinite(n)) return null;
  return Math.round(n * 10) / 10;
}

function pct(part, whole) {
  if (!whole) return null;
  return Math.round((part / whole) * 1000) / 10;
}

function weekdayShort(ymd) {
  const [y, m, d] = String(ymd).split('-').map(Number);
  if (![y, m, d].every(Number.isFinite)) return '';
  return new Date(y, m - 1, d).toLocaleDateString('en-GB', { weekday: 'short' });
}

function kmBetweenLatLng(lat1, lng1, lat2, lng2) {
  if (![lat1, lng1, lat2, lng2].every((n) => Number.isFinite(n))) return 0;
  const toRad = (d) => (d * Math.PI) / 180;
  const R = 6371;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const s =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(s)));
}

function stopPathKm(ordered) {
  let km = 0;
  for (let i = 1; i < ordered.length; i += 1) km += kmBetweenStops(ordered[i - 1], ordered[i]);
  return km;
}

function pingPathKm(pings) {
  let km = 0;
  for (let i = 1; i < pings.length; i += 1) {
    km += kmBetweenLatLng(Number(pings[i - 1].lat), Number(pings[i - 1].lng), Number(pings[i].lat), Number(pings[i].lng));
  }
  return km;
}

function orderedStopsForTrip(trip, kids, routeStops, direction) {
  const kidHomeIds = new Set(kids.map(kidHomeId).filter(Boolean));
  const school = routeStops.filter((s) => s.type === 'school');
  const homes = routeStops.filter((s) => s.type !== 'school' && kidHomeIds.has(String(s._id)));
  return orderStopsForDirection([...(school[0] ? [school[0]] : []), ...homes], direction);
}

router.get('/reports', async (req, res) => {
  try {
    const toHome = req.query.direction === 'to_home';
    const direction = toHome ? 'to_home' : 'to_school';
    const toBounds = dayBounds(req.query.to);
    let fromBounds = dayBounds(req.query.from || ymdLocal(new Date(Date.now() - 6 * 86400000)));
    if (toBounds.end - fromBounds.start > 31 * 86400000) {
      const clipped = new Date(toBounds.end);
      clipped.setDate(clipped.getDate() - 30);
      fromBounds = dayBounds(ymdLocal(clipped));
    }
    const from = fromBounds.start;
    const to = toBounds.end;

    const [profile, trips] = await Promise.all([
      DriverProfile.findOne({ userId: req.user.id }).populate('busId', 'plate label seats'),
      Trip.find({
        driverId: req.user.id,
        direction,
        status: { $in: ['scheduled', 'active', 'completed'] },
        $or: [
          { serviceDate: { $gte: from, $lte: to } },
          { scheduledFor: { $gte: from, $lte: to } },
          { startedAt: { $gte: from, $lte: to } },
        ],
      })
        .populate('routeId', 'name')
        .populate('busId', 'plate label seats')
        .populate('scheduleId', 'scheduledTime')
        .populate('kidIds', 'name grade section photoUrl homeStopId')
        .sort({ serviceDate: 1, scheduledFor: 1, startedAt: 1 }),
    ]);

    const tripIds = trips.map((t) => t._id);
    const routeIds = [...new Set(trips.map((t) => String(t.routeId?._id || t.routeId)).filter((id) => id && id !== 'undefined'))];
    const [events, stops, pings] = await Promise.all([
      tripIds.length ? TripEvent.find({ tripId: { $in: tripIds } }).sort({ at: 1 }) : [],
      routeIds.length ? Stop.find({ routeId: { $in: routeIds } }).sort({ order: 1 }) : [],
      tripIds.length ? LocationPing.find({ tripId: { $in: tripIds } }).sort({ at: 1 }) : [],
    ]);

    const eventsByTrip = new Map();
    for (const e of events) {
      const key = String(e.tripId);
      if (!eventsByTrip.has(key)) eventsByTrip.set(key, []);
      eventsByTrip.get(key).push(e);
    }
    const stopsByRoute = new Map();
    for (const s of stops) {
      const key = String(s.routeId);
      if (!stopsByRoute.has(key)) stopsByRoute.set(key, []);
      stopsByRoute.get(key).push(s);
    }
    const pingsByTrip = new Map();
    for (const p of pings) {
      const key = String(p.tripId);
      if (!pingsByTrip.has(key)) pingsByTrip.set(key, []);
      pingsByTrip.get(key).push(p);
    }

    const tripByDay = new Map();
    for (const trip of trips) {
      const key = tripDayKey(trip);
      if (!key) continue;
      const prev = tripByDay.get(key);
      if (!prev || (trip.status === 'active' && prev.status !== 'active') || (trip.status === 'completed' && prev.status === 'scheduled')) {
        tripByDay.set(key, trip);
      }
    }

    const studentIds = new Set();
    const byStop = new Map();
    const days = eachYmd(from, to).map((date) => {
      const trip = tripByDay.get(date);
      if (!trip) {
        return { date, weekday: weekdayShort(date), hasTrip: false, pickedUp: 0, pending: 0, notPickedUp: 0 };
      }
      const kids = (trip.kidIds || []).filter((k) => k && typeof k === 'object');
      const tripEvents = eventsByTrip.get(String(trip._id)) || [];
      const routeStops = stopsByRoute.get(String(trip.routeId?._id || trip.routeId)) || [];
      const ordered = orderedStopsForTrip(trip, kids, routeStops, direction);
      let pickedUp = 0;
      let pending = 0;
      let notPickedUp = 0;
      for (const kid of kids) {
        const id = kidIdOf(kid);
        studentIds.add(id);
        const boarded = hasKidEvent(tripEvents, id, 'picked_up');
        const miss = hasKidEvent(tripEvents, id, 'not_picked_up');
        if (miss) notPickedUp += 1;
        else if (boarded) pickedUp += 1;
        else pending += 1;
      }
      for (const stop of ordered) {
        const pickupStop = toHome ? stop.type === 'school' : stop.type !== 'school';
        if (!pickupStop) continue;
        const row = stopAttendance(stop, kids, tripEvents, toHome);
        const rec = byStop.get(String(stop._id)) || {
          _id: stop._id,
          name: stop.name || 'Stop',
          type: stop.type,
          pickedUp: 0,
          pending: 0,
          notPickedUp: 0,
        };
        rec.pickedUp += row.pickedUp;
        rec.pending += row.pending;
        rec.notPickedUp += row.notPickedUp;
        byStop.set(String(stop._id), rec);
      }
      return { date, weekday: weekdayShort(date), hasTrip: true, pickedUp, pending, notPickedUp };
    });

    const pickedUp = days.reduce((n, d) => n + d.pickedUp, 0);
    const pending = days.reduce((n, d) => n + d.pending, 0);
    const notPickedUp = days.reduce((n, d) => n + d.notPickedUp, 0);
    const kidDays = pickedUp + pending + notPickedUp;

    let onTime = 0;
    let late = 0;
    let veryLate = 0;
    for (const trip of trips) {
      if (!trip.startedAt) continue;
      const scheduled = combineServiceTime(trip.serviceDate, trip.scheduleId?.scheduledTime, trip.scheduledFor);
      if (!scheduled) continue;
      const delayMin = (new Date(trip.startedAt) - scheduled) / 60000;
      if (!Number.isFinite(delayMin)) continue;
      if (delayMin <= 5) onTime += 1;
      else if (delayMin <= 15) late += 1;
      else veryLate += 1;
    }
    const onTimeSample = onTime + late + veryLate;

    const gpsDistances = [];
    const durations = [];
    const movingSpeeds = [];
    for (const trip of trips) {
      const tripPings = pingsByTrip.get(String(trip._id)) || [];
      if (tripPings.length >= 2) {
        const km = pingPathKm(tripPings);
        if (km > 0.05) gpsDistances.push(km);
      }
      if (trip.startedAt && trip.endedAt) {
        const mins = Math.round((new Date(trip.endedAt) - new Date(trip.startedAt)) / 60000);
        if (Number.isFinite(mins) && mins > 0) durations.push(mins);
      }
      for (const p of tripPings) {
        const s = Number(p.speed);
        if (Number.isFinite(s) && s >= 0.4 && s <= 40) movingSpeeds.push(s);
      }
    }

    const latestTrip = [...tripByDay.values()].reverse().find(Boolean) || trips[trips.length - 1] || null;
    const latestKids = (latestTrip?.kidIds || []).filter((k) => k && typeof k === 'object');
    const latestStops = latestTrip
      ? orderedStopsForTrip(
          latestTrip,
          latestKids,
          stopsByRoute.get(String(latestTrip.routeId?._id || latestTrip.routeId)) || [],
          direction
        )
      : [];
    const stopDistance = stopPathKm(latestStops);

    let distanceKm = null;
    let distanceSource = null;
    if (gpsDistances.length) {
      distanceKm = round1(gpsDistances.reduce((a, b) => a + b, 0) / gpsDistances.length);
      distanceSource = 'gps';
    } else if (stopDistance > 0) {
      distanceKm = round1(stopDistance);
      distanceSource = 'stops';
    }

    const durationMins = durations.length
      ? Math.round(durations.reduce((a, b) => a + b, 0) / durations.length)
      : null;

    let avgSpeedKmh = movingSpeeds.length
      ? round1((movingSpeeds.reduce((a, b) => a + b, 0) / movingSpeeds.length) * 3.6)
      : null;
    let speedSource = movingSpeeds.length ? 'gps' : null;
    if (avgSpeedKmh == null && distanceKm && durationMins) {
      avgSpeedKmh = round1(distanceKm / (durationMins / 60));
      speedSource = 'computed';
    }

    const scheduledStart = latestTrip
      ? combineServiceTime(latestTrip.serviceDate, latestTrip.scheduleId?.scheduledTime, latestTrip.scheduledFor)
      : null;
    const startAt = latestTrip?.startedAt || scheduledStart;
    const endAt = latestTrip?.endedAt || null;
    const timeWindow = [formatDriverClock(startAt), formatDriverClock(endAt)].filter(Boolean).join(' - ');

    const stopRows = [...byStop.values()].map((s) => {
      const total = s.pickedUp + s.pending + s.notPickedUp;
      return {
        ...s,
        pickedPct: pct(s.pickedUp, total),
        pendingPct: pct(s.pending, total),
        missedPct: pct(s.notPickedUp, total),
      };
    });

    const bus = trips.find((t) => t.busId)?.busId || profile?.busId;
    res.json({
      from: ymdLocal(from),
      to: ymdLocal(to),
      direction,
      vehicle: {
        name: bus?.label || profile?.vehicleModel || 'School Bus',
        plate: bus?.plate || profile?.vehiclePlate || '',
      },
      route: {
        name: latestTrip?.routeId?.name || '',
        origin: latestStops[0]?.name || '',
        destination: latestStops[latestStops.length - 1]?.name || '',
        timeWindow,
      },
      overview: {
        totalStudents: studentIds.size,
        pickedUp,
        pending,
        notPickedUp,
        pickedPct: pct(pickedUp, kidDays),
        pendingPct: pct(pending, kidDays),
        missedPct: pct(notPickedUp, kidDays),
      },
      byDay: days,
      onTime: {
        sampleSize: onTimeSample,
        onTime,
        late,
        veryLate,
        onTimePct: pct(onTime, onTimeSample),
        latePct: pct(late, onTimeSample),
        veryLatePct: pct(veryLate, onTimeSample),
      },
      efficiency: {
        distanceKm,
        distanceSource,
        avgSpeedKmh,
        speedSource,
        durationMins,
        stopCount: latestStops.length,
      },
      stops: stopRows,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

function formatHm(value) {
  const [hh, mm] = String(value || '').split(':').map(Number);
  if (!Number.isFinite(hh)) return '';
  const h = hh % 12 || 12;
  const ampm = hh >= 12 ? 'PM' : 'AM';
  return `${h}:${String(Number.isFinite(mm) ? mm : 0).padStart(2, '0')} ${ampm}`;
}

function punctualityLabel(at, scheduled) {
  if (!at || !scheduled) return null;
  const delay = (new Date(at) - scheduled) / 60000;
  if (!Number.isFinite(delay)) return null;
  if (delay <= 5) return 'on_time';
  if (delay <= 15) return 'late';
  return 'very_late';
}

async function driverOwnsKid(userId, kid) {
  if (!kid) return false;
  const onTrip = await Trip.exists({ driverId: userId, kidIds: kid._id });
  if (onTrip) return true;
  const profile = await DriverProfile.findOne({ userId }).select('assignedRouteIds');
  const routeIds = new Set((profile?.assignedRouteIds || []).map(String));
  if (kid.routeId && routeIds.has(String(kid.routeId._id || kid.routeId))) return true;
  const scheduled = await TripSchedule.exists({
    driverId: userId,
    active: true,
    $or: [{ kidIds: kid._id }, ...(kid.routeId ? [{ routeId: kid.routeId._id || kid.routeId }] : [])],
  });
  return Boolean(scheduled);
}

router.get('/students/:id', async (req, res) => {
  try {
    if (!/^[a-f0-9]{24}$/i.test(String(req.params.id || ''))) {
      return res.status(400).json({ error: 'Invalid student' });
    }
    const kid = await Kid.findById(req.params.id)
      .populate('parentIds', 'name phone email photoUrl')
      .populate('homeStopId', 'name address type')
      .populate('schoolId', 'name address')
      .populate('routeId', 'name');
    if (!kid || kid.active === false) return res.status(404).json({ error: 'Student not found' });
    if (!(await driverOwnsKid(req.user.id, kid))) {
      return res.status(403).json({ error: 'Not assigned to this student' });
    }

    const windowDays = req.query.window === 'month' ? 30 : 7;
    const todayBounds = dayBounds();
    const fromBounds = dayBounds(ymdLocal(new Date(Date.now() - (windowDays - 1) * 86400000)));
    const from = fromBounds.start;
    const to = todayBounds.end;

    const trips = await Trip.find({
      driverId: req.user.id,
      kidIds: kid._id,
      status: { $in: ['scheduled', 'active', 'completed'] },
      $or: [
        { serviceDate: { $gte: from, $lte: to } },
        { scheduledFor: { $gte: from, $lte: to } },
        { startedAt: { $gte: from, $lte: to } },
        { status: 'active' },
      ],
    })
      .populate('routeId', 'name')
      .populate('scheduleId', 'scheduledTime period direction')
      .populate('schoolId', 'name')
      .sort({ serviceDate: 1, scheduledFor: 1, startedAt: 1 });

    const tripIds = trips.map((t) => t._id);
    const [events, routeStops] = await Promise.all([
      tripIds.length ? TripEvent.find({ tripId: { $in: tripIds }, kidId: kid._id }).sort({ at: 1 }) : [],
      kid.routeId ? Stop.find({ routeId: kid.routeId._id || kid.routeId }).sort({ order: 1 }) : [],
    ]);
    const eventsByTrip = new Map();
    for (const e of events) {
      const key = String(e.tripId);
      if (!eventsByTrip.has(key)) eventsByTrip.set(key, []);
      eventsByTrip.get(key).push(e);
    }

    const schoolStop = routeStops.find((s) => s.type === 'school');
    const homeStop = kid.homeStopId && typeof kid.homeStopId === 'object' ? kid.homeStopId : routeStops.find((s) => String(s._id) === String(kid.homeStopId));
    const originName = homeStop?.name || '';
    const destinationName = schoolStop?.name || kid.schoolId?.name || '';

    const todayTrips = trips.filter((t) => {
      const key = tripDayKey(t);
      return key === ymdLocal(todayBounds.start) || t.status === 'active';
    });
    const todayTrip = todayTrips.find((t) => t.status === 'active') || todayTrips[0] || null;
    const todayEvents = todayTrip ? eventsByTrip.get(String(todayTrip._id)) || [] : [];
    const scheduledStart = todayTrip
      ? combineServiceTime(todayTrip.serviceDate, todayTrip.scheduleId?.scheduledTime, todayTrip.scheduledFor)
      : null;

    const timeline = [];
    const pickupEv = todayEvents.find((e) => e.type === 'picked_up');
    const dropEv = todayEvents.find((e) => e.type === 'dropped_off');
    const missEv = todayEvents.find((e) => e.type === 'not_picked_up');
    if (pickupEv) {
      timeline.push({
        kind: 'picked_up',
        title: 'Picked Up',
        time: formatDriverClock(pickupEv.at),
        at: pickupEv.at,
        stopName: originName,
        punctuality: punctualityLabel(pickupEv.at, scheduledStart),
      });
    }
    if (dropEv) {
      const toHome = todayTrip?.direction === 'to_home';
      timeline.push({
        kind: 'dropped_off',
        title: toHome ? 'Dropped Off' : 'Arrived at School',
        time: formatDriverClock(dropEv.at),
        at: dropEv.at,
        stopName: toHome ? originName : destinationName,
        punctuality: null,
      });
    }
    if (missEv) {
      timeline.push({
        kind: 'not_picked_up',
        title: 'Not Picked Up',
        time: formatDriverClock(missEv.at),
        at: missEv.at,
        stopName: originName,
        punctuality: null,
      });
    }

    let statusLabel = 'No trip today';
    let statusKind = 'none';
    let statusAt = null;
    let statusStop = originName;
    if (missEv) {
      statusLabel = 'Not Picked Up';
      statusKind = 'missed';
      statusAt = missEv.at;
    } else if (dropEv) {
      statusLabel = todayTrip?.direction === 'to_home' ? 'Dropped Off' : 'Arrived';
      statusKind = 'dropped';
      statusAt = dropEv.at;
      statusStop = todayTrip?.direction === 'to_home' ? originName : destinationName;
    } else if (pickupEv) {
      statusLabel = 'Picked Up';
      statusKind = 'picked';
      statusAt = pickupEv.at;
    } else if (todayTrip?.status === 'active') {
      statusLabel = 'Pending';
      statusKind = 'pending';
    } else if (todayTrip) {
      statusLabel = 'Scheduled';
      statusKind = 'scheduled';
    }

    const tripByDay = new Map();
    for (const trip of trips) {
      const key = tripDayKey(trip);
      if (!key) continue;
      const prev = tripByDay.get(key);
      if (!prev || (trip.status === 'active' && prev.status !== 'active') || (trip.status === 'completed' && prev.status === 'scheduled')) {
        tripByDay.set(key, trip);
      }
    }

    let picked = 0;
    let pending = 0;
    let missed = 0;
    const attendanceDays = eachYmd(from, to).map((date) => {
      const trip = tripByDay.get(date);
      if (!trip) return { date, weekday: weekdayShort(date), status: 'none', at: null, hasTrip: false };
      const list = eventsByTrip.get(String(trip._id)) || [];
      const boarded = list.some((e) => e.type === 'picked_up');
      const miss = list.some((e) => e.type === 'not_picked_up');
      const ev = list.find((e) => e.type === (miss ? 'not_picked_up' : boarded ? 'picked_up' : null));
      let status = 'pending';
      if (miss) {
        status = 'missed';
        missed += 1;
      } else if (boarded) {
        status = 'picked';
        picked += 1;
      } else {
        pending += 1;
      }
      return { date, weekday: weekdayShort(date), status, at: ev?.at || null, hasTrip: true };
    });
    const tripDays = picked + pending + missed;

    const activityTrips = await Trip.find({
      driverId: req.user.id,
      kidIds: kid._id,
    })
      .select('_id')
      .sort({ updatedAt: -1 })
      .limit(40);
    const activityEvents = activityTrips.length
      ? await TripEvent.find({ tripId: { $in: activityTrips.map((t) => t._id) }, kidId: kid._id }).sort({ at: -1 }).limit(20)
      : [];
    const activity = activityEvents.map((e) => ({
      kind: e.type,
      title: e.type === 'picked_up' ? 'Picked up' : e.type === 'dropped_off' ? 'Dropped off' : 'Not picked up',
      time: formatDriverClock(e.at),
      at: e.at,
      dateLabel: e.at
        ? new Date(e.at).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' })
        : '',
    }));

    const horizon = new Date();
    horizon.setDate(horizon.getDate() + 14);
    const schedules = await TripSchedule.find({
      driverId: req.user.id,
      active: true,
      $or: [{ kidIds: kid._id }, ...(kid.routeId ? [{ routeId: kid.routeId._id || kid.routeId }] : [])],
    }).select('scheduledTime period direction startDate endDate scheduleType customDays routeId kidIds');
    const upcoming = [];
    const seenDays = new Set();
    for (const schedule of schedules) {
      if (Array.isArray(schedule.kidIds) && schedule.kidIds.length && !schedule.kidIds.some((id) => String(id) === String(kid._id))) {
        continue;
      }
      const dates = datesForSchedule(schedule, todayBounds.start, horizon);
      for (const d of dates) {
        const key = ymdLocal(d);
        const stamp = `${key}:${schedule.direction || ''}`;
        if (seenDays.has(stamp)) continue;
        seenDays.add(stamp);
        const toHome = schedule.direction === 'to_home';
        upcoming.push({
          date: key,
          weekday: weekdayShort(key),
          dateLabel: d.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' }),
          pickupTime: formatHm(schedule.scheduledTime),
          period: schedule.period || (toHome ? 'afternoon' : 'morning'),
          direction: schedule.direction,
          origin: toHome ? destinationName : originName,
          destination: toHome ? originName : destinationName,
        });
      }
    }
    upcoming.sort((a, b) => `${a.date}:${a.direction}`.localeCompare(`${b.date}:${b.direction}`));

    const parents = (kid.parentIds || [])
      .filter((p) => p && typeof p === 'object')
      .map((p) => ({
        _id: p._id,
        name: p.name || 'Parent',
        phone: p.phone || '',
        email: p.email || '',
        photoUrl: p.photoUrl || '',
        relationship: kid.relationship || '',
      }));

    const classLabel = [kid.grade, kid.section || kid.stream].filter((s) => String(s || '').trim()).join(' ');
    res.json({
      kid: {
        _id: kid._id,
        name: kid.name,
        photoUrl: kid.photoUrl || '',
        grade: kid.grade || '',
        section: kid.section || '',
        stream: kid.stream || '',
        classLabel: classLabel || kid.grade || '',
        admissionNo: kid.admissionNo || '',
        rollNo: kid.rollNo || '',
        house: kid.house || '',
        gender: kid.gender || '',
        dateOfBirth: kid.dateOfBirth || null,
        relationship: kid.relationship || '',
        allergies: kid.allergies || '',
        bloodGroup: kid.bloodGroup || '',
        about: kid.about || '',
        health: {
          conditions: kid.health?.conditions || '',
          medication: kid.health?.medication || '',
        },
      },
      homeStop: homeStop
        ? { _id: homeStop._id, name: homeStop.name || '', address: homeStop.address || '', house: kid.house || '' }
        : { name: '', address: '', house: kid.house || '' },
      school: { name: kid.schoolId?.name || destinationName || '' },
      route: { name: kid.routeId?.name || todayTrip?.routeId?.name || '' },
      status: {
        kind: statusKind,
        label: statusLabel,
        at: statusAt,
        time: formatDriverClock(statusAt),
        stopName: statusStop,
        dateLabel: new Date().toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'short', year: 'numeric' }),
      },
      today: {
        tripId: todayTrip?._id || null,
        status: todayTrip?.status || '',
        direction: todayTrip?.direction || '',
        canOpenMap: todayTrip?.status === 'active',
        origin: originName,
        destination: destinationName,
        timeline,
      },
      attendance: {
        window: windowDays === 30 ? 'month' : 'week',
        picked,
        pending,
        missed,
        pct: pct(picked, tripDays),
        days: attendanceDays,
      },
      parents,
      upcoming: upcoming.slice(0, 5),
      activity,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

function messageTimeLabel(value) {
  const d = value ? new Date(value) : null;
  if (!d || Number.isNaN(d.getTime())) return '';
  const now = new Date();
  const startToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const startThat = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const diffDays = Math.round((startToday - startThat) / 86400000);
  if (diffDays === 0) {
    const hour = d.getHours() % 12 || 12;
    const mins = String(d.getMinutes()).padStart(2, '0');
    const ampm = d.getHours() >= 12 ? 'PM' : 'AM';
    return `${hour}:${mins} ${ampm}`;
  }
  if (diffDays === 1) return 'Yesterday';
  if (diffDays < 7) return `${diffDays} days ago`;
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
}

function messageClockLabel(value) {
  const d = value ? new Date(value) : null;
  if (!d || Number.isNaN(d.getTime())) return '';
  const hour = d.getHours() % 12 || 12;
  const mins = String(d.getMinutes()).padStart(2, '0');
  const ampm = d.getHours() >= 12 ? 'PM' : 'AM';
  return `${hour}:${mins} ${ampm}`;
}

function serializeDriverConversation(row) {
  const doc = row.toObject ? row.toObject() : row;
  const kind = doc.avatarKind === 'admin' || doc.roleLabel === 'Administration'
    ? 'admin'
    : doc.avatarKind === 'driver' || doc.roleLabel === 'Driver'
      ? 'driver'
      : doc.type === 'group'
        ? 'group'
        : 'parent';
  return {
    _id: doc._id,
    type: doc.type || 'direct',
    kind,
    title: doc.title,
    roleLabel: doc.roleLabel || (kind === 'admin' ? 'Admin' : 'Parent'),
    subtitle: doc.subtitle || '',
    avatarKind: doc.avatarKind || 'parent',
    photoUrl: doc.photoUrl || '',
    phone: doc.phone || '',
    lastMessage: doc.lastMessage || '',
    lastMessageAt: doc.lastMessageAt,
    timeLabel: messageTimeLabel(doc.lastMessageAt),
    unreadCount: doc.driverUnreadCount || 0,
    archived: doc.archived === true,
    parentId: doc.parentId || null,
    counterpartUserId: doc.counterpartUserId || null,
  };
}

function serializeDriverChatMessage(row, driverId) {
  const doc = row.toObject ? row.toObject() : row;
  const senderId = doc.senderUserId ? String(doc.senderUserId) : '';
  const mine = senderId
    ? senderId === String(driverId)
    : doc.sender === 'driver' || doc.sender === 'staff';
  return {
    _id: doc._id,
    sender: doc.sender,
    senderName: doc.senderName || '',
    body: doc.body,
    createdAt: doc.createdAt,
    timeLabel: messageClockLabel(doc.createdAt) || messageTimeLabel(doc.createdAt),
    mine,
  };
}

async function driverMessageContacts(userId) {
  const profile = await DriverProfile.findOne({ userId: userId });
  const { start, end } = dayBounds();
  const todayTrips = await Trip.find({
    driverId: userId,
    $or: [
      { serviceDate: { $gte: start, $lte: end } },
      { scheduledFor: { $gte: start, $lte: end } },
      { status: 'active' },
    ],
  }).select('routeId schoolId kidIds');
  const routeIds = new Set(todayTrips.map((t) => String(t.routeId)).filter((id) => id && id !== 'undefined'));
  for (const id of profile?.assignedRouteIds || []) routeIds.add(String(id));
  const kidIds = todayTrips.flatMap((t) => t.kidIds || []).filter(Boolean);
  const kidQuery = { active: true, $or: [] };
  if (routeIds.size) kidQuery.$or.push({ routeId: { $in: [...routeIds] } });
  if (kidIds.length) kidQuery.$or.push({ _id: { $in: kidIds } });
  const kids = kidQuery.$or.length
    ? await Kid.find(kidQuery).select('name grade photoUrl parentIds schoolId')
    : [];
  const parentIds = new Set();
  const schoolIds = new Set();
  const kidsByParent = new Map();
  for (const kid of kids) {
    if (kid.schoolId) schoolIds.add(String(kid.schoolId));
    for (const pid of kid.parentIds || []) {
      const id = String(pid);
      parentIds.add(id);
      if (!kidsByParent.has(id)) kidsByParent.set(id, []);
      kidsByParent.get(id).push(kid.name);
    }
  }
  const [parents, admins] = await Promise.all([
    parentIds.size
      ? User.find({ _id: { $in: [...parentIds] }, active: { $ne: false } }).select('name phone photoUrl')
      : [],
    schoolIds.size
      ? User.find({
          schoolId: { $in: [...schoolIds] },
          role: 'school_admin',
          active: { $ne: false },
        }).select('name phone photoUrl schoolId')
      : [],
  ]);
  const schoolId = [...schoolIds][0] || null;
  return {
    schoolId,
    parents: parents.map((p) => ({
      _id: p._id,
      kind: 'parent',
      name: p.name,
      phone: p.phone || '',
      photoUrl: p.photoUrl || '',
      roleLabel: 'Parent',
      subtitle: (kidsByParent.get(String(p._id)) || []).slice(0, 3).join(', '),
    })),
    admins: admins.map((a) => ({
      _id: a._id,
      kind: 'admin',
      name: a.name,
      phone: a.phone || '',
      photoUrl: a.photoUrl || '',
      roleLabel: 'Admin',
      subtitle: 'School administration',
      schoolId: a.schoolId,
    })),
  };
}

async function findDriverConvo(driverId, { parentId, adminId }) {
  if (parentId) {
    return Conversation.findOne({
      driverId,
      parentId,
      counterpartUserId: driverId,
      type: 'direct',
    });
  }
  if (adminId) {
    return Conversation.findOne({
      driverId,
      counterpartUserId: adminId,
      parentId: null,
      type: 'direct',
    });
  }
  return null;
}

async function ensureDriverConvo(driverId, schoolId, contact, driverName) {
  const parentId = contact.kind === 'parent' ? contact._id : null;
  const adminId = contact.kind === 'admin' ? contact._id : null;
  let convo = await findDriverConvo(driverId, { parentId, adminId });
  if (convo) return convo;
  const sourceKey = parentId
    ? `driver:${driverId}:parent:${parentId}`
    : `driver:${driverId}:admin:${adminId}`;
  convo = await Conversation.findOne({ driverId, sourceKey });
  if (convo) return convo;
  return Conversation.create({
    schoolId,
    parentId,
    driverId,
    counterpartUserId: parentId ? driverId : adminId,
    type: 'direct',
    title: contact.name,
    roleLabel: contact.kind === 'admin' ? 'Administration' : 'Parent',
    avatarKind: contact.kind === 'admin' ? 'admin' : 'parent',
    photoUrl: contact.photoUrl || '',
    phone: contact.phone || '',
    subtitle: contact.subtitle || '',
    lastMessage: '',
    lastMessageAt: new Date(),
    unreadCount: 0,
    driverUnreadCount: 0,
    sourceKey,
  });
}

async function driverSendMessage(convo, driver, body) {
  const message = await Message.create({
    conversationId: convo._id,
    sender: 'driver',
    senderUserId: driver._id,
    senderName: driver.name || 'Driver',
    body,
  });
  convo.lastMessage = body;
  convo.lastMessageAt = message.createdAt;
  convo.archived = false;
  convo.driverUnreadCount = 0;
  convo.unreadCount = (convo.unreadCount || 0) + 1;
  convo.staffUnreadCount = (convo.staffUnreadCount || 0) + 1;
  await convo.save();
  const notifyId = convo.parentId || (String(convo.counterpartUserId) !== String(driver._id) ? convo.counterpartUserId : null);
  if (notifyId) {
    await createAndEmitNotifications(getIO(), [
      {
        userId: notifyId,
        type: 'message',
        title: driver.name || 'Driver',
        body,
      },
    ]);
  }
  return message;
}

async function currentDriverTripCard(userId) {
  const { start, end } = dayBounds();
  const active = await Trip.findOne({ driverId: userId, status: 'active' })
    .populate('routeId', 'name')
    .populate('schoolId', 'name location address')
    .populate('busId', 'plate label seats')
    .populate('scheduleId', 'name scheduledTime')
    .populate('kidIds', 'name grade');
  if (active) return serializeDriverTripCard(active);
  const scheduled = await Trip.findOne({
    driverId: userId,
    status: 'scheduled',
    $or: [
      { serviceDate: { $gte: start, $lte: end } },
      { scheduledFor: { $gte: start, $lte: end } },
    ],
  })
    .populate('routeId', 'name')
    .populate('schoolId', 'name location address')
    .populate('busId', 'plate label seats')
    .populate('scheduleId', 'name scheduledTime')
    .populate('kidIds', 'name grade')
    .sort({ sequence: 1, scheduledFor: 1 });
  return scheduled ? serializeDriverTripCard(scheduled) : null;
}

router.get('/messages', async (req, res) => {
  try {
    const q = String(req.query.q || '').trim();
    const tab = String(req.query.tab || 'all').toLowerCase();
    const filter = {
      $or: [{ driverId: req.user.id }, { counterpartUserId: req.user.id }],
    };
    if (tab === 'archived') filter.archived = true;
    else filter.archived = { $ne: true };
    if (q) {
      const rx = new RegExp(q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
      filter.$and = [{ $or: [{ title: rx }, { lastMessage: rx }, { roleLabel: rx }] }];
    }
    const [rows, contacts, trip, profile] = await Promise.all([
      Conversation.find(filter).sort({ lastMessageAt: -1 }).limit(80),
      driverMessageContacts(req.user.id),
      currentDriverTripCard(req.user.id),
      DriverProfile.findOne({ userId: req.user.id }).populate('busId', 'plate label seats'),
    ]);
    const conversations = rows.map(serializeDriverConversation).filter((c) => {
      if (tab === 'parents') return c.kind === 'parent';
      if (tab === 'drivers') return c.kind === 'driver';
      if (tab === 'admins') return c.kind === 'admin';
      if (tab === 'archived') return true;
      return tab === 'all' || tab === '';
    });
    const all = rows.map(serializeDriverConversation);
    const bus = trip?.busId || profile?.busId;
    res.json({
      conversations,
      contacts: [...contacts.parents, ...contacts.admins],
      counts: {
        all: all.filter((c) => !c.archived).length,
        parents: all.filter((c) => !c.archived && c.kind === 'parent').length,
        drivers: all.filter((c) => !c.archived && c.kind === 'driver').length,
        admins: all.filter((c) => !c.archived && c.kind === 'admin').length,
        archived: all.filter((c) => c.archived).length,
      },
      trip,
      vehicle: {
        name: bus?.label || profile?.vehicleModel || 'School Bus',
        plate: bus?.plate || profile?.vehiclePlate || '',
      },
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/messages', async (req, res) => {
  try {
    const body = String(req.body?.body || '').trim();
    const contactId = req.body?.contactId;
    const kind = req.body?.kind === 'admin' ? 'admin' : 'parent';
    if (!contactId) return res.status(400).json({ error: 'Choose a contact' });
    const contacts = await driverMessageContacts(req.user.id);
    const list = kind === 'admin' ? contacts.admins : contacts.parents;
    const contact = list.find((c) => String(c._id) === String(contactId));
    if (!contact) return res.status(404).json({ error: 'Contact not found' });
    if (!contacts.schoolId && kind !== 'admin') return res.status(400).json({ error: 'No school on file for this route' });
    const schoolId = contact.schoolId || contacts.schoolId;
    if (!schoolId) return res.status(400).json({ error: 'No school on file' });
    const driver = await User.findById(req.user.id).select('name');
    const convo = await ensureDriverConvo(req.user.id, schoolId, contact, driver?.name);
    if (body) await driverSendMessage(convo, driver, body);
    res.status(201).json({ conversation: serializeDriverConversation(convo) });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/messages/broadcast', async (req, res) => {
  try {
    const body = String(req.body?.body || '').trim();
    if (!body) return res.status(400).json({ error: 'Message cannot be empty' });
    const contacts = await driverMessageContacts(req.user.id);
    if (!contacts.schoolId) return res.status(400).json({ error: 'No school on file' });
    const driver = await User.findById(req.user.id).select('name');
    let sent = 0;
    for (const contact of contacts.parents) {
      const convo = await ensureDriverConvo(req.user.id, contacts.schoolId, contact, driver?.name);
      await driverSendMessage(convo, driver, body);
      sent += 1;
    }
    res.json({ ok: true, sent });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/messages/:id', async (req, res) => {
  try {
    const convo = await Conversation.findOne({
      _id: req.params.id,
      $or: [{ driverId: req.user.id }, { counterpartUserId: req.user.id }],
    });
    if (!convo) return res.status(404).json({ error: 'Conversation not found' });
    if (convo.driverUnreadCount) {
      convo.driverUnreadCount = 0;
      await convo.save();
    }
    const messages = await Message.find({ conversationId: convo._id }).sort({ createdAt: 1 }).limit(200);
    res.json({
      conversation: serializeDriverConversation(convo),
      messages: messages.map((m) => serializeDriverChatMessage(m, req.user.id)),
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/messages/:id', async (req, res) => {
  try {
    const body = String(req.body?.body || '').trim();
    if (!body) return res.status(400).json({ error: 'Message cannot be empty' });
    const convo = await Conversation.findOne({
      _id: req.params.id,
      $or: [{ driverId: req.user.id }, { counterpartUserId: req.user.id }],
    });
    if (!convo) return res.status(404).json({ error: 'Conversation not found' });
    const driver = await User.findById(req.user.id).select('name');
    const message = await driverSendMessage(convo, driver, body);
    res.status(201).json({
      conversation: serializeDriverConversation(convo),
      message: serializeDriverChatMessage(message, req.user.id),
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/messages/:id/archive', async (req, res) => {
  try {
    const convo = await Conversation.findOne({
      _id: req.params.id,
      $or: [{ driverId: req.user.id }, { counterpartUserId: req.user.id }],
    });
    if (!convo) return res.status(404).json({ error: 'Conversation not found' });
    convo.archived = req.body?.archived !== false;
    await convo.save();
    res.json({ conversation: serializeDriverConversation(convo) });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
