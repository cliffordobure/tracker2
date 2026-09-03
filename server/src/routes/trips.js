import { Router } from 'express';
import {
  Trip,
  TripEvent,
  LocationPing,
  Kid,
  Route,
  Stop,
} from '../models/index.js';
import { authenticate, requireRole } from '../middleware/auth.js';
import { getIO } from '../socket.js';
import { createAndEmitNotifications } from '../services/notifications.js';
import { formatClock, formatDateTime } from '../lib/clock.js';
import { stripApprovedLeaveFromKids } from '../lib/leave.js';

const router = Router();

function isEveningTrip(trip) {
  return trip?.direction === 'to_home' || trip?.period === 'evening' || trip?.period === 'afternoon';
}

function stopPhrase(name) {
  const n = String(name || '').trim();
  if (!n) return 'their stop';
  return /stop/i.test(n) ? n : `${n} stop`;
}

function childPossessive(kid) {
  const gender = String(kid?.gender || '').toLowerCase();
  if (gender === 'female') return 'her';
  if (gender === 'male') return 'his';
  return 'their';
}

function startOfToday() {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}

async function boardedKidIds(tripId) {
  const events = await TripEvent.find({ tripId, type: 'picked_up' }).select('kidId');
  return events.map((e) => e.kidId.toString());
}

async function emitTripStarted(trip, kids, { eveningBoard = false } = {}) {
  const io = getIO();
  const directionLabel = trip.direction === 'to_school' ? 'morning (to school)' : 'evening (to home)';
  const when = formatDateTime(trip.startedAt || new Date());
  const notifications = [];
  for (const kid of kids) {
    for (const parentId of kid.parentIds || []) {
      if (eveningBoard) {
        notifications.push({
          userId: parentId,
          type: 'trip_started',
          title: 'On the evening bus',
          body: `${kid.name} has left school and is on the way home.`,
          tripId: trip._id,
          kidId: kid._id,
          key: `${parentId}:evening_start:${trip._id}:${kid._id}`,
        });
      } else {
        notifications.push({
          userId: parentId,
          type: 'trip_started',
          title: 'Leaving school',
          body: `The bus/van is now leaving school to pick your child ${kid.name} at ${when}`,
          tripId: trip._id,
          kidId: kid._id,
        });
      }
    }
  }
  const driverId = trip.driverId?._id || trip.driverId;
  if (driverId) {
    const stops = await Stop.find({ routeId: trip.routeId }).sort({ order: 1 }).select('name type');
    const school = stops.find((s) => s.type === 'school');
    const home = stops.find((s) => s.type !== 'school');
    const fromName = trip.direction === 'to_home' ? school?.name : home?.name;
    const started = trip.startedAt ? new Date(trip.startedAt) : new Date();
    const clock = formatClock(started);
    notifications.push({
      userId: driverId,
      type: 'trip_started',
      title: 'Route started',
      body: fromName
        ? `You started the route at ${clock} from ${fromName}.`
        : `You started the ${directionLabel} route at ${clock}.`,
      tripId: trip._id,
      key: `${driverId}:trip_started:${trip._id}`,
    });
  }
  const driverIdStr = driverId ? String(driverId) : '';
  const parentNotes = notifications.filter((n) => String(n.userId) !== driverIdStr);
  const driverNotes = notifications.filter((n) => String(n.userId) === driverIdStr);
  if (parentNotes.length) {
    try {
      await createAndEmitNotifications(io, parentNotes);
    } catch (err) {
      console.warn('[trips] parent start notify failed:', err.message);
    }
  }
  if (driverNotes.length) {
    try {
      await createAndEmitNotifications(io, driverNotes);
    } catch (_) {}
  }

  const populated = await Trip.findById(trip._id)
    .populate('routeId', 'name')
    .populate('schoolId', 'name location address supportPhone')
    .populate('busId', 'plate label seats')
    .populate('kidIds');

  io?.to(`trip:${trip._id}`).emit('trip:started', { trip: populated });
  if (driverId) io?.to(`user:${driverId}`).emit('trip:started', { trip: populated });
  for (const kid of kids) {
    for (const parentId of kid.parentIds || []) {
      const alert = eveningBoard
        ? {
            type: 'trip_started',
            title: 'On the evening bus',
            body: `${kid.name} has left school and is on the way home.`,
          }
        : {
            type: 'trip_started',
            title: 'Leaving school',
            body: `The bus/van is now leaving school to pick your child ${kid.name} at ${when}`,
          };
      io?.to(`user:${parentId}`).emit('trip:started', { trip: populated, kidId: kid._id, alert });
    }
  }

  if (eveningBoard) {
    const events = await TripEvent.find({ tripId: trip._id, type: 'picked_up' });
    for (const kid of kids) {
      const event = events.find((e) => String(e.kidId) === String(kid._id));
      const payload = { tripId: trip._id.toString(), kidId: kid._id, event };
      io?.to(`trip:${trip._id}`).emit('kid:picked_up', payload);
      for (const parentId of kid.parentIds || []) {
        io?.to(`user:${parentId}`).emit('kid:picked_up', payload);
      }
    }
  }
  return populated;
}

