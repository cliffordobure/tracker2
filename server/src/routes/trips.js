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

const router = Router();

async function emitTripStarted(trip, kids) {
  const io = getIO();
  const directionLabel = trip.direction === 'to_school' ? 'morning (to school)' : 'evening (to home)';
  const notifications = [];
  for (const kid of kids) {
    for (const parentId of kid.parentIds || []) {
      notifications.push({
        userId: parentId,
        type: 'trip_started',
        title: 'Trip started',
        body: `${kid.name}'s ${directionLabel} trip has started. You can track the driver live.`,
        tripId: trip._id,
        kidId: kid._id,
      });
    }
  }
  await createAndEmitNotifications(io, notifications);

  const populated = await Trip.findById(trip._id)
    .populate('routeId', 'name')
    .populate('schoolId', 'name location address')
    .populate('busId', 'plate label seats')
    .populate('kidIds');

  io?.to(`trip:${trip._id}`).emit('trip:started', { trip: populated });
  const driverId = trip.driverId?._id || trip.driverId;
  if (driverId) io?.to(`user:${driverId}`).emit('trip:started', { trip: populated });
  for (const kid of kids) {
    for (const parentId of kid.parentIds || []) {
      io?.to(`user:${parentId}`).emit('trip:started', { trip: populated, kidId: kid._id });
    }
  }
  return populated;
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

    trip.status = 'active';
    trip.startedAt = new Date();
    const startLoc = locationFromBody(req.body) || trip.latestLocation;
    if (startLoc) trip.startLocation = startLoc;
    await trip.save();

    const kids = await Kid.find({ _id: { $in: trip.kidIds }, active: true });
    const populated = await emitTripStarted(trip, kids);
    res.json({ trip: populated });
  } catch (err) {
    res.status(500).json({ error: err.message });
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
      scheduled.status = 'active';
      scheduled.startedAt = new Date();
      const startLoc = locationFromBody(req.body) || scheduled.latestLocation;
      if (startLoc) scheduled.startLocation = startLoc;
      await scheduled.save();
      const kids = await Kid.find({ _id: { $in: scheduled.kidIds }, active: true });
      const populated = await emitTripStarted(scheduled, kids);
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
    res.status(500).json({ error: err.message });
  }
});

router.post('/:id/location', authenticate, requireRole('driver'), async (req, res) => {
  try {
    const { lat, lng, heading, speed } = req.body;
    if (typeof lat !== 'number' || typeof lng !== 'number') {
      return res.status(400).json({ error: 'lat and lng are required numbers' });
    }

    const trip = await Trip.findOne({ _id: req.params.id, driverId: req.user.id, status: 'active' });
    if (!trip) return res.status(404).json({ error: 'Active trip not found' });

    const at = new Date();
    const ping = { lat, lng, heading, speed, at };
    trip.latestLocation = ping;
    await trip.save();
    await LocationPing.create({ tripId: trip._id, ...ping });

    const payload = { tripId: trip._id.toString(), ...ping };
    const io = getIO();
    io?.to(`trip:${trip._id}`).emit('location:update', payload);

    // Parents whose kids are currently on the bus get live updates on their user room
    // (works even if the client missed trip:join).
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

    res.json({ ok: true, location: ping });
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

    const kid = await Kid.findById(kidId);
    const io = getIO();
    const notifications = (kid?.parentIds || []).map((parentId) => ({
      userId: parentId,
      type: 'kid_picked_up',
      title: 'Kid picked up',
      body: `${kid.name} has been picked up by the driver.`,
      tripId: trip._id,
      kidId: kid._id,
    }));
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

    const kid = await Kid.findById(kidId);
    const place = trip.direction === 'to_school' ? 'school' : 'home drop-off point';
    const io = getIO();
    const notifications = (kid?.parentIds || []).map((parentId) => ({
      userId: parentId,
      type: 'kid_dropped_off',
      title: 'Kid dropped off',
      body: `${kid.name} has been dropped off at ${place}.`,
      tripId: trip._id,
      kidId: kid._id,
    }));
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
    for (const kid of kids) {
      for (const parentId of kid.parentIds || []) {
        notifications.push({
          userId: parentId,
          type: 'trip_completed',
          title: 'Trip completed',
          body: `${kid.name}'s trip has been completed.`,
          tripId: trip._id,
          kidId: kid._id,
        });
      }
    }
    await createAndEmitNotifications(io, notifications);

    const payload = { tripId: trip._id.toString() };
    io?.to(`trip:${trip._id}`).emit('trip:completed', payload);
    const driverId = trip.driverId?._id || trip.driverId;
    if (driverId) io?.to(`user:${driverId}`).emit('trip:completed', payload);
    for (const kid of kids) {
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
      .populate('routeId', 'name')
      .populate('schoolId', 'name location address')
      .populate('driverId', 'name phone')
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

    // Only school + home stops for kids on this trip (drop leftover route stops)
    const homeIds = new Set(
      (trip.kidIds || [])
        .map((k) => (k.homeStopId?._id || k.homeStopId)?.toString())
        .filter(Boolean)
    );
    const school = allStops.find((s) => s.type === 'school');
    const homes = allStops.filter((s) => s.type !== 'school' && homeIds.has(s._id.toString()));
    const stops = [...(school ? [school] : []), ...homes];

    res.json({ trip, events, stops });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
