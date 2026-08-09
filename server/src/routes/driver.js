import { Router } from 'express';
import { DriverProfile, Route, Stop, Kid, Trip } from '../models/index.js';
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
    res.json({ trips });
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
    res.json({ trips });
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

export default router;
