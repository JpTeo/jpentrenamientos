import { Navigate } from 'react-router-dom'
import { useAuth } from '../contexts/useAuth'

export default function ProtectedRoute({ role, children }) {
  const { user, profile, loading } = useAuth()

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center text-slate-400">
        Cargando…
      </div>
    )
  }

  if (!user || !profile) {
    return <Navigate to="/login" replace />
  }

  if (role && profile.role !== role) {
    return <Navigate to={profile.role === 'coach' ? '/coach' : '/alumno'} replace />
  }

  return children
}
