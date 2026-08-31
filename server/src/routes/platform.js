import { Router } from 'express';
import bcrypt from 'bcryptjs';
import mongoose from 'mongoose';
import {
  User,
  School,
  Campus,
  Route,
  Bus,
  Trip,
  SupportTicket,
  Announcement,
  Notification,
  DeviceToken,
  FeeStatement,
  AuditLog,
  FeatureRequest,
  PlatformSettings,
  PlatformNotice,
  PlatformInvoice,
} from '../models/index.js';
import { authenticate, requireSuperAdmin } from '../middleware/auth.js';
import { formatDateKey } from '../lib/clock.js';
import { closeSchool } from '../lib/schoolAccess.js';
import { getIO } from '../socket.js';

const router = Router();
router.use(authenticate, requireSuperAdmin);

const SCHOOL_STATUSES = ['pending', 'trial', 'active', 'suspended'];
const SCHOOL_PLANS = ['trial', 'basic', 'standard', 'premium'];
const USER_ROLES = ['super_admin', 'school_admin', 'driver', 'parent', 'teacher'];

function weekStart() {
  const d = new Date();
  d.setDate(d.getDate() - 7);
  d.setHours(0, 0, 0, 0);
  return d;
}

function monthStart(offset = 0) {
  const d = new Date();
  d.setDate(1);
  d.setHours(0, 0, 0, 0);
  d.setMonth(d.getMonth() + offset);
  return d;
}

function lastNDays(n) {
  const out = [];
  for (let i = n - 1; i >= 0; i -= 1) {
    const start = new Date();
    start.setHours(0, 0, 0, 0);
    start.setDate(start.getDate() - i);
    const end = new Date(start);
    end.setHours(23, 59, 59, 999);
    const weekday = new Intl.DateTimeFormat('en-US', {
      timeZone: process.env.APP_TIMEZONE || 'Africa/Nairobi',
      weekday: 'short',
    }).format(start);
    out.push({ start, end, key: formatDateKey(start), label: weekday });
  }
  return out;
}

function normalizeStatus(value, fallback = 'active') {
  const s = String(value || '').toLowerCase().trim();
  return SCHOOL_STATUSES.includes(s) ? s : fallback;
}

function normalizePlan(value, fallback = 'standard') {
  const s = String(value || '').toLowerCase().trim();
  return SCHOOL_PLANS.includes(s) ? s : fallback;
}

async function writeAudit(req, { action, entity, entityId = '', schoolId = null, detail = '' }) {
  try {
    await AuditLog.create({
      actorId: req.user?.id || null,
      actorName: req.user?.name || req.user?.email || 'Super Admin',
      action,
      entity,
      entityId: entityId ? String(entityId) : '',
      schoolId: schoolId || null,
      detail: String(detail || '').slice(0, 500),
    });
  } catch (err) {
    console.warn('audit log failed', err.message);
  }
}

async function getSettings() {
  let doc = await PlatformSettings.findOne({ key: 'default' });
  if (!doc) {
    doc = await PlatformSettings.create({
      key: 'default',
      platformName: 'GREENFIELD SCHOOL',
      tagline: 'Transport Management System',
    });
  }
  return doc;
}

function serializeSchool(school, admin = null) {
  return {
    _id: school._id,
    name: school.name,
    address: school.address || '',
    location: school.location,
    status: school.status || 'active',
    plan: school.plan || 'standard',
    supportEmail: school.supportEmail || '',
    supportPhone: school.supportPhone || '',
    createdAt: school.createdAt,
    updatedAt: school.updatedAt,
    admin: admin
      ? {
          id: admin.id || admin._id,
          name: admin.name,
          email: admin.email,
          phone: admin.phone || '',
          active: admin.active !== false,
        }
      : null,
  };
}

async function adminsBySchool(schoolIds) {
  const admins = await User.find({
    role: 'school_admin',
    schoolId: { $in: schoolIds },
  }).sort({ createdAt: 1 });
  const map = new Map();
  for (const admin of admins) {
    const key = String(admin.schoolId);
    if (!map.has(key)) map.set(key, admin.toSafeJSON());
  }
  return map;
}

async function nextInvoiceNo() {
  const year = new Date().getFullYear();
  const prefix = `INV-${year}-`;
  const latest = await PlatformInvoice.findOne({ invoiceNo: new RegExp(`^${prefix}`) }).sort({ invoiceNo: -1 });
  const n = latest ? Number(String(latest.invoiceNo).slice(prefix.length)) + 1 : 1;
  return `${prefix}${String(Number.isFinite(n) ? n : 1).padStart(4, '0')}`;
}

