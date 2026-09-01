import { Router } from 'express';
import { Campus, School, Kid, User, Bus, Route } from '../models/index.js';

const router = Router();

function isSchoolConsole(role) {
  return role === 'school_admin' || role === 'staff';
}

function resolveSchoolId(req) {
  if (isSchoolConsole(req.user.role)) return req.user.schoolId || null;
  return req.query.schoolId || req.body.schoolId || null;
}

function assertSchoolAccess(req, schoolId) {
  if (isSchoolConsole(req.user.role) && schoolId?.toString() !== req.user.schoolId) {
    return false;
  }
  return true;
}

function serializeCampus(campus) {
  return {
    id: campus._id.toString(),
    schoolId: campus.schoolId?.toString?.() || campus.schoolId,
    name: campus.name,
    address: campus.address || '',
    phone: campus.phone || '',
    location: campus.location || { lat: null, lng: null },
    isDefault: campus.isDefault === true,
    active: campus.active !== false,
    createdAt: campus.createdAt,
    updatedAt: campus.updatedAt,
  };
}

export async function ensureMainCampus(schoolId) {
  if (!schoolId) return null;
  const existing = await Campus.findOne({ schoolId }).sort({ createdAt: 1 });
  if (existing) return existing;
  const school = await School.findById(schoolId);
  return Campus.create({
    schoolId,
    name: 'Main Campus',
    address: school?.address || '',
    phone: school?.supportPhone || '',
    location: school?.location || { lat: null, lng: null },
    isDefault: true,
    active: true,
  });
}

async function validCampusId(schoolId, raw) {
  const id = String(raw || '').trim();
  if (!id) return null;
  if (!/^[a-f0-9]{24}$/i.test(id)) return null;
  const campus = await Campus.findOne({ _id: id, schoolId });
  return campus?._id || null;
}

function idsOf(value) {
  if (!Array.isArray(value)) return [];
  return [...new Set(value.map((id) => String(id || '')).filter((id) => /^[a-f0-9]{24}$/i.test(id)))];
}