async function activateTrip(trip, req) {
  trip.status = 'active';
  trip.startedAt = new Date();
  const startLoc = locationFromBody(req.body) || trip.latestLocation;
  if (startLoc) trip.startLocation = startLoc;
  await trip.save();

  const kids = await Kid.find({ _id: { $in: trip.kidIds }, active: true });
  if (isEveningTrip(trip)) {
    const boardedIds = new Set(await boardedKidIds(trip._id));
    const boardedKids = kids.filter((k) => boardedIds.has(String(k._id)));
    if (!boardedKids.length) {
      trip.status = 'scheduled';
      trip.startedAt = undefined;
      await trip.save();
      const err = new Error('Check in students at school before starting the evening trip');
      err.status = 400;
      throw err;
    }
    return emitTripStarted(trip, boardedKids, { eveningBoard: true });
  }
  return emitTripStarted(trip, kids);
}

function locationFromBody(body) {
  if (body?.lat == null || body?.lng == null) return null;
  return {
    lat: Number(body.lat),
    lng: Number(body.lng),
    heading: body.heading != null ? Number(body.heading) : undefined,
    speed: body.speed != null ? Number(body.speed) : undefined,
    at: new Date(),
  };
}

async function openCheckIns(tripId) {
  const events = await TripEvent.find({ tripId });
  const picked = new Set(
    events.filter((e) => e.type === 'picked_up').map((e) => e.kidId.toString())
  );
  const dropped = new Set(
    events.filter((e) => e.type === 'dropped_off').map((e) => e.kidId.toString())
  );
  const open = [];
  for (const id of picked) {
    if (!dropped.has(id)) open.push(id);
  }
  return open;
}

/** Start a scheduled dispatch trip assigned to this driver. */
router.post('/:id/start', authenticate, requireRole('driver'), async (req, res) => {
  try {
    const existing = await Trip.findOne({ driverId: req.user.id, status: 'active' });
    if (existing) {
      return res.status(409).json({ error: 'You already have an active trip', trip: existing });
    }

    const trip = await Trip.findOne({
      _id: req.params.id,
      driverId: req.user.id,
    });
    if (!trip) return res.status(404).json({ error: 'Trip not found' });
    if (trip.status === 'cancelled') {
      return res.status(400).json({ error: 'Cannot start a cancelled trip' });
    }
    if (trip.status === 'completed') {
      return res.status(400).json({ error: 'Cannot start a completed trip' });
    }
    if (trip.status === 'active') {
      return res.status(409).json({ error: 'Trip is already active', trip });
    }
    if (trip.status !== 'scheduled') {
      return res.status(400).json({ error: `Cannot start trip with status ${trip.status}` });
    }

    const populated = await activateTrip(trip, req);
    res.json({ trip: populated });
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message });
  }
});

