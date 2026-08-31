import 'dotenv/config';
import bcrypt from 'bcryptjs';
import mongoose from 'mongoose';
import { User, School, Kid, SchoolClass, DiaryEntry, Assignment } from '../models/index.js';

const API = process.env.API_URL || 'http://127.0.0.1:4001';
const stamp = Date.now();
const emails = {
  teacher: `diary.teacher.${stamp}@tracktoto.test`,
  parent: `diary.parent.${stamp}@tracktoto.test`,
  admin: `diary.admin.${stamp}@tracktoto.test`,
};

async function req(path, { token, method = 'GET', body } = {}) {
  const res = await fetch(`${API}${path}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`${method} ${path} → ${res.status} ${data.error || ''}`);
  return data;
}

async function login(email, password) {
  const data = await req('/auth/login', { method: 'POST', body: { email, password } });
  return data.token;
}

function today() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

async function cleanup(schoolId) {
  if (!schoolId) return;
  await DiaryEntry.deleteMany({ schoolId });
  await Assignment.deleteMany({ schoolId });
  await Kid.deleteMany({ schoolId });
  await SchoolClass.deleteMany({ schoolId });
  await User.deleteMany({ schoolId });
  await School.deleteOne({ _id: schoolId });
}

async function run() {
  const mongoUri = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/school_kids_tracker';
  await mongoose.connect(mongoUri);
  const password = 'password123';
  const passwordHash = await bcrypt.hash(password, 10);
  let schoolId = null;

  try {
    const school = await School.create({
      name: `Diary QA ${stamp}`,
      address: 'Ongata Rongai',
      location: { lat: -1.3965, lng: 36.7542 },
      status: 'active',
      plan: 'standard',
    });
    schoolId = school._id;

    const teacher = await User.create({
      email: emails.teacher,
      passwordHash,
      name: 'Ms. Wanjiku',
      role: 'teacher',
      schoolId,
      jobTitle: 'Class Teacher',
    });
    const parent = await User.create({
      email: emails.parent,
      passwordHash,
      name: 'Jane Wanjiku',
      role: 'parent',
      schoolId,
    });
    await User.create({
      email: emails.admin,
      passwordHash,
      name: 'Diary Admin',
      role: 'school_admin',
      schoolId,
    });
    const kid = await Kid.create({
      name: 'Brian Wanjiku',
      schoolId,
      parentIds: [parent._id],
      grade: 'Grade 6 Blue',
    });
    await SchoolClass.create({
      schoolId,
      grade: 'Grade 6 Blue',
      teacherId: teacher._id,
    });

    const teacherToken = await login(emails.teacher, password);
    const date = today();
    const lesson = await req('/teacher/diary', {
      token: teacherToken,
      method: 'POST',
      body: {
        label: 'lesson',
        title: 'Addition of Fractions',
        topic: 'Addition of Fractions',
        lessonSummary: 'Learners were introduced to addition of fractions with common denominators.',
        learningActivity: 'Learners worked in pairs to solve five fraction problems.',
        teacherObservation: 'Most learners understood the concept.',
        subjects: ['Mathematics'],
        grade: 'Grade 6 Blue',
        date,
        status: 'published',
        visibilityParents: true,
        notifyParent: true,
        homework: { enabled: true, title: 'Exercise 5, Questions 1–10', dueDate: date },
      },
    });
    const achievement = await req('/teacher/diary', {
      token: teacherToken,
      method: 'POST',
      body: {
        label: 'achievement',
        title: 'Excellent participation',
        topic: 'Excellent participation',
        body: 'Brian demonstrated excellent participation during today\'s lesson.',
        grade: 'Grade 6 Blue',
        kidIds: [kid._id],
        date,
        status: 'published',
      },
    });

    const teacherDay = await req(`/teacher/diary?date=${date}`, { token: teacherToken });
    if (!teacherDay.overview) throw new Error('Teacher diary overview missing');
    if (teacherDay.overview.homework < 1) throw new Error('Homework was not linked to the lesson');
    if (!teacherDay.entries.some((e) => String(e._id) === String(lesson.entry._id))) {
      throw new Error('Published lesson not in teacher day list');
    }

    const parentToken = await login(emails.parent, password);
    const feed = await req('/parent/diary', { token: parentToken });
    const parentLesson = (feed.entries || []).find((e) => String(e._id) === String(lesson.entry._id));
    const parentAchievement = (feed.entries || []).find((e) => String(e._id) === String(achievement.entry._id));
    if (!parentLesson) throw new Error('Parent cannot see published lesson');
    if (!parentAchievement) throw new Error('Parent cannot see achievement');
    if (parentLesson.filter !== 'lessons') throw new Error(`Expected lessons filter, got ${parentLesson.filter}`);
    if (parentLesson.needsSignature !== true) throw new Error('Parent should need to acknowledge the lesson');

    await req(`/parent/diary/${parentLesson._id}/sign`, {
      token: parentToken,
      method: 'POST',
      body: { kidId: kid._id },
    });
    const after = await req(`/parent/diary/${parentLesson._id}`, { token: parentToken });
    if (after.entry?.signed !== true) throw new Error('Parent acknowledgement did not persist');

    const adminToken = await login(emails.admin, password);
    const monitor = await req(`/admin/diary/monitor?date=${date}`, { token: adminToken });
    if (monitor.homeworkPublished < 1) throw new Error('Admin monitor did not count homework');
    if (monitor.teachersSubmitted < 1) throw new Error('Admin monitor did not count teacher submission');

    const createdAssignment = await Assignment.findOne({ schoolId, title: 'Exercise 5, Questions 1–10' });
    if (!createdAssignment) throw new Error('Homework diary entry did not create an assignment');

    console.log(JSON.stringify({
      ok: true,
      lessonId: lesson.entry._id,
      achievementId: achievement.entry._id,
      homeworkAssignmentId: createdAssignment._id,
      teacherOverview: teacherDay.overview,
      parentSigned: true,
      admin: {
        classes: monitor.classes,
        diaryCompletion: monitor.diaryCompletion,
        parentAcknowledgement: monitor.parentAcknowledgement,
        homeworkPublished: monitor.homeworkPublished,
        teachersSubmitted: monitor.teachersSubmitted,
      },
    }, null, 2));
  } finally {
    await cleanup(schoolId);
    await mongoose.disconnect();
  }
}

run().catch(async (err) => {
  console.error(err.message || err);
  process.exit(1);
});
