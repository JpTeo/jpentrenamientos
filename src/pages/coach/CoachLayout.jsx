import { NavLink, Outlet } from 'react-router-dom'
import { useAuth } from '../../contexts/useAuth'

const linkClass = ({ isActive }) =>
  `rounded-lg px-3 py-2 text-sm font-medium ${
    isActive ? 'bg-slate-900 text-white' : 'text-slate-600 hover:bg-slate-100'
  }`

export default function CoachLayout() {
  const { profile, signOut } = useAuth()

  return (
    <div className="min-h-screen bg-slate-50">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-4xl items-center justify-between px-4 py-3">
          <div className="flex items-center gap-2">
            <span className="text-lg font-semibold text-slate-900">Planificaciones</span>
            <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-500">
              Panel del profe
            </span>
          </div>
          <div className="flex items-center gap-3">
            <span className="hidden text-sm text-slate-500 sm:inline">{profile?.name}</span>
            <button
              onClick={signOut}
              className="rounded-lg px-3 py-1.5 text-sm font-medium text-slate-600 hover:bg-slate-100"
            >
              Salir
            </button>
          </div>
        </div>
        <nav className="mx-auto flex max-w-4xl gap-1 px-4 pb-3">
          <NavLink to="/coach/planificaciones" className={linkClass}>
            Planificaciones
          </NavLink>
          <NavLink to="/coach/alumnos" className={linkClass}>
            Alumnos
          </NavLink>
          <NavLink to="/coach/ejercicios" className={linkClass}>
            Ejercicios
          </NavLink>
        </nav>
      </header>
      <main className="mx-auto max-w-4xl px-4 py-6">
        <Outlet />
      </main>
    </div>
  )
}
