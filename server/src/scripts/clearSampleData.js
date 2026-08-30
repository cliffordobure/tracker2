/**
 * Removes demo/sample records seeded for UI previews.
 * Run: npm run clear-sample-data -w server
 */
import 'dotenv/config';
import mongoose from 'mongoose';
import {
  Announcement,
  AnnouncementComment,
  Assessment,
  AttendanceRecord,
  CalendarEvent,
  Conversation,
  DiaryEntry,
  FeeStatement,
  Kid,
  LeaveRequest,
  LessonPlan,
  Message,
  Notification,
  OutingPermission,
  SchoolOuting,
  SupportTicket,
  TeachingResource,
} from '../models/index.js';

const mongoUri = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/school_kids_tracker';
const DUMMY_PDF = /w3\.org.*dummy\.pdf/i;

async function main() {
  await mongoose.connect(mongoUri);
  console.log('Connected. Clearing sample/demo data...\n');

  const sampleConversations = await Conversation.find({ sourceKey: /^sample:/ }).select('_id');
  const convoIds = sampleConversations.map((c) => c._id);

  const results = await Promise.all([
    Announcement.deleteMany({ sourceKey: /^sample:/ }),
    AnnouncementComment.deleteMany({ sample: true }),
    Notification.deleteMany({ key: /^sample:/ }),
    Conversation.deleteMany({ sourceKey: /^sample:/ }),
    convoIds.length ? Message.deleteMany({ conversationId: { $in: convoIds } }) : { deletedCount: 0 },
    SupportTicket.deleteMany({ sourceKey: /^sample:/ }),
    LessonPlan.deleteMany({ sourceKey: /^sample:/ }),
    TeachingResource.deleteMany({ sourceKey: /^sample:/ }),
    DiaryEntry.deleteMany({ 'media.url': DUMMY_PDF }),
    FeeStatement.deleteMany({
      $or: [
        { statementUrl: DUMMY_PDF },
        { 'payments.reference': 'QGX7K2M91A' },
        { 'payments.reference': 'BT-44821' },
        {
          termLabel: /^This Term \(Term 2\)$/,
          'lines.description': 'Development Levy',
        },
      ],
    }),
    LeaveRequest.deleteMany({
      $or: [{ sourceKey: /^sample:/ }, { reason: 'Going for a family vacation.', transportMode: 'School Bus' }],
    }),
    CalendarEvent.deleteMany({ sourceKey: /^sample:/ }),
    SchoolOuting.deleteMany({ sourceKey: /^sample:/ }),
  ]);

  const labels = [
    'Announcements (sample:*)',
    'Announcement comments (sample flag)',
    'Notifications (sample:*)',
    'Conversations (sample:*)',
    'Messages in sample conversations',
    'Support tickets (sample:*)',
    'Lesson plans (sample:*)',
    'Teaching resources (sample:*)',
    'Diary entries (dummy PDF attachments)',
    'Fee statements (dummy PDF)',
    'Leave requests (sample:*)',
    'Calendar events (sample:*)',
    'School outings (sample:*)',
  ];

  results.forEach((r, i) => {
    console.log(`  ${labels[i]}: ${r.deletedCount ?? 0} removed`);
  });

  const kidsWithDummyDocs = await Kid.find({ 'documents.url': DUMMY_PDF }).select('_id documents');
  let docsPulled = 0;
  for (const kid of kidsWithDummyDocs) {
    const before = kid.documents?.length || 0;
    kid.documents = (kid.documents || []).filter((d) => !DUMMY_PDF.test(d.url || ''));
    docsPulled += before - kid.documents.length;
    await kid.save();
  }
  console.log(`  Kid documents (dummy PDF): ${docsPulled} removed`);

  const kidsWithSampleHealth = await Kid.find({
    $or: [
      { 'health.conditions': 'Asthma (Mild)' },
      { allergies: 'Peanuts, Penicillin' },
      { bloodGroup: 'O+' },
    ],
  });
  let healthReset = 0;
  for (const kid of kidsWithSampleHealth) {
    const h = kid.health || {};
    const looksSample =
      h.conditions === 'Asthma (Mild)' &&
      h.medication === 'Salbutamol Inhaler (As needed)' &&
      h.doctor === 'Dr. Brian Otieno';
    if (!looksSample) continue;
    kid.health = {
      conditions: '',
      medication: '',
      doctor: '',
      hospital: '',
      insurance: '',
      policyNumber: '',
      notes: '',
      immunizations: [],
    };
    if (kid.allergies === 'Peanuts, Penicillin') kid.allergies = '';
    if (kid.bloodGroup === 'O+') kid.bloodGroup = '';
    await kid.save();
    healthReset += 1;
  }
  console.log(`  Kid health records (sample profile): ${healthReset} reset`);

  const sampleTitles = ['Login issue on parent app', 'Class Diary'];
  const diaryRemoved = await DiaryEntry.deleteMany({
    $or: [
      { title: 'Class Diary', homeworkItems: /leaf sample/ },
      { title: 'Class Diary', body: /participated actively in today's Science lesson/ },
    ],
  });
  console.log(`  Diary entries (sample content): ${diaryRemoved.deletedCount} removed`);

  const seededAssessments = await Assessment.deleteMany({
    title: /^Academic Term \d /,
    subject: { $in: ['Mathematics', 'English', 'Kiswahili', 'Science', 'Social Studies', 'Conduct', 'Participation', 'Respect'] },
  });
  console.log(`  Seeded assessments (demo scores): ${seededAssessments.deletedCount} removed`);

  let attendanceRemoved = 0;
  const kidIds = await Kid.find({}).distinct('_id');
  for (const kidId of kidIds) {
    const records = await AttendanceRecord.find({ kidId, $or: [{ note: null }, { note: '' }] }).sort({ date: 1 });
    if (records.length < 20 || records.length > 30) continue;
    const statuses = records.map((r) => r.status);
    const absent = statuses.filter((s) => s === 'absent').length;
    const late = statuses.filter((s) => s === 'late').length;
    const present = statuses.filter((s) => s === 'present').length;
    if (absent === 1 && late === 1 && present === records.length - 2) {
      const result = await AttendanceRecord.deleteMany({ _id: { $in: records.map((r) => r._id) } });
      attendanceRemoved += result.deletedCount || 0;
    }
  }
  console.log(`  Auto-seeded attendance rows: ${attendanceRemoved} removed`);

  console.log('\nDone. Restart the API server and refresh the apps.');
  await mongoose.disconnect();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