async function nextTicketNo() {
  const year = new Date().getFullYear();
  const prefix = `EDU-${year}-`;
  const latest = await SupportTicket.findOne({ ticketNo: new RegExp(`^${prefix}`) }).sort({ ticketNo: -1 });
  const n = latest ? Number(String(latest.ticketNo).slice(prefix.length)) + 1 : 1;
  return `${prefix}${String(Number.isFinite(n) ? n : 1).padStart(4, '0')}`;
}

function parseLocation(body) {
  const loc = body.location && typeof body.location === 'object' ? body.location : body;
  const lat = Number(loc.lat ?? loc.latitude);
  const lng = Number(loc.lng ?? loc.longitude);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
    throw new Error('School location (lat, lng) is required');
  }
  return { lat, lng };
}

router.get('/shell', async (req, res) => {
  try {
    const [settings, ticketOpen, unread] = await Promise.all([
      getSettings(),
      SupportTicket.countDocuments({ status: { $in: ['open', 'pending'] } }),
      Notification.countDocuments({ userId: req.user.id, read: { $ne: true }, archived: { $ne: true } }),
    ]);
    res.json({
      settings: {
        platformName: settings.platformName,
        tagline: settings.tagline,
        supportEmail: settings.supportEmail,
        supportPhone: settings.supportPhone,
        maintenanceMode: settings.maintenanceMode === true,
      },
      ticketOpen,
      unread,
    });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.get('/overview', async (req, res) => {
  try {
    const sinceWeek = weekStart();
    const thisMonth = monthStart(0);
    const lastMonth = monthStart(-1);
    const days = lastNDays(7);

    const [
      schools,
      users,
      buses,
      routes,
      activeTrips,
      addedSchools,
      addedUsers,
      addedBuses,
      addedRoutes,
      statusRows,
      planRows,
      recentSchools,
      ticketOpen,
      unread,
      settings,
      paidThisMonth,
      paidLastMonth,
      sessions,
    ] = await Promise.all([
      School.countDocuments(),
      User.countDocuments({ active: { $ne: false } }),
      Bus.countDocuments({ active: { $ne: false } }),
      Route.countDocuments(),
      Trip.countDocuments({ status: 'active' }),
      School.countDocuments({ createdAt: { $gte: sinceWeek } }),
      User.countDocuments({ createdAt: { $gte: sinceWeek } }),
      Bus.countDocuments({ createdAt: { $gte: sinceWeek } }),
      Route.countDocuments({ createdAt: { $gte: sinceWeek } }),
      School.aggregate([{ $group: { _id: { $ifNull: ['$status', 'active'] }, n: { $sum: 1 } } }]),
      School.aggregate([{ $group: { _id: { $ifNull: ['$plan', 'standard'] }, n: { $sum: 1 } } }]),
      School.find().sort({ createdAt: -1 }).limit(8),
      SupportTicket.countDocuments({ status: { $in: ['open', 'pending'] } }),
      Notification.countDocuments({ userId: req.user.id, read: { $ne: true }, archived: { $ne: true } }),
      getSettings(),
      PlatformInvoice.aggregate([
        { $match: { status: 'paid', paidAt: { $gte: thisMonth } } },
        { $group: { _id: null, total: { $sum: '$amount' } } },
      ]),
      PlatformInvoice.aggregate([
        { $match: { status: 'paid', paidAt: { $gte: lastMonth, $lt: thisMonth } } },
        { $group: { _id: null, total: { $sum: '$amount' } } },
      ]),
      DeviceToken.countDocuments(),
    ]);

    const statusMap = Object.fromEntries(statusRows.map((r) => [r._id || 'active', r.n]));
    const planMap = Object.fromEntries(planRows.map((r) => [r._id || 'standard', r.n]));
    const byStatus = {
      active: statusMap.active || 0,
      trial: statusMap.trial || 0,
      pending: statusMap.pending || 0,
      suspended: statusMap.suspended || 0,
    };
    const byPlan = {
      premium: planMap.premium || 0,
      standard: planMap.standard || 0,
      basic: planMap.basic || 0,
      trial: planMap.trial || 0,
    };

    const adminMap = await adminsBySchool(recentSchools.map((s) => s._id));
    const activitySeries = await Promise.all(
      days.map(async (day) => {
        const filter = { createdAt: { $gte: day.start, $lte: day.end } };
        const [newSchools, newUsers, activeTripsDay] = await Promise.all([
          School.countDocuments(filter),
          User.countDocuments(filter),
          Trip.countDocuments({
            $or: [{ startedAt: { $gte: day.start, $lte: day.end } }, { createdAt: { $gte: day.start, $lte: day.end }, status: 'active' }],
          }),
        ]);
        return { day: day.label, key: day.key, schools: newSchools, users: newUsers, trips: activeTripsDay };
      })
    );

    const monthKes = paidThisMonth[0]?.total || 0;
    const prevKes = paidLastMonth[0]?.total || 0;
    const pct = prevKes > 0 ? ((monthKes - prevKes) / prevKes) * 100 : monthKes > 0 ? 100 : 0;

    let socketClients = 0;
    try {
      socketClients = getIO()?.engine?.clientsCount || 0;
    } catch {
      socketClients = 0;
    }

    res.json({
      kpis: {
        schools,
        activeSchools: byStatus.active,
        users,
        buses,
        routes,
        revenueKes: monthKes,
        addedSchools,
        addedUsers,
        addedBuses,
        addedRoutes,
        revenuePct: Math.round(pct * 10) / 10,
      },
      byStatus,
      byPlan,
      activitySeries,
      recentSchools: recentSchools.map((s) => serializeSchool(s, adminMap.get(String(s._id)))),
      health: {
        api: 'operational',
        database: mongoose.connection.readyState === 1 ? 'operational' : 'down',
        backup: 'not_configured',
        storage: {
          heapUsedMb: Math.round(process.memoryUsage().heapUsed / 1024 / 1024),
          heapTotalMb: Math.round(process.memoryUsage().heapTotal / 1024 / 1024),
        },
        activeSessions: socketClients,
        registeredDevices: sessions,
      },
      ticketOpen,
      unread,
      settings: {
        platformName: settings.platformName,
        tagline: settings.tagline,
        maintenanceMode: settings.maintenanceMode === true,
      },
    });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.get('/search', async (req, res) => {
  try {
    const q = String(req.query.q || '').trim();
    if (q.length < 2) return res.json({ schools: [], admins: [], users: [] });
    const rx = new RegExp(q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
    const [schools, users] = await Promise.all([
      School.find({ $or: [{ name: rx }, { address: rx }] })
        .sort({ name: 1 })
        .limit(8)
        .select('name address status plan'),
      User.find({ $or: [{ name: rx }, { email: rx }, { phone: rx }] })
        .sort({ name: 1 })
        .limit(12)
        .select('name email role schoolId active'),
    ]);
    res.json({
      schools,
      admins: users.filter((u) => u.role === 'school_admin'),
      users,
    });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.get('/schools', async (req, res) => {
  try {
    const { status, plan, q } = req.query;
    const filter = {};
    if (status && SCHOOL_STATUSES.includes(status)) filter.status = status;
    if (plan && SCHOOL_PLANS.includes(plan)) filter.plan = plan;
    if (q) {
      const rx = new RegExp(String(q).replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
      filter.$or = [{ name: rx }, { address: rx }];
    }
    const schools = await School.find(filter).sort({ createdAt: -1 });
    const adminMap = await adminsBySchool(schools.map((s) => s._id));
    res.json({ schools: schools.map((s) => serializeSchool(s, adminMap.get(String(s._id)))) });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.post('/schools', async (req, res) => {
  try {
    const name = String(req.body.name || '').trim();
    if (!name) return res.status(400).json({ error: 'School name is required' });
    const location = parseLocation(req.body);
    const status = normalizeStatus(req.body.status, 'pending');
    const plan = normalizePlan(req.body.plan, status === 'trial' ? 'trial' : 'standard');
    const admin = req.body.admin || {};
    if (admin.email || admin.name || admin.password) {
      if (!admin.email || !admin.password || !admin.name) {
        return res.status(400).json({ error: 'School admin needs name, email, and password' });
      }
      const taken = await User.findOne({ email: String(admin.email).toLowerCase().trim() });
      if (taken) return res.status(400).json({ error: 'That admin email is already in use' });
    }
    const school = await School.create({
      name,
      address: String(req.body.address || '').trim(),
      location,
      status,
      plan,
      supportEmail: String(req.body.supportEmail || '').trim(),
      supportPhone: String(req.body.supportPhone || '').trim(),
    });
    await Campus.create({
      schoolId: school._id,
      name: 'Main Campus',
      address: school.address || '',
      phone: school.supportPhone || '',
      location: school.location || { lat: null, lng: null },
      isDefault: true,
      active: true,
    });

    let schoolAdmin = null;
    try {
      if (admin.email) {
        const passwordHash = await bcrypt.hash(String(admin.password), 10);
        const created = await User.create({
          email: String(admin.email).toLowerCase().trim(),
          passwordHash,
          name: String(admin.name).trim(),
          phone: String(admin.phone || '').trim(),
          role: 'school_admin',
          schoolId: school._id,
          active: ['active', 'trial'].includes(status),
        });
        schoolAdmin = created.toSafeJSON();
      }
    } catch (err) {
      await Campus.deleteMany({ schoolId: school._id });
      await School.findByIdAndDelete(school._id);
      throw err;
    }

    await writeAudit(req, {
      action: 'school.create',
      entity: 'school',
      entityId: school._id,
      schoolId: school._id,
      detail: `${name} admitted as ${status}/${plan}`,
    });
    if (schoolAdmin) {
      await writeAudit(req, {
        action: 'admin.create',
        entity: 'user',
        entityId: schoolAdmin.id,
        schoolId: school._id,
        detail: `${schoolAdmin.email} created as school admin`,
      });
    }
    res.status(201).json({ school: serializeSchool(school, schoolAdmin) });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.put('/schools/:id', async (req, res) => {
  try {
    const school = await School.findById(req.params.id);
    if (!school) return res.status(404).json({ error: 'School not found' });
    const before = `${school.status}/${school.plan}`;
    if (req.body.name !== undefined) {
      const name = String(req.body.name || '').trim();
      if (!name) return res.status(400).json({ error: 'School name is required' });
      school.name = name.slice(0, 120);
    }
    if (req.body.address !== undefined) school.address = String(req.body.address || '').trim().slice(0, 400);
    if (req.body.supportEmail !== undefined) school.supportEmail = String(req.body.supportEmail || '').trim();
    if (req.body.supportPhone !== undefined) school.supportPhone = String(req.body.supportPhone || '').trim();
    if (req.body.status !== undefined) school.status = normalizeStatus(req.body.status, school.status);
    if (req.body.plan !== undefined) school.plan = normalizePlan(req.body.plan, school.plan);
    if (req.body.location) school.location = parseLocation(req.body);
    await school.save();

    if (school.status === 'suspended') {
      await User.updateMany({ schoolId: school._id, role: 'school_admin' }, { $set: { active: false } });
    } else if (['active', 'trial'].includes(school.status)) {
      await User.updateMany({ schoolId: school._id, role: 'school_admin' }, { $set: { active: true } });
    }

    const adminMap = await adminsBySchool([school._id]);
    await writeAudit(req, {
      action: 'school.update',
      entity: 'school',
      entityId: school._id,
      schoolId: school._id,
      detail: `${before} → ${school.status}/${school.plan}`,
    });
    res.json({ school: serializeSchool(school, adminMap.get(String(school._id))) });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.delete('/schools/:id', async (req, res) => {
  try {
    const school = await closeSchool(req.params.id);
    if (!school) return res.status(404).json({ error: 'School not found' });
    await writeAudit(req, {
      action: 'school.delete',
      entity: 'school',
      entityId: req.params.id,
      schoolId: req.params.id,
      detail: `${school.name} removed`,
    });
    res.json({ ok: true });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.get('/admins', async (req, res) => {
  try {
    const filter = { role: 'school_admin' };
    if (req.query.schoolId) filter.schoolId = req.query.schoolId;
    if (req.query.q) {
      const rx = new RegExp(String(req.query.q).replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
      filter.$or = [{ name: rx }, { email: rx }, { phone: rx }];
    }
    const admins = await User.find(filter).sort({ createdAt: -1 });
    const schools = await School.find({ _id: { $in: admins.map((a) => a.schoolId).filter(Boolean) } }).select(
      'name status plan'
    );
    const schoolMap = new Map(schools.map((s) => [String(s._id), s]));
    res.json({
      admins: admins.map((a) => {
        const json = a.toSafeJSON();
        const school = schoolMap.get(String(a.schoolId));
        return {
          ...json,
          schoolName: school?.name || '',
          schoolStatus: school?.status || '',
          schoolPlan: school?.plan || '',
        };
      }),
    });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.post('/admins', async (req, res) => {
  try {
    const { email, password, name, phone, schoolId } = req.body;
    if (!email || !password || !name || !schoolId) {
      return res.status(400).json({ error: 'email, password, name, and schoolId are required' });
    }
    const school = await School.findById(schoolId);
    if (!school) return res.status(404).json({ error: 'School not found' });
    const passwordHash = await bcrypt.hash(String(password), 10);
    const admin = await User.create({
      email: String(email).toLowerCase().trim(),
      passwordHash,
      name: String(name).trim(),
      phone: String(phone || '').trim(),
      role: 'school_admin',
      schoolId,
      active: ['active', 'trial'].includes(school.status),
    });
    await writeAudit(req, {
      action: 'admin.create',
      entity: 'user',
      entityId: admin._id,
      schoolId,
      detail: `${admin.email} created as school admin for ${school.name}`,
    });
    res.status(201).json({ admin: { ...admin.toSafeJSON(), schoolName: school.name } });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.put('/admins/:id', async (req, res) => {
  try {
    const admin = await User.findOne({ _id: req.params.id, role: 'school_admin' });
    if (!admin) return res.status(404).json({ error: 'School admin not found' });
    if (req.body.name !== undefined) admin.name = String(req.body.name || '').trim();
    if (req.body.phone !== undefined) admin.phone = String(req.body.phone || '').trim();
    if (req.body.active !== undefined) admin.active = req.body.active !== false;
    if (req.body.password) admin.passwordHash = await bcrypt.hash(String(req.body.password), 10);
    if (req.body.schoolId) {
      const school = await School.findById(req.body.schoolId);
      if (!school) return res.status(404).json({ error: 'School not found' });
      admin.schoolId = school._id;
    }
    await admin.save();
    await writeAudit(req, {
      action: 'admin.update',
      entity: 'user',
      entityId: admin._id,
      schoolId: admin.schoolId,
      detail: `${admin.email} ${admin.active ? 'updated' : 'deactivated'}`,
    });
    res.json({ admin: admin.toSafeJSON() });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.get('/users', async (req, res) => {
  try {
    const filter = {};
    if (req.query.role && USER_ROLES.includes(req.query.role)) filter.role = req.query.role;
    if (req.query.schoolId) filter.schoolId = req.query.schoolId;
    if (req.query.active === 'true') filter.active = true;
    if (req.query.active === 'false') filter.active = false;
    if (req.query.q) {
      const rx = new RegExp(String(req.query.q).replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
      filter.$or = [{ name: rx }, { email: rx }, { phone: rx }];
    }
    const users = await User.find(filter).sort({ createdAt: -1 }).limit(300);
    const schools = await School.find({ _id: { $in: users.map((u) => u.schoolId).filter(Boolean) } }).select('name');
    const schoolMap = new Map(schools.map((s) => [String(s._id), s.name]));
    res.json({
      users: users.map((u) => ({
        ...u.toSafeJSON(),
        schoolName: schoolMap.get(String(u.schoolId)) || '',
      })),
    });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.put('/users/:id', async (req, res) => {
  try {
    const user = await User.findById(req.params.id);
    if (!user) return res.status(404).json({ error: 'User not found' });
    if (String(user._id) === String(req.user.id) && req.body.active === false) {
      return res.status(400).json({ error: 'You cannot deactivate your own account' });
    }
    if (req.body.active !== undefined) user.active = req.body.active !== false;
    await user.save();
    await writeAudit(req, {
      action: user.active ? 'user.activate' : 'user.deactivate',
      entity: 'user',
      entityId: user._id,
      schoolId: user.schoolId,
      detail: `${user.email} ${user.active ? 'activated' : 'deactivated'}`,
    });
    res.json({ user: user.toSafeJSON() });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.get('/roles', async (req, res) => {
  try {
    const rows = await User.aggregate([{ $group: { _id: '$role', n: { $sum: 1 }, active: { $sum: { $cond: [{ $ne: ['$active', false] }, 1, 0] } } } }]);
    const counts = Object.fromEntries(rows.map((r) => [r._id, { total: r.n, active: r.active }]));
    res.json({
      roles: [
        {
          id: 'super_admin',
          name: 'Super Admin',
          summary: 'Admits schools, manages platform billing, users, and support.',
          count: counts.super_admin || { total: 0, active: 0 },
        },
        {
          id: 'school_admin',
          name: 'School Admin',
          summary: 'Runs one school: buses, routes, students, trips, and staff.',
          count: counts.school_admin || { total: 0, active: 0 },
        },
        {
          id: 'driver',
          name: 'Driver',
          summary: 'Runs assigned trips, check-in, and live location.',
          count: counts.driver || { total: 0, active: 0 },
        },
        {
          id: 'teacher',
          name: 'Teacher',
          summary: 'Class register, diary, assignments, and student notes.',
          count: counts.teacher || { total: 0, active: 0 },
        },
        {
          id: 'parent',
          name: 'Parent',
          summary: 'Tracks their children live and receives trip alerts.',
          count: counts.parent || { total: 0, active: 0 },
        },
      ],
    });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.get('/subscriptions', async (req, res) => {
  try {
    const schools = await School.find().sort({ name: 1 }).select('name status plan createdAt');
    const planRows = await School.aggregate([{ $group: { _id: { $ifNull: ['$plan', 'standard'] }, n: { $sum: 1 } } }]);
    res.json({
      byPlan: Object.fromEntries(planRows.map((r) => [r._id || 'standard', r.n])),
      schools,
    });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.get('/invoices', async (req, res) => {
  try {
    const invoices = await PlatformInvoice.find().populate('schoolId', 'name plan status').sort({ createdAt: -1 }).limit(200);
    res.json({ invoices });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.post('/invoices', async (req, res) => {
  try {
    const school = await School.findById(req.body.schoolId);
    if (!school) return res.status(404).json({ error: 'School not found' });
    const amount = Number(req.body.amount);
    if (!Number.isFinite(amount) || amount < 0) return res.status(400).json({ error: 'amount is required' });
    const invoice = await PlatformInvoice.create({
      schoolId: school._id,
      invoiceNo: await nextInvoiceNo(),
      description: String(req.body.description || `${school.plan} subscription`).trim(),
      plan: school.plan,
      amount,
      currency: String(req.body.currency || 'KES').trim() || 'KES',
      status: req.body.status === 'draft' ? 'draft' : 'sent',
      dueDate: req.body.dueDate ? new Date(req.body.dueDate) : null,
      createdBy: req.user.id,
    });
    await writeAudit(req, {
      action: 'invoice.create',
      entity: 'invoice',
      entityId: invoice._id,
      schoolId: school._id,
      detail: `${invoice.invoiceNo} for ${school.name}`,
    });
    const populated = await invoice.populate('schoolId', 'name plan status');
    res.status(201).json({ invoice: populated });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.put('/invoices/:id', async (req, res) => {
  try {
    const invoice = await PlatformInvoice.findById(req.params.id);
    if (!invoice) return res.status(404).json({ error: 'Invoice not found' });
    if (req.body.status) {
      const status = String(req.body.status);
      if (!['draft', 'sent', 'paid', 'void'].includes(status)) {
        return res.status(400).json({ error: 'Invalid invoice status' });
      }
      invoice.status = status;
      invoice.paidAt = status === 'paid' ? new Date() : null;
    }
    if (req.body.description !== undefined) invoice.description = String(req.body.description || '').trim();
    await invoice.save();
    await writeAudit(req, {
      action: 'invoice.update',
      entity: 'invoice',
      entityId: invoice._id,
      schoolId: invoice.schoolId,
      detail: `${invoice.invoiceNo} → ${invoice.status}`,
    });
    const populated = await invoice.populate('schoolId', 'name plan status');
    res.json({ invoice: populated });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.get('/payments', async (req, res) => {
  try {
    const invoices = await PlatformInvoice.find({ status: 'paid' })
      .populate('schoolId', 'name')
      .sort({ paidAt: -1 })
      .limit(200);
    const feeDocs = await FeeStatement.find().populate('schoolId', 'name').select('schoolId payments currency').limit(200);
    const feePayments = [];
    for (const stmt of feeDocs) {
      for (const pay of stmt.payments || []) {
        feePayments.push({
          _id: pay._id,
          source: 'school_fees',
          schoolName: stmt.schoolId?.name || '',
          amount: pay.amount,
          currency: stmt.currency || 'KES',
          method: pay.method || '',
          reference: pay.reference || '',
          description: pay.description || 'School fees',
          at: pay.at,
        });
      }
    }
    feePayments.sort((a, b) => new Date(b.at) - new Date(a.at));
    res.json({
      platform: invoices.map((inv) => ({
        _id: inv._id,
        source: 'subscription',
        schoolName: inv.schoolId?.name || '',
        amount: inv.amount,
        currency: inv.currency,
        method: 'invoice',
        reference: inv.invoiceNo,
        description: inv.description,
        at: inv.paidAt || inv.updatedAt,
      })),
      schoolFees: feePayments.slice(0, 80),
    });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.get('/tickets', async (req, res) => {
  try {
    const filter = {};
    if (req.query.status) filter.status = req.query.status;
    const tickets = await SupportTicket.find(filter)
      .populate('schoolId', 'name')
      .populate('parentId', 'name email')
      .sort({ createdAt: -1 })
      .limit(200);
    res.json({ tickets });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.post('/tickets', async (req, res) => {
  try {
    const title = String(req.body.title || '').trim();
    if (!title) return res.status(400).json({ error: 'title is required' });
    const ticket = await SupportTicket.create({
      schoolId: req.body.schoolId || null,
      parentId: req.body.parentId || null,
      ticketNo: await nextTicketNo(),
      title,
      body: String(req.body.body || '').trim(),
      category: req.body.category || 'general',
      status: 'open',
    });
    await writeAudit(req, {
      action: 'ticket.create',
      entity: 'ticket',
      entityId: ticket._id,
      schoolId: ticket.schoolId,
      detail: ticket.ticketNo,
    });
    res.status(201).json({ ticket });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.put('/tickets/:id', async (req, res) => {
  try {
    const ticket = await SupportTicket.findById(req.params.id);
    if (!ticket) return res.status(404).json({ error: 'Ticket not found' });
    if (req.body.status && ['open', 'pending', 'resolved', 'closed'].includes(req.body.status)) {
      ticket.status = req.body.status;
    }
    if (req.body.body !== undefined) ticket.body = String(req.body.body || '').trim();
    await ticket.save();
    await writeAudit(req, {
      action: 'ticket.update',
      entity: 'ticket',
      entityId: ticket._id,
      schoolId: ticket.schoolId,
      detail: `${ticket.ticketNo} → ${ticket.status}`,
    });
    res.json({ ticket });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.get('/announcements', async (req, res) => {
  try {
    const notices = await PlatformNotice.find().sort({ createdAt: -1 }).limit(100);
    res.json({ announcements: notices });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.post('/announcements', async (req, res) => {
  try {
    const title = String(req.body.title || '').trim();
    const body = String(req.body.body || '').trim();
    if (!title || !body) return res.status(400).json({ error: 'title and body are required' });
    const notice = await PlatformNotice.create({
      title,
      body,
      audience: req.body.audience || 'all',
      createdBy: req.user.id,
    });
    const schools = await School.find({ status: { $in: ['active', 'trial'] } }).select('_id');
    if (schools.length) {
      try {
        await Announcement.insertMany(
          schools.map((s) => ({
            schoolId: s._id,
            title,
            body,
            category: 'general',
            kind: 'important',
            sourceKey: `platform:${notice._id}`,
            authorName: 'Platform',
            publishedAt: new Date(),
          }))
        );
      } catch (err) {
        console.warn('platform announcement fan-out failed', err.message);
      }
    }
    await writeAudit(req, {
      action: 'announcement.create',
      entity: 'announcement',
      entityId: notice._id,
      detail: title,
    });
    res.status(201).json({ announcement: notice });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.put('/announcements/:id', async (req, res) => {
  try {
    const notice = await PlatformNotice.findById(req.params.id);
    if (!notice) return res.status(404).json({ error: 'Announcement not found' });
    if (req.body.active !== undefined) notice.active = req.body.active !== false;
    if (req.body.title) notice.title = String(req.body.title).trim();
    if (req.body.body) notice.body = String(req.body.body).trim();
    await notice.save();
    if (notice.active === false) {
      await Announcement.updateMany({ sourceKey: `platform:${notice._id}` }, { $set: { archived: true, active: false } });
    }
    res.json({ announcement: notice });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.get('/feature-requests', async (req, res) => {
  try {
    const items = await FeatureRequest.find()
      .populate('schoolId', 'name')
      .populate('createdBy', 'name email')
      .sort({ createdAt: -1 })
      .limit(200);
    res.json({ requests: items });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.post('/feature-requests', async (req, res) => {
  try {
    const title = String(req.body.title || '').trim();
    if (!title) return res.status(400).json({ error: 'title is required' });
    const item = await FeatureRequest.create({
      title,
      body: String(req.body.body || '').trim(),
      schoolId: req.body.schoolId || null,
      createdBy: req.user.id,
    });
    res.status(201).json({ request: item });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.put('/feature-requests/:id', async (req, res) => {
  try {
    const item = await FeatureRequest.findById(req.params.id);
    if (!item) return res.status(404).json({ error: 'Request not found' });
    if (req.body.status && ['open', 'planned', 'done', 'declined'].includes(req.body.status)) {
      item.status = req.body.status;
    }
    if (req.body.body !== undefined) item.body = String(req.body.body || '').trim();
    await item.save();
    res.json({ request: item });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.get('/audit', async (req, res) => {
  try {
    const logs = await AuditLog.find()
      .populate('schoolId', 'name')
      .sort({ createdAt: -1 })
      .limit(Number(req.query.limit) || 150);
    res.json({ logs });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.get('/activity', async (req, res) => {
  try {
    const [logs, users, schools] = await Promise.all([
      AuditLog.find().populate('schoolId', 'name').sort({ createdAt: -1 }).limit(80),
      User.find().sort({ createdAt: -1 }).limit(20).select('name email role createdAt schoolId'),
      School.find().sort({ createdAt: -1 }).limit(12).select('name status plan createdAt'),
    ]);
    const events = [
      ...logs.map((l) => ({
        id: `audit-${l._id}`,
        at: l.createdAt,
        kind: 'audit',
        title: l.action,
        detail: l.detail,
        actor: l.actorName,
        school: l.schoolId?.name || '',
      })),
      ...users.map((u) => ({
        id: `user-${u._id}`,
        at: u.createdAt,
        kind: 'user',
        title: 'New user',
        detail: `${u.name} (${u.role})`,
        actor: u.email,
        school: '',
      })),
      ...schools.map((s) => ({
        id: `school-${s._id}`,
        at: s.createdAt,
        kind: 'school',
        title: 'School added',
        detail: `${s.name} · ${s.status}/${s.plan}`,
        actor: '',
        school: s.name,
      })),
    ]
      .sort((a, b) => new Date(b.at) - new Date(a.at))
      .slice(0, 120);
    res.json({ events });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.get('/settings', async (req, res) => {
  try {
    const settings = await getSettings();
    res.json({ settings });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.put('/settings', async (req, res) => {
  try {
    const settings = await getSettings();
    if (req.body.platformName !== undefined) settings.platformName = String(req.body.platformName || '').trim().slice(0, 80) || 'GREENFIELD SCHOOL';
    if (req.body.tagline !== undefined) settings.tagline = String(req.body.tagline || '').trim().slice(0, 80);
    if (req.body.supportEmail !== undefined) settings.supportEmail = String(req.body.supportEmail || '').trim();
    if (req.body.supportPhone !== undefined) settings.supportPhone = String(req.body.supportPhone || '').trim();
    if (req.body.maintenanceMode !== undefined) settings.maintenanceMode = req.body.maintenanceMode === true;
    await settings.save();
    await writeAudit(req, {
      action: 'settings.update',
      entity: 'settings',
      entityId: settings._id,
      detail: `platform ${settings.platformName}`,
    });
    res.json({ settings });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.get('/health', async (req, res) => {
  try {
    const mem = process.memoryUsage();
    let pingMs = null;
    const t0 = Date.now();
    try {
      await mongoose.connection.db.admin().ping();
      pingMs = Date.now() - t0;
    } catch {
      pingMs = null;
    }
    let socketClients = 0;
    try {
      socketClients = getIO()?.engine?.clientsCount || 0;
    } catch {
      socketClients = 0;
    }
    res.json({
      api: 'operational',
      database: mongoose.connection.readyState === 1 ? 'operational' : 'down',
      dbPingMs: pingMs,
      backup: 'not_configured',
      storage: {
        heapUsedMb: Math.round(mem.heapUsed / 1024 / 1024),
        heapTotalMb: Math.round(mem.heapTotal / 1024 / 1024),
        rssMb: Math.round(mem.rss / 1024 / 1024),
      },
      activeSessions: socketClients,
      registeredDevices: await DeviceToken.countDocuments(),
      uptimeSec: Math.round(process.uptime()),
    });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.get('/notifications', async (req, res) => {
  try {
    const items = await Notification.find({ userId: req.user.id, archived: { $ne: true } })
      .sort({ createdAt: -1 })
      .limit(40);
    res.json({ notifications: items });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

export default router;
