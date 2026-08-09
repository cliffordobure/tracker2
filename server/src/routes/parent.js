import { Router } from 'express';
import {
  Kid,
  Trip,
  TripEvent,
  Notification,
  Stop,
  DriverProfile,
  DeviceToken,
} from '../models/index.js';
import { authenticate, requireRole } from '../middleware/auth.js';
import { getVapidPublicKey } from '../services/push.js';

const router = Router();
router.use(authenticate, requireRole('parent'));

router.get('/kids', async (req, res) => {
  try {
    const kids = await Kid.find({ parentIds: req.user.id, active: true })
      .populate('schoolId', 'name location address')
      .populate('routeId', 'name')
      .populate('homeStopId', 'name location');
    res.json({ kids });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/trips/active', async (req, res) => {
  try {
    const kids = await Kid.find({ parentIds: req.user.id, active: true });
    const kidIds = kids.map((k) => k._id);
    if (!kidIds.length) return res.json({ trips: [] });

    const trips = await Trip.find({ status: 'active', kidIds: { $in: kidIds } })
      .populate('routeId', 'name')
      .populate('schoolId', 'name location address')
      .populate('driverId', 'name phone')
      .populate('kidIds');

    const enriched = await Promise.all(
      trips.map(async (trip) => {
        const myKids = kids.filter((k) =>
          trip.kidIds.some((tk) => tk._id?.toString() === k._id.toString() || tk.toString() === k._id.toString())
        );
        const [events, allStops, profile] = await Promise.all([
          TripEvent.find({ tripId: trip._id, kidId: { $in: myKids.map((k) => k._id) } }),
          Stop.find({ routeId: trip.routeId._id || trip.routeId }).sort({ order: 1 }),
          DriverProfile.findOne({ userId: trip.driverId._id || trip.driverId }),
        ]);
        const homeIds = new Set(
          (trip.kidIds || [])
            .map((k) => (k.homeStopId?._id || k.homeStopId)?.toString())
            .filter(Boolean)
        );
        const school = allStops.find((s) => s.type === 'school');
        const homes = allStops.filter(
          (s) => s.type !== 'school' && homeIds.has(s._id.toString())
        );
        return {
          trip,
          myKids,
          events,
          stops: [...(school ? [school] : []), ...homes],
          driverProfile: profile,
        };
      })
    );

    res.json({ trips: enriched });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/trips', async (req, res) => {
  try {
    const kids = await Kid.find({ parentIds: req.user.id });
    const kidIds = kids.map((k) => k._id);
    const trips = await Trip.find({ kidIds: { $in: kidIds } })
      .populate('routeId', 'name')
      .populate('schoolId', 'name')
      .populate('driverId', 'name')
      .sort({ startedAt: -1 })
      .limit(50);
    res.json({ trips });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/notifications', async (req, res) => {
  try {
    const notifications = await Notification.find({ userId: req.user.id })
      .sort({ createdAt: -1 })
      .limit(100);
    res.json({ notifications });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/notifications/read', async (req, res) => {
  try {
    const { ids } = req.body;
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

router.get('/push-config', async (_req, res) => {
  res.json({ vapidPublicKey: getVapidPublicKey() });
});

router.post('/device-tokens', async (req, res) => {
  try {
    const { platform, token, keys, userAgent } = req.body;
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

export default router;
