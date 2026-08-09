import { Navigate, Route, Routes } from 'react-router-dom';
import { useAuth } from './context/AuthContext';
import Layout from './components/Layout';
import Login from './pages/Login';
import AdminDashboard from './pages/admin/Dashboard';
import Schools from './pages/admin/Schools';
import RoutesPage from './pages/admin/Routes';
import Parents from './pages/admin/Parents';
import Drivers from './pages/admin/Drivers';
import Kids from './pages/admin/Kids';
import Buses from './pages/admin/Buses';
import Dispatch from './pages/admin/Dispatch';
import SchoolSettings from './pages/admin/SchoolSettings';
import DriverHome from './pages/driver/DriverHome';
import ParentHome from './pages/parent/ParentHome';
import { homePathForRole } from './lib/roles';

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

const schoolNav = [
  { to: '/school-admin', label: 'Dashboard', end: true },
  { to: '/school-admin/school', label: 'School' },
  { to: '/school-admin/buses', label: 'Buses' },
  { to: '/school-admin/routes', label: 'Routes' },
  { to: '/school-admin/students', label: 'Students' },
  { to: '/school-admin/parents', label: 'Parents' },
  { to: '/school-admin/drivers', label: 'Drivers' },
  { to: '/school-admin/dispatch', label: 'Dispatch' },
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
            <Layout navItems={schoolNav} title="School Admin" />
          </Protected>
        }
      >
        <Route index element={<AdminDashboard />} />
        <Route path="school" element={<SchoolSettings />} />
        <Route path="buses" element={<Buses />} />
        <Route path="routes" element={<RoutesPage />} />
        <Route path="students" element={<Kids />} />
        <Route path="parents" element={<Parents />} />
        <Route path="drivers" element={<Drivers />} />
        <Route path="dispatch" element={<Dispatch />} />
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
