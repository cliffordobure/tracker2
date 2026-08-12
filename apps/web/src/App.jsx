import { Navigate, Route, Routes } from 'react-router-dom';
import { useAuth } from './context/AuthContext';
import Layout from './components/Layout';
import SchoolAdminLayout from './components/SchoolAdminLayout';
import Login from './pages/Login';
import AdminDashboard from './pages/admin/Dashboard';
import SchoolDashboard from './pages/admin/SchoolDashboard';
import Schools from './pages/admin/Schools';
import RoutesPage from './pages/admin/Routes';
import Parents from './pages/admin/Parents';
import Drivers from './pages/admin/Drivers';
import Kids from './pages/admin/Kids';
import Buses from './pages/admin/Buses';
import TripScheduling from './pages/admin/TripScheduling';
import TripInstances from './pages/admin/TripInstances';
import LiveTracking from './pages/admin/LiveTracking';
import SchoolSettings from './pages/admin/SchoolSettings';
import LeaveRequests from './pages/admin/LeaveRequests';
import Noticeboard from './pages/admin/Noticeboard';
import ComingSoon from './pages/admin/ComingSoon';
import DriverHome from './pages/driver/DriverHome';
import ParentHome from './pages/parent/ParentHome';
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
        <Route path="routes" element={<RoutesPage />} />
        <Route path="students" element={<Kids />} />
        <Route path="parents" element={<Parents />} />
        <Route path="drivers" element={<Drivers />} />
        <Route path="trip-scheduling" element={<TripScheduling />} />
        <Route path="trip-instances" element={<TripInstances />} />
        <Route path="live-tracking" element={<LiveTracking />} />
        <Route path="leave-requests" element={<LeaveRequests />} />
        <Route path="noticeboard" element={<Noticeboard />} />
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
