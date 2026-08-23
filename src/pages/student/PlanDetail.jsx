import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { doc, onSnapshot } from 'firebase/firestore'
import { Activity, Check, ChevronLeft, Dumbbell } from 'lucide-react'
import { db } from '../../firebase/config'
import { normalizeItem } from '../../lib/planItems'

function CompleteButton({ completed, onToggle, label }) {
  return (
    <button
      type="button"
      onClick={onToggle}
      className={`mt-6 w-full rounded-lg py-2.5 text-sm font-medium transition-colors ${
        completed
          ? 'bg-secondary text-secondary-foreground'
          : 'bg-primary text-primary-foreground hover:brightness-105'
      }`}
    >
      {completed ? (
        <span className="inline-flex items-center gap-1.5">
          <Check className="size-4" aria-hidden="true" /> {label} completado
        </span>
      ) : (
        `Terminé el ${label.toLowerCase()}`
      )}
    </button>
  )
}

function ExerciseCard({ exercise, valueLabel, completed, footer }) {
  const isTime = exercise.mode === 'time'
  const gridCols = isTime
    ? 'grid-cols-[68px_1fr_1fr_1fr] sm:grid-cols-[84px_1fr_1fr_1fr]'
    : 'grid-cols-[68px_1fr_1fr] sm:grid-cols-[84px_1fr_1fr]'

  return (
    <article
      className={`rounded-2xl border bg-card p-5 transition-colors sm:p-6 ${
        completed ? 'border-primary/50' : 'border-border'
      }`}
    >
      <div className="flex items-start gap-4">
        {exercise.imageUrl ? (
          <img
            src={exercise.imageUrl}
            alt={`Demostración de ${exercise.name}`}
            className="size-16 shrink-0 rounded-full object-cover ring-2 ring-border sm:size-20"
          />
        ) : (
          <div className="flex size-16 shrink-0 items-center justify-center rounded-full bg-muted ring-2 ring-border sm:size-20">
            <Dumbbell className="size-6 text-muted-foreground" aria-hidden="true" />
          </div>
        )}
        <div className="min-w-0 flex-1">
          <h2 className="text-lg leading-tight font-semibold sm:text-xl">{exercise.name}</h2>
          {exercise.notes && (
            <p className="mt-2 text-sm leading-6 text-muted-foreground">{exercise.notes}</p>
          )}
        </div>
      </div>

      {exercise.tempo && (
        <div className="mt-6 flex items-center gap-3 border-y border-border/70 py-4 text-primary">
          <Activity className="size-5" aria-hidden="true" />
          <span className="text-sm font-medium">Ritmo: {exercise.tempo}</span>
        </div>
      )}

      <div
        className={`mt-5 grid ${gridCols} gap-3 text-center text-xs font-medium tracking-wider text-muted-foreground uppercase sm:gap-4`}
      >
        <span className="text-left">{valueLabel}</span>
        <span>{isTime ? 'Tiempo' : 'Reps'}</span>
        {isTime && <span>Descanso</span>}
        <span>Kg</span>
      </div>
      <div className="mt-3 flex flex-col gap-3">
        {exercise.values.map((v, i) => (
          <div key={i} className={`grid ${gridCols} items-center gap-3 sm:gap-4`}>
            <div className="flex h-12 items-center justify-center rounded-xl bg-muted text-lg font-semibold">
              {i + 1}
            </div>
            <div className="flex h-12 items-center justify-center rounded-xl border border-border font-mono text-lg">
              {v || '—'}
            </div>
            {isTime && (
              <div className="flex h-12 items-center justify-center rounded-xl border border-border font-mono text-lg">
                {exercise.rests[i] || '—'}
              </div>
            )}
            <div className="flex h-12 items-center justify-center rounded-xl border border-border font-mono text-lg">
              {exercise.weights[i] || '—'}
            </div>
          </div>
        ))}
      </div>
      {footer}
    </article>
  )
}

export default function PlanDetail() {
  const { id } = useParams()
  const [plan, setPlan] = useState(null)
  const [loading, setLoading] = useState(true)
  const [completed, setCompleted] = useState(new Set())

  useEffect(() => {
    const unsub = onSnapshot(doc(db, 'plans', id), (snap) => {
      setPlan(snap.exists() ? { id: snap.id, ...snap.data() } : null)
      setLoading(false)
    })
    return unsub
  }, [id])

  function toggleComplete(key) {
    setCompleted((prev) => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }

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
  const total = blocks.length

  return (
    <section className="mt-10 max-w-3xl">
      <Link
        to="/alumno/planificaciones"
        className="mb-8 flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground"
      >
        <ChevronLeft className="size-4" aria-hidden="true" /> Volver a planificaciones
      </Link>
      <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">{plan.title}</h1>
      {total > 0 && (
        <p className="mt-3 text-sm text-muted-foreground">
          {completed.size} de {total} completados
        </p>
      )}

      <div className="mt-8 flex flex-col gap-5">
        {blocks.map((block, index) =>
          block.type === 'circuit' ? (
            <div key={index} className="rounded-2xl border-2 border-border bg-card/40 p-4 sm:p-5">
              <div className="mb-4 flex items-baseline justify-between">
                <p className="font-semibold">{block.name || 'Circuito'}</p>
                <span className="text-sm text-muted-foreground">{block.rounds} rondas</span>
              </div>
              <div className="flex flex-col gap-4">
                {block.exercises.map((ex, exIndex) => (
                  <ExerciseCard
                    key={exIndex}
                    exercise={ex}
                    valueLabel="Ronda"
                    completed={completed.has(String(index))}
                  />
                ))}
              </div>
              {block.notes && <p className="mt-4 text-sm text-muted-foreground">{block.notes}</p>}
              <CompleteButton
                completed={completed.has(String(index))}
                onToggle={() => toggleComplete(String(index))}
                label="Circuito"
              />
            </div>
          ) : (
            <ExerciseCard
              key={index}
              exercise={block}
              valueLabel="Serie"
              completed={completed.has(String(index))}
              footer={
                <CompleteButton
                  completed={completed.has(String(index))}
                  onToggle={() => toggleComplete(String(index))}
                  label="Ejercicio"
                />
              }
            />
          ),
        )}
      </div>
    </section>
  )
}
