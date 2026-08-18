import { Router } from 'express';
import {
  Kid,
  Trip,
  TripEvent,
  Notification,
  Stop,
  DriverProfile,
  DeviceToken,
  User,
  LeaveRequest,
  Announcement,
  Assignment,
  TeacherNote,
  AttendanceRecord,
  DiaryEntry,
  Assessment,
  AcademicTerm,
  SchoolHoliday,
} from '../models/index.js';
import { authenticate, requireRole } from '../middleware/auth.js';
import { getVapidPublicKey } from '../services/push.js';
import { createAndEmitNotifications, NOTIFICATION_TYPES } from '../services/notifications.js';
import { getIO } from '../socket.js';

const router = Router();
router.use(authenticate, requireRole('parent'));

router.get('/kids', async (req, res) => {
  try {
    const kids = await Kid.find({ parentIds: req.user.id, active: true })
      .populate('schoolId', 'name location address logoUrl')
      .populate('routeId', 'name')
      .populate('homeStopId', 'name location');
    res.json({ kids });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/me', async (req, res) => {
  try {
    const user = await User.findById(req.user.id).select('name email phone role');
    const kids = await Kid.find({ parentIds: req.user.id, active: true })
      .populate('schoolId', 'name location address logoUrl')
      .limit(1);
    const school = kids[0]?.schoolId || null;
    res.json({ user, school });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

function behaviourLabel(score) {
  if (score >= 80) return 'Excellent';
  if (score >= 70) return 'Very good';
  if (score >= 55) return 'Good';
  if (score >= 40) return 'Fair';
  return 'Needs support';
}

function firstName(name) {
  return String(name || '').trim().split(/\s+/)[0] || 'Child';
}

function sampleEvents() {
  const y = new Date().getFullYear();
  return [
    {
      _id: 'sample-ptm',
      title: 'Parent-Teacher Meeting',
      date: new Date(y, 7, 25, 15, 0),
      endDate: new Date(y, 7, 25, 17, 0),
      location: 'School Hall',
      kind: 'meeting',
    },
    {
      _id: 'sample-trip',
      title: 'School Trip - Wildlife Park',
      date: new Date(y, 8, 5, 7, 30),
      endDate: new Date(y, 8, 5, 16, 0),
      location: 'Nairobi National Park',
      kind: 'trip',
    },
    {
      _id: 'sample-quiz',
      title: 'Inter-Class Quiz Competition',
      date: new Date(y, 8, 15, 14, 0),
      endDate: new Date(y, 8, 15, 16, 0),
      location: 'School Auditorium',
      kind: 'event',
    },
  ];
}

router.get('/overview', async (req, res) => {
  try {
    const kids = await Kid.find({ parentIds: req.user.id, active: true })
      .populate('schoolId', 'name location address logoUrl')
      .populate('routeId', 'name')
      .populate('homeStopId', 'name location')
      .sort({ name: 1 });
    const kidIds = kids.map((k) => k._id);
    const schoolIds = [...new Set(kids.map((k) => k.schoolId?._id?.toString() || k.schoolId?.toString()).filter(Boolean))];
    const grades = [...new Set(kids.map((k) => k.grade).filter(Boolean))];
    const today = startOfDay();

    const [activeTrips, notifications, announcements, holidays, assignments, marks] = await Promise.all([
      kidIds.length
        ? Trip.find({ status: 'active', kidIds: { $in: kidIds } })
            .populate('routeId', 'name')
            .populate('driverId', 'name phone')
            .populate('busId', 'plate label')
        : [],
      Notification.find({ userId: req.user.id }).sort({ createdAt: -1 }).limit(80),
      schoolIds.length
        ? Announcement.find({
            schoolId: { $in: schoolIds },
            active: true,
            archived: { $ne: true },
            $or: [
              { scope: { $ne: 'class' } },
              { scope: 'class', grade: { $in: grades } },
              { category: 'class', grade: { $in: grades } },
            ],
          })
            .sort({ publishedAt: -1, createdAt: -1 })
            .limit(20)
        : [],
      schoolIds.length
        ? SchoolHoliday.find({ schoolId: { $in: schoolIds }, active: true, date: { $gte: today } }).sort({ date: 1 }).limit(8)
        : [],
      kidIds.length
        ? Assignment.find({
            schoolId: { $in: schoolIds },
            active: true,
            status: { $ne: 'draft' },
            $or: [{ kidIds: { $in: kidIds } }, { kidIds: { $size: 0 }, grade: { $in: grades } }, { kidIds: { $exists: false }, grade: { $in: grades } }],
          }).limit(80)
        : [],
      kidIds.length ? AttendanceRecord.find({ kidId: { $in: kidIds }, date: today }) : [],
    ]);

    const tripIds = activeTrips.map((t) => t._id);
    const eventsToday = tripIds.length ? await TripEvent.find({ tripId: { $in: tripIds } }) : [];
    const checkIns = eventsToday.filter((e) => e.type === 'picked_up' && kidIds.some((id) => String(e.kidId) === String(id))).length;
    let pendingCheckouts = 0;
    for (const kid of kids) {
      const id = kid._id.toString();
      const picked = eventsToday.some((e) => String(e.kidId) === id && e.type === 'picked_up');
      const dropped = eventsToday.some((e) => String(e.kidId) === id && e.type === 'dropped_off');
      if (picked && !dropped) pendingCheckouts += 1;
      if (activeTrips.length && !picked && !dropped) pendingCheckouts += 1;
    }

    const featured = kids[0] || null;
    let progress = null;
    if (featured) {
      const schoolId = featured.schoolId?._id || featured.schoolId;
      const now = new Date();
      const term = schoolId
        ? await AcademicTerm.findOne({
            schoolId,
            active: true,
            startDate: { $lte: now },
            endDate: { $gte: now },
          }).sort({ startDate: -1 })
        : null;
      const from = term?.startDate || new Date(now.getFullYear(), now.getMonth() - 2, 1);
      const to = term?.endDate || now;
      const prevTerm = schoolId
        ? await AcademicTerm.findOne({
            schoolId,
            active: true,
            endDate: { $lt: from },
          }).sort({ endDate: -1 })
        : null;
      const [academic, behaviour, termMarks, prevAcademic] = await Promise.all([
        Assessment.find({ kidId: featured._id, active: true, kind: 'academic', date: { $gte: from, $lte: to } }),
        Assessment.find({ kidId: featured._id, active: true, kind: 'behaviour', date: { $gte: from, $lte: to } }),
        AttendanceRecord.find({ kidId: featured._id, date: { $gte: startOfDay(from), $lte: to } }),
        prevTerm
          ? Assessment.find({
              kidId: featured._id,
              active: true,
              kind: 'academic',
              date: { $gte: prevTerm.startDate, $lte: prevTerm.endDate },
            })
          : [],
      ]);
      const avg = academic.length
        ? Math.round(academic.reduce((s, r) => s + (r.score || 0), 0) / academic.length)
        : 0;
      const prevAvg = prevAcademic.length
        ? Math.round(prevAcademic.reduce((s, r) => s + (r.score || 0), 0) / prevAcademic.length)
        : 0;
      const present = termMarks.filter((m) => m.status === 'present').length;
      const attendancePct = termMarks.length ? Math.round((present / termMarks.length) * 100) : 0;
      const pendingAssignments = assignments.filter((a) => {
        if (a.kidIds?.length && !a.kidIds.some((id) => String(id) === String(featured._id))) return false;
        if (a.grade && featured.grade && a.grade !== featured.grade) return false;
        if (!a.dueDate) return true;
        return new Date(a.dueDate) >= today;
      }).length;
      const behaviourAvg = behaviour.length
        ? behaviour.reduce((s, r) => s + (r.score || 0), 0) / behaviour.length
        : 0;
      progress = {
        kidId: featured._id,
        kidName: featured.name,
        firstName: firstName(featured.name),
        averageScore: avg,
        attendancePct,
        pendingAssignments,
        behaviour: behaviour.length ? behaviourLabel(behaviourAvg) : 'Good',
        improvement: prevAvg ? avg - prevAvg : 0,
        term: term?.name || 'This term',
      };
    }

    const unread = notifications.filter((n) => n.read !== true).length;
    const mappedKids = kids.map((k, i) => ({
      _id: k._id,
      name: k.name,
      grade: k.grade || '',
      admissionNo: k.admissionNo || '',
      rollNo: k.house || `${i + 1}`,
      photoUrl: k.photoUrl || '',
      schoolId: k.schoolId,
      routeId: k.routeId,
      homeStopId: k.homeStopId,
    }));

    const holidayEvents = holidays.map((h) => ({
      _id: h._id,
      title: h.name,
      date: h.date,
      endDate: null,
      location: 'School',
      kind: 'holiday',
    }));
    const announcementEvents = announcements
      .filter((a) => a.kind === 'event' || a.category === 'events')
      .map((a) => ({
        _id: a._id,
        title: a.title,
        date: a.publishedAt || a.createdAt,
        endDate: null,
        location: a.audience || a.grade || 'School',
        kind: 'event',
      }));
    const events = [...holidayEvents, ...announcementEvents]
      .sort((a, b) => new Date(a.date) - new Date(b.date))
      .slice(0, 6);

    const active = activeTrips[0] || null;
    res.json({
      kids: mappedKids,
      featuredKidId: featured?._id || null,
      progress,
      summary: {
        tripsToday: activeTrips.length,
        checkIns,
        pendingCheckouts,
        unread,
      },
      activeTrip: active
        ? {
            _id: active._id,
            direction: active.direction,
            status: active.status,
            startedAt: active.startedAt,
            scheduledFor: active.scheduledFor,
            routeName: active.routeId?.name || '',
            driverName: active.driverId?.name || '',
            plate: active.busId?.plate || '',
          }
        : null,
      announcements: announcements.slice(0, 8).map((a) => ({
        _id: a._id,
        title: a.title,
        body: a.body,
        kind: a.kind || a.category || 'general',
        category: a.category || 'general',
        publishedAt: a.publishedAt || a.createdAt,
      })),
      events: events.length ? events : sampleEvents(),
      notifications: notifications.slice(0, 12),
      school: featured?.schoolId || null,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

function startOfDay(dateInput) {
  let d;
  if (!dateInput) d = new Date();
  else if (typeof dateInput === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(dateInput)) {
    const [y, m, day] = dateInput.split('-').map(Number);
    d = new Date(y, m - 1, day);
  } else d = new Date(dateInput);
  d.setHours(0, 0, 0, 0);
  return d;
}

function ymd(d) {
  const x = d instanceof Date ? d : new Date(d);
  return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}-${String(x.getDate()).padStart(2, '0')}`;
}

function monthRange(monthInput) {
  const raw = String(monthInput || '');
  const match = raw.match(/^(\d{4})-(\d{2})$/);
  const now = new Date();
  const year = match ? Number(match[1]) : now.getFullYear();
  const month = match ? Number(match[2]) - 1 : now.getMonth();
  const from = new Date(year, month, 1);
  from.setHours(0, 0, 0, 0);
  const to = new Date(year, month + 1, 0);
  to.setHours(23, 59, 59, 999);
  return { from, to };
}

function parentDiaryMatch(kids, schoolIds) {
  const kidIds = kids.map((k) => k._id);
  const grades = [...new Set(kids.map((k) => k.grade).filter(Boolean))];
  return {
    schoolId: { $in: schoolIds },
    active: true,
    private: { $ne: true },
    status: { $ne: 'draft' },
    $or: [
      { kidIds: { $in: kidIds } },
      {
        $and: [
          { $or: [{ kidIds: { $exists: false } }, { kidIds: { $size: 0 } }] },
          { grade: { $in: grades } },
        ],
      },
      {
        $and: [
          { $or: [{ kidIds: { $exists: false } }, { kidIds: { $size: 0 } }] },
          { $or: [{ grade: '' }, { grade: null }, { grade: { $exists: false } }] },
        ],
      },
    ],
  };
}

router.get('/school', async (req, res) => {
  try {
    const kids = await Kid.find({ parentIds: req.user.id, active: true });
    const kidIds = kids.map((k) => k._id);
    if (!kidIds.length) {
      return res.json({ attendance: [], assignments: [], notes: [], diary: [] });
    }

    const day = startOfDay(req.query.date);
    const schoolIds = [...new Set(kids.map((k) => k.schoolId?.toString()).filter(Boolean))];

    const [marks, assignments, notes, diary] = await Promise.all([
      AttendanceRecord.find({ kidId: { $in: kidIds }, date: day }).populate('kidId', 'name grade'),
      Assignment.find({ schoolId: { $in: schoolIds }, active: true, status: { $ne: 'draft' } })
        .populate('teacherId', 'name')
        .sort({ dueDate: 1, createdAt: -1 })
        .limit(80),
      TeacherNote.find({ kidId: { $in: kidIds } })
        .populate('kidId', 'name grade')
        .populate('teacherId', 'name')
        .sort({ createdAt: -1 })
        .limit(40),
      DiaryEntry.find({
        ...parentDiaryMatch(kids, schoolIds),
        date: day,
      })
        .populate('teacherId', 'name')
        .populate('kidIds', 'name grade')
        .sort({ createdAt: -1 })
        .limit(40),
    ]);

    const relevantAssignments = assignments.filter((a) => {
      if (a.kidIds?.length) {
        return a.kidIds.some((id) => kidIds.some((k) => k.toString() === id.toString()));
      }
      if (a.grade) return kids.some((k) => k.grade === a.grade);
      return true;
    });

    res.json({
      attendance: marks,
      assignments: relevantAssignments,
      notes,
      diary,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/diary', async (req, res) => {
  try {
    const kids = await Kid.find({ parentIds: req.user.id, active: true });
    if (!kids.length) return res.json({ entries: [], dates: [] });

    const schoolIds = [...new Set(kids.map((k) => k.schoolId?.toString()).filter(Boolean))];
    const match = parentDiaryMatch(kids, schoolIds);
    const { from, to } = monthRange(req.query.month || req.query.date);

    if (req.query.date) match.date = startOfDay(req.query.date);
    else match.date = { $gte: from, $lte: to };

    const [entries, monthEntries] = await Promise.all([
      DiaryEntry.find(match)
        .populate('teacherId', 'name')
        .populate('kidIds', 'name grade')
        .sort({ date: -1, createdAt: -1 })
        .limit(120),
      DiaryEntry.find({
        ...parentDiaryMatch(kids, schoolIds),
        date: { $gte: from, $lte: to },
      }).select('date'),
    ]);

    const dates = [...new Set(monthEntries.map((e) => ymd(e.date)))];
    res.json({ entries, dates });
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
      .populate('schoolId', 'name location address logoUrl')
      .populate('driverId', 'name phone')
      .populate('busId', 'plate label seats')
      .populate('kidIds');

    const enriched = await Promise.all(
      trips.map(async (trip) => {
        const myKids = kids.filter((k) =>
          trip.kidIds.some((tk) => tk._id?.toString() === k._id.toString() || tk.toString() === k._id.toString())
        );
        const [events, allStops, profile] = await Promise.all([
          // All trip events so parent live-nav can drop completed pickups for peer kids too
          TripEvent.find({ tripId: trip._id }),
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
      .populate('busId', 'plate label')
      .sort({ startedAt: -1 })
      .limit(50);
    res.json({ trips });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

function dayCountInclusive(start, end) {
  const s = new Date(start);
  s.setHours(0, 0, 0, 0);
  const e = new Date(end);
  e.setHours(0, 0, 0, 0);
  const ms = e.getTime() - s.getTime();
  if (Number.isNaN(ms) || ms < 0) return 0;
  return Math.floor(ms / (24 * 60 * 60 * 1000)) + 1;
}

async function assertParentKid(parentId, kidId) {
  return Kid.findOne({ _id: kidId, parentIds: parentId, active: true });
}

router.get('/leave-requests', async (req, res) => {
  try {
    const { kidId } = req.query;
    const kids = await Kid.find({ parentIds: req.user.id, active: true }).select('_id');
    const kidIds = kids.map((k) => k._id);
    const filter = { parentId: req.user.id, kidId: { $in: kidIds } };
    if (kidId) {
      if (!kidIds.some((id) => id.toString() === String(kidId))) {
        return res.status(403).json({ error: 'Child not linked to this parent' });
      }
      filter.kidId = kidId;
    }
    const requests = await LeaveRequest.find(filter)
      .populate('kidId', 'name grade house admissionNo photoUrl')
      .sort({ createdAt: -1 })
      .limit(100);
    res.json({
      requests: requests.map((r) => ({
        ...r.toObject(),
        days: dayCountInclusive(r.startDate, r.endDate),
      })),
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/leave-requests', async (req, res) => {
  try {
    const { kidId, leaveType, startDate, endDate, reason, notes, attachmentName, attachmentUrl, attachmentPublicId } =
      req.body || {};
    if (!kidId || !startDate || !endDate) {
      return res.status(400).json({ error: 'kidId, startDate and endDate are required' });
    }
    const kid = await assertParentKid(req.user.id, kidId);
    if (!kid) return res.status(404).json({ error: 'Child not found' });

    const start = new Date(startDate);
    const end = new Date(endDate);
    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || end < start) {
      return res.status(400).json({ error: 'Invalid date range' });
    }

    const created = await LeaveRequest.create({
      schoolId: kid.schoolId,
      kidId: kid._id,
      parentId: req.user.id,
      leaveType: ['vacation', 'sick', 'family', 'other'].includes(leaveType) ? leaveType : 'vacation',
      startDate: start,
      endDate: end,
      reason: typeof reason === 'string' ? reason.trim().slice(0, 250) : '',
      notes: typeof notes === 'string' ? notes.trim().slice(0, 500) : '',
      attachmentName: typeof attachmentName === 'string' ? attachmentName.slice(0, 120) : '',
      attachmentUrl: typeof attachmentUrl === 'string' ? attachmentUrl.slice(0, 500) : '',
      attachmentPublicId: typeof attachmentPublicId === 'string' ? attachmentPublicId.slice(0, 200) : '',
      status: 'pending',
    });

    res.status(201).json({
      request: { ...created.toObject(), days: dayCountInclusive(created.startDate, created.endDate) },
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/leave-requests/:id', async (req, res) => {
  try {
    const request = await LeaveRequest.findOne({
      _id: req.params.id,
      parentId: req.user.id,
    }).populate('kidId', 'name grade house admissionNo photoUrl');
    if (!request) return res.status(404).json({ error: 'Leave request not found' });
    res.json({
      request: { ...request.toObject(), days: dayCountInclusive(request.startDate, request.endDate) },
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.patch('/leave-requests/:id', async (req, res) => {
  try {
    const request = await LeaveRequest.findOne({
      _id: req.params.id,
      parentId: req.user.id,
    });
    if (!request) return res.status(404).json({ error: 'Leave request not found' });
    if (request.status !== 'pending') {
      return res.status(409).json({ error: 'Only pending requests can be edited' });
    }

    const { endDate, reason, notes, leaveType, attachmentName, attachmentUrl, attachmentPublicId } =
      req.body || {};
    if (endDate != null) {
      const end = new Date(endDate);
      if (Number.isNaN(end.getTime()) || end < request.startDate) {
        return res.status(400).json({ error: 'Invalid return date' });
      }
      request.endDate = end;
    }
    if (typeof reason === 'string') request.reason = reason.trim().slice(0, 250);
    if (typeof notes === 'string') request.notes = notes.trim().slice(0, 500);
    if (['vacation', 'sick', 'family', 'other'].includes(leaveType)) {
      request.leaveType = leaveType;
    }
    if (typeof attachmentName === 'string') request.attachmentName = attachmentName.slice(0, 120);
    if (typeof attachmentUrl === 'string') request.attachmentUrl = attachmentUrl.slice(0, 500);
    if (typeof attachmentPublicId === 'string') {
      request.attachmentPublicId = attachmentPublicId.slice(0, 200);
    }

    await request.save();
    res.json({
      request: { ...request.toObject(), days: dayCountInclusive(request.startDate, request.endDate) },
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/leave-requests/:id/cancel', async (req, res) => {
  try {
    const request = await LeaveRequest.findOne({
      _id: req.params.id,
      parentId: req.user.id,
    });
    if (!request) return res.status(404).json({ error: 'Leave request not found' });
    if (request.status !== 'pending') {
      return res.status(409).json({ error: 'Only pending requests can be cancelled' });
    }
    request.status = 'cancelled';
    await request.save();
    res.json({
      request: { ...request.toObject(), days: dayCountInclusive(request.startDate, request.endDate) },
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/announcements', async (req, res) => {
  try {
    const kids = await Kid.find({ parentIds: req.user.id, active: true }).select('schoolId grade');
    const schoolIds = [...new Set(kids.map((k) => k.schoolId?.toString()).filter(Boolean))];
    if (!schoolIds.length) return res.json({ announcements: [] });

    const { category, q } = req.query;
    const grades = [...new Set(kids.map((k) => k.grade).filter(Boolean))];
    const filter = {
      schoolId: { $in: schoolIds },
      active: true,
      archived: { $ne: true },
      $and: [
        {
          $or: [
            { scope: { $ne: 'class' } },
            { scope: 'class', grade: { $in: grades } },
            { category: 'class', grade: { $in: grades } },
          ],
        },
      ],
    };
    if (category && category !== 'all') filter.category = category;
    if (q && String(q).trim()) {
      const rx = new RegExp(String(q).trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
      filter.$and.push({ $or: [{ title: rx }, { body: rx }] });
    }

    const announcements = await Announcement.find(filter).sort({ publishedAt: -1 }).limit(100);
    res.json({ announcements });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/announcements/:id', async (req, res) => {
  try {
    const kids = await Kid.find({ parentIds: req.user.id, active: true }).select('schoolId');
    const schoolIds = new Set(kids.map((k) => k.schoolId?.toString()).filter(Boolean));
    const announcement = await Announcement.findById(req.params.id);
    if (!announcement || !announcement.active || announcement.archived) {
      return res.status(404).json({ error: 'Announcement not found' });
    }
    if (!schoolIds.has(announcement.schoolId.toString())) {
      return res.status(403).json({ error: 'Not allowed' });
    }
    res.json({ announcement });
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

function dayBounds(d = new Date()) {
  const start = new Date(d);
  start.setHours(0, 0, 0, 0);
  const end = new Date(d);
  end.setHours(23, 59, 59, 999);
  return { start, end };
}

/** Parent requests a late pickup — notifies the assigned driver. */
router.post('/late-pickup-request', async (req, res) => {
  try {
    const { kidId, message, tripId } = req.body || {};
    if (!kidId) return res.status(400).json({ error: 'kidId is required' });

    const kid = await Kid.findOne({ _id: kidId, parentIds: req.user.id, active: true });
    if (!kid) return res.status(404).json({ error: 'Child not found' });

    const parent = await User.findById(req.user.id).select('name phone');
    const note = typeof message === 'string' ? message.trim().slice(0, 280) : '';

    let trip = null;
    if (tripId) {
      trip = await Trip.findOne({
        _id: tripId,
        kidIds: kid._id,
        status: { $in: ['scheduled', 'active'] },
      });
    }
    if (!trip) {
      trip = await Trip.findOne({
        kidIds: kid._id,
        status: 'active',
      }).sort({ startedAt: -1 });
    }
    if (!trip) {
      const { start, end } = dayBounds();
      trip = await Trip.findOne({
        kidIds: kid._id,
        status: 'scheduled',
        $or: [
          { serviceDate: { $gte: start, $lte: end } },
          { scheduledFor: { $gte: start, $lte: end } },
        ],
      }).sort({ sequence: 1, scheduledFor: 1 });
    }
    if (!trip?.driverId) {
      return res.status(409).json({
        error: 'No driver trip found for this child yet. Try again when a trip is scheduled or active.',
      });
    }

    const recent = await Notification.findOne({
      userId: trip.driverId,
      kidId: kid._id,
      type: NOTIFICATION_TYPES.LATE_PICKUP_REQUEST,
      createdAt: { $gte: new Date(Date.now() - 2 * 60 * 1000) },
    });
    if (recent) {
      return res.status(429).json({
        error: 'Late pickup already requested a moment ago. Please wait before sending again.',
      });
    }

    const parentName = parent?.name || 'A parent';
    const bodyParts = [
      `${parentName} requests a late pickup for ${kid.name}.`,
      note ? `Note: ${note}` : null,
      parent?.phone ? `Phone: ${parent.phone}` : null,
    ].filter(Boolean);

    const [created] = await createAndEmitNotifications(getIO(), [
      {
        userId: trip.driverId,
        type: NOTIFICATION_TYPES.LATE_PICKUP_REQUEST,
        title: 'Late pickup request',
        body: bodyParts.join(' '),
        tripId: trip._id,
        kidId: kid._id,
      },
    ]);

    res.status(201).json({
      ok: true,
      notification: created
        ? {
            id: created._id.toString(),
            title: created.title,
            body: created.body,
          }
        : null,
    });
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
