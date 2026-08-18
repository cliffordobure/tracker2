import { useParams } from 'react-router-dom';

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
