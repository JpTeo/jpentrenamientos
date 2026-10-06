import { useEffect, useMemo, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  collection,
  query,
  where,
  onSnapshot,
  doc,
  deleteDoc,
  writeBatch,
} from 'firebase/firestore'
import { CircleCheck, Dumbbell } from 'lucide-react'
import { checkinLabel } from '../../lib/checkins'
import { db } from '../../firebase/config'
import { useAuth } from '../../contexts/useAuth'

function formatDate(ts) {
  if (!ts?.seconds) return ''
  return new Date(ts.seconds * 1000).toLocaleString('es-AR', {
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  })
}

// Flips every unread doc in `docs` to read:true in one batch.
function markRead(collectionName, docs) {
  if (docs.length === 0) return
  const batch = writeBatch(db)
  docs.forEach((m) => batch.update(doc(db, collectionName, m.id), { read: true }))
  batch.commit().catch(() => {})
}

export default function Messages() {
  const { user } = useAuth()
  const [comments, setComments] = useState([])
  const [completions, setCompletions] = useState([])
  const [checkins, setCheckins] = useState([])
  const [studentNames, setStudentNames] = useState({})
  const [loading, setLoading] = useState(true)
  // Captured on each source's first snapshot so a row stays highlighted as
  // "new" for this visit even after we flip it to read in the background.
  const initialUnreadIds = useRef(new Set())
  const seenFirstSnapshot = useRef({ comments: false, completions: false, checkins: false })

  useEffect(() => {
    const q = query(collection(db, 'exerciseComments'), where('coachId', '==', user.uid))
    return onSnapshot(q, (snap) => {
      const list = snap.docs.map((d) => ({ id: d.id, ...d.data() }))
      const unread = list.filter((m) => !m.read)
      if (!seenFirstSnapshot.current.comments) {
        seenFirstSnapshot.current.comments = true
        unread.forEach((m) => initialUnreadIds.current.add(m.id))
      }
      setComments(list)
      setLoading(false)
      markRead('exerciseComments', unread)
    })
  }, [user.uid])

  useEffect(() => {
    const q = query(collection(db, 'planCompletions'), where('coachId', '==', user.uid))
    return onSnapshot(q, (snap) => {
      const list = snap.docs.map((d) => ({ id: d.id, ...d.data() }))
      // Older completions have no `read` field at all; only ones created as
      // read:false count as new.
      const unread = list.filter((m) => m.read === false)
      if (!seenFirstSnapshot.current.completions) {
        seenFirstSnapshot.current.completions = true
        unread.forEach((m) => initialUnreadIds.current.add(m.id))
      }
      setCompletions(list)
      markRead('planCompletions', unread)
    })
  }, [user.uid])

  useEffect(() => {
    const q = query(collection(db, 'trainingCheckins'), where('coachId', '==', user.uid))
    return onSnapshot(q, (snap) => {
      const list = snap.docs.map((d) => ({ id: d.id, ...d.data() }))
      const unread = list.filter((m) => m.read === false)
      if (!seenFirstSnapshot.current.checkins) {
        seenFirstSnapshot.current.checkins = true
        unread.forEach((m) => initialUnreadIds.current.add(m.id))
      }
      setCheckins(list)
      markRead('trainingCheckins', unread)
    })
  }, [user.uid])

  async function revokeCheckin(row) {
    if (
      !confirm(
        `¿Quitar el entrenamiento presencial de ${row.studentName || 'este alumno'}? Pierde los ${row.points} puntos y puede volver a marcarlo hoy.`,
      )
    )
      return
    try {
      await deleteDoc(doc(db, 'trainingCheckins', row.id))
    } catch {
      alert('No se pudo quitar el registro. Intentá de nuevo.')
    }
  }

  // Older completions don't store the student's name, so look it up.
  useEffect(() => {
    const q = query(
      collection(db, 'users'),
      where('role', '==', 'student'),
      where('createdBy', '==', user.uid),
    )
    return onSnapshot(q, (snap) => {
      const map = {}
      snap.docs.forEach((d) => (map[d.id] = d.data().name))
      setStudentNames(map)
    })
  }, [user.uid])

  const rows = useMemo(() => {
    const fromComments = comments.map((m) => ({
      id: m.id,
      kind: 'comment',
      studentName: m.studentName,
      planId: m.planId,
      planTitle: m.planTitle,
      exerciseName: m.exerciseName,
      message: m.message,
      at: m.createdAt,
    }))
    const fromCompletions = completions.map((m) => ({
      id: m.id,
      kind: 'completion',
      studentName: m.studentName || studentNames[m.studentId],
      planId: m.planId,
      planTitle: m.planTitle,
      at: m.completedAt,
    }))
    const fromCheckins = checkins.map((m) => ({
      id: m.id,
      kind: 'checkin',
      studentName: m.studentName || studentNames[m.studentId],
      description: checkinLabel(m),
      points: m.points,
      at: m.createdAt,
    }))
    return [...fromComments, ...fromCompletions, ...fromCheckins].sort(
      (a, b) => (b.at?.seconds ?? 0) - (a.at?.seconds ?? 0),
    )
  }, [comments, completions, checkins, studentNames])

  return (
    <div className="space-y-6">
      <h2 className="text-lg font-semibold text-slate-900">Mensajes de alumnos</h2>

      <div className="rounded-2xl bg-white p-6 shadow-sm">
        {loading ? (
          <p className="text-sm text-slate-500">Cargando…</p>
        ) : rows.length === 0 ? (
          <p className="text-sm text-slate-500">
            Todavía no tenés mensajes. Cuando un alumno deje un comentario, termine una
            planificación o marque que entrenó, va a aparecer acá.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-slate-100 text-xs font-medium text-slate-500">
                  <th className="py-2 pr-4">Alumno</th>
                  <th className="py-2 pr-4">Planificación</th>
                  <th className="py-2 pr-4">Ejercicio</th>
                  <th className="py-2 pr-4">Mensaje</th>
                  <th className="py-2 pr-4">Fecha</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {rows.map((m) => (
                  <tr key={`${m.kind}-${m.id}`} className={initialUnreadIds.current.has(m.id) ? 'bg-sky-50' : ''}>
                    <td className="py-3 pr-4 font-medium text-slate-800">{m.studentName || '—'}</td>
                    <td className="py-3 pr-4 text-slate-600">
                      {m.planId ? (
                        <Link
                          to={`/coach/planificaciones/${m.planId}`}
                          className="underline hover:text-slate-900"
                        >
                          {m.planTitle || 'Ver plan'}
                        </Link>
                      ) : (
                        m.planTitle || '—'
                      )}
                    </td>
                    <td className="py-3 pr-4 text-slate-600">
                      {m.kind === 'comment' ? m.exerciseName || '—' : '—'}
                    </td>
                    <td className="py-3 pr-4 text-slate-600">
                      {m.kind === 'comment' ? (
                        m.message
                      ) : m.kind === 'checkin' ? (
                        <span className="inline-flex flex-wrap items-center gap-x-2 gap-y-1">
                          <span className="inline-flex items-center gap-1.5 font-medium text-emerald-700">
                            <Dumbbell className="size-4" aria-hidden="true" /> Entrenó (presencial):{' '}
                            {m.description}
                          </span>
                          <span className="text-xs text-slate-400">+{m.points} pts</span>
                          <button
                            type="button"
                            onClick={() => revokeCheckin(m)}
                            className="text-xs font-medium text-red-500 hover:underline"
                          >
                            Quitar
                          </button>
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1.5 font-medium text-emerald-700">
                          <CircleCheck className="size-4" aria-hidden="true" /> Completó la
                          planificación
                        </span>
                      )}
                    </td>
                    <td className="py-3 pr-4 whitespace-nowrap text-xs text-slate-400">
                      {formatDate(m.at)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}
