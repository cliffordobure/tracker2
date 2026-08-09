import { Router } from 'express';
import { DriverProfile, Route, Stop, Kid, Trip } from '../models/index.js';
import { authenticate, requireRole } from '../middleware/auth.js';

const router = Router();
router.use(authenticate, requireRole('driver'));

router.get('/routes', async (req, res) => {
  try {
    const profile = await DriverProfile.findOne({ userId: req.user.id });
    if (!profile) return res.json({ routes: [], profile: null });

    const routes = await Route.find({
      _id: { $in: profile.assignedRouteIds },
      active: true,
    }).populate('schoolId', 'name location address');

    const enriched = await Promise.all(
      routes.map(async (route) => {
        const [stops, kids, activeTrip] = await Promise.all([
          Stop.find({ routeId: route._id }).sort({ order: 1 }),
          Kid.find({ routeId: route._id, active: true }).populate('parentIds', 'name phone'),
          Trip.findOne({ routeId: route._id, driverId: req.user.id, status: 'active' }),
        ]);
        return { ...route.toObject(), stops, kids, activeTrip };
      })
    );

    res.json({ routes: enriched, profile });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/trips/active', async (req, res) => {
  try {
    const trip = await Trip.findOne({ driverId: req.user.id, status: 'active' })
      .populate('routeId', 'name')
      .populate('schoolId', 'name location address')
      .populate('kidIds');
    res.json({ trip });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
