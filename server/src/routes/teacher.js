import { Router } from 'express';
import {
  User,
  Kid,
  School,
  AttendanceRecord,
  Assignment,
  TeacherNote,
  DiaryEntry,
  Conversation,
  Message,
  Announcement,
  SchoolHoliday,
  Assessment,
  SchoolClass,
  AcademicTerm,
  Notification,
  LessonPlan,
  TeachingResource,
  SchoolOuting,
} from '../models/index.js';
import { authenticate, requireRole } from '../middleware/auth.js';
import { createAndEmitNotifications, emitChatMessage, NOTIFICATION_TYPES } from '../services/notifications.js';
import { getIO } from '../socket.js';
import { formatClock } from '../lib/clock.js';
import { DIARY_LABELS, diaryTypeMeta, diaryNotifyCopy, diaryCalendarDate, diaryCalendarRange, normalizeDiaryCommentMedia, serializeDiaryCommentMedia } from '../lib/diary.js';
import { classAnnouncementVisibleOr } from '../lib/announcements.js';

const router = Router();
router.use(authenticate, requireRole('teacher'));

const ATTENDANCE_STATUSES = ['present', 'absent', 'late', 'excused'];
const NOTE_CATEGORIES = ['general', 'academic', 'behaviour', 'health', 'urgent'];
const MAX_DIARY_MEDIA = 8;
const MAX_ASSIGNMENT_MEDIA = 8;

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

function endOfDay(dateInput) {
  const d = startOfDay(dateInput);
  d.setHours(23, 59, 59, 999);
  return d;
}

async function teacherContext(req) {
  const teacher = await User.findById(req.user.id);
  return { teacher, schoolId: teacher?.schoolId || null };
}

async function schoolKids(schoolId, { grade } = {}) {
  const filter = { schoolId, active: true };
  if (grade) filter.grade = grade;
  return Kid.find(filter)
    .populate('parentIds', 'name phone email')
    .sort({ grade: 1, name: 1 });
}

async function notifyParents(kid, { type, title, body }) {
  const items = (kid.parentIds || []).map((parent) => ({
    userId: parent._id || parent,
    type,
    title,
    body,
    kidId: kid._id,
  }));
  if (!items.length) return [];
  return createAndEmitNotifications(getIO(), items);
}

function populateKids(q) {
  return q.populate('parentIds', 'name phone email');
}

