import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { collection, onSnapshot, query, where } from 'firebase/firestore'
import { ArrowRight, Check, ChevronLeft, Trophy } from 'lucide-react'
import { db } from '../../firebase/config'
import { useAuth } from '../../contexts/useAuth'
import { countExercises } from '../../lib/planItems'
import {
  formatShortDate,
  formatTimestampDate,
  isExpired,
  pointsLabel,
  totalPoints,
} from '../../lib/challenges'

export default function MyChallenges() {
  const { user, profile } = useAuth()
  const coachId = profile?.createdBy
  const [challenges, setChallenges] = useState([])
  const [completions, setCompletions] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!coachId) return
    const q = query(collection(db, 'challenges'), where('coachId', '==', coachId))
    return onSnapshot(
      q,
      (snap) => {
        setChallenges(snap.docs.map((d) => ({ id: d.id, ...d.data() })))
        setLoading(false)
      },
      () => setLoading(false),
    )
  }, [coachId])

  useEffect(() => {
    const q = query(collection(db, 'challengeCompletions'), where('studentId', '==', user.uid))
    return onSnapshot(q, (snap) => {
      setCompletions(snap.docs.map((d) => ({ id: d.id, ...d.data() })))
    })
  }, [user.uid])

  const completedIds = useMemo(() => new Set(completions.map((c) => c.challengeId)), [completions])

  const available = useMemo(() => {
    return challenges
      .filter((c) => c.active && !isExpired(c.endDate) && !completedIds.has(c.id))
      .sort((a, b) => (b.createdAt?.seconds ?? 0) - (a.createdAt?.seconds ?? 0))
  }, [challenges, completedIds])

  const done = useMemo(
    () => [...completions].sort((a, b) => (b.createdAt?.seconds ?? 0) - (a.createdAt?.seconds ?? 0)),
    [completions],
  )


  return (
    <section className="mt-12 max-w-3xl">
      <Link
        to="/alumno"
        className="mb-8 flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground"
      >
        <ChevronLeft className="size-4" aria-hidden="true" /> Volver al resumen
      </Link>
      <p className="font-mono text-xs tracking-[0.2em] text-accent-foreground uppercase">
        Sumá puntos
      </p>
      <h1 className="mt-3 text-4xl font-semibold tracking-tight">Desafíos</h1>
      <p className="mt-3 text-muted-foreground">
        Completá los desafíos que arma tu profe y sumá puntos.
      </p>

      <div className="mt-8 flex items-center gap-4 rounded-2xl border border-primary/30 bg-primary/5 p-5">
        <div className="flex size-12 shrink-0 items-center justify-center rounded-xl bg-primary text-primary-foreground">
          <Trophy className="size-6" aria-hidden="true" />
        </div>
        <div>
          <p className="text-xs font-medium tracking-wider text-muted-foreground uppercase">
            Tus puntos
          </p>
          <p className="font-mono text-3xl font-semibold text-primary">{totalPoints(completions)}</p>
        </div>
        <p className="ml-auto text-right text-sm text-muted-foreground">
          {done.length} {done.length === 1 ? 'desafío completado' : 'desafíos completados'}
        </p>
      </div>


      <h2 className="mt-10 text-sm font-medium tracking-wider text-muted-foreground uppercase">
        Disponibles
      </h2>
      {loading && coachId ? (
        <p className="mt-4 text-sm text-muted-foreground">Cargando…</p>
      ) : available.length === 0 ? (
        <p className="mt-4 text-sm text-muted-foreground">
          No hay desafíos disponibles por ahora. ¡Fijate de nuevo más adelante!
        </p>
      ) : (
        <div className="mt-4 flex flex-col gap-3">
          {available.map((c) => (
            <article key={c.id} className="rounded-xl border border-border bg-card p-4">
              <div className="flex items-start justify-between gap-3">
                <p className="font-medium">{c.title}</p>
                <span className="shrink-0 rounded-full bg-primary/15 px-2.5 py-0.5 text-xs font-semibold text-primary">
                  +{pointsLabel(c.points)}
                </span>
              </div>
              {c.description && (
                <p className="mt-2 text-sm leading-6 whitespace-pre-line text-muted-foreground">
                  {c.description}
                </p>
              )}
              <div className="mt-4 flex items-center justify-between gap-3">
                <p className="text-xs text-muted-foreground">
                  {countExercises(c.items)} ejercicios · {c.endDate ? `hasta el ${formatShortDate(c.endDate)}` : 'sin fecha límite'}
                </p>
                <Link
                  to={`/alumno/desafios/${c.id}`}
                  className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-primary px-3 text-sm font-medium text-primary-foreground hover:bg-primary/80"
                >
                  Empezar <ArrowRight className="size-4" aria-hidden="true" />
                </Link>
              </div>
            </article>
          ))}
        </div>
      )}

      {done.length > 0 && (
        <>
          <h2 className="mt-10 text-sm font-medium tracking-wider text-muted-foreground uppercase">
            Completados
          </h2>
          <div className="mt-4 flex flex-col gap-2">
            {done.map((c) => (
              <div
                key={c.id}
                className="flex items-center gap-3 rounded-xl border border-border bg-card px-4 py-3"
              >
                <Check className="size-4 shrink-0 text-primary" aria-hidden="true" />
                <p className="flex-1 text-sm font-medium">{c.challengeTitle}</p>
                <span className="text-xs text-muted-foreground">
                  {formatTimestampDate(c.createdAt)}
                </span>
                <span className="font-mono text-sm font-semibold text-primary">+{c.points}</span>
              </div>
            ))}
          </div>
        </>
      )}
    </section>
  )
}
