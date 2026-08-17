import { Router } from 'express';
import {
  User,
  Kid,
  School,
  AttendanceRecord,
  Assignment,
  TeacherNote,
  DiaryEntry,
} from '../models/index.js';
import { authenticate, requireRole } from '../middleware/auth.js';
import { createAndEmitNotifications, NOTIFICATION_TYPES } from '../services/notifications.js';
import { getIO } from '../socket.js';

const router = Router();
router.use(authenticate, requireRole('teacher'));

const ATTENDANCE_STATUSES = ['present', 'absent', 'late', 'excused'];
const NOTE_CATEGORIES = ['general', 'academic', 'behaviour', 'health', 'urgent'];
const DIARY_LABELS = ['general', 'class', 'activity', 'meal', 'academic', 'health'];
const MAX_DIARY_MEDIA = 8;

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
  const teacher = await User.findById(req.user.id).select('schoolId name');
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
        stats: { students: 0, markedToday: 0, present: 0, absent: 0, late: 0, assignments: 0 },
        unmarked: [],
        recentNotes: [],
        assignments: [],
      });
    }

    const day = startOfDay(req.query.date);
    const [school, kids, marks, assignments, recentNotes] = await Promise.all([
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
    ]);

    const byKid = Object.fromEntries(marks.map((m) => [m.kidId.toString(), m]));
    const unmarked = kids.filter((k) => !byKid[k._id.toString()]);
    const present = marks.filter((m) => m.status === 'present').length;
    const absent = marks.filter((m) => m.status === 'absent').length;
    const late = marks.filter((m) => m.status === 'late').length;

    res.json({
      school,
      stats: {
        students: kids.length,
        markedToday: marks.length,
        unmarked: unmarked.length,
        present,
        absent,
        late,
        assignments: assignments.length,
      },
      unmarked: unmarked.slice(0, 12).map((k) => ({
        _id: k._id,
        name: k.name,
        grade: k.grade,
      })),
      recentNotes,
      assignments,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
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

router.post('/assignments', async (req, res) => {
  try {
    const { schoolId } = await teacherContext(req);
    if (!schoolId) return res.status(400).json({ error: 'No school assigned to this teacher' });

    const { title, subject, grade, description, dueDate, kidIds } = req.body || {};
    if (!title?.trim()) return res.status(400).json({ error: 'title is required' });

    const assignment = await Assignment.create({
      schoolId,
      teacherId: req.user.id,
      title: title.trim(),
      subject: subject?.trim() || '',
      grade: grade?.trim() || '',
      description: description?.trim() || '',
      dueDate: dueDate ? new Date(dueDate) : null,
      kidIds: Array.isArray(kidIds) ? kidIds : [],
    });

    let kids;
    if (assignment.kidIds.length) {
      kids = await populateKids(Kid.find({ _id: { $in: assignment.kidIds }, schoolId, active: true }));
    } else if (assignment.grade) {
      kids = await populateKids(Kid.find({ schoolId, grade: assignment.grade, active: true }));
    } else {
      kids = await populateKids(Kid.find({ schoolId, active: true }));
    }

    const due = assignment.dueDate
      ? ` Due ${assignment.dueDate.toLocaleDateString()}.`
      : '';
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

    const populated = await Assignment.findById(assignment._id).populate('kidIds', 'name grade');
    res.status(201).json({ assignment: populated, notified: items.length });
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

    for (const key of ['title', 'subject', 'grade', 'description']) {
      if (req.body[key] !== undefined) assignment[key] = String(req.body[key] || '').trim();
    }
    if (req.body.dueDate !== undefined) {
      assignment.dueDate = req.body.dueDate ? new Date(req.body.dueDate) : null;
    }
    if (Array.isArray(req.body.kidIds)) assignment.kidIds = req.body.kidIds;
    if (req.body.active === false) assignment.active = false;
    await assignment.save();
    const populated = await Assignment.findById(assignment._id).populate('kidIds', 'name grade');
    res.json({ assignment: populated });
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

function populateDiary(q) {
  return q
    .populate('teacherId', 'name')
    .populate('kidIds', 'name grade');
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
      filter.date = startOfDay(req.query.date);
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
    res.json({ entries, dates });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/diary', async (req, res) => {
  try {
    const { schoolId, teacher } = await teacherContext(req);
    if (!schoolId) return res.status(400).json({ error: 'No school assigned to this teacher' });

    const { title, body, label, grade, kidIds, date } = req.body || {};
    if (!title?.trim()) return res.status(400).json({ error: 'title is required' });

    const entry = await DiaryEntry.create({
      schoolId,
      teacherId: req.user.id,
      date: startOfDay(date),
      title: title.trim().slice(0, 160),
      body: String(body || '').trim().slice(0, 4000),
      label: DIARY_LABELS.includes(label) ? label : 'general',
      grade: grade?.trim() || '',
      kidIds: Array.isArray(kidIds) ? kidIds : [],
      media: normalizeDiaryMedia(req.body.media),
    });

    const kids = await audienceKids(schoolId, { kidIds: entry.kidIds, grade: entry.grade });
    const teacherName = teacher?.name || 'Teacher';
    const photoNote = entry.media.length
      ? ` ${entry.media.length} photo${entry.media.length === 1 ? '' : 's'} attached.`
      : '';
    const items = [];
    for (const kid of kids) {
      for (const parent of kid.parentIds || []) {
        items.push({
          userId: parent._id || parent,
          type: NOTIFICATION_TYPES.DIARY,
          title: `Class diary: ${entry.title}`,
          body: `${teacherName} posted about ${kid.name}.${photoNote}`,
          kidId: kid._id,
        });
      }
    }
    if (items.length) await createAndEmitNotifications(getIO(), items);

    const populated = await populateDiary(DiaryEntry.findById(entry._id));
    res.status(201).json({ entry: populated, notified: items.length });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.put('/diary/:id', async (req, res) => {
  try {
    const { schoolId } = await teacherContext(req);
    const entry = await DiaryEntry.findOne({
      _id: req.params.id,
      schoolId,
      teacherId: req.user.id,
      active: true,
    });
    if (!entry) return res.status(404).json({ error: 'Diary entry not found' });

    if (req.body.title !== undefined) entry.title = String(req.body.title || '').trim().slice(0, 160);
    if (req.body.body !== undefined) entry.body = String(req.body.body || '').trim().slice(0, 4000);
    if (DIARY_LABELS.includes(req.body.label)) entry.label = req.body.label;
    if (req.body.grade !== undefined) entry.grade = String(req.body.grade || '').trim();
    if (Array.isArray(req.body.kidIds)) entry.kidIds = req.body.kidIds;
    if (req.body.date) entry.date = startOfDay(req.body.date);
    if (req.body.media !== undefined) entry.media = normalizeDiaryMedia(req.body.media);
    if (!entry.title) return res.status(400).json({ error: 'title is required' });
    await entry.save();

    const populated = await populateDiary(DiaryEntry.findById(entry._id));
    res.json({ entry: populated });
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

export default router;
