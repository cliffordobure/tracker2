import { useParams } from 'react-router-dom';

const copy = {
  classes: 'Classes & houses management is coming next.',
  subjects: 'Subjects will connect to the academics module soon.',
  examinations: 'Examinations scheduling will be added in a later release.',
  assignments: 'Assignments tracking is planned for academics.',
  attendance: 'Daily attendance will sit alongside leave requests.',
  'bulk-attendance': 'Bulk attendance import is on the roadmap.',
  messages: 'Internal messaging for parents and staff is coming soon.',
};

export default function ComingSoon() {
  const { feature } = useParams();
  const title = (feature || 'Feature').replace(/-/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
  const body = copy[feature] || 'This module is not enabled for your school yet.';

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
        <h2>Coming soon</h2>
        <p>{body}</p>
      </div>
    </div>
  );
}