/** Ad-hoc trip start (no hard route assignment gate — day dispatch preferred). */
router.post('/', authenticate, requireRole('driver'), async (req, res) => {
  try {
    const { routeId, direction, tripId } = req.body;

    // Prefer starting a pre-dispatched scheduled trip
    if (tripId) {
      const existing = await Trip.findOne({ driverId: req.user.id, status: 'active' });
      if (existing) {
        return res.status(409).json({ error: 'You already have an active trip', trip: existing });
      }
      const scheduled = await Trip.findOne({
        _id: tripId,
        driverId: req.user.id,
        status: 'scheduled',
      });
      if (!scheduled) return res.status(404).json({ error: 'Scheduled trip not found' });
      if (isEveningTrip(scheduled)) {
        const boarded = await boardedKidIds(scheduled._id);
        if (!boarded.length) {
          const populated = await Trip.findById(scheduled._id)
            .populate('routeId', 'name')
            .populate('schoolId', 'name location address supportPhone')
            .populate('busId', 'plate label seats')
            .populate('kidIds');
          return res.status(200).json({ trip: populated, boarding: true });
        }
      }
      const populated = await activateTrip(scheduled, req);
      return res.status(200).json({ trip: populated });
    }

    if (!routeId || !['to_school', 'to_home'].includes(direction)) {
      return res.status(400).json({ error: 'routeId and valid direction are required' });
    }

    const existing = await Trip.findOne({ driverId: req.user.id, status: 'active' });
    if (existing) {
      return res.status(409).json({ error: 'You already have an active trip', trip: existing });
    }

    const route = await Route.findById(routeId);
    if (!route) return res.status(404).json({ error: 'Route not found' });

    const kids = await Kid.find({ routeId, active: true });
    if (!kids.length) {
      return res.status(400).json({ error: 'No kids assigned to this route' });
    }

    // Evening runs board at school first. Create a scheduled trip so the driver
    // can check students in, then start once the bus is full.
    if (direction === 'to_home') {
      const trip = await Trip.create({
        routeId,
        driverId: req.user.id,
        schoolId: route.schoolId,
        direction,
        period: 'evening',
        status: 'scheduled',
        kidIds: kids.map((k) => k._id),
        serviceDate: startOfToday(),
      });
      const populated = await Trip.findById(trip._id)
        .populate('routeId', 'name')
        .populate('schoolId', 'name location address supportPhone')
        .populate('busId', 'plate label seats')
        .populate('kidIds');
      return res.status(201).json({ trip: populated, boarding: true });
    }

    const trip = await Trip.create({
      routeId,
      driverId: req.user.id,
      schoolId: route.schoolId,
      direction,
      status: 'active',
      kidIds: kids.map((k) => k._id),
      startedAt: new Date(),
    });

    const populated = await emitTripStarted(trip, kids);
    res.status(201).json({ trip: populated });
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message });
  }
});

