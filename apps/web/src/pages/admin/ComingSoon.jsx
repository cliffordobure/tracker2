import { Navigate, useParams } from 'react-router-dom';

const copy = {
  classes: 'Classes & houses management is coming next.',
  subjects: 'Subjects will connect to the academics module soon.',
  examinations: 'Examinations scheduling will be added in a later release.',
  assignments: 'Assignments tracking is planned for academics.',
  attendance: 'Attendance for transport and class will be added here.',
  'bulk-attendance': 'Bulk attendance import is on the roadmap.',
  messages: 'Internal messaging for parents and staff is coming soon.',
  teachers: 'Teacher records and assignments will live here.',
  stops: 'A dedicated stops directory is coming next.',
  reports: 'Reports and analytics will be built from live trip data.',
  notifications: 'A full notifications inbox is coming soon.',
  incidents: 'Incident review and follow-up will be added here.',
  calendar: 'The school calendar will appear here.',
  users: 'User accounts and roles will be managed from this page.',
};

const titles = {
  users: 'Users & Roles',
  reports: 'Reports & Analytics',
  'bulk-attendance': 'Bulk Attendance',
};

export default function ComingSoon() {
  const { feature } = useParams();
  if (feature === 'stops') return <Navigate to="/school-admin/stops" replace />;
  if (feature === 'reports') return <Navigate to="/school-admin/reports" replace />;
  if (feature === 'calendar') return <Navigate to="/school-admin/calendar" replace />;
  if (feature === 'notifications') return <Navigate to="/school-admin/notifications" replace />;
  if (feature === 'incidents') return <Navigate to="/school-admin/incidents" replace />;
  if (feature === 'messages') return <Navigate to="/school-admin/messages" replace />;
  if (feature === 'users') return <Navigate to="/school-admin/users" replace />;
  if (feature === 'teachers') return <Navigate to="/school-admin/teachers" replace />;
  if (feature === 'classes') return <Navigate to="/school-admin/classes" replace />;
  if (feature === 'subjects') return <Navigate to="/school-admin/subjects" replace />;
  if (feature === 'examinations') return <Navigate to="/school-admin/examinations" replace />;
  if (feature === 'assignments') return <Navigate to="/school-admin/assignments" replace />;
  if (feature === 'attendance') return <Navigate to="/school-admin/attendance" replace />;
  if (feature === 'bulk-attendance') return <Navigate to="/school-admin/attendance/bulk" replace />;
  const slug = feature || 'feature';
  const title =
    titles[slug] || slug.replace(/-/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
  const body = copy[slug] || 'This module is not enabled for your school yet.';

  return (
    <div className="sa-page">
      <div className="sa-page-head">
        <div>
          <h1>{title}</h1>
          <p>School administration module</p>
        </div>
      </div>
      <div className="sa-empty-panel">
        <div className="sa-empty-icon" aria-hidden="true">
          ◈
        </div>
        <h2>Coming Soon</h2>
        <p>{body}</p>
      </div>
    </div>
  );
}
