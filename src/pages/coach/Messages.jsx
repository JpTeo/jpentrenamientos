import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { collection, query, where, onSnapshot, doc, writeBatch } from 'firebase/firestore'
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

export default function Messages() {
  const { user } = useAuth()
  const [messages, setMessages] = useState([])
  const [loading, setLoading] = useState(true)
  // Captured once per mount so a message stays highlighted as "new" for this
  // visit even after we flip it to read in the background below.
  const initialUnreadIds = useRef(null)

  useEffect(() => {
    const q = query(collection(db, 'exerciseComments'), where('coachId', '==', user.uid))
    const unsub = onSnapshot(q, (snap) => {
      const list = snap.docs.map((d) => ({ id: d.id, ...d.data() }))
      list.sort((a, b) => (b.createdAt?.seconds ?? 0) - (a.createdAt?.seconds ?? 0))
      if (initialUnreadIds.current === null) {
        initialUnreadIds.current = new Set(list.filter((m) => !m.read).map((m) => m.id))
      }
      setMessages(list)
      setLoading(false)

      const unread = list.filter((m) => !m.read)
      if (unread.length > 0) {
        const batch = writeBatch(db)
        unread.forEach((m) => batch.update(doc(db, 'exerciseComments', m.id), { read: true }))
        batch.commit().catch(() => {})
      }
    })
    return unsub
  }, [user.uid])

  return (
    <div className="space-y-6">
      <h2 className="text-lg font-semibold text-slate-900">Mensajes de alumnos</h2>

      <div className="rounded-2xl bg-white p-6 shadow-sm">
        {loading ? (
          <p className="text-sm text-slate-500">Cargando…</p>
        ) : messages.length === 0 ? (
          <p className="text-sm text-slate-500">
            Todavía no tenés mensajes. Cuando un alumno deje un comentario en un ejercicio, va a
            aparecer acá.
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
                {messages.map((m) => (
                  <tr
                    key={m.id}
                    className={initialUnreadIds.current?.has(m.id) ? 'bg-sky-50' : ''}
                  >
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
                    <td className="py-3 pr-4 text-slate-600">{m.exerciseName || '—'}</td>
                    <td className="py-3 pr-4 text-slate-600">{m.message}</td>
                    <td className="py-3 pr-4 whitespace-nowrap text-xs text-slate-400">
                      {formatDate(m.createdAt)}
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
