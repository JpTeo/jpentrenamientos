import { useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { doc, onSnapshot, serverTimestamp, setDoc } from 'firebase/firestore'
import { Check, ChevronLeft, Trophy } from 'lucide-react'
import { db } from '../../firebase/config'
import { useAuth } from '../../contexts/useAuth'
import { normalizeItem } from '../../lib/planItems'
import { formatShortDate, isExpired, pointsLabel } from '../../lib/challenges'
import { useWorkoutProgress } from '../../hooks/useWorkoutProgress'
import { CompleteButton, ExerciseCard, RestBadge, RestTimer } from '../../components/WorkoutParts'

// status: 'saving' | 'ok' | 'error' | 'already'
function ChallengeCompleteOverlay({ status, points, onClose }) {
  return (
    <div className="fixed inset-0 z-50 flex flex-col items-center justify-center gap-5 bg-black/85 p-6 text-center text-white">
      <div className="flex size-20 items-center justify-center rounded-full bg-primary text-primary-foreground">
        <Trophy className="size-10" aria-hidden="true" />
      </div>
      <div>
        <p className="text-2xl font-semibold">¡Desafío completado!</p>
        <p className="mt-2 text-sm text-white/70">
          {status === 'saving' && 'Registrando tus puntos…'}
          {status === 'ok' && `Sumaste ${pointsLabel(points)}. ¡Buen trabajo!`}
          {status === 'already' && 'Ya habías sumado los puntos de este desafío.'}
          {status === 'error' && 'No se pudieron registrar los puntos. Avisale a tu profe.'}
        </p>
      </div>
      <button
        type="button"
        onClick={onClose}
        disabled={status === 'saving'}
        className="rounded-lg bg-white px-5 py-2 text-sm font-medium text-black disabled:opacity-60"
      >
        Volver a desafíos
      </button>
    </div>
  )
}

export default function ChallengeDetail() {
  const { id } = useParams()
  const navigate = useNavigate()
  const { user, profile } = useAuth()
  const [challenge, setChallenge] = useState(null)
  const [loading, setLoading] = useState(true)
  const [alreadyDone, setAlreadyDone] = useState(null)
  const { completed, checkedSets, timer, closeTimer, toggleComplete, toggleSet } =
    useWorkoutProgress()
  const [awardStatus, setAwardStatus] = useState(null)
  const [completionRecorded, setCompletionRecorded] = useState(false)

  useEffect(() => {
    return onSnapshot(doc(db, 'challenges', id), (snap) => {
      setChallenge(snap.exists() ? { id: snap.id, ...snap.data() } : null)
      setLoading(false)
    })
  }, [id])

  // One completion doc per (challenge, student): its existence is the "done" flag.
  useEffect(() => {
    return onSnapshot(doc(db, 'challengeCompletions', `${id}_${user.uid}`), (snap) =>
      setAlreadyDone(snap.exists()),
    )
  }, [id, user.uid])

  // Once every block is marked done, award the points (only the first time).
  useEffect(() => {
    if (!challenge || alreadyDone === null) return
    const total = (challenge.items || []).length
    if (total > 0 && completed.size === total && !completionRecorded) {
      setCompletionRecorded(true)
      if (alreadyDone) {
        setAwardStatus('already')
        return
      }
      setAwardStatus('saving')
      setDoc(doc(db, 'challengeCompletions', `${challenge.id}_${user.uid}`), {
        challengeId: challenge.id,
        challengeTitle: challenge.title,
        points: challenge.points,
        studentId: user.uid,
        studentName: profile?.name ?? '',
        coachId: challenge.coachId,
        createdAt: serverTimestamp(),
      })
        .then(() => setAwardStatus('ok'))
        .catch(() => setAwardStatus('error'))
    }
  }, [completed, challenge, alreadyDone, completionRecorded, user.uid, profile?.name])

  if (loading || alreadyDone === null) {
    return <p className="mt-12 text-sm text-muted-foreground">Cargando…</p>
  }

  const back = (
    <Link
      to="/alumno/desafios"
      className="mb-8 flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground"
    >
      <ChevronLeft className="size-4" aria-hidden="true" /> Volver a desafíos
    </Link>
  )

  if (!challenge) {
    return (
      <section className="mt-12 max-w-3xl">
        {back}
        <p className="text-sm text-muted-foreground">No se encontró el desafío.</p>
      </section>
    )
  }

  if (!alreadyDone && (!challenge.active || isExpired(challenge.endDate))) {
    return (
      <section className="mt-12 max-w-3xl">
        {back}
        <h1 className="text-3xl font-semibold tracking-tight">{challenge.title}</h1>
        <p className="mt-4 text-sm text-muted-foreground">Este desafío ya no está disponible.</p>
      </section>
    )
  }

  const blocks = (challenge.items || []).map(normalizeItem)

  return (
    <section className="mt-10 max-w-3xl">
      {back}
      <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">{challenge.title}</h1>
      <p className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-muted-foreground">
        <span className="font-semibold text-primary">+{pointsLabel(challenge.points)}</span>
        {challenge.endDate && <span>hasta el {formatShortDate(challenge.endDate)}</span>}
        <span>
          {completed.size} de {blocks.length} completados
        </span>
      </p>
      {challenge.description && (
        <p className="mt-3 text-sm leading-6 whitespace-pre-line text-muted-foreground">
          {challenge.description}
        </p>
      )}
      {alreadyDone && (
        <p className="mt-4 inline-flex items-center gap-1.5 rounded-lg bg-primary/10 px-3 py-2 text-sm text-primary">
          <Check className="size-4" aria-hidden="true" /> Ya completaste este desafío y sumaste tus
          puntos.
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
      {awardStatus && (
        <ChallengeCompleteOverlay
          status={awardStatus}
          points={challenge.points}
          onClose={() => navigate('/alumno/desafios')}
        />
      )}
    </section>
  )
}
