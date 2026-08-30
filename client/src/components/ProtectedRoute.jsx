import { Navigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { LoadingState } from './States';

export default function ProtectedRoute({ children }) {
  const { merchant, loading } = useAuth();

  if (loading) return <LoadingState label="Checking session..." />;
  if (!merchant) return <Navigate to="/login" replace />;

  return children;
}
