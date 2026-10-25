import { useEffect, useMemo, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { collection, doc, onSnapshot, query, where } from 'firebase/firestore'
import { db } from '../../firebase/config'
import { useAuth } from '../../contexts/useAuth'
import { countExercises } from '../../lib/planItems'
import { groupPlansByTitle } from '../../lib/planGroups'
import { describeProfile } from '../../lib/studentProfile'

function formatDate(ts) {
  if (!ts?.seconds) return ''
  return new Date(ts.seconds * 1000).toLocaleDateString('es-AR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  })
}

function timesLabel(count) {
  return `${count} ${count === 1 ? 'vez' : 'veces'}`
}

function PlanDayRow({ plan, studentPath }) {
  const done = plan.completionCount || 0
  return (
    <li className="flex items-center justify-between gap-3 py-2.5">
      <div className="min-w-0">
        <p className="text-sm font-medium text-slate-900">{plan.dayLabel ?? plan.title}</p>
        <p className="text-xs text-slate-500">{countExercises(plan.items)} ejercicios</p>
        {done > 0 ? (
          <p className="mt-0.5 text-xs text-emerald-700">
            Hecha {timesLabel(done)}
            {plan.lastCompletedAt && ` · última vez ${formatDate(plan.lastCompletedAt)}`}
          </p>
        ) : (
          <p className="mt-0.5 text-xs text-slate-400">Todavía no la hizo</p>
        )}
      </div>
      <Link
        to={`/coach/planificaciones/${plan.id}`}
        state={{ from: studentPath }}
        className="shrink-0 rounded-lg px-3 py-1.5 text-sm font-medium text-slate-600 hover:bg-slate-100"
      >
        Editar
      </Link>
    </li>
  )
}

export default function StudentDetail() {
  const { user } = useAuth()
  const { id } = useParams()
  const [student, setStudent] = useState(null)
  const [studentLoading, setStudentLoading] = useState(true)
  const [plans, setPlans] = useState([])
  const [plansLoading, setPlansLoading] = useState(true)
  const [error, setError] = useState('')
  const studentPath = `/coach/alumnos/${id}`

  useEffect(() => {
    return onSnapshot(
      doc(db, 'users', id),
      (snap) => {
        setStudent(snap.exists() ? { id: snap.id, ...snap.data() } : null)
        setStudentLoading(false)
      },
      () => setStudentLoading(false),
    )
  }, [id])

  useEffect(() => {
    const q = query(
      collection(db, 'plans'),
      where('studentId', '==', id),
      where('coachId', '==', user.uid),
    )
    return onSnapshot(
      q,
      (snap) => {
        setPlans(snap.docs.map((d) => ({ id: d.id, ...d.data() })))
        setPlansLoading(false)
      },
      () => {
        setError('No se pudieron cargar las planificaciones.')
        setPlansLoading(false)
      },
    )
  }, [id, user.uid])

  // Newest planificación first (by its most recent day), days in order.
  const groups = useMemo(() => {
    const list = groupPlansByTitle(plans).map((group) => ({
      ...group,
      total: group.plans.reduce((sum, p) => sum + (p.completionCount || 0), 0),
      newest: Math.max(...group.plans.map((p) => p.createdAt?.seconds ?? 0)),
    }))
    list.sort((a, b) => b.newest - a.newest)
    return list
  }, [plans])

  if (studentLoading) {
    return <p className="text-sm text-slate-500">Cargando…</p>
  }

  if (!student || student.createdBy !== user.uid) {
    return (
      <div className="space-y-4">
        <Link to="/coach/alumnos" className="text-sm font-medium text-slate-600 hover:underline">
          ← Volver a alumnos
        </Link>
        <p className="text-sm text-slate-500">No encontramos a este alumno.</p>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <Link to="/coach/alumnos" className="text-sm font-medium text-slate-600 hover:underline">
        ← Volver a alumnos
      </Link>

      <div className="flex flex-wrap items-start justify-between gap-3 rounded-2xl bg-white p-6 shadow-sm">
        <div>
          <h2 className="text-lg font-semibold text-slate-900">{student.name}</h2>
          <p className="text-sm text-slate-500">{student.email}</p>
          {student.onboardingDone ? (
            <p className="mt-1 text-sm text-slate-600">{describeProfile(student)}</p>
          ) : (
            <p className="mt-1 text-xs text-amber-600">Todavía no completó sus datos</p>
          )}
        </div>
        <Link
          to="/coach/planificaciones/nueva"
          state={{ from: studentPath, studentId: student.id }}
          className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800"
        >
          + Nueva planificación
        </Link>
      </div>

      {error && <p className="text-sm text-red-600">{error}</p>}

      {plansLoading ? (
        <p className="text-sm text-slate-500">Cargando planificaciones…</p>
      ) : groups.length === 0 ? (
        <div className="rounded-2xl bg-white p-6 shadow-sm">
          <p className="text-sm text-slate-500">Este alumno todavía no tiene planificaciones.</p>
        </div>
      ) : (
        groups.map((group) => (
          <div key={group.groupTitle.toLowerCase()} className="rounded-2xl bg-white p-6 shadow-sm">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <h3 className="font-semibold text-slate-900">{group.groupTitle}</h3>
              <p className="text-xs text-slate-500">
                {group.plans.length} {group.plans.length === 1 ? 'día' : 'días'} ·{' '}
                {group.total > 0
                  ? `${group.total} ${group.total === 1 ? 'entrenamiento hecho' : 'entrenamientos hechos'}`
                  : 'sin entrenamientos todavía'}
              </p>
            </div>
            <ul className="mt-2 divide-y divide-slate-100">
              {group.plans.map((plan) => (
                <PlanDayRow key={plan.id} plan={plan} studentPath={studentPath} />
              ))}
            </ul>
          </div>
        ))
      )}
    </div>
  )
}
