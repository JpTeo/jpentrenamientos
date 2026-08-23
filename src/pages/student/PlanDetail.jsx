import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { doc, onSnapshot } from 'firebase/firestore'
import { ChevronLeft } from 'lucide-react'
import { db } from '../../firebase/config'
import { normalizeItem } from '../../lib/planItems'

function ExerciseCard({ ex, valueLabel }) {
  return (
    <div className="flex gap-4 rounded-2xl border border-border bg-card p-4">
      <div className="h-20 w-20 shrink-0 overflow-hidden rounded-xl bg-muted">
        {ex.imageUrl ? (
          <img src={ex.imageUrl} alt={ex.name} className="h-full w-full object-cover" />
        ) : (
          <div className="flex h-full w-full items-center justify-center text-xs text-muted-foreground">
            Sin imagen
          </div>
        )}
      </div>
      <div className="flex-1">
        <p className="font-medium">{ex.name}</p>
        {(ex.values.some((v) => v) || ex.weights.some((w) => w)) && (
          <div className="mt-1 flex flex-wrap gap-1.5">
            {ex.values.map((v, i) => {
              const w = ex.weights[i]
              if (!v && !w) return null
              const parts = []
              if (v) parts.push(`${v}${ex.mode === 'reps' ? ' reps' : ''}`)
              if (w) parts.push(w)
              return (
                <span
                  key={i}
                  className="rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground"
                >
                  {valueLabel} {i + 1}: {parts.join(' · ')}
                </span>
              )
            })}
          </div>
        )}
        {ex.tempo && <p className="mt-1 text-sm text-muted-foreground">Ritmo: {ex.tempo}</p>}
        {ex.notes && <p className="mt-1 text-sm text-muted-foreground">{ex.notes}</p>}
      </div>
    </div>
  )
}

export default function PlanDetail() {
  const { id } = useParams()
  const [plan, setPlan] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const unsub = onSnapshot(doc(db, 'plans', id), (snap) => {
      setPlan(snap.exists() ? { id: snap.id, ...snap.data() } : null)
      setLoading(false)
    })
    return unsub
  }, [id])

  if (loading) return <p className="mt-12 text-sm text-muted-foreground">Cargando…</p>

  if (!plan) {
    return (
      <section className="mt-12 max-w-3xl space-y-4">
        <p className="text-sm text-muted-foreground">No se encontró la planificación.</p>
        <Link to="/alumno/planificaciones" className="text-sm font-medium underline">
          Volver
        </Link>
      </section>
    )
  }

  const blocks = (plan.items || []).map(normalizeItem)

  return (
    <section className="mt-12 max-w-3xl">
      <Link
        to="/alumno/planificaciones"
        className="mb-8 flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground"
      >
        <ChevronLeft className="size-4" aria-hidden="true" /> Volver a planificaciones
      </Link>
      <h1 className="text-4xl font-semibold tracking-tight">{plan.title}</h1>
      <div className="mt-8 space-y-3">
        {blocks.map((block, index) =>
          block.type === 'circuit' ? (
            <div key={index} className="rounded-2xl border-2 border-border bg-card/60 p-4">
              <div className="mb-3 flex items-baseline justify-between">
                <p className="font-semibold">{block.name || 'Circuito'}</p>
                <span className="text-sm text-muted-foreground">{block.rounds} rondas</span>
              </div>
              <div className="space-y-3">
                {block.exercises.map((ex, exIndex) => (
                  <ExerciseCard key={exIndex} ex={ex} valueLabel="Ronda" />
                ))}
              </div>
              {block.notes && <p className="mt-3 text-sm text-muted-foreground">{block.notes}</p>}
            </div>
          ) : (
            <ExerciseCard key={index} ex={block} valueLabel="Serie" />
          ),
        )}
      </div>
    </section>
  )
}
