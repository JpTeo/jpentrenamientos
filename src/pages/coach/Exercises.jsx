import { useEffect, useMemo, useState } from 'react'
import {
  collection,
  query,
  where,
  addDoc,
  writeBatch,
  doc,
  serverTimestamp,
  onSnapshot,
} from 'firebase/firestore'
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage'
import { db, storage } from '../../firebase/config'
import { useAuth } from '../../contexts/useAuth'

function parseBulkExercises(text) {
  const lines = text
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean)

  let currentCategory = ''
  const items = []
  for (const line of lines) {
    const bulletMatch = line.match(/^[-*•]\s*(.+)$/)
    if (bulletMatch) {
      const name = bulletMatch[1].trim()
      if (name) items.push({ name, category: currentCategory })
    } else {
      currentCategory = line.replace(/^[^\p{L}0-9]+/u, '').trim()
    }
  }
  return items
}

export default function Exercises() {
  const { user } = useAuth()
  const [exercises, setExercises] = useState([])
  const [loading, setLoading] = useState(true)

  const [name, setName] = useState('')
  const [category, setCategory] = useState('')
  const [file, setFile] = useState(null)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const [bulkText, setBulkText] = useState('')
  const [bulkSaving, setBulkSaving] = useState(false)
  const [bulkError, setBulkError] = useState('')
  const [bulkResult, setBulkResult] = useState('')

  useEffect(() => {
    const q = query(collection(db, 'exercises'), where('createdBy', '==', user.uid))
    const unsub = onSnapshot(q, (snap) => {
      const list = snap.docs.map((d) => ({ id: d.id, ...d.data() }))
      list.sort((a, b) => (a.name || '').localeCompare(b.name || ''))
      setExercises(list)
      setLoading(false)
    })
    return unsub
  }, [user.uid])

  const groups = useMemo(() => {
    const map = {}
    for (const ex of exercises) {
      const key = ex.category || 'Sin categoría'
      if (!map[key]) map[key] = []
      map[key].push(ex)
    }
    return Object.entries(map).sort(([a], [b]) => a.localeCompare(b))
  }, [exercises])

  async function handleCreate(e) {
    e.preventDefault()
    setError('')
    if (!name.trim()) return
    setSaving(true)
    try {
      let imageUrl = null
      if (file) {
        const path = `exercises/${user.uid}/${Date.now()}-${file.name}`
        const storageRef = ref(storage, path)
        await uploadBytes(storageRef, file)
        imageUrl = await getDownloadURL(storageRef)
      }
      await addDoc(collection(db, 'exercises'), {
        name: name.trim(),
        category: category.trim() || null,
        imageUrl,
        createdBy: user.uid,
        createdAt: serverTimestamp(),
      })
      setName('')
      setCategory('')
      setFile(null)
      e.target.reset()
    } catch {
      setError('No se pudo guardar el ejercicio. Intentá de nuevo.')
    } finally {
      setSaving(false)
    }
  }

  async function handleBulkImport(e) {
    e.preventDefault()
    setBulkError('')
    setBulkResult('')
    const items = parseBulkExercises(bulkText)
    if (items.length === 0) {
      setBulkError('No encontré ejercicios para importar. Revisá el formato del texto.')
      return
    }
    setBulkSaving(true)
    try {
      const batch = writeBatch(db)
      items.forEach((item) => {
        const ref = doc(collection(db, 'exercises'))
        batch.set(ref, {
          name: item.name,
          category: item.category || null,
          imageUrl: null,
          createdBy: user.uid,
          createdAt: serverTimestamp(),
        })
      })
      await batch.commit()
      setBulkResult(`Se agregaron ${items.length} ejercicios.`)
      setBulkText('')
    } catch {
      setBulkError('No se pudo hacer la carga masiva. Intentá de nuevo.')
    } finally {
      setBulkSaving(false)
    }
  }

  return (
    <div className="space-y-6">
      <div className="rounded-2xl bg-white p-6 shadow-sm">
        <h2 className="mb-4 text-lg font-semibold text-slate-900">Carga masiva</h2>
        <p className="mb-3 text-sm text-slate-500">
          Pegá una lista con títulos de grupo muscular y los ejercicios debajo de cada uno con
          guion o asterisco. Ejemplo:
        </p>
        <pre className="mb-3 whitespace-pre-wrap rounded-lg bg-slate-50 p-3 text-xs text-slate-500">
          {'Cuádriceps\n- Sentadilla con barra\n- Prensa 45°\n\nGlúteos\n- Hip thrust'}
        </pre>
        <form onSubmit={handleBulkImport} className="space-y-3">
          <textarea
            value={bulkText}
            onChange={(e) => setBulkText(e.target.value)}
            rows={8}
            placeholder="Pegá acá tu lista completa..."
            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-slate-500"
          />
          <button
            type="submit"
            disabled={bulkSaving || !bulkText.trim()}
            className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-60"
          >
            {bulkSaving ? 'Importando…' : 'Importar todos'}
          </button>
        </form>
        {bulkError && <p className="mt-3 text-sm text-red-600">{bulkError}</p>}
        {bulkResult && <p className="mt-3 text-sm text-emerald-700">{bulkResult}</p>}
      </div>

      <div className="rounded-2xl bg-white p-6 shadow-sm">
        <h2 className="mb-4 text-lg font-semibold text-slate-900">Agregar un ejercicio</h2>
        <form onSubmit={handleCreate} className="flex flex-col gap-3 sm:flex-row sm:items-end">
          <div className="flex-1">
            <label className="mb-1 block text-sm font-medium text-slate-700">Nombre</label>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
              placeholder="Sentadilla"
              className="w-full rounded-lg border border-slate-300 px-3 py-2 outline-none focus:border-slate-500"
            />
          </div>
          <div className="flex-1">
            <label className="mb-1 block text-sm font-medium text-slate-700">
              Grupo muscular (opcional)
            </label>
            <input
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              placeholder="Cuádriceps"
              className="w-full rounded-lg border border-slate-300 px-3 py-2 outline-none focus:border-slate-500"
            />
          </div>
          <div className="flex-1">
            <label className="mb-1 block text-sm font-medium text-slate-700">
              Imagen (opcional)
            </label>
            <input
              type="file"
              accept="image/*"
              onChange={(e) => setFile(e.target.files?.[0] ?? null)}
              className="w-full text-sm text-slate-600"
            />
          </div>
          <button
            type="submit"
            disabled={saving}
            className="rounded-lg bg-slate-900 px-4 py-2 font-medium text-white hover:bg-slate-800 disabled:opacity-60"
          >
            {saving ? 'Guardando…' : 'Agregar'}
          </button>
        </form>
        {error && <p className="mt-3 text-sm text-red-600">{error}</p>}
      </div>

      <div className="rounded-2xl bg-white p-6 shadow-sm">
        <h2 className="mb-4 text-lg font-semibold text-slate-900">
          Tu librería de ejercicios {exercises.length > 0 && `(${exercises.length})`}
        </h2>
        {loading ? (
          <p className="text-sm text-slate-500">Cargando…</p>
        ) : exercises.length === 0 ? (
          <p className="text-sm text-slate-500">Todavía no agregaste ejercicios.</p>
        ) : (
          <div className="space-y-6">
            {groups.map(([groupName, items]) => (
              <div key={groupName}>
                <h3 className="mb-2 text-sm font-semibold text-slate-500">{groupName}</h3>
                <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4">
                  {items.map((ex) => (
                    <div
                      key={ex.id}
                      className="rounded-xl border border-slate-100 p-3 text-center"
                    >
                      <div className="mb-2 flex h-20 items-center justify-center overflow-hidden rounded-lg bg-slate-100">
                        {ex.imageUrl ? (
                          <img
                            src={ex.imageUrl}
                            alt={ex.name}
                            className="h-full w-full object-cover"
                          />
                        ) : (
                          <span className="text-xs text-slate-400">Sin imagen</span>
                        )}
                      </div>
                      <p className="truncate text-sm font-medium text-slate-800">{ex.name}</p>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
