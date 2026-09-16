import { useEffect, useMemo, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { collection, query, where, onSnapshot } from 'firebase/firestore'
import { ArrowRight, CalendarDays, ChevronLeft } from 'lucide-react'
import { db } from '../../firebase/config'
import { useAuth } from '../../contexts/useAuth'
import { countExercises } from '../../lib/planItems'
import { groupPlansByTitle } from '../../lib/planGroups'

function formatDate(ts) {
  if (!ts?.seconds) return ''
  return new Date(ts.seconds * 1000).toLocaleDateString('es-AR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  })
}

export default function MyPlanGroup() {
  const { groupKey } = useParams()
  const { user } = useAuth()
  const [plans, setPlans] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const q = query(collection(db, 'plans'), where('studentId', '==', user.uid))
    const unsub = onSnapshot(q, (snap) => {
      setPlans(snap.docs.map((d) => ({ id: d.id, ...d.data() })))
      setLoading(false)
    })
    return unsub
  }, [user.uid])

  const decodedKey = decodeURIComponent(groupKey || '').toLowerCase()
  const group = useMemo(() => {
    const groups = groupPlansByTitle(plans)
    return groups.find((g) => g.groupTitle.toLowerCase() === decodedKey)
  }, [plans, decodedKey])

  return (
    <section className="mt-12 max-w-3xl">
      <Link
        to="/alumno/planificaciones"
        className="mb-8 flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground"
      >
        <ChevronLeft className="size-4" aria-hidden="true" /> Volver a planificaciones
      </Link>

      {loading ? (
        <p className="text-sm text-muted-foreground">Cargando…</p>
      ) : !group ? (
        <p className="text-sm text-muted-foreground">No se encontró esta planificación.</p>
      ) : (
        <>
          <p className="font-mono text-xs tracking-[0.2em] text-accent-foreground uppercase">
            Tu plan
          </p>
          <h1 className="mt-3 text-4xl font-semibold tracking-tight">{group.groupTitle}</h1>
          <p className="mt-3 text-muted-foreground">
            Elegí el día que vas a entrenar hoy.
          </p>

          <div className="mt-10 flex flex-col gap-3">
            {group.plans.map((plan) => (
              <Link
                key={plan.id}
                to={`/alumno/planificaciones/${plan.id}`}
                className="group flex items-center gap-4 rounded-xl border border-border bg-card p-4 text-left transition-colors hover:bg-muted"
              >
                <div className="flex size-12 shrink-0 items-center justify-center rounded-lg bg-primary text-primary-foreground">
                  <CalendarDays className="size-5" aria-hidden="true" />
                </div>
                <div className="flex-1">
                  <p className="font-medium">{plan.dayLabel || plan.title}</p>
                  <p className="mt-1 text-sm text-muted-foreground">
                    {countExercises(plan.items)} ejercicios
                  </p>
                  {plan.completionCount > 0 && (
                    <p className="mt-0.5 text-xs text-primary">
                      Hecha {plan.completionCount} {plan.completionCount === 1 ? 'vez' : 'veces'}
                      {plan.lastCompletedAt && ` · última vez ${formatDate(plan.lastCompletedAt)}`}
                    </p>
                  )}
                </div>
                <ArrowRight
                  className="size-4 text-muted-foreground transition-transform group-hover:translate-x-1"
                  aria-hidden="true"
                />
              </Link>
            ))}
          </div>
        </>
      )}
    </section>
  )
}
