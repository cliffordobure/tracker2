import { Router } from 'express';
import bcrypt from 'bcryptjs';
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
  AnnouncementComment,
  Assignment,
  TeacherNote,
  AttendanceRecord,
  DiaryEntry,
  Assessment,
  AcademicTerm,
  SchoolHoliday,
  SchoolOuting,
  OutingPermission,
  SchoolClass,
  School,
  SupportTicket,
  Route,
  Bus,
  TripSchedule,
  Conversation,
  Message,
  CalendarEvent,
  FeeStatement,
} from '../models/index.js';
import { authenticate, requireRole } from '../middleware/auth.js';
import { getVapidPublicKey } from '../services/push.js';
import { createAndEmitNotifications, NOTIFICATION_TYPES } from '../services/notifications.js';
import { getIO } from '../socket.js';
import { formatClock as formatNairobiClock, formatDateKey, formatDateLabel, formatDayClock, calendarGroup, toIso } from '../lib/clock.js';

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

const DEFAULT_SUBJECTS = [
  'Mathematics',
  'English',
  'Kiswahili',
  'Science',
  'Social Studies',
  'CRE',
  'IRE',
  'Agriculture',
  'Computer',
  'PE',
  'Art',
  'Music',
];

const DEFAULT_TERMS = ['Term 1', 'Term 2', 'Term 3', 'Semester 1', 'Semester 2'];
const DEFAULT_STREAMS = ['East', 'West', 'North', 'South', 'A', 'B', 'C'];
const DEFAULT_GRADES = [
  'PP1',
  'PP2',
  'Grade 1',
  'Grade 2',
  'Grade 3',
  'Grade 4',
  'Grade 5',
  'Grade 6',
  'Grade 7',
  'Grade 8',
  'Grade 9',
  'Form 1',
  'Form 2',
  'Form 3',
  'Form 4',
];

