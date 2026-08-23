import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { collection, query, where, onSnapshot } from 'firebase/firestore'
import { db } from '../../firebase/config'
import { useAuth } from '../../contexts/useAuth'
import { countExercises } from '../../lib/planItems'

export default function Plans() {
  const { user } = useAuth()
  const [plans, setPlans] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const q = query(collection(db, 'plans'), where('coachId', '==', user.uid))
    const unsub = onSnapshot(q, (snap) => {
      const list = snap.docs.map((d) => ({ id: d.id, ...d.data() }))
      list.sort((a, b) => (b.createdAt?.seconds ?? 0) - (a.createdAt?.seconds ?? 0))
      setPlans(list)
      setLoading(false)
    })
    return unsub
  }, [user.uid])

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold text-slate-900">Planificaciones</h2>
        <Link
          to="/coach/planificaciones/nueva"
          className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800"
        >
          + Nueva planificación
        </Link>
      </div>

      <div className="rounded-2xl bg-white p-6 shadow-sm">
        {loading ? (
          <p className="text-sm text-slate-500">Cargando…</p>
        ) : plans.length === 0 ? (
          <p className="text-sm text-slate-500">Todavía no creaste ninguna planificación.</p>
        ) : (
          <ul className="divide-y divide-slate-100">
            {plans.map((p) => (
              <li key={p.id} className="flex items-center justify-between py-3">
                <div>
                  <p className="font-medium text-slate-900">{p.title}</p>
                  <p className="text-sm text-slate-500">
                    {p.studentName} · {countExercises(p.items)} ejercicios
                  </p>
                </div>
                <Link
                  to={`/coach/planificaciones/${p.id}`}
                  className="rounded-lg px-3 py-1.5 text-sm font-medium text-slate-600 hover:bg-slate-100"
                >
                  Editar
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}
