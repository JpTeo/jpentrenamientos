import { useEffect, useMemo, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import {
  collection,
  query,
  where,
  onSnapshot,
  doc,
  getDoc,
  updateDoc,
  deleteDoc,
  writeBatch,
  serverTimestamp,
} from 'firebase/firestore'
import { db } from '../../firebase/config'
import { useAuth } from '../../contexts/useAuth'
import { emptyExercise, normalizeItem } from '../../lib/planItems'
import DayEditor, { DayTabs } from '../../components/DayEditor'
import { useDays } from '../../hooks/useDays'

const inputClass =
  'w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-slate-500'
const labelClass = 'mb-1 block text-xs font-medium text-slate-500'

export default function PlanEditor() {
  const { user } = useAuth()
  const { id } = useParams()
  const isEditing = Boolean(id)
  const navigate = useNavigate()

  const [students, setStudents] = useState([])
  const [exercises, setExercises] = useState([])
  const [title, setTitle] = useState('')
  const [studentId, setStudentId] = useState('')
  const [editItems, setEditItems] = useState(null)
  const [loading, setLoading] = useState(isEditing)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  // Creating a plan can span several days; each day is saved as its own plan
  // titled "<title> - Día N" (which is how the student app groups them).
  const { days, activeKey, setActiveKey, addDay, removeDay, dayRefs, collectItems } = useDays()

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

  useEffect(() => {
    const q = query(collection(db, 'exercises'), where('createdBy', '==', user.uid))
    const unsub = onSnapshot(q, (snap) => {
      const list = snap.docs.map((d) => ({ id: d.id, ...d.data() }))
      list.sort((a, b) => (a.name || '').localeCompare(b.name || ''))
      setExercises(list)
    })
    return unsub
  }, [user.uid])

  useEffect(() => {
    if (!isEditing) return
    getDoc(doc(db, 'plans', id)).then((snap) => {
      if (snap.exists()) {
        const data = snap.data()
        setTitle(data.title ?? '')
        setStudentId(data.studentId ?? '')
        setEditItems(data.items?.length ? data.items.map(normalizeItem) : [emptyExercise()])
      }
      setLoading(false)
    })
  }, [id, isEditing])

  const exerciseById = useMemo(() => {
    const map = {}
    exercises.forEach((ex) => (map[ex.id] = ex))
    return map
  }, [exercises])

  const exerciseGroups = useMemo(() => {
    const map = {}
    for (const ex of exercises) {
      const key = ex.category || 'Sin categoría'
      if (!map[key]) map[key] = []
      map[key].push(ex)
    }
    return Object.entries(map).sort(([a], [b]) => a.localeCompare(b))
  }, [exercises])

  async function handleSave(e) {
    e.preventDefault()
    setError('')
    if (!title.trim() || !studentId) {
      setError('Completá el título y elegí un alumno.')
      return
    }

    const { itemsPerDay, emptyIndex } = collectItems()
    if (emptyIndex !== -1) {
      setError(
        days.length > 1
          ? `El Día ${emptyIndex + 1} no tiene ejercicios. Agregá al menos uno o quitá ese día.`
          : 'Agregá al menos un ejercicio o circuito.',
      )
      return
    }

    const student = students.find((s) => s.id === studentId)
    const baseTitle = title.trim()
    setSaving(true)
    try {
      if (isEditing) {
        await updateDoc(doc(db, 'plans', id), {
          title: baseTitle,
          studentId,
          studentName: student?.name ?? '',
          items: itemsPerDay[0],
          updatedAt: serverTimestamp(),
        })
      } else {
        const batch = writeBatch(db)
        itemsPerDay.forEach((items, i) => {
          batch.set(doc(collection(db, 'plans')), {
            title: days.length > 1 ? `${baseTitle} - Día ${i + 1}` : baseTitle,
            studentId,
            studentName: student?.name ?? '',
            coachId: user.uid,
            items,
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
          })
        })
        await batch.commit()
      }
      navigate('/coach/planificaciones')
    } catch {
      setError('No se pudo guardar la planificación. Intentá de nuevo.')
    } finally {
      setSaving(false)
    }
  }

  async function handleDelete() {
    if (!confirm('¿Eliminar esta planificación?')) return
    setSaving(true)
    try {
      await deleteDoc(doc(db, 'plans', id))
      navigate('/coach/planificaciones')
    } catch {
      setError('No se pudo eliminar la planificación.')
      setSaving(false)
    }
  }

  if (loading) {
    return <p className="text-sm text-slate-500">Cargando…</p>
  }

  const multiDay = days.length > 1

  return (
    <form onSubmit={handleSave} className="space-y-6">
      <div className="rounded-2xl bg-white p-6 shadow-sm">
        <h2 className="mb-4 text-lg font-semibold text-slate-900">
          {isEditing ? 'Editar planificación' : 'Nueva planificación'}
        </h2>
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label className={labelClass}>Título</label>
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Full body semana 1"
              className={inputClass}
            />
          </div>
          <div>
            <label className={labelClass}>Alumno</label>
            <select value={studentId} onChange={(e) => setStudentId(e.target.value)} className={inputClass}>
              <option value="">Elegí un alumno</option>
              {students.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          </div>
        </div>
        {!isEditing && multiDay && (
          <p className="mt-3 text-xs text-slate-500">
            Cada día se guarda como «{title.trim() || 'Título'} - Día N» y el alumno los ve
            agrupados dentro de la misma planificación.
          </p>
        )}
      </div>

      {!isEditing && (
        <DayTabs
          days={days}
          activeKey={activeKey}
          onSelect={setActiveKey}
          onAdd={addDay}
          onRemove={removeDay}
        />
      )}

      {days.map((day) => (
        <div key={day.key} className={activeKey === day.key ? '' : 'hidden'}>
          <DayEditor
            ref={(handle) => {
              dayRefs.current[day.key] = handle
            }}
            initialItems={isEditing ? editItems : undefined}
            exerciseGroups={exerciseGroups}
            exerciseById={exerciseById}
          />
        </div>
      ))}

      {error && <p className="text-sm text-red-600">{error}</p>}

      <div className="flex items-center justify-between">
        <div>
          {isEditing && (
            <button
              type="button"
              onClick={handleDelete}
              disabled={saving}
              className="rounded-lg px-4 py-2 text-sm font-medium text-red-600 hover:bg-red-50 disabled:opacity-60"
            >
              Eliminar planificación
            </button>
          )}
        </div>
        <button
          type="submit"
          disabled={saving}
          className="rounded-lg bg-slate-900 px-5 py-2 font-medium text-white hover:bg-slate-800 disabled:opacity-60"
        >
          {saving
            ? 'Guardando…'
            : multiDay
              ? `Guardar planificación (${days.length} días)`
              : 'Guardar planificación'}
        </button>
      </div>
    </form>
  )
}
