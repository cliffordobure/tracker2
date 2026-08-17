import LiveTracking from '../admin/LiveTracking';

export default function TeacherLive() {
  return (
    <div className="teacher-live">
      <LiveTracking endpoint="/teacher/live-tracking" />
    </div>
  );
}
