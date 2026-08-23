import { NavLink, Outlet } from 'react-router-dom'
import { Dumbbell, Sparkles, Target, Weight } from 'lucide-react'
import { useAuth } from '../../contexts/useAuth'

function NavItem({ to, icon: Icon, label }) {
  return (
    <NavLink
      to={to}
      end={to === '/alumno'}
      className={({ isActive }) =>
        `flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors ${
          isActive
            ? 'bg-primary text-primary-foreground'
            : 'text-muted-foreground hover:bg-muted hover:text-foreground'
        }`
      }
    >
      <Icon aria-hidden="true" className="size-4" />
      {label}
    </NavLink>
  )
}

export default function StudentLayout() {
  const { profile, signOut } = useAuth()
  const initials = (profile?.name || '?')
    .split(' ')
    .map((p) => p[0])
    .slice(0, 2)
    .join('')
    .toUpperCase()

  return (
    <div className="student-app">
      <div className="mx-auto flex min-h-screen max-w-7xl">
        <aside className="hidden w-64 shrink-0 flex-col border-r border-border/60 px-5 py-7 lg:flex">
          <div className="flex items-center gap-3 px-2">
            <div className="flex size-9 items-center justify-center rounded-lg bg-primary text-primary-foreground">
              <Dumbbell aria-hidden="true" className="size-5" />
            </div>
            <span className="font-mono text-sm font-bold tracking-[0.18em]">PLAN</span>
          </div>
          <div className="mt-14 flex flex-col gap-2">
            <NavItem to="/alumno" icon={Target} label="Resumen" />
            <NavItem to="/alumno/planificaciones" icon={Dumbbell} label="Planificaciones" />
            <NavItem to="/alumno/marcas" icon={Weight} label="Pesos máximos" />
          </div>
          <div className="mt-auto rounded-xl border border-border/60 bg-card p-4">
            <Sparkles className="size-4 text-accent-foreground" aria-hidden="true" />
            <p className="mt-3 text-sm font-medium">Constancia antes que intensidad.</p>
            <p className="mt-1 text-xs leading-5 text-muted-foreground">
              Tu progreso se construye entrenamiento a entrenamiento.
            </p>
          </div>
          <button
            onClick={signOut}
            className="mt-4 rounded-lg px-3 py-2 text-left text-sm text-muted-foreground hover:bg-muted hover:text-foreground"
          >
            Salir
          </button>
        </aside>

        <main className="flex-1 px-5 py-6 sm:px-8 lg:px-12 lg:py-10">
          <header className="flex items-center justify-between">
            <div className="flex items-center gap-3 lg:hidden">
              <div className="flex size-8 items-center justify-center rounded-lg bg-primary text-primary-foreground">
                <Dumbbell className="size-4" aria-hidden="true" />
              </div>
              <span className="font-mono text-xs font-bold tracking-[0.18em]">PLAN</span>
            </div>
            <div className="hidden lg:block">
              <p className="text-xs font-medium tracking-[0.2em] text-muted-foreground uppercase">
                Área del alumno
              </p>
            </div>
            <div className="flex items-center gap-3">
              <div className="flex size-10 items-center justify-center rounded-full border border-border bg-card font-mono text-sm font-bold">
                {initials}
              </div>
              <button
                onClick={signOut}
                className="text-sm text-muted-foreground hover:text-foreground lg:hidden"
              >
                Salir
              </button>
            </div>
          </header>

          <Outlet />
        </main>
      </div>
    </div>
  )
}
