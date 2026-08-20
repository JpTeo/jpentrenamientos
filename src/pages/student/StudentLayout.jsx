import { Outlet } from 'react-router-dom'
import { useAuth } from '../../contexts/useAuth'

export default function StudentLayout() {
  const { profile, signOut } = useAuth()

  return (
    <div className="min-h-screen bg-slate-50">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-2xl items-center justify-between px-4 py-3">
          <div>
            <p className="text-lg font-semibold text-slate-900">Hola, {profile?.name}</p>
            <p className="text-xs text-slate-500">Tus planificaciones</p>
          </div>
          <button
            onClick={signOut}
            className="rounded-lg px-3 py-1.5 text-sm font-medium text-slate-600 hover:bg-slate-100"
          >
            Salir
          </button>
        </div>
      </header>
      <main className="mx-auto max-w-2xl px-4 py-6">
        <Outlet />
      </main>
    </div>
  )
}
