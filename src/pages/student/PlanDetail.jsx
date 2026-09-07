import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { addDoc, collection, doc, onSnapshot, serverTimestamp, updateDoc } from 'firebase/firestore'
import { Activity, Check, ChevronLeft, Clock3, Dumbbell, Pencil, X } from 'lucide-react'
import { db } from '../../firebase/config'
import { useAuth } from '../../contexts/useAuth'
import { normalizeItem } from '../../lib/planItems'

function RestBadge({ rest }) {
  return (
    <div className="mt-4 flex items-center justify-center gap-2 rounded-lg border border-primary/30 bg-primary/5 px-3 py-2">
      <Clock3 className="size-3.5 text-primary" aria-hidden="true" />
      <span className="text-xs font-medium text-muted-foreground uppercase">Descanso</span>
      <span className="font-mono text-sm font-semibold text-primary">{rest}</span>
    </div>
  )
}

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

function ImageLightbox({ src, alt, onClose }) {
  useEffect(() => {
    function onKeyDown(e) {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [onClose])

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4"
      onClick={onClose}
    >
      <button
        type="button"
        onClick={onClose}
        aria-label="Cerrar"
        className="absolute top-4 right-4 rounded-full bg-black/40 p-2 text-white hover:bg-black/60"
      >
        <X className="size-5" aria-hidden="true" />
      </button>
      <img
        src={src}
        alt={alt}
        onClick={(e) => e.stopPropagation()}
        className="max-h-full max-w-full rounded-lg object-contain"
      />
    </div>
  )
}

function ExerciseCard({ exercise, valueLabel, completed, footer, onSendComment, onSaveWeights }) {
  const isTime = exercise.mode === 'time'
  const [imageOpen, setImageOpen] = useState(false)
  const [editing, setEditing] = useState(false)
  const [weightDrafts, setWeightDrafts] = useState(exercise.weights)
  const [comment, setComment] = useState('')
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [saveError, setSaveError] = useState('')
  const canEdit = Boolean(onSaveWeights || onSendComment)

  function startEditing() {
    setWeightDrafts(exercise.weights)
    setComment('')
    setSaved(false)
    setSaveError('')
    setEditing(true)
  }

  function updateWeightDraft(i, value) {
    setWeightDrafts((prev) => prev.map((w, wi) => (wi === i ? value : w)))
  }

  async function handleSave() {
    setSaving(true)
    setSaveError('')
    try {
      const weightsChanged = weightDrafts.some((w, i) => w !== exercise.weights[i])
      if (weightsChanged && onSaveWeights) await onSaveWeights(weightDrafts)
      if (comment.trim() && onSendComment) await onSendComment(comment.trim())
      setEditing(false)
      setSaved(true)
    } catch {
      setSaveError('No se pudo guardar. Probá de nuevo.')
    } finally {
      setSaving(false)
    }
  }

  const gridCols = isTime
    ? 'grid-cols-[68px_1fr_1fr_1fr] sm:grid-cols-[84px_1fr_1fr_1fr]'
    : 'grid-cols-[68px_1fr_1fr] sm:grid-cols-[84px_1fr_1fr]'

  return (
    <article
      className={`relative rounded-2xl border bg-card p-5 transition-colors sm:p-6 ${
        completed ? 'border-primary/50' : 'border-border'
      }`}
    >
      <div className="flex items-center gap-4">
        {exercise.imageUrl ? (
          <>
            <button
              type="button"
              onClick={() => setImageOpen(true)}
              aria-label={`Ver imagen de ${exercise.name} en grande`}
              className="flex size-16 shrink-0 items-center justify-center rounded-2xl bg-white ring-2 ring-border sm:size-20"
            >
              <img
                src={exercise.imageUrl}
                alt={`Demostración de ${exercise.name}`}
                className="size-full cursor-pointer rounded-2xl object-contain p-1"
              />
            </button>
            {imageOpen && (
              <ImageLightbox
                src={exercise.imageUrl}
                alt={`Demostración de ${exercise.name}`}
                onClose={() => setImageOpen(false)}
              />
            )}
          </>
        ) : (
          <div className="flex size-16 shrink-0 items-center justify-center rounded-2xl bg-muted ring-2 ring-border sm:size-20">
            <Dumbbell className="size-6 text-muted-foreground" aria-hidden="true" />
          </div>
        )}
        <div className="min-w-0 flex-1">
          <h2 className="text-lg leading-tight font-semibold sm:text-xl">{exercise.name}</h2>
          {exercise.notes && (
            <p className="mt-2 text-sm leading-6 text-muted-foreground">{exercise.notes}</p>
          )}
        </div>
        {canEdit && (
          <button
            type="button"
            onClick={() => (editing ? setEditing(false) : startEditing())}
            aria-label="Editar pesos y dejar un comentario"
            className={`shrink-0 rounded-full p-2 hover:bg-muted ${
              editing ? 'bg-muted text-foreground' : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            <Pencil className="size-4" aria-hidden="true" />
          </button>
        )}
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
              {editing ? (
                <input
                  value={weightDrafts[i] ?? ''}
                  onChange={(e) => updateWeightDraft(i, e.target.value)}
                  placeholder="Kg"
                  className="h-full w-full rounded-lg bg-transparent text-center outline-none"
                />
              ) : (
                exercise.weights[i] || '—'
              )}
            </div>
          </div>
        ))}
      </div>

      {editing && (
        <div className="mt-5 space-y-2 border-t border-border/70 pt-4">
          <label className="text-xs font-medium tracking-wider text-muted-foreground uppercase">
            Mensaje para tu profe (opcional)
          </label>
          <textarea
            value={comment}
            onChange={(e) => setComment(e.target.value)}
            rows={3}
            placeholder="Contale a tu profe algo sobre este ejercicio..."
            className="w-full rounded-lg border border-border bg-background px-2 py-1.5 text-sm outline-none focus:border-primary"
          />
          {saveError && <p className="text-xs text-red-500">{saveError}</p>}
          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={() => setEditing(false)}
              className="rounded-lg px-3 py-1.5 text-xs font-medium text-muted-foreground hover:bg-muted"
            >
              Cancelar
            </button>
            <button
              type="button"
              onClick={handleSave}
              disabled={saving}
              className="rounded-lg bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground disabled:opacity-60"
            >
              {saving ? 'Guardando…' : 'Guardar'}
            </button>
          </div>
        </div>
      )}
      {saved && !editing && <p className="mt-2 text-right text-[11px] text-primary">Guardado ✓</p>}

      {footer}
    </article>
  )
}

export default function PlanDetail() {
  const { id } = useParams()
  const { user, profile } = useAuth()
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

  async function handleSaveWeights(blockIndex, exIndex, newWeights) {
    const blocks = (plan.items || []).map(normalizeItem)
    const nextBlocks = blocks.map((block, i) => {
      if (i !== blockIndex) return block
      if (exIndex === null) return { ...block, weights: newWeights }
      return {
        ...block,
        exercises: block.exercises.map((ex, j) =>
          j === exIndex ? { ...ex, weights: newWeights } : ex,
        ),
      }
    })
    await updateDoc(doc(db, 'plans', plan.id), {
      items: nextBlocks,
      updatedAt: serverTimestamp(),
    })
  }

  async function handleSendComment(exerciseName, message) {
    await addDoc(collection(db, 'exerciseComments'), {
      coachId: plan.coachId,
      studentId: user.uid,
      studentName: profile?.name ?? '',
      planId: plan.id,
      planTitle: plan.title ?? '',
      exerciseName,
      message,
      read: false,
      createdAt: serverTimestamp(),
    })
  }

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
                    onSendComment={(message) => handleSendComment(ex.name, message)}
                    onSaveWeights={(weights) => handleSaveWeights(index, exIndex, weights)}
                  />
                ))}
              </div>
              {block.notes && <p className="mt-4 text-sm text-muted-foreground">{block.notes}</p>}
              {block.rest && <RestBadge rest={block.rest} />}
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
              onSendComment={(message) => handleSendComment(block.name, message)}
              onSaveWeights={(weights) => handleSaveWeights(index, null, weights)}
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
