import {
  AcademicTerm,
  Announcement,
  AnnouncementComment,
  Assessment,
  Assignment,
  AttendanceRecord,
  AuditLog,
  Bus,
  CalendarEvent,
  Campus,
  Conversation,
  DeviceToken,
  DiaryEntry,
  DriverProfile,
  FeatureRequest,
  FeeStatement,
  Kid,
  LeaveRequest,
  LessonPlan,
  LocationPing,
  MediaAsset,
  Message,
  Notification,
  OutingPermission,
  PlatformInvoice,
  Route,
  ScheduleException,
  School,
  SchoolClass,
  SchoolHoliday,
  SchoolOuting,
  Stop,
  SupportTicket,
  TeacherNote,
  TeachingResource,
  Trip,
  TripEvent,
  TripSchedule,
  User,
  VehicleRecord,
} from '../models/index.js';

const LIVE_STATUSES = ['active', 'trial'];

export async function schoolAllowsLogin(schoolId) {
  if (!schoolId) return false;
  const school = await School.findById(schoolId).select('status');
  return Boolean(school && LIVE_STATUSES.includes(school.status));
}

function ids(docs) {
  return docs.map((doc) => doc._id);
}

/** Permanently remove a school and every record that belongs to it. */
export async function closeSchool(schoolId) {
  const school = await School.findById(schoolId);
  if (!school) return null;

  const filter = { schoolId: school._id };
  const [users, trips, routes, announcements, conversations, outings] = await Promise.all([
    User.find(filter).select('_id'),
    Trip.find(filter).select('_id'),
    Route.find(filter).select('_id'),
    Announcement.find(filter).select('_id'),
    Conversation.find(filter).select('_id'),
    SchoolOuting.find(filter).select('_id'),
  ]);

  const userIds = ids(users);
  const tripIds = ids(trips);
  const routeIds = ids(routes);
  const announcementIds = ids(announcements);
  const conversationIds = ids(conversations);
  const outingIds = ids(outings);

  await Promise.all([
    tripIds.length ? TripEvent.deleteMany({ tripId: { $in: tripIds } }) : null,
    tripIds.length ? LocationPing.deleteMany({ tripId: { $in: tripIds } }) : null,
    routeIds.length ? Stop.deleteMany({ routeId: { $in: routeIds } }) : null,
    announcementIds.length ? AnnouncementComment.deleteMany({ announcementId: { $in: announcementIds } }) : null,
    conversationIds.length ? Message.deleteMany({ conversationId: { $in: conversationIds } }) : null,
    outingIds.length ? OutingPermission.deleteMany({ outingId: { $in: outingIds } }) : null,
    userIds.length ? DriverProfile.deleteMany({ userId: { $in: userIds } }) : null,
    userIds.length ? DeviceToken.deleteMany({ userId: { $in: userIds } }) : null,
    userIds.length ? Notification.deleteMany({ userId: { $in: userIds } }) : null,
  ]);

  await Promise.all([
    AcademicTerm.deleteMany(filter),
    Announcement.deleteMany(filter),
    Assessment.deleteMany(filter),
    Assignment.deleteMany(filter),
    AttendanceRecord.deleteMany(filter),
    AuditLog.deleteMany(filter),
    Bus.deleteMany(filter),
    CalendarEvent.deleteMany(filter),
    Campus.deleteMany(filter),
    Conversation.deleteMany(filter),
    DiaryEntry.deleteMany(filter),
    FeatureRequest.deleteMany(filter),
    FeeStatement.deleteMany(filter),
    Kid.deleteMany(filter),
    LeaveRequest.deleteMany(filter),
    LessonPlan.deleteMany(filter),
    MediaAsset.deleteMany(filter),
    PlatformInvoice.deleteMany(filter),
    Route.deleteMany(filter),
    ScheduleException.deleteMany(filter),
    SchoolClass.deleteMany(filter),
    SchoolHoliday.deleteMany(filter),
    SchoolOuting.deleteMany(filter),
    SupportTicket.deleteMany(filter),
    TeacherNote.deleteMany(filter),
    TeachingResource.deleteMany(filter),
    Trip.deleteMany(filter),
    TripSchedule.deleteMany(filter),
    VehicleRecord.deleteMany(filter),
    User.deleteMany(filter),
  ]);

  await School.findByIdAndDelete(school._id);
  return school;
}
