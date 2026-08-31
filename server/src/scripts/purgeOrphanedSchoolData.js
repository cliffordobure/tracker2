/**
 * Permanently delete leftover records whose school no longer exists.
 * Run: node src/scripts/purgeOrphanedSchoolData.js
 */
import 'dotenv/config';
import mongoose from 'mongoose';
import {
  AcademicTerm,
  Announcement,
  Assessment,
  Assignment,
  AttendanceRecord,
  AuditLog,
  Bus,
  CalendarEvent,
  Campus,
  Conversation,
  DiaryEntry,
  FeatureRequest,
  FeeStatement,
  Kid,
  LeaveRequest,
  LessonPlan,
  MediaAsset,
  PlatformInvoice,
  Route,
  ScheduleException,
  School,
  SchoolClass,
  SchoolHoliday,
  SchoolOuting,
  SupportTicket,
  TeacherNote,
  TeachingResource,
  Trip,
  TripSchedule,
  User,
  VehicleRecord,
} from '../models/index.js';
import { purgeSchoolData } from '../lib/schoolAccess.js';

const mongoUri = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/school_kids_tracker';

const SCOPED_MODELS = [
  AcademicTerm,
  Announcement,
  Assessment,
  Assignment,
  AttendanceRecord,
  AuditLog,
  Bus,
  CalendarEvent,
  Campus,
  Conversation,
  DiaryEntry,
  FeatureRequest,
  FeeStatement,
  Kid,
  LeaveRequest,
  LessonPlan,
  MediaAsset,
  PlatformInvoice,
  Route,
  ScheduleException,
  SchoolClass,
  SchoolHoliday,
  SchoolOuting,
  SupportTicket,
  TeacherNote,
  TeachingResource,
  Trip,
  TripSchedule,
  User,
  VehicleRecord,
];

async function collectOrphanSchoolIds(liveSchoolIds) {
  const found = new Map();

  for (const Model of SCOPED_MODELS) {
    const ids = await Model.distinct('schoolId', { schoolId: { $ne: null } });
    for (const id of ids) {
      if (!id) continue;
      const key = String(id);
      if (liveSchoolIds.has(key)) continue;
      const entry = found.get(key) || { id, sources: new Set() };
      entry.sources.add(Model.modelName);
      found.set(key, entry);
    }
  }

  return [...found.values()];
}

async function main() {
  await mongoose.connect(mongoUri);
  console.log(`Connected to ${mongoUri}\n`);

  const liveSchools = await School.find().select('_id name');
  const liveSchoolIds = new Set(liveSchools.map((school) => String(school._id)));
  console.log(`Live schools (${liveSchools.length}):`);
  for (const school of liveSchools) {
    console.log(`  - ${school.name} (${school._id})`);
  }

  const orphans = await collectOrphanSchoolIds(liveSchoolIds);
  if (!orphans.length) {
    console.log('\nNo leftover data from deleted schools.');
    await mongoose.disconnect();
    return;
  }

  console.log(`\nOrphan school ids with leftover data (${orphans.length}):`);
  let totalDeleted = 0;

  for (const orphan of orphans) {
    const users = await User.find({ schoolId: orphan.id }).select('email name role');
    const labels = users.length
      ? users.map((user) => `${user.email || user.name} [${user.role}]`).join(', ')
      : orphan.sources.size
        ? [...orphan.sources].join(', ')
        : 'unknown';
    const result = await purgeSchoolData(orphan.id);
    totalDeleted += result.deletedCount;
    console.log(`  - ${orphan.id}: deleted ${result.deletedCount} record(s) (${labels})`);
  }

  console.log(`\nDone. Permanently deleted ${totalDeleted} leftover record(s).`);
  await mongoose.disconnect();
}

main().catch(async (error) => {
  console.error(error);
  await mongoose.disconnect().catch(() => {});
  process.exit(1);
});
