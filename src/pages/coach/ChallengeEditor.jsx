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

export default function ChallengeEditor() {
  const { user } = useAuth()
  const { id } = useParams()
  const isEditing = Boolean(id)
  const navigate = useNavigate()

  const [exercises, setExercises] = useState([])
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [points, setPoints] = useState('10')
  const [endDate, setEndDate] = useState('')
  const [editItems, setEditItems] = useState(null)
  const [loading, setLoading] = useState(isEditing)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  // Like templates: a challenge can span several days, each saved as its own
  // challenge titled "<title> - Día N" with the same points and deadline.
  const { days, activeKey, setActiveKey, addDay, removeDay, dayRefs, collectItems } = useDays()

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
    getDoc(doc(db, 'challenges', id)).then((snap) => {
      if (snap.exists()) {
        const data = snap.data()
        setTitle(data.title ?? '')
        setDescription(data.description ?? '')
        setPoints(String(data.points ?? ''))
        setEndDate(data.endDate ?? '')
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
    const pts = Math.round(Number(points))
    if (!title.trim()) {
      setError('Completá el título del desafío.')
      return
    }
    if (!Number.isFinite(pts) || pts < 1) {
      setError('Los puntos tienen que ser un número mayor a 0.')
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

    const baseTitle = title.trim()
    const common = {
      description: description.trim(),
      points: pts,
      endDate: endDate || null,
      updatedAt: serverTimestamp(),
    }
    setSaving(true)
    try {
      if (isEditing) {
        await updateDoc(doc(db, 'challenges', id), {
          ...common,
          title: baseTitle,
          items: itemsPerDay[0],
        })
      } else {
        const batch = writeBatch(db)
        itemsPerDay.forEach((items, i) => {
          batch.set(doc(collection(db, 'challenges')), {
            ...common,
            title: days.length > 1 ? `${baseTitle} - Día ${i + 1}` : baseTitle,
            coachId: user.uid,
            active: true,
            items,
            createdAt: serverTimestamp(),
          })
        })
        await batch.commit()
      }
      navigate('/coach/desafios')
    } catch {
      setError('No se pudo guardar el desafío. Intentá de nuevo.')
    } finally {
      setSaving(false)
    }
  }

  async function handleDelete() {
    if (!confirm('¿Eliminar este desafío? Los puntos que ya ganaron tus alumnos se conservan.'))
      return
    setSaving(true)
    try {
      await deleteDoc(doc(db, 'challenges', id))
      navigate('/coach/desafios')
    } catch {
      setError('No se pudo eliminar el desafío.')
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
          {isEditing ? 'Editar desafío' : 'Nuevo desafío'}
        </h2>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <label className={labelClass}>Título</label>
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Desafío de piernas"
              className={inputClass}
            />
          </div>
          <div className="sm:col-span-2">
            <label className={labelClass}>Descripción (opcional)</label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={2}
              placeholder="Explicales de qué se trata el desafío"
              className={inputClass}
            />
          </div>
          <div>
            <label className={labelClass}>Puntos que suma</label>
            <input
              type="number"
              min="1"
              value={points}
              onChange={(e) => setPoints(e.target.value)}
              className={inputClass}
            />
          </div>
          <div>
            <label className={labelClass}>Fecha límite (opcional)</label>
            <input
              type="date"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              className={inputClass}
            />
          </div>
        </div>
        {!isEditing && multiDay && (
          <p className="mt-3 text-xs text-slate-500">
            Cada día se guarda como un desafío «{title.trim() || 'Título'} - Día N» y suma estos
            puntos por separado.
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
              Eliminar desafío
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
              ? `Guardar desafío (${days.length} días)`
              : 'Guardar desafío'}
        </button>
      </div>
    </form>
  )
}
