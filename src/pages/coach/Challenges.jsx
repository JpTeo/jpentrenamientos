import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  onSnapshot,
  query,
  serverTimestamp,
  updateDoc,
  where,
} from 'firebase/firestore'
import { db } from '../../firebase/config'
import { useAuth } from '../../contexts/useAuth'
import { countExercises } from '../../lib/planItems'
import {
  formatShortDate,
  formatTimestampDate,
  isExpired,
  pointsLabel,
} from '../../lib/challenges'

export default function Challenges() {
  const { user } = useAuth()
  const [challenges, setChallenges] = useState([])
  const [completions, setCompletions] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [openId, setOpenId] = useState(null)

  useEffect(() => {
    const q = query(collection(db, 'challenges'), where('coachId', '==', user.uid))
    return onSnapshot(
      q,
      (snap) => {
        const list = snap.docs.map((d) => ({ id: d.id, ...d.data() }))
        list.sort((a, b) => (b.createdAt?.seconds ?? 0) - (a.createdAt?.seconds ?? 0))
        setChallenges(list)
        setLoading(false)
      },
      () => {
        setError(
          'No se pudieron cargar los desafíos. Revisá que las reglas de Firestore estén publicadas.',
        )
        setLoading(false)
      },
    )
  }, [user.uid])

  useEffect(() => {
    const q = query(collection(db, 'challengeCompletions'), where('coachId', '==', user.uid))
    return onSnapshot(q, (snap) => {
      setCompletions(snap.docs.map((d) => ({ id: d.id, ...d.data() })))
    })
  }, [user.uid])

  const completionsByChallenge = useMemo(() => {
    const map = {}
    for (const c of completions) {
      if (!map[c.challengeId]) map[c.challengeId] = []
      map[c.challengeId].push(c)
    }
    for (const list of Object.values(map)) {
      list.sort((a, b) => (b.createdAt?.seconds ?? 0) - (a.createdAt?.seconds ?? 0))
    }
    return map
  }, [completions])

  async function toggleActive(challenge) {
    setError('')
    try {
      await updateDoc(doc(db, 'challenges', challenge.id), {
        active: !challenge.active,
        updatedAt: serverTimestamp(),
      })
    } catch {
      setError('No se pudo cambiar el estado del desafío.')
    }
  }

  // Duplicates start paused so a copy never reaches students by accident.
  async function handleDuplicate(challenge) {
    setError('')
    try {
      await addDoc(collection(db, 'challenges'), {
        title: `${challenge.title} (copia)`,
        description: challenge.description || '',
        points: challenge.points,
        endDate: challenge.endDate || null,
        items: challenge.items || [],
        coachId: user.uid,
        active: false,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      })
    } catch {
      setError('No se pudo duplicar el desafío. Intentá de nuevo.')
    }
  }

  async function handleDelete(challenge) {
    if (
      !confirm(
        `¿Eliminar el desafío "${challenge.title}"? Los puntos que ya ganaron tus alumnos se conservan.`,
      )
    )
      return
    setError('')
    try {
      await deleteDoc(doc(db, 'challenges', challenge.id))
    } catch {
      setError('No se pudo eliminar el desafío.')
    }
  }

  async function revokeCompletion(completion) {
    if (
      !confirm(
        `¿Quitarle a ${completion.studentName || 'este alumno'} los ${pointsLabel(completion.points)} de "${completion.challengeTitle}"? Va a poder volver a hacerlo.`,
      )
    )
      return
    setError('')
    try {
      await deleteDoc(doc(db, 'challengeCompletions', completion.id))
    } catch {
      setError('No se pudo quitar el puntaje.')
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold text-slate-900">Desafíos</h2>
        <div className="flex gap-2">
          <Link
            to="/coach/desafios/importar"
            className="rounded-lg bg-slate-100 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-200"
          >
            Importar
          </Link>
          <Link
            to="/coach/desafios/nueva"
            className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800"
          >
            + Nuevo desafío
          </Link>
        </div>
      </div>

      {error && <p className="text-sm text-red-600">{error}</p>}

      <div className="rounded-2xl bg-white p-6 shadow-sm">
        {loading ? (
          <p className="text-sm text-slate-500">Cargando…</p>
        ) : challenges.length === 0 ? (
          <p className="text-sm text-slate-500">
            Todavía no creaste ningún desafío. Armalo como una plantilla, con ejercicios y
            circuitos: tus alumnos lo hacen desde su sección Desafíos y suman puntos al terminarlo.
          </p>
        ) : (
          <ul className="divide-y divide-slate-100">
            {challenges.map((c) => {
              const done = completionsByChallenge[c.id] || []
              const expired = isExpired(c.endDate)
              return (
                <li key={c.id} className="space-y-2 py-4 first:pt-0 last:pb-0">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="font-medium text-slate-900">{c.title}</p>
                        <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-semibold text-emerald-700">
                          {pointsLabel(c.points)}
                        </span>
                        {!c.active && (
                          <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-500">
                            Pausado
                          </span>
                        )}
                        {expired && (
                          <span className="rounded-full bg-amber-50 px-2 py-0.5 text-xs text-amber-700">
                            Vencido
                          </span>
                        )}
                      </div>
                      <p className="text-sm text-slate-500">
                        {countExercises(c.items)} ejercicios ·{' '}
                        {c.endDate ? `hasta el ${formatShortDate(c.endDate)}` : 'sin fecha límite'}
                      </p>
                      {c.description && (
                        <p className="mt-1 text-sm whitespace-pre-line text-slate-400">
                          {c.description}
                        </p>
                      )}
                    </div>
                    <div className="flex flex-wrap items-center gap-1">
                      <button
                        type="button"
                        onClick={() => toggleActive(c)}
                        className="rounded-lg px-3 py-1.5 text-sm font-medium text-slate-600 hover:bg-slate-100"
                      >
                        {c.active ? 'Pausar' : 'Activar'}
                      </button>
                      <Link
                        to={`/coach/desafios/${c.id}`}
                        className="rounded-lg px-3 py-1.5 text-sm font-medium text-slate-600 hover:bg-slate-100"
                      >
                        Editar
                      </Link>
                      <button
                        type="button"
                        onClick={() => handleDuplicate(c)}
                        className="rounded-lg px-3 py-1.5 text-sm font-medium text-slate-600 hover:bg-slate-100"
                      >
                        Duplicar
                      </button>
                      <button
                        type="button"
                        onClick={() => handleDelete(c)}
                        className="rounded-lg px-3 py-1.5 text-sm font-medium text-red-500 hover:bg-red-50"
                      >
                        Eliminar
                      </button>
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={() => setOpenId(openId === c.id ? null : c.id)}
                    className="text-sm font-medium text-slate-600 underline-offset-2 hover:underline"
                  >
                    {done.length === 0
                      ? 'Nadie lo completó todavía'
                      : `${done.length} ${done.length === 1 ? 'alumno lo completó' : 'alumnos lo completaron'} ${openId === c.id ? '▴' : '▾'}`}
                  </button>
                  {openId === c.id && done.length > 0 && (
                    <ul className="space-y-1 rounded-lg bg-slate-50 p-3">
                      {done.map((d) => (
                        <li key={d.id} className="flex items-center gap-3 text-sm">
                          <span className="flex-1 font-medium text-slate-700">
                            {d.studentName || 'Alumno'}
                          </span>
                          <span className="text-xs text-slate-400">
                            {formatTimestampDate(d.createdAt)}
                          </span>
                          <button
                            type="button"
                            onClick={() => revokeCompletion(d)}
                            className="text-xs font-medium text-red-500 hover:underline"
                          >
                            Quitar
                          </button>
                        </li>
                      ))}
                    </ul>
                  )}
                </li>
              )
            })}
          </ul>
        )}
      </div>
    </div>
  )
}
