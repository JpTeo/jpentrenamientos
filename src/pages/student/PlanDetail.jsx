import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { doc, onSnapshot } from 'firebase/firestore'
import { db } from '../../firebase/config'

export default function PlanDetail() {
  const { id } = useParams()
  const [plan, setPlan] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const unsub = onSnapshot(doc(db, 'plans', id), (snap) => {
      setPlan(snap.exists() ? { id: snap.id, ...snap.data() } : null)
      setLoading(false)
    })
    return unsub
  }, [id])

  if (loading) return <p className="text-sm text-slate-500">Cargando…</p>

  if (!plan) {
    return (
      <div className="space-y-4">
        <p className="text-sm text-slate-500">No se encontró la planificación.</p>
        <Link to="/alumno" className="text-sm font-medium text-slate-700 underline">
          Volver
        </Link>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <Link to="/alumno" className="text-sm font-medium text-slate-500 hover:text-slate-700">
        ← Volver
      </Link>
      <h2 className="text-xl font-semibold text-slate-900">{plan.title}</h2>
      <div className="space-y-3">
        {plan.items?.map((item, index) => (
          <div key={index} className="flex gap-4 rounded-2xl bg-white p-4 shadow-sm">
            <div className="h-20 w-20 shrink-0 overflow-hidden rounded-xl bg-slate-100">
              {item.imageUrl ? (
                <img src={item.imageUrl} alt={item.name} className="h-full w-full object-cover" />
              ) : (
                <div className="flex h-full w-full items-center justify-center text-xs text-slate-400">
                  Sin imagen
                </div>
              )}
            </div>
            <div className="flex-1">
              <p className="font-medium text-slate-900">{item.name}</p>
              <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-sm text-slate-600">
                {item.sets && <span>{item.sets} series</span>}
                {item.reps && <span>{item.reps} reps</span>}
                {item.weight && <span>{item.weight}</span>}
              </div>
              {item.notes && <p className="mt-1 text-sm text-slate-500">{item.notes}</p>}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
