import { Router } from 'express';
import { DriverProfile, Route, Stop, Kid, Trip, Notification, DeviceToken } from '../models/index.js';
import { authenticate, requireRole } from '../middleware/auth.js';

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
          Kid.find({ routeId: route._id, active: true }).populate('parentIds', 'name phone'),
          Trip.findOne({ routeId: route._id, driverId: req.user.id, status: 'active' }),
          Trip.find({
            routeId: route._id,
            driverId: req.user.id,
            status: 'scheduled',
            $or: [
              { serviceDate: { $gte: start, $lte: end } },
              { scheduledFor: { $gte: start, $lte: end } },
            ],
          })
            .populate('busId', 'plate label seats')
            .populate('kidIds', 'name grade')
            .sort({ sequence: 1 }),
        ]);
        return { ...route.toObject(), stops, kids, activeTrip, scheduledTrips };
      })
    );

    res.json({ routes: enriched, profile });
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
    res.json({ trips: await enrichTripsWithStopCounts(trips) });
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

router.get('/trips/active', async (req, res) => {
  try {
    const trip = await Trip.findOne({ driverId: req.user.id, status: 'active' })
      .populate('routeId', 'name')
      .populate('schoolId', 'name location address')
      .populate('busId', 'plate label seats')
      .populate('kidIds');
    res.json({ trip });
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

router.get('/notifications', async (req, res) => {
  try {
    const notifications = await Notification.find({ userId: req.user.id })
      .sort({ createdAt: -1 })
      .limit(50);
    res.json({ notifications });
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

export default router;