router.get('/overview', async (req, res) => {
  try {
    const { teacher, schoolId } = await teacherContext(req);
    if (!schoolId) {
      return res.json({
        school: null,
        teacher: teacher?.toSafeJSON?.() || null,
        stats: { students: 0, markedToday: 0, present: 0, absent: 0, late: 0, assignments: 0, classes: 0, subjects: 0 },
        unmarked: [],
        recentNotes: [],
        assignments: [],
      });
    }

    const day = startOfDay(req.query.date);
    const [school, kids, marks, assignments, recentNotes, subjects] = await Promise.all([
      School.findById(schoolId),
      schoolKids(schoolId),
      AttendanceRecord.find({ schoolId, date: day }),
      Assignment.find({ schoolId, teacherId: req.user.id, active: true })
        .sort({ dueDate: 1, createdAt: -1 })
        .limit(8),
      TeacherNote.find({ schoolId, teacherId: req.user.id })
        .populate('kidId', 'name grade')
        .sort({ createdAt: -1 })
        .limit(8),
      Assignment.distinct('subject', { schoolId, teacherId: req.user.id, active: true }),
    ]);

    const byKid = Object.fromEntries(marks.map((m) => [m.kidId.toString(), m]));
    const unmarked = kids.filter((k) => !byKid[k._id.toString()]);
    const present = marks.filter((m) => m.status === 'present').length;
    const absent = marks.filter((m) => m.status === 'absent').length;
    const late = marks.filter((m) => m.status === 'late').length;
    const grades = [...new Set(kids.map((k) => k.grade).filter(Boolean))].sort();

    res.json({
      school,
      teacher: teacher?.toSafeJSON?.() || null,
      grades,
      stats: {
        students: kids.length,
        markedToday: marks.length,
        unmarked: unmarked.length,
        present,
        absent,
        late,
        assignments: assignments.length,
        classes: grades.length,
        subjects: (subjects || []).filter(Boolean).length,
      },
      unmarked: unmarked.slice(0, 12).map((k) => ({
        _id: k._id,
        name: k.name,
        grade: k.grade,
        photoUrl: k.photoUrl || '',
      })),
      recentNotes,
      assignments,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

function applyTeacherProfileDefaults(teacher) {
  let changed = false;
  if (!teacher.jobTitle) {
    teacher.jobTitle = 'Class Teacher';
    changed = true;
  }
  if (!teacher.language) {
    teacher.language = 'English';
    changed = true;
  }
  if (!teacher.theme) {
    teacher.theme = 'system';
    changed = true;
  }
  if (!teacher.nationality) {
    teacher.nationality = 'Kenyan';
    changed = true;
  }
  if (!teacher.aboutMe) {
    teacher.aboutMe =
      'Passionate educator with experience in primary education. I love inspiring young minds and helping them reach their full potential. Dedicated to creating a positive and inclusive learning environment.';
    changed = true;
  }
  if (!teacher.yearsOfService) {
    const created = teacher.createdAt ? new Date(teacher.createdAt) : new Date();
    const years = Math.max(1, Math.floor((Date.now() - created.getTime()) / (365.25 * 24 * 60 * 60 * 1000)));
    teacher.yearsOfService = years;
    changed = true;
  }
  return changed;
}

router.get('/profile', async (req, res) => {
  try {
    const { teacher, schoolId } = await teacherContext(req);
    if (!teacher) return res.status(404).json({ error: 'Teacher not found' });
    if (applyTeacherProfileDefaults(teacher)) await teacher.save();

    let school = null;
    let students = 0;
    let classes = 0;
    if (schoolId) {
      const [schoolDoc, kids] = await Promise.all([
        School.findById(schoolId),
        Kid.find({ schoolId, active: true }).select('grade'),
      ]);
      school = schoolDoc;
      students = kids.length;
      classes = [...new Set(kids.map((k) => k.grade).filter(Boolean))].length;
    }

    res.json({
      teacher: teacher.toSafeJSON(),
      school,
      stats: {
        classes,
        students,
        yearsOfService: teacher.yearsOfService || 0,
        role: teacher.jobTitle || 'Teacher',
      },
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

function notificationCategory(type) {
  switch (type) {
    case 'announcement':
      return 'announcement';
    case 'teacher_note':
    case 'message':
      return 'message';
    case 'reminder':
    case 'assignment':
    case 'attendance_alert':
    case 'diary':
      return 'reminder';
    default:
      return 'system';
  }
}

async function upsertTeacherNotification(userId, key, payload) {
  const existing = await Notification.findOne({ userId, key });
  if (existing) return existing;
  try {
    return await Notification.create({ userId, key, ...payload });
  } catch (err) {
    if (err?.code === 11000) return Notification.findOne({ userId, key });
    throw err;
  }
}

async function syncTeacherNotifications(req, schoolId) {
  const userId = req.user.id;
  const today = startOfDay();
  const dayKey = ymd(today);

  const announcements = await Announcement.find({
    schoolId,
    active: true,
    publishedAt: { $gte: new Date(Date.now() - 60 * 24 * 60 * 60 * 1000) },
  })
    .sort({ publishedAt: -1 })
    .limit(20);

  for (const a of announcements) {
    await upsertTeacherNotification(userId, `announcement:${a._id}`, {
      type: NOTIFICATION_TYPES.ANNOUNCEMENT,
      title: a.title,
      body: String(a.body || '').slice(0, 400),
      link: 'announcements',
      createdAt: a.publishedAt || a.createdAt,
    });
  }

  const kids = await Kid.find({ schoolId, active: true }).select('_id grade');
  const marks = await AttendanceRecord.find({
    schoolId,
    date: today,
    kidId: { $in: kids.map((k) => k._id) },
  }).select('kidId');
  const marked = new Set(marks.map((m) => m.kidId.toString()));
  const unmarkedCount = kids.filter((k) => !marked.has(k._id.toString())).length;
  if (unmarkedCount > 0) {
    await upsertTeacherNotification(userId, `reminder:register:${dayKey}`, {
      type: NOTIFICATION_TYPES.REMINDER,
      title: 'Register still open',
      body: `${unmarkedCount} student${unmarkedCount === 1 ? '' : 's'} still need attendance marked today.`,
      link: 'register',
    });
  }

  const diaryToday = await DiaryEntry.countDocuments({
    schoolId,
    teacherId: userId,
    date: today,
    active: true,
    status: { $ne: 'draft' },
  });
  if (!diaryToday) {
    await upsertTeacherNotification(userId, `reminder:diary:${dayKey}`, {
      type: NOTIFICATION_TYPES.REMINDER,
      title: 'Diary Entry Due',
      body: 'You have classes pending diary entries for today.',
      link: 'diary',
    });
  }

  const soon = new Date(today);
  soon.setDate(soon.getDate() + 1);
  soon.setHours(23, 59, 59, 999);
  const dueWork = await Assignment.find({
    schoolId,
    teacherId: userId,
    active: true,
    status: { $ne: 'draft' },
    dueDate: { $gte: today, $lte: soon },
  }).limit(8);
  for (const a of dueWork) {
    const due = a.dueDate ? ` due ${a.dueDate.toLocaleDateString()}` : ' due soon';
    await upsertTeacherNotification(userId, `reminder:assignment:${a._id}`, {
      type: NOTIFICATION_TYPES.REMINDER,
      title: 'Assignment Due Soon',
      body: `“${a.title}” is${due}${a.grade ? ` for ${a.grade}` : ''}.`,
      link: 'work',
    });
  }

  const holidayTo = new Date(today);
  holidayTo.setDate(holidayTo.getDate() + 21);
  const holidays = await SchoolHoliday.find({
    schoolId,
    active: true,
    date: { $gte: today, $lte: holidayTo },
  }).limit(8);
  for (const h of holidays) {
    const when = h.date ? h.date.toLocaleDateString() : 'soon';
    await upsertTeacherNotification(userId, `announcement:holiday:${h._id}`, {
      type: NOTIFICATION_TYPES.ANNOUNCEMENT,
      title: 'Holiday Announcement',
      body: `School will be closed on ${when} for ${h.name}.`,
      link: 'announcements',
      createdAt: h.createdAt || h.date,
    });
  }

  await upsertTeacherNotification(userId, 'system:app', {
    type: NOTIFICATION_TYPES.SYSTEM,
    title: 'System Update',
    body: 'A new update has been released. Please update your app for better performance.',
    link: '',
  });
}

function serializeTeacherNotification(n) {
  const type = n.type;
  return {
    _id: n._id,
    type,
    category: notificationCategory(type),
    title: n.title,
    body: n.body,
    read: n.read === true,
    link: n.link || '',
    kidId: n.kidId || null,
    createdAt: n.createdAt instanceof Date ? n.createdAt.toISOString() : n.createdAt,
  };
}

router.get('/notifications', async (req, res) => {
  try {
    const { schoolId } = await teacherContext(req);
    if (schoolId) await syncTeacherNotifications(req, schoolId);
    const filter = { userId: req.user.id };
    const rows = await Notification.find(filter).sort({ createdAt: -1 }).limit(120);
    const notifications = rows.map(serializeTeacherNotification);
    const counts = {
      all: notifications.length,
      announcement: notifications.filter((n) => n.category === 'announcement').length,
      message: notifications.filter((n) => n.category === 'message').length,
      reminder: notifications.filter((n) => n.category === 'reminder').length,
      system: notifications.filter((n) => n.category === 'system').length,
      unread: notifications.filter((n) => !n.read).length,
    };
    res.json({ notifications, counts });
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

router.post('/notifications/:id/read', async (req, res) => {
  try {
    const item = await Notification.findOneAndUpdate(
      { _id: req.params.id, userId: req.user.id },
      { $set: { read: true } },
      { new: true }
    );
    if (!item) return res.status(404).json({ error: 'Notification not found' });
    res.json({ notification: serializeTeacherNotification(item) });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

const ANNOUNCEMENT_KINDS = ['important', 'general', 'information', 'event', 'reminder'];

function kindFromCategory(category) {
  switch (category) {
    case 'urgent':
      return 'important';
    case 'events':
      return 'event';
    case 'transport':
      return 'information';
    default:
      return 'general';
  }
}

function categoryFromKind(kind) {
  switch (kind) {
    case 'important':
      return 'urgent';
    case 'event':
      return 'events';
    case 'information':
      return 'class';
    default:
      return 'general';
  }
}

function announcementKind(a) {
  if (ANNOUNCEMENT_KINDS.includes(a.kind)) return a.kind;
  return kindFromCategory(a.category);
}

function announcementAudience(a) {
  if (a.audience) return a.audience;
  if ((a.scope === 'class' || a.category === 'class') && a.grade) return a.grade;
  return 'All Teachers, Parents & Students';
}

function iconFromKind(kind, icon) {
  if (icon) return icon;
  switch (kind) {
    case 'important':
      return 'megaphone';
    case 'information':
      return 'book';
    case 'event':
      return 'trophy';
    case 'reminder':
      return 'warning';
    default:
      return 'calendar';
  }
}

function daysAgo(days, hours, minutes) {
  const d = new Date();
  d.setDate(d.getDate() - days);
  d.setHours(hours, minutes, 0, 0);
  return d;
}

function daysFromNow(days, hours = 9, minutes = 0) {
  const d = new Date();
  d.setDate(d.getDate() + days);
  d.setHours(hours, minutes, 0, 0);
  return d;
}

async function ensureSchoolAnnouncements(schoolId) {
  const samples = [
    {
      sourceKey: 'sample:term2-notice',
      title: 'End of Term 2 Notice',
      body: 'Please note that Term 2 will end on Friday, 25th October 2026. Students are expected to complete all pending assignments before the end of the term.',
      kind: 'important',
      icon: 'megaphone',
      audience: 'All Teachers, Parents & Students',
      publishedAt: daysAgo(0, 9, 30),
    },
    {
      sourceKey: 'sample:ptm',
      title: 'Parent-Teacher Meeting',
      body: 'The parent-teacher meeting will be held this week. Kindly confirm your time slot with the class teacher and arrive 10 minutes early.',
      kind: 'general',
      icon: 'calendar',
      audience: 'Parents',
      publishedAt: daysAgo(1, 16, 15),
    },
    {
      sourceKey: 'sample:library',
      title: 'New Library Books Available',
      body: 'New storybooks and reference titles have been added to the school library. Students may borrow them during library hours this week.',
      kind: 'information',
      icon: 'book',
      audience: 'Students',
      publishedAt: daysAgo(2, 11, 20),
    },
    {
      sourceKey: 'sample:quiz',
      title: 'Inter-Class Quiz Competition',
      body: 'Grade 4A will take part in the inter-class quiz on Friday. Please help learners revise science and current affairs topics.',
      kind: 'event',
      icon: 'trophy',
      audience: 'Grade 4A',
      grade: 'Grade 4A',
      publishedAt: daysAgo(3, 14, 45),
    },
    {
      sourceKey: 'sample:uniform',
      title: 'School Uniform Reminder',
      body: 'All learners should wear the complete school uniform, including the correct shoes and sweater, from Monday next week.',
      kind: 'reminder',
      icon: 'warning',
      audience: 'Parents & Students',
      publishedAt: daysAgo(4, 8, 0),
    },
    {
      sourceKey: 'sample:trip',
      title: 'School Trip - Wildlife Park',
      body: 'Grade 4 will visit the wildlife park this term. Consent forms and trip fees should be returned to the class teacher by Friday.',
      kind: 'event',
      icon: 'bus',
      audience: 'Grade 4',
      grade: 'Grade 4',
      publishedAt: daysAgo(6, 10, 10),
    },
  ];

  for (const sample of samples) {
    const existing = await Announcement.findOne({ schoolId, sourceKey: sample.sourceKey });
    if (existing) continue;
    try {
      await Announcement.create({
        schoolId,
        scope: 'school',
        category: categoryFromKind(sample.kind),
        authorName: 'School Admin',
        ...sample,
      });
    } catch (err) {
      if (err?.code !== 11000) throw err;
    }
  }
}

function serializeAnnouncement(a, userId) {
  const teacherId = a.teacherId?.toString?.() || a.teacherId || '';
  const kind = announcementKind(a);
  return {
    _id: a._id,
    title: a.title,
    body: a.body,
    kind,
    category: a.category || 'general',
    scope: a.scope === 'class' || a.category === 'class' ? 'class' : 'school',
    grade: a.grade || '',
    audience: announcementAudience(a),
    icon: iconFromKind(kind, a.icon),
    authorName: a.authorName || 'Admin',
    teacherId,
    mine: Boolean(userId && teacherId && teacherId === String(userId)),
    archived: a.archived === true,
    attachmentUrl: a.attachmentUrl || '',
    attachmentName: a.attachmentName || '',
    publishedAt: a.publishedAt || a.createdAt,
    createdAt: a.createdAt,
  };
}

async function notifyAnnouncementParents(schoolId, { grade, title, body, kidId }) {
  const filter = { schoolId, active: true };
  if (grade) filter.grade = grade;
  const kids = await populateKids(Kid.find(filter));
  const items = [];
  for (const kid of kids) {
    if (kidId && kid._id.toString() !== String(kidId)) continue;
    for (const parent of kid.parentIds || []) {
      items.push({
        userId: parent._id || parent,
        type: NOTIFICATION_TYPES.ANNOUNCEMENT,
        title,
        body: `${kid.name}${grade ? ` (${grade})` : ''} — ${body}`.slice(0, 400),
        kidId: kid._id,
      });
    }
  }
  if (items.length) await createAndEmitNotifications(getIO(), items);
  return items.length;
}

router.get('/announcements', async (req, res) => {
  try {
    const { schoolId } = await teacherContext(req);
    if (!schoolId) return res.json({ announcements: [], important: [], grades: [] });
    const kids = await Kid.find({ schoolId, active: true }).select('grade');
    const grades = [...new Set(kids.map((k) => k.grade).filter(Boolean))].sort();
    const archived = req.query.archived === '1' || req.query.archived === 'true';
    const filter = {
      schoolId,
      active: true,
      archived: archived ? true : { $ne: true },
      sourceKey: { $not: /^sample:/ },
      $or: [
        { scope: 'class', teacherId: req.user.id },
        ...classAnnouncementVisibleOr(grades),
      ],
    };
    if (req.query.scope === 'school' || req.query.scope === 'class') filter.scope = req.query.scope;
    if (ANNOUNCEMENT_KINDS.includes(req.query.kind)) filter.kind = req.query.kind;
    if (req.query.q && String(req.query.q).trim()) {
      const rx = new RegExp(String(req.query.q).trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
      filter.$and = [{ $or: [{ title: rx }, { body: rx }] }];
    }
    const rows = await Announcement.find(filter).sort({ publishedAt: -1, createdAt: -1 }).limit(200);
    const announcements = rows.map((a) => serializeAnnouncement(a, req.user.id));
    res.json({
      announcements,
      important: announcements.filter((a) => a.kind === 'important'),
      grades,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/announcements/important', async (req, res) => {
  try {
    const { schoolId } = await teacherContext(req);
    if (!schoolId) return res.json({ announcements: [] });
    const rows = await Announcement.find({
      schoolId,
      active: true,
      archived: { $ne: true },
      sourceKey: { $not: /^sample:/ },
      kind: 'important',
    })
      .sort({ publishedAt: -1 })
      .limit(20);
    res.json({ announcements: rows.map((a) => serializeAnnouncement(a, req.user.id)) });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/announcements', async (req, res) => {
  try {
    const { schoolId, teacher } = await teacherContext(req);
    if (!schoolId) return res.status(400).json({ error: 'No school assigned to this teacher' });
    const title = String(req.body?.title || '').trim();
    const body = String(req.body?.body || '').trim();
    if (!title || !body) return res.status(400).json({ error: 'title and body are required' });
    const kind = ANNOUNCEMENT_KINDS.includes(req.body?.kind) ? req.body.kind : 'general';
    const grade = String(req.body?.grade || '').trim();
    if (!grade) return res.status(400).json({ error: 'grade is required' });
    const announcement = await Announcement.create({
      schoolId,
      teacherId: req.user.id,
      title: title.slice(0, 160),
      body: body.slice(0, 4000),
      kind,
      icon: iconFromKind(kind, String(req.body?.icon || '').trim()),
      category: categoryFromKind(kind),
      scope: 'class',
      grade,
      grades: [grade],
      audience: String(req.body?.audience || grade).trim().slice(0, 120),
      authorName: teacher?.name || 'Teacher',
      attachmentName: req.body?.attachmentName || '',
      attachmentUrl: req.body?.attachmentUrl || '',
      attachmentPublicId: req.body?.attachmentPublicId || '',
      publishedAt: new Date(),
    });
    await notifyAnnouncementParents(schoolId, { grade, title: announcement.title, body: announcement.body });
    await upsertTeacherNotification(req.user.id, `announcement:${announcement._id}`, {
      type: NOTIFICATION_TYPES.ANNOUNCEMENT,
      title: announcement.title,
      body: String(announcement.body || '').slice(0, 400),
      link: 'announcements',
    });
    res.status(201).json({ announcement: serializeAnnouncement(announcement, req.user.id) });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.put('/announcements/:id', async (req, res) => {
  try {
    const { schoolId } = await teacherContext(req);
    const item = await Announcement.findOne({ _id: req.params.id, schoolId, teacherId: req.user.id, active: true });
    if (!item) return res.status(404).json({ error: 'Announcement not found' });
    if (req.body?.title !== undefined) item.title = String(req.body.title || '').trim().slice(0, 160);
    if (req.body?.body !== undefined) item.body = String(req.body.body || '').trim().slice(0, 4000);
    if (ANNOUNCEMENT_KINDS.includes(req.body?.kind)) {
      item.kind = req.body.kind;
      item.category = categoryFromKind(req.body.kind);
    }
    if (req.body?.grade !== undefined) {
      item.grade = String(req.body.grade || '').trim();
      item.grades = item.grade ? [item.grade] : [];
    }
    if (req.body?.audience !== undefined) item.audience = String(req.body.audience || '').trim().slice(0, 120);
    if (req.body?.icon !== undefined) item.icon = iconFromKind(item.kind, String(req.body.icon || '').trim());
    if (!item.title || !item.body) return res.status(400).json({ error: 'title and body are required' });
    await item.save();
    res.json({ announcement: serializeAnnouncement(item, req.user.id) });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.post('/announcements/:id/archive', async (req, res) => {
  try {
    const { schoolId } = await teacherContext(req);
    const item = await Announcement.findOne({ _id: req.params.id, schoolId, teacherId: req.user.id, active: true });
    if (!item) return res.status(404).json({ error: 'Announcement not found' });
    item.archived = req.body?.archived === false ? false : true;
    await item.save();
    res.json({ announcement: serializeAnnouncement(item, req.user.id) });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.get('/kids', async (req, res) => {
  try {
    const { schoolId } = await teacherContext(req);
    if (!schoolId) return res.json({ kids: [], grades: [] });
    const kids = await schoolKids(schoolId, { grade: req.query.grade || undefined });
    const grades = [...new Set(kids.map((k) => k.grade).filter(Boolean))].sort();
    res.json({ kids, grades });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/kids', async (req, res) => {
  try {
    const { schoolId } = await teacherContext(req);
    if (!schoolId) return res.status(400).json({ error: 'No school assigned to this teacher' });

    const name = String(req.body?.name || '').trim();
    if (!name) return res.status(400).json({ error: 'name is required' });

    const kid = await Kid.create({
      schoolId,
      name,
      grade: String(req.body?.grade || '').trim(),
      admissionNo: String(req.body?.admissionNo || '').trim(),
      gender: ['male', 'female', 'other'].includes(req.body?.gender) ? req.body.gender : '',
      dateOfBirth: req.body?.dateOfBirth ? startOfDay(req.body.dateOfBirth) : null,
      about: String(req.body?.about || '').trim().slice(0, 800),
    });
    const populated = await populateKids(Kid.findById(kid._id));
    res.status(201).json({ kid: populated });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

function classCodeFromGrade(grade, year) {
  const compact = String(grade || '')
    .replace(/grade\s*/i, '')
    .replace(/\s+/g, '')
    .toUpperCase();
  return `G${compact || 'CLASS'}-${year}`;
}

function parseSection(grade) {
  const m = String(grade || '').trim().match(/([A-Z])$/i);
  return m ? m[1].toUpperCase() : '';
}

function parseGradeLevel(grade) {
  return String(grade || '')
    .trim()
    .replace(/\s*[A-Z]$/i, '')
    .trim() || String(grade || '');
}

const TIMETABLE_DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'];
const DEFAULT_PERIODS = [
  { startTime: '07:30', endTime: '08:15', periodLabel: 'Period 1', kind: 'lesson' },
  { startTime: '08:15', endTime: '09:00', periodLabel: 'Period 2', kind: 'lesson' },
  { startTime: '09:00', endTime: '09:30', periodLabel: 'Break', kind: 'break' },
  { startTime: '09:30', endTime: '10:15', periodLabel: 'Period 3', kind: 'lesson' },
  { startTime: '10:15', endTime: '11:00', periodLabel: 'Period 4', kind: 'lesson' },
  { startTime: '11:00', endTime: '11:45', periodLabel: 'Period 5', kind: 'lesson' },
  { startTime: '11:45', endTime: '12:30', periodLabel: 'Period 6', kind: 'lesson' },
  { startTime: '12:30', endTime: '13:15', periodLabel: 'Lunch', kind: 'lunch' },
  { startTime: '13:15', endTime: '14:00', periodLabel: 'Period 7', kind: 'lesson' },
  { startTime: '14:00', endTime: '14:45', periodLabel: 'Period 8', kind: 'lesson' },
];
const WEEKLY_SUBJECTS = {
  Monday: ['Mathematics', 'English', 'Science', 'Kiswahili', 'Social Studies', 'P.E', 'Art & Craft', 'Computer Studies'],
  Tuesday: ['English', 'Mathematics', 'Kiswahili', 'Science', 'Library', 'Social Studies', 'Computer Studies', 'Guidance & Counseling'],
  Wednesday: ['Science', 'Kiswahili', 'Mathematics', 'English', 'P.E', 'Art & Craft', 'Social Studies', 'Club Activity'],
  Thursday: ['Mathematics', 'Science', 'English', 'Social Studies', 'Kiswahili', 'Computer Studies', 'Library', 'P.E'],
  Friday: ['Kiswahili', 'English', 'Mathematics', 'Science', 'Club Activity', 'Social Studies', 'Art & Craft', 'Guidance & Counseling'],
};

function roomForSubject(subject, classroom) {
  const key = String(subject || '').toLowerCase();
  if (key.includes('p.e') || key === 'pe' || key.includes('physical')) return 'Playground';
  if (key.includes('art')) return 'Art Room';
  if (key.includes('computer')) return 'Computer Lab';
  if (key.includes('library')) return 'Library';
  if (key.includes('guidance')) return 'Room 8';
  if (key.includes('club')) return 'Room 7';
  return classroom || 'Room 12';
}

function defaultWeeklyTimetable(classroom = 'Room 12') {
  const slots = [];
  for (const day of TIMETABLE_DAYS) {
    let lessonIndex = 0;
    for (const period of DEFAULT_PERIODS) {
      if (period.kind !== 'lesson') {
        slots.push({
          day,
          startTime: period.startTime,
          endTime: period.endTime,
          subject: period.periodLabel,
          room: '',
          kind: period.kind,
          periodLabel: period.periodLabel,
        });
        continue;
      }
      const subject = (WEEKLY_SUBJECTS[day] || [])[lessonIndex] || 'Lesson';
      lessonIndex += 1;
      slots.push({
        day,
        startTime: period.startTime,
        endTime: period.endTime,
        subject,
        room: roomForSubject(subject, classroom),
        kind: 'lesson',
        periodLabel: period.periodLabel,
      });
    }
  }
  return slots;
}

function mondayOf(dateInput) {
  const d = startOfDay(dateInput);
  const day = d.getDay();
  d.setDate(d.getDate() + (day === 0 ? -6 : 1 - day));
  return d;
}

async function ensureAcademicTerms(schoolId) {
  const year = new Date().getFullYear();
  let terms = await AcademicTerm.find({ schoolId, year, active: true }).sort({ startDate: 1 });
  if (terms.length) return terms;
  const specs = [
    { name: 'Academic Term 1', start: [year, 0, 12], end: [year, 3, 10] },
    { name: 'Academic Term 2', start: [year, 4, 4], end: [year, 7, 21] },
    { name: 'Academic Term 3', start: [year, 8, 1], end: [year, 10, 20] },
  ];
  terms = await AcademicTerm.insertMany(
    specs.map((s) => ({
      schoolId,
      year,
      name: s.name,
      startDate: new Date(s.start[0], s.start[1], s.start[2]),
      endDate: new Date(s.end[0], s.end[1], s.end[2], 23, 59, 59, 999),
    }))
  );
  return terms;
}

async function currentAcademicTerm(schoolId, dateInput) {
  const terms = await ensureAcademicTerms(schoolId);
  const day = startOfDay(dateInput);
  return terms.find((t) => day >= startOfDay(t.startDate) && day <= endOfDay(t.endDate)) || terms[terms.length - 1] || null;
}

async function ensureClassTimetable(klass) {
  let changed = false;
  if (!klass.timetable?.length) {
    klass.timetable = defaultWeeklyTimetable(klass.classroom || 'Room 12');
    changed = true;
  }
  if (!klass.timetableNotes?.length) {
    klass.timetableNotes = [
      'Timetable is subject to change. Any updates will be communicated.',
      'Please ensure you arrive in class 5 minutes before each period.',
    ];
    changed = true;
  }
  if (changed) await klass.save();
  return klass;
}

async function ensureSchoolClass(schoolId, grade, teacher) {
  const year = String(new Date().getFullYear());
  let doc = await SchoolClass.findOne({ schoolId, grade, active: true });
  if (doc) return doc;
  return SchoolClass.create({
    schoolId,
    grade,
    classCode: classCodeFromGrade(grade, year),
    academicYear: year,
    section: parseSection(grade),
    teacherId: teacher?._id || null,
    assistantName: '',
    capacity: 30,
    classroom: '',
    description: '',
    subjects: [],
    timetable: defaultWeeklyTimetable('Room 12'),
    timetableNotes: [
      'Timetable is subject to change. Any updates will be communicated.',
      'Please ensure you arrive in class 5 minutes before each period.',
    ],
    notes: [],
  });
}

async function classDetailPayload(schoolId, grade, teacher) {
  const kids = await schoolKids(schoolId, { grade });
  const school = await School.findById(schoolId);
  const klass = await ensureClassTimetable(await ensureSchoolClass(schoolId, grade, teacher));
  const kidIds = kids.map((k) => k._id);
  const { from, to } = profileRange('term');
  const month = profileRange('month');
  const today = startOfDay();

  const [marksToday, monthMarks, assessments, diaryLessons, assignments, derivedSubjects] = await Promise.all([
    AttendanceRecord.find({ schoolId, date: today, kidId: { $in: kidIds } }),
    AttendanceRecord.find({ schoolId, kidId: { $in: kidIds }, date: { $gte: month.from, $lte: month.to } }),
    Assessment.find({ schoolId, kidId: { $in: kidIds }, active: true, date: { $gte: from, $lte: to } }),
    DiaryEntry.countDocuments({
      schoolId,
      active: true,
      status: { $ne: 'draft' },
      grade,
      date: { $gte: from, $lte: to },
      label: { $in: ['lesson', 'class'] },
    }),
    Assignment.find({
      schoolId,
      active: true,
      status: { $ne: 'draft' },
      $or: [{ grade }, { kidIds: { $in: kidIds } }],
    }).select('subject'),
    Assessment.distinct('subject', { schoolId, kidId: { $in: kidIds }, active: true }),
  ]);

  const byKid = Object.fromEntries(marksToday.map((m) => [m.kidId.toString(), m]));
  const boys = kids.filter((k) => k.gender === 'male').length;
  const girls = kids.filter((k) => k.gender === 'female').length;
  const avg =
    assessments.length > 0
      ? Math.round((assessments.reduce((sum, a) => sum + (a.score || 0), 0) / assessments.length) * 10) / 10
      : 0;

  const storedNames = (klass.subjects || []).map((s) => s.name).filter(Boolean);
  const extra = [...new Set([...(derivedSubjects || []), ...assignments.map((a) => a.subject).filter(Boolean)])]
    .filter((name) => !storedNames.includes(name));
  const subjects =
    storedNames.length || extra.length
      ? [
          ...(klass.subjects || []).map((s) => ({ name: s.name, teacherName: s.teacherName || teacher?.name || '' })),
          ...extra.map((name) => ({ name, teacherName: teacher?.name || '' })),
        ]
      : [];

  const bySubject = new Map();
  for (const row of assessments) {
    const key = row.subject || 'General';
    if (!bySubject.has(key)) bySubject.set(key, []);
    bySubject.get(key).push(row.score || 0);
  }
  const performance = [...bySubject.entries()].map(([subject, scores]) => ({
    subject,
    average: Math.round((scores.reduce((s, n) => s + n, 0) / scores.length) * 10) / 10,
    count: scores.length,
  }));

  return {
    class: {
      ...klass.toObject(),
      gradeLevel: parseGradeLevel(grade),
      schoolName: school?.name || '',
      teacherName: teacher?.name || '',
    },
    stats: {
      students: kids.length,
      boys,
      girls,
      subjects: subjects.length,
      lessons: diaryLessons,
      avgPerformance: avg,
      capacity: klass.capacity || 30,
    },
    kids: kids.map((kid) => ({
      ...kid.toObject(),
      attendance: byKid[kid._id.toString()] || null,
    })),
    subjects,
    timetable: klass.timetable || [],
    notes: [...(klass.notes || [])].sort((a, b) => new Date(b.date || 0) - new Date(a.date || 0)),
    attendance: summarizeAttendance(monthMarks),
    reports: {
      attendance: summarizeAttendance(monthMarks),
      performance,
      avgPerformance: avg,
    },
  };
}

router.get('/class', async (req, res) => {
  try {
    const { schoolId, teacher } = await teacherContext(req);
    const grade = String(req.query.grade || '').trim();
    if (!schoolId) return res.status(400).json({ error: 'No school assigned to this teacher' });
    if (!grade) return res.status(400).json({ error: 'grade is required' });
    const payload = await classDetailPayload(schoolId, grade, teacher);
    res.json(payload);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.put('/class', async (req, res) => {
  try {
    const { schoolId, teacher } = await teacherContext(req);
    const grade = String(req.query.grade || req.body?.grade || '').trim();
    if (!schoolId) return res.status(400).json({ error: 'No school assigned to this teacher' });
    if (!grade) return res.status(400).json({ error: 'grade is required' });

    const klass = await ensureSchoolClass(schoolId, grade, teacher);
    const body = req.body || {};
    for (const key of ['classCode', 'classroom', 'section', 'academicYear', 'assistantName', 'description']) {
      if (body[key] !== undefined) klass[key] = String(body[key] || '').trim();
    }
    if (body.capacity !== undefined) {
      const n = Number(body.capacity);
      if (Number.isFinite(n)) klass.capacity = Math.max(1, Math.min(80, Math.round(n)));
    }
    if (Array.isArray(body.subjects)) {
      klass.subjects = body.subjects
        .map((s) => ({
          name: String(s?.name || s || '').trim(),
          teacherName: String(s?.teacherName || '').trim(),
        }))
        .filter((s) => s.name)
        .slice(0, 16);
    }
    if (Array.isArray(body.timetable)) {
      const days = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
      klass.timetable = body.timetable
        .map((slot) => ({
          day: days.includes(slot?.day) ? slot.day : 'Monday',
          startTime: String(slot?.startTime || '08:00').slice(0, 5),
          endTime: String(slot?.endTime || '08:40').slice(0, 5),
          subject: String(slot?.subject || '').trim().slice(0, 80),
          room: String(slot?.room || '').trim().slice(0, 80),
          kind: ['lesson', 'break', 'lunch'].includes(slot?.kind) ? slot.kind : 'lesson',
          periodLabel: String(slot?.periodLabel || '').trim().slice(0, 40),
        }))
        .slice(0, 80);
    }
    if (Array.isArray(body.timetableNotes)) {
      klass.timetableNotes = body.timetableNotes.map((n) => String(n || '').trim()).filter(Boolean).slice(0, 8);
    }
    if (body.description !== undefined) klass.description = String(body.description || '').trim().slice(0, 1200);
    await klass.save();
    const payload = await classDetailPayload(schoolId, grade, teacher);
    res.json(payload);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.post('/class/notes', async (req, res) => {
  try {
    const { schoolId, teacher } = await teacherContext(req);
    const grade = String(req.query.grade || req.body?.grade || '').trim();
    const title = String(req.body?.title || '').trim();
    if (!grade) return res.status(400).json({ error: 'grade is required' });
    if (!title) return res.status(400).json({ error: 'title is required' });
    const klass = await ensureSchoolClass(schoolId, grade, teacher);
    klass.notes.push({
      title: title.slice(0, 160),
      body: String(req.body?.body || '').trim().slice(0, 1000),
      date: req.body?.date ? startOfDay(req.body.date) : new Date(),
      teacherId: req.user.id,
      teacherName: teacher?.name || 'Teacher',
    });
    await klass.save();
    const payload = await classDetailPayload(schoolId, grade, teacher);
    res.status(201).json(payload);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.delete('/class/notes/:noteId', async (req, res) => {
  try {
    const { schoolId, teacher } = await teacherContext(req);
    const grade = String(req.query.grade || '').trim();
    if (!grade) return res.status(400).json({ error: 'grade is required' });
    const klass = await SchoolClass.findOne({ schoolId, grade, active: true });
    if (!klass) return res.status(404).json({ error: 'Class not found' });
    klass.notes = (klass.notes || []).filter((n) => n._id.toString() !== req.params.noteId);
    await klass.save();
    const payload = await classDetailPayload(schoolId, grade, teacher);
    res.json(payload);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.post('/class/message', async (req, res) => {
  try {
    const { schoolId, teacher } = await teacherContext(req);
    const grade = String(req.query.grade || req.body?.grade || '').trim();
    const title = String(req.body?.title || '').trim();
    const body = String(req.body?.body || '').trim();
    if (!grade) return res.status(400).json({ error: 'grade is required' });
    if (!title || !body) return res.status(400).json({ error: 'title and body are required' });
    const kids = await populateKids(Kid.find({ schoolId, grade, active: true }));
    const teacherName = teacher?.name || 'Teacher';
    const items = [];
    for (const kid of kids) {
      for (const parent of kid.parentIds || []) {
        items.push({
          userId: parent._id || parent,
          type: NOTIFICATION_TYPES.TEACHER_NOTE,
          title: `${teacherName}: ${title}`,
          body: `${kid.name} (${grade}) — ${body}`,
          kidId: kid._id,
        });
      }
    }
    if (items.length) await createAndEmitNotifications(getIO(), items);
    res.json({ ok: true, notified: items.length });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.get('/terms', async (req, res) => {
  try {
    const { schoolId } = await teacherContext(req);
    if (!schoolId) return res.json({ terms: [], current: null });
    const terms = await ensureAcademicTerms(schoolId);
    const current = await currentAcademicTerm(schoolId);
    res.json({ terms, current });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

const REPORT_SUBJECTS = [
  { name: 'Mathematics', base: 78, icon: 'math' },
  { name: 'English', base: 72, icon: 'english' },
  { name: 'Science', base: 74, icon: 'science' },
  { name: 'Social Studies', base: 69, icon: 'social' },
  { name: 'Creative Arts', base: 81, icon: 'arts' },
  { name: 'Physical Education', base: 85, icon: 'pe' },
];
const REPORT_SKILLS = [
  { name: 'Communication', base: 76 },
  { name: 'Teamwork', base: 80 },
  { name: 'Creativity', base: 73 },
  { name: 'Problem Solving', base: 71 },
];
const REPORT_BEHAVIOUR = [
  { name: 'Conduct', base: 82 },
  { name: 'Participation', base: 78 },
  { name: 'Respect', base: 85 },
];

function hashSeed(input) {
  let h = 0;
  const s = String(input);
  for (let i = 0; i < s.length; i += 1) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return h;
}

function seededScore(kidId, label, base) {
  const h = hashSeed(`${kidId}:${label}`);
  const swing = (h % 23) - 11;
  const band = h % 9;
  let score = base + swing;
  if (band === 0) score -= 40;
  else if (band === 1) score -= 18;
  else if (band === 2) score += 10;
  return Math.max(18, Math.min(98, Math.round(score)));
}

function performanceBand(score) {
  if (score == null) return 'none';
  if (score >= 80) return 'excellent';
  if (score >= 60) return 'good';
  if (score >= 40) return 'average';
  return 'needs';
}

async function ensureClassAssessments({ schoolId, teacherId, kids, term, kind, catalog }) {
  if (!term || !kids.length) return;
  const from = startOfDay(term.startDate);
  const to = endOfDay(term.endDate);
  const kidIds = kids.map((k) => k._id);
  const existing = await Assessment.countDocuments({
    schoolId,
    kidId: { $in: kidIds },
    active: true,
    kind,
    date: { $gte: from, $lte: to },
  });
  if (existing > 0) return;
  const mid = new Date(from.getTime() + (to.getTime() - from.getTime()) / 2);
  const rows = [];
  for (const kid of kids) {
    for (const item of catalog) {
      rows.push({
        schoolId,
        teacherId,
        kidId: kid._id,
        subject: item.name,
        title: `${term.name || 'Term'} ${item.name}`,
        kind,
        score: seededScore(kid._id, `${kind}:${item.name}:${term.name}`, item.base),
        date: mid,
        active: true,
      });
    }
  }
  if (rows.length) await Assessment.insertMany(rows, { ordered: false });
}

router.get('/reports', async (req, res) => {
  try {
    const { teacher, schoolId } = await teacherContext(req);
    if (!schoolId) {
      return res.json({
        grade: '',
        grades: [],
        term: null,
        terms: [],
        reportType: 'progress',
        overview: { students: 0, bands: [] },
        subjects: [],
        top: [],
        support: [],
        students: [],
        attendance: {},
        behaviour: [],
        skills: [],
      });
    }

    const allKids = await Kid.find({ schoolId, active: true }).select('name grade photoUrl');
    const grades = [...new Set(allKids.map((k) => k.grade).filter(Boolean))].sort();
    const grade = String(req.query.grade || '').trim() || grades[0] || '';
    const kids = grade ? allKids.filter((k) => k.grade === grade) : allKids;
    const terms = await ensureAcademicTerms(schoolId);
    let term = null;
    if (req.query.termId) term = terms.find((t) => t._id.toString() === String(req.query.termId)) || null;
    if (!term) term = await currentAcademicTerm(schoolId);
    const termIndex = terms.findIndex((t) => t._id.toString() === String(term?._id || ''));
    const prevTerm = termIndex > 0 ? terms[termIndex - 1] : null;
    const reportType = ['progress', 'midterm', 'endterm'].includes(req.query.type) ? req.query.type : 'progress';

    const from = term ? startOfDay(term.startDate) : profileRange('term').from;
    const to = term ? endOfDay(term.endDate) : profileRange('term').to;
    const kidIds = kids.map((k) => k._id);
    const [academic, prevAcademic, skillsRows, behaviourRows, marks, notes] = await Promise.all([
      Assessment.find({ schoolId, kidId: { $in: kidIds }, active: true, kind: 'academic', date: { $gte: from, $lte: to } }),
      prevTerm
        ? Assessment.find({
            schoolId,
            kidId: { $in: kidIds },
            active: true,
            kind: 'academic',
            date: { $gte: startOfDay(prevTerm.startDate), $lte: endOfDay(prevTerm.endDate) },
          })
        : [],
      Assessment.find({ schoolId, kidId: { $in: kidIds }, active: true, kind: 'skill', date: { $gte: from, $lte: to } }),
      Assessment.find({ schoolId, kidId: { $in: kidIds }, active: true, kind: 'behaviour', date: { $gte: from, $lte: to } }),
      AttendanceRecord.find({ schoolId, kidId: { $in: kidIds }, date: { $gte: from, $lte: to } }),
      TeacherNote.find({ schoolId, kidId: { $in: kidIds }, category: 'behaviour', createdAt: { $gte: from, $lte: to } }),
    ]);

    const avgByKid = (rows) => {
      const map = new Map();
      for (const row of rows) {
        const id = row.kidId.toString();
        if (!map.has(id)) map.set(id, []);
        map.get(id).push(row.score || 0);
      }
      return Object.fromEntries(
        [...map.entries()].map(([id, scores]) => [
          id,
          Math.round((scores.reduce((s, n) => s + n, 0) / scores.length) * 10) / 10,
        ])
      );
    };
    const currentAvg = avgByKid(academic);
    const previousAvg = avgByKid(prevAcademic);
    const subjectMap = new Map();
    for (const row of academic) {
      const key = row.subject || 'General';
      if (!subjectMap.has(key)) subjectMap.set(key, []);
      subjectMap.get(key).push(row.score || 0);
    }
    const subjects = REPORT_SUBJECTS.map((s) => {
      const scores = subjectMap.get(s.name) || [];
      const average = scores.length
        ? Math.round((scores.reduce((a, b) => a + b, 0) / scores.length) * 10) / 10
        : 0;
      return { name: s.name, icon: s.icon, average, count: scores.length };
    }).filter((s) => s.count > 0 || academic.length === 0);

    const kidById = Object.fromEntries(kids.map((k) => [k._id.toString(), k]));
    const studentRows = kids.map((kid) => {
      const id = kid._id.toString();
      const average = currentAvg[id] ?? null;
      const prev = previousAvg[id];
      const improvement = average != null && prev != null ? Math.round((average - prev) * 10) / 10 : 0;
      const kidScores = academic.filter((a) => a.kidId.toString() === id);
      const weak = [...new Set(kidScores.filter((a) => a.score < 40).map((a) => a.subject))];
      return {
        _id: kid._id,
        name: kid.name,
        grade: kid.grade,
        photoUrl: kid.photoUrl || '',
        average,
        band: performanceBand(average),
        improvement,
        weakSubjects: weak.length,
      };
    });
    const ranked = [...studentRows].filter((s) => s.average != null).sort((a, b) => b.average - a.average);
    const bandsSpec = [
      { key: 'excellent', label: 'Excellent (80% and above)', color: '#16A34A' },
      { key: 'good', label: 'Good (60% - 79%)', color: '#1D4ED8' },
      { key: 'average', label: 'Average (40% - 59%)', color: '#C2410C' },
      { key: 'needs', label: 'Needs Improvement (Below 40%)', color: '#EF4444' },
      { key: 'none', label: 'Not Assessed', color: '#D1D5DB' },
    ];
    const bands = bandsSpec.map((b) => {
      const count = studentRows.filter((s) => s.band === b.key).length;
      return { ...b, count, pct: kids.length ? Math.round((count / kids.length) * 100) : 0 };
    });

    const skillMap = new Map();
    for (const row of skillsRows) {
      const key = row.subject || 'Skill';
      if (!skillMap.has(key)) skillMap.set(key, []);
      skillMap.get(key).push(row.score || 0);
    }
    const behaviourMap = new Map();
    for (const row of behaviourRows) {
      const key = row.subject || 'Behaviour';
      if (!behaviourMap.has(key)) behaviourMap.set(key, []);
      behaviourMap.get(key).push(row.score || 0);
    }

    res.json({
      grade,
      grades,
      term,
      terms,
      reportType,
      overview: { students: kids.length, bands },
      subjects,
      top: ranked.slice(0, 3),
      support: [...ranked].sort((a, b) => (a.average ?? 0) - (b.average ?? 0)).slice(0, 3),
      students: ranked,
      attendance: summarizeAttendance(marks),
      behaviour: [...behaviourMap.entries()].map(([name, scores]) => ({
        name,
        average: Math.round((scores.reduce((a, b) => a + b, 0) / scores.length) * 10) / 10,
        notes: notes.filter((n) => true).length,
      })),
      behaviourNotes: notes.length,
      skills: [...skillMap.entries()].map(([name, scores]) => ({
        name,
        average: Math.round((scores.reduce((a, b) => a + b, 0) / scores.length) * 10) / 10,
      })),
      teacher: teacher?.toSafeJSON?.() || null,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/timetable', async (req, res) => {
  try {
    const { schoolId, teacher } = await teacherContext(req);
    if (!schoolId) return res.status(400).json({ error: 'No school assigned to this teacher' });

    const allKids = await Kid.find({ schoolId, active: true }).select('grade');
    const grades = [...new Set(allKids.map((k) => k.grade).filter(Boolean))].sort();
    const grade = String(req.query.grade || '').trim() || grades[0] || '';
    if (!grade) return res.json({ grade: '', grades, periods: [], days: [], notes: [], term: null });

    const klass = await ensureClassTimetable(await ensureSchoolClass(schoolId, grade, teacher));
    const weekStart = mondayOf(req.query.week || req.query.date);
    const weekEnd = new Date(weekStart);
    weekEnd.setDate(weekEnd.getDate() + 4);
    const term = await currentAcademicTerm(schoolId, weekStart);

    const periodMap = new Map();
    for (const slot of klass.timetable || []) {
      const key = `${slot.startTime}|${slot.endTime}`;
      if (!periodMap.has(key)) {
        periodMap.set(key, {
          startTime: slot.startTime,
          endTime: slot.endTime,
          periodLabel: slot.periodLabel || slot.subject || '',
          kind: slot.kind || 'lesson',
        });
      }
    }
    const periods = [...periodMap.values()].sort((a, b) => String(a.startTime).localeCompare(String(b.startTime)));

    const days = TIMETABLE_DAYS.map((dayName, i) => {
      const date = new Date(weekStart);
      date.setDate(date.getDate() + i);
      const slots = periods.map((period) => {
        const match = (klass.timetable || []).find(
          (s) => s.day === dayName && s.startTime === period.startTime && s.endTime === period.endTime
        );
        if (!match) return { ...period, subject: '', room: '', empty: true };
        return {
          startTime: match.startTime,
          endTime: match.endTime,
          subject: match.subject || '',
          room: match.room || '',
          kind: match.kind || period.kind,
          periodLabel: match.periodLabel || period.periodLabel,
          empty: false,
        };
      });
      return {
        day: dayName,
        date,
        label: ymd(date),
        slots,
      };
    });

    res.json({
      grade,
      grades,
      classroom: klass.classroom || 'Room 12',
      weekStart,
      weekEnd,
      term,
      periods,
      days,
      notes: klass.timetableNotes || [],
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/attendance', async (req, res) => {
  try {
    const { schoolId } = await teacherContext(req);
    if (!schoolId) return res.json({ date: startOfDay(), kids: [], marks: [] });

    const day = startOfDay(req.query.date);
    const kids = await schoolKids(schoolId, { grade: req.query.grade || undefined });
    const marks = await AttendanceRecord.find({
      schoolId,
      date: day,
      kidId: { $in: kids.map((k) => k._id) },
    });
    const byKid = Object.fromEntries(marks.map((m) => [m.kidId.toString(), m]));
    const grades = [
      ...new Set(
        (await Kid.find({ schoolId, active: true }).select('grade')).map((k) => k.grade).filter(Boolean)
      ),
    ].sort();

    res.json({
      date: day,
      grades,
      kids: kids.map((kid) => ({
        ...kid.toObject(),
        attendance: byKid[kid._id.toString()] || null,
      })),
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/attendance', async (req, res) => {
  try {
    const { schoolId } = await teacherContext(req);
    if (!schoolId) return res.status(400).json({ error: 'No school assigned to this teacher' });

    const { kidId, status, note } = req.body || {};
    if (!kidId || !ATTENDANCE_STATUSES.includes(status)) {
      return res.status(400).json({ error: 'kidId and a valid status are required' });
    }

    const kid = await populateKids(Kid.findOne({ _id: kidId, schoolId, active: true }));
    if (!kid) return res.status(404).json({ error: 'Student not found' });

    const day = startOfDay(req.body.date);
    const record = await AttendanceRecord.findOneAndUpdate(
      { kidId: kid._id, date: day },
      {
        schoolId,
        kidId: kid._id,
        teacherId: req.user.id,
        date: day,
        status,
        note: typeof note === 'string' ? note.trim().slice(0, 300) : '',
      },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );

    if (status === 'absent' || status === 'late') {
      const label = status === 'absent' ? 'marked absent' : 'marked late';
      await notifyParents(kid, {
        type: NOTIFICATION_TYPES.ATTENDANCE_ALERT,
        title: `${kid.name} ${label}`,
        body: note
          ? `${kid.name} was ${label} today. Note: ${note}`
          : `${kid.name} was ${label} on the class register today.`,
      });
    }

    res.json({ record });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.post('/attendance/bulk', async (req, res) => {
  try {
    const { schoolId } = await teacherContext(req);
    if (!schoolId) return res.status(400).json({ error: 'No school assigned to this teacher' });
    const { marks } = req.body || {};
    if (!Array.isArray(marks) || !marks.length) {
      return res.status(400).json({ error: 'marks[] is required' });
    }

    const day = startOfDay(req.body.date);
    const saved = [];
    for (const row of marks) {
      if (!row?.kidId || !ATTENDANCE_STATUSES.includes(row.status)) continue;
      const kid = await Kid.findOne({ _id: row.kidId, schoolId, active: true });
      if (!kid) continue;
      const record = await AttendanceRecord.findOneAndUpdate(
        { kidId: kid._id, date: day },
        {
          schoolId,
          kidId: kid._id,
          teacherId: req.user.id,
          date: day,
          status: row.status,
          note: typeof row.note === 'string' ? row.note.trim().slice(0, 300) : '',
        },
        { upsert: true, new: true, setDefaultsOnInsert: true }
      );
      saved.push(record);
    }
    res.json({ saved: saved.length, records: saved });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.get('/work', async (req, res) => {
  try {
    const { schoolId } = await teacherContext(req);
    if (!schoolId) {
      return res.json({
        assignments: [],
        announcements: [],
        holidays: [],
        grades: [],
        unmarked: [],
        diaryToday: 0,
        stats: { students: 0, markedToday: 0, unmarked: 0 },
      });
    }

    const day = startOfDay();
    const horizon = new Date(day);
    horizon.setDate(horizon.getDate() + 45);

    const [assignments, announcements, holidays, kids, marks, diaryToday] = await Promise.all([
      Assignment.find({ schoolId, teacherId: req.user.id, active: true })
        .populate('kidIds', 'name grade')
        .sort({ dueDate: 1, createdAt: -1 }),
      Announcement.find({ schoolId, active: true }).sort({ publishedAt: -1 }).limit(30),
      SchoolHoliday.find({ schoolId, active: true, date: { $gte: day, $lte: horizon } })
        .sort({ date: 1 })
        .limit(12),
      schoolKids(schoolId),
      AttendanceRecord.find({ schoolId, date: day }),
      DiaryEntry.countDocuments({
        schoolId,
        teacherId: req.user.id,
        date: day,
        active: true,
      }),
    ]);

    const byKid = Object.fromEntries(marks.map((m) => [m.kidId.toString(), m]));
    const unmarked = kids.filter((k) => !byKid[k._id.toString()]);
    const grades = [...new Set(kids.map((k) => k.grade).filter(Boolean))].sort();

    res.json({
      assignments,
      announcements,
      holidays,
      grades,
      diaryToday,
      unmarked: unmarked.slice(0, 12).map((k) => ({
        _id: k._id,
        name: k.name,
        grade: k.grade,
        photoUrl: k.photoUrl || '',
      })),
      stats: {
        students: kids.length,
        markedToday: marks.length,
        unmarked: unmarked.length,
      },
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/assignments', async (req, res) => {
  try {
    const { schoolId } = await teacherContext(req);
    if (!schoolId) return res.json({ assignments: [] });
    const assignments = await Assignment.find({ schoolId, teacherId: req.user.id, active: true })
      .populate('kidIds', 'name grade')
      .sort({ dueDate: 1, createdAt: -1 });
    res.json({ assignments });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

function normalizeAssignmentMedia(raw) {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((m) => m?.url)
    .slice(0, MAX_ASSIGNMENT_MEDIA)
    .map((m) => ({
      url: String(m.url),
      publicId: String(m.publicId || ''),
      resourceType: ['image', 'video', 'raw'].includes(m.resourceType) ? m.resourceType : 'raw',
      originalName: String(m.originalName || ''),
      bytes: Number(m.bytes) || 0,
      format: String(m.format || ''),
    }));
}

function applyAssignmentFields(assignment, body) {
  if (body.title !== undefined) assignment.title = String(body.title || '').trim().slice(0, 160);
  if (body.subject !== undefined) assignment.subject = String(body.subject || '').trim().slice(0, 80);
  if (body.grade !== undefined) assignment.grade = String(body.grade || '').trim();
  if (body.description !== undefined) assignment.description = String(body.description || '').trim().slice(0, 1000);
  if (body.dueDate !== undefined) assignment.dueDate = body.dueDate ? new Date(body.dueDate) : null;
  if (Array.isArray(body.kidIds)) assignment.kidIds = body.kidIds;
  if (body.media !== undefined) assignment.media = normalizeAssignmentMedia(body.media);
  if (body.allowLateSubmission !== undefined) assignment.allowLateSubmission = body.allowLateSubmission === true;
  if (body.showMarks !== undefined) assignment.showMarks = body.showMarks !== false;
  if (body.status === 'draft' || body.status === 'published') assignment.status = body.status;
  if (body.active === false) assignment.active = false;
  if (body.rubric !== undefined) {
    const r = body.rubric && typeof body.rubric === 'object' ? body.rubric : {};
    assignment.rubric = {
      enabled: r.enabled === true,
      title: String(r.title || '').trim().slice(0, 160),
      body: String(r.body || '').trim().slice(0, 2000),
    };
  }
}

async function notifyAssignmentParents(assignment) {
  if (assignment.status === 'draft') return 0;
  let kids;
  if (assignment.kidIds?.length) {
    kids = await populateKids(Kid.find({ _id: { $in: assignment.kidIds }, schoolId: assignment.schoolId, active: true }));
  } else if (assignment.grade) {
    kids = await populateKids(Kid.find({ schoolId: assignment.schoolId, grade: assignment.grade, active: true }));
  } else {
    kids = await populateKids(Kid.find({ schoolId: assignment.schoolId, active: true }));
  }
  const due = assignment.dueDate ? ` Due ${assignment.dueDate.toLocaleString()}.` : '';
  const items = [];
  for (const kid of kids) {
    for (const parent of kid.parentIds || []) {
      items.push({
        userId: parent._id || parent,
        type: NOTIFICATION_TYPES.ASSIGNMENT,
        title: `New assignment: ${assignment.title}`,
        body: `${kid.name} has a new ${assignment.subject || 'class'} assignment — ${assignment.title}.${due}`,
        kidId: kid._id,
      });
    }
  }
  if (items.length) await createAndEmitNotifications(getIO(), items);
  return items.length;
}

router.post('/assignments', async (req, res) => {
  try {
    const { schoolId } = await teacherContext(req);
    if (!schoolId) return res.status(400).json({ error: 'No school assigned to this teacher' });

    const payload = req.body || {};
    if (!payload.title?.trim()) return res.status(400).json({ error: 'title is required' });
    const status = payload.status === 'draft' ? 'draft' : 'published';

    const assignment = new Assignment({
      schoolId,
      teacherId: req.user.id,
      title: String(payload.title).trim().slice(0, 160),
      status,
    });
    applyAssignmentFields(assignment, payload);
    assignment.status = status;
    await assignment.save();

    const notified = await notifyAssignmentParents(assignment);
    const populated = await Assignment.findById(assignment._id).populate('kidIds', 'name grade');
    res.status(201).json({ assignment: populated, notified });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.put('/assignments/:id', async (req, res) => {
  try {
    const { schoolId } = await teacherContext(req);
    const assignment = await Assignment.findOne({
      _id: req.params.id,
      schoolId,
      teacherId: req.user.id,
    });
    if (!assignment) return res.status(404).json({ error: 'Assignment not found' });

    const wasDraft = assignment.status === 'draft';
    applyAssignmentFields(assignment, req.body || {});
    if (!assignment.title) return res.status(400).json({ error: 'title is required' });
    await assignment.save();

    const publishing = wasDraft && assignment.status === 'published';
    const notified = publishing ? await notifyAssignmentParents(assignment) : 0;
    const populated = await Assignment.findById(assignment._id).populate('kidIds', 'name grade');
    res.json({ assignment: populated, notified });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.delete('/assignments/:id', async (req, res) => {
  try {
    const { schoolId } = await teacherContext(req);
    const assignment = await Assignment.findOne({
      _id: req.params.id,
      schoolId,
      teacherId: req.user.id,
    });
    if (!assignment) return res.status(404).json({ error: 'Assignment not found' });
    assignment.active = false;
    await assignment.save();
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/notes', async (req, res) => {
  try {
    const { schoolId } = await teacherContext(req);
    if (!schoolId) return res.json({ notes: [] });
    const filter = { schoolId, teacherId: req.user.id };
    if (req.query.kidId) filter.kidId = req.query.kidId;
    const notes = await TeacherNote.find(filter)
      .populate('kidId', 'name grade')
      .sort({ createdAt: -1 })
      .limit(100);
    res.json({ notes });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/notes', async (req, res) => {
  try {
    const { schoolId, teacher } = await teacherContext(req);
    if (!schoolId) return res.status(400).json({ error: 'No school assigned to this teacher' });

    const { kidId, title, body, category } = req.body || {};
    if (!kidId || !title?.trim() || !body?.trim()) {
      return res.status(400).json({ error: 'kidId, title and body are required' });
    }

    const kid = await populateKids(Kid.findOne({ _id: kidId, schoolId, active: true }));
    if (!kid) return res.status(404).json({ error: 'Student not found' });

    const note = await TeacherNote.create({
      schoolId,
      teacherId: req.user.id,
      kidId: kid._id,
      category: NOTE_CATEGORIES.includes(category) ? category : 'general',
      title: title.trim(),
      body: body.trim().slice(0, 1000),
    });

    const teacherName = teacher?.name || 'Your teacher';
    await notifyParents(kid, {
      type: NOTIFICATION_TYPES.TEACHER_NOTE,
      title: `${teacherName}: ${note.title}`,
      body: `${kid.name} — ${note.body}`,
    });

    const populated = await TeacherNote.findById(note._id).populate('kidId', 'name grade');
    res.status(201).json({ note: populated });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

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

function normalizeDiaryMedia(raw) {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((m) => m?.url)
    .slice(0, MAX_DIARY_MEDIA)
    .map((m) => ({
      url: String(m.url),
      publicId: String(m.publicId || ''),
      resourceType: ['image', 'video', 'raw'].includes(m.resourceType) ? m.resourceType : 'image',
      originalName: String(m.originalName || ''),
    }));
}

function applyDiaryFields(entry, body) {
  if (body.title !== undefined) entry.title = String(body.title || '').trim().slice(0, 160);
  if (body.body !== undefined) entry.body = String(body.body || '').trim().slice(0, 4000);
  if (DIARY_LABELS.includes(body.label)) entry.label = body.label;
  if (body.topic !== undefined) entry.topic = String(body.topic || '').trim().slice(0, 160);
  if (body.lessonSummary !== undefined) entry.lessonSummary = String(body.lessonSummary || '').trim().slice(0, 2000);
  if (body.learningActivity !== undefined) entry.learningActivity = String(body.learningActivity || '').trim().slice(0, 2000);
  if (body.teacherObservation !== undefined) {
    entry.teacherObservation = String(body.teacherObservation || '').trim().slice(0, 2000);
  }
  if (body.category !== undefined) entry.category = String(body.category || '').trim().slice(0, 60);
  if (['', 'low', 'medium', 'high'].includes(body.severity)) entry.severity = body.severity || '';
  if (body.actionTaken !== undefined) entry.actionTaken = String(body.actionTaken || '').trim().slice(0, 400);
  if (body.visibilityParents !== undefined) entry.visibilityParents = body.visibilityParents !== false;
  if (body.visibilityStudents !== undefined) entry.visibilityStudents = body.visibilityStudents !== false;
  if (body.notifyParent !== undefined) entry.notifyParent = body.notifyParent !== false;
  if (body.classId !== undefined) entry.classId = body.classId || null;
  if (body.grade !== undefined) entry.grade = String(body.grade || '').trim();
  if (Array.isArray(body.kidIds)) entry.kidIds = body.kidIds;
  if (body.date) entry.date = diaryCalendarDate(body.date);
  if (body.media !== undefined) entry.media = normalizeDiaryMedia(body.media);
  if (body.private !== undefined) entry.private = body.private === true;
  if (body.learningObjectives !== undefined) {
    entry.learningObjectives = String(body.learningObjectives || '').trim().slice(0, 500);
  }
  if (Array.isArray(body.subjects)) {
    entry.subjects = body.subjects.map((s) => String(s || '').trim()).filter(Boolean).slice(0, 8);
  }
  if (body.durationMinutes !== undefined) {
    const n = Number(body.durationMinutes);
    entry.durationMinutes = Number.isFinite(n) ? Math.max(0, Math.min(240, Math.round(n))) : 0;
  }
  if (body.time !== undefined) {
    const raw = String(body.time || '').trim();
    entry.time = /^\d{1,2}:\d{2}$/.test(raw) ? raw.padStart(5, '0').slice(-5) : '';
  }
  if (body.engagement !== undefined) {
    const n = Number(body.engagement);
    entry.engagement = n >= 1 && n <= 5 ? n : 0;
  }
  if (body.status === 'draft' || body.status === 'published') entry.status = body.status;
  if (body.homework !== undefined) {
    const hw = body.homework && typeof body.homework === 'object' ? body.homework : {};
    const enabled = hw.enabled === true;
    const prevId = entry.homework?.assignmentId || hw.assignmentId || null;
    entry.homework = {
      enabled,
      title: enabled ? String(hw.title || '').trim().slice(0, 160) : '',
      dueDate: enabled && hw.dueDate ? startOfDay(hw.dueDate) : null,
      assignmentId: enabled ? prevId : null,
    };
  }
  if (entry.label === 'homework' && !entry.homework?.enabled) {
    entry.homework = {
      enabled: true,
      title: String(entry.topic || entry.title || '').trim().slice(0, 160),
      dueDate: body.homework?.dueDate ? startOfDay(body.homework.dueDate) : entry.homework?.dueDate || null,
      assignmentId: entry.homework?.assignmentId || null,
    };
  }
  if (!String(entry.body || '').trim()) {
    entry.body = String(entry.lessonSummary || entry.teacherObservation || entry.topic || entry.title || '')
      .trim()
      .slice(0, 4000);
  }
}

async function notifyDiaryParents(entry, teacher) {
  if (entry.private || entry.status === 'draft' || entry.notifyParent === false || entry.visibilityParents === false) {
    return 0;
  }
  const kids = await audienceKids(entry.schoolId, { kidIds: entry.kidIds, grade: entry.grade });
  const teacherName = teacher?.name || 'Teacher';
  const items = [];
  for (const kid of kids) {
    const copy = diaryNotifyCopy(entry, kid, teacherName);
    for (const parent of kid.parentIds || []) {
      items.push({
        userId: parent._id || parent,
        type: NOTIFICATION_TYPES.DIARY,
        title: copy.title,
        body: copy.body,
        kidId: kid._id,
      });
    }
  }
  if (items.length) await createAndEmitNotifications(getIO(), items);
  return items.length;
}

async function syncHomeworkAssignment(entry, schoolId, teacherId, { notify } = {}) {
  if (entry.status !== 'published' || entry.private || !entry.homework?.enabled || !entry.homework.title) {
    return null;
  }
  const payload = {
    title: entry.homework.title,
    subject: (entry.subjects || [])[0] || '',
    grade: entry.grade || '',
    description: entry.body || '',
    dueDate: entry.homework.dueDate || null,
    kidIds: entry.kidIds || [],
  };
  if (entry.homework.assignmentId) {
    const existing = await Assignment.findOne({
      _id: entry.homework.assignmentId,
      schoolId,
      teacherId,
      active: true,
    });
    if (existing) {
      existing.title = payload.title;
      existing.subject = payload.subject;
      existing.grade = payload.grade;
      existing.description = payload.description;
      existing.dueDate = payload.dueDate;
      existing.kidIds = payload.kidIds;
      await existing.save();
      return existing;
    }
  }
  const assignment = await Assignment.create({ schoolId, teacherId, ...payload, status: 'published' });
  entry.homework.assignmentId = assignment._id;
  await entry.save();

  if (notify) {
    let kids;
    if (assignment.kidIds.length) {
      kids = await populateKids(Kid.find({ _id: { $in: assignment.kidIds }, schoolId, active: true }));
    } else if (assignment.grade) {
      kids = await populateKids(Kid.find({ schoolId, grade: assignment.grade, active: true }));
    } else {
      kids = await populateKids(Kid.find({ schoolId, active: true }));
    }
    const due = assignment.dueDate ? ` Due ${assignment.dueDate.toLocaleDateString()}.` : '';
    const items = [];
    for (const kid of kids) {
      for (const parent of kid.parentIds || []) {
        items.push({
          userId: parent._id || parent,
          type: NOTIFICATION_TYPES.ASSIGNMENT,
          title: `New assignment: ${assignment.title}`,
          body: `${kid.name} has a new ${assignment.subject || 'class'} assignment — ${assignment.title}.${due}`,
          kidId: kid._id,
        });
      }
    }
    if (items.length) await createAndEmitNotifications(getIO(), items);
  }
  return assignment;
}

function populateDiary(q) {
  return q
    .populate('teacherId', 'name')
    .populate('kidIds', 'name grade')
    .populate('parentSignatures.kidId', 'name grade');
}

async function audienceKids(schoolId, { kidIds, grade } = {}) {
  if (Array.isArray(kidIds) && kidIds.length) {
    return populateKids(Kid.find({ _id: { $in: kidIds }, schoolId, active: true }));
  }
  if (grade) {
    return populateKids(Kid.find({ schoolId, grade, active: true }));
  }
  return populateKids(Kid.find({ schoolId, active: true }));
}

router.get('/diary', async (req, res) => {
  try {
    const { schoolId } = await teacherContext(req);
    if (!schoolId) return res.json({ entries: [], dates: [] });

    const filter = { schoolId, active: true };
    if (req.query.date) {
      const { from, to } = diaryCalendarRange(req.query.date);
      filter.date = { $gte: from, $lte: to };
    } else {
      const { from, to } = monthRange(req.query.month);
      filter.date = { $gte: from, $lte: to };
    }

    const { from, to } = monthRange(req.query.month || req.query.date);
    const [entries, monthEntries] = await Promise.all([
      populateDiary(DiaryEntry.find(filter).sort({ date: -1, createdAt: -1 }).limit(120)),
      DiaryEntry.find({ schoolId, active: true, date: { $gte: from, $lte: to } }).select('date'),
    ]);

    const dates = [...new Set(monthEntries.map((e) => ymd(e.date)))];
    const list = (Array.isArray(entries) ? entries : entries ? [entries] : []).map((e) => {
      const doc = e.toObject ? e.toObject() : e;
      const media = Array.isArray(doc.media) ? doc.media : [];
      const photo = media.find(
        (m) => m?.url && m.resourceType !== 'raw' && m.resourceType !== 'video',
      );
      const comments = (doc.comments || []).map((c) => {
        const media = serializeDiaryCommentMedia(c);
        return {
          _id: c._id,
          authorName: c.authorName || 'Parent',
          authorRole: c.authorRole || 'Parent',
          authorPhotoUrl: c.authorPhotoUrl || '',
          body: c.body || '',
          media,
          attachments: media,
          createdAt: c.createdAt,
        };
      });
      const signatures = (doc.parentSignatures || []).map((s) => ({
        _id: s._id,
        kidId: s.kidId?._id || s.kidId,
        kidName: s.kidId?.name || '',
        parentName: s.parentName || 'Parent',
        signedAt: s.signedAt,
      }));
      const meta = diaryTypeMeta(doc.label);
      return {
        ...doc,
        type: doc.label,
        typeLabel: meta.label,
        typeEmoji: meta.emoji,
        filter: meta.filter,
        photoUrl: photo?.url || media.find((m) => m?.url)?.url || '',
        comments,
        signatures,
        signatureCount: signatures.length,
        acknowledgedCount: signatures.length,
      };
    });

    let overview = null;
    if (req.query.date) {
      const published = list.filter((e) => e.status !== 'draft' && !e.private);
      const audience = await audienceKids(schoolId, {
        kidIds: published.flatMap((e) => (e.kidIds || []).map((k) => k._id || k)),
        grade: published.find((e) => e.grade)?.grade,
      });
      const signedKidIds = new Set(
        published.flatMap((e) => (e.signatures || []).map((s) => String(s.kidId))),
      );
      const parentIds = new Set();
      const pendingParents = [];
      for (const kid of audience) {
        for (const parent of kid.parentIds || []) {
          const id = String(parent._id || parent);
          if (parentIds.has(id)) continue;
          parentIds.add(id);
          if (!signedKidIds.has(String(kid._id))) {
            pendingParents.push({
              parentId: id,
              parentName: parent.name || 'Parent',
              kidName: kid.name,
            });
          }
        }
      }
      overview = {
        date: req.query.date,
        classLabel: published.find((e) => e.grade)?.grade || audience[0]?.grade || '',
        students: audience.length,
        lessons: published.filter((e) => ['lesson', 'class', 'academic'].includes(e.label)).length,
        homework: published.filter((e) => e.label === 'homework' || e.homework?.enabled).length,
        published: published.length,
        acknowledged: signedKidIds.size,
        pending: Math.max(0, audience.length - signedKidIds.size),
        pendingParents: pendingParents.slice(0, 40),
        ackRate: audience.length ? Math.round((signedKidIds.size / audience.length) * 100) : 0,
      };
    }
    res.json({ entries: list, dates, overview, types: DIARY_LABELS.map((value) => diaryTypeMeta(value)) });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/diary', async (req, res) => {
  try {
    const { schoolId, teacher } = await teacherContext(req);
    if (!schoolId) return res.status(400).json({ error: 'No school assigned to this teacher' });

    const payload = req.body || {};
    if (!payload.title?.trim() && !payload.topic?.trim()) return res.status(400).json({ error: 'title is required' });
    const status = payload.status === 'draft' ? 'draft' : 'published';
    const description = String(payload.body || payload.lessonSummary || payload.teacherObservation || payload.topic || payload.title || '').trim();
    if (status === 'published' && !payload.private && !description) {
      return res.status(400).json({ error: 'description is required' });
    }

    const entry = new DiaryEntry({
      schoolId,
      teacherId: req.user.id,
      date: diaryCalendarDate(payload.date),
      title: String(payload.title || payload.topic || '').trim().slice(0, 160),
      body: description.slice(0, 4000),
      label: DIARY_LABELS.includes(payload.label) ? payload.label : 'general',
      grade: payload.grade?.trim() || '',
      kidIds: Array.isArray(payload.kidIds) ? payload.kidIds : [],
      media: normalizeDiaryMedia(payload.media),
      private: payload.private === true,
      status,
    });
    applyDiaryFields(entry, payload);
    entry.status = status;
    await entry.save();

    await syncHomeworkAssignment(entry, schoolId, req.user.id, { notify: status === 'published' && !entry.private });
    const notified = await notifyDiaryParents(entry, teacher);

    const populated = await populateDiary(DiaryEntry.findById(entry._id));
    res.status(201).json({ entry: populated, notified });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.put('/diary/:id', async (req, res) => {
  try {
    const { schoolId, teacher } = await teacherContext(req);
    const entry = await DiaryEntry.findOne({
      _id: req.params.id,
      schoolId,
      teacherId: req.user.id,
      active: true,
    });
    if (!entry) return res.status(404).json({ error: 'Diary entry not found' });

    const wasDraft = entry.status === 'draft';
    const hadAssignment = Boolean(entry.homework?.assignmentId);
    applyDiaryFields(entry, req.body || {});
    if (!entry.title) return res.status(400).json({ error: 'title is required' });
    if (entry.status === 'published' && !entry.private && !String(entry.body || '').trim()) {
      return res.status(400).json({ error: 'description is required' });
    }
    await entry.save();

    const publishing = wasDraft && entry.status === 'published';
    await syncHomeworkAssignment(entry, schoolId, req.user.id, {
      notify: !entry.private && entry.status === 'published' && !hadAssignment,
    });
    const notified = publishing ? await notifyDiaryParents(entry, teacher) : 0;

    const populated = await populateDiary(DiaryEntry.findById(entry._id));
    res.json({ entry: populated, notified });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.post('/diary/:id/comments', async (req, res) => {
  try {
    if (!/^[a-fA-F0-9]{24}$/.test(String(req.params.id))) {
      return res.status(404).json({ error: 'Diary entry not found' });
    }
    const { schoolId, teacher } = await teacherContext(req);
    const entry = await DiaryEntry.findOne({
      _id: req.params.id,
      schoolId,
      teacherId: req.user.id,
      active: true,
    });
    if (!entry) return res.status(404).json({ error: 'Diary entry not found' });
    const body = String(req.body?.body || '').trim().slice(0, 800);
    const media = normalizeDiaryCommentMedia(req.body?.media || req.body?.attachments);
    if (!body && !media.length) return res.status(400).json({ error: 'Write a comment or attach a file' });
    const author = await User.findById(req.user.id).select('name photoUrl');
    if (!Array.isArray(entry.comments)) entry.comments = [];
    entry.comments.push({
      userId: req.user.id,
      authorName: author?.name || teacher?.name || req.user.name || 'Teacher',
      authorRole: 'Teacher',
      authorPhotoUrl: author?.photoUrl || '',
      body,
      media,
    });
    await entry.save();
    try {
      const kids = await audienceKids(entry.schoolId, { kidIds: entry.kidIds, grade: entry.grade });
      const preview = body || (media[0]?.originalName ? `sent ${media[0].originalName}` : 'replied with a file');
      const items = [];
      for (const kid of kids) {
        for (const parent of kid.parentIds || []) {
          items.push({
            userId: parent._id || parent,
            type: NOTIFICATION_TYPES.DIARY,
            title: 'Teacher replied in diary',
            body: `${author?.name || 'Teacher'} replied on "${entry.title}": ${String(preview).slice(0, 140)}`,
            kidId: kid._id,
          });
        }
      }
      if (items.length) await createAndEmitNotifications(getIO(), items);
    } catch (_) {}
    const populated = await populateDiary(DiaryEntry.findById(entry._id));
    const comments = (populated.comments || []).map((c) => {
      const files = serializeDiaryCommentMedia(c);
      return {
        _id: c._id,
        authorName: c.authorName || 'Parent',
        authorRole: c.authorRole || 'Parent',
        authorPhotoUrl: c.authorPhotoUrl || '',
        body: c.body || '',
        media: files,
        attachments: files,
        createdAt: c.createdAt,
      };
    });
    res.status(201).json({ comments, entry: populated });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

function letterGrade(score) {
  if (score >= 80) return 'A';
  if (score >= 70) return 'B';
  if (score >= 60) return 'C';
  if (score >= 50) return 'D';
  return 'E';
}

function profileRange(key) {
  const to = new Date();
  to.setHours(23, 59, 59, 999);
  const from = new Date(to);
  if (key === 'month') {
    from.setDate(1);
    from.setHours(0, 0, 0, 0);
  } else if (key === 'year') {
    from.setMonth(0, 1);
    from.setHours(0, 0, 0, 0);
  } else {
    const month = to.getMonth();
    const startMonth = month < 4 ? 0 : month < 8 ? 4 : 8;
    from.setMonth(startMonth, 1);
    from.setHours(0, 0, 0, 0);
  }
  return { from, to };
}

function summarizeAttendance(records) {
  const present = records.filter((r) => r.status === 'present').length;
  const absent = records.filter((r) => r.status === 'absent').length;
  const late = records.filter((r) => r.status === 'late').length;
  const excused = records.filter((r) => r.status === 'excused').length;
  const total = records.length;
  const pct = (n) => (total ? Math.round((n / total) * 1000) / 10 : 0);
  return {
    present,
    absent,
    late,
    excused,
    total,
    presentPct: pct(present),
    absentPct: pct(absent),
    latePct: pct(late),
  };
}

function summarizePerformance(rows) {
  const bySubject = new Map();
  for (const row of rows) {
    const subject = row.subject || 'General';
    if (!bySubject.has(subject)) bySubject.set(subject, []);
    bySubject.get(subject).push(row);
  }
  const subjects = [...bySubject.entries()].map(([subject, list]) => {
    const ordered = [...list].sort((a, b) => new Date(a.date) - new Date(b.date));
    const scores = ordered.map((r) => r.score);
    const average = scores.reduce((sum, n) => sum + n, 0) / scores.length;
    return {
      subject,
      average: Math.round(average * 10) / 10,
      grade: letterGrade(average),
      trend: scores.slice(-6),
      count: scores.length,
    };
  });
  const overall = subjects.length
    ? subjects.reduce((sum, s) => sum + s.average, 0) / subjects.length
    : 0;
  return {
    subjects,
    overallAverage: Math.round(overall * 10) / 10,
    overallGrade: subjects.length ? letterGrade(overall) : '—',
  };
}

router.get('/kids/:id/profile', async (req, res) => {
  try {
    const { schoolId } = await teacherContext(req);
    if (!schoolId) return res.status(400).json({ error: 'No school assigned to this teacher' });

    const kid = await populateKids(Kid.findOne({ _id: req.params.id, schoolId, active: true }));
    if (!kid) return res.status(404).json({ error: 'Student not found' });

    const rangeKey = ['term', 'month', 'year'].includes(req.query.range) ? req.query.range : 'term';
    const { from, to } = profileRange(rangeKey);
    const today = startOfDay();

    const [todayMark, marks, assessments, notes, assignments] = await Promise.all([
      AttendanceRecord.findOne({ kidId: kid._id, date: today }),
      AttendanceRecord.find({ kidId: kid._id, date: { $gte: from, $lte: to } }).sort({ date: -1 }),
      Assessment.find({ schoolId, kidId: kid._id, active: true, date: { $gte: from, $lte: to } }).sort({
        date: 1,
      }),
      TeacherNote.find({ schoolId, kidId: kid._id })
        .populate('teacherId', 'name')
        .sort({ createdAt: -1 })
        .limit(20),
      Assignment.find({
        schoolId,
        active: true,
        status: { $ne: 'draft' },
        $or: [{ kidIds: kid._id }, { grade: kid.grade || '__none__' }, { grade: '' }],
      })
        .sort({ dueDate: 1, createdAt: -1 })
        .limit(40),
    ]);

    res.json({
      kid,
      todayStatus: todayMark?.status || '',
      range: rangeKey,
      attendance: {
        ...summarizeAttendance(marks),
        records: marks,
      },
      performance: summarizePerformance(assessments),
      notes,
      assignments,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.put('/kids/:id', async (req, res) => {
  try {
    const { schoolId } = await teacherContext(req);
    const kid = await Kid.findOne({ _id: req.params.id, schoolId, active: true });
    if (!kid) return res.status(404).json({ error: 'Student not found' });

    if (req.body.name !== undefined) {
      const name = String(req.body.name || '').trim();
      if (!name) return res.status(400).json({ error: 'name is required' });
      kid.name = name.slice(0, 80);
    }
    if (req.body.grade !== undefined) kid.grade = String(req.body.grade || '').trim();
    if (req.body.admissionNo !== undefined) kid.admissionNo = String(req.body.admissionNo || '').trim();
    if (req.body.about !== undefined) kid.about = String(req.body.about || '').trim().slice(0, 800);
    if (req.body.gender !== undefined) {
      kid.gender = ['male', 'female', 'other', ''].includes(req.body.gender) ? req.body.gender : kid.gender;
    }
    if (req.body.dateOfBirth !== undefined) {
      kid.dateOfBirth = req.body.dateOfBirth ? startOfDay(req.body.dateOfBirth) : null;
    }
    if (req.body.photoUrl !== undefined) kid.photoUrl = String(req.body.photoUrl || '').trim();
    if (req.body.photoPublicId !== undefined) kid.photoPublicId = String(req.body.photoPublicId || '').trim();

    await kid.save();
    const populated = await populateKids(Kid.findById(kid._id));
    res.json({ kid: populated });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.post('/kids/:id/assessments', async (req, res) => {
  try {
    const { schoolId } = await teacherContext(req);
    if (!schoolId) return res.status(400).json({ error: 'No school assigned to this teacher' });

    const kid = await Kid.findOne({ _id: req.params.id, schoolId, active: true });
    if (!kid) return res.status(404).json({ error: 'Student not found' });

    const subject = String(req.body?.subject || '').trim();
    const score = Number(req.body?.score);
    if (!subject) return res.status(400).json({ error: 'subject is required' });
    if (Number.isNaN(score) || score < 0 || score > 100) {
      return res.status(400).json({ error: 'score must be between 0 and 100' });
    }

    const row = await Assessment.create({
      schoolId,
      teacherId: req.user.id,
      kidId: kid._id,
      subject,
      title: String(req.body?.title || 'Assessment').trim().slice(0, 120),
      kind: ['academic', 'behaviour', 'skill'].includes(req.body?.kind) ? req.body.kind : 'academic',
      score,
      date: req.body?.date ? startOfDay(req.body.date) : startOfDay(),
    });
    res.status(201).json({ assessment: row });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.delete('/diary/:id', async (req, res) => {
  try {
    const { schoolId } = await teacherContext(req);
    const entry = await DiaryEntry.findOne({
      _id: req.params.id,
      schoolId,
      teacherId: req.user.id,
    });
    if (!entry) return res.status(404).json({ error: 'Diary entry not found' });
    entry.active = false;
    await entry.save();
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

const LESSON_STATUSES = ['draft', 'planned', 'in_progress', 'published'];
const RESOURCE_KINDS = ['mine', 'shared', 'recommended', 'template'];
const RESOURCE_TYPES = ['pdf', 'ppt', 'doc', 'image', 'link', 'other'];

function serializeLessonPlan(plan) {
  return {
    _id: plan._id,
    title: plan.title,
    description: plan.description || '',
    subject: plan.subject || '',
    grade: plan.grade || '',
    status: LESSON_STATUSES.includes(plan.status) ? plan.status : 'draft',
    scheduledDate: plan.scheduledDate || null,
    durationMinutes: plan.durationMinutes || 0,
    objectives: plan.objectives || '',
    favorite: plan.favorite === true,
    createdAt: plan.createdAt,
    updatedAt: plan.updatedAt,
  };
}

function serializeResource(row, userId) {
  const favorites = (row.favoriteUserIds || []).map((id) => String(id));
  return {
    _id: row._id,
    title: row.title,
    description: row.description || '',
    subject: row.subject || '',
    grade: row.grade || '',
    fileType: RESOURCE_TYPES.includes(row.fileType) ? row.fileType : 'other',
    url: row.url || '',
    thumbnailUrl: row.thumbnailUrl || '',
    originalName: row.originalName || '',
    rating: Number(row.rating || 0),
    ratingCount: Number(row.ratingCount || 0),
    kind: RESOURCE_KINDS.includes(row.kind) ? row.kind : 'mine',
    sharedByName: row.sharedByName || '',
    favorite: Boolean(userId && favorites.includes(String(userId))),
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

function fileTypeFromName(name = '', fallback = 'other') {
  const n = String(name).toLowerCase();
  if (n.endsWith('.pdf')) return 'pdf';
  if (n.endsWith('.ppt') || n.endsWith('.pptx')) return 'ppt';
  if (n.endsWith('.doc') || n.endsWith('.docx')) return 'doc';
  if (/\.(jpg|jpeg|png|webp|gif)$/.test(n)) return 'image';
  return RESOURCE_TYPES.includes(fallback) ? fallback : 'other';
}

function applyLessonPlanFields(plan, payload = {}) {
  if (payload.title != null) plan.title = String(payload.title).trim().slice(0, 160);
  if (payload.description != null) plan.description = String(payload.description).trim().slice(0, 2000);
  if (payload.subject != null) plan.subject = String(payload.subject).trim().slice(0, 80);
  if (payload.grade != null) plan.grade = String(payload.grade).trim().slice(0, 40);
  if (LESSON_STATUSES.includes(payload.status)) plan.status = payload.status;
  if (payload.objectives != null) plan.objectives = String(payload.objectives).trim().slice(0, 1000);
  if (payload.durationMinutes != null) {
    const n = Number(payload.durationMinutes);
    plan.durationMinutes = Number.isFinite(n) ? Math.min(240, Math.max(0, Math.round(n))) : 0;
  }
  if (payload.favorite != null) plan.favorite = payload.favorite === true;
  if (payload.scheduledDate === null || payload.scheduledDate === '') plan.scheduledDate = null;
  else if (payload.scheduledDate) {
    const d = new Date(payload.scheduledDate);
    if (!Number.isNaN(d.getTime())) plan.scheduledDate = d;
  }
}

async function ensureTeacherResources(schoolId, teacherId) {
  const plans = [
    {
      sourceKey: 'sample:lp-fractions',
      title: 'Fractions and Decimals',
      description: 'Introduce equivalent fractions and convert between fractions and decimals.',
      subject: 'Mathematics',
      grade: 'Grade 4A',
      status: 'planned',
      scheduledDate: daysFromNow(7, 9, 0),
      durationMinutes: 40,
      objectives: 'Learners can identify equivalent fractions and write common fractions as decimals.',
    },
    {
      sourceKey: 'sample:lp-plants',
      title: 'Plant Cells',
      description: 'Explore plant cell parts using diagrams and a short lab observation.',
      subject: 'Science',
      grade: 'Grade 4A',
      status: 'planned',
      scheduledDate: daysFromNow(9, 10, 0),
      durationMinutes: 45,
      objectives: 'Name the main parts of a plant cell and describe the role of the cell wall.',
    },
    {
      sourceKey: 'sample:lp-writing',
      title: 'Narrative Writing',
      description: 'Plan and draft a short story with a clear beginning, middle and end.',
      subject: 'English',
      grade: 'Grade 4A',
      status: 'draft',
      scheduledDate: daysFromNow(10, 11, 0),
      durationMinutes: 40,
      objectives: 'Write a short narrative using sequencing words and descriptive language.',
    },
    {
      sourceKey: 'sample:lp-place-value',
      title: 'Place Value Review',
      description: 'Revise thousands, hundreds, tens and ones with place-value charts.',
      subject: 'Mathematics',
      grade: 'Grade 4A',
      status: 'published',
      scheduledDate: daysFromNow(-3, 9, 0),
      durationMinutes: 40,
      objectives: 'Read and write 4-digit numbers using place value.',
    },
    {
      sourceKey: 'sample:lp-measurement',
      title: 'Measurement Lab',
      description: 'Measure classroom objects in centimetres and metres, then compare results.',
      subject: 'Mathematics',
      grade: 'Grade 4A',
      status: 'in_progress',
      scheduledDate: daysFromNow(0, 9, 0),
      durationMinutes: 40,
      objectives: 'Choose the right unit and measure length accurately to the nearest centimetre.',
    },
    {
      sourceKey: 'sample:lp-storytelling',
      title: 'Oral Storytelling',
      description: 'Retell a familiar story with expression and clear sequencing.',
      subject: 'English',
      grade: 'Grade 4A',
      status: 'draft',
      scheduledDate: null,
      durationMinutes: 30,
      objectives: 'Retell a story using first, next, then and finally.',
    },
  ];

  for (const sample of plans) {
    const existing = await LessonPlan.findOne({ schoolId, teacherId, sourceKey: sample.sourceKey });
    if (existing) continue;
    try {
      await LessonPlan.create({ schoolId, teacherId, ...sample });
    } catch (err) {
      if (err?.code !== 11000) throw err;
    }
  }

  const resources = [
    {
      sourceKey: 'sample:rec-fractions-workbook',
      title: 'Fractions Workbook',
      description: 'Practice sheets for equivalent fractions and simple decimals.',
      subject: 'Mathematics',
      grade: 'Grade 4',
      fileType: 'pdf',
      kind: 'recommended',
      rating: 4.8,
      ratingCount: 120,
      sharedByName: 'School Library',
    },
    {
      sourceKey: 'sample:rec-digestive-slides',
      title: 'Digestive System Slides',
      description: 'Illustrated slides covering the main organs of digestion.',
      subject: 'Science',
      grade: 'Grade 4',
      fileType: 'ppt',
      kind: 'recommended',
      rating: 4.6,
      ratingCount: 85,
      sharedByName: 'Science Department',
    },
    {
      sourceKey: 'sample:rec-kenya-map',
      title: 'Counties of Kenya Map',
      description: 'A labelled map for Social Studies map-work lessons.',
      subject: 'Social Studies',
      grade: 'Grade 4',
      fileType: 'pdf',
      kind: 'recommended',
      rating: 4.7,
      ratingCount: 64,
      sharedByName: 'School Library',
    },
    {
      sourceKey: 'sample:shared-division',
      title: 'Division Word Problems',
      description: 'Word problems that mix sharing and grouping for Grade 4.',
      subject: 'Mathematics',
      grade: 'Grade 4A',
      fileType: 'doc',
      kind: 'shared',
      rating: 4.5,
      ratingCount: 18,
      sharedByName: 'Peter Mwangi',
    },
    {
      sourceKey: 'sample:shared-reading-cards',
      title: 'Guided Reading Cards',
      description: 'Short fiction extracts with comprehension prompts.',
      subject: 'English',
      grade: 'Grade 4A',
      fileType: 'pdf',
      kind: 'shared',
      rating: 4.4,
      ratingCount: 12,
      sharedByName: 'Jane Wanjiku',
    },
    {
      sourceKey: 'sample:tpl-standard',
      title: 'Standard 40-minute lesson',
      description: 'Starter, teach, guided practice, independent task and plenary.',
      subject: '',
      grade: '',
      fileType: 'doc',
      kind: 'template',
      sharedByName: 'School templates',
    },
    {
      sourceKey: 'sample:tpl-inquiry',
      title: 'Inquiry-based science',
      description: 'Question, predict, investigate, record and conclude.',
      subject: 'Science',
      grade: '',
      fileType: 'doc',
      kind: 'template',
      sharedByName: 'School templates',
    },
    {
      sourceKey: 'sample:tpl-literacy',
      title: 'Literacy hour',
      description: 'Shared reading, word work, independent writing and review.',
      subject: 'English',
      grade: '',
      fileType: 'doc',
      kind: 'template',
      sharedByName: 'School templates',
    },
  ];

  for (const sample of resources) {
    const existing = await TeachingResource.findOne({ schoolId, sourceKey: sample.sourceKey });
    if (existing) continue;
    try {
      await TeachingResource.create({ schoolId, teacherId: null, ...sample });
    } catch (err) {
      if (err?.code !== 11000) throw err;
    }
  }
}

router.get('/resources', async (req, res) => {
  try {
    const { schoolId } = await teacherContext(req);
    if (!schoolId) {
      return res.json({
        lessonPlans: [],
        upcoming: [],
        recommended: [],
        shared: [],
        favorites: [],
        templates: [],
        grades: [],
        subjects: [],
      });
    }

    const kids = await Kid.find({ schoolId, active: true }).select('grade');
    const grades = [...new Set(kids.map((k) => k.grade).filter(Boolean))].sort();
    const q = String(req.query.q || '').trim();
    const rx = q ? new RegExp(q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i') : null;

    const planFilter = { schoolId, teacherId: req.user.id, active: { $ne: false }, sourceKey: { $not: /^sample:/ } };
    const resourceFilter = {
      schoolId,
      active: { $ne: false },
      sourceKey: { $not: /^sample:/ },
      $or: [{ teacherId: req.user.id }, { teacherId: null }, { kind: { $in: ['shared', 'recommended', 'template'] } }],
    };
    if (rx) {
      planFilter.$or = [{ title: rx }, { subject: rx }, { description: rx }];
      resourceFilter.$and = [{ $or: [{ title: rx }, { subject: rx }, { description: rx }] }];
    }

    const [plans, resources] = await Promise.all([
      LessonPlan.find(planFilter).sort({ scheduledDate: 1, createdAt: -1 }).limit(200),
      TeachingResource.find(resourceFilter).sort({ createdAt: -1 }).limit(200),
    ]);

    const lessonPlans = plans.map(serializeLessonPlan);
    const serializedResources = resources.map((row) => serializeResource(row, req.user.id));
    const start = startOfDay();
    const upcoming = lessonPlans
      .filter((p) => p.scheduledDate && new Date(p.scheduledDate) >= start && ['planned', 'draft', 'in_progress'].includes(p.status))
      .sort((a, b) => new Date(a.scheduledDate) - new Date(b.scheduledDate));
    const mine = serializedResources.filter((r) => r.kind === 'mine');
    const recommended = serializedResources.filter((r) => r.kind === 'recommended');
    const shared = serializedResources.filter((r) => r.kind === 'shared');
    const templates = serializedResources.filter((r) => r.kind === 'template');
    const favoritePlans = lessonPlans.filter((p) => p.favorite);
    const favoriteResources = serializedResources.filter((r) => r.favorite);
    const subjects = [...new Set([...lessonPlans, ...serializedResources].map((x) => x.subject).filter(Boolean))].sort();

    res.json({
      lessonPlans,
      upcoming,
      recommended,
      shared,
      mine,
      templates,
      favorites: [...favoritePlans.map((p) => ({ ...p, itemType: 'plan' })), ...favoriteResources.map((r) => ({ ...r, itemType: 'resource' }))],
      grades,
      subjects,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/lesson-plans', async (req, res) => {
  try {
    const { schoolId } = await teacherContext(req);
    if (!schoolId) return res.status(400).json({ error: 'No school assigned to this teacher' });
    const payload = req.body || {};
    if (!payload.title?.trim()) return res.status(400).json({ error: 'title is required' });
    const plan = new LessonPlan({
      schoolId,
      teacherId: req.user.id,
      title: String(payload.title).trim().slice(0, 160),
      status: LESSON_STATUSES.includes(payload.status) ? payload.status : 'draft',
    });
    applyLessonPlanFields(plan, payload);
    await plan.save();
    res.status(201).json({ lessonPlan: serializeLessonPlan(plan) });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.put('/lesson-plans/:id', async (req, res) => {
  try {
    const { schoolId } = await teacherContext(req);
    const plan = await LessonPlan.findOne({ _id: req.params.id, schoolId, teacherId: req.user.id, active: { $ne: false } });
    if (!plan) return res.status(404).json({ error: 'Lesson plan not found' });
    applyLessonPlanFields(plan, req.body || {});
    if (!plan.title) return res.status(400).json({ error: 'title is required' });
    await plan.save();
    res.json({ lessonPlan: serializeLessonPlan(plan) });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.post('/lesson-plans/:id/favorite', async (req, res) => {
  try {
    const { schoolId } = await teacherContext(req);
    const plan = await LessonPlan.findOne({ _id: req.params.id, schoolId, teacherId: req.user.id, active: { $ne: false } });
    if (!plan) return res.status(404).json({ error: 'Lesson plan not found' });
    plan.favorite = req.body?.favorite == null ? !plan.favorite : req.body.favorite === true;
    await plan.save();
    res.json({ lessonPlan: serializeLessonPlan(plan) });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.delete('/lesson-plans/:id', async (req, res) => {
  try {
    const { schoolId } = await teacherContext(req);
    const plan = await LessonPlan.findOne({ _id: req.params.id, schoolId, teacherId: req.user.id });
    if (!plan) return res.status(404).json({ error: 'Lesson plan not found' });
    plan.active = false;
    await plan.save();
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/resources', async (req, res) => {
  try {
    const { schoolId } = await teacherContext(req);
    if (!schoolId) return res.status(400).json({ error: 'No school assigned to this teacher' });
    const payload = req.body || {};
    if (!payload.title?.trim()) return res.status(400).json({ error: 'title is required' });
    const originalName = String(payload.originalName || payload.fileName || '').trim();
    const row = await TeachingResource.create({
      schoolId,
      teacherId: req.user.id,
      title: String(payload.title).trim().slice(0, 160),
      description: String(payload.description || '').trim().slice(0, 1000),
      subject: String(payload.subject || '').trim().slice(0, 80),
      grade: String(payload.grade || '').trim().slice(0, 40),
      fileType: fileTypeFromName(originalName, payload.fileType),
      url: String(payload.url || '').trim(),
      thumbnailUrl: String(payload.thumbnailUrl || '').trim(),
      originalName,
      kind: RESOURCE_KINDS.includes(payload.kind) ? payload.kind : 'mine',
      sharedByName: String(payload.sharedByName || '').trim(),
    });
    res.status(201).json({ resource: serializeResource(row, req.user.id) });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.post('/resources/:id/favorite', async (req, res) => {
  try {
    const { schoolId } = await teacherContext(req);
    const row = await TeachingResource.findOne({ _id: req.params.id, schoolId, active: { $ne: false } });
    if (!row) return res.status(404).json({ error: 'Resource not found' });
    const uid = String(req.user.id);
    const has = (row.favoriteUserIds || []).some((id) => String(id) === uid);
    const shouldFav = req.body?.favorite == null ? !has : req.body.favorite === true;
    if (shouldFav && !has) row.favoriteUserIds.push(req.user.id);
    if (!shouldFav && has) {
      row.favoriteUserIds = (row.favoriteUserIds || []).filter((id) => String(id) !== uid);
    }
    await row.save();
    res.json({ resource: serializeResource(row, req.user.id) });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

function serializeOuting(row) {
  return {
    _id: row._id,
    title: row.title,
    location: row.location || '',
    notes: row.notes || '',
    startAt: row.startAt,
    endAt: row.endAt,
    grade: row.grade || '',
    audience: row.audience || '',
    busCount: row.busCount ?? 1,
    teacherCount: row.teacherCount ?? 1,
    status: row.status,
    createdAt: row.createdAt,
  };
}

router.get('/outings', async (req, res) => {
  try {
    const { schoolId } = await teacherContext(req);
    if (!schoolId) return res.json({ outings: [] });
    const outings = await SchoolOuting.find({ schoolId, active: true }).sort({ startAt: 1 }).limit(80);
    res.json({ outings: outings.map(serializeOuting) });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/outings', async (req, res) => {
  try {
    const { schoolId, teacher } = await teacherContext(req);
    if (!schoolId) return res.status(400).json({ error: 'No school linked' });
    const body = req.body || {};
    if (!body.title || !body.startAt) {
      return res.status(400).json({ error: 'title and startAt are required' });
    }
    const startAt = new Date(body.startAt);
    const endAt = body.endAt ? new Date(body.endAt) : null;
    if (Number.isNaN(startAt.getTime())) return res.status(400).json({ error: 'Invalid start date' });
    const outing = await SchoolOuting.create({
      schoolId,
      title: String(body.title).trim().slice(0, 160),
      location: String(body.location || '').trim().slice(0, 160),
      notes: String(body.notes || '').trim().slice(0, 2000),
      startAt,
      endAt: endAt && !Number.isNaN(endAt.getTime()) ? endAt : null,
      grade: String(body.grade || '').trim().slice(0, 40),
      audience: String(body.audience || '').trim().slice(0, 80),
      busCount: Number(body.busCount) > 0 ? Number(body.busCount) : 1,
      teacherCount: Number(body.teacherCount) > 0 ? Number(body.teacherCount) : 1,
      status: ['upcoming', 'completed', 'cancelled'].includes(body.status) ? body.status : 'upcoming',
    });
    const kids = await schoolKids(schoolId, { grade: outing.grade || undefined });
    const items = [];
    for (const kid of kids) {
      for (const parent of kid.parentIds || []) {
        items.push({
          userId: parent._id || parent,
          type: NOTIFICATION_TYPES.ANNOUNCEMENT,
          title: outing.title,
          body: `School trip on ${startAt.toLocaleDateString()}. Please review and grant permission.`,
        });
      }
    }
    if (items.length) await createAndEmitNotifications(getIO(), items);
    res.status(201).json({ outing: serializeOuting(outing), teacherId: teacher?._id });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

function messageClockLabel(value) {
  return formatClock(value);
}

function serializeTeacherConversation(row, parent) {
  const doc = row.toObject ? row.toObject() : row;
  return {
    _id: doc._id,
    type: doc.type || 'direct',
    title: parent?.name || doc.title || 'Parent',
    roleLabel: 'Parent',
    subtitle: doc.subtitle || '',
    photoUrl: parent?.photoUrl || doc.photoUrl || '',
    lastMessage: doc.lastMessage || '',
    lastMessageAt: doc.lastMessageAt,
    timeLabel: messageClockLabel(doc.lastMessageAt),
    unreadCount: doc.staffUnreadCount || 0,
    parentId: doc.parentId || null,
  };
}

function serializeTeacherChatMessage(row, teacherId) {
  const doc = row.toObject ? row.toObject() : row;
  const senderId = doc.senderUserId ? String(doc.senderUserId) : '';
  const mine = senderId ? senderId === String(teacherId) : doc.sender === 'staff';
  return {
    _id: doc._id,
    sender: doc.sender,
    senderName: doc.senderName || '',
    body: doc.body,
    createdAt: doc.createdAt,
    timeLabel: messageClockLabel(doc.createdAt),
    mine,
  };
}

async function teacherMessageContacts(schoolId) {
  const kids = await Kid.find({ schoolId, active: true }).select('name parentIds');
  const byParent = new Map();
  for (const kid of kids) {
    for (const pid of kid.parentIds || []) {
      const id = String(pid);
      if (!byParent.has(id)) byParent.set(id, []);
      byParent.get(id).push(kid.name);
    }
  }
  const parents = byParent.size
    ? await User.find({ _id: { $in: [...byParent.keys()] }, role: 'parent', active: { $ne: false } }).select(
        'name photoUrl',
      )
    : [];
  return parents.map((p) => ({
    _id: p._id,
    name: p.name,
    photoUrl: p.photoUrl || '',
    roleLabel: 'Parent',
    subtitle: (byParent.get(String(p._id)) || []).slice(0, 3).join(', '),
  }));
}

router.get('/messages', async (req, res) => {
  try {
    const { schoolId } = await teacherContext(req);
    if (!schoolId) return res.json({ conversations: [], contacts: [] });
    const [rows, contacts] = await Promise.all([
      Conversation.find({
        schoolId,
        archived: { $ne: true },
        sourceKey: { $not: /^sample:/ },
        $or: [{ counterpartUserId: req.user.id }, { createdByUserId: req.user.id }],
      })
        .sort({ lastMessageAt: -1 })
        .limit(80),
      teacherMessageContacts(schoolId),
    ]);
    const parentIds = [...new Set(rows.map((r) => r.parentId).filter(Boolean))];
    const parents = parentIds.length
      ? await User.find({ _id: { $in: parentIds } }).select('name photoUrl')
      : [];
    const byId = new Map(parents.map((p) => [String(p._id), p]));
    res.json({
      conversations: rows.map((r) => serializeTeacherConversation(r, byId.get(String(r.parentId)))),
      contacts,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/messages', async (req, res) => {
  try {
    const { schoolId, teacher } = await teacherContext(req);
    if (!schoolId) return res.status(400).json({ error: 'No school assigned to this teacher' });
    const parentId = req.body?.parentId;
    const body = String(req.body?.body || '').trim();
    if (!parentId) return res.status(400).json({ error: 'parentId is required' });
    const parent = await User.findOne({ _id: parentId, role: 'parent', active: { $ne: false } }).select(
      'name photoUrl',
    );
    if (!parent) return res.status(404).json({ error: 'Parent not found' });
    const linked = await Kid.findOne({ schoolId, parentIds: parentId, active: true }).select('_id');
    if (!linked) return res.status(403).json({ error: 'Parent is not linked to your school' });

    let convo = await Conversation.findOne({
      schoolId,
      parentId,
      counterpartUserId: req.user.id,
      type: 'direct',
      sourceKey: { $not: /^sample:/ },
    });
    if (!convo) {
      convo = await Conversation.create({
        schoolId,
        parentId,
        counterpartUserId: req.user.id,
        createdByUserId: req.user.id,
        type: 'direct',
        title: teacher?.name || 'Teacher',
        roleLabel: teacher?.jobTitle || 'Teacher',
        avatarKind: 'teacher',
        photoUrl: teacher?.photoUrl || '',
        lastMessage: body,
        lastMessageAt: new Date(),
      });
    }
    if (body) {
      await Message.create({
        conversationId: convo._id,
        sender: 'staff',
        senderUserId: req.user.id,
        senderName: teacher?.name || 'Teacher',
        body,
      });
      convo.lastMessage = body;
      convo.lastMessageAt = new Date();
      convo.staffUnreadCount = 0;
      convo.unreadCount = (convo.unreadCount || 0) + 1;
      convo.archived = false;
      await convo.save();
      await createAndEmitNotifications(getIO(), [
        {
          userId: parentId,
          type: NOTIFICATION_TYPES.MESSAGE,
          title: teacher?.name || 'Teacher',
          body,
          link: `messages/${convo._id}`,
        },
      ]);
      emitChatMessage(getIO(), [parentId], {
        conversationId: String(convo._id),
        type: 'message',
      });
    }
    res.status(201).json({ conversation: serializeTeacherConversation(convo, parent) });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/messages/:id', async (req, res) => {
  try {
    const { schoolId } = await teacherContext(req);
    const convo = await Conversation.findOne({
      _id: req.params.id,
      schoolId,
      $or: [{ counterpartUserId: req.user.id }, { createdByUserId: req.user.id }],
    });
    if (!convo) return res.status(404).json({ error: 'Conversation not found' });
    if (convo.staffUnreadCount) {
      convo.staffUnreadCount = 0;
      await convo.save();
    }
    const [messages, parent] = await Promise.all([
      Message.find({ conversationId: convo._id }).sort({ createdAt: 1 }).limit(200),
      convo.parentId ? User.findById(convo.parentId).select('name photoUrl') : null,
    ]);
    res.json({
      conversation: serializeTeacherConversation(convo, parent),
      messages: messages.map((m) => serializeTeacherChatMessage(m, req.user.id)),
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/messages/:id', async (req, res) => {
  try {
    const { schoolId, teacher } = await teacherContext(req);
    const body = String(req.body?.body || '').trim();
    if (!body) return res.status(400).json({ error: 'Message cannot be empty' });
    const convo = await Conversation.findOne({
      _id: req.params.id,
      schoolId,
      $or: [{ counterpartUserId: req.user.id }, { createdByUserId: req.user.id }],
    });
    if (!convo) return res.status(404).json({ error: 'Conversation not found' });
    const message = await Message.create({
      conversationId: convo._id,
      sender: 'staff',
      senderUserId: req.user.id,
      senderName: teacher?.name || 'Teacher',
      body,
    });
    convo.lastMessage = body;
    convo.lastMessageAt = message.createdAt;
    convo.staffUnreadCount = 0;
    convo.unreadCount = (convo.unreadCount || 0) + 1;
    convo.archived = false;
    await convo.save();
    if (convo.parentId) {
      await createAndEmitNotifications(getIO(), [
        {
          userId: convo.parentId,
          type: NOTIFICATION_TYPES.MESSAGE,
          title: teacher?.name || 'Teacher',
          body,
          link: `messages/${convo._id}`,
        },
      ]);
      emitChatMessage(getIO(), [convo.parentId], {
        conversationId: String(convo._id),
        type: 'message',
      });
    }
    res.status(201).json({
      conversation: serializeTeacherConversation(convo),
      message: serializeTeacherChatMessage(message, req.user.id),
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
