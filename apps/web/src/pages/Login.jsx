import { Navigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { homePathForRole } from '../lib/roles';
import LoginCard from '../components/LoginCard';

export default function Login() {
  const { user, loading } = useAuth();

  if (!loading && user) {
    return <Navigate to={homePathForRole(user.role)} replace />;
  }

  return (
    <div className="hm-login-page">
      <LoginCard />
    </div>
  );
}
