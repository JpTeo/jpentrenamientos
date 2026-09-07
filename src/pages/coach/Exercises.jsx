import { useEffect, useMemo, useRef, useState } from 'react'
import {
  collection,
  query,
  where,
  addDoc,
  writeBatch,
  doc,
  updateDoc,
  serverTimestamp,
  onSnapshot,
} from 'firebase/firestore'
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage'
import { db, storage } from '../../firebase/config'
import { useAuth } from '../../contexts/useAuth'
import { normalizeName } from '../../lib/normalizeName'

function withTimeout(promise, ms) {
  return Promise.race([
    promise,
    new Promise((_, reject) => setTimeout(() => reject(new Error(`timeout tras ${ms / 1000}s`)), ms)),
  ])
}

function guessNameFromFilename(filename) {
  return filename
    .replace(/\.[^.]+$/, '')
    .replace(/[-_]+/g, ' ')
    .trim()
}

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

  const [imageRows, setImageRows] = useState([])
  const [imagesUploading, setImagesUploading] = useState(false)
  const [uploadProgress, setUploadProgress] = useState(null)
  const [imagesError, setImagesError] = useState('')
  const [imagesResult, setImagesResult] = useState('')
  const imageInputRef = useRef(null)

  const [deletingAll, setDeletingAll] = useState(false)
  const [deleteAllError, setDeleteAllError] = useState('')

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

  const existingByName = useMemo(
    () => new Map(exercises.map((ex) => [normalizeName(ex.name), ex])),
    [exercises],
  )

  useEffect(() => {
    return () => {
      imageRows.forEach((row) => URL.revokeObjectURL(row.previewUrl))
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

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

  function handleImageFilesSelected(fileList) {
    imageRows.forEach((row) => URL.revokeObjectURL(row.previewUrl))
    setImagesError('')
    setImagesResult('')
    const files = Array.from(fileList || [])
    const rows = files.map((file, i) => ({
      id: `${Date.now()}-${i}`,
      file,
      previewUrl: URL.createObjectURL(file),
      name: guessNameFromFilename(file.name),
    }))
    setImageRows(rows)
  }

  function handleRowNameChange(rowId, name) {
    setImageRows((prev) => prev.map((row) => (row.id === rowId ? { ...row, name } : row)))
  }

  function handleRemoveRow(rowId) {
    setImageRows((prev) => {
      const row = prev.find((r) => r.id === rowId)
      if (row) URL.revokeObjectURL(row.previewUrl)
      return prev.filter((r) => r.id !== rowId)
    })
  }

  // Uploads each selected image and, for its (editable) name, either updates
  // the matching existing exercise's photo or creates a brand new exercise —
  // so a folder of photos with no library entries yet still loads in one go.
  async function handleUploadImages() {
    setImagesError('')
    setImagesResult('')
    const rows = imageRows.filter((row) => row.name.trim())
    if (rows.length === 0) {
      setImagesError('No hay imágenes con nombre para subir.')
      return
    }
    setImagesUploading(true)
    setUploadProgress({ done: 0, total: rows.length })
    let createdCount = 0
    let updatedCount = 0
    const failed = []
    try {
      for (const row of rows) {
        try {
          const path = `exercises/${user.uid}/${Date.now()}-${row.file.name}`
          const storageRef = ref(storage, path)
          await withTimeout(uploadBytes(storageRef, row.file), 20000)
          const imageUrl = await withTimeout(getDownloadURL(storageRef), 20000)
          const trimmedName = row.name.trim()
          const match = existingByName.get(normalizeName(trimmedName))
          if (match) {
            await withTimeout(updateDoc(doc(db, 'exercises', match.id), { imageUrl }), 20000)
            updatedCount += 1
          } else {
            await withTimeout(
              addDoc(collection(db, 'exercises'), {
                name: trimmedName,
                category: null,
                imageUrl,
                createdBy: user.uid,
                createdAt: serverTimestamp(),
              }),
              20000,
            )
            createdCount += 1
          }
        } catch (err) {
          failed.push(`${row.file.name} (${err?.code || err?.message || 'error'})`)
        }
        setUploadProgress((prev) => ({ done: (prev?.done ?? 0) + 1, total: rows.length }))
      }

      const parts = []
      if (createdCount > 0) parts.push(`${createdCount} ejercicio${createdCount === 1 ? '' : 's'} nuevo${createdCount === 1 ? '' : 's'}`)
      if (updatedCount > 0) parts.push(`${updatedCount} imagen${updatedCount === 1 ? '' : 'es'} actualizada${updatedCount === 1 ? '' : 's'}`)
      const summary = parts.length > 0 ? `Listo: ${parts.join(' · ')}.` : ''
      setImagesResult(summary)
      if (failed.length > 0) {
        setImagesError(`Fallaron ${failed.length}: ${failed.join(', ')}`)
      }

      const remaining = imageRows.filter((row) => failed.some((f) => f.startsWith(row.file.name)))
      imageRows
        .filter((row) => !remaining.includes(row))
        .forEach((row) => URL.revokeObjectURL(row.previewUrl))
      setImageRows(remaining)
      if (remaining.length === 0 && imageInputRef.current) imageInputRef.current.value = ''
    } finally {
      setImagesUploading(false)
      setUploadProgress(null)
    }
  }

  async function handleDeleteAllExercises() {
    if (exercises.length === 0) return
    const ok = confirm(
      `¿Eliminar los ${exercises.length} ejercicios de tu librería? Esta acción no se puede deshacer. Las planificaciones y plantillas ya guardadas no se ven afectadas.`,
    )
    if (!ok) return
    setDeletingAll(true)
    setDeleteAllError('')
    try {
      for (let i = 0; i < exercises.length; i += 400) {
        const group = exercises.slice(i, i + 400)
        const batch = writeBatch(db)
        group.forEach((ex) => batch.delete(doc(db, 'exercises', ex.id)))
        await batch.commit()
      }
    } catch {
      setDeleteAllError('No se pudieron eliminar todos los ejercicios. Intentá de nuevo.')
    } finally {
      setDeletingAll(false)
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
        <h2 className="mb-4 text-lg font-semibold text-slate-900">Carga masiva de imágenes</h2>
        <p className="mb-3 text-sm text-slate-500">
          Elegí varias imágenes a la vez. El nombre de cada archivo se usa como nombre del
          ejercicio (editable abajo): si ya existe uno con ese nombre en tu librería, se le
          actualiza la foto; si no existe, se crea el ejercicio nuevo con esa imagen.
        </p>
        <input
          ref={imageInputRef}
          type="file"
          accept="image/*"
          multiple
          onChange={(e) => handleImageFilesSelected(e.target.files)}
          className="text-sm text-slate-600"
        />

        {imageRows.length > 0 && (
          <div className="mt-4 space-y-2">
            <div className="max-h-[28rem] space-y-2 overflow-y-auto pr-1">
              {imageRows.map((row) => {
                const trimmed = row.name.trim()
                const willUpdate = trimmed && existingByName.has(normalizeName(trimmed))
                return (
                  <div
                    key={row.id}
                    className="flex flex-wrap items-center gap-3 rounded-lg border border-slate-100 p-2"
                  >
                    <img
                      src={row.previewUrl}
                      alt={row.name}
                      className="h-12 w-12 shrink-0 rounded-lg object-cover"
                    />
                    <div className="min-w-0 flex-1 space-y-1">
                      <input
                        value={row.name}
                        onChange={(e) => handleRowNameChange(row.id, e.target.value)}
                        className="w-full rounded-lg border border-slate-300 px-2 py-1.5 text-sm outline-none focus:border-slate-500"
                      />
                      <p className="truncate text-xs text-slate-400">
                        {row.file.name} ·{' '}
                        {trimmed ? (
                          willUpdate ? (
                            <span className="text-sky-600">actualiza ejercicio existente</span>
                          ) : (
                            <span className="text-emerald-600">crea ejercicio nuevo</span>
                          )
                        ) : (
                          <span className="text-red-500">falta nombre</span>
                        )}
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => handleRemoveRow(row.id)}
                      className="shrink-0 rounded-lg px-2 py-1 text-xs text-red-500 hover:bg-red-50"
                    >
                      Quitar
                    </button>
                  </div>
                )
              })}
            </div>
            <button
              type="button"
              onClick={handleUploadImages}
              disabled={imagesUploading}
              className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-60"
            >
              {imagesUploading
                ? `Subiendo ${uploadProgress?.done ?? 0}/${uploadProgress?.total ?? imageRows.length}…`
                : `Subir ${imageRows.length} imagen${imageRows.length === 1 ? '' : 'es'}`}
            </button>
          </div>
        )}
        {imagesError && <p className="mt-3 whitespace-pre-wrap text-sm text-red-600">{imagesError}</p>}
        {imagesResult && <p className="mt-3 text-sm text-emerald-700">{imagesResult}</p>}
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
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-slate-900">
            Tu librería de ejercicios {exercises.length > 0 && `(${exercises.length})`}
          </h2>
          {exercises.length > 0 && (
            <button
              type="button"
              onClick={handleDeleteAllExercises}
              disabled={deletingAll}
              className="rounded-lg px-3 py-1.5 text-sm font-medium text-red-500 hover:bg-red-50 disabled:opacity-60"
            >
              {deletingAll ? 'Eliminando…' : 'Eliminar todos'}
            </button>
          )}
        </div>
        {deleteAllError && <p className="mb-3 text-sm text-red-600">{deleteAllError}</p>}
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
