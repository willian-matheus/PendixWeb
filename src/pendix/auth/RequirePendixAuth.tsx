import { Navigate, useLocation } from 'react-router';
import { useAuth } from '../../app/auth/AuthProvider';

export function RequirePendixAuth({ children }: { children: React.ReactNode }) {
  const { token, user, loading } = useAuth();
  const location = useLocation();

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#06000f]">
        <div className="w-8 h-8 border-2 border-purple-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (!token || !user) {
    return <Navigate to="/pendix/login" state={{ from: location.pathname }} replace />;
  }

  return <>{children}</>;
}
