import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { collection, query, where, onSnapshot } from 'firebase/firestore'
import { db } from '../../firebase/config'
import { useAuth } from '../../contexts/useAuth'

export default function MyPlans() {
  const { user } = useAuth()
  const [plans, setPlans] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const q = query(collection(db, 'plans'), where('studentId', '==', user.uid))
    const unsub = onSnapshot(q, (snap) => {
      const list = snap.docs.map((d) => ({ id: d.id, ...d.data() }))
      list.sort((a, b) => (b.createdAt?.seconds ?? 0) - (a.createdAt?.seconds ?? 0))
      setPlans(list)
      setLoading(false)
    })
    return unsub
  }, [user.uid])

  if (loading) return <p className="text-sm text-slate-500">Cargando…</p>

  if (plans.length === 0) {
    return (
      <div className="rounded-2xl bg-white p-6 text-center shadow-sm">
        <p className="text-sm text-slate-500">Todavía no tenés planificaciones asignadas.</p>
      </div>
    )
  }

  return (
    <ul className="space-y-3">
      {plans.map((p) => (
        <li key={p.id}>
          <Link
            to={`/alumno/${p.id}`}
            className="block rounded-2xl bg-white p-5 shadow-sm hover:shadow-md"
          >
            <p className="font-medium text-slate-900">{p.title}</p>
            <p className="text-sm text-slate-500">{p.items?.length ?? 0} ejercicios</p>
          </Link>
        </li>
      ))}
    </ul>
  )
}
