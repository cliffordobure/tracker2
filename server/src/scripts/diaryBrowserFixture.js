import 'dotenv/config';
import bcrypt from 'bcryptjs';
import mongoose from 'mongoose';
import { User, School, Kid, SchoolClass } from '../models/index.js';

const stamp = 'browser';
const emails = {
  teacher: 'diary.browser.teacher@tracktoto.test',
  parent: 'diary.browser.parent@tracktoto.test',
  admin: 'diary.browser.admin@tracktoto.test',
};

const mongoUri = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/school_kids_tracker';
await mongoose.connect(mongoUri);

const action = process.argv[2] || 'up';
const existing = await User.findOne({ email: emails.teacher });
if (action === 'down') {
  const schoolId = existing?.schoolId;
  if (schoolId) {
    const { DiaryEntry, Assignment } = await import('../models/index.js');
    await DiaryEntry.deleteMany({ schoolId });
    await Assignment.deleteMany({ schoolId });
    await Kid.deleteMany({ schoolId });
    await SchoolClass.deleteMany({ schoolId });
    await User.deleteMany({ schoolId });
    await School.deleteOne({ _id: schoolId });
  }
  console.log('fixture removed');
  await mongoose.disconnect();
  process.exit(0);
}

if (existing) {
  console.log(JSON.stringify({ ok: true, ...emails, ready: true }));
  await mongoose.disconnect();
  process.exit(0);
}

const passwordHash = await bcrypt.hash('password123', 10);
const school = await School.create({
  name: 'Diary Browser School',
  address: 'Ongata Rongai',
  location: { lat: -1.3965, lng: 36.7542 },
  status: 'active',
  plan: 'standard',
});
const teacher = await User.create({
  email: emails.teacher,
  passwordHash,
  name: 'Ms. Wanjiku',
  role: 'teacher',
  schoolId: school._id,
  jobTitle: 'Class Teacher',
});
await User.create({
  email: emails.parent,
  passwordHash,
  name: 'Jane Wanjiku',
  role: 'parent',
  schoolId: school._id,
});
await User.create({
  email: emails.admin,
  passwordHash,
  name: 'Diary Admin',
  role: 'school_admin',
  schoolId: school._id,
});
const parent = await User.findOne({ email: emails.parent });
await Kid.create({
  name: 'Brian Wanjiku',
  schoolId: school._id,
  parentIds: [parent._id],
  grade: 'Grade 6 Blue',
});
await SchoolClass.create({
  schoolId: school._id,
  grade: 'Grade 6 Blue',
  teacherId: teacher._id,
});
console.log(JSON.stringify({ ok: true, ...emails }));
await mongoose.disconnect();
