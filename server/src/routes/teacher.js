import { Router } from 'express';
import { User, Kid, Trip, TripEvent, Stop, DriverProfile, School } from '../models/index.js';
import { authenticate, requireRole } from '../middleware/auth.js';

const router = Router();
router.use(authenticate, requireRole('teacher'));

router.get('/overview', async (req, res) => {
  try {
    const teacher = await User.findById(req.user.id);
    if (!teacher?.schoolId) {
      return res.json({ school: null, kids: [], activeTrips: [] });
    }

    const school = await School.findById(teacher.schoolId);
    const kids = await Kid.find({ schoolId: teacher.schoolId, active: true })
      .populate('routeId', 'name')
      .populate('parentIds', 'name phone')
      .sort({ name: 1 });

    const kidIds = kids.map((k) => k._id);
    const trips = await Trip.find({ status: 'active', kidIds: { $in: kidIds } })
      .populate('routeId', 'name')
      .populate('schoolId', 'name location address')
      .populate('driverId', 'name phone')
      .populate('kidIds', 'name');

    const activeTrips = await Promise.all(
      trips.map(async (trip) => {
        const [events, stops, profile] = await Promise.all([
          TripEvent.find({ tripId: trip._id }).sort({ at: 1 }),
          Stop.find({ routeId: trip.routeId._id || trip.routeId }).sort({ order: 1 }),
          DriverProfile.findOne({ userId: trip.driverId._id || trip.driverId }),
        ]);
        return { trip, events, stops, driverProfile: profile };
      })
    );

    res.json({ school, kids, activeTrips });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/trips/active', async (req, res) => {
  try {
    const teacher = await User.findById(req.user.id);
    if (!teacher?.schoolId) return res.json({ trips: [] });

    const kids = await Kid.find({ schoolId: teacher.schoolId, active: true });
    const kidIds = kids.map((k) => k._id);
    const trips = await Trip.find({ status: 'active', kidIds: { $in: kidIds } })
      .populate('routeId', 'name')
      .populate('schoolId', 'name location address')
      .populate('driverId', 'name phone')
      .populate('kidIds', 'name');

    const enriched = await Promise.all(
      trips.map(async (trip) => {
        const [events, stops, profile] = await Promise.all([
          TripEvent.find({ tripId: trip._id }).sort({ at: 1 }),
          Stop.find({ routeId: trip.routeId._id || trip.routeId }).sort({ order: 1 }),
          DriverProfile.findOne({ userId: trip.driverId._id || trip.driverId }),
        ]);
        return { trip, events, stops, driverProfile: profile, kids };
      })
    );

    res.json({ trips: enriched });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
