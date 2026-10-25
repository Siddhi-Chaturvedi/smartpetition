import { Navigate, Outlet, useLocation } from 'react-router-dom'
import { useAuth, homePathFor } from '../context/AuthContext'
import type { Role } from '../lib/types'
import { Spinner } from './States'

export default function ProtectedRoute({ roles }: { roles?: Role[] }) {
  const { user, loading } = useAuth()
  const location = useLocation()

  if (loading) return <Spinner label="Checking your session…" />
  if (!user) return <Navigate to="/login" state={{ from: location.pathname }} replace />
  if (roles && !roles.includes(user.role)) return <Navigate to={homePathFor(user)} replace />
  return <Outlet />
}
