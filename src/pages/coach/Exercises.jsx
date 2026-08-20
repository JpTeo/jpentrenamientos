import { useEffect, useState } from 'react'
import { collection, query, where, addDoc, serverTimestamp, onSnapshot } from 'firebase/firestore'
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage'
import { db, storage } from '../../firebase/config'
import { useAuth } from '../../contexts/useAuth'

export default function Exercises() {
  const { user } = useAuth()
  const [exercises, setExercises] = useState([])
  const [loading, setLoading] = useState(true)
  const [name, setName] = useState('')
  const [file, setFile] = useState(null)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

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
        imageUrl,
        createdBy: user.uid,
        createdAt: serverTimestamp(),
      })
      setName('')
      setFile(null)
      e.target.reset()
    } catch {
      setError('No se pudo guardar el ejercicio. Intentá de nuevo.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="space-y-6">
      <div className="rounded-2xl bg-white p-6 shadow-sm">
        <h2 className="mb-4 text-lg font-semibold text-slate-900">Nuevo ejercicio</h2>
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
        <h2 className="mb-4 text-lg font-semibold text-slate-900">Tu librería de ejercicios</h2>
        {loading ? (
          <p className="text-sm text-slate-500">Cargando…</p>
        ) : exercises.length === 0 ? (
          <p className="text-sm text-slate-500">Todavía no agregaste ejercicios.</p>
        ) : (
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4">
            {exercises.map((ex) => (
              <div key={ex.id} className="rounded-xl border border-slate-100 p-3 text-center">
                <div className="mb-2 flex h-20 items-center justify-center overflow-hidden rounded-lg bg-slate-100">
                  {ex.imageUrl ? (
                    <img src={ex.imageUrl} alt={ex.name} className="h-full w-full object-cover" />
                  ) : (
                    <span className="text-xs text-slate-400">Sin imagen</span>
                  )}
                </div>
                <p className="truncate text-sm font-medium text-slate-800">{ex.name}</p>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
