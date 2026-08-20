import { Router } from 'express';
import {
  User,
  Kid,
  SchoolClass,
  Assignment,
  Assessment,
  AttendanceRecord,
  TripEvent,
} from '../models/index.js';
import { createAndEmitNotifications, NOTIFICATION_TYPES } from '../services/notifications.js';
import { getIO } from '../socket.js';

const router = Router();
const ATTENDANCE_STATUSES = ['present', 'absent', 'late', 'excused'];

function resolveSchoolId(req) {
  if (req.user.role === 'school_admin') return req.user.schoolId || null;
  return req.query.schoolId || req.body.schoolId || null;
}

function isOid(id) {
  return /^[a-f0-9]{24}$/i.test(String(id || ''));
}

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

function serializeClass(doc, extras = {}) {
  const row = typeof doc.toObject === 'function' ? doc.toObject() : doc;
  const teacher = row.teacherId && typeof row.teacherId === 'object' ? row.teacherId : null;
  return {
    id: String(row._id),
    grade: row.grade || '',
    classCode: row.classCode || '',
    classroom: row.classroom || '',
    section: row.section || '',
    academicYear: row.academicYear || '',
    teacherId: teacher?._id ? String(teacher._id) : row.teacherId ? String(row.teacherId) : '',
    teacherName: teacher?.name || '',
    assistantName: row.assistantName || '',
    capacity: row.capacity || 30,
    description: row.description || '',
    subjects: (row.subjects || []).map((s) => ({
      name: s.name,
      teacherName: s.teacherName || '',
    })),
    active: row.active !== false,
    createdAt: row.createdAt,
    ...extras,
  };
}

async function schoolTeachers(schoolId) {
  return User.find({ schoolId, role: 'teacher', active: { $ne: false } })
    .select('name email photoUrl jobTitle')
    .sort({ name: 1 });
}

async function notifyKidParents(kid, payload) {
  const parentIds = (kid.parentIds || []).map((id) => String(id._id || id)).filter(Boolean);
  if (!parentIds.length) return;
  await createAndEmitNotifications(
    getIO(),
    parentIds.map((userId) => ({
      userId,
      kidId: kid._id,
      ...payload,
    }))
  );
}