function escapeRegex(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

async function resolveParentSchoolId(parentId, preferredSchoolId) {
  if (preferredSchoolId && /^[a-fA-F0-9]{24}$/.test(String(preferredSchoolId))) {
    const school = await School.findById(preferredSchoolId).select('_id');
    if (school) return school._id;
  }
  const user = await User.findById(parentId).select('schoolId');
  if (user?.schoolId) return user.schoolId;
  const kid = await Kid.findOne({ parentIds: parentId, active: true }).select('schoolId');
  return kid?.schoolId || null;
}

function serializeParentKid(kid) {
  return {
    _id: kid._id,
    name: kid.name,
    grade: kid.grade || '',
    house: kid.house || '',
    section: kid.section || '',
    academicYear: kid.academicYear || '',
    yearOfAdmission: kid.yearOfAdmission || '',
    admissionNo: kid.admissionNo || '',
    dateOfBirth: kid.dateOfBirth || null,
    gender: kid.gender || '',
    bloodGroup: kid.bloodGroup || '',
    rollNo: kid.rollNo || kid.house || '',
    relationship: kid.relationship || '',
    allergies: kid.allergies || '',
    schoolEmail: kid.schoolEmail || '',
    schoolPhone: kid.schoolPhone || '',
    schoolAddress: kid.schoolAddress || '',
    term: kid.term || '',
    stream: kid.stream || '',
    subjects: kid.subjects || [],
    extracurricular: kid.extracurricular || '',
    achievements: kid.achievements || '',
    documents: kid.documents || [],
    health: kid.health || {},
    about: kid.about || '',
    photoUrl: kid.photoUrl || '',
    schoolId: kid.schoolId,
    routeId: kid.routeId,
    active: kid.active !== false,
  };
}

router.get('/kids/add-options', async (req, res) => {
  try {
    const unread = await Notification.countDocuments({ userId: req.user.id, read: { $ne: true } });
    const schoolId = await resolveParentSchoolId(req.user.id, req.query.schoolId);
    const linkedKids = await Kid.find({ parentIds: req.user.id, active: true }).select('schoolId');
    const schoolIds = new Set(linkedKids.map((k) => k.schoolId?.toString()).filter(Boolean));
    const user = await User.findById(req.user.id).select('schoolId');
    if (user?.schoolId) schoolIds.add(user.schoolId.toString());
    if (schoolId) schoolIds.add(schoolId.toString());

    let schools = await School.find(schoolIds.size ? { _id: { $in: [...schoolIds] } } : {})
      .select('name address supportEmail supportPhone')
      .sort({ name: 1 })
      .limit(40);
    if (!schools.length) {
      schools = await School.find().select('name address supportEmail supportPhone').sort({ name: 1 }).limit(40);
    }
    const school = schoolId ? schools.find((s) => s._id.toString() === schoolId.toString()) || schools[0] : schools[0];
    const activeSchoolId = school?._id;

    const [classes, routes, houseDocs, terms] = await Promise.all([
      activeSchoolId ? SchoolClass.find({ schoolId: activeSchoolId, active: { $ne: false } }).select('grade section classCode academicYear subjects').sort({ grade: 1 }) : [],
      activeSchoolId ? Route.find({ schoolId: activeSchoolId, active: { $ne: false } }).select('name').sort({ name: 1 }) : [],
      activeSchoolId ? Kid.distinct('house', { schoolId: activeSchoolId, house: { $nin: [null, ''] } }) : [],
      activeSchoolId ? AcademicTerm.find({ schoolId: activeSchoolId, active: true }).select('name year').sort({ year: -1, startDate: -1 }).limit(8) : [],
    ]);

    const classGrades = [...new Set(classes.map((c) => c.grade).filter(Boolean))];
    const sections = [...new Set(classes.map((c) => c.section || c.classCode).filter(Boolean))];
    const classSubjects = [...new Set(classes.flatMap((c) => (c.subjects || []).map((s) => s.name).filter(Boolean)))];
    const termLabels = [...new Set(terms.map((t) => t.name).filter(Boolean))];
    const year = new Date().getFullYear();
    res.json({
      unread,
      school,
      schools,
      grades: classGrades.length ? classGrades : DEFAULT_GRADES,
      sections: sections.length ? sections : ['A', 'B', 'C'],
      streams: sections.length ? sections : DEFAULT_STREAMS,
      subjects: classSubjects.length ? classSubjects : DEFAULT_SUBJECTS,
      houses: [...new Set([...(houseDocs || []), 'Red', 'Blue', 'Green', 'Yellow'])].filter(Boolean),
      routes: routes.map((r) => ({ _id: r._id, name: r.name })),
      academicYears: [`${year}`, `${year}/${year + 1}`, `${year - 1}/${year}`],
      admissionYears: Array.from({ length: 16 }, (_, i) => String(year - i)),
      terms: termLabels.length ? termLabels : DEFAULT_TERMS,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/schools', async (req, res) => {
  try {
    const q = String(req.query.q || '').trim();
    const filter = q ? { name: { $regex: escapeRegex(q), $options: 'i' } } : {};
    const schools = await School.find(filter)
      .select('name address supportEmail supportPhone')
      .sort({ name: 1 })
      .limit(20);
    res.json({ schools });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

async function resolveOrCreateSchool(parentId, body = {}) {
  if (body.schoolId && /^[a-fA-F0-9]{24}$/.test(String(body.schoolId))) {
    const found = await School.findById(body.schoolId);
    if (found) return found;
  }
  const manualName = String(body.schoolName || '').trim();
  if (manualName) {
    const found = await School.findOne({ name: { $regex: `^${escapeRegex(manualName)}$`, $options: 'i' } });
    if (found) {
      if (body.schoolEmail && !found.supportEmail) found.supportEmail = String(body.schoolEmail).trim().slice(0, 120);
      if (body.schoolPhone && !found.supportPhone) found.supportPhone = String(body.schoolPhone).trim().slice(0, 40);
      if (body.schoolAddress && !found.address) found.address = String(body.schoolAddress).trim().slice(0, 200);
      if (found.isModified()) await found.save();
      return found;
    }
    return School.create({
      name: manualName.slice(0, 120),
      address: String(body.schoolAddress || '').trim().slice(0, 200),
      supportEmail: String(body.schoolEmail || '').trim().slice(0, 120),
      supportPhone: String(body.schoolPhone || '').trim().slice(0, 40),
      location: { lat: -1.3965, lng: 36.7542 },
    });
  }
  const fallbackId = await resolveParentSchoolId(parentId, null);
  return fallbackId ? School.findById(fallbackId) : null;
}

router.post('/kids', async (req, res) => {
  try {
    const name = String(req.body.name || '').trim();
    if (!name) return res.status(400).json({ error: 'Full name is required' });
    const dob = req.body.dateOfBirth ? new Date(req.body.dateOfBirth) : null;
    if (!dob || Number.isNaN(dob.getTime())) return res.status(400).json({ error: 'Date of birth is required' });
    if (dob > new Date()) return res.status(400).json({ error: 'Date of birth cannot be in the future' });
    const gender = String(req.body.gender || '').trim().toLowerCase();
    if (!['male', 'female', 'other'].includes(gender)) return res.status(400).json({ error: 'Gender is required' });
    const relationship = String(req.body.relationship || '').trim();
    if (!relationship) return res.status(400).json({ error: 'Relationship is required' });
    const grade = String(req.body.grade || '').trim();
    if (!grade) return res.status(400).json({ error: 'Class / grade is required' });
    const hasSchool = (req.body.schoolId && /^[a-fA-F0-9]{24}$/.test(String(req.body.schoolId))) || String(req.body.schoolName || '').trim();
    if (!hasSchool) return res.status(400).json({ error: 'School is required' });

    const school = await resolveOrCreateSchool(req.user.id, req.body);
    if (!school) return res.status(400).json({ error: 'School is required' });
    const schoolId = school._id;

    const admissionNo = String(req.body.admissionNo || '').trim().slice(0, 40);
    const allergies = String(req.body.allergies || '').trim().slice(0, 200);
    const house = String(req.body.house || '').trim().slice(0, 40);
    const section = String(req.body.section || '').trim().slice(0, 40);
    const academicYear = String(req.body.academicYear || '').trim().slice(0, 20);
    if (!academicYear) return res.status(400).json({ error: 'Academic year is required' });
    const yearOfAdmission = String(req.body.yearOfAdmission || '').trim().slice(0, 20);
    const schoolEmail = String(req.body.schoolEmail || '').trim().slice(0, 120);
    const schoolPhone = String(req.body.schoolPhone || '').trim().slice(0, 40);
    const schoolAddress = String(req.body.schoolAddress || '').trim().slice(0, 200);
    const term = String(req.body.term || '').trim().slice(0, 40);
    if (!term) return res.status(400).json({ error: 'Term / semester is required' });
    const stream = String(req.body.stream || '').trim().slice(0, 40);
    const subjects = [...new Set((Array.isArray(req.body.subjects) ? req.body.subjects : String(req.body.subjects || '').split(','))
      .map((s) => String(s || '').trim())
      .filter(Boolean))]
      .slice(0, 20);
    const extracurricular = String(req.body.extracurricular || '').trim().slice(0, 200);
    const achievements = String(req.body.achievements || '').trim().slice(0, 200);
    const documents = (Array.isArray(req.body.documents) ? req.body.documents : [])
      .filter((d) => d && d.url)
      .slice(0, 8)
      .map((d) => ({
        url: String(d.url || '').trim().slice(0, 500),
        publicId: String(d.publicId || '').trim().slice(0, 200),
        originalName: String(d.originalName || '').trim().slice(0, 120),
        mimeType: String(d.mimeType || '').trim().slice(0, 80),
      }));
    const about = String(req.body.about || '').trim().slice(0, 800);
    const photoUrl = String(req.body.photoUrl || '').trim().slice(0, 500);
    const photoPublicId = String(req.body.photoPublicId || '').trim().slice(0, 200);
    let routeId = req.body.routeId || null;
    if (routeId) {
      if (!/^[a-fA-F0-9]{24}$/.test(String(routeId))) return res.status(400).json({ error: 'Invalid bus route' });
      const route = await Route.findOne({ _id: routeId, schoolId });
      if (!route) return res.status(400).json({ error: 'Bus route not found for this school' });
    }

    if (admissionNo) {
      const existing = await Kid.findOne({ schoolId, admissionNo, active: true });
      if (existing) {
        const already = (existing.parentIds || []).some((id) => id.toString() === req.user.id);
        if (already) return res.status(400).json({ error: 'This child is already linked to your account' });
        existing.parentIds.push(req.user.id);
        if (!existing.relationship) existing.relationship = relationship;
        if (!existing.allergies && allergies) existing.allergies = allergies;
        await existing.save();
        const populated = await Kid.findById(existing._id)
          .populate('schoolId', 'name location address logoUrl')
          .populate('routeId', 'name');
        return res.status(201).json({ kid: serializeParentKid(populated), linked: true });
      }
    }

    const kid = await Kid.create({
      name: name.slice(0, 80),
      schoolId,
      parentIds: [req.user.id],
      grade,
      house,
      section,
      academicYear,
      yearOfAdmission,
      admissionNo,
      dateOfBirth: dob,
      gender,
      relationship,
      allergies,
      schoolEmail,
      schoolPhone,
      schoolAddress,
      term,
      stream,
      subjects,
      extracurricular,
      achievements,
      documents,
      about,
      photoUrl,
      photoPublicId,
      routeId: routeId || undefined,
    });
    const populated = await Kid.findById(kid._id)
      .populate('schoolId', 'name location address logoUrl')
      .populate('routeId', 'name');
    res.status(201).json({ kid: serializeParentKid(populated), linked: false });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

function fallbackTerm() {
  const y = new Date().getFullYear();
  return {
    name: 'Term 2',
    year: y,
    startDate: new Date(y, 4, 1),
    endDate: new Date(y, 9, 25),
    virtual: true,
  };
}

function serializeTermProgress(term) {
  if (!term) return null;
  const start = new Date(term.startDate);
  const end = new Date(term.endDate);
  const now = new Date();
  const weekMs = 7 * 24 * 60 * 60 * 1000;
  const dayMs = 24 * 60 * 60 * 1000;
  const weeksTotal = Math.max(1, Math.round((end.getTime() - start.getTime()) / weekMs));
  const elapsed = Math.max(0, now.getTime() - start.getTime());
  const weeksCompleted = Math.min(weeksTotal, Math.max(0, Math.floor(elapsed / weekMs)));
  const daysRemaining = Math.max(0, Math.ceil((end.getTime() - now.getTime()) / dayMs));
  const nextReport = new Date(now.getTime() + 38 * dayMs);
  if (nextReport > end) nextReport.setTime(end.getTime());
  return {
    name: term.name,
    year: term.year || start.getFullYear(),
    startDate: term.startDate,
    endDate: term.endDate,
    weeksCompleted,
    weeksTotal,
    daysRemaining,
    nextReportDate: nextReport,
  };
}

async function computeKidHub(parentId, kid) {
  const schoolId = kid.schoolId?._id || kid.schoolId;
  const now = new Date();
  const today = startOfDay();
  const term = schoolId
    ? await AcademicTerm.findOne({
        schoolId,
        active: true,
        startDate: { $lte: now },
        endDate: { $gte: now },
      }).sort({ startDate: -1 })
    : null;
  const displayTerm = term || fallbackTerm();
  const from = term?.startDate || new Date(now.getFullYear(), now.getMonth() - 2, 1);
  const to = term?.endDate || now;
  const prevTerm = schoolId
    ? await AcademicTerm.findOne({
        schoolId,
        active: true,
        endDate: { $lt: from },
      }).sort({ endDate: -1 })
    : null;

  const [academic, behaviour, termMarks, prevAcademic, assignments, klass, unread, remark, classmates, notes, parent] = await Promise.all([
    Assessment.find({ kidId: kid._id, active: true, kind: 'academic', date: { $gte: from, $lte: to } }),
    Assessment.find({ kidId: kid._id, active: true, kind: 'behaviour', date: { $gte: from, $lte: to } }),
    AttendanceRecord.find({ kidId: kid._id, date: { $gte: startOfDay(from), $lte: to } }),
    prevTerm
      ? Assessment.find({
          kidId: kid._id,
          active: true,
          kind: 'academic',
          date: { $gte: prevTerm.startDate, $lte: prevTerm.endDate },
        })
      : [],
    schoolId
      ? Assignment.find({
          schoolId,
          active: true,
          status: { $ne: 'draft' },
          $or: [{ kidIds: kid._id }, { kidIds: { $size: 0 }, grade: kid.grade }, { kidIds: { $exists: false }, grade: kid.grade }],
        })
          .sort({ dueDate: -1, createdAt: -1 })
          .limit(80)
      : [],
    schoolId && kid.grade
      ? SchoolClass.findOne({ schoolId, grade: kid.grade, active: { $ne: false } }).populate('teacherId', 'name photoUrl')
      : null,
    Notification.countDocuments({ userId: parentId, read: { $ne: true } }),
    TeacherNote.findOne({ kidId: kid._id }).populate('teacherId', 'name photoUrl').sort({ createdAt: -1 }),
    schoolId && kid.grade
      ? Kid.find({ schoolId, grade: kid.grade, active: true }).select('_id')
      : [],
    TeacherNote.find({ kidId: kid._id }).populate('teacherId', 'name photoUrl').sort({ createdAt: -1 }).limit(12),
    User.findById(parentId).select('name phone email'),
  ]);

  const avg = academic.length
    ? Math.round(academic.reduce((s, r) => s + (r.score || 0), 0) / academic.length)
    : 0;
  const prevAvg = prevAcademic.length
    ? Math.round(prevAcademic.reduce((s, r) => s + (r.score || 0), 0) / prevAcademic.length)
    : 0;
  const present = termMarks.filter((m) => m.status === 'present').length;
  const absent = termMarks.filter((m) => m.status === 'absent').length;
  const late = termMarks.filter((m) => m.status === 'late').length;
  const excused = termMarks.filter((m) => m.status === 'excused').length;
  const attendancePct = termMarks.length ? Math.round((present / termMarks.length) * 100) : 0;
  const pendingAssignments = assignments.filter((a) => {
    if (a.kidIds?.length && !a.kidIds.some((id) => String(id) === String(kid._id))) return false;
    if (a.grade && kid.grade && a.grade !== kid.grade) return false;
    if (!a.dueDate) return true;
    return new Date(a.dueDate) >= today;
  }).length;
  const behaviourAvg = behaviour.length
    ? behaviour.reduce((s, r) => s + (r.score || 0), 0) / behaviour.length
    : 0;

  const bySubject = new Map();
  for (const row of academic) {
    const subject = row.subject || 'General';
    if (!bySubject.has(subject)) bySubject.set(subject, []);
    bySubject.get(subject).push(row.score || 0);
  }
  const subjects = [...bySubject.entries()]
    .map(([name, scores]) => ({
      name,
      average: Math.round(scores.reduce((s, n) => s + n, 0) / scores.length),
      count: scores.length,
    }))
    .sort((a, b) => b.average - a.average);

  let classPosition = { rank: 0, outOf: classmates.length || 0 };
  if (classmates.length) {
    const peerIds = classmates.map((c) => c._id);
    const peerRows = await Assessment.find({
      kidId: { $in: peerIds },
      active: true,
      kind: 'academic',
      date: { $gte: from, $lte: to },
    }).select('kidId score');
    const totals = new Map();
    for (const row of peerRows) {
      const id = String(row.kidId);
      const cur = totals.get(id) || { sum: 0, n: 0 };
      cur.sum += row.score || 0;
      cur.n += 1;
      totals.set(id, cur);
    }
    const ranked = [...totals.entries()]
      .map(([id, v]) => ({ id, avg: v.n ? v.sum / v.n : 0 }))
      .sort((a, b) => b.avg - a.avg);
    const idx = ranked.findIndex((r) => r.id === String(kid._id));
    classPosition = {
      rank: idx >= 0 ? idx + 1 : ranked.length ? ranked.length : 0,
      outOf: classmates.length,
    };
  }

  const merits = behaviour.filter((r) => (r.score || 0) >= 75).length;
  const demerits = behaviour.filter((r) => (r.score || 0) < 40).length;
  const behaviourTrend = prevAvg && avg > prevAvg ? 'up' : prevAvg && avg < prevAvg ? 'down' : 'steady';

  const activities = [
    ...academic.slice(0, 8).map((r) => ({
      _id: r._id,
      title: `${r.subject || 'Subject'} ${r.title || 'assessment'} completed`,
      subtitle: r.title || r.subject || 'Assessment',
      kind: /quiz/i.test(r.title || '') ? 'quiz' : /test/i.test(r.title || '') ? 'test' : 'academic',
      at: r.date || r.createdAt,
    })),
    ...assignments.slice(0, 6).map((a) => ({
      _id: a._id,
      title: a.title || 'Assignment',
      subtitle: a.subject ? `${a.subject} assignment` : 'Assignment',
      kind: 'assignment',
      at: a.dueDate || a.createdAt,
    })),
  ]
    .sort((a, b) => new Date(b.at) - new Date(a.at))
    .slice(0, 8);

  const teacher = klass?.teacherId;
  return {
    kid: {
      _id: kid._id,
      name: kid.name,
      grade: kid.grade || '',
      section: kid.section || kid.stream || '',
      admissionNo: kid.admissionNo || '',
      rollNo: kid.rollNo || kid.house || '',
      photoUrl: kid.photoUrl || '',
      active: kid.active !== false,
      dateOfBirth: kid.dateOfBirth || null,
      gender: kid.gender || '',
      bloodGroup: kid.bloodGroup || '',
      about: kid.about || '',
      allergies: kid.allergies || '',
      relationship: kid.relationship || '',
      schoolName: kid.schoolId?.name || '',
      classTeacher: teacher?.name || klass?.assistantName || '',
      classTeacherPhoto: teacher?.photoUrl || '',
      routeName: kid.routeId?.name || '',
      stopName: kid.homeStopId?.name || '',
      parentName: parent?.name || '',
      parentPhone: parent?.phone || kid.schoolPhone || '',
      parentEmail: parent?.email || kid.schoolEmail || '',
    },
    metrics: {
      averageScore: avg,
      attendancePct,
      pendingAssignments,
      behaviour: behaviour.length ? behaviourLabel(behaviourAvg) : 'Good',
      improvement: prevAvg ? avg - prevAvg : 0,
      term: displayTerm.name || 'This term',
      subjectsEnrolled: subjects.length,
      classPosition,
    },
    attendance: {
      present,
      absent,
      late,
      excused,
      total: termMarks.length,
      pct: attendancePct,
    },
    subjects,
    activities,
    behaviourOverview: {
      label: behaviour.length ? behaviourLabel(behaviourAvg) : 'Good',
      merits,
      demerits,
      trend: behaviourTrend,
    },
    remark: remark
      ? {
          body: remark.body,
          title: remark.title,
          date: remark.createdAt,
          teacherName: remark.teacherId?.name || teacher?.name || 'Class teacher',
          teacherPhoto: remark.teacherId?.photoUrl || teacher?.photoUrl || '',
        }
      : null,
    notes: notes.map((n) => ({
      _id: n._id,
      title: n.title,
      body: n.body,
      category: n.category,
      date: n.createdAt,
      teacherName: n.teacherId?.name || '',
    })),
    assignments: assignments.slice(0, 20).map((a) => ({
      _id: a._id,
      title: a.title,
      subject: a.subject || '',
      dueDate: a.dueDate,
      status: a.status,
    })),
    term: serializeTermProgress(displayTerm),
    unread,
  };
}

router.get('/kids/:id/summary', async (req, res) => {
  try {
    if (!/^[a-fA-F0-9]{24}$/.test(String(req.params.id))) {
      return res.status(404).json({ error: 'Child not found' });
    }
    const kid = await Kid.findOne({ _id: req.params.id, parentIds: req.user.id, active: true })
      .populate('schoolId', 'name location address logoUrl')
      .populate('routeId', 'name')
      .populate('homeStopId', 'name');
    if (!kid) return res.status(404).json({ error: 'Child not found' });
    res.json(await computeKidHub(req.user.id, kid));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

function ymdKey(d) {
  const x = d instanceof Date ? d : new Date(d);
  if (Number.isNaN(x.getTime())) return '';
  return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}-${String(x.getDate()).padStart(2, '0')}`;
}

function weekdaysEnding(end, count) {
  const days = [];
  const d = startOfDay(end);
  while (days.length < count) {
    const dow = d.getDay();
    if (dow !== 0 && dow !== 6) days.push(new Date(d));
    d.setDate(d.getDate() - 1);
  }
  return days.reverse();
}

function attendanceDayEvents(status) {
  if (!['present', 'late', 'excused'].includes(status)) return [];
  const late = status === 'late';
  return [
    {
      key: 'pickup',
      label: 'Picked Up',
      icon: 'bus',
      time: late ? '07:32 AM' : '07:15 AM',
      punctuality: late ? 'Late' : 'On Time',
    },
    {
      key: 'arrive',
      label: 'Arrived at School',
      icon: 'school',
      time: late ? '08:10 AM' : '07:48 AM',
      punctuality: late ? 'Late' : 'On Time',
    },
  ];
}

function tripEventsForDay(events) {
  const pickup = events.find((e) => e.type === 'picked_up');
  const drop = events.find((e) => e.type === 'dropped_off' && e.tripId?.direction !== 'to_home');
  const rows = [];
  if (pickup) {
    rows.push({
      key: 'pickup',
      label: 'Picked Up',
      icon: 'bus',
      time: formatClock(pickup.at),
      punctuality: punctualityLabel(pickup.at, null, 'completed') || 'On Time',
    });
  }
  if (drop) {
    rows.push({
      key: 'arrive',
      label: 'Arrived at School',
      icon: 'school',
      time: formatClock(drop.at),
      punctuality: punctualityLabel(drop.at, null, 'completed') || 'On Time',
    });
  }
  return rows;
}

async function ensureParentAttendanceSample(kid) {
  const existing = await AttendanceRecord.findOne({ kidId: kid._id }).select('_id');
  if (existing) return;
  const teacher = await User.findOne({
    schoolId: kid.schoolId,
    role: 'teacher',
    active: { $ne: false },
  }).select('_id');
  if (!teacher) return;
  const days = weekdaysEnding(new Date(), 24);
  const lateIndex = Math.max(0, days.length - 8);
  const absentIndex = Math.max(0, days.length - 16);
  try {
    await AttendanceRecord.insertMany(
      days.map((date, i) => ({
        schoolId: kid.schoolId,
        kidId: kid._id,
        teacherId: teacher._id,
        date: startOfDay(date),
        status: i === absentIndex ? 'absent' : i === lateIndex ? 'late' : 'present',
      })),
      { ordered: false }
    );
  } catch (_) {
    /* ignore duplicate sample */
  }
}

router.get('/kids/:id/attendance', async (req, res) => {
  try {
    if (!/^[a-fA-F0-9]{24}$/.test(String(req.params.id))) {
      return res.status(404).json({ error: 'Child not found' });
    }
    const kid = await assertParentKid(req.user.id, req.params.id);
    if (!kid) return res.status(404).json({ error: 'Child not found' });
    const now = new Date();
    const schoolId = kid.schoolId?._id || kid.schoolId;
    const term = schoolId
      ? await AcademicTerm.findOne({
          schoolId,
          active: true,
          startDate: { $lte: now },
          endDate: { $gte: now },
        }).sort({ startDate: -1 })
      : null;
    const from = term?.startDate || new Date(now.getFullYear(), now.getMonth() - 2, 1);
    const to = term?.endDate && term.endDate > now ? now : term?.endDate || now;
    const rangeEnd = startOfDay(to) > startOfDay(now) ? now : to;
    let calendarEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0);
    if (term?.endDate && new Date(term.endDate) > calendarEnd) calendarEnd = new Date(term.endDate);
    const [records, holidays, calendarHolidays, tripEvents] = await Promise.all([
      AttendanceRecord.find({
        kidId: kid._id,
        date: { $gte: startOfDay(from), $lte: rangeEnd },
      }).sort({ date: 1 }),
      schoolId
        ? SchoolHoliday.find({
            schoolId,
            active: { $ne: false },
            date: { $gte: startOfDay(from), $lte: calendarEnd },
          })
        : [],
      schoolId
        ? CalendarEvent.find({
            schoolId,
            active: { $ne: false },
            category: 'holiday',
            startAt: { $gte: startOfDay(from), $lte: calendarEnd },
          })
        : [],
      TripEvent.find({
        kidId: kid._id,
        at: { $gte: startOfDay(from), $lte: rangeEnd },
      }).populate('tripId', 'direction period'),
    ]);

    const holidayNames = new Map();
    for (const h of holidays) holidayNames.set(ymdKey(h.date), h.name || 'Holiday');
    for (const h of calendarHolidays) holidayNames.set(ymdKey(h.startAt), h.title || 'Holiday');

    const eventsByDay = new Map();
    for (const ev of tripEvents) {
      const key = ymdKey(ev.at);
      if (!eventsByDay.has(key)) eventsByDay.set(key, []);
      eventsByDay.get(key).push(ev);
    }

    const recordByDay = new Map(records.map((r) => [ymdKey(r.date), r]));
    const days = [];
    const cursor = startOfDay(from);
    const last = startOfDay(calendarEnd);
    while (cursor <= last) {
      const key = ymdKey(cursor);
      const dow = cursor.getDay();
      const holiday = holidayNames.get(key);
      const rec = recordByDay.get(key);
      let status = 'none';
      if (holiday) status = 'holiday';
      else if (dow === 0 || dow === 6) status = 'no_school';
      else if (rec) status = rec.status;
      else if (cursor < startOfDay(now)) status = 'no_school';
      const live = tripEventsForDay(eventsByDay.get(key) || []);
      days.push({
        date: key,
        status,
        name: holiday || '',
        events: live.length ? live : attendanceDayEvents(status),
        note: rec?.note || '',
      });
      cursor.setDate(cursor.getDate() + 1);
    }

    const marked = records.filter((r) => ['present', 'late', 'absent', 'excused'].includes(r.status));
    const present = marked.filter((r) => r.status === 'present').length;
    const late = marked.filter((r) => r.status === 'late').length;
    const absent = marked.filter((r) => r.status === 'absent').length;
    const schoolDays = marked.length;
    const pct = (n) => (schoolDays ? Math.round((n / schoolDays) * 100) : 0);
    const presentPct = pct(present);
    const firstName = String(kid.name || 'Your child').trim().split(/\s+/)[0];
    const banner =
      presentPct >= 90
        ? { title: 'Great job!', body: `${firstName} has maintained good attendance.` }
        : presentPct >= 75
          ? { title: 'Keep it up', body: `${firstName}'s attendance is on track this term.` }
          : { title: 'Needs attention', body: `${firstName} has missed several school days this term.` };

    res.json({
      kid: diaryKidCard(kid),
      term: term?.name || 'This term',
      termLabel: term?.name ? `This Term (${term.name})` : 'This Term',
      from,
      to: term?.endDate || to,
      summary: {
        presentPct,
        latePct: pct(late),
        absentPct: pct(absent),
        present,
        late,
        absent,
        schoolDays,
        presentLabel: `${presentPct}% Present`,
        lateLabel: `${pct(late)}% Late`,
        absentLabel: `${pct(absent)}% Absent`,
        totalLabel: `${present} / ${schoolDays} Days Present`,
      },
      days,
      banner,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

function formatParentPhone(raw) {
  const digits = String(raw || '').replace(/\D/g, '');
  if (digits.length === 10) return `${digits.slice(0, 4)} ${digits.slice(4, 7)} ${digits.slice(7)}`;
  if (digits.length === 12 && digits.startsWith('254')) {
    return `0${digits.slice(3, 6)} ${digits.slice(6, 9)} ${digits.slice(9)}`;
  }
  return String(raw || '').trim();
}

function healthDocSize(doc) {
  if (typeof attachmentSizeLabel === 'function') return attachmentSizeLabel(doc.bytes);
  const n = Number(doc.bytes) || 0;
  if (n <= 0) return '';
  if (n < 1024 * 1024) return `${Math.max(1, Math.round(n / 1024))} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

function isHealthDocument(doc) {
  const kind = String(doc.kind || '').toLowerCase();
  const name = String(doc.originalName || '').toLowerCase();
  return kind === 'health' || /medical|insurance|health|clinic|immuni/.test(name);
}

async function ensureParentHealthSample(kid) {
  const health = kid.health || {};
  const shots = Array.isArray(health.immunizations) ? health.immunizations : [];
  if (health.conditions || health.notes || shots.length) return kid;
  const first = String(kid.name || 'Your child').trim().split(/\s+/)[0];
  kid.health = {
    conditions: 'Asthma (Mild)',
    medication: 'Salbutamol Inhaler (As needed)',
    doctor: 'Dr. Brian Otieno',
    hospital: 'Aga Khan Hospital, Nairobi',
    insurance: 'Jubilee Insurance',
    policyNumber: 'JUB/2026/0012345',
    notes: `${first} uses an inhaler occasionally for asthma, especially during cold weather or after physical activity.`,
    immunizations: [
      { name: 'MMR (Measles, Mumps, Rubella)', date: new Date('2022-06-15'), status: 'up_to_date' },
      { name: 'Polio (IPV)', date: new Date('2021-03-10'), status: 'up_to_date' },
      { name: 'DTP (Diphtheria, Tetanus, Pertussis)', date: new Date('2021-03-10'), status: 'up_to_date' },
    ],
  };
  if (!kid.bloodGroup) kid.bloodGroup = 'O+';
  if (!kid.allergies) kid.allergies = 'Peanuts, Penicillin';
  const docs = Array.isArray(kid.documents) ? kid.documents : [];
  if (!docs.some(isHealthDocument)) {
    const sampleUrl = 'https://www.w3.org/WAI/ER/tests/xhtml/testfiles/resources/pdf/dummy.pdf';
    kid.documents = [
      ...docs,
      {
        url: sampleUrl,
        publicId: '',
        originalName: 'Medical Report.pdf',
        mimeType: 'application/pdf',
        kind: 'health',
        bytes: 1258291,
      },
      {
        url: sampleUrl,
        publicId: '',
        originalName: 'Insurance Card.pdf',
        mimeType: 'application/pdf',
        kind: 'health',
        bytes: 843776,
      },
    ];
  }
  try {
    await kid.save();
  } catch (_) {
    /* ignore duplicate sample */
  }
  return kid;
}

function serializeParentHealth(kid, parent) {
  const health = kid.health || {};
  const relationship = kid.relationship || 'Parent';
  const immunizations = (health.immunizations || []).map((shot) => ({
    name: shot.name,
    date: shot.date,
    status: shot.status || 'up_to_date',
    statusLabel: shot.status === 'due' ? 'Due' : 'Up to date',
  }));
  const documents = (kid.documents || []).filter(isHealthDocument).map((doc) => ({
    url: doc.url || '',
    name: doc.originalName || 'Document',
    mimeType: doc.mimeType || '',
    sizeLabel: healthDocSize(doc),
    kind: 'pdf',
  }));
  return {
    kid: diaryKidCard(kid),
    emergencyContact: {
      name: parent?.name || 'Parent',
      relationship,
      role: 'Primary Contact',
      phone: formatParentPhone(parent?.phone || kid.schoolPhone || ''),
      email: parent?.email || kid.schoolEmail || '',
      photoUrl: parent?.photoUrl || '',
    },
    medical: {
      bloodGroup: kid.bloodGroup || '—',
      allergies: kid.allergies || 'None recorded',
      conditions: health.conditions || 'None recorded',
      medication: health.medication || 'None',
      doctor: health.doctor || '—',
      hospital: health.hospital || '—',
      insurance: health.insurance || '—',
      policyNumber: health.policyNumber || '—',
    },
    notes: health.notes || '',
    immunizations,
    documents,
  };
}

router.get('/kids/:id/health', async (req, res) => {
  try {
    if (!/^[a-fA-F0-9]{24}$/.test(String(req.params.id))) {
      return res.status(404).json({ error: 'Child not found' });
    }
    const kid = await assertParentKid(req.user.id, req.params.id);
    if (!kid) return res.status(404).json({ error: 'Child not found' });
    const parent = await User.findById(req.user.id).select('name phone email photoUrl');
    res.json(serializeParentHealth(kid, parent));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

const PARENT_DOC_FILTERS = ['All', 'School', 'Student', 'Transport'];

function classifyParentDocument(doc, { source = 'kid', name = '' } = {}) {
  const kind = String(doc?.kind || '').toLowerCase();
  const hay = `${kind} ${name} ${doc?.originalName || doc?.name || ''}`.toLowerCase();
  if (kind === 'transport' || /transport|bus route|vehicle|route policy/.test(hay)) return 'Transport';
  if (kind === 'school' || source === 'announcement' || source === 'fee') return 'School';
  if (kind === 'health') return 'Student';
  if (source === 'diary' || source === 'leave') return 'Student';
  if (/admission|handbook|policy|school letter|notice/.test(hay)) return 'School';
  if (/report card|assessment|homework|worksheet/.test(hay)) return 'Student';
  return 'Student';
}

function parentDocumentIconKind(doc) {
  const mime = String(doc?.mimeType || '').toLowerCase();
  const name = String(doc?.originalName || doc?.name || '').toLowerCase();
  if (mime.startsWith('image/') || /\.(jpe?g|png|gif|webp)($|\?)/i.test(name)) return 'image';
  if (mime.includes('pdf') || /\.pdf($|\?)/i.test(name)) return 'pdf';
  if (/word|document|msword|officedocument/.test(mime) || /\.(docx?|rtf)($|\?)/i.test(name)) return 'doc';
  return 'file';
}

function serializeParentDocumentItem(doc, meta = {}) {
  const name = doc.originalName || doc.name || doc.attachmentName || 'Document';
  const category = meta.category || classifyParentDocument(doc, { source: meta.source, name });
  return {
    id: meta.id,
    name,
    category,
    source: meta.source || 'kid',
    kidId: meta.kidId ? String(meta.kidId) : null,
    kidName: meta.kidName || '',
    url: doc.url || doc.attachmentUrl || '',
    mimeType: doc.mimeType || '',
    sizeLabel: attachmentSizeLabel(doc.bytes || doc.attachmentSize || 0),
    iconKind: parentDocumentIconKind({ ...doc, originalName: name, mimeType: doc.mimeType }),
    date: meta.date || null,
    uploadedBy: doc.uploadedBy || meta.uploadedBy || 'school',
    canDelete: doc.uploadedBy === 'parent' || meta.canDelete === true,
  };
}

async function ensureParentDocumentsSample(kids) {
  if (!kids?.length) return kids;
  const kid = kids[0];
  const docs = Array.isArray(kid.documents) ? kid.documents : [];
  if (docs.length) return kids;
  const sampleUrl = 'https://www.w3.org/WAI/ER/tests/xhtml/testfiles/resources/pdf/dummy.pdf';
  kid.documents = [
    {
      url: sampleUrl,
      publicId: '',
      originalName: 'Admission Letter.pdf',
      mimeType: 'application/pdf',
      kind: 'school',
      bytes: 524288,
      uploadedBy: 'school',
    },
    {
      url: sampleUrl,
      publicId: '',
      originalName: 'Transport Policy.pdf',
      mimeType: 'application/pdf',
      kind: 'transport',
      bytes: 412672,
      uploadedBy: 'school',
    },
    {
      url: sampleUrl,
      publicId: '',
      originalName: 'Report Card Term 1.pdf',
      mimeType: 'application/pdf',
      kind: 'student',
      bytes: 943718,
      uploadedBy: 'school',
    },
  ];
  try {
    await kid.save();
  } catch (_) {
    /* ignore */
  }
  return kids;
}

async function buildParentDocuments(parentId, query = {}) {
  let kids = await Kid.find({ parentIds: parentId, active: true })
    .populate('schoolId', 'name')
    .populate('routeId', 'name');
  const kidFilter = query.kidId ? String(query.kidId) : '';
  const scopedKids = kidFilter ? kids.filter((k) => String(k._id) === kidFilter) : kids;
  const schoolIds = [...new Set(scopedKids.map((k) => k.schoolId?._id || k.schoolId).filter(Boolean))];
  const kidIds = scopedKids.map((k) => k._id);
  const from = startOfDay(new Date(Date.now() - 180 * 24 * 60 * 60 * 1000));

  const [diaryEntries, announcements, statements, leaves] = await Promise.all([
    kidIds.length
      ? DiaryEntry.find({
          ...parentDiaryMatch(scopedKids, schoolIds),
          date: { $gte: from },
          'media.0': { $exists: true },
        })
          .populate('teacherId', 'name')
          .sort({ date: -1 })
          .limit(60)
      : [],
    schoolIds.length
      ? Announcement.find({
          schoolId: { $in: schoolIds },
          active: { $ne: false },
          attachmentUrl: { $nin: [null, ''] },
        })
          .sort({ publishedAt: -1 })
          .limit(40)
      : [],
    kidIds.length ? FeeStatement.find({ kidId: { $in: kidIds }, statementUrl: { $nin: [null, ''] } }).sort({ createdAt: -1 }).limit(20) : [],
    kidIds.length
      ? LeaveRequest.find({ parentId, kidId: { $in: kidIds }, attachmentUrl: { $nin: [null, ''] } })
          .populate('kidId', 'name')
          .sort({ createdAt: -1 })
          .limit(30)
      : [],
  ]);

  const items = [];

  for (const kid of scopedKids) {
    for (let i = 0; i < (kid.documents || []).length; i += 1) {
      const doc = kid.documents[i];
      if (!doc?.url) continue;
      items.push(
        serializeParentDocumentItem(doc, {
          id: `kid:${kid._id}:${i}`,
          source: 'kid',
          kidId: kid._id,
          kidName: kid.name,
          date: kid.updatedAt || kid.createdAt,
        }),
      );
    }
  }

  for (const entry of diaryEntries) {
    const applicable = scopedKids.filter((k) => diaryAppliesToKid(entry, k));
    if (!applicable.length) continue;
    const kidLabel = applicable.map((k) => k.name).join(', ');
    const kidRef = applicable[0];
    for (let i = 0; i < (entry.media || []).length; i += 1) {
      const media = entry.media[i];
      if (!media?.url) continue;
      items.push(
        serializeParentDocumentItem(
          {
            url: media.url,
            originalName: media.originalName || `${entry.title || 'Diary'} attachment`,
            mimeType: media.resourceType === 'raw' ? 'application/pdf' : 'image/jpeg',
            bytes: media.bytes || 0,
            kind: 'diary',
          },
          {
            id: `diary:${entry._id}:${i}`,
            source: 'diary',
            kidId: kidRef._id,
            kidName: kidLabel,
            date: entry.date || entry.createdAt,
            uploadedBy: 'school',
          },
        ),
      );
    }
  }

  for (const ann of announcements) {
    if (!ann.attachmentUrl) continue;
    items.push(
      serializeParentDocumentItem(
        {
          url: ann.attachmentUrl,
          originalName: ann.attachmentName || ann.title || 'School announcement',
          mimeType: '',
          bytes: ann.attachmentSize || 0,
          kind: 'school',
        },
        {
          id: `announcement:${ann._id}`,
          source: 'announcement',
          date: ann.publishedAt || ann.createdAt,
          uploadedBy: 'school',
        },
      ),
    );
  }

  for (const stmt of statements) {
    if (!stmt.statementUrl) continue;
    const kid = scopedKids.find((k) => String(k._id) === String(stmt.kidId));
    items.push(
      serializeParentDocumentItem(
        {
          url: stmt.statementUrl,
          originalName: 'Fee Statement.pdf',
          mimeType: 'application/pdf',
          bytes: 0,
          kind: 'school',
        },
        {
          id: `fee:${stmt._id}`,
          source: 'fee',
          kidId: kid?._id,
          kidName: kid?.name || '',
          date: stmt.updatedAt || stmt.createdAt,
          uploadedBy: 'school',
        },
      ),
    );
  }

  for (const leave of leaves) {
    if (!leave.attachmentUrl) continue;
    const kid = leave.kidId && typeof leave.kidId === 'object' ? leave.kidId : scopedKids.find((k) => String(k._id) === String(leave.kidId));
    items.push(
      serializeParentDocumentItem(
        {
          url: leave.attachmentUrl,
          originalName: leave.attachmentName || 'Leave attachment',
          mimeType: '',
          bytes: 0,
          kind: 'leave',
        },
        {
          id: `leave:${leave._id}`,
          source: 'leave',
          kidId: kid?._id || leave.kidId,
          kidName: kid?.name || '',
          date: leave.createdAt,
          uploadedBy: 'parent',
        },
      ),
    );
  }

  items.sort((a, b) => new Date(b.date || 0).getTime() - new Date(a.date || 0).getTime());

  const category = String(query.category || 'all').trim();
  const q = String(query.q || '').trim().toLowerCase();
  let filtered = items;
  if (category && category.toLowerCase() !== 'all') {
    filtered = filtered.filter((d) => d.category.toLowerCase() === category.toLowerCase());
  }
  if (q) {
    filtered = filtered.filter(
      (d) =>
        d.name.toLowerCase().includes(q)
        || d.category.toLowerCase().includes(q)
        || d.kidName.toLowerCase().includes(q),
    );
  }

  return {
    documents: filtered,
    kids: scopedKids.map((k) => ({ _id: k._id, name: k.name, grade: k.grade || '' })),
    filters: PARENT_DOC_FILTERS,
  };
}

router.get('/documents', async (req, res) => {
  try {
    const payload = await buildParentDocuments(req.user.id, req.query);
    res.json(payload);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/documents', async (req, res) => {
  try {
    const { kidId, category, file } = req.body || {};
    if (!kidId) return res.status(400).json({ error: 'kidId is required' });
    if (!file?.url) return res.status(400).json({ error: 'Uploaded file is required' });

    const kid = await assertParentKid(req.user.id, kidId);
    if (!kid) return res.status(404).json({ error: 'Child not found' });

    const cat = String(category || 'Student');
    const kind =
      cat === 'Transport' ? 'transport' : cat === 'School' ? 'school' : cat === 'Student' ? 'student' : 'general';
    const doc = {
      url: String(file.url || '').trim().slice(0, 500),
      publicId: String(file.publicId || '').trim().slice(0, 200),
      originalName: String(file.originalName || 'Document').trim().slice(0, 120),
      mimeType: String(file.mimeType || '').trim().slice(0, 80),
      bytes: Number(file.bytes) || 0,
      kind,
      uploadedBy: 'parent',
    };
    if (!Array.isArray(kid.documents)) kid.documents = [];
    if (kid.documents.length >= 20) {
      return res.status(400).json({ error: 'Document limit reached for this child (20 max)' });
    }
    kid.documents.push(doc);
    await kid.save();

    const idx = kid.documents.length - 1;
    const serialized = serializeParentDocumentItem(doc, {
      id: `kid:${kid._id}:${idx}`,
      source: 'kid',
      kidId: kid._id,
      kidName: kid.name,
      date: new Date(),
      canDelete: true,
    });
    res.status(201).json({ document: serialized });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.delete('/documents/:kidId/:index', async (req, res) => {
  try {
    const kid = await assertParentKid(req.user.id, req.params.kidId);
    if (!kid) return res.status(404).json({ error: 'Child not found' });
    const index = Number(req.params.index);
    if (!Number.isInteger(index) || index < 0 || index >= (kid.documents || []).length) {
      return res.status(404).json({ error: 'Document not found' });
    }
    const doc = kid.documents[index];
    if (doc.uploadedBy !== 'parent') {
      return res.status(403).json({ error: 'Only documents you uploaded can be removed' });
    }
    kid.documents.splice(index, 1);
    await kid.save();
    res.json({ ok: true });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

function feeLineStatus(total, paid) {
  const t = Number(total) || 0;
  const p = Number(paid) || 0;
  if (t > 0 && p >= t) return 'paid';
  if (p <= 0) return 'unpaid';
  return 'partial';
}

function feeStatusLabel(status) {
  if (status === 'paid') return 'Paid';
  if (status === 'unpaid') return 'Unpaid';
  return 'Partial';
}

function kesAmount(n) {
  return Math.round(Number(n) || 0).toLocaleString('en-KE');
}

function daysUntil(date) {
  if (!date) return null;
  const a = startOfDay(date);
  const b = startOfDay();
  return Math.round((a.getTime() - b.getTime()) / 86400000);
}

function dueInLabel(days) {
  if (days == null) return '';
  if (days === 0) return 'Due today';
  if (days === 1) return 'Due in 1 day';
  if (days > 1) return `Due in ${days} days`;
  if (days === -1) return '1 day overdue';
  return `${Math.abs(days)} days overdue`;
}

function serializeFeeStatement(row, { kid, school, terms = [] }) {
  const doc = row.toObject ? row.toObject() : row;
  const lines = (doc.lines || []).map((line) => {
    const total = Number(line.total) || 0;
    const paid = Number(line.paid) || 0;
    const balance = Math.max(0, total - paid);
    const status = feeLineStatus(total, paid);
    return {
      description: line.description,
      category: line.category || '',
      total,
      paid,
      balance,
      status,
      statusLabel: feeStatusLabel(status),
      totalLabel: kesAmount(total),
      paidLabel: kesAmount(paid),
      balanceLabel: kesAmount(balance),
    };
  });
  const total = lines.reduce((s, l) => s + l.total, 0);
  const paid = lines.reduce((s, l) => s + l.paid, 0);
  const outstanding = Math.max(0, total - paid);
  const status = feeLineStatus(total, paid);
  const dueDays = daysUntil(doc.nextDueDate);
  const history = (doc.payments || [])
    .slice()
    .sort((a, b) => new Date(b.at) - new Date(a.at))
    .map((p) => ({
      _id: p._id,
      at: p.at,
      description: p.description,
      method: p.method || '',
      amount: p.amount,
      amountLabel: kesAmount(p.amount),
      reference: p.reference || '',
    }));
  const upcoming = (doc.upcoming || []).map((u) => {
    const days = daysUntil(u.dueDate);
    return {
      dueDate: u.dueDate,
      description: u.description,
      subtitle: u.subtitle || '',
      amount: u.amount,
      amountLabel: kesAmount(u.amount),
      dueIn: dueInLabel(days),
      days,
    };
  });
  return {
    kid: diaryKidCard(kid),
    term: {
      _id: doc.termId || null,
      label: doc.termLabel || 'This Term',
    },
    terms: terms.map((t) => ({
      _id: t._id,
      label: t.year ? `${t.name} (${t.year})` : t.name,
    })),
    currency: doc.currency || 'KES',
    overview: {
      total,
      paid,
      outstanding,
      nextDueDate: doc.nextDueDate,
      dueDays,
      dueLabel: dueDays == null ? '' : dueDays >= 0 ? `In ${dueDays} days` : `${Math.abs(dueDays)} days overdue`,
      totalLabel: kesAmount(total),
      paidLabel: kesAmount(paid),
      outstandingLabel: kesAmount(outstanding),
    },
    lines,
    totals: {
      total,
      paid,
      outstanding,
      status,
      statusLabel: feeStatusLabel(status),
      totalLabel: kesAmount(total),
      paidLabel: kesAmount(paid),
      outstandingLabel: kesAmount(outstanding),
    },
    history,
    upcoming,
    methods: [
      { key: 'mpesa', label: 'MPESA', hint: 'Paybill or till number from the accounts office' },
      { key: 'card', label: 'Card Payment', hint: 'Visa and Mastercard accepted at the office' },
      { key: 'bank', label: 'Bank Transfer', hint: 'Use the school bank details on your statement' },
      { key: 'school', label: 'Pay at School', hint: 'Accounts office, weekdays 8:00 AM – 4:00 PM' },
    ],
    note:
      doc.note ||
      'Please ensure all fees are paid before the due date to avoid late payment charges. For payment plans or queries, contact the school accounts office.',
    office: {
      phone: formatParentPhone(school?.supportPhone || ''),
      rawPhone: school?.supportPhone || '',
      email: school?.supportEmail || '',
      hours: school?.supportHours || 'Weekdays 8:00 AM – 4:00 PM',
    },
    statementUrl: doc.statementUrl || '',
  };
}

router.get('/kids/:id/payments', async (req, res) => {
  try {
    if (!/^[a-fA-F0-9]{24}$/.test(String(req.params.id))) {
      return res.status(404).json({ error: 'Child not found' });
    }
    const linked = await assertParentKid(req.user.id, req.params.id);
    if (!linked) return res.status(404).json({ error: 'Child not found' });
    const kid = await Kid.findById(linked._id).populate('schoolId', 'name address supportPhone supportEmail supportHours');
    if (!kid) return res.status(404).json({ error: 'Child not found' });
    const schoolId = kid.schoolId?._id || kid.schoolId;
    const now = new Date();
    const terms = schoolId
      ? await AcademicTerm.find({ schoolId, active: true }).sort({ startDate: -1 }).limit(8)
      : [];
    const current = terms.find((t) => t.startDate <= now && t.endDate >= now) || terms[0] || null;
    let termId = req.query.termId;
    if (termId && !/^[a-fA-F0-9]{24}$/.test(String(termId))) termId = '';
    let statement = termId
      ? await FeeStatement.findOne({ kidId: kid._id, termId })
      : await FeeStatement.findOne({ kidId: kid._id, ...(current?._id ? { termId: current._id } : {}) }).sort({ createdAt: -1 });
    if (!statement) statement = await FeeStatement.findOne({ kidId: kid._id }).sort({ createdAt: -1 });
    if (!statement) return res.status(404).json({ error: 'No fee statement found' });
    const school = kid.schoolId && typeof kid.schoolId === 'object' ? kid.schoolId : null;
    res.json(serializeFeeStatement(statement, { kid, school, terms }));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/kids/:id/bus', async (req, res) => {
  try {
    if (!/^[a-fA-F0-9]{24}$/.test(String(req.params.id))) {
      return res.status(404).json({ error: 'Child not found' });
    }
    const linked = await assertParentKid(req.user.id, req.params.id);
    if (!linked) return res.status(404).json({ error: 'Child not found' });
    const kid = await Kid.findById(linked._id)
      .populate('schoolId', 'name address supportPhone supportEmail supportHours')
      .populate('homeStopId', 'name location type')
      .populate('routeId', 'name');
    if (!kid) return res.status(404).json({ error: 'Child not found' });
    const school = kid.schoolId && typeof kid.schoolId === 'object' ? kid.schoolId : null;
    const routeId = kid.routeId?._id || kid.routeId || null;

    const [schedules, latestTrip, liveTrip] = await Promise.all([
      routeId
        ? TripSchedule.find({ routeId, active: true })
            .populate('busId')
            .populate('driverId', 'name phone')
        : [],
      Trip.findOne({ kidIds: kid._id })
        .sort({ scheduledFor: -1, startedAt: -1, createdAt: -1 })
        .populate('busId')
        .populate('driverId', 'name phone')
        .populate('routeId', 'name'),
      Trip.findOne({ kidIds: kid._id, status: 'active' }).select('_id kidIds status'),
    ]);

    const morning = schedules.find((s) => s.period === 'morning' || s.direction === 'to_school') || schedules[0] || null;
    const afternoon = schedules.find((s) => s.period === 'afternoon' || s.direction === 'to_home') || null;
    let bus = morning?.busId || afternoon?.busId || latestTrip?.busId || null;
    if (bus && (typeof bus !== 'object' || bus.plate == null && bus.seats == null && !bus.label)) {
      bus = await Bus.findById(bus._id || bus);
    }

    if (!bus && !routeId && !latestTrip) {
      return res.json({
        kid: diaryKidCard(kid),
        empty: true,
        message: 'No bus is assigned to this child yet.',
      });
    }

    const driver = morning?.driverId || afternoon?.driverId || latestTrip?.driverId || null;
    const resolvedRouteId = routeId || latestTrip?.routeId?._id || latestTrip?.routeId || bus?.routeId || null;
    const stops = resolvedRouteId ? await Stop.find({ routeId: resolvedRouteId }).sort({ order: 1 }) : [];
    const homeStop =
      stops.find((s) => String(s._id) === String(kid.homeStopId?._id || kid.homeStopId)) ||
      kid.homeStopId ||
      stops.find((s) => s.type === 'home' || s.type !== 'school');
    const schoolStop = stops.find((s) => s.type === 'school');
    const onBoardCount = liveTrip
      ? (liveTrip.kidIds || []).length
      : resolvedRouteId
        ? await Kid.countDocuments({ routeId: resolvedRouteId, active: true })
        : 0;

    const morningStart = morning?.scheduledTime || '06:30';
    const afternoonStart = afternoon?.scheduledTime || '15:00';
    const pickupTime = addClockMinutes(morningStart, 15);
    const arrivalTime = addClockMinutes(morningStart, 60);
    const afternoonDrop = addClockMinutes(afternoonStart, 60);

    const monday = mondayOfThisWeek();
    const weekEnd = new Date(monday);
    weekEnd.setDate(monday.getDate() + 7);
    const weekTrips = await Trip.find({
      kidIds: kid._id,
      $or: [
        { serviceDate: { $gte: monday, $lt: weekEnd } },
        { scheduledFor: { $gte: monday, $lt: weekEnd } },
        { startedAt: { $gte: monday, $lt: weekEnd } },
      ],
    }).select('status period direction serviceDate scheduledFor startedAt');

    const weekdays = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    const weekStatuses = weekdays.map((label, i) => {
      const day = new Date(monday);
      day.setDate(monday.getDate() + i);
      const trip = pickTripForDay(weekTrips, day);
      const applies = scheduleAppliesOnDay(day, schedules);
      const { status, label: statusLabel } = weekStatusFromTrip(trip, day, applies);
      return {
        key: label.toLowerCase(),
        day: label,
        date: day,
        dateLabel: day.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }),
        status,
        label: statusLabel,
      };
    });

    const pickupName = homeStop?.name || 'Home stop';
    const dropName = school?.name || schoolStop?.name || 'School';
    const pickupAddress = homeStop?.name && homeStop.name !== pickupName ? homeStop.name : '';
    const dropAddress = schoolStop?.name && schoolStop.name !== dropName ? schoolStop.name : school?.address || '';
    const active = bus?.active !== false && (Boolean(liveTrip) || Boolean(morning) || Boolean(latestTrip));
    const first = String(kid.name || 'your child').trim().split(/\s+/)[0];

    res.json({
      kid: diaryKidCard(kid),
      empty: false,
      bus: {
        name: busDisplayName(bus),
        plate: bus?.plate || '',
        status: active ? 'Active' : 'Inactive',
        driver: {
          name: driver?.name || '',
          phone: formatParentPhone(driver?.phone || ''),
          rawPhone: driver?.phone || '',
        },
        assistant: {
          name: bus?.assistantName || '',
          phone: formatParentPhone(bus?.assistantPhone || ''),
          rawPhone: bus?.assistantPhone || '',
        },
      },
      route: {
        name: kid.routeId?.name || latestTrip?.routeId?.name || '',
        totalStops: stops.length || 0,
        pickup: {
          kind: 'Pickup Stop',
          name: pickupName,
          address: pickupAddress,
          time: pickupTime,
        },
        dropoff: {
          kind: 'Drop-off (School)',
          name: dropName,
          address: dropAddress || 'School Main Gate',
          time: arrivalTime,
        },
        stops: stops.map((s) => ({
          _id: s._id,
          name: s.name,
          type: s.type,
          order: s.order,
          home: String(s._id) === String(homeStop?._id || homeStop),
        })),
      },
      schedule: {
        morning: {
          title: 'Morning (To School)',
          starts: formatClock(morningStart),
          arrival: arrivalTime,
        },
        afternoon: {
          title: 'Afternoon (From School)',
          starts: formatClock(afternoonStart),
          dropoff: afternoonDrop,
        },
        note: 'Timings may vary by 5–10 minutes due to traffic.',
      },
      weekStatuses,
      info: {
        capacity: bus?.seats ? `${bus.seats} Seats` : '—',
        onBoard: onBoardCount || 0,
        safety: bus?.safetyFeatures || 'GPS, CCTV, First Aid',
        year: bus?.year || 2022,
      },
      notes: [
        `Please be at the pickup point 5 minutes before the scheduled time.`,
        `Contact the driver or school transport office for any delays or issues.`,
        `For safety, ${first} must remain seated while the bus is in motion.`,
      ],
      transportOffice: {
        phone: formatParentPhone(school?.supportPhone || ''),
        rawPhone: school?.supportPhone || '',
        email: school?.supportEmail || '',
        hours: school?.supportHours || '',
      },
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/kids/:id/assessments', async (req, res) => {
  try {
    if (!/^[a-fA-F0-9]{24}$/.test(String(req.params.id))) {
      return res.status(404).json({ error: 'Child not found' });
    }
    const kid = await assertParentKid(req.user.id, req.params.id);
    if (!kid) return res.status(404).json({ error: 'Child not found' });
    const kind = ['academic', 'behaviour', 'skill'].includes(req.query.kind) ? req.query.kind : 'academic';
    const now = new Date();
    const schoolId = kid.schoolId?._id || kid.schoolId;
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
    const rows = await Assessment.find({
      kidId: kid._id,
      active: true,
      kind,
      date: { $gte: from, $lte: to },
    })
      .populate('teacherId', 'name')
      .sort({ date: -1 });
    res.json({ assessments: rows, kind, term: term?.name || 'This term' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.patch('/kids/:id', async (req, res) => {
  try {
    if (!/^[a-fA-F0-9]{24}$/.test(String(req.params.id))) {
      return res.status(404).json({ error: 'Child not found' });
    }
    const kid = await assertParentKid(req.user.id, req.params.id);
    if (!kid) return res.status(404).json({ error: 'Child not found' });
    if (req.body.photoUrl !== undefined) kid.photoUrl = String(req.body.photoUrl || '').trim().slice(0, 500);
    if (req.body.photoPublicId !== undefined) kid.photoPublicId = String(req.body.photoPublicId || '').trim().slice(0, 200);
    if (req.body.name !== undefined) {
      const name = String(req.body.name || '').trim();
      if (!name) return res.status(400).json({ error: 'name is required' });
      kid.name = name.slice(0, 80);
    }
    if (req.body.about !== undefined) kid.about = String(req.body.about || '').trim().slice(0, 800);
    if (req.body.allergies !== undefined) kid.allergies = String(req.body.allergies || '').trim().slice(0, 200);
    if (req.body.bloodGroup !== undefined) kid.bloodGroup = String(req.body.bloodGroup || '').trim().slice(0, 8);
    if (req.body.rollNo !== undefined) kid.rollNo = String(req.body.rollNo || '').trim().slice(0, 20);
    if (req.body.section !== undefined) kid.section = String(req.body.section || '').trim().slice(0, 40);
    if (req.body.admissionNo !== undefined) kid.admissionNo = String(req.body.admissionNo || '').trim().slice(0, 40);
    if (req.body.gender !== undefined) {
      const gender = String(req.body.gender || '').trim().toLowerCase();
      kid.gender = ['male', 'female', 'other', ''].includes(gender) ? gender : kid.gender;
    }
    if (req.body.dateOfBirth !== undefined) {
      kid.dateOfBirth = req.body.dateOfBirth ? new Date(req.body.dateOfBirth) : null;
    }
    if (req.body.relationship !== undefined) kid.relationship = String(req.body.relationship || '').trim().slice(0, 40);
    if (req.body.health && typeof req.body.health === 'object') {
      const h = req.body.health;
      kid.health = kid.health || {};
      if (h.conditions !== undefined) kid.health.conditions = String(h.conditions || '').trim().slice(0, 200);
      if (h.medication !== undefined) kid.health.medication = String(h.medication || '').trim().slice(0, 200);
      if (h.doctor !== undefined) kid.health.doctor = String(h.doctor || '').trim().slice(0, 80);
      if (h.hospital !== undefined) kid.health.hospital = String(h.hospital || '').trim().slice(0, 120);
      if (h.insurance !== undefined) kid.health.insurance = String(h.insurance || '').trim().slice(0, 80);
      if (h.policyNumber !== undefined) kid.health.policyNumber = String(h.policyNumber || '').trim().slice(0, 40);
      if (h.notes !== undefined) kid.health.notes = String(h.notes || '').trim().slice(0, 800);
    }
    await kid.save();
    res.json({ kid: serializeParentKid(kid) });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/me', async (req, res) => {
  try {
    const user = await User.findById(req.user.id);
    if (!user) return res.status(404).json({ error: 'User not found' });
    const kids = await Kid.find({ parentIds: req.user.id, active: true })
      .populate('schoolId', 'name location address logoUrl')
      .limit(1);
    const school = kids[0]?.schoolId || null;
    res.json({ user: user.toSafeJSON(), school });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

function applyParentProfile(user, body = {}) {
  if (body.name !== undefined) {
    const name = String(body.name || '').trim();
    if (!name) return 'name is required';
    user.name = name.slice(0, 80);
  }
  if (body.phone !== undefined) user.phone = String(body.phone || '').trim().slice(0, 40);
  if (body.photoUrl !== undefined) user.photoUrl = String(body.photoUrl || '').trim();
  if (body.photoPublicId !== undefined) user.photoPublicId = String(body.photoPublicId || '').trim();
  if (body.language !== undefined) user.language = String(body.language || 'English').trim().slice(0, 40);
  if (body.theme !== undefined) {
    const theme = String(body.theme || 'system').trim().toLowerCase();
    user.theme = ['system', 'light', 'dark'].includes(theme) ? theme : 'system';
  }
  if (body.twoFactorEnabled !== undefined) user.twoFactorEnabled = body.twoFactorEnabled === true;
    if (body.preferences && typeof body.preferences === 'object') {
      user.preferences = user.preferences || {};
      for (const key of [
        'notifyTrips',
        'notifyDiary',
        'notifyAnnouncements',
        'notifyMessages',
        'notifyLeave',
        'emailUpdates',
        'smsUpdates',
        'calendarSync',
      ]) {
        if (typeof body.preferences[key] === 'boolean') user.preferences[key] = body.preferences[key];
      }
      user.markModified('preferences');
    }
  return null;
}

router.get('/profile', async (req, res) => {
  try {
    const user = await User.findById(req.user.id);
    if (!user) return res.status(404).json({ error: 'User not found' });
    const [kids, unread] = await Promise.all([
      Kid.find({ parentIds: req.user.id, active: true })
        .populate('schoolId', 'name')
        .sort({ name: 1 }),
      Notification.countDocuments({ userId: req.user.id, read: { $ne: true } }),
    ]);
    res.json({
      user: user.toSafeJSON(),
      unread,
      kids: kids.map((k) => ({
        _id: k._id,
        name: k.name,
        grade: k.grade || '',
        photoUrl: k.photoUrl || '',
        active: k.active !== false,
        schoolName: k.schoolId?.name || '',
      })),
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.patch('/profile', async (req, res) => {
  try {
    const user = await User.findById(req.user.id);
    if (!user) return res.status(404).json({ error: 'User not found' });
    const error = applyParentProfile(user, req.body || {});
    if (error) return res.status(400).json({ error });
    await user.save();
    res.json({ user: user.toSafeJSON() });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.put('/password', async (req, res) => {
  try {
    const currentPassword = String(req.body?.currentPassword || '');
    const newPassword = String(req.body?.newPassword || '');
    if (!currentPassword || !newPassword) {
      return res.status(400).json({ error: 'currentPassword and newPassword are required' });
    }
    if (newPassword.length < 6) {
      return res.status(400).json({ error: 'New password must be at least 6 characters' });
    }
    const user = await User.findById(req.user.id);
    if (!user) return res.status(404).json({ error: 'User not found' });
    const ok = await bcrypt.compare(currentPassword, user.passwordHash);
    if (!ok) return res.status(400).json({ error: 'Current password is incorrect' });
    user.passwordHash = await bcrypt.hash(newPassword, 10);
    await user.save();
    res.json({ ok: true });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.post('/feedback', async (req, res) => {
  try {
    const message = String(req.body?.message || '').trim();
    if (!message) return res.status(400).json({ error: 'message is required' });
    const user = await User.findById(req.user.id).select('name schoolId');
    const kids = await Kid.find({ parentIds: req.user.id, active: true }).select('schoolId').limit(1);
    const schoolId = user?.schoolId || kids[0]?.schoolId;
    const admins = schoolId
      ? await User.find({ schoolId, role: { $in: ['school_admin', 'super_admin'] }, active: true }).select('_id')
      : [];
    if (admins.length) {
      await createAndEmitNotifications(
        getIO(),
        admins.map((admin) => ({
          userId: admin._id,
          type: NOTIFICATION_TYPES.MESSAGE,
          title: `Parent feedback from ${user?.name || 'a parent'}`,
          body: message.slice(0, 400),
        })),
      );
    }
    res.status(201).json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.delete('/account', async (req, res) => {
  try {
    const password = String(req.body?.password || '');
    if (!password) return res.status(400).json({ error: 'password is required' });
    const user = await User.findById(req.user.id);
    if (!user) return res.status(404).json({ error: 'User not found' });
    const ok = await bcrypt.compare(password, user.passwordHash);
    if (!ok) return res.status(400).json({ error: 'Password is incorrect' });
    user.active = false;
    await user.save();
    await DeviceToken.deleteMany({ userId: user._id });
    res.json({ ok: true });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

const PARENT_FAQS = [
  {
    id: 'bus-tracking',
    category: 'transport',
    icon: 'bus',
    title: 'Bus Tracking',
    summary: "How do I track my child's school bus in real-time?",
    body: 'Open Trips. When a bus trip is live, tap Track Bus to see the route, stops, and estimated arrival. The map stays on while the trip is active.',
  },
  {
    id: 'notifications',
    category: 'account',
    icon: 'bell',
    title: 'Notifications',
    summary: 'How do I receive notifications and alerts?',
    body: 'Allow notifications when asked. Then open More → Notification Settings and choose trips, diary, announcements, messages, and leave alerts.',
  },
  {
    id: 'leave-requests',
    category: 'leave',
    icon: 'calendar',
    title: 'Leave Requests',
    summary: 'How do I request leave for my child?',
    body: 'Open More → Leave Request or use Leave from a child profile. Choose the child, dates, and reason, then submit at least 24 hours in advance.',
  },
  {
    id: 'profile-update',
    category: 'account',
    icon: 'person',
    title: 'Profile Update',
    summary: 'How do I update my profile information?',
    body: 'Open More → Edit Profile (or Personal Information). You can change your name, phone number, and photo. Email is managed by the school office.',
  },
  {
    id: 'data-safety',
    category: 'privacy',
    icon: 'shield',
    title: 'Data Safety',
    summary: "How is my child's data kept safe?",
    body: 'Only linked parents and authorised school staff can see child records. Location is used only during active school trips. See Terms & Conditions for the full policy.',
  },
  {
    id: 'track-guide',
    category: 'guides',
    icon: 'book',
    title: 'Using live tracking',
    summary: 'Step-by-step: follow the bus on the map.',
    body: '1. Open Trips. 2. Wait until the trip shows as live. 3. Tap Track Bus. 4. Watch the route and ETA until drop-off.',
  },
  {
    id: 'leave-guide',
    category: 'guides',
    icon: 'book',
    title: 'Submitting leave',
    summary: 'Step-by-step: send a leave request.',
    body: '1. Open Leave Request. 2. Select the child. 3. Pick leave type, reason, and dates. 4. Add notes if needed. 5. Submit and check History for the decision.',
  },
];

function filterFaqs(q, category) {
  const query = String(q || '').trim().toLowerCase();
  const cat = String(category || 'all').toLowerCase();
  return PARENT_FAQS.filter((f) => {
    if (cat && cat !== 'all' && f.category !== cat) return false;
    if (!query) return true;
    return `${f.title} ${f.summary} ${f.body}`.toLowerCase().includes(query);
  });
}

async function parentSupportContext(parentId) {
  const kids = await Kid.find({ parentIds: parentId, active: true }).select('schoolId').limit(1);
  const user = await User.findById(parentId).select('schoolId name');
  const schoolId = user?.schoolId || kids[0]?.schoolId || null;
  const school = schoolId ? await School.findById(schoolId).select('name supportEmail supportPhone supportHours') : null;
  return { schoolId, school, user };
}

function serializeTicket(t) {
  return {
    _id: t._id,
    ticketNo: t.ticketNo,
    title: t.title,
    body: t.body,
    category: t.category,
    status: t.status,
    createdAt: t.createdAt,
    updatedAt: t.updatedAt,
  };
}

async function nextTicketNo() {
  const year = new Date().getFullYear();
  const prefix = `EDU-${year}-`;
  const latest = await SupportTicket.findOne({ ticketNo: new RegExp(`^${prefix}`) }).sort({ ticketNo: -1 });
  const n = latest ? Number(String(latest.ticketNo).slice(prefix.length)) + 1 : 456;
  return `${prefix}${String(Number.isFinite(n) ? n : 456).padStart(4, '0')}`;
}

async function ensureSampleTicket(parentId, schoolId) {
  const existing = await SupportTicket.findOne({ parentId, sourceKey: 'sample:login-issue' });
  if (existing) return existing;
  try {
    return await SupportTicket.create({
      schoolId,
      parentId,
      sourceKey: 'sample:login-issue',
      ticketNo: await nextTicketNo(),
      title: 'Login issue on parent app',
      body: 'I could not sign in on the first try this morning. Please check my account.',
      category: 'account',
      status: 'open',
    });
  } catch (err) {
    if (err?.code === 11000) return SupportTicket.findOne({ parentId, sourceKey: 'sample:login-issue' });
    throw err;
  }
}

router.get('/support', async (req, res) => {
  try {
    const { schoolId, school } = await parentSupportContext(req.user.id);
    const [tickets, unread] = await Promise.all([
      SupportTicket.find({ parentId: req.user.id }).sort({ createdAt: -1 }).limit(40),
      Notification.countDocuments({ userId: req.user.id, read: { $ne: true } }),
    ]);
    res.json({
      unread,
      contact: {
        email: school?.supportEmail || 'support@educare.app',
        phone: school?.supportPhone || '+254 700 123 456',
        hours: school?.supportHours || '8:00 AM - 6:00 PM',
        chatAvailable: true,
      },
      faqs: filterFaqs(req.query.q, req.query.category),
      tickets: tickets.map(serializeTicket),
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/support/faqs', async (req, res) => {
  try {
    res.json({ faqs: filterFaqs(req.query.q, req.query.category) });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/support/tickets', async (req, res) => {
  try {
    const tickets = await SupportTicket.find({ parentId: req.user.id }).sort({ createdAt: -1 }).limit(80);
    res.json({ tickets: tickets.map(serializeTicket) });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/support/tickets', async (req, res) => {
  try {
    const title = String(req.body?.title || '').trim();
    const body = String(req.body?.body || '').trim();
    if (!title) return res.status(400).json({ error: 'title is required' });
    const category = ['general', 'transport', 'account', 'leave', 'privacy', 'guides'].includes(req.body?.category)
      ? req.body.category
      : 'general';
    const { schoolId } = await parentSupportContext(req.user.id);
    const ticket = await SupportTicket.create({
      schoolId,
      parentId: req.user.id,
      ticketNo: await nextTicketNo(),
      title: title.slice(0, 160),
      body: body.slice(0, 2000),
      category,
      status: 'open',
    });
    const admins = schoolId
      ? await User.find({ schoolId, role: { $in: ['school_admin', 'super_admin'] }, active: true }).select('_id')
      : [];
    if (admins.length) {
      await createAndEmitNotifications(
        getIO(),
        admins.map((admin) => ({
          userId: admin._id,
          type: NOTIFICATION_TYPES.MESSAGE,
          title: `Support ticket ${ticket.ticketNo}`,
          body: title.slice(0, 400),
        })),
      );
    }
    res.status(201).json({ ticket: serializeTicket(ticket) });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.get('/support/tickets/:id', async (req, res) => {
  try {
    const ticket = await SupportTicket.findOne({ _id: req.params.id, parentId: req.user.id });
    if (!ticket) return res.status(404).json({ error: 'Ticket not found' });
    res.json({ ticket: serializeTicket(ticket) });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/about', async (req, res) => {
  try {
    const unread = await Notification.countDocuments({ userId: req.user.id, read: { $ne: true } });
    res.json({
      unread,
      app: {
        name: 'EduCare Parent',
        tagline: "Your all-in-one platform to stay connected with your child's school.",
        version: '1.2.0',
        build: '120',
        lastUpdated: '2026-05-20',
        website: 'https://www.educare.app',
        latestVersion: '1.2.0',
      },
      social: [
        { id: 'facebook', label: 'Facebook', url: 'https://www.facebook.com' },
        { id: 'twitter', label: 'Twitter', url: 'https://twitter.com' },
        { id: 'instagram', label: 'Instagram', url: 'https://www.instagram.com' },
        { id: 'linkedin', label: 'LinkedIn', url: 'https://www.linkedin.com' },
        { id: 'youtube', label: 'YouTube', url: 'https://www.youtube.com' },
      ],
      changelog: [
        {
          version: '1.2.0',
          date: '2026-05-20',
          items: [
            'New Leave Request flow with return-date updates',
            'Diary view with homework, teacher notes, and daily activities',
            'Noticeboard search, filters, and unread tracking',
            'Help & Support with tickets and FAQs',
          ],
        },
        {
          version: '1.1.0',
          date: '2026-03-12',
          items: [
            'Live bus tracking on the map',
            'Child progress and attendance summaries',
          ],
        },
      ],
    });
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
    const visibleActiveTrips = activeTrips.filter((t) => {
      const mine = kids.filter((k) =>
        (t.kidIds || []).some((id) => String(id?._id || id) === String(k._id))
      );
      const tripEvents = eventsToday.filter((e) => String(e.tripId) === String(t._id));
      return parentMayTrackTrip(t, tripEvents, mine);
    });
    const checkIns = eventsToday.filter((e) => e.type === 'picked_up' && kidIds.some((id) => String(e.kidId) === String(id))).length;
    let pendingCheckouts = 0;
    for (const kid of kids) {
      const id = kid._id.toString();
      const picked = eventsToday.some((e) => String(e.kidId) === id && e.type === 'picked_up');
      const dropped = eventsToday.some((e) => String(e.kidId) === id && e.type === 'dropped_off');
      if (picked && !dropped) pendingCheckouts += 1;
      if (visibleActiveTrips.length && !picked && !dropped) pendingCheckouts += 1;
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

    const active = visibleActiveTrips[0] || null;
    res.json({
      kids: mappedKids,
      featuredKidId: featured?._id || null,
      progress,
      summary: {
        tripsToday: visibleActiveTrips.length,
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
      events: events,
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

function assignmentAppliesToKid(assignment, kid) {
  const kidId = String(kid._id);
  if (assignment.kidIds?.length) {
    return assignment.kidIds.some((id) => {
      const raw = id?._id || id;
      return String(raw) === kidId;
    });
  }
  if (assignment.grade) return assignment.grade === kid.grade;
  return true;
}

function homeworkStatus(assignment, day) {
  if (!assignment.dueDate) return 'pending';
  const due = startOfDay(assignment.dueDate);
  return due < day ? 'overdue' : 'pending';
}

function formatClock(value) {
  if (!value) return '';
  if (typeof value === 'string' && /^\d{1,2}:\d{2}$/.test(value.trim())) {
    const [hRaw, mRaw] = value.trim().split(':');
    const h = String(Number(hRaw)).padStart(2, '0');
    return `${h}:${mRaw}`;
  }
  return formatNairobiClock(value);
}

function minutesFromClock(value) {
  if (typeof value === 'string' && /^\d{1,2}:\d{2}$/.test(value.trim())) {
    const [h, m] = value.trim().split(':').map(Number);
    return h * 60 + m;
  }
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) return 0;
  return d.getHours() * 60 + d.getMinutes();
}

function addClockMinutes(value, mins) {
  const base = String(value || '').trim() ? value : '06:30';
  const total = minutesFromClock(base) + Number(mins || 0);
  const wrapped = ((total % 1440) + 1440) % 1440;
  const h = Math.floor(wrapped / 60);
  const m = wrapped % 60;
  return formatClock(`${h}:${String(m).padStart(2, '0')}`);
}

function mondayOfThisWeek(now = new Date()) {
  const d = startOfDay(now);
  const dow = d.getDay();
  const offset = dow === 0 ? -6 : 1 - dow;
  d.setDate(d.getDate() + offset);
  return d;
}

function activityDone(timeValue, day) {
  const today = startOfDay();
  if (day < today) return true;
  if (day > today) return false;
  const now = new Date();
  return minutesFromClock(timeValue) <= now.getHours() * 60 + now.getMinutes();
}

function serializeDiaryKid(kid) {
  return {
    _id: kid._id,
    name: kid.name,
    grade: kid.grade || '',
    photoUrl: kid.photoUrl || '',
    admissionNo: kid.admissionNo || '',
    house: kid.house || '',
    schoolName: kid.schoolId?.name || '',
  };
}

function formatKidGrade(raw) {
  const s = String(raw || '').trim();
  if (!s) return '';
  if (/^grade/i.test(s)) {
    const rest = s.replace(/^grade\s*/i, '').trim();
    return rest ? `Grade ${rest}` : 'Grade';
  }
  return `Grade ${s}`;
}

function diaryKidCard(kid) {
  if (!kid) return null;
  const grade = formatKidGrade(kid.grade);
  const classLabel = kidClassLabel(kid);
  const roll = kid.rollNo || kid.house || '';
  return {
    _id: kid._id,
    name: kid.name || 'Child',
    photoUrl: kid.photoUrl || '',
    grade,
    classLabel,
    rollNo: roll,
    subtitle: [grade, classLabel, roll ? `Roll No. ${roll}` : ''].filter(Boolean).join(' • '),
  };
}

function diaryEntryType(label) {
  switch (String(label || '').toLowerCase()) {
    case 'activity':
      return 'Activity';
    case 'meal':
      return 'Meal';
    case 'health':
      return 'Health Note';
    case 'behaviour':
      return 'Behaviour';
    default:
      return 'Class Diary';
  }
}

function diaryRatingLabel(score) {
  if (score >= 5) return 'Excellent';
  if (score >= 4) return 'Very Good';
  if (score >= 3) return 'Good';
  if (score >= 2) return 'Fair';
  if (score >= 1) return 'Needs Improvement';
  return '';
}

function serializeDiaryHighlights(entry) {
  const h = entry.highlights || {};
  const fallback = diaryRatingLabel(entry.engagement);
  return [
    { key: 'participation', label: 'Class Participation', value: h.participation || fallback },
    { key: 'academic', label: 'Academic Work', value: h.academic || fallback },
    { key: 'behaviour', label: 'Behavior', value: h.behaviour || fallback },
  ].filter((row) => row.value);
}

function serializeDiaryHomework(entry) {
  const items = Array.isArray(entry.homeworkItems)
    ? entry.homeworkItems.map((s) => String(s || '').trim()).filter(Boolean)
    : [];
  if (items.length) return items;
  const title = String(entry.homework?.title || '').trim();
  if (!title) return [];
  return title
    .split(/\n|•/g)
    .map((s) => s.replace(/^[-–]\s*/, '').trim())
    .filter(Boolean);
}

function attachmentSizeLabel(bytes) {
  const n = Number(bytes) || 0;
  if (n <= 0) return '';
  if (n < 1024 * 1024) return `${Math.max(1, Math.round(n / 1024))} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

function isDiaryImageMedia(m) {
  const type = String(m?.resourceType || '').toLowerCase();
  if (type === 'image') return true;
  if (type === 'video' || type === 'raw') return false;
  const hay = `${m?.url || ''} ${m?.originalName || ''}`;
  return /\.(jpe?g|png|gif|webp|heic|bmp)($|\?)/i.test(hay) || /\/image\/upload\//i.test(hay);
}

function serializeDiaryAttachments(entry) {
  return (entry.media || [])
    .filter((m) => m && m.url)
    .map((m) => {
      const name = m.originalName || (String(m.url || '').split('/').pop() || 'Attachment');
      const image = isDiaryImageMedia(m);
      const pdf = !image && (/\.pdf($|\?)/i.test(name) || m.resourceType === 'raw');
      return {
        url: m.url || '',
        name,
        kind: image ? 'image' : pdf ? 'pdf' : m.resourceType || 'file',
        sizeLabel: attachmentSizeLabel(m.bytes),
      };
    });
}

function serializeDiaryComments(entry, userId) {
  return (entry.comments || []).map((c) => ({
    _id: c._id,
    authorName: c.authorName || 'Parent',
    authorRole: c.authorRole || 'Parent',
    authorPhotoUrl: c.authorPhotoUrl || '',
    body: c.body || '',
    createdAt: c.createdAt,
    mine: userId && c.userId && String(c.userId) === String(userId),
  }));
}

function diaryAppliesToKid(entry, kid) {
  if (!kid?._id) return false;
  const kidIds = (entry.kidIds || []).map((k) => String(k?._id || k)).filter(Boolean);
  if (kidIds.length) return kidIds.includes(String(kid._id));
  const grade = String(entry.grade || '').trim();
  if (grade) return String(kid.grade || '') === grade;
  return true;
}

function diaryApplicableKids(entry, kids) {
  return (kids || []).filter((k) => diaryAppliesToKid(entry, k));
}

function serializeDiarySignatures(entry, { kids = [], userId, kidId } = {}) {
  const applicable = diaryApplicableKids(entry, kids);
  const sigs = (entry.parentSignatures || []).map((s) => {
    const sigKidId = String(s.kidId?._id || s.kidId || '');
    const kid = kids.find((k) => String(k._id) === sigKidId)
      || (s.kidId && typeof s.kidId === 'object' ? s.kidId : null);
    return {
      _id: s._id,
      kidId: sigKidId,
      kidName: kid?.name || '',
      parentName: s.parentName || 'Parent',
      signedAt: s.signedAt,
      mine: userId && s.userId && String(s.userId) === String(userId),
    };
  });
  const targetKidId = kidId ? String(kidId) : String(pickDiaryKid(entry, kids, kidId)?._id || applicable[0]?._id || '');
  const mySig = sigs.find(
    (s) => s.mine && (!targetKidId || String(s.kidId) === targetKidId),
  );
  const unsignedKids = applicable.filter(
    (k) => !sigs.some((s) => s.mine && String(s.kidId) === String(k._id)),
  );
  return {
    signatures: sigs,
    signed: Boolean(mySig),
    signedAt: mySig?.signedAt || null,
    needsSignature: applicable.length > 0 && unsignedKids.length > 0,
    unsignedKids: unsignedKids.map((k) => ({ _id: k._id, name: k.name || 'Child' })),
  };
}

function pickDiaryKid(entry, kids, preferredKidId) {
  const linked = (entry.kidIds || []).filter((k) => k && typeof k === 'object' && k._id);
  if (preferredKidId) {
    const match = linked.find((k) => String(k._id) === String(preferredKidId))
      || kids.find((k) => String(k._id) === String(preferredKidId));
    if (match) return match;
  }
  const owned = linked.find((k) => kids.some((pk) => String(pk._id) === String(k._id)));
  return owned || kids[0] || linked[0] || null;
}

function serializeParentDiary(entry, { kids = [], userId, previous = [], kidId } = {}) {
  const doc = entry.toObject ? entry.toObject() : entry;
  const kid = pickDiaryKid(doc, kids, kidId);
  const teacher = doc.teacherId && typeof doc.teacherId === 'object' ? doc.teacherId : {};
  const attachments = serializeDiaryAttachments(doc);
  const signature = serializeDiarySignatures(doc, { kids, userId, kidId: kidId || kid?._id });
  return {
    _id: doc._id,
    id: String(doc._id),
    source: 'diary',
    title: doc.title || 'Diary Entry',
    body: doc.body || '',
    date: doc.date || doc.createdAt,
    typeLabel: diaryEntryType(doc.label),
    label: doc.label || 'class',
    teacher: {
      name: teacher.name || 'Class Teacher',
      photoUrl: teacher.photoUrl || '',
      role: teacher.jobTitle || 'Class Teacher',
    },
    kid: diaryKidCard(kid),
    highlights: serializeDiaryHighlights(doc),
    homework: serializeDiaryHomework(doc),
    attachments,
    comments: serializeDiaryComments(doc, userId),
    ...signature,
    previous,
    photoUrl: attachments.find((m) => m.kind === 'image')?.url || '',
  };
}

function diaryPreview(entry) {
  const text = String(entry.body || entry.title || '').replace(/\s+/g, ' ').trim();
  return text.length > 90 ? `${text.slice(0, 87)}…` : text;
}

async function loadParentDiaryContext(parentId) {
  const kids = await Kid.find({ parentIds: parentId, active: true });
  const schoolIds = [...new Set(kids.map((k) => k.schoolId).filter(Boolean))];
  return { kids, schoolIds };
}

async function findParentDiary(parentId, id) {
  const { kids, schoolIds } = await loadParentDiaryContext(parentId);
  if (!kids.length || !schoolIds.length) return { entry: null, kids };
  const entry = await DiaryEntry.findOne({ _id: id, ...parentDiaryMatch(kids, schoolIds) })
    .populate('teacherId', 'name photoUrl jobTitle')
    .populate('kidIds', 'name grade section rollNo house photoUrl');
  return { entry, kids };
}

async function serializeDiaryWithPrevious(entry, { kids, userId, kidId }) {
  const previousDocs = await DiaryEntry.find({
    ...parentDiaryMatch(kids, kids.map((k) => k.schoolId).filter(Boolean)),
    _id: { $ne: entry._id },
    date: { $lte: entry.date || entry.createdAt },
  })
    .sort({ date: -1, createdAt: -1 })
    .limit(5)
    .select('date title body');
  const previous = previousDocs.map((p) => ({
    _id: p._id,
    date: p.date,
    title: p.title || 'Diary Entry',
    preview: diaryPreview(p),
  }));
  return serializeParentDiary(entry, { kids, userId, previous, kidId });
}

async function ensureParentDiarySample(parentId, kids) {
  if (!kids?.length) return;
  const schoolIds = [...new Set(kids.map((k) => k.schoolId?._id || k.schoolId).filter(Boolean))];
  if (!schoolIds.length) return;
  const existing = await DiaryEntry.findOne(parentDiaryMatch(kids, schoolIds)).select('_id');
  if (existing) return;
  const kid = kids[0];
  const teacher = await User.findOne({
    schoolId: kid.schoolId?._id || kid.schoolId,
    role: 'teacher',
    active: { $ne: false },
  }).select('name');
  if (!teacher) return;
  const first = String(kid.name || 'Your child').trim().split(/\s+/)[0];
  const today = startOfDay();
  const yesterday = addDays(today, -1);
  const earlier = addDays(today, -2);
  try {
    await DiaryEntry.create([
      {
        schoolId: kid.schoolId?._id || kid.schoolId,
        teacherId: teacher._id,
        date: today,
        title: 'Class Diary',
        body: `${first} participated actively in today's Science lesson on plants. He asked thoughtful questions during the group discussion and completed his classwork neatly and on time. Keep encouraging him to read aloud at home.`,
        label: 'class',
        grade: kid.grade || '',
        kidIds: [kid._id],
        engagement: 4,
        highlights: { participation: 'Very Good', academic: 'Good', behaviour: 'Excellent' },
        homework: { enabled: true, title: 'Read pages 45-50 of the Science textbook' },
        homeworkItems: [
          'Read pages 45-50 of the Science textbook',
          'Complete Maths worksheet on fractions',
          "Bring a leaf sample for tomorrow's practical",
        ],
        media: [
          {
            url: 'https://www.w3.org/WAI/ER/tests/xhtml/testfiles/resources/pdf/dummy.pdf',
            publicId: '',
            resourceType: 'raw',
            originalName: 'Science Worksheet.pdf',
            bytes: 1363149,
          },
        ],
      },
      {
        schoolId: kid.schoolId?._id || kid.schoolId,
        teacherId: teacher._id,
        date: yesterday,
        title: 'Class Diary',
        body: `${first} presented his plant diagram to the class and helped a classmate during group work.`,
        label: 'class',
        grade: kid.grade || '',
        kidIds: [kid._id],
        engagement: 5,
        highlights: { participation: 'Excellent', academic: 'Good', behaviour: 'Very Good' },
        homework: { enabled: true, title: 'Revise science notes on plants' },
        homeworkItems: ['Revise science notes on plants'],
      },
      {
        schoolId: kid.schoolId?._id || kid.schoolId,
        teacherId: teacher._id,
        date: earlier,
        title: 'Class Diary',
        body: `Library reading time went well. ${first} chose a nature story and summarised it clearly.`,
        label: 'class',
        grade: kid.grade || '',
        kidIds: [kid._id],
        engagement: 4,
        homeworkItems: ['Return the library book by Friday'],
      },
    ]);
  } catch (_) {
    /* ignore duplicate sample */
  }
}

function diaryTypeMeta(label) {
  switch (String(label || '').toLowerCase()) {
    case 'academic':
    case 'class':
    case 'lesson':
    case 'activity':
      return { category: 'Academic', title: 'Class Activity' };
    case 'health':
      return { category: 'Note', title: 'Health Note' };
    case 'behaviour':
      return { category: 'Note', title: 'Behaviour Note' };
    default:
      return { category: 'Note', title: 'Note' };
  }
}

function feedChildLabel(kidIds, kids) {
  const ids = (kidIds || []).map((k) => String(k?._id || k)).filter(Boolean);
  if (!ids.length) return { childLabel: 'All Children', childId: null };
  const matched = kids.filter((k) => ids.includes(String(k._id)));
  if (!matched.length || matched.length === kids.length) return { childLabel: 'All Children', childId: null };
  return { childLabel: matched.map((k) => k.name).join(', '), childId: String(matched[0]._id) };
}

function sampleDiaryFeed(kids) {
  const now = new Date();
  const a = kids[0]?.name || 'Your child';
  const b = kids[1]?.name || a;
  const aId = kids[0]?._id || null;
  const bId = kids[1]?._id || aId;
  return [
    {
      id: 'sample-feed-activity',
      kind: 'academic',
      category: 'Academic',
      title: 'Class Activity',
      body: 'Students participated in a group discussion on environment conservation.',
      teacherName: 'Mr. John Kamau',
      date: now,
      time: '10:15 AM',
      attachments: 1,
      childLabel: a,
      childId: aId,
      sample: true,
    },
    {
      id: 'sample-feed-announce',
      kind: 'announcement',
      category: 'Announcement',
      title: 'Announcement',
      body: 'Sports day event will be held on 5th June. Learners should wear house colours and bring a water bottle.',
      teacherName: 'School Admin',
      date: now,
      time: '9:00 AM',
      attachments: 0,
      childLabel: 'All Children',
      childId: null,
      sample: true,
    },
    {
      id: 'sample-feed-hw',
      kind: 'homework',
      category: 'Homework',
      title: 'Homework',
      body: 'Maths worksheet on Fractions to be completed by tomorrow.',
      teacherName: 'Ms. Achieng',
      date: now,
      time: '2:40 PM',
      attachments: 1,
      childLabel: b,
      childId: bId,
      sample: true,
    },
    {
      id: 'sample-feed-note',
      kind: 'note',
      category: 'Note',
      title: 'Note',
      body: `${a} showed great improvement in reading comprehension today. Keep it up!`,
      teacherName: 'Mr. John Kamau',
      date: now,
      time: '1:20 PM',
      attachments: 0,
      childLabel: a,
      childId: aId,
      sample: true,
    },
  ];
}

async function buildParentDiaryFeed(kids, query = {}, userId = null) {
  const schoolIds = [...new Set(kids.map((k) => (k.schoolId?._id || k.schoolId)?.toString()).filter(Boolean))];
  if (!schoolIds.length) return [];
  const from = startOfDay(new Date(Date.now() - 21 * 24 * 60 * 60 * 1000));
  const to = new Date();
  to.setHours(23, 59, 59, 999);
  const q = String(query.q || '').trim().toLowerCase();
  const category = String(query.category || 'all').toLowerCase();
  const kidFilter = query.kidId ? String(query.kidId) : '';
  const scopedKids = kidFilter ? kids.filter((k) => String(k._id) === kidFilter) : kids;
  const match = parentDiaryMatch(scopedKids.length ? scopedKids : kids, schoolIds);

  const [entries, announcements, assignments, notes] = await Promise.all([
    DiaryEntry.find({ ...match, date: { $gte: from, $lte: to } })
      .populate('teacherId', 'name')
      .populate('kidIds', 'name')
      .sort({ date: -1, createdAt: -1 })
      .limit(80),
    Announcement.find({
      schoolId: { $in: schoolIds },
      active: { $ne: false },
      archived: { $ne: true },
      publishedAt: { $gte: from },
    })
      .sort({ publishedAt: -1 })
      .limit(40),
    Assignment.find({ schoolId: { $in: schoolIds }, active: true, status: { $ne: 'draft' } })
      .populate('teacherId', 'name')
      .sort({ dueDate: -1, createdAt: -1 })
      .limit(40),
    TeacherNote.find({ kidId: { $in: scopedKids.map((k) => k._id) }, createdAt: { $gte: from } })
      .populate('teacherId', 'name')
      .sort({ createdAt: -1 })
      .limit(40),
  ]);

  const items = [];
  for (const e of entries) {
    const meta = diaryTypeMeta(e.label);
    const kidsMeta = feedChildLabel(e.kidIds, kids);
    const media = serializeDiaryAttachments(e);
    items.push({
      id: String(e._id),
      _id: e._id,
      kind: 'academic',
      category: meta.category,
      title: e.title || meta.title,
      body: e.body || e.title || '',
      teacherName: e.teacherId?.name || 'Teacher',
      date: e.date || e.createdAt,
      time: formatClock(e.time || e.createdAt),
      attachments: media.length,
      media,
      childLabel: kidsMeta.childLabel,
      childId: kidsMeta.childId,
      source: 'diary',
      photoUrl: media.find((m) => m.kind === 'image')?.url || '',
      comments: serializeDiaryComments(e),
      ...serializeDiarySignatures(e, { kids, userId }),
    });
  }
  for (const a of announcements) {
    if (a.scope === 'class' && a.grade && !kids.some((k) => k.grade === a.grade)) continue;
    items.push({
      id: String(a._id),
      kind: 'announcement',
      category: 'Announcement',
      title: a.title || 'Announcement',
      body: a.body || '',
      teacherName: a.authorName || 'School Admin',
      date: a.publishedAt || a.createdAt,
      time: formatClock(a.publishedAt || a.createdAt),
      attachments: a.attachmentUrl ? 1 : 0,
      childLabel: a.scope === 'class' && a.grade ? a.grade : 'All Children',
      childId: null,
      source: 'announcement',
    });
  }
  for (const hw of assignments) {
    const applies = kids.filter((k) => assignmentAppliesToKid(hw, k));
    if (!applies.length) continue;
    if (kidFilter && !applies.some((k) => String(k._id) === kidFilter)) continue;
    const kidsMeta = applies.length === 1
      ? { childLabel: applies[0].name, childId: String(applies[0]._id) }
      : { childLabel: 'All Children', childId: null };
    items.push({
      id: String(hw._id),
      kind: 'homework',
      category: 'Homework',
      title: 'Homework',
      body: hw.description || hw.title || '',
      teacherName: hw.teacherId?.name || 'Teacher',
      date: hw.dueDate || hw.createdAt,
      time: formatClock(hw.createdAt),
      attachments: (hw.attachments || []).length,
      childLabel: kidsMeta.childLabel,
      childId: kidsMeta.childId,
      source: 'homework',
    });
  }
  for (const n of notes) {
    const kid = kids.find((k) => String(k._id) === String(n.kidId?._id || n.kidId));
    items.push({
      id: String(n._id),
      kind: 'note',
      category: 'Note',
      title: n.title || 'Note',
      body: n.body || '',
      teacherName: n.teacherId?.name || 'Teacher',
      date: n.createdAt,
      time: formatClock(n.createdAt),
      attachments: 0,
      childLabel: kid?.name || 'Child',
      childId: kid?._id ? String(kid._id) : null,
      source: 'note',
    });
  }

  return items
    .filter((item) => {
      if (category && category !== 'all' && String(item.category).toLowerCase() !== category) return false;
      if (q && !`${item.title} ${item.body} ${item.childLabel}`.toLowerCase().includes(q)) return false;
      return true;
    })
    .sort((a, b) => new Date(b.date) - new Date(a.date))
    .slice(0, 80);
}

function sampleDiary(kid, day) {
  const dueA = new Date(day);
  dueA.setDate(dueA.getDate() + 2);
  const dueB = new Date(day);
  dueB.setDate(dueB.getDate() + 1);
  const noteAt = new Date(day);
  noteAt.setHours(10, 30, 0, 0);
  return {
    homework: [
      {
        _id: 'sample-hw-math',
        subject: 'Mathematics',
        title: 'Complete exercise 4.2 on fractions (Page 45-46)',
        description: 'Complete exercise 4.2 on fractions (Page 45-46)',
        dueDate: dueA,
        status: 'pending',
        teacherName: '',
        sample: true,
      },
      {
        _id: 'sample-hw-english',
        subject: 'English',
        title: "Read Chapter 5 of 'Charlie and the Chocolate Factory'",
        description: "Read Chapter 5 of 'Charlie and the Chocolate Factory' and write a short summary.",
        dueDate: dueB,
        status: 'pending',
        teacherName: '',
        sample: true,
      },
      {
        _id: 'sample-hw-science',
        subject: 'Science',
        title: 'Draw and label the parts of a plant.',
        description: 'Draw and label the parts of a plant.',
        dueDate: dueA,
        status: 'pending',
        teacherName: '',
        sample: true,
      },
    ],
    notes: [
      {
        _id: 'sample-note-1',
        title: 'Class update',
        body: `${kid.name || 'Your child'} is doing very well in class. They participate actively in discussions and show great improvement in Mathematics.`,
        category: 'academic',
        createdAt: noteAt,
        teacher: { name: 'Mr. John Kamau', photoUrl: '', role: 'Class Teacher' },
        sample: true,
      },
    ],
    activities: [
      { _id: 'sample-act-1', time: '8:00 AM', title: 'Assembly and Morning Prayers', done: activityDone('08:00', day), sample: true },
      { _id: 'sample-act-2', time: '9:00 AM', title: 'Mathematics Lesson', done: activityDone('09:00', day), sample: true },
      { _id: 'sample-act-3', time: '11:00 AM', title: 'Science Practical', done: activityDone('11:00', day), sample: true },
      { _id: 'sample-act-4', time: '1:00 PM', title: 'Library Reading Time', done: activityDone('13:00', day), sample: true },
      {
        _id: 'sample-act-5',
        time: '2:30 PM',
        title: 'Physical Education',
        done: activityDone('14:30', day),
        caption: 'P.E session',
        sample: true,
      },
    ],
  };
}

router.get('/diary', async (req, res) => {
  try {
    const kids = await Kid.find({ parentIds: req.user.id, active: true }).populate('schoolId', 'name');
    if (!kids.length) {
      return res.json({
        entries: [],
        dates: [],
        kids: [],
        kid: null,
        homework: [],
        notes: [],
        activities: [],
        feed: [],
        unread: 0,
      });
    }

    const selected =
      kids.find((k) => String(k._id) === String(req.query.kidId || '')) || kids[0];
    const schoolId = selected.schoolId?._id || selected.schoolId;
    const day = startOfDay(req.query.date);
    const { from, to } = monthRange(req.query.month || ymd(day));
    const match = parentDiaryMatch([selected], [schoolId]);

    const [entries, monthEntries, assignments, notes, klass, unread] = await Promise.all([
      DiaryEntry.find({ ...match, date: { $gte: from, $lte: to } })
        .populate('teacherId', 'name photoUrl')
        .populate('kidIds', 'name grade')
        .sort({ date: -1, createdAt: -1 })
        .limit(80),
      DiaryEntry.find({ ...match, date: { $gte: from, $lte: to } }).select('date'),
      schoolId
        ? Assignment.find({ schoolId, active: true, status: { $ne: 'draft' } })
            .populate('teacherId', 'name')
            .sort({ dueDate: 1, createdAt: -1 })
            .limit(80)
        : [],
      TeacherNote.find({ kidId: selected._id })
        .populate('teacherId', 'name photoUrl')
        .sort({ createdAt: -1 })
        .limit(30),
      schoolId && selected.grade
        ? SchoolClass.findOne({ schoolId, grade: selected.grade, active: { $ne: false } }).populate(
            'teacherId',
            'name photoUrl',
          )
        : null,
      Notification.countDocuments({ userId: req.user.id, read: { $ne: true } }),
    ]);

    const classTeacherId = klass?.teacherId?._id || klass?.teacherId;
    const homework = assignments
      .filter((a) => assignmentAppliesToKid(a, selected))
      .map((a) => ({
        _id: a._id,
        subject: a.subject || '',
        title: a.title || 'Homework',
        description: a.description || a.title || '',
        dueDate: a.dueDate,
        status: homeworkStatus(a, day),
        teacherName: a.teacherId?.name || '',
      }));

    const notesForDay = notes.filter((n) => ymd(n.createdAt) === ymd(day));
    const noteSource = notesForDay.length ? notesForDay : notes.slice(0, 5);
    const serializedNotes = noteSource.map((n) => {
      const teacher = n.teacherId || {};
      const isClass = classTeacherId && String(teacher._id || teacher) === String(classTeacherId);
      return {
        _id: n._id,
        title: n.title,
        body: n.body,
        category: n.category,
        createdAt: n.createdAt,
        teacher: {
          name: teacher.name || 'Teacher',
          photoUrl: teacher.photoUrl || '',
          role: isClass ? 'Class Teacher' : 'Teacher',
        },
      };
    });

    const todays = entries.filter((e) => ymd(e.date) === ymd(day));
    const activities = todays.map((e) => {
      const clock = e.time || e.createdAt;
      const photo = (e.media || []).find((m) => m?.url && m.resourceType !== 'raw');
      return {
        _id: e._id,
        time: formatClock(clock),
        title: e.title,
        body: e.body || '',
        done: activityDone(clock, day),
        photoUrl: photo?.url || '',
        caption: e.label === 'activity' ? e.title : e.label || '',
        label: e.label,
      };
    });

    const dates = [...new Set(monthEntries.map((e) => ymd(e.date)))];
    const feed = await buildParentDiaryFeed(kids, req.query, req.user.id);
    const serializedEntries = entries.map((e) =>
      serializeParentDiary(e, { kids, userId: req.user.id, kidId: selected._id }),
    );
    res.json({
      date: ymd(day),
      unread,
      kids: kids.map(serializeDiaryKid),
      kid: serializeDiaryKid(selected),
      classTeacher: klass?.teacherId
        ? { name: klass.teacherId.name, photoUrl: klass.teacherId.photoUrl || '', role: 'Class Teacher' }
        : null,
      entries: serializedEntries,
      dates,
      homework,
      notes: serializedNotes,
      activities,
      feed,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/diary/:id', async (req, res) => {
  try {
    if (!/^[a-fA-F0-9]{24}$/.test(String(req.params.id))) {
      return res.status(404).json({ error: 'Diary entry not found' });
    }
    const { entry, kids } = await findParentDiary(req.user.id, req.params.id);
    if (!entry) return res.status(404).json({ error: 'Diary entry not found' });
    const detail = await serializeDiaryWithPrevious(entry, {
      kids,
      userId: req.user.id,
      kidId: req.query.kidId,
    });
    res.json({ entry: detail });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/diary/:id/comments', async (req, res) => {
  try {
    if (!/^[a-fA-F0-9]{24}$/.test(String(req.params.id))) {
      return res.status(404).json({ error: 'Diary entry not found' });
    }
    const body = String(req.body?.body || '').trim().slice(0, 800);
    if (!body) return res.status(400).json({ error: 'Comment is required' });
    const { entry, kids } = await findParentDiary(req.user.id, req.params.id);
    if (!entry) return res.status(404).json({ error: 'Diary entry not found' });
    const author = await User.findById(req.user.id).select('name photoUrl');
    if (!Array.isArray(entry.comments)) entry.comments = [];
    entry.comments.push({
      userId: req.user.id,
      authorName: author?.name || req.user.name || 'Parent',
      authorRole: 'Parent',
      authorPhotoUrl: author?.photoUrl || '',
      body,
    });
    await entry.save();
    const teacherId = entry.teacherId?._id || entry.teacherId;
    if (teacherId) {
      try {
        await createAndEmitNotifications(getIO(), [
          {
            userId: teacherId,
            type: 'reminder',
            title: 'Diary comment',
            body: `${author?.name || 'A parent'} commented on "${entry.title}": ${body.slice(0, 140)}`,
            kidId: entry.kidIds?.[0] || null,
          },
        ]);
      } catch (_) {}
    }
    const detail = await serializeDiaryWithPrevious(entry, {
      kids,
      userId: req.user.id,
      kidId: req.query.kidId,
    });
    res.status(201).json({ entry: detail });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/diary/:id/sign', async (req, res) => {
  try {
    if (!/^[a-fA-F0-9]{24}$/.test(String(req.params.id))) {
      return res.status(404).json({ error: 'Diary entry not found' });
    }
    const { entry, kids } = await findParentDiary(req.user.id, req.params.id);
    if (!entry) return res.status(404).json({ error: 'Diary entry not found' });

    const applicable = diaryApplicableKids(entry, kids);
    if (!applicable.length) {
      return res.status(400).json({ error: 'This diary entry does not apply to your children' });
    }

    const requestedKidId = String(req.body?.kidId || req.query?.kidId || '').trim();
    const kid = requestedKidId
      ? applicable.find((k) => String(k._id) === requestedKidId)
      : applicable[0];
    if (!kid) {
      return res.status(400).json({ error: 'Select a child to sign for' });
    }

    if (!Array.isArray(entry.parentSignatures)) entry.parentSignatures = [];
    const already = entry.parentSignatures.some(
      (s) => String(s.userId) === String(req.user.id) && String(s.kidId) === String(kid._id),
    );
    if (already) {
      return res.status(400).json({ error: 'You have already signed this diary entry' });
    }

    const author = await User.findById(req.user.id).select('name photoUrl');
    entry.parentSignatures.push({
      userId: req.user.id,
      kidId: kid._id,
      parentName: author?.name || req.user.name || 'Parent',
      signedAt: new Date(),
    });
    await entry.save();

    const teacherId = entry.teacherId?._id || entry.teacherId;
    if (teacherId) {
      try {
        await createAndEmitNotifications(getIO(), [
          {
            userId: teacherId,
            type: 'reminder',
            title: 'Diary signed',
            body: `${author?.name || 'A parent'} signed "${entry.title}" for ${kid.name}.`,
            kidId: kid._id,
          },
        ]);
      } catch (_) {}
    }

    const detail = await serializeDiaryWithPrevious(entry, {
      kids,
      userId: req.user.id,
      kidId: kid._id,
    });
    res.status(201).json({ entry: detail });
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

    res.json({
      trips: enriched.filter((row) => parentMayTrackTrip(row.trip, row.events, row.myKids)),
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

function kmBetween(a, b) {
  if (!a || !b || a.lat == null || a.lng == null || b.lat == null || b.lng == null) return null;
  const toRad = (n) => (Number(n) * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return 2 * 6371 * Math.asin(Math.min(1, Math.sqrt(h)));
}

function etaMinutesFromKm(km) {
  if (km == null || Number.isNaN(km)) return null;
  return Math.max(1, Math.round((km / 22) * 60));
}

function isEveningTrip(trip) {
  return trip?.direction === 'to_home' || trip?.period === 'evening';
}

function parentKidBoardedOnTrip(events, kids) {
  const ids = new Set((kids || []).map((k) => String(k._id)));
  return (events || []).some(
    (e) => e.type === 'picked_up' && ids.has(String(e.kidId?._id || e.kidId))
  );
}

function parentMayTrackTrip(trip, events, kids) {
  if (!isEveningTrip(trip)) return true;
  if (trip.status === 'scheduled') return false;
  return parentKidBoardedOnTrip(events, kids);
}

function busPeriodLabel(trip) {
  return trip.period === 'afternoon' ? 'Afternoon' : trip.period === 'evening' ? 'Evening' : 'Morning';
}

function busRouteLabel(trip) {
  return trip.direction === 'to_home' ? 'School → Home' : 'Home → School';
}

function busTripTitle(trip) {
  const action = trip.direction === 'to_home' ? 'Drop Off' : 'Pick Up';
  return `${busPeriodLabel(trip)} ${action}`;
}

function addMinutes(date, mins) {
  if (!date) return null;
  return new Date(new Date(date).getTime() + mins * 60 * 1000);
}

function punctualityLabel(actual, expected, status) {
  if (!actual) {
    if (status === 'scheduled') return 'Scheduled';
    if (status === 'active') return 'Upcoming';
    return '';
  }
  if (!expected) return 'On Time';
  const diff = (new Date(actual).getTime() - new Date(expected).getTime()) / 60000;
  if (diff > 8) return 'Delayed';
  if (diff < -8) return 'Early';
  return 'On Time';
}

function classLabelForKid(kid) {
  const section = String(kid?.section || '').trim();
  if (!section) return '';
  return section.toLowerCase().startsWith('class') ? section : `Class ${section}`;
}

function busDisplayName(bus) {
  const label = String(bus?.label || '').trim();
  if (!label) return 'School Bus';
  if (/school/i.test(label)) return label;
  if (/^bus\b/i.test(label)) return `School ${label}`;
  return label;
}

async function ensureParentBusDisplay(bus) {
  if (!bus) return bus;
  let changed = false;
  if (!String(bus.label || '').trim()) {
    bus.label = 'Sunshine Express';
    changed = true;
  }
  if (!String(bus.assistantName || '').trim()) {
    bus.assistantName = 'Peter Odhiambo';
    changed = true;
  }
  if (!String(bus.assistantPhone || '').trim()) {
    bus.assistantPhone = '0715987654';
    changed = true;
  }
  if (!bus.year) {
    bus.year = 2022;
    changed = true;
  }
  if (!String(bus.safetyFeatures || '').trim()) {
    bus.safetyFeatures = 'GPS, CCTV, First Aid';
    changed = true;
  }
  if (changed) {
    try {
      await bus.save();
    } catch (_) {
      /* ignore duplicate sample */
    }
  }
  return bus;
}

function scheduleAppliesOnDay(day, schedules) {
  const dow = day.getDay();
  if (!schedules.length) return dow >= 1 && dow <= 5;
  return schedules.some((s) => {
    const type = s.scheduleType || 'WEEKDAYS';
    if (type === 'EVERY_DAY') return true;
    if (type === 'WEEKDAYS') return dow >= 1 && dow <= 5;
    if (type === 'CUSTOM_DAYS') return (s.customDays || []).includes(dow);
    if (type === 'ONE_TIME') {
      const start = s.startDate ? startOfDay(s.startDate) : null;
      return start && ymd(start) === ymd(day);
    }
    return dow >= 1 && dow <= 5;
  });
}

function tripOnDay(trip, day) {
  const src = trip.serviceDate || trip.scheduledFor || trip.startedAt;
  if (!src) return false;
  return ymd(src) === ymd(day);
}

function pickTripForDay(trips, day) {
  const matches = trips.filter((t) => tripOnDay(t, day));
  return (
    matches.find((t) => t.period === 'morning' || t.direction === 'to_school') ||
    matches[0] ||
    null
  );
}

function weekStatusFromTrip(trip, day, applies) {
  const today = startOfDay();
  const target = startOfDay(day);
  if (!trip) {
    if (!applies) return { status: 'no_service', label: 'No Service' };
    if (target >= today) return { status: 'on_time', label: 'On Time' };
    return { status: 'no_service', label: 'No Service' };
  }
  if (trip.status === 'cancelled' || trip.status === 'canceled') {
    return { status: 'no_service', label: 'No Service' };
  }
  const expected = trip.scheduledFor || trip.serviceDate;
  const actual = trip.startedAt || (trip.status === 'scheduled' ? null : expected);
  const label = punctualityLabel(actual, expected, trip.status) || 'On Time';
  if (/delay/i.test(label)) return { status: 'delayed', label: 'Delayed' };
  return { status: 'on_time', label: 'On Time' };
}

function tripSafety(status) {
  if (status === 'cancelled' || status === 'canceled') {
    return {
      ok: false,
      message: 'This trip was cancelled. No journey took place.',
    };
  }
  if (status === 'completed') {
    return {
      ok: true,
      message: 'Your child was safe throughout the trip. No incidents reported.',
    };
  }
  if (status === 'active') {
    return {
      ok: true,
      message: 'Your child is on this trip. No incidents reported.',
    };
  }
  return {
    ok: true,
    message: 'This trip is scheduled. You will be notified at pickup and drop-off.',
  };
}

function serializeKidSnippet(kid) {
  if (!kid) return null;
  const grade = kid.grade || '';
  const klass = classLabelForKid(kid);
  return {
    _id: kid._id,
    name: kid.name,
    photoUrl: kid.photoUrl || '',
    grade,
    section: kid.section || '',
    classLabel: klass,
    subtitle: [grade, klass].filter(Boolean).join(' • '),
  };
}

function outingMatchesKids(outing, kids) {
  const grade = String(outing.grade || '').trim().toLowerCase();
  if (!grade) return true;
  return kids.some((k) => {
    const kidGrade = String(k.grade || '').trim().toLowerCase();
    if (!kidGrade) return true;
    return kidGrade.includes(grade) || grade.includes(kidGrade);
  });
}

function serializeOuting(outing, permission, extra = {}) {
  return {
    _id: outing._id,
    kind: 'outing',
    title: outing.title,
    location: outing.location || '',
    notes: outing.notes || '',
    startAt: outing.startAt,
    endAt: outing.endAt,
    grade: outing.grade || '',
    audience: outing.audience || (outing.grade ? `${outing.grade} Students` : ''),
    busCount: outing.busCount ?? 1,
    teacherCount: outing.teacherCount ?? 1,
    status: outing.status || 'upcoming',
    tripId: outing.tripId?._id || outing.tripId || extra.tripId || null,
    routeName: outing.routeId?.name || extra.routeName || '',
    driverName: outing.driverId?.name || extra.driverName || '',
    plate: outing.busId?.plate || extra.plate || '',
    permission: permission
      ? { status: permission.status, decidedAt: permission.decidedAt }
      : { status: 'pending', decidedAt: null },
    ...extra,
  };
}

function sampleOutings(kids) {
  const y = new Date().getFullYear();
  const featured = kids[0];
  const audience = featured?.grade ? `${featured.grade} Students` : 'Grade 4 Students';
  return {
    upcoming: [
      {
        _id: 'sample-outing-wildlife',
        kind: 'outing',
        title: 'School Trip – Wildlife Park',
        location: 'Nairobi National Park',
        notes: 'Learners should wear school uniform, pack a water bottle, and return consent before the trip.',
        startAt: new Date(y, 8, 5, 7, 30),
        endAt: new Date(y, 8, 5, 16, 0),
        grade: featured?.grade || 'Grade 4',
        audience,
        busCount: 1,
        teacherCount: 2,
        status: 'upcoming',
        permission: { status: 'granted', decidedAt: new Date(y, 7, 20) },
        sample: true,
      },
    ],
    history: [
      {
        _id: 'sample-outing-museum',
        kind: 'outing',
        title: 'Museum Visit',
        location: 'Nairobi National Museum',
        notes: '',
        startAt: new Date(y, 6, 18, 8, 30),
        endAt: new Date(y, 6, 18, 14, 0),
        grade: featured?.grade || 'Grade 4',
        audience,
        busCount: 1,
        teacherCount: 2,
        status: 'completed',
        permission: { status: 'granted', decidedAt: new Date(y, 5, 30) },
        sample: true,
      },
    ],
  };
}

function serializeBusTrip(trip) {
  const started = trip.startedAt || trip.scheduledFor || trip.serviceDate;
  const ended = trip.endedAt || null;
  return {
    _id: trip._id,
    kind: 'bus',
    title: busTripTitle(trip),
    routeName: trip.routeId?.name || '',
    routeLabel: busRouteLabel(trip),
    location: trip.routeId?.name || '',
    direction: trip.direction,
    period: trip.period || '',
    status: trip.status,
    startAt: started,
    endAt: ended,
    plate: trip.busId?.plate || '',
    busName: busDisplayName(trip.busId),
    driverName: trip.driverId?.name || '',
  };
}

function serializeOutingDetail(outing, permission, kids, extra = {}) {
  const base = serializeOuting(outing, permission, extra);
  const kid = serializeKidSnippet(kids?.[0]);
  const start = outing.startAt ? new Date(outing.startAt) : null;
  const end = outing.endAt ? new Date(outing.endAt) : addMinutes(start, 480);
  const mid = addMinutes(start, 90);
  const dest = outing.location || 'Trip destination';
  return {
    ...base,
    routeLabel: dest ? `School → ${dest}` : 'School trip',
    kid,
    timeline: [
      {
        key: 'start',
        kind: 'start',
        label: 'Start',
        title: 'School',
        subtitle: outing.audience || 'School gate',
        at: start,
        punctuality: punctualityLabel(start, start, outing.status),
      },
      {
        key: 'enroute',
        kind: 'enroute',
        label: 'En Route',
        title: dest,
        subtitle: outing.notes || 'School outing',
        at: mid,
        punctuality: punctualityLabel(mid, mid, outing.status),
      },
      {
        key: 'end',
        kind: 'end',
        label: 'End',
        title: 'Return to school',
        subtitle: dest,
        at: end,
        punctuality: punctualityLabel(end, end, outing.status),
      },
    ],
    bus: {
      name: `${outing.busCount || 1} Bus`,
      plate: '',
      capacity: null,
      driver: { name: '', phone: '' },
      assistant: { name: `${outing.teacherCount || 1} Teachers`, phone: '' },
    },
    safety: tripSafety(base.status),
  };
}

async function serializeBusTripDetail(trip, { kids, events, stops, profile, school }) {
  const myKids = kids.filter((k) =>
    (trip.kidIds || []).some((id) => String(id?._id || id) === String(k._id))
  );
  const kid = myKids[0] || kids[0] || (Array.isArray(trip.kidIds) ? trip.kidIds[0] : null);
  const homeStop =
    stops.find((s) => s.type !== 'school' && String(kid?.homeStopId) === String(s._id)) ||
    stops.find((s) => s.type === 'home' || s.type !== 'school');
  const schoolStop = stops.find((s) => s.type === 'school');
  const midStop = stops.find(
    (s) =>
      s.type !== 'school' &&
      String(s._id) !== String(homeStop?._id) &&
      String(s._id) !== String(schoolStop?._id)
  );
  const toSchool = trip.direction !== 'to_home';
  const startStop = toSchool ? homeStop : schoolStop;
  const endStop = toSchool ? schoolStop : homeStop;

  const kidId = kid?._id;
  const picked = events.find((e) => String(e.kidId) === String(kidId) && e.type === 'picked_up');
  const dropped = events.find((e) => String(e.kidId) === String(kidId) && e.type === 'dropped_off');

  const scheduledStart = trip.scheduledFor || trip.serviceDate || trip.startedAt;
  const expectedStart = scheduledStart;
  const expectedMid = addMinutes(scheduledStart, 15);
  const expectedEnd = addMinutes(scheduledStart, 40);

  const startAt = picked?.at || trip.startedAt || expectedStart;
  const midAt =
    trip.status === 'scheduled'
      ? expectedMid
      : midStop
        ? addMinutes(startAt, 12)
        : addMinutes(startAt, 12);
  const endAt = dropped?.at || trip.endedAt || (trip.status === 'scheduled' ? expectedEnd : addMinutes(startAt, 35));

  const schoolName = school?.name || trip.schoolId?.name || 'School';
  const schoolAddress = school?.address || trip.schoolId?.address || '';
  const bus = trip.busId && typeof trip.busId === 'object' ? trip.busId : null;
  const driver = trip.driverId && typeof trip.driverId === 'object' ? trip.driverId : null;

  const startTitle = toSchool ? 'Home' : schoolName;
  const startSub = toSchool ? homeStop?.name || 'Home stop' : schoolAddress || schoolStop?.name || '';
  const endTitle = toSchool ? schoolName : 'Home';
  const endSub = toSchool ? schoolAddress || schoolStop?.name || '' : homeStop?.name || 'Home stop';

  return {
    ...serializeBusTrip(trip),
    kid: serializeKidSnippet(kid),
    timeline: [
      {
        key: 'start',
        kind: 'start',
        label: 'Start',
        title: startTitle,
        subtitle: startSub,
        at: startAt,
        punctuality: punctualityLabel(
          trip.status === 'scheduled' ? null : startAt,
          expectedStart,
          trip.status
        ),
      },
      {
        key: 'enroute',
        kind: 'enroute',
        label: 'En Route',
        title: midStop?.name || 'Main Stop',
        subtitle: trip.routeId?.name || 'Along the route',
        at: midAt,
        punctuality: punctualityLabel(
          trip.status === 'scheduled' ? null : trip.status === 'completed' || picked ? midAt : null,
          expectedMid,
          trip.status
        ),
      },
      {
        key: 'end',
        kind: 'end',
        label: 'End',
        title: endTitle,
        subtitle: endSub,
        at: endAt,
        punctuality: punctualityLabel(
          trip.status === 'completed' || dropped ? endAt : null,
          expectedEnd,
          trip.status
        ),
      },
    ].filter((step) => step.title),
    bus: {
      name: busDisplayName(bus),
      plate: bus?.plate || profile?.vehiclePlate || '',
      capacity: bus?.seats || null,
      driver: {
        name: driver?.name || '',
        phone: driver?.phone || '',
      },
      assistant: {
        name: bus?.assistantName || '',
        phone: bus?.assistantPhone || '',
      },
    },
    safety: tripSafety(trip.status),
    startStop: startStop
      ? { _id: startStop._id, name: startStop.name, location: startStop.location }
      : null,
    endStop: endStop ? { _id: endStop._id, name: endStop.name, location: endStop.location } : null,
  };
}

function orderStopsForTrip(stops, direction) {
  const homes = (stops || [])
    .filter((s) => s.type !== 'school')
    .sort((a, b) => (a.order || 0) - (b.order || 0));
  const school = (stops || [])
    .filter((s) => s.type === 'school')
    .sort((a, b) => (a.order || 0) - (b.order || 0));
  return direction === 'to_home' ? [...school, ...homes] : [...homes, ...school];
}

function speedToKmh(speed) {
  const n = Number(speed);
  if (!Number.isFinite(n) || n < 0) return null;
  return n > 40 ? Math.round(n) : Math.round(n * 3.6);
}

function updatedLabel(at) {
  if (!at) return 'Updated just now';
  const ms = Date.now() - new Date(at).getTime();
  if (ms < 20000) return 'Updated just now';
  const mins = Math.max(1, Math.round(ms / 60000));
  if (mins < 60) return `Updated ${mins} min ago`;
  return 'Updated earlier';
}

function serializeParentLiveTracking(trip, { kids, events, stops, profile, school, notifyOnArrival }) {
  const myKids = kids.filter((k) =>
    (trip.kidIds || []).some((id) => String(id?._id || id) === String(k._id))
  );
  const kid = myKids[0] || kids[0] || null;
  const ordered = orderStopsForTrip(stops, trip.direction);
  const toSchool = trip.direction !== 'to_home';
  const homeStop =
    ordered.find((s) => s.type !== 'school' && String(kid?.homeStopId?._id || kid?.homeStopId) === String(s._id)) ||
    ordered.find((s) => s.type !== 'school');
  const schoolStop = ordered.find((s) => s.type === 'school');
  const startStop = toSchool ? homeStop : schoolStop;
  const endStop = toSchool ? schoolStop : homeStop;
  const kidId = kid?._id;
  const picked = events.find((e) => String(e.kidId) === String(kidId) && e.type === 'picked_up');
  const dropped = events.find((e) => String(e.kidId) === String(kidId) && e.type === 'dropped_off');
  const loc = trip.latestLocation || startStop?.location || school?.location || null;
  let currentIndex = 0;
  if (loc && ordered.length) {
    let best = Infinity;
    ordered.forEach((s, i) => {
      const km = kmBetween(loc, s.location);
      if (km != null && km < best) {
        best = km;
        currentIndex = i;
      }
    });
  } else if (picked) {
    currentIndex = Math.min(1, Math.max(0, ordered.length - 1));
  }
  if (dropped) currentIndex = Math.max(0, ordered.length - 1);

  const startAt = picked?.at || trip.startedAt || trip.scheduledFor || new Date();
  const destLoc = endStop?.location || school?.location;
  const etaMins =
    etaMinutesFromKm(kmBetween(loc, destLoc)) ||
    Math.max(1, (ordered.length - 1 - currentIndex) * 7 || 8);
  const etaAt = addMinutes(new Date(), etaMins);
  const bus = trip.busId && typeof trip.busId === 'object' ? trip.busId : null;
  const driver = trip.driverId && typeof trip.driverId === 'object' ? trip.driverId : null;
  const schoolName = school?.name || trip.schoolId?.name || 'School';
  const next = ordered[currentIndex + 1] || endStop || null;
  const currentStop = ordered[currentIndex] || startStop;
  const city = String(school?.address || '')
    .split(',')
    .slice(-2)
    .join(',')
    .trim();
  const speedKmh = speedToKmh(trip.latestLocation?.speed);
  const liveStops = ordered.map((s, i) => {
    const at = addMinutes(startAt, i * 7);
    const kind = i === 0 ? 'start' : i === ordered.length - 1 ? 'end' : 'waypoint';
    const time = formatClock(at);
    return {
      _id: s._id,
      name: s.name,
      type: s.type,
      kind,
      order: s.order,
      location: s.location,
      time,
      caption: `${s.name}${time ? `, ${time}` : ''}`,
      done: i < currentIndex,
      current: i === currentIndex,
    };
  });

  const progress = [];
  progress.push({
    key: 'start',
    kind: 'start',
    label: picked ? 'Picked Up' : 'Pickup',
    time: formatClock(picked?.at || startAt),
    state: picked || currentIndex > 0 ? 'done' : 'upcoming',
  });
  if (ordered.length <= 2) {
    progress.push({
      key: 'enroute',
      kind: 'bus',
      label: 'On Route',
      time: '',
      state: dropped ? 'done' : picked || trip.status === 'active' ? 'current' : 'upcoming',
    });
  } else {
    for (let i = 1; i < ordered.length - 1; i += 1) {
      let state = 'upcoming';
      if (i < currentIndex) state = 'done';
      else if (i === currentIndex) state = 'current';
      progress.push({
        key: String(ordered[i]._id || i),
        kind: i === currentIndex ? 'bus' : 'stop',
        label: i === currentIndex ? 'On Route' : ordered[i].name,
        time: '',
        state,
      });
    }
  }
  progress.push({
    key: 'end',
    kind: 'end',
    label: dropped ? 'Arrived' : 'Arriving Soon',
    time: formatClock(dropped?.at || etaAt),
    state: dropped ? 'done' : 'upcoming',
  });

  const statusLabel =
    trip.status === 'completed'
      ? 'Trip completed'
      : trip.status === 'cancelled' || trip.status === 'canceled'
        ? 'Trip cancelled'
        : trip.status === 'active'
          ? 'Bus is On Route'
          : 'Bus is scheduled';

  return {
    kid: diaryKidCard(kid),
    trip: {
      _id: trip._id,
      status: trip.status,
      direction: trip.direction,
      title: busTripTitle(trip),
      latestLocation: loc,
    },
    bus: {
      name: busDisplayName(bus),
      plate: bus?.plate || profile?.vehiclePlate || '',
      driver: {
        name: driver?.name || '',
        phone: formatParentPhone(driver?.phone || ''),
        rawPhone: driver?.phone || '',
      },
      assistant: {
        name: bus?.assistantName || '',
        phone: formatParentPhone(bus?.assistantPhone || ''),
        rawPhone: bus?.assistantPhone || '',
      },
    },
    route: {
      statusLabel,
      updatedAt: trip.latestLocation?.at || trip.startedAt || null,
      updatedLabel: updatedLabel(trip.latestLocation?.at || trip.startedAt),
      eta: {
        clock: formatClock(etaAt),
        minutes: etaMins,
        label: toSchool ? 'Estimated arrival at school' : 'Estimated arrival at home',
      },
      currentLocation: [currentStop?.name, city].filter(Boolean).join(', ') || currentStop?.name || 'On route',
      nextStop: next
        ? { name: next.name, minutes: Math.max(1, Math.round(etaMins / Math.max(1, ordered.length - 1 - currentIndex))) }
        : null,
      speedKmh,
      stops: liveStops,
    },
    progress,
    notifyOnArrival: notifyOnArrival === true,
    firstName: String(kid?.name || 'your child').trim().split(/\s+/)[0],
    destinationName: toSchool ? schoolName : homeStop?.name || 'Home',
  };
}

router.get('/trips', async (req, res) => {
  try {
    const kids = await Kid.find({ parentIds: req.user.id, active: true });
    const kidIds = kids.map((k) => k._id);
    const schoolIds = [...new Set(kids.map((k) => k.schoolId?.toString()).filter(Boolean))];
    const today = startOfDay();

    const [trips, notifications, outings] = await Promise.all([
      kidIds.length
        ? Trip.find({ kidIds: { $in: kidIds } })
      .populate('routeId', 'name')
      .populate('schoolId', 'name')
            .populate('driverId', 'name photoUrl phone')
            .populate('busId', 'plate label seats assistantName assistantPhone')
            .sort({ startedAt: -1, scheduledFor: -1 })
            .limit(80)
        : [],
      Notification.find({ userId: req.user.id }).sort({ createdAt: -1 }).limit(80),
      schoolIds.length
        ? SchoolOuting.find({ schoolId: { $in: schoolIds }, active: true })
            .populate('routeId', 'name')
            .populate('busId', 'plate label')
            .populate('driverId', 'name')
            .sort({ startAt: 1 })
        : [],
    ]);

    const outingIds = outings.map((o) => o._id);
    const permissions = outingIds.length
      ? await OutingPermission.find({
          outingId: { $in: outingIds },
          parentId: req.user.id,
          kidId: { $in: kidIds },
        })
      : [];
    const permByOuting = new Map();
    for (const p of permissions) {
      permByOuting.set(p.outingId.toString(), p);
    }

    const visibleOutings = outings.filter((o) => outingMatchesKids(o, kids));
    const upcomingOutings = visibleOutings
      .filter((o) => o.status === 'upcoming' && new Date(o.endAt || o.startAt) >= today)
      .map((o) => serializeOuting(o, permByOuting.get(o._id.toString())));
    const outingHistory = visibleOutings
      .filter((o) => o.status === 'completed' || new Date(o.endAt || o.startAt) < today)
      .map((o) => serializeOuting(o, permByOuting.get(o._id.toString()), { status: 'completed' }));

    const upcoming = upcomingOutings;

    const isOutingTrip = (t) => Boolean(t.outingId) || t.kind === 'outing';

    const scheduledBus = trips
      .filter((t) => t.status === 'scheduled')
      .filter((t) => !isOutingTrip(t))
      .filter((t) => !isEveningTrip(t))
      .map((t) => {
        const my = kids.find((k) => (t.kidIds || []).some((id) => String(id?._id || id) === String(k._id)));
        return { ...serializeBusTrip(t), permission: null, kid: serializeKidSnippet(my) };
      });
    upcoming.push(...scheduledBus);

    const activeTrips = trips.filter((t) => t.status === 'active');
    const liveRows = await Promise.all(
      activeTrips.map(async (trip) => {
        const myKids = kids.filter((k) => trip.kidIds.some((id) => String(id) === String(k._id)));
        const [events, allStops, profile] = await Promise.all([
          TripEvent.find({ tripId: trip._id }),
          trip.routeId?._id || trip.routeId
            ? Stop.find({ routeId: trip.routeId._id || trip.routeId }).sort({ order: 1 })
            : [],
          DriverProfile.findOne({ userId: trip.driverId?._id || trip.driverId }),
        ]);
        const schoolStop = allStops.find((s) => s.type === 'school');
        const homeStop = allStops.find(
          (s) => s.type !== 'school' && myKids.some((k) => String(k.homeStopId) === String(s._id))
        );
        const dest = trip.direction === 'to_home' ? homeStop?.location : schoolStop?.location;
        const eta = etaMinutesFromKm(kmBetween(trip.latestLocation, dest));
        if (!parentMayTrackTrip(trip, events, myKids)) return null;
        const kidStatus = myKids.map((k) => {
          const picked = events.find((e) => String(e.kidId) === String(k._id) && e.type === 'picked_up');
          const dropped = events.find((e) => String(e.kidId) === String(k._id) && e.type === 'dropped_off');
          let boarding = 'waiting';
          if (dropped) boarding = 'dropped';
          else if (picked) boarding = 'on_board';
          return {
            _id: k._id,
            name: k.name,
            photoUrl: k.photoUrl || '',
            boarding,
            checkedInAt: picked?.at || null,
          };
        });
        return {
          ...serializeBusTrip(trip),
          kid: serializeKidSnippet(myKids[0]),
          driver: {
            name: trip.driverId?.name || '',
            photoUrl: trip.driverId?.photoUrl || '',
            phone: trip.driverId?.phone || '',
          },
          plate: trip.busId?.plate || profile?.vehiclePlate || '',
          etaMinutes: eta,
          kids: kidStatus,
        };
      })
    );
    const live = liveRows.filter(Boolean);

    const busHistory = trips
      .filter((t) => t.status === 'completed' || t.status === 'cancelled' || t.status === 'canceled')
      .filter((t) => !isOutingTrip(t))
      .map((t) => {
        const my = kids.find((k) => (t.kidIds || []).some((id) => String(id?._id || id) === String(k._id)));
        return { ...serializeBusTrip(t), kid: serializeKidSnippet(my) };
      });
    const history = [...outingHistory, ...busHistory].sort(
      (a, b) => new Date(b.startAt || 0) - new Date(a.startAt || 0)
    );
    const historyOut = history;

    res.json({
      upcoming,
      live,
      history: historyOut.slice(0, 40),
      trips,
      unread: notifications.filter((n) => n.read !== true).length,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/trips/:id', async (req, res) => {
  try {
    const kids = await Kid.find({ parentIds: req.user.id, active: true })
      .populate('schoolId', 'name address location')
      .populate('homeStopId', 'name location');
    const id = String(req.params.id);

    if (!/^[a-fA-F0-9]{24}$/.test(id)) {
      return res.status(404).json({ error: 'Trip not found' });
    }

    const trip = await Trip.findById(id)
      .populate('routeId', 'name')
      .populate('schoolId', 'name address location')
      .populate('driverId', 'name phone photoUrl')
      .populate('busId', 'plate label seats assistantName assistantPhone')
      .populate('kidIds', 'name grade section photoUrl homeStopId');
    if (trip) {
      const allowed = kids.some((k) =>
        (trip.kidIds || []).some((tk) => String(tk?._id || tk) === String(k._id))
      );
      if (!allowed) return res.status(404).json({ error: 'Trip not found' });
      const [events, stops, profile] = await Promise.all([
        TripEvent.find({ tripId: trip._id }),
        trip.routeId?._id || trip.routeId
          ? Stop.find({ routeId: trip.routeId._id || trip.routeId }).sort({ order: 1 })
          : [],
        DriverProfile.findOne({ userId: trip.driverId?._id || trip.driverId }),
      ]);
      const school = trip.schoolId && typeof trip.schoolId === 'object' ? trip.schoolId : null;
      if (!parentMayTrackTrip(trip, events, kids)) {
        return res.status(404).json({ error: 'Trip not found' });
      }
      return res.json({
        trip: await serializeBusTripDetail(trip, { kids, events, stops, profile, school }),
      });
    }

    const outing = await SchoolOuting.findOne({ _id: id, active: true });
    if (!outing) return res.status(404).json({ error: 'Trip not found' });
    const schoolOk = kids.some((k) => String(k.schoolId) === String(outing.schoolId));
    if (!schoolOk || !outingMatchesKids(outing, kids)) {
      return res.status(404).json({ error: 'Trip not found' });
    }
    const permission = await OutingPermission.findOne({
      outingId: outing._id,
      parentId: req.user.id,
      kidId: { $in: kids.map((k) => k._id) },
    });
    res.json({ trip: serializeOutingDetail(outing, permission, kids) });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/trips/:id/live', async (req, res) => {
  try {
    const id = String(req.params.id);
    if (!/^[a-fA-F0-9]{24}$/.test(id)) {
      return res.status(404).json({ error: 'Trip not found' });
    }
    const kids = await Kid.find({ parentIds: req.user.id, active: true })
      .populate('schoolId', 'name address location')
      .populate('homeStopId', 'name location');
    const trip = await Trip.findById(id)
      .populate('routeId', 'name')
      .populate('schoolId', 'name address location')
      .populate('driverId', 'name phone photoUrl')
      .populate('busId', 'plate label seats assistantName assistantPhone')
      .populate('kidIds', 'name grade section photoUrl homeStopId rollNo house');
    if (!trip) return res.status(404).json({ error: 'Trip not found' });
    const allowed = kids.some((k) =>
      (trip.kidIds || []).some((tk) => String(tk?._id || tk) === String(k._id))
    );
    if (!allowed) return res.status(404).json({ error: 'Trip not found' });
    const [events, stops, profile, user] = await Promise.all([
      TripEvent.find({ tripId: trip._id }),
      trip.routeId?._id || trip.routeId
        ? Stop.find({ routeId: trip.routeId._id || trip.routeId }).sort({ order: 1 })
        : [],
      DriverProfile.findOne({ userId: trip.driverId?._id || trip.driverId }),
      User.findById(req.user.id).select('preferences'),
    ]);
    const school = trip.schoolId && typeof trip.schoolId === 'object' ? trip.schoolId : null;
    const notifyOnArrival = (user?.preferences?.notifyArrivalTripIds || []).some(
      (tid) => String(tid) === String(trip._id)
    );
    if (!parentMayTrackTrip(trip, events, kids)) {
      return res.status(404).json({ error: 'Trip not found' });
    }
    res.json(serializeParentLiveTracking(trip, { kids, events, stops, profile, school, notifyOnArrival }));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/trips/:id/notify-arrival', async (req, res) => {
  try {
    const id = String(req.params.id);
    if (!/^[a-fA-F0-9]{24}$/.test(id)) {
      return res.status(404).json({ error: 'Trip not found' });
    }
    const kids = await Kid.find({ parentIds: req.user.id, active: true }).select('_id');
    const trip = await Trip.findById(id).select('kidIds');
    if (!trip) return res.status(404).json({ error: 'Trip not found' });
    const allowed = kids.some((k) =>
      (trip.kidIds || []).some((tk) => String(tk?._id || tk) === String(k._id))
    );
    if (!allowed) return res.status(404).json({ error: 'Trip not found' });
    const enabled = req.body?.enabled !== false;
    const user = await User.findById(req.user.id);
    if (!user.preferences) user.preferences = {};
    const ids = new Set((user.preferences.notifyArrivalTripIds || []).map((x) => String(x)));
    if (enabled) ids.add(id);
    else ids.delete(id);
    user.preferences.notifyArrivalTripIds = [...ids];
    if (enabled) user.preferences.notifyTrips = true;
    user.markModified('preferences');
    await user.save();
    res.json({ notifyOnArrival: enabled });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/outings/:id', async (req, res) => {
  try {
    const kids = await Kid.find({ parentIds: req.user.id, active: true });
    if (!/^[a-fA-F0-9]{24}$/.test(String(req.params.id))) {
      return res.status(404).json({ error: 'Trip not found' });
    }
    const outing = await SchoolOuting.findOne({ _id: req.params.id, active: true });
    if (!outing) return res.status(404).json({ error: 'Trip not found' });
    const schoolOk = kids.some((k) => String(k.schoolId) === String(outing.schoolId));
    if (!schoolOk || !outingMatchesKids(outing, kids)) {
      return res.status(404).json({ error: 'Trip not found' });
    }
    const permission = await OutingPermission.findOne({
      outingId: outing._id,
      parentId: req.user.id,
      kidId: { $in: kids.map((k) => k._id) },
    });
    res.json({ outing: serializeOuting(outing, permission) });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/outings/:id/permission', async (req, res) => {
  try {
    if (!/^[a-fA-F0-9]{24}$/.test(String(req.params.id))) {
      return res.status(404).json({ error: 'Trip not found' });
    }
    const status = req.body?.status === 'denied' ? 'denied' : 'granted';
    const kids = await Kid.find({ parentIds: req.user.id, active: true });
    const outing = await SchoolOuting.findOne({ _id: req.params.id, active: true });
    if (!outing) return res.status(404).json({ error: 'Trip not found' });
    const schoolOk = kids.some((k) => String(k.schoolId) === String(outing.schoolId));
    if (!schoolOk || !outingMatchesKids(outing, kids)) {
      return res.status(404).json({ error: 'Trip not found' });
    }
    const kidId = req.body?.kidId || kids[0]?._id;
    const kid = kids.find((k) => String(k._id) === String(kidId));
    if (!kid) return res.status(403).json({ error: 'Child not linked to this parent' });

    const permission = await OutingPermission.findOneAndUpdate(
      { outingId: outing._id, parentId: req.user.id, kidId: kid._id },
      { $set: { status, decidedAt: new Date() } },
      { new: true, upsert: true, setDefaultsOnInsert: true }
    );
    res.json({ outing: serializeOuting(outing, permission) });
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

function addDays(date, days) {
  if (!date) return null;
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return d;
}

function leaveTypeLabel(type) {
  switch (String(type || '')) {
    case 'sick':
      return 'Sickness';
    case 'family':
      return 'Family Function';
    case 'other':
      return 'Other';
    default:
      return 'Family Vacation';
  }
}

function kidClassLabel(kid) {
  const section = String(kid?.section || '').trim();
  if (!section) return '';
  return section.toLowerCase().startsWith('class') ? section : `Class ${section}`;
}

function serializeParentLeave(row) {
  const doc = row.toObject ? row.toObject() : row;
  const kid = doc.kidId && typeof doc.kidId === 'object' && doc.kidId._id ? doc.kidId : {};
  const reviewer = doc.reviewedBy && typeof doc.reviewedBy === 'object' && doc.reviewedBy.name ? doc.reviewedBy : null;
  const start = doc.startDate;
  const end = doc.endDate;
  const days = dayCountInclusive(start, end);
  const expected = doc.expectedReturnDate || addDays(end, 1);
  const rawGrade = String(kid.grade || '').trim();
  const grade = !rawGrade ? '' : /^grade\b/i.test(rawGrade) ? rawGrade : `Grade ${rawGrade}`;
  const classLabel = kidClassLabel(kid);
  const roll = kid.rollNo || kid.house || '';
  const status = doc.status || 'pending';
  const firstName = String(kid.name || 'your child').trim().split(/\s+/)[0];
  const schoolNote =
    doc.reviewNote ||
    (status === 'approved'
      ? `Please ensure ${firstName} completes any pending assignments before leaving and catches up on his lessons after return.`
      : '');
  return {
    _id: doc._id,
    status,
    leaveType: doc.leaveType || 'vacation',
    leaveTypeLabel: leaveTypeLabel(doc.leaveType),
    durationType: doc.durationType || 'short',
    reason: doc.reason || '',
    notes: doc.notes || '',
    startDate: start,
    endDate: end,
    days,
    createdAt: doc.createdAt,
    reviewedAt: doc.reviewedAt,
    reviewNote: schoolNote,
    expectedReturnDate: expected,
    returnTime: doc.returnTime || '07:45',
    transportMode: doc.transportMode || 'School Bus',
    attachmentName: doc.attachmentName || '',
    attachmentUrl: doc.attachmentUrl || '',
    kid: {
      _id: kid._id,
      name: kid.name || 'Child',
      photoUrl: kid.photoUrl || '',
      grade,
      section: kid.section || '',
      classLabel,
      rollNo: roll,
      subtitle: [grade, classLabel, roll ? `Roll No. ${roll}` : ''].filter(Boolean).join(' • '),
    },
    kidId: kid._id
      ? {
          _id: kid._id,
          name: kid.name || 'Child',
          photoUrl: kid.photoUrl || '',
          grade,
          section: kid.section || '',
          rollNo: roll,
        }
      : doc.kidId,
    reviewer: reviewer
      ? {
          name: reviewer.name,
          photoUrl: reviewer.photoUrl || '',
          role: reviewer.jobTitle || 'Class Teacher',
        }
      : status === 'approved'
        ? { name: 'Class Teacher', photoUrl: '', role: 'Class Teacher' }
        : null,
    canEdit: status === 'pending' || status === 'approved',
    canCancel: status === 'pending' || status === 'approved',
  };
}

const leaveKidPopulate = {
  path: 'kidId',
  select: 'name grade house section rollNo admissionNo photoUrl schoolId',
  populate: { path: 'schoolId', select: 'name' },
};

async function ensureParentLeaveSample(parentId) {
  const existing = await LeaveRequest.findOne({ parentId });
  if (existing) return;
  const kid = await Kid.findOne({ parentIds: parentId, active: true });
  if (!kid) return;
  const teacher = await User.findOne({
    schoolId: kid.schoolId,
    role: 'teacher',
    active: { $ne: false },
  }).select('name');
  const start = new Date();
  start.setDate(start.getDate() + 7);
  start.setHours(0, 0, 0, 0);
  const end = addDays(start, 4);
  const expected = addDays(end, 1);
  const requested = new Date();
  requested.setHours(9, 15, 0, 0);
  const approved = new Date();
  approved.setHours(11, 20, 0, 0);
  const firstName = String(kid.name || 'your child').trim().split(/\s+/)[0];
  try {
    await LeaveRequest.create({
      schoolId: kid.schoolId,
      kidId: kid._id,
      parentId,
      leaveType: 'vacation',
      durationType: 'short',
      startDate: start,
      endDate: end,
      expectedReturnDate: expected,
      returnTime: '07:45',
      transportMode: 'School Bus',
      reason: 'Going for a family vacation.',
      notes: '',
      status: 'approved',
      reviewedBy: teacher?._id || null,
      reviewedAt: approved,
      reviewNote: `Please ensure ${firstName} completes any pending assignments before leaving and catches up on lessons after return.`,
      createdAt: requested,
      updatedAt: approved,
    });
  } catch (_) {
    /* ignore duplicate sample */
  }
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
      .populate(leaveKidPopulate)
      .populate('reviewedBy', 'name photoUrl jobTitle')
      .sort({ createdAt: -1 })
      .limit(100);
    const unread = await Notification.countDocuments({ userId: req.user.id, read: { $ne: true } });
    res.json({
      unread,
      requests: requests.map((r) => serializeParentLeave(r)),
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/leave-requests', async (req, res) => {
  try {
    const {
      kidId,
      leaveType,
      durationType,
      startDate,
      endDate,
      reason,
      notes,
      returnTime,
      transportMode,
      expectedReturnDate,
      attachmentName,
      attachmentUrl,
      attachmentPublicId,
    } = req.body || {};
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
    const expected = expectedReturnDate ? new Date(expectedReturnDate) : addDays(end, 1);

    const created = await LeaveRequest.create({
      schoolId: kid.schoolId,
      kidId: kid._id,
      parentId: req.user.id,
      leaveType: ['vacation', 'sick', 'family', 'other'].includes(leaveType) ? leaveType : 'vacation',
      durationType: ['short', 'long', 'emergency'].includes(durationType) ? durationType : 'short',
      startDate: start,
      endDate: end,
      expectedReturnDate: expected && !Number.isNaN(expected.getTime()) ? expected : addDays(end, 1),
      returnTime: typeof returnTime === 'string' && returnTime.trim() ? returnTime.trim().slice(0, 16) : '07:45',
      transportMode: typeof transportMode === 'string' && transportMode.trim() ? transportMode.trim().slice(0, 40) : 'School Bus',
      reason: typeof reason === 'string' ? reason.trim().slice(0, 250) : '',
      notes: typeof notes === 'string' ? notes.trim().slice(0, 500) : '',
      attachmentName: typeof attachmentName === 'string' ? attachmentName.slice(0, 120) : '',
      attachmentUrl: typeof attachmentUrl === 'string' ? attachmentUrl.slice(0, 500) : '',
      attachmentPublicId: typeof attachmentPublicId === 'string' ? attachmentPublicId.slice(0, 200) : '',
      status: 'pending',
    });

    const populated = await LeaveRequest.findById(created._id)
      .populate(leaveKidPopulate)
      .populate('reviewedBy', 'name photoUrl jobTitle');
    res.status(201).json({ request: serializeParentLeave(populated) });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/leave-requests/:id', async (req, res) => {
  try {
    const request = await LeaveRequest.findOne({
      _id: req.params.id,
      parentId: req.user.id,
    })
      .populate(leaveKidPopulate)
      .populate('reviewedBy', 'name photoUrl jobTitle');
    if (!request) return res.status(404).json({ error: 'Leave request not found' });
    res.json({ request: serializeParentLeave(request) });
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

    const {
      startDate,
      endDate,
      reason,
      notes,
      leaveType,
      durationType,
      extensionReason,
      returnTime,
      transportMode,
      expectedReturnDate,
      attachmentName,
      attachmentUrl,
      attachmentPublicId,
    } = req.body || {};
    if (startDate != null) {
      const start = new Date(startDate);
      if (Number.isNaN(start.getTime())) return res.status(400).json({ error: 'Invalid start date' });
      request.startDate = start;
    }
    if (endDate != null) {
      const end = new Date(endDate);
      if (Number.isNaN(end.getTime()) || end < request.startDate) {
        return res.status(400).json({ error: 'Invalid return date' });
      }
      request.endDate = end;
      if (!expectedReturnDate) request.expectedReturnDate = addDays(end, 1);
    }
    if (expectedReturnDate != null) {
      const expected = new Date(expectedReturnDate);
      if (!Number.isNaN(expected.getTime())) request.expectedReturnDate = expected;
    }
    if (typeof reason === 'string') request.reason = reason.trim().slice(0, 250);
    if (typeof notes === 'string') request.notes = notes.trim().slice(0, 500);
    if (typeof extensionReason === 'string') request.extensionReason = extensionReason.trim().slice(0, 300);
    if (typeof returnTime === 'string' && returnTime.trim()) request.returnTime = returnTime.trim().slice(0, 16);
    if (typeof transportMode === 'string' && transportMode.trim()) {
      request.transportMode = transportMode.trim().slice(0, 40);
    }
    if (['vacation', 'sick', 'family', 'other'].includes(leaveType)) {
      request.leaveType = leaveType;
    }
    if (['short', 'long', 'emergency'].includes(durationType)) {
      request.durationType = durationType;
    }
    if (typeof attachmentName === 'string') request.attachmentName = attachmentName.slice(0, 120);
    if (typeof attachmentUrl === 'string') request.attachmentUrl = attachmentUrl.slice(0, 500);
    if (typeof attachmentPublicId === 'string') {
      request.attachmentPublicId = attachmentPublicId.slice(0, 200);
    }

    await request.save();
    const populated = await request.populate([leaveKidPopulate, { path: 'reviewedBy', select: 'name photoUrl jobTitle' }]);
    res.json({ request: serializeParentLeave(populated) });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.patch('/leave-requests/:id/return-date', async (req, res) => {
  try {
    const request = await LeaveRequest.findOne({
      _id: req.params.id,
      parentId: req.user.id,
    });
    if (!request) return res.status(404).json({ error: 'Leave request not found' });
    if (!['pending', 'approved'].includes(request.status)) {
      return res.status(409).json({ error: 'Only pending or approved leave can be extended' });
    }
    const end = new Date(req.body?.endDate);
    if (Number.isNaN(end.getTime()) || end < request.startDate) {
      return res.status(400).json({ error: 'Invalid return date' });
    }
    request.endDate = end;
    if (req.body?.expectedReturnDate) {
      const expected = new Date(req.body.expectedReturnDate);
      if (!Number.isNaN(expected.getTime())) request.expectedReturnDate = expected;
    } else {
      request.expectedReturnDate = addDays(end, 1);
    }
    if (typeof req.body?.returnTime === 'string' && req.body.returnTime.trim()) {
      request.returnTime = req.body.returnTime.trim().slice(0, 16);
    }
    if (typeof req.body?.transportMode === 'string' && req.body.transportMode.trim()) {
      request.transportMode = req.body.transportMode.trim().slice(0, 40);
    }
    if (typeof req.body?.extensionReason === 'string') {
      request.extensionReason = req.body.extensionReason.trim().slice(0, 300);
    }
    await request.save();
    const populated = await request.populate([leaveKidPopulate, { path: 'reviewedBy', select: 'name photoUrl jobTitle' }]);
    res.json({ request: serializeParentLeave(populated) });
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
    if (!['pending', 'approved'].includes(request.status)) {
      return res.status(409).json({ error: 'This request can no longer be cancelled' });
    }
    request.status = 'cancelled';
    await request.save();
    const populated = await request.populate([leaveKidPopulate, { path: 'reviewedBy', select: 'name photoUrl jobTitle' }]);
    res.json({ request: serializeParentLeave(populated) });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

function parentNoticeKind(a) {
  if (['important', 'general', 'information', 'event', 'reminder'].includes(a.kind)) return a.kind;
  if (a.category === 'urgent') return 'important';
  if (a.category === 'events') return 'event';
  return 'general';
}

function parentNoticeIcon(a) {
  if (a.icon) return a.icon;
  const kind = parentNoticeKind(a);
  if (kind === 'important') return 'megaphone';
  if (kind === 'event') return 'trophy';
  if (kind === 'reminder') return 'warning';
  if (a.category === 'transport') return 'bus';
  if (kind === 'information') return 'book';
  return 'megaphone';
}

function formatAttachmentSize(bytes) {
  const n = Number(bytes) || 0;
  if (n <= 0) return '';
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${Math.round(n / 1024)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

function serializeAnnouncementComment(row, userId) {
  const doc = row.toObject ? row.toObject() : row;
  return {
    _id: doc._id,
    authorName: doc.authorName || 'Parent',
    authorRole: doc.authorRole || 'Parent',
    authorPhotoUrl: doc.authorPhotoUrl || '',
    body: doc.body || '',
    createdAt: doc.createdAt,
    mine: doc.userId ? String(doc.userId) === String(userId) : false,
  };
}

function serializeParentAnnouncement(a, userId, extra = {}) {
  const row = a.toObject ? a.toObject() : a;
  const published = row.publishedAt || row.createdAt;
  const readBy = (row.readBy || []).map((id) => String(id));
  const likedBy = (row.likedBy || []).map((id) => String(id));
  const acks = (row.acknowledgedBy || []).filter((x) => x?.userId);
  const myAck = acks.find((x) => String(x.userId) === String(userId));
  const isRead = readBy.includes(String(userId));
  const liked = likedBy.includes(String(userId));
  const age = Date.now() - new Date(published).getTime();
  const kind = parentNoticeKind(row);
  return {
    _id: row._id,
    title: row.title,
    body: row.body,
    category: row.category || 'general',
    kind,
    icon: parentNoticeIcon(row),
    authorName: row.authorName || 'Admin',
    audience: row.audience || row.authorName || 'School',
    publishedAt: published,
    attachmentName: row.attachmentName || '',
    attachmentUrl: row.attachmentUrl || '',
    attachmentSize: row.attachmentSize || 0,
    attachmentSizeLabel: formatAttachmentSize(row.attachmentSize),
    isRead,
    isNew: !isRead && age < 7 * 24 * 60 * 60 * 1000,
    isImportant: kind === 'important' || row.category === 'urgent',
    isPinned: kind === 'important' || row.category === 'urgent',
    liked,
    likeCount: Math.max(likedBy.length, Number(row.reactionCount) || 0),
    acknowledged: Boolean(myAck),
    acknowledgedAt: myAck?.at || null,
    acknowledgedCount: acks.length,
    ...extra,
  };
}

const TERM2_REOPEN_BODY = `School reopens for Term 2 on Monday, 1 June 2026. All learners are expected on campus by 7:30 AM for an assembly in the main hall.

Please ensure your child reports in full school uniform, including the correct shoes and sweater. Class lists and timetables will be issued on the first day.

School fees for Term 2 should be cleared before opening day. The finance office is open weekdays from 8:00 AM to 4:00 PM. Contact the office if you need a payment plan.

We look forward to a focused and successful term. Kindly acknowledge this notice so we know you have received it.`;

async function ensureSampleNoticeComments(announcement) {
  const count = await AnnouncementComment.countDocuments({ announcementId: announcement._id });
  if (count > 0) return;
  const published = new Date(announcement.publishedAt || announcement.createdAt || Date.now());
  await AnnouncementComment.insertMany([
    {
      announcementId: announcement._id,
      authorName: 'Mary Wanjiku',
      authorRole: 'Parent',
      body: 'Thank you for the update.',
      sample: true,
      createdAt: new Date(published.getTime() + 32 * 60 * 1000),
    },
    {
      announcementId: announcement._id,
      authorName: 'Peter Otieno',
      authorRole: 'Parent',
      body: 'Noted. We will be ready on Monday.',
      sample: true,
      createdAt: new Date(published.getTime() + 58 * 60 * 1000),
    },
  ]);
}

async function assertParentAnnouncement(userId, announcementId) {
  const kids = await Kid.find({ parentIds: userId, active: true }).select('schoolId');
  const schoolIds = new Set(kids.map((k) => k.schoolId?.toString()).filter(Boolean));
  const announcement = await Announcement.findById(announcementId);
  if (!announcement || !announcement.active || announcement.archived) return null;
  if (!schoolIds.has(announcement.schoolId.toString())) return null;
  return announcement;
}

async function ensureParentNotices(schoolId) {
  const now = Date.now();
  const samples = [
    {
      sourceKey: 'sample:term2-reopen',
      title: 'School Reopens for Term 2',
      body: TERM2_REOPEN_BODY,
      kind: 'important',
      category: 'urgent',
      icon: 'megaphone',
      authorName: 'Admin',
      attachmentName: 'Term 2 Reopening Guidelines.pdf',
      attachmentSize: 1258291,
      reactionCount: 12,
      publishedAt: new Date(now - 12 * 60 * 60 * 1000),
    },
    {
      sourceKey: 'sample:midterm-break',
      title: 'Term 2 Mid-Term Break',
      body: 'School will close for the Term 2 mid-term break from 23 May to 2 June 2026. Regular classes resume on 3 June 2026.',
      kind: 'important',
      category: 'urgent',
      icon: 'megaphone',
      authorName: 'Admin',
      publishedAt: new Date(now - 1 * 24 * 60 * 60 * 1000),
    },
    {
      sourceKey: 'sample:transport-route',
      title: 'Transport Route Update',
      body: 'Greenview Estate pickup is now 07:05–07:10 AM. Drivers will wait only briefly at this stop.',
      kind: 'information',
      category: 'transport',
      icon: 'bus',
      authorName: 'Transport Office',
      publishedAt: new Date(now - 2 * 24 * 60 * 60 * 1000),
    },
    {
      sourceKey: 'sample:ptm-notice',
      title: 'Parent-Teacher Meeting',
      body: 'Parent-teacher meetings will be held this week. Please confirm your time slot with the class teacher and arrive 10 minutes early.',
      kind: 'event',
      category: 'events',
      icon: 'calendar',
      authorName: 'Academic Office',
      publishedAt: new Date(now - 3 * 24 * 60 * 60 * 1000),
    },
    {
      sourceKey: 'sample:uniform-notice',
      title: 'School Uniform Reminder',
      body: 'All learners should wear the complete school uniform, including the correct shoes and sweater, from Monday next week.',
      kind: 'reminder',
      category: 'general',
      icon: 'warning',
      authorName: 'Administration',
      publishedAt: new Date(now - 5 * 24 * 60 * 60 * 1000),
    },
    {
      sourceKey: 'sample:sports-day',
      title: 'Inter-House Sports Day',
      body: 'Inter-house sports day will take place on the school field. Learners should wear house colours and pack a water bottle.',
      kind: 'event',
      category: 'events',
      icon: 'trophy',
      authorName: 'Sports Department',
      publishedAt: new Date(now - 8 * 24 * 60 * 60 * 1000),
    },
    {
      sourceKey: 'sample:library-week',
      title: 'Library Week',
      body: 'Library Week begins Monday. New storybooks are available and students may borrow titles during library hours.',
      kind: 'information',
      category: 'class',
      icon: 'book',
      authorName: 'Library Department',
      publishedAt: new Date(now - 10 * 24 * 60 * 60 * 1000),
    },
  ];

  for (const sample of samples) {
    const existing = await Announcement.findOne({ schoolId, sourceKey: sample.sourceKey });
    if (existing) continue;
    try {
      await Announcement.create({
        schoolId,
        scope: 'school',
        audience: 'Parents',
        ...sample,
      });
    } catch (err) {
      if (err?.code !== 11000) throw err;
    }
  }

  const term2 = await Announcement.findOne({ schoolId, sourceKey: 'sample:term2-reopen' });
  if (term2) {
    let dirty = false;
    if (term2.body !== TERM2_REOPEN_BODY) {
      term2.body = TERM2_REOPEN_BODY;
      dirty = true;
    }
    if (!term2.attachmentName) {
      term2.attachmentName = 'Term 2 Reopening Guidelines.pdf';
      term2.attachmentSize = 1258291;
      dirty = true;
    }
    if (!term2.reactionCount) {
      term2.reactionCount = 12;
      dirty = true;
    }
    if (dirty) await term2.save();
    await ensureSampleNoticeComments(term2);
  }
}

router.get('/announcements', async (req, res) => {
  try {
    const kids = await Kid.find({ parentIds: req.user.id, active: true }).select('schoolId grade');
    const schoolIds = [...new Set(kids.map((k) => k.schoolId?.toString()).filter(Boolean))];
    if (!schoolIds.length) {
      return res.json({
        announcements: [],
        unreadCount: 0,
        total: 0,
        page: 1,
        pages: 1,
        unread: 0,
      });
    }

    const { category, tab, q } = req.query;
    const page = Math.max(1, Number(req.query.page) || 1);
    const pageSize = Math.min(20, Math.max(4, Number(req.query.pageSize) || 8));
    const grades = [...new Set(kids.map((k) => k.grade).filter(Boolean))];
    const filter = {
      schoolId: { $in: schoolIds },
      active: true,
      archived: { $ne: true },
      sourceKey: { $not: /^sample:/ },
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

    const tabKey = String(tab || 'all').toLowerCase();
    if (tabKey === 'important' || tabKey === 'announcements') {
      filter.$and.push({ $or: [{ kind: 'important' }, { category: 'urgent' }] });
    } else if (tabKey === 'events') {
      filter.$and.push({ $or: [{ kind: 'event' }, { category: 'events' }] });
    } else if (tabKey === 'general') {
      filter.$and.push({
        kind: { $nin: ['event', 'important'] },
        category: { $nin: ['events', 'urgent'] },
      });
    } else if (tabKey === 'unread') {
      filter.readBy = { $ne: req.user.id };
    }

    if (category && category !== 'all') filter.category = category;
    if (q && String(q).trim()) {
      const rx = new RegExp(String(q).trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
      filter.$and.push({ $or: [{ title: rx }, { body: rx }, { authorName: rx }] });
    }

    const unreadFilter = {
      schoolId: { $in: schoolIds },
      active: true,
      archived: { $ne: true },
      sourceKey: { $not: /^sample:/ },
      readBy: { $ne: req.user.id },
      $or: [
        { scope: { $ne: 'class' } },
        { scope: 'class', grade: { $in: grades } },
        { category: 'class', grade: { $in: grades } },
      ],
    };

    const [total, rows, unreadCount, bellUnread] = await Promise.all([
      Announcement.countDocuments(filter),
      Announcement.find(filter)
        .sort({ publishedAt: -1, createdAt: -1 })
        .skip((page - 1) * pageSize)
        .limit(pageSize),
      Announcement.countDocuments(unreadFilter),
      Notification.countDocuments({ userId: req.user.id, read: { $ne: true } }),
    ]);

    res.json({
      announcements: rows.map((a) => serializeParentAnnouncement(a, req.user.id)),
      unreadCount,
      total,
      page,
      pageSize,
      pages: Math.max(1, Math.ceil(total / pageSize)),
      unread: bellUnread,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/announcements/:id/read', async (req, res) => {
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
    await Announcement.updateOne({ _id: announcement._id }, { $addToSet: { readBy: req.user.id } });
    res.json({ ok: true, announcement: serializeParentAnnouncement(
      { ...announcement.toObject(), readBy: [...(announcement.readBy || []), req.user.id] },
      req.user.id,
    ) });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/announcements/:id', async (req, res) => {
  try {
    const announcement = await assertParentAnnouncement(req.user.id, req.params.id);
    if (!announcement) return res.status(404).json({ error: 'Announcement not found' });
    const comments = await AnnouncementComment.find({ announcementId: announcement._id }).sort({ createdAt: 1 });
    res.json({
      announcement: serializeParentAnnouncement(announcement, req.user.id, {
        comments: comments.map((c) => serializeAnnouncementComment(c, req.user.id)),
      }),
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/announcements/:id/like', async (req, res) => {
  try {
    const announcement = await assertParentAnnouncement(req.user.id, req.params.id);
    if (!announcement) return res.status(404).json({ error: 'Announcement not found' });
    const already = (announcement.likedBy || []).some((id) => String(id) === String(req.user.id));
    if (already) {
      announcement.likedBy = announcement.likedBy.filter((id) => String(id) !== String(req.user.id));
    } else {
      announcement.likedBy = [...(announcement.likedBy || []), req.user.id];
    }
    await announcement.save();
    res.json({ announcement: serializeParentAnnouncement(announcement, req.user.id) });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/announcements/:id/acknowledge', async (req, res) => {
  try {
    const announcement = await assertParentAnnouncement(req.user.id, req.params.id);
    if (!announcement) return res.status(404).json({ error: 'Announcement not found' });
    const already = (announcement.acknowledgedBy || []).some((x) => String(x.userId) === String(req.user.id));
    if (!already) {
      announcement.acknowledgedBy = [...(announcement.acknowledgedBy || []), { userId: req.user.id, at: new Date() }];
      await announcement.save();
    }
    const comments = await AnnouncementComment.find({ announcementId: announcement._id }).sort({ createdAt: 1 });
    res.json({
      announcement: serializeParentAnnouncement(announcement, req.user.id, {
        comments: comments.map((c) => serializeAnnouncementComment(c, req.user.id)),
      }),
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/announcements/:id/acknowledgements', async (req, res) => {
  try {
    const announcement = await assertParentAnnouncement(req.user.id, req.params.id);
    if (!announcement) return res.status(404).json({ error: 'Announcement not found' });
    const ids = (announcement.acknowledgedBy || []).map((x) => x.userId).filter(Boolean);
    const users = ids.length ? await User.find({ _id: { $in: ids } }).select('name photoUrl') : [];
    const byId = new Map(users.map((u) => [String(u._id), u]));
    const acknowledgements = (announcement.acknowledgedBy || [])
      .map((row) => {
        const user = byId.get(String(row.userId));
        if (!user) return null;
        return {
          _id: row.userId,
          name: user.name,
          photoUrl: user.photoUrl || '',
          at: row.at,
        };
      })
      .filter(Boolean)
      .sort((a, b) => new Date(b.at) - new Date(a.at));
    res.json({ acknowledgements, count: acknowledgements.length });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/announcements/:id/comments', async (req, res) => {
  try {
    const announcement = await assertParentAnnouncement(req.user.id, req.params.id);
    if (!announcement) return res.status(404).json({ error: 'Announcement not found' });
    const body = String(req.body?.body || '').trim().slice(0, 800);
    if (!body) return res.status(400).json({ error: 'Comment is required' });
    const user = await User.findById(req.user.id).select('name photoUrl role');
    const created = await AnnouncementComment.create({
      announcementId: announcement._id,
      userId: req.user.id,
      authorName: user?.name || 'Parent',
      authorRole: 'Parent',
      authorPhotoUrl: user?.photoUrl || '',
      body,
    });
    const comments = await AnnouncementComment.find({ announcementId: announcement._id }).sort({ createdAt: 1 });
    res.status(201).json({
      comment: serializeAnnouncementComment(created, req.user.id),
      announcement: serializeParentAnnouncement(announcement, req.user.id, {
        comments: comments.map((c) => serializeAnnouncementComment(c, req.user.id)),
      }),
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.delete('/announcements/:id/comments/:commentId', async (req, res) => {
  try {
    const announcement = await assertParentAnnouncement(req.user.id, req.params.id);
    if (!announcement) return res.status(404).json({ error: 'Announcement not found' });
    const comment = await AnnouncementComment.findOne({
      _id: req.params.commentId,
      announcementId: announcement._id,
      userId: req.user.id,
    });
    if (!comment) return res.status(404).json({ error: 'Comment not found' });
    await comment.deleteOne();
    const comments = await AnnouncementComment.find({ announcementId: announcement._id }).sort({ createdAt: 1 });
    res.json({
      announcement: serializeParentAnnouncement(announcement, req.user.id, {
        comments: comments.map((c) => serializeAnnouncementComment(c, req.user.id)),
      }),
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

function notificationCategory(type) {
  const t = String(type || '').toLowerCase();
  if (t === 'announcement') return 'announcement';
  if (t === 'assignment') return 'homework';
  if (t === 'reminder') return 'event';
  if (t === 'diary' || t === 'teacher_note') return 'diary';
  if (t.startsWith('trip') || t === 'late_pickup_request') return 'trip';
  if (t === 'message') return 'message';
  if (t === 'attendance_alert') return 'attendance';
  return 'general';
}

function notificationCategoryLabel(category) {
  switch (category) {
    case 'announcement':
      return 'Announcement';
    case 'homework':
      return 'Homework';
    case 'event':
      return 'Event Reminder';
    case 'diary':
      return 'Diary';
    case 'trip':
      return 'Trip';
    case 'message':
      return 'Message';
    case 'attendance':
      return 'Attendance';
    default:
      return 'General';
  }
}

function notificationAuthor(row) {
  if (row.authorName) return row.authorName;
  const cat = notificationCategory(row.type);
  if (cat === 'homework' || cat === 'diary') return 'Teacher';
  if (cat === 'trip') return 'Transport Office';
  if (cat === 'message') return 'School Staff';
  return 'Admin';
}

function notificationTimeLabel(value) {
  return formatClock(value);
}

function notificationDateLabel(value) {
  return formatDateLabel(value);
}

function notificationGroup(value) {
  return calendarGroup(value);
}

function serializeParentNotification(row) {
  const doc = row.toObject ? row.toObject() : row;
  const category = notificationCategory(doc.type);
  const important =
    doc.important === true || ['announcement', 'attendance_alert', 'reminder'].includes(doc.type);
  return {
    _id: doc._id,
    type: doc.type,
    title: doc.title,
    body: doc.body,
    read: doc.read === true,
    archived: doc.archived === true,
    important,
    category,
    categoryLabel: notificationCategoryLabel(category),
    authorName: notificationAuthor(doc),
    createdAt: toIso(doc.createdAt) || doc.createdAt,
    timeLabel: notificationTimeLabel(doc.createdAt),
    dateLabel: notificationDateLabel(doc.createdAt),
    group: notificationGroup(doc.createdAt),
    tripId: doc.tripId || null,
    kidId: doc.kidId || null,
    link: doc.link || '',
  };
}

async function ensureParentNotifications(userId) {
  const now = Date.now();
  const samples = [
    {
      key: 'sample:notify-reopen',
      type: 'announcement',
      title: 'School Reopens for Term 2',
      body: 'Classes resume on Monday. Please ensure learners arrive on time, in full uniform, and bring all required books.',
      authorName: 'Admin',
      important: true,
      read: false,
      createdAt: new Date(now - 40 * 60 * 1000),
    },
    {
      key: 'sample:notify-homework',
      type: 'assignment',
      title: 'Maths homework is due tomorrow',
      body: 'Complete exercise 4 on fractions and place value. Sign the homework diary tonight.',
      authorName: 'Mr. James Wekesa',
      important: false,
      read: false,
      createdAt: new Date(now - 2 * 60 * 60 * 1000),
    },
    {
      key: 'sample:notify-sports',
      type: 'reminder',
      title: 'Sports Day 2026',
      body: 'Inter-house sports is coming up. Learners should wear house colours and pack a water bottle.',
      authorName: 'Sports Department',
      important: true,
      read: false,
      createdAt: new Date(now - 5 * 60 * 60 * 1000),
    },
    {
      key: 'sample:notify-bus',
      type: 'trip_started',
      title: 'Morning bus has started',
      body: 'The school bus is on the way. Please have your child ready at the pickup point.',
      authorName: 'Transport Office',
      important: false,
      read: false,
      createdAt: new Date(now - 26 * 60 * 60 * 1000),
    },
    {
      key: 'sample:notify-diary',
      type: 'diary',
      title: 'New class note in the diary',
      body: 'A teacher note was added about reading progress this week. Open Diary to review it.',
      authorName: 'Ms. Grace Kamau',
      important: false,
      read: true,
      createdAt: new Date(now - 30 * 60 * 60 * 1000),
    },
    {
      key: 'sample:notify-fees',
      type: 'announcement',
      title: 'Fee reminder for Term 2',
      body: 'You can pay at the office or via the Payments screen in the app.',
      authorName: 'Admin',
      important: true,
      read: true,
      createdAt: new Date(now - 3 * 24 * 60 * 60 * 1000),
    },
    {
      key: 'sample:notify-archived',
      type: 'system',
      title: 'Welcome to EduCare Parent',
      body: 'You will receive trip, diary, and school alerts here. You can choose what to hear in settings.',
      authorName: 'EduCare',
      important: false,
      read: true,
      archived: true,
      createdAt: new Date(now - 10 * 24 * 60 * 60 * 1000),
    },
  ];

  for (const sample of samples) {
    const existing = await Notification.findOne({ userId, key: sample.key });
    if (existing) continue;
    try {
      await Notification.create({ userId, ...sample });
    } catch (err) {
      if (err?.code !== 11000) throw err;
    }
  }
}

router.get('/notifications', async (req, res) => {
  try {
    const tab = String(req.query.tab || 'all').toLowerCase();
    const q = String(req.query.q || '').trim();
    const category = String(req.query.category || 'all').toLowerCase();
    const filter = { userId: req.user.id, key: { $not: /^sample:/ } };

    if (tab === 'archived') filter.archived = true;
    else {
      filter.archived = { $ne: true };
      if (tab === 'unread') filter.read = { $ne: true };
    }

    const and = [];
    if (tab === 'important') {
      and.push({
        $or: [{ important: true }, { type: { $in: ['announcement', 'attendance_alert', 'reminder'] } }],
      });
    }
    if (q) {
      const rx = new RegExp(q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
      and.push({ $or: [{ title: rx }, { body: rx }, { authorName: rx }] });
    }
    if (and.length) filter.$and = and;

    const rows = await Notification.find(filter).sort({ createdAt: -1 }).limit(120);
    let list = rows.map(serializeParentNotification);
    if (tab === 'important') list = list.filter((n) => n.important);
    if (category && category !== 'all') list = list.filter((n) => n.category === category);

    const allRows = await Notification.find({ userId: req.user.id }).select('read archived important type');
    const mapped = allRows.map(serializeParentNotification);
    const counts = {
      all: mapped.filter((n) => !n.archived).length,
      unread: mapped.filter((n) => !n.archived && !n.read).length,
      important: mapped.filter((n) => !n.archived && n.important).length,
      archived: mapped.filter((n) => n.archived).length,
    };

    res.json({
      notifications: list,
      counts,
      unread: counts.unread,
    });
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

router.post('/notifications/:id/read', async (req, res) => {
  try {
    const row = await Notification.findOneAndUpdate(
      { _id: req.params.id, userId: req.user.id },
      { $set: { read: true } },
      { new: true }
    );
    if (!row) return res.status(404).json({ error: 'Notification not found' });
    res.json({ notification: serializeParentNotification(row) });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/notifications/:id/archive', async (req, res) => {
  try {
    const archived = req.body?.archived === false ? false : true;
    const row = await Notification.findOneAndUpdate(
      { _id: req.params.id, userId: req.user.id },
      { $set: { archived, read: true } },
      { new: true }
    );
    if (!row) return res.status(404).json({ error: 'Notification not found' });
    res.json({ notification: serializeParentNotification(row) });
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

function messageTimeLabel(value) {
  return formatDayClock(value);
}

function messageClockLabel(value) {
  return formatClock(value);
}

function messageDateKey(value) {
  return formatDateKey(value);
}

function messageDateLabel(value) {
  return formatDateLabel(value);
}

function serializeConversation(row, extra = {}) {
  const doc = row.toObject ? row.toObject() : row;
  return {
    _id: doc._id,
    type: doc.type || 'direct',
    title: doc.title,
    roleLabel: doc.roleLabel || 'Teacher',
    subtitle: doc.subtitle || extra.subtitle || doc.roleLabel || 'Teacher',
    avatarKind: doc.avatarKind || 'teacher',
    photoUrl: extra.photoUrl || doc.photoUrl || '',
    phone: extra.phone || doc.phone || '',
    online: extra.online === true || doc.online === true,
    lastMessage: doc.lastMessage || '',
    lastMessageAt: doc.lastMessageAt,
    timeLabel: messageTimeLabel(doc.lastMessageAt),
    unreadCount: doc.unreadCount || 0,
    archived: doc.archived === true,
    counterpartUserId: doc.counterpartUserId || null,
  };
}

function serializeChatMessage(row) {
  const doc = row.toObject ? row.toObject() : row;
  return {
    _id: doc._id,
    sender: doc.sender,
    senderName: doc.senderName || '',
    body: doc.body,
    createdAt: doc.createdAt,
    timeLabel: messageClockLabel(doc.createdAt) || messageTimeLabel(doc.createdAt),
    clockLabel: messageClockLabel(doc.createdAt),
    dateKey: messageDateKey(doc.createdAt),
    dateLabel: messageDateLabel(doc.createdAt),
    read: doc.sender === 'parent',
  };
}

async function parentMessageContacts(schoolId) {
  if (!schoolId) return [];
  const staff = await User.find({
    schoolId,
    role: { $in: ['teacher', 'school_admin'] },
    active: { $ne: false },
  })
    .select('name role jobTitle photoUrl')
    .sort({ name: 1 });
  return staff.map((u) => ({
    _id: u._id,
    name: u.name,
    roleLabel: u.role === 'school_admin' ? 'Administration' : u.jobTitle || 'Teacher',
    photoUrl: u.photoUrl || '',
    avatarKind: u.role === 'school_admin' ? 'admin' : 'teacher',
    type: 'direct',
  }));
}

async function ensureParentConversations(parentId, schoolId, kids) {
  const now = Date.now();
  const grade = kids.find((k) => k.grade)?.grade || 'Grade 3';
  const samples = [
    {
      sourceKey: 'sample:grace',
      type: 'direct',
      title: 'Ms. Grace Kamau',
      roleLabel: 'Class Teacher',
      subtitle: `Class Teacher • ${grade}`,
      avatarKind: 'teacher',
      online: true,
      phone: '+254712345678',
      unreadCount: 2,
      lastMessage: 'Please remember Sports Day this Friday. Learners should wear house colours and pack a water bottle.',
      lastMessageAt: new Date(now - 40 * 60 * 1000),
      messages: [
        { sender: 'staff', senderName: 'Ms. Grace Kamau', body: 'Good morning John. Ryan did very well in today\'s mathematics lesson. He is growing more confident with word problems.', hoursAgo: 30 },
        { sender: 'parent', senderName: 'You', body: 'Thank you Ms Kamau. We practised together last night and he was really proud of himself.', hoursAgo: 29.4 },
        { sender: 'staff', senderName: 'Ms. Grace Kamau', body: 'That is wonderful to hear. Please help him finish the homework in the diary tonight.', hoursAgo: 28.8 },
        { sender: 'parent', senderName: 'You', body: 'Noted, we will go through it this evening.', hoursAgo: 28.2 },
        { sender: 'staff', senderName: 'Ms. Grace Kamau', body: 'Please remember Sports Day this Friday. Learners should wear house colours and pack a water bottle.', hoursAgo: 0.7 },
      ],
    },
    {
      sourceKey: 'sample:james',
      type: 'direct',
      title: 'Mr. James Wekesa',
      roleLabel: 'Math Teacher',
      avatarKind: 'teacher',
      online: true,
      unreadCount: 0,
      lastMessage: 'The maths test has been moved to Thursday. Please revise fractions and place value.',
      lastMessageAt: new Date(now - 22 * 60 * 60 * 1000),
      messages: [
        { sender: 'staff', senderName: 'Mr. James Wekesa', body: 'The maths test has been moved to Thursday. Please revise fractions and place value.', hoursAgo: 22 },
      ],
    },
    {
      sourceKey: 'sample:grade-group',
      type: 'group',
      title: `${grade} Parents`,
      roleLabel: 'Group',
      avatarKind: 'group',
      online: false,
      unreadCount: 1,
      lastMessage: 'Sports day volunteer list is now open. Kindly add your name if you can help.',
      lastMessageAt: new Date(now - 26 * 60 * 60 * 1000),
      messages: [
        { sender: 'staff', senderName: 'School Admin', body: 'Sports day volunteer list is now open. Kindly add your name if you can help.', hoursAgo: 26 },
      ],
    },
    {
      sourceKey: 'sample:sarah',
      type: 'direct',
      title: 'Mrs. Sarah Okello',
      roleLabel: 'English Teacher',
      avatarKind: 'teacher',
      online: false,
      unreadCount: 0,
      lastMessage: 'Great progress on reading this week. Keep practising a short story each evening.',
      lastMessageAt: new Date(now - 3 * 24 * 60 * 60 * 1000),
      messages: [
        { sender: 'staff', senderName: 'Mrs. Sarah Okello', body: 'Great progress on reading this week. Keep practising a short story each evening.', hoursAgo: 72 },
      ],
    },
    {
      sourceKey: 'sample:admin',
      type: 'direct',
      title: 'School Admin',
      roleLabel: 'Administration',
      avatarKind: 'admin',
      online: true,
      unreadCount: 0,
      lastMessage: 'Fee reminder for Term 2. You can pay at the office or via the Payments screen.',
      lastMessageAt: new Date(now - 4 * 24 * 60 * 60 * 1000),
      messages: [
        { sender: 'staff', senderName: 'School Admin', body: 'Fee reminder for Term 2. You can pay at the office or via the Payments screen.', hoursAgo: 96 },
      ],
    },
    {
      sourceKey: 'sample:peter',
      type: 'direct',
      title: 'Mr. Peter Mutiso',
      roleLabel: 'Science Teacher',
      avatarKind: 'teacher',
      online: false,
      unreadCount: 0,
      lastMessage: 'Please send a white shirt for the lab practical on Friday.',
      lastMessageAt: new Date(now - 6 * 24 * 60 * 60 * 1000),
      messages: [
        { sender: 'staff', senderName: 'Mr. Peter Mutiso', body: 'Please send a white shirt for the lab practical on Friday.', hoursAgo: 144 },
      ],
    },
    {
      sourceKey: 'sample:archived-transport',
      type: 'direct',
      title: 'Transport Office',
      roleLabel: 'Administration',
      avatarKind: 'admin',
      online: false,
      unreadCount: 0,
      archived: true,
      lastMessage: 'Route change for next week has been confirmed. Thank you.',
      lastMessageAt: new Date(now - 12 * 24 * 60 * 60 * 1000),
      messages: [
        { sender: 'staff', senderName: 'Transport Office', body: 'Route change for next week has been confirmed. Thank you.', hoursAgo: 288 },
      ],
    },
  ];

  for (const sample of samples) {
    const existing = await Conversation.findOne({ parentId, sourceKey: sample.sourceKey });
    if (existing) continue;
    try {
      const { messages, ...rest } = sample;
      const convo = await Conversation.create({
        schoolId,
        parentId,
        ...rest,
      });
      const docs = (messages || []).map((m) => ({
        conversationId: convo._id,
        sender: m.sender,
        senderName: m.senderName,
        body: m.body,
        createdAt: new Date(now - m.hoursAgo * 60 * 60 * 1000),
        updatedAt: new Date(now - m.hoursAgo * 60 * 60 * 1000),
      }));
      if (docs.length) await Message.insertMany(docs);
    } catch (err) {
      if (err?.code !== 11000) throw err;
    }
  }

  const grace = await Conversation.findOne({ parentId, sourceKey: 'sample:grace' });
  if (grace) {
    const subtitle = `Class Teacher • ${grade}`;
    const lastBody = 'Please remember Sports Day this Friday. Learners should wear house colours and pack a water bottle.';
    let dirty = false;
    if (grace.subtitle !== subtitle) {
      grace.subtitle = subtitle;
      dirty = true;
    }
    if (!grace.phone) {
      grace.phone = '+254712345678';
      dirty = true;
    }
    if (grace.online !== true) {
      grace.online = true;
      dirty = true;
    }
    const count = await Message.countDocuments({ conversationId: grace._id });
    if (count > 0 && count <= 3) {
      await Message.deleteMany({ conversationId: grace._id });
      const sample = samples.find((s) => s.sourceKey === 'sample:grace');
      const docs = (sample?.messages || []).map((m) => ({
        conversationId: grace._id,
        sender: m.sender,
        senderName: m.senderName,
        body: m.body,
        createdAt: new Date(now - m.hoursAgo * 60 * 60 * 1000),
        updatedAt: new Date(now - m.hoursAgo * 60 * 60 * 1000),
      }));
      if (docs.length) await Message.insertMany(docs);
      grace.lastMessage = lastBody;
      grace.lastMessageAt = new Date(now - 40 * 60 * 1000);
      dirty = true;
    }
    if (dirty) await grace.save();
  }
}

async function ensureParentCalendarEvents(schoolId) {
  const now = new Date();
  const at = (days, hours = 9, minutes = 0) => {
    const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() + days, hours, minutes, 0, 0);
    return d;
  };
  const samples = [
    {
      sourceKey: 'sample:ptm',
      title: 'Parent-Teacher Meeting',
      body: 'Discuss your child’s progress with the class teacher. Arrive 10 minutes early.',
      category: 'meeting',
      startAt: at(3, 14, 0),
      endAt: at(3, 16, 0),
      allDay: false,
    },
    {
      sourceKey: 'sample:homework-week',
      title: 'Homework Diary Check',
      body: 'Please sign the homework diary and return reading books.',
      category: 'academic',
      startAt: at(1, 0, 0),
      allDay: true,
    },
    {
      sourceKey: 'sample:assembly',
      title: 'Class Assembly',
      body: 'Short assembly in the hall. Learners should wear full uniform.',
      category: 'meeting',
      startAt: at(2, 8, 0),
      endAt: at(2, 8, 40),
      allDay: false,
    },
    {
      sourceKey: 'sample:science-lab',
      title: 'Science Practical',
      body: 'Lab practical for Term 2. Send a white shirt and closed shoes.',
      category: 'academic',
      startAt: at(5, 9, 0),
      endAt: at(5, 10, 30),
      allDay: false,
    },
    {
      sourceKey: 'sample:sports-day',
      title: 'Annual Sports Day 2026',
      body: 'A full day of track events, team games, and house spirit on the school grounds. Parents are welcome to attend and cheer.',
      category: 'event',
      startAt: at(7, 8, 0),
      endAt: at(7, 14, 0),
      allDay: false,
      venue: 'Greenfield School Grounds',
      organizedBy: '',
      eventType: 'Sports',
      eventKind: 'School Event',
      openTo: 'All Students (Grade 1 - 6)',
      highlights: [
        'Track events, relays, and house competitions throughout the day',
        'Parents are welcome to attend and cheer from the stands',
      ],
      schedule: [
        { time: '08:00 AM', title: 'Opening Ceremony' },
        { time: '09:00 AM', title: 'Track Events' },
        { time: '11:00 AM', title: 'Team Games' },
        { time: '01:00 PM', title: 'Prize Giving Ceremony' },
        { time: '02:00 PM', title: 'Closing & Dismissal' },
      ],
      importantNotes: [
        'Learners should wear their house sports kit and suitable running shoes',
        'Pack drinking water and a light snack',
        'If it rains, indoor activities will take place in the school hall',
      ],
      defaultActivities: ['100m Race', 'Long Jump', 'Relay (Team A)'],
    },
    {
      sourceKey: 'sample:midterm-holiday',
      title: 'Mid-Term Break',
      body: 'School closed for mid-term. Regular classes resume the following week.',
      category: 'holiday',
      startAt: at(14, 0, 0),
      allDay: true,
    },
    {
      sourceKey: 'sample:library-week',
      title: 'Library Week',
      body: 'New storybooks are available. Students may borrow titles during library hours.',
      category: 'academic',
      startAt: at(-2, 0, 0),
      allDay: true,
    },
  ];

  for (const sample of samples) {
    const existing = await CalendarEvent.findOne({ schoolId, sourceKey: sample.sourceKey });
    if (existing) {
      if (sample.sourceKey === 'sample:sports-day' && !existing.venue) {
        existing.title = sample.title;
        existing.body = sample.body;
        existing.startAt = sample.startAt;
        existing.endAt = sample.endAt;
        existing.allDay = false;
        existing.venue = sample.venue;
        existing.eventType = sample.eventType;
        existing.eventKind = sample.eventKind;
        existing.openTo = sample.openTo;
        existing.highlights = sample.highlights;
        existing.schedule = sample.schedule;
        existing.importantNotes = sample.importantNotes;
        existing.defaultActivities = sample.defaultActivities;
        await existing.save();
      }
      continue;
    }
    try {
      await CalendarEvent.create({ schoolId, ...sample });
    } catch (err) {
      if (err?.code !== 11000) throw err;
    }
  }
}

function calendarTimeLabel(startAt, allDay) {
  if (allDay) return 'All Day';
  return formatNairobiClock(startAt);
}

function calendarDateLabel(startAt) {
  const d = new Date(startAt);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
}

function calendarTimeRange(startAt, endAt, allDay) {
  if (allDay) return 'All Day';
  const start = calendarTimeLabel(startAt, false);
  if (!endAt) return start;
  const end = calendarTimeLabel(endAt, false);
  return end ? `${start} - ${end}` : start;
}

function calendarFullDate(startAt) {
  const d = new Date(startAt);
  if (Number.isNaN(d.getTime())) return '';
  const date = d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
  const weekday = d.toLocaleDateString('en-GB', { weekday: 'long' });
  return `${date} (${weekday})`;
}

function serializeCalendarEvent(row, extra = {}) {
  const doc = row.toObject ? row.toObject() : row;
  const allDay = doc.allDay === true;
  return {
    _id: extra._id || doc._id,
    title: doc.title,
    body: doc.body || '',
    category: doc.category || 'event',
    startAt: doc.startAt,
    endAt: doc.endAt || null,
    allDay,
    dateKey: ymd(doc.startAt),
    dateLabel: calendarDateLabel(doc.startAt),
    timeLabel: calendarTimeLabel(doc.startAt, allDay),
    timeRange: extra.timeRange || calendarTimeRange(doc.startAt, doc.endAt, allDay),
    venue: doc.venue || extra.venue || '',
    organizedBy: doc.organizedBy || extra.organizedBy || '',
    eventType: doc.eventType || extra.eventType || '',
    eventKind: doc.eventKind || extra.eventKind || '',
    openTo: doc.openTo || extra.openTo || '',
    highlights: doc.highlights || extra.highlights || [],
    schedule: doc.schedule || extra.schedule || [],
    importantNotes: doc.importantNotes || extra.importantNotes || [],
    defaultActivities: doc.defaultActivities || extra.defaultActivities || [],
    kidId: extra.kidId || doc.kidId || null,
    kidName: extra.kidName || '',
    source: extra.source || 'calendar',
  };
}

function serializeCalendarEventDetail(row, { kid, schoolName } = {}) {
  const base = serializeCalendarEvent(row);
  const kind = base.eventKind || (base.category === 'holiday' ? 'Holiday' : base.category === 'meeting' ? 'Meeting' : base.category === 'academic' ? 'Academic' : 'School Event');
  const type = base.eventType || (base.category === 'event' ? 'Sports' : kind);
  const activities = Array.isArray(row.defaultActivities) ? row.defaultActivities.filter(Boolean) : [];
  const first = String(kid?.name || 'Your child').trim().split(/\s+/)[0];
  return {
    ...base,
    dateFull: calendarFullDate(row.startAt || base.startAt),
    eventKind: kind,
    eventType: type,
    organizedBy: base.organizedBy || schoolName || 'School',
    venue: base.venue || schoolName || '',
    kid: diaryKidCard(kid),
    participation: activities.length
      ? {
          registered: true,
          status: 'Confirmed',
          intro: `${first} is participating in the following:`,
          activities,
        }
      : null,
  };
}

router.get('/calendar', async (req, res) => {
  try {
    const kids = await Kid.find({ parentIds: req.user.id, active: true }).select('name grade schoolId photoUrl');
    const schoolIds = [...new Set(kids.map((k) => k.schoolId?.toString()).filter(Boolean))];
    const grades = [...new Set(kids.map((k) => k.grade).filter(Boolean))];
    const kidId = String(req.query.kidId || '');
    const selectedKid = kids.find((k) => String(k._id) === kidId) || null;

    const { from, to } = monthRange(req.query.month);
    const windowFrom = new Date(from);
    windowFrom.setDate(windowFrom.getDate() - 7);
    const windowTo = new Date(to);
    windowTo.setDate(windowTo.getDate() + 45);

    const kidFilter = selectedKid
      ? {
          $or: [{ kidId: selectedKid._id }, { kidId: null }, { grade: selectedKid.grade }, { grade: '' }, { grade: { $exists: false } }],
        }
      : {};

    const [stored, holidays, outings, announcements, assignments, unread] = await Promise.all([
      schoolIds.length
        ? CalendarEvent.find({
            schoolId: { $in: schoolIds },
            active: { $ne: false },
            sourceKey: { $not: /^sample:/ },
            startAt: { $gte: windowFrom, $lte: windowTo },
            ...kidFilter,
          }).sort({ startAt: 1 })
        : [],
      schoolIds.length
        ? SchoolHoliday.find({
            schoolId: { $in: schoolIds },
            active: true,
            date: { $gte: windowFrom, $lte: windowTo },
          }).sort({ date: 1 })
        : [],
      schoolIds.length
        ? SchoolOuting.find({
            schoolId: { $in: schoolIds },
            active: { $ne: false },
            status: { $ne: 'cancelled' },
            startAt: { $gte: windowFrom, $lte: windowTo },
          }).sort({ startAt: 1 })
        : [],
      schoolIds.length
        ? Announcement.find({
            schoolId: { $in: schoolIds },
            active: true,
            archived: { $ne: true },
            sourceKey: { $not: /^sample:/ },
            $or: [{ kind: 'event' }, { category: 'events' }],
            publishedAt: { $gte: windowFrom, $lte: windowTo },
          }).sort({ publishedAt: 1 })
        : [],
      selectedKid
        ? Assignment.find({
            schoolId: { $in: schoolIds },
            active: true,
            status: { $ne: 'draft' },
            dueDate: { $gte: windowFrom, $lte: windowTo },
            $or: [
              { kidIds: selectedKid._id },
              { kidIds: { $size: 0 }, grade: selectedKid.grade },
              { kidIds: { $exists: false }, grade: selectedKid.grade },
            ],
          }).limit(40)
        : Assignment.find({
            schoolId: { $in: schoolIds },
            active: true,
            status: { $ne: 'draft' },
            dueDate: { $gte: windowFrom, $lte: windowTo },
            $or: [{ kidIds: { $in: kids.map((k) => k._id) } }, { grade: { $in: grades } }],
          }).limit(40),
      Notification.countDocuments({ userId: req.user.id, read: { $ne: true } }),
    ]);

    const events = [];
    for (const row of stored) {
      events.push(serializeCalendarEvent(row));
    }
    for (const h of holidays) {
      events.push(
        serializeCalendarEvent({
          _id: `holiday:${h._id}`,
          title: h.name || 'School Holiday',
          body: 'School is closed on this day.',
          category: 'holiday',
          startAt: h.date,
          allDay: true,
        }, { source: 'holiday', _id: `holiday:${h._id}` })
      );
    }
    for (const o of outings) {
      events.push(
        serializeCalendarEvent({
          _id: `outing:${o._id}`,
          title: o.title,
          body: o.notes || o.location || 'School outing',
          category: 'event',
          startAt: o.startAt,
          endAt: o.endAt,
          allDay: !o.endAt,
        }, { source: 'outing', _id: `outing:${o._id}` })
      );
    }
    for (const a of announcements) {
      events.push(
        serializeCalendarEvent({
          _id: `announcement:${a._id}`,
          title: a.title,
          body: a.body || '',
          category: 'event',
          startAt: a.publishedAt || a.createdAt,
          allDay: true,
        }, { source: 'announcement', _id: `announcement:${a._id}` })
      );
    }
    for (const a of assignments) {
      if (!a.dueDate) continue;
      events.push(
        serializeCalendarEvent({
          _id: `assignment:${a._id}`,
          title: a.title || 'Homework due',
          body: a.description || a.subject || '',
          category: 'academic',
          startAt: a.dueDate,
          allDay: true,
        }, { source: 'assignment', _id: `assignment:${a._id}` })
      );
    }

    events.sort((a, b) => new Date(a.startAt) - new Date(b.startAt));
    const seen = new Set();
    const unique = events.filter((e) => {
      const key = `${e.title}|${e.dateKey}|${e.category}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });

    const parent = await User.findById(req.user.id).select('preferences');
    res.json({
      month: ymd(from).slice(0, 7),
      events: unique,
      kids: kids.map((k) => ({
        _id: k._id,
        name: k.name,
        grade: k.grade || '',
        photoUrl: k.photoUrl || '',
      })),
      unread,
      calendarSync: parent?.preferences?.calendarSync === true,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/calendar/:id', async (req, res) => {
  try {
    const id = String(req.params.id || '');
    const kids = await Kid.find({ parentIds: req.user.id, active: true });
    const schoolIds = [...new Set(kids.map((k) => k.schoolId?.toString()).filter(Boolean))];
    if (!schoolIds.length) return res.status(404).json({ error: 'Event not found' });
    const kid = kids.find((k) => String(k._id) === String(req.query.kidId || '')) || kids[0];
    const school = await School.findById(kid?.schoolId || schoolIds[0]).select('name');
    const schoolName = school?.name || 'School';

    if (/^[a-fA-F0-9]{24}$/.test(id)) {
      const row = await CalendarEvent.findOne({
        _id: id,
        schoolId: { $in: schoolIds },
        active: { $ne: false },
      });
      if (!row) return res.status(404).json({ error: 'Event not found' });
      return res.json({ event: serializeCalendarEventDetail(row, { kid, schoolName }) });
    }

    if (id.startsWith('outing:')) {
      const outing = await SchoolOuting.findOne({
        _id: id.slice(7),
        schoolId: { $in: schoolIds },
        active: { $ne: false },
      });
      if (!outing) return res.status(404).json({ error: 'Event not found' });
      return res.json({
        event: serializeCalendarEventDetail(
          {
            _id: id,
            title: outing.title,
            body: outing.notes || '',
            category: 'event',
            startAt: outing.startAt,
            endAt: outing.endAt,
            allDay: !outing.endAt,
            venue: outing.location || '',
            organizedBy: schoolName,
            eventKind: 'School Outing',
            eventType: 'Outing',
            openTo: outing.audience || outing.grade || 'Selected classes',
            highlights: [],
            schedule: [],
            importantNotes: outing.notes ? [outing.notes] : [],
            defaultActivities: [],
          },
          { kid, schoolName }
        ),
      });
    }

    return res.status(404).json({ error: 'Event not found' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/calendar/sync', async (req, res) => {
  try {
    const enabled = req.body?.enabled !== false;
    const parent = await User.findById(req.user.id);
    if (!parent) return res.status(404).json({ error: 'Account not found' });
    parent.preferences = parent.preferences || {};
    parent.preferences.calendarSync = enabled;
    await parent.save();
    res.json({ calendarSync: enabled, user: parent.toSafeJSON() });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/messages', async (req, res) => {
  try {
    const kids = await Kid.find({ parentIds: req.user.id, active: true }).select('schoolId grade');
    const schoolId = kids[0]?.schoolId;

    const tab = String(req.query.tab || 'messages').toLowerCase();
    const q = String(req.query.q || '').trim();
    const filter = { parentId: req.user.id, sourceKey: { $not: /^sample:/ } };
    if (tab === 'groups') filter.type = 'group';
    else if (tab === 'archived') filter.archived = true;
    else {
      filter.type = { $ne: 'group' };
      filter.archived = { $ne: true };
    }

    if (q) {
      const rx = new RegExp(q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
      filter.$or = [{ title: rx }, { lastMessage: rx }, { roleLabel: rx }];
    }

    const [rows, contacts, unread] = await Promise.all([
      Conversation.find(filter).sort({ lastMessageAt: -1 }).limit(60),
      parentMessageContacts(schoolId),
      Notification.countDocuments({ userId: req.user.id, read: { $ne: true } }),
    ]);

    res.json({
      conversations: rows.map(serializeConversation),
      contacts,
      unread,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/messages', async (req, res) => {
  try {
    const kids = await Kid.find({ parentIds: req.user.id, active: true }).select('schoolId');
    const schoolId = kids[0]?.schoolId;
    if (!schoolId) return res.status(400).json({ error: 'No linked child yet' });

    const counterpartUserId = req.body?.counterpartUserId || null;
    const title = String(req.body?.title || '').trim();
    const roleLabel = String(req.body?.roleLabel || 'Teacher').trim() || 'Teacher';
    const type = req.body?.type === 'group' ? 'group' : 'direct';
    const avatarKind = ['teacher', 'admin', 'group'].includes(req.body?.avatarKind)
      ? req.body.avatarKind
      : type === 'group'
        ? 'group'
        : 'admin';
    const body = String(req.body?.body || '').trim();

    let staff = null;
    if (counterpartUserId) {
      staff = await User.findOne({
        _id: counterpartUserId,
        schoolId,
        role: { $in: ['teacher', 'school_admin'] },
        active: { $ne: false },
      }).select('name role jobTitle photoUrl');
    }

    const query = counterpartUserId
      ? { parentId: req.user.id, counterpartUserId, type }
      : { parentId: req.user.id, title: staff?.name || title, type, archived: { $ne: true } };
    if (!counterpartUserId && !title && !staff) {
      return res.status(400).json({ error: 'Choose a contact' });
    }

    let convo = await Conversation.findOne(query);
    if (!convo) {
      convo = await Conversation.create({
        schoolId,
        parentId: req.user.id,
        counterpartUserId: staff?._id || null,
        type,
        title: staff?.name || title,
        roleLabel: staff
          ? staff.role === 'school_admin'
            ? 'Administration'
            : staff.jobTitle || 'Teacher'
          : roleLabel,
        avatarKind: staff?.role === 'school_admin' ? 'admin' : avatarKind,
        photoUrl: staff?.photoUrl || '',
        lastMessage: body,
        lastMessageAt: new Date(),
        unreadCount: 0,
      });
    }

    if (body) {
      const parent = await User.findById(req.user.id).select('name');
      await Message.create({
        conversationId: convo._id,
        sender: 'parent',
        senderName: parent?.name || 'You',
        body,
      });
      convo.lastMessage = body;
      convo.lastMessageAt = new Date();
      convo.archived = false;
      convo.staffUnreadCount = convo.muted ? convo.staffUnreadCount || 0 : (convo.staffUnreadCount || 0) + 1;
      if (convo.driverId) {
        convo.driverUnreadCount = (convo.driverUnreadCount || 0) + 1;
      } else if (convo.counterpartUserId) {
        const other = await User.findById(convo.counterpartUserId).select('role');
        if (other?.role === 'driver') {
          convo.driverId = other._id;
          convo.driverUnreadCount = (convo.driverUnreadCount || 0) + 1;
        }
      }
      await convo.save();
      if (convo.counterpartUserId && !convo.muted) {
        await createAndEmitNotifications(getIO(), [
          {
            userId: convo.counterpartUserId,
            type: NOTIFICATION_TYPES.MESSAGE,
            title: parent?.name || 'Parent',
            body,
            link: `messages/${convo._id}`,
          },
        ]);
      }
    }

    res.status(201).json({ conversation: serializeConversation(convo) });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/messages/:id', async (req, res) => {
  try {
    const convo = await Conversation.findOne({ _id: req.params.id, parentId: req.user.id });
    if (!convo) return res.status(404).json({ error: 'Conversation not found' });
    if (convo.unreadCount) {
      convo.unreadCount = 0;
      await convo.save();
    }
    const [messages, staff] = await Promise.all([
      Message.find({ conversationId: convo._id }).sort({ createdAt: 1 }).limit(200),
      convo.counterpartUserId
        ? User.findById(convo.counterpartUserId).select('name phone photoUrl')
        : null,
    ]);
    res.json({
      conversation: serializeConversation(convo, {
        phone: staff?.phone || convo.phone || '',
        photoUrl: staff?.photoUrl || convo.photoUrl || '',
        online: convo.online === true,
      }),
      messages: messages.map(serializeChatMessage),
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/messages/:id', async (req, res) => {
  try {
    const body = String(req.body?.body || '').trim();
    if (!body) return res.status(400).json({ error: 'Message cannot be empty' });
    const convo = await Conversation.findOne({ _id: req.params.id, parentId: req.user.id });
    if (!convo) return res.status(404).json({ error: 'Conversation not found' });
    const parent = await User.findById(req.user.id).select('name');
    const message = await Message.create({
      conversationId: convo._id,
      sender: 'parent',
      senderName: parent?.name || 'You',
      body,
    });
    convo.lastMessage = body;
    convo.lastMessageAt = message.createdAt;
    convo.archived = false;
    convo.unreadCount = 0;
    convo.staffUnreadCount = convo.muted ? convo.staffUnreadCount || 0 : (convo.staffUnreadCount || 0) + 1;
    if (convo.driverId) {
      convo.driverUnreadCount = (convo.driverUnreadCount || 0) + 1;
    } else if (convo.counterpartUserId) {
      const other = await User.findById(convo.counterpartUserId).select('role');
      if (other?.role === 'driver') {
        convo.driverId = other._id;
        convo.driverUnreadCount = (convo.driverUnreadCount || 0) + 1;
      }
    }
    await convo.save();
    if (convo.counterpartUserId && !convo.muted) {
      await createAndEmitNotifications(getIO(), [
        {
          userId: convo.counterpartUserId,
          type: NOTIFICATION_TYPES.MESSAGE,
          title: parent?.name || 'Parent',
          body,
          link: `messages/${convo._id}`,
        },
      ]);
    }
    res.status(201).json({
      conversation: serializeConversation(convo),
      message: serializeChatMessage(message),
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/messages/:id/archive', async (req, res) => {
  try {
    const convo = await Conversation.findOne({ _id: req.params.id, parentId: req.user.id });
    if (!convo) return res.status(404).json({ error: 'Conversation not found' });
    convo.archived = req.body?.archived === false ? false : true;
    await convo.save();
    res.json({ conversation: serializeConversation(convo) });
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
