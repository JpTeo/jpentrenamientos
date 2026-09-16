import { useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import {
  addDoc,
  collection,
  doc,
  increment,
  onSnapshot,
  serverTimestamp,
  updateDoc,
} from 'firebase/firestore'
import { Activity, Check, ChevronLeft, Clock3, Dumbbell, Pencil, X } from 'lucide-react'
import { db } from '../../firebase/config'
import { useAuth } from '../../contexts/useAuth'
import { normalizeItem } from '../../lib/planItems'
import { parseRestSeconds, formatSeconds } from '../../lib/restTime'

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

// Full-screen rest countdown. Remounted (via a fresh `key` from the caller)
// each time a new timer starts, so its own internal countdown always begins
// clean at `seconds`.
function RestTimer({ seconds, label, onClose }) {
  const [remaining, setRemaining] = useState(seconds)

  useEffect(() => {
    if (remaining <= 0) {
      const t = setTimeout(onClose, 700)
      return () => clearTimeout(t)
    }
    const t = setTimeout(() => setRemaining((r) => r - 1), 1000)
    return () => clearTimeout(t)
  }, [remaining, onClose])

  return (
    <div className="fixed inset-0 z-50 flex flex-col items-center justify-center gap-6 bg-black/85 p-6 text-white">
      <p className="text-xs font-medium tracking-[0.3em] text-white/60 uppercase">Descanso</p>
      {label && <p className="text-lg font-medium">{label}</p>}
      <p className="font-mono text-7xl font-bold tabular-nums">{formatSeconds(remaining)}</p>
      <button
        type="button"
        onClick={onClose}
        className="rounded-full border border-white/30 px-5 py-2 text-sm font-medium hover:bg-white/10"
      >
        Saltar
      </button>
    </div>
  )
}

function formatDate(ts) {
  if (!ts?.seconds) return ''
  return new Date(ts.seconds * 1000).toLocaleDateString('es-AR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  })
}

// Shown once every block on the plan is marked complete. The completion
// count/date is already saved by the time this renders — this is just the
// celebratory screen with an optional closing comment for the coach.
function CompletionOverlay({ onSendComment, onClose }) {
  const [comment, setComment] = useState('')
  const [sending, setSending] = useState(false)
  const [sent, setSent] = useState(false)

  async function handleSend() {
    if (!comment.trim()) {
      onClose()
      return
    }
    setSending(true)
    try {
      await onSendComment(comment.trim())
      setSent(true)
      setTimeout(onClose, 1000)
    } catch {
      setSending(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex flex-col items-center justify-center gap-5 bg-black/85 p-6 text-center text-white">
      <div className="flex size-20 items-center justify-center rounded-full bg-primary text-primary-foreground">
        <Check className="size-10" aria-hidden="true" />
      </div>
      <div>
        <p className="text-2xl font-semibold">¡Planificación completada!</p>
        <p className="mt-1 text-sm text-white/70">Buen trabajo, quedó registrada.</p>
      </div>
      {sent ? (
        <p className="text-sm text-white/90">Mensaje enviado ✓</p>
      ) : (
        <div className="w-full max-w-sm space-y-2 text-left">
          <textarea
            value={comment}
            onChange={(e) => setComment(e.target.value)}
            rows={3}
            placeholder="Dejale un comentario a tu profe sobre esta sesión (opcional)"
            className="w-full rounded-lg border border-white/20 bg-white/10 px-3 py-2 text-sm text-white outline-none placeholder:text-white/50 focus:border-white/50"
          />
          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg px-3 py-1.5 text-xs font-medium text-white/70 hover:bg-white/10"
            >
              Cerrar
            </button>
            <button
              type="button"
              onClick={handleSend}
              disabled={sending}
              className="rounded-lg bg-white px-4 py-1.5 text-xs font-medium text-black disabled:opacity-60"
            >
              {sending ? 'Enviando…' : comment.trim() ? 'Enviar y cerrar' : 'Cerrar'}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

function ExerciseCard({
  exercise,
  valueLabel,
  completed,
  footer,
  onSendComment,
  onSaveWeights,
  checkedSets,
  onToggleSet,
}) {
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

  const gridCols = 'grid-cols-[68px_1fr_1fr_1fr] sm:grid-cols-[84px_1fr_1fr_1fr]'

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
        <span>Descanso</span>
        <span>Kg</span>
      </div>
      <div className="mt-3 flex flex-col gap-3">
        {exercise.values.map((v, i) => {
          const isChecked = Boolean(checkedSets?.[i])
          return (
            <div key={i} className={`grid ${gridCols} items-center gap-3 sm:gap-4`}>
              <button
                type="button"
                onClick={() => onToggleSet?.(i)}
                aria-label={`${valueLabel} ${i + 1}${isChecked ? ', hecha' : ''}`}
                className={`flex h-12 items-center justify-center rounded-xl text-lg font-semibold transition-colors ${
                  isChecked
                    ? 'bg-primary text-primary-foreground'
                    : 'bg-muted text-foreground hover:bg-muted/70'
                }`}
              >
                {isChecked ? <Check className="size-5" aria-hidden="true" /> : i + 1}
              </button>
              <div className="flex h-12 items-center justify-center rounded-xl border border-border font-mono text-lg">
                {v || '—'}
              </div>
              <div className="flex h-12 items-center justify-center rounded-xl border border-border font-mono text-lg">
                {exercise.rests[i] || '—'}
              </div>
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
          )
        })}
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
  const navigate = useNavigate()
  const { user, profile } = useAuth()
  const [plan, setPlan] = useState(null)
  const [loading, setLoading] = useState(true)
  const [completed, setCompleted] = useState(new Set())
  const [checkedSets, setCheckedSets] = useState({})
  const [timer, setTimer] = useState(null)
  const [showCompletion, setShowCompletion] = useState(false)
  const [completionRecorded, setCompletionRecorded] = useState(false)

  useEffect(() => {
    const unsub = onSnapshot(doc(db, 'plans', id), (snap) => {
      setPlan(snap.exists() ? { id: snap.id, ...snap.data() } : null)
      setLoading(false)
    })
    return unsub
  }, [id])

  // Fires once every block just became completed: records the count/date on
  // the plan right away (so it's saved even if the student closes the
  // celebration without leaving a comment), and un-arms itself if they
  // uncheck something, so completing it again later counts as a new visit.
  useEffect(() => {
    if (!plan) return
    const total = (plan.items || []).length
    if (total > 0 && completed.size === total && !completionRecorded) {
      setCompletionRecorded(true)
      setShowCompletion(true)
      updateDoc(doc(db, 'plans', plan.id), {
        completionCount: increment(1),
        lastCompletedAt: serverTimestamp(),
      }).catch(() => {})
    } else if (completed.size < total && completionRecorded) {
      setCompletionRecorded(false)
    }
  }, [completed, plan, completionRecorded])

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

  async function handleSendPlanComment(message) {
    await handleSendComment('Planificación completa', message)
  }

  function toggleComplete(key) {
    setCompleted((prev) => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }

  function startTimer(seconds, label) {
    setTimer({ id: Date.now(), seconds, label })
  }

  // For a standalone exercise (exIndex === null), `block` is the exercise
  // itself and its own per-set rest kicks off the timer right away. Inside a
  // circuit, `block` is the circuit and the timer only fires once every
  // exercise has that same round checked — using the circuit's shared
  // "descanso entre rondas".
  function toggleSet(blockIndex, exIndex, setIndex, block) {
    const key = exIndex === null ? `b${blockIndex}` : `b${blockIndex}-e${exIndex}`
    setCheckedSets((prev) => {
      const nextArr = [...(prev[key] || [])]
      nextArr[setIndex] = !nextArr[setIndex]
      const updated = { ...prev, [key]: nextArr }

      if (nextArr[setIndex]) {
        if (exIndex === null) {
          const seconds = parseRestSeconds(block.rests?.[setIndex])
          if (seconds) startTimer(seconds, block.name)
        } else {
          const roundComplete = block.exercises.every((_, j) =>
            Boolean((updated[`b${blockIndex}-e${j}`] || [])[setIndex]),
          )
          if (roundComplete) {
            const seconds = parseRestSeconds(block.rest)
            if (seconds) startTimer(seconds, block.name || 'Circuito')
          }
        }
      }
      return updated
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
      {plan.completionCount > 0 && (
        <p className="mt-1 text-sm text-primary">
          Hecha {plan.completionCount} {plan.completionCount === 1 ? 'vez' : 'veces'}
          {plan.lastCompletedAt && ` · última vez ${formatDate(plan.lastCompletedAt)}`}
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
                    checkedSets={checkedSets[`b${index}-e${exIndex}`]}
                    onToggleSet={(setIndex) => toggleSet(index, exIndex, setIndex, block)}
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
              checkedSets={checkedSets[`b${index}`]}
              onToggleSet={(setIndex) => toggleSet(index, null, setIndex, block)}
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

      {timer && (
        <RestTimer
          key={timer.id}
          seconds={timer.seconds}
          label={timer.label}
          onClose={() => setTimer(null)}
        />
      )}
      {showCompletion && (
        <CompletionOverlay
          onSendComment={handleSendPlanComment}
          onClose={() => navigate('/alumno/planificaciones')}
        />
      )}
    </section>
  )
}
