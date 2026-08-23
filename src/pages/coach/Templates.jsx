import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  collection,
  query,
  where,
  onSnapshot,
  addDoc,
  deleteDoc,
  doc,
  serverTimestamp,
} from 'firebase/firestore'
import { db } from '../../firebase/config'
import { useAuth } from '../../contexts/useAuth'
import { countExercises } from '../../lib/planItems'

function AssignRow({ template, students, onAssign }) {
  const [studentId, setStudentId] = useState('')
  const [assigning, setAssigning] = useState(false)
  const [done, setDone] = useState('')

  async function handleAssign() {
    if (!studentId) return
    setAssigning(true)
    setDone('')
    try {
      const student = students.find((s) => s.id === studentId)
      await onAssign(template, student)
      setDone(`Asignado a ${student?.name ?? 'alumno'}.`)
      setStudentId('')
    } finally {
      setAssigning(false)
    }
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <select
        value={studentId}
        onChange={(e) => setStudentId(e.target.value)}
        className="rounded-lg border border-slate-300 px-2 py-1.5 text-sm outline-none focus:border-slate-500"
      >
        <option value="">Elegí un alumno</option>
        {students.map((s) => (
          <option key={s.id} value={s.id}>
            {s.name}
          </option>
        ))}
      </select>
      <button
        type="button"
        onClick={handleAssign}
        disabled={!studentId || assigning}
        className="rounded-lg bg-slate-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-60"
      >
        {assigning ? 'Asignando…' : 'Asignar'}
      </button>
      {done && <span className="text-xs text-emerald-700">{done}</span>}
    </div>
  )
}

export default function Templates() {
  const { user } = useAuth()
  const [templates, setTemplates] = useState([])
  const [students, setStudents] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    const q = query(collection(db, 'planTemplates'), where('coachId', '==', user.uid))
    const unsub = onSnapshot(q, (snap) => {
      const list = snap.docs.map((d) => ({ id: d.id, ...d.data() }))
      list.sort((a, b) => (b.createdAt?.seconds ?? 0) - (a.createdAt?.seconds ?? 0))
      setTemplates(list)
      setLoading(false)
    })
    return unsub
  }, [user.uid])

  useEffect(() => {
    const q = query(
      collection(db, 'users'),
      where('role', '==', 'student'),
      where('createdBy', '==', user.uid),
    )
    const unsub = onSnapshot(q, (snap) => {
      const list = snap.docs.map((d) => ({ id: d.id, ...d.data() }))
      list.sort((a, b) => (a.name || '').localeCompare(b.name || ''))
      setStudents(list)
    })
    return unsub
  }, [user.uid])

  async function handleAssign(template, student) {
    setError('')
    try {
      await addDoc(collection(db, 'plans'), {
        title: template.title,
        studentId: student.id,
        studentName: student.name ?? '',
        coachId: user.uid,
        items: template.items,
        templateId: template.id,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      })
    } catch {
      setError('No se pudo asignar la plantilla. Intentá de nuevo.')
    }
  }

  async function handleDuplicate(template) {
    setError('')
    try {
      await addDoc(collection(db, 'planTemplates'), {
        title: `${template.title} (copia)`,
        coachId: user.uid,
        items: template.items,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      })
    } catch {
      setError('No se pudo duplicar la plantilla. Intentá de nuevo.')
    }
  }

  async function handleDelete(template) {
    if (!confirm('¿Eliminar esta plantilla? Las planificaciones ya asignadas no se ven afectadas.'))
      return
    setError('')
    try {
      await deleteDoc(doc(db, 'planTemplates', template.id))
    } catch {
      setError('No se pudo eliminar la plantilla.')
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold text-slate-900">Plantillas guardadas</h2>
        <Link
          to="/coach/plantillas/nueva"
          className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800"
        >
          + Nueva plantilla
        </Link>
      </div>

      {error && <p className="text-sm text-red-600">{error}</p>}

      <div className="rounded-2xl bg-white p-6 shadow-sm">
        {loading ? (
          <p className="text-sm text-slate-500">Cargando…</p>
        ) : templates.length === 0 ? (
          <p className="text-sm text-slate-500">
            Todavía no guardaste ninguna plantilla. Armá una para poder asignarla a distintos
            alumnos sin tener que rehacerla cada vez.
          </p>
        ) : students.length === 0 ? (
          <p className="text-sm text-slate-500">
            Tenés plantillas guardadas, pero primero creá un alumno para poder asignarlas.
          </p>
        ) : null}

        <ul className="divide-y divide-slate-100">
          {templates.map((t) => (
            <li key={t.id} className="space-y-3 py-4 first:pt-0 last:pb-0">
              <div className="flex items-center justify-between">
                <div>
                  <p className="font-medium text-slate-900">{t.title}</p>
                  <p className="text-sm text-slate-500">{countExercises(t.items)} ejercicios</p>
                </div>
                <div className="flex items-center gap-2">
                  <Link
                    to={`/coach/plantillas/${t.id}`}
                    className="rounded-lg px-3 py-1.5 text-sm font-medium text-slate-600 hover:bg-slate-100"
                  >
                    Editar
                  </Link>
                  <button
                    type="button"
                    onClick={() => handleDuplicate(t)}
                    className="rounded-lg px-3 py-1.5 text-sm font-medium text-slate-600 hover:bg-slate-100"
                  >
                    Duplicar
                  </button>
                  <button
                    type="button"
                    onClick={() => handleDelete(t)}
                    className="rounded-lg px-3 py-1.5 text-sm font-medium text-red-500 hover:bg-red-50"
                  >
                    Eliminar
                  </button>
                </div>
              </div>
              {students.length > 0 && (
                <AssignRow template={t} students={students} onAssign={handleAssign} />
              )}
            </li>
          ))}
        </ul>
      </div>
    </div>
  )
}
