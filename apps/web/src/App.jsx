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
import DriverHome from './pages/driver/DriverHome';
import ParentHome from './pages/parent/ParentHome';

function Protected({ role, children }) {
  const { user, loading } = useAuth();
  if (loading) return <div className="loading-screen">Loading…</div>;
  if (!user) return <Navigate to="/login" replace />;
  if (role && user.role !== role) return <Navigate to={`/${user.role}`} replace />;
  return children;
}

const adminNav = [
  { to: '/admin', label: 'Dashboard', end: true },
  { to: '/admin/schools', label: 'Schools' },
  { to: '/admin/routes', label: 'Routes' },
  { to: '/admin/kids', label: 'Kids' },
  { to: '/admin/parents', label: 'Parents' },
  { to: '/admin/drivers', label: 'Drivers' },
];

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route path="/" element={<HomeRedirect />} />

      <Route
        path="/admin"
        element={
          <Protected role="admin">
            <Layout navItems={adminNav} title="Admin" />
          </Protected>
        }
      >
        <Route index element={<AdminDashboard />} />
        <Route path="schools" element={<Schools />} />
        <Route path="routes" element={<RoutesPage />} />
        <Route path="kids" element={<Kids />} />
        <Route path="parents" element={<Parents />} />
        <Route path="drivers" element={<Drivers />} />
      </Route>

      <Route
        path="/driver"
        element={
          <Protected role="driver">
            <Layout navItems={[{ to: '/driver', label: 'My trips', end: true }]} title="Driver" />
          </Protected>
        }
      >
        <Route index element={<DriverHome />} />
      </Route>

      <Route
        path="/parent"
        element={
          <Protected role="parent">
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
  return <Navigate to={`/${user.role}`} replace />;
}