router.post('/:id/location', authenticate, requireRole('driver'), async (req, res) => {
  try {
    const { lat, lng, heading, speed } = req.body;
    if (typeof lat !== 'number' || typeof lng !== 'number') {
      return res.status(400).json({ error: 'lat and lng are required numbers' });
    }

    const trip = await Trip.findOne({
      _id: req.params.id,
      driverId: req.user.id,
      status: { $in: ['active', 'scheduled'] },
    });
    if (!trip) return res.status(404).json({ error: 'Trip not found' });
    if (trip.status === 'scheduled' && !isEveningTrip(trip)) {
      return res.status(400).json({ error: 'Start the trip before sharing live location' });
    }

    const at = new Date();
    const ping = { lat, lng, heading, speed, at };
    trip.latestLocation = ping;
    await trip.save();
    await LocationPing.create({ tripId: trip._id, ...ping });

    const payload = { tripId: trip._id.toString(), ...ping };
    const io = getIO();
    io?.to(`trip:${trip._id}`).emit('location:update', payload);
    if (trip.schoolId) {
      io?.to(`school:${trip.schoolId}`).emit('location:update', payload);
    }

    // Parents only get live GPS after the trip is actually started.
    if (trip.status === 'active') {
      const [picked, dropped] = await Promise.all([
        TripEvent.find({ tripId: trip._id, type: 'picked_up' }).select('kidId'),
        TripEvent.find({ tripId: trip._id, type: 'dropped_off' }).select('kidId'),
      ]);
      const droppedSet = new Set(dropped.map((e) => e.kidId.toString()));
      const onboardIds = picked
        .map((e) => e.kidId)
        .filter((id) => !droppedSet.has(id.toString()));
      if (onboardIds.length) {
        const onboardKids = await Kid.find({ _id: { $in: onboardIds } }).select('parentIds');
        const parentIds = new Set();
        for (const kid of onboardKids) {
          for (const parentId of kid.parentIds || []) parentIds.add(parentId.toString());
        }
        for (const parentId of parentIds) {
          io?.to(`user:${parentId}`).emit('location:update', payload);
        }
      }
    }

    res.json({ ok: true, location: ping });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/:id/kids/:kidId/check-in', authenticate, requireRole('driver'), async (req, res) => {
  try {
    const trip = await Trip.findOne({
      _id: req.params.id,
      driverId: req.user.id,
      status: { $in: ['scheduled', 'active'] },
    });
    if (!trip) return res.status(404).json({ error: 'Trip not found' });
    if (!isEveningTrip(trip)) {
      return res.status(400).json({ error: 'Check-in is for evening boarding at school' });
    }

    const kidId = req.params.kidId;
    if (!trip.kidIds.some((id) => id.toString() === kidId)) {
      return res.status(400).json({ error: 'Kid is not on this trip' });
    }

    const existing = await TripEvent.findOne({ tripId: trip._id, kidId, type: 'picked_up' });
    if (existing) return res.status(409).json({ error: 'Student is already checked in' });

    await TripEvent.deleteMany({ tripId: trip._id, kidId, type: 'not_picked_up' });

    const location = trip.latestLocation
      ? { lat: trip.latestLocation.lat, lng: trip.latestLocation.lng }
      : undefined;

    const event = await TripEvent.create({
      tripId: trip._id,
      kidId,
      type: 'picked_up',
      at: new Date(),
      location,
    });

    const boarded = await boardedKidIds(trip._id);
    const expected = (trip.kidIds || []).length;
    const missed = await TripEvent.countDocuments({ tripId: trip._id, type: 'not_picked_up' });

    // Boarding at school stays silent. Parents are only notified after the
    // driver starts the trip (or if a student boards once the route is already live).
    if (trip.status === 'active') {
      const kid = await Kid.findById(kidId);
      const io = getIO();
      const when = formatDateTime(event.at || new Date());
      const notifications = (kid?.parentIds || []).map((parentId) => ({
        userId: parentId,
        type: 'kid_picked_up',
        title: 'Leaving school',
        body: `The bus/van is now leaving school for dropping your child ${kid.name} at ${when}`,
        tripId: trip._id,
        kidId: kid._id,
      }));
      if (notifications.length) await createAndEmitNotifications(io, notifications);
      const payload = { tripId: trip._id.toString(), kidId, event };
      io?.to(`trip:${trip._id}`).emit('kid:picked_up', payload);
      for (const parentId of kid?.parentIds || []) {
        io?.to(`user:${parentId}`).emit('kid:picked_up', payload);
      }
    }

    res.json({
      event,
      boarded: boarded.length,
      expected,
      missed,
      remaining: Math.max(0, expected - boarded.length - missed),
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/:id/kids/:kidId/check-in/undo', authenticate, requireRole('driver'), async (req, res) => {
  try {
    const trip = await Trip.findOne({
      _id: req.params.id,
      driverId: req.user.id,
      status: 'scheduled',
    });
    if (!trip) return res.status(404).json({ error: 'Boarding trip not found' });
    if (!isEveningTrip(trip)) {
      return res.status(400).json({ error: 'Check-in is for evening boarding at school' });
    }

    await TripEvent.deleteMany({
      tripId: trip._id,
      kidId: req.params.kidId,
      type: { $in: ['picked_up', 'not_picked_up'] },
    });

    const boarded = await boardedKidIds(trip._id);
    const expected = (trip.kidIds || []).length;
    const missed = await TripEvent.countDocuments({ tripId: trip._id, type: 'not_picked_up' });
    res.json({
      ok: true,
      boarded: boarded.length,
      expected,
      missed,
      remaining: Math.max(0, expected - boarded.length - missed),
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/:id/kids/:kidId/pickup', authenticate, requireRole('driver'), async (req, res) => {
  try {
    const trip = await Trip.findOne({ _id: req.params.id, driverId: req.user.id, status: 'active' });
    if (!trip) return res.status(404).json({ error: 'Active trip not found' });

    const kidId = req.params.kidId;
    if (!trip.kidIds.some((id) => id.toString() === kidId)) {
      return res.status(400).json({ error: 'Kid is not on this trip' });
    }

    const existing = await TripEvent.findOne({ tripId: trip._id, kidId, type: 'picked_up' });
    if (existing) return res.status(409).json({ error: 'Kid already marked picked up' });

    await TripEvent.deleteMany({ tripId: trip._id, kidId, type: 'not_picked_up' });

    const location = trip.latestLocation
      ? { lat: trip.latestLocation.lat, lng: trip.latestLocation.lng }
      : undefined;

    const event = await TripEvent.create({
      tripId: trip._id,
      kidId,
      type: 'picked_up',
      at: new Date(),
      location,
    });

    const kid = await Kid.findById(kidId).populate('homeStopId', 'name');
    const io = getIO();
    const stopName = kid?.homeStopId?.name ? String(kid.homeStopId.name) : '';
    const when = formatDateTime(event.at || new Date());
    const notifications = (kid?.parentIds || []).map((parentId) => ({
      userId: parentId,
      type: 'kid_picked_up',
      title: 'Picked up',
      body: `Your child ${kid.name} has been picked up for school at ${stopPhrase(stopName)} at ${when}`,
      tripId: trip._id,
      kidId: kid._id,
    }));
    const driverId = trip.driverId?._id || trip.driverId;
    if (driverId && kid) {
      notifications.push({
        userId: driverId,
        type: 'kid_picked_up',
        title: 'Student picked up',
        body: stopName ? `${kid.name} was picked up at ${stopName}.` : `${kid.name} was picked up.`,
        tripId: trip._id,
        kidId: kid._id,
        key: `${driverId}:pickup:${trip._id}:${kid._id}`,
      });
    }
    await createAndEmitNotifications(io, notifications);

    const payload = { tripId: trip._id.toString(), kidId, event };
    io?.to(`trip:${trip._id}`).emit('kid:picked_up', payload);
    for (const parentId of kid?.parentIds || []) {
      io?.to(`user:${parentId}`).emit('kid:picked_up', payload);
    }

    res.json({ event });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/:id/kids/:kidId/miss', authenticate, requireRole('driver'), async (req, res) => {
  try {
    const trip = await Trip.findOne({
      _id: req.params.id,
      driverId: req.user.id,
      status: { $in: ['scheduled', 'active'] },
    });
    if (!trip) return res.status(404).json({ error: 'Trip not found' });
    if (trip.status === 'scheduled' && !isEveningTrip(trip)) {
      return res.status(400).json({ error: 'Start the trip before marking a missed pickup' });
    }

    const kidId = req.params.kidId;
    if (!trip.kidIds.some((id) => id.toString() === kidId)) {
      return res.status(400).json({ error: 'Kid is not on this trip' });
    }

    const picked = await TripEvent.findOne({ tripId: trip._id, kidId, type: 'picked_up' });
    if (picked) return res.status(400).json({ error: 'Kid is already picked up' });

    const existing = await TripEvent.findOne({ tripId: trip._id, kidId, type: 'not_picked_up' });
    if (existing) return res.status(409).json({ error: 'Kid already marked not picked up' });

    const location = trip.latestLocation
      ? { lat: trip.latestLocation.lat, lng: trip.latestLocation.lng }
      : undefined;

    const event = await TripEvent.create({
      tripId: trip._id,
      kidId,
      type: 'not_picked_up',
      at: new Date(),
      location,
    });

    const kid = await Kid.findById(kidId).populate('homeStopId', 'name');
    const driverId = trip.driverId?._id || trip.driverId;
    if (trip.status === 'active' && driverId && kid) {
      const stopName = kid.homeStopId?.name ? String(kid.homeStopId.name) : '';
      await createAndEmitNotifications(getIO(), [
        {
          userId: driverId,
          type: 'attendance_alert',
          title: 'Student not picked up',
          body: stopName
            ? `${kid.name} was not picked up at ${stopName}.`
            : `${kid.name} was marked not picked up.`,
          tripId: trip._id,
          kidId: kid._id,
          key: `${driverId}:miss:${trip._id}:${kid._id}`,
        },
      ]);
    }

    res.json({ event });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/:id/stops/:stopId/note', authenticate, requireRole('driver'), async (req, res) => {
  try {
    const trip = await Trip.findOne({
      _id: req.params.id,
      driverId: req.user.id,
      status: { $in: ['scheduled', 'active'] },
    });
    if (!trip) return res.status(404).json({ error: 'Trip not found' });

    const text = String(req.body?.text || '').trim().slice(0, 500);
    if (!text) return res.status(400).json({ error: 'Note text is required' });

    if (!Array.isArray(trip.stopNotes)) trip.stopNotes = [];
    trip.stopNotes.push({
      stopId: req.params.stopId,
      text,
      at: new Date(),
    });
    await trip.save();
    const note = trip.stopNotes[trip.stopNotes.length - 1];
    const driverId = trip.driverId?._id || trip.driverId;
    if (driverId && text.toLowerCase().startsWith('incident:')) {
      await createAndEmitNotifications(getIO(), [
        {
          userId: driverId,
          type: 'reminder',
          title: 'Incident reported',
          body: text.replace(/^Incident:\s*/i, '').slice(0, 200) || 'An incident note was saved on this trip.',
          tripId: trip._id,
          key: `${driverId}:incident:${note._id}`,
        },
      ]);
    }
    res.json({ note, stopNotes: trip.stopNotes });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/:id/kids/:kidId/dropoff', authenticate, requireRole('driver'), async (req, res) => {
  try {
    const trip = await Trip.findOne({ _id: req.params.id, driverId: req.user.id, status: 'active' });
    if (!trip) return res.status(404).json({ error: 'Active trip not found' });

    const kidId = req.params.kidId;
    if (!trip.kidIds.some((id) => id.toString() === kidId)) {
      return res.status(400).json({ error: 'Kid is not on this trip' });
    }

    const picked = await TripEvent.findOne({ tripId: trip._id, kidId, type: 'picked_up' });
    if (!picked) return res.status(400).json({ error: 'Kid must be picked up before drop-off' });

    const existing = await TripEvent.findOne({ tripId: trip._id, kidId, type: 'dropped_off' });
    if (existing) return res.status(409).json({ error: 'Kid already marked dropped off' });

    const location = trip.latestLocation
      ? { lat: trip.latestLocation.lat, lng: trip.latestLocation.lng }
      : undefined;

    const event = await TripEvent.create({
      tripId: trip._id,
      kidId,
      type: 'dropped_off',
      at: new Date(),
      location,
    });

    const kid = await Kid.findById(kidId).populate('homeStopId', 'name');
    const place = trip.direction === 'to_school' ? 'school' : stopPhrase(kid?.homeStopId?.name);
    const when = formatDateTime(event.at || new Date());
    const io = getIO();
    const evening = isEveningTrip(trip);
    const notifications = (kid?.parentIds || []).map((parentId) => ({
      userId: parentId,
      type: 'kid_dropped_off',
      title: evening ? 'Dropped off' : 'Reached school',
      body: evening
        ? `Your child ${kid.name} has been dropped at ${childPossessive(kid)} ${place} at ${when}`
        : `The bus/van has reached school with your child ${kid.name} at ${when}`,
      tripId: trip._id,
      kidId: kid._id,
    }));
    const driverId = trip.driverId?._id || trip.driverId;
    if (driverId && kid) {
      notifications.push({
        userId: driverId,
        type: 'kid_dropped_off',
        title: 'Student dropped off',
        body: `${kid.name} was dropped off at ${place}.`,
        tripId: trip._id,
        kidId: kid._id,
        key: `${driverId}:drop:${trip._id}:${kid._id}`,
      });
    }
    await createAndEmitNotifications(io, notifications);

    const payload = { tripId: trip._id.toString(), kidId, event };
    io?.to(`trip:${trip._id}`).emit('kid:dropped_off', payload);
    for (const parentId of kid?.parentIds || []) {
      io?.to(`user:${parentId}`).emit('kid:dropped_off', payload);
    }

    res.json({ event });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/:id/complete', authenticate, requireRole('driver'), async (req, res) => {
  try {
    const trip = await Trip.findOne({ _id: req.params.id, driverId: req.user.id, status: 'active' });
    if (!trip) return res.status(404).json({ error: 'Active trip not found' });

    const open = await openCheckIns(trip._id);
    if (open.length) {
      return res.status(409).json({
        error: 'Cannot complete trip while students are still checked in',
        openCheckIns: open.length,
        kidIds: open,
      });
    }

    trip.status = 'completed';
    trip.endedAt = new Date();
    const endLoc = locationFromBody(req.body) || trip.latestLocation;
    if (endLoc) trip.endLocation = endLoc;
    await trip.save();

    const kids = await Kid.find({ _id: { $in: trip.kidIds } });
    const io = getIO();
    const notifications = [];
    const evening = isEveningTrip(trip);
    const boardedIds = evening ? new Set(await boardedKidIds(trip._id)) : null;
    const notifyKids = boardedIds
      ? kids.filter((k) => boardedIds.has(String(k._id)))
      : kids;
    const droppedIds = new Set(
      (await TripEvent.find({ tripId: trip._id, type: 'dropped_off' }).select('kidId'))
        .map((e) => String(e.kidId))
    );
    const when = formatDateTime(trip.endedAt || new Date());
    // Evening/afternoon return to school: no parent messages — the journey is closed.
    if (!evening) {
      for (const kid of notifyKids) {
        if (droppedIds.has(String(kid._id))) continue;
        for (const parentId of kid.parentIds || []) {
          notifications.push({
            userId: parentId,
            type: 'trip_completed',
            title: 'Reached school',
            body: `The bus/van has reached school with your child ${kid.name} at ${when}`,
            tripId: trip._id,
            kidId: kid._id,
          });
        }
      }
    }
    const driverId = trip.driverId?._id || trip.driverId;
    if (driverId) {
      notifications.push({
        userId: driverId,
        type: 'trip_completed',
        title: 'Route completed',
        body: 'You completed the route.',
        tripId: trip._id,
        key: `${driverId}:trip_completed:${trip._id}`,
      });
    }
    await createAndEmitNotifications(io, notifications);

    const payload = { tripId: trip._id.toString() };
    io?.to(`trip:${trip._id}`).emit('trip:completed', payload);
    if (driverId) io?.to(`user:${driverId}`).emit('trip:completed', payload);
    for (const kid of notifyKids) {
      for (const parentId of kid.parentIds || []) {
        io?.to(`user:${parentId}`).emit('trip:completed', payload);
      }
    }

    res.json({ trip });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/:id', authenticate, async (req, res) => {
  try {
    const trip = await Trip.findById(req.params.id)
      .populate('routeId', 'name description')
      .populate('schoolId', 'name location address supportPhone')
      .populate('driverId', 'name phone')
      .populate('busId', 'plate label seats')
      .populate('scheduleId', 'name scheduledTime scheduleType period direction')
      .populate('kidIds');

    if (!trip) return res.status(404).json({ error: 'Trip not found' });

    if (req.user.role === 'parent') {
      const kids = await Kid.find({
        _id: { $in: trip.kidIds },
        parentIds: req.user.id,
      });
      if (!kids.length) return res.status(403).json({ error: 'Not authorized for this trip' });
    } else if (req.user.role === 'driver' && trip.driverId._id.toString() !== req.user.id) {
      return res.status(403).json({ error: 'Not authorized for this trip' });
    }

    const [events, allStops] = await Promise.all([
      TripEvent.find({ tripId: trip._id }).sort({ at: 1 }),
      Stop.find({ routeId: trip.routeId._id || trip.routeId }).sort({ order: 1 }),
    ]);

    const payload = typeof trip.toObject === 'function' ? trip.toObject() : trip;
    const ridingKids = await stripApprovedLeaveFromKids(
      payload.kidIds,
      payload.serviceDate || payload.scheduledFor || payload.startedAt || new Date()
    );
    payload.kidIds = ridingKids;

    // Only school + home stops for kids on this trip (drop leftover route stops)
    const homeIds = new Set(
      (ridingKids || [])
        .map((k) => (k.homeStopId?._id || k.homeStopId)?.toString())
        .filter(Boolean)
    );
    const school = allStops.find((s) => s.type === 'school');
    const homes = allStops.filter((s) => s.type !== 'school' && homeIds.has(s._id.toString()));
    const stops = [...(school ? [school] : []), ...homes];

    res.json({ trip: payload, events, stops });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
