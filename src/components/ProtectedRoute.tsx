import { ReactNode } from 'react';
import { Navigate } from 'react-router-dom';
import { Loader2 } from 'lucide-react';

interface ProtectedRouteProps {
  children: ReactNode;
  isAuthenticated: boolean;
  isLoading?: boolean;
  redirectTo?: string;
}

export default function ProtectedRoute({
  children,
  isAuthenticated,
  isLoading = false,
  redirectTo = '/login',
}: ProtectedRouteProps) {

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#0d1117]">
        <Loader2 className="w-8 h-8 animate-spin text-blue-500" />
      </div>
    );
  }

  if (!isAuthenticated) {
    return <Navigate to={redirectTo} replace />;
  }

  return <>{children}</>;
}