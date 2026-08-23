import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { collection, query, where, onSnapshot } from 'firebase/firestore'
import { ArrowRight, ChevronLeft, Dumbbell } from 'lucide-react'
import { db } from '../../firebase/config'
import { useAuth } from '../../contexts/useAuth'
import { countExercises } from '../../lib/planItems'

export default function MyPlans() {
  const { user } = useAuth()
  const [plans, setPlans] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const q = query(collection(db, 'plans'), where('studentId', '==', user.uid))
    const unsub = onSnapshot(q, (snap) => {
      const list = snap.docs.map((d) => ({ id: d.id, ...d.data() }))
      list.sort((a, b) => (b.createdAt?.seconds ?? 0) - (a.createdAt?.seconds ?? 0))
      setPlans(list)
      setLoading(false)
    })
    return unsub
  }, [user.uid])

  return (
    <section className="mt-12 max-w-3xl">
      <Link
        to="/alumno"
        className="mb-8 flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground"
      >
        <ChevronLeft className="size-4" aria-hidden="true" /> Volver al resumen
      </Link>
      <p className="font-mono text-xs tracking-[0.2em] text-accent-foreground uppercase">
        Tu plan
      </p>
      <h1 className="mt-3 text-4xl font-semibold tracking-tight">Planificaciones</h1>
      <p className="mt-3 text-muted-foreground">Todo lo que te asignó tu profe.</p>

      {loading ? (
        <p className="mt-10 text-sm text-muted-foreground">Cargando…</p>
      ) : plans.length === 0 ? (
        <p className="mt-10 text-sm text-muted-foreground">
          Todavía no tenés planificaciones asignadas.
        </p>
      ) : (
        <div className="mt-10 flex flex-col gap-3">
          {plans.map((p) => (
            <Link
              key={p.id}
              to={`/alumno/planificaciones/${p.id}`}
              className="group flex items-center gap-4 rounded-xl border border-border bg-card p-4 text-left transition-colors hover:bg-muted"
            >
              <div className="flex size-12 shrink-0 items-center justify-center rounded-lg bg-primary text-primary-foreground">
                <Dumbbell className="size-5" aria-hidden="true" />
              </div>
              <div className="flex-1">
                <p className="font-medium">{p.title}</p>
                <p className="mt-1 text-sm text-muted-foreground">
                  {countExercises(p.items)} ejercicios
                </p>
              </div>
              <ArrowRight
                className="size-4 text-muted-foreground transition-transform group-hover:translate-x-1"
                aria-hidden="true"
              />
            </Link>
          ))}
        </div>
      )}
    </section>
  )
}
