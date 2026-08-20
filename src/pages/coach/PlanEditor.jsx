import { useEffect, useMemo, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import {
  collection,
  query,
  where,
  onSnapshot,
  doc,
  getDoc,
  addDoc,
  updateDoc,
  deleteDoc,
  serverTimestamp,
} from 'firebase/firestore'
import { db } from '../../firebase/config'
import { useAuth } from '../../contexts/useAuth'

function emptyItem() {
  return { exerciseId: '', name: '', imageUrl: null, sets: '', reps: '', weight: '', notes: '' }
}

export default function PlanEditor() {
  const { user } = useAuth()
  const { id } = useParams()
  const isEditing = Boolean(id)
  const navigate = useNavigate()

  const [students, setStudents] = useState([])
  const [exercises, setExercises] = useState([])
  const [title, setTitle] = useState('')
  const [studentId, setStudentId] = useState('')
  const [items, setItems] = useState([emptyItem()])
  const [loading, setLoading] = useState(isEditing)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

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
        setItems(data.items?.length ? data.items : [emptyItem()])
      }
      setLoading(false)
    })
  }, [id, isEditing])

  const exerciseById = useMemo(() => {
    const map = {}
    exercises.forEach((ex) => (map[ex.id] = ex))
    return map
  }, [exercises])

  function updateItem(index, patch) {
    setItems((prev) => prev.map((it, i) => (i === index ? { ...it, ...patch } : it)))
  }

  function handlePickExercise(index, exerciseId) {
    const ex = exerciseById[exerciseId]
    updateItem(index, {
      exerciseId,
      name: ex ? ex.name : '',
      imageUrl: ex ? ex.imageUrl ?? null : null,
    })
  }

  function addItem() {
    setItems((prev) => [...prev, emptyItem()])
  }

  function removeItem(index) {
    setItems((prev) => prev.filter((_, i) => i !== index))
  }

  async function handleSave(e) {
    e.preventDefault()
    setError('')
    if (!title.trim() || !studentId) {
      setError('Completá el título y elegí un alumno.')
      return
    }
    const cleanItems = items
      .filter((it) => it.name.trim())
      .map((it) => ({
        exerciseId: it.exerciseId || null,
        name: it.name.trim(),
        imageUrl: it.imageUrl ?? null,
        sets: it.sets,
        reps: it.reps,
        weight: it.weight,
        notes: it.notes,
      }))
    if (cleanItems.length === 0) {
      setError('Agregá al menos un ejercicio.')
      return
    }

    const student = students.find((s) => s.id === studentId)
    setSaving(true)
    try {
      if (isEditing) {
        await updateDoc(doc(db, 'plans', id), {
          title: title.trim(),
          studentId,
          studentName: student?.name ?? '',
          items: cleanItems,
          updatedAt: serverTimestamp(),
        })
      } else {
        await addDoc(collection(db, 'plans'), {
          title: title.trim(),
          studentId,
          studentName: student?.name ?? '',
          coachId: user.uid,
          items: cleanItems,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        })
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

  return (
    <form onSubmit={handleSave} className="space-y-6">
      <div className="rounded-2xl bg-white p-6 shadow-sm">
        <h2 className="mb-4 text-lg font-semibold text-slate-900">
          {isEditing ? 'Editar planificación' : 'Nueva planificación'}
        </h2>
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label className="mb-1 block text-sm font-medium text-slate-700">Título</label>
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Semana 1 - Full body"
              className="w-full rounded-lg border border-slate-300 px-3 py-2 outline-none focus:border-slate-500"
            />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-slate-700">Alumno</label>
            <select
              value={studentId}
              onChange={(e) => setStudentId(e.target.value)}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 outline-none focus:border-slate-500"
            >
              <option value="">Elegí un alumno</option>
              {students.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>

      <div className="rounded-2xl bg-white p-6 shadow-sm">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-slate-900">Ejercicios</h2>
          <button
            type="button"
            onClick={addItem}
            className="rounded-lg px-3 py-1.5 text-sm font-medium text-slate-600 hover:bg-slate-100"
          >
            + Agregar ejercicio
          </button>
        </div>
        <div className="space-y-4">
          {items.map((item, index) => (
            <div key={index} className="rounded-xl border border-slate-100 p-4">
              <div className="mb-3 flex items-start gap-3">
                <div className="flex-1">
                  <label className="mb-1 block text-xs font-medium text-slate-500">
                    Ejercicio (de tu librería)
                  </label>
                  <select
                    value={item.exerciseId}
                    onChange={(e) => handlePickExercise(index, e.target.value)}
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-slate-500"
                  >
                    <option value="">Elegí o escribí abajo</option>
                    {exercises.map((ex) => (
                      <option key={ex.id} value={ex.id}>
                        {ex.name}
                      </option>
                    ))}
                  </select>
                </div>
                <button
                  type="button"
                  onClick={() => removeItem(index)}
                  className="mt-5 rounded-lg px-2 py-1 text-sm text-red-500 hover:bg-red-50"
                >
                  Quitar
                </button>
              </div>
              <div className="grid gap-3 sm:grid-cols-4">
                <div className="sm:col-span-2">
                  <label className="mb-1 block text-xs font-medium text-slate-500">Nombre</label>
                  <input
                    value={item.name}
                    onChange={(e) => updateItem(index, { name: e.target.value, exerciseId: '' })}
                    placeholder="Sentadilla"
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-slate-500"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium text-slate-500">Series</label>
                  <input
                    value={item.sets}
                    onChange={(e) => updateItem(index, { sets: e.target.value })}
                    placeholder="4"
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-slate-500"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium text-slate-500">
                    Repeticiones
                  </label>
                  <input
                    value={item.reps}
                    onChange={(e) => updateItem(index, { reps: e.target.value })}
                    placeholder="10"
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-slate-500"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium text-slate-500">Peso</label>
                  <input
                    value={item.weight}
                    onChange={(e) => updateItem(index, { weight: e.target.value })}
                    placeholder="20kg"
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-slate-500"
                  />
                </div>
                <div className="sm:col-span-3">
                  <label className="mb-1 block text-xs font-medium text-slate-500">
                    Notas (opcional)
                  </label>
                  <input
                    value={item.notes}
                    onChange={(e) => updateItem(index, { notes: e.target.value })}
                    placeholder="Descanso 60s entre series"
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-slate-500"
                  />
                </div>
              </div>
              {item.imageUrl && (
                <img
                  src={item.imageUrl}
                  alt={item.name}
                  className="mt-3 h-16 w-16 rounded-lg object-cover"
                />
              )}
            </div>
          ))}
        </div>
      </div>

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
          {saving ? 'Guardando…' : 'Guardar planificación'}
        </button>
      </div>
    </form>
  )
}
