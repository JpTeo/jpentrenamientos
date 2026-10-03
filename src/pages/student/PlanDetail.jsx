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
import { Check, ChevronLeft } from 'lucide-react'
import { db } from '../../firebase/config'
import { useAuth } from '../../contexts/useAuth'
import { normalizeItem } from '../../lib/planItems'
import { useWorkoutProgress } from '../../hooks/useWorkoutProgress'
import { CompleteButton, ExerciseCard, RestBadge, RestTimer } from '../../components/WorkoutParts'
import { TimedCircuitStart } from '../../components/CircuitRunner'

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

export default function PlanDetail() {
  const { id } = useParams()
  const navigate = useNavigate()
  const { user, profile } = useAuth()
  const [plan, setPlan] = useState(null)
  const [loading, setLoading] = useState(true)
  const {
    completed,
    checkedSets,
    timer,
    closeTimer,
    toggleComplete,
    toggleSet,
    markCircuitDone,
  } = useWorkoutProgress()
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
      addDoc(collection(db, 'planCompletions'), {
        studentId: user.uid,
        studentName: profile?.name ?? '',
        coachId: plan.coachId,
        planId: plan.id,
        planTitle: plan.title ?? '',
        read: false,
        completedAt: serverTimestamp(),
      }).catch(() => {})
    } else if (completed.size < total && completionRecorded) {
      setCompletionRecorded(false)
    }
  }, [completed, plan, completionRecorded, user.uid, profile?.name])

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
              <TimedCircuitStart block={block} onFinish={() => markCircuitDone(index, block)} />
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
          onClose={closeTimer}
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
