import { Navigate, Route, Routes } from 'react-router-dom';
import { useAuth } from './context/AuthContext';
import Layout from './components/Layout';
import SchoolAdminLayout from './components/SchoolAdminLayout';
import Login from './pages/Login';
import AdminDashboard from './pages/admin/Dashboard';
import SchoolDashboard from './pages/admin/SchoolDashboard';
import Schools from './pages/admin/Schools';
import RoutesPage from './pages/admin/Routes';
import RouteDetails from './pages/admin/RouteDetails';
import StopsPage from './pages/admin/Stops';
import Parents from './pages/admin/Parents';
import Drivers from './pages/admin/Drivers';
import DriverDetails from './pages/admin/DriverDetails';
import Teachers from './pages/admin/Teachers';
import TeacherDetails from './pages/admin/TeacherDetails';
import Kids from './pages/admin/Kids';
import StudentDetails from './pages/admin/StudentDetails';
import Buses from './pages/admin/Buses';
import VehicleDetails from './pages/admin/VehicleDetails';
import TripScheduling from './pages/admin/TripScheduling';
import TripInstances from './pages/admin/TripInstances';
import LiveTracking from './pages/admin/LiveTracking';
import Reports from './pages/admin/Reports';
import CalendarPage from './pages/admin/Calendar';
import Notifications from './pages/admin/Notifications';
import Incidents from './pages/admin/Incidents';
import Messages from './pages/admin/Messages';
import UsersRoles from './pages/admin/UsersRoles';
import SchoolSettings from './pages/admin/SchoolSettings';
import LeaveRequests from './pages/admin/LeaveRequests';
import Noticeboard from './pages/admin/Noticeboard';
import Classes from './pages/admin/Classes';
import Subjects from './pages/admin/Subjects';
import Examinations from './pages/admin/Examinations';
import AssignmentsAdmin from './pages/admin/AssignmentsAdmin';
import Attendance from './pages/admin/Attendance';
import BulkAttendance from './pages/admin/BulkAttendance';
import ComingSoon from './pages/admin/ComingSoon';
import DriverHome from './pages/driver/DriverHome';
import ParentHome from './pages/parent/ParentHome';
import TeacherLayout from './components/TeacherLayout';
import TeacherHome from './pages/teacher/TeacherHome';
import TeacherRegister from './pages/teacher/TeacherRegister';
import TeacherAssignments from './pages/teacher/TeacherAssignments';
import TeacherNotes from './pages/teacher/TeacherNotes';
import TeacherStudents from './pages/teacher/TeacherStudents';
import TeacherDiary from './pages/teacher/TeacherDiary';
import { homePathForRole } from './lib/roles';
import './school-admin.css';

function Protected({ roles, children }) {
  const { user, loading } = useAuth();
  if (loading) return <div className="loading-screen">Loading…</div>;
  if (!user) return <Navigate to="/login" replace />;
  const allowed = Array.isArray(roles) ? roles : [roles];
  if (roles && !allowed.includes(user.role)) {
    return <Navigate to={homePathForRole(user.role)} replace />;
  }
  return children;
}

const superNav = [
  { to: '/super-admin', label: 'Dashboard', end: true },
  { to: '/super-admin/schools', label: 'Schools' },
];

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route path="/" element={<HomeRedirect />} />

      <Route path="/admin/*" element={<LegacyAdminRedirect />} />

      <Route
        path="/super-admin"
        element={
          <Protected roles={['super_admin']}>
            <Layout navItems={superNav} title="Super Admin" />
          </Protected>
        }
      >
        <Route index element={<AdminDashboard />} />
        <Route path="schools" element={<Schools />} />
      </Route>

      <Route
        path="/school-admin"
        element={
          <Protected roles={['school_admin']}>
            <SchoolAdminLayout />
          </Protected>
        }
      >
        <Route index element={<SchoolDashboard />} />
        <Route path="school" element={<SchoolSettings />} />
        <Route path="buses" element={<Buses />} />
        <Route path="buses/:id" element={<VehicleDetails />} />
        <Route path="routes" element={<RoutesPage />} />
        <Route path="routes/:id" element={<RouteDetails />} />
        <Route path="stops" element={<StopsPage />} />
        <Route path="students" element={<Kids />} />
        <Route path="students/:id" element={<StudentDetails />} />
        <Route path="teachers" element={<Teachers />} />
        <Route path="teachers/:id" element={<TeacherDetails />} />
        <Route path="parents" element={<Parents />} />
        <Route path="drivers" element={<Drivers />} />
        <Route path="drivers/:id" element={<DriverDetails />} />
        <Route path="trip-scheduling" element={<TripScheduling />} />
        <Route path="trip-instances" element={<TripInstances />} />
        <Route path="live-tracking" element={<LiveTracking />} />
        <Route path="reports" element={<Reports />} />
        <Route path="calendar" element={<CalendarPage />} />
        <Route path="notifications" element={<Notifications />} />
        <Route path="incidents" element={<Incidents />} />
        <Route path="messages" element={<Messages />} />
        <Route path="messages/:id" element={<Messages />} />
        <Route path="users" element={<UsersRoles />} />
        <Route path="leave-requests" element={<LeaveRequests />} />
        <Route path="noticeboard" element={<Noticeboard />} />
        <Route path="classes" element={<Classes />} />
        <Route path="subjects" element={<Subjects />} />
        <Route path="examinations" element={<Examinations />} />
        <Route path="assignments" element={<AssignmentsAdmin />} />
        <Route path="attendance" element={<Attendance />} />
        <Route path="attendance/bulk" element={<BulkAttendance />} />
        <Route path="coming-soon/:feature" element={<ComingSoon />} />
        <Route path="dispatch" element={<Navigate to="/school-admin/trip-scheduling" replace />} />
      </Route>

      <Route
        path="/driver"
        element={
          <Protected roles={['driver']}>
            <Layout navItems={[{ to: '/driver', label: 'My trips', end: true }]} title="Driver" />
          </Protected>
        }
      >
        <Route index element={<DriverHome />} />
      </Route>

      <Route
        path="/parent"
        element={
          <Protected roles={['parent']}>
            <Layout navItems={[{ to: '/parent', label: 'Family', end: true }]} title="Parent" />
          </Protected>
        }
      >
        <Route index element={<ParentHome />} />
      </Route>

      <Route
        path="/teacher"
        element={
          <Protected roles={['teacher']}>
            <TeacherLayout />
          </Protected>
        }
      >
        <Route index element={<TeacherHome />} />
        <Route path="register" element={<TeacherRegister />} />
        <Route path="diary" element={<TeacherDiary />} />
        <Route path="assignments" element={<TeacherAssignments />} />
        <Route path="notes" element={<TeacherNotes />} />
        <Route path="students" element={<TeacherStudents />} />
        <Route path="live" element={<Navigate to="/teacher" replace />} />
        <Route path="trips" element={<Navigate to="/teacher" replace />} />
        <Route path="noticeboard" element={<Navigate to="/teacher" replace />} />
      </Route>

      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}

function HomeRedirect() {
  const { user, loading } = useAuth();
  if (loading) return <div className="loading-screen">Loading…</div>;
  if (!user) return <Navigate to="/login" replace />;
  return <Navigate to={homePathForRole(user.role)} replace />;
}

function LegacyAdminRedirect() {
  const { user, loading } = useAuth();
  if (loading) return <div className="loading-screen">Loading…</div>;
  if (!user) return <Navigate to="/login" replace />;
  if (user.role === 'school_admin') return <Navigate to="/school-admin" replace />;
  return <Navigate to="/super-admin" replace />;
}