router.get('/classes', async (req, res) => {
  try {
    const schoolId = resolveSchoolId(req);
    if (!schoolId) return res.status(400).json({ error: 'schoolId is required' });
    const [classes, teachers, kids] = await Promise.all([
      SchoolClass.find({ schoolId, active: { $ne: false } }).populate('teacherId', 'name').sort({ grade: 1 }),
      schoolTeachers(schoolId),
      Kid.find({ schoolId, active: { $ne: false } }).select('grade house section'),
    ]);
    const byGrade = new Map();
    const houses = new Set();
    for (const k of kids) {
      const g = k.grade || '';
      if (!byGrade.has(g)) byGrade.set(g, { students: 0, houses: new Set() });
      const bucket = byGrade.get(g);
      bucket.students += 1;
      if (k.house) {
        bucket.houses.add(k.house);
        houses.add(k.house);
      }
    }
    res.json({
      classes: classes.map((c) => {
        const bucket = byGrade.get(c.grade) || { students: 0, houses: new Set() };
        return serializeClass(c, {
          studentCount: bucket.students,
          houses: [...bucket.houses].sort(),
        });
      }),
      teachers: teachers.map((t) => ({ id: String(t._id), name: t.name, jobTitle: t.jobTitle || '' })),
      grades: [...new Set(kids.map((k) => k.grade).filter(Boolean))].sort(),
      houses: [...houses].sort(),
      unassigned: kids.filter((k) => k.grade).length
        ? kids.filter((k) => k.grade && !classes.some((c) => c.grade === k.grade)).length
        : kids.filter((k) => !k.grade).length,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/classes', async (req, res) => {
  try {
    const schoolId = resolveSchoolId(req);
    if (!schoolId) return res.status(400).json({ error: 'schoolId is required' });
    const grade = String(req.body.grade || '').trim();
    if (!grade) return res.status(400).json({ error: 'Grade / class name is required' });
    const existing = await SchoolClass.findOne({ schoolId, grade });
    if (existing && existing.active !== false) {
      return res.status(409).json({ error: 'A class with this grade already exists' });
    }
    let teacherId = null;
    if (isOid(req.body.teacherId)) {
      const teacher = await User.findOne({ _id: req.body.teacherId, schoolId, role: 'teacher' });
      if (!teacher) return res.status(404).json({ error: 'Teacher not found' });
      teacherId = teacher._id;
    }
    const fields = {
      classCode: String(req.body.classCode || '').trim().slice(0, 40),
      classroom: String(req.body.classroom || '').trim().slice(0, 80),
      section: String(req.body.section || '').trim().slice(0, 40),
      academicYear: String(req.body.academicYear || '').trim().slice(0, 20),
      teacherId,
      assistantName: String(req.body.assistantName || '').trim().slice(0, 80),
      capacity: Math.min(80, Math.max(1, Number(req.body.capacity) || 30)),
      description: String(req.body.description || '').trim().slice(0, 1200),
      active: true,
    };
    let klass = existing;
    if (klass) {
      Object.assign(klass, { grade, ...fields });
      await klass.save();
    } else {
      klass = await SchoolClass.create({ schoolId, grade, subjects: [], timetable: [], ...fields });
    }
    const populated = await SchoolClass.findById(klass._id).populate('teacherId', 'name');
    res.status(201).json({ class: serializeClass(populated, { studentCount: 0, houses: [] }) });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.put('/classes/:id', async (req, res) => {
  try {
    const schoolId = resolveSchoolId(req);
    if (!isOid(req.params.id)) return res.status(400).json({ error: 'Invalid class' });
    const klass = await SchoolClass.findOne({ _id: req.params.id, schoolId });
    if (!klass) return res.status(404).json({ error: 'Class not found' });
    if (req.body.grade !== undefined) {
      const grade = String(req.body.grade || '').trim();
      if (!grade) return res.status(400).json({ error: 'Grade / class name is required' });
      klass.grade = grade;
    }
    if (req.body.classCode !== undefined) klass.classCode = String(req.body.classCode || '').trim().slice(0, 40);
    if (req.body.classroom !== undefined) klass.classroom = String(req.body.classroom || '').trim().slice(0, 80);
    if (req.body.section !== undefined) klass.section = String(req.body.section || '').trim().slice(0, 40);
    if (req.body.academicYear !== undefined) klass.academicYear = String(req.body.academicYear || '').trim().slice(0, 20);
    if (req.body.assistantName !== undefined) klass.assistantName = String(req.body.assistantName || '').trim().slice(0, 80);
    if (req.body.description !== undefined) klass.description = String(req.body.description || '').trim().slice(0, 1200);
    if (req.body.capacity !== undefined) {
      klass.capacity = Math.min(80, Math.max(1, Number(req.body.capacity) || 30));
    }
    if (req.body.teacherId !== undefined) {
      if (!req.body.teacherId) klass.teacherId = null;
      else {
        if (!isOid(req.body.teacherId)) return res.status(400).json({ error: 'Invalid teacher' });
        const teacher = await User.findOne({ _id: req.body.teacherId, schoolId, role: 'teacher' });
        if (!teacher) return res.status(404).json({ error: 'Teacher not found' });
        klass.teacherId = teacher._id;
      }
    }
    await klass.save();
    const populated = await SchoolClass.findById(klass._id).populate('teacherId', 'name');
    res.json({ class: serializeClass(populated) });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.delete('/classes/:id', async (req, res) => {
  try {
    const schoolId = resolveSchoolId(req);
    if (!isOid(req.params.id)) return res.status(400).json({ error: 'Invalid class' });
    const klass = await SchoolClass.findOne({ _id: req.params.id, schoolId });
    if (!klass) return res.status(404).json({ error: 'Class not found' });
    klass.active = false;
    await klass.save();
    res.json({ ok: true });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.get('/subjects', async (req, res) => {
  try {
    const schoolId = resolveSchoolId(req);
    if (!schoolId) return res.status(400).json({ error: 'schoolId is required' });
    const [classes, kids, assignments, assessments, teachers] = await Promise.all([
      SchoolClass.find({ schoolId, active: { $ne: false } }).populate('teacherId', 'name').sort({ grade: 1 }),
      Kid.find({ schoolId, active: { $ne: false } }).select('grade subjects'),
      Assignment.find({ schoolId, active: { $ne: false } }).select('subject grade'),
      Assessment.find({ schoolId, active: { $ne: false } }).select('subject'),
      schoolTeachers(schoolId),
    ]);
    const map = new Map();
    const add = (name, extra = {}) => {
      const key = String(name || '').trim();
      if (!key) return;
      if (!map.has(key.toLowerCase())) {
        map.set(key.toLowerCase(), {
          name: key,
          classes: [],
          teachers: new Set(),
          studentCount: 0,
          assignmentCount: 0,
          assessmentCount: 0,
        });
      }
      const row = map.get(key.toLowerCase());
      if (extra.classLabel && !row.classes.includes(extra.classLabel)) row.classes.push(extra.classLabel);
      if (extra.teacher) row.teachers.add(extra.teacher);
      if (extra.student) row.studentCount += 1;
      if (extra.assignment) row.assignmentCount += 1;
      if (extra.assessment) row.assessmentCount += 1;
    };
    for (const c of classes) {
      for (const s of c.subjects || []) {
        add(s.name, {
          classLabel: c.grade,
          teacher: s.teacherName || c.teacherId?.name || '',
        });
      }
    }
    for (const k of kids) {
      for (const s of k.subjects || []) add(s, { student: true, classLabel: k.grade || '' });
    }
    for (const a of assignments) add(a.subject, { assignment: true, classLabel: a.grade || '' });
    for (const a of assessments) add(a.subject, { assessment: true });

    res.json({
      subjects: [...map.values()]
        .map((s) => ({
          name: s.name,
          classes: s.classes.filter(Boolean).sort(),
          teachers: [...s.teachers].filter(Boolean).sort(),
          studentCount: s.studentCount,
          assignmentCount: s.assignmentCount,
          assessmentCount: s.assessmentCount,
        }))
        .sort((a, b) => a.name.localeCompare(b.name)),
      classes: classes.map((c) => serializeClass(c)),
      teachers: teachers.map((t) => ({ id: String(t._id), name: t.name })),
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/subjects', async (req, res) => {
  try {
    const schoolId = resolveSchoolId(req);
    if (!schoolId) return res.status(400).json({ error: 'schoolId is required' });
    const name = String(req.body.name || '').trim().slice(0, 80);
    const classId = String(req.body.classId || '');
    if (!name) return res.status(400).json({ error: 'Subject name is required' });
    if (!isOid(classId)) return res.status(400).json({ error: 'Choose a class to attach this subject' });
    const klass = await SchoolClass.findOne({ _id: classId, schoolId, active: { $ne: false } });
    if (!klass) return res.status(404).json({ error: 'Class not found' });
    const exists = (klass.subjects || []).some((s) => String(s.name).toLowerCase() === name.toLowerCase());
    if (exists) return res.status(409).json({ error: 'That subject is already on this class' });
    klass.subjects = [
      ...(klass.subjects || []),
      { name, teacherName: String(req.body.teacherName || '').trim().slice(0, 80) },
    ];
    await klass.save();
    res.status(201).json({ ok: true, class: serializeClass(klass) });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.delete('/subjects', async (req, res) => {
  try {
    const schoolId = resolveSchoolId(req);
    const name = String(req.body.name || req.query.name || '').trim();
    const classId = String(req.body.classId || req.query.classId || '');
    if (!name || !isOid(classId)) return res.status(400).json({ error: 'classId and name are required' });
    const klass = await SchoolClass.findOne({ _id: classId, schoolId });
    if (!klass) return res.status(404).json({ error: 'Class not found' });
    klass.subjects = (klass.subjects || []).filter((s) => String(s.name).toLowerCase() !== name.toLowerCase());
    await klass.save();
    res.json({ ok: true });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.get('/examinations', async (req, res) => {
  try {
    const schoolId = resolveSchoolId(req);
    if (!schoolId) return res.status(400).json({ error: 'schoolId is required' });
    const q = String(req.query.q || '').trim().toLowerCase();
    const subject = String(req.query.subject || '').trim();
    const kind = String(req.query.kind || '').trim();
    const filter = { schoolId, active: { $ne: false } };
    if (subject) filter.subject = subject;
    if (['academic', 'behaviour', 'skill'].includes(kind)) filter.kind = kind;
    const [rows, kids, teachers] = await Promise.all([
      Assessment.find(filter).sort({ date: -1, createdAt: -1 }).limit(400),
      Kid.find({ schoolId, active: { $ne: false } }).select('name grade photoUrl').sort({ name: 1 }),
      schoolTeachers(schoolId),
    ]);
    const kidMap = Object.fromEntries(kids.map((k) => [String(k._id), k]));
    const teacherMap = Object.fromEntries(teachers.map((t) => [String(t._id), t]));
    let assessments = rows.map((row) => {
      const kid = kidMap[String(row.kidId)];
      const teacher = teacherMap[String(row.teacherId)];
      return {
        id: String(row._id),
        title: row.title || 'Assessment',
        subject: row.subject || '',
        kind: row.kind || 'academic',
        score: row.score,
        date: row.date,
        kidId: String(row.kidId),
        kidName: kid?.name || '—',
        grade: kid?.grade || '',
        teacherName: teacher?.name || '—',
      };
    });
    if (q) {
      assessments = assessments.filter(
        (a) =>
          a.title.toLowerCase().includes(q) ||
          a.subject.toLowerCase().includes(q) ||
          a.kidName.toLowerCase().includes(q)
      );
    }
    const scores = assessments.map((a) => a.score).filter((n) => Number.isFinite(n));
    res.json({
      assessments,
      kids: kids.map((k) => ({ id: String(k._id), name: k.name, grade: k.grade || '' })),
      teachers: teachers.map((t) => ({ id: String(t._id), name: t.name })),
      subjects: [...new Set(assessments.map((a) => a.subject).filter(Boolean))].sort(),
      stats: {
        total: assessments.length,
        average: scores.length ? Math.round((scores.reduce((s, n) => s + n, 0) / scores.length) * 10) / 10 : null,
      },
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/examinations', async (req, res) => {
  try {
    const schoolId = resolveSchoolId(req);
    if (!schoolId) return res.status(400).json({ error: 'schoolId is required' });
    const kidId = String(req.body.kidId || '');
    const subject = String(req.body.subject || '').trim().slice(0, 80);
    const score = Number(req.body.score);
    if (!isOid(kidId) || !subject || !Number.isFinite(score)) {
      return res.status(400).json({ error: 'Student, subject, and score are required' });
    }
    if (score < 0 || score > 100) return res.status(400).json({ error: 'Score must be between 0 and 100' });
    const kid = await Kid.findOne({ _id: kidId, schoolId, active: { $ne: false } });
    if (!kid) return res.status(404).json({ error: 'Student not found' });
    let teacherId = req.user.id;
    if (isOid(req.body.teacherId)) {
      const teacher = await User.findOne({ _id: req.body.teacherId, schoolId, role: 'teacher' });
      if (teacher) teacherId = teacher._id;
    } else {
      const selfTeacher = await User.findOne({ _id: req.user.id, role: 'teacher' });
      if (!selfTeacher) {
        const any = await User.findOne({ schoolId, role: 'teacher', active: { $ne: false } });
        if (any) teacherId = any._id;
        else return res.status(400).json({ error: 'Assign a teacher before recording an assessment' });
      }
    }
    const kind = ['academic', 'behaviour', 'skill'].includes(req.body.kind) ? req.body.kind : 'academic';
    const row = await Assessment.create({
      schoolId,
      teacherId,
      kidId: kid._id,
      subject,
      title: String(req.body.title || 'Assessment').trim().slice(0, 120) || 'Assessment',
      score,
      kind,
      date: req.body.date ? startOfDay(req.body.date) : startOfDay(),
    });
    res.status(201).json({ assessment: row });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.delete('/examinations/:id', async (req, res) => {
  try {
    const schoolId = resolveSchoolId(req);
    if (!isOid(req.params.id)) return res.status(400).json({ error: 'Invalid assessment' });
    const row = await Assessment.findOne({ _id: req.params.id, schoolId });
    if (!row) return res.status(404).json({ error: 'Assessment not found' });
    row.active = false;
    await row.save();
    res.json({ ok: true });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.get('/assignments', async (req, res) => {
  try {
    const schoolId = resolveSchoolId(req);
    if (!schoolId) return res.status(400).json({ error: 'schoolId is required' });
    const [rows, teachers, kids] = await Promise.all([
      Assignment.find({ schoolId, active: { $ne: false } })
        .populate('kidIds', 'name grade')
        .populate('teacherId', 'name')
        .sort({ dueDate: 1, createdAt: -1 })
        .limit(300),
      schoolTeachers(schoolId),
      Kid.find({ schoolId, active: { $ne: false } }).select('name grade').sort({ name: 1 }).limit(300),
    ]);
    const now = Date.now();
    const assignments = rows.map((row) => {
      const due = row.dueDate ? new Date(row.dueDate).getTime() : null;
      return {
        id: String(row._id),
        title: row.title,
        subject: row.subject || '',
        grade: row.grade || '',
        description: row.description || '',
        dueDate: row.dueDate,
        status: row.status || 'published',
        teacherId: row.teacherId?._id ? String(row.teacherId._id) : '',
        teacherName: row.teacherId?.name || '—',
        studentCount: row.kidIds?.length || 0,
        overdue: Boolean(due && due < now && row.status === 'published'),
        createdAt: row.createdAt,
      };
    });
    res.json({
      assignments,
      teachers: teachers.map((t) => ({ id: String(t._id), name: t.name })),
      grades: [...new Set(kids.map((k) => k.grade).filter(Boolean))].sort(),
      stats: {
        total: assignments.length,
        published: assignments.filter((a) => a.status === 'published').length,
        draft: assignments.filter((a) => a.status === 'draft').length,
        overdue: assignments.filter((a) => a.overdue).length,
      },
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/assignments', async (req, res) => {
  try {
    const schoolId = resolveSchoolId(req);
    if (!schoolId) return res.status(400).json({ error: 'schoolId is required' });
    const title = String(req.body.title || '').trim().slice(0, 160);
    if (!title) return res.status(400).json({ error: 'Title is required' });
    let teacherId = req.body.teacherId;
    if (!isOid(teacherId)) {
      const any = await User.findOne({ schoolId, role: 'teacher', active: { $ne: false } });
      if (!any) return res.status(400).json({ error: 'Choose a teacher' });
      teacherId = any._id;
    } else {
      const teacher = await User.findOne({ _id: teacherId, schoolId, role: 'teacher' });
      if (!teacher) return res.status(404).json({ error: 'Teacher not found' });
      teacherId = teacher._id;
    }
    const row = await Assignment.create({
      schoolId,
      teacherId,
      title,
      subject: String(req.body.subject || '').trim().slice(0, 80),
      grade: String(req.body.grade || '').trim(),
      description: String(req.body.description || '').trim().slice(0, 1000),
      dueDate: req.body.dueDate ? new Date(req.body.dueDate) : null,
      status: req.body.status === 'draft' ? 'draft' : 'published',
    });
    res.status(201).json({ assignment: row });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.put('/assignments/:id', async (req, res) => {
  try {
    const schoolId = resolveSchoolId(req);
    if (!isOid(req.params.id)) return res.status(400).json({ error: 'Invalid assignment' });
    const row = await Assignment.findOne({ _id: req.params.id, schoolId });
    if (!row) return res.status(404).json({ error: 'Assignment not found' });
    if (req.body.title !== undefined) {
      const title = String(req.body.title || '').trim().slice(0, 160);
      if (!title) return res.status(400).json({ error: 'Title is required' });
      row.title = title;
    }
    if (req.body.subject !== undefined) row.subject = String(req.body.subject || '').trim().slice(0, 80);
    if (req.body.grade !== undefined) row.grade = String(req.body.grade || '').trim();
    if (req.body.description !== undefined) row.description = String(req.body.description || '').trim().slice(0, 1000);
    if (req.body.dueDate !== undefined) row.dueDate = req.body.dueDate ? new Date(req.body.dueDate) : null;
    if (req.body.status === 'draft' || req.body.status === 'published') row.status = req.body.status;
    if (isOid(req.body.teacherId)) {
      const teacher = await User.findOne({ _id: req.body.teacherId, schoolId, role: 'teacher' });
      if (teacher) row.teacherId = teacher._id;
    }
    await row.save();
    res.json({ assignment: row });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.delete('/assignments/:id', async (req, res) => {
  try {
    const schoolId = resolveSchoolId(req);
    if (!isOid(req.params.id)) return res.status(400).json({ error: 'Invalid assignment' });
    const row = await Assignment.findOne({ _id: req.params.id, schoolId });
    if (!row) return res.status(404).json({ error: 'Assignment not found' });
    row.active = false;
    await row.save();
    res.json({ ok: true });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.get('/attendance', async (req, res) => {
  try {
    const schoolId = resolveSchoolId(req);
    if (!schoolId) return res.status(400).json({ error: 'schoolId is required' });
    const day = startOfDay(req.query.date);
    const grade = String(req.query.grade || '').trim();
    const kidFilter = { schoolId, active: { $ne: false } };
    if (grade) kidFilter.grade = grade;
    const kids = await Kid.find(kidFilter).select('name grade photoUrl admissionNo house').sort({ name: 1 });
    const ids = kids.map((k) => k._id);
    const [marks, events, allGrades] = await Promise.all([
      ids.length
        ? AttendanceRecord.find({ schoolId, date: day, kidId: { $in: ids } })
        : [],
      ids.length
        ? TripEvent.find({
            kidId: { $in: ids },
            type: { $in: ['picked_up', 'not_picked_up', 'dropped_off'] },
            at: { $gte: day, $lte: endOfDay(day) },
          })
        : [],
      Kid.distinct('grade', { schoolId, active: { $ne: false } }),
    ]);
    const byKid = Object.fromEntries(marks.map((m) => [String(m.kidId), m]));
    const transport = {};
    for (const e of events) {
      const id = String(e.kidId);
      if (!transport[id]) transport[id] = [];
      transport[id].push(e.type);
    }
    const rows = kids.map((k) => {
      const mark = byKid[String(k._id)];
      const types = transport[String(k._id)] || [];
      let bus = '';
      if (types.includes('picked_up')) bus = 'picked_up';
      else if (types.includes('not_picked_up')) bus = 'not_picked_up';
      else if (types.includes('dropped_off')) bus = 'dropped_off';
      return {
        id: String(k._id),
        name: k.name,
        grade: k.grade || '',
        admissionNo: k.admissionNo || '',
        photoUrl: k.photoUrl || '',
        status: mark?.status || '',
        note: mark?.note || '',
        bus,
      };
    });
    const counts = { present: 0, absent: 0, late: 0, excused: 0, unmarked: 0 };
    for (const r of rows) {
      if (!r.status) counts.unmarked += 1;
      else if (counts[r.status] != null) counts[r.status] += 1;
    }
    res.json({
      date: day,
      grades: allGrades.filter(Boolean).sort(),
      kids: rows,
      stats: { ...counts, total: rows.length },
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/attendance', async (req, res) => {
  try {
    const schoolId = resolveSchoolId(req);
    if (!schoolId) return res.status(400).json({ error: 'schoolId is required' });
    const kidId = String(req.body.kidId || '');
    const status = String(req.body.status || '');
    if (!isOid(kidId) || !ATTENDANCE_STATUSES.includes(status)) {
      return res.status(400).json({ error: 'kidId and a valid status are required' });
    }
    const kid = await Kid.findOne({ _id: kidId, schoolId, active: { $ne: false } });
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
        note: String(req.body.note || '').trim().slice(0, 300),
      },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );
    if (status === 'absent' || status === 'late') {
      const label = status === 'absent' ? 'marked absent' : 'marked late';
      await notifyKidParents(kid, {
        type: NOTIFICATION_TYPES.ATTENDANCE_ALERT,
        title: `${kid.name} ${label}`,
        body: req.body.note
          ? `${kid.name} was ${label}. Note: ${req.body.note}`
          : `${kid.name} was ${label} on the class register.`,
      });
    }
    res.json({ record });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.post('/attendance/bulk', async (req, res) => {
  try {
    const schoolId = resolveSchoolId(req);
    if (!schoolId) return res.status(400).json({ error: 'schoolId is required' });
    const marks = Array.isArray(req.body.marks) ? req.body.marks : [];
    if (!marks.length) return res.status(400).json({ error: 'marks[] is required' });
    const day = startOfDay(req.body.date);
    let saved = 0;
    for (const row of marks) {
      if (!isOid(row.kidId) || !ATTENDANCE_STATUSES.includes(row.status)) continue;
      const kid = await Kid.findOne({ _id: row.kidId, schoolId, active: { $ne: false } });
      if (!kid) continue;
      await AttendanceRecord.findOneAndUpdate(
        { kidId: kid._id, date: day },
        {
          schoolId,
          kidId: kid._id,
          teacherId: req.user.id,
          date: day,
          status: row.status,
          note: String(row.note || '').trim().slice(0, 300),
        },
        { upsert: true, new: true, setDefaultsOnInsert: true }
      );
      saved += 1;
    }
    res.json({ saved });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

export default router;
