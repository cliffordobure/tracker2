import { Router } from 'express';
import bcrypt from 'bcryptjs';
import {
  User,
  School,
  Route,
  Stop,
  Kid,
  DriverProfile,
  Trip,
} from '../models/index.js';
import { authenticate, requireRole } from '../middleware/auth.js';

const router = Router();
router.use(authenticate, requireRole('admin'));

router.get('/dashboard', async (_req, res) => {
  try {
    const [schools, routes, kids, parents, drivers, activeTrips] = await Promise.all([
      School.countDocuments(),
      Route.countDocuments(),
      Kid.countDocuments({ active: true }),
      User.countDocuments({ role: 'parent', active: true }),
      User.countDocuments({ role: 'driver', active: true }),
      Trip.countDocuments({ status: 'active' }),
    ]);
    return res.json({ schools, routes, kids, parents, drivers, activeTrips });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

// Schools
router.get('/schools', async (_req, res) => {
  const schools = await School.find().sort({ name: 1 });
  res.json({ schools });
});

router.post('/schools', async (req, res) => {
  try {
    const school = await School.create(req.body);
    res.status(201).json({ school });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.put('/schools/:id', async (req, res) => {
  try {
    const school = await School.findByIdAndUpdate(req.params.id, req.body, { new: true });
    if (!school) return res.status(404).json({ error: 'School not found' });
    res.json({ school });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.delete('/schools/:id', async (req, res) => {
  await School.findByIdAndDelete(req.params.id);
  res.json({ ok: true });
});

// Routes
router.get('/routes', async (_req, res) => {
  const routes = await Route.find().populate('schoolId', 'name').sort({ name: 1 });
  res.json({ routes });
});

router.post('/routes', async (req, res) => {
  try {
    const route = await Route.create(req.body);
    res.status(201).json({ route });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.put('/routes/:id', async (req, res) => {
  try {
    const route = await Route.findByIdAndUpdate(req.params.id, req.body, { new: true });
    if (!route) return res.status(404).json({ error: 'Route not found' });
    res.json({ route });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.delete('/routes/:id', async (req, res) => {
  await Stop.deleteMany({ routeId: req.params.id });
  await Route.findByIdAndDelete(req.params.id);
  res.json({ ok: true });
});

// Stops
router.get('/routes/:routeId/stops', async (req, res) => {
  const stops = await Stop.find({ routeId: req.params.routeId }).sort({ order: 1 });
  res.json({ stops });
});

router.post('/routes/:routeId/stops', async (req, res) => {
  try {
    const stop = await Stop.create({ ...req.body, routeId: req.params.routeId });
    res.status(201).json({ stop });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.put('/stops/:id', async (req, res) => {
  try {
    const stop = await Stop.findByIdAndUpdate(req.params.id, req.body, { new: true });
    if (!stop) return res.status(404).json({ error: 'Stop not found' });
    res.json({ stop });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.delete('/stops/:id', async (req, res) => {
  await Stop.findByIdAndDelete(req.params.id);
  res.json({ ok: true });
});

// Parents
router.get('/parents', async (_req, res) => {
  const parents = await User.find({ role: 'parent' }).sort({ name: 1 });
  res.json({ parents: parents.map((p) => p.toSafeJSON()) });
});

router.post('/parents', async (req, res) => {
  try {
    const { email, password, name, phone } = req.body;
    const passwordHash = await bcrypt.hash(password || 'parent123', 10);
    const parent = await User.create({
      email: email.toLowerCase().trim(),
      passwordHash,
      name,
      phone: phone || '',
      role: 'parent',
    });
    res.status(201).json({ parent: parent.toSafeJSON() });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.put('/parents/:id', async (req, res) => {
  try {
    const updates = { ...req.body };
    delete updates.password;
    delete updates.passwordHash;
    delete updates.role;
    if (req.body.password) {
      updates.passwordHash = await bcrypt.hash(req.body.password, 10);
    }
    const parent = await User.findOneAndUpdate({ _id: req.params.id, role: 'parent' }, updates, {
      new: true,
    });
    if (!parent) return res.status(404).json({ error: 'Parent not found' });
    res.json({ parent: parent.toSafeJSON() });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// Drivers
router.get('/drivers', async (_req, res) => {
  const users = await User.find({ role: 'driver' }).sort({ name: 1 });
  const profiles = await DriverProfile.find({ userId: { $in: users.map((u) => u._id) } }).populate(
    'assignedRouteIds',
    'name'
  );
  const byUser = Object.fromEntries(profiles.map((p) => [p.userId.toString(), p]));
  res.json({
    drivers: users.map((u) => ({
      ...u.toSafeJSON(),
      profile: byUser[u._id.toString()] || null,
    })),
  });
});

router.post('/drivers', async (req, res) => {
  try {
    const { email, password, name, phone, vehiclePlate, vehicleModel, vehicleColor, assignedRouteIds } =
      req.body;
    const passwordHash = await bcrypt.hash(password || 'driver123', 10);
    const user = await User.create({
      email: email.toLowerCase().trim(),
      passwordHash,
      name,
      phone: phone || '',
      role: 'driver',
    });
    const profile = await DriverProfile.create({
      userId: user._id,
      vehiclePlate: vehiclePlate || '',
      vehicleModel: vehicleModel || '',
      vehicleColor: vehicleColor || '',
      assignedRouteIds: assignedRouteIds || [],
    });
    res.status(201).json({ driver: { ...user.toSafeJSON(), profile } });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.put('/drivers/:id', async (req, res) => {
  try {
    const updates = { name: req.body.name, phone: req.body.phone, active: req.body.active };
    if (req.body.password) {
      updates.passwordHash = await bcrypt.hash(req.body.password, 10);
    }
    const user = await User.findOneAndUpdate({ _id: req.params.id, role: 'driver' }, updates, {
      new: true,
    });
    if (!user) return res.status(404).json({ error: 'Driver not found' });

    const profile = await DriverProfile.findOneAndUpdate(
      { userId: user._id },
      {
        vehiclePlate: req.body.vehiclePlate,
        vehicleModel: req.body.vehicleModel,
        vehicleColor: req.body.vehicleColor,
        assignedRouteIds: req.body.assignedRouteIds,
      },
      { new: true, upsert: true }
    );

    res.json({ driver: { ...user.toSafeJSON(), profile } });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// Kids
router.get('/kids', async (_req, res) => {
  const kids = await Kid.find()
    .populate('schoolId', 'name')
    .populate('routeId', 'name')
    .populate('homeStopId', 'name')
    .populate('parentIds', 'name email phone')
    .sort({ name: 1 });
  res.json({ kids });
});

router.post('/kids', async (req, res) => {
  try {
    const kid = await Kid.create(req.body);
    const populated = await Kid.findById(kid._id)
      .populate('schoolId', 'name')
      .populate('routeId', 'name')
      .populate('homeStopId', 'name')
      .populate('parentIds', 'name email phone');
    res.status(201).json({ kid: populated });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.put('/kids/:id', async (req, res) => {
  try {
    const kid = await Kid.findByIdAndUpdate(req.params.id, req.body, { new: true })
      .populate('schoolId', 'name')
      .populate('routeId', 'name')
      .populate('homeStopId', 'name')
      .populate('parentIds', 'name email phone');
    if (!kid) return res.status(404).json({ error: 'Kid not found' });
    res.json({ kid });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.delete('/kids/:id', async (req, res) => {
  await Kid.findByIdAndDelete(req.params.id);
  res.json({ ok: true });
});

export default router;
