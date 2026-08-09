import { Router } from 'express';
import {
  Trip,
  TripEvent,
  LocationPing,
  Kid,
  Route,
  Stop,
  DriverProfile,
} from '../models/index.js';
import { authenticate, requireRole } from '../middleware/auth.js';
import { getIO } from '../socket.js';
import { createAndEmitNotifications } from '../services/notifications.js';

const router = Router();

router.post('/', authenticate, requireRole('driver'), async (req, res) => {
  try {
    const { routeId, direction } = req.body;
    if (!routeId || !['to_school', 'to_home'].includes(direction)) {
      return res.status(400).json({ error: 'routeId and valid direction are required' });
    }

    const profile = await DriverProfile.findOne({ userId: req.user.id });
    if (!profile?.assignedRouteIds?.some((id) => id.toString() === routeId)) {
      return res.status(403).json({ error: 'Route not assigned to this driver' });
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

    const io = getIO();
    const directionLabel = direction === 'to_school' ? 'morning (to school)' : 'evening (to home)';
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
      .populate('kidIds');

    io?.to(`trip:${trip._id}`).emit('trip:started', { trip: populated });
    for (const kid of kids) {
      for (const parentId of kid.parentIds || []) {
        io?.to(`user:${parentId}`).emit('trip:started', { trip: populated, kidId: kid._id });
      }
    }

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
    getIO()?.to(`trip:${trip._id}`).emit('location:update', payload);

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

    trip.status = 'completed';
    trip.endedAt = new Date();
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

    const [events, stops] = await Promise.all([
      TripEvent.find({ tripId: trip._id }).sort({ at: 1 }),
      Stop.find({ routeId: trip.routeId._id || trip.routeId }).sort({ order: 1 }),
    ]);

    res.json({ trip, events, stops });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