router.get('/campuses', async (req, res) => {
  try {
    const schoolId = resolveSchoolId(req);
    if (!schoolId) return res.status(400).json({ error: 'schoolId is required' });
    await ensureMainCampus(schoolId);
    const campuses = await Campus.find({ schoolId }).sort({ isDefault: -1, name: 1 });
    const campusIds = campuses.map((c) => c._id);
    const [kids, teachers, drivers, buses, routes] = await Promise.all([
      Kid.find({ schoolId }).select('name grade campusId').sort({ name: 1 }),
      User.find({ schoolId, role: 'teacher' }).select('name email campusId').sort({ name: 1 }),
      User.find({ schoolId, role: 'driver' }).select('name email campusId').sort({ name: 1 }),
      Bus.find({ schoolId }).select('plate label campusId').sort({ label: 1, plate: 1 }),
      Route.find({ schoolId }).select('name campusId').sort({ name: 1 }),
    ]);

    const countFor = (list, campusId) => list.filter((row) => String(row.campusId || '') === String(campusId)).length;
    const brief = (row, extra = {}) => ({
      id: row._id.toString(),
      name: row.name || row.label || row.plate || 'Untitled',
      campusId: row.campusId ? String(row.campusId) : '',
      ...extra,
    });

    res.json({
      campuses: campuses.map((c) => ({
        ...serializeCampus(c),
        counts: {
          kids: countFor(kids, c._id),
          teachers: countFor(teachers, c._id),
          drivers: countFor(drivers, c._id),
          buses: countFor(buses, c._id),
          routes: countFor(routes, c._id),
        },
      })),
      assignable: {
        kids: kids.map((k) => brief(k, { grade: k.grade || '' })),
        teachers: teachers.map((t) => brief(t, { email: t.email || '' })),
        drivers: drivers.map((d) => brief(d, { email: d.email || '' })),
        buses: buses.map((b) => brief(b, { plate: b.plate || '' })),
        routes: routes.map((r) => brief(r)),
      },
      campusIds: campusIds.map((id) => String(id)),
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/campuses', async (req, res) => {
  try {
    const schoolId = resolveSchoolId(req);
    if (!schoolId) return res.status(400).json({ error: 'schoolId is required' });
    const name = String(req.body.name || '').trim();
    if (!name) return res.status(400).json({ error: 'Campus name is required' });
    const existingNames = await Campus.find({ schoolId }).select('name');
    if (existingNames.some((c) => c.name.toLowerCase() === name.toLowerCase())) {
      return res.status(400).json({ error: 'A campus with that name already exists' });
    }
    const campus = await Campus.create({
      schoolId,
      name,
      address: req.body.address || '',
      phone: req.body.phone || '',
      location: {
        lat: Number.isFinite(Number(req.body.location?.lat)) ? Number(req.body.location.lat) : null,
        lng: Number.isFinite(Number(req.body.location?.lng)) ? Number(req.body.location.lng) : null,
      },
      isDefault: false,
      active: req.body.active !== false,
    });
    res.status(201).json({ campus: serializeCampus(campus) });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.put('/campuses/:id', async (req, res) => {
  try {
    const campus = await Campus.findById(req.params.id);
    if (!campus) return res.status(404).json({ error: 'Campus not found' });
    if (!assertSchoolAccess(req, campus.schoolId)) {
      return res.status(403).json({ error: 'Cannot edit a campus from another school' });
    }
    if (req.body.name !== undefined) {
      const name = String(req.body.name || '').trim();
      if (!name) return res.status(400).json({ error: 'Campus name is required' });
      campus.name = name;
    }
    if (req.body.address !== undefined) campus.address = String(req.body.address || '').trim();
    if (req.body.phone !== undefined) campus.phone = String(req.body.phone || '').trim();
    if (req.body.active !== undefined) campus.active = req.body.active !== false;
    if (req.body.location) {
      campus.location = {
        lat: Number.isFinite(Number(req.body.location.lat)) ? Number(req.body.location.lat) : campus.location?.lat ?? null,
        lng: Number.isFinite(Number(req.body.location.lng)) ? Number(req.body.location.lng) : campus.location?.lng ?? null,
      };
    }
    if (req.body.isDefault === true) {
      await Campus.updateMany({ schoolId: campus.schoolId, _id: { $ne: campus._id } }, { $set: { isDefault: false } });
      campus.isDefault = true;
    }
    await campus.save();
    res.json({ campus: serializeCampus(campus) });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.delete('/campuses/:id', async (req, res) => {
  try {
    const campus = await Campus.findById(req.params.id);
    if (!campus) return res.status(404).json({ error: 'Campus not found' });
    if (!assertSchoolAccess(req, campus.schoolId)) {
      return res.status(403).json({ error: 'Cannot delete a campus from another school' });
    }
    const remaining = await Campus.countDocuments({ schoolId: campus.schoolId });
    if (remaining <= 1) {
      return res.status(400).json({ error: 'Keep at least one campus for this school' });
    }
    const fallback = await Campus.findOne({ schoolId: campus.schoolId, _id: { $ne: campus._id } }).sort({ isDefault: -1, createdAt: 1 });
    const filter = { schoolId: campus.schoolId, campusId: campus._id };
    const nextId = fallback?._id || null;
    await Promise.all([
      Kid.updateMany(filter, { $set: { campusId: nextId } }),
      User.updateMany(filter, { $set: { campusId: nextId } }),
      Bus.updateMany(filter, { $set: { campusId: nextId } }),
      Route.updateMany(filter, { $set: { campusId: nextId } }),
    ]);
    await Campus.deleteOne({ _id: campus._id });
    res.json({ ok: true, movedTo: fallback ? serializeCampus(fallback) : null });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.post('/campuses/:id/assign', async (req, res) => {
  try {
    const campus = await Campus.findById(req.params.id);
    if (!campus) return res.status(404).json({ error: 'Campus not found' });
    if (!assertSchoolAccess(req, campus.schoolId)) {
      return res.status(403).json({ error: 'Cannot assign to a campus from another school' });
    }
    const schoolId = campus.schoolId;
    const kids = idsOf(req.body.kids);
    const teachers = idsOf(req.body.teachers);
    const drivers = idsOf(req.body.drivers);
    const buses = idsOf(req.body.buses);
    const routes = idsOf(req.body.routes);
    const replace = req.body.replace !== false;

    const jobs = [];
    if (replace) {
      jobs.push(
        Kid.updateMany({ schoolId, campusId: campus._id, _id: { $nin: kids } }, { $set: { campusId: null } }),
        User.updateMany({ schoolId, role: 'teacher', campusId: campus._id, _id: { $nin: teachers } }, { $set: { campusId: null } }),
        User.updateMany({ schoolId, role: 'driver', campusId: campus._id, _id: { $nin: drivers } }, { $set: { campusId: null } }),
        Bus.updateMany({ schoolId, campusId: campus._id, _id: { $nin: buses } }, { $set: { campusId: null } }),
        Route.updateMany({ schoolId, campusId: campus._id, _id: { $nin: routes } }, { $set: { campusId: null } }),
      );
    }
    if (kids.length) jobs.push(Kid.updateMany({ _id: { $in: kids }, schoolId }, { $set: { campusId: campus._id } }));
    if (teachers.length) jobs.push(User.updateMany({ _id: { $in: teachers }, schoolId, role: 'teacher' }, { $set: { campusId: campus._id } }));
    if (drivers.length) jobs.push(User.updateMany({ _id: { $in: drivers }, schoolId, role: 'driver' }, { $set: { campusId: campus._id } }));
    if (buses.length) jobs.push(Bus.updateMany({ _id: { $in: buses }, schoolId }, { $set: { campusId: campus._id } }));
    if (routes.length) jobs.push(Route.updateMany({ _id: { $in: routes }, schoolId }, { $set: { campusId: campus._id } }));
    await Promise.all(jobs);

    res.json({ ok: true, campus: serializeCampus(campus) });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

export { validCampusId };
export default router;
