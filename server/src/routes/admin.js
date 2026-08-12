import { Router } from 'express';
import bcrypt from 'bcryptjs';
import {
  User,
  School,
  Route,
  Stop,
  Kid,
  Bus,
  DriverProfile,
  Trip,
  Announcement,
  LeaveRequest,
} from '../models/index.js';
import { authenticate, requireSchoolStaff, requireSuperAdmin } from '../middleware/auth.js';
import adminTripOps from './adminTripOps.js';

const router = Router();
router.use(authenticate, requireSchoolStaff);
router.use(adminTripOps);

/** school_admin → their school; super_admin → query/body schoolId or null (all). */
function resolveSchoolId(req, { required = false } = {}) {
  if (req.user.role === 'school_admin') {
    return req.user.schoolId || null;
  }
  return req.query.schoolId || req.body.schoolId || null;
}

function schoolFilter(req, field = 'schoolId') {
  const schoolId = resolveSchoolId(req);
  if (schoolId) return { [field]: schoolId };
  return {};
}

function assertSchoolAccess(req, schoolId) {
  if (req.user.role === 'school_admin' && schoolId?.toString() !== req.user.schoolId) {
    return false;
  }
  return true;
}

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
  return { start, end, day: start };
}

function chunk(arr, size) {
  const out = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

// ——— Dashboard ———
router.get('/dashboard', async (req, res) => {
  try {
    const filter = schoolFilter(req);
    const schoolId = resolveSchoolId(req);

    const [schools, routes, kids, parents, drivers, buses, activeTrips, scheduledTrips] =
      await Promise.all([
        schoolId ? School.countDocuments({ _id: schoolId }) : School.countDocuments(),
        Route.countDocuments(filter),
        Kid.countDocuments({ ...filter, active: true }),
        User.countDocuments({ role: 'parent', active: true, ...filter }),
        User.countDocuments({ role: 'driver', active: true, ...filter }),
        Bus.countDocuments({ ...filter, active: true }),
        Trip.countDocuments({ ...filter, status: 'active' }),
        Trip.countDocuments({ ...filter, status: 'scheduled' }),
      ]);

    return res.json({
      schools,
      routes,
      kids,
      parents,
      drivers,
      buses,
      activeTrips,
      scheduledTrips,
    });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

// ——— Schools ———
router.get('/schools', async (req, res) => {
  const schoolId = resolveSchoolId(req);
  const schools = schoolId
    ? await School.find({ _id: schoolId }).sort({ name: 1 })
    : await School.find().sort({ name: 1 });
  res.json({ schools });
});

router.post('/schools', requireSuperAdmin, async (req, res) => {
  try {
    const school = await School.create(req.body);
    res.status(201).json({ school });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.put('/schools/:id', async (req, res) => {
  try {
    if (!assertSchoolAccess(req, req.params.id)) {
      return res.status(403).json({ error: 'Cannot edit another school' });
    }
    // School admins may update location/address/name but not delete; same PUT
    const school = await School.findByIdAndUpdate(req.params.id, req.body, { new: true });
    if (!school) return res.status(404).json({ error: 'School not found' });
    res.json({ school });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.delete('/schools/:id', requireSuperAdmin, async (req, res) => {
  await School.findByIdAndDelete(req.params.id);
  res.json({ ok: true });
});

// ——— School admins (super only) ———
router.get('/school-admins', requireSuperAdmin, async (req, res) => {
  const filter = { role: 'school_admin' };
  if (req.query.schoolId) filter.schoolId = req.query.schoolId;
  const admins = await User.find(filter).sort({ name: 1 });
  res.json({ schoolAdmins: admins.map((a) => a.toSafeJSON()) });
});

router.post('/school-admins', requireSuperAdmin, async (req, res) => {
  try {
    const { email, password, name, phone, schoolId } = req.body;
    if (!email || !password || !name || !schoolId) {
      return res.status(400).json({ error: 'email, password, name, and schoolId are required' });
    }
    const school = await School.findById(schoolId);
    if (!school) return res.status(404).json({ error: 'School not found' });

    const passwordHash = await bcrypt.hash(password, 10);
    const admin = await User.create({
      email: email.toLowerCase().trim(),
      passwordHash,
      name,
      phone: phone || '',
      role: 'school_admin',
      schoolId,
    });
    res.status(201).json({ schoolAdmin: admin.toSafeJSON() });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// ——— Buses ———
router.get('/buses', async (req, res) => {
  const buses = await Bus.find(schoolFilter(req)).populate('schoolId', 'name').sort({ label: 1 });
  res.json({ buses });
});

router.post('/buses', async (req, res) => {
  try {
    let schoolId = resolveSchoolId(req, { required: true });
    if (req.user.role === 'super_admin') schoolId = req.body.schoolId;
    if (!schoolId) return res.status(400).json({ error: 'schoolId is required' });

    const seats = Number(req.body.seats);
    if (!Number.isFinite(seats) || seats < 1) {
      return res.status(400).json({ error: 'seats must be a positive number' });
    }

    const bus = await Bus.create({
      schoolId,
      plate: req.body.plate,
      label: req.body.label || '',
      model: req.body.model || '',
      color: req.body.color || '',
      seats,
      active: req.body.active !== false,
    });
    res.status(201).json({ bus });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.put('/buses/:id', async (req, res) => {
  try {
    const existing = await Bus.findById(req.params.id);
    if (!existing) return res.status(404).json({ error: 'Bus not found' });
    if (!assertSchoolAccess(req, existing.schoolId)) {
      return res.status(403).json({ error: 'Cannot edit bus from another school' });
    }

    const updates = { ...req.body };
    delete updates.schoolId;
    if (updates.seats != null) {
      const seats = Number(updates.seats);
      if (!Number.isFinite(seats) || seats < 1) {
        return res.status(400).json({ error: 'seats must be a positive number' });
      }
      updates.seats = seats;
    }

    const bus = await Bus.findByIdAndUpdate(req.params.id, updates, { new: true });
    res.json({ bus });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.delete('/buses/:id', async (req, res) => {
  const existing = await Bus.findById(req.params.id);
  if (!existing) return res.status(404).json({ error: 'Bus not found' });
  if (!assertSchoolAccess(req, existing.schoolId)) {
    return res.status(403).json({ error: 'Cannot delete bus from another school' });
  }
  await Bus.findByIdAndDelete(req.params.id);
  res.json({ ok: true });
});

// ——— Routes ———
router.get('/routes', async (req, res) => {
  const routes = await Route.find(schoolFilter(req)).populate('schoolId', 'name').sort({ name: 1 });
  res.json({ routes });
});

router.post('/routes', async (req, res) => {
  try {
    let schoolId = resolveSchoolId(req);
    if (req.user.role === 'super_admin') schoolId = req.body.schoolId || schoolId;
    if (!schoolId) return res.status(400).json({ error: 'schoolId is required' });

    const route = await Route.create({
      schoolId,
      name: req.body.name,
      description: req.body.description || '',
      active: req.body.active !== false,
    });
    res.status(201).json({ route });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.put('/routes/:id', async (req, res) => {
  try {
    const existing = await Route.findById(req.params.id);
    if (!existing) return res.status(404).json({ error: 'Route not found' });
    if (!assertSchoolAccess(req, existing.schoolId)) {
      return res.status(403).json({ error: 'Cannot edit route from another school' });
    }
    const updates = { ...req.body };
    delete updates.schoolId;
    const route = await Route.findByIdAndUpdate(req.params.id, updates, { new: true });
    res.json({ route });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.delete('/routes/:id', async (req, res) => {
  const existing = await Route.findById(req.params.id);
  if (!existing) return res.status(404).json({ error: 'Route not found' });
  if (!assertSchoolAccess(req, existing.schoolId)) {
    return res.status(403).json({ error: 'Cannot delete route from another school' });
  }
  await Stop.deleteMany({ routeId: req.params.id });
  await Route.findByIdAndDelete(req.params.id);
  res.json({ ok: true });
});

// ——— Stops ———
router.get('/routes/:routeId/stops', async (req, res) => {
  const route = await Route.findById(req.params.routeId);
  if (!route) return res.status(404).json({ error: 'Route not found' });
  if (!assertSchoolAccess(req, route.schoolId)) {
    return res.status(403).json({ error: 'Cannot view stops from another school' });
  }
  const stops = await Stop.find({ routeId: req.params.routeId }).sort({ order: 1 });
  res.json({ stops });
});

router.post('/routes/:routeId/stops', async (req, res) => {
  try {
    const route = await Route.findById(req.params.routeId);
    if (!route) return res.status(404).json({ error: 'Route not found' });
    if (!assertSchoolAccess(req, route.schoolId)) {
      return res.status(403).json({ error: 'Cannot add stop to another school' });
    }
    const stop = await Stop.create({ ...req.body, routeId: req.params.routeId });
    res.status(201).json({ stop });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.put('/stops/:id', async (req, res) => {
  try {
    const stop = await Stop.findById(req.params.id);
    if (!stop) return res.status(404).json({ error: 'Stop not found' });
    const route = await Route.findById(stop.routeId);
    if (!assertSchoolAccess(req, route?.schoolId)) {
      return res.status(403).json({ error: 'Cannot edit stop from another school' });
    }
    const updated = await Stop.findByIdAndUpdate(req.params.id, req.body, { new: true });
    res.json({ stop: updated });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.delete('/stops/:id', async (req, res) => {
  const stop = await Stop.findById(req.params.id);
  if (!stop) return res.status(404).json({ error: 'Stop not found' });
  const route = await Route.findById(stop.routeId);
  if (!assertSchoolAccess(req, route?.schoolId)) {
    return res.status(403).json({ error: 'Cannot delete stop from another school' });
  }
  await Stop.findByIdAndDelete(req.params.id);
  res.json({ ok: true });
});

// ——— Parents ———
router.get('/parents', async (req, res) => {
  const parents = await User.find({ role: 'parent', ...schoolFilter(req) }).sort({ name: 1 });
  res.json({ parents: parents.map((p) => p.toSafeJSON()) });
});

router.post('/parents', async (req, res) => {
  try {
    let schoolId = resolveSchoolId(req);
    if (req.user.role === 'super_admin') schoolId = req.body.schoolId || schoolId;
    if (!schoolId) return res.status(400).json({ error: 'schoolId is required' });

    const { email, password, name, phone } = req.body;
    const passwordHash = await bcrypt.hash(password || 'parent123', 10);
    const parent = await User.create({
      email: email.toLowerCase().trim(),
      passwordHash,
      name,
      phone: phone || '',
      role: 'parent',
      schoolId,
    });
    res.status(201).json({ parent: parent.toSafeJSON() });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.put('/parents/:id', async (req, res) => {
  try {
    const existing = await User.findOne({ _id: req.params.id, role: 'parent' });
    if (!existing) return res.status(404).json({ error: 'Parent not found' });
    if (!assertSchoolAccess(req, existing.schoolId)) {
      return res.status(403).json({ error: 'Cannot edit parent from another school' });
    }

    const updates = { ...req.body };
    delete updates.password;
    delete updates.passwordHash;
    delete updates.role;
    delete updates.schoolId;
    if (req.body.password) {
      updates.passwordHash = await bcrypt.hash(req.body.password, 10);
    }
    const parent = await User.findByIdAndUpdate(req.params.id, updates, { new: true });
    res.json({ parent: parent.toSafeJSON() });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// ——— Drivers ———
router.get('/drivers', async (req, res) => {
  const users = await User.find({ role: 'driver', ...schoolFilter(req) }).sort({ name: 1 });
  const profiles = await DriverProfile.find({ userId: { $in: users.map((u) => u._id) } })
    .populate('assignedRouteIds', 'name')
    .populate('busId', 'plate label seats');
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
    let schoolId = resolveSchoolId(req);
    if (req.user.role === 'super_admin') schoolId = req.body.schoolId || schoolId;
    if (!schoolId) return res.status(400).json({ error: 'schoolId is required' });

    const {
      email,
      password,
      name,
      phone,
      vehiclePlate,
      vehicleModel,
      vehicleColor,
      assignedRouteIds,
      busId,
    } = req.body;
    const passwordHash = await bcrypt.hash(password || 'driver123', 10);
    const user = await User.create({
      email: email.toLowerCase().trim(),
      passwordHash,
      name,
      phone: phone || '',
      role: 'driver',
      schoolId,
    });
    const profile = await DriverProfile.create({
      userId: user._id,
      vehiclePlate: vehiclePlate || '',
      vehicleModel: vehicleModel || '',
      vehicleColor: vehicleColor || '',
      assignedRouteIds: assignedRouteIds || [],
      busId: busId || null,
    });
    res.status(201).json({ driver: { ...user.toSafeJSON(), profile } });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.put('/drivers/:id', async (req, res) => {
  try {
    const existing = await User.findOne({ _id: req.params.id, role: 'driver' });
    if (!existing) return res.status(404).json({ error: 'Driver not found' });
    if (!assertSchoolAccess(req, existing.schoolId)) {
      return res.status(403).json({ error: 'Cannot edit driver from another school' });
    }

    const updates = { name: req.body.name, phone: req.body.phone, active: req.body.active };
    if (req.body.password) {
      updates.passwordHash = await bcrypt.hash(req.body.password, 10);
    }
    const user = await User.findByIdAndUpdate(req.params.id, updates, { new: true });

    const profileUpdates = {};
    if (req.body.vehiclePlate != null) profileUpdates.vehiclePlate = req.body.vehiclePlate;
    if (req.body.vehicleModel != null) profileUpdates.vehicleModel = req.body.vehicleModel;
    if (req.body.vehicleColor != null) profileUpdates.vehicleColor = req.body.vehicleColor;
    if (req.body.assignedRouteIds != null) profileUpdates.assignedRouteIds = req.body.assignedRouteIds;
    if (req.body.busId !== undefined) profileUpdates.busId = req.body.busId || null;

    const profile = await DriverProfile.findOneAndUpdate({ userId: user._id }, profileUpdates, {
      new: true,
      upsert: true,
    })
      .populate('assignedRouteIds', 'name')
      .populate('busId', 'plate label seats');

    res.json({ driver: { ...user.toSafeJSON(), profile } });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// ——— Kids ———
router.get('/kids', async (req, res) => {
  const kids = await Kid.find(schoolFilter(req))
    .populate('schoolId', 'name')
    .populate('routeId', 'name')
    .populate('homeStopId', 'name location')
    .populate('parentIds', 'name email phone')
    .sort({ name: 1 });
  res.json({ kids });
});

router.post('/kids', async (req, res) => {
  try {
    let schoolId = resolveSchoolId(req);
    if (req.user.role === 'super_admin') schoolId = req.body.schoolId || schoolId;
    if (!schoolId) return res.status(400).json({ error: 'schoolId is required' });

    const kid = await Kid.create({ ...req.body, schoolId });
    const populated = await Kid.findById(kid._id)
      .populate('schoolId', 'name')
      .populate('routeId', 'name')
      .populate('homeStopId', 'name location')
      .populate('parentIds', 'name email phone');
    res.status(201).json({ kid: populated });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

/** One-shot student onboarding: route + boarding map point + parent. */
router.post('/kids/onboard', async (req, res) => {
  try {
    let schoolId = resolveSchoolId(req);
    if (req.user.role === 'super_admin') schoolId = req.body.schoolId || schoolId;
    if (!schoolId) return res.status(400).json({ error: 'schoolId is required' });

    const { name, grade, routeId, routeName, boarding, parent, parentIds } = req.body;
    if (!name) return res.status(400).json({ error: 'name is required' });
    if (!boarding?.lat || !boarding?.lng) {
      return res.status(400).json({ error: 'boarding.lat and boarding.lng are required' });
    }

    let route;
    if (routeId) {
      route = await Route.findById(routeId);
      if (!route) return res.status(404).json({ error: 'Route not found' });
      if (route.schoolId.toString() !== schoolId.toString()) {
        return res.status(403).json({ error: 'Route belongs to another school' });
      }
    } else if (routeName) {
      route = await Route.create({
        schoolId,
        name: routeName,
        description: req.body.routeDescription || '',
      });
      // School stop at school location
      const school = await School.findById(schoolId);
      if (school?.location?.lat != null) {
        await Stop.create({
          routeId: route._id,
          name: `${school.name} Gate`,
          type: 'school',
          order: 0,
          location: { lat: school.location.lat, lng: school.location.lng },
        });
      }
    } else {
      return res.status(400).json({ error: 'routeId or routeName is required' });
    }

    const maxOrder = await Stop.findOne({ routeId: route._id }).sort({ order: -1 });
    const order = (maxOrder?.order ?? 0) + 1;
    const stop = await Stop.create({
      routeId: route._id,
      name: boarding.stopName || `${name} boarding`,
      type: 'home',
      order,
      location: { lat: Number(boarding.lat), lng: Number(boarding.lng) },
    });

    const linkedParentIds = [...(parentIds || [])];
    let createdParent = null;
    if (parent?.email && parent?.name && parent?.password) {
      const passwordHash = await bcrypt.hash(parent.password, 10);
      createdParent = await User.create({
        email: parent.email.toLowerCase().trim(),
        passwordHash,
        name: parent.name,
        phone: parent.phone || '',
        role: 'parent',
        schoolId,
      });
      linkedParentIds.push(createdParent._id);
    }

    if (!linkedParentIds.length) {
      return res.status(400).json({ error: 'Provide parentIds or parent { name, email, password }' });
    }

    const kid = await Kid.create({
      name,
      grade: grade || '',
      schoolId,
      routeId: route._id,
      homeStopId: stop._id,
      parentIds: linkedParentIds,
    });

    const populated = await Kid.findById(kid._id)
      .populate('schoolId', 'name')
      .populate('routeId', 'name')
      .populate('homeStopId', 'name location')
      .populate('parentIds', 'name email phone');

    res.status(201).json({
      kid: populated,
      route,
      stop,
      parent: createdParent ? createdParent.toSafeJSON() : null,
    });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.put('/kids/:id', async (req, res) => {
  try {
    const existing = await Kid.findById(req.params.id);
    if (!existing) return res.status(404).json({ error: 'Kid not found' });
    if (!assertSchoolAccess(req, existing.schoolId)) {
      return res.status(403).json({ error: 'Cannot edit kid from another school' });
    }

    const { boarding, routeName, ...rest } = req.body;
    const updates = { ...rest };
    delete updates.schoolId;
    delete updates.boarding;
    delete updates.routeName;
    delete updates.parent;

    let routeId = updates.routeId || existing.routeId;
    if (routeName && !updates.routeId) {
      const createdRoute = await Route.create({
        schoolId: existing.schoolId,
        name: routeName,
        description: '',
      });
      routeId = createdRoute._id;
      updates.routeId = routeId;
    }

    if (routeId) {
      const route = await Route.findById(routeId);
      if (!route) return res.status(404).json({ error: 'Route not found' });
      if (route.schoolId.toString() !== existing.schoolId.toString()) {
        return res.status(403).json({ error: 'Route belongs to another school' });
      }
      updates.routeId = routeId;
    }

    if (boarding?.lat != null && boarding?.lng != null && routeId) {
      const lat = Number(boarding.lat);
      const lng = Number(boarding.lng);
      const stopName = boarding.stopName || `${existing.name} boarding`;
      const routeChanged =
        existing.routeId?.toString() !== routeId.toString();

      if (existing.homeStopId && !routeChanged) {
        await Stop.findByIdAndUpdate(existing.homeStopId, {
          name: stopName,
          location: { lat, lng },
          type: 'home',
        });
      } else {
        const maxOrder = await Stop.findOne({ routeId }).sort({ order: -1 });
        const stop = await Stop.create({
          routeId,
          name: stopName,
          type: 'home',
          order: (maxOrder?.order ?? 0) + 1,
          location: { lat, lng },
        });
        updates.homeStopId = stop._id;
      }
    }

    const kid = await Kid.findByIdAndUpdate(req.params.id, updates, { new: true })
      .populate('schoolId', 'name')
      .populate('routeId', 'name')
      .populate('homeStopId', 'name location')
      .populate('parentIds', 'name email phone');
    res.json({ kid });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.delete('/kids/:id', async (req, res) => {
  const existing = await Kid.findById(req.params.id);
  if (!existing) return res.status(404).json({ error: 'Kid not found' });
  if (!assertSchoolAccess(req, existing.schoolId)) {
    return res.status(403).json({ error: 'Cannot delete kid from another school' });
  }
  await Kid.findByIdAndDelete(req.params.id);
  res.json({ ok: true });
});

// ——— Dispatch ———
router.get('/dispatch', async (req, res) => {
  try {
    const { start, end } = dayBounds(req.query.date);
    const filter = {
      ...schoolFilter(req),
      scheduledFor: { $gte: start, $lte: end },
    };
    const trips = await Trip.find(filter)
      .populate('routeId', 'name')
      .populate('busId', 'plate label seats')
      .populate('driverId', 'name email phone')
      .populate('kidIds', 'name grade')
      .sort({ sequence: 1, createdAt: 1 });
    res.json({ trips });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/dispatch/preview', async (req, res) => {
  try {
    const { routeId, busId } = req.body;
    if (!routeId || !busId) {
      return res.status(400).json({ error: 'routeId and busId are required' });
    }
    const route = await Route.findById(routeId);
    const bus = await Bus.findById(busId);
    if (!route || !bus) return res.status(404).json({ error: 'Route or bus not found' });
    if (!assertSchoolAccess(req, route.schoolId) || !assertSchoolAccess(req, bus.schoolId)) {
      return res.status(403).json({ error: 'Cross-school dispatch not allowed' });
    }

    const kids = await Kid.find({ routeId, active: true }).sort({ name: 1 });
    const seats = bus.seats;
    const tripCount = Math.max(1, Math.ceil(kids.length / seats) || 1);
    res.json({
      kidCount: kids.length,
      seats,
      tripCount: kids.length === 0 ? 0 : tripCount,
      kids: kids.map((k) => ({ id: k._id, name: k.name, grade: k.grade })),
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/dispatch', async (req, res) => {
  try {
    const { routeId, busId, driverId, direction, date } = req.body;
    if (!routeId || !busId || !driverId || !['to_school', 'to_home'].includes(direction)) {
      return res
        .status(400)
        .json({ error: 'routeId, busId, driverId, and valid direction are required' });
    }

    const route = await Route.findById(routeId);
    const bus = await Bus.findById(busId);
    const driver = await User.findOne({ _id: driverId, role: 'driver' });
    if (!route || !bus || !driver) {
      return res.status(404).json({ error: 'Route, bus, or driver not found' });
    }
    if (
      !assertSchoolAccess(req, route.schoolId) ||
      !assertSchoolAccess(req, bus.schoolId) ||
      !assertSchoolAccess(req, driver.schoolId)
    ) {
      return res.status(403).json({ error: 'Cross-school dispatch not allowed' });
    }
    if (
      route.schoolId.toString() !== bus.schoolId.toString() ||
      route.schoolId.toString() !== driver.schoolId?.toString()
    ) {
      return res.status(400).json({ error: 'Route, bus, and driver must belong to the same school' });
    }

    const kids = await Kid.find({ routeId, active: true }).sort({ name: 1 });
    if (!kids.length) {
      return res.status(400).json({ error: 'No active students on this route' });
    }

    const { day } = dayBounds(date);
    const groups = chunk(kids, bus.seats);
    const trips = [];
    for (let i = 0; i < groups.length; i += 1) {
      const trip = await Trip.create({
        routeId,
        busId,
        driverId,
        schoolId: route.schoolId,
        direction,
        status: 'scheduled',
        sequence: i + 1,
        scheduledFor: day,
        kidIds: groups[i].map((k) => k._id),
      });
      trips.push(trip);
    }

    const populated = await Trip.find({ _id: { $in: trips.map((t) => t._id) } })
      .populate('routeId', 'name')
      .populate('busId', 'plate label seats')
      .populate('driverId', 'name email phone')
      .populate('kidIds', 'name grade')
      .sort({ sequence: 1 });

    res.status(201).json({
      trips: populated,
      summary: {
        kidCount: kids.length,
        seats: bus.seats,
        tripCount: groups.length,
      },
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/announcements', async (req, res) => {
  try {
    const filter = { ...schoolFilter(req), active: true };
    const announcements = await Announcement.find(filter).sort({ publishedAt: -1 }).limit(200);
    res.json({ announcements });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/announcements', async (req, res) => {
  try {
    const schoolId = resolveSchoolId(req, { required: true });
    if (!schoolId) return res.status(400).json({ error: 'schoolId is required' });
    const { title, body, category, authorName, attachmentName, attachmentUrl } = req.body || {};
    if (!title?.trim() || !body?.trim()) {
      return res.status(400).json({ error: 'title and body are required' });
    }
    const announcement = await Announcement.create({
      schoolId,
      title: title.trim(),
      body: body.trim(),
      category: ['general', 'class', 'transport', 'events', 'urgent'].includes(category)
        ? category
        : 'general',
      authorName: authorName?.trim() || req.user.name || 'Admin',
      attachmentName: attachmentName || '',
      attachmentUrl: attachmentUrl || '',
      publishedAt: new Date(),
    });
    res.status(201).json({ announcement });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/leave-requests', async (req, res) => {
  try {
    const filter = schoolFilter(req);
    if (req.query.status) filter.status = req.query.status;
    const requests = await LeaveRequest.find(filter)
      .populate('kidId', 'name grade house admissionNo')
      .populate('parentId', 'name phone email')
      .sort({ createdAt: -1 })
      .limit(200);
    res.json({ requests });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.patch('/leave-requests/:id', async (req, res) => {
  try {
    const request = await LeaveRequest.findById(req.params.id);
    if (!request) return res.status(404).json({ error: 'Leave request not found' });
    if (!assertSchoolAccess(req, request.schoolId)) {
      return res.status(403).json({ error: 'Not allowed' });
    }
    const { status } = req.body || {};
    if (!['pending', 'approved', 'rejected', 'cancelled'].includes(status)) {
      return res.status(400).json({ error: 'Invalid status' });
    }
    request.status = status;
    await request.save();
    res.json({ request });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
